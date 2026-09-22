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
import type { CrowdForm } from "./backlog/forms";
import { crowdScale, incidentForm, scaffoldScale, worksForm } from "./backlog/plan";
import { BODY_SPECS, VEHICLE_BODIES } from "./models/vehicles/shapes";
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

/**
 * Each crowd form's extent on the ground, in its own frame and before its
 * instance scale (PLAN.md 76.9). These mirror `backlog/forms.ts`, optional
 * parts included, with a little over; `blockages.test.ts` holds them to the
 * geometry's bounding boxes the way `INCIDENT_FOOTPRINT` is held to the hero
 * decor. A scaffold's frame starts at its host's wall and runs outwards.
 */
export const CROWD_FOOTPRINT: Record<CrowdForm, LocalRect> = {
  fire: { minX: -1.5, maxX: 1.5, minZ: -1.5, maxZ: 1.5 },
  collision: { minX: -1.45, maxX: 1.45, minZ: -2.5, maxZ: 2.3 },
  wreck: { minX: -1.4, maxX: 1.4, minZ: -1.4, maxZ: 1.4 },
  pothole: { minX: -1.15, maxX: 1.15, minZ: -1.35, maxZ: 1.15 },
  roadblock: { minX: -1.15, maxX: 1.15, minZ: -0.3, maxZ: 1.0 },
  survey: { minX: -0.8, maxX: 0.9, minZ: -1.0, maxZ: 0.9 },
  signpost: { minX: -0.3, maxX: 0.35, minZ: -1.0, maxZ: 1.2 },
  scaffold: { minX: -2.35, maxX: 2.4, minZ: 0, maxZ: 1.6 },
  trench: { minX: -1.4, maxX: 1.55, minZ: -1.65, maxZ: 2.05 },
  van: { minX: -1.3, maxX: 1.4, minZ: -2.5, maxZ: 1.7 },
  hoarding: { minX: -1.4, maxX: 1.45, minZ: -1.4, maxZ: 1.8 },
};

/** Daylight left round a queued car, so traffic stops short of its bumper. */
const QUEUE_MARGIN = 0.3;

/** The body a queue entry wears: `body` indexes `VEHICLE_BODIES`, wrapping. */
export function queueBody(body: number) {
  const n = VEHICLE_BODIES.length;
  const i = Number.isFinite(body) ? Math.trunc(body) : 0;
  return VEHICLE_BODIES[((i % n) + n) % n];
}

const scaled = (rect: LocalRect, sx: number, sz: number): LocalRect => ({
  minX: rect.minX * sx,
  maxX: rect.maxX * sx,
  minZ: rect.minZ * sz,
  maxZ: rect.maxZ * sz,
});

/**
 * Every incident and construction site in the city, as obstacles: the heroes,
 * the crowd objects that sit in a lane (`lane: true`; kerbside ones leave the
 * carriageway alone), and every car standing in the queue at the city limits.
 */
export function cityObstacles(
  city: Pick<CityModel, "incidents" | "constructionSites"> &
    Partial<Pick<CityModel, "backlog" | "overflow">>,
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
  for (const incident of city.backlog?.incidents ?? []) {
    if (!incident.lane) continue;
    const s = crowdScale(incident.heat ?? incident.issue.heat);
    obstacles.push({
      id: incident.id,
      x: incident.position[0],
      z: incident.position[2],
      rotationY: incident.rotationY,
      ...scaled(CROWD_FOOTPRINT[incidentForm(incident)], s, s),
    });
  }
  for (const site of city.backlog?.constructionSites ?? []) {
    if (!site.lane) continue;
    const form = worksForm(site);
    const s = crowdScale(site.heat ?? site.pull.heat);
    const [sx, , sz] = form === "scaffold" ? scaffoldScale(site.size) : [s, s, s];
    obstacles.push({
      id: site.id,
      x: site.position[0],
      z: site.position[2],
      rotationY: site.rotationY,
      ...scaled(CROWD_FOOTPRINT[form], sx, sz),
    });
  }
  const overflow = city.overflow;
  if (overflow) {
    for (const car of overflow.queue) {
      const spec = BODY_SPECS[queueBody(car.body)];
      const halfLength = spec.length / 2 + QUEUE_MARGIN;
      const halfWidth = spec.width / 2 + QUEUE_MARGIN / 2;
      obstacles.push({
        id: overflow.id,
        x: car.position[0],
        z: car.position[2],
        rotationY: car.rotationY,
        minX: -halfWidth,
        maxX: halfWidth,
        minZ: -halfLength,
        maxZ: halfLength,
      });
    }
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

/** Side of the grid cells segments are binned into (PLAN.md 76.9). */
export const BLOCKAGE_CELL = 16;

/**
 * Each segment's own stretches, before junctions. Binned: every segment is
 * registered in the grid cells its lane band covers, and each obstacle is
 * tested only against the segments in the cells its own box overlaps. With
 * `binned: false` it is the plain segments-times-obstacles loop the tests
 * hold the binned answer to. Both push a segment's hits in obstacle order, so
 * the stable sort in `merge` gives identical lists.
 */
function ownStretches(
  graph: RoadGraph,
  obstacles: readonly Obstacle[],
  binned: boolean,
): BlockedStretch[][] {
  const hits: BlockedStretch[][] = graph.segments.map(() => []);
  const hit = (segment: number, obstacle: Obstacle) => {
    const covered = coverage(graph, segment, obstacle);
    if (covered) {
      hits[segment].push({ segment, start: covered[0], end: covered[1], closed: false, causes: [obstacle.id] });
    }
  };

  if (!binned) {
    graph.segments.forEach((_, segment) => {
      for (const obstacle of obstacles) hit(segment, obstacle);
    });
    return hits.map(merge);
  }

  const cell = (v: number) => Math.floor(v / BLOCKAGE_CELL);
  // Cells keyed as one number; no city is 65,536 cells across.
  const key = (cx: number, cz: number) => (cx + 32768) * 65536 + (cz + 32768);
  const grid = new Map<number, number[]>();
  graph.segments.forEach((road, segment) => {
    const band = laneOffset(road.width) + CAR_HALF_WIDTH;
    const x0 = cell(Math.min(road.from[0], road.to[0]) - band);
    const x1 = cell(Math.max(road.from[0], road.to[0]) + band);
    const z0 = cell(Math.min(road.from[2], road.to[2]) - band);
    const z1 = cell(Math.max(road.from[2], road.to[2]) + band);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const k = key(cx, cz);
        const list = grid.get(k);
        if (list) list.push(segment);
        else grid.set(k, [segment]);
      }
    }
  });

  const seen = new Int32Array(graph.segments.length).fill(-1);
  obstacles.forEach((obstacle, o) => {
    const cos = Math.cos(obstacle.rotationY);
    const sin = Math.sin(obstacle.rotationY);
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const lx of [obstacle.minX, obstacle.maxX]) {
      for (const lz of [obstacle.minZ, obstacle.maxZ]) {
        const wx = obstacle.x + lx * cos + lz * sin;
        const wz = obstacle.z - lx * sin + lz * cos;
        if (wx < minX) minX = wx;
        if (wx > maxX) maxX = wx;
        if (wz < minZ) minZ = wz;
        if (wz > maxZ) maxZ = wz;
      }
    }
    for (let cx = cell(minX); cx <= cell(maxX); cx++) {
      for (let cz = cell(minZ); cz <= cell(maxZ); cz++) {
        for (const segment of grid.get(key(cx, cz)) ?? []) {
          // One test per segment per obstacle, however many cells they share.
          if (seen[segment] === o) continue;
          seen[segment] = o;
          hit(segment, obstacle);
        }
      }
    }
  });
  return hits.map(merge);
}

/**
 * The blocked stretches for a road network and the obstacles on it, once per
 * city. A metropolis carries hundreds of obstacles -- lane crowd objects and
 * the queue at the city limits -- so each obstacle is tested only against the
 * segments near it (`ownStretches`).
 *
 * JUNCTIONS. A car crossing a junction has its nose over the next road before
 * it leaves its own, so a stretch that comes within a car's reach of a
 * junction closes the junction: every other segment meeting there gets a
 * stretch over the junction's own box at that end, and its traffic stops
 * short of the junction rather than squeezing past the scene.
 */
export function blockedStretches(
  graph: RoadGraph,
  obstacles: readonly Obstacle[],
  options: { binned?: boolean } = {},
): Blockages {
  const own = ownStretches(graph, obstacles, options.binned ?? true);

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
