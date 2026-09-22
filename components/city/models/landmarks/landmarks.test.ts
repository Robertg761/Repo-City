import { describe, expect, it } from "vitest";
import { NATURAL_LANDMARK_SIZE } from "@/lib/city/layout";
import { Assembly, extentOf, triangleCount, type Slots } from "./assembly";
import { townHall } from "./civic";
import { INSPECTION_AZIMUTH, facingTurn } from "./facing";
import { fireStation } from "./fire";
import { infoCentre } from "./info";
import { powerPlant, powerMode } from "./power";
import { trainCars, transitStation } from "./station";

/**
 * The contract every landmark model has to keep (PLAN.md sections 36 and 37):
 *
 *   - it fits the natural plot, because the renderer scales by footprint and
 *     the layout reserves exactly that much ground;
 *   - it draws in a handful of calls, because a landmark is one object in a
 *     three-hundred-building city;
 *   - it is built once per variant and then reused.
 */

const fits = (slots: Slots<string>, type: keyof typeof NATURAL_LANDMARK_SIZE) => {
  const [w, h, d] = extentOf(slots);
  const natural = NATURAL_LANDMARK_SIZE[type];
  expect(w).toBeLessThanOrEqual(natural[0] + 1e-6);
  expect(d).toBeLessThanOrEqual(natural[2] + 1e-6);
  // Height is not what the plot is scaled by, but a landmark that overshoots
  // it would be framed wrongly by the inspection camera.
  expect(h).toBeLessThanOrEqual(natural[1] + 1e-6);
};

const slotCount = (slots: Slots<string>) => Object.values(slots).filter(Boolean).length;

describe("assembly", () => {
  it("merges every part of a slot into one geometry", () => {
    const built = new Assembly<"a" | "b">()
      .box("a", [1, 1, 1])
      .box("a", [1, 1, 1], { at: [4, 0, 0] })
      .box("b", [1, 1, 1], { at: [0, 2, 0] })
      .build();

    expect(slotCount(built)).toBe(2);
    expect(triangleCount(built)).toBe(36);
    expect(extentOf(built)).toEqual([5, 3, 1]);
  });

  it("places a part with rotation and scale", () => {
    const built = new Assembly<"a">().box("a", [2, 1, 1], { rot: [0, Math.PI / 2, 0] }).build();
    const [w, , d] = extentOf(built);
    expect(w).toBeCloseTo(1);
    expect(d).toBeCloseTo(2);
  });

  it("shades a gable flat, with no slope facing the ground", () => {
    const built = new Assembly<"a">().gable("a", 3.5, 1.5, 1.5).build();
    const geometry = built.a!;
    const normal = geometry.getAttribute("normal");
    const position = geometry.getAttribute("position");
    const floor = geometry.boundingBox!.min.y;
    for (let i = 0; i < normal.count; i++) {
      // Only the underside, which sits on the cornice, may point down.
      if (normal.getY(i) < -1e-6) expect(position.getY(i)).toBeCloseTo(floor);
    }
    expect(extentOf(built)).toEqual([7, expect.closeTo(1.5), 1.5]);
    // It must merge with the boxes and cylinders sharing its slot.
    const mixed = new Assembly<"a">().gable("a", 1, 1, 1).box("a", [1, 1, 1]).build();
    expect(triangleCount(mixed)).toBe(8 + 12);
  });

  it("sags a wire between its endpoints", () => {
    const built = new Assembly<"a">().wire("a", [-2, 4, 0], [2, 4, 0], 0.05, 0.8).build();
    const box = built.a?.boundingBox;
    expect(box?.max.y).toBeCloseTo(4.05, 1);
    expect(box?.min.y).toBeLessThan(3.5);
  });
});

describe("facing", () => {
  it("turns the two plots whose front would face away from the camera", () => {
    // The four compass plots `planLandmarkPlots` produces.
    expect(facingTurn(0)).toBe(0); // power, north
    expect(facingTurn(Math.PI / 2)).toBe(0); // info, west
    expect(facingTurn(-Math.PI / 2)).toBe(Math.PI); // fire, east
    expect(facingTurn(Math.PI)).toBe(Math.PI); // station, south
  });

  it("leaves a front that already looks straight at the camera alone", () => {
    expect(facingTurn(INSPECTION_AZIMUTH)).toBe(0);
    expect(facingTurn(INSPECTION_AZIMUTH + Math.PI)).toBe(Math.PI);
  });
});

describe("power station", () => {
  it("reads CI state into a build mode", () => {
    expect(powerMode("healthy")).toBe("full");
    expect(powerMode("recent-failure")).toBe("full");
    expect(powerMode("unknown")).toBe("full");
    expect(powerMode("failing")).toBe("failing");
    expect(powerMode("none")).toBe("bare");
  });

  it("fits its plot and stays cheap in every state", () => {
    for (const state of ["healthy", "recent-failure", "failing", "unknown", "none"]) {
      const slots = powerPlant(state);
      fits(slots, "power");
      expect(slotCount(slots)).toBeLessThanOrEqual(6);
      expect(triangleCount(slots)).toBeLessThan(9000);
    }
  });

  it("keeps a cold stack for a failing plant and none for a healthy one", () => {
    expect(powerPlant("failing").cold).toBeDefined();
    expect(powerPlant("healthy").cold).toBeUndefined();
    // Section 14: no CI is not a failure, so the plant simply is not there.
    expect(powerPlant("none").hull).toBeUndefined();
    expect(powerPlant("none").steel).toBeDefined();
  });

  it("builds each variant once", () => {
    expect(powerPlant("healthy")).toBe(powerPlant("unknown"));
    expect(powerPlant("failing")).not.toBe(powerPlant("healthy"));
  });
});

describe("fire station", () => {
  it("fits its plot and stays cheap at every level", () => {
    for (const level of [1, 2, 3]) {
      const { slots } = fireStation(level);
      fits(slots, "fire");
      expect(slotCount(slots)).toBeLessThanOrEqual(6);
      expect(triangleCount(slots)).toBeLessThan(9000);
    }
  });

  it("parks an engine per level above the first", () => {
    expect(fireStation(1).beacons).toHaveLength(0);
    expect(fireStation(2).beacons).toHaveLength(1);
    expect(fireStation(3).beacons).toHaveLength(2);
  });

  it("grows with the level it was given", () => {
    const small = extentOf(fireStation(1).slots);
    const large = extentOf(fireStation(3).slots);
    expect(triangleCount(fireStation(3).slots)).toBeGreaterThan(
      triangleCount(fireStation(1).slots),
    );
    // Both fill the apron, so growth shows in the built volume, not the plot.
    expect(small[1]).toBeLessThan(large[1]);
  });

  it("clamps a level the analysis should never produce", () => {
    expect(fireStation(0)).toBe(fireStation(1));
    expect(fireStation(9)).toBe(fireStation(3));
  });
});

describe("information centre", () => {
  it("fits its plot and stays cheap at every level", () => {
    for (const level of [1, 2, 3]) {
      const { slots } = infoCentre(level);
      fits(slots, "info");
      expect(slotCount(slots)).toBeLessThanOrEqual(6);
      expect(triangleCount(slots)).toBeLessThan(9000);
    }
  });

  it("adds the reading garden and its lamps at the top level only", () => {
    expect(infoCentre(1).lamps).toHaveLength(0);
    expect(infoCentre(2).lamps).toHaveLength(0);
    expect(infoCentre(3).lamps).toHaveLength(4);
    expect(infoCentre(3).slots.green).toBeDefined();
    // The visitor centre has planters by its door; the kiosk has nothing green.
    expect(infoCentre(1).slots.green).toBeUndefined();
  });

  it("signs the plot edge at every level", () => {
    for (const level of [1, 2, 3]) {
      expect(infoCentre(level).slots.sign).toBeDefined();
    }
  });
});

describe("transit station", () => {
  it("fits its plot and stays cheap at every level", () => {
    for (const level of [1, 2, 3]) {
      const { slots } = transitStation(level);
      fits(slots, "station");
      expect(slotCount(slots)).toBeLessThanOrEqual(6);
      expect(triangleCount(slots)).toBeLessThan(12000);
    }
  });

  it("lays a second track only for an active release cadence", () => {
    expect(transitStation(1).tracks).toBe(1);
    expect(transitStation(2).tracks).toBe(1);
    expect(transitStation(3).tracks).toBe(2);
  });

  it("builds one train, shared by every station", () => {
    const train = trainCars();
    expect(train).toBe(trainCars());
    expect(slotCount(train)).toBe(3);
    const [length, height] = extentOf(train);
    expect(length).toBeLessThan(12);
    expect(height).toBeLessThan(3);
  });
});

describe("town hall", () => {
  it("fits its plot and stays cheap", () => {
    const { slots } = townHall();
    fits(slots, "civic");
    expect(slotCount(slots)).toBeLessThanOrEqual(5);
    expect(triangleCount(slots)).toBeLessThan(9000);
  });

  it("is the same hall every time", () => {
    expect(townHall()).toBe(townHall());
    expect(townHall().lantern[1]).toBeGreaterThan(10);
  });
});
