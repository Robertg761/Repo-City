import { describe, expect, it } from "vitest";
import { SURFACE } from "../../../textures/surface-types";
import type { ModelKey } from "../archetypes";
import { PANEL_LIFT, type MeshDraft } from "../mesh";
import { blenderArchetypeModel, type ArchetypeModel } from "../models";
import * as town from "../town";
import * as village from "../village";
import {
  FACING,
  NEAR_LIP,
  NEAR_NARROWEST,
  NEAR_WITHIN,
  cross,
  dot,
  firstHit,
  insideTri,
  panelPoint,
  slivers,
  sub,
  tris,
  visibleFights,
  withLitPanes,
  type V,
} from "../near-checks";
import { BLENDER_NEAR_LOWRISE } from "./lowrise";

/**
 * The near levels of the low-rise, residential and industrial archetypes
 * (`blender/buildings/*_near.py`, `blender/settlement/near_*.py`): a much
 * richer model of the same building, drawn for the few closest to the camera.
 * Held to what makes the swap invisible: the same outline and the same glazing
 * in the same rectangles (the lit windows are the lean model's), inside a
 * budget of 12,000 triangles, with every face facing out.
 */

const BUDGET = 12_000;

/** What each model's unit box is stretched to in the city (the scripts' `SCALE`). */
const SCALE: Partial<Record<ModelKey, readonly [number, number, number]>> = {
  house: [4.4, 4.2, 4.4],
  "lowrise-parapet": [5.2, 5.6, 5.2],
  "lowrise-pitched": [5, 7, 5],
  "warehouse-sawtooth": [6.5, 5, 6.5],
  cottage: [4.2, 3.6, 4.0],
  "cottage/tile": [4.0, 4.2, 3.8],
  farmhouse: [4.6, 5.8, 4.4],
  barn: [4.4, 6.0, 4.8],
  shopfront: [5.5, 5.4, 5.0],
  "shopfront/tall": [5.5, 7.6, 5.0],
  terrace: [6.0, 5.4, 5.0],
  "apartment-low": [6.5, 10.5, 6.2],
  "apartment-low/retail": [6.5, 12, 6.2],
};
const IDS = Object.keys(BLENDER_NEAR_LOWRISE) as ModelKey[];

/** The lean Blender model each near level dresses. */
const SETTLEMENT: Partial<Record<ModelKey, () => ArchetypeModel>> = {
  cottage: () => village.blenderCottage("thatch"),
  "cottage/tile": () => village.blenderCottage("tile"),
  farmhouse: () => village.blenderFarmhouse(),
  barn: () => village.blenderBarn(),
  shopfront: () => town.blenderShopfront(2),
  "shopfront/tall": () => town.blenderShopfront(3),
  terrace: () => town.blenderTerrace(),
  "apartment-low": () => town.blenderApartmentLow(false),
  "apartment-low/retail": () => town.blenderApartmentLow(true),
};
const leanModel = (id: ModelKey): ArchetypeModel => (SETTLEMENT[id] ?? (() => blenderArchetypeModel(id)))();

/** Area (world units, at the instance size) and mean shade (vertex colour, which already holds the baked occlusion) of one surface. */
function surfaceShade(draft: MeshDraft, scale: readonly [number, number, number], surface: number): { area: number; mean: number } {
  let sum = 0;
  let area = 0;
  for (let t = 0; t < draft.indices.length; t += 3) {
    const ids = [draft.indices[t], draft.indices[t + 1], draft.indices[t + 2]];
    if (draft.surface![ids[0]] !== surface) continue;
    const p = ids.map((i): V => [draft.positions[i * 3] * scale[0], draft.positions[i * 3 + 1] * scale[1], draft.positions[i * 3 + 2] * scale[2]]);
    const c = cross(sub(p[1], p[0]), sub(p[2], p[0]));
    const a = Math.hypot(...c) / 2;
    let shade = 0;
    for (const i of ids) shade += (draft.colors[i * 3] + draft.colors[i * 3 + 1] + draft.colors[i * 3 + 2]) / 3;
    sum += (shade / 3) * a;
    area += a;
  }
  return { area, mean: area ? sum / area : 0 };
}

function bounds(draft: MeshDraft): { lo: V; hi: V } {
  const lo: V = [Infinity, Infinity, Infinity];
  const hi: V = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < draft.positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      lo[k] = Math.min(lo[k], draft.positions[i + k]);
      hi[k] = Math.max(hi[k], draft.positions[i + k]);
    }
  }
  return { lo, hi };
}

describe("the near low-rise models", () => {
  it("cover the archetypes this round names", () => {
    expect(IDS.length).toBeGreaterThan(0);
  });

  describe.each(IDS)("%s", (id) => {
    const near = BLENDER_NEAR_LOWRISE[id]!();
    const lean = leanModel(id);
    const all = tris(near);
    const scale = SCALE[id]!;

    it("stays inside the budget and is far richer than the lean model", () => {
      const triangles = near.indices.length / 3;
      expect(triangles).toBeLessThanOrEqual(BUDGET);
      expect(triangles).toBeGreaterThan((lean.draft.indices.length / 3) * 2.5);
      expect(near.colors.length).toBe(near.positions.length);
      expect(near.normals.length).toBe(near.positions.length);
      expect(near.surface?.length).toBe(near.positions.length / 3);
      expect(near.paint === undefined).toBe(lean.draft.paint === undefined);
      expect(Math.max(...near.indices)).toBeLessThan(near.positions.length / 3);
    });

    it("keeps the lean model's tone: walls and roofs as light as the lean model's, on the same surfaces", () => {
      // The swap must not flash darker (or lighter): the baked occlusion is
      // matched to the lean model's per material role (`blender/buildings/tone.py`),
      // and the walls stay plaster (a near wall in stone or brick would carry
      // much stronger relief and a darker shade than the lean one).
      for (const surface of [SURFACE.plaster, SURFACE.slate]) {
        const a = surfaceShade(lean.draft, scale, surface);
        const b = surfaceShade(near, scale, surface);
        if (a.area < 1) continue;
        expect(b.mean / a.mean, `surface ${surface}: lean ${a.mean.toFixed(3)}, near ${b.mean.toFixed(3)}`).toBeGreaterThan(0.95);
        expect(b.mean / a.mean, `surface ${surface}: lean ${a.mean.toFixed(3)}, near ${b.mean.toFixed(3)}`).toBeLessThan(1.05);
        // No wall of the lean model turns into another material.
        expect(b.area / a.area, `surface ${surface} area`).toBeGreaterThan(0.6);
      }
    });

    it("keeps the lean model's outline", () => {
      const a = bounds(near);
      const b = bounds(lean.draft);
      // A small allowance: steps, gutters and pots refine the outline.
      for (let k = 0; k < 3; k++) {
        expect(a.lo[k]).toBeGreaterThanOrEqual(b.lo[k] - 0.035);
        expect(a.hi[k]).toBeLessThanOrEqual(b.hi[k] + 0.035);
      }
      // ...and does not lose the ground, roof or walls it has.
      for (const k of [0, 2]) {
        expect(a.hi[k] - a.lo[k]).toBeGreaterThan((b.hi[k] - b.lo[k]) * 0.94);
      }
      expect(a.hi[1]).toBeGreaterThan(b.hi[1] - 0.05);
      expect(a.lo[1]).toBeGreaterThanOrEqual(-0.001);
    });

    it("keeps its glazing in exactly the lean model's window rectangles", () => {
      expect(lean.windows.length).toBeGreaterThan(0);
      for (const panel of lean.windows) {
        const facing = FACING[panel.facing];
        const plane = dot(facing, panelPoint(panel, 0, 0, PANEL_LIFT));
        const glass = all.filter((t) => t.surface === SURFACE.glass && dot(t.n, facing) > 0.9999 && Math.abs(t.d - plane) < 2e-4);
        // (The middle of a cross-barred pane is its bars, in the lean model too.)
        for (const [du, dv] of [[0.5, 0.5], [-0.5, -0.5], [-0.95, -0.95], [0.95, -0.95], [0.95, 0.95], [-0.95, 0.95]]) {
          const q = panelPoint(panel, du, dv, PANEL_LIFT);
          const pane = glass.find((t) => insideTri(t, q, 1e-6));
          expect(pane, `${panel.facing} window at u ${panel.u} v ${panel.v}: no glass at ${q.map((c) => c.toFixed(3))}`).toBeDefined();
          expect(Math.max(...pane!.color)).toBeLessThan(0.9);
        }
        // Between the bars the lit pane is not hidden: nothing in front of the glass but the bars.
        for (const [du, dv] of [[0.5, 0.5], [-0.5, -0.5]]) {
          const q = panelPoint(panel, du, dv, PANEL_LIFT);
          const from: V = [q[0] + facing[0] * 1e-4, q[1] + facing[1] * 1e-4, q[2] + facing[2] * 1e-4];
          const blocker = firstHit(all, from, facing, -1);
          if (blocker) expect(dot(sub(blocker.p[0], q), facing)).toBeGreaterThan(PANEL_LIFT * 1.5);
        }
      }
    });

    it("has no two faces flickering through each other, lit or not", { timeout: 60_000 }, () => {
      expect(visibleFights(near, scale, NEAR_WITHIN)).toEqual([]);
      expect(visibleFights(withLitPanes(near, lean.windows), scale, NEAR_WITHIN)).toEqual([]);
    });

    it("leaves no sliver of ledge showing", { timeout: 60_000 }, () => {
      expect(slivers(near, scale, NEAR_NARROWEST, NEAR_LIP)).toEqual([]);
    });

    it("stands its roof pads clear", () => {
      for (const pad of lean.roofPads) {
        for (const [dx, dz] of [[0, 0], [-0.45, -0.45], [0.45, -0.45], [0.45, 0.45], [-0.45, 0.45]]) {
          const q: V = [pad.x + dx * pad.w, pad.y, pad.z + dz * pad.d];
          const deck = all.find((t) => t.n[1] > 0.9999 && Math.abs(t.p[0][1] - pad.y) < 2e-4 && insideTri(t, q, 1e-6));
          expect(deck, `pad at ${pad.x},${pad.z}: no roof at ${q.map((c) => c.toFixed(3))}`).toBeDefined();
          expect(firstHit(all, [q[0], q[1] + 1e-4, q[2]], [0, 1, 0], deck!.i)).toBeNull();
        }
      }
    });

    it("shows no inside from outside: the first face any ray meets faces it", { timeout: 120_000 }, () => {
      // From a sphere round the building, at points on and about it, the first
      // face met must face the ray. One that does not is an inverted face or
      // a hole in a wall, seen from the street.
      const back: string[] = [];
      let seed = 12345;
      const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
      for (let k = 0; k < 2500; k++) {
        const a = rand() * Math.PI * 2;
        const el = 0.05 + rand() * 1.3;
        const from: V = [Math.cos(a) * Math.cos(el) * 2.2, 0.45 + Math.sin(el) * 2.2, Math.sin(a) * Math.cos(el) * 2.2];
        const to: V = [(rand() - 0.5) * 1.0, rand() * 1.05, (rand() - 0.5) * 1.0];
        const d = sub(to, from);
        const len = Math.hypot(...d);
        const dir: V = [d[0] / len, d[1] / len, d[2] / len];
        const hit = firstHit(all, from, dir, -1);
        if (hit && dot(hit.n, dir) > 1e-6) back.push(`from ${from.map((x) => x.toFixed(2))} hits the back of a face ${hit.p.map((q) => "(" + q.map((x) => x.toFixed(4)) + ")").join(" ")} surface ${hit.surface}`);
      }
      // (A stray ray in a couple of thousand may slip through a seam between
      // two details and see a back face; a hole in a wall or an inverted face
      // shows in many.)
      expect(back.length, back.slice(0, 6).join("\n")).toBeLessThanOrEqual(3);
    });
  });
});
