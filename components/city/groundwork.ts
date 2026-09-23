/**
 * Where the pavement goes (PLAN.md sections 36, 4 and 76.5).
 *
 * The generator hands the renderer road centrelines and nothing else, so
 * everything that makes a road look like a street -- the raised slab either
 * side, the zebra bands at the junctions, the dashed centre line of an avenue
 * -- has to be derived from those lines. The maths is here, pure and unit
 * tested; `Roads.tsx` only turns it into instance matrices, and `Environment`
 * only turns the plaza into a slab.
 *
 * FRAME. Every piece is described in its road's own frame: `s` runs from the
 * road's `from` end towards its `to` end, and `lateral` runs to the right of
 * that direction. `Roads.tsx` converts with
 *
 *     world = from + direction * s + right * lateral,   right = (dz, -dx)
 *
 * which is the same convention as the `atan2(dx, dz)` rotation the
 * carriageways already use. Keeping `s` explicit is what lets the reveal work:
 * a road draws itself in from its `from` end, so a piece at `s` appears when
 * the growing front has passed it (PLAN.md section 43).
 *
 * ROAD STYLES (PLAN.md 76.3 and 76.5). A segment's `kind` picks how it is
 * dressed, and a city's roads are all `"street"`, so a city draws exactly as
 * it did before settlements existed:
 *
 *   - street    carriageway, kerbed pavements, zebra bands, a dashed centre
 *               line on the major roads. Today's city, and the fork highways.
 *   - lane      a village lane: narrow, no pavements, no crossings, a soft
 *               gravel verge instead of a kerb.
 *   - avenue    a metropolis dual carriageway: pavements, and a planted
 *               median with trees instead of the centre line.
 *   - motorway  a highway at least `MOTORWAY_MIN_WIDTH` wide (the metropolis
 *               ring): no pavements, a hard shoulder, edge lines and a
 *               central barrier.
 *
 * ANGLED ROADS. The village is the first settlement whose roads are not
 * axis-aligned, and whose roads bend. Nothing here assumes a grid: every
 * offset is taken along a segment's own direction, and where two segments
 * meet at a shallow bend the pavements are mitred and a joint disc fills the
 * wedge the two carriageway ends leave open (PLAN.md 76.15).
 */

import type { CityModel, RoadSegment } from "@/types/city";

/** Width of the raised slab either side of a carriageway. */
export const SIDEWALK_WIDTH = 1.2;
/** Height of that slab above the road surface: the kerb step. */
export const SIDEWALK_HEIGHT = 0.19;

/** Width of the darker kerb stone between the carriageway and the pavement. */
export const CURB_WIDTH = 0.3;

/**
 * How the pavement's band is cut between the kerb stone and the paving slab,
 * as offsets from the road's centreline on one `side` (+1 or -1) and widths.
 *
 * The two sit side by side and flush, and never overlap. The kerb used to be
 * a box laid over the slab's inner edge, a hair taller: the two tops were
 * five thousandths apart and the kerb face was the slab's face, so at the
 * overview the depth buffer could not tell them apart and every kerb broke
 * up into a dashed line.
 */
export function pavementCut(roadWidth: number, side: number): {
  kerbLateral: number;
  slabLateral: number;
  slabWidth: number;
} {
  const edge = roadWidth / 2;
  return {
    kerbLateral: (edge + CURB_WIDTH / 2) * side,
    slabLateral: (edge + CURB_WIDTH + (SIDEWALK_WIDTH - CURB_WIDTH) / 2) * side,
    slabWidth: SIDEWALK_WIDTH - CURB_WIDTH,
  };
}

/**
 * How far an avenue median's planted bed stands above its kerb. A clear
 * step, not a hair: the bed used to sit six thousandths over the kerb box it
 * lies in, and flickered against it from any distance.
 */
export const MEDIAN_BED_LIFT = 0.03;
/** How far the bed stops short of the median's rounded ends. */
export const MEDIAN_BED_INSET = 0.16;

/**
 * Gap left in the pavement at each end of a segment. Segments are split at
 * junctions, so both ends are corners: without this the four slabs meeting
 * there overlap into a lumpy cross, and there is nowhere to paint a crossing.
 * Slightly more than half of the widest carriageway (7 units).
 */
export const JUNCTION_INSET = 4.2;

/**
 * The widest road the city's junction constants were tuned for: the 8.4 unit
 * fork highway. A metropolis avenue (9.5) or ring (10) is wider, and a street
 * crossing one keeps its zebra and its pavement clear of the wider road's
 * carriageway instead (`junctionClearance`).
 */
export const TUNED_WIDTH = 8.4;

/** A highway this wide or wider is a motorway: no pavements, a barrier. */
export const MOTORWAY_MIN_WIDTH = 9.5;

/**
 * The sharpest bend that is still a bend. Past this a degree-2 node is a
 * corner -- the city's ring road turns through 90 degrees -- and keeps the
 * inset and the open corner it has always had.
 */
export const BEND_LIMIT = (60 * Math.PI) / 180;
/** Below this a degree-2 node is a straight split, with nothing to fill. */
const STRAIGHT = (0.5 * Math.PI) / 180;

/** Distance from the junction to the middle of the zebra band. */
const CROSSWALK_AT = 2.3;
const CROSSWALK_ALONG = 1.9;
const STRIPE_ACROSS = 0.42;

/** Dash and gap on the centre line of a major road. */
const DASH_ALONG = 2.8;
const DASH_GAP = 2.8;
const DASH_ACROSS = 0.4;

/** The planted strip down the middle of an avenue. */
export const MEDIAN_WIDTH = 1.6;
/** Median trees: one every this many units, and never more than the cap. */
const MEDIAN_TREE_PITCH = 8;
/** Clear of the nose of the median, so a crown never overhangs a crossing. */
const MEDIAN_TREE_END = 2.4;

/** The soft gravel edge of a lane, and the hard shoulder of a motorway. */
export const VERGE_WIDTH = 0.7;
/** Motorway edge lines: in from the edge, and their width. */
const EDGE_LINE_IN = 0.55;
const EDGE_LINE_ACROSS = 0.22;

export type RoadStyle = "street" | "lane" | "avenue" | "motorway";

/** How a segment is dressed. Unknown kinds draw as a street (types/city.ts). */
export function roadStyle(road: Pick<RoadSegment, "kind" | "width">): RoadStyle {
  switch (road.kind) {
    case "lane":
      return "lane";
    case "avenue":
      return "avenue";
    case "highway":
      return road.width >= MOTORWAY_MIN_WIDTH ? "motorway" : "street";
    default:
      return "street";
  }
}

/** Streets and avenues have kerbed pavements; lanes and motorways do not. */
export const hasPavement = (style: RoadStyle): boolean => style === "street" || style === "avenue";

export interface RoadLay {
  /** The `from` end, which is where the reveal grows from. */
  x: number;
  z: number;
  /** The `to` end, exactly as the model gives it (node matching reads it). */
  toX: number;
  toZ: number;
  /** Unit direction towards `to`. */
  dx: number;
  dz: number;
  length: number;
  /** Rotation about y that maps local +z onto the road direction. */
  angle: number;
  width: number;
  major: boolean;
  appearAt: number;
  style: RoadStyle;
}

export function roadLays(roads: readonly RoadSegment[]): RoadLay[] {
  return roads.map((road) => {
    const dx = road.to[0] - road.from[0];
    const dz = road.to[2] - road.from[2];
    const length = Math.hypot(dx, dz) || 0.001;
    return {
      x: road.from[0],
      z: road.from[2],
      toX: road.to[0],
      toZ: road.to[2],
      dx: dx / length,
      dz: dz / length,
      length,
      angle: Math.atan2(dx, dz),
      width: Math.max(road.width, 1),
      major: road.major,
      // The generator times the whole reveal (PLAN.md section 43).
      appearAt: road.appearAt,
      style: roadStyle(road),
    };
  });
}

// ---------------------------------------------------------------------------
// Nodes: which segment ends meet where
// ---------------------------------------------------------------------------

/** One segment end at a node, pointing away from the node along its road. */
export interface Arm {
  road: number;
  /** The node is this road's `from` end. */
  atStart: boolean;
  /** Unit vector from the node along the road. */
  ux: number;
  uz: number;
}

export interface RoadNode {
  x: number;
  z: number;
  arms: Arm[];
}

export interface RoadNodes {
  nodes: RoadNode[];
  /** Per lay, the node index at its `from` end and at its `to` end. */
  ends: [number, number][];
}

/** Quarter-unit grid, the same tolerance the generator's graph uses. */
const nodeKey = (x: number, z: number) => `${Math.round(x * 4)}:${Math.round(z * 4)}`;

export function roadNodes(lays: readonly RoadLay[]): RoadNodes {
  const index = new Map<string, number>();
  const nodes: RoadNode[] = [];
  const at = (x: number, z: number): number => {
    const key = nodeKey(x, z);
    let n = index.get(key);
    if (n === undefined) {
      n = nodes.length;
      nodes.push({ x, z, arms: [] });
      index.set(key, n);
    }
    return n;
  };
  const ends = lays.map((lay, road): [number, number] => {
    const a = at(lay.x, lay.z);
    nodes[a].arms.push({ road, atStart: true, ux: lay.dx, uz: lay.dz });
    const b = at(lay.toX, lay.toZ);
    nodes[b].arms.push({ road, atStart: false, ux: -lay.dx, uz: -lay.dz });
    return [a, b];
  });
  return { nodes, ends };
}

/** How far a degree-2 node turns: 0 for straight on, PI/2 for a corner. */
export function bendAngle(a: Arm, b: Arm): number {
  const dot = a.ux * b.ux + a.uz * b.uz;
  return Math.PI - Math.acos(Math.max(-1, Math.min(1, dot)));
}

/** The other arms at the node at one end of a lay. */
function othersAt(topology: RoadNodes, road: number, atStart: boolean): Arm[] {
  const node = topology.nodes[topology.ends[road][atStart ? 0 : 1]];
  return node.arms.filter((arm) => !(arm.road === road && arm.atStart === atStart));
}

/** The shallow bend at this end, if that is what the node is. */
function bendAt(
  lays: readonly RoadLay[],
  topology: RoadNodes,
  road: number,
  atStart: boolean,
): { other: Arm; angle: number; self: Arm } | null {
  const others = othersAt(topology, road, atStart);
  if (others.length !== 1) return null;
  const node = topology.nodes[topology.ends[road][atStart ? 0 : 1]];
  const self = node.arms.find((arm) => arm.road === road && arm.atStart === atStart)!;
  const angle = bendAngle(self, others[0]);
  if (angle > BEND_LIMIT) return null;
  // Only a road bending into more of itself: a street that turns into a lane
  // is an end of the street, not a bend in it.
  const mine = lays[road];
  const theirs = lays[others[0].road];
  if (mine.style !== theirs.style || Math.abs(mine.width - theirs.width) > 0.05) return null;
  return { other: others[0], angle, self };
}

/**
 * Where a strip at `lateral` should stop at a shallow bend so it meets the
 * other road's strip on the mitre line. Positive is back from the node on the
 * inside of the bend; negative runs past the node on the outside.
 */
function mitre(lay: RoadLay, bend: { other: Arm; angle: number }, lateral: number): number {
  // The strip's offset from the centre line, in world space: right * lateral.
  const ox = lay.dz * lateral;
  const oz = -lay.dx * lateral;
  const inner = ox * bend.other.ux + oz * bend.other.uz > 0;
  const reach = Math.abs(lateral) * Math.tan(bend.angle / 2);
  return inner ? reach : -reach;
}

/**
 * The widest road crossing this arm at its node. The same road running
 * straight on past the junction does not cross it, so it does not count.
 */
function widestCrossing(
  lays: readonly RoadLay[],
  topology: RoadNodes,
  road: number,
  atStart: boolean,
): number {
  const node = topology.nodes[topology.ends[road][atStart ? 0 : 1]];
  const self = node.arms.find((arm) => arm.road === road && arm.atStart === atStart)!;
  let widest = 0;
  for (const arm of node.arms) {
    if (arm === self || arm.ux * self.ux + arm.uz * self.uz < -0.95) continue;
    widest = Math.max(widest, lays[arm.road].width);
  }
  return widest;
}

/**
 * Where a junction's zebra band is centred and where the pavement stops,
 * measured back from the node along the arm being crossed.
 *
 * Up to the widest road the city has, these are the city's own numbers, so a
 * city is unchanged. A metropolis avenue or motorway is wider than the city's
 * junction constants were drawn for: there the band moves out of the
 * junction box, just clear of the wider road's carriageway, and the pavement
 * stops the same distance beyond it as the city's does.
 */
export function junctionClearance(widest: number): { crossing: number; pavement: number } {
  if (widest <= TUNED_WIDTH) return { crossing: CROSSWALK_AT, pavement: JUNCTION_INSET };
  const crossing = widest / 2 + 0.35 + CROSSWALK_ALONG / 2;
  return { crossing, pavement: crossing + CROSSWALK_ALONG / 2 + 0.95 };
}

// ---------------------------------------------------------------------------
// Pavements
// ---------------------------------------------------------------------------

/** A strip laid along a road: grows with it, from `start` to `start + along`. */
export interface SidewalkLay {
  /** Index into the `RoadLay[]` this was derived from. */
  road: number;
  lateral: number;
  start: number;
  along: number;
}

/**
 * Where a pavement stops at one end of its segment. At a junction, a corner or
 * an open end it stops `JUNCTION_INSET` short, as it always has; at a shallow
 * bend it runs on to the mitre and meets the next segment's slab.
 */
function pavementInset(
  lays: readonly RoadLay[],
  topology: RoadNodes,
  road: number,
  atStart: boolean,
  lateral: number,
): number {
  const bend = bendAt(lays, topology, road, atStart);
  if (bend && hasPavement(lays[bend.other.road].style)) {
    // `mitre` is measured along the outward arm; for the start end that is +s.
    return mitre(lays[road], bend, lateral);
  }
  return junctionClearance(widestCrossing(lays, topology, road, atStart)).pavement;
}

/**
 * Two slabs per segment that has pavements, inset from both junctions.
 * Segments shorter than the two insets plus a stride get none: a two-unit
 * stub of pavement between two crossings reads as litter.
 */
export function sidewalkLays(lays: readonly RoadLay[], topology = roadNodes(lays)): SidewalkLay[] {
  const out: SidewalkLay[] = [];
  lays.forEach((lay, road) => {
    if (!hasPavement(lay.style)) return;
    const lateral = lay.width / 2 + SIDEWALK_WIDTH / 2;
    for (const side of [lateral, -lateral]) {
      const start = pavementInset(lays, topology, road, true, side);
      const end = pavementInset(lays, topology, road, false, side);
      const along = lay.length - start - end;
      if (along < 3) continue;
      out.push({ road, lateral: side, start, along });
    }
  });
  return out;
}

// ---------------------------------------------------------------------------
// Paint
// ---------------------------------------------------------------------------

/** A painted mark: appears whole once the road's front has passed it. */
export interface MarkLay {
  road: number;
  /** Centre of the mark along the road. */
  s: number;
  lateral: number;
  along: number;
  across: number;
}

/** Arms a pedestrian crosses: streets and avenues. Lanes and motorways are not. */
const crossable = (style: RoadStyle) => style === "street" || style === "avenue";

/**
 * Zebra bands at both ends of every segment that meets a junction, which is
 * three or more street or avenue ends at the same point. A lane joining the
 * village main street is a farm track, not a crossroads, and nobody paints a
 * zebra across a motorway.
 *
 * Deliberately small marks: four stripes on an avenue and three on a side
 * street, less than two units long. A town whose roads are mostly junction to
 * junction ends up with a band every few units, and at full size they were
 * the first thing the eye found in the frame instead of the buildings.
 */
export function crosswalkLays(
  lays: readonly RoadLay[],
  _roads?: readonly RoadSegment[],
  topology = roadNodes(lays),
): MarkLay[] {
  const out: MarkLay[] = [];
  lays.forEach((lay, road) => {
    if (!crossable(lay.style)) return;
    // Both bands plus room to breathe between them, or the segment is a
    // junction-to-junction stub and one band covers it.
    if (lay.length < CROSSWALK_AT * 2 + CROSSWALK_ALONG * 2 + 2) return;
    // A dual carriageway is half as wide again: more stripes at the same pitch.
    const stripes = lay.style === "avenue" ? 6 : lay.major ? 4 : 3;
    const pitch = (lay.width * 0.78) / stripes;

    for (const atStart of [true, false]) {
      const node = topology.nodes[topology.ends[road][atStart ? 0 : 1]];
      // Three arms or more is a junction. Two is the same avenue continuing
      // past a split, and painting a crossing there stripes the open road.
      const walkable = node.arms.filter((arm) => crossable(lays[arm.road].style)).length;
      if (walkable < 3) continue;
      const back = junctionClearance(widestCrossing(lays, topology, road, atStart)).crossing;
      const s = atStart ? back : lay.length - back;
      for (let i = 0; i < stripes; i++) {
        out.push({
          road,
          s,
          lateral: (i - (stripes - 1) / 2) * pitch,
          along: CROSSWALK_ALONG,
          across: STRIPE_ACROSS,
        });
      }
    }
  });
  return out;
}

/**
 * The dashed centre line of a major street. Minor roads keep no centre line at
 * all: at this scale two lanes of hatching on a four-unit lane is noise. An
 * avenue has its median instead, and a motorway its barrier.
 */
export function laneDashLays(lays: readonly RoadLay[], topology = roadNodes(lays)): MarkLay[] {
  const out: MarkLay[] = [];
  const stride = DASH_ALONG + DASH_GAP;
  lays.forEach((lay, road) => {
    if (!lay.major || lay.style !== "street") return;
    // Clear of both crossings, so a dash never lands inside a zebra band; at a
    // shallow bend the line runs on round it instead.
    const clear = (atStart: boolean) =>
      bendAt(lays, topology, road, atStart)
        ? DASH_GAP / 2 + DASH_ALONG / 2
        : junctionClearance(widestCrossing(lays, topology, road, atStart)).pavement + DASH_ALONG;
    const first = clear(true);
    const last = lay.length - clear(false);
    for (let s = first; s <= last; s += stride) {
      out.push({ road, s, lateral: 0, along: DASH_ALONG, across: DASH_ACROSS });
    }
  });
  return out;
}

/**
 * A strip that stops for junctions but runs through bends and corners: the
 * avenue median, the motorway barrier and its edge lines. At a junction it
 * stops `setback(widest)` short, `widest` being the widest road crossing it
 * there; at a bend or a corner of the same road it meets the next segment on
 * the mitre; at an open end it runs out to `openEnd`.
 */
function runInset(
  lays: readonly RoadLay[],
  topology: RoadNodes,
  road: number,
  atStart: boolean,
  lateral: number,
  setback: (widest: number) => number,
  openEnd: number,
): number {
  const others = othersAt(topology, road, atStart);
  if (others.length === 0) return openEnd;
  if (others.length === 1) {
    const other = lays[others[0].road];
    const mine = lays[road];
    if (other.style === mine.style && Math.abs(other.width - mine.width) <= 0.05) {
      const node = topology.nodes[topology.ends[road][atStart ? 0 : 1]];
      const self = node.arms.find((arm) => arm.road === road && arm.atStart === atStart)!;
      const angle = bendAngle(self, others[0]);
      // Up to a right angle: the motorway ring turns its corners this way.
      if (angle <= Math.PI / 2 + 1e-6) {
        return mitre(mine, { other: others[0], angle }, lateral);
      }
    }
  }
  return setback(widestCrossing(lays, topology, road, atStart));
}

/** The median's nose stops just past the pavement's end, clear of the zebra. */
const medianSetback = (widest: number) => junctionClearance(widest).pavement + 0.6;
/** The barrier and edge lines stop where traffic crosses the motorway. */
const motorwaySetback = (widest: number) => Math.max(JUNCTION_INSET, widest / 2 + 0.5);

/** The planted median of every avenue, as a strip down its centre line. */
export function medianLays(lays: readonly RoadLay[], topology = roadNodes(lays)): SidewalkLay[] {
  const out: SidewalkLay[] = [];
  lays.forEach((lay, road) => {
    if (lay.style !== "avenue") return;
    // Short of the zebra band, so the crossing runs across open road.
    const start = runInset(lays, topology, road, true, 0, medianSetback, 2);
    const end = runInset(lays, topology, road, false, 0, medianSetback, 2);
    const along = lay.length - start - end;
    if (along < 4) return;
    out.push({ road, lateral: 0, start, along });
  });
  return out;
}

/** Trees along the medians: evenly pitched, spread thinner if over `cap`. */
export function medianTreeSpots(medians: readonly SidewalkLay[], lays: readonly RoadLay[], cap: number) {
  const usable = medians.map((median) => Math.max(0, median.along - MEDIAN_TREE_END * 2));
  const total = usable.reduce((sum, length) => sum + length, 0);
  if (cap <= 0 || total <= 0) return [];
  const pitch = Math.max(MEDIAN_TREE_PITCH, total / cap);
  const spots: { road: number; s: number; x: number; z: number }[] = [];
  medians.forEach((median, i) => {
    const length = usable[i];
    if (length <= 0) return;
    const count = Math.floor(length / pitch) + 1;
    // Centred in the strip, so both noses keep the same clearance.
    const offset = (length - (count - 1) * pitch) / 2;
    const lay = lays[median.road];
    for (let k = 0; k < count && spots.length < cap; k++) {
      const s = median.start + MEDIAN_TREE_END + offset + k * pitch;
      spots.push({ road: median.road, s, x: lay.x + lay.dx * s, z: lay.z + lay.dz * s });
    }
  });
  return spots;
}

/** The central barrier of every motorway. */
export function barrierLays(lays: readonly RoadLay[], topology = roadNodes(lays)): SidewalkLay[] {
  const out: SidewalkLay[] = [];
  lays.forEach((lay, road) => {
    if (lay.style !== "motorway") return;
    const start = runInset(lays, topology, road, true, 0, motorwaySetback, 0);
    const end = runInset(lays, topology, road, false, 0, motorwaySetback, 0);
    const along = lay.length - start - end;
    if (along < 2) return;
    out.push({ road, lateral: 0, start, along });
  });
  return out;
}

/**
 * The solid edge lines of a motorway, one each side, mitred round its corners
 * so the ring reads as one continuous road.
 */
export function edgeLineLays(lays: readonly RoadLay[], topology = roadNodes(lays)): MarkLay[] {
  const out: MarkLay[] = [];
  lays.forEach((lay, road) => {
    if (lay.style !== "motorway") return;
    const lateral = lay.width / 2 - EDGE_LINE_IN;
    for (const side of [lateral, -lateral]) {
      const start = runInset(lays, topology, road, true, side, motorwaySetback, 0);
      const end = runInset(lays, topology, road, false, side, motorwaySetback, 0);
      const along = lay.length - start - end;
      if (along < 1) continue;
      out.push({ road, s: start + along / 2, lateral: side, along, across: EDGE_LINE_ACROSS });
    }
  });
  return out;
}

// ---------------------------------------------------------------------------
// Verges and joints
// ---------------------------------------------------------------------------

export interface VergeLay extends SidewalkLay {
  style: RoadStyle;
}

/**
 * How far along a strip at `lateral` runs inside another road's band -- its
 * carriageway plus pavements, from the node outwards -- before it comes out:
 * where a verge has to start so that it never lies on somebody else's road.
 * Works at any angle.
 */
function clearOf(lays: readonly RoadLay[], lay: RoadLay, arm: Arm, others: readonly Arm[], lateral: number) {
  // The strip's offset from its own centre line, in world space.
  const ox = lay.dz * lateral;
  const oz = -lay.dx * lateral;
  let reach = 0;
  for (const other of others) {
    const road = lays[other.road];
    const half = road.width / 2 + (hasPavement(road.style) ? SIDEWALK_WIDTH : 0.15);
    // A point `s` along this arm is `u * s + o` from the node. Across the
    // other road it sits at `a * s + b`, along it at `c * s + d`.
    const a = other.ux * arm.uz - other.uz * arm.ux;
    const b = other.ux * oz - other.uz * ox;
    const c = other.ux * arm.ux + other.uz * arm.uz;
    const d = other.ux * ox + other.uz * oz;
    // Inside the band across it...
    let lo = 0;
    let hi = Number.POSITIVE_INFINITY;
    if (Math.abs(a) < 1e-9) {
      if (Math.abs(b) > half) continue;
    } else {
      const r0 = (half - b) / a;
      const r1 = (-half - b) / a;
      lo = Math.max(lo, Math.min(r0, r1));
      hi = Math.min(hi, Math.max(r0, r1));
    }
    // ...and on the road's own side of the node, not on its line extended
    // backwards past the junction.
    if (Math.abs(c) < 1e-9) {
      if (d < -half) continue;
    } else if (c > 0) {
      lo = Math.max(lo, (-half - d) / c);
    } else {
      hi = Math.min(hi, (-half - d) / c);
    }
    if (hi > lo && Number.isFinite(hi)) reach = Math.max(reach, hi);
  }
  return reach;
}

/**
 * The soft verge either side of a lane, and the hard shoulder either side of a
 * motorway. At a shallow bend a verge meets the next one on the mitre; where a
 * lane joins another road it starts where that road's band ends, at whatever
 * angle the lane comes in.
 */
export function vergeLays(lays: readonly RoadLay[], topology = roadNodes(lays)): VergeLay[] {
  const out: VergeLay[] = [];
  lays.forEach((lay, road) => {
    if (lay.style !== "lane" && lay.style !== "motorway") return;
    const lateral = lay.width / 2 + VERGE_WIDTH / 2 - 0.12;
    for (const side of [lateral, -lateral]) {
      const inset = (atStart: boolean) => {
        const node = topology.nodes[topology.ends[road][atStart ? 0 : 1]];
        const self = node.arms.find((arm) => arm.road === road && arm.atStart === atStart)!;
        const others = othersAt(topology, road, atStart);
        if (others.length === 0) return 0;
        if (others.length === 1) {
          const other = lays[others[0].road];
          const angle = bendAngle(self, others[0]);
          if (other.style === lay.style && angle <= Math.PI / 2 + 1e-6) {
            return mitre(lay, { other: others[0], angle }, side);
          }
        }
        return clearOf(lays, lay, self, others, side);
      };
      const start = inset(true);
      const end = inset(false);
      const along = lay.length - start - end;
      if (along < 0.5) continue;
      out.push({ road, lateral: side, start, along, style: lay.style });
    }
  });
  return out;
}

/** A patch of carriageway at a node, filling the gap two segment ends leave. */
export interface JointLay {
  x: number;
  z: number;
  /** Disc diameter, or the side of a square. */
  size: number;
  shape: "disc" | "square";
  /** Rotation about y, for the square. */
  angle: number;
  /** Laid in the lane's surface rather than the street's. */
  lane: boolean;
  /** The arm whose growing front reaches the node first, and where. */
  road: number;
  s: number;
}

/**
 * Two rectangles meeting at an angle leave a wedge open on the outside of the
 * bend, and at a village lane's bends that wedge was a bite out of the road.
 * A disc as wide as the road fills it exactly for any bend up to the limit.
 *
 *   - Where lanes meet only lanes, at any angle and any number of arms, the
 *     node gets a disc; a lane's dead end gets a slightly wider one, the
 *     turning head at the end of a farm track.
 *   - Where a lane runs on into a street, the lane's width is filled.
 *   - Where a lane joins a wider road at a junction, that road already
 *     covers the node and nothing is added.
 *   - A shallow bend in any other road gets a disc as wide as the road, and
 *     a motorway's right-angled corner a square, which fills its outside
 *     corner exactly.
 *
 * The city's own roads never get one: its degree-2 nodes are the ring road's
 * right-angled corners, which keep the look they have always had.
 */
export function jointLays(lays: readonly RoadLay[], topology = roadNodes(lays)): JointLay[] {
  const out: JointLay[] = [];
  for (const node of topology.nodes) {
    const styles = node.arms.map((arm) => lays[arm.road].style);
    const widths = node.arms.map((arm) => lays[arm.road].width);
    const lanes = styles.filter((style) => style === "lane").length;
    const widest = Math.max(...widths);
    // The arm that reaches the node first: one whose `from` is here grows out
    // of it, so the patch appears with that road.
    const first = node.arms.find((arm) => arm.atStart) ?? node.arms[0];
    const base = {
      x: node.x,
      z: node.z,
      angle: 0,
      road: first.road,
      s: first.atStart ? 0 : lays[first.road].length,
    };

    if (lanes === node.arms.length) {
      const size = node.arms.length === 1 ? widest * 1.3 : widest;
      out.push({ ...base, size, shape: "disc", lane: true });
      continue;
    }
    if (node.arms.length !== 2) continue;
    if (lanes === 1) {
      const lane = widths[styles.indexOf("lane")];
      out.push({ ...base, size: lane, shape: "disc", lane: true });
      continue;
    }
    const [a, b] = node.arms;
    if (styles[0] !== styles[1] || Math.abs(widths[0] - widths[1]) > 0.05) continue;
    const angle = bendAngle(a, b);
    if (angle < STRAIGHT) continue;
    if (angle <= BEND_LIMIT) {
      out.push({ ...base, size: widest, shape: "disc", lane: false });
    } else if (styles[0] !== "street") {
      out.push({ ...base, size: widest, shape: "square", lane: false, angle: lays[a.road].angle });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// The plaza
// ---------------------------------------------------------------------------

export interface PlazaRect {
  x: number;
  z: number;
  w: number;
  d: number;
}

/** Inset from the surrounding kerbs, so the gravel stops short of the road. */
const PLAZA_INSET = 1.6;

/**
 * The civic centre's own ground: raked gravel rather than lawn.
 *
 * The layout reserves a square cell for the civic centre and tiles the
 * districts around it, but `CityModel` carries only the districts, so the cell
 * is recovered by standing at the town hall and walking outwards until a
 * district rect gets in the way. When the generator puts the rect in the model
 * (`city.plaza.rect`, PLAN.md 76.3), that wins.
 */
export function plazaRect(city: CityModel): PlazaRect | null {
  const given = city.plaza?.rect;
  if (given && given.w > 0 && given.d > 0) return given;

  const hall = city.landmarks.find((landmark) => landmark.landmarkType === "civic");
  if (!hall) return null;
  const [cx, , cz] = hall.position;
  const [hw = 14, , hd = 14] = hall.size ?? [];

  // Falls back to twice the hall's plot, which is roughly what the layout
  // reserves: the hall, a gap, and a ring of plaza buildings around it.
  let west = cx - hw;
  let east = cx + hw;
  let north = cz - hd;
  let south = cz + hd;

  for (const { rect } of city.districts) {
    const x0 = rect.x - rect.w / 2;
    const x1 = rect.x + rect.w / 2;
    const z0 = rect.z - rect.d / 2;
    const z1 = rect.z + rect.d / 2;
    const spansZ = cz > z0 && cz < z1;
    const spansX = cx > x0 && cx < x1;
    if (spansZ && x1 <= cx) west = Math.max(west, x1);
    if (spansZ && x0 >= cx) east = Math.min(east, x0);
    if (spansX && z1 <= cz) north = Math.max(north, z1);
    if (spansX && z0 >= cz) south = Math.min(south, z0);
  }

  const w = east - west - PLAZA_INSET * 2;
  const d = south - north - PLAZA_INSET * 2;
  if (!(w > 4) || !(d > 4)) return null;
  return { x: (west + east) / 2, z: (north + south) / 2, w, d };
}

export type PlazaSurface = NonNullable<CityModel["plaza"]>["surface"];

/** The ground a civic square is laid in: gravel for a city, as it always was. */
export function plazaSurface(city: CityModel): PlazaSurface {
  return city.plaza?.surface ?? "paved";
}

/**
 * The outline of a village green: a rectangle with its corners cut at 45
 * degrees, as the village layout draws it (PLAN.md 76.5). Counter-clockwise
 * seen from above, in world x and z.
 */
export function chamferedOutline(rect: PlazaRect, cut = Math.min(rect.w, rect.d) * 0.18): [number, number][] {
  const hw = rect.w / 2;
  const hd = rect.d / 2;
  const c = Math.max(0, Math.min(cut, hw, hd));
  const { x, z } = rect;
  return [
    [x - hw + c, z - hd],
    [x + hw - c, z - hd],
    [x + hw, z - hd + c],
    [x + hw, z + hd - c],
    [x + hw - c, z + hd],
    [x - hw + c, z + hd],
    [x - hw, z + hd - c],
    [x - hw, z - hd + c],
  ];
}
