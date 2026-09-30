/**
 * Hedgerows with real volume (`?land=rich`): a rounded, lumpy tube along each
 * run, its height and girth drifting with noise, its top uneven, a bush bulging
 * out here and there, its colour wandering between a few hedge greens. One
 * merged, smooth-shaded mesh for every run; the gates are gaps in the runs.
 *
 * Pure geometry (`three` only for the buffers), no React.
 */

import { BufferAttribute, BufferGeometry, Color } from "three";
import { hash01 } from "./noise";

export interface HedgeSegment {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  shade: number;
}

/** A few hedge greens, in sRGB, dark to light: hawthorn, beech-ish, privet, lush. */
const GREENS = ["#41703a", "#4d7b3c", "#5a863f", "#688f44", "#769a48", "#547a36"] as const;
const LEAF = GREENS.map((hex) => {
  const c = new Color(hex);
  return [c.r, c.g, c.b] as const;
});

/** Smooth 1-D value noise from hashes, along a run. */
function vnoise(t: number, salt: number): number {
  const i = Math.floor(t);
  const f = t - i;
  const s = f * f * (3 - 2 * f);
  return hash01(i, 0, salt) * (1 - s) + hash01(i + 1, 0, salt) * s;
}

/** Profile of a clipped-but-wild hedge in section: (sideways, height) as fractions of girth and height. */
const PROFILE: readonly [number, number][] = [
  [-1.0, 0.0],
  [-1.08, 0.38],
  [-0.78, 0.8],
  [-0.3, 0.98],
  [0.3, 1.0],
  [0.78, 0.82],
  [1.08, 0.4],
  [1.0, 0.0],
];

export interface HedgeOptions {
  /** Spacing of the cross-sections, world units. */
  step?: number;
  /** Stop adding runs once this much length is built. */
  budget?: number;
  /** A gate roughly this often, world units. */
  gateEvery?: number;
}

/**
 * The runs as one geometry, `sample` giving the ground height. Runs are
 * consumed in order until `budget` (world units of hedge) is spent, so a caller
 * sorts them nearest first.
 */
export function buildHedgeTubes(
  runs: readonly HedgeSegment[],
  sample: (x: number, z: number) => number,
  { step = 1.9, budget = 4200, gateEvery = 70 }: HedgeOptions = {},
): BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  let spent = 0;
  const ring = PROFILE.length;
  let runIndex = 0;
  for (const run of runs) {
    if (spent >= budget) break;
    runIndex++;
    const dx = run.x1 - run.x0;
    const dz = run.z1 - run.z0;
    const len = Math.hypot(dx, dz);
    if (len < 3) continue;
    const ux = dx / len;
    const uz = dz / len;
    // Sideways, in the ground plane.
    const nx = -uz;
    const nz = ux;
    const salt = Math.round(run.x0 * 3.1 + run.z0 * 5.3) + runIndex * 17;
    // Gates: where the noise says, a gap a few units wide.
    const gateAt = hash01(salt, 1, 77) < Math.min(0.9, len / gateEvery) ? 0.2 + hash01(salt, 2, 77) * 0.6 : -1;
    const gateW = 3.2 + hash01(salt, 3, 77) * 2;
    const tone = Math.min(LEAF.length - 1, Math.floor((run.shade * 0.6 + hash01(salt, 4, 78) * 0.4) * LEAF.length));
    const leaf = LEAF[tone];
    const baseH = 0.8 + hash01(salt, 5, 79) * 0.6;
    const baseW = 0.42 + hash01(salt, 6, 79) * 0.24;
    const stations = Math.max(2, Math.round(len / step) + 1);
    let prevRing = -1;
    for (let k = 0; k < stations; k++) {
      const t = k / (stations - 1);
      const s = t * len;
      if (gateAt >= 0 && Math.abs(s - gateAt * len) < gateW / 2) {
        prevRing = -1;
        continue;
      }
      const x = run.x0 + ux * s;
      const z = run.z0 + uz * s;
      const along = s / 4.2;
      // Height and girth wander on two scales, with a bush now and then.
      const low = vnoise(along * 0.45, salt);
      const mid = vnoise(along * 1.3 + 7, salt + 1);
      const bulge = Math.max(0, vnoise(along * 0.3 + 3, salt + 2) - 0.72) * 3.2;
      const h = baseH * (0.6 + 0.6 * low + 0.25 * mid) * (1 + bulge * 0.4);
      const w = baseW * (0.85 + 0.35 * low + 0.25 * mid) * (1 + bulge * 0.4);
      // The ends taper, so a run never stops like a wall.
      const gateEdge = gateAt >= 0 ? Math.abs(s - gateAt * len) - gateW / 2 : Infinity;
      const end = Math.min(1, Math.min(s, len - s, gateEdge) / 2.6);
      const taper = 0.12 + 0.88 * Math.sqrt(Math.max(0, end));
      const gy = sample(x, z) - 0.06;
      const patch = 0.88 + 0.26 * vnoise(along * 0.8, salt + 3);
      const first = pos.length / 3;
      for (let r = 0; r < ring; r++) {
        const [pu, pv] = PROFILE[r];
        // Lumpy: each vertex pushed in or out a little, the crown more.
        const lump = 1 + (hash01(k, r, salt + 9) - 0.5) * 0.46 * (0.4 + pv);
        const lx = pu * w * taper * lump;
        const ly = pv * h * taper * (0.86 + 0.3 * hash01(k, r + 11, salt + 10));
        pos.push(x + nx * lx, gy + ly, z + nz * lx);
        // Dark and cool at the foot, sunlit and warm on top.
        const k2 = patch * (0.62 + 0.3 * pv);
        const warm = 0.94 + 0.12 * pv;
        col.push(leaf[0] * k2 * warm, leaf[1] * k2, leaf[2] * k2 * (2 - warm) * 0.96);
      }
      if (prevRing >= 0) {
        for (let r = 0; r < ring - 1; r++) {
          const a = prevRing + r;
          const b = first + r;
          idx.push(a, a + 1, b, a + 1, b + 1, b);
        }
      }
      prevRing = first;
    }
    spent += len;
  }
  const g = new BufferGeometry();
  if (pos.length === 0) return g;
  g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute("color", new BufferAttribute(new Float32Array(col), 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
