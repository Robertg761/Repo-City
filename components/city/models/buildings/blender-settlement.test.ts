/**
 * The village and town buildings modelled in Blender (`blender/settlement/`,
 * drawn by default) held to everything the procedural ones are
 * held to: `settlement.test.ts` (budget, unit box, paint channels, windows),
 * `zfight.test.ts`, `ledges.test.ts` and `winding.test.ts`, plus what only an
 * imported model can get wrong: the published window rectangles must sit on
 * the dark glass the script placed, and every face must face out.
 */
import { describe, expect, it } from "vitest";
import { coplanarOverlaps } from "../coplanar";
import { narrowLedges } from "../ledges";
import { SURFACE } from "../../textures/surface-types";
import { addPanel, emptyDraft, LAYER, PANEL_LIFT, PAINT_ACCENT, PAINT_NONE, PAINT_WALL, panelCentre, type MeshDraft, type Panel } from "./mesh";
import type { ArchetypeModel } from "./models";
import { LIT_INSET, LIT_LIFT } from "./placement";
import * as village from "./village";
import * as town from "./town";
import { archetypeModel } from "./models";
import type { ModelKey } from "./archetypes";

type Maybe = Record<string, unknown>;
const call = (mod: unknown, name: string, ...args: unknown[]): (() => ArchetypeModel) | null => {
  const f = (mod as Maybe)[name];
  return typeof f === "function" ? () => (f as (...a: unknown[]) => ArchetypeModel)(...args) : null;
};

/** Every Blender variant there is, by the model key it stands in for. */
const BLENDER: [ModelKey, (() => ArchetypeModel) | null][] = [
  ["cottage", call(village, "blenderCottage", "thatch")],
  ["cottage/tile", call(village, "blenderCottage", "tile")],
  ["farmhouse", call(village, "blenderFarmhouse")],
  ["barn", call(village, "blenderBarn")],
  ["shopfront", call(town, "blenderShopfront", 2)],
  ["shopfront/tall", call(town, "blenderShopfront", 3)],
  ["terrace", call(town, "blenderTerrace")],
  ["apartment-low", call(town, "blenderApartmentLow", false)],
  ["apartment-low/retail", call(town, "blenderApartmentLow", true)],
];
const MODELS = BLENDER.filter((entry): entry is [ModelKey, () => ArchetypeModel] => entry[1] !== null);

type V = [number, number, number];
const vertex = (d: MeshDraft, i: number): V => [d.positions[i * 3], d.positions[i * 3 + 1], d.positions[i * 3 + 2]];
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

interface Tri {
  p: V[];
  n: V;
  v: number;
}

function triangles(d: MeshDraft): Tri[] {
  const out: Tri[] = [];
  for (let t = 0; t < d.indices.length; t += 3) {
    const p = [0, 1, 2].map((k) => vertex(d, d.indices[t + k]));
    const c = cross(sub(p[1], p[0]), sub(p[2], p[0]));
    const len = Math.hypot(...c);
    if (len < 1e-12) continue;
    out.push({ p, n: [c[0] / len, c[1] / len, c[2] / len], v: d.indices[t] });
  }
  return out;
}

/** Möller-Trumbore: distance along `dir` from `from` to the triangle, or -1. */
function hit(from: V, dir: V, t: Tri): number {
  const e1 = sub(t.p[1], t.p[0]);
  const e2 = sub(t.p[2], t.p[0]);
  const h = cross(dir, e2);
  const a = dot(e1, h);
  if (Math.abs(a) < 1e-12) return -1;
  const f = 1 / a;
  const s = sub(from, t.p[0]);
  const u = f * dot(s, h);
  if (u < -1e-9 || u > 1 + 1e-9) return -1;
  const q = cross(s, e1);
  const v = f * dot(dir, q);
  if (v < -1e-9 || u + v > 1 + 1e-9) return -1;
  const d = f * dot(e2, q);
  return d > 1e-7 ? d : -1;
}

/**
 * The first face a ray meets: +1 its front, -1 its back, 0 nothing. The
 * backs of decals a few layers in front (goods in a shop window, the panels
 * on a door) do not count: they are one-sided on purpose.
 */
function firstSide(tris: Tri[], from: V, dir: V, skip: Tri, decals = false): number {
  let best = Infinity;
  let side = 0;
  for (const t of tris) {
    if (t === skip) continue;
    const d = hit(from, dir, t);
    if (d > 0 && d < best) {
      if (decals && d < 0.02 && dot(t.n, dir) > 0.999) continue;
      best = d;
      side = dot(t.n, dir) < 0 ? 1 : -1;
    }
  }
  return side;
}

/**
 * Faces wound inside out: looking along its normal a face sees the back of
 * the model's far side, and looking the other way it does not. (A correct
 * face behind an open-backed box -- a rose on a wall -- sees a back face both
 * ways, and a correct face in the open sees none.)
 */
function inwardFaces(d: MeshDraft): string[] {
  const tris = triangles(d);
  const out: string[] = [];
  // Three points of each triangle, so a ray that grazes an edge of the
  // face it should meet cannot condemn a face on its own.
  const weights = [[1 / 3, 1 / 3, 1 / 3], [0.6, 0.2, 0.2], [0.2, 0.2, 0.6]];
  for (const t of tris) {
    const inward = weights.every((w) => {
      const c: V = [0, 1, 2].map((k) => t.p[0][k] * w[0] + t.p[1][k] * w[1] + t.p[2][k] * w[2]) as V;
      const from: V = [c[0] + t.n[0] * 1e-5, c[1] + t.n[1] * 1e-5, c[2] + t.n[2] * 1e-5];
      const back: V = [c[0] - t.n[0] * 1e-5, c[1] - t.n[1] * 1e-5, c[2] - t.n[2] * 1e-5];
      if (firstSide(tris, from, t.n, t, true) !== -1) return false;
      return firstSide(tris, back, [-t.n[0], -t.n[1], -t.n[2]], t) !== -1;
    });
    if (inward) {
      const c = [0, 1, 2].map((k) => (t.p[0][k] + t.p[1][k] + t.p[2][k]) / 3);
      out.push(`at ${c.map((x) => x.toFixed(3)).join(",")} facing ${t.n.map((x) => x.toFixed(2)).join(",")}`);
    }
  }
  return out;
}

// -- the z-fight and ledge checks, exactly as zfight.test.ts and ledges.test.ts run them

const WITHIN = LAYER * 0.9;

function paintOf(draft: MeshDraft, triangle: number): string {
  const v = draft.indices[triangle * 3];
  const rgb = draft.colors.slice(v * 3, v * 3 + 3).map((c) => c.toFixed(3));
  return `${rgb.join("/")}:${draft.paint?.[v] ?? "-"}`;
}

function visibleFights(draft: MeshDraft): string[] {
  return coplanarOverlaps(draft.positions, draft.indices, { within: WITHIN, minOverlap: 1e-6, buriedWithin: 0.03 })
    .filter((p) => paintOf(draft, p.a) !== paintOf(draft, p.b))
    .filter((p) => !(p.normal[1] < -0.99 && Math.abs(p.at[1]) < 1e-4))
    .map((p) => `${paintOf(draft, p.a)} vs ${paintOf(draft, p.b)} ${p.separation.toFixed(4)} apart at ${p.at.map((x) => x.toFixed(3)).join(",")}`);
}

function withLitPanes(model: ArchetypeModel): MeshDraft {
  const draft = emptyDraft();
  draft.positions = [...model.draft.positions];
  draft.normals = [...model.draft.normals];
  draft.colors = [...model.draft.colors];
  draft.indices = [...model.draft.indices];
  if (model.draft.paint) {
    draft.paint = [...model.draft.paint];
    draft.paintValue = 9;
  }
  for (const panel of model.windows) {
    addPanel(draft, { ...panel, plane: panel.plane + LIT_LIFT, w: panel.w * LIT_INSET, h: panel.h * LIT_INSET }, [9, 9, 9]);
  }
  return draft;
}

function slivers(draft: MeshDraft): string[] {
  return narrowLedges(draft.positions, draft.indices, { narrowerThan: LAYER * 1.9, lowerThan: LAYER * 0.95 }).map(
    (l) => `${l.height > 0 ? `lip ${l.height.toFixed(4)} high` : `${l.width.toFixed(4)} wide`} at ${l.at.map((c) => c.toFixed(3)).join(",")}`,
  );
}

// -- windows

const OUTWARD: Record<Panel["facing"], V> = { "+z": [0, 0, 1], "-z": [0, 0, -1], "+x": [1, 0, 0], "-x": [-1, 0, 0] };
const ALONG: Record<Panel["facing"], V> = { "+z": [1, 0, 0], "-z": [-1, 0, 0], "+x": [0, 0, -1], "-x": [0, 0, 1] };

/** The face straight behind a point of a panel, looking into the wall. */
function faceBehind(d: MeshDraft, tris: Tri[], panel: Panel, du: number, dv: number, lift: number): { tri: Tri; depth: number } | null {
  const [cx, cy, cz] = panelCentre(panel, lift);
  const a = ALONG[panel.facing];
  const n = OUTWARD[panel.facing];
  const from: V = [cx + a[0] * du + n[0] * 1e-4, cy + dv, cz + a[2] * du + n[2] * 1e-4];
  const dir: V = [-n[0], -n[1], -n[2]];
  let best: { tri: Tri; depth: number } | null = null;
  for (const t of tris) {
    if (dot(t.n, n) < 0.999) continue;
    const dist = hit(from, dir, t);
    if (dist > 0 && (!best || dist < best.depth)) best = { tri: t, depth: dist - 1e-4 };
  }
  return best;
}

const luminance = (d: MeshDraft, v: number) => 0.2126 * d.colors[v * 3] + 0.7152 * d.colors[v * 3 + 1] + 0.0722 * d.colors[v * 3 + 2];

describe("the Blender settlement models", () => {
  it("exist", () => {
    expect(MODELS.length).toBeGreaterThan(0);
  });

  for (const [key, build] of MODELS) {
    describe(key, () => {
      const model = build();
      const d = model.draft;

      it("stands in for its model, inside the unit box, within budget", () => {
        expect(model.id).toBe(key);
        const tris = d.indices.length / 3;
        expect(tris).toBeGreaterThan(20);
        expect(tris).toBeLessThan(1300);
        // A village of forty of the worst stays under fifty thousand.
        if (["cottage", "cottage/tile", "farmhouse", "barn"].includes(key)) expect(tris * 40).toBeLessThan(50_000);
        for (let i = 0; i < d.positions.length; i += 3) {
          expect(Math.abs(d.positions[i])).toBeLessThanOrEqual(0.62);
          expect(d.positions[i + 1]).toBeGreaterThanOrEqual(-0.001);
          expect(d.positions[i + 1]).toBeLessThanOrEqual(1.12);
          expect(Math.abs(d.positions[i + 2])).toBeLessThanOrEqual(0.62);
        }
      });

      it("keeps the procedural model's footprint and height", () => {
        const proc = archetypeModel(key).draft;
        const extent = (dr: MeshDraft, axis: number, f: (a: number, b: number) => number) => {
          let v = dr.positions[axis];
          for (let i = axis; i < dr.positions.length; i += 3) v = f(v, dr.positions[i]);
          return v;
        };
        for (const axis of [0, 1, 2]) {
          expect(Math.abs(extent(d, axis, Math.max) - extent(proc, axis, Math.max))).toBeLessThan(0.05);
          expect(Math.abs(extent(d, axis, Math.min) - extent(proc, axis, Math.min))).toBeLessThan(0.05);
        }
      });

      it("paints every vertex with a channel: wall, absolute and accent", () => {
        expect(d.paint).toBeDefined();
        expect(d.paint!.length).toBe(d.positions.length / 3);
        expect(d.surface!.length).toBe(d.positions.length / 3);
        const channels = new Set(d.paint);
        for (const c of channels) expect([PAINT_NONE, PAINT_WALL, PAINT_ACCENT]).toContain(c);
        expect(channels.has(PAINT_WALL)).toBe(true);
        expect(channels.has(PAINT_NONE)).toBe(true);
        if (key !== "barn") expect(channels.has(PAINT_ACCENT)).toBe(true);
        // Baked occlusion: shaded, never black.
        const shades = d.colors.filter((_, i) => d.paint![Math.floor(i / 3)] === PAINT_WALL);
        expect(Math.min(...shades)).toBeGreaterThan(0.3);
        expect(Math.max(...shades)).toBeLessThanOrEqual(1.0001);
      });

      it("builds the same arrays every time", () => {
        const again = build();
        expect(again.draft.positions).toEqual(d.positions);
        expect(again.draft.paint).toEqual(d.paint);
        expect(again.windows).toEqual(model.windows);
      });

      it("publishes lit windows exactly on its dark glass", () => {
        expect(model.windows.length).toBeGreaterThan(2);
        const tris = triangles(d);
        for (const w of model.windows) {
          expect(w.v).toBeGreaterThan(0);
          expect(w.v).toBeLessThan(1);
          expect(Math.abs((w.cx ?? 0) + w.plane)).toBeLessThanOrEqual(0.62);
          // Glass a quarter of the way in from each corner, in the pane's
          // own plane (the corners of a cross-barred window's four panes).
          for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
            const found = faceBehind(d, tris, w, (su * w.w) / 4, (sv * w.h) / 4, 0);
            expect(found, `${key} ${JSON.stringify(w)}`).not.toBeNull();
            expect(found!.depth).toBeLessThan(1e-3);
            expect(d.surface![found!.tri.v]).toBe(SURFACE.glass);
            expect(d.paint![found!.tri.v]).toBe(PAINT_NONE);
            expect(luminance(d, found!.tri.v)).toBeLessThan(0.12);
          }
          // The lit pane's corners stand over the window, never over air
          // or a wall: glass, or the frame a layer behind it.
          for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
            const found = faceBehind(d, tris, w, (su * w.w * LIT_INSET) / 2 * 0.999, (sv * w.h * LIT_INSET) / 2 * 0.999, LIT_LIFT);
            expect(found).not.toBeNull();
            expect(found!.depth).toBeLessThan(LIT_LIFT + LAYER + 1e-3);
          }
        }
      });

      it("has no two faces flickering through each other, lit or dark", () => {
        expect(visibleFights(d)).toEqual([]);
        expect(visibleFights(withLitPanes(model))).toEqual([]);
      });

      it("leaves no sliver of ledge showing", () => {
        expect(slivers(d)).toEqual([]);
      });

      it("faces every face out", () => {
        expect(inwardFaces(d)).toEqual([]);
      });
    });
  }
});

describe("the check itself", () => {
  it("finds a face wound inside out on a closed box", () => {
    const draft = emptyDraft();
    addPanel(draft, { facing: "+z", u: 0, v: 0.5, w: 1, h: 1, plane: 0.5 - PANEL_LIFT }, [1, 1, 1]);
    addPanel(draft, { facing: "-z", u: 0, v: 0.5, w: 1, h: 1, plane: 0.5 - PANEL_LIFT }, [1, 1, 1]);
    expect(inwardFaces(draft)).toEqual([]);
    // The front turned round: it now looks at the back wall's back.
    const flipped = emptyDraft();
    addPanel(flipped, { facing: "-z", u: 0, v: 0.5, w: 1, h: 1, plane: -0.5 - PANEL_LIFT }, [1, 1, 1]);
    addPanel(flipped, { facing: "-z", u: 0, v: 0.5, w: 1, h: 1, plane: 0.5 - PANEL_LIFT }, [1, 1, 1]);
    // Both triangles of it, and only those.
    expect(inwardFaces(flipped).length).toBe(2);
  });
});

describe("the Blender high-street shops' side walls", () => {
  // A town shopfront stands alone, so its gables are seen: windows on both sides.
  for (const storeys of [2, 3] as const) {
    it(`carry windows on both side walls (${storeys} storeys)`, () => {
      const model = call(town, "blenderShopfront", storeys);
      if (!model) return;
      const { windows } = model();
      for (const facing of ["+x", "-x"] as const) {
        expect(windows.filter((w) => w.facing === facing).length).toBeGreaterThanOrEqual(storeys === 2 ? 3 : 3);
      }
    });
  }
});
