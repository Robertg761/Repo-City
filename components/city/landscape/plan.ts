/**
 * The land round a city (the default look; `?land=classic` turns it off): what the model stands in, planned as
 * plain data from the city model and nothing else. Pure and deterministic --
 * the same `seed` gives the same surroundings, a different repository gives
 * different ones -- and unit tested (`plan.test.ts`); `Landscape.tsx` only
 * turns the plan into meshes.
 *
 * THE FRAME. The city is a square plot centred on the origin, `size` a side.
 * Round it lies a FLAT APRON out to about one and a seventh `size` (the highways run out
 * over it, and they are laid flat at y = 0), and past the apron the land
 * rolls up towards the horizon. Distance is measured `reach` = a bit past
 * where the fog is thickest, so the far edge is always fog and never ground.
 *
 * WHAT EACH TIER GETS (`LAND_PROFILE`):
 *
 *   village     a patchwork of small fields with hedgerows, copses and woods,
 *               a stream and a pond, farmsteads, and the lanes leading away
 *   town        fields and woods, a small river, and a fringe of houses
 *               strung along the approach roads
 *   city        hills and woods, a river the approach roads cross on
 *               bridges, farmland further out, small hamlets, roads to the
 *               horizon
 *   metropolis  outlying low sprawl (streets of houses), a wide river, a
 *               distant silhouette skyline, highways out
 *
 * FIELDS are the cells of a power diagram over seeds scattered at a spacing
 * that drifts with noise (`fields.ts`), so they merge into broad ones and split
 * into small ones, stretched along the country's grain, trimmed to keep off the
 * plot, the roads, the water and the sprawl, never on a lattice. RIVERS AND PONDS
 * have banks (`water.ts`): the terrain is trenched, the exact bank is a mesh
 * drawn in the trench. HOUSES are the city's own models (`models/buildings`).
 *
 * Whatever roads the model has that end at the plot edge continue into the
 * land as ribbons that follow the ground and bend a little; a synthetic exit
 * is added when a tier has fewer than it should.
 */

import { prngFor } from "@/lib/city/seed";
import type { Prng } from "@/lib/city/prng";
import type { SettlementTier } from "@/types/analysis";
import type { CityModel } from "@/types/city";
import { REFERENCE_ASPECT, aspectWiden } from "../entities";
import type { ModelKey } from "../models/buildings/archetypes";
import { roadStyle, type RoadStyle } from "../groundwork";
import {
  EDGE_CUT,
  EDGE_FAR,
  clipHalfPlane,
  convexDistance,
  insetPolygon,
  insidePoly,
  longestEdgeYaw,
  polyArea,
  polyCentroid,
  scatterSeeds,
  voronoiCells,
  type Cell,
} from "./fields";
import { fbm, hash01, seedInt, smooth01 } from "./noise";
import { POND_SPEC, riverSpec, trenchDepth, trenchReach, type WaterSpec } from "./water";

export interface Pt {
  x: number;
  z: number;
}

/** The ground level of the plot and the landscape round it (`Terrain.tsx`). */
export const GROUND_Y = -0.06;
/** How far past the plot's half-side the plate used to reach: the plot's verge. */
export const PLOT_MARGIN = 1.04;
/** Fog: far plane as a multiple of the overview reach (`grade.ts`), and the hard cap. */
export const LAND_FOG_FAR = 4.4;
export const LAND_MAX_REACH = 1800;

/** How far the land is drawn: past the fog's far plane, never past the camera's. */
export function landReach(size: number, aspect: number = REFERENCE_ASPECT): number {
  return Math.min(LAND_MAX_REACH, size * aspectWiden(aspect) * LAND_FOG_FAR * 1.02);
}

export interface TierProfile {
  /** Rolling hills' amplitude, as a fraction of the city's size. */
  hills: number;
  /** Extra rise towards the horizon, in units per unit of distance past the apron. */
  rise: number;
  /** Side of a field cell in world units. */
  cell: number;
  /** How far out farmland runs, as a multiple of `size`. */
  farm: number;
  /** Share of cells that are cropped fields (the rest are woods and meadow). */
  fieldShare: number;
  river: { width: number; radius: number; wander: number; span: number };
  pond: boolean;
  /** What stands in the land besides fields and trees. */
  settle: "farms" | "fringe" | "hamlets" | "sprawl";
  skyline: boolean;
  /** At least this many roads leave the city (synthetic ones make up the rest). */
  minExits: number;
  /** Tree budget for the near woods, and for the far canopy. */
  trees: { near: number; far: number };
}

export const LAND_PROFILE: Record<SettlementTier, TierProfile> = {
  village: {
    hills: 0.1, rise: 0.028, cell: 28, farm: 2.3, fieldShare: 0.7,
    river: { width: 3.6, radius: 1.12, wander: 0.09, span: 1.7 }, pond: true,
    settle: "farms", skyline: false, minExits: 2, trees: { near: 800, far: 600 },
  },
  town: {
    hills: 0.12, rise: 0.034, cell: 36, farm: 2.1, fieldShare: 0.5,
    river: { width: 8, radius: 1.2, wander: 0.08, span: 1.7 }, pond: false,
    settle: "fringe", skyline: false, minExits: 2, trees: { near: 800, far: 700 },
  },
  city: {
    hills: 0.17, rise: 0.044, cell: 46, farm: 2.6, fieldShare: 0.42,
    river: { width: 15, radius: 1.32, wander: 0.09, span: 1.9 }, pond: false,
    settle: "hamlets", skyline: false, minExits: 3, trees: { near: 900, far: 900 },
  },
  metropolis: {
    hills: 0.12, rise: 0.034, cell: 54, farm: 3, fieldShare: 0.36,
    river: { width: 30, radius: 1.18, wander: 0.06, span: 1.8 }, pond: false,
    settle: "sprawl", skyline: true, minExits: 4, trees: { near: 650, far: 650 },
  },
};

export interface Exit {
  x: number;
  z: number;
  /** Unit direction out of the city. */
  dx: number;
  dz: number;
  width: number;
  /** The model's own highway, or one this plan added. */
  synthetic: boolean;
}

export interface RoadPath {
  id: string;
  kind: "highway" | "spur";
  /** How the model draws this road (a motorway has a central barrier and edge lines). */
  style: RoadStyle;
  width: number;
  pts: Pt[];
  /** The first point that is drawn: everything before it is the model's own road. */
  drawFrom: number;
}

export interface River {
  width: number;
  pts: Pt[];
  /** The slope of its banks. */
  spec: WaterSpec;
}

export interface Pond {
  x: number;
  z: number;
  rx: number;
  rz: number;
  yaw: number;
  spec: WaterSpec;
}

export interface Bridge {
  x: number;
  z: number;
  /** Heading of the road across it. */
  yaw: number;
  /** Abutment to abutment: the water, both banks and a little land either side. */
  length: number;
  width: number;
  /** Half the water's width. */
  half: number;
  /** The bank's horizontal run. */
  bank: number;
}

/** The shore of a pond as a multiple of its ellipse, by angle round it: a lobe or two. */
export function pondShore(pond: Pond, angle: number): number {
  return 1 + 0.08 * Math.sin(angle * 3 + pond.x) + 0.05 * Math.sin(angle * 5 + pond.z);
}

/** Distance from a point to a pond's water's edge: negative over the water. */
export function pondEdge(pond: Pond, x: number, z: number): number {
  const c = Math.cos(pond.yaw);
  const s = Math.sin(pond.yaw);
  const dx = x - pond.x;
  const dz = z - pond.z;
  const u = (dx * c + dz * s) / pond.rx;
  const v = (-dx * s + dz * c) / pond.rz;
  const a = Math.atan2(v, u);
  return (Math.hypot(u, v) / pondShore(pond, a) - 1) * Math.min(pond.rx, pond.rz);
}

export type Crop = 0 | 1 | 2 | 3 | 4 | 5;

export interface FieldCell {
  /** Middle of the field. */
  x: number;
  z: number;
  /** The field's outline, convex, already inset from its hedge. */
  poly: Pt[];
  /** The way the crop rows run (heading, radians). */
  rowYaw: number;
  /** Rough extent, for the map. */
  radius: number;
  crop: Crop;
  /** 0..1 brightness jitter. */
  shade: number;
  /** Drawn with a hedge round it. */
  hedged: boolean;
}

export interface TreeSpot {
  x: number;
  z: number;
  scale: number;
  /** 0 broadleaf, 1 conifer, 2 far canopy mass, 3 poplar, 4 birch. */
  kind: 0 | 1 | 2 | 3 | 4;
  shade: number;
}

export interface HouseSpot {
  x: number;
  z: number;
  yaw: number;
  w: number;
  d: number;
  h: number;
  /** The city's own model it is drawn with (`models/buildings`). */
  model: ModelKey;
  /** What its paint and its lit windows are seeded from. */
  key: string;
  /** 0..1 jitter. */
  tint: number;
}

export interface TowerSpot {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  shade: number;
}

export interface HedgeRun {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  shade: number;
}

export interface LandscapePlan {
  tier: SettlementTier;
  seed: number;
  size: number;
  half: number;
  reach: number;
  /** Distance (blended box and round) inside which the land is flat. */
  flat: number;
  profile: TierProfile;
  exits: Exit[];
  roads: RoadPath[];
  rivers: River[];
  ponds: Pond[];
  bridges: Bridge[];
  fields: FieldCell[];
  hedges: HedgeRun[];
  trees: TreeSpot[];
  houses: HouseSpot[];
  /** Sprawl street strips (metropolis): centre, length, yaw. */
  streets: { x: number; z: number; length: number; yaw: number }[];
  towers: TowerSpot[];
  /** The tree line and hedge along the plot's verge. */
  verge: { trees: TreeSpot[]; hedges: HedgeRun[] };
  /** Ground height at a world point (with the water's trenches cut into it). */
  height: (x: number, z: number) => number;
  /** The same land before any water is cut: what a bank's top, and a bridge's abutment, stand on. */
  level: (x: number, z: number) => number;
  /** Forest cover at a point, 0..1, for painting the ground under woods. */
  forest: (x: number, z: number) => number;
}

// ---------------------------------------------------------------------------
// Small geometry helpers
// ---------------------------------------------------------------------------

export function distToSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const vx = bx - ax;
  const vz = bz - az;
  const len2 = vx * vx + vz * vz;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / len2)) : 0;
  return Math.hypot(px - (ax + vx * t), pz - (az + vz * t));
}

/**
 * Distance from a point to a polyline. With `within`, segments whose box is
 * further than that from the point are skipped without a square root, and a
 * distance past `within` may come back as `Infinity`: every caller compares
 * it with a margin no larger than `within`, and this is what keeps the plan
 * and the terrain cheap (they ask thousands of times).
 */
export function distToPath(pts: readonly Pt[], x: number, z: number, from = 0, within = Infinity): number {
  let best = Infinity;
  for (let i = Math.max(from, 0); i + 1 < pts.length; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (within < Infinity) {
      if (x < (a.x < b.x ? a.x : b.x) - within || x > (a.x > b.x ? a.x : b.x) + within) continue;
      if (z < (a.z < b.z ? a.z : b.z) - within || z > (a.z > b.z ? a.z : b.z) + within) continue;
    }
    const d = distToSegment(x, z, a.x, a.z, b.x, b.z);
    if (d < best) best = d;
  }
  return best;
}

/** Where two segments cross, or null. */
export function segmentCross(a: Pt, b: Pt, c: Pt, d: Pt): Pt | null {
  const r = { x: b.x - a.x, z: b.z - a.z };
  const s = { x: d.x - c.x, z: d.z - c.z };
  const den = r.x * s.z - r.z * s.x;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c.x - a.x) * s.z - (c.z - a.z) * s.x) / den;
  const u = ((c.x - a.x) * r.z - (c.z - a.z) * r.x) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: a.x + r.x * t, z: a.z + r.z * t };
}

/** Chebyshev distance blended with the round one: the metric the hills rise by. */
export const landDistance = (x: number, z: number): number =>
  0.5 * (Math.max(Math.abs(x), Math.abs(z)) + Math.hypot(x, z));

/** Catmull-Rom through the points, `per` samples a span. */
export function smoothPath(points: readonly Pt[], per: number): Pt[] {
  if (points.length < 3) return points.slice();
  const out: Pt[] = [];
  for (let i = 0; i + 1 < points.length; i++) {
    const p0 = points[Math.max(i - 1, 0)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(i + 2, points.length - 1)];
    for (let k = 0; k < per; k++) {
      const t = k / per;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push({ x: f(p0.x, p1.x, p2.x, p3.x), z: f(p0.z, p1.z, p2.z, p3.z) });
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

// ---------------------------------------------------------------------------
// Exits: where the city's roads leave the plot
// ---------------------------------------------------------------------------

const linf = (x: number, z: number) => Math.max(Math.abs(x), Math.abs(z));

/**
 * The roads that leave the plot: every highway whose far end lies well past
 * the plot's edge, then, if the tier wants more, roads that reach the plot's
 * edge and are given a way on. Sorted so the order is stable.
 */
export function exitsOf(city: CityModel, minimum: number): Exit[] {
  const half = city.bounds.size / 2;
  const exits: Exit[] = [];
  for (const road of city.roads) {
    if (road.kind !== "highway") continue;
    const [fx, , fz] = road.from;
    const [tx, , tz] = road.to;
    if (linf(tx, tz) < half * 1.3 || linf(tx, tz) <= linf(fx, fz)) continue;
    const len = Math.hypot(tx - fx, tz - fz) || 1;
    exits.push({ x: tx, z: tz, dx: (tx - fx) / len, dz: (tz - fz) / len, width: road.width, synthetic: false });
  }
  if (exits.length >= minimum) return exits;

  // Synthetic exits: from the road ends nearest the plot's edge, on sides
  // that have no exit yet, going straight out along the side's axis.
  const sideOf = (x: number, z: number): number => (Math.abs(x) >= Math.abs(z) ? (x > 0 ? 0 : 1) : z > 0 ? 2 : 3);
  const taken = new Set(exits.map((e) => sideOf(e.x, e.z)));
  const widest = Math.max(...city.roads.map((r) => r.width), 4);
  const candidates: { x: number; z: number; side: number; score: number }[] = [];
  for (const road of city.roads) {
    if (road.kind === "highway" && linf(road.to[0], road.to[2]) >= half * 1.3) continue;
    for (const end of [road.from, road.to]) {
      const edge = linf(end[0], end[2]);
      if (edge < half * 0.8) continue;
      candidates.push({ x: end[0], z: end[2], side: sideOf(end[0], end[2]), score: edge - Math.abs(Math.abs(end[0]) < Math.abs(end[2]) ? end[0] : end[2]) * 0.02 });
    }
  }
  candidates.sort((a, b) => b.score - a.score || a.x - b.x || a.z - b.z);
  for (const c of candidates) {
    if (exits.length >= minimum) break;
    if (taken.has(c.side)) continue;
    taken.add(c.side);
    const dx = c.side === 0 ? 1 : c.side === 1 ? -1 : 0;
    const dz = c.side === 2 ? 1 : c.side === 3 ? -1 : 0;
    // Start at the plot's edge on the road's own line.
    const edge = half * 1.02;
    const x = dx !== 0 ? dx * edge : c.x;
    const z = dz !== 0 ? dz * edge : c.z;
    exits.push({ x, z, dx, dz, width: Math.min(widest, 5), synthetic: true });
  }
  return exits;
}

// ---------------------------------------------------------------------------
// The plan
// ---------------------------------------------------------------------------

export function landscapeSeed(city: CityModel): string {
  return `${city.seed}|${city.repository.fullName}`;
}

/** The rivers' valley: how far the banks slope out beyond the water. */
const valley = (size: number) => 14 + size * 0.07;

function makeRiver(rng: Prng, size: number, reach: number, profile: TierProfile, aim: number | null): River {
  const { width, radius, wander, span } = profile.river;
  // Centred on one of the roads out, so that a road crosses it; else anywhere.
  const a0 = aim === null ? rng.range(0, Math.PI * 2) : aim + rng.range(-0.45, 0.45);
  const phase = [rng.range(0, 6.28), rng.range(0, 6.28), rng.range(0, 6.28)];
  const n = 18;
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n - 0.5;
    const theta = a0 + t * span * Math.PI * 0.62;
    const r = size * radius * (1 + wander * Math.sin(t * 9 + phase[0]) + wander * 0.6 * Math.sin(t * 21 + phase[1]));
    pts.push({ x: Math.cos(theta) * r, z: Math.sin(theta) * r });
  }
  // The tails run out past the fog, bending away from the city.
  const tail = (from: Pt, into: Pt): Pt[] => {
    const dx = from.x - into.x;
    const dz = from.z - into.z;
    const len = Math.hypot(dx, dz) || 1;
    const ux = dx / len;
    const uz = dz / len;
    // Turn the tail outward a little as it goes.
    const rx = from.x / (Math.hypot(from.x, from.z) || 1);
    const rz = from.z / (Math.hypot(from.x, from.z) || 1);
    const out: Pt[] = [];
    for (let k = 1; k <= 6; k++) {
      const s = (reach * 0.16) * k;
      const bend = (k / 6) * 0.7;
      const hx = ux * (1 - bend) + rx * bend;
      const hz = uz * (1 - bend) + rz * bend;
      out.push({ x: from.x + hx * s, z: from.z + hz * s });
    }
    return out;
  };
  const head = tail(pts[0], pts[1]).reverse();
  const foot = tail(pts[pts.length - 1], pts[pts.length - 2]);
  const raw = [...head, ...pts, ...foot];
  return { width, pts: smoothPath(raw, 4), spec: riverSpec(width) };
}

function extendExit(exit: Exit, index: number, reach: number, size: number, rng: Prng): RoadPath {
  const step = 12;
  const pts: Pt[] = [{ x: exit.x, z: exit.z }];
  let heading = Math.atan2(exit.dz, exit.dx);
  const bend = rng.range(-1, 1) * 0.5;
  const seed = seedInt(`road${index}${exit.x.toFixed(0)}${exit.z.toFixed(0)}`);
  // Runs on until it leaves the land, however it wanders.
  const limit = reach * 2;
  const straight = Math.max(size * 0.12, 18);
  for (let s = step; s < limit; s += step) {
    if (Math.hypot(pts[pts.length - 1].x, pts[pts.length - 1].z) >= reach * 0.965) break;
    if (s > straight) {
      // Slow, wide bends: a road wandering over the country, never a zigzag.
      const turn = (fbm(s / (size * 0.9) + index * 3.1, index * 5.7, seed, 2) - 0.5) * 0.11 + bend * 0.004;
      heading += turn * (step / 12) * (0.6 + Math.min(s / (size * 2), 1));
    }
    const last = pts[pts.length - 1];
    pts.push({ x: last.x + Math.cos(heading) * step, z: last.z + Math.sin(heading) * step });
  }
  // The model's own straight run out to its end is the road's start, so the
  // ribbon and the obstacle checks see the whole length.
  const back: Pt[] = [];
  for (let s = 6; s <= 12 * 8; s += 12) back.unshift({ x: exit.x - exit.dx * s, z: exit.z - exit.dz * s });
  return {
    id: `exit${index}`,
    kind: "highway",
    style: roadStyle({ kind: "highway", width: exit.width }),
    width: exit.width,
    pts: [...back, ...pts],
    drawFrom: back.length,
  };
}

/** A tint choice that changes with the position, for fields and roofs. */
const pick = (n: number, count: number) => Math.min(count - 1, Math.floor(n * count));

export function planLandscape(city: CityModel, aspect: number = REFERENCE_ASPECT): LandscapePlan {
  const tier: SettlementTier = city.settlement?.tier ?? "city";
  const profile = LAND_PROFILE[tier];
  const size = city.bounds.size;
  const half = size / 2;
  const seedText = landscapeSeed(city);
  const seed = seedInt(seedText);
  const reach = landReach(size, aspect);
  const flat = size * 1.15;
  const rng = prngFor(seedText, "land");

  // Roads out of the city.
  const exits = exitsOf(city, profile.minExits);
  const roads: RoadPath[] = exits.map((exit, i) => extendExit(exit, i, reach, size, prngFor(seedText, `road${i}`)));

  // Rivers and ponds.
  const aimExit = exits.length ? exits[Math.floor(hash01(seed, 9, 3) * exits.length)] : null;
  const rivers: River[] = [makeRiver(prngFor(seedText, "river"), size, reach, profile, aimExit ? Math.atan2(aimExit.z, aimExit.x) : null)];
  const ponds: Pond[] = [];

  // Bridges where a road crosses a river.
  const bridges: Bridge[] = [];
  for (const road of roads) {
    for (const river of rivers) {
      for (let i = road.drawFrom; i + 1 < road.pts.length; i++) {
        for (let j = 0; j + 1 < river.pts.length; j++) {
          const hit = segmentCross(road.pts[i], road.pts[i + 1], river.pts[j], river.pts[j + 1]);
          if (!hit) continue;
          if (bridges.some((b) => Math.hypot(b.x - hit.x, b.z - hit.z) < river.width + 10 + river.spec.bank * 2)) continue;
          bridges.push({
            x: hit.x,
            z: hit.z,
            yaw: Math.atan2(road.pts[i + 1].x - road.pts[i].x, road.pts[i + 1].z - road.pts[i].z),
            // Water, both banks and a few units of level land at each end for the abutments to stand on.
            length: river.width + trenchReach(river.spec) * 2 + 4,
            width: road.width + 1.4,
            half: river.width / 2,
            bank: river.spec.bank,
          });
        }
      }
    }
  }

  // The pond of a village: in the apron, well away from the roads and the river.
  const pondFree = (x: number, z: number, r: number) =>
    linf(x, z) > half * PLOT_MARGIN + r + 8 &&
    roads.every((road) => distToPath(road.pts, x, z) > r + 10 + road.width / 2) &&
    rivers.every((river) => distToPath(river.pts, x, z) > r + river.width / 2 + trenchReach(river.spec) + 10);
  if (profile.pond) {
    const prng = prngFor(seedText, "pond");
    for (let tries = 0; tries < 60 && ponds.length === 0; tries++) {
      const a = prng.range(0, Math.PI * 2);
      const r = prng.range(half * 1.15, size * 0.92);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const rx = prng.range(9, 15);
      if (pondFree(x, z, rx * 1.2 + POND_SPEC.bank * 1.8)) ponds.push({ x, z, rx, rz: rx * prng.range(0.6, 0.85), yaw: prng.range(0, Math.PI), spec: POND_SPEC });
    }
  }

  // --- The ground -------------------------------------------------------
  const amp = profile.hills * size;
  const bank = valley(size);
  const roll = (x: number, z: number) => fbm(x / (0.9 * size) + 11.3, z / (0.9 * size) - 4.7, seed, 3);
  /** The land before any water is cut into it: flat along a river's valley. */
  const level = (x: number, z: number): number => {
    const m = landDistance(x, z);
    const ramp = smooth01((m - flat) / (1.3 * size));
    const dr = Math.hypot(x, z);
    // The far rim rolls back down to the horizon so that it is never seen as an edge.
    const rim = 1 - smooth01((dr - reach * 0.72) / (reach * 0.28)) * 0.94;
    let h = (amp * (0.3 + 1.15 * roll(x, z)) * ramp + profile.rise * Math.max(0, m - flat) * ramp) * rim;
    // Valleys: the land comes down to the water's own level along a river, flat as far as its banks reach.
    let flatten = 1;
    for (const river of rivers) {
      const inner = river.width / 2 + trenchReach(river.spec) + 1;
      const dist = distToPath(river.pts, x, z, 0, inner + bank);
      flatten = Math.min(flatten, smooth01((dist - inner) / bank));
    }
    for (const pond of ponds) {
      const edge = pondEdge(pond, x, z);
      const inner = trenchReach(pond.spec) + 1;
      flatten = Math.min(flatten, smooth01((edge - inner) / (bank * 0.6)));
    }
    h *= flatten;
    return GROUND_Y + h;
  };
  /** The terrain: the land with a trench cut along every river and round every pond (`water.ts`). */
  const height = (x: number, z: number): number => {
    const y = level(x, z);
    let cut = 0;
    for (const river of rivers) {
      const reachD = river.width / 2 + trenchReach(river.spec);
      const dist = distToPath(river.pts, x, z, 0, reachD);
      if (dist >= reachD) continue;
      cut = Math.max(cut, trenchDepth(dist - river.width / 2, river.spec, river.width / 2));
    }
    for (const pond of ponds) {
      const edge = pondEdge(pond, x, z);
      if (edge >= trenchReach(pond.spec)) continue;
      cut = Math.max(cut, trenchDepth(edge, pond.spec, Math.min(pond.rx, pond.rz)));
    }
    return y - cut;
  };

  // Forest cover: a low-frequency mask that is denser in the hills.
  const forest = (x: number, z: number): number => {
    const m = landDistance(x, z);
    const inHills = 0.35 + 0.65 * smooth01((m - flat * 0.8) / (1.0 * size));
    const n = fbm(x / (0.32 * size) + 3.1, z / (0.32 * size) + 9.7, seed + 7, 3);
    return smooth01((n * inHills - 0.36) / 0.22);
  };

  const clearOf = (x: number, z: number, margin: number): boolean => {
    if (linf(x, z) < half * PLOT_MARGIN + margin) return false;
    for (const b of bridges) if (Math.hypot(x - b.x, z - b.z) < b.length / 2 + margin + 6) return false;
    for (const road of roads) if (distToPath(road.pts, x, z, 0, road.width / 2 + margin) < road.width / 2 + margin) return false;
    for (const river of rivers) {
      const r = river.width / 2 + trenchReach(river.spec) + margin;
      if (distToPath(river.pts, x, z, 0, r) < r) return false;
    }
    for (const pond of ponds) if (pondEdge(pond, x, z) < trenchReach(pond.spec) + margin) return false;
    return true;
  };

  // --- Houses -------------------------------------------------------------
  const houses: HouseSpot[] = [];
  const streets: LandscapePlan["streets"] = [];
  const hRng = prngFor(seedText, "houses");
  /** How big each of the city's models is drawn out here (width, height, depth): a little roomier than in the town. */
  const HOUSE_SIZE: Partial<Record<ModelKey, readonly [number, number, number]>> = {
    cottage: [4.4, 4.4, 4.2],
    "cottage/tile": [4.6, 4.9, 4.4],
    farmhouse: [5.4, 6.4, 5.2],
    barn: [5.6, 6.6, 8.6],
    terrace: [4.8, 5.8, 4.6],
    "apartment-low": [5.6, 9.2, 5.6],
    house: [4.6, 4.6, 4.4],
    "lowrise-pitched": [5.2, 7.0, 4.6],
    "lowrise-parapet": [5.2, 6.4, 5.0],
    "midrise-setback": [5.6, 9.0, 5.4],
  };
  const pickModel = (table: readonly (readonly [ModelKey, number])[]): ModelKey => {
    let roll = hRng.next();
    for (const [model, share] of table) {
      if (roll < share) return model;
      roll -= share;
    }
    return table[0][0];
  };
  const FRINGE_MODELS = [["cottage/tile", 0.4], ["terrace", 0.28], ["cottage", 0.1], ["lowrise-pitched", 0.12], ["apartment-low", 0.1]] as const;
  const HAMLET_MODELS = [["cottage/tile", 0.4], ["cottage", 0.3], ["farmhouse", 0.2], ["terrace", 0.1]] as const;
  const SPRAWL_MODELS = [["house", 0.6], ["lowrise-pitched", 0.22], ["lowrise-parapet", 0.18]] as const;
  const SPRAWL_BLOCKS = [["midrise-setback", 0.5], ["lowrise-parapet", 0.5]] as const;
  const houseAt = (x: number, z: number, yaw: number, model: ModelKey, scale = 1) => {
    const base = HOUSE_SIZE[model] ?? [5, 6, 5];
    const j = 0.9 + hRng.next() * 0.22;
    houses.push({
      x, z, yaw,
      w: base[0] * j * scale,
      h: base[1] * (0.92 + hRng.next() * 0.2) * scale,
      d: base[2] * (0.92 + hRng.next() * 0.16) * scale,
      model,
      key: `land-${houses.length}`,
      tint: hRng.next(),
    });
  };

  /** Heading of a house standing `side` of a road running along (ux, uz), turned to face it. */
  const facing = (ux: number, uz: number, side: number) => Math.atan2(side * uz, -side * ux);

  /** Circles the fields must keep out of: the sprawl's blocks. */
  const taken: { x: number; z: number; r: number }[] = [];

  if (profile.settle === "sprawl") {
    // Streets of houses in the apron and beyond, in blocks that follow the
    // city's own axes, with a lane strip between the rows. Fields keep out.
    const block = 64;
    const n = Math.ceil((size * 1.9) / block);
    for (let i = -n; i <= n; i++) {
      for (let j = -n; j <= n; j++) {
        const cx = i * block + (hash01(i, j, seed + 70) - 0.5) * 6;
        const cz = j * block + (hash01(i, j, seed + 71) - 0.5) * 6;
        const m = landDistance(cx, cz);
        if (m < half * 1.12 || m > size * 1.8) continue;
        // Thick near the city, gone into countryside further out.
        const density = smooth01(1 - (m - half * 1.1) / (size * 1.1));
        if (hash01(i, j, seed + 72) > density * 1.05) continue;
        if (fbm(cx / (0.4 * size), cz / (0.4 * size), seed + 73, 2) < 0.34) continue;
        if (!clearOf(cx, cz, 34) || level(cx, cz) - GROUND_Y > 0.05 * size) continue;
        const yaw = hash01(i, j, seed + 74) < 0.5 ? 0 : Math.PI / 2;
        const c = Math.cos(yaw);
        const s = Math.sin(yaw);
        taken.push({ x: cx, z: cz, r: block * 0.72 });
        streets.push({ x: cx, z: cz, length: block - 6, yaw: yaw + Math.PI / 2 });
        streets.push({ x: cx + 26 * -s, z: cz + 26 * c, length: block - 6, yaw: yaw + Math.PI / 2 });
        for (const row of [-1, 1]) {
          for (const strip of [0, 1]) {
            for (let k = -2; k <= 3; k++) {
              if (hRng.next() < 0.07) continue;
              const lx = (k - 0.5) * 10.5;
              const lz = (row * 8) + strip * 26;
              const x = cx + lx * s + lz * c;
              const z = cz + lx * c - lz * s;
              houseAt(x, z, yaw + (row > 0 ? Math.PI : 0), pickModel(hRng.next() < 0.12 ? SPRAWL_BLOCKS : SPRAWL_MODELS), 0.92);
            }
          }
        }
      }
    }
  }

  // --- Fields, woods and hedges: irregular cells ---------------------------
  // Seeds are scattered at a spacing that drifts with noise, so the power
  // diagram over them has big cells (merged fields, broad woods) where the
  // noise is high and small ones where it is low, and no lattice anywhere.
  // Each cell is trimmed to keep off the plot, the roads, the rivers, the
  // ponds and the sprawl, so fields follow what they meet.
  const cell = profile.cell * 0.8;
  const farmReach = Math.min(size * profile.farm, reach * 0.62);
  const fieldBudget = profile.settle === "sprawl" ? 240 : 320;
  const fields: FieldCell[] = [];
  const hedges: HedgeRun[] = [];
  const trees: TreeSpot[] = [];
  const treeRng = prngFor(seedText, "trees");
  // The cells are stretched along the country's grain, which follows the first road out: a field is longer than it is wide.
  const grainYaw = exits.length ? Math.atan2(exits[0].dz, exits[0].dx) : rng.range(0, Math.PI);
  const STRETCH = 1.5;
  const gc = Math.cos(grainYaw);
  const gs = Math.sin(grainYaw);
  const toWorld = (u: number, v: number): Pt => ({ x: u * STRETCH * gc - v * gs, z: u * STRETCH * gs + v * gc });
  const sizeOf = (u: number, v: number) => {
    const w = toWorld(u, v);
    return 0.62 + 1.0 * smooth01((fbm(w.x / (1.3 * size) + 2.2, w.z / (1.3 * size) - 7.7, seed + 5, 2) - 0.25) / 0.5);
  };
  const seeds = scatterSeeds(farmReach * 1.04, cell, seed + 80, sizeOf, (u, v) => {
    const w = toWorld(u, v);
    return landDistance(w.x, w.z) <= farmReach * 1.06;
  });
  const boxMin = half * PLOT_MARGIN + 2.4;

  interface Kept {
    id: number;
    x: number;
    z: number;
    pts: Pt[];
    edge: number[];
    radius: number;
    kind: "field" | "wood" | "meadow";
    pasture: boolean;
    rowYaw: number;
  }
  const trimCell = (c: Cell): Kept | null => {
    let pts: Pt[] = c.pts;
    let edge: number[] = c.edge;
    let ctr = polyCentroid(pts);
    const radiusOf = () => pts.reduce((m, p) => Math.max(m, Math.hypot(p.x - ctr.x, p.z - ctr.z)), 0);
    let rad = radiusOf();
    if (linf(ctr.x, ctr.z) < boxMin) return null;
    const cut = (a: number, b: number, k: number): boolean => {
      const res = clipHalfPlane(pts, edge, a, b, k, EDGE_CUT);
      if (res.pts.length < 3) return false;
      pts = res.pts;
      edge = res.edge;
      ctr = polyCentroid(pts);
      return true;
    };
    // The plot: the side the cell's middle is most beyond.
    if (Math.abs(ctr.x) >= Math.abs(ctr.z)) {
      if (Math.abs(ctr.x) - rad < boxMin && !cut(-Math.sign(ctr.x), 0, -boxMin)) return null;
    } else if (Math.abs(ctr.z) - rad < boxMin && !cut(0, -Math.sign(ctr.z), -boxMin)) return null;
    rad = radiusOf();
    /** Keeps the cell on its own side of a segment, `m` from it. */
    const offLine = (ax: number, az: number, bx: number, bz: number, m: number): boolean => {
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 1e-6) return true;
      if (distToSegment(ctr.x, ctr.z, ax, az, bx, bz) >= rad + m) return true;
      const nx = -(bz - az) / len;
      const nz = (bx - ax) / len;
      const side = nx * (ctr.x - ax) + nz * (ctr.z - az) >= 0 ? 1 : -1;
      return cut(-side * nx, -side * nz, -(m + side * (nx * ax + nz * az)));
    };
    for (const road of roads) {
      const m = road.width / 2 + 2.8;
      for (let i = 0; i + 1 < road.pts.length; i++) {
        const a = road.pts[i];
        const b = road.pts[i + 1];
        if (Math.min(a.x, b.x) > ctr.x + rad + m || Math.max(a.x, b.x) < ctr.x - rad - m) continue;
        if (Math.min(a.z, b.z) > ctr.z + rad + m || Math.max(a.z, b.z) < ctr.z - rad - m) continue;
        if (!offLine(a.x, a.z, b.x, b.z, m)) return null;
      }
    }
    for (const river of rivers) {
      const m = river.width / 2 + trenchReach(river.spec) + 2.2;
      for (let i = 0; i + 1 < river.pts.length; i++) {
        const a = river.pts[i];
        const b = river.pts[i + 1];
        if (Math.min(a.x, b.x) > ctr.x + rad + m || Math.max(a.x, b.x) < ctr.x - rad - m) continue;
        if (Math.min(a.z, b.z) > ctr.z + rad + m || Math.max(a.z, b.z) < ctr.z - rad - m) continue;
        if (!offLine(a.x, a.z, b.x, b.z, m)) return null;
      }
    }
    const round = (px: number, pz: number, r: number): boolean => {
      const dx = ctr.x - px;
      const dz = ctr.z - pz;
      const dist = Math.hypot(dx, dz);
      if (dist >= rad + r) return true;
      if (dist < 1e-6) return false;
      const nx = dx / dist;
      const nz = dz / dist;
      return cut(-nx, -nz, -(r + nx * px + nz * pz));
    };
    for (const pond of ponds) if (!round(pond.x, pond.z, Math.max(pond.rx, pond.rz) * 1.12 + trenchReach(pond.spec) + 2.2)) return null;
    for (const t of taken) if (!round(t.x, t.z, t.r)) return null;
    if (polyArea(pts) < (cell * 0.4) ** 2) return null;
    ctr = polyCentroid(pts);
    return { id: c.id, x: ctr.x, z: ctr.z, pts, edge, radius: radiusOf(), kind: "meadow", pasture: false, rowYaw: longestEdgeYaw(pts) };
  };

  const kept = new Map<number, Kept>();
  for (const c of voronoiCells(seeds)) {
    const k = trimCell({ ...c, pts: c.pts.map((p) => toWorld(p.x, p.z)) });
    if (!k) continue;
    const m = landDistance(k.x, k.z);
    if (m > farmReach) continue;
    const wet = level(k.x, k.z) - GROUND_Y;
    const r = hash01(k.id, 1, seed + 7);
    const cover = forest(k.x, k.z);
    let kind: Kept["kind"] = r < profile.fieldShare ? "field" : r < profile.fieldShare + 0.16 ? "wood" : "meadow";
    // Meadow near the farms is pasture: a green field with a hedge.
    const pasture = kind === "meadow" && m < farmReach * 0.85 && hash01(k.id, 2, seed + 81) < 0.4;
    if (pasture) kind = "field";
    // Hills are no place for a plough, and a wood mask claims its cells.
    if (kind === "field" && (wet > 0.05 * size + 2 || cover > 0.55)) kind = cover > 0.35 ? "wood" : "meadow";
    k.kind = kind;
    k.pasture = pasture && kind === "field";
    kept.set(k.id, k);
  }

  const woodCells: Kept[] = [];
  const meadowCells: Kept[] = [];
  const hedgeTrees: TreeSpot[] = [];
  for (const k of kept.values()) {
    if (k.kind === "wood") woodCells.push(k);
    else if (k.kind === "meadow") meadowCells.push(k);
    if (k.kind !== "field" || fields.length >= fieldBudget) continue;
    const ins = insetPolygon(k.pts, k.edge, 1.4);
    if (ins.pts.length < 3 || polyArea(ins.pts) < 40) continue;
    const m = landDistance(k.x, k.z);
    const crop = (k.pasture ? 5 : pick(hash01(k.id, 3, seed + 8), 5)) as Crop;
    // Hedged near the city where it is seen closely; open further out.
    const hedged = profile.settle !== "sprawl" || m < size * 1.6 ? m < Math.min(farmReach, size * 1.9) : false;
    fields.push({ x: k.x, z: k.z, poly: ins.pts, rowYaw: k.rowYaw, radius: k.radius, crop, shade: hash01(k.id, 4, seed + 9), hedged });
    if (!hedged) continue;
    for (let e = 0; e < k.pts.length; e++) {
      const lab = k.edge[e];
      if (lab === EDGE_FAR) continue;
      // A hedge between two fields is drawn once, by the lower-numbered one.
      if (lab >= 0 && kept.get(lab)?.kind === "field" && lab < k.id) continue;
      const a = k.pts[e];
      const b = k.pts[(e + 1) % k.pts.length];
      if (Math.hypot(b.x - a.x, b.z - a.z) < 4) continue;
      hedges.push({ x0: a.x, z0: a.z, x1: b.x, z1: b.z, shade: hash01(k.id, e + 5, seed + 11) });
      // The odd hedgerow tree: a big broadleaf now and then, a poplar more rarely.
      const roll = hash01(k.id, e + 40, seed + 12);
      if (roll < 0.3) {
        const t = 0.25 + hash01(k.id, e + 60, seed + 13) * 0.5;
        const x = a.x + (b.x - a.x) * t;
        const z = a.z + (b.z - a.z) * t;
        if (clearOf(x, z, 1.6)) {
          hedgeTrees.push({ x, z, scale: 1.25 + hash01(k.id, e, seed + 14) * 0.5, kind: roll < 0.04 ? 3 : 0, shade: hash01(k.id, e + 80, seed + 15) });
        }
      }
    }
  }

  // Near woods: trees at an irregular spacing inside the wood cells' rounded shapes.
  const treeBudget = profile.trees.near;
  // Nearest woods first, so a budget that runs out costs the distance and not one side of the city.
  woodCells.sort((a, b) => landDistance(a.x, a.z) - landDistance(b.x, b.z));
  for (const wood of woodCells) {
    if (trees.length >= treeBudget) break;
    const spacing = 5.4;
    const conifer = fbm(wood.x / (0.5 * size), wood.z / (0.5 * size), seed + 12, 2) + landDistance(wood.x, wood.z) / (size * 8);
    const birchy = fbm(wood.x / (0.22 * size) + 9, wood.z / (0.22 * size) - 4, seed + 16, 2);
    let x0 = Infinity;
    let x1 = -Infinity;
    let z0 = Infinity;
    let z1 = -Infinity;
    for (const p of wood.pts) {
      x0 = Math.min(x0, p.x);
      x1 = Math.max(x1, p.x);
      z0 = Math.min(z0, p.z);
      z1 = Math.max(z1, p.z);
    }
    for (let gx = x0; gx <= x1; gx += spacing) {
      for (let gz = z0; gz <= z1; gz += spacing) {
        const x = gx + (treeRng.next() - 0.5) * spacing * 0.8;
        const z = gz + (treeRng.next() - 0.5) * spacing * 0.8;
        if (!insidePoly(wood.pts, x, z)) continue;
        // A ragged edge: the wood's outline wobbles by a tree or two.
        const edgeD = convexDistance(wood.pts, x, z);
        if (-edgeD < 0.8 + 3.4 * hash01(Math.round(x), Math.round(z), seed + 13)) continue;
        if (!clearOf(x, z, 2.5)) continue;
        const roll = treeRng.next();
        const isConifer = conifer + (treeRng.next() - 0.5) * 0.25 > 0.62;
        trees.push({
          x, z,
          scale: 1 + treeRng.next() * 0.55,
          kind: isConifer ? 1 : birchy > 0.62 && roll < 0.55 ? 4 : roll > 0.97 ? 3 : 0,
          shade: treeRng.next(),
        });
      }
    }
  }
  // Meadow cells get a lone tree or two, and the hedges their odd big tree.
  for (const cellM of meadowCells) {
    if (trees.length >= treeBudget) break;
    const n = Math.floor(hash01(cellM.id, 5, seed + 14) * 3);
    for (let k = 0; k < n; k++) {
      const x = cellM.x + (hash01(cellM.id, k + 10, seed + 20) - 0.5) * cellM.radius * 0.9;
      const z = cellM.z + (hash01(cellM.id, k + 20, seed + 30) - 0.5) * cellM.radius * 0.9;
      if (!insidePoly(cellM.pts, x, z) || !clearOf(x, z, 3)) continue;
      const roll = hash01(cellM.id, k + 30, seed + 40);
      trees.push({ x, z, scale: 1.1 + roll * 0.5, kind: roll < 0.12 ? 3 : roll < 0.3 ? 4 : 0, shade: hash01(cellM.id, k + 40, seed + 50) });
    }
  }
  for (const t of hedgeTrees) {
    if (trees.length >= treeBudget) break;
    trees.push(t);
  }

  // Far canopy: bigger masses on a coarse jittered grid, thick where the forest is.
  const farCell = Math.max(18, size * 0.07);
  const farN = Math.ceil((reach * 0.78) / farCell);
  const far: TreeSpot[] = [];
  for (let i = -farN; i <= farN; i++) {
    for (let j = -farN; j <= farN; j++) {
      const x = (i + hash01(i, j, seed + 60)) * farCell;
      const z = (j + hash01(i, j, seed + 61)) * farCell;
      const m = landDistance(x, z);
      if (m < farmReach * 0.86 || Math.hypot(x, z) > reach * 0.8) continue;
      const density = forest(x, z) * 0.85 + 0.06;
      if (hash01(i, j, seed + 62) > density) continue;
      if (!clearOf(x, z, 6)) continue;
      far.push({
        x, z,
        scale: 1.2 + hash01(i, j, seed + 63) * 1.1 + m / (size * 8),
        kind: 2,
        shade: hash01(i, j, seed + 64),
      });
    }
  }
  // Over the budget: thin by a hash, so the wood loses density and not a side.
  const keep = Math.min(1, profile.trees.far / Math.max(far.length, 1));
  far.forEach((t, n) => {
    if (hash01(n, 5, seed + 65) < keep) trees.push(t);
  });

  if (profile.settle === "fringe") {
    // Houses strung along the approach roads, thinning out with distance.
    for (const road of roads) {
      let along = 0;
      for (let i = road.drawFrom; i + 1 < road.pts.length; i++) {
        const a = road.pts[i];
        const b = road.pts[i + 1];
        const len = Math.hypot(b.x - a.x, b.z - a.z);
        const ux = (b.x - a.x) / len;
        const uz = (b.z - a.z) / len;
        for (let s = 0; s < len; s += 3) {
          along += 3;
          const fade = 1 - along / (size * 0.85);
          if (fade <= 0) continue;
          if (along % 13 > 3) continue;
          for (const side of [-1, 1]) {
            if (hRng.next() > 0.85 * fade + 0.1) continue;
            const off = (road.width / 2 + 5.5 + hRng.next() * 2.5) * side;
            const px = a.x + ux * s - uz * off;
            const pz = a.z + uz * s + ux * off;
            if (!clearOf(px, pz, 3.5)) continue;
            if (level(px, pz) - GROUND_Y > 4) continue;
            houseAt(px, pz, facing(ux, uz, side), pickModel(FRINGE_MODELS));
          }
        }
      }
    }
  }

  if (profile.settle === "farms" || profile.settle === "fringe" || profile.settle === "hamlets") {
    // Farmsteads: a house and a barn in the middle of a meadow cell, the nearest ones.
    const want = profile.settle === "farms" ? 4 : profile.settle === "fringe" ? 3 : 4;
    const meadows = meadowCells
      .filter((c) => landDistance(c.x, c.z) < size * 1.9)
      .sort((a, b) => landDistance(a.x, a.z) - landDistance(b.x, b.z));
    let placed = 0;
    for (const c of meadows) {
      if (placed >= want) break;
      // Every other candidate, so they are not all in one corner.
      if (hash01(Math.round(c.x), Math.round(c.z), seed + 90) < 0.35) continue;
      const cs = Math.cos(c.rowYaw);
      const sn = Math.sin(c.rowYaw);
      if (!clearOf(c.x, c.z, 12) || level(c.x, c.z) - GROUND_Y > 0.04 * size) continue;
      houseAt(c.x + sn * 5, c.z + cs * 5, c.rowYaw + Math.PI, hRng.next() < 0.7 ? "farmhouse" : "cottage/tile");
      houseAt(c.x - sn * 8 + cs * 7, c.z - cs * 8 - sn * 7, c.rowYaw + Math.PI / 2, "barn");
      placed++;
    }
  }

  if (profile.settle === "hamlets") {
    // A few small clusters where the roads go: a green's worth of houses.
    for (let n = 0; n < 3; n++) {
      const road = roads[Math.floor(hRng.next() * Math.max(1, roads.length))];
      if (!road) break;
      // Along the flat of the road, between a half and a whole city's width out.
      const stepsOut = Math.max(1, Math.floor(((0.4 + hRng.next() * 0.7) * size) / 12));
      const idx = road.drawFrom + stepsOut;
      const p = road.pts[Math.min(idx, road.pts.length - 2)];
      const q = road.pts[Math.min(idx + 1, road.pts.length - 1)];
      const len = Math.hypot(q.x - p.x, q.z - p.z) || 1;
      const ux = (q.x - p.x) / len;
      const uz = (q.z - p.z) / len;
      for (let k = -3; k <= 3; k++) {
        for (const side of [-1, 1]) {
          if (hRng.next() < 0.3) continue;
          const off = (road.width / 2 + 6 + hRng.next() * 3) * side;
          const x = p.x + ux * k * 13 - uz * off;
          const z = p.z + uz * k * 13 + ux * off;
          if (!clearOf(x, z, 3.5) || level(x, z) - GROUND_Y > 9) continue;
          houseAt(x, z, facing(ux, uz, side), pickModel(HAMLET_MODELS));
        }
      }
    }
  }

  // --- The skyline of a metropolis --------------------------------------
  const towers: TowerSpot[] = [];
  if (profile.skyline) {
    const sRng = prngFor(seedText, "skyline");
    const clusters = 3 + Math.floor(sRng.next() * 2);
    const base = sRng.range(0, Math.PI * 2);
    for (let c = 0; c < clusters; c++) {
      const a = base + (c / clusters) * Math.PI * 2 + sRng.range(-0.3, 0.3);
      const r = Math.min(reach * 0.56, size * sRng.range(2.5, 3.0));
      const cx = Math.cos(a) * r;
      const cz = Math.sin(a) * r;
      const count = 26 + Math.floor(sRng.next() * 18);
      for (let k = 0; k < count; k++) {
        const ang = sRng.range(0, Math.PI * 2);
        const rad = Math.sqrt(sRng.next()) * size * 0.2;
        const x = cx + Math.cos(ang) * rad;
        const z = cz + Math.sin(ang) * rad;
        const centre = 1 - rad / (size * 0.2);
        towers.push({
          x, z,
          w: sRng.range(9, 20),
          d: sRng.range(9, 20),
          h: 22 + centre * centre * sRng.range(30, 70) + sRng.next() * 14,
          shade: sRng.next(),
        });
      }
    }
  }

  // --- The plot's verge: trees and hedge along the edge -------------------
  const verge: LandscapePlan["verge"] = { trees: [], hedges: [] };
  const vRng = prngFor(seedText, "verge");
  const edge = half * PLOT_MARGIN;
  const gapAt = (x: number, z: number) => {
    for (const road of roads) if (distToPath(road.pts, x, z, 0, road.width / 2 + 7) < road.width / 2 + 7) return true;
    for (const road of city.roads) {
      if (distToSegment(x, z, road.from[0], road.from[2], road.to[0], road.to[2]) < road.width / 2 + 6) return true;
    }
    return false;
  };
  const vergeStep = tier === "village" ? 11 : tier === "town" ? 9 : 8;
  for (let side = 0; side < 4; side++) {
    for (let s = -edge; s <= edge; s += vergeStep) {
      const t = s + (vRng.next() - 0.5) * vergeStep * 0.7;
      const out = 1.5 + vRng.next() * 1.5;
      const x = side === 0 ? edge + out : side === 1 ? -edge - out : t;
      const z = side === 2 ? edge + out : side === 3 ? -edge - out : t;
      if (gapAt(x, z)) continue;
      if (vRng.next() < (tier === "village" ? 0.42 : 0.5)) continue;
      verge.trees.push({
        x, z,
        scale: 0.7 + vRng.next() * 0.65,
        kind: tier === "metropolis" && vRng.next() < 0.5 ? 1 : 0,
        shade: vRng.next(),
      });
    }
    // A clipped hedge along the verge, in runs, with gaps at the roads.
    if (tier !== "metropolis") {
      const run = 9;
      for (let s = -edge; s < edge; s += run) {
        const x0 = side === 0 ? edge : side === 1 ? -edge : s;
        const z0 = side === 2 ? edge : side === 3 ? -edge : s;
        const x1 = side <= 1 ? x0 : s + run;
        const z1 = side <= 1 ? s + run : z0;
        if (gapAt((x0 + x1) / 2, (z0 + z1) / 2) || gapAt(x0, z0) || gapAt(x1, z1)) continue;
        if (vRng.next() < 0.4) continue;
        verge.hedges.push({ x0, z0, x1, z1, shade: vRng.next() });
      }
    }
  }

  return {
    tier, seed, size, half, reach, flat, profile, exits, roads, rivers, ponds, bridges,
    fields, hedges, trees, houses, streets, towers, verge, height, level, forest,
  };
}
