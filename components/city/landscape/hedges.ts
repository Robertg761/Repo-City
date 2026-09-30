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
  [-1.08, 0.26],
  [-1.0, 0.56],
  [-0.74, 0.82],
  [-0.38, 0.97],
  [0.0, 1.02],
  [0.38, 0.97],
  [0.74, 0.82],
  [1.0, 0.56],
  [1.08, 0.26],
  [1.0, 0.0],
];

/** Vertices in one cross-section of the tube: the crown is the middle one. */
export const HEDGE_RING = PROFILE.length;
/** World units of hedge per texture repeat, along it and round it. */
const LEAF_TILE = 1.5;

/** A five-sided bipyramid, for the clumps of leaf along the crown: cheap, and the leaf texture rounds it. */
const CLUMP_VERTS: readonly (readonly [number, number, number])[] = [
  [0, 1, 0],
  [0, -0.55, 0],
  ...[0, 1, 2, 3, 4].map((i) => [Math.cos((i / 5) * Math.PI * 2), 0.15, Math.sin((i / 5) * Math.PI * 2)] as const),
];
const CLUMP_FACES: readonly (readonly [number, number, number])[] = [0, 1, 2, 3, 4].flatMap((i) => {
  const a = 2 + i;
  const b = 2 + ((i + 1) % 5);
  return [[0, b, a], [1, a, b]] as const;
});

export interface HedgeOptions {
  /** Spacing of the cross-sections, world units. */
  step?: number;
  /** Stop adding runs once this much length is built. */
  budget?: number;
  /** A gate roughly this often, world units. */
  gateEvery?: number;
  /** Clumps of leaf on the crown (default on). */
  clumps?: boolean;
}

/**
 * The runs as one geometry, `sample` giving the ground height. Runs are
 * consumed in order until `budget` (world units of hedge) is spent, so a caller
 * sorts them nearest first.
 *
 * Each run is a lumpy tube (smooth noise pushes the skin in and out over a
 * metre or two, a little random on top, the crown wandering in height) with
 * small clumps of leaf sitting on its crown, a gate and now and then a thin
 * gap. Colour is dark and cool at the foot and warm at the crown; UVs run in
 * world units so the leaf texture (`Landscape.tsx`'s hedge material) keeps
 * one size however the hedge swells.
 */
export function buildHedgeTubes(
  runs: readonly HedgeSegment[],
  sample: (x: number, z: number) => number,
  { step = 1.7, budget = 4200, gateEvery = 70, clumps = true }: HedgeOptions = {},
): BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  // Clumps are built apart and appended after the tube, so the tube's vertices keep their place.
  const bPos: number[] = [];
  const bCol: number[] = [];
  const bUv: number[] = [];
  const bIdx: number[] = [];
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
    // Gaps, as distances along the run: a gate where the noise says, and now and then a thin gap.
    const gaps: { at: number; w: number }[] = [];
    if (hash01(salt, 1, 77) < Math.min(0.9, len / gateEvery)) gaps.push({ at: (0.2 + hash01(salt, 2, 77) * 0.6) * len, w: 3.2 + hash01(salt, 3, 77) * 2 });
    const thin = Math.floor(len / 55 + hash01(salt, 7, 77));
    for (let g = 0; g < thin; g++) gaps.push({ at: (0.1 + hash01(salt, 8 + g, 77) * 0.8) * len, w: 0.9 + hash01(salt, 20 + g, 77) * 1.3 });
    const gapEdge = (s: number) => {
      let d = Infinity;
      for (const g of gaps) d = Math.min(d, Math.abs(s - g.at) - g.w / 2);
      return d;
    };
    const tone = Math.min(LEAF.length - 1, Math.floor((run.shade * 0.6 + hash01(salt, 4, 78) * 0.4) * LEAF.length));
    const leaf = LEAF[tone];
    const baseH = 0.8 + hash01(salt, 5, 79) * 0.6;
    const baseW = 0.42 + hash01(salt, 6, 79) * 0.24;
    const stations = Math.max(2, Math.round(len / step) + 1);
    let prevRing = -1;
    for (let k = 0; k < stations; k++) {
      const t = k / (stations - 1);
      const s = t * len;
      const edgeGap = gapEdge(s);
      if (edgeGap < 0) {
        prevRing = -1;
        continue;
      }
      const x = run.x0 + ux * s;
      const z = run.z0 + uz * s;
      const along = s / 4.2;
      // Height and girth wander on two scales, with a bush now and then.
      const low = vnoise(along * 0.45, salt);
      const mid = vnoise(along * 1.3 + 7, salt + 1);
      const crest = vnoise(s / 1.3 + 3, salt + 4);
      const bulge = Math.max(0, vnoise(along * 0.3 + 3, salt + 2) - 0.72) * 3.2;
      const h = baseH * (0.6 + 0.6 * low + 0.25 * mid + 0.22 * (crest - 0.5)) * (1 + bulge * 0.4);
      const w = baseW * (0.85 + 0.35 * low + 0.25 * mid) * (1 + bulge * 0.4);
      // The ends taper, so a run never stops like a wall.
      const end = Math.min(1, Math.min(s, len - s, edgeGap) / 2.6);
      const taper = 0.12 + 0.88 * Math.sqrt(Math.max(0, end));
      const gy = sample(x, z) - 0.06;
      const patch = 0.88 + 0.26 * vnoise(along * 0.8, salt + 3);
      const first = pos.length / 3;
      const perimeter = (w * 2.3 + h * 2.2) * taper;
      for (let r = 0; r < ring; r++) {
        const [pu, pv] = PROFILE[r];
        // Lumpy: smooth noise over a metre or so pushes the skin in and out (the crown more), with a little random on top.
        const lumpy = vnoise(s / 1.15 + r * 1.9, salt + 9) - 0.5;
        const lump = 1 + lumpy * 0.62 * (0.45 + pv) + (hash01(k, r, salt + 12) - 0.5) * 0.12;
        const lx = pu * w * taper * lump;
        const ly = pv * h * taper * (0.86 + 0.3 * vnoise(s / 0.9 + r * 2.7, salt + 10)) * (0.94 + 0.12 * lump);
        pos.push(x + nx * lx, gy + ly, z + nz * lx);
        // Dark and cool in the foot, sunlit and warm on top.
        const k2 = patch * (0.5 + 0.42 * pv);
        const warm = 0.92 + 0.16 * pv;
        col.push(leaf[0] * k2 * warm, leaf[1] * k2, leaf[2] * k2 * (2 - warm) * (0.9 + 0.1 * pv));
        uv.push(s / LEAF_TILE + salt * 0.137, (r / (ring - 1)) * (perimeter / LEAF_TILE) + salt * 0.291);
      }
      if (prevRing >= 0) {
        for (let r = 0; r < ring - 1; r++) {
          const a = prevRing + r;
          const b = first + r;
          idx.push(a, a + 1, b, a + 1, b + 1, b);
        }
      }
      prevRing = first;
      // Clumps of leaf on the crown, where the hedge is full grown.
      if (clumps && taper > 0.6 && hash01(k, 91, salt) < 0.22) {
        const cr = (0.14 + 0.2 * hash01(k, 92, salt)) * (0.7 + 0.5 * h);
        const side = (hash01(k, 93, salt) - 0.5) * 1.3 * w * taper;
        const cx = x + nx * side;
        const cz = z + nz * side;
        const cy = gy + h * taper * (0.95 + 0.1 * crest) - cr * 0.2;
        const at = bPos.length / 3;
        const tintK = (0.92 + 0.3 * hash01(k, 94, salt)) * patch;
        for (let v = 0; v < CLUMP_VERTS.length; v++) {
          const [vx, vy, vz] = CLUMP_VERTS[v];
          const j = 0.78 + 0.44 * hash01(k, 100 + v, salt);
          bPos.push(cx + vx * cr * j * 1.15, cy + vy * cr * j * 0.8, cz + vz * cr * j * 1.15);
          // Lit from above: the clump is brighter on its upper half.
          const up = 0.82 + 0.3 * (vy * 0.5 + 0.5);
          bCol.push(leaf[0] * tintK * up * 1.05, leaf[1] * tintK * up * 1.08, leaf[2] * tintK * up * 0.92);
          bUv.push(s / LEAF_TILE + vx * 0.4 + 0.3, vz * 0.4 + vy * 0.3 + hash01(k, 95, salt));
        }
        for (const [a, b, c] of CLUMP_FACES) bIdx.push(at + a, at + b, at + c);
      }
    }
    spent += len;
  }
  const g = new BufferGeometry();
  if (pos.length === 0) return g;
  const tubeCount = pos.length / 3;
  pos.push(...bPos);
  col.push(...bCol);
  uv.push(...bUv);
  for (const i of bIdx) idx.push(i + tubeCount);
  g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute("color", new BufferAttribute(new Float32Array(col), 3));
  g.setAttribute("uv", new BufferAttribute(new Float32Array(uv), 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
