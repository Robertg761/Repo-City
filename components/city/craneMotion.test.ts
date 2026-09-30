import { describe, expect, it } from "vitest";
import { HOOK_REACH, SLEW_SPAN, gust, newHanger, slewAt, stepHanger } from "./craneMotion";
import { placePhase } from "./phase";

describe("crane motion", () => {
  it("slews within its span and stops at each end", () => {
    let peak = 0;
    for (let t = 0; t < 60; t += 0.05) {
      const { angle } = slewAt(t, 1.2);
      peak = Math.max(peak, Math.abs(angle));
      expect(Math.abs(angle)).toBeLessThanOrEqual(SLEW_SPAN + 1e-9);
    }
    expect(peak).toBeGreaterThan(SLEW_SPAN * 0.98);
  });

  it("lags the hook behind a turn and settles, without blowing up", () => {
    const h = newHanger();
    // A burst of turning, then nothing.
    for (let i = 0; i < 60; i++) stepHanger(h, 1 / 60, 0.2, 0);
    expect(Math.abs(h.side)).toBeGreaterThan(0.001);
    // Accelerating one way swings the load the other (the pendulum's sign).
    expect(h.side).toBeLessThan(0);
    for (let i = 0; i < 60 * 60; i++) stepHanger(h, 1 / 60, 0, 0);
    expect(Math.abs(h.side)).toBeLessThan(0.002);
    expect(HOOK_REACH).toBeGreaterThan(0);
  });

  it("keeps the swing small under the gusts and the slew together", () => {
    const h = newHanger();
    let worst = 0;
    for (let t = 0; t < 300; t += 1 / 60) {
      stepHanger(h, 1 / 60, slewAt(t, 0.4).accel, gust(t, 0.4));
      worst = Math.max(worst, Math.abs(h.side), Math.abs(h.along));
    }
    expect(worst).toBeLessThan(0.3);
  });

  it("survives a long frame", () => {
    const h = newHanger();
    stepHanger(h, 5, 0.1, 0.2);
    expect(Number.isFinite(h.side + h.along)).toBe(true);
  });

  it("gives places stable, different phases", () => {
    expect(placePhase(1, 2, 3)).toBe(placePhase(1, 2, 3));
    expect(placePhase(1, 2, 3)).not.toBe(placePhase(4, 2, 3));
  });
});
