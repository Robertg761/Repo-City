import { describe, expect, it } from "vitest";
import { NATURAL_LANDMARK_SIZE } from "@/lib/city/layout";
import { extentOf, triangleCount, type Slots } from "./assembly";
import { VILLAGE_NATURAL_SIZE, chapel, halt, substation, villageFireStation } from "./village";

/**
 * The village landmarks keep the same contract as the city's (PLAN.md
 * sections 36 and 37, 76.5 village step 6): they fit the natural size the
 * renderer scales by, draw in a handful of calls, and are built once.
 */
const fits = (slots: Slots<string>, natural: readonly number[]) => {
  const [w, h, d] = extentOf(slots);
  expect(w).toBeLessThanOrEqual(natural[0] + 1e-6);
  expect(h).toBeLessThanOrEqual(natural[1] + 1e-6);
  expect(d).toBeLessThanOrEqual(natural[2] + 1e-6);
};

const slotCount = (slots: Slots<string>) => Object.values(slots).filter(Boolean).length;

describe("village landmarks (PLAN.md 76.1 decision 7)", () => {
  it("fits the chapel, fire station, halt and substation into their natural plots", () => {
    fits(chapel().slots, VILLAGE_NATURAL_SIZE.civic);
    for (const level of [1, 2, 3]) {
      fits(villageFireStation(level).slots, VILLAGE_NATURAL_SIZE.fire);
      fits(halt(level).slots, VILLAGE_NATURAL_SIZE.station);
    }
    fits(substation().slots, VILLAGE_NATURAL_SIZE.power);
  });

  it("is smaller than the city building it stands in for", () => {
    for (const type of ["civic", "fire", "station", "power"] as const) {
      const village = VILLAGE_NATURAL_SIZE[type];
      const city = NATURAL_LANDMARK_SIZE[type];
      expect(village[0] * village[2]).toBeLessThan(city[0] * city[2]);
    }
  });

  it("draws in at most eight calls and a few thousand triangles each", () => {
    const all = [
      chapel().slots,
      villageFireStation(1).slots,
      villageFireStation(2).slots,
      halt(1).slots,
      halt(2).slots,
      substation().slots,
    ];
    for (const slots of all) {
      expect(slotCount(slots)).toBeLessThanOrEqual(8);
      expect(triangleCount(slots)).toBeLessThan(6000);
    }
  });

  it("builds each variant once", () => {
    expect(chapel()).toBe(chapel());
    expect(halt(3)).toBe(halt(2));
    expect(villageFireStation(1)).not.toBe(villageFireStation(2));
    expect(substation()).toBe(substation());
  });

  it("parks an appliance and a railcar only when the repository earns them", () => {
    expect(villageFireStation(1).beacons).toHaveLength(1);
    expect(villageFireStation(2).beacons).toHaveLength(2);
    expect(triangleCount(halt(2).slots)).toBeGreaterThan(triangleCount(halt(1).slots));
  });

  it("puts the chapel door and the lamps on the front", () => {
    expect(chapel().lamp[2]).toBeGreaterThan(0);
    for (const lamp of halt(1).lamps) expect(lamp[2]).toBeGreaterThan(0);
    const { lamp } = substation().anchors;
    const [w, , d] = VILLAGE_NATURAL_SIZE.power;
    expect(Math.abs(lamp[0])).toBeLessThan(w / 2);
    expect(Math.abs(lamp[2])).toBeLessThan(d / 2);
  });
});
