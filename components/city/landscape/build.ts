/**
 * The landscape's geometry, built from a `LandscapePlan` (`plan.ts`): the
 * terrain, ribbons for rivers and roads, conforming fields, hedges, the
 * instanced trees and houses, a skyline, bridges. Everything is plain
 * three.js geometry with vertex colours, merged wherever it can be, so the
 * whole land is a couple of dozen draw calls. No React here: it runs in node
 * for the tests.
 *
 * Colours are set from `Color` so they are in the renderer's linear space.
 */

import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  Matrix4,
  RepeatWrapping,
  RGBAFormat,
  UnsignedByteType,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { BARRIER_COLOR, SHOULDER_COLOR, desaturate, mix } from "../palette";
import type { RoadStyle } from "../groundwork";
import { fbm, hash01, smooth01 } from "./noise";
import { GROUND_Y, distToPath, pondEdge, pondShore, type Crop, type LandscapePlan, type Pond, type Pt, type River, type TowerSpot } from "./plan";
import { bankDepth, bankMix, riverSpec, trenchReach } from "./water";

export const TERRAIN_RINGS = 72;
export const TERRAIN_SECTORS = 208;
const RING_POWER = 1.6;

const linear = (hex: string): [number, number, number] => {
  const c = new Color(hex);
  return [c.r, c.g, c.b];
};

// ---------------------------------------------------------------------------
// Terrain
// ---------------------------------------------------------------------------

export interface Terrain {
  geometry: BufferGeometry;
  /** The height of the drawn mesh (bilinear over its rings and sectors). */
  sample: (x: number, z: number) => number;
}

export type Paint = (x: number, z: number, height: number, out: Color) => void;

/**
 * A disc of rings and sectors, fine near the city and coarse at the rim,
 * heights from the plan and colours from `paint`. UVs are world units over
 * the lawn's tile, so the ground texture never stretches with the mesh.
 */
export function buildTerrain(plan: LandscapePlan, paint: Paint, tile = 13): Terrain {
  const NR = TERRAIN_RINGS;
  const NS = TERRAIN_SECTORS;
  const count = (NR + 1) * NS;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const uvs = new Float32Array(count * 2);
  const heights = new Float32Array(count);
  const scratch = new Color();
  for (let k = 0; k <= NR; k++) {
    const r = plan.reach * Math.pow(k / NR, RING_POWER);
    for (let s = 0; s < NS; s++) {
      const a = (s / NS) * Math.PI * 2;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const h = plan.height(x, z);
      const i = k * NS + s;
      heights[i] = h;
      positions.set([x, h, z], i * 3);
      uvs.set([x / tile, z / tile], i * 2);
      paint(x, z, h, scratch);
      colors.set([scratch.r, scratch.g, scratch.b], i * 3);
    }
  }
  const index: number[] = [];
  for (let k = 0; k < NR; k++) {
    for (let s = 0; s < NS; s++) {
      const s1 = (s + 1) % NS;
      const a = k * NS + s;
      const b = k * NS + s1;
      const c = (k + 1) * NS + s;
      const d = (k + 1) * NS + s1;
      // Wound to face up (+y).
      index.push(a, b, c, b, d, c);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("color", new BufferAttribute(colors, 3));
  geometry.setAttribute("uv", new BufferAttribute(uvs, 2));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();

  const sample = (x: number, z: number): number => {
    const r = Math.hypot(x, z);
    if (r >= plan.reach) return heights[NR * NS];
    const kf = NR * Math.pow(r / plan.reach, 1 / RING_POWER);
    const k0 = Math.min(NR - 1, Math.floor(kf));
    const fk = kf - k0;
    let sf = (Math.atan2(z, x) / (Math.PI * 2)) * NS;
    if (sf < 0) sf += NS;
    const s0 = Math.floor(sf) % NS;
    const s1 = (s0 + 1) % NS;
    const fs = sf - Math.floor(sf);
    const h00 = heights[k0 * NS + s0];
    const h01 = heights[k0 * NS + s1];
    const h10 = heights[(k0 + 1) * NS + s0];
    const h11 = heights[(k0 + 1) * NS + s1];
    return (h00 * (1 - fs) + h01 * fs) * (1 - fk) + (h10 * (1 - fs) + h11 * fs) * fk;
  };
  return { geometry, sample };
}

/**
 * How the ground is coloured at a point: the hour's grass, warmer and paler
 * on the high ground, deeper in the valleys and under woods, mud on the banks.
 */
export function terrainPainter(plan: LandscapePlan, grass: string): Paint {
  const high = linear("#9db26a");
  const deep = linear("#4f9a4c");
  const wood = linear("#3f7f42");
  const mud = linear("#8b7c5c");
  const base = linear(grass).map((v) => v * 0.94) as [number, number, number];
  const amp = Math.max(plan.profile.hills * plan.size, 1);
  return (x, z, h, out) => {
    const rise = smooth01((h - GROUND_Y) / (amp * 1.8));
    const forest = plan.forest(x, z) * smooth01((Math.max(Math.abs(x), Math.abs(z)) - plan.half * 1.1) / (plan.size * 0.3));
    let r = base[0];
    let g = base[1];
    let b = base[2];
    const mixIn = (c: [number, number, number], t: number) => {
      r += (c[0] - r) * t;
      g += (c[1] - g) * t;
      b += (c[2] - b) * t;
    };
    mixIn(high, rise * 0.55);
    mixIn(wood, forest * 0.5);
    // The valley floor beside water is lusher, and the bank itself is mud.
    let nearWater = 1e9;
    for (const river of plan.rivers) {
      const d = distToPath(river.pts, x, z, 0, river.width / 2 + 40) - river.width / 2;
      if (d < nearWater) nearWater = d;
    }
    if (nearWater < 40) mixIn(deep, (1 - smooth01(nearWater / 40)) * 0.35);
    if (nearWater < 3) mixIn(mud, (1 - smooth01(nearWater / 3)) * 0.3);
    out.setRGB(r, g, b);
  };
}

// ---------------------------------------------------------------------------
// Ribbons: rivers and roads
// ---------------------------------------------------------------------------

export interface RibbonOptions {
  /** World units along the ribbon per texture repeat. */
  along?: number;
  /** Vertex colour at the middle and at the two edges. */
  centre?: string;
  edge?: string;
  /** Points closer to the origin than this are skipped (the model's own road). */
  from?: number;
}

/** A strip along a polyline, `y(x, z)` giving its height at each vertex. */
export function buildRibbon(
  pts: readonly Pt[],
  width: number,
  y: (x: number, z: number) => number,
  { along = 20, centre = "#ffffff", edge = "#ffffff", from = 0 }: RibbonOptions = {},
): BufferGeometry {
  const use = pts.slice(from);
  const n = use.length;
  const positions = new Float32Array(n * 2 * 3);
  const colors = new Float32Array(n * 2 * 3);
  const uvs = new Float32Array(n * 2 * 2);
  const index: number[] = [];
  const cEdge = linear(edge);
  const cMid = linear(centre);
  void cMid;
  let run = 0;
  for (let i = 0; i < n; i++) {
    const a = use[Math.max(i - 1, 0)];
    const b = use[Math.min(i + 1, n - 1)];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz) || 1;
    const nx = -dz / len;
    const nz = dx / len;
    if (i > 0) run += Math.hypot(use[i].x - use[i - 1].x, use[i].z - use[i - 1].z);
    for (const side of [-1, 1] as const) {
      const px = use[i].x + nx * (width / 2) * side;
      const pz = use[i].z + nz * (width / 2) * side;
      const v = i * 2 + (side < 0 ? 0 : 1);
      positions.set([px, y(px, pz), pz], v * 3);
      colors.set(cEdge, v * 3);
      uvs.set([side < 0 ? 0 : 1, run / along], v * 2);
    }
    if (i + 1 < n) {
      const a0 = i * 2;
      // Wound to face up.
      index.push(a0, a0 + 1, a0 + 2, a0 + 1, a0 + 3, a0 + 2);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("color", new BufferAttribute(colors, 3));
  geometry.setAttribute("uv", new BufferAttribute(uvs, 2));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

// ---------------------------------------------------------------------------
// Water and its banks
// ---------------------------------------------------------------------------

const WET = linear("#4a3a29");
const MUD = linear("#8a7450");
const BED = linear("#3a4942");

/** Offsets from the water's edge, outwards, where a bank's cross-section has a vertex. */
function bankSteps(bank: number): number[] {
  return [0, 0.35, 0.9, 1.6, 2.6, bank * 0.65, bank * 0.88, bank, bank * 1.4, bank * 1.75 + 4];
}

/** The water's surface lies this far above a bank's foot (`GROUND_Y - drop`), so the two never share a plane. */
export const WATER_LIFT = 0.03;

function bankVertex(
  plan: LandscapePlan,
  paint: Paint,
  x: number,
  z: number,
  d: number,
  spec: { bank: number; drop: number },
  half: number,
  out: { pos: number[]; col: number[]; uv: number[] },
  scratch: Color,
): void {
  const level = plan.level(x, z);
  let y: number;
  if (d <= spec.bank) y = level - bankDepth(d, spec, half);
  else if (d <= trenchReach(spec)) y = level - 0.04;
  else y = level - 0.12;
  paint(x, z, y, scratch);
  const m = bankMix(d, spec);
  const wobble = 0.94 + 0.12 * hash01(Math.round(x * 1.7), Math.round(z * 1.7), plan.seed + 31);
  const r = scratch.r * m.land + WET[0] * m.wet * wobble + MUD[0] * m.mud * wobble + BED[0] * m.bed;
  const g = scratch.g * m.land + WET[1] * m.wet * wobble + MUD[1] * m.mud * wobble + BED[1] * m.bed;
  const b = scratch.b * m.land + WET[2] * m.wet * wobble + MUD[2] * m.mud * wobble + BED[2] * m.bed;
  out.pos.push(x, y, z);
  out.col.push(r, g, b);
  out.uv.push(x / 13, z / 13);
}

/**
 * The banks: for every river a strip along it, cut across at offsets that are
 * close together near the water and further apart above, its heights the land's
 * own (`plan.level`) less the bank's depth there (`water.ts`), its colours the
 * wet edge, mud, then the land's own. Ponds get the same as rings. The terrain
 * under them is trenched deeper, so this exact mesh always shows through it.
 */
export function buildBanks(plan: LandscapePlan, paint: Paint): BufferGeometry {
  const out = { pos: [] as number[], col: [] as number[], uv: [] as number[] };
  const idx: number[] = [];
  const scratch = new Color();
  for (const river of plan.rivers) {
    const half = river.width / 2;
    const spec = river.spec;
    const offsets: number[] = [];
    const steps = bankSteps(spec.bank);
    const inner = [0, half * 0.5];
    // Ascending from the far left bank to the far right one.
    for (const d of [...steps].reverse()) offsets.push(-(half + d));
    for (const o of [...inner].reverse()) if (o > 0) offsets.push(-o);
    offsets.push(0);
    for (const o of inner) if (o > 0) offsets.push(o);
    for (const d of steps) offsets.push(half + d);
    const pts = river.pts.filter((p) => Math.hypot(p.x, p.z) < plan.reach * 1.02);
    const base = out.pos.length / 3;
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(i - 1, 0)];
      const b = pts[Math.min(i + 1, n - 1)];
      const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      const nx = -(b.z - a.z) / len;
      const nz = (b.x - a.x) / len;
      for (const o of offsets) {
        bankVertex(plan, paint, pts[i].x + nx * o, pts[i].z + nz * o, Math.abs(o) - half, spec, half, out, scratch);
      }
    }
    const W = offsets.length;
    for (let i = 0; i + 1 < n; i++) {
      for (let k = 0; k + 1 < W; k++) {
        const a = base + i * W + k;
        // Wound to face up.
        idx.push(a, a + 1, a + W, a + 1, a + W + 1, a + W);
      }
    }
  }
  for (const pond of plan.ponds) addPondBank(plan, paint, pond, out, idx, scratch);
  const g = new BufferGeometry();
  if (out.pos.length === 0) return g;
  g.setAttribute("position", new BufferAttribute(new Float32Array(out.pos), 3));
  g.setAttribute("color", new BufferAttribute(new Float32Array(out.col), 3));
  g.setAttribute("uv", new BufferAttribute(new Float32Array(out.uv), 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const SEGMENTS = 36;

function addPondBank(plan: LandscapePlan, paint: Paint, pond: Pond, out: { pos: number[]; col: number[]; uv: number[] }, idx: number[], scratch: Color): void {
  const minR = Math.min(pond.rx, pond.rz);
  const ds = [-minR, -minR * 0.6, -minR * 0.25, ...bankSteps(pond.spec.bank)];
  const c = Math.cos(pond.yaw);
  const s = Math.sin(pond.yaw);
  const base = out.pos.length / 3;
  for (const d of ds) {
    for (let k = 0; k < SEGMENTS; k++) {
      const a = (k / SEGMENTS) * Math.PI * 2;
      const r = pondShore(pond, a) * (1 + d / minR);
      const lx = Math.cos(a) * r * pond.rx;
      const lz = Math.sin(a) * r * pond.rz;
      bankVertex(plan, paint, pond.x + lx * c - lz * s, pond.z + lx * s + lz * c, d, pond.spec, minR * 0.8, out, scratch);
    }
  }
  const R = ds.length;
  for (let r = 0; r + 1 < R; r++) {
    for (let k = 0; k < SEGMENTS; k++) {
      const k1 = (k + 1) % SEGMENTS;
      const a = base + r * SEGMENTS + k;
      const b = base + r * SEGMENTS + k1;
      const cc = base + (r + 1) * SEGMENTS + k;
      const dd = base + (r + 1) * SEGMENTS + k1;
      idx.push(a, b, cc, b, dd, cc);
    }
  }
}

/** Water surfaces: a strip along each river and a disc for each pond, with `aDepth` (0 at the shore, 1 in the deep) for the shader. */
export function buildWater(plan: LandscapePlan): BufferGeometry {
  const pos: number[] = [];
  const dep: number[] = [];
  const idx: number[] = [];
  const depthOf = (inFromEdge: number, cap: number) => smooth01(inFromEdge / Math.max(cap, 0.5));
  for (const river of plan.rivers) {
    const half = river.width / 2;
    const y = GROUND_Y - river.spec.drop + WATER_LIFT;
    const cap = Math.min(half, 4.5);
    const ins = [-0.5, 0, 0.6, 1.4, 2.6, 4.2].filter((v) => v < half);
    const offsets: number[] = [];
    for (const v of [...ins].reverse()) offsets.push(-(half - v));
    offsets.push(0);
    for (const v of ins) offsets.push(half - v);
    const pts = river.pts.filter((p) => Math.hypot(p.x, p.z) < plan.reach * 1.02);
    const base = pos.length / 3;
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(i - 1, 0)];
      const b = pts[Math.min(i + 1, n - 1)];
      const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      const nx = -(b.z - a.z) / len;
      const nz = (b.x - a.x) / len;
      for (const o of offsets) {
        pos.push(pts[i].x + nx * o, y, pts[i].z + nz * o);
        dep.push(depthOf(half - Math.abs(o), cap));
      }
    }
    const W = offsets.length;
    for (let i = 0; i + 1 < n; i++) {
      for (let k = 0; k + 1 < W; k++) {
        const a = base + i * W + k;
        idx.push(a, a + 1, a + W, a + 1, a + W + 1, a + W);
      }
    }
  }
  for (const pond of plan.ponds) {
    const minR = Math.min(pond.rx, pond.rz);
    const y = GROUND_Y - pond.spec.drop + WATER_LIFT;
    const ds = [-minR, -minR * 0.5, -3.2, -1.8, -0.7, 0, 0.5];
    const c = Math.cos(pond.yaw);
    const s = Math.sin(pond.yaw);
    const base = pos.length / 3;
    for (const d of ds) {
      for (let k = 0; k < SEGMENTS; k++) {
        const a = (k / SEGMENTS) * Math.PI * 2;
        const r = pondShore(pond, a) * (1 + d / minR);
        const lx = Math.cos(a) * r * pond.rx;
        const lz = Math.sin(a) * r * pond.rz;
        pos.push(pond.x + lx * c - lz * s, y, pond.z + lx * s + lz * c);
        dep.push(depthOf(-d, Math.min(minR * 0.5, 3.4)));
      }
    }
    for (let r = 0; r + 1 < ds.length; r++) {
      for (let k = 0; k < SEGMENTS; k++) {
        const k1 = (k + 1) % SEGMENTS;
        const a = base + r * SEGMENTS + k;
        const b = base + r * SEGMENTS + k1;
        const cc = base + (r + 1) * SEGMENTS + k;
        const dd = base + (r + 1) * SEGMENTS + k1;
        idx.push(a, b, cc, b, dd, cc);
      }
    }
  }
  const g = new BufferGeometry();
  if (pos.length === 0) return g;
  g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute("aDepth", new BufferAttribute(new Float32Array(dep), 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Where a river's water ends, for tests: the distance from the centreline to the top of the bank. */
export function riverBankTop(river: River): number {
  return river.width / 2 + river.spec.bank;
}

export { pondEdge };
// ---------------------------------------------------------------------------
// Merging helpers
// ---------------------------------------------------------------------------

/** A geometry made ready to merge: non-indexed, with position, normal, uv and a flat colour. */
function tinted(geometry: BufferGeometry, color: readonly [number, number, number], m?: Matrix4, shade?: (y: number) => number): BufferGeometry {
  const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  if (m) g.applyMatrix4(m);
  const pos = g.getAttribute("position");
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const k = shade ? shade(pos.getY(i)) : 1;
    colors[i * 3] = color[0] * k;
    colors[i * 3 + 1] = color[1] * k;
    colors[i * 3 + 2] = color[2] * k;
  }
  g.setAttribute("color", new BufferAttribute(colors, 3));
  if (!g.getAttribute("uv")) g.setAttribute("uv", new BufferAttribute(new Float32Array(pos.count * 2), 2));
  for (const name of Object.keys(g.attributes)) if (!["position", "normal", "uv", "color"].includes(name)) g.deleteAttribute(name);
  return g;
}

const merge = (parts: BufferGeometry[]): BufferGeometry => {
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return merged ?? new BufferGeometry();
};

const at = (x: number, y: number, z: number, ry = 0, sx = 1, sy = 1, sz = 1) => {
  const m = new Matrix4().makeRotationY(ry);
  m.setPosition(x, y, z);
  return m.multiply(new Matrix4().makeScale(sx, sy, sz));
};

// ---------------------------------------------------------------------------
// Fields
// ---------------------------------------------------------------------------

export const CROP_COLORS: readonly string[] = [
  "#d6bd63", // wheat
  "#5fa04b", // young crop
  "#86603f", // ploughed
  "#c9bf85", // stubble
  "#dcc444", // rape
  "#8bb35a", // pasture
];

/** Distance between crop rows, per crop, in world units; 0 is no rows (pasture). */
export const CROP_PERIOD: readonly number[] = [2.1, 1.8, 3.0, 2.3, 2.5, 0];
/** How strongly the rows show, per crop (the shader fades it with distance and angle). */
export const CROP_AMP: readonly number[] = [0.55, 0.7, 1.0, 0.4, 0.45, 0];

/**
 * Every field as rings of quads laid on the terrain (`sample`): the outline's
 * edges cut into pieces of about eight units, three rings inward, a fan at the
 * middle, so a field follows the ground it is on. `aRow` carries the crop rows
 * for the shader: `x` the distance across the rows in row periods, `y` how
 * strongly they show; the rows themselves are drawn there (`fieldMaterial`),
 * with their contrast faded by distance, by the angle of view and by how fast
 * they change across a pixel, so they never smear.
 */
export function buildFields(plan: LandscapePlan, sample: (x: number, z: number) => number, desaturation: number): BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const row: number[] = [];
  const idx: number[] = [];
  let base = 0;
  const RINGS = [0.36, 0.7, 1];
  for (const f of plan.fields) {
    const n = f.poly.length;
    const loop: Pt[] = [];
    for (let e = 0; e < n; e++) {
      const a = f.poly[e];
      const b = f.poly[(e + 1) % n];
      const k = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 8));
      for (let j = 0; j < k; j++) loop.push({ x: a.x + ((b.x - a.x) * j) / k, z: a.z + ((b.z - a.z) * j) / k });
    }
    const L = loop.length;
    const cropColor = linear(desaturate(mix(CROP_COLORS[f.crop as Crop], "#8fae62", 0.12), desaturation * 0.6));
    const jitter = 0.9 + f.shade * 0.2;
    const period = CROP_PERIOD[f.crop] || 1;
    const amp = CROP_AMP[f.crop];
    const ay = Math.sin(f.rowYaw);
    const az = Math.cos(f.rowYaw);
    // Across the rows: a quarter turn from the way they run.
    const cx = az;
    const cz = -ay;
    const phase = f.shade * 50;
    const push = (x: number, z: number, edge: number) => {
      pos.push(x, sample(x, z) + 0.07, z);
      // A little colour drift across the field, smooth and slow, so it is a field and not a tile; the headland is a shade darker.
      const drift = 0.93 + 0.14 * fbm(x / 24, z / 24, plan.seed + 41, 2);
      const k = jitter * drift * (1 - 0.1 * edge);
      col.push(cropColor[0] * k, cropColor[1] * k, cropColor[2] * k);
      row.push(((x - f.x) * cx + (z - f.z) * cz) / period + phase, amp);
    };
    push(f.x, f.z, 0);
    for (let r = 0; r < RINGS.length; r++) {
      const t = RINGS[r];
      for (const p of loop) push(f.x + (p.x - f.x) * t, f.z + (p.z - f.z) * t, r === RINGS.length - 1 ? 1 : 0);
    }
    for (let j = 0; j < L; j++) {
      const j1 = (j + 1) % L;
      // Wound to face up: the outline runs the other way round.
      idx.push(base, base + 1 + j1, base + 1 + j);
    }
    for (let r = 0; r + 1 < RINGS.length; r++) {
      for (let j = 0; j < L; j++) {
        const j1 = (j + 1) % L;
        const a = base + 1 + r * L + j;
        const b = base + 1 + r * L + j1;
        const c = base + 1 + (r + 1) * L + j;
        const d = base + 1 + (r + 1) * L + j1;
        idx.push(a, b, c, b, d, c);
      }
    }
    base += 1 + RINGS.length * L;
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute("color", new BufferAttribute(new Float32Array(col), 3));
  g.setAttribute("aRow", new BufferAttribute(new Float32Array(row), 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export { buildHedgeTubes } from "./hedges";

// ---------------------------------------------------------------------------
// The skyline
// ---------------------------------------------------------------------------

/**
 * Towers as merged boxes with UVs in window units, for one shared window
 * texture (`windowTextures`). Tops are a solid roof colour.
 */
export function buildTowers(towers: readonly TowerSpot[], sample: (x: number, z: number) => number): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const wallA = linear("#c4c9d2");
  const wallB = linear("#a9b4c2");
  const wallC = linear("#d6cfc6");
  for (const t of towers) {
    const box = new BoxGeometry(t.w, t.h, t.d);
    const g = box.toNonIndexed();
    const pos = g.getAttribute("position");
    const nor = g.getAttribute("normal");
    const uv = g.getAttribute("uv") as BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const base = t.shade < 0.4 ? wallA : t.shade < 0.75 ? wallB : wallC;
    for (let i = 0; i < pos.count; i++) {
      const ny = nor.getY(i);
      const across = Math.abs(nor.getX(i)) > 0.5 ? pos.getZ(i) + t.d / 2 : pos.getX(i) + t.w / 2;
      if (ny > 0.5) {
        uv.setXY(i, 0.98, 0.98);
        colors.set([base[0] * 0.8, base[1] * 0.8, base[2] * 0.85], i * 3);
      } else if (ny < -0.5) {
        uv.setXY(i, 0.98, 0.98);
        colors.set([0.1, 0.1, 0.1], i * 3);
      } else {
        // Four windows to a texture tile across, each 4.5 units: the texture holds a 4 x 4 block.
        uv.setXY(i, across / 18, (pos.getY(i) + t.h / 2) / 16.8);
        const k = 0.8 + 0.3 * ((pos.getY(i) + t.h / 2) / t.h);
        colors.set([base[0] * k, base[1] * k, base[2] * k], i * 3);
      }
    }
    g.setAttribute("color", new BufferAttribute(colors, 3));
    g.applyMatrix4(new Matrix4().makeTranslation(t.x, sample(t.x, t.z) + t.h / 2 - 0.3, t.z));
    parts.push(g);
    box.dispose();
  }
  return parts.length ? merge(parts) : new BufferGeometry();
}

/** A diffuse window texture and the matching lit-windows one, 4 x 4 windows to a tile. */
export function windowTextures(): { color: DataTexture; emissive: DataTexture } {
  const size = 64;
  const cell = 16;
  const color = new Uint8Array(size * size * 4);
  const glow = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cx = Math.floor(x / cell);
      const cy = Math.floor(y / cell);
      const lx = x % cell;
      const ly = y % cell;
      const isWindow = lx >= 3 && lx < 13 && ly >= 4 && ly < 12;
      // The top-right pixel column is a solid wall, for the roofs' UV.
      const solid = x >= size - 2 && y >= size - 2;
      const lit = hash01(cx, cy, 3) > 0.52;
      const wall = 255;
      const glass = 132 + Math.round(30 * hash01(cx, cy, 8));
      const v = isWindow && !solid ? glass : wall;
      color.set([v, v, Math.min(255, v + (isWindow ? 20 : 0)), 255], (y * size + x) * 4);
      const e = isWindow && !solid && lit ? 255 : 0;
      glow.set([e, e, e, 255], (y * size + x) * 4);
    }
  }
  const make = (data: Uint8Array) => {
    const t = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType);
    t.wrapS = t.wrapT = RepeatWrapping;
    t.magFilter = LinearFilter;
    t.minFilter = LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = 4;
    t.needsUpdate = true;
    return t;
  };
  return { color: make(color), emissive: make(glow) };
}

// ---------------------------------------------------------------------------
// Bridges
// ---------------------------------------------------------------------------

export const DECK_TOP = 0.36;

/**
 * A bridge that rests on its banks: a deck from one abutment to the other, a
 * block of masonry under each end standing in the bank's foot, rails, and a
 * pier in the water of a wide river.
 */
export function buildBridges(plan: LandscapePlan): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const deck = linear("#a9a49a");
  const rail = linear("#cfc9bb");
  const stone = linear("#8d887e");
  const box = new BoxGeometry(1, 1, 1);
  for (const b of plan.bridges) {
    const drop = riverSpec(b.half * 2).drop;
    parts.push(tinted(box, deck, at(b.x, DECK_TOP - 0.25, b.z, b.yaw, b.width, 0.5, b.length)));
    for (const side of [-1, 1]) {
      const ox = Math.cos(b.yaw) * (b.width / 2 - 0.2) * side;
      const oz = -Math.sin(b.yaw) * (b.width / 2 - 0.2) * side;
      parts.push(tinted(box, rail, at(b.x + ox, DECK_TOP + 0.3, b.z + oz, b.yaw, 0.4, 0.7, b.length)));
    }
    const foot = GROUND_Y - drop - 0.35;
    const top = DECK_TOP - 0.45;
    // Abutments: from just inside the waterline to part-way up the bank.
    const run = b.bank * 0.5 + 0.5;
    for (const k of [-1, 1]) {
      const centre = k * (b.half + (run - 0.5) / 2);
      const px = Math.sin(b.yaw) * centre;
      const pz = Math.cos(b.yaw) * centre;
      parts.push(tinted(box, stone, at(b.x + px, (foot + top) / 2, b.z + pz, b.yaw, b.width - 0.6, top - foot, run), (y) => 0.8 + 0.25 * Math.min(1, Math.max(0, (y - foot) / (top - foot)))));
    }
    // A pier in the middle of a wide river.
    if (b.half > 6) {
      parts.push(tinted(box, stone, at(b.x, (foot + top) / 2, b.z, b.yaw, b.width - 1.4, top - foot, 1.6)));
    }
  }
  return parts.length ? merge(parts) : new BufferGeometry();
}

/** The road surface's height: the terrain, lifted over a river onto a bridge's deck. */
export function roadHeight(plan: LandscapePlan, sample: (x: number, z: number) => number): (x: number, z: number) => number {
  return (x, z) => {
    let y = sample(x, z) + 0.09;
    for (const b of plan.bridges) {
      const d = Math.hypot(x - b.x, z - b.z);
      const t = 1 - smooth01((d - b.length / 2) / 12);
      if (t > 0) y = y + (DECK_TOP + 0.03 - y) * t;
    }
    return y;
  };
}

const to8 = (l: number) => Math.round(255 * (l <= 0.0031308 ? l * 12.92 : 1.055 * Math.pow(l, 1 / 2.4) - 0.055));

/**
 * A road texture: tarmac with a dashed centre line and pale edge lines, 24
 * units to a repeat; the motorway's has solid edge lines, dashed lane lines and
 * a hard shoulder, and leaves the middle to its barrier.
 */
export function roadTexture(style: RoadStyle = "street"): DataTexture {
  const w = 64;
  const h = 64;
  const data = new Uint8Array(w * h * 4);
  const asphalt = new Color("#65656a");
  const shoulder = new Color(SHOULDER_COLOR).multiplyScalar(0.92);
  const line = new Color("#f0ecde");
  const motorway = style === "motorway";
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = (x + 0.5) / w;
      const v = (y + 0.5) / h;
      const grain = 0.94 + 0.12 * hash01(x, y, 17);
      let c: [number, number, number] = [asphalt.r * grain, asphalt.g * grain, asphalt.b * grain];
      let painted = false;
      if (motorway) {
        if (u < 0.045 || u > 0.955) c = [shoulder.r * grain, shoulder.g * grain, shoulder.b * grain];
        painted = Math.abs(u - 0.055) < 0.012 || Math.abs(u - 0.945) < 0.012 || ((Math.abs(u - 0.275) < 0.008 || Math.abs(u - 0.725) < 0.008) && v < 0.42);
      } else {
        painted = (Math.abs(u - 0.5) < 0.026 && v < 0.5) || Math.abs(u - 0.07) < 0.02 || Math.abs(u - 0.93) < 0.02;
      }
      if (painted) c = [line.r * 0.92, line.g * 0.92, line.b * 0.9];
      // Convert linear back to the data texture's sRGB-ish bytes: the texture is tagged sRGB.
      data.set([to8(c[0]), to8(c[1]), to8(c[2]), 255], (y * w + x) * 4);
    }
  }
  const t = new DataTexture(data, w, h, RGBAFormat, UnsignedByteType);
  t.colorSpace = "srgb";
  t.wrapS = t.wrapT = RepeatWrapping;
  t.magFilter = LinearFilter;
  t.minFilter = LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

/** The concrete barrier down a motorway's middle, as three strips (two faces and a top) so its edges stay crisp. */
/** Geometries made ready to merge into one: indexed or not, with position, normal, uv and colour. */
export function mergeAll(parts: readonly BufferGeometry[]): BufferGeometry {
  const live = parts
    .filter((g) => g.getAttribute("position")?.count > 0)
    .map((g) => (g.index ? g.toNonIndexed() : g));
  const merged = live.length ? mergeGeometries(live, false) : null;
  return merged ?? new BufferGeometry();
}

export function buildBarrier(pts: readonly Pt[], y: (x: number, z: number) => number, from: number): BufferGeometry {
  const use = pts.slice(from);
  const n = use.length;
  if (n < 2) return new BufferGeometry();
  const W = 0.4;
  const H = 0.55;
  const color = linear(BARRIER_COLOR);
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const strips: [number, number, number, number, number][] = [
    // offset a, height a, offset b, height b, shade
    [-W / 2, 0, -W / 2, H, 0.86],
    [-W / 2, H, W / 2, H, 1.04],
    [W / 2, H, W / 2, 0, 0.86],
  ];
  for (const [oa, ha, ob, hb, shade] of strips) {
    const base = pos.length / 3;
    for (let i = 0; i < n; i++) {
      const a = use[Math.max(i - 1, 0)];
      const b = use[Math.min(i + 1, n - 1)];
      const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      const nx = -(b.z - a.z) / len;
      const nz = (b.x - a.x) / len;
      const gy = y(use[i].x, use[i].z) - 0.04;
      pos.push(use[i].x + nx * oa, gy + ha, use[i].z + nz * oa, use[i].x + nx * ob, gy + hb, use[i].z + nz * ob);
      col.push(color[0] * shade, color[1] * shade, color[2] * shade, color[0] * shade, color[1] * shade, color[2] * shade);
      if (i + 1 < n) {
        const k = base + i * 2;
        idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
      }
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute("color", new BufferAttribute(new Float32Array(col), 3));
  // No UVs are read, but the barrier merges with the bridges and streets, which carry them.
  g.setAttribute("uv", new BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Streets of the sprawl: plain grey strips laid flat. */
export function buildStreets(plan: LandscapePlan, sample: (x: number, z: number) => number): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const road = linear("#6d6d70");
  const strip = new BoxGeometry(1, 0.06, 1);
  for (const s of plan.streets) {
    parts.push(tinted(strip, road, at(s.x, sample(s.x, s.z) + 0.05, s.z, s.yaw, 4.2, 1, s.length)));
  }
  return parts.length ? merge(parts) : new BufferGeometry();
}
