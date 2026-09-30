/**
 * The land round a city (`?land=rich`): what the model stands in, planned as
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
 * Whatever roads the model has that end at the plot edge continue into the
 * land as ribbons that follow the ground and bend a little; a synthetic exit
 * is added when a tier has fewer than it should.
 */

import { prngFor } from "@/lib/city/seed";
import type { Prng } from "@/lib/city/prng";
import type { SettlementTier } from "@/types/analysis";
import type { CityModel } from "@/types/city";
import { REFERENCE_ASPECT, aspectWiden } from "../entities";
import { fbm, hash01, seedInt, smooth01 } from "./noise";

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
    settle: "farms", skyline: false, minExits: 2, trees: { near: 900, far: 900 },
  },
  town: {
    hills: 0.12, rise: 0.034, cell: 36, farm: 2.1, fieldShare: 0.5,
    river: { width: 8, radius: 1.2, wander: 0.08, span: 1.7 }, pond: false,
    settle: "fringe", skyline: false, minExits: 2, trees: { near: 1100, far: 1100 },
  },
  city: {
    hills: 0.17, rise: 0.044, cell: 46, farm: 2.6, fieldShare: 0.42,
    river: { width: 15, radius: 1.32, wander: 0.09, span: 1.9 }, pond: false,
    settle: "hamlets", skyline: false, minExits: 3, trees: { near: 1300, far: 1500 },
  },
  metropolis: {
    hills: 0.12, rise: 0.034, cell: 54, farm: 3, fieldShare: 0.36,
    river: { width: 30, radius: 1.18, wander: 0.06, span: 1.8 }, pond: false,
    settle: "sprawl", skyline: true, minExits: 4, trees: { near: 1000, far: 1300 },
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
  width: number;
  pts: Pt[];
  /** The first point that is drawn: everything before it is the model's own road. */
  drawFrom: number;
}

export interface River {
  width: number;
  pts: Pt[];
}

export interface Pond {
  x: number;
  z: number;
  rx: number;
  rz: number;
  yaw: number;
}

export interface Bridge {
  x: number;
  z: number;
  /** Heading of the road across it. */
  yaw: number;
  length: number;
  width: number;
}

export type Crop = 0 | 1 | 2 | 3 | 4 | 5;

export interface FieldCell {
  x: number;
  z: number;
  w: number;
  d: number;
  yaw: number;
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
  /** 0 broadleaf, 1 conifer, 2 far canopy mass. */
  kind: 0 | 1 | 2;
  shade: number;
}

export interface HouseSpot {
  x: number;
  z: number;
  yaw: number;
  w: number;
  d: number;
  h: number;
  kind: "house" | "barn" | "block";
  /** 0..1: which roof and how it is tinted. */
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
  /** Ground height at a world point. */
  height: (x: number, z: number) => number;
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
  return { width, pts: smoothPath(raw, 4) };
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
          if (bridges.some((b) => Math.hypot(b.x - hit.x, b.z - hit.z) < river.width + 10)) continue;
          bridges.push({
            x: hit.x,
            z: hit.z,
            yaw: Math.atan2(road.pts[i + 1].x - road.pts[i].x, road.pts[i + 1].z - road.pts[i].z),
            length: river.width + 12,
            width: road.width + 1.4,
          });
        }
      }
    }
  }

  // The pond of a village: in the apron, well away from the roads and the river.
  const pondFree = (x: number, z: number, r: number) =>
    linf(x, z) > half * PLOT_MARGIN + r + 8 &&
    roads.every((road) => distToPath(road.pts, x, z) > r + 10 + road.width / 2) &&
    rivers.every((river) => distToPath(river.pts, x, z) > r + river.width / 2 + 10);
  if (profile.pond) {
    const prng = prngFor(seedText, "pond");
    for (let tries = 0; tries < 60 && ponds.length === 0; tries++) {
      const a = prng.range(0, Math.PI * 2);
      const r = prng.range(half * 1.15, size * 0.92);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const rx = prng.range(9, 15);
      if (pondFree(x, z, rx * 1.2)) ponds.push({ x, z, rx, rz: rx * prng.range(0.6, 0.85), yaw: prng.range(0, Math.PI) });
    }
  }

  // --- The ground -------------------------------------------------------
  const amp = profile.hills * size;
  const bank = valley(size);
  const roll = (x: number, z: number) => fbm(x / (0.9 * size) + 11.3, z / (0.9 * size) - 4.7, seed, 3);
  const height = (x: number, z: number): number => {
    const m = landDistance(x, z);
    const ramp = smooth01((m - flat) / (1.3 * size));
    const dr = Math.hypot(x, z);
    // The far rim rolls back down to the horizon so that it is never seen as an edge.
    const rim = 1 - smooth01((dr - reach * 0.72) / (reach * 0.28)) * 0.94;
    let h = (amp * (0.3 + 1.15 * roll(x, z)) * ramp + profile.rise * Math.max(0, m - flat) * ramp) * rim;
    // Valleys: the land comes down to the water's own level along a river.
    let flatten = 1;
    for (const river of rivers) {
      const dist = distToPath(river.pts, x, z, 0, river.width / 2 + 1.5 + bank);
      flatten = Math.min(flatten, smooth01((dist - (river.width / 2 + 1.5)) / bank));
    }
    for (const pond of ponds) {
      const dist = Math.hypot(x - pond.x, z - pond.z) / Math.max(pond.rx, pond.rz);
      flatten = Math.min(flatten, smooth01((dist - 1) / 1.5));
    }
    h *= flatten;
    return GROUND_Y + h;
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
    for (const river of rivers) if (distToPath(river.pts, x, z, 0, river.width / 2 + margin + 1) < river.width / 2 + margin + 1) return false;
    for (const pond of ponds) if (Math.hypot(x - pond.x, z - pond.z) < Math.max(pond.rx, pond.rz) + margin) return false;
    return true;
  };

  /** A rotated rectangle clear of the plot, the roads, the rivers and the ponds, by `pad`. */
  const rectClear = (cx: number, cz: number, w: number, d: number, yaw: number, pad: number): boolean => {
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const ex = Math.abs(c) * (w / 2) + Math.abs(s) * (d / 2);
    const ez = Math.abs(s) * (w / 2) + Math.abs(c) * (d / 2);
    if (Math.abs(cx) < half * PLOT_MARGIN + ex + pad && Math.abs(cz) < half * PLOT_MARGIN + ez + pad) return false;
    for (const t of taken) if (Math.hypot(cx - t.x, cz - t.z) < t.r + Math.hypot(w, d) / 2) return false;
    for (const [u, v] of [[0, 0], [-1, -1], [1, -1], [1, 1], [-1, 1], [-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const lx = (u * w) / 2;
      const lz = (v * d) / 2;
      const x = cx + lx * c + lz * s;
      const z = cz - lx * s + lz * c;
      for (const road of roads) if (distToPath(road.pts, x, z, 0, road.width / 2 + pad) < road.width / 2 + pad) return false;
      for (const river of rivers) if (distToPath(river.pts, x, z, 0, river.width / 2 + pad + 1) < river.width / 2 + pad + 1) return false;
      for (const pond of ponds) if (Math.hypot(x - pond.x, z - pond.z) < Math.max(pond.rx, pond.rz) + pad) return false;
    }
    return true;
  };

  // --- Houses -------------------------------------------------------------
  const houses: HouseSpot[] = [];
  const streets: LandscapePlan["streets"] = [];
  const hRng = prngFor(seedText, "houses");
  const houseAt = (x: number, z: number, yaw: number, kind: HouseSpot["kind"], scale = 1) => {
    const w = (kind === "barn" ? 9 : kind === "block" ? 11 : 5.2) * (0.85 + hRng.next() * 0.35) * scale;
    const d = (kind === "barn" ? 16 : kind === "block" ? 9 : 6.4) * (0.85 + hRng.next() * 0.3) * scale;
    const h = (kind === "barn" ? 7.2 : kind === "block" ? 6 : 6) * (0.9 + hRng.next() * 0.25);
    houses.push({ x, z, yaw, w, d, h, kind, tint: hRng.next() });
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
        if (!clearOf(cx, cz, 34) || height(cx, cz) - GROUND_Y > 0.05 * size) continue;
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
              houseAt(x, z, yaw + (row > 0 ? Math.PI : 0), hRng.next() < 0.12 ? "block" : "house", 0.88);
            }
          }
        }
      }
    }
  }

  // --- Fields, woods and hedges: a lattice of cells ---------------------------
  const cell = profile.cell;
  const farmReach = Math.min(size * profile.farm, reach * 0.62);
  const fields: FieldCell[] = [];
  const hedges: HedgeRun[] = [];
  const trees: TreeSpot[] = [];
  const treeRng = prngFor(seedText, "trees");
  const cellsN = Math.ceil(farmReach / cell);
  const domainYaw = rng.range(0, Math.PI / 2);
  const fieldBudget = profile.settle === "sprawl" ? 240 : 320;
  const woodCells: { x: number; z: number; w: number; d: number }[] = [];
  const cellKind = new Map<string, "field" | "wood" | "meadow" | "sprawl">();
  const cellAt = new Map<string, { x: number; z: number; w: number; d: number; yaw: number }>();

  for (let i = -cellsN; i <= cellsN; i++) {
    for (let j = -cellsN; j <= cellsN; j++) {
      // Rows are offset from one another, like brickwork, so no line runs the whole way.
      const rowShift = hash01(j, 0, seed + 80) * cell * 0.9;
      const jx = (hash01(i, j, seed + 1) - 0.5) * cell * 0.2;
      const jz = (hash01(i, j, seed + 2) - 0.5) * cell * 0.2;
      const cx = i * cell + rowShift + jx;
      const cz = j * cell + jz;
      const m = landDistance(cx, cz);
      if (m > farmReach) continue;
      const w = cell * (0.7 + hash01(i, j, seed + 3) * 0.3);
      const d = cell * (0.66 + hash01(i, j, seed + 4) * 0.3);
      const domain = fbm(cx / (2.6 * size) + 4.4, cz / (2.6 * size) - 2.2, seed + 5, 2) > 0.5 ? 1 : 0;
      const yaw = domainYaw + domain * 0.55 + (hash01(i, j, seed + 6) - 0.5) * 0.16;
      if (!rectClear(cx, cz, w, d, yaw, 1.6)) continue;
      const wet = height(cx, cz) - GROUND_Y;
      const r = hash01(i, j, seed + 7);
      const cover = forest(cx, cz);
      let kind: "field" | "wood" | "meadow" = r < profile.fieldShare ? "field" : r < profile.fieldShare + 0.16 ? "wood" : "meadow";
      // Meadow near the farms is pasture: a green field with a hedge.
      const pasture = kind === "meadow" && m < farmReach * 0.85 && hash01(i, j, seed + 81) < 0.4;
      if (pasture) kind = "field";
      // Hills are no place for a plough, and a wood mask claims its cells.
      if (kind === "field" && (wet > 0.05 * size + 2 || cover > 0.55)) kind = cover > 0.35 ? "wood" : "meadow";
      // Where a lattice of one heading meets the other, leave woodland between.
      const nextDomain = fbm((cx + cell) / (2.6 * size) + 4.4, cz / (2.6 * size) - 2.2, seed + 5, 2) > 0.5 ? 1 : 0;
      const prevDomain = fbm(cx / (2.6 * size) + 4.4, (cz + cell) / (2.6 * size) - 2.2, seed + 5, 2) > 0.5 ? 1 : 0;
      if (kind === "field" && (nextDomain !== domain || prevDomain !== domain)) kind = "wood";
      cellKind.set(`${i}:${j}`, kind);
      cellAt.set(`${i}:${j}`, { x: cx, z: cz, w, d, yaw });
      if (kind === "field" && fields.length < fieldBudget) {
        const crop = (pasture ? 5 : pick(hash01(i, j, seed + 8), 5)) as Crop;
        // Hedged near the city where it is seen closely; open further out.
        const hedged = profile.settle !== "sprawl" || m < size * 1.6 ? m < Math.min(farmReach, size * 1.9) : false;
        fields.push({ x: cx, z: cz, w: w - 2.2, d: d - 2.2, yaw, crop, shade: hash01(i, j, seed + 9), hedged });
        if (hedged) {
          const c = Math.cos(yaw);
          const s = Math.sin(yaw);
          const corners: Pt[] = [
            { x: -w / 2, z: -d / 2 },
            { x: w / 2, z: -d / 2 },
            { x: w / 2, z: d / 2 },
            { x: -w / 2, z: d / 2 },
          ].map((p) => ({ x: cx + p.x * c + p.z * s, z: cz - p.x * s + p.z * c }));
          for (let k = 0; k < 4; k++) {
            // A gate in one side in three: no hedge there.
            if (hash01(i * 4 + k, j, seed + 10) < 0.22) continue;
            const a = corners[k];
            const b = corners[(k + 1) % 4];
            hedges.push({ x0: a.x, z0: a.z, x1: b.x, z1: b.z, shade: hash01(i * 4 + k, j, seed + 11) });
          }
        }
      } else if (kind === "wood") {
        woodCells.push({ x: cx, z: cz, w, d });
      }
    }
  }

  // Near woods: trees at an irregular spacing inside the wood cells' rounded shapes.
  const treeBudget = profile.trees.near;
  // Nearest woods first, so a budget that runs out costs the distance and not one side of the city.
  woodCells.sort((a, b) => landDistance(a.x, a.z) - landDistance(b.x, b.z));
  for (const wood of woodCells) {
    if (trees.length >= treeBudget) break;
    const rx = wood.w * 0.5;
    const rz = wood.d * 0.5;
    const spacing = 5.2;
    const conifer = fbm(wood.x / (0.5 * size), wood.z / (0.5 * size), seed + 12, 2) + landDistance(wood.x, wood.z) / (size * 8);
    for (let gx = -rx; gx <= rx; gx += spacing) {
      for (let gz = -rz; gz <= rz; gz += spacing) {
        const x = wood.x + gx + (treeRng.next() - 0.5) * spacing * 0.8;
        const z = wood.z + gz + (treeRng.next() - 0.5) * spacing * 0.8;
        const edge = (Math.abs(x - wood.x) / rx) ** 2 + (Math.abs(z - wood.z) / rz) ** 2;
        const wobble = 0.72 + 0.38 * hash01(Math.round(x), Math.round(z), seed + 13);
        if (edge > wobble) continue;
        if (!clearOf(x, z, 2.5)) continue;
        trees.push({
          x, z,
          scale: 1 + treeRng.next() * 0.55,
          kind: conifer + (treeRng.next() - 0.5) * 0.25 > 0.62 ? 1 : 0,
          shade: treeRng.next(),
        });
      }
    }
  }
  // Meadow cells get a lone tree or two, and field corners a hedgerow tree.
  for (const [key, kind] of cellKind) {
    if (trees.length >= treeBudget) break;
    if (kind !== "meadow") continue;
    const [i, j] = key.split(":").map(Number);
    const n = Math.floor(hash01(i, j, seed + 14) * 3);
    for (let k = 0; k < n; k++) {
      const x = i * cell + (hash01(i, j, seed + 20 + k) - 0.5) * cell * 0.7;
      const z = j * cell + (hash01(i, j, seed + 30 + k) - 0.5) * cell * 0.7;
      if (!clearOf(x, z, 3)) continue;
      trees.push({ x, z, scale: 1.1 + hash01(i, j, seed + 40 + k) * 0.5, kind: 0, shade: hash01(i, j, seed + 50 + k) });
    }
  }
  for (const field of fields) {
    if (!field.hedged || trees.length >= treeBudget) continue;
    if (hash01(Math.round(field.x), Math.round(field.z), seed + 15) < 0.45) {
      const c = Math.cos(field.yaw);
      const s = Math.sin(field.yaw);
      const sx = hash01(Math.round(field.x), 0, seed + 16) < 0.5 ? -1 : 1;
      const sz = hash01(0, Math.round(field.z), seed + 17) < 0.5 ? -1 : 1;
      const lx = (field.w / 2 + 1.1) * sx;
      const lz = (field.d / 2 + 1.1) * sz;
      const x = field.x + lx * c + lz * s;
      const z = field.z - lx * s + lz * c;
      if (clearOf(x, z, 2)) trees.push({ x, z, scale: 1.25 + field.shade * 0.4, kind: 0, shade: field.shade });
    }
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
          if (along % 18 > 3) continue;
          for (const side of [-1, 1]) {
            if (hRng.next() > 0.85 * fade + 0.1) continue;
            const off = (road.width / 2 + 5.5 + hRng.next() * 2.5) * side;
            const px = a.x + ux * s - uz * off;
            const pz = a.z + uz * s + ux * off;
            if (!clearOf(px, pz, 3.5)) continue;
            if (height(px, pz) - GROUND_Y > 4) continue;
            houseAt(px, pz, facing(ux, uz, side), "house");
          }
        }
      }
    }
  }

  if (profile.settle === "farms" || profile.settle === "fringe" || profile.settle === "hamlets") {
    // Farmsteads: a house and a barn in the middle of a meadow cell, the nearest ones.
    const want = profile.settle === "farms" ? 4 : profile.settle === "fringe" ? 3 : 4;
    const meadows = [...cellKind.entries()]
      .filter(([, kind]) => kind === "meadow")
      .map(([key]) => cellAt.get(key)!)
      .filter((c) => landDistance(c.x, c.z) < size * 1.9)
      .sort((a, b) => landDistance(a.x, a.z) - landDistance(b.x, b.z));
    let placed = 0;
    for (const c of meadows) {
      if (placed >= want) break;
      // Every other candidate, so they are not all in one corner.
      if (hash01(Math.round(c.x), Math.round(c.z), seed + 90) < 0.35) continue;
      const cs = Math.cos(c.yaw);
      const sn = Math.sin(c.yaw);
      if (!clearOf(c.x, c.z, 12) || height(c.x, c.z) - GROUND_Y > 0.04 * size) continue;
      houseAt(c.x + sn * 5, c.z + cs * 5, c.yaw + Math.PI, "house");
      houseAt(c.x - sn * 7 + cs * 6, c.z - cs * 7 - sn * 6, c.yaw + Math.PI / 2, "barn");
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
          if (!clearOf(x, z, 3.5) || height(x, z) - GROUND_Y > 9) continue;
          houseAt(x, z, facing(ux, uz, side), "house");
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
    fields, hedges, trees, houses, streets, towers, verge, height, forest,
  };
}
