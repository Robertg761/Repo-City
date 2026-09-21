/**
 * Traffic simulation maths (PLAN.md sections 17, 18, 37).
 *
 * Cars walk the road graph: pick a segment, drive to its far end, pick a
 * connected segment, repeat. No physics, no pathfinding, no collisions -- the
 * point is street movement, not a driving model. Deterministic given the
 * model's `seed`, so screenshots reproduce (section 35).
 *
 * Pure, no three.js: unit tested.
 */

import type { Prng } from "@/lib/city/prng";
import type { RoadSegment } from "@/types/city";

/** PLAN.md section 37: 30 to 40 moving cars is the whole budget. */
export const MAX_CARS = 40;

/** Endpoints closer than this (world units) count as the same junction. */
const JUNCTION_TOLERANCE = 2;

export interface RoadGraph {
  segments: readonly RoadSegment[];
  /** `[fromKey, toKey]` per segment. */
  nodeKeys: [string, string][];
  /** Junction key -> indices of every segment touching it. */
  byNode: Map<string, number[]>;
  lengths: number[];
}

function nodeKey(x: number, z: number): string {
  return `${Math.round(x / JUNCTION_TOLERANCE)}:${Math.round(z / JUNCTION_TOLERANCE)}`;
}

export function roadGraph(roads: readonly RoadSegment[]): RoadGraph {
  const nodeKeys: [string, string][] = [];
  const byNode = new Map<string, number[]>();
  const lengths: number[] = [];

  roads.forEach((road, i) => {
    const from = nodeKey(road.from[0], road.from[2]);
    const to = nodeKey(road.to[0], road.to[2]);
    nodeKeys.push([from, to]);
    lengths.push(Math.hypot(road.to[0] - road.from[0], road.to[2] - road.from[2]));
    for (const key of [from, to]) {
      const list = byNode.get(key);
      if (list) list.push(i);
      else byNode.set(key, [i]);
    }
  });

  return { segments: roads, nodeKeys, byNode, lengths };
}

export interface Ride {
  /** Index into `graph.segments`. */
  segment: number;
  /** True when driving from `segment.from` towards `segment.to`. */
  forward: boolean;
}

/**
 * Where a car goes when it reaches the end of its current segment. Dead ends
 * produce a U-turn rather than a stuck car, so any road set keeps moving.
 */
export function nextRide(graph: RoadGraph, ride: Ride, prng: Prng): Ride {
  const [fromKey, toKey] = graph.nodeKeys[ride.segment];
  const arrival = ride.forward ? toKey : fromKey;
  const touching = graph.byNode.get(arrival) ?? [];
  const options = touching.filter((i) => i !== ride.segment && graph.lengths[i] > 0.001);
  if (options.length === 0) return { segment: ride.segment, forward: !ride.forward };
  const segment = prng.pick(options);
  return { segment, forward: graph.nodeKeys[segment][0] === arrival };
}

export interface Car extends Ride {
  /** Progress 0..1 along the travel direction. */
  t: number;
  /** World units per second. */
  speed: number;
  /** Lateral offset from the centre line; always to the car's own right. */
  lane: number;
  colorIndex: number;
}

/**
 * Seeded car placement. Major roads are twice as likely to be picked, so
 * traffic reads as flowing along the arterials.
 */
export function spawnCars(roads: readonly RoadSegment[], count: number, prng: Prng): Car[] {
  const drivable = roads
    .map((road, index) => ({ road, index }))
    .filter(({ road }) => Math.hypot(road.to[0] - road.from[0], road.to[2] - road.from[2]) > 4);
  if (drivable.length === 0) return [];

  const weighted: number[] = [];
  for (const { road, index } of drivable) {
    weighted.push(index);
    if (road.major) weighted.push(index);
  }

  const cars: Car[] = [];
  const total = Math.max(0, Math.min(count, MAX_CARS));
  for (let i = 0; i < total; i++) {
    const segment = prng.pick(weighted);
    const forward = prng.next() < 0.5;
    const width = roads[segment].width;
    cars.push({
      segment,
      forward,
      t: prng.next(),
      speed: prng.range(5, 9),
      lane: Math.max(0.6, width * 0.22),
      colorIndex: prng.int(0, 5),
    });
  }
  return cars;
}

export interface CarPose {
  x: number;
  z: number;
  /** Heading in radians for `rotation.y`. */
  angle: number;
}

/** Position and heading for a car, including its lane offset. */
export function carPose(graph: RoadGraph, car: Car): CarPose {
  const seg = graph.segments[car.segment];
  const start = car.forward ? seg.from : seg.to;
  const end = car.forward ? seg.to : seg.from;
  const dx = end[0] - start[0];
  const dz = end[2] - start[2];
  const len = Math.hypot(dx, dz) || 1;
  const ux = dx / len;
  const uz = dz / len;
  // Right-hand normal of the travel direction.
  const nx = -uz;
  const nz = ux;
  const offset = car.lane;
  return {
    x: start[0] + ux * len * car.t + nx * offset,
    z: start[2] + uz * len * car.t + nz * offset,
    angle: Math.atan2(ux, uz),
  };
}

/** Advance one car by `dt` seconds, hopping to connected segments as needed. */
export function advanceCar(graph: RoadGraph, car: Car, dt: number, prng: Prng): void {
  let guard = 0;
  let remaining = car.speed * dt;
  while (remaining > 0 && guard++ < 8) {
    const length = graph.lengths[car.segment] || 1;
    const travelled = remaining / length;
    if (car.t + travelled < 1) {
      car.t += travelled;
      return;
    }
    remaining -= (1 - car.t) * length;
    const next = nextRide(graph, car, prng);
    car.segment = next.segment;
    car.forward = next.forward;
    car.t = 0;
    const width = graph.segments[car.segment].width;
    car.lane = Math.max(0.6, width * 0.22);
  }
  car.t = Math.min(car.t, 0.999);
}
