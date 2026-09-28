import { describe, expect, it } from "vitest";
import { SURFACE } from "../../textures/surface-types";
import { coplanarOverlaps } from "../coplanar";
import { narrowLedges } from "../ledges";
import type { ModelKey } from "./archetypes";
import { addPanel, emptyDraft, LAYER, PANEL_LIFT, type MeshDraft, type Panel } from "./mesh";
import { BLENDER_ARCHETYPES, archetypeModel, blenderArchetypeModel, type ArchetypeModel } from "./models";
import { LIT_INSET, LIT_LIFT } from "./placement";

/**
 * The Blender variants of the city's archetypes and the metropolis towers
 * (spike: `blender/buildings/`, drawn by default), held to every
 * rule the procedural models are held to -- `archetypes.test.ts`,
 * `metropolis.test.ts`, `zfight.test.ts`, `ledges.test.ts` -- plus the ones
 * an imported mesh needs proving: every published window is a pane of dark
 * glass in the geometry, every roof pad lies on a roof, and every face faces
 * out.
 */

const IDS = Object.keys(BLENDER_ARCHETYPES) as ModelKey[];

type V = [number, number, number];

interface Tri {
  p: V[];
  n: V;
  d: number;
  i: number;
  surface: number;
  color: V;
}

const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

function tris(draft: MeshDraft): Tri[] {
  const out: Tri[] = [];
  const vertex = (i: number): V => [draft.positions[i * 3], draft.positions[i * 3 + 1], draft.positions[i * 3 + 2]];
  for (let t = 0; t < draft.indices.length; t += 3) {
    const ids = [draft.indices[t], draft.indices[t + 1], draft.indices[t + 2]];
    const p = ids.map(vertex);
    const c = cross(sub(p[1], p[0]), sub(p[2], p[0]));
    const len = Math.hypot(...c);
    if (len < 1e-12) continue;
    const n: V = [c[0] / len, c[1] / len, c[2] / len];
    out.push({
      p,
      n,
      d: dot(n, p[0]),
      i: t / 3,
      surface: draft.surface?.[ids[0]] ?? -1,
      color: [draft.colors[ids[0] * 3], draft.colors[ids[0] * 3 + 1], draft.colors[ids[0] * 3 + 2]],
    });
  }
  return out;
}

function insideTri(t: Tri, q: V, eps = 1e-7): boolean {
  for (let e = 0; e < 3; e++) {
    const a = t.p[e];
    const b = t.p[(e + 1) % 3];
    if (dot(cross(sub(b, a), sub(q, a)), t.n) < -eps) return false;
  }
  return true;
}

const FACING: Record<Panel["facing"], V> = { "+z": [0, 0, 1], "-z": [0, 0, -1], "+x": [1, 0, 0], "-x": [-1, 0, 0] };

/** A point on a panel at (du, dv) of its half width and height from its centre. */
function panelPoint(panel: Panel, du: number, dv: number, lift: number): V {
  const out = panel.plane + lift;
  const cx = panel.cx ?? 0;
  const cz = panel.cz ?? 0;
  const u = panel.u + (du * panel.w) / 2;
  const v = panel.v + (dv * panel.h) / 2;
  switch (panel.facing) {
    case "+z":
      return [cx + u, v, cz + out];
    case "-z":
      return [cx - u, v, cz - out];
    case "+x":
      return [cx + out, v, cz - u];
    default:
      return [cx - out, v, cz + u];
  }
}

/** The first face a ray from `from` along `dir` meets, skipping `skip`. */
function firstHit(all: Tri[], from: V, dir: V, skip: number): Tri | null {
  let best: Tri | null = null;
  let bestT = Infinity;
  for (const T of all) {
    if (T.i === skip) continue;
    const denom = dot(T.n, dir);
    if (Math.abs(denom) < 1e-9) continue;
    const t = (T.d - dot(T.n, from)) / denom;
    // A face flush against the back of another (a fascia's back on its wall)
    // is met at once, even a hair behind the ray's start.
    const nearest = denom < 0 ? -2e-5 : 1e-6;
    if (t <= nearest || t >= bestT) continue;
    const hit: V = [from[0] + dir[0] * t, from[1] + dir[1] * t, from[2] + dir[2] * t];
    if (!insideTri(T, hit, 1e-12)) continue;
    best = T;
    bestT = t;
  }
  return best;
}

/** The same rules as `zfight.test.ts`. */
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
  draft.surface = [...(model.draft.surface ?? [])];
  for (const panel of model.windows) {
    addPanel(draft, { ...panel, plane: panel.plane + LIT_LIFT, w: panel.w * LIT_INSET, h: panel.h * LIT_INSET }, [9, 9, 9]);
  }
  return draft;
}

/** The same rules as `ledges.test.ts`. */
function slivers(draft: MeshDraft): string[] {
  return narrowLedges(draft.positions, draft.indices, { narrowerThan: LAYER * 1.9, lowerThan: LAYER * 0.95 }).map(
    (l) => `${l.height > 0 ? `lip ${l.height.toFixed(4)} high` : `${l.width.toFixed(4)} wide`} at ${l.at.map((c) => c.toFixed(3)).join(",")}`,
  );
}

describe("the Blender archetypes", () => {
  it("cover the city's eight shapes", () => {
    expect(IDS.length).toBeGreaterThan(0);
  });

  describe.each(IDS)("%s", (id) => {
    const model = blenderArchetypeModel(id);
    const { draft } = model;
    const all = tris(draft);

    it("keeps the procedural model's id and the archetype contract", () => {
      expect(model.id).toBe(id);
      expect(blenderArchetypeModel(id)).not.toBe(archetypeModel(id));
      expect(model.roofPads.length > 0 || model.maxProps === 0).toBe(true);
    });

    it("stays inside the unit box with a sane budget", () => {
      const triangles = draft.indices.length / 3;
      expect(triangles).toBeGreaterThan(20);
      expect(triangles).toBeLessThan(1300);
      for (let i = 0; i < draft.positions.length; i += 3) {
        const [x, y, z] = draft.positions.slice(i, i + 3);
        expect(Math.abs(x)).toBeLessThanOrEqual(0.62);
        expect(Math.abs(z)).toBeLessThanOrEqual(0.62);
        expect(y).toBeGreaterThanOrEqual(-0.001);
        expect(y).toBeLessThanOrEqual(1.12);
      }
      expect(draft.colors.length).toBe(draft.positions.length);
      expect(draft.normals.length).toBe(draft.positions.length);
      expect(draft.surface?.length).toBe(draft.positions.length / 3);
      expect(Math.max(...draft.indices)).toBeLessThan(draft.positions.length / 3);
    });

    it("stands as tall as the procedural model, roughly", () => {
      const top = (d: MeshDraft) => Math.max(...d.positions.filter((_, i) => i % 3 === 1));
      expect(top(draft)).toBeGreaterThanOrEqual(top(archetypeModel(id).draft) - 0.03);
    });

    it("publishes windows that are panes of dark glass in its walls", () => {
      expect(model.windows.length).toBeGreaterThan(0);
      for (const panel of model.windows) {
        expect(panel.plane).toBeGreaterThan(0.2);
        expect(panel.v).toBeGreaterThan(0);
        expect(panel.v).toBeLessThan(1);
        const facing = FACING[panel.facing];
        const glass = all.filter(
          (t) => t.surface === SURFACE.glass && dot(t.n, facing) > 0.9999 && Math.abs(t.d - dot(facing, panelPoint(panel, 0, 0, PANEL_LIFT))) < 2e-4,
        );
        // The pane's middle and corners, a little in, are all glass...
        for (const [du, dv] of [[0, 0], [-0.95, -0.95], [0.95, -0.95], [0.95, 0.95], [-0.95, 0.95]]) {
          const q = panelPoint(panel, du, dv, PANEL_LIFT);
          const pane = glass.find((t) => insideTri(t, q, 1e-6));
          expect(pane, `${panel.facing} window at u ${panel.u} v ${panel.v}: no glass at ${q.map((c) => c.toFixed(3))}`).toBeDefined();
          // ...dark glass, darker than the wall it is set in...
          expect(Math.max(...pane!.color)).toBeLessThan(0.9);
          // ...and nothing stands in front of its middle closer than the lit pane.
          if (du === 0) {
            const from: V = [q[0] + facing[0] * 1e-4, q[1] + facing[1] * 1e-4, q[2] + facing[2] * 1e-4];
            const blocker = firstHit(all, from, facing, pane!.i);
            if (blocker) expect(dot(sub(blocker.p[0], q), facing)).toBeGreaterThan(LIT_LIFT * 1.5);
          }
        }
      }
    });

    it("stands its roof pads on a roof", () => {
      for (const pad of model.roofPads) {
        expect(pad.y).toBeGreaterThan(0.3);
        expect(pad.y).toBeLessThanOrEqual(1);
        for (const [dx, dz] of [[0, 0], [-0.45, -0.45], [0.45, -0.45], [0.45, 0.45], [-0.45, 0.45]]) {
          const q: V = [pad.x + dx * pad.w, pad.y, pad.z + dz * pad.d];
          const deck = all.find((t) => t.n[1] > 0.9999 && Math.abs(t.p[0][1] - pad.y) < 2e-4 && insideTri(t, q, 1e-6));
          expect(deck, `pad at ${pad.x},${pad.z}: no roof at ${q.map((c) => c.toFixed(3))}`).toBeDefined();
          // Open sky over it: a prop stands there.
          expect(firstHit(all, [q[0], q[1] + 1e-4, q[2]], [0, 1, 0], deck!.i)).toBeNull();
        }
      }
    });

    it("faces every face out: nothing looks into the solid behind it", () => {
      const inward: string[] = [];
      for (const t of all) {
        // Inverted faces are wrong all over; a face partly hidden under a
        // mullion is only "inside" where the mullion is. Flag a face only
        // when every sample on it looks into a solid.
        const samples = [[1 / 3, 1 / 3, 1 / 3], [0.7, 0.15, 0.15], [0.15, 0.7, 0.15], [0.15, 0.15, 0.7]];
        const wrong = samples.every(([a, b, cc]) => {
          const c: V = [0, 1, 2].map((k) => a * t.p[0][k] + b * t.p[1][k] + cc * t.p[2][k]) as V;
          const hit = firstHit(all, [c[0] + t.n[0] * 1e-5, c[1] + t.n[1] * 1e-5, c[2] + t.n[2] * 1e-5], t.n, t.i);
          // Buried faces (a chimney's foot inside the roof slab) exit both
          // ways and are never seen; a face wound inside out has open air
          // behind it.
          const back: V = [-t.n[0], -t.n[1], -t.n[2]];
          const behind = firstHit(all, [c[0] + back[0] * 1e-5, c[1] + back[1] * 1e-5, c[2] + back[2] * 1e-5], back, t.i);
          const buried = behind !== null && dot(behind.n, back) > 1e-6;
          return hit !== null && dot(hit.n, t.n) > 1e-6 && !buried;
        });
        const c = [0, 1, 2].map((k) => (t.p[0][k] + t.p[1][k] + t.p[2][k]) / 3);
        if (wrong) inward.push(`${c.map((x) => x.toFixed(3))} facing ${t.n.map((x) => x.toFixed(2))}`);
      }
      expect(inward).toEqual([]);
    });

    it("has no two faces flickering through each other, lit or not", () => {
      expect(visibleFights(draft)).toEqual([]);
      expect(visibleFights(withLitPanes(model))).toEqual([]);
    });

    it("leaves no sliver of ledge showing", () => {
      expect(slivers(draft)).toEqual([]);
    });
  });
});

/**
 * The metropolis towers' own rules (`metropolis.test.ts`), for their Blender
 * variants.
 */
describe("the Blender metropolis towers", () => {
  const blueness = ([r, g, b]: readonly number[]) => b - (r + g) / 2;
  const verts = (id: ModelKey) => {
    const { draft } = blenderArchetypeModel(id);
    return Array.from({ length: draft.positions.length / 3 }, (_, i) => draft.positions.slice(i * 3, i * 3 + 3));
  };
  const centroids = (id: ModelKey) =>
    tris(blenderArchetypeModel(id).draft).map((t) => ({
      ...t,
      c: [0, 1, 2].map((k) => (t.p[0][k] + t.p[1][k] + t.p[2][k]) / 3),
      area: Math.hypot(...cross(sub(t.p[1], t.p[0]), sub(t.p[2], t.p[0]))) / 2,
    }));

  it.each(["tower-glass", "tower-twin", "tower-spire"] as ModelKey[])("%s asks the lit-window pass for no more than a stone tower", (id) => {
    expect(blenderArchetypeModel(id).windows.length).toBeLessThanOrEqual(110);
  });

  it.each(["tower-glass", "tower-twin", "tower-spire"] as ModelKey[])("%s reflects different sky tones across a storey", (id) => {
    const { draft } = blenderArchetypeModel(id);
    const storeys = new Map<string, Set<string>>();
    for (let i = 0; i < draft.positions.length / 3; i++) {
      const [r, g, b] = draft.colors.slice(i * 3, i * 3 + 3);
      if (b - (r + g) / 2 < 0.1 || draft.normals[i * 3 + 2] < 0.99) continue;
      const height = draft.positions[i * 3 + 1].toFixed(4);
      const shades = storeys.get(height) ?? new Set<string>();
      shades.add([r, g, b].map((c) => c.toFixed(3)).join("/"));
      storeys.set(height, shades);
    }
    expect([...storeys.values()].some((shades) => shades.size > 1)).toBe(true);
  });

  it("tower-glass is mostly glass, cooler than the wall, slim, with a raked crown", () => {
    const facade = centroids("tower-glass").filter((t) => Math.abs(t.n[1]) < 0.1 && t.c[1] > 0.1 && t.c[1] < 0.9);
    const total = facade.reduce((s, t) => s + t.area, 0);
    const glass = facade.filter((t) => blueness(t.color) > 0.12).reduce((s, t) => s + t.area, 0);
    expect(glass / total).toBeGreaterThan(0.5);
    const v = verts("tower-glass");
    expect(Math.max(...v.filter((p) => p[1] > 0.3 && p[1] < 0.9).map((p) => Math.abs(p[0])))).toBeLessThan(0.44);
    const top = v.filter((p) => p[1] > 0.945);
    const east = Math.max(...top.filter((p) => p[0] > 0.3).map((p) => p[1]));
    const west = Math.max(...top.filter((p) => p[0] < -0.3).map((p) => p[1]), 0.945);
    expect(east - west).toBeGreaterThan(0.03);
  });

  it("tower-twin is two shafts with daylight between, tied by a skybridge", () => {
    const all = centroids("tower-twin");
    const upper = all.filter((t) => t.c[1] > 0.7 && t.c[1] < 0.9);
    expect(upper.some((t) => Math.abs(t.c[0]) < 0.03)).toBe(false);
    expect(upper.some((t) => t.c[0] > 0.2)).toBe(true);
    expect(upper.some((t) => t.c[0] < -0.2)).toBe(true);
    expect(all.some((t) => Math.abs(t.c[0]) < 0.03 && t.c[1] > 0.5 && t.c[1] < 0.62)).toBe(true);
  });

  it("tower-spire steps in as it rises and ends in a spire", () => {
    const v = verts("tower-spire");
    const widthAt = (lo: number, hi: number) => Math.max(...v.filter((p) => p[1] > lo && p[1] < hi).map((p) => Math.abs(p[0])));
    expect(widthAt(0.55, 0.7)).toBeLessThan(widthAt(0.1, 0.45));
    expect(widthAt(0.75, 0.83)).toBeLessThan(widthAt(0.55, 0.7));
    const tip = v.reduce((best, p) => (p[1] > best[1] ? p : best));
    expect(tip[1]).toBeGreaterThan(1.02);
    expect(Math.abs(tip[0])).toBeLessThan(0.01);
    expect(Math.abs(tip[2])).toBeLessThan(0.01);
  });
});
