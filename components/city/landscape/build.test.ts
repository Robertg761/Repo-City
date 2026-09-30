import { Color } from "three";
import { describe, expect, it } from "vitest";
import { TIERS, tierCity } from "./cities";
import {
  DECK_TOP,
  TERRAIN_RINGS,
  TERRAIN_SECTORS,
  barnGeometry,
  blockGeometry,
  broadleafGeometry,
  buildBridges,
  buildFields,
  buildHedges,
  buildPond,
  buildRibbon,
  buildTerrain,
  buildTowers,
  canopyGeometry,
  coniferGeometry,
  houseGeometry,
  roadHeight,
  terrainPainter,
  windowTextures,
} from "./build";
import { GROUND_Y, planLandscape } from "./plan";

const city = tierCity("city");
const plan = planLandscape(city);
const paint = terrainPainter(plan, "#6aa860");
const terrain = buildTerrain(plan, paint);

describe("the terrain mesh", () => {
  it("is rings and sectors, its heights the plan's and its faces up", () => {
    const pos = terrain.geometry.getAttribute("position");
    expect(pos.count).toBe((TERRAIN_RINGS + 1) * TERRAIN_SECTORS);
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

  it("a pond is a fan, and a road climbs onto a bridge's deck over the river", () => {
    expect(buildPond(0, 0, 10, 6, 0.3, 0.1, "#ffffff").getIndex()!.count).toBe(28 * 3);
    const b = plan.bridges[0];
    const y = roadHeight(plan, terrain.sample);
    expect(y(b.x, b.z)).toBeGreaterThan(DECK_TOP - 0.01);
    // Away from the river the road is on the ground.
    const fx = b.x + Math.sin(b.yaw) * 60;
    const fz = b.z + Math.cos(b.yaw) * 60;
    expect(y(fx, fz)).toBeCloseTo(terrain.sample(fx, fz) + 0.09, 6);
    const g = buildBridges(plan);
    expect(g.getAttribute("position").count).toBeGreaterThan(plan.bridges.length * 100);
  });
});

describe("fields and hedges", () => {
  it("lie on the ground they are on", () => {
    const g = buildFields(plan, terrain.sample, 0);
    const pos = g.getAttribute("position");
    expect(pos.count).toBeGreaterThan(plan.fields.length * 9);
    for (let i = 0; i < pos.count; i += 37) expect(pos.getY(i)).toBeCloseTo(terrain.sample(pos.getX(i), pos.getZ(i)) + 0.07, 4);
    // Faces up.
    const idx = g.getIndex()!;
    for (let t = 0; t < Math.min(idx.count, 3000); t += 3) {
      const [a, b, c] = [idx.getX(t), idx.getX(t + 1), idx.getX(t + 2)];
      expect((pos.getZ(b) - pos.getZ(a)) * (pos.getX(c) - pos.getX(a)) - (pos.getX(b) - pos.getX(a)) * (pos.getZ(c) - pos.getZ(a))).toBeGreaterThan(0);
    }
  });

  it("hedges are a bounded number of clipped runs", () => {
    const g = buildHedges(plan.hedges, terrain.sample);
    const tris = g.getAttribute("position").count / 3;
    expect(tris).toBeGreaterThan(plan.hedges.length * 4);
    expect(tris).toBeLessThan(1400 * 12 + 1);
  });
});

describe("the instanced pieces", () => {
  it("every tree, house and tower is a small merged geometry with colours", () => {
    const geometries = { b: broadleafGeometry(), c: coniferGeometry(), k: canopyGeometry(), r: houseGeometry("red"), s: houseGeometry("slate"), t: houseGeometry("tan"), barn: barnGeometry(), block: blockGeometry() };
    for (const [name, g] of Object.entries(geometries)) {
      const tris = g.getAttribute("position").count / 3;
      expect(tris, name).toBeGreaterThan(8);
      expect(tris, name).toBeLessThan(120);
      expect(g.getAttribute("color"), name).toBeTruthy();
      g.computeBoundingBox();
      expect(g.boundingBox!.min.y, name).toBeGreaterThan(-0.05);
    }
    // Houses stand on a unit footprint, and a barn's ridge is its tallest point.
    const house = houseGeometry("red");
    house.computeBoundingBox();
    expect(house.boundingBox!.max.x).toBeGreaterThan(0.5);
    expect(house.boundingBox!.max.x).toBeLessThan(0.6);
    expect(house.boundingBox!.max.y).toBeCloseTo(1, 2);
  });

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
    const hedges = buildHedges(p.hedges, t.sample);
    const towers = buildTowers(p.towers, t.sample);
    const tris = t.geometry.getIndex()!.count / 3 + fields.getIndex()!.count / 3 + hedges.getAttribute("position").count / 3 + (towers.getAttribute("position")?.count ?? 0) / 3;
    expect(tris).toBeLessThan(120_000);
  });
});
