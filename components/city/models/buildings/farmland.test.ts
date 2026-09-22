import { describe, expect, it } from "vitest";
import type { FieldPatch } from "@/types/city";
import {
  CROP_ROWS,
  GATE_WIDTH,
  HEADLAND,
  HEDGE_WIDTH,
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
      const inset = 0.35;
      const full = 2 * (f.w - 2 * inset) + 2 * (f.d - 2 * inset) + 2 * HEDGE_WIDTH;
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
