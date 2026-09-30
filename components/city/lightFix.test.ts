import { describe, expect, it } from "vitest";
import { windowDim, windowEmissive, windowLit } from "./Buildings";
import { litWindowGlow, type SceneAtmosphere } from "./palette";
import { toeLift } from "./shadowToe";
import { METALNESS_CAP, METAL_ROUGHNESS_FLOOR } from "./textures/model-detail";

const sky = (over: Partial<SceneAtmosphere>) =>
  ({ windowGlow: 1, nightness: 0, evening: 0, ...over }) as SceneAtmosphere;

describe("lit windows by day", () => {
  it("are a faint cue in the afternoon and full at night", () => {
    const day = windowEmissive(sky({}));
    const night = windowEmissive(sky({ nightness: 1 }));
    expect(day).toBeLessThan(0.6);
    expect(night).toBeCloseTo(0.15 + 1.1 + 0.45, 5);
    expect(windowDim(windowLit(sky({})))).toBeLessThan(0.35);
    expect(windowDim(windowLit(sky({ nightness: 1 })))).toBe(1);
  });

  it("come up through the golden hour", () => {
    expect(windowLit(sky({ evening: 1 }))).toBeGreaterThan(windowLit(sky({})));
    expect(litWindowGlow(sky({}))).toBeLessThan(litWindowGlow(sky({ evening: 1 })));
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
