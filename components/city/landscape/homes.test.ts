import { describe, expect, it } from "vitest";
import { TIERS, tierCity } from "./cities";
import { homeHeight, litHomeWindows, planHomeWindows } from "./homes";
import { planLandscape } from "./plan";
import { LANDING_CITY, LANDING_SIZE } from "./landing";

describe("the lit windows of the land's houses", () => {
  it.each(TIERS)("%s: windows sit on their houses, sorted by rank, in a bounded number", (tier) => {
    const p = planLandscape(tierCity(tier));
    const windows = planHomeWindows(p.houses);
    expect(windows.length).toBeGreaterThan(p.houses.length > 0 ? 4 : -1);
    expect(windows.length).toBeLessThanOrEqual(1400);
    for (let i = 1; i < windows.length; i++) expect(windows[i].rank).toBeGreaterThanOrEqual(windows[i - 1].rank);
    for (const w of windows) {
      expect(w.house).toBeGreaterThanOrEqual(0);
      expect(w.house).toBeLessThan(p.houses.length);
      expect(Math.abs(w.ox)).toBeLessThanOrEqual(0.55);
      expect(Math.abs(w.oz)).toBeLessThanOrEqual(0.55);
      expect(w.oy).toBeGreaterThan(0);
      expect(w.oy).toBeLessThan(1.05);
    }
  });

  it("the hour lights a prefix: none at zero, all at one, more at a greater share", () => {
    const p = planLandscape(tierCity("metropolis"));
    const windows = planHomeWindows(p.houses);
    expect(litHomeWindows(windows, 0)).toBe(0);
    expect(litHomeWindows(windows, 1.0001)).toBe(windows.length);
    const half = litHomeWindows(windows, 0.5);
    expect(half).toBeGreaterThan(0);
    expect(half).toBeLessThan(windows.length);
    expect(litHomeWindows(windows, 0.8)).toBeGreaterThanOrEqual(half);
  });

  it("is deterministic, and a cottage is not drawn taller than its proportions", () => {
    const p = planLandscape(tierCity("village"));
    expect(planHomeWindows(p.houses)).toEqual(planHomeWindows(p.houses));
    for (const h of p.houses) expect(homeHeight(h)).toBeLessThanOrEqual(h.h + 1e-9);
  });
});

describe("the landing stage's land", () => {
  it("plans a village-sized country round the stage, with no roads", () => {
    const p = planLandscape(LANDING_CITY);
    expect(p.tier).toBe("village");
    expect(p.size).toBe(LANDING_SIZE);
    expect(p.roads).toHaveLength(0);
    expect(p.fields.length).toBeGreaterThan(10);
    expect(p.trees.length).toBeGreaterThan(100);
    expect(planLandscape(LANDING_CITY).fields.map((f) => f.x)).toEqual(p.fields.map((f) => f.x));
  });
});
