import { describe, expect, it } from "vitest";
import { TIERS, tierCity } from "./cities";
import { planLandscape } from "./plan";
import { planUndergrowth, planYards } from "./small";

describe.each(TIERS)("%s: the small things", (tier) => {
  const p = planLandscape(tierCity(tier));
  it("plans yards deterministically, finite and bounded", () => {
    const a = planYards(p.houses);
    expect(planYards(p.houses)).toEqual(a);
    expect(a.length).toBeLessThanOrEqual(p.houses.length * 9);
    for (const i of a) expect(Number.isFinite(i.x + i.z + i.yaw)).toBe(true);
  });
  it("plans shrubs near trees within budget", () => {
    const s = planUndergrowth(p.trees, 300);
    expect(s.length).toBeLessThanOrEqual(300);
    expect(planUndergrowth(p.trees, 0)).toEqual([]);
    for (const b of s) expect(b.scale).toBeGreaterThan(1);
  });
});
