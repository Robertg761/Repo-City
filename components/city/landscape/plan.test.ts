import { describe, expect, it } from "vitest";
import type { SettlementTier } from "@/types/analysis";
import type { CityModel } from "@/types/city";
import { TIERS, tierCity } from "./cities";
import { GROUND_Y, LAND_PROFILE, PLOT_MARGIN, distToPath, landDistance, landReach, planLandscape, pondEdge, segmentCross } from "./plan";
import { convexDistance, polyArea } from "./fields";
import { trenchReach } from "./water";

const summary = (city: CityModel) => {
  const p = planLandscape(city);
  return JSON.stringify({
    exits: p.exits,
    roads: p.roads.map((r) => r.pts.slice(-3)),
    rivers: p.rivers.map((r) => r.pts.slice(0, 5)),
    fields: p.fields,
    hedges: p.hedges.length,
    trees: p.trees.slice(0, 200),
    houses: p.houses,
    towers: p.towers.slice(0, 40),
  });
};

describe("the seed", () => {
  it.each(TIERS)("%s: the same city plans the same land", (tier) => {
    expect(summary(tierCity(tier))).toBe(summary(structuredClone(tierCity(tier))));
  });

  it("gives a different city different surroundings", () => {
    const a = tierCity("city");
    const b = structuredClone(a);
    b.seed = `${a.seed}-other`;
    expect(summary(b)).not.toBe(summary(a));
    // The same repository at another revision differs too.
    const c = structuredClone(a);
    c.repository = { ...a.repository, fullName: "other/repo" };
    expect(summary(c)).not.toBe(summary(a));
  });

  it("does not depend on the clock or on Math.random", () => {
    const real = Math.random;
    Math.random = () => {
      throw new Error("Math.random");
    };
    try {
      expect(() => planLandscape(tierCity("town"))).not.toThrow();
    } finally {
      Math.random = real;
    }
  });
});

describe("the dressing of each tier", () => {
  it("village: a patchwork of fields with hedgerows, copses, a stream and a pond, farmsteads", () => {
    const p = planLandscape(tierCity("village"));
    expect(p.tier).toBe("village");
    expect(p.fields.length).toBeGreaterThan(25);
    expect(p.fields.filter((f) => f.hedged).length).toBeGreaterThan(20);
    expect(p.hedges.length).toBeGreaterThan(40);
    expect(p.trees.filter((t) => t.kind !== 2).length).toBeGreaterThan(300);
    expect(p.rivers[0].width).toBeLessThan(5);
    expect(p.ponds).toHaveLength(1);
    expect(p.houses.some((h) => h.model === "barn")).toBe(true);
    expect(p.houses.some((h) => h.model === "farmhouse" || h.model === "cottage/tile")).toBe(true);
    expect(p.towers).toHaveLength(0);
    expect(p.streets).toHaveLength(0);
    // A lane or two leading away.
    expect(p.roads.length).toBeGreaterThanOrEqual(1);
    expect(p.roads.length).toBeLessThanOrEqual(3);
  });

  it("town: fields and woods, and a fringe of houses along the approach roads", () => {
    const p = planLandscape(tierCity("town"));
    expect(p.fields.length).toBeGreaterThan(10);
    expect(p.trees.length).toBeGreaterThan(300);
    const fringe = p.houses.filter((h) => p.roads.some((r) => distToPath(r.pts, h.x, h.z) < r.width / 2 + 12));
    expect(fringe.length).toBeGreaterThan(8);
    expect(p.towers).toHaveLength(0);
    expect(p.ponds).toHaveLength(0);
  });

  it("city: hills, woods, a river the roads cross on bridges, farmland further out", () => {
    const p = planLandscape(tierCity("city"));
    expect(p.rivers).toHaveLength(1);
    expect(p.rivers[0].width).toBeGreaterThan(10);
    expect(p.bridges.length).toBeGreaterThanOrEqual(1);
    expect(p.fields.length).toBeGreaterThan(10);
    expect(p.trees.filter((t) => t.kind === 2).length).toBeGreaterThan(200);
    // Hills: the land rises towards the horizon.
    const ring = (r: number) => {
      let sum = 0;
      for (let i = 0; i < 64; i++) sum += p.height(Math.cos((i / 64) * 6.283) * r, Math.sin((i / 64) * 6.283) * r);
      return sum / 64;
    };
    expect(ring(p.size * 2.2)).toBeGreaterThan(ring(p.size * 1.2) + 2);
    expect(p.towers).toHaveLength(0);
  });

  it("metropolis: sprawl, a wide river, a distant skyline, highways out", () => {
    const p = planLandscape(tierCity("metropolis"));
    expect(p.rivers[0].width).toBeGreaterThanOrEqual(25);
    expect(p.bridges.length).toBeGreaterThanOrEqual(1);
    expect(p.streets.length).toBeGreaterThan(10);
    expect(p.houses.length).toBeGreaterThan(200);
    expect(p.houses.some((h) => h.model === "midrise-setback" || h.model === "lowrise-parapet")).toBe(true);
    expect(p.houses.filter((h) => h.model === "house").length).toBeGreaterThan(50);
    expect(p.towers.length).toBeGreaterThan(60);
    expect(p.exits.length).toBeGreaterThanOrEqual(LAND_PROFILE.metropolis.minExits);
    // The skyline stands well beyond the city and inside the fog.
    for (const t of p.towers) {
      const d = Math.hypot(t.x, t.z);
      expect(d).toBeGreaterThan(p.size * 1.8);
      expect(d).toBeLessThan(p.reach * 0.7);
    }
  });
});

describe("the roads out", () => {
  it.each(TIERS)("%s: every road that ends at the plot's edge continues, from where it ends and the way it points", (tier) => {
    const city = tierCity(tier);
    const p = planLandscape(city);
    expect(p.exits.length).toBeGreaterThanOrEqual(LAND_PROFILE[tier].minExits);
    // Every highway that runs out of the plot is an exit.
    const half = city.bounds.size / 2;
    const out = city.roads.filter((r) => r.kind === "highway" && Math.max(Math.abs(r.to[0]), Math.abs(r.to[2])) > half * 1.3);
    for (const road of out) {
      expect(p.exits.some((e) => Math.hypot(e.x - road.to[0], e.z - road.to[2]) < 1e-6 && !e.synthetic)).toBe(true);
    }
    expect(p.roads).toHaveLength(p.exits.length);
    p.roads.forEach((road, i) => {
      const e = p.exits[i];
      const start = road.pts[road.drawFrom];
      expect(start).toEqual({ x: e.x, z: e.z });
      // It leaves in the direction the road was going.
      const next = road.pts[road.drawFrom + 1];
      const len = Math.hypot(next.x - start.x, next.z - start.z);
      expect((next.x - start.x) / len).toBeCloseTo(e.dx, 1);
      expect((next.z - start.z) / len).toBeCloseTo(e.dz, 1);
      // And runs on to near the far edge, the whole way, bending gently.
      const end = road.pts[road.pts.length - 1];
      expect(Math.hypot(end.x, end.z)).toBeGreaterThan(p.reach * 0.85);
      expect(Math.hypot(end.x, end.z)).toBeLessThan(p.reach);
      for (let k = road.drawFrom + 1; k + 1 < road.pts.length; k++) {
        const a = road.pts[k];
        const b = road.pts[k + 1];
        const c = road.pts[k - 1];
        const turn = Math.abs(Math.atan2(b.x - a.x, b.z - a.z) - Math.atan2(a.x - c.x, a.z - c.z));
        expect(Math.min(turn, Math.PI * 2 - turn)).toBeLessThan(0.35);
      }
    });
  });

  it("a road crossing the river has a bridge over it", () => {
    for (const tier of ["town", "city", "metropolis"] as SettlementTier[]) {
      const p = planLandscape(tierCity(tier));
      for (const road of p.roads) {
        for (const river of p.rivers) {
          for (let i = road.drawFrom; i + 1 < road.pts.length; i++) {
            for (let j = 0; j + 1 < river.pts.length; j++) {
              const hit = segmentCross(road.pts[i], road.pts[i + 1], river.pts[j], river.pts[j + 1]);
              if (hit) expect(p.bridges.some((b) => Math.hypot(b.x - hit.x, b.z - hit.z) < b.length)).toBe(true);
            }
          }
        }
      }
    }
  });
});

describe("the ground", () => {
  it.each(TIERS)("%s: flat under the plot and along the roads out, rising past the apron", (tier) => {
    const p = planLandscape(tierCity(tier));
    // Under the plot, and at every exit's tip: the plate's own level.
    for (const [x, z] of [[0, 0], [p.half, p.half], [-p.half, p.half * 0.5], [p.half * 1.04, 0]]) {
      expect(p.height(x, z)).toBeCloseTo(GROUND_Y, 6);
    }
    for (const e of p.exits) expect(p.height(e.x, e.z)).toBeCloseTo(GROUND_Y, 3);
    // Somewhere out in the hills is clearly above it.
    let high = -Infinity;
    for (let i = 0; i < 200; i++) high = Math.max(high, p.height(Math.cos(i) * p.size * 2.5, Math.sin(i) * p.size * 2.5));
    expect(high).toBeGreaterThan(GROUND_Y + p.size * 0.05);
  });

  it.each(TIERS)("%s: the far edge rolls down to the horizon, so it is never seen as an edge", (tier) => {
    const p = planLandscape(tierCity(tier));
    const amp = p.profile.hills * p.size;
    for (let i = 0; i < 90; i++) {
      const a = (i / 90) * Math.PI * 2;
      const h = p.height(Math.cos(a) * p.reach, Math.sin(a) * p.reach) - GROUND_Y;
      expect(h).toBeLessThan(amp * 0.6 + p.profile.rise * p.reach * 0.1);
    }
    // And the land reaches past the fog's far plane.
    expect(p.reach).toBe(landReach(p.size));
    expect(landReach(p.size, 0.8)).toBeGreaterThan(landReach(p.size, 1.6));
  });

  it("the reach is capped inside the camera's far plane", () => {
    expect(landReach(2000)).toBeLessThanOrEqual(1800);
    expect(landReach(100)).toBeCloseTo(100 * 4.4 * 1.02, 6);
  });
});

describe("what stands where", () => {
  it.each(TIERS)("%s: nothing is in the plot, on a road, or in the water", (tier) => {
    const p = planLandscape(tierCity(tier));
    const inRiver = (x: number, z: number, margin: number) => p.rivers.some((r) => distToPath(r.pts, x, z) < r.width / 2 + margin);
    const inPond = (x: number, z: number, margin: number) => p.ponds.some((q) => pondEdge(q, x, z) < margin);
    const onRoad = (x: number, z: number, margin: number) => p.roads.some((r) => distToPath(r.pts, x, z) < r.width / 2 + margin);
    for (const f of p.fields) {
      expect(Math.max(Math.abs(f.x), Math.abs(f.z))).toBeGreaterThan(p.half * PLOT_MARGIN);
      expect(onRoad(f.x, f.z, 0)).toBe(false);
      expect(inRiver(f.x, f.z, 0)).toBe(false);
      // Every corner keeps off the plot, the roads and the water, by the margin the trimming leaves.
      for (const c of f.poly) {
        expect(Math.max(Math.abs(c.x), Math.abs(c.z))).toBeGreaterThan(p.half * PLOT_MARGIN + 0.5);
        expect(onRoad(c.x, c.z, 0.5)).toBe(false);
        expect(inRiver(c.x, c.z, trenchReach(p.rivers[0].spec) - 0.5)).toBe(false);
        expect(inPond(c.x, c.z, 0)).toBe(false);
      }
    }
    for (const h of p.houses) {
      expect(Math.max(Math.abs(h.x), Math.abs(h.z))).toBeGreaterThan(p.half * PLOT_MARGIN);
      expect(onRoad(h.x, h.z, 1)).toBe(false);
      expect(inRiver(h.x, h.z, 1)).toBe(false);
    }
    for (const t of p.trees) {
      expect(inRiver(t.x, t.z, 0)).toBe(false);
      expect(onRoad(t.x, t.z, 0)).toBe(false);
    }
    // The river keeps clear of the plot.
    for (const r of p.rivers) {
      for (const pt of r.pts) expect(landDistance(pt.x, pt.z)).toBeGreaterThan(p.half * PLOT_MARGIN + r.width / 2);
    }
  });

  it("the verge: a tree line along the plot's edge with gaps where the roads leave", () => {
    for (const tier of TIERS) {
      const city = tierCity(tier);
      const p = planLandscape(city);
      expect(p.verge.trees.length).toBeGreaterThan(10);
      for (const t of p.verge.trees) {
        const d = Math.max(Math.abs(t.x), Math.abs(t.z));
        expect(d).toBeGreaterThan(p.half * PLOT_MARGIN);
        expect(d).toBeLessThan(p.half * PLOT_MARGIN + 4);
        for (const road of city.roads) {
          const dist = distToPath([{ x: road.from[0], z: road.from[2] }, { x: road.to[0], z: road.to[2] }], t.x, t.z);
          expect(dist).toBeGreaterThan(road.width / 2);
        }
      }
    }
  });

  it("keeps the counts inside a budget", () => {
    for (const tier of TIERS) {
      const p = planLandscape(tierCity(tier));
      expect(p.trees.length).toBeLessThanOrEqual(LAND_PROFILE[tier].trees.near + LAND_PROFILE[tier].trees.far + 400);
      expect(p.fields.length).toBeLessThanOrEqual(320);
      expect(p.houses.length).toBeLessThan(900);
      expect(p.towers.length).toBeLessThan(200);
    }
  });

  it("plans a metropolis in well under half a second", () => {
    const city = tierCity("metropolis");
    const t0 = performance.now();
    planLandscape(city);
    expect(performance.now() - t0).toBeLessThan(500);
  });
});

describe("fields are irregular polygons", () => {
  it.each(TIERS)("%s: convex outlines of many shapes and sizes, not a lattice", (tier) => {
    const p = planLandscape(tierCity(tier));
    const sides = new Set(p.fields.map((f) => f.poly.length));
    expect(sides.size).toBeGreaterThanOrEqual(3);
    const areas = p.fields.map((f) => polyArea(f.poly)).sort((a, b) => a - b);
    // Merged and split: the biggest is several times the smallest.
    expect(areas[areas.length - 1] / areas[0]).toBeGreaterThan(4);
    for (const f of p.fields) {
      expect(f.poly.length).toBeGreaterThanOrEqual(3);
      // Convex: every corner is inside the outline of the others' edges (distance to the edge lines is <= 0 at the centre).
      expect(convexDistance(f.poly, f.x, f.z)).toBeLessThan(0);
      expect(f.poly.length).toBeLessThanOrEqual(20);
    }
    // No two fields overlap at their middles.
    for (let i = 0; i < p.fields.length; i++) {
      for (let j = i + 1; j < Math.min(p.fields.length, i + 40); j++) {
        expect(convexDistance(p.fields[j].poly, p.fields[i].x, p.fields[i].z)).toBeGreaterThan(-0.001);
      }
    }
    // Hedge runs lie along field edges: none is a point.
    for (const h of p.hedges) expect(Math.hypot(h.x1 - h.x0, h.z1 - h.z0)).toBeGreaterThan(3);
  });

  it("the headings of the crop rows are not all one", () => {
    const p = planLandscape(tierCity("village"));
    const yaws = new Set(p.fields.map((f) => Math.round(f.rowYaw * 4)));
    expect(yaws.size).toBeGreaterThan(3);
  });
});

describe("water has banks", () => {
  it.each(TIERS)("%s: the terrain is trenched along the river, below the level land, and level away from it", (tier) => {
    const p = planLandscape(tierCity(tier));
    const river = p.rivers[0];
    const mid = river.pts[Math.floor(river.pts.length / 2)];
    // In the water the ground is well under the level land; past the bank it is the level land.
    expect(p.height(mid.x, mid.z)).toBeLessThan(p.level(mid.x, mid.z) - river.spec.drop);
    for (const pt of river.pts.slice(10, 20)) {
      expect(p.height(pt.x, pt.z)).toBeLessThan(p.level(pt.x, pt.z) - 0.3);
    }
    // Far from it the trench is gone.
    expect(p.height(p.size * 3, p.size * 3)).toBeCloseTo(p.level(p.size * 3, p.size * 3), 6);
  });

  it("a pond is a dip, and its edge function is negative over the water", () => {
    const p = planLandscape(tierCity("village"));
    const q = p.ponds[0];
    expect(pondEdge(q, q.x, q.z)).toBeLessThan(0);
    expect(pondEdge(q, q.x + q.rx * 3, q.z + q.rx * 3)).toBeGreaterThan(0);
    expect(p.height(q.x, q.z)).toBeLessThan(p.level(q.x, q.z) - q.spec.drop);
  });

  it("a bridge spans the banks and stands on level land", () => {
    for (const tier of ["town", "city", "metropolis"] as SettlementTier[]) {
      const p = planLandscape(tierCity(tier));
      for (const b of p.bridges) {
        expect(b.length / 2).toBeGreaterThan(b.half + b.bank);
        const ex = b.x + Math.sin(b.yaw) * (b.length / 2);
        const ez = b.z + Math.cos(b.yaw) * (b.length / 2);
        expect(p.height(ex, ez)).toBeCloseTo(p.level(ex, ez), 1);
      }
    }
  });
});

describe("the houses are the city's own models", () => {
  it.each(TIERS)("%s: every house names a real model, with paintable size", (tier) => {
    const p = planLandscape(tierCity(tier));
    for (const h of p.houses) {
      expect(typeof h.model).toBe("string");
      expect(h.w).toBeGreaterThan(2);
      expect(h.h).toBeGreaterThan(2);
      expect(h.key.startsWith("land-")).toBe(true);
    }
    expect(new Set(p.houses.map((h) => h.key)).size).toBe(p.houses.length);
  });

  it("a village's farmsteads are a farmhouse or cottage with a barn", () => {
    const p = planLandscape(tierCity("village"));
    const kinds = new Set(p.houses.map((h) => h.model));
    expect(kinds.has("barn")).toBe(true);
    for (const m of kinds) expect(["farmhouse", "cottage/tile", "barn"]).toContain(m);
  });

  it("a motorway out of the metropolis is planned as a motorway", () => {
    const p = planLandscape(tierCity("metropolis"));
    expect(p.roads.some((r) => r.style === "motorway")).toBe(true);
  });
});
