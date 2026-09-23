import { describe, expect, it } from "vitest";
import type { SettlementTier } from "@/types/analysis";
import {
  KERB,
  cityBoundsSize,
  districtSquareSide,
  planHighways,
  planLayout,
  type LayoutDistrictInput,
} from "./layout";
import { SETTLEMENT_PARAMS } from "./settlement";

const districts = (counts: number[]): LayoutDistrictInput[] =>
  counts.map((buildingCount, index) => ({ id: `d-${index}`, buildingCount }));

const sum = (counts: number[]): number => counts.reduce((a, b) => a + b, 0);

const layoutOf = (counts: number[], tier: SettlementTier) =>
  planLayout(districts(counts), sum(counts), { tier, landmarkFiles: 4 });

/** Split `n` buildings over `k` districts, heaviest first. */
const split = (n: number, k: number): number[] =>
  Array.from({ length: k }, (_, i) => Math.max(1, Math.round((n * 2 ** (k - i - 1)) / (2 ** k - 1))));

describe("per-tier bounds (PLAN.md 76.5)", () => {
  it("keeps a town between 115 and 165 across its building budget", () => {
    const { min, max } = SETTLEMENT_PARAMS.town.buildings;
    for (let n = min; n <= max; n += 5) {
      for (const k of [2, 4, 7]) {
        const size = layoutOf(split(n, k), "town").size;
        expect(size, `n ${n}, k ${k}`).toBeGreaterThanOrEqual(115);
        expect(size, `n ${n}, k ${k}`).toBeLessThanOrEqual(165);
      }
    }
  });

  it("keeps a metropolis between 285 and 320 across its building budget", () => {
    const { min, max } = SETTLEMENT_PARAMS.metropolis.buildings;
    for (let n = min; n <= max; n += 15) {
      for (const k of [5, 9]) {
        const layout = layoutOf(split(n, k), "metropolis");
        expect(layout.size, `n ${n}`).toBeGreaterThanOrEqual(285);
        expect(layout.size, `n ${n}`).toBeLessThanOrEqual(320);
        expect(layout.districtSide).toBeGreaterThanOrEqual(215);
        expect(layout.districtSide).toBeLessThanOrEqual(270);
      }
    }
  });

  it("keeps the fullest town smaller than the smallest city (the ruling after S0)", () => {
    expect(cityBoundsSize(SETTLEMENT_PARAMS.town.buildings.max, "town")).toBeLessThan(
      cityBoundsSize(SETTLEMENT_PARAMS.city.buildings.min, "city"),
    );
    expect(cityBoundsSize(SETTLEMENT_PARAMS.city.buildings.max, "city")).toBeLessThan(
      cityBoundsSize(SETTLEMENT_PARAMS.metropolis.buildings.min, "metropolis"),
    );
  });

  it("clamps each tier's district square to its own curve", () => {
    for (const tier of ["town", "city", "metropolis"] as const) {
      const side = SETTLEMENT_PARAMS[tier].districtSide!;
      for (const n of [1, 30, 120, 300, 450]) {
        const expected = Math.min(side.max, Math.max(side.min, side.base + side.perRootBuilding * Math.sqrt(n)));
        expect(districtSquareSide(n, tier)).toBeCloseTo(expected, 3);
      }
    }
  });

  it("describes the civic ground of every tier as its plaza", () => {
    const surfaces: Record<SettlementTier, string> = {
      village: "green",
      town: "setts",
      city: "paved",
      metropolis: "paved",
    };
    for (const tier of Object.keys(surfaces) as SettlementTier[]) {
      const layout = layoutOf([30, 20, 12, 6], tier);
      expect(layout.plaza?.surface).toBe(surfaces[tier]);
      const plaza = layout.plaza!.rect;
      const civic = layout.civic.rect;
      expect(Math.abs(plaza.x - civic.x)).toBeLessThan(1e-6);
      expect(Math.abs(plaza.z - civic.z)).toBeLessThan(1e-6);
      expect(plaza.w).toBeLessThanOrEqual(civic.w);
      expect(plaza.w).toBeGreaterThan(0);
    }
  });
});

describe("the town's high street", () => {
  const cases = [[40, 20, 12, 6, 4], [60, 30], [90], [30, 25, 20, 15, 10, 10, 5]];

  it("runs east-west along the civic square's edge and on to the ring", () => {
    for (const counts of cases) {
      const layout = layoutOf(counts, "town");
      const main = layout.roads.filter((r) => r.main);
      expect(main.length).toBeGreaterThan(0);
      const z = main[0].from[2];
      for (const road of main) {
        expect(road.major).toBe(true);
        expect(road.from[2]).toBe(z);
        expect(road.to[2]).toBe(z);
      }
      const xs = main.flatMap((r) => [r.from[0], r.to[0]]);
      expect(Math.min(...xs)).toBeCloseTo(-layout.ringRadius, 3);
      expect(Math.max(...xs)).toBeCloseTo(layout.ringRadius, 3);
      const civic = layout.civic.rect;
      expect([civic.z - civic.d / 2, civic.z + civic.d / 2].some((edge) => Math.abs(edge - z) < 1e-3)).toBe(true);
    }
  });

  it("marks the cells that front it, and only those", () => {
    for (const counts of cases) {
      const layout = layoutOf(counts, "town");
      const main = layout.roads.filter((r) => r.main);
      const slots = layout.districts.flatMap((d) => d.slots);
      const fronting = slots.filter((s) => s.frontage === "main-street");
      expect(fronting.length, `counts ${counts.join(",")}`).toBeGreaterThan(0);
      for (const slot of slots) {
        const touches = main.some((road) => {
          const x0 = Math.min(road.from[0], road.to[0]);
          const x1 = Math.max(road.from[0], road.to[0]);
          const alongside = slot.x + slot.cellW / 2 > x0 && slot.x - slot.cellW / 2 < x1;
          const gap = Math.abs(slot.z - road.from[2]) - slot.cellD / 2 - road.width / 2;
          return alongside && gap <= KERB + 1 + 1e-6;
        });
        expect(slot.frontage === "main-street", `slot ${slot.x},${slot.z}`).toBe(touches);
      }
    }
  });

  it("moves the fire station and the information centre off it", () => {
    for (const counts of cases) {
      const layout = layoutOf(counts, "town");
      const z = layout.roads.find((r) => r.main)!.from[2];
      const half = SETTLEMENT_PARAMS.town.roads.major.width / 2;
      for (const plot of [layout.landmarkPlots.fire, layout.landmarkPlots.info]) {
        // Quarter-turned: `w` runs along z.
        expect(Math.abs(plot.z - z)).toBeGreaterThanOrEqual(plot.w / 2 + half);
      }
    }
  });

  it("has no high street in any other tier", () => {
    for (const tier of ["city", "metropolis"] as const) {
      const layout = layoutOf([40, 20, 12, 6, 4], tier);
      expect(layout.roads.some((r) => r.main)).toBe(false);
      expect(layout.districts.flatMap((d) => d.slots).some((s) => s.frontage)).toBe(false);
    }
  });
});

describe("the metropolis's roads", () => {
  const layout = layoutOf([160, 90, 60, 40, 30, 20, 10], "metropolis");

  it("rings the city with a highway of width 10", () => {
    const r = layout.ringRadius;
    const ring = layout.roads.filter(
      (road) =>
        (Math.abs(Math.abs(road.from[0]) - r) < 1e-6 && road.from[0] === road.to[0]) ||
        (Math.abs(Math.abs(road.from[2]) - r) < 1e-6 && road.from[2] === road.to[2]),
    );
    expect(ring.length).toBeGreaterThanOrEqual(4);
    for (const road of ring) {
      expect(road.kind).toBe("highway");
      expect(road.width).toBe(10);
      expect(road.major).toBe(true);
    }
  });

  it("makes every other arterial an avenue and every block street a 5.5 street", () => {
    for (const road of layout.roads) {
      if (road.kind === "highway") continue;
      if (road.major) {
        expect(road.kind).toBe("avenue");
        expect(road.width).toBe(9.5);
      } else {
        expect(road.kind).toBeUndefined();
        expect(road.width).toBe(5.5);
      }
    }
  });

  it("always has at least two highways out, as wide as its ring, and never more than four", () => {
    expect(planHighways(layout, 0)).toHaveLength(2);
    expect(planHighways(layout, 1)).toHaveLength(2);
    expect(planHighways(layout, 3)).toHaveLength(3);
    expect(planHighways(layout, 99)).toHaveLength(4);
    for (const road of planHighways(layout, 4)) {
      expect(road.width).toBe(10);
      expect(road.kind).toBe("highway");
    }
  });

  it("gives a town at most two highways and a city today's zero to four", () => {
    expect(planHighways(layoutOf([40, 20], "town"), 99)).toHaveLength(2);
    expect(planHighways(layoutOf([40, 20], "town"), 0)).toHaveLength(0);
    expect(planHighways(layoutOf([40, 20], "city"), 0)).toHaveLength(0);
    expect(planHighways(layoutOf([40, 20], "city"), 99)).toHaveLength(4);
  });
});
