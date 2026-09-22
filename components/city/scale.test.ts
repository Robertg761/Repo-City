import { describe, expect, it } from "vitest";
import { SETTLEMENT_PARAMS } from "@/lib/city/settlement";
import { maxCameraDistance } from "./entities";
import { treeCapFor } from "./models/props/trees";
import {
  cameraFar,
  crowdScale,
  lampCap,
  pixelFootprint,
  shadowReach,
  shadowTexel,
  skyRadius,
  thinEvenly,
  tierOf,
} from "./scale";

/** The same rule `Environment` used before settlements. */
const todaysDome = (size: number) => Math.min(Math.max(size * 4, 700), 1400);

const PHONE = 390 / 844;

describe("tierOf", () => {
  it("reads the settlement and falls back to today's city", () => {
    expect(tierOf({ settlement: { tier: "village", name: "", reason: "" } })).toBe("village");
    expect(tierOf({})).toBe("city");
    expect(tierOf(null)).toBe("city");
  });
});

describe("the sky dome (PLAN.md 76.5)", () => {
  it.each([108, 163, 174, 226, 230])("keeps today's dome for a %i unit city on a desktop", (size) => {
    expect(skyRadius(size, maxCameraDistance(size))).toBe(todaysDome(size));
  });

  it.each([285, 320])("keeps a %i unit metropolis's desktop camera well inside the dome", (size) => {
    const reach = maxCameraDistance(size);
    expect(skyRadius(size, reach)).toBeGreaterThanOrEqual(1.3 * reach);
  });

  it("grows the dome round a phone framing a metropolis from 1,277 units", () => {
    const reach = maxCameraDistance(320, PHONE);
    expect(reach).toBeGreaterThan(1250);
    expect(skyRadius(320, reach)).toBeCloseTo(1.3 * reach, 9);
    expect(skyRadius(320, reach)).toBeGreaterThan(1400);
  });
});

describe("the camera's far plane (PLAN.md 76.5)", () => {
  it.each([108, 163, 226, 230])("stays at today's 2,000 for a %i unit city on a desktop", (size) => {
    expect(cameraFar(size, maxCameraDistance(size))).toBe(2000);
  });

  it("reaches at least seven sizes for a metropolis", () => {
    expect(cameraFar(320, maxCameraDistance(320))).toBeGreaterThanOrEqual(7 * 320);
  });

  it.each([
    [320, 1.6],
    [320, PHONE],
    [226, PHONE],
    [90, PHONE],
  ])("never clips the far side of the dome: %i units at aspect %f", (size, aspect) => {
    const reach = maxCameraDistance(size, aspect);
    // The furthest point of the dome from a camera at its furthest.
    expect(cameraFar(size, reach)).toBeGreaterThanOrEqual(skyRadius(size, reach) + reach);
  });
});

describe("street life per tier", () => {
  it("keeps the city's lamps and crowd exactly", () => {
    expect(lampCap("city")).toBe(120);
    expect(crowdScale("city")).toBe(1);
  });

  it("lights a village sparsely and plants it thickly", () => {
    expect(lampCap("village")).toBeLessThan(lampCap("city") / 3);
    expect(treeCapFor("village")).toBeGreaterThan(treeCapFor("city"));
  });

  it("puts more people on a metropolis's streets and fewer on a village's", () => {
    expect(crowdScale("metropolis")).toBeGreaterThan(1);
    expect(crowdScale("village")).toBeLessThan(0.5);
    expect(crowdScale("town")).toBeGreaterThan(crowdScale("village"));
    expect(crowdScale("town")).toBeLessThan(1);
  });

  it("reads its numbers from the settlement table", () => {
    for (const tier of ["village", "town", "city", "metropolis"] as const) {
      expect(lampCap(tier)).toBe(SETTLEMENT_PARAMS[tier].lamps);
    }
  });
});

describe("thinEvenly", () => {
  it("returns a list at or under the cap unchanged", () => {
    const list = [1, 2, 3];
    expect(thinEvenly(list, 3)).toEqual(list);
    expect(thinEvenly(list, 10)).toEqual(list);
    expect(thinEvenly(list, 3)).not.toBe(list);
  });

  it("spreads the survivors along the whole list", () => {
    const list = Array.from({ length: 120 }, (_, i) => i);
    const kept = thinEvenly(list, 30);
    expect(kept).toHaveLength(30);
    expect(kept[0]).toBe(0);
    expect(kept[kept.length - 1]).toBeGreaterThan(110);
    const gaps = kept.slice(1).map((v, i) => v - kept[i]);
    for (const gap of gaps) expect(gap).toBe(4);
  });

  it("keeps nothing under a cap of zero", () => {
    expect(thinEvenly([1, 2], 0)).toEqual([]);
  });
});

describe("shadow texels (the 76.5 shadow check)", () => {
  it("matches today's fit", () => {
    expect(shadowReach(226, 0)).toBeCloseTo(226 * 0.62, 9);
    expect(shadowTexel(226, 0, 2048)).toBeCloseTo((226 * 0.62 * 2) / 2048, 9);
  });

  it("covers the same share of a screen pixel at every settlement's overview", () => {
    // The shadow camera and the overview both scale with the city, so a
    // texel is the same size on screen in a city and in a metropolis.
    const ratio = (size: number) =>
      shadowTexel(size, 0.5, 2048) / pixelFootprint(size * 1.45, 1080);
    expect(ratio(320)).toBeCloseTo(ratio(226), 9);
    expect(ratio(90)).toBeCloseTo(ratio(226), 9);
    expect(ratio(320)).toBeLessThan(1.2);
  });
});
