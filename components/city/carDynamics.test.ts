import { describe, expect, it } from "vitest";
import {
  ROAD_TOP,
  braking,
  carGrow,
  createDynamics,
  flatRoad,
  groundUnder,
  signalOf,
  stanceOf,
  stepDynamics,
  wheelCentre,
  type Stance,
} from "./carDynamics";
import { BODY_SPECS, VEHICLE_BODIES } from "./models/vehicles/shapes";
import { cityFleet } from "./fleet";
import { carPose, stepTraffic, type CarPose } from "./traffic";
import { devCity } from "@/fixtures/dev.city";

const stance = (): Stance => ({ y: 0, slope: 0, base: 0, rise: 0 });

describe("tyres on the road", () => {
  it("puts the lowest point of every wheel on a flat road, for every body and any growth", () => {
    for (const kind of VEHICLE_BODIES) {
      const spec = BODY_SPECS[kind];
      const s = stanceOf(stance(), flatRoad, 3, -4, Math.cos(0.7), Math.sin(0.7), spec.wheels[0][1], spec.wheels[2][1]);
      for (const grow of [0.2, 0.6, 1]) {
        for (const [, lz] of spec.wheels) {
          expect(wheelCentre(s, lz, spec.wheelRadius, grow) - spec.wheelRadius * grow).toBeCloseTo(ROAD_TOP, 6);
        }
      }
    }
  });

  it("follows a ramp: each wheel stands on the road under it and the car pitches up the slope", () => {
    const ramp = (x: number, z: number) => 0.08 + 0.2 * z;
    // Heading 0: forward is +z, uphill.
    const s = stanceOf(stance(), ramp, 0, 10, 1, 0, 0.9, -0.9);
    for (const lz of [0.9, -0.9]) expect(wheelCentre(s, lz, 0.25, 1) - 0.25).toBeCloseTo(ramp(0, 10 + lz), 6);
    expect(s.slope).toBeLessThan(0);
    expect(s.slope).toBeCloseTo(-Math.atan(0.2), 6);
  });

  it("carGrow eases from nothing to whole", () => {
    expect(carGrow(0, 0.5)).toBe(0);
    expect(carGrow(5, 0)).toBe(1);
    expect(carGrow(0.2, 0)).toBeGreaterThan(0);
    expect(carGrow(0.2, 0)).toBeLessThan(1);
  });

  it("finds the plate under a district and the terrain beyond", () => {
    const rects = [{ x: 0, z: 0, w: 10, d: 10 }];
    expect(groundUnder(rects, () => -0.06, 1, 1)).toBe(0.01);
    expect(groundUnder(rects, () => -0.06, 20, 1)).toBe(-0.06);
    expect(groundUnder(rects, null, 20, 1)).toBe(0);
  });
});

describe("the body on its springs", () => {
  const run = (speedAt: (t: number) => number, curvature: number, seconds: number) => {
    const d = createDynamics(1);
    const dt = 1 / 60;
    let peakPitch = 0;
    let peakRoll = 0;
    for (let t = 0; t < seconds; t += dt) {
      stepDynamics(d, 0, dt, speedAt(t), curvature, 0);
      peakPitch = Math.max(peakPitch, Math.abs(d.pitch[0]));
      peakRoll = Math.max(peakRoll, Math.abs(d.roll[0]));
    }
    return { d, peakPitch, peakRoll };
  };

  it("dips the nose braking and squats the tail accelerating", () => {
    const braked = run((t) => Math.max(0, 6 - 6 * t), 0, 0.8);
    expect(Math.max(...braked.d.pitch)).toBeGreaterThan(0.01);
    const launched = run((t) => Math.min(6, 2.8 * t), 0, 0.8);
    expect(Math.min(...launched.d.pitch)).toBeLessThan(-0.005);
  });

  it("leans out of a bend and stays inside sensible limits", () => {
    const left = run(() => 5, 0.3, 2);
    expect(left.d.roll[0]).toBeGreaterThan(0.01);
    expect(left.peakRoll).toBeLessThanOrEqual(0.07);
    const right = run(() => 5, -0.3, 2);
    expect(right.d.roll[0]).toBeLessThan(-0.01);
  });

  it("settles level on a steady straight and stays finite over long frames", () => {
    const d = createDynamics(1);
    for (let i = 0; i < 400; i++) stepDynamics(d, 0, 0.1, 4, 0, 0);
    expect(Math.abs(d.pitch[0])).toBeLessThan(0.002);
    expect(Math.abs(d.roll[0])).toBeLessThan(0.002);
    expect(Number.isFinite(d.bob[0])).toBe(true);
    expect(Math.abs(d.bob[0])).toBeLessThan(0.02);
  });

  it("lights the brake while slowing or standing, not while cruising", () => {
    const d = createDynamics(1);
    for (let i = 0; i < 60; i++) stepDynamics(d, 0, 1 / 60, 5, 0, 0);
    expect(braking(d, 0, 5)).toBe(false);
    for (let i = 0; i < 30; i++) stepDynamics(d, 0, 1 / 60, 5 - i * 0.2, 0, 0);
    expect(braking(d, 0, 2)).toBe(true);
    expect(braking(d, 0, 0)).toBe(true);
  });
});

describe("a driven fleet", () => {
  const city = devCity;
  it("signals before turning and every car's speed and pose stay finite", () => {
    const { traffic } = cityFleet(city);
    const pose: CarPose = { x: 0, z: 0, angle: 0, curvature: 0, reverse: false };
    const d = createDynamics(traffic.cars.length);
    let signalled = 0;
    for (let frame = 0; frame < 60 * 40; frame++) {
      stepTraffic(traffic, 1 / 60);
      traffic.cars.forEach((car, i) => {
        carPose(traffic, car, pose);
        stepDynamics(d, i, 1 / 60, car.v, pose.curvature, 0);
        if (signalOf(traffic, car) !== 0) signalled++;
        expect(Number.isFinite(d.pitch[i] + d.roll[i] + d.bob[i])).toBe(true);
      });
    }
    expect(signalled).toBeGreaterThan(0);
  });
});
