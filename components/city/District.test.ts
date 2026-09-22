import { describe, expect, it } from "vitest";
import { VILLAGE_LABEL_SCALE, VILLAGE_TINT_OPACITY, groundOpacity } from "./District";

describe("district ground by settlement (PLAN.md 76.11)", () => {
  it("keeps the tinted plate everywhere but the village", () => {
    for (const tier of [undefined, "town", "city", "metropolis"] as const) {
      expect(groundOpacity(tier, false, false)).toBe(1);
      expect(groundOpacity(tier, true, true)).toBe(1);
    }
  });

  it("hides a village's plate until the district is hovered or selected", () => {
    expect(groundOpacity("village", false, false)).toBe(0);
    expect(groundOpacity("village", true, false)).toBe(VILLAGE_TINT_OPACITY);
    expect(groundOpacity("village", false, true)).toBe(VILLAGE_TINT_OPACITY);
    expect(VILLAGE_TINT_OPACITY).toBeLessThan(1);
  });

  it("shrinks a village's labels a little, never enlarges them", () => {
    expect(VILLAGE_LABEL_SCALE).toBeLessThan(1);
    expect(VILLAGE_LABEL_SCALE).toBeGreaterThan(0.6);
  });
});
