/**
 * The generator's half of PLAN.md 76.5: every per-tier number comes from
 * `SETTLEMENT_PARAMS`, and whatever the per-tier layouts add (a house turned
 * to face its lane, a shopfront slot, fields, an explicit plaza) is carried
 * through to the model.
 */

import { describe, expect, it, vi } from "vitest";
import sample from "@/fixtures/sample.analysis.json";
import type { RepoAnalysis, SettlementTier } from "@/types/analysis";
import type { FieldPatch } from "@/types/city";
import { generateCity, overlappingBuildings } from "./generator";
import type { CityLayout } from "./layout";
import { SETTLEMENT_PARAMS } from "./settlement";

/** Switches for the layout double below; off by default, so the real layout runs. */
const extras = vi.hoisted(() => ({
  on: false,
  fields: [] as FieldPatch[],
  plaza: null as null | { rect: { x: number; z: number; w: number; d: number }; surface: "green" },
  /** The last layout the generator asked for, whether or not the double changed it. */
  last: null as CityLayout | null,
}));

vi.mock("./layout", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./layout")>();
  return {
    ...actual,
    planLayout: (...args: Parameters<typeof actual.planLayout>): CityLayout => {
      const layout = actual.planLayout(...args);
      extras.last = layout;
      if (!extras.on) return layout;
      // What S3's village and town layouts add: every other slot turned to a
      // lane, the first slot of each district on the high street.
      for (const district of layout.districts) {
        district.slots = district.slots.map((slot, i) => ({
          ...slot,
          ...(i % 2 === 1 ? { rotationY: 0.4 } : {}),
          ...(i === 0 ? { frontage: "main-street" as const } : {}),
        }));
      }
      return Object.assign(layout, {
        fields: extras.fields,
        ...(extras.plaza ? { plaza: extras.plaza } : {}),
      });
    },
  };
});

const fixture = sample as unknown as RepoAnalysis;
const TIERS: SettlementTier[] = ["village", "town", "city", "metropolis"];

describe("per-tier numbers come from SETTLEMENT_PARAMS", () => {
  it.each(TIERS)("%s: heights, footprints, trees, lamps and vehicles", (tier) => {
    const params = SETTLEMENT_PARAMS[tier];
    const city = generateCity(fixture, { tier });
    for (const building of city.buildings) {
      if (building.plan.landmark !== null) continue;
      const base = params.tierHeight[building.tier];
      expect(building.size[1]).toBeGreaterThanOrEqual(base * 0.85 - 1e-3);
      expect(building.size[1]).toBeLessThanOrEqual(base * 1.15 + 1e-3);
      expect(Math.max(building.size[0], building.size[2])).toBeLessThanOrEqual(params.footprint.max + 1e-9);
    }
    expect(city.buildings.length).toBeLessThanOrEqual(params.buildings.max);
    expect(city.props.trees.length).toBeLessThanOrEqual(params.trees);
    expect(city.props.lamps.length).toBeLessThanOrEqual(params.lamps);
    expect(city.vehicles.count).toBeLessThanOrEqual(params.vehicles.max);
    expect(city.incidents.length).toBeLessThanOrEqual(params.heroes.incidents);
    expect(city.constructionSites.length).toBeLessThanOrEqual(params.heroes.sites);
    // Roads out only: a metropolis ring is `kind: "highway"` too (76.5).
    const highways = city.roads.filter((r) => r.id.startsWith("road-hwy-")).length;
    expect(highways).toBeGreaterThanOrEqual(params.highways.min);
    expect(highways).toBeLessThanOrEqual(params.highways.max);
  });

  it("gives a metropolis its two highways even when nobody forked it", () => {
    const lonely = structuredClone(fixture);
    lonely.repo.forks = 0;
    expect(generateCity(lonely, { tier: "metropolis" }).roads.filter((r) => r.id.startsWith("road-hwy-"))).toHaveLength(2);
    expect(generateCity(lonely).roads.some((r) => r.kind === "highway")).toBe(false);
  });

  it("builds a metropolis taller than a village from the same repository", () => {
    const tallest = (tier: SettlementTier) =>
      Math.max(...generateCity(fixture, { tier }).buildings.map((b) => b.size[1]));
    expect(tallest("metropolis")).toBeGreaterThan(tallest("city"));
    expect(tallest("city")).toBeGreaterThan(tallest("town"));
    expect(tallest("town")).toBeGreaterThan(tallest("village"));
  });
});

describe("a town's parks", () => {
  it("plants the cells beside the square that no district was dealt", () => {
    const few = { ...fixture, districts: fixture.districts.slice(0, 3) };
    const city = generateCity(few, { tier: "town" });
    const parks = extras.last?.parks ?? [];
    expect(parks).toHaveLength(1);
    const [park] = parks;
    const inside = city.props.trees.filter(
      ([x, , z]) => Math.abs(x - park.x) < park.w / 2 && Math.abs(z - park.z) < park.d / 2,
    );
    expect(inside.length).toBeGreaterThanOrEqual(10);
    // Clear of the streets that ring it.
    for (const [x, , z] of inside) {
      expect(Math.abs(x - park.x)).toBeLessThan(park.w / 2 - 3);
      expect(Math.abs(z - park.z)).toBeLessThan(park.d / 2 - 3);
    }
  });
});

describe("plaza", () => {
  it("derives the civic ground from the layout, surfaced by tier", () => {
    const city = generateCity(fixture);
    const village = generateCity(fixture, { tier: "village" });
    const town = generateCity(fixture, { tier: "town" });
    expect(city.plaza!.surface).toBe("paved");
    expect(town.plaza!.surface).toBe("setts");
    expect(village.plaza!.surface).toBe("green");
    // The rect holds the town hall.
    const hall = city.landmarks.find((l) => l.landmarkType === "civic")!;
    const { rect } = city.plaza!;
    expect(Math.abs(hall.position[0] - rect.x)).toBeLessThan(rect.w / 2);
    expect(Math.abs(hall.position[2] - rect.z)).toBeLessThan(rect.d / 2);
  });
});

describe("what the per-tier layouts add", () => {
  const field: FieldPatch = { x: 70, z: 70, w: 16, d: 12, rotationY: 0.3, crop: 2 };

  const withExtras = <T,>(run: () => T): T => {
    extras.on = true;
    extras.fields = [field];
    extras.plaza = { rect: { x: 1, z: 2, w: 20, d: 18 }, surface: "green" };
    try {
      return run();
    } finally {
      extras.on = false;
      extras.fields = [];
      extras.plaza = null;
    }
  };

  it("honours a slot's rotation, copies frontage, passes fields and the plaza through", () => {
    const plain = generateCity(fixture);
    const city = withExtras(() => generateCity(fixture));
    const turned = city.buildings.filter((b) => b.rotationY === 0.4);
    expect(turned.length).toBeGreaterThan(0);
    const fronts = city.buildings.filter((b) => b.frontage === "main-street");
    expect(fronts.length).toBe(city.districts.length);
    expect(plain.buildings.some((b) => "frontage" in b)).toBe(false);
    expect(city.props.fields).toEqual([field]);
    expect(plain.props.fields).toBeUndefined();
    expect(city.plaza).toEqual({ rect: { x: 1, z: 2, w: 20, d: 18 }, surface: "green" });
  });

  it("reports turned footprints as oriented boxes, not their bounding squares", () => {
    const city = generateCity(fixture);
    const [a] = city.buildings;
    // Two squares turned 45 degrees whose bounding boxes overlap but whose
    // footprints only meet at a corner gap.
    const side = 4;
    const diag = side * Math.SQRT2;
    const pair = {
      ...city,
      buildings: [
        { ...a, id: "p", position: [0, 0, 0] as [number, number, number], size: [side, 5, side] as [number, number, number], rotationY: Math.PI / 4 },
        { ...a, id: "q", position: [diag * 0.75, 0, diag * 0.75] as [number, number, number], size: [side, 5, side] as [number, number, number], rotationY: Math.PI / 4 },
      ],
    };
    expect(overlappingBuildings(pair)).toEqual([]);
    pair.buildings[1].position = [diag * 0.4, 0, 0];
    expect(overlappingBuildings(pair)).toEqual([["p", "q"]]);
  });

  it("keeps a turned house inside its turned cell", () => {
    const city = withExtras(() => generateCity(fixture));
    const plain = generateCity(fixture);
    for (const building of city.buildings.filter((b) => b.rotationY === 0.4)) {
      const before = plain.buildings.find((b) => b.id === building.id)!;
      // Same footprint as unturned; only the jitter's frame turned with the slot.
      expect(building.size).toEqual(before.size);
      const jitter = Math.hypot(
        building.position[0] - before.position[0],
        building.position[2] - before.position[2],
      );
      expect(jitter).toBeLessThan(4);
    }
  });
});
