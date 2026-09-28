/**
 * The street and rooftop leftovers modelled in Blender (`blender/street2/`,
 * drawn under the Blender models) held to the procedural models' own budgets
 * and contracts: the bus stop of `streetFurniture.test.ts`, the rooftop units
 * of `detail.test.ts` and the farmland of `farmland.test.ts`.
 */
import { describe, expect, it } from "vitest";
import { Euler, Matrix4, Quaternion, Vector3, type BufferGeometry } from "three";
import type { FieldPatch } from "@/types/city";
import { PAINT_ATTRIBUTE, triangleCount } from "./geometry";
import { blenderFurnitureGeometry, furnitureGeometry } from "./streetFurniture";
import { SURFACE, SURFACE_ATTRIBUTE } from "../../textures/surface-types";
import { blenderPropBlockGeometry, blenderPropTankGeometry, propBlockGeometry, propTankGeometry } from "../buildings/geometry";
import { CROP_ROWS, baleGeometry, blenderFarmGeometry, groundGeometry, hedgeGeometry, planFarmland, type Crop } from "../buildings/farmland";
import { coplanarOverlaps } from "../coplanar";
import { narrowLedges } from "../ledges";
import { LAYER } from "../buildings/mesh";

const bounds = (geometry: BufferGeometry) => {
  geometry.computeBoundingBox();
  return geometry.boundingBox!;
};

const CROPS = [0, 1, 2, 3] as const;

describe("Blender bus stop", () => {
  const stop = blenderFurnitureGeometry("stop", 0.2);

  it("stays inside streetFurniture.test.ts's budget, cached, with colours and surfaces", () => {
    expect(blenderFurnitureGeometry("stop", 0.2)).toBe(stop);
    expect(triangleCount(stop)).toBeLessThan(220);
    // Not a bench-sized budget spent on nothing: it has to beat the box shelter's silhouette.
    expect(triangleCount(stop)).toBeGreaterThan(triangleCount(furnitureGeometry("stop", 0.2)));
    expect(stop.getAttribute("color")).toBeDefined();
    const surface = stop.getAttribute(SURFACE_ATTRIBUTE);
    const kinds = new Set<number>();
    for (let i = 0; i < surface.count; i++) kinds.add(surface.getX(i));
    expect(kinds.has(SURFACE.glass)).toBe(true);
    expect(kinds.has(SURFACE.timber)).toBe(true);
    expect(kinds.has(SURFACE.metal)).toBe(true);
  });

  it("keeps the shelter's footprint and stands on the ground", () => {
    const ours = bounds(blenderFurnitureGeometry("stop", 0));
    const theirs = bounds(furnitureGeometry("stop", 0));
    expect(ours.min.y).toBeGreaterThanOrEqual(-0.03);
    expect(ours.min.y).toBeLessThan(0.02);
    for (const axis of ["x", "z"] as const) {
      const span = (b: typeof ours) => b.max[axis] - b.min[axis];
      expect(Math.abs(span(ours) - span(theirs))).toBeLessThan(0.3);
    }
    expect(Math.abs(ours.max.y - theirs.max.y)).toBeLessThan(0.3);
    // The canopy still runs to the same ends, so the placement margins hold.
    expect(ours.max.x).toBeGreaterThan(1.3);
    expect(ours.min.x).toBeLessThan(-1.3);
  });

  it("stands its posts where the procedural ones are, front and back on the same side", () => {
    // Every vertex within a hand of a post's axis reaches the ground: two posts.
    const position = stop.getAttribute("position");
    const feet = new Set<string>();
    for (let i = 0; i < position.count; i++) {
      if (position.getY(i) > 0.01) continue;
      const x = position.getX(i);
      if (Math.abs(Math.abs(x) - 1.1) < 0.1) feet.add(x < 0 ? "left" : "right");
    }
    expect([...feet].sort()).toEqual(["left", "right"]);
  });

  it("paints nothing: street furniture takes no instance colour", () => {
    const paint = stop.getAttribute(PAINT_ATTRIBUTE);
    for (let i = 0; i < paint.count; i++) expect(paint.getX(i)).toBe(0);
  });

  it("glazes the back with panes seen from both sides", () => {
    // Triangles facing +z and -z in the glass at the back wall.
    const position = stop.getAttribute("position");
    const surface = stop.getAttribute(SURFACE_ATTRIBUTE);
    const faces = new Set<number>();
    const a = new Vector3();
    const b = new Vector3();
    const c = new Vector3();
    for (let i = 0; i < position.count; i += 3) {
      if (surface.getX(i) !== SURFACE.glass) continue;
      a.fromBufferAttribute(position, i);
      b.fromBufferAttribute(position, i + 1);
      c.fromBufferAttribute(position, i + 2);
      const n = b.clone().sub(a).cross(c.clone().sub(a));
      if (Math.abs(n.z) > Math.abs(n.x) && Math.abs(n.z) > Math.abs(n.y)) faces.add(Math.sign(n.z));
    }
    expect(faces.has(1)).toBe(true);
    expect(faces.has(-1)).toBe(true);
  });
});

describe("Blender rooftop equipment", () => {
  for (const [name, blender, procedural, budget] of [
    ["block", blenderPropBlockGeometry, propBlockGeometry, 96],
    ["tank", blenderPropTankGeometry, propTankGeometry, 220],
  ] as const) {
    it(`${name} stays cached, compact and inside the unit box`, () => {
      const geometry = blender();
      expect(blender()).toBe(geometry);
      expect(triangleCount(geometry)).toBeLessThanOrEqual(budget);
      expect(triangleCount(geometry)).toBeGreaterThan(triangleCount(procedural()) * 0.6);
      const box = bounds(geometry);
      expect(Math.max(box.max.x, -box.min.x, box.max.z, -box.min.z)).toBeLessThanOrEqual(0.52);
      expect(box.min.y).toBeGreaterThanOrEqual(0);
      expect(box.min.y).toBeLessThan(0.01);
      expect(box.max.y).toBeLessThanOrEqual(1.03);
      // The instance stretches it to the same size as the procedural one.
      expect(box.max.y).toBeGreaterThan(0.9);
      expect(geometry.getAttribute(SURFACE_ATTRIBUTE)).toBeDefined();
      const color = geometry.getAttribute("color");
      for (let i = 0; i < color.count; i++) {
        expect(color.getX(i)).toBeLessThanOrEqual(1.0001);
        expect(color.getX(i)).toBeGreaterThan(0.05);
      }
    });

    it(`${name} has no flickering overlays or ledges`, () => {
      const geometry = blender();
      const positions = Array.from(geometry.getAttribute("position").array);
      const indices = Array.from({ length: positions.length / 3 }, (_, i) => i);
      const colors = geometry.getAttribute("color").array;
      const colorAt = (triangle: number) => Array.from(colors.slice(indices[triangle * 3] * 3, indices[triangle * 3] * 3 + 3)).map((v) => v.toFixed(2)).join("/");
      const fights = coplanarOverlaps(positions, indices, { within: LAYER * 0.9, minOverlap: 1e-6, buriedWithin: 0.03 })
        .filter((p) => colorAt(p.a) !== colorAt(p.b) && p.normal[1] > -0.99);
      expect(fights).toEqual([]);
      expect(narrowLedges(positions, indices, { narrowerThan: LAYER * 1.9, lowerThan: LAYER * 0.95 })).toEqual([]);
    });
  }

  it("louvres all four sides of the unit, blades that catch the light from above", () => {
    const position = blenderPropBlockGeometry().getAttribute("position");
    const sides = new Set<string>();
    const a = new Vector3();
    const b = new Vector3();
    const c = new Vector3();
    for (let i = 0; i < position.count; i += 3) {
      a.fromBufferAttribute(position, i);
      b.fromBufferAttribute(position, i + 1);
      c.fromBufferAttribute(position, i + 2);
      const n = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
      // A blade faces outward and up at a slant, out at the face of the unit.
      if (n.y > 0.3 && n.y < 0.95 && a.y < 0.7 && a.y > 0.1) {
        const at = a.clone().add(b).add(c).divideScalar(3);
        sides.add(Math.abs(at.x) > Math.abs(at.z) ? (at.x > 0 ? "+x" : "-x") : at.z > 0 ? "+z" : "-z");
      }
    }
    expect([...sides].sort()).toEqual(["+x", "+z", "-x", "-z"]);
  });

  it("puts a fan well on the roof of the unit, for an air-conditioner seen from above", () => {
    const position = blenderPropBlockGeometry().getAttribute("position");
    let onTop = 0;
    for (let i = 0; i < position.count; i++) {
      if (position.getY(i) > 0.99 && Math.hypot(position.getX(i), position.getZ(i)) < 0.32) onTop++;
    }
    expect(onTop).toBeGreaterThan(8);
  });

  it("stands the tank on four legs with the drum above them", () => {
    const position = blenderPropTankGeometry().getAttribute("position");
    const feet = new Set<string>();
    let drumBottom = Infinity;
    for (let i = 0; i < position.count; i++) {
      const y = position.getY(i);
      if (y < 0.02) feet.add(`${Math.sign(position.getX(i))}${Math.sign(position.getZ(i))}`);
      if (y > 0.1 && Math.hypot(position.getX(i), position.getZ(i)) > 0.455) drumBottom = Math.min(drumBottom, y);
    }
    expect(feet.size).toBe(4);
    // The drum's own wall starts well above the ground: legs are what it stands on.
    expect(drumBottom).toBeGreaterThan(0.28);
  });
});

describe("Blender farmland", () => {
  it("stays inside farmland.test.ts's budgets, cached", () => {
    for (const crop of CROPS) {
      const row = blenderFarmGeometry(`row:${crop}`);
      expect(blenderFarmGeometry(`row:${crop}`)).toBe(row);
      expect(triangleCount(row)).toBeLessThanOrEqual(24);
    }
    expect(triangleCount(blenderFarmGeometry("hedge"))).toBeLessThanOrEqual(24);
    expect(triangleCount(blenderFarmGeometry("bale"))).toBeLessThanOrEqual(64);
  });

  it("carries the foliage and thatch surfaces the procedural ones do", () => {
    const surfaces = (g: BufferGeometry) => new Set(Array.from({ length: g.getAttribute(SURFACE_ATTRIBUTE).count }, (_, i) => g.getAttribute(SURFACE_ATTRIBUTE).getX(i)));
    for (const [key, id] of [["hedge", SURFACE.foliage], ["bale", SURFACE.thatch], ["row:0", SURFACE.foliage], ["row:2", SURFACE.foliage]] as const) {
      expect([...surfaces(blenderFarmGeometry(key))]).toEqual([id]);
    }
  });

  it("keeps the crop rows in the unit box the instances stretch, standing on the ground", () => {
    for (const crop of CROPS) {
      const box = bounds(blenderFarmGeometry(`row:${crop}`));
      expect(box.min.x).toBeGreaterThanOrEqual(-0.5 - 1e-4);
      expect(box.max.x).toBeLessThanOrEqual(0.5 + 1e-4);
      // Runs the full unit length, so consecutive lengths meet the headland exactly.
      expect(box.max.x - box.min.x).toBeGreaterThan(0.999);
      expect(box.min.z).toBeGreaterThanOrEqual(-0.5 - 1e-4);
      expect(box.max.z).toBeLessThanOrEqual(0.5 + 1e-4);
      expect(box.min.y).toBeGreaterThanOrEqual(-1e-4);
      expect(box.min.y).toBeLessThan(1e-3);
      expect(box.max.y).toBeLessThanOrEqual(1 + 1e-4);
      expect(box.max.y).toBeGreaterThan(0.85);
    }
  });

  it("keeps the hedge a unit long along x with the procedural hedge's section", () => {
    const ours = bounds(blenderFarmGeometry("hedge"));
    const theirs = bounds(hedgeGeometry());
    expect(ours.min.x).toBeCloseTo(-0.5, 4);
    expect(ours.max.x).toBeCloseTo(0.5, 4);
    expect(ours.min.y).toBeCloseTo(0, 4);
    expect(ours.max.z - ours.min.z).toBeCloseTo(theirs.max.z - theirs.min.z, 2);
    expect(Math.abs(ours.max.y - theirs.max.y)).toBeLessThan(0.1);
  });

  it("lumps the hedge's top along its length", () => {
    const position = blenderFarmGeometry("hedge").getAttribute("position");
    const top = new Map<number, number>();
    for (let i = 0; i < position.count; i++) {
      const x = Math.round(position.getX(i) * 100) / 100;
      top.set(x, Math.max(top.get(x) ?? 0, position.getY(i)));
    }
    const heights = [...top.values()];
    expect(top.size).toBeGreaterThanOrEqual(3);
    expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThan(0.04);
  });

  it("lays the bale on its side on the ground, as wide as the procedural one", () => {
    const ours = bounds(blenderFarmGeometry("bale"));
    const theirs = bounds(baleGeometry());
    expect(ours.min.y).toBeGreaterThanOrEqual(-1e-4);
    expect(ours.min.y).toBeLessThan(0.01);
    // The axis is z: a bale is longer across its diameter than along its axis.
    expect(ours.max.z - ours.min.z).toBeCloseTo(0.9, 1);
    expect(ours.max.x - ours.min.x).toBeGreaterThan(1.0);
    expect(Math.abs(ours.max.y - theirs.max.y)).toBeLessThan(0.15);
    // Round: the ends are dished, the wrap is a different colour from the drum.
    const colors = blenderFarmGeometry("bale").getAttribute("color");
    const shades = new Set(Array.from({ length: colors.count }, (_, i) => colors.getX(i).toFixed(2)));
    expect(shades.size).toBeGreaterThan(3);
  });

  it("does not smear its occlusion along the stretch: a run is shaded the same at both ends", () => {
    // Baked on a representative run and squeezed to a unit: a vertex at the
    // start and one at the end of the same section carry (nearly) the same shade.
    for (const key of ["hedge", "row:0", "row:1", "row:2", "row:3"] as const) {
      const g = blenderFarmGeometry(key);
      const position = g.getAttribute("position");
      const color = g.getAttribute("color");
      const at = new Map<string, number[]>();
      for (let i = 0; i < position.count; i++) {
        const x = position.getX(i);
        if (Math.abs(Math.abs(x) - 0.5) > 1e-3) continue;
        const k = `${position.getZ(i).toFixed(2)},${position.getY(i).toFixed(2)}`;
        (at.get(k) ?? at.set(k, []).get(k)!).push(color.getX(i));
      }
      // Ends differ in height a little by design; the shade must not.
      let worst = 0;
      for (const list of at.values()) if (list.length > 1) worst = Math.max(worst, Math.max(...list) - Math.min(...list));
      expect(worst).toBeLessThan(0.25);
      // And it is shaded at all: a foot darker than the crown.
      const shade = Array.from({ length: color.count }, (_, i) => color.getX(i));
      expect(Math.max(...shade) - Math.min(...shade)).toBeGreaterThan(0.05);
      expect(Math.min(...shade)).toBeGreaterThan(0.3);
    }
  });
});

// The fields drawn as `Fields.tsx` lays them out, with the Blender geometry.
const field = (x: number, z: number, w: number, d: number, rotationY: number, crop: Crop): FieldPatch => ({ x, z, w, d, rotationY, crop });
const FIELDS: FieldPatch[] = [
  field(40, 0, 18, 12, 0.3, 0),
  field(-35, 20, 14, 20, -1.1, 1),
  field(0, -45, 22, 10, Math.PI / 2, 2),
  field(-20, -30, 16, 16, 2.4, 3),
];

function soup(fields: readonly FieldPatch[]) {
  const plan = planFarmland(fields);
  const out = { positions: [] as number[], indices: [] as number[], tags: [] as string[] };
  const add = (geometry: BufferGeometry, tag: string, at: [number, number, number], yaw: number, scale: [number, number, number]) => {
    const matrix = new Matrix4().compose(new Vector3(...at), new Quaternion().setFromEuler(new Euler(0, yaw, 0)), new Vector3(...scale));
    const pos = geometry.attributes.position;
    const base = out.positions.length / 3;
    const v = new Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(matrix);
      out.positions.push(v.x, v.y, v.z);
    }
    const idx = geometry.index;
    const count = idx ? idx.count : pos.count;
    for (let i = 0; i < count; i++) {
      out.indices.push(base + (idx ? idx.getX(i) : i));
      if (i % 3 === 0) out.tags.push(tag);
    }
  };
  plan.ground.forEach((g, i) => add(groundGeometry(), `ground ${i}`, [g.x, -0.012, g.z], g.yaw, [g.w, 1, g.d]));
  plan.rows.forEach((r, i) => {
    const spec = CROP_ROWS[r.crop];
    add(blenderFarmGeometry(`row:${r.crop}`), `row ${i}`, [r.x, 0.005, r.z], r.yaw, [r.length, spec.height, spec.width]);
  });
  plan.hedges.forEach((h, i) => add(blenderFarmGeometry("hedge"), `hedge ${i}`, [h.x, 0, h.z], h.yaw, [h.length, 0.85 + h.shade * 0.3, 1]));
  plan.bales.forEach((b, i) => {
    const s = 0.9 + b.size * 0.25;
    add(blenderFarmGeometry("bale"), `bale ${i}`, [b.x, 0, b.z], b.yaw, [s, s, s]);
  });
  return out;
}

describe("the Blender fields draw cleanly from the overview", () => {
  it("leave no sliver of ledge", () => {
    const s = soup(FIELDS);
    const found = narrowLedges(s.positions, s.indices, { narrowerThan: LAYER * 1.9, lowerThan: LAYER * 0.95 });
    expect(found.map((l) => `${l.width.toFixed(4)} wide, lip ${l.height.toFixed(4)}, at ${l.at.map((c) => c.toFixed(2)).join(",")}`)).toEqual([]);
  }, 60_000);

  it("have no two faces of different instances flickering through each other", () => {
    const s = soup(FIELDS);
    const fights = coplanarOverlaps(s.positions, s.indices, { within: LAYER * 2, minOverlap: 1e-5, buriedWithin: 0.05 })
      .filter((p) => s.tags[p.a] !== s.tags[p.b] && p.normal[1] > -0.99)
      .map((p) => `${s.tags[p.a]} vs ${s.tags[p.b]} ${p.separation.toFixed(4)} apart at ${p.at.map((c) => c.toFixed(2)).join(",")}`);
    expect(fights).toEqual([]);
  }, 60_000);
});

