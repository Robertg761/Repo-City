import { describe, expect, it } from "vitest";
import { CAR_HALF_LENGTH, CAR_HALF_WIDTH, laneOffset } from "./lanes";
import { LOOP_MIN_RADIUS, TURN_RADIUS, uTurnAhead, uTurnPose, uTurnShape, type UTurnPose } from "./uturn";

const pose = (): UTurnPose => ({ x: 0, y: 0, psi: 0, reverse: false, leg: 0, curvature: 0 });

/** Poses every `step` units along a manoeuvre. */
function walk(lane: number, step = 0.01): UTurnPose[] {
  const shape = uTurnShape(lane);
  const out: UTurnPose[] = [];
  for (let s = 0; s <= shape.total + 1e-9; s += step) out.push({ ...uTurnPose(shape, s, pose()) });
  out.push({ ...uTurnPose(shape, shape.total, pose()) });
  return out;
}

describe("uTurnShape", () => {
  it("sweeps round in one half circle on a road wide enough", () => {
    const shape = uTurnShape(laneOffset(10));
    expect(shape.loop).toBe(true);
    expect(shape.radius).toBeGreaterThanOrEqual(LOOP_MIN_RADIUS);
    expect(shape.total).toBeCloseTo(Math.PI * shape.radius);
  });

  it("makes a three-point turn on anything narrower", () => {
    for (const width of [3.6, 4.5, 5.5, 7, 8.4]) {
      const shape = uTurnShape(laneOffset(width));
      expect(shape.loop).toBe(false);
      expect(shape.radius).toBe(TURN_RADIUS);
      // Forward, back, forward: the middle leg is the short reverse.
      expect(shape.legs[1]).toBeGreaterThan(0);
      expect(shape.legs[0]).toBeCloseTo(shape.legs[2]);
    }
  });
});

describe("uTurnPose", () => {
  it.each([3.6, 5.5, 7, 9.5, 10])("ends abreast of the start, in the other lane, facing back (width %s)", (width) => {
    const lane = laneOffset(width);
    const poses = walk(lane);
    const first = poses[0];
    const last = poses[poses.length - 1];
    expect(first.x).toBeCloseTo(-lane);
    expect(first.y).toBeCloseTo(0);
    expect(first.psi).toBeCloseTo(0);
    expect(last.x).toBeCloseTo(lane);
    expect(last.y).toBeCloseTo(0);
    expect(Math.cos(last.psi)).toBeCloseTo(-1);
  });

  it.each([3.6, 7, 9.5])("never jumps and turns at no more than the turning circle allows (width %s)", (width) => {
    const poses = walk(laneOffset(width));
    for (let i = 1; i < poses.length; i++) {
      const a = poses[i - 1];
      const b = poses[i];
      // 0.01 units of travel: position and heading move by that much at most.
      expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeLessThan(0.0101);
      expect(Math.abs(b.psi - a.psi)).toBeLessThanOrEqual(0.01 / Math.min(TURN_RADIUS, laneOffset(width)) + 1e-9);
    }
  });

  it("backs up only on the middle leg of a three-point turn", () => {
    const poses = walk(laneOffset(7));
    expect(poses.some((p) => p.reverse)).toBe(true);
    for (const p of poses) expect(p.reverse).toBe(p.leg === 1);
  });

  it("keeps a car's centre on the carriageway", () => {
    for (const width of [3.6, 4.5, 5.5, 7]) {
      for (const p of walk(laneOffset(width), 0.05)) expect(Math.abs(p.x)).toBeLessThanOrEqual(width / 2);
    }
  });
});

describe("uTurnAhead", () => {
  it("is how far any corner reaches ahead, and covers the body at the start", () => {
    for (const width of [3.6, 7, 9.5]) {
      const shape = uTurnShape(laneOffset(width));
      const ahead = uTurnAhead(shape, CAR_HALF_LENGTH, CAR_HALF_WIDTH);
      expect(ahead).toBeGreaterThanOrEqual(CAR_HALF_LENGTH);
      // Checked densely by hand: no corner of any pose is further ahead.
      for (const p of walk(laneOffset(width), 0.02)) {
        for (const [l, w] of [
          [1, 1],
          [1, -1],
          [-1, 1],
          [-1, -1],
        ]) {
          const y = p.y + l * CAR_HALF_LENGTH * Math.cos(p.psi) - w * CAR_HALF_WIDTH * Math.sin(p.psi);
          expect(y).toBeLessThanOrEqual(ahead + 0.02);
        }
      }
    }
  });
});
