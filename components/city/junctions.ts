/**
 * Junctions for the traffic (PLAN.md sections 17, 18 and 37).
 *
 * The generator hands over road centrelines split at every junction. Driving
 * them segment by segment means a car pivots on the spot wherever two meet.
 * This module turns the road graph into what a driver actually uses:
 *
 *   LANE PIECES. Each lane runs from a SETBACK at its start to a setback at
 *   its end: the edge of the junction box, where the crossing road's
 *   carriageway begins. Between two junctions a car drives its lane straight.
 *
 *   MOVEMENTS. Inside a junction box a car follows a curve from the end of
 *   the lane it came in on to the start of the lane it leaves by. The curve
 *   is a cubic Bezier fitted to both lanes: where the two lane lines cross,
 *   it is the quadratic with that corner as its control point, so it leaves
 *   and joins each lane along it and the heading turns smoothly between. We
 *   drive on the right, so a right turn is the tight inside corner and a left
 *   turn sweeps wide across the box, without either being asked for. Each
 *   movement knows its sharpest bend, and so how fast it can be taken.
 *
 *   GROUPS. Where two junctions are so close that no car could stand between
 *   them -- a jog in the grid, a short link at a highway fork -- they are one
 *   junction box, and a movement runs from a lane into the group to a lane out
 *   of it in one curve. The same goes for a stub too short to turn round in.
 *
 *   CONFLICTS. Two movements through one group conflict when a car on one
 *   could touch a car on the other anywhere along them. It is measured, with
 *   the fleet's longest body swept along both paths, the first time anyone
 *   asks, and remembered. The traffic reserves a group's box against this
 *   (`traffic.ts`).
 *
 * Pure, no three.js: unit tested.
 */

import { CAR_HALF_LENGTH, CAR_HALF_WIDTH, laneFinishEnd, laneForward, laneOf, laneOffset, laneSegment, laneStartEnd } from "./lanes";
import type { RoadGraph } from "./traffic";

/** Clearance between a junction box and the crossing road's carriageway edge. */
const BOX_MARGIN = 0.3;
/** A box never reaches further than this along a road. */
const BOX_MAX = 8;
/** Radius a gentle bend in a village lane is taken at, and the most it may set back. */
const BEND_RADIUS = 10;
const BEND_MAX = 6;
/** The least a bend is set back, when the lanes either side are short. */
const BEND_MIN = 1.2;
/**
 * Past this a two-road node is a corner, not a bend (`groundwork.ts` draws it
 * as two overlapping carriageways), and its box is sized to the road.
 */
const CORNER_ANGLE = (60 * Math.PI) / 180;
/** A corner's box, as a share of the road's width. */
const CORNER_BOX = 0.9;
/**
 * The shortest lane piece a car may stand on: the longest body in the fleet
 * and this much daylight. Anything shorter joins the junctions at its ends.
 */
const PIECE_SPARE = 1;
/** The shortest lane piece for a fleet whose longest body is `2 * half` long. */
export const minPiece = (half: number): number => half * 2 + PIECE_SPARE;
/**
 * A dead-end lane needs room to pull in off the junction and turn round
 * (`uturn.ts`); anything shorter is a stub nobody drives into.
 */
export const DEAD_END_ROOM = 8.5;
/** Lateral acceleration a car will corner at, world units per second squared. */
export const CORNERING = 2.2;
/** No curve is taken faster than this, however straight. */
const CURVE_TOP = 9;
/** A movement shorter than this is two lanes meeting, driven straight across. */
const POINT_MOVE = 0.05;
/** Samples along a movement for its arc-length table. */
const ARC_STEPS = 24;
/** A movement back the way the car came is a U-turn, not a movement. */
const REVERSAL = -0.9;
/** Swept-body clearance when deciding whether two movements conflict. */
const SWEEP_MARGIN = 0.12;
const SWEEP_STEP = 0.45;
/**
 * A waiting car's nose stops this far short of the junction box, and a car
 * leaving one lets go of it once its tail is this far out.
 */
export const STOP_BACK = 0.3;
export const RELEASE_GAP = 0.3;
/**
 * Clearance kept from where a movement spills over its box: more than a car
 * covers in the longest step the renderer takes.
 */
export const SPILL_MARGIN = 0.7;
/** How much a box grows each time a movement is found spilling out of it, and how many times. */
const WIDEN_STEP = 0.5;
const WIDEN_ROUNDS = 12;
/** How many times junctions may be folded together for lanes too short to wait on. */
const FOLD_PASSES = 6;
/** No box grows past this, whatever spills. */
const WIDEN_MAX = BOX_MAX + 5;

export interface Move {
  /** Index into `network.groups`. */
  group: number;
  /** Its position in the group's `moves`, for the conflict matrix. */
  slot: number;
  /** The lane it leaves, and the lane it joins. */
  from: number;
  to: number;
  /** Cubic Bezier control points in the xz plane. */
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  x3: number;
  z3: number;
  /** Length along the curve, world units. */
  length: number;
  /** Arc length at `u = i / ARC_STEPS`, `ARC_STEPS + 1` entries. */
  arc: Float64Array;
  /** The fastest the curve can be driven at `CORNERING`. */
  vmax: number;
  /** How many radians the heading turns through, signed: positive is a left turn. */
  turn: number;
  /**
   * Where it still spills out of its box onto another lane of the junction,
   * as `[lane, lo, hi]` triples: a car whose centre stands between `lo` and
   * `hi` along that lane would be touched. See `spillInterval`.
   */
  spills: number[];
}

export interface Group {
  /** Node keys (`roadGraph`) of the junctions it merges. */
  nodes: string[];
  /** Global move ids through it. */
  moves: number[];
  /** `moves.length` squared: 0 not yet measured, 1 compatible, 2 conflicting. */
  conflicts: Int8Array;
  /** Every drivable segment with an end in the group, inner ones included. */
  segments: number[];
  /** The middle of the box. */
  x: number;
  z: number;
}

export interface Network {
  graph: RoadGraph;
  /**
   * Half the length of the longest body in the fleet it was built for: what
   * every box, stop line and conflict is measured with.
   */
  half: number;
  /** Per segment: 1 when traffic may use it at all. */
  drivable: Uint8Array;
  /** Per segment: 1 when both ends are in one group, so it is inside a junction box. */
  inner: Uint8Array;
  /** Per segment end: distance from the node to the edge of the junction box. */
  setback: Float64Array;
  /** Per segment end: its group, or -1 at a dead end. */
  endGroup: Int32Array;
  /** Per lane: lane offset from the centre line. */
  lane: Float64Array;
  /** Per lane: `[startX, startZ, dirX, dirZ]`, the point it starts from and its unit direction. */
  frame: Float64Array;
  /** Per lane: where its drivable piece begins and ends, world units from its start. */
  pieceStart: Float64Array;
  pieceEnd: Float64Array;
  /**
   * Per lane: how far along it a waiting car's nose may come. Just short of
   * the box, or further back where a movement through the box spills onto
   * the lane.
   */
  stopLine: Float64Array;
  /** Per lane: 1 when a car may be on it between junctions. */
  usable: Uint8Array;
  groups: Group[];
  moves: Move[];
  /** Per lane: moves out of its end, and moves into its start. */
  movesFrom: number[][];
  movesInto: number[][];
}

/** A point and heading on a path; the frame loop reuses one. */
export interface PathPose {
  x: number;
  z: number;
  /** Heading as `rotation.y`: `atan2(dx, dz)`. */
  angle: number;
  /** Heading change per unit travelled, positive to the left. */
  curvature: number;
}

/**
 * Where a car's centre is at `along` world units down `lane`, and which way it
 * faces. The lane's right-hand side is `(-uz, ux)`: see `carPose`.
 */
export function lanePoint(network: Network, lane: number, along: number, out: PathPose): PathPose {
  const f = network.frame;
  const sx = f[lane * 4];
  const sz = f[lane * 4 + 1];
  const ux = f[lane * 4 + 2];
  const uz = f[lane * 4 + 3];
  const offset = network.lane[lane];
  out.x = sx + ux * along - uz * offset;
  out.z = sz + uz * along + ux * offset;
  out.angle = Math.atan2(ux, uz);
  out.curvature = 0;
  return out;
}

// ---------------------------------------------------------------------------
// Bezier maths
// ---------------------------------------------------------------------------

function bezier(m: Move, u: number, out: PathPose): PathPose {
  const v = 1 - u;
  const b0 = v * v * v;
  const b1 = 3 * v * v * u;
  const b2 = 3 * v * u * u;
  const b3 = u * u * u;
  out.x = b0 * m.x0 + b1 * m.x1 + b2 * m.x2 + b3 * m.x3;
  out.z = b0 * m.z0 + b1 * m.z1 + b2 * m.z2 + b3 * m.z3;
  // First and second derivatives.
  const dx = 3 * v * v * (m.x1 - m.x0) + 6 * v * u * (m.x2 - m.x1) + 3 * u * u * (m.x3 - m.x2);
  const dz = 3 * v * v * (m.z1 - m.z0) + 6 * v * u * (m.z2 - m.z1) + 3 * u * u * (m.z3 - m.z2);
  const ddx = 6 * v * (m.x2 - 2 * m.x1 + m.x0) + 6 * u * (m.x3 - 2 * m.x2 + m.x1);
  const ddz = 6 * v * (m.z2 - 2 * m.z1 + m.z0) + 6 * u * (m.z3 - 2 * m.z2 + m.z1);
  const speed = Math.hypot(dx, dz);
  if (speed > 1e-9) {
    out.angle = Math.atan2(dx, dz);
    // The heading `atan2(dx, dz)` grows as the tangent swings from +z to +x.
    out.curvature = (ddx * dz - ddz * dx) / (speed * speed * speed);
  } else {
    out.curvature = 0;
  }
  return out;
}


/** `u` at arc length `s` along a movement, from its table. */
function paramAt(m: Move, s: number): number {
  if (m.length === 0 || s <= 0) return 0;
  if (s >= m.length) return 1;
  const arc = m.arc;
  // The table is short; a binary search keeps it cheap anyway.
  let lo = 0;
  let hi = ARC_STEPS;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (arc[mid] <= s) lo = mid;
    else hi = mid;
  }
  const span = arc[hi] - arc[lo] || 1;
  return (lo + (s - arc[lo]) / span) / ARC_STEPS;
}

/** A car `s` units into movement `move`. */
export function movePoint(network: Network, move: number, s: number, out: PathPose): PathPose {
  const m = network.moves[move];
  if (m.length === 0) {
    // A straight run through a split with nothing to turn: the lanes meet.
    lanePoint(network, m.from, network.pieceEnd[m.from], out);
    return out;
  }
  return bezier(m, paramAt(m, s), out);
}

/**
 * A pose `d` units along a movement, where `d` may run up to `before` short
 * of its start or `after` past its end: then it is on the lane it comes from
 * or goes to. What a body sweeps from the moment its nose enters the box to
 * the moment its tail leaves it.
 */
function sweepPoint(network: Network, move: number, d: number, out: PathPose): PathPose {
  const m = network.moves[move];
  if (d < 0) return lanePoint(network, m.from, network.pieceEnd[m.from] + d, out);
  if (d > m.length) return lanePoint(network, m.to, network.pieceStart[m.to] + d - m.length, out);
  return movePoint(network, move, d, out);
}

// ---------------------------------------------------------------------------
// Building the network
// ---------------------------------------------------------------------------

function fitMove(network: Network, move: Move): void {
  const start = lanePoint(network, move.from, network.pieceEnd[move.from], { x: 0, z: 0, angle: 0, curvature: 0 });
  const end = lanePoint(network, move.to, network.pieceStart[move.to], { x: 0, z: 0, angle: 0, curvature: 0 });
  const f = network.frame;
  const ax = f[move.from * 4 + 2];
  const az = f[move.from * 4 + 3];
  const bx = f[move.to * 4 + 2];
  const bz = f[move.to * 4 + 3];
  move.x0 = start.x;
  move.z0 = start.z;
  move.x3 = end.x;
  move.z3 = end.z;

  // Where the two lane lines cross: start + a * t0 = end - b * t3.
  const cross = ax * bz - az * bx;
  const rx = end.x - start.x;
  const rz = end.z - start.z;
  let quadratic = false;
  if (Math.abs(cross) > 0.17) {
    const t0 = (rx * bz - rz * bx) / cross;
    const t3 = (rx * az - rz * ax) / cross;
    // Only when the corner is well ahead on both lanes: a corner hard by one
    // end would make a quadratic run straight and then snap round.
    if (t0 > 0.3 && t3 > 0.3 && t0 < 3 * t3 && t3 < 3 * t0) {
      // The quadratic through that corner, raised to a cubic.
      move.x1 = start.x + ax * t0 * (2 / 3);
      move.z1 = start.z + az * t0 * (2 / 3);
      move.x2 = end.x - bx * t3 * (2 / 3);
      move.z2 = end.z - bz * t3 * (2 / 3);
      quadratic = true;
    }
  }
  if (!quadratic) {
    // Straight on, a jog between offset lanes, a lopsided corner, or lanes
    // that do not meet ahead: leave and arrive along each lane with handles
    // that would draw a circular arc through this turn over this chord, so
    // the bend is spread along the whole curve.
    const chord = Math.hypot(rx, rz);
    const theta = Math.acos(Math.max(-1, Math.min(1, ax * bx + az * bz)));
    let handle = chord / 3;
    if (theta > 0.09) {
      const radius = chord / (2 * Math.sin(theta / 2));
      handle = Math.min(chord, ((4 / 3) * Math.tan(theta / 4) * radius));
    }
    move.x1 = start.x + ax * handle;
    move.z1 = start.z + az * handle;
    move.x2 = end.x - bx * handle;
    move.z2 = end.z - bz * handle;
  }

  const arc = new Float64Array(ARC_STEPS + 1);
  const pose: PathPose = { x: 0, z: 0, angle: 0, curvature: 0 };
  bezier(move, 0, pose);
  let px = pose.x;
  let pz = pose.z;
  let sharpest = Math.abs(pose.curvature);
  for (let i = 1; i <= ARC_STEPS; i++) {
    bezier(move, i / ARC_STEPS, pose);
    arc[i] = arc[i - 1] + Math.hypot(pose.x - px, pose.z - pz);
    px = pose.x;
    pz = pose.z;
    sharpest = Math.max(sharpest, Math.abs(pose.curvature));
  }
  move.arc = arc;
  move.length = arc[ARC_STEPS];
  move.vmax = sharpest > 1e-6 ? Math.min(CURVE_TOP, Math.sqrt(CORNERING / sharpest)) : CURVE_TOP;
  if (move.length < POINT_MOVE) {
    // Two lanes that simply meet: nothing to drive, and no bend to slow for.
    move.length = 0;
    move.vmax = CURVE_TOP;
  }
  let turn = Math.atan2(bx, bz) - Math.atan2(ax, az);
  while (turn > Math.PI) turn -= 2 * Math.PI;
  while (turn < -Math.PI) turn += 2 * Math.PI;
  move.turn = turn;
}

/** The part of a convex polygon, as `[along, across]` points, with `across` inside `[-limit, limit]`. */
function clipBand(poly: [number, number][], limit: number): [number, number][] {
  let out = poly;
  for (const side of [-1, 1]) {
    const next: [number, number][] = [];
    const inside = (p: [number, number]) => p[1] * side <= limit;
    for (let i = 0; i < out.length; i++) {
      const a = out[i];
      const b = out[(i + 1) % out.length];
      if (inside(a)) next.push(a);
      if (inside(a) !== inside(b)) {
        const k = (side * limit - a[1]) / (b[1] - a[1]);
        next.push([a[0] + (b[0] - a[0]) * k, side * limit]);
      }
    }
    out = next;
  }
  return out;
}

/**
 * How far along road `own` the carriageway of road `other` reaches, from the
 * node they share: the furthest point of the other road that lies across our
 * own carriageway. Both directions point away from the node. Measured by
 * clipping, so an acute fork and an obtuse bend both come out right.
 */
function crossingReach(ownX: number, ownZ: number, ownWidth: number, otherX: number, otherZ: number, otherWidth: number): number {
  const far = 40;
  // The other road's carriageway from the node out, in our frame: along and
  // across (to our right, `(-z, x)`).
  const nx = -otherZ;
  const nz = otherX;
  const corners: [number, number][] = [];
  for (const [r, t] of [
    [0, -1],
    [far, -1],
    [far, 1],
    [0, 1],
  ]) {
    const px = otherX * r + nx * t * (otherWidth / 2);
    const pz = otherZ * r + nz * t * (otherWidth / 2);
    corners.push([px * ownX + pz * ownZ, px * -ownZ + pz * ownX]);
  }
  let reach = 0;
  for (const [along] of clipBand(corners, ownWidth / 2)) if (along > reach) reach = along;
  return reach;
}

class UnionFind {
  parent: number[];
  constructor(size: number) {
    this.parent = Array.from({ length: size }, (_, i) => i);
  }
  find(i: number): number {
    while (this.parent[i] !== i) {
      this.parent[i] = this.parent[this.parent[i]];
      i = this.parent[i];
    }
    return i;
  }
  union(a: number, b: number): void {
    const ra = this.find(a);
    const rb = this.find(b);
    // The lower index is the root, so the result does not depend on call order.
    if (ra < rb) this.parent[rb] = ra;
    else if (rb < ra) this.parent[ra] = rb;
  }
}

const networks = new WeakMap<RoadGraph, Map<number, Network>>();

/**
 * Lane pieces, junction groups and movements for a road graph. Built once per
 * graph and remembered; the conflict matrices fill in as traffic asks.
 */
export function junctionNetwork(graph: RoadGraph, half: number = CAR_HALF_LENGTH): Network {
  let cache = networks.get(graph);
  if (!cache) {
    cache = new Map();
    networks.set(graph, cache);
  }
  const known = cache.get(half);
  if (known) return known;
  const MIN_PIECE = minPiece(half);

  const count = graph.segments.length;
  const drivable = new Uint8Array(count);
  for (let i = 0; i < count; i++) {
    const [a, b] = graph.nodeKeys[i];
    // A segment that starts and ends at one junction is a sliver the
    // generator left where two ends nearly met: nobody drives it.
    drivable[i] = a !== b && graph.lengths[i] > 0.5 ? 1 : 0;
  }

  // Nodes, and the drivable segment ends at each.
  const nodeKeys = [...graph.byNode.keys()];
  const nodeIndex = new Map(nodeKeys.map((key, i) => [key, i]));
  const endsAt: number[][] = nodeKeys.map(() => []);
  for (let i = 0; i < count; i++) {
    if (!drivable[i]) continue;
    endsAt[nodeIndex.get(graph.nodeKeys[i][0]) as number].push(i * 2);
    endsAt[nodeIndex.get(graph.nodeKeys[i][1]) as number].push(i * 2 + 1);
  }
  const nodeOfEnd = (end: number) => nodeIndex.get(graph.nodeKeys[end >> 1][end & 1]) as number;

  /** Unit direction of a segment pointing away from the given end. */
  const away = (end: number): [number, number] => {
    const road = graph.segments[end >> 1];
    const len = graph.lengths[end >> 1] || 1;
    const dx = (road.to[0] - road.from[0]) / len;
    const dz = (road.to[2] - road.from[2]) / len;
    return (end & 1) === 0 ? [dx, dz] : [-dx, -dz];
  };

  // -- Setbacks ------------------------------------------------------------
  const setback = new Float64Array(count * 2);
  endsAt.forEach((ends) => {
    for (const end of ends) {
      const own = graph.segments[end >> 1];
      const [ox, oz] = away(end);
      const others = ends.filter((e) => e !== end);
      let b = 0;
      if (others.length === 1) {
        const other = graph.segments[others[0] >> 1];
        const [px, pz] = away(others[0]);
        // How far the road turns from straight on.
        const deviation = Math.PI - Math.acos(Math.max(-1, Math.min(1, ox * px + oz * pz)));
        if (deviation < (1 * Math.PI) / 180) {
          // A straight split; ease across any change of width.
          b = 3 * Math.abs(laneOffset(own.width) - laneOffset(other.width));
        } else if (deviation < CORNER_ANGLE) {
          b = Math.min(BEND_MAX, BEND_RADIUS * Math.tan(deviation / 2));
        } else {
          b = CORNER_BOX * Math.max(own.width, other.width);
        }
        // A bend is taken tighter rather than swallow the lanes either side:
        // a village lane that wanders through bend after bend would
        // otherwise become one long junction.
        const room = (Math.min(graph.lengths[end >> 1], graph.lengths[others[0] >> 1]) - MIN_PIECE) / 2;
        b = Math.min(b, Math.max(room, BEND_MIN));
      } else if (others.length > 1) {
        for (const other of others) {
          const [px, pz] = away(other);
          b = Math.max(b, crossingReach(ox, oz, own.width, px, pz, graph.segments[other >> 1].width) + BOX_MARGIN);
          // Room for the tightest right turn into or out of that road.
          b = Math.max(b, laneOffset(graph.segments[other >> 1].width) + 0.6);
        }
      }
      setback[end] = Math.min(b, BOX_MAX);
    }
  });

  // Build; widen any box a movement spills out of, onto where a car may
  // stand or queue in another lane; build again.
  /** Segments found too short to wait on once their boxes are measured: folded into one box. */
  const folded = new Set<number>();
  const assemble = (): Network => {
    // -- Groups --------------------------------------------------------------
    const nodes = new UnionFind(nodeKeys.length);
    const dead = (node: number) => endsAt[node].length === 1;
    for (let i = 0; i < count; i++) {
      if (!drivable[i]) continue;
      const a = nodeOfEnd(i * 2);
      const b = nodeOfEnd(i * 2 + 1);
      const piece = graph.lengths[i] - setback[i * 2] - setback[i * 2 + 1];
      if (dead(a) && dead(b)) continue;
      if (dead(a) || dead(b)) {
        if (piece < DEAD_END_ROOM) nodes.union(a, b);
      } else if (piece < MIN_PIECE || folded.has(i)) {
        nodes.union(a, b);
      }
    }

    const groups: Group[] = [];
    const groupOfRoot = new Map<number, number>();
    const members = new Map<number, number>();
    nodeKeys.forEach((_, node) => {
      const root = nodes.find(node);
      members.set(root, (members.get(root) ?? 0) + 1);
    });
    const nodeGroup = nodeKeys.map((_, node) => {
      if (endsAt[node].length === 0) return -1;
      const root = nodes.find(node);
      // A lone dead end is no junction.
      if (dead(node) && members.get(root) === 1) return -1;
      let g = groupOfRoot.get(root);
      if (g === undefined) {
        g = groups.length;
        groupOfRoot.set(root, g);
        groups.push({ nodes: [], moves: [], conflicts: new Int8Array(0), segments: [], x: 0, z: 0 });
      }
      groups[g].nodes.push(nodeKeys[node]);
      return g;
    });

    const endGroup = new Int32Array(count * 2).fill(-1);
    const inner = new Uint8Array(count);
    for (let i = 0; i < count; i++) {
      if (!drivable[i]) continue;
      endGroup[i * 2] = nodeGroup[nodeOfEnd(i * 2)];
      endGroup[i * 2 + 1] = nodeGroup[nodeOfEnd(i * 2 + 1)];
      if (endGroup[i * 2] >= 0 && endGroup[i * 2] === endGroup[i * 2 + 1]) inner[i] = 1;
    }

    // Box centres and the segments around each box.
    groups.forEach((group) => {
      let sx = 0;
      let sz = 0;
      let n = 0;
      const seen = new Set<number>();
      for (const key of group.nodes) {
        for (const end of endsAt[nodeIndex.get(key) as number]) {
          const road = graph.segments[end >> 1];
          const p = (end & 1) === 0 ? road.from : road.to;
          sx += p[0];
          sz += p[2];
          n++;
          seen.add(end >> 1);
        }
      }
      group.x = n > 0 ? sx / n : 0;
      group.z = n > 0 ? sz / n : 0;
      group.segments = [...seen].sort((a, b) => a - b);
    });

    // -- Lanes ---------------------------------------------------------------
    const lanes = count * 2;
    const laneOffsets = new Float64Array(lanes);
    const pieceStart = new Float64Array(lanes);
    const pieceEnd = new Float64Array(lanes);
    const usable = new Uint8Array(lanes);
    const frame = new Float64Array(lanes * 4);
    for (let lane = 0; lane < lanes; lane++) {
      const segment = laneSegment(lane);
      const road = graph.segments[segment];
      const forward = laneForward(lane);
      const sx = forward ? road.from[0] : road.to[0];
      const sz = forward ? road.from[2] : road.to[2];
      const len = graph.lengths[segment] || 1;
      frame[lane * 4] = sx;
      frame[lane * 4 + 1] = sz;
      frame[lane * 4 + 2] = ((forward ? road.to[0] : road.from[0]) - sx) / len;
      frame[lane * 4 + 3] = ((forward ? road.to[2] : road.from[2]) - sz) / len;
      laneOffsets[lane] = laneOffset(graph.segments[segment].width);
      pieceStart[lane] = setback[laneStartEnd(lane)];
      pieceEnd[lane] = graph.lengths[segment] - setback[laneFinishEnd(lane)];
      usable[lane] = drivable[segment] && !inner[segment] && pieceEnd[lane] - pieceStart[lane] > 0.5 ? 1 : 0;
    }

    const network: Network = {
      graph,
      half,
      drivable,
      inner,
      setback,
      endGroup,
      lane: laneOffsets,
      frame,
      pieceStart,
      pieceEnd,
      stopLine: Float64Array.from(pieceEnd, (end) => end - STOP_BACK),
      usable,
      groups,
      moves: [],
      movesFrom: Array.from({ length: lanes }, () => []),
      movesInto: Array.from({ length: lanes }, () => []),
    };

    // -- Movements -----------------------------------------------------------
    groups.forEach((group, g) => {
      const entries: number[] = [];
      const exits: number[] = [];
      for (const key of group.nodes) {
        for (const end of endsAt[nodeIndex.get(key) as number]) {
          const segment = end >> 1;
          if (inner[segment]) continue;
          const atFrom = (end & 1) === 0;
          // In along the lane that finishes here, out along the one that starts here.
          const into = laneOf(segment, !atFrom);
          const out = laneOf(segment, atFrom);
          if (usable[into]) entries.push(into);
          if (usable[out]) exits.push(out);
        }
      }
      for (const from of entries) {
        const ax = frame[from * 4 + 2];
        const az = frame[from * 4 + 3];
        for (const to of exits) {
          if (laneSegment(to) === laneSegment(from)) continue;
          if (ax * frame[to * 4 + 2] + az * frame[to * 4 + 3] < REVERSAL) continue;
          const move: Move = {
            group: g,
            slot: group.moves.length,
            from,
            to,
            x0: 0,
            z0: 0,
            x1: 0,
            z1: 0,
            x2: 0,
            z2: 0,
            x3: 0,
            z3: 0,
            length: 0,
            arc: new Float64Array(0),
            vmax: CURVE_TOP,
            turn: 0,
            spills: [],
          };
          fitMove(network, move);
          const id = network.moves.length;
          network.moves.push(move);
          group.moves.push(id);
          network.movesFrom[from].push(id);
          network.movesInto[to].push(id);
        }
      }
      group.conflicts = new Int8Array(group.moves.length * group.moves.length);
    });

    return network;
  };
  let network = assemble();
  for (let pass = 0; pass < FOLD_PASSES; pass++) {
    for (let round = 0; round < WIDEN_ROUNDS; round++) {
      if (!widenSpills(network)) break;
      network = assemble();
    }
    measureSpills(network);
    // A lane whose stop line has come back so far that no car fits between
    // the two boxes cannot be waited on: its junctions become one box.
    let more = false;
    for (let lane = 0; lane < network.usable.length; lane++) {
      if (!network.usable[lane] || network.endGroup[laneStartEnd(lane)] < 0) continue;
      if (network.stopLine[lane] - network.pieceStart[lane] >= 2 * half + RELEASE_GAP) continue;
      folded.add(laneSegment(lane));
      more = true;
    }
    if (!more) break;
    network = assemble();
  }

  cache.set(half, network);
  return network;
}

/**
 * What no box could be widened to hold, the traffic keeps clear instead:
 * each movement's spills onto other lanes of its junction, and the stop line
 * on every lane into the box pulled back clear of them.
 */
function measureSpills(network: Network): void {
  for (const group of network.groups) {
    for (const move of group.moves) {
      const m = network.moves[move];
      for (const segment of group.segments) {
        for (const lane of [laneOf(segment, true), laneOf(segment, false)]) {
          if (lane === m.from || lane === m.to || !network.usable[lane]) continue;
          if (!spillsOnto(network, move, lane)) continue;
          const [lo, hi] = spillInterval(network, move, lane);
          m.spills.push(lane, lo, hi);
          // A lane into the box waits clear of it; one out of it is kept
          // clear by the traffic when the movement is granted.
          if (network.endGroup[laneFinishEnd(lane)] === m.group) {
            network.stopLine[lane] = Math.min(network.stopLine[lane], lo - network.half - SPILL_MARGIN);
          }
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Conflicts
// ---------------------------------------------------------------------------

const poseA: PathPose = { x: 0, z: 0, angle: 0, curvature: 0 };
const poseB: PathPose = { x: 0, z: 0, angle: 0, curvature: 0 };

/**
 * Where on `lane` a car may stand outside any junction box: from just past
 * the box it comes out of (a car that has let go of it) to its stop line (a
 * car waiting to go in), as `[lo, hi]` world units along it.
 */
export function standingZone(network: Network, lane: number): [number, number] {
  return [network.pieceStart[lane] + RELEASE_GAP, network.pieceEnd[lane] - STOP_BACK];
}

/**
 * Whether a bus driving `move`, nose-in to tail-out, would touch a car
 * anywhere it may stand on `lane`.
 */
export function spillsOnto(network: Network, move: number, lane: number): boolean {
  const [lo, hi] = standingZone(network, lane);
  if (hi <= lo) return false;
  const zone = lanePoint(network, lane, (lo + hi) / 2, poseB);
  const zx = zone.x;
  const zz = zone.z;
  const zAngle = zone.angle;
  const m = network.moves[move];
  const half = network.half + SWEEP_MARGIN;
  const width = CAR_HALF_WIDTH + SWEEP_MARGIN;
  const steps = Math.ceil((m.length + 2 * half) / SWEEP_STEP);
  for (let i = 0; i <= steps; i++) {
    sweepPoint(network, move, -half + ((m.length + 2 * half) * i) / steps, poseA);
    if (bodiesOverlap(poseA.x, poseA.z, poseA.angle, half, width, zx, zz, zAngle, (hi - lo) / 2, CAR_HALF_WIDTH)) {
      return true;
    }
  }
  return false;
}

/**
 * Every movement must stay inside its junction box: it may touch the lanes it
 * leaves and joins, where cars follow one another, but no other lane where a
 * car could be standing. Where one spills, the box grows along that lane.
 * Returns whether anything grew.
 */
function widenSpills(network: Network): boolean {
  const { setback, endGroup, graph } = network;
  const grow = new Set<number>();
  network.groups.forEach((group, g) => {
    for (const move of group.moves) {
      const m = network.moves[move];
      for (const segment of group.segments) {
        for (const lane of [laneOf(segment, true), laneOf(segment, false)]) {
          if (lane === m.from || lane === m.to || !network.usable[lane]) continue;
          if (!spillsOnto(network, move, lane)) continue;
          const finish = laneFinishEnd(lane);
          const start = laneStartEnd(lane);
          if (endGroup[finish] === g) grow.add(finish);
          else if (endGroup[start] === g) grow.add(start);
        }
      }
    }
  });
  let grew = false;
  for (const end of grow) {
    if (setback[end] >= WIDEN_MAX) continue;
    // Never so far that the lane is too short to stand on: that would fold
    // the next junction into this one, and a village of bends into one box.
    const segment = end >> 1;
    const piece = graph.lengths[segment] - setback[segment * 2] - setback[segment * 2 + 1];
    if (piece - WIDEN_STEP < minPiece(network.half)) continue;
    setback[end] = Math.min(WIDEN_MAX, setback[end] + WIDEN_STEP);
    grew = true;
  }
  return grew;
}

const probe: PathPose = { x: 0, z: 0, angle: 0, curvature: 0 };

/**
 * Where on `lane` a bus standing there would be touched by one driving
 * `move`: `[lo, hi]`, the range of its centre along the lane, found by
 * stepping along the lane's standing zone.
 */
export function spillInterval(network: Network, move: number, lane: number): [number, number] {
  const [zoneLo, zoneHi] = standingZone(network, lane);
  const m = network.moves[move];
  const half = network.half + SWEEP_MARGIN;
  const width = CAR_HALF_WIDTH + SWEEP_MARGIN;
  const steps = Math.ceil((m.length + 2 * half) / SWEEP_STEP);
  let lo = Infinity;
  let hi = -Infinity;
  const first = zoneLo + network.half;
  const last = Math.max(first, zoneHi - network.half);
  const count = Math.max(1, Math.ceil((last - first) / 0.25));
  for (let k = 0; k <= count; k++) {
    const along = first + ((last - first) * k) / count;
    lanePoint(network, lane, along, probe);
    for (let i = 0; i <= steps; i++) {
      sweepPoint(network, move, -half + ((m.length + 2 * half) * i) / steps, poseA);
      if (bodiesOverlap(poseA.x, poseA.z, poseA.angle, half, width, probe.x, probe.z, probe.angle, network.half, CAR_HALF_WIDTH)) {
        if (along < lo) lo = along;
        if (along > hi) hi = along;
        break;
      }
    }
  }
  if (lo > hi) {
    // Only the ends of the zone are touched, short of any whole bus: take it all.
    lo = first;
    hi = last;
  }
  return [lo, hi];
}

/** Whether `move` spills onto `lane` anywhere. */
function spillsOn(m: Move, lane: number): boolean {
  for (let i = 0; i < m.spills.length; i += 3) if (m.spills[i] === lane) return true;
  return false;
}

/** Half the extent of a rectangle projected on the axis `(px, pz)`. */
function extent(fx: number, fz: number, halfLength: number, halfWidth: number, px: number, pz: number): number {
  return halfLength * Math.abs(fx * px + fz * pz) + halfWidth * Math.abs(-fz * px + fx * pz);
}

/** Whether two oriented rectangles overlap: a separating-axis test on their four axes. */
export function bodiesOverlap(
  ax: number,
  az: number,
  aAngle: number,
  aHalfLength: number,
  aHalfWidth: number,
  bx: number,
  bz: number,
  bAngle: number,
  bHalfLength: number,
  bHalfWidth: number,
): boolean {
  const dx = bx - ax;
  const dz = bz - az;
  const reach = Math.hypot(aHalfLength, aHalfWidth) + Math.hypot(bHalfLength, bHalfWidth);
  if (dx * dx + dz * dz >= reach * reach) return false;
  // Forward is (sin, cos) for a `rotation.y`; across is forward turned a quarter.
  const afx = Math.sin(aAngle);
  const afz = Math.cos(aAngle);
  const bfx = Math.sin(bAngle);
  const bfz = Math.cos(bAngle);
  for (let axis = 0; axis < 4; axis++) {
    const fx = axis < 2 ? afx : bfx;
    const fz = axis < 2 ? afz : bfz;
    const px = axis % 2 === 0 ? fx : -fz;
    const pz = axis % 2 === 0 ? fz : fx;
    const gap = Math.abs(dx * px + dz * pz);
    if (gap >= extent(afx, afz, aHalfLength, aHalfWidth, px, pz) + extent(bfx, bfz, bHalfLength, bHalfWidth, px, pz)) {
      return false;
    }
  }
  return true;
}

/**
 * Whether a car on move `a` and a car on move `b` can both be in the box at
 * once. The same movement is always compatible: one car simply follows the
 * other. Two out of the same lane never are, because the one behind would be
 * steering round the one in front. Otherwise the bus's body is swept along
 * both, from nose-in to tail-out, and any contact is a conflict.
 */
export function movesConflict(network: Network, a: number, b: number): boolean {
  if (a === b) return false;
  const ma = network.moves[a];
  const mb = network.moves[b];
  if (ma.group !== mb.group) return false;
  if (ma.from === mb.from) return true;
  const group = network.groups[ma.group];
  const n = group.moves.length;
  const cell = ma.slot * n + mb.slot;
  const known = group.conflicts[cell];
  if (known !== 0) return known === 2;
  // Spilling onto the lane the other comes from or goes to is a conflict too.
  if (spillsOn(ma, mb.from) || spillsOn(ma, mb.to) || spillsOn(mb, ma.from) || spillsOn(mb, ma.to)) {
    group.conflicts[cell] = 2;
    group.conflicts[mb.slot * n + ma.slot] = 2;
    return true;
  }

  const half = network.half + SWEEP_MARGIN;
  const width = CAR_HALF_WIDTH + SWEEP_MARGIN;
  let clash = false;
  const stepsA = Math.ceil((ma.length + 2 * half) / SWEEP_STEP);
  const stepsB = Math.ceil((mb.length + 2 * half) / SWEEP_STEP);
  outer: for (let i = 0; i <= stepsA; i++) {
    sweepPoint(network, a, -half + ((ma.length + 2 * half) * i) / stepsA, poseA);
    for (let j = 0; j <= stepsB; j++) {
      sweepPoint(network, b, -half + ((mb.length + 2 * half) * j) / stepsB, poseB);
      if (bodiesOverlap(poseA.x, poseA.z, poseA.angle, half, width, poseB.x, poseB.z, poseB.angle, half, width)) {
        clash = true;
        break outer;
      }
    }
  }
  group.conflicts[cell] = clash ? 2 : 1;
  group.conflicts[mb.slot * n + ma.slot] = clash ? 2 : 1;
  return clash;
}

