/**
 * The patchwork of the land (`?land=rich`): irregular convex cells, from a
 * power diagram of scattered seeds, so fields are merged and split by the
 * noise that spaces the seeds (large cells where it is high, small where it
 * is low) and never sit on a lattice. Each cell can then be trimmed to keep
 * clear of roads, rivers, ponds and the plot, so the fields follow the
 * things they meet: a cell next to a road is cut parallel to it.
 *
 * Pure geometry on `{ x, z }` points: no three.js, no plan types. Every cell's
 * edges carry a label (`edge[k]` runs from `pts[k]` to `pts[k + 1]`): the index
 * of the neighbouring seed, `EDGE_FAR` for the diagram's own outer boundary,
 * or `EDGE_CUT` for an edge made by trimming.
 */

import { hash01 } from "./noise";

export interface P2 {
  x: number;
  z: number;
}

export interface Seed {
  x: number;
  z: number;
  /** Half the cell's width: the seed's weight in the diagram. */
  r: number;
}

export interface Cell {
  id: number;
  seed: Seed;
  pts: P2[];
  edge: number[];
}

export const EDGE_FAR = -1;
export const EDGE_CUT = -2;

/**
 * Seeds by dart throwing: candidates on a fine jittered grid, tried in a
 * hashed order, each kept if no kept seed is closer than the two radii allow.
 * `scale(x, z)` is the local cell size as a multiple of `cell`.
 */
export function scatterSeeds(
  extent: number,
  cell: number,
  salt: number,
  scale: (x: number, z: number) => number,
  keep: (x: number, z: number) => boolean,
): Seed[] {
  const pitch = cell * 0.42;
  const n = Math.ceil(extent / pitch);
  const cand: { x: number; z: number; key: number }[] = [];
  for (let i = -n; i <= n; i++) {
    for (let j = -n; j <= n; j++) {
      const x = (i + hash01(i, j, salt + 1)) * pitch;
      const z = (j + hash01(i, j, salt + 2)) * pitch;
      if (!keep(x, z)) continue;
      cand.push({ x, z, key: hash01(i, j, salt + 3) });
    }
  }
  cand.sort((a, b) => a.key - b.key);
  const bucket = cell * 1.6;
  const grid = new Map<string, Seed[]>();
  const out: Seed[] = [];
  for (const c of cand) {
    const r = (cell * scale(c.x, c.z)) / 2;
    const gi = Math.floor(c.x / bucket);
    const gj = Math.floor(c.z / bucket);
    const span = Math.ceil((r * 2.2) / bucket) + 1;
    let ok = true;
    for (let a = gi - span; a <= gi + span && ok; a++) {
      for (let b = gj - span; b <= gj + span && ok; b++) {
        const list = grid.get(`${a}:${b}`);
        if (!list) continue;
        for (const s of list) {
          if (Math.hypot(s.x - c.x, s.z - c.z) < (s.r + r) * 0.98) {
            ok = false;
            break;
          }
        }
      }
    }
    if (!ok) continue;
    const seed = { x: c.x, z: c.z, r };
    out.push(seed);
    const key = `${gi}:${gj}`;
    const list = grid.get(key);
    if (list) list.push(seed);
    else grid.set(key, [seed]);
  }
  return out;
}

/** Keeps the part of a convex polygon where `a x + b z <= c`; new edges take `label`. */
export function clipHalfPlane(pts: readonly P2[], edge: readonly number[], a: number, b: number, c: number, label: number): { pts: P2[]; edge: number[] } {
  const out: P2[] = [];
  const outE: number[] = [];
  const n = pts.length;
  for (let k = 0; k < n; k++) {
    const p = pts[k];
    const q = pts[(k + 1) % n];
    const dp = a * p.x + b * p.z - c;
    const dq = a * q.x + b * q.z - c;
    const pin = dp <= 0;
    const qin = dq <= 0;
    if (pin) {
      out.push(p);
      outE.push(edge[k]);
      if (!qin) {
        const t = dp / (dp - dq);
        out.push({ x: p.x + (q.x - p.x) * t, z: p.z + (q.z - p.z) * t });
        outE.push(label);
      }
    } else if (qin) {
      const t = dp / (dp - dq);
      out.push({ x: p.x + (q.x - p.x) * t, z: p.z + (q.z - p.z) * t });
      outE.push(edge[k]);
    }
  }
  return { pts: out, edge: outE };
}

export function polyArea(pts: readonly P2[]): number {
  let s = 0;
  for (let k = 0; k < pts.length; k++) {
    const p = pts[k];
    const q = pts[(k + 1) % pts.length];
    s += p.x * q.z - q.x * p.z;
  }
  return Math.abs(s) / 2;
}

export function polyCentroid(pts: readonly P2[]): P2 {
  let x = 0;
  let z = 0;
  for (const p of pts) {
    x += p.x;
    z += p.z;
  }
  return { x: x / pts.length, z: z / pts.length };
}

/** The power-diagram cell of every seed, each bounded by a box round its own seed. */
export function voronoiCells(seeds: readonly Seed[]): Cell[] {
  const maxR = seeds.reduce((m, s) => Math.max(m, s.r), 1);
  const bucket = maxR * 3;
  const grid = new Map<string, number[]>();
  seeds.forEach((s, i) => {
    const key = `${Math.floor(s.x / bucket)}:${Math.floor(s.z / bucket)}`;
    const list = grid.get(key);
    if (list) list.push(i);
    else grid.set(key, [i]);
  });
  const cells: Cell[] = [];
  seeds.forEach((s, i) => {
    const R = s.r * 1.75;
    let pts: P2[] = [
      { x: s.x - R, z: s.z - R },
      { x: s.x + R, z: s.z - R },
      { x: s.x + R, z: s.z + R },
      { x: s.x - R, z: s.z + R },
    ];
    let edge: number[] = [EDGE_FAR, EDGE_FAR, EDGE_FAR, EDGE_FAR];
    const gi = Math.floor(s.x / bucket);
    const gj = Math.floor(s.z / bucket);
    const near: number[] = [];
    for (let a = gi - 1; a <= gi + 1; a++) {
      for (let b = gj - 1; b <= gj + 1; b++) {
        for (const j of grid.get(`${a}:${b}`) ?? []) if (j !== i) near.push(j);
      }
    }
    near.sort((p, q) => Math.hypot(seeds[p].x - s.x, seeds[p].z - s.z) - Math.hypot(seeds[q].x - s.x, seeds[q].z - s.z));
    const wi = (s.r * 0.6) ** 2;
    for (const j of near) {
      const o = seeds[j];
      const wj = (o.r * 0.6) ** 2;
      const a = 2 * (o.x - s.x);
      const b = 2 * (o.z - s.z);
      const c = o.x * o.x + o.z * o.z - s.x * s.x - s.z * s.z - wj + wi;
      const res = clipHalfPlane(pts, edge, a, b, c, j);
      pts = res.pts;
      edge = res.edge;
      if (pts.length < 3) break;
    }
    if (pts.length >= 3) cells.push({ id: i, seed: s, pts, edge });
  });
  return cells;
}

/** Pulls every edge of a convex polygon in by `d` (edges keep their labels). */
export function insetPolygon(pts: readonly P2[], edge: readonly number[], d: number): { pts: P2[]; edge: number[] } {
  let cur = { pts: pts.slice(), edge: edge.slice() };
  const n = pts.length;
  // Counter-clockwise or clockwise: the sign of the area says which side is in.
  let s = 0;
  for (let k = 0; k < n; k++) s += pts[k].x * pts[(k + 1) % n].z - pts[(k + 1) % n].x * pts[k].z;
  const sign = s >= 0 ? 1 : -1;
  for (let k = 0; k < n; k++) {
    const p = pts[k];
    const q = pts[(k + 1) % n];
    const len = Math.hypot(q.x - p.x, q.z - p.z);
    if (len < 1e-6) continue;
    // Outward normal of this edge.
    const nx = (sign * (q.z - p.z)) / len;
    const nz = (-sign * (q.x - p.x)) / len;
    const c = nx * p.x + nz * p.z - d;
    cur = clipHalfPlane(cur.pts, cur.edge, nx, nz, c, edge[k]);
    if (cur.pts.length < 3) break;
  }
  return cur;
}

/** A point in a convex polygon. */
export function insidePoly(pts: readonly P2[], x: number, z: number): boolean {
  let sign = 0;
  for (let k = 0; k < pts.length; k++) {
    const p = pts[k];
    const q = pts[(k + 1) % pts.length];
    const cross = (q.x - p.x) * (z - p.z) - (q.z - p.z) * (x - p.x);
    if (cross === 0) continue;
    const s = cross > 0 ? 1 : -1;
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

/** Heading of a polygon's longest edge, for the way its crop rows run. */
export function longestEdgeYaw(pts: readonly P2[]): number {
  let best = 0;
  let yaw = 0;
  for (let k = 0; k < pts.length; k++) {
    const p = pts[k];
    const q = pts[(k + 1) % pts.length];
    const len = Math.hypot(q.x - p.x, q.z - p.z);
    if (len > best) {
      best = len;
      yaw = Math.atan2(q.x - p.x, q.z - p.z);
    }
  }
  return yaw;
}

/** Signed distance to the nearest edge of a convex polygon: negative inside. */
export function convexDistance(pts: readonly P2[], x: number, z: number): number {
  let s = 0;
  const n = pts.length;
  for (let k = 0; k < n; k++) s += pts[k].x * pts[(k + 1) % n].z - pts[(k + 1) % n].x * pts[k].z;
  const sign = s >= 0 ? 1 : -1;
  let worst = -Infinity;
  for (let k = 0; k < n; k++) {
    const p = pts[k];
    const q = pts[(k + 1) % n];
    const len = Math.hypot(q.x - p.x, q.z - p.z) || 1;
    const d = (sign * ((q.z - p.z) * (x - p.x) - (q.x - p.x) * (z - p.z))) / len;
    if (d > worst) worst = d;
  }
  return worst;
}
