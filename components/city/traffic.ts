/**
 * Traffic simulation maths (PLAN.md sections 17, 18, 37).
 *
 * Cars walk the road graph: pick a segment, drive to its far end, pick a
 * connected segment, repeat. No physics, no pathfinding, no collisions -- the
 * point is street movement, not a driving model. Deterministic given the
 * model's `seed`, so screenshots reproduce (section 35).
 *
 * BLOCKED ROADS. Incidents, and any construction site whose dressing reaches
 * a lane, close stretches of road (`blockages.ts`). Traffic respects them
 * without pathfinding:
 *
 *   - at a junction a car only picks a segment it can pull into with room to
 *     stop short of any blockage on it; if there is none it turns round, the
 *     same as at a dead end;
 *   - a car with a blockage ahead on its own segment brakes, stops short of
 *     the cones, waits a moment and makes a U-turn back the way it came.
 *
 * U-turns, here and at dead ends, are drawn as a half circle across the centre
 * line rather than a jump into the other lane. Every car is always driving,
 * waiting a second or turning, and cars never wait on one another, so nothing
 * can freeze and nothing can deadlock.
 *
 * Pure, no three.js: unit tested.
 */

import type { Prng } from "@/lib/city/prng";
import { DEFAULT_SETTLEMENT_TIER, SETTLEMENT_PARAMS } from "@/lib/city/settlement";
import type { SettlementTier } from "@/types/analysis";
import type { RoadSegment } from "@/types/city";
import type { BlockedStretch, Blockages } from "./blockages";

/**
 * PLAN.md section 37: 30 to 40 moving cars is the whole budget of a city.
 * That is the city tier's cap (`lib/city/settlement.ts` holds it to this);
 * the other tiers have their own, `carCap`.
 */
export const MAX_CARS = 40;

/** The largest fleet any settlement runs (the metropolis, PLAN.md 76.5). */
export const MAX_FLEET = Math.max(
  ...Object.values(SETTLEMENT_PARAMS).map((params) => params.vehicles.max),
);

/**
 * How many cars a settlement of this tier may run: 10 in a village, 24 in a
 * town, 40 in a city, 64 in a metropolis. A model without a settlement is a
 * city, exactly as before (PLAN.md 76.1 decision 3).
 */
export function carCap(tier: SettlementTier | undefined): number {
  return SETTLEMENT_PARAMS[tier ?? DEFAULT_SETTLEMENT_TIER].vehicles.max;
}

/**
 * Half the length of the longest body in the fleet (the bus, 4.5 units; see
 * `models/vehicles/shapes.ts`). The traffic maths does not know which body a
 * car has, so every car keeps the bus's distance.
 */
export const CAR_HALF_LENGTH = 2.3;
/** Half the width of the widest body in the fleet. */
export const CAR_HALF_WIDTH = 0.6;
/** Daylight a stopped car leaves between itself and the cones. */
const STOP_GAP = 0.5;
/**
 * The shortest run a car needs between a segment's end and the point where it
 * must stop: enough to brake from full speed at `DECEL`.
 */
export const MIN_ROOM = 3.5;

/** World units per second per second. */
const ACCEL = 3.5;
const DECEL = 7;
/** Speed round a U-turn's half circle, world units per second. */
const TURN_SPEED = 2.4;
/** Cruising speeds; the spread also staggers where cars stop and how long they wait. */
const SPEED_MIN = 4;
const SPEED_MAX = 6.4;

/** Endpoints closer than this (world units) count as the same junction. */
const JUNCTION_TOLERANCE = 2;

/** Lateral offset of a car from the centre line of a road this wide. */
export function laneOffset(width: number): number {
  return Math.max(0.6, width * 0.22);
}

/**
 * How far short of a blockage a car's centre stops. Its nose is half a body
 * ahead; partway round its U-turn the centre has moved up to a lane offset
 * ahead and the body is swinging across, so a corner reaches at most the
 * hypotenuse of the two. That, plus a gap.
 */
export function reachFor(width: number): number {
  return Math.hypot(CAR_HALF_LENGTH, laneOffset(width) + CAR_HALF_WIDTH) + STOP_GAP;
}

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

/**
 * The runs of a segment a car may stand on, in world units from `from`: from
 * each end up to the nearest blockage, when long enough to use. Null when the
 * segment is clear. A run between two blockages is never usable, because
 * nobody can get into it.
 */
export function usableRuns(
  length: number,
  width: number,
  list: readonly BlockedStretch[] | undefined,
): [number, number][] | null {
  if (!list || list.length === 0) return null;
  if (list[0].closed) return [];
  const reach = reachFor(width);
  const runs: [number, number][] = [];
  const head = list[0].start - reach;
  if (head >= MIN_ROOM) runs.push([0, head]);
  const tail = list[list.length - 1].end + reach;
  if (length - tail >= MIN_ROOM) runs.push([tail, length]);
  return runs;
}

export interface Ride {
  /** Index into `graph.segments`. */
  segment: number;
  /** True when driving from `segment.from` towards `segment.to`. */
  forward: boolean;
}

/**
 * Whether a car can pull into `segment` travelling `forward`: the segment is
 * clear, or the first blockage on it leaves room to brake and stop short.
 */
export function enterable(
  graph: RoadGraph,
  segment: number,
  forward: boolean,
  blocks?: Blockages,
): boolean {
  const list = blocks?.bySegment[segment];
  if (!list || list.length === 0) return true;
  if (list[0].closed) return false;
  const reach = reachFor(graph.segments[segment].width);
  const room = forward ? list[0].start : graph.lengths[segment] - list[list.length - 1].end;
  return room - reach >= MIN_ROOM;
}

/**
 * Where a car goes when it reaches the end of its current segment. Dead ends
 * produce a U-turn rather than a stuck car, so any road set keeps moving. With
 * `blocks`, a segment the car could not pull into counts as absent, so a
 * junction whose every exit is blocked is a dead end too.
 */
export function nextRide(graph: RoadGraph, ride: Ride, prng: Prng, blocks?: Blockages): Ride {
  const [fromKey, toKey] = graph.nodeKeys[ride.segment];
  const arrival = ride.forward ? toKey : fromKey;
  const touching = graph.byNode.get(arrival) ?? [];
  const options = touching.filter(
    (i) =>
      i !== ride.segment &&
      graph.lengths[i] > 0.001 &&
      enterable(graph, i, graph.nodeKeys[i][0] === arrival, blocks),
  );
  if (options.length === 0) return { segment: ride.segment, forward: !ride.forward };
  const segment = prng.pick(options);
  return { segment, forward: graph.nodeKeys[segment][0] === arrival };
}

export interface Car extends Ride {
  /** Progress 0..1 along the travel direction. */
  t: number;
  /** Cruising speed, world units per second. */
  speed: number;
  /** The speed it is actually doing: less while braking, stopped or turning. */
  v: number;
  /** Lateral offset from the centre line; always to the car's own right. */
  lane: number;
  colorIndex: number;
  /** Seconds left standing at a blockage before turning round; 0 when moving. */
  wait: number;
  /** Progress 0..1 round a U-turn, or null when not turning. */
  turn: number | null;
  /** Where it goes at the end of this segment, once decided. */
  next: Ride | null;
}

/** 0..1 from a car's cruising speed: a seeded spread that costs no extra draws. */
function temperament(car: Car): number {
  return Math.min(1, Math.max(0, (car.speed - SPEED_MIN) / (SPEED_MAX - SPEED_MIN)));
}

/**
 * Seeded car placement. Major roads are twice as likely to be picked, so
 * traffic reads as flowing along the arterials. With `blocks`, no car starts
 * on a closed segment or inside a blocked stretch.
 */
export function spawnCars(
  roads: readonly RoadSegment[],
  count: number,
  prng: Prng,
  blocks?: Blockages,
): Car[] {
  const lengthOf = (road: RoadSegment) =>
    Math.hypot(road.to[0] - road.from[0], road.to[2] - road.from[2]);
  const drivable = roads
    .map((road, index) => ({ road, index }))
    .filter(({ road }) => lengthOf(road) > 4)
    // A segment with nowhere to stand is no place to start a car.
    .filter(({ road, index }) => {
      const runs = usableRuns(lengthOf(road), road.width, blocks?.bySegment[index]);
      return runs === null || runs.length > 0;
    });
  if (drivable.length === 0) return [];

  const weighted: number[] = [];
  for (const { road, index } of drivable) {
    weighted.push(index);
    if (road.major) weighted.push(index);
  }

  const cars: Car[] = [];
  const total = Math.max(0, Math.min(count, MAX_FLEET));
  for (let i = 0; i < total; i++) {
    const segment = prng.pick(weighted);
    const forward = prng.next() < 0.5;
    const road = roads[segment];
    let t = prng.next();
    // One world unit is about a metre and a half at the scale the generator
    // builds to (see `types/city.ts`), so this is roughly 25 to 35 km/h:
    // brisk enough to read as traffic, slow enough that a car crossing a
    // twenty unit block between junctions takes about four seconds rather
    // than darting from turn to turn.
    const speed = prng.range(SPEED_MIN, SPEED_MAX);
    const colorIndex = prng.int(0, 5);

    // A car that would start in or against a blockage moves to the nearest
    // spot it may stand on. No extra draws, so a city without incidents
    // spawns exactly as it always did.
    const length = lengthOf(road);
    const runs = usableRuns(length, road.width, blocks?.bySegment[segment]);
    if (runs) {
      const along = (forward ? t : 1 - t) * length;
      let best = along;
      let bestShift = Infinity;
      for (const [lo, hi] of runs) {
        const spot = Math.min(hi, Math.max(lo, along));
        if (Math.abs(spot - along) < bestShift) {
          bestShift = Math.abs(spot - along);
          best = spot;
        }
      }
      t = Math.min(0.999, (forward ? best : length - best) / length);
    }

    cars.push({
      segment,
      forward,
      t,
      speed,
      v: speed,
      lane: laneOffset(road.width),
      colorIndex,
      wait: 0,
      turn: null,
      next: null,
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

/** Position and heading for a car, including its lane offset and any U-turn. */
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
  const cx = start[0] + ux * len * car.t;
  const cz = start[2] + uz * len * car.t;

  if (car.turn !== null) {
    // Half a circle about the centre line, from the car's own lane through
    // straight ahead to the other one: a left U-turn, as driving on the right
    // makes it. Its tangent is the heading.
    const phi = Math.PI * car.turn;
    const cos = Math.cos(phi);
    const sin = Math.sin(phi);
    return {
      x: cx + offset * (nx * cos + ux * sin),
      z: cz + offset * (nz * cos + uz * sin),
      angle: Math.atan2(ux * cos - nx * sin, uz * cos - nz * sin),
    };
  }

  return {
    x: cx + nx * offset,
    z: cz + nz * offset,
    angle: Math.atan2(ux, uz),
  };
}

const HOP = 0;
const STOP = 1;
const TURN = 2;

/**
 * Where the car has to be at the end of its run on this segment, how fast it
 * may be going when it gets there, and what happens then. One scratch object,
 * so the frame loop does not allocate.
 */
const plan = { at: 0, endSpeed: 0, kind: HOP };

function planRun(
  graph: RoadGraph,
  car: Car,
  along: number,
  length: number,
  prng: Prng,
  blocks: Blockages | undefined,
): void {
  const width = graph.segments[car.segment].width;
  const list = blocks?.bySegment[car.segment];
  if (list && list.length > 0) {
    // The first stretch not wholly behind the car, in travel units.
    let edge = Infinity;
    for (const stretch of list) {
      const near = car.forward ? stretch.start : length - stretch.end;
      const far = car.forward ? stretch.end : length - stretch.start;
      if (far > along && near < edge) edge = near;
    }
    if (edge < Infinity) {
      // Stop short, a little further back for a brisker driver, so two cars
      // pulling up at the same cones do not stand in one another.
      const stopAt = edge - reachFor(width) - temperament(car) * 1.4;
      plan.at = Math.max(along, stopAt);
      plan.endSpeed = 0;
      plan.kind = STOP;
      return;
    }
  }

  if (!car.next) car.next = nextRide(graph, car, prng, blocks);
  if (car.next.segment === car.segment) {
    // Turning round at the end of the road: the half circle has to fit
    // before the road runs out.
    plan.at = Math.max(along, length - (car.lane + CAR_HALF_WIDTH));
    plan.endSpeed = TURN_SPEED;
    plan.kind = TURN;
    return;
  }
  plan.at = length;
  plan.endSpeed = car.speed;
  plan.kind = HOP;
}

/**
 * Advance one car by `dt` seconds: drive, brake for a blockage or a turn,
 * stand, turn round, or hop to the next segment at a junction. Without
 * `blocks` the only U-turns are at dead ends.
 */
export function advanceCar(
  graph: RoadGraph,
  car: Car,
  dt: number,
  prng: Prng,
  blocks?: Blockages,
): void {
  if (dt <= 0) return;

  if (car.turn !== null) {
    car.v = TURN_SPEED;
    car.turn += (TURN_SPEED * dt) / (Math.PI * Math.max(car.lane, 0.3));
    if (car.turn >= 1) {
      // Out of the half circle, in the other lane, pointing the other way:
      // the same spot, measured from the other end.
      car.turn = null;
      car.forward = !car.forward;
      car.t = Math.min(0.999, Math.max(0, 1 - car.t));
      car.next = null;
    }
    return;
  }

  if (car.wait > 0) {
    car.v = 0;
    car.wait -= dt;
    if (car.wait <= 0) {
      car.wait = 0;
      car.turn = 0;
    }
    return;
  }

  let remaining = -1;
  for (let guard = 0; guard < 8; guard++) {
    const length = graph.lengths[car.segment] || 1;
    const along = car.t * length;
    planRun(graph, car, along, length, prng, blocks);
    const room = Math.max(0, plan.at - along);

    if (remaining < 0) {
      // Speed for this frame: pick up towards cruising, but never faster than
      // the car could still brake from to be at `plan.endSpeed` on arrival.
      const brake = Math.sqrt(plan.endSpeed * plan.endSpeed + 2 * DECEL * room);
      car.v = Math.max(0, Math.min(car.speed, car.v + ACCEL * dt, brake));
      remaining = car.v * dt;
    }

    if (remaining < room) {
      car.t = (along + remaining) / length;
      return;
    }
    remaining -= room;
    car.t = plan.at / length;

    if (plan.kind === STOP) {
      // Brief and seeded: a careful driver waits a little longer.
      car.v = 0;
      car.wait = 0.5 + (1 - temperament(car)) * 0.9;
      car.next = null;
      return;
    }
    if (plan.kind === TURN) {
      car.turn = 0;
      car.next = null;
      return;
    }

    const next = car.next as Ride;
    car.segment = next.segment;
    car.forward = next.forward;
    car.t = 0;
    car.next = null;
    car.lane = laneOffset(graph.segments[car.segment].width);
  }
  car.t = Math.min(car.t, 0.999);
}
