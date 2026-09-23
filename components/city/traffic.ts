/**
 * Traffic simulation maths (PLAN.md sections 17, 18, 37).
 *
 * Cars drive the road graph as drivers do, with no pathfinding: along a lane,
 * through a junction onto another lane picked at random, and on. Everything is
 * deterministic given the model's `seed`, so screenshots reproduce (section
 * 35), and the step allocates nothing, so it can run every frame (section 63).
 *
 * TURNING. `junctions.ts` fits a curve through every junction box from each
 * lane in to each lane out; a car follows it with its heading on the tangent,
 * so nothing pivots on the spot. Each curve has a speed its sharpest bend can
 * be taken at, and a car brakes for it on the way in and picks up again on the
 * way out. We drive on the right: right turns hug the corner and are slow,
 * left turns sweep wide, and straight on barely lifts.
 *
 * FOLLOWING. Each car keeps its distance to whatever is ahead of it on its own
 * path -- down its lane, into the junction curve it will take, and onto the
 * lane beyond -- with the Intelligent Driver Model: it closes up to a gap of
 * `FOLLOW_GAP` plus `HEADWAY` seconds of travel, brakes smoothly for a slower
 * car, and draws up behind a stopped one. However the model behaves, a car is
 * never moved further than the room it had in front of it, so no two bodies
 * in one lane ever touch.
 *
 * JUNCTIONS. A car that reaches a junction box may only enter it once it holds
 * the box for its movement. It is granted when
 *
 *   - no car already holding the box is on a movement that conflicts with its
 *     own (two cars on one movement are fine: one follows the other),
 *   - no car that has been waiting LONGER, and could go now, wants a
 *     conflicting movement: the longest-waiting car always goes first, and
 *   - the lane it is heading for has room for the whole car past the box, so
 *     nobody ever stops inside a junction.
 *
 * It keeps the box until its tail is out of it. That cannot deadlock: a car
 * in a box always has room to leave it, so every hold is released; and the car
 * that has waited longest is held up only by cars already in the box or by a
 * full lane ahead. A full lane drains unless the cars in it are queued, round
 * a loop, for this same junction; a car that has waited `REROUTE_AFTER`
 * seconds for room takes another way out, which breaks any such loop.
 *
 * TURNING ROUND. Incidents and any construction site whose dressing reaches a
 * lane close stretches of road (`blockages.ts`):
 *
 *   - a car only picks a way out of a junction it can pull into with room to
 *     stop short of any blockage; with none it turns round before the box, and
 *     at a dead end it turns round at the end of the road;
 *   - a car with a blockage ahead brakes, stops short of the cones, waits a
 *     moment and turns back the way it came.
 *
 * A U-turn is a three-point turn on an ordinary road and one sweep on a wide
 * one (`uturn.ts`), and it takes both lanes: a car only starts one when the
 * other lane is clear, and while it turns, cars in either lane wait for it.
 *
 * Pure, no three.js: unit tested.
 */

import type { Prng } from "@/lib/city/prng";
import { DEFAULT_SETTLEMENT_TIER, SETTLEMENT_PARAMS } from "@/lib/city/settlement";
import type { SettlementTier } from "@/types/analysis";
import type { RoadSegment } from "@/types/city";
import type { BlockedStretch, Blockages } from "./blockages";
import {
  junctionNetwork,
  lanePoint,
  movePoint,
  movesConflict,
  RELEASE_GAP,
  SPILL_MARGIN,
  STOP_BACK,
  type Network,
  type PathPose,
} from "./junctions";
import {
  CAR_HALF_LENGTH,
  CAR_HALF_WIDTH,
  laneFinishEnd,
  laneForward,
  laneOf,
  laneOffset,
  laneSegment,
  oppositeLane,
} from "./lanes";
import { uTurnAhead, uTurnPose, uTurnShape, type UTurnPose, type UTurnShape } from "./uturn";

export { CAR_HALF_LENGTH, CAR_HALF_WIDTH, laneOffset };

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
 * The share of a village fleet that is tractors (PLAN.md 76.5: "10, tractors
 * allowed"). Only settlements whose `vehicles.tractors` is set get any.
 */
export const TRACTOR_SHARE = 0.25;
/** A tractor's cruising speed, as a share of the car it replaces. */
export const TRACTOR_PACE = 0.55;

/**
 * Which cars in a fleet are tractors, seeded from its own stream so choosing
 * them moves nothing else. A settlement that allows tractors and has two or
 * more vehicles always gets at least one.
 */
export function tractorsFor(count: number, allowed: boolean, prng: Prng): boolean[] {
  if (!allowed || count <= 0) return Array.from({ length: Math.max(0, count) }, () => false);
  const picks = Array.from({ length: count }, () => prng.next() < TRACTOR_SHARE);
  if (count >= 2 && !picks.some(Boolean)) picks[prng.int(0, count - 1)] = true;
  return picks;
}

/** Daylight a stopped car leaves between itself and the cones. */
const STOP_GAP = 0.5;
/**
 * The shortest run a car needs between where it can first stop and the point
 * where it must: enough to brake from the speed it comes out of a junction.
 */
export const MIN_ROOM = 3.5;
/** A brisk driver stops up to this much further back from the cones. */
const TEMPER_BACK = 1.4;

// -- The driving model (world units: about a metre and a half each) ---------

/** Acceleration, and the comfortable braking the model aims for. */
const ACCEL = 2.8;
const COMFORT = 3;
/** Standstill gap to the car in front, and seconds of headway on the move. */
const FOLLOW_GAP = 1;
const HEADWAY = 0.9;
/** However the model behaves, never closer than this to the car in front. */
const MIN_GAP = 0.3;
/** Hardest a car ever brakes. */
const DECEL_MAX = 9;
/** Braking a car plans for when it has to stop at a line or for a curve. */
const STOP_BRAKE = 3.5;
/** A car asks for a junction box once it is this close to its stop line. */
const REQUEST_RANGE = 10;
/** Room a car needs past a box: its own length and this much daylight. */
const ROOM_GAP = FOLLOW_GAP + 0.6;
/** Seconds waiting at a box for room ahead before trying another way out. */
export const REROUTE_AFTER = 5;
/** How far ahead a car looks for the car in front of it. */
const LOOKAHEAD = 40;

/** U-turns: top speed, acceleration, the creep a stopped car starts from, and the pause at a change of gear. */
const TURN_SPEED = 2.2;
const TURN_ACCEL = 2;
const TURN_CREEP = 0.35;
const GEAR_PAUSE = 0.35;
/** Clearance a U-turn keeps from cars in either lane. */
const TURN_CLEAR = 0.6;

/** Cruising speeds; the spread also staggers where cars stop and how long they wait. */
const SPEED_MIN = 4;
const SPEED_MAX = 6.4;

/** Endpoints closer than this (world units) count as the same junction. */
const JUNCTION_TOLERANCE = 2;

const reaches = new Map<number, number>();

/**
 * How far short of a blockage a car's centre stops: far enough that turning
 * round there -- a three-point turn on most roads -- keeps every corner of the
 * longest body a gap short of the cones.
 */
export function reachFor(width: number): number {
  let reach = reaches.get(width);
  if (reach === undefined) {
    reach = uTurnAhead(uTurnShape(laneOffset(width)), CAR_HALF_LENGTH, CAR_HALF_WIDTH) + STOP_GAP;
    reaches.set(width, reach);
  }
  return reach;
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

/** `enterable` without asking what happens after the car turns round at the cones. */
function roomToStop(network: Network, lane: number, blocks?: Blockages): boolean {
  if (!network.usable[lane]) return false;
  // Somewhere to stand between the box it comes out of and the next one.
  if (network.stopLine[lane] - network.pieceStart[lane] < 2 * network.half + RELEASE_GAP) return false;
  const segment = laneSegment(lane);
  const list = blocks?.bySegment[segment];
  if (!list || list.length === 0) return true;
  if (list[0].closed) return false;
  const length = network.graph.lengths[segment];
  const reach = reachFor(network.graph.segments[segment].width);
  const edge = laneForward(lane) ? list[0].start : length - list[list.length - 1].end;
  return edge - reach - TEMPER_BACK - network.pieceStart[lane] >= MIN_ROOM;
}

/** Whether a car at the end of `lane` has a movement out of it into a lane it can use. */
function hasWayOn(network: Network, lane: number, blocks?: Blockages): boolean {
  const moves = network.movesFrom[lane];
  for (let i = 0; i < moves.length; i++) if (roomToStop(network, network.moves[moves[i]].to, blocks)) return true;
  return false;
}

/** Whether `segment` has any blocked stretch on it. */
const hasCones = (blocks: Blockages | undefined, segment: number): boolean =>
  (blocks?.bySegment[segment].length ?? 0) > 0;

/**
 * Whether a car coming out of a junction can use `lane`: it is a lane between
 * junctions, and it is clear, or the first blockage on it leaves room past
 * the junction box to brake and stop short, however brisk the driver. Past
 * cones it must be able to get out again: a car that turns round at them has
 * to find a way on at the junction it came from, or it would be trapped
 * between the two, turning round for ever.
 */
export function enterable(network: Network, lane: number, blocks?: Blockages): boolean {
  if (!roomToStop(network, lane, blocks)) return false;
  if (!hasCones(blocks, laneSegment(lane))) return true;
  return hasWayOn(network, oppositeLane(lane), blocks);
}

export interface Ride {
  /** Index into `graph.segments`. */
  segment: number;
  /** True when driving from `segment.from` towards `segment.to`. */
  forward: boolean;
}

/**
 * Whether a walker or driver can go on into `segment` travelling `forward`:
 * the segment is clear, or the first blockage on it leaves room to stop short.
 * Segment by segment, with no junction boxes: what the pavement uses.
 */
function segmentEnterable(graph: RoadGraph, segment: number, forward: boolean, blocks?: Blockages): boolean {
  const list = blocks?.bySegment[segment];
  if (!list || list.length === 0) return true;
  if (list[0].closed) return false;
  const reach = reachFor(graph.segments[segment].width);
  const room = forward ? list[0].start : graph.lengths[segment] - list[list.length - 1].end;
  return room - reach >= MIN_ROOM;
}

/**
 * Where a ride along the road graph goes at the end of its segment, one
 * junction at a time: a random segment on from the junction reached, or back
 * the way it came at a dead end. With `blocks`, a segment it could not pull
 * into counts as absent. The pedestrians walk the pavements with it
 * (`models/props/pedestrians.ts`); the traffic plans whole junction
 * movements instead.
 */
export function nextRide(graph: RoadGraph, ride: Ride, prng: Prng, blocks?: Blockages): Ride {
  const [fromKey, toKey] = graph.nodeKeys[ride.segment];
  const arrival = ride.forward ? toKey : fromKey;
  const touching = graph.byNode.get(arrival) ?? [];
  const options = touching.filter(
    (i) =>
      i !== ride.segment &&
      graph.lengths[i] > 0.001 &&
      segmentEnterable(graph, i, graph.nodeKeys[i][0] === arrival, blocks),
  );
  if (options.length === 0) return { segment: ride.segment, forward: !ride.forward };
  const segment = prng.pick(options);
  return { segment, forward: graph.nodeKeys[segment][0] === arrival };
}

/** Where a car means to go at the end of its lane. */
export const DEAD_END = -3;
/** Nowhere: it turns round short of the junction. */
export const TURN_BACK = -1;
/** The whole box, held by a car turning round against it. */
const WHOLE_BOX = -2;
/** A car fresh from `spawnCars`, before `createTraffic` has chosen its way. */
const UNPLANNED = -9;

export interface Car extends Ride {
  /** Progress 0..1 along the lane, in the direction of travel. */
  t: number;
  /** Cruising speed, world units per second. */
  speed: number;
  /** The speed it is actually doing. */
  v: number;
  /** Lateral offset from the centre line; always to the car's own right. */
  lane: number;
  colorIndex: number;
  /** Half its body's length: the bus's unless told otherwise. */
  half: number;
  /** Seconds left standing at cones, or pausing mid-turn; 0 otherwise. */
  wait: number;
  /** True once it has stood at the cones in front of it. */
  stood: boolean;
  /** Units into a U-turn, or null when not turning. */
  turn: number | null;
  /** The junction movement it is driving, or -1 on a lane. */
  move: number;
  /** Units into `move`. */
  s: number;
  /** The movement it will take at the end of this lane, `TURN_BACK` or `DEAD_END`. */
  plan: number;
  /** The junction group it holds, and for which movement; -1 when none. */
  holds: number;
  holdMove: number;
  /** When it began waiting for a box, in simulated seconds; -1 when not. */
  queuedAt: number;
  /** When it may next look for another way out. */
  rerouteAt: number;
}

/** 0..1 from a car's cruising speed: a seeded spread that costs no extra draws. */
function temperament(car: Car): number {
  return Math.min(1, Math.max(0, (car.speed - SPEED_MIN) / (SPEED_MAX - SPEED_MIN)));
}

/** The lane a car is in. */
export const carLane = (car: Car): number => laneOf(car.segment, car.forward);

// ---------------------------------------------------------------------------
// The simulation
// ---------------------------------------------------------------------------

export interface Traffic {
  network: Network;
  graph: RoadGraph;
  blocks: Blockages | undefined;
  prng: Prng;
  cars: Car[];
  /** Simulated seconds so far. */
  time: number;
  /** Per lane: its U-turn, and how far ahead of the car it reaches. */
  turns: UTurnShape[];
  turnAhead: Float64Array;
  // Scratch, sized once: nothing in `stepTraffic` allocates.
  laneHead: Int16Array;
  moveHead: Int16Array;
  entryNext: Int16Array;
  entryCar: Int16Array;
  entryAlong: Float64Array;
  entryBack: Float64Array;
  entryFront: Float64Array;
  moveNext: Int16Array;
  heldHead: Int16Array;
  heldNext: Int16Array;
  waitHead: Int16Array;
  waitNext: Int16Array;
  claims: Float64Array;
  entries: number;
  nextV: Float64Array;
  allow: Float64Array;
  startTurn: Uint8Array;
  options: Int32Array;
}

/**
 * The traffic for a road graph and a fleet from `spawnCars`. `prng` is the
 * stream the fleet was spawned from; it goes on choosing their routes.
 */
export function createTraffic(
  graph: RoadGraph,
  cars: Car[],
  prng: Prng,
  blocks?: Blockages,
  half: number = CAR_HALF_LENGTH,
): Traffic {
  const network = junctionNetwork(graph, half);
  const lanes = graph.segments.length * 2;
  const shapes = new Map<number, UTurnShape>();
  const turns: UTurnShape[] = [];
  const turnAhead = new Float64Array(lanes);
  for (let lane = 0; lane < lanes; lane++) {
    const offset = network.lane[lane];
    let shape = shapes.get(offset);
    if (!shape) {
      shape = uTurnShape(offset);
      shapes.set(offset, shape);
    }
    turns.push(shape);
    turnAhead[lane] = uTurnAhead(shape, CAR_HALF_LENGTH, CAR_HALF_WIDTH);
  }
  const n = Math.max(1, cars.length);
  const traffic: Traffic = {
    network,
    graph,
    blocks,
    prng,
    cars,
    time: 0,
    turns,
    turnAhead,
    laneHead: new Int16Array(lanes),
    moveHead: new Int16Array(Math.max(1, network.moves.length)),
    entryNext: new Int16Array(n * 2),
    entryCar: new Int16Array(n * 2),
    entryAlong: new Float64Array(n * 2),
    entryBack: new Float64Array(n * 2),
    entryFront: new Float64Array(n * 2),
    moveNext: new Int16Array(n),
    heldHead: new Int16Array(Math.max(1, network.groups.length)),
    heldNext: new Int16Array(n),
    waitHead: new Int16Array(Math.max(1, network.groups.length)),
    waitNext: new Int16Array(n),
    claims: new Float64Array(lanes),
    entries: 0,
    nextV: new Float64Array(n),
    allow: new Float64Array(n),
    startTurn: new Uint8Array(n),
    options: new Int32Array(64),
  };
  // Every car decides where it is going before the first step.
  for (const car of cars) if (car.plan === UNPLANNED) car.plan = choosePlan(traffic, carLane(car), -1);
  return traffic;
}

/**
 * Where a car entering `lane` will go at its end: a movement out of the
 * junction there it can pull out of it into, `TURN_BACK` when there is none,
 * `DEAD_END` when the road just stops. `avoid` is a movement not to pick again.
 */
function choosePlan(traffic: Traffic, lane: number, avoid: number, needRoomFor = -1): number {
  const { network, blocks, prng, options } = traffic;
  if (network.endGroup[laneFinishEnd(lane)] < 0) return DEAD_END;
  const moves = network.movesFrom[lane];
  let count = 0;
  for (let i = 0; i < moves.length && count < options.length; i++) {
    const move = moves[i];
    if (move === avoid) continue;
    if (!enterable(network, network.moves[move].to, blocks)) continue;
    if (needRoomFor >= 0 && !hasRoom(traffic, network.moves[move].to, traffic.cars[needRoomFor].half)) continue;
    options[count++] = move;
  }
  if (count === 0) return avoid >= 0 ? avoid : TURN_BACK;
  return options[prng.int(0, count - 1)];
}

/** The first blocked stretch ahead of `along` on a lane, as the distance to its near edge. */
function conesAhead(traffic: Traffic, lane: number, along: number): number {
  const list = traffic.blocks?.bySegment[laneSegment(lane)];
  if (!list || list.length === 0) return Infinity;
  const length = traffic.graph.lengths[laneSegment(lane)];
  const forward = laneForward(lane);
  let edge = Infinity;
  for (const stretch of list) {
    const near = forward ? stretch.start : length - stretch.end;
    const far = forward ? stretch.end : length - stretch.start;
    if (far > along && near < edge) edge = near;
  }
  return edge;
}

/** Where a car on `lane` stops to turn round before the junction box, and whether its turn reaches into the box. */
function turnBackPoint(traffic: Traffic, lane: number, half: number): [number, boolean] {
  const { network } = traffic;
  const want = network.stopLine[lane] - traffic.turnAhead[lane] - STOP_BACK;
  const floor = network.pieceStart[lane] + half + RELEASE_GAP;
  return want >= floor ? [want, false] : [floor, true];
}

/** The entry on `lane` whose rear is nearest ahead of `along`: the car in front. -1 when none. */
function laneAhead(traffic: Traffic, lane: number, along: number, self: number): number {
  let best = -1;
  let bestRear = Infinity;
  for (let e = traffic.laneHead[lane]; e !== -1; e = traffic.entryNext[e]) {
    if (traffic.entryCar[e] === self) continue;
    if (traffic.entryAlong[e] <= along) continue;
    const rear = traffic.entryAlong[e] - traffic.entryBack[e];
    if (rear < bestRear) {
      bestRear = rear;
      best = e;
    }
  }
  return best;
}

/**
 * Whether a car `half` long has room on `lane` past the box it is about to
 * cross, after everyone already on their way into it: behind the last car
 * there with a gap, or short of the next stop line when it is empty.
 */
function hasRoom(traffic: Traffic, lane: number, half: number): boolean {
  const { network } = traffic;
  let rear = network.stopLine[lane] + ROOM_GAP - RELEASE_GAP;
  for (let e = traffic.laneHead[lane]; e !== -1; e = traffic.entryNext[e]) {
    const r = traffic.entryAlong[e] - traffic.entryBack[e];
    if (r < rear) rear = r;
  }
  return rear - network.pieceStart[lane] - traffic.claims[lane] >= 2 * half + ROOM_GAP;
}

function conflict(network: Network, a: number, b: number): boolean {
  if (a === WHOLE_BOX || b === WHOLE_BOX) return true;
  return movesConflict(network, a, b);
}

/** The movement a waiting car wants: its plan, or the whole box to turn round. */
function wanted(car: Car): number {
  return car.plan >= 0 ? car.plan : WHOLE_BOX;
}

function earlier(a: Car, ia: number, b: Car, ib: number): boolean {
  return a.queuedAt < b.queuedAt || (a.queuedAt === b.queuedAt && ia < ib);
}

const DENIED = 0;
const GRANTED = 1;
/** Denied only for want of room past the box. */
const NO_ROOM = 2;

/**
 * Asks for the box of `group` for car `i`, granting it when the rules in the
 * header allow.
 */
function requestBox(traffic: Traffic, i: number, group: number): number {
  const { network, cars } = traffic;
  const car = cars[i];
  const want = wanted(car);
  if (car.queuedAt < 0) {
    car.queuedAt = traffic.time;
    traffic.waitNext[i] = traffic.waitHead[group];
    traffic.waitHead[group] = i;
  }
  for (let o = traffic.heldHead[group]; o !== -1; o = traffic.heldNext[o]) {
    if (o === i || cars[o].holds !== group) continue;
    if (conflict(network, want, cars[o].holdMove)) return DENIED;
  }
  for (let w = traffic.waitHead[group]; w !== -1; w = traffic.waitNext[w]) {
    if (w === i) continue;
    const other = cars[w];
    if (other.holds === group || other.queuedAt < 0) continue;
    if (!earlier(other, w, car, i)) continue;
    const theirs = wanted(other);
    if (theirs >= 0 && !hasRoom(traffic, network.moves[theirs].to, other.half)) continue;
    if (conflict(network, want, theirs)) return DENIED;
  }
  if (want >= 0) {
    // Where the movement spills over its box, nobody may be standing.
    const spills = network.moves[want].spills;
    for (let k = 0; k < spills.length; k += 3) {
      const lo = spills[k + 1] - network.half - SPILL_MARGIN;
      const hi = spills[k + 2] + network.half + SPILL_MARGIN;
      for (let e = traffic.laneHead[spills[k]]; e !== -1; e = traffic.entryNext[e]) {
        if (traffic.entryCar[e] === i) continue;
        if (traffic.entryAlong[e] + traffic.entryFront[e] > lo && traffic.entryAlong[e] - traffic.entryBack[e] < hi) return DENIED;
      }
    }
    const to = network.moves[want].to;
    if (!hasRoom(traffic, to, car.half)) return NO_ROOM;
    traffic.claims[to] += 2 * car.half + ROOM_GAP;
  }
  car.holds = group;
  car.holdMove = want;
  car.queuedAt = -1;
  traffic.heldNext[i] = traffic.heldHead[group];
  traffic.heldHead[group] = i;
  return GRANTED;
}

/**
 * Whether a car at `along` on `lane` may start turning round: nothing in its
 * own lane just ahead, nothing in the other lane where it will swing across
 * and come out, and nothing coming along the other lane too fast to stop.
 */
function turnClear(traffic: Traffic, i: number, lane: number, along: number): boolean {
  const { network, cars } = traffic;
  const car = cars[i];
  const ahead = traffic.turnAhead[lane];
  for (let e = traffic.laneHead[lane]; e !== -1; e = traffic.entryNext[e]) {
    if (traffic.entryCar[e] === i || traffic.entryAlong[e] <= along) continue;
    if (traffic.entryAlong[e] - traffic.entryBack[e] < along + ahead + TURN_CLEAR) return false;
  }
  const other = oppositeLane(lane);
  const length = network.graph.lengths[laneSegment(lane)];
  const mirror = length - along;
  const lo = mirror - ahead - TURN_CLEAR;
  const hi = mirror + car.half + TURN_CLEAR;
  for (let e = traffic.laneHead[other]; e !== -1; e = traffic.entryNext[e]) {
    if (traffic.entryCar[e] === i) continue;
    const rear = traffic.entryAlong[e] - traffic.entryBack[e];
    const nose = traffic.entryAlong[e] + traffic.entryFront[e];
    if (nose > lo && rear < hi) return false;
    if (nose <= lo) {
      const v = cars[traffic.entryCar[e]].v;
      if (lo - nose < (v * v) / (2 * COMFORT) + FOLLOW_GAP + 1) return false;
    }
  }
  // Near the junction behind it, anything on its way into the other lane.
  if (lo - network.pieceStart[other] < LOOKAHEAD / 2) {
    if (traffic.claims[other] > 0) return false;
    const into = network.movesInto[other];
    for (let k = 0; k < into.length; k++) if (traffic.moveHead[into[k]] !== -1) return false;
  }
  return true;
}

/** The Intelligent Driver Model's acceleration behind a car `gap` ahead doing `lead`. */
function idm(v: number, desired: number, gap: number, lead: number): number {
  const free = 1 - Math.pow(v / Math.max(desired, 0.1), 4);
  if (gap === Infinity) return ACCEL * free;
  const want = FOLLOW_GAP + Math.max(0, v * HEADWAY + (v * (v - lead)) / (2 * Math.sqrt(ACCEL * COMFORT)));
  const s = Math.max(gap, 0.01);
  return ACCEL * (free - (want / s) * (want / s));
}

/** Scratch for what is in front of the car being decided. */
const front = { gap: Infinity, lead: 0 };

function consider(gap: number, lead: number): void {
  if (gap < front.gap) {
    front.gap = gap;
    front.lead = lead;
  }
}

/** Cars in any movement out of `lane`'s end, `before` units ahead of the car's centre at the lane's end. */
function considerMovesFrom(traffic: Traffic, lane: number, before: number, half: number): void {
  const moves = traffic.network.movesFrom[lane];
  for (let k = 0; k < moves.length; k++) {
    for (let c = traffic.moveHead[moves[k]]; c !== -1; c = traffic.moveNext[c]) {
      const other = traffic.cars[c];
      consider(before + other.s - other.half - half, other.v);
    }
  }
}

/** The car at the back of `lane`, `before` units ahead of the car's centre at the lane's start. */
function considerLaneStart(traffic: Traffic, lane: number, before: number, half: number): void {
  const e = laneAhead(traffic, lane, -Infinity, -1);
  if (e === -1) return;
  const rear = traffic.entryAlong[e] - traffic.entryBack[e];
  consider(before + rear - traffic.network.pieceStart[lane] - half, traffic.cars[traffic.entryCar[e]].v);
}

/** Files a body on a lane: its centre `along` it, reaching `back` behind and `forward` ahead. */
function addEntry(traffic: Traffic, lane: number, car: number, along: number, back: number, forward: number): void {
  const e = traffic.entries++;
  traffic.entryCar[e] = car;
  traffic.entryAlong[e] = along;
  traffic.entryBack[e] = back;
  traffic.entryFront[e] = forward;
  traffic.entryNext[e] = traffic.laneHead[lane];
  traffic.laneHead[lane] = e;
}

/**
 * Advance the whole fleet by `dt` seconds. First every car is filed by the
 * lane or junction curve it is in; then each decides, in fleet order, how fast
 * to go from where everyone was at the start of the step, asking for junction
 * boxes as it comes to them; then all move. A car only ever moves into room it
 * had at the start of the step, and the car ahead of it only moves forward, so
 * the order cannot put two cars in one place.
 */
export function stepTraffic(traffic: Traffic, dt: number): void {
  if (dt <= 0) return;
  const { network, cars, graph } = traffic;
  traffic.time += dt;

  // -- File every car ------------------------------------------------------
  traffic.laneHead.fill(-1);
  traffic.moveHead.fill(-1);
  traffic.heldHead.fill(-1);
  traffic.waitHead.fill(-1);
  traffic.claims.fill(0);
  traffic.entries = 0;
  for (let i = cars.length - 1; i >= 0; i--) {
    const car = cars[i];
    const lane = carLane(car);
    const length = graph.lengths[car.segment];
    const along = car.t * length;
    if (car.turn !== null) {
      // Across both lanes: its own from its tail to as far as the turn
      // reaches, and the other over the same ground, seen the other way.
      const ahead = traffic.turnAhead[lane];
      addEntry(traffic, lane, i, along, car.half, ahead);
      addEntry(traffic, oppositeLane(lane), i, length - along, ahead, car.half);
    } else if (car.move >= 0) {
      traffic.moveNext[i] = traffic.moveHead[car.move];
      traffic.moveHead[car.move] = i;
    } else {
      addEntry(traffic, lane, i, along, car.half, car.half);
    }
    if (car.holds >= 0) {
      traffic.heldNext[i] = traffic.heldHead[car.holds];
      traffic.heldHead[car.holds] = i;
      if (car.holdMove >= 0) {
        const move = network.moves[car.holdMove];
        // Room it has claimed past the box and not yet driven into.
        if (car.move === car.holdMove || (car.move < 0 && lane === move.from)) {
          traffic.claims[move.to] += 2 * car.half + ROOM_GAP;
        }
      }
    }
    if (car.queuedAt >= 0) {
      const group = queueGroup(traffic, car);
      if (group >= 0) {
        traffic.waitNext[i] = traffic.waitHead[group];
        traffic.waitHead[group] = i;
      } else {
        car.queuedAt = -1;
      }
    }
  }

  // -- Decide --------------------------------------------------------------
  for (let i = 0; i < cars.length; i++) {
    const car = cars[i];
    traffic.startTurn[i] = 0;
    if (car.turn !== null) continue;
    front.gap = Infinity;
    front.lead = 0;
    let cap = car.speed;
    let limit = Infinity;

    if (car.move >= 0) {
      const move = network.moves[car.move];
      for (let c = traffic.moveHead[car.move]; c !== -1; c = traffic.moveNext[c]) {
        const other = cars[c];
        if (c !== i && other.s > car.s) consider(other.s - car.s - other.half - car.half, other.v);
      }
      considerLaneStart(traffic, move.to, move.length - car.s, car.half);
      cap = Math.min(cap, move.vmax);
    } else {
      const lane = carLane(car);
      const length = graph.lengths[car.segment];
      const along = car.t * length;
      const end = network.pieceEnd[lane];
      const e = laneAhead(traffic, lane, along, i);
      if (e !== -1) {
        consider(traffic.entryAlong[e] - traffic.entryBack[e] - along - car.half, cars[traffic.entryCar[e]].v);
      }
      const granted = car.holds >= 0 && car.holdMove === car.plan && car.plan >= 0 && network.moves[car.plan].from === lane;
      if (end - along < LOOKAHEAD && car.plan >= 0) {
        // Cars already in the junction curves ahead, and past the box on the
        // way it will go.
        considerMovesFrom(traffic, lane, end - along, car.half);
        // Whoever is at the back of the lane it will go on to, granted or not:
        // through a box too small to hold a car, their tail is in its way.
        const move = network.moves[car.plan];
        considerLaneStart(traffic, move.to, end - along + move.length, car.half);
      }

      // Where it has to stop, if anywhere, and what for.
      let stop = Infinity;
      let turnAt = false;
      let needsBox = false;
      const cones = conesAhead(traffic, lane, along);
      if (cones < Infinity) {
        stop = Math.max(along, cones - reachFor(graph.segments[car.segment].width) - temperament(car) * TEMPER_BACK);
      } else if (car.plan === DEAD_END) {
        stop = Math.max(along, end - traffic.turnAhead[lane] - STOP_BACK);
        turnAt = true;
      } else if (car.plan === TURN_BACK) {
        const [point, box] = turnBackPoint(traffic, lane, car.half);
        stop = Math.max(along, point);
        turnAt = true;
        needsBox = box;
      } else if (!granted) {
        // At the stop line, clear of anything that turns through the box.
        stop = Math.max(along, network.stopLine[lane] - car.half);
      } else {
        // Brake for the curve in time to take it at its speed.
        const vmax = network.moves[car.plan].vmax;
        cap = Math.min(cap, Math.sqrt(vmax * vmax + 2 * STOP_BRAKE * Math.max(0, end - along)));
      }

      if (stop < Infinity) {
        cap = Math.min(cap, Math.sqrt(2 * STOP_BRAKE * Math.max(0, stop - along)));
        limit = stop - along;
        const arrived = stop - along < 0.02 && car.v < 0.6;
        const lead = e === -1;
        if (cones < Infinity) {
          if (arrived && !car.stood) {
            car.stood = true;
            // Brief and seeded: a careful driver waits a little longer.
            car.wait = 0.5 + (1 - temperament(car)) * 0.9;
          } else if (arrived && car.wait <= 0 && turnClear(traffic, i, lane, along)) {
            traffic.startTurn[i] = 1;
          }
        } else if (turnAt) {
          if (arrived && turnClear(traffic, i, lane, along)) {
            const group = network.endGroup[laneFinishEnd(lane)];
            const mine = car.holds === group && car.holdMove === WHOLE_BOX;
            if (!needsBox || mine || (car.holds < 0 && requestBox(traffic, i, group) === GRANTED)) traffic.startTurn[i] = 1;
          }
        } else if (lead && car.holds < 0 && stop - along < Math.max(REQUEST_RANGE, (car.v * car.v) / (2 * STOP_BRAKE) + 4)) {
          const group = network.moves[car.plan].group;
          const answer = requestBox(traffic, i, group);
          if (answer === GRANTED) {
            const vmax = network.moves[car.plan].vmax;
            cap = Math.min(car.speed, Math.sqrt(vmax * vmax + 2 * STOP_BRAKE * Math.max(0, end - along)));
            limit = Infinity;
            const move = network.moves[car.plan];
            considerLaneStart(traffic, move.to, end - along + move.length, car.half);
          } else if (
            answer === NO_ROOM &&
            traffic.time - car.queuedAt > REROUTE_AFTER &&
            traffic.time >= car.rerouteAt
          ) {
            // Kept waiting for room: another way out, if one has room now.
            car.plan = choosePlan(traffic, lane, car.plan, i);
            car.rerouteAt = traffic.time + REROUTE_AFTER / 2;
          }
        }
      }
    }

    let a = idm(car.v, car.speed, front.gap, front.lead);
    if (a < -DECEL_MAX) a = -DECEL_MAX;
    let v = Math.max(0, car.v + a * dt);
    // Down to the cap for a stop or a curve, as hard as the brakes allow.
    if (v > cap) v = Math.min(v, Math.max(cap, car.v - DECEL_MAX * dt));
    if (car.wait > 0) v = 0;
    traffic.nextV[i] = v;
    // The hard rule: never further than the room in front.
    if (front.gap < Infinity) limit = Math.min(limit, front.gap - MIN_GAP);
    traffic.allow[i] = Math.max(0, limit);
  }

  // -- Move ----------------------------------------------------------------
  for (let i = 0; i < cars.length; i++) {
    const car = cars[i];
    if (car.turn !== null) {
      driveTurn(traffic, car, dt);
      continue;
    }
    if (car.wait > 0) {
      car.v = 0;
      car.wait = Math.max(0, car.wait - dt);
      continue;
    }
    if (traffic.startTurn[i]) {
      car.turn = 0;
      car.v = 0;
      car.stood = false;
      continue;
    }
    let travel = traffic.nextV[i] * dt;
    const room = traffic.allow[i];
    if (travel > room) travel = room;
    car.v = travel / dt;
    if (travel <= 0) continue;

    if (car.move >= 0) {
      car.s += travel;
      const move = network.moves[car.move];
      if (car.s >= move.length) {
        enterLane(traffic, car, move.to, network.pieceStart[move.to] + car.s - move.length);
      }
      continue;
    }

    const lane = carLane(car);
    const length = graph.lengths[car.segment];
    let along = car.t * length + travel;
    if (car.holds >= 0 && car.holdMove === car.plan && car.plan >= 0 && network.moves[car.plan].from === lane) {
      const end = network.pieceEnd[lane];
      if (along >= end) {
        car.move = car.plan;
        car.s = along - end;
        const move = network.moves[car.move];
        if (car.s >= move.length) enterLane(traffic, car, move.to, network.pieceStart[move.to] + car.s - move.length);
        continue;
      }
    }
    along = Math.min(along, length);
    car.t = along / length;
    releaseIfClear(traffic, car);
  }
}

/** The group a waiting car is queued at. */
function queueGroup(traffic: Traffic, car: Car): number {
  if (car.turn !== null || car.move >= 0) return -1;
  if (car.plan >= 0) return traffic.network.moves[car.plan].group;
  if (car.plan === TURN_BACK) return traffic.network.endGroup[laneFinishEnd(carLane(car))];
  return -1;
}

/** Puts a car coming out of a junction curve (or a U-turn) onto `lane`, `along` units in. */
function enterLane(traffic: Traffic, car: Car, lane: number, along: number): void {
  const { network, graph } = traffic;
  const segment = laneSegment(lane);
  const length = graph.lengths[segment];
  car.segment = segment;
  car.forward = laneForward(lane);
  car.move = -1;
  car.s = 0;
  car.t = Math.min(0.999, Math.max(0, along / length));
  car.lane = network.lane[lane];
  car.plan = choosePlan(traffic, lane, -1);
  car.queuedAt = -1;
  car.stood = false;
  releaseIfClear(traffic, car);
}

/** Lets go of a junction box once the car's tail is out of it. */
function releaseIfClear(traffic: Traffic, car: Car): void {
  if (car.holds < 0 || car.holdMove < 0) return;
  const move = traffic.network.moves[car.holdMove];
  if (car.move >= 0 || carLane(car) !== move.to) return;
  const along = car.t * traffic.graph.lengths[car.segment];
  if (along >= traffic.network.pieceStart[move.to] + car.half + RELEASE_GAP) {
    car.holds = -1;
    car.holdMove = -1;
  }
}

/** One step of a U-turn: accelerate along the leg, stop at each change of gear. */
function driveTurn(traffic: Traffic, car: Car, dt: number): void {
  const lane = carLane(car);
  const shape = traffic.turns[lane];
  if (car.wait > 0) {
    car.v = 0;
    car.wait = Math.max(0, car.wait - dt);
    return;
  }
  const turn = car.turn as number;
  let start = 0;
  let leg = 0;
  while (leg < 2 && turn >= start + shape.legs[leg] && shape.legs[leg + 1] > 0) {
    start += shape.legs[leg];
    leg++;
  }
  const legLength = shape.legs[leg];
  const into = turn - start;
  // Legs that end in a change of gear come to a stop; the last rolls away.
  const stops = !shape.loop && leg < 2;
  let target = Math.min(TURN_SPEED, TURN_CREEP + Math.sqrt(2 * TURN_ACCEL * into));
  if (stops) target = Math.min(target, TURN_CREEP + Math.sqrt(2 * TURN_ACCEL * Math.max(0, legLength - into)));
  const v = Math.min(car.v + TURN_ACCEL * dt, target);
  car.v = v;
  const next = turn + v * dt;
  if (stops && next >= start + legLength) {
    car.turn = start + legLength;
    car.v = 0;
    car.wait = GEAR_PAUSE;
    return;
  }
  if (next >= shape.total) {
    // Round: the same spot, measured from the other end of the road.
    const length = traffic.graph.lengths[car.segment];
    const along = car.t * length;
    car.turn = null;
    if (car.holds >= 0 && car.holdMove === WHOLE_BOX) {
      car.holds = -1;
      car.holdMove = -1;
    }
    enterLane(traffic, car, oppositeLane(lane), length - along);
    car.v = Math.min(v, TURN_SPEED);
    return;
  }
  car.turn = next;
}

// ---------------------------------------------------------------------------
// Spawning
// ---------------------------------------------------------------------------

/**
 * Seeded car placement. Major roads are twice as likely to be picked, so
 * traffic reads as flowing along the arterials. Every car starts on a lane
 * between junctions, clear of every other car, of any blocked stretch and of
 * the junction boxes. `half` is half the longest body in the fleet, as
 * `createTraffic` is given it.
 */
export function spawnCars(
  graph: RoadGraph,
  count: number,
  prng: Prng,
  blocks?: Blockages,
  half: number = CAR_HALF_LENGTH,
): Car[] {
  const network = junctionNetwork(graph, half);
  const roads = graph.segments;
  const lengthOf = (index: number) => graph.lengths[index];

  /** Per lane: the stretches of it a car may stand on, in travel units. */
  const standing = (lane: number): [number, number][] => {
    if (!network.usable[lane]) return [];
    const segment = laneSegment(lane);
    // Between cones and a junction with no way on, a car would only turn
    // round and round: start nobody there.
    if (hasCones(blocks, segment) && !(hasWayOn(network, lane, blocks) && hasWayOn(network, oppositeLane(lane), blocks))) {
      return [];
    }
    const length = lengthOf(segment);
    const lo = network.pieceStart[lane] + half + RELEASE_GAP;
    let hi = network.stopLine[lane] - half;
    if (network.endGroup[laneFinishEnd(lane)] < 0) hi = Math.min(hi, network.pieceEnd[lane] - half - 4);
    if (hi < lo) return [];
    const runs = usableRuns(length, roads[segment].width, blocks?.bySegment[segment]);
    if (!runs) return [[lo, hi]];
    const out: [number, number][] = [];
    for (const [a, b] of runs) {
      const start = laneForward(lane) ? a : length - b;
      const finish = laneForward(lane) ? b : length - a;
      const x = Math.max(lo, start);
      const y = Math.min(hi, finish);
      if (y >= x) out.push([x, y]);
    }
    return out;
  };
  const places = Array.from({ length: roads.length * 2 }, (_, lane) => standing(lane));

  const drivable = roads
    .map((road, index) => ({ road, index }))
    .filter(({ index }) => lengthOf(index) > 4 && (places[index * 2].length > 0 || places[index * 2 + 1].length > 0));
  if (drivable.length === 0) return [];

  const weighted: number[] = [];
  for (const { road, index } of drivable) {
    weighted.push(index);
    if (road.major) weighted.push(index);
  }

  /** Centres already taken, per lane. */
  const taken = new Map<number, number[]>();
  const spacing = 2 * half + FOLLOW_GAP + 0.5;
  const fits = (lane: number, along: number) => (taken.get(lane) ?? []).every((other) => Math.abs(other - along) >= spacing);
  /** The free spot on `lane` nearest `want`, or null. */
  const nearest = (lane: number, want: number): number | null => {
    let best: number | null = null;
    const candidates = [want];
    for (const other of taken.get(lane) ?? []) candidates.push(other - spacing, other + spacing);
    for (const [lo, hi] of places[lane]) {
      for (const c of candidates) {
        const spot = Math.min(hi, Math.max(lo, c));
        if (!fits(lane, spot)) continue;
        if (best === null || Math.abs(spot - want) < Math.abs(best - want)) best = spot;
      }
    }
    return best;
  };

  const cars: Car[] = [];
  const total = Math.max(0, Math.min(count, MAX_FLEET));
  const lanes = roads.length * 2;
  for (let i = 0; i < total; i++) {
    const segment = prng.pick(weighted);
    const forward = prng.next() < 0.5;
    const t = prng.next();
    // One world unit is about a metre and a half at the scale the generator
    // builds to (see `types/city.ts`), so this is roughly 25 to 35 km/h:
    // brisk enough to read as traffic, slow enough that a car crossing a
    // twenty unit block between junctions takes about four seconds rather
    // than darting from turn to turn.
    const speed = prng.range(SPEED_MIN, SPEED_MAX);
    const colorIndex = prng.int(0, 5);

    // The spot it was dealt, or the nearest free one; failing that the first
    // free spot on the lanes after it. No extra draws.
    let lane = laneOf(segment, forward);
    if (places[lane].length === 0) lane = oppositeLane(lane);
    let along: number | null = null;
    if (places[lane].length > 0) {
      const [lo, hi] = places[lane][Math.min(places[lane].length - 1, Math.floor(t * places[lane].length))];
      along = nearest(lane, lo + (hi - lo) * t);
    }
    for (let k = 1; along === null && k < lanes; k++) {
      const next = (lane + k) % lanes;
      if (places[next].length === 0) continue;
      const [lo, hi] = places[next][0];
      const spot = nearest(next, (lo + hi) / 2);
      if (spot !== null) {
        lane = next;
        along = spot;
      }
    }
    if (along === null) break;
    const list = taken.get(lane);
    if (list) list.push(along);
    else taken.set(lane, [along]);

    const seg = laneSegment(lane);
    cars.push({
      segment: seg,
      forward: laneForward(lane),
      t: Math.min(0.999, along / lengthOf(seg)),
      speed,
      v: speed,
      lane: network.lane[lane],
      colorIndex,
      half,
      wait: 0,
      stood: false,
      turn: null,
      move: -1,
      s: 0,
      // Chosen by `createTraffic`, from the traffic's own stream.
      plan: UNPLANNED,
      holds: -1,
      holdMove: -1,
      queuedAt: -1,
      rerouteAt: 0,
    });
  }
  return cars;
}

// ---------------------------------------------------------------------------
// Poses
// ---------------------------------------------------------------------------

export interface CarPose {
  x: number;
  z: number;
  /** Heading in radians for `rotation.y`. */
  angle: number;
  /** Heading change per unit travelled, positive turning left: what the front wheels steer to. */
  curvature: number;
  /** True while backing up in a three-point turn. */
  reverse: boolean;
}

const path: PathPose = { x: 0, z: 0, angle: 0, curvature: 0 };
const local: UTurnPose = { x: 0, y: 0, psi: 0, reverse: false, leg: 0, curvature: 0 };

/**
 * Position and heading for a car: on its lane, on the curve through a
 * junction, or partway round a U-turn. Written into `out` when given, so the
 * frame loop does not allocate.
 */
export function carPose(
  traffic: Traffic,
  car: Car,
  out: CarPose = { x: 0, z: 0, angle: 0, curvature: 0, reverse: false },
): CarPose {
  const { network, graph } = traffic;
  out.reverse = false;
  if (car.move >= 0) {
    movePoint(network, car.move, car.s, path);
  } else if (car.turn !== null) {
    const lane = carLane(car);
    const f = network.frame;
    const ux = f[lane * 4 + 2];
    const uz = f[lane * 4 + 3];
    const along = car.t * graph.lengths[car.segment];
    const cx = f[lane * 4] + ux * along;
    const cz = f[lane * 4 + 1] + uz * along;
    uTurnPose(traffic.turns[lane], car.turn, local);
    // Local x runs to the car's left, which is (uz, -ux) in the world.
    out.x = cx + ux * local.y + uz * local.x;
    out.z = cz + uz * local.y - ux * local.x;
    const fx = Math.sin(local.psi);
    const fy = Math.cos(local.psi);
    out.angle = Math.atan2(ux * fy + uz * fx, uz * fy - ux * fx);
    // Backing up, the car turns the way it is heading but steers the other way.
    out.curvature = local.reverse ? -local.curvature : local.curvature;
    out.reverse = local.reverse;
    return out;
  } else {
    lanePoint(network, carLane(car), car.t * graph.lengths[car.segment], path);
  }
  out.x = path.x;
  out.z = path.z;
  out.angle = path.angle;
  out.curvature = path.curvature;
  return out;
}
