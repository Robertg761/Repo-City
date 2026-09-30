import { describe, expect, it } from "vitest";
import { ARM_SWING, LEG_SWING, STRIDE_PER_UNIT, hipDrop } from "./gait";
import { createCrowdMotion, followPose } from "./pedestrianMotion";

describe("the walk cycle", () => {
  it("drops the hips as the legs spread so the planted foot stays down", () => {
    expect(hipDrop(0, 1)).toBeCloseTo(0, 9);
    expect(hipDrop(Math.PI / 2, 1)).toBeCloseTo(0.29 * (1 - Math.cos(LEG_SWING)), 9);
    expect(hipDrop(1.2, 0)).toBe(0);
    expect(hipDrop(Math.PI / 2, 1)).toBeLessThan(0.06);
  });
  it("swings within sane bounds and steps about a figure's stride", () => {
    expect(LEG_SWING).toBeLessThan(0.7);
    expect(ARM_SWING).toBeLessThan(0.7);
    expect(Math.PI / STRIDE_PER_UNIT).toBeGreaterThan(0.2);
    expect(Math.PI / STRIDE_PER_UNIT).toBeLessThan(0.4);
  });
  it("steps down to the carriageway while crossing and back up on the pavement", () => {
    const m = createCrowdMotion(1);
    followPose(m, 0, 0, 0, 0, 0, 1, 0);
    for (let i = 0; i < 20; i++) followPose(m, 0, 3, 0, 0, 0, 1, 0.05);
    expect(m.crossing[0]).toBeGreaterThan(0.5);
    for (let i = 0; i < 400; i++) followPose(m, 0, m.x[0], 0, 0, 0, 1, 0.05);
    expect(m.crossing[0]).toBeLessThan(0.05);
  });
});
