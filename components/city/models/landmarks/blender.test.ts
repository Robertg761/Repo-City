/**
 * Spike: the landmarks modelled in Blender (`blender/landmarks/*.py`) are a
 * drop-in for the procedural ones. Each keeps its procedural counterpart's
 * natural size, triangle budget, slots, anchors and variants. The tests call
 * the `blender...` builders directly: `BLENDER_MODELS` is false in node.
 */
import type { BufferGeometry } from "three";
import { describe, expect, it } from "vitest";
import { NATURAL_LANDMARK_SIZE } from "@/lib/city/layout";
import { SURFACE_ATTRIBUTE } from "../../textures/surface-types";
import { extentOf, triangleCount, type Slots } from "./assembly";
import { POWER_ANCHORS, blenderPower, powerPlant, type PowerMode } from "./power";

/** Min and max corner of every slot together. */
function bounds(slots: Slots<string>): { min: number[]; max: number[] } {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const g of Object.values(slots) as (BufferGeometry | undefined)[]) {
    if (!g) continue;
    g.computeBoundingBox();
    const b = g.boundingBox!;
    [b.min.x, b.min.y, b.min.z].forEach((v, i) => (min[i] = Math.min(min[i], v)));
    [b.max.x, b.max.y, b.max.z].forEach((v, i) => (max[i] = Math.max(max[i], v)));
  }
  return { min, max };
}

/** The highest vertex within `radius` of (x, z), over the given slots. */
function topAt(slots: Slots<string>, x: number, z: number, radius: number, only?: string[]): number {
  let top = -Infinity;
  for (const [slot, g] of Object.entries(slots) as [string, BufferGeometry | undefined][]) {
    if (!g || (only && !only.includes(slot))) continue;
    const p = g.getAttribute("position");
    for (let i = 0; i < p.count; i++) {
      if (Math.hypot(p.getX(i) - x, p.getZ(i) - z) <= radius) top = Math.max(top, p.getY(i));
    }
  }
  return top;
}

/** Every vertex, over every slot, within `radius` of a point. */
function near(slots: Slots<string>, at: readonly number[], radius: number): number {
  let count = 0;
  for (const g of Object.values(slots) as (BufferGeometry | undefined)[]) {
    if (!g) continue;
    const p = g.getAttribute("position");
    for (let i = 0; i < p.count; i++) {
      if (Math.hypot(p.getX(i) - at[0], p.getY(i) - at[1], p.getZ(i) - at[2]) <= radius) count++;
    }
  }
  return count;
}

/** Same footprint as the procedural model, and inside the natural size. */
function matchesFootprint(blender: Slots<string>, procedural: Slots<string>, natural: readonly number[]) {
  const [w, h, d] = extentOf(blender);
  const [pw, , pd] = extentOf(procedural);
  expect(Math.abs(w - pw)).toBeLessThan(0.5);
  expect(Math.abs(d - pd)).toBeLessThan(0.5);
  expect(w).toBeLessThanOrEqual(natural[0] + 1e-6);
  expect(d).toBeLessThanOrEqual(natural[2] + 1e-6);
  expect(h).toBeLessThanOrEqual(natural[1] + 1e-6);
  // Centred where the procedural model is, standing on the ground.
  const a = bounds(blender);
  const b = bounds(procedural);
  for (const i of [0, 2]) expect(Math.abs((a.min[i] + a.max[i]) / 2 - (b.min[i] + b.max[i]) / 2)).toBeLessThan(0.3);
  // (A ramp tipped into the ground goes as deep as the procedural one's.)
  expect(a.min[1]).toBeLessThan(0.02);
  expect(a.min[1]).toBeGreaterThan(Math.min(b.min[1], 0) - 0.02);
}

function paintsThroughVertexColours(slots: Slots<string>) {
  for (const geometry of Object.values(slots) as (BufferGeometry | undefined)[]) {
    if (!geometry) continue;
    expect(geometry.hasAttribute("color")).toBe(true);
    expect(geometry.hasAttribute(SURFACE_ATTRIBUTE)).toBe(true);
  }
}

/** Only slots the procedural model's renderer component already draws. */
function onlySlots(slots: Slots<string>, allowed: readonly string[]) {
  for (const slot of Object.keys(slots)) expect(allowed).toContain(slot);
}

const POWER_STATES = ["healthy", "recent-failure", "failing", "unknown", "none"] as const;
const modeOf = (state: string): PowerMode => (state === "none" ? "bare" : state === "failing" ? "failing" : "full");

describe("the Blender power station (spike)", () => {
  it("stands in the procedural plant's footprint in every CI state", () => {
    for (const state of POWER_STATES) {
      matchesFootprint(blenderPower(modeOf(state)), powerPlant(state), NATURAL_LANDMARK_SIZE.power);
    }
  });

  it("stays inside the procedural budget in every CI state", () => {
    for (const state of POWER_STATES) expect(triangleCount(blenderPower(modeOf(state)))).toBeLessThan(9000);
  });

  it("keeps the procedural slots and the state contract", () => {
    for (const mode of ["full", "failing", "bare"] as const) {
      onlySlots(blenderPower(mode), ["deck", "hull", "steel", "hazard", "glass", "cold"]);
    }
    expect(blenderPower("failing").cold).toBeDefined();
    expect(blenderPower("full").cold).toBeUndefined();
    // No CI: the substation alone, no plant.
    expect(blenderPower("bare").hull).toBeUndefined();
    expect(blenderPower("bare").glass).toBeUndefined();
    expect(blenderPower("bare").steel).toBeDefined();
    // The failing plant differs from the running one in its chimney only.
    expect(triangleCount(blenderPower("failing"))).toBe(triangleCount(blenderPower("full")));
  });

  it("tops the chimney and the towers where the smoke comes from", () => {
    const slots = blenderPower("full");
    const [cx, cy, cz] = POWER_ANCHORS.chimney;
    expect(Math.abs(topAt(slots, cx, cz, 0.9) - cy)).toBeLessThan(0.1);
    const cold = blenderPower("failing");
    expect(Math.abs(topAt(cold, cx, cz, 0.9, ["cold", "steel"]) - cy)).toBeLessThan(0.1);
    for (const [tx, ty, tz] of [POWER_ANCHORS.towerA, POWER_ANCHORS.towerB]) {
      // The lip stands a little over the smoke's origin, which is inside the tower.
      const lip = topAt(slots, tx, tz, 1.6);
      expect(lip).toBeGreaterThan(ty);
      expect(lip - ty).toBeLessThan(0.6);
      // Open: nothing over the smoke's origin in the throat.
      expect(near(slots, [tx, ty + 0.3, tz], 0.9)).toBe(0);
    }
  });

  it("puts the beacon's mast on the hall roof and leaves the board lamp in the clear", () => {
    const slots = blenderPower("full");
    const [bx, by, bz] = POWER_ANCHORS.beacon;
    expect(Math.abs(topAt(slots, bx, bz, 0.3) - by)).toBeLessThan(0.06);
    for (const mode of ["full", "failing", "bare"] as const) {
      const lamp = POWER_ANCHORS.board;
      // The lamp is a 0.24 sphere drawn by React: in front of the board, not in it.
      expect(near(blenderPower(mode), lamp, 0.12)).toBe(0);
      // And the board is right behind it.
      expect(near(blenderPower(mode), [lamp[0], lamp[1], lamp[2] - 0.2], 0.6)).toBeGreaterThan(0);
    }
    // The switchyard the sparks play over is there in every state.
    for (const mode of ["full", "failing", "bare"] as const) {
      expect(near(blenderPower(mode), POWER_ANCHORS.switchyard, 2.5)).toBeGreaterThan(0);
    }
  });

  it("paints every slot through vertex colours and surface ids", () => {
    for (const mode of ["full", "failing", "bare"] as const) paintsThroughVertexColours(blenderPower(mode));
  });
});

describe("the Blender information centre (spike)", async () => {
  const { blenderInfo, infoCentre } = await import("./info");

  it("stands in the procedural centre's footprint at every level, inside its budget", () => {
    for (const level of [1, 2, 3]) {
      matchesFootprint(blenderInfo(level).slots, infoCentre(level).slots, NATURAL_LANDMARK_SIZE.info);
      expect(triangleCount(blenderInfo(level).slots)).toBeLessThan(9000);
      onlySlots(blenderInfo(level).slots, ["deck", "wall", "roof", "glass", "sign", "green"]);
    }
  });

  it("lights the reading garden's four lamps where the procedural ones stand", () => {
    expect(blenderInfo(1).lamps).toHaveLength(0);
    expect(blenderInfo(2).lamps).toHaveLength(0);
    const lamps = blenderInfo(3).lamps;
    expect(lamps).toHaveLength(4);
    const procedural = infoCentre(3).lamps;
    for (const lamp of procedural) {
      expect(lamps.some((l) => Math.hypot(l[0] - lamp[0], l[1] - lamp[1], l[2] - lamp[2]) < 0.05)).toBe(true);
      // A lamp head is modelled there for the glow to sit in.
      expect(near(blenderInfo(3).slots, lamp, 0.3)).toBeGreaterThan(0);
    }
  });

  it("plants the garden and the planters, never the kiosk, and signs every level", () => {
    expect(blenderInfo(1).slots.green).toBeUndefined();
    expect(blenderInfo(2).slots.green).toBeDefined();
    expect(blenderInfo(3).slots.green).toBeDefined();
    for (const level of [1, 2, 3]) expect(blenderInfo(level).slots.sign).toBeDefined();
  });

  it("grows with the level", () => {
    const heights = [1, 2, 3].map((level) => extentOf(blenderInfo(level).slots)[1]);
    expect(heights[0]).toBeLessThan(heights[1]);
    expect(heights[1]).toBeLessThan(heights[2]);
  });

  it("paints every slot through vertex colours and surface ids", () => {
    for (const level of [1, 2, 3]) paintsThroughVertexColours(blenderInfo(level).slots);
  });
});

describe("the Blender town hall (spike)", async () => {
  const { blenderTownHall, townHall } = await import("./townhall");

  it("stands in the procedural hall's footprint, inside its budget and slots", () => {
    matchesFootprint(blenderTownHall().slots, townHall().slots, NATURAL_LANDMARK_SIZE.civic);
    expect(triangleCount(blenderTownHall().slots)).toBeLessThan(9000);
    onlySlots(blenderTownHall().slots, ["stone", "wall", "accent", "metal", "glass"]);
  });

  it("hangs the lantern where the procedural one is, open for its light", () => {
    const lantern = blenderTownHall().lantern;
    townHall().lantern.forEach((v, i) => expect(lantern[i]).toBeCloseTo(v, 3));
    // The light is a 0.42 sphere: nothing modelled inside it.
    expect(near(blenderTownHall().slots, lantern, 0.42)).toBe(0);
    // But the lantern's posts stand round it, and the spire rises over it.
    expect(near(blenderTownHall().slots, lantern, 1.0)).toBeGreaterThan(0);
    expect(topAt(blenderTownHall().slots, lantern[0], lantern[2], 0.2)).toBeGreaterThan(lantern[1] + 2);
  });

  it("puts the portico and the clock on +z", () => {
    const { min, max } = bounds(blenderTownHall().slots);
    expect(max[2]).toBeGreaterThan(-min[2] + 0.2);
    expect(blenderTownHall().slots.glass).toBeDefined();
    paintsThroughVertexColours(blenderTownHall().slots);
  });
});

describe("the Blender transit station (spike)", async () => {
  const { PORTAL_X, TRACK_A, TRACK_B, blenderStation, transitStation } = await import("./station");

  it("stands in the procedural station's footprint at every level, inside its budget", () => {
    for (const level of [1, 2, 3]) {
      matchesFootprint(blenderStation(level).slots, transitStation(level).slots, NATURAL_LANDMARK_SIZE.station);
      expect(triangleCount(blenderStation(level).slots)).toBeLessThan(12000);
      onlySlots(blenderStation(level).slots, ["deck", "wall", "roof", "steel", "glass", "accent", "dark"]);
    }
  });

  it("keeps the lamps and the second line where the procedural station has them", () => {
    for (const level of [1, 2, 3]) {
      const { lamps, tracks } = blenderStation(level);
      expect(tracks).toBe(transitStation(level).tracks);
      expect(lamps).toHaveLength(transitStation(level).lamps.length);
      transitStation(level).lamps.forEach((lamp, i) => lamp.forEach((v, k) => expect(lamps[i][k]).toBeCloseTo(v, 3)));
    }
  });

  it("lays rails the trains run on: tops at 0.5 on the train's gauge", () => {
    for (const level of [1, 2, 3]) {
      const slots = blenderStation(level).slots;
      const lines = level >= 3 ? [TRACK_A, TRACK_B] : [TRACK_A];
      // The highest steel along a line at height z, the length of the platform.
      const railTop = (z: number) => {
        const p = slots.steel!.getAttribute("position");
        let top = -Infinity;
        for (let i = 0; i < p.count; i++) {
          if (Math.abs(p.getZ(i) - z) < 0.06 && p.getY(i) < 0.9) top = Math.max(top, p.getY(i));
        }
        return top;
      };
      for (const cz of lines) {
        for (const s of [-1, 1]) expect(railTop(cz + s * 0.72)).toBeCloseTo(0.5, 2);
      }
      if (level < 3) expect(railTop(TRACK_B + 0.72)).toBe(-Infinity);
    }
  });

  it("keeps the running line clear from the platform to the portal face", () => {
    const slots = blenderStation(3).slots;
    // The train's envelope on track A: 1.9 wide, from the rail tops to 3 m.
    for (const g of Object.values(slots)) {
      const p = g!.getAttribute("position");
      for (let i = 0; i < p.count; i++) {
        const [x, y, z] = [p.getX(i), p.getY(i), p.getZ(i)];
        const inside = Math.abs(z - TRACK_A) < 0.95 && y > 0.56 && y < 2.9 && x > -5.9 && x < PORTAL_X - 0.05;
        expect(inside).toBe(false);
      }
    }
    // And the portal's dark mouth stands at the clip plane.
    expect(near(slots, [PORTAL_X + 0.03, 1.6, TRACK_A], 1.8)).toBeGreaterThan(0);
  });

  it("paints every slot through vertex colours and surface ids", () => {
    for (const level of [1, 2, 3]) paintsThroughVertexColours(blenderStation(level).slots);
  });
});

describe("the Blender village landmarks (spike)", async () => {
  const village = await import("./village");
  const { VILLAGE_NATURAL_SIZE } = village;
  const close = (a: readonly number[], b: readonly number[], eps = 0.05) =>
    a.every((v, i) => Math.abs(v - b[i]) < eps);

  it("stands each in its procedural footprint, inside the village budget and slots", () => {
    const pairs: [Slots<string>, Slots<string>, readonly number[], string[]][] = [
      [village.blenderChapel().slots, village.chapel().slots, VILLAGE_NATURAL_SIZE.civic, ["stone", "roof", "trim", "wood", "glass", "green", "metal"]],
      [village.blenderSubstation().slots, village.substation().slots, VILLAGE_NATURAL_SIZE.power, ["deck", "hull", "steel", "hazard", "glass", "wood", "dark"]],
    ];
    for (const level of [1, 2]) {
      pairs.push([village.blenderVillageFire(level).slots, village.villageFireStation(level).slots, VILLAGE_NATURAL_SIZE.fire, ["deck", "wall", "red", "trim", "roof", "steel", "glass"]]);
      pairs.push([village.blenderHalt(level).slots, village.halt(level).slots, VILLAGE_NATURAL_SIZE.station, ["deck", "wall", "roof", "steel", "accent", "dark", "glass", "wood"]]);
    }
    for (const [blender, procedural, natural, allowed] of pairs) {
      matchesFootprint(blender, procedural, natural);
      expect(triangleCount(blender)).toBeLessThan(6000);
      onlySlots(blender, allowed);
      paintsThroughVertexColours(blender);
    }
  });

  it("hangs the chapel's lamp over the door, where the procedural one is", () => {
    const { lamp } = village.blenderChapel();
    expect(close(lamp, village.chapel().lamp)).toBe(true);
    expect(lamp[2]).toBeGreaterThan(0);
    expect(near(village.blenderChapel().slots, lamp, 0.3)).toBeGreaterThan(0);
  });

  it("parks the appliance, and its roof light, at level 2 only", () => {
    for (const level of [1, 2]) {
      const beacons = village.blenderVillageFire(level).beacons;
      const procedural = village.villageFireStation(level).beacons;
      expect(beacons).toHaveLength(procedural.length);
      beacons.forEach((b, i) => expect(close(b, procedural[i])).toBe(true));
    }
    // The roof light sits on the appliance's cab.
    const light = village.blenderVillageFire(2).beacons[1];
    expect(Math.abs(topAt(village.blenderVillageFire(2).slots, light[0], light[2], 0.4) - light[1])).toBeLessThan(0.3);
    expect(triangleCount(village.blenderVillageFire(2).slots)).toBeGreaterThan(triangleCount(village.blenderVillageFire(1).slots));
  });

  it("lights the halt's lamps where the procedural ones are, and waits a railcar at level 2", () => {
    for (const level of [1, 2]) {
      const { lamps } = village.blenderHalt(level);
      const procedural = village.halt(level).lamps;
      expect(lamps).toHaveLength(procedural.length);
      lamps.forEach((l, i) => expect(close(l, procedural[i])).toBe(true));
      for (const lamp of lamps) expect(near(village.blenderHalt(level).slots, lamp, 0.3)).toBeGreaterThan(0);
    }
    expect(triangleCount(village.blenderHalt(2).slots)).toBeGreaterThan(triangleCount(village.blenderHalt(1).slots));
  });

  it("keeps the substation's lamp and sparks anchors, the lamp in the clear", () => {
    const { anchors, slots } = village.blenderSubstation();
    const procedural = village.substation().anchors;
    expect(close(anchors.lamp, procedural.lamp)).toBe(true);
    expect(close(anchors.yard, procedural.yard)).toBe(true);
    // The lamp is a 0.16 sphere drawn by React, on a bracket.
    expect(near(slots, anchors.lamp, 0.15)).toBe(0);
    expect(near(slots, [anchors.lamp[0], anchors.lamp[1] - 0.3, anchors.lamp[2]], 0.25)).toBeGreaterThan(0);
    // The sparks play over the transformer.
    expect(near(slots, anchors.yard, 0.8)).toBeGreaterThan(0);
  });
});

describe("the Blender train (spike)", async () => {
  const { CONTACT_WIRE_Y, blenderTrain, trainCars } = await import("./station");
  /** `TRAIN_HALF` in station.ts: how far past the portal the set hides. */
  const OFFSTAGE_CLEAR = 6.3;

  it("is the procedural set's size, in its three slots, within 3x its triangles", () => {
    // Parked, with the pantograph folded: raised, it reaches the wire (below).
    const blender = blenderTrain("lowered");
    const procedural = trainCars();
    expect(Object.keys(blender).sort()).toEqual(["body", "gear", "glass"]);
    const [length, height, width] = extentOf(blender);
    const [pl, , pw] = extentOf(procedural);
    expect(length).toBeLessThan(12.6);
    expect(Math.abs(length - pl)).toBeLessThan(0.3);
    expect(height).toBeLessThan(3);
    // As wide as the procedural set: the running line's envelope holds.
    expect(width).toBeLessThanOrEqual(Math.max(pw, 1.9) + 0.05);
    expect(triangleCount(blender)).toBeLessThan(triangleCount(procedural) * 3);
    paintsThroughVertexColours(blender);
  });

  it("raises its pantograph to the contact wire on the running line, and folds it when parked", () => {
    // The wire is a rod of radius 0.035 round CONTACT_WIRE_Y: the carbon strips
    // stop just under it, touching to the eye and never through it.
    const wireUnderside = CONTACT_WIRE_Y - 0.035;
    const raised = bounds(blenderTrain("raised")).max[1];
    expect(raised).toBeLessThan(wireUnderside);
    expect(wireUnderside - raised).toBeLessThan(0.03);
    // Folded flat on the roof (whose top is about 2.9), far below the wire.
    const lowered = bounds(blenderTrain("lowered")).max[1];
    expect(lowered).toBeLessThan(3.3);
    // The same train either way: only the arms differ.
    expect(triangleCount(blenderTrain("raised"))).toBe(triangleCount(blenderTrain("lowered")));
  });

  it("stands on the rails: wheels down to y 0.5, centred on the origin, nose to +x", () => {
    const { min, max } = bounds(blenderTrain());
    expect(min[1]).toBeCloseTo(0.5, 2);
    // Half the set either side of the origin, within the offstage margin
    // the timetable hides it behind (TRAIN_HALF in station.ts).
    expect(max[0]).toBeLessThan(OFFSTAGE_CLEAR);
    expect(-min[0]).toBeLessThan(OFFSTAGE_CLEAR);
    expect(Math.abs(max[0] + min[0])).toBeLessThan(0.3);
    expect(Math.abs(max[2] + min[2])).toBeLessThan(0.02);
  });

  it("puts its axles where the procedural set has its wheels, on the gauge", () => {
    const gear = blenderTrain().gear!;
    const p = gear.getAttribute("position");
    // Every vertex at the wheel bottoms sits on a rail's line, outside it.
    const onRail: number[] = [];
    for (let i = 0; i < p.count; i++) if (p.getY(i) < 0.52) onRail.push(Math.abs(p.getZ(i)));
    expect(onRail.length).toBeGreaterThan(0);
    for (const z of onRail) expect(z).toBeGreaterThan(0.6);
    // The procedural set's wheel centres, each under a Blender bogie.
    for (const x of [3.7 - 1.2, 3.7 + 1.2, -0.05 - 1.15, -0.05 + 1.15, -3.7 - 1.15, -3.7 + 1.15]) {
      expect(near({ gear }, [x, 0.84, 0.8], 0.8)).toBeGreaterThan(0);
    }
  });
});
