import { describe, expect, it } from "vitest";
import {
  REVEAL_MS,
  SWING_DELAY,
  SWING_MS,
  craneSwing,
  revealScale,
  revealSettle,
} from "./reveal";

const at = (fraction: number) => 1000 + REVEAL_MS * fraction;

describe("revealScale", () => {
  it("stays at zero before its turn and one after it", () => {
    expect(revealScale(at(-0.5), 1000, 0)).toBe(0);
    expect(revealScale(at(1.5), 1000, 0)).toBe(1);
  });

  it("eases out: more than half way at the half-way point", () => {
    expect(revealScale(at(0.5), 1000, 0)).toBeGreaterThan(0.5);
  });

  it("holds everything at zero until the clock is stamped", () => {
    expect(revealScale(12345, Number.POSITIVE_INFINITY, 0)).toBe(0);
  });
});

describe("revealSettle", () => {
  it("starts at zero and lands on exactly one", () => {
    expect(revealSettle(at(0), 1000, 0)).toBe(0);
    expect(revealSettle(at(1), 1000, 0)).toBe(1);
    expect(revealSettle(at(2), 1000, 0)).toBe(1);
  });

  it("overshoots by a few percent and comes back", () => {
    const peak = Math.max(
      ...Array.from({ length: 60 }, (_, i) => revealSettle(at(0.4 + i / 100), 1000, 0)),
    );
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThan(1.06);
  });

  it("never dips below zero on the way up", () => {
    for (let i = 0; i <= 100; i++) {
      expect(revealSettle(at(i / 100), 1000, 0)).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("craneSwing", () => {
  it("waits for its site to be most of the way up, then finishes", () => {
    expect(craneSwing(1000, 1000, 0)).toBe(0);
    expect(craneSwing(1000 + SWING_DELAY + SWING_MS, 1000, 0)).toBe(1);
  });

  it("leaves the whole reveal inside the budget of section 43", () => {
    // The dev fixture's last construction site appears at 2640 ms, and its
    // crane's sweep is the last thing that moves.
    expect(2640 + SWING_DELAY + SWING_MS).toBeLessThan(3500);
  });
});
