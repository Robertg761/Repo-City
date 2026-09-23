/**
 * Finds the faces of a merged model that would z-fight: two triangles facing
 * the same way, in the same plane or within a hair of it, whose areas overlap.
 * The depth buffer cannot tell them apart, so the camera sees them flicker in
 * stripes as it moves. It is the geometry test for every detail laid on a
 * host face -- a window frame on a wall, a band round a tower, a chimney cap
 * on its stack -- and for merged parts that duplicate each other's faces.
 *
 * Positions are in the model's own space. `scale` is the per-axis scale the
 * model is drawn at (a building archetype is authored in a unit cube and
 * stretched to its footprint and height per instance), so the separation
 * reported is the one the depth buffer sees. Pure arrays, no three.js.
 */

export interface CoplanarPair {
  /** Triangle indices, in index-buffer order. */
  a: number;
  b: number;
  /** The shared outward normal, in model space. */
  normal: [number, number, number];
  /** Distance between the two planes after scaling, in world units. */
  separation: number;
  /** Overlapping area, in model-space units squared. */
  overlap: number;
  /** A point inside the overlap, in model space. */
  at: [number, number, number];
}

type V = [number, number, number];

const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

type P2 = [number, number];

function area2(poly: readonly P2[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x0, y0] = poly[i];
    const [x1, y1] = poly[(i + 1) % poly.length];
    s += x0 * y1 - x1 * y0;
  }
  return s / 2;
}

/** Sutherland-Hodgman: `subject` clipped by the convex, counter-clockwise `clip`. */
function clip(subject: readonly P2[], clipPoly: readonly P2[]): P2[] {
  let out: P2[] = [...subject];
  for (let i = 0; i < clipPoly.length && out.length; i++) {
    const a = clipPoly[i];
    const b = clipPoly[(i + 1) % clipPoly.length];
    const side = (p: P2) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
    const input = out;
    out = [];
    for (let j = 0; j < input.length; j++) {
      const p = input[j];
      const q = input[(j + 1) % input.length];
      const sp = side(p);
      const sq = side(q);
      if (sp >= 0) out.push(p);
      if ((sp >= 0) !== (sq >= 0)) {
        const t = sp / (sp - sq);
        out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
      }
    }
  }
  return out;
}

export function coplanarOverlaps(
  positions: ArrayLike<number>,
  indices: ArrayLike<number> | null,
  options: {
    /** Planes closer than this (world units, after `scale`) count as one. */
    within: number;
    /** Overlaps smaller than this (model units squared) are ignored. */
    minOverlap?: number;
    scale?: readonly [number, number, number];
    /**
     * Skip overlaps with another face of the model this close in front of
     * them (model units): they are buried inside a volume and never seen.
     */
    buriedWithin?: number;
  },
): CoplanarPair[] {
  const scale = options.scale ?? [1, 1, 1];
  const minOverlap = options.minOverlap ?? 1e-6;
  const count = indices ? indices.length / 3 : positions.length / 9;
  const vertex = (i: number): V => [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]];
  const tris: { p: V[]; n: V; d: number; stretch: number; i: number }[] = [];
  for (let t = 0; t < count; t++) {
    const ids = indices ? [indices[t * 3], indices[t * 3 + 1], indices[t * 3 + 2]] : [t * 3, t * 3 + 1, t * 3 + 2];
    const p = ids.map(vertex);
    const c = cross(sub(p[1], p[0]), sub(p[2], p[0]));
    const len = Math.hypot(c[0], c[1], c[2]);
    if (len < 1e-9) continue;
    const n: V = [c[0] / len, c[1] / len, c[2] / len];
    // How much a model-space distance along `n` stretches when scaled.
    const inv = Math.hypot(n[0] / scale[0], n[1] / scale[1], n[2] / scale[2]);
    tris.push({ p, n, d: dot(n, p[0]), stretch: 1 / inv, i: t });
  }

  // A point is buried when it is inside a closed volume of the model's own --
  // walking out along the normal, the faces crossed leave more volumes than
  // they enter (a wall behind a sill, a stack inside its cap, a column top
  // under a roof slab) -- or when a face looks back at it from closer than
  // `buriedWithin` (it is covered: a pane under the glazing bar in front).
  // Either way the camera never sees the two faces fight there.
  const buried = (from: V, n: V, skip: readonly number[]): boolean => {
    const hits: { t: number; leaving: boolean }[] = [];
    for (const T of tris) {
      if (skip.includes(T.i)) continue;
      const denom = dot(T.n, n);
      if (Math.abs(denom) < 1e-9) continue;
      const t = (T.d - dot(T.n, from)) / denom;
      if (t < 0) continue;
      const hit: V = [from[0] + n[0] * t, from[1] + n[1] * t, from[2] + n[2] * t];
      // Inside the triangle: same side of all three edges.
      let inside = true;
      for (let e = 0; e < 3 && inside; e++) {
        const a = T.p[e];
        const b = T.p[(e + 1) % 3];
        if (dot(cross(sub(b, a), sub(hit, a)), T.n) < -1e-12) inside = false;
      }
      if (inside) hits.push({ t, leaving: denom > 0 });
    }
    hits.sort((a, b) => a.t - b.t);
    if (hits.length > 0 && !hits[0].leaving && hits[0].t <= (options.buriedWithin ?? 0)) return true;
    let depth = 0;
    for (const hit of hits) {
      depth += hit.leaving ? -1 : 1;
      if (depth < 0) return true;
    }
    return false;
  };

  const pairs: CoplanarPair[] = [];
  for (let x = 0; x < tris.length; x++) {
    const A = tris[x];
    // A 2D frame in A's plane.
    const helper: V = Math.abs(A.n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const u0 = cross(helper, A.n);
    const ul = Math.hypot(...u0);
    const u: V = [u0[0] / ul, u0[1] / ul, u0[2] / ul];
    const v = cross(A.n, u);
    const flat = (p: V): P2 => [dot(p, u), dot(p, v)];
    let a2 = A.p.map(flat);
    if (area2(a2) < 0) a2 = [a2[0], a2[2], a2[1]];
    for (let y = x + 1; y < tris.length; y++) {
      const B = tris[y];
      if (dot(A.n, B.n) < 0.99995) continue;
      const separation = Math.abs(B.d - A.d) * A.stretch;
      if (separation >= options.within) continue;
      let b2 = B.p.map(flat);
      if (area2(b2) < 0) b2 = [b2[0], b2[2], b2[1]];
      const overlap = clip(b2, a2);
      if (overlap.length < 3) continue;
      const area = Math.abs(area2(overlap));
      if (area < minOverlap) continue;
      const cu = overlap.reduce((s, p) => s + p[0], 0) / overlap.length;
      const cv = overlap.reduce((s, p) => s + p[1], 0) / overlap.length;
      const lift = (p: P2): V => [
        u[0] * p[0] + v[0] * p[1] + A.n[0] * A.d,
        u[1] * p[0] + v[1] * p[1] + A.n[1] * A.d,
        u[2] * p[0] + v[2] * p[1] + A.n[2] * A.d,
      ];
      const at = lift([cu, cv]);
      // Visible if any of a few points spread over the overlap is not buried.
      const front = Math.max(A.d, B.d) - A.d + 1e-6;
      const samples: P2[] = [[cu, cv], ...overlap.map((p): P2 => [cu + (p[0] - cu) * 0.8, cv + (p[1] - cv) * 0.8])];
      const seen = samples.some((q) => {
        const w = lift(q);
        return !buried([w[0] + A.n[0] * front, w[1] + A.n[1] * front, w[2] + A.n[2] * front], A.n, [A.i, B.i]);
      });
      if (!seen) continue;
      pairs.push({ a: A.i, b: B.i, normal: A.n, separation, overlap: area, at });
    }
  }
  return pairs;
}
