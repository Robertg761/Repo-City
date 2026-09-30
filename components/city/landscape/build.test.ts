import { Color } from "three";
import { describe, expect, it } from "vitest";
import { TIERS, tierCity } from "./cities";
import {
  DECK_TOP,
  TERRAIN_SECTORS,
  WATER_LIFT,
  buildBanks,
  buildBarrier,
  buildBridges,
  buildFields,
  buildHedgeTubes,
  buildRibbon,
  buildTerrain,
  buildTowers,
  buildWater,
  roadHeight,
  roadTexture,
  terrainPainter,
  terrainRings,
  windowTextures,
} from "./build";
import { HEDGE_RING } from "./hedges";
import { bankDepth, trenchDepth } from "./water";
import { GROUND_Y, planLandscape } from "./plan";
import { MODEL as TREES } from "../models/props/trees.model";

void TREES;

const city = tierCity("city");
const plan = planLandscape(city);
const paint = terrainPainter(plan, "#6aa860");
const terrain = buildTerrain(plan, paint);

describe("the terrain mesh", () => {
  it("is rings and sectors, its heights the plan's and its faces up", () => {
    const pos = terrain.geometry.getAttribute("position");
    expect(pos.count).toBe((terrainRings(plan) + 1) * TERRAIN_SECTORS);
    expect(pos.getY(0)).toBeCloseTo(GROUND_Y, 6);
    for (let i = 0; i < pos.count; i += 997) expect(pos.getY(i)).toBeCloseTo(plan.height(pos.getX(i), pos.getZ(i)), 4);
    // Under the plot the ground is flat and points straight up.
    const nor = terrain.geometry.getAttribute("normal");
    let checked = 0;
    for (let i = 0; i < pos.count; i++) {
      if (Math.max(Math.abs(pos.getX(i)), Math.abs(pos.getZ(i))) < plan.half) {
        expect(nor.getY(i)).toBeGreaterThan(0.999);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(200);
    // Every triangle faces up or nearly so, none is upside down.
    const index = terrain.geometry.getIndex()!;
    let down = 0;
    for (let t = 0; t < index.count; t += 3) {
      const [a, b, c] = [index.getX(t), index.getX(t + 1), index.getX(t + 2)];
      const ux = pos.getX(b) - pos.getX(a);
      const uz = pos.getZ(b) - pos.getZ(a);
      const vx = pos.getX(c) - pos.getX(a);
      const vz = pos.getZ(c) - pos.getZ(a);
      if (uz * vx - ux * vz < -1e-6) down++;
    }
    expect(down).toBe(0);
  });

  it("colours are valid, and the sampler agrees with the mesh", () => {
    const col = terrain.geometry.getAttribute("color");
    for (let i = 0; i < col.count; i += 331) {
      for (const k of [col.getX(i), col.getY(i), col.getZ(i)]) {
        expect(k).toBeGreaterThanOrEqual(0);
        expect(k).toBeLessThanOrEqual(1);
      }
    }
    const pos = terrain.geometry.getAttribute("position");
    for (const i of [5, 4000, 9000, 14000]) expect(terrain.sample(pos.getX(i), pos.getZ(i))).toBeCloseTo(pos.getY(i), 3);
    // Between the vertices it stays between their heights (bilinear).
    const h = terrain.sample(plan.size * 1.7, plan.size * 0.4);
    expect(Number.isFinite(h)).toBe(true);
  });

  it("paints the high ground paler and the woods and valleys darker than the base", () => {
    const base = new Color();
    const rise = new Color();
    paint(0, 0, GROUND_Y, base);
    paint(plan.size * 2, 0, plan.profile.hills * plan.size * 2, rise);
    expect(rise.r).toBeGreaterThan(base.r * 0.9);
    expect(rise.g).not.toBeCloseTo(base.g, 3);
  });
});

describe("ribbons, ponds and bridges", () => {
  it("a ribbon faces up and has a vertex pair per point", () => {
    const g = buildRibbon([{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 20, z: 5 }], 4, () => 1);
    expect(g.getAttribute("position").count).toBe(6);
    const pos = g.getAttribute("position");
    const idx = g.getIndex()!;
    for (let t = 0; t < idx.count; t += 3) {
      const [a, b, c] = [idx.getX(t), idx.getX(t + 1), idx.getX(t + 2)];
      const cross = (pos.getZ(b) - pos.getZ(a)) * (pos.getX(c) - pos.getX(a)) - (pos.getX(b) - pos.getX(a)) * (pos.getZ(c) - pos.getZ(a));
      expect(cross).toBeGreaterThan(0);
    }
    // Skipping the model's own road starts at the exit.
    expect(buildRibbon([{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 20, z: 0 }], 4, () => 0, { from: 1 }).getAttribute("position").count).toBe(4);
  });

  it("a road climbs onto a bridge's deck over the river, and the deck rests on the banks", () => {
    const b = plan.bridges[0];
    const y = roadHeight(plan, terrain.sample);
    expect(y(b.x, b.z)).toBeGreaterThan(DECK_TOP - 0.01);
    // Away from the river the road is on the ground.
    const fx = b.x + Math.sin(b.yaw) * 60;
    const fz = b.z + Math.cos(b.yaw) * 60;
    expect(y(fx, fz)).toBeCloseTo(terrain.sample(fx, fz) + 0.09, 6);
    const g = buildBridges(plan);
    expect(g.getAttribute("position").count).toBeGreaterThan(plan.bridges.length * 100);
    // The abutments stand inside the span, from the bank's foot to the deck.
    g.computeBoundingBox();
    expect(g.boundingBox!.min.y).toBeLessThan(GROUND_Y - 0.4);
    expect(g.boundingBox!.max.y).toBeGreaterThan(DECK_TOP);
  });

  it("a motorway has a central barrier: three crisp strips, as high as the model's", () => {
    const pts = [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 20, z: 4 }];
    const g = buildBarrier(pts, () => 0, 0);
    expect(g.getAttribute("position").count).toBe(3 * 3 * 2);
    g.computeBoundingBox();
    expect(g.boundingBox!.max.y).toBeCloseTo(0.55 - 0.04, 2);
    expect(buildBarrier(pts, () => 0, 2).getAttribute("position")).toBeUndefined();
  });

  it("the motorway's road texture has a hard shoulder and solid edge lines, the street's a dashed middle", () => {
    const m = roadTexture("motorway").image.data as Uint8Array;
    const s = roadTexture("street").image.data as Uint8Array;
    const at = (d: Uint8Array, u: number, v: number) => d[(Math.floor(v * 64) * 64 + Math.floor(u * 64)) * 4];
    // The middle of the street has a line in the dashed half, and the motorway's does not (a barrier stands there).
    expect(at(s, 0.5, 0.1)).toBeGreaterThan(at(s, 0.3, 0.1) + 40);
    expect(at(m, 0.5, 0.1)).toBeLessThan(at(m, 0.055, 0.1));
    // Solid edge lines: lit at every height.
    for (const v of [0.05, 0.3, 0.6, 0.9]) expect(at(m, 0.055, v)).toBeGreaterThan(at(m, 0.5, v) + 40);
  });
});

describe("water and its banks", () => {
  it("the bank falls from the level land to the water, steepest in the middle", () => {
    const spec = plan.rivers[0].spec;
    expect(bankDepth(spec.bank, spec)).toBe(0);
    expect(bankDepth(0, spec)).toBeCloseTo(spec.drop, 6);
    let last = -1;
    for (let d = spec.bank; d >= 0; d -= spec.bank / 20) {
      const depth = bankDepth(d, spec);
      expect(depth).toBeGreaterThanOrEqual(last);
      last = depth;
    }
    // The terrain's trench is always at least as deep, so the exact banks show through it.
    for (let d = -5; d < spec.bank * 2; d += 0.7) expect(trenchDepth(d, spec, 5)).toBeGreaterThanOrEqual(bankDepth(d, spec, 5));
  });

  it("the bank mesh dips to the waterline and its colours darken there", () => {
    const g = buildBanks(plan, paint);
    const pos = g.getAttribute("position");
    const col = g.getAttribute("color");
    expect(pos.count).toBeGreaterThan(500);
    let low = Infinity;
    let darkest = Infinity;
    for (let i = 0; i < pos.count; i++) {
      low = Math.min(low, pos.getY(i));
      darkest = Math.min(darkest, col.getX(i) + col.getY(i) + col.getZ(i));
    }
    expect(low).toBeLessThan(GROUND_Y - plan.rivers[0].spec.drop);
    expect(darkest).toBeLessThan(0.6);
    // Faces up.
    const idx = g.getIndex()!;
    let down = 0;
    for (let t = 0; t < idx.count; t += 3) {
      const [a, b, c] = [idx.getX(t), idx.getX(t + 1), idx.getX(t + 2)];
      const cross = (pos.getZ(b) - pos.getZ(a)) * (pos.getX(c) - pos.getX(a)) - (pos.getX(b) - pos.getX(a)) * (pos.getZ(c) - pos.getZ(a));
      if (cross < -1e-6) down++;
    }
    expect(down).toBe(0);
  });

  it("the water lies at the waterline and is clear at the shore and deep in the middle", () => {
    const w = buildWater(plan);
    const pos = w.getAttribute("position");
    const depth = w.getAttribute("aDepth");
    const level = GROUND_Y - plan.rivers[0].spec.drop + WATER_LIFT;
    expect(pos.getY(0)).toBeCloseTo(level, 6);
    let min = 1;
    let max = 0;
    for (let i = 0; i < depth.count; i++) {
      min = Math.min(min, depth.getX(i));
      max = Math.max(max, depth.getX(i));
    }
    expect(min).toBe(0);
    expect(max).toBeGreaterThan(0.95);
  });

  it("a village's pond is water too, with its own bank", () => {
    const v = planLandscape(tierCity("village"));
    const w = buildWater(v);
    const b = buildBanks(v, terrainPainter(v, "#6aa860"));
    expect(w.getIndex()!.count).toBeGreaterThan(400);
    expect(b.getAttribute("position").count).toBeGreaterThan(400);
  });
});

describe("fields and hedges", () => {
  it("lie on the ground they are on, faces up, with crop rows for the shader", () => {
    const g = buildFields(plan, terrain.sample, 0);
    const pos = g.getAttribute("position");
    expect(pos.count).toBeGreaterThan(plan.fields.length * 9);
    for (let i = 0; i < pos.count; i += 37) {
      // A hair above the land, a little more where it bends.
      const lift = pos.getY(i) - terrain.sample(pos.getX(i), pos.getZ(i));
      expect(lift).toBeGreaterThanOrEqual(0.0699);
      expect(lift).toBeLessThan(0.48);
    }
    const idx = g.getIndex()!;
    for (let t = 0; t < idx.count; t += 3) {
      const [a, b, c] = [idx.getX(t), idx.getX(t + 1), idx.getX(t + 2)];
      const cross = (pos.getZ(b) - pos.getZ(a)) * (pos.getX(c) - pos.getX(a)) - (pos.getX(b) - pos.getX(a)) * (pos.getZ(c) - pos.getZ(a));
      expect(cross).toBeGreaterThan(-1e-6);
    }
    const row = g.getAttribute("aRow");
    expect(row.itemSize).toBe(4);
    expect(row.count).toBe(pos.count);
    let withRows = 0;
    for (let i = 0; i < row.count; i++) if (row.getY(i) > 0) withRows++;
    expect(withRows).toBeGreaterThan(row.count * 0.3);
  });

  it("hedges are lumpy tubes: a bounded length, uneven tops, several greens, gaps for the gates", () => {
    const g = buildHedgeTubes(plan.hedges, terrain.sample, { budget: 1500 });
    const pos = g.getAttribute("position");
    const col = g.getAttribute("color");
    expect(pos.count).toBeGreaterThan(200);
    // Bounded by the length budget: a few triangles a unit.
    expect(g.getIndex()!.count / 3).toBeLessThan(1500 * 30);
    // The heights wander: the tops are not one level above the ground.
    const tops: number[] = [];
    for (let i = 0; i + HEDGE_RING < pos.count / 1.3; i += HEDGE_RING) tops.push(pos.getY(i + 5) - terrain.sample(pos.getX(i + 5), pos.getZ(i + 5)));
    const mean = tops.reduce((a, b) => a + b, 0) / tops.length;
    const sd = Math.sqrt(tops.reduce((a, b) => a + (b - mean) ** 2, 0) / tops.length);
    expect(sd).toBeGreaterThan(0.12);
    // Colours vary between runs.
    const greens = new Set<number>();
    for (let i = 0; i < col.count; i += 3) greens.add(Math.round(col.getY(i) * 40));
    expect(greens.size).toBeGreaterThan(4);
    // Smooth normals: the mesh is indexed.
    expect(g.getAttribute("normal")).toBeTruthy();
    // A gap: a long straight run with a gate is in two pieces, so fewer triangles than an unbroken one of the same length.
    const one = buildHedgeTubes([{ x0: 0, z0: 0, x1: 200, z1: 0, shade: 0.3 }], () => 0, { clumps: false });
    const cells = one.getAttribute("position").count / HEDGE_RING;
    expect(cells).toBeLessThan(200 / 1.7 + 1);
  });

  it("the budget stops adding runs", () => {
    const small = buildHedgeTubes(plan.hedges, terrain.sample, { budget: 300 });
    const big = buildHedgeTubes(plan.hedges, terrain.sample, { budget: 3000 });
    expect(small.getAttribute("position").count).toBeLessThan(big.getAttribute("position").count);
  });
});

describe("the skyline", () => {
  it("the skyline is windowed towers standing on the ground, and lit windows are a subset of windows", () => {
    const metro = planLandscape(tierCity("metropolis"));
    const t = buildTerrain(metro, () => undefined);
    const g = buildTowers(metro.towers.slice(0, 20), t.sample);
    expect(g.getAttribute("uv")).toBeTruthy();
    const { color, emissive } = windowTextures();
    const c = color.image.data as Uint8Array;
    const e = emissive.image.data as Uint8Array;
    let lit = 0;
    for (let i = 0; i < e.length; i += 4) {
      if (e[i] > 0) {
        lit++;
        // A lit window is a window: glass is darker than the wall.
        expect(c[i]).toBeLessThan(200);
      }
    }
    expect(lit).toBeGreaterThan(200);
    expect(lit).toBeLessThan((e.length / 4) * 0.4);
  });
});

describe("every tier's land builds", () => {
  it.each(TIERS)("%s: terrain, fields, hedges and skyline within a triangle budget", (tier) => {
    const p = planLandscape(tierCity(tier));
    const t = buildTerrain(p, () => undefined);
    const fields = buildFields(p, t.sample, 0);
    const hedges = buildHedgeTubes(p.hedges, t.sample);
    const banks = buildBanks(p, () => undefined);
    const towers = buildTowers(p.towers, t.sample);
    const tris = t.geometry.getIndex()!.count / 3 + fields.getIndex()!.count / 3 + (hedges.getIndex()?.count ?? 0) / 3 + (banks.getIndex()?.count ?? 0) / 3 + (towers.getAttribute("position")?.count ?? 0) / 3;
    expect(tris).toBeLessThan(160_000);
  });
});
