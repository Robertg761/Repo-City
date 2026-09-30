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
  ConeGeometry,
  CylinderGeometry,
  DataTexture,
  IcosahedronGeometry,
  LinearFilter,
  LinearMipmapLinearFilter,
  Matrix4,
  RepeatWrapping,
  RGBAFormat,
  UnsignedByteType,
  Vector3,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { desaturate, mix } from "../palette";
import { hash01, smooth01 } from "./noise";
import { GROUND_Y, distToPath, type Crop, type HedgeRun, type LandscapePlan, type Pt, type TowerSpot } from "./plan";

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
    if (nearWater < 5) mixIn(mud, (1 - smooth01(nearWater / 5)) * 0.55);
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

/** A filled ellipse laid flat at `y`. */
export function buildPond(x: number, z: number, rx: number, rz: number, yaw: number, y: number, color: string): BufferGeometry {
  const seg = 28;
  const positions: number[] = [x, y, z];
  const colors: number[] = [...linear(color)];
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    // A lumpy shore: a lobe or two.
    const wob = 1 + 0.08 * Math.sin(a * 3 + x) + 0.05 * Math.sin(a * 5 + z);
    const lx = Math.cos(a) * rx * wob;
    const lz = Math.sin(a) * rz * wob;
    positions.push(x + lx * c - lz * s, y, z + lx * s + lz * c);
    colors.push(...linear(color));
  }
  const index: number[] = [];
  for (let i = 0; i < seg; i++) index.push(0, 1 + ((i + 1) % seg), 1 + i);
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  g.setAttribute("color", new BufferAttribute(new Float32Array(colors), 3));
  g.setAttribute("uv", new BufferAttribute(new Float32Array((seg + 1) * 2), 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

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
// Fields and hedges
// ---------------------------------------------------------------------------

export const CROP_COLORS: readonly string[] = [
  "#d6bd63", // wheat
  "#5fa04b", // young crop
  "#86603f", // ploughed
  "#c9bf85", // stubble
  "#e2cc3f", // rape
  "#8bb35a", // pasture
];

/**
 * Every field as a small grid of quads laid on the terrain (`sample`), so a
 * field follows the ground it is on. UVs run across the crop rows in world
 * units, so one stripe texture serves them all at any heading.
 */
export function buildFields(plan: LandscapePlan, sample: (x: number, z: number) => number, desaturation: number): BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  let base = 0;
  for (const f of plan.fields) {
    const nx = Math.max(2, Math.ceil(f.w / 9));
    const nz = Math.max(2, Math.ceil(f.d / 9));
    const c = Math.cos(f.yaw);
    const s = Math.sin(f.yaw);
    const cropColor = linear(desaturate(mix(CROP_COLORS[f.crop as Crop], "#ffffff", 0), desaturation * 0.6));
    const jitter = 0.9 + f.shade * 0.2;
    for (let j = 0; j <= nz; j++) {
      for (let i = 0; i <= nx; i++) {
        const lx = (i / nx - 0.5) * f.w;
        const lz = (j / nz - 0.5) * f.d;
        const x = f.x + lx * c + lz * s;
        const z = f.z - lx * s + lz * c;
        pos.push(x, sample(x, z) + 0.07, z);
        // A little colour drift across the field, so it is a field and not a tile.
        const drift = 0.95 + 0.1 * hash01(Math.round(x * 2), Math.round(z * 2), plan.seed);
        col.push(cropColor[0] * jitter * drift, cropColor[1] * jitter * drift, cropColor[2] * jitter * drift);
        uv.push(lx / 6, lz / 40);
      }
    }
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const a = base + j * (nx + 1) + i;
        idx.push(a, a + nx + 1, a + 1, a + 1, a + nx + 1, a + nx + 2);
      }
    }
    base += (nx + 1) * (nz + 1);
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute("color", new BufferAttribute(new Float32Array(col), 3));
  g.setAttribute("uv", new BufferAttribute(new Float32Array(uv), 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Crop rows: a stripe texture, light and dark, that the field UVs repeat. */
export function stripeTexture(): DataTexture {
  const w = 24;
  const h = 8;
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const wave = 0.5 + 0.5 * Math.cos((x / w) * Math.PI * 6);
      const noise = hash01(x, y, 91) * 0.06;
      const v = Math.round(255 * (0.82 + 0.18 * wave + noise - 0.03));
      data.set([v, v, v, 255], (y * w + x) * 4);
    }
  }
  const t = new DataTexture(data, w, h, RGBAFormat, UnsignedByteType);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.magFilter = LinearFilter;
  t.minFilter = LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

/** Hedges: short clipped boxes along each run, following the ground. */
export function buildHedges(runs: readonly HedgeRun[], sample: (x: number, z: number) => number, cap = 1400): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const dark = linear("#75a44f");
  const light = linear("#a2c766");
  // A clipped hedge in section: a frustum, wide at the foot, narrower on top.
  const box = new CylinderGeometry(0.34, 0.6, 1, 4, 1);
  box.rotateY(Math.PI / 4);
  box.translate(0, 0.5, 0);
  for (const run of runs) {
    if (parts.length >= cap) break;
    const len = Math.hypot(run.x1 - run.x0, run.z1 - run.z0);
    const pieces = Math.max(1, Math.ceil(len / 10));
    const yaw = Math.atan2(run.x1 - run.x0, run.z1 - run.z0);
    for (let p = 0; p < pieces; p++) {
      const t = (p + 0.5) / pieces;
      const x = run.x0 + (run.x1 - run.x0) * t;
      const z = run.z0 + (run.z1 - run.z0) * t;
      const h = 1.1 + 0.3 * hash01(Math.round(x), Math.round(z), 5);
      const shade = 0.9 + run.shade * 0.2;
      const c = mix4(dark, light, run.shade * 0.5);
      parts.push(tinted(box, [c[0] * shade, c[1] * shade, c[2] * shade], at(x, sample(x, z) - 0.05, z, yaw, 1.7, h, (len / pieces + 0.3) / 0.85), (yy) => 0.92 + Math.min(1, Math.max(0, (yy - sample(x, z)) / h)) * 0.22));
    }
  }
  return parts.length ? merge(parts) : new BufferGeometry();
}

const mix4 = (a: readonly number[], b: readonly number[], t: number): [number, number, number] => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

// ---------------------------------------------------------------------------
// Trees and houses: unit geometries the renderer instances
// ---------------------------------------------------------------------------

/** Darker at the foot of a crown, lighter on top: baked light, cheap. */
const crownShade = (lo: number, hi: number, y0: number, y1: number) => (y: number) =>
  lo + (hi - lo) * Math.min(1, Math.max(0, (y - y0) / (y1 - y0)));

export function broadleafGeometry(): BufferGeometry {
  const trunk = linear("#6e5540");
  const leaf = linear("#5f9552");
  const ico = new IcosahedronGeometry(1, 0);
  return merge([
    tinted(new CylinderGeometry(0.16, 0.26, 2.0, 5, 1, true), trunk, at(0, 1.0, 0)),
    tinted(ico, leaf, at(0, 3.2, 0, 0.4, 1.7, 1.55, 1.7), crownShade(0.62, 1.12, 1.7, 4.8)),
    tinted(ico, leaf, at(0.75, 4.1, 0.25, 1.1, 1.1, 1.0, 1.1), crownShade(0.75, 1.18, 3.2, 5.2)),
  ]);
}

export function coniferGeometry(): BufferGeometry {
  const trunk = linear("#5b4636");
  const leaf = linear("#457f55");
  const cone = new ConeGeometry(1, 1, 6, 1);
  cone.translate(0, 0.5, 0);
  return merge([
    tinted(new CylinderGeometry(0.14, 0.2, 1.2, 4, 1, true), trunk, at(0, 0.6, 0)),
    tinted(cone, leaf, at(0, 0.9, 0, 0.3, 1.5, 2.6, 1.5), crownShade(0.6, 1.0, 0.9, 3.5)),
    tinted(cone, leaf, at(0, 2.5, 0, 0.9, 1.1, 2.4, 1.1), crownShade(0.7, 1.15, 2.5, 5.0)),
  ]);
}

/** A far canopy: one squashed lump, stood in for a whole clump of trees. */
export function canopyGeometry(): BufferGeometry {
  const leaf = linear("#6a9a58");
  const ico = new IcosahedronGeometry(1, 0);
  return merge([
    tinted(ico, leaf, at(0, 1.2, 0, 0.2, 2.2, 1.3, 2.0), crownShade(0.6, 1.1, 0.0, 3.0)),
    tinted(ico, leaf, at(2.2, 0.9, 0.9, 0.9, 1.5, 1.0, 1.4), crownShade(0.65, 1.1, 0.0, 2.4)),
    tinted(ico, leaf, at(-1.9, 0.8, -0.7, 1.7, 1.4, 0.9, 1.3), crownShade(0.65, 1.1, 0.0, 2.2)),
  ]);
}

function gable(wall: readonly [number, number, number], roof: readonly [number, number, number], eave: number): BufferGeometry {
  // A unit house: footprint 1 x 1 centred on the origin, walls to `eave`, ridge at 1, ridge along z.
  const w = 0.5;
  const d = 0.5;
  const over = 0.06;
  const walls = new BoxGeometry(1, eave, 1);
  walls.translate(0, eave / 2, 0);
  const roofPos: number[] = [];
  const slopeL: [number, number, number][][] = [
    [[-w - over, eave - 0.01, -d - over], [0, 1, -d - over], [0, 1, d + over]],
    [[-w - over, eave - 0.01, -d - over], [0, 1, d + over], [-w - over, eave - 0.01, d + over]],
    [[w + over, eave - 0.01, d + over], [0, 1, d + over], [0, 1, -d - over]],
    [[w + over, eave - 0.01, d + over], [0, 1, -d - over], [w + over, eave - 0.01, -d - over]],
  ];
  for (const tri of slopeL) for (const v of tri) roofPos.push(...v);
  // The gable ends.
  const ends: [number, number, number][][] = [
    [[-w, eave, d], [w, eave, d], [0, 1, d]],
    [[w, eave, -d], [-w, eave, -d], [0, 1, -d]],
  ];
  for (const tri of ends) for (const v of tri) roofPos.push(...v);
  const roofGeo = new BufferGeometry();
  roofGeo.setAttribute("position", new BufferAttribute(new Float32Array(roofPos), 3));
  roofGeo.computeVertexNormals();
  const roofTint = tinted(roofGeo, roof);
  // Gable ends take the wall colour, the slopes the roof's.
  const colors = roofTint.getAttribute("color") as BufferAttribute;
  for (let i = 12; i < 18; i++) colors.setXYZ(i, wall[0], wall[1], wall[2]);
  return merge([tinted(walls, wall, undefined, crownShade(0.78, 1.0, 0, eave)), roofTint]);
}

export function houseGeometry(variant: "red" | "slate" | "tan"): BufferGeometry {
  const wall = linear(variant === "tan" ? "#dcc9a2" : "#e7dcc6");
  const roof = linear(variant === "red" ? "#9e5340" : variant === "slate" ? "#5d6470" : "#9a7550");
  return gable(wall, roof, 0.52);
}

export function barnGeometry(): BufferGeometry {
  return gable(linear("#9a5f47"), linear("#6c7078"), 0.62);
}

export function blockGeometry(): BufferGeometry {
  const body = new BoxGeometry(1, 1, 1);
  body.translate(0, 0.5, 0);
  return merge([
    tinted(body, linear("#ddd5c4"), at(0, 0, 0), crownShade(0.82, 1.0, 0, 1)),
    tinted(new BoxGeometry(1.04, 0.06, 1.04), linear("#8c8e94"), at(0, 1.02, 0)),
  ]);
}

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

export function buildBridges(plan: LandscapePlan): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const deck = linear("#a9a49a");
  const rail = linear("#cfc9bb");
  const pier = linear("#8d887e");
  const box = new BoxGeometry(1, 1, 1);
  for (const b of plan.bridges) {
    const along = new Vector3(Math.sin(b.yaw), 0, Math.cos(b.yaw));
    void along;
    parts.push(tinted(box, deck, at(b.x, DECK_TOP - 0.25, b.z, b.yaw, b.width, 0.5, b.length)));
    for (const side of [-1, 1]) {
      const ox = Math.cos(b.yaw) * (b.width / 2 - 0.2) * side;
      const oz = -Math.sin(b.yaw) * (b.width / 2 - 0.2) * side;
      parts.push(tinted(box, rail, at(b.x + ox, DECK_TOP + 0.3, b.z + oz, b.yaw, 0.4, 0.7, b.length)));
    }
    // Piers into the water.
    for (const k of [-0.3, 0.3]) {
      const px = Math.sin(b.yaw) * b.length * k;
      const pz = Math.cos(b.yaw) * b.length * k;
      parts.push(tinted(box, pier, at(b.x + px, -0.4, b.z + pz, b.yaw, b.width - 1, 1.3, 1.2)));
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

/** A road texture: tarmac with a dashed centre line and pale edge lines, 24 units to a repeat. */
export function roadTexture(): DataTexture {
  const w = 32;
  const h = 64;
  const data = new Uint8Array(w * h * 4);
  const asphalt = new Color("#65656a");
  const line = new Color("#f0ecde");
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = (x + 0.5) / w;
      const v = (y + 0.5) / h;
      const grain = 0.94 + 0.12 * hash01(x, y, 17);
      let c: [number, number, number] = [asphalt.r * grain, asphalt.g * grain, asphalt.b * grain];
      const centre = Math.abs(u - 0.5) < 0.026 && v < 0.5;
      const edge = Math.abs(u - 0.07) < 0.02 || Math.abs(u - 0.93) < 0.02;
      if (centre || edge) c = [line.r * 0.92, line.g * 0.92, line.b * 0.9];
      // Convert linear back to the data texture's sRGB-ish bytes: the texture is tagged sRGB.
      const to8 = (l: number) => Math.round(255 * (l <= 0.0031308 ? l * 12.92 : 1.055 * Math.pow(l, 1 / 2.4) - 0.055));
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
