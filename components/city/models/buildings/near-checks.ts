/**
 * Geometry checks for the near levels of the building archetypes
 * (`near-towers.test.ts`): the rules `blender-city.test.ts` holds the lean
 * Blender models to, as functions over a `MeshDraft` so every near family can
 * reuse them. Pure arrays, no three.js.
 */

import { coplanarOverlaps } from "../coplanar";
import { narrowLedges } from "../ledges";
import { addPanel, emptyDraft, LAYER, type MeshDraft, type Panel } from "./mesh";
import { LIT_INSET, LIT_LIFT } from "./placement";

export type V = [number, number, number];

export interface Tri {
  p: V[];
  n: V;
  d: number;
  i: number;
  surface: number;
  color: V;
}

export const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export function tris(draft: MeshDraft): Tri[] {
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

export function insideTri(t: Tri, q: V, eps = 1e-7): boolean {
  for (let e = 0; e < 3; e++) {
    const a = t.p[e];
    const b = t.p[(e + 1) % 3];
    if (dot(cross(sub(b, a), sub(q, a)), t.n) < -eps) return false;
  }
  return true;
}

export const FACING: Record<Panel["facing"], V> = { "+z": [0, 0, 1], "-z": [0, 0, -1], "+x": [1, 0, 0], "-x": [-1, 0, 0] };

/** A point on a panel at (du, dv) of its half width and height from its centre. */
export function panelPoint(panel: Panel, du: number, dv: number, lift: number): V {
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
export function firstHit(all: readonly Tri[], from: V, dir: V, skip: number): Tri | null {
  let best: Tri | null = null;
  let bestT = Infinity;
  for (const T of all) {
    if (T.i === skip) continue;
    const denom = dot(T.n, dir);
    if (Math.abs(denom) < 1e-9) continue;
    const t = (T.d - dot(T.n, from)) / denom;
    // A face flush against the back of another is met at once, even a hair
    // behind the ray's start.
    const nearest = denom < 0 ? -2e-5 : 1e-6;
    if (t <= nearest || t >= bestT) continue;
    const hit: V = [from[0] + dir[0] * t, from[1] + dir[1] * t, from[2] + dir[2] * t];
    if (!insideTri(T, hit, 1e-12)) continue;
    best = T;
    bestT = t;
  }
  return best;
}

/**
 * The distance below which two faces facing one way and overlapping count as
 * fighting, in WORLD units. The lean models are held to a layer (0.006 of the
 * unit box) because they are seen from the overview, where a layer is a few
 * steps of the depth buffer; but a tower is 20 times taller than wide, so a
 * layer is 14 cm up a wall, more than a window frame is thick. A near model is
 * only drawn within about a hundred units of the camera, where a depth step
 * is under a thousandth of a unit, so 2 cm is over twenty steps at the very
 * edge of that range.
 */
export const NEAR_WITHIN = 0.02;
/**
 * Ledges narrower than this (world) are slivers in a near model, lips lower
 * than `NEAR_LIP`: under a centimetre, which no camera close enough to draw a
 * near model can resolve as anything but a hair.
 */
export const NEAR_NARROWEST = 0.006;
export const NEAR_LIP = 0.006;

function paintOf(draft: MeshDraft, triangle: number): string {
  const v = draft.indices[triangle * 3];
  const rgb = draft.colors.slice(v * 3, v * 3 + 3).map((c) => c.toFixed(3));
  return `${rgb.join("/")}:${draft.paint?.[v] ?? "-"}`;
}

type Scale = readonly [number, number, number];

/** Faces of different colour facing one way, overlapping, closer than `within` (world) apart. */
export function visibleFights(draft: MeshDraft, scale: Scale = [1, 1, 1], within = LAYER * 0.9): string[] {
  return coplanarOverlaps(draft.positions, draft.indices, { within, minOverlap: 1e-6, buriedWithin: 0.03, scale })
    .filter((p) => paintOf(draft, p.a) !== paintOf(draft, p.b))
    .filter((p) => !(p.normal[1] < -0.99 && Math.abs(p.at[1]) < 1e-4))
    .map((p) => `${paintOf(draft, p.a)} vs ${paintOf(draft, p.b)} ${p.separation.toFixed(4)} apart at ${p.at.map((x) => x.toFixed(3)).join(",")}`);
}

/** The model with the lit-window pass's panes merged in, in a colour nothing else uses. */
export function withLitPanes(draft: MeshDraft, windows: readonly Panel[]): MeshDraft {
  const merged = emptyDraft();
  merged.positions = [...draft.positions];
  merged.normals = [...draft.normals];
  merged.colors = [...draft.colors];
  merged.indices = [...draft.indices];
  merged.surface = [...(draft.surface ?? [])];
  for (const panel of windows) {
    addPanel(merged, { ...panel, plane: panel.plane + LIT_LIFT, w: panel.w * LIT_INSET, h: panel.h * LIT_INSET }, [9, 9, 9]);
  }
  return merged;
}

/** Ledges narrower than `narrowerThan` and lips lower than `lowerThan` (world units after `scale`), as `ledges.test.ts` finds them. */
export function slivers(draft: MeshDraft, scale: Scale = [1, 1, 1], narrowerThan = LAYER * 1.9, lowerThan = LAYER * 0.95): string[] {
  return narrowLedges(draft.positions, draft.indices, { narrowerThan, lowerThan, scale }).map(
    (l) => `${l.height > 0 ? `lip ${l.height.toFixed(4)} high` : `${l.width.toFixed(4)} wide`} at ${l.at.map((c) => c.toFixed(3)).join(",")}`,
  );
}

/**
 * The mean colour (AO and tone included, as the renderer multiplies them) of
 * a draft's faces per surface, weighted by their world area: how bright the
 * model reads from a distance. `scale` is what the unit box is stretched to.
 */
export function toneBySurface(draft: MeshDraft, scale: Scale): Map<number, { area: number; tone: number }> {
  const out = new Map<number, { area: number; tone: number }>();
  const at = (i: number): V => [draft.positions[i * 3] * scale[0], draft.positions[i * 3 + 1] * scale[1], draft.positions[i * 3 + 2] * scale[2]];
  for (let t = 0; t < draft.indices.length; t += 3) {
    const [a, b, c] = [draft.indices[t], draft.indices[t + 1], draft.indices[t + 2]];
    const area = Math.hypot(...cross(sub(at(b), at(a)), sub(at(c), at(a)))) / 2;
    if (area <= 0) continue;
    const tone = (draft.colors[a * 3] + draft.colors[b * 3] + draft.colors[c * 3]) / 3;
    const surface = draft.surface?.[a] ?? -1;
    const acc = out.get(surface) ?? { area: 0, tone: 0 };
    acc.area += area;
    acc.tone += area * tone;
    out.set(surface, acc);
  }
  for (const acc of out.values()) acc.tone /= acc.area;
  return out;
}
