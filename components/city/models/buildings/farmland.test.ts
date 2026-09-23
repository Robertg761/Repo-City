import { describe, expect, it } from "vitest";
import { Euler, Matrix4, Quaternion, Vector3, type BufferGeometry } from "three";
import type { FieldPatch } from "@/types/city";
import { coplanarOverlaps } from "../coplanar";
import { narrowLedges } from "../ledges";
import { LAYER } from "./mesh";
import {
  CROP_ROWS,
  GATE_WIDTH,
  HEADLAND,
  HEDGE_INSET,
  HEDGE_OVERRUN,
  ROW_CAP,
  baleGeometry,
  groundGeometry,
  hedgeGeometry,
  planFarmland,
  rowGeometry,
  type Crop,
} from "./farmland";
import { triangleCount } from "../props/geometry";

const field = (x: number, z: number, w: number, d: number, rotationY: number, crop: Crop): FieldPatch => ({
  x,
  z,
  w,
  d,
  rotationY,
  crop,
});

const FIELDS: FieldPatch[] = [
  field(40, 0, 18, 12, 0.3, 0),
  field(-35, 20, 14, 20, -1.1, 1),
  field(0, -45, 22, 10, Math.PI / 2, 2),
  field(-20, -30, 16, 16, 2.4, 3),
];

/** A world point in the field's own frame (the inverse of the planner's `toWorld`). */
function local(f: FieldPatch, x: number, z: number): [number, number] {
  const dx = x - f.x;
  const dz = z - f.z;
  const c = Math.cos(f.rotationY);
  const s = Math.sin(f.rotationY);
  return [dx * c - dz * s, dx * s + dz * c];
}

describe("planFarmland (PLAN.md 76.5, village step 7)", () => {
  it("draws nothing for a model without fields", () => {
    expect(planFarmland([])).toEqual({ ground: [], rows: [], hedges: [], bales: [], trees: [] });
  });

  it("is deterministic", () => {
    expect(planFarmland(FIELDS)).toEqual(planFarmland(FIELDS.map((f) => ({ ...f }))));
  });

  it("gives every field its ground, rows and a hedge", () => {
    const plan = planFarmland(FIELDS);
    expect(plan.ground).toHaveLength(FIELDS.length);
    for (const crop of [0, 1, 2, 3] as const) expect(plan.rows.some((r) => r.crop === crop)).toBe(true);
    expect(plan.hedges.length).toBeGreaterThanOrEqual(FIELDS.length * 4);
    expect(plan.trees.length).toBeGreaterThanOrEqual(FIELDS.length);
  });

  it("keeps every row inside the headland of its own field", () => {
    const plan = planFarmland(FIELDS);
    for (const row of plan.rows) {
      const f = FIELDS.find((candidate) => {
        const [lx, lz] = local(candidate, row.x, row.z);
        return Math.abs(lx) <= candidate.w / 2 && Math.abs(lz) <= candidate.d / 2;
      });
      expect(f).toBeDefined();
      const [lx, lz] = local(f!, row.x, row.z);
      const alongX = f!.w >= f!.d;
      const long = alongX ? f!.w : f!.d;
      expect(row.length).toBeCloseTo(long - HEADLAND * 2);
      // The row's own ends, in the field frame.
      const half = row.length / 2;
      const across = alongX ? lz : lx;
      const short = alongX ? f!.d : f!.w;
      expect(Math.abs(across) + CROP_ROWS[row.crop].width / 2).toBeLessThanOrEqual(short / 2 - HEADLAND + CROP_ROWS[row.crop].width / 2 + 1e-6);
      expect(Math.abs(alongX ? lx : lz) + half).toBeLessThanOrEqual(long / 2 + 1e-6);
    }
  });

  it("leaves one gateway in each hedge and keeps the hedge on the field", () => {
    for (const f of FIELDS) {
      const plan = planFarmland([f]);
      // Four sides, one of them in two pieces.
      expect(plan.hedges).toHaveLength(5);
      const perimeter = plan.hedges.reduce((sum, h) => sum + h.length, 0);
      const inset = HEDGE_INSET;
      const full = 2 * (f.w - 2 * inset) + 2 * (f.d - 2 * inset) + 4 * HEDGE_OVERRUN;
      expect(perimeter).toBeCloseTo(full - GATE_WIDTH, 5);
      for (const h of plan.hedges) {
        const [lx, lz] = local(f, h.x, h.z);
        expect(Math.abs(lx)).toBeLessThanOrEqual(f.w / 2);
        expect(Math.abs(lz)).toBeLessThanOrEqual(f.d / 2);
      }
    }
  });

  it("lays bales only in hay meadows", () => {
    const plan = planFarmland(FIELDS);
    expect(plan.bales.length).toBeGreaterThan(0);
    const meadow = FIELDS[3];
    for (const bale of plan.bales) {
      const [lx, lz] = local(meadow, bale.x, bale.z);
      expect(Math.abs(lx)).toBeLessThan(meadow.w / 2);
      expect(Math.abs(lz)).toBeLessThan(meadow.d / 2);
    }
  });

  it("skips degenerate fields and caps the rows", () => {
    expect(planFarmland([field(0, 0, 0, 10, 0, 0), field(0, 0, 10, -2, 0, 1)]).ground).toHaveLength(0);
    // A tiny field keeps its ground and hedge but has no room for rows.
    const tiny = planFarmland([field(0, 0, 2, 2, 0, 0)]);
    expect(tiny.ground).toHaveLength(1);
    expect(tiny.rows).toHaveLength(0);
    const huge = Array.from({ length: 200 }, (_, i) => field(i * 30, 0, 22, 22, 0, 1));
    expect(planFarmland(huge).rows.length).toBeLessThanOrEqual(ROW_CAP);
  });

  it("builds small, cached geometry", () => {
    expect(groundGeometry()).toBe(groundGeometry());
    for (const crop of [0, 1, 2, 3] as const) {
      expect(rowGeometry(crop)).toBe(rowGeometry(crop));
      expect(triangleCount(rowGeometry(crop))).toBeLessThanOrEqual(24);
    }
    expect(triangleCount(hedgeGeometry())).toBeLessThanOrEqual(24);
    expect(triangleCount(baleGeometry())).toBeLessThanOrEqual(64);
  });
});

/**
 * The fields as `Fields.tsx` lays them out: the ground a little sunk, the
 * rows just above it, the hedges and bales on the ground, each instance
 * turned and stretched by its own matrix. One soup, every triangle tagged
 * with the instance it belongs to (each hedge is its own shade of green).
 */
function fieldSoup(fields: readonly FieldPatch[]): { positions: number[]; indices: number[]; tags: string[] } {
  const plan = planFarmland(fields);
  const soup = { positions: [] as number[], indices: [] as number[], tags: [] as string[] };
  const add = (geometry: BufferGeometry, tag: string, at: [number, number, number], yaw: number, scale: [number, number, number]) => {
    const matrix = new Matrix4().compose(new Vector3(...at), new Quaternion().setFromEuler(new Euler(0, yaw, 0)), new Vector3(...scale));
    const pos = geometry.attributes.position;
    const base = soup.positions.length / 3;
    const v = new Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(matrix);
      soup.positions.push(v.x, v.y, v.z);
    }
    const idx = geometry.index;
    const count = idx ? idx.count : pos.count;
    for (let i = 0; i < count; i++) {
      soup.indices.push(base + (idx ? idx.getX(i) : i));
      if (i % 3 === 0) soup.tags.push(tag);
    }
  };
  plan.ground.forEach((g, i) => add(groundGeometry(), `ground ${i}`, [g.x, -0.012, g.z], g.yaw, [g.w, 1, g.d]));
  plan.rows.forEach((r, i) => {
    const spec = CROP_ROWS[r.crop];
    add(rowGeometry(r.crop), `row ${i}`, [r.x, 0.005, r.z], r.yaw, [r.length, spec.height, spec.width]);
  });
  plan.hedges.forEach((h, i) => add(hedgeGeometry(), `hedge ${i}`, [h.x, 0, h.z], h.yaw, [h.length, 0.85 + h.shade * 0.3, 1]));
  plan.bales.forEach((b, i) => {
    const s = 0.9 + b.size * 0.25;
    add(baleGeometry(), `bale ${i}`, [b.x, 0, b.z], b.yaw, [s, s, s]);
  });
  return soup;
}

describe("the fields draw cleanly from the overview", () => {
  // Rules as for the buildings (`ledges.test.ts`, `zfight.test.ts`), in world
  // units: the fields are drawn at their own size.
  it("leave no sliver of ledge: the hedges meet the ground's edge and each other cleanly", () => {
    const soup = fieldSoup(FIELDS);
    const found = narrowLedges(soup.positions, soup.indices, { narrowerThan: LAYER * 1.9, lowerThan: LAYER * 0.95 });
    expect(found.map((l) => `${l.width.toFixed(4)} wide, lip ${l.height.toFixed(4)}, at ${l.at.map((c) => c.toFixed(2)).join(",")}`)).toEqual([]);
  });

  it("have no two faces of different instances flickering through each other", () => {
    // Before: the end of each long hedge lay in the plane of the face of the
    // hedge it met at the corner, and the side of the ground in the plane of
    // the hedges' outer faces.
    const soup = fieldSoup(FIELDS);
    const fights = coplanarOverlaps(soup.positions, soup.indices, { within: LAYER * 2, minOverlap: 1e-5, buriedWithin: 0.05 })
      .filter((p) => soup.tags[p.a] !== soup.tags[p.b] && p.normal[1] > -0.99)
      .map((p) => `${soup.tags[p.a]} vs ${soup.tags[p.b]} ${p.separation.toFixed(4)} apart at ${p.at.map((c) => c.toFixed(2)).join(",")}`);
    expect(fights).toEqual([]);
  });
});
