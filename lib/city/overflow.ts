/**
 * The queue at the city limits (PLAN.md 76.1 decision 4 and 76.8).
 *
 * Everything open that is not drawn as its own object is still counted: past
 * the survey's ceilings, past what the survey reached in time, or past the
 * ground the settlement has room for. It shows as a signboard on the verge,
 * "+20,112 more open issues", and a stationary queue of cars on the inbound
 * lane of each highway, starting just outside the ring. With no highway the
 * queue stands on the road out that reaches furthest from the centre: the
 * village's main street, or the outer ring segment of a city nobody forked.
 *
 * The numbers are the repository's real open totals when the server had them
 * (`metrics.*.total`), and an estimate from `repo.openIssuesCount` otherwise,
 * which the copy then calls "about".
 *
 * The site (routes and sign) is planned before the crowd, so no crowd spot is
 * ever offered under the sign or on a queue road; the queue itself is filled
 * after, once the hidden count is known. Car bodies come from
 * `prngFor(seed, "overflow")`, a stream nothing else reads.
 */

import type { RepoAnalysis, SettlementTier } from "@/types/analysis";
import type { Overflow, OverflowCount, RoadSegment, Vec3 } from "@/types/city";
import { overflowText } from "./entities.ts";
import type { Prng } from "./prng.ts";
import {
  JUNCTION_TOLERANCE,
  SIDEWALK_WIDTH,
  laneOffset,
  normalizeAngle,
  type Box,
  type OwnedBox,
} from "./spots.ts";

/** Distance between two queued cars, bumper to bumper plus a gap. */
export const QUEUE_SPACING = 5.2;
export const QUEUE_MIN = 4;
export const QUEUE_MAX = 60;
/** Body types the renderer draws the queue with (`parkedGeometry`). */
export const QUEUE_BODIES = 6;
/** Signboard plot `[w, h, d]`: six wide along the road, one deep. */
export const SIGN_SIZE: Vec3 = [6, 5, 1];
/** When the queue appears: with the last of the crowd. */
export const OVERFLOW_APPEAR = 3900;
/** Half the longest queued body, so no car overhangs a junction. */
const CAR_HALF = 2.3;

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));
const round3 = (n: number): number => Math.round(n * 1000) / 1000;

/** PLAN.md 76.8: `Q = clamp(round(8 log10(hidden + 1)), 4, 60)`, and none when nothing is hidden. */
export function queueLength(hidden: number): number {
  if (!(hidden > 0)) return 0;
  return clamp(Math.round(8 * Math.log10(hidden + 1)), QUEUE_MIN, QUEUE_MAX);
}

/** One road the queue stands on, measured from its inner end outwards. */
export interface QueueRoute {
  road: RoadSegment;
  /** The end nearer the centre: the head of the queue. */
  inner: [number, number];
  /** Unit vector from the inner end outwards. */
  ux: number;
  uz: number;
  length: number;
  /** Distance from the inner end to the first car's centre, clear of the junction. */
  head: number;
}

export interface OverflowSite {
  routes: QueueRoute[];
  /** The signboard's footprint; its `rot` is the sign's `rotationY`. */
  sign: OwnedBox;
  /** Roads whose kerbs and lanes the crowd must leave alone. */
  reserved: Set<string>;
}

/** Distance from a point to a road's centre line. */
function distanceToRoad(x: number, z: number, road: RoadSegment): number {
  const [ax, , az] = road.from;
  const dx = road.to[0] - ax;
  const dz = road.to[2] - az;
  const lengthSq = dx * dx + dz * dz;
  const t = lengthSq === 0 ? 0 : clamp(((x - ax) * dx + (z - az) * dz) / lengthSq, 0, 1);
  return Math.hypot(x - (ax + t * dx), z - (az + t * dz));
}

function routeFor(road: RoadSegment, roads: readonly RoadSegment[]): QueueRoute {
  const [fx, , fz] = road.from;
  const [tx, , tz] = road.to;
  const fromInner = Math.hypot(fx, fz) <= Math.hypot(tx, tz);
  const inner: [number, number] = fromInner ? [fx, fz] : [tx, tz];
  const outer: [number, number] = fromInner ? [tx, tz] : [fx, fz];
  const length = Math.hypot(outer[0] - inner[0], outer[1] - inner[1]) || 1;
  // Clear of the widest road that meets the inner end, and its pavement. A
  // road meets it at one of its ends or anywhere along it (a T-junction the
  // layout did not split).
  let meeting = 0;
  for (const other of roads) {
    if (other === road) continue;
    if (distanceToRoad(inner[0], inner[1], other) <= JUNCTION_TOLERANCE) {
      meeting = Math.max(meeting, other.width);
    }
  }
  return {
    road,
    inner,
    ux: (outer[0] - inner[0]) / length,
    uz: (outer[1] - inner[1]) / length,
    length,
    head: meeting / 2 + SIDEWALK_WIDTH + CAR_HALF + 0.5,
  };
}

/**
 * Where the queue and its sign go. `roads` is every road in the city;
 * `highways` the roads out of it (`planHighways`), which are not the same as
 * every road of kind "highway": a metropolis ring is a highway too, and
 * nobody queues on a ring. `blocked` says whether a footprint would touch
 * anything already standing (buildings, landmarks, trees, lamps,
 * carriageways). Null only for a city with no roads at all.
 */
export function planOverflowSite(
  roads: readonly RoadSegment[],
  highways: readonly RoadSegment[],
  blocked: (box: Box) => boolean,
): OverflowSite | null {
  let chosen: RoadSegment[] = [...highways];
  const reserved = new Set<string>();
  if (chosen.length === 0) {
    // The road out that reaches furthest: the village main street's last
    // segment, or a ring segment at a corner of the city.
    const candidates = roads.filter((road) => road.major && road.kind !== "highway");
    let best: RoadSegment | null = null;
    let reach = -Infinity;
    for (const road of candidates.length > 0 ? candidates : roads) {
      const far = Math.max(Math.hypot(road.from[0], road.from[2]), Math.hypot(road.to[0], road.to[2]));
      if (far > reach + 1e-9 || (Math.abs(far - reach) <= 1e-9 && best && road.id < best.id)) {
        best = road;
        reach = far;
      }
    }
    if (!best) return null;
    chosen = [best];
    reserved.add(best.id);
  }
  const routes = chosen.map((road) => routeFor(road, roads));
  return { routes, sign: placeSign(routes[0], blocked), reserved };
}

/**
 * The sign stands on the verge beside the head of the first queue, facing the
 * road, on the side away from the centre where it can. The first clear
 * position wins; if none is clear it stands at the first one anyway.
 */
function placeSign(route: QueueRoute, blocked: (box: Box) => boolean): OwnedBox {
  const { road, inner, ux, uz, length, head } = route;
  const midX = inner[0] + ux * (length / 2);
  const midZ = inner[1] + uz * (length / 2);
  // The two normals, the outward-facing one first.
  const right: [number, number] = [uz, -ux];
  const normals: [number, number][] =
    right[0] * midX + right[1] * midZ >= 0 ? [right, [-uz, ux]] : [[-uz, ux], right];
  const lateral = road.width / 2 + SIDEWALK_WIDTH + 0.5 + SIGN_SIZE[2] / 2;
  const half = SIGN_SIZE[0] / 2;

  let first: OwnedBox | null = null;
  for (const [nx, nz] of normals) {
    for (let s = head + half - CAR_HALF; s + half <= length - 1; s += 3) {
      const box: OwnedBox = {
        x: round3(inner[0] + ux * s + nx * lateral),
        z: round3(inner[1] + uz * s + nz * lateral),
        hw: half,
        hd: SIGN_SIZE[2] / 2,
        // Local +z faces the road; local x, the sign's width, runs along it.
        rot: normalizeAngle(Math.atan2(-nx, -nz)),
        owner: "overflow",
      };
      first ??= box;
      if (!blocked(box)) return box;
    }
  }
  return (
    first ?? {
      x: round3(inner[0] + normals[0][0] * lateral),
      z: round3(inner[1] + normals[0][1] * lateral),
      hw: half,
      hd: SIGN_SIZE[2] / 2,
      rot: normalizeAngle(Math.atan2(-normals[0][0], -normals[0][1])),
      owner: "overflow",
    }
  );
}

export interface OverflowTotals {
  issues: OverflowCount;
  pulls: OverflowCount;
  exact: boolean;
}

/**
 * `drawn + hidden = total` for issues and for pull requests. A total below
 * what is drawn (a stale count) is raised to it, so `hidden` is never
 * negative.
 */
export function overflowTotals(
  analysis: RepoAnalysis,
  drawn: { issues: number; pulls: number },
  surveyed: { issues: number; pulls: number },
): OverflowTotals {
  const { issues, pulls } = analysis.metrics;
  const pullTotal = pulls.total ?? Math.max(surveyed.pulls, pulls.open);
  const issueTotal =
    issues.total ??
    Math.max(surveyed.issues, issues.open, (analysis.repo.openIssuesCount ?? 0) - pullTotal);
  const count = (total: number, shown: number): OverflowCount => {
    const t = Math.max(Math.round(total), shown);
    return { total: t, drawn: shown, hidden: t - shown };
  };
  return {
    issues: count(issueTotal, drawn.issues),
    pulls: count(pullTotal, drawn.pulls),
    exact: issues.total !== undefined && pulls.total !== undefined && analysis.totalsExact !== false,
  };
}

export interface OverflowInput {
  site: OverflowSite | null;
  totals: OverflowTotals;
  surveyed: { issues: number; pulls: number };
  tier: SettlementTier;
  repoUrl: string;
  prng: Prng;
}

/** The overflow entity, or null when nothing is hidden. */
export function buildOverflow(input: OverflowInput): Overflow | null {
  const { site, totals } = input;
  const hidden = totals.issues.hidden + totals.pulls.hidden;
  if (!site || hidden <= 0) return null;

  const queue = fillQueue(site.routes, queueLength(hidden), input.prng);
  const text = overflowText({
    issues: totals.issues,
    pulls: totals.pulls,
    exact: totals.exact,
    surveyed: input.surveyed,
    tier: input.tier,
    repoUrl: input.repoUrl,
  });
  return {
    id: "overflow",
    kind: "overflow",
    position: [site.sign.x, 0, site.sign.z],
    rotationY: site.sign.rot,
    ...text,
    appearAt: OVERFLOW_APPEAR,
    issues: totals.issues,
    pulls: totals.pulls,
    exact: totals.exact,
    size: [...SIGN_SIZE] as Vec3,
    queue,
  };
}

/**
 * `count` cars, dealt round the routes one at a time so every highway gets
 * its share, each route filled from its head outwards at `QUEUE_SPACING`. A
 * route that runs out of road passes its cars on; if every route is full the
 * queue is as long as the roads allow.
 */
export function fillQueue(routes: readonly QueueRoute[], count: number, prng: Prng): Overflow["queue"] {
  const queue: Overflow["queue"] = [];
  const room = routes.map((route) =>
    Math.max(0, Math.floor((route.length - route.head - CAR_HALF) / QUEUE_SPACING) + 1),
  );
  for (let slot = 0; queue.length < count; slot++) {
    let any = false;
    for (let r = 0; r < routes.length && queue.length < count; r++) {
      if (slot >= room[r]) continue;
      any = true;
      const { road, inner, ux, uz, head } = routes[r];
      const s = head + slot * QUEUE_SPACING;
      // Inbound: travelling towards the inner end, in the right-hand lane.
      const vx = -ux;
      const vz = -uz;
      const offset = laneOffset(road.width);
      queue.push({
        position: [round3(inner[0] + ux * s - vz * offset), 0, round3(inner[1] + uz * s + vx * offset)],
        rotationY: normalizeAngle(Math.atan2(vx, vz)),
        body: prng.int(0, QUEUE_BODIES - 1),
        roadId: road.id,
      });
    }
    if (!any) break;
  }
  return queue;
}
