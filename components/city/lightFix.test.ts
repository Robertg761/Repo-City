import { describe, expect, it } from "vitest";
import { windowEmissive } from "./Buildings";
import { litWindowGlow, type SceneAtmosphere } from "./palette";
import { toeLift } from "./shadowToe";
import { METALNESS_CAP, METAL_ROUGHNESS_FLOOR } from "./textures/model-detail";

const sky = (over: Partial<SceneAtmosphere>) =>
  ({ windowGlow: 1, nightness: 0, evening: 0, ...over }) as SceneAtmosphere;

describe("lit windows", () => {
  it("keep the cream pane at every hour, and glow fullest at night", () => {
    // Dimmed by day they read as flat mustard panes; the user preferred cream.
    expect(windowEmissive(sky({}))).toBeCloseTo(0.15 + 1.1, 5);
    expect(windowEmissive(sky({ nightness: 1 }))).toBeCloseTo(0.15 + 1.1 + 0.45, 5);
    expect(litWindowGlow(sky({}))).toBe(1);
    expect(litWindowGlow(sky({ nightness: 1 }))).toBeCloseTo(1.4, 5);
  });
});

describe("shadow toe", () => {
  it("lifts the floor more as the light goes, and never past a few percent", () => {
    expect(toeLift(0, 0)).toBeGreaterThan(0);
    expect(toeLift(1, 0)).toBeGreaterThan(toeLift(0, 0));
    expect(toeLift(1, 1)).toBeLessThan(0.05);
  });
});

describe("metal finish", () => {
  it("has no environment to reflect, so it stays low in metalness and satin in roughness", () => {
    expect(Number(METALNESS_CAP)).toBeLessThanOrEqual(0.15);
    expect(Number(METAL_ROUGHNESS_FLOOR)).toBeGreaterThanOrEqual(0.4);
  });
});
