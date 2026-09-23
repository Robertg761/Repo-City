/**
 * People on the pavement (PLAN.md sections 17, 18, 37).
 *
 * Contributors and commits do not map to individual pedestrians -- section 17
 * forbids exactly that -- they set `ambience.pedestrianDensity`, and this
 * module turns that number into a crowd walking the road graph.
 *
 * Walkers reuse the traffic graph rather than a second network: they follow
 * the same centrelines, offset onto the pavement by half a carriageway plus a
 * unit, and turn at junctions the way the cars do. Deterministic given the
 * model's seed, so screenshots reproduce (section 35).
 *
 * Nobody walks through anything standing on the pavement (PLAN.md 76.15):
 * a kerb hoarding, a scaffold, a works van up on the kerb, an incident's
 * cordon. `pavementBlocks` finds where each obstacle reaches each pavement,
 * and a walker who comes up to one turns round and walks back the way they
 * came, on the same side of the street.
 *
 * Pure, no three.js: unit tested.
 */

import type { Prng } from "@/lib/city/prng";
import type { Landmark, RoadSegment, Vec3 } from "@/types/city";
import type { Obstacle } from "../../blockages";
import { nextRide, type RoadGraph, type Ride } from "../../traffic";

/**
 * Section 63 puts pedestrians third on the list of things to cut, so the crowd
 * is capped well below the fleet's visual weight: eighty figures of two
 * primitives each is two draw calls and a fraction of the city's triangles.
 */
export const MAX_WALKERS = 80;

/** How far outside the kerb a pavement sits, in world units. */
export const PAVEMENT_MARGIN = 1;

export interface Walker extends Ride {
  /** Progress 0..1 along the travel direction. */
  t: number;
  /** World units per second: a brisk stroll at the generator's scale. */
  speed: number;
  /** Which pavement: +1 is the right-hand side of the travel direction. */
  side: 1 | -1;
  /** Seeded offset into the walk cycle, so a crowd does not bob in unison. */
  phase: number;
  colorIndex: number;
  /** Seeded height, about 1: a crowd is not a row of identical pegs. */
  height: number;
  skinIndex: number;
}

/**
 * How many people the city gets. An archived repository keeps a couple of
 * figures rather than none: section 19 asks for quiet, not for a ghost town
 * with nobody in it at all.
 */
export function walkerCount(pedestrianDensity: number, archived: boolean): number {
  const density = Math.max(0, Math.min(1, pedestrianDensity));
  const lively = Math.min(MAX_WALKERS, Math.round(60 * density));
  if (!archived) return lively;
  return Math.min(3, Math.round(lively * 0.06));
}

/** Pavements need a road long enough to walk down. */
const walkable = (road: RoadSegment): boolean =>
  Math.hypot(road.to[0] - road.from[0], road.to[2] - road.from[2]) > 6;

/**
 * Seeded placement. Minor roads carry the crowd: people walk the side streets
 * as much as the arterials, unlike the fleet, which favours the arterials.
 */
export function spawnWalkers(
  roads: readonly RoadSegment[],
  count: number,
  prng: Prng,
): Walker[] {
  const candidates = roads
    .map((road, index) => ({ road, index }))
    .filter(({ road }) => walkable(road));
  if (candidates.length === 0) return [];

  const walkers: Walker[] = [];
  const total = Math.max(0, Math.min(count, MAX_WALKERS));
  for (let i = 0; i < total; i++) {
    const { index } = prng.pick(candidates);
    walkers.push({
      segment: index,
      forward: prng.next() < 0.5,
      t: prng.next(),
      // About 4 to 6 km/h at the generator's scale (a unit is around a metre
      // and a half), which is walking pace next to traffic doing thirty.
      speed: prng.range(0.75, 1.15),
      side: prng.next() < 0.5 ? 1 : -1,
      phase: prng.range(0, Math.PI * 2),
      colorIndex: prng.int(0, PERSON_COLORS.length - 1),
      height: prng.range(0.88, 1.1),
      skinIndex: prng.int(0, SKIN_TONES.length - 1),
    });
  }
  return walkers;
}

export interface WalkerPose {
  x: number;
  z: number;
  /** Heading in radians for `rotation.y`. */
  angle: number;
}

/** Position and heading for a walker, out on the pavement. */
export function walkerPose(graph: RoadGraph, walker: Walker): WalkerPose {
  const seg = graph.segments[walker.segment];
  const start = walker.forward ? seg.from : seg.to;
  const end = walker.forward ? seg.to : seg.from;
  const dx = end[0] - start[0];
  const dz = end[2] - start[2];
  const len = Math.hypot(dx, dz) || 1;
  const ux = dx / len;
  const uz = dz / len;
  const offset = (seg.width / 2 + PAVEMENT_MARGIN) * walker.side;
  return {
    x: start[0] + ux * len * walker.t - uz * offset,
    z: start[2] + uz * len * walker.t + ux * offset,
    angle: Math.atan2(ux, uz),
  };
}

/**
 * Where each pavement is blocked. Per segment, per pavement -- `[0]` on the
 * left of the segment's `from` to `to` direction, `[1]` on the right -- a
 * sorted flat list of `[start, end, start, end, ...]` in world units from
 * the segment's `from` end.
 */
export type PavementBlocks = readonly (readonly [readonly number[], readonly number[]])[];

/** Half a walker's width plus the elbow room they keep from an obstacle. */
export const WALKER_CLEARANCE = 0.45;

/** Where a walker stops short of an obstacle before turning back. */
const STOP_SHORT = 0.25;

/** A pavement's side of the segment's own direction, from a walker's. */
const pavementOf = (walker: Pick<Walker, "side" | "forward">): 0 | 1 =>
  walker.side * (walker.forward ? 1 : -1) > 0 ? 1 : 0;

/**
 * Every stretch of pavement an obstacle stands on. An obstacle blocks a
 * pavement where its rectangle, grown by `WALKER_CLEARANCE`, crosses the
 * line the walkers follow (`walkerPose`), and the stretch is the length of
 * that crossing along the road. Run once per city.
 */
export function pavementBlocks(graph: RoadGraph, obstacles: readonly Obstacle[]): PavementBlocks {
  const blocks = graph.segments.map(() => [[], []] as [number[], number[]]);
  graph.segments.forEach((seg, index) => {
    const dx = seg.to[0] - seg.from[0];
    const dz = seg.to[2] - seg.from[2];
    const len = Math.hypot(dx, dz);
    if (len < 1e-6) return;
    const ux = dx / len;
    const uz = dz / len;
    const reach = seg.width / 2 + PAVEMENT_MARGIN;
    for (const obstacle of obstacles) {
      // Quick reject on the obstacle's bounding circle.
      const radius =
        Math.hypot(
          Math.max(-obstacle.minX, obstacle.maxX),
          Math.max(-obstacle.minZ, obstacle.maxZ),
        ) + WALKER_CLEARANCE;
      const px = obstacle.x - seg.from[0];
      const pz = obstacle.z - seg.from[2];
      const along = px * ux + pz * uz;
      const across = -px * uz + pz * ux;
      if (along < -radius || along > len + radius) continue;
      if (Math.abs(Math.abs(across) - reach) > radius) continue;
      // The rectangle's corners in the segment's frame. `rotation.y` maps
      // local (x, z) to world (x cos + z sin, -x sin + z cos).
      const cos = Math.cos(obstacle.rotationY);
      const sin = Math.sin(obstacle.rotationY);
      const corners: [number, number][] = [
        [obstacle.minX - WALKER_CLEARANCE, obstacle.minZ - WALKER_CLEARANCE],
        [obstacle.maxX + WALKER_CLEARANCE, obstacle.minZ - WALKER_CLEARANCE],
        [obstacle.maxX + WALKER_CLEARANCE, obstacle.maxZ + WALKER_CLEARANCE],
        [obstacle.minX - WALKER_CLEARANCE, obstacle.maxZ + WALKER_CLEARANCE],
      ].map(([x, z]) => {
        const wx = px + x * cos + z * sin;
        const wz = pz - x * sin + z * cos;
        return [wx * ux + wz * uz, -wx * uz + wz * ux];
      });
      for (const side of [0, 1] as const) {
        const line = side === 1 ? reach : -reach;
        const span = crossing(corners, line);
        if (!span) continue;
        const start = Math.max(0, span[0]);
        const end = Math.min(len, span[1]);
        if (end > start) blocks[index][side].push(start, end);
      }
    }
  });
  return blocks.map(([left, right]) => [merge(left), merge(right)] as const);
}

/** Where a convex polygon, as `[along, across]` points, crosses `across = line`. */
function crossing(poly: readonly [number, number][], line: number): [number, number] | null {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < poly.length; i++) {
    const [a0, c0] = poly[i];
    const [a1, c1] = poly[(i + 1) % poly.length];
    if (c0 === line) {
      lo = Math.min(lo, a0);
      hi = Math.max(hi, a0);
    }
    if ((c0 - line) * (c1 - line) < 0) {
      const a = a0 + ((line - c0) / (c1 - c0)) * (a1 - a0);
      lo = Math.min(lo, a);
      hi = Math.max(hi, a);
    }
  }
  return lo <= hi ? [lo, hi] : null;
}

/** A gap between two blocked stretches narrower than this is no way through. */
const MIN_GAP = 1;

/** Sort `[start, end]` pairs and merge the ones that overlap or nearly touch. */
function merge(flat: number[]): number[] {
  const pairs: [number, number][] = [];
  for (let i = 0; i < flat.length; i += 2) pairs.push([flat[i], flat[i + 1]]);
  pairs.sort((a, b) => a[0] - b[0]);
  const out: number[] = [];
  for (const [start, end] of pairs) {
    const last = out.length - 1;
    if (last > 0 && start <= out[last] + MIN_GAP) out[last] = Math.max(out[last], end);
    else out.push(start, end);
  }
  return out;
}

/**
 * The first blocked stretch a walker going from `from` to `to` (world units
 * along the segment) would walk into, as the edge they reach first, or null.
 * A walker already standing inside a stretch is let walk out of it.
 */
function firstBlock(list: readonly number[], from: number, to: number): number | null {
  if (to > from) {
    for (let i = 0; i < list.length; i += 2) {
      if (list[i] >= from && list[i] <= to) return list[i];
    }
    return null;
  }
  let edge: number | null = null;
  for (let i = 1; i < list.length; i += 2) {
    if (list[i] <= from && list[i] >= to) edge = list[i];
  }
  return edge;
}

/** Whether the pavement a walker would step onto at a junction starts blocked. */
function entryBlocked(
  graph: RoadGraph,
  blocks: PavementBlocks,
  segment: number,
  forward: boolean,
  side: 1 | -1,
): boolean {
  const list = blocks[segment]?.[pavementOf({ side, forward })];
  if (!list || list.length === 0) return false;
  const entry = forward ? 0 : graph.lengths[segment] || 0;
  for (let i = 0; i < list.length; i += 2) {
    if (entry >= list[i] - STOP_SHORT && entry <= list[i + 1] + STOP_SHORT) return true;
  }
  return false;
}

/** Turn a walker round where they stand, keeping to the same pavement. */
function turnBack(walker: Walker): void {
  walker.forward = !walker.forward;
  walker.t = 1 - walker.t;
  walker.side = walker.side === 1 ? -1 : 1;
}

/**
 * Moves a walker spawned on a blocked stretch to its nearer end, so nobody
 * starts the day standing inside a hoarding.
 */
export function clearOfBlocks(graph: RoadGraph, walker: Walker, blocks: PavementBlocks): void {
  const list = blocks[walker.segment]?.[pavementOf(walker)];
  if (!list) return;
  const len = graph.lengths[walker.segment] || 1;
  const at = (walker.forward ? walker.t : 1 - walker.t) * len;
  for (let i = 0; i < list.length; i += 2) {
    if (at <= list[i] || at >= list[i + 1]) continue;
    const before = list[i] - STOP_SHORT;
    const after = list[i + 1] + STOP_SHORT;
    // The nearer end, unless that end is off the segment.
    const nearer = at - before <= after - at ? before : after;
    const clear = nearer < 0 ? after : nearer > len ? before : nearer;
    const t = Math.min(0.999, Math.max(0, clear / len));
    walker.t = walker.forward ? t : 1 - t;
    return;
  }
}

/**
 * Advance one walker by `dt` seconds, turning at junctions like the cars,
 * and turning back at anything standing on the pavement (`blocks`).
 */
export function advanceWalker(
  graph: RoadGraph,
  walker: Walker,
  dt: number,
  prng: Prng,
  blocks?: PavementBlocks,
): void {
  let guard = 0;
  let remaining = walker.speed * dt;
  while (remaining > 0 && guard++ < 6) {
    const length = graph.lengths[walker.segment] || 1;
    const travelled = remaining / length;
    const list = blocks?.[walker.segment]?.[pavementOf(walker)];
    if (list && list.length > 0) {
      const from = (walker.forward ? walker.t : 1 - walker.t) * length;
      const ahead = Math.min(1, walker.t + travelled);
      const to = (walker.forward ? ahead : 1 - ahead) * length;
      const edge = firstBlock(list, from, to);
      if (edge !== null) {
        // Stop short of it and turn round; the rest of the step is spent
        // turning, which at walking pace is a fraction of a frame anyway.
        const stop = edge + (to > from ? -STOP_SHORT : STOP_SHORT);
        if ((stop - from) * (to - from) > 0) {
          const t = stop / length;
          walker.t = Math.min(0.999, Math.max(0, walker.forward ? t : 1 - t));
        }
        turnBack(walker);
        return;
      }
    }
    if (walker.t + travelled < 1) {
      walker.t += travelled;
      return;
    }
    remaining -= (1 - walker.t) * length;
    const next = nextRide(graph, walker, prng);
    // Crossing a junction is where a person changes pavement.
    const side = prng.next() < 0.35 ? (walker.side === 1 ? -1 : 1) : walker.side;
    if (blocks && entryBlocked(graph, blocks, next.segment, next.forward, side)) {
      // Something stands across the corner of the way on: turn back instead.
      walker.t = 0.999;
      turnBack(walker);
      return;
    }
    walker.segment = next.segment;
    walker.forward = next.forward;
    walker.side = side;
    walker.t = 0;
  }
  walker.t = Math.min(walker.t, 0.999);
}

export interface IdleFigure {
  position: Vec3;
  angle: number;
  phase: number;
  colorIndex: number;
  height: number;
  skinIndex: number;
}

/**
 * The small knots of people the civic buildings collect: a few outside the
 * town hall, a few more on the steps of the information centre. They stand
 * and shift their weight rather than walk, which is what makes those two
 * landmarks read as places people go (PLAN.md section 17).
 */
export function idleGroups(landmarks: readonly Landmark[], prng: Prng): IdleFigure[] {
  const figures: IdleFigure[] = [];
  for (const landmark of landmarks) {
    if (landmark.landmarkType !== "civic" && landmark.landmarkType !== "info") continue;
    const plot = landmark.size ? Math.min(landmark.size[0], landmark.size[2]) : 12;
    // Outside the steps, not on them: a landmark's plot is the building and
    // its plinth, so the crowd stands clear of the whole reserved square.
    const radius = Math.max(5, plot * 0.55);
    const people = landmark.landmarkType === "civic" ? 5 : 3;
    const start = prng.range(0, Math.PI * 2);
    for (let i = 0; i < people; i++) {
      // A loose arc on one side of the plot, not a ring around the building.
      const around = start + (i / people) * Math.PI * 1.1 + prng.range(-0.18, 0.18);
      const distance = radius + prng.range(0, 2.2);
      figures.push({
        position: [
          landmark.position[0] + Math.sin(around) * distance,
          landmark.position[1],
          landmark.position[2] + Math.cos(around) * distance,
        ],
        // Facing roughly back towards the building they are standing outside.
        angle: around + Math.PI + prng.range(-0.5, 0.5),
        phase: prng.range(0, Math.PI * 2),
        colorIndex: prng.int(0, PERSON_COLORS.length - 1),
        height: prng.range(0.88, 1.1),
        skinIndex: prng.int(0, SKIN_TONES.length - 1),
      });
    }
  }
  return figures;
}

/** Clothing colours: muted, so a crowd never out-shouts the buildings. */
export const PERSON_COLORS = [
  "#4d5a6b",
  "#8c5f4d",
  "#6b7f6a",
  "#a8a093",
  "#4f6f7d",
  "#9a6b7a",
  "#7a7486",
  "#c2b49a",
];

/** Skin tones, held a little muted like everything else in the palette. */
export const SKIN_TONES = ["#e3c3a4", "#c99f7d", "#a8795a", "#7d5842", "#5c4033"];

/** High-visibility yellow, for the figures working an incident or a site. */
export const WORKER_YELLOW = "#e6c02f";
