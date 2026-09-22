import { describe, expect, it } from "vitest";
import { Box3 } from "three";
import { PAINT_ATTRIBUTE, triangleCount } from "../props/geometry";
import {
  MAX_BODY_WIDTH,
  TRACTOR_COLORS,
  TRACTOR_SPEC,
  VEHICLE_BODIES,
  tractorGeometry,
  tractorLightsGeometry,
  tractorParkedGeometry,
} from "./shapes";

describe("the tractor (PLAN.md 76.5)", () => {
  it("stays out of the city's fleet", () => {
    expect(VEHICLE_BODIES).not.toContain("tractor");
    expect(VEHICLE_BODIES).toHaveLength(6);
  });

  it("fits a lane: no wider than the widest car, wheels included", () => {
    const box = new Box3().setFromBufferAttribute(tractorParkedGeometry().getAttribute("position") as never);
    expect(box.max.x - box.min.x).toBeLessThanOrEqual(MAX_BODY_WIDTH + 1e-6);
    expect(TRACTOR_SPEC.width).toBeLessThanOrEqual(MAX_BODY_WIDTH);
    expect(box.max.z - box.min.z).toBeLessThanOrEqual(TRACTOR_SPEC.length + 0.02);
    expect(box.min.y).toBeGreaterThanOrEqual(-1e-6);
  });

  it("stands its wheels on the road, big at the back and small at the front", () => {
    expect(TRACTOR_SPEC.wheelRadii).toHaveLength(TRACTOR_SPEC.wheels.length);
    const [front, , rear] = TRACTOR_SPEC.wheelRadii;
    expect(rear).toBeGreaterThan(front);
    // Front wheels forward (+z), rear wheels behind.
    expect(TRACTOR_SPEC.wheels[0][1]).toBeGreaterThan(0);
    expect(TRACTOR_SPEC.wheels[2][1]).toBeLessThan(0);
  });

  it("paints only the bodywork, and stays cheap", () => {
    const paint = tractorGeometry().getAttribute(PAINT_ATTRIBUTE);
    let painted = 0;
    for (let i = 0; i < paint.count; i++) painted += paint.getX(i);
    expect(painted).toBeGreaterThan(0);
    expect(painted).toBeLessThan(paint.count);
    expect(triangleCount(tractorGeometry())).toBeLessThan(400);
    expect(triangleCount(tractorParkedGeometry())).toBeLessThan(700);
    expect(triangleCount(tractorLightsGeometry())).toBeLessThan(80);
  });

  it("is built once", () => {
    expect(tractorGeometry()).toBe(tractorGeometry());
    expect(tractorParkedGeometry()).toBe(tractorParkedGeometry());
    expect(TRACTOR_COLORS.length).toBeGreaterThan(2);
  });
});
