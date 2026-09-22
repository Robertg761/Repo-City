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
 * Pure, no three.js: unit tested.
 */

import type { Prng } from "@/lib/city/prng";
import type { Landmark, RoadSegment, Vec3 } from "@/types/city";
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
      colorIndex: prng.int(0, 7),
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

/** Advance one walker by `dt` seconds, turning at junctions like the cars. */
export function advanceWalker(
  graph: RoadGraph,
  walker: Walker,
  dt: number,
  prng: Prng,
): void {
  let guard = 0;
  let remaining = walker.speed * dt;
  while (remaining > 0 && guard++ < 6) {
    const length = graph.lengths[walker.segment] || 1;
    const travelled = remaining / length;
    if (walker.t + travelled < 1) {
      walker.t += travelled;
      return;
    }
    remaining -= (1 - walker.t) * length;
    const next = nextRide(graph, walker, prng);
    walker.segment = next.segment;
    walker.forward = next.forward;
    walker.t = 0;
    // Crossing a junction is where a person changes pavement.
    if (prng.next() < 0.35) walker.side = walker.side === 1 ? -1 : 1;
  }
  walker.t = Math.min(walker.t, 0.999);
}

export interface IdleFigure {
  position: Vec3;
  angle: number;
  phase: number;
  colorIndex: number;
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
    const radius = Math.max(4, plot * 0.42);
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
        colorIndex: prng.int(0, 7),
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

/** High-visibility yellow, for the figures working an incident or a site. */
export const WORKER_YELLOW = "#e6c02f";
