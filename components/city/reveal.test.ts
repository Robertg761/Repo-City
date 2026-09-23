import { describe, expect, it } from "vitest";
import {
  BACKLOG_REVEAL,
  REVEAL_MS,
  SWING_DELAY,
  SWING_MS,
  cityRevealEnd,
  craneSwing,
  crowdAppearAt,
  revealEnd,
  revealScale,
  revealSettle,
} from "./reveal";
import { CROWD_REVEAL } from "@/lib/city/backlog";
import { generateCity } from "@/lib/city/generator";
import backlogFixture from "@/fixtures/backlog.analysis.json";
import { devCity } from "@/fixtures/dev.city";
import type { RepoAnalysis } from "@/types/analysis";

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

describe("the backlog reveal (PLAN.md 76.8)", () => {
  it("is S4's window: 2.7 to 3.9 seconds", () => {
    expect(BACKLOG_REVEAL).toEqual(CROWD_REVEAL);
  });

  it("ripples outward from the centre across the window", () => {
    const size = 300;
    expect(crowdAppearAt(0, 0, size)).toBe(BACKLOG_REVEAL[0]);
    expect(crowdAppearAt(size / 2, size / 2, size)).toBe(BACKLOG_REVEAL[1]);
    // Past the corners, on an approach road, it is simply last.
    expect(crowdAppearAt(size, size, size)).toBe(BACKLOG_REVEAL[1]);
    let last = -Infinity;
    for (let r = 0; r <= size * 0.7; r += 10) {
      const t = crowdAppearAt(r * 0.6, r * 0.8, size);
      expect(t).toBeGreaterThanOrEqual(last);
      last = t;
    }
  });

  it("holds traffic until the backlog and the queue have landed", () => {
    const city = generateCity(backlogFixture as unknown as RepoAnalysis, { tier: "metropolis" });
    const end = cityRevealEnd(city);
    const crowd = [...city.backlog!.incidents, ...city.backlog!.constructionSites].map((e) => e.appearAt);
    expect(end).toBe(revealEnd([...crowd, city.overflow!.appearAt, ...city.buildings.map((b) => b.appearAt)]));
    expect(end).toBeGreaterThanOrEqual(BACKLOG_REVEAL[1]);
    for (const t of crowd) {
      expect(t).toBeGreaterThanOrEqual(BACKLOG_REVEAL[0]);
      expect(t).toBeLessThanOrEqual(BACKLOG_REVEAL[1]);
    }
  });

  it("leaves a model without a backlog exactly as it was", () => {
    expect(cityRevealEnd(devCity)).toBe(
      revealEnd([
        ...devCity.buildings.map((b) => b.appearAt),
        ...devCity.landmarks.map((l) => l.appearAt),
        ...devCity.incidents.map((i) => i.appearAt),
        ...devCity.constructionSites.map((c) => c.appearAt),
      ]),
    );
  });
});
