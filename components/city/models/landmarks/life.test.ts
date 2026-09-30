/**
 * The landmarks' motion: the train's wheels turn, the engine drives out, the
 * station's lights flash, and the landscape rises with the reveal.
 */
import { describe, expect, it } from "vitest";
import { flashLevel } from "../../landmarkLife";
import { landGrow } from "../../landscape/Landscape";
import { SORTIE_PERIOD, SORTIE_TRAVEL, sortieAt } from "./fire";
import { PORTAL_X, TRAIN_CENTRE, WHEEL_RADIUS, blenderTrain, blenderTrainParts, trainPose, tunnelShade } from "./station";
import { blenderTrainPartsNear } from "./near";

describe("the running train's wheels", () => {
  it("are apart from the carriage, one wheelset at each of twelve axles on the rail tops", () => {
    for (const parts of [blenderTrainParts("raised"), blenderTrainParts("lowered")]) {
      expect(parts.axles).toHaveLength(12);
      for (const [, y, z] of parts.axles) {
        expect(y).toBeCloseTo(WHEEL_RADIUS + 0.5, 2);
        expect(z).toBe(0);
      }
      // The wheelset is centred on its axle, so it can turn about it.
      const gear = parts.wheels.gear!;
      gear.computeBoundingBox();
      const box = gear.boundingBox!;
      expect(Math.abs(box.min.x + box.max.x)).toBeLessThan(0.01);
      expect(Math.abs(box.min.y + box.max.y)).toBeLessThan(0.01);
      expect(box.max.y).toBeCloseTo(WHEEL_RADIUS, 1);
    }
  });

  it("are the same train parked: the merged set has the parts of both", () => {
    const parts = blenderTrainParts("lowered");
    const merged = blenderTrain("lowered");
    const count = (g?: { getAttribute(n: string): { count: number } }) => (g ? g.getAttribute("position").count : 0);
    expect(count(merged.gear)).toBe(count(parts.slots.gear) + parts.axles.length * count(parts.wheels.gear));
  });

  it("the detailed set has them apart too, at the same axles", () => {
    expect(blenderTrainPartsNear("raised").axles).toEqual(blenderTrainParts("raised").axles);
  });
});

describe("the tunnel's shade", () => {
  it("is full in the open and deepens into the mouth", () => {
    expect(tunnelShade(TRAIN_CENTRE)).toBe(1);
    expect(tunnelShade(PORTAL_X - 8)).toBe(1);
    let last = 1;
    for (let x = PORTAL_X - 7; x <= PORTAL_X + 6.3; x += 0.5) {
      const level = tunnelShade(x);
      expect(level).toBeLessThanOrEqual(last + 1e-9);
      last = level;
    }
    expect(tunnelShade(PORTAL_X + 6.3)).toBeGreaterThan(0.25);
    expect(tunnelShade(PORTAL_X + 6.3)).toBeLessThan(0.45);
  });

  it("never darkens a train waiting at the platform", () => {
    for (let t = 0; t < 60; t += 0.25) {
      const pose = trainPose(t, 1);
      if (pose.x <= TRAIN_CENTRE + 0.01) expect(tunnelShade(pose.x)).toBe(1);
    }
  });
});

describe("the fire engine's call-out", () => {
  it("starts and ends in its bay, runs out and back, and is never in the road beyond its run", () => {
    expect(sortieAt(0).out).toBe(0);
    let peak = 0;
    for (let t = 0; t < SORTIE_PERIOD; t += 0.05) {
      const s = sortieAt(t);
      expect(s.out).toBeGreaterThanOrEqual(0);
      expect(s.out).toBeLessThanOrEqual(1);
      peak = Math.max(peak, s.out);
    }
    expect(peak).toBe(1);
    expect(SORTIE_TRAVEL).toBeGreaterThan(1);
    expect(sortieAt(SORTIE_PERIOD - 0.01).out).toBe(0);
  });

  it("moves smoothly: no jump between frames", () => {
    let last = sortieAt(0).out;
    for (let t = 1 / 60; t < SORTIE_PERIOD; t += 1 / 60) {
      const out = sortieAt(t).out;
      expect(Math.abs(out - last)).toBeLessThan(0.03);
      last = out;
    }
  });

  it("puts its lights on before it moves and keeps them until it is back", () => {
    let first = -1;
    let lastOn = -1;
    for (let t = 0; t < SORTIE_PERIOD; t += 0.05) {
      const s = sortieAt(t);
      if (s.alarm > 0.5) {
        if (first < 0) first = t;
        lastOn = t;
      }
      if (s.out > 0) expect(s.alarm).toBeGreaterThan(0.5);
    }
    let firstMove = -1;
    let back = -1;
    for (let t = 0; t < SORTIE_PERIOD; t += 0.05) {
      const s = sortieAt(t);
      if (s.out > 0 && firstMove < 0) firstMove = t;
      if (s.out > 0) back = t;
    }
    expect(first).toBeLessThan(firstMove);
    expect(lastOn).toBeGreaterThan(back);
  });

  it("keeps two stations out of step: the offset shifts the call-out", () => {
    expect(sortieAt(5, 0).out).not.toBe(sortieAt(5, 11).out);
  });
});

describe("a station's flashing light", () => {
  it("is a flash, not a glow: on or off, with the pair alternating when alarmed", () => {
    const levels = new Set<number>();
    for (let t = 0; t < 4; t += 0.01) levels.add(flashLevel(t, 0, 0, 1));
    expect([...levels].sort()).toEqual([0, 1]);
    for (let t = 0; t < 4; t += 0.013) {
      expect(flashLevel(t, 0, 0, 1) + flashLevel(t, 0, 1, 1)).toBe(1);
    }
  });

  it("is quiet when idle: lit for a short part of a long cycle", () => {
    let on = 0;
    const n = 3200;
    for (let i = 0; i < n; i++) on += flashLevel((i / n) * 3.2, 0, 0, 0);
    expect(on / n).toBeGreaterThan(0.05);
    expect(on / n).toBeLessThan(0.2);
  });
});

describe("the landscape's rise", () => {
  it("grows from the flat plate to full relief without overshooting", () => {
    expect(landGrow(0)).toBeCloseTo(0.02, 5);
    expect(landGrow(1)).toBe(1);
    let last = 0;
    for (let t = 0; t <= 1; t += 0.02) {
      expect(landGrow(t)).toBeGreaterThanOrEqual(last);
      expect(landGrow(t)).toBeLessThanOrEqual(1);
      last = landGrow(t);
    }
  });
});
