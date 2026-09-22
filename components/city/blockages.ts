/**
 * Where the road is blocked (PLAN.md sections 11 and 13).
 *
 * An open issue is drawn as an incident lying in the road: cones, wrecks, a
 * fire, and the police, ambulance, fire engine, tow truck or works lorry that
 * came for it. A construction site sits on its own plot, but its dressing can
 * lean out over the kerb. Moving traffic has to respect both, so this module
 * turns them into BLOCKED STRETCHES: a road segment and the part of it, in
 * world units from the segment's `from` end, that a car may not drive into.
 *
 * A stretch counts only where the obstacle actually reaches a lane: the band
 * either side of the centre line that a car body covers, which is its lane
 * offset plus half its width. Dressing that stops on the verge blocks nothing.
 * Both lanes share one set of stretches: a scene that reaches either lane
 * closes the carriageway for both, which is what every incident does anyway,
 * and it spares the traffic a lane-change manoeuvre it has no way of drawing.
 *
 * A scene near a junction closes the junction too, to every road meeting
 * there. A segment with no usable way in from either end -- no room for a car
 * to pull in, stop short of the cones and turn round -- is a whole-segment
 * closure, and its stretches say so.
 *
 * Pure, no three.js: unit tested.
 */

import type { ConstructionState, IncidentState } from "@/types/analysis";
import type { CityModel } from "@/types/city";
import { CAR_HALF_WIDTH, MIN_ROOM, laneOffset, reachFor, type RoadGraph } from "./traffic";

/**
 * A rectangle in an object's own frame, before its `rotationY`: `x` across,
 * `z` along. For an incident that frame has the carriageway running along `z`
 * (`models/props/incidentDecor.ts`).
 */
export interface LocalRect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Something on the ground that traffic must not drive through. */
export interface Obstacle extends LocalRect {
  /** The incident's or site's entity id. */
  id: string;
  x: number;
  z: number;
  /** Radians, applied exactly as three.js applies `rotation.y`. */
  rotationY: number;
}

export interface BlockedStretch {
  /** Index into the road graph's segments. */
  segment: number;
  /** World units from the segment's `from` end; `start < end`. */
  start: number;
  end: number;
  /**
   * True when the whole segment is shut: its blockages leave no room to pull
   * in from either end, so no car may enter it at all. Every stretch on a
   * shut segment carries the flag; `start` and `end` still say where the
   * obstruction actually is.
   */
  closed: boolean;
  /** Ids of the obstacles responsible. */
  causes: string[];
}

export interface Blockages {
  /** Every stretch in the city, segment by segment. */
  stretches: BlockedStretch[];
  /**
   * Per segment index: its stretches sorted by `start`, overlapping ones
   * merged. Empty for a clear road.
   */
  bySegment: BlockedStretch[][];
}

/**
 * Each incident scene's extent on the ground, in the incident's frame. These
 * mirror `incidentDecor.ts` -- the cones, the wrecks, the barricades and the
 * emergency vehicles `incidentLayout` parks along the road -- symmetrically in
 * `x` so both variants are covered, with a little over. A test holds them to
 * the decor's actual bounding boxes, so a scene that grows fails loudly
 * rather than letting cars drive through the new part.
 */
export const INCIDENT_FOOTPRINT: Record<IncidentState, LocalRect> = {
  // Pothole and cones in the middle; the works lorry parked ahead at z = 4.3.
  minor: { minX: -2.7, maxX: 2.7, minZ: -1.6, maxZ: 6.2 },
  // Ambulance behind at z = -5, police car ahead at z = 4.8.
  collision: { minX: -2.8, maxX: 2.8, minZ: -6.8, maxZ: 6.5 },
  // Barricade lines at z = -3.2 and z = 3, tow truck outside them at z = 6.05.
  stale: { minX: -4, maxX: 4, minZ: -3.5, maxZ: 8.1 },
  // Barricades at z = +-4.2 and the fire engine outside the cordon at z = 7.1.
  major: { minX: -3.1, maxX: 3.1, minZ: -4.4, maxZ: 9.8 },
};

/** The side of the square a construction site is modelled on (`constructionDecor.ts`). */
export const SITE_SIDE = 11;

/**
 * Each construction site's extent, in its own frame at the modelled eleven
 * unit size: the plot itself plus whatever the dressing pushes past it (the
 * excavator's arm, a leaning sign, the forecourt tree). Scaled by the same
 * fit `ConstructionSite.tsx` uses. Also held to the decor by a test.
 */
export const SITE_FOOTPRINT: Record<ConstructionState, LocalRect> = {
  active: { minX: -6.8, maxX: 5.7, minZ: -5.7, maxZ: 5.7 },
  slow: { minX: -6.8, maxX: 5.7, minZ: -5.7, maxZ: 5.7 },
  abandoned: { minX: -6.8, maxX: 5.7, minZ: -5.7, maxZ: 6.1 },
  completed: { minX: -5.7, maxX: 6.5, minZ: -5.7, maxZ: 6.5 },
};

/** Every incident and construction site in the city, as obstacles. */
export function cityObstacles(
  city: Pick<CityModel, "incidents" | "constructionSites">,
): Obstacle[] {
  const obstacles: Obstacle[] = [];
  for (const incident of city.incidents) {
    obstacles.push({
      id: incident.id,
      x: incident.position[0],
      z: incident.position[2],
      rotationY: incident.rotationY,
      ...INCIDENT_FOOTPRINT[incident.state],
    });
  }
  for (const site of city.constructionSites) {
    const fit = site.size ? Math.min(site.size[0], site.size[2]) / SITE_SIDE : 1;
    const rect = SITE_FOOTPRINT[site.state];
    obstacles.push({
      id: site.id,
      x: site.position[0],
      z: site.position[2],
      rotationY: site.rotationY,
      minX: rect.minX * fit,
      maxX: rect.maxX * fit,
      minZ: rect.minZ * fit,
      maxZ: rect.maxZ * fit,
    });
  }
  return obstacles;
}

/** A point in a segment's frame: distance along it, offset across it. */
type Point = [number, number];

/** The part of a convex polygon on one side of the line `across = limit`. */
function clip(poly: Point[], limit: number, above: boolean): Point[] {
  const out: Point[] = [];
  const inside = (p: Point) => (above ? p[1] >= limit : p[1] <= limit);
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const aIn = inside(a);
    const bIn = inside(b);
    if (aIn) out.push(a);
    if (aIn !== bIn) {
      const k = (limit - a[1]) / (b[1] - a[1]);
      out.push([a[0] + (b[0] - a[0]) * k, limit]);
    }
  }
  return out;
}

/**
 * The stretch of one segment an obstacle covers, as `[start, end]` in world
 * units from `from`, or null when it misses both lanes.
 */
function coverage(graph: RoadGraph, segment: number, obstacle: Obstacle): [number, number] | null {
  const road = graph.segments[segment];
  const length = graph.lengths[segment];
  if (length <= 0.001) return null;
  const ux = (road.to[0] - road.from[0]) / length;
  const uz = (road.to[2] - road.from[2]) / length;
  // Right-hand normal of the from -> to direction, as `carPose` uses.
  const nx = -uz;
  const nz = ux;
  const band = laneOffset(road.width) + CAR_HALF_WIDTH;

  const cos = Math.cos(obstacle.rotationY);
  const sin = Math.sin(obstacle.rotationY);
  const corners: Point[] = [
    [obstacle.minX, obstacle.minZ],
    [obstacle.maxX, obstacle.minZ],
    [obstacle.maxX, obstacle.maxZ],
    [obstacle.minX, obstacle.maxZ],
  ].map(([lx, lz]) => {
    // Local to world, as three.js rotates about y.
    const wx = obstacle.x + lx * cos + lz * sin - road.from[0];
    const wz = obstacle.z - lx * sin + lz * cos - road.from[2];
    // World to segment: distance along, offset across.
    return [wx * ux + wz * uz, wx * nx + wz * nz];
  });

  const inBand = clip(clip(corners, -band, true), band, false);
  if (inBand.length === 0) return null;
  let start = Infinity;
  let end = -Infinity;
  for (const [s] of inBand) {
    if (s < start) start = s;
    if (s > end) end = s;
  }
  start = Math.max(0, start);
  end = Math.min(length, end);
  return end > start ? [start, end] : null;
}

/** Sort a segment's stretches and merge the ones that overlap, pooling their causes. */
function merge(hits: BlockedStretch[]): BlockedStretch[] {
  hits.sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: BlockedStretch[] = [];
  for (const hit of hits) {
    const last = merged[merged.length - 1];
    if (last && hit.start <= last.end) {
      last.end = Math.max(last.end, hit.end);
      for (const id of hit.causes) if (!last.causes.includes(id)) last.causes.push(id);
    } else {
      merged.push({ ...hit, causes: [...hit.causes] });
    }
  }
  return merged;
}

/**
 * The blocked stretches for a road network and the obstacles on it. Cheap
 * enough to run once per city: segments times obstacles, twenty-odd
 * obstacles at most.
 *
 * JUNCTIONS. A car crossing a junction has its nose over the next road before
 * it leaves its own, so a stretch that comes within a car's reach of a
 * junction closes the junction: every other segment meeting there gets a
 * stretch over the junction's own box at that end, and its traffic stops
 * short of the junction rather than squeezing past the scene.
 */
export function blockedStretches(graph: RoadGraph, obstacles: readonly Obstacle[]): Blockages {
  const own: BlockedStretch[][] = graph.segments.map((_, segment) => {
    const hits: BlockedStretch[] = [];
    for (const obstacle of obstacles) {
      const covered = coverage(graph, segment, obstacle);
      if (covered) {
        hits.push({ segment, start: covered[0], end: covered[1], closed: false, causes: [obstacle.id] });
      }
    }
    return merge(hits);
  });

  // How far a junction's box reaches along each road meeting there: the
  // widest lane band among them.
  const junctionReach = (node: string): number =>
    Math.max(
      0,
      ...(graph.byNode.get(node) ?? []).map(
        (i) => laneOffset(graph.segments[i].width) + CAR_HALF_WIDTH,
      ),
    );

  const all: BlockedStretch[][] = own.map((list) => [...list]);
  own.forEach((list, segment) => {
    if (list.length === 0) return;
    const length = graph.lengths[segment];
    const reach = reachFor(graph.segments[segment].width);
    const ends: [string, BlockedStretch, number][] = [
      [graph.nodeKeys[segment][0], list[0], list[0].start],
      [graph.nodeKeys[segment][1], list[list.length - 1], length - list[list.length - 1].end],
    ];
    for (const [node, stretch, gap] of ends) {
      if (gap >= reach) continue;
      const box = junctionReach(node);
      for (const other of graph.byNode.get(node) ?? []) {
        if (other === segment) continue;
        const otherLength = graph.lengths[other];
        if (otherLength <= 0.001) continue;
        const atFrom = graph.nodeKeys[other][0] === node;
        all[other].push({
          segment: other,
          start: atFrom ? 0 : Math.max(0, otherLength - box),
          end: atFrom ? Math.min(otherLength, box) : otherLength,
          closed: false,
          causes: [...stretch.causes],
        });
      }
    }
  });

  const bySegment: BlockedStretch[][] = [];
  const stretches: BlockedStretch[] = [];
  all.forEach((hits, segment) => {
    const list = merge(hits);
    bySegment.push(list);
    if (list.length === 0) return;
    // Room to pull in from an end, stop short and turn round: without it on
    // either side, nobody can use the segment at all.
    const length = graph.lengths[segment];
    const reach = reachFor(graph.segments[segment].width);
    const fromEnd = list[0].start - reach >= MIN_ROOM;
    const toEnd = length - list[list.length - 1].end - reach >= MIN_ROOM;
    if (!fromEnd && !toEnd) for (const stretch of list) stretch.closed = true;
    stretches.push(...list);
  });

  return { stretches, bySegment };
}
