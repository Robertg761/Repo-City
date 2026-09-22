/**
 * Where crowd objects may stand (PLAN.md 76.8).
 *
 * A `SpotIndex` is built once per city, after the buildings, landmarks, hero
 * incidents, hero sites, trees and lamps are in place. It holds four classes
 * of spot, every one of them deterministic:
 *
 *   kerb    on the pavement of every street, lane and avenue segment, both
 *           sides, every 3.2 units, clear of the junctions and the lamps;
 *   lane    in the traffic lane of the same segments, for the forms that close
 *           a lane (never on a highway, never on a bridge of the street graph);
 *   ground  a 3.5-unit grid over the vacant district slots, the village green,
 *           the fields and the corners of the landmark band, plus one "whole"
 *           spot per vacant slot for a hoarding round an empty plot;
 *   facade  one per building, on the face that looks at the nearest road.
 *
 * Nothing here knows about issues or pull requests: `backlog.ts` decides who
 * goes where. This file answers "what is free near here" and "does this
 * footprint fit", and it answers both exactly. Every footprint is an oriented
 * box tested with the separating axis theorem against the buildings, the
 * landmark plots, the hero site plots, the trees, the lamps, the carriageways
 * and every crowd object already placed, through uniform 16-unit grids, so a
 * metropolis with 1,500 crowd objects costs a few milliseconds rather than the
 * quadratic scan `findRoadSpot` does for twelve heroes.
 *
 * Roads are handled generically as segments at any angle: the village's lanes
 * bend, and nothing here assumes an axis-aligned street.
 */

import type { Building, RoadSegment, Vec3 } from "@/types/city";

// ---------------------------------------------------------------------------
// Constants (PLAN.md 76.8)
// ---------------------------------------------------------------------------

/** Side of a grid cell for every spatial query in this file. */
export const SPOT_CELL = 16;
/** Spacing of kerb and lane spots along a road. */
export const KERB_PITCH = 3.2;
/** Road length kept clear at each end of a segment: junction reach and crossings. */
export const JUNCTION_SKIP = 3.5;
/** Kerb spots this close to a lamp are dropped. */
export const LAMP_CLEARANCE = 1.4;
/** Kerb, lane and ground spots this close to a hero incident are dropped. */
export const HERO_CLEARANCE = 7;
/** Spacing of the ground grid. */
export const GROUND_PITCH = 3.5;
/** Mirrors `SIDEWALK_WIDTH` in `components/city/groundwork.ts`. */
export const SIDEWALK_WIDTH = 1.2;
/** Depth of a scaffold slab standing against a facade. */
export const FACADE_DEPTH = 0.9;
/** Daylight between a facade and the scaffold in front of it. */
const FACADE_GAP = 0.05;
/** Half the footprint of the smallest crowd form (a signpost at the lowest heat), rounded down. */
const SMALLEST_HALF = 0.35;
/**
 * Endpoints closer than this count as one junction. Mirrors
 * `JUNCTION_TOLERANCE` in `components/city/traffic.ts`, so the bridges found
 * here are bridges of the graph the cars actually drive.
 */
export const JUNCTION_TOLERANCE = 2;

/** Mirrors `laneOffset` in `components/city/traffic.ts`: a car's distance from the centre line. */
export function laneOffset(width: number): number {
  return Math.max(0.6, width * 0.22);
}

const round3 = (n: number): number => Math.round(n * 1000) / 1000;

/** An angle folded into (-PI, PI], rounded as every stored rotation is. */
export function normalizeAngle(angle: number): number {
  let a = angle % (2 * Math.PI);
  if (a <= -Math.PI) a += 2 * Math.PI;
  if (a > Math.PI) a -= 2 * Math.PI;
  return round3(a);
}

// ---------------------------------------------------------------------------
// Oriented boxes
// ---------------------------------------------------------------------------

/**
 * An oriented rectangle on the XZ plane. `hw` is the half extent along the
 * box's own x axis and `hd` along its own z, after a rotation `rot` about +y
 * applied exactly as three.js applies `rotation.y`: local x maps to
 * `(cos rot, -sin rot)` and local z to `(sin rot, cos rot)`.
 */
export interface Box {
  x: number;
  z: number;
  hw: number;
  hd: number;
  rot: number;
}

/** A box that remembers whose it is, so a facade test can ignore its own building. */
export interface OwnedBox extends Box {
  owner: string;
}

export function boxAabb(box: Box): { minX: number; maxX: number; minZ: number; maxZ: number } {
  const c = Math.abs(Math.cos(box.rot));
  const s = Math.abs(Math.sin(box.rot));
  const ex = box.hw * c + box.hd * s;
  const ez = box.hw * s + box.hd * c;
  return { minX: box.x - ex, maxX: box.x + ex, minZ: box.z - ez, maxZ: box.z + ez };
}

/**
 * Separating axis test. Boxes that only touch do not overlap; `margin` asks
 * for that much daylight between them as well.
 */
export function boxesOverlap(a: Box, b: Box, margin = 0): boolean {
  return overlapWith(a, Math.cos(a.rot), Math.sin(a.rot), b, Math.cos(b.rot), Math.sin(b.rot), margin);
}

/** `boxesOverlap` with both boxes' rotations already resolved to cos and sin. */
function overlapWith(
  a: Box,
  ca: number,
  sa: number,
  b: Box,
  cb: number,
  sb: number,
  margin: number,
): boolean {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  // Local axes of both boxes, in world space.
  const axes: [number, number][] = [
    [ca, -sa],
    [sa, ca],
    [cb, -sb],
    [sb, cb],
  ];
  for (const [ux, uz] of axes) {
    const ra = a.hw * Math.abs(ca * ux - sa * uz) + a.hd * Math.abs(sa * ux + ca * uz);
    const rb = b.hw * Math.abs(cb * ux - sb * uz) + b.hd * Math.abs(sb * ux + cb * uz);
    if (Math.abs(dx * ux + dz * uz) >= ra + rb + margin - 1e-9) return false;
  }
  return true;
}

/** Whether a point lies strictly inside a box. */
export function pointInBox(box: Box, x: number, z: number): boolean {
  const c = Math.cos(box.rot);
  const s = Math.sin(box.rot);
  const dx = x - box.x;
  const dz = z - box.z;
  const lx = dx * c - dz * s;
  const lz = dx * s + dz * c;
  return Math.abs(lx) < box.hw && Math.abs(lz) < box.hd;
}

/** The box a building's footprint covers. */
export function buildingBox(building: Building): OwnedBox {
  return {
    x: building.position[0],
    z: building.position[2],
    hw: building.size[0] / 2,
    hd: building.size[2] / 2,
    rot: building.rotationY,
    owner: building.id,
  };
}

/** A road's carriageway as a box: `hw` is half its width, `hd` half its length. */
export function roadBox(road: RoadSegment, owner: string = road.id): OwnedBox {
  const dx = road.to[0] - road.from[0];
  const dz = road.to[2] - road.from[2];
  return {
    x: (road.from[0] + road.to[0]) / 2,
    z: (road.from[2] + road.to[2]) / 2,
    hw: road.width / 2,
    hd: Math.hypot(dx, dz) / 2,
    rot: Math.atan2(dx, dz),
    owner,
  };
}

// ---------------------------------------------------------------------------
// Uniform grids
// ---------------------------------------------------------------------------

const cellOf = (n: number): number => Math.floor(n / SPOT_CELL);
/** Cell coordinates packed into one number; cities stay far inside +-2^15 cells. */
const cellKey = (i: number, j: number): number => (i + 32768) * 65536 + (j + 32768);

/** A stored box with its bounds and trigonometry worked out once. */
interface Entry<T extends Box> {
  item: T;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  c: number;
  s: number;
  /** The last query that tested this entry, so a box spanning cells is tested once. */
  stamp: number;
}

/** Boxes bucketed by every grid cell their bounding box touches. */
export class BoxGrid<T extends Box = OwnedBox> {
  private readonly cells = new Map<number, Entry<T>[]>();
  private stamp = 0;
  readonly items: T[] = [];

  insert(item: T): void {
    this.items.push(item);
    const bounds = boxAabb(item);
    const entry: Entry<T> = {
      item,
      ...bounds,
      c: Math.cos(item.rot),
      s: Math.sin(item.rot),
      stamp: 0,
    };
    for (let i = cellOf(bounds.minX); i <= cellOf(bounds.maxX); i++) {
      for (let j = cellOf(bounds.minZ); j <= cellOf(bounds.maxZ); j++) {
        const key = cellKey(i, j);
        const list = this.cells.get(key);
        if (list) list.push(entry);
        else this.cells.set(key, [entry]);
      }
    }
  }

  /** Every stored item whose bounds meet the rectangle, once each; stops when `visit` returns true. */
  forEachNear(
    minX: number,
    minZ: number,
    maxX: number,
    maxZ: number,
    visit: (item: T) => boolean | void,
  ): boolean {
    const stamp = ++this.stamp;
    for (let i = cellOf(minX); i <= cellOf(maxX); i++) {
      for (let j = cellOf(minZ); j <= cellOf(maxZ); j++) {
        const list = this.cells.get(cellKey(i, j));
        if (!list) continue;
        for (const entry of list) {
          if (entry.stamp === stamp) continue;
          entry.stamp = stamp;
          if (entry.maxX < minX || entry.minX > maxX || entry.maxZ < minZ || entry.minZ > maxZ) {
            continue;
          }
          if (visit(entry.item) === true) return true;
        }
      }
    }
    return false;
  }

  /** True when any stored box overlaps `box` (with `margin` of daylight), bar the skipped ones. */
  hits(box: Box, skip?: (item: T) => boolean, margin = 0): boolean {
    const { minX, maxX, minZ, maxZ } = boxAabb(box);
    const c = Math.cos(box.rot);
    const s = Math.sin(box.rot);
    const x0 = minX - margin;
    const x1 = maxX + margin;
    const z0 = minZ - margin;
    const z1 = maxZ + margin;
    const stamp = ++this.stamp;
    for (let i = cellOf(x0); i <= cellOf(x1); i++) {
      for (let j = cellOf(z0); j <= cellOf(z1); j++) {
        const list = this.cells.get(cellKey(i, j));
        if (!list) continue;
        for (const entry of list) {
          if (entry.stamp === stamp) continue;
          entry.stamp = stamp;
          if (entry.maxX <= x0 || entry.minX >= x1 || entry.maxZ <= z0 || entry.minZ >= z1) {
            continue;
          }
          if (skip && skip(entry.item)) continue;
          if (overlapWith(box, c, s, entry.item, entry.c, entry.s, margin)) return true;
        }
      }
    }
    return false;
  }
}

// ---------------------------------------------------------------------------
// Bridges of the street graph (Tarjan)
// ---------------------------------------------------------------------------

const nodeKey = (x: number, z: number): string =>
  `${Math.round(x / JUNCTION_TOLERANCE)}:${Math.round(z / JUNCTION_TOLERANCE)}`;

/**
 * Indices of the roads that are bridges of the street graph: closing one
 * would cut part of the network off. Junctions are merged the way
 * `roadGraph` in `components/city/traffic.ts` merges them. Parallel segments
 * between the same two junctions are not bridges; a self-loop never is.
 * Iterative, so a long village lane cannot overflow the stack.
 */
export function findBridges(roads: readonly RoadSegment[]): Set<number> {
  const ids = new Map<string, number>();
  const node = (x: number, z: number): number => {
    const key = nodeKey(x, z);
    let id = ids.get(key);
    if (id === undefined) {
      id = ids.size;
      ids.set(key, id);
    }
    return id;
  };
  const ends: [number, number][] = roads.map((road) => [
    node(road.from[0], road.from[2]),
    node(road.to[0], road.to[2]),
  ]);
  const adjacency: [number, number][][] = Array.from({ length: ids.size }, () => []);
  ends.forEach(([a, b], edge) => {
    if (a === b) return;
    adjacency[a].push([b, edge]);
    adjacency[b].push([a, edge]);
  });

  const disc = new Array<number>(ids.size).fill(-1);
  const low = new Array<number>(ids.size).fill(0);
  const bridges = new Set<number>();
  let time = 0;

  for (let root = 0; root < ids.size; root++) {
    if (disc[root] !== -1) continue;
    // Frame: node, the edge we arrived by, the next adjacency index to visit.
    const stack: [number, number, number][] = [[root, -1, 0]];
    disc[root] = low[root] = time++;
    while (stack.length > 0) {
      const frame = stack[stack.length - 1];
      const [u, parentEdge, next] = frame;
      if (next < adjacency[u].length) {
        frame[2] = next + 1;
        const [v, edge] = adjacency[u][next];
        if (edge === parentEdge) continue;
        if (disc[v] === -1) {
          disc[v] = low[v] = time++;
          stack.push([v, edge, 0]);
        } else {
          low[u] = Math.min(low[u], disc[v]);
        }
        continue;
      }
      stack.pop();
      if (stack.length > 0) {
        const p = stack[stack.length - 1][0];
        low[p] = Math.min(low[p], low[u]);
        if (low[u] > disc[p]) bridges.add(parentEdge);
      }
    }
  }
  return bridges;
}

// ---------------------------------------------------------------------------
// The index
// ---------------------------------------------------------------------------

export type SpotClass = "kerb" | "lane" | "ground" | "facade";

export interface Spot {
  id: number;
  cls: SpotClass;
  x: number;
  z: number;
  /**
   * Kerb and lane: the road heading, turned half a circle on the left-hand
   * side, so an object's local -x always points at the carriageway and its
   * local z runs along the road. Ground: the slot's or the field's rotation.
   * Facade: local +z points out of the building.
   */
  rotationY: number;
  /** Index into `SpotIndex.roads` for kerb and lane spots, otherwise -1. */
  road: number;
  /**
   * Kerb and lane: the longest half-length an object may have along the road
   * and still stay clear of the junction skips. Infinity elsewhere.
   */
  along: number;
  /** Ground: the whole vacant slot, for a hoarding round an empty plot. */
  whole: { w: number; d: number } | null;
  /** Facade: index into `SpotIndex.buildings`, otherwise -1. */
  building: number;
  /** Facade: the width of the face and the height of the building. */
  face: { w: number; h: number } | null;
  taken: boolean;
}

/** An area the ground grid covers: a vacant slot, the green, a field, a band corner. */
export interface GroundArea {
  x: number;
  z: number;
  w: number;
  d: number;
  rotationY: number;
  /** A vacant district slot also offers itself whole, for a hoarding. */
  whole?: boolean;
}

export interface SpotIndexInput {
  /** Every road in the city, highways included. */
  roads: readonly RoadSegment[];
  buildings: readonly Building[];
  /** Static footprints: landmark plots, hero site plots, trees, lamps, the overflow sign. */
  obstacles: readonly OwnedBox[];
  lamps: readonly Vec3[];
  /** Hero incident positions. */
  heroes: readonly { x: number; z: number }[];
  ground: readonly GroundArea[];
  /** Road ids whose kerbs and lanes are kept clear (the overflow queue's road). */
  reserved?: ReadonlySet<string>;
}

export interface SpotIndex {
  roads: readonly RoadSegment[];
  buildings: readonly Building[];
  spots: Spot[];
  /** Kerb, lane and ground spots by grid cell. Whole-plot spots also live in `wholes`. */
  grids: Record<Exclude<SpotClass, "facade">, Map<number, Spot[]>>;
  wholes: Map<number, Spot[]>;
  /** The facade spot of each building, or null when its face is blocked. */
  facades: (Spot | null)[];
  /** Lane spots per road index, so closing one lane can retire its siblings. */
  lanesByRoad: Map<number, Spot[]>;
  /** Buildings and every other static footprint. */
  statics: BoxGrid<OwnedBox>;
  /** Carriageways, owner is the road index as a string. */
  carriageways: BoxGrid<OwnedBox>;
  /** Crowd objects placed so far. */
  crowd: BoxGrid<OwnedBox>;
  bridges: Set<number>;
}

/**
 * The static grids alone: buildings, obstacles and carriageways. The overflow
 * sign is placed against these before the spots are laid out, so no spot is
 * ever offered under it.
 */
export function createIndex(
  roads: readonly RoadSegment[],
  buildings: readonly Building[],
  obstacles: readonly OwnedBox[],
): SpotIndex {
  const statics = new BoxGrid<OwnedBox>();
  for (const building of buildings) statics.insert(buildingBox(building));
  for (const obstacle of obstacles) statics.insert(obstacle);
  const carriageways = new BoxGrid<OwnedBox>();
  roads.forEach((road, index) => carriageways.insert(roadBox(road, String(index))));
  return {
    roads,
    buildings,
    spots: [],
    grids: { kerb: new Map(), lane: new Map(), ground: new Map() },
    wholes: new Map(),
    facades: buildings.map(() => null),
    lanesByRoad: new Map(),
    statics,
    carriageways,
    crowd: new BoxGrid<OwnedBox>(),
    bridges: findBridges(roads),
  };
}

function addToGrid(grid: Map<number, Spot[]>, spot: Spot): void {
  const key = cellKey(cellOf(spot.x), cellOf(spot.z));
  const list = grid.get(key);
  if (list) list.push(spot);
  else grid.set(key, [spot]);
}

/** Lay out every spot. Call once, after `createIndex` and any extra obstacles. */
export function populateSpots(index: SpotIndex, input: SpotIndexInput): SpotIndex {
  const { roads } = index;
  const reserved = input.reserved ?? new Set<string>();
  const lampGrid = new BoxGrid<OwnedBox>();
  for (const [x, , z] of input.lamps) {
    lampGrid.insert({ x, z, hw: LAMP_CLEARANCE, hd: LAMP_CLEARANCE, rot: 0, owner: "lamp" });
  }
  const nearHero = (x: number, z: number): boolean =>
    input.heroes.some((hero) => Math.hypot(hero.x - x, hero.z - z) < HERO_CLEARANCE);
  const nearLamp = (x: number, z: number): boolean =>
    lampGrid.forEachNear(x, z, x, z, (lamp) => Math.hypot(lamp.x - x, lamp.z - z) < LAMP_CLEARANCE);

  const push = (spot: Omit<Spot, "id" | "taken">): Spot => {
    const full: Spot = { ...spot, id: index.spots.length, taken: false };
    index.spots.push(full);
    return full;
  };

  // -- Kerb and lane ------------------------------------------------------
  // A spot where even the smallest crowd form would touch a static footprint
  // or another road is never offered: it could only ever be tested and
  // turned down.
  const roadSpotClear = (x: number, z: number, rot: number, roadIndex: number): boolean => {
    const probe: Box = { x, z, hw: SMALLEST_HALF, hd: SMALLEST_HALF, rot };
    const own = String(roadIndex);
    return (
      !index.statics.hits(probe) && !index.carriageways.hits(probe, (road) => road.owner === own)
    );
  };
  roads.forEach((road, roadIndex) => {
    if (road.kind === "highway" || reserved.has(road.id)) return;
    const dx = road.to[0] - road.from[0];
    const dz = road.to[2] - road.from[2];
    const length = Math.hypot(dx, dz);
    const usable = length - 2 * JUNCTION_SKIP;
    const count = Math.floor(usable / KERB_PITCH);
    if (count < 1) return;
    const ux = dx / length;
    const uz = dz / length;
    // Right of the direction of travel, which is local +x at the road heading.
    const rx = uz;
    const rz = -ux;
    const heading = Math.atan2(dx, dz);
    const start = JUNCTION_SKIP + (usable - count * KERB_PITCH) / 2 + KERB_PITCH / 2;
    const kerbLateral = road.width / 2 + SIDEWALK_WIDTH / 2;
    const laneLateral = laneOffset(road.width);
    const laneable = !index.bridges.has(roadIndex);

    for (let k = 0; k < count; k++) {
      const s = start + k * KERB_PITCH;
      const along = Math.min(s - JUNCTION_SKIP, length - JUNCTION_SKIP - s);
      const cx = road.from[0] + ux * s;
      const cz = road.from[2] + uz * s;
      for (const side of [1, -1]) {
        const rotationY = normalizeAngle(side > 0 ? heading : heading + Math.PI);
        const kx = round3(cx + rx * kerbLateral * side);
        const kz = round3(cz + rz * kerbLateral * side);
        if (!nearHero(kx, kz) && !nearLamp(kx, kz) && roadSpotClear(kx, kz, rotationY, roadIndex)) {
          addToGrid(
            index.grids.kerb,
            push({ cls: "kerb", x: kx, z: kz, rotationY, road: roadIndex, along, whole: null, building: -1, face: null }),
          );
        }
        if (!laneable) continue;
        const lx = round3(cx + rx * laneLateral * side);
        const lz = round3(cz + rz * laneLateral * side);
        if (nearHero(lx, lz) || !roadSpotClear(lx, lz, rotationY, roadIndex)) continue;
        const spot = push({ cls: "lane", x: lx, z: lz, rotationY, road: roadIndex, along, whole: null, building: -1, face: null });
        addToGrid(index.grids.lane, spot);
        const list = index.lanesByRoad.get(roadIndex);
        if (list) list.push(spot);
        else index.lanesByRoad.set(roadIndex, [spot]);
      }
    }
  });

  // -- Ground -------------------------------------------------------------
  const probe = (x: number, z: number): Box => ({ x, z, hw: 0.5, hd: 0.5, rot: 0 });
  const groundClear = (x: number, z: number): boolean =>
    !nearHero(x, z) &&
    !index.statics.hits(probe(x, z)) &&
    !index.carriageways.hits(probe(x, z), undefined, SIDEWALK_WIDTH);
  for (const area of input.ground) {
    const c = Math.cos(area.rotationY);
    const s = Math.sin(area.rotationY);
    const toWorld = (lx: number, lz: number): [number, number] => [
      round3(area.x + lx * c + lz * s),
      round3(area.z - lx * s + lz * c),
    ];
    const rotationY = normalizeAngle(area.rotationY);
    if (area.whole) {
      const spot = push({
        cls: "ground",
        x: round3(area.x),
        z: round3(area.z),
        rotationY,
        road: -1,
        along: Infinity,
        whole: { w: area.w, d: area.d },
        building: -1,
        face: null,
      });
      addToGrid(index.wholes, spot);
    }
    const nx = Math.max(1, Math.floor(area.w / GROUND_PITCH));
    const nz = Math.max(1, Math.floor(area.d / GROUND_PITCH));
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < nz; j++) {
        const [x, z] = toWorld(
          ((i + 0.5) * area.w) / nx - area.w / 2,
          ((j + 0.5) * area.d) / nz - area.d / 2,
        );
        if (!groundClear(x, z)) continue;
        addToGrid(
          index.grids.ground,
          push({ cls: "ground", x, z, rotationY, road: -1, along: Infinity, whole: null, building: -1, face: null }),
        );
      }
    }
  }

  // -- Facades ------------------------------------------------------------
  index.buildings.forEach((building, buildingIndex) => {
    const spot = facadeFor(index, building, buildingIndex);
    if (spot) index.facades[buildingIndex] = push(spot);
  });

  return index;
}

/** Distance from a point to a segment, and the nearest point on it. */
function nearestOnRoad(x: number, z: number, road: RoadSegment): { d: number; px: number; pz: number } {
  const [ax, , az] = road.from;
  const dx = road.to[0] - ax;
  const dz = road.to[2] - az;
  const lengthSq = dx * dx + dz * dz;
  const t = lengthSq === 0 ? 0 : Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / lengthSq));
  const px = ax + t * dx;
  const pz = az + t * dz;
  return { d: Math.hypot(x - px, z - pz), px, pz };
}

/**
 * The face of a building that looks at its nearest road, as a scaffold spot:
 * a slab `FACADE_DEPTH` deep standing just outside that face, the full width
 * of it. Null when the slab would reach a carriageway or another footprint.
 */
function facadeFor(
  index: SpotIndex,
  building: Building,
  buildingIndex: number,
): Omit<Spot, "id" | "taken"> | null {
  const [x, , z] = building.position;
  let best: { d: number; px: number; pz: number } | null = null;
  for (let reach = SPOT_CELL; reach <= SPOT_CELL * 16 && !best; reach *= 2) {
    index.carriageways.forEachNear(x - reach, z - reach, x + reach, z + reach, (box) => {
      const hit = nearestOnRoad(x, z, index.roads[Number(box.owner)]);
      if (hit.d <= reach && (!best || hit.d < best.d)) best = hit;
    });
  }
  if (!best) return null;
  const { px, pz } = best as { d: number; px: number; pz: number };
  const tx = px - x;
  const tz = pz - z;

  const c = Math.cos(building.rotationY);
  const s = Math.sin(building.rotationY);
  // Outward normals of the four faces, with the half depth behind each and
  // the width along it.
  const faces = [
    { nx: c, nz: -s, depth: building.size[0] / 2, width: building.size[2] },
    { nx: -c, nz: s, depth: building.size[0] / 2, width: building.size[2] },
    { nx: s, nz: c, depth: building.size[2] / 2, width: building.size[0] },
    { nx: -s, nz: -c, depth: building.size[2] / 2, width: building.size[0] },
  ];
  let face = faces[0];
  let score = -Infinity;
  for (const candidate of faces) {
    const dot = candidate.nx * tx + candidate.nz * tz;
    if (dot > score + 1e-9) {
      score = dot;
      face = candidate;
    }
  }
  const offset = face.depth + FACADE_GAP + FACADE_DEPTH / 2;
  const spot = {
    cls: "facade" as const,
    x: round3(x + face.nx * offset),
    z: round3(z + face.nz * offset),
    rotationY: normalizeAngle(Math.atan2(face.nx, face.nz)),
    road: -1,
    along: Infinity,
    whole: null,
    building: buildingIndex,
    face: { w: round3(face.width), h: round3(building.size[1]) },
  };
  const slab: Box = { x: spot.x, z: spot.z, hw: spot.face.w / 2, hd: FACADE_DEPTH / 2, rot: spot.rotationY };
  if (index.carriageways.hits(slab)) return null;
  if (index.statics.hits(slab, (item) => item.owner === building.id)) return null;
  return spot;
}

// ---------------------------------------------------------------------------
// Queries and claims
// ---------------------------------------------------------------------------

/**
 * Whether `box` may stand at `spot`: it stays between the junction skips of
 * a road spot, keeps off every other carriageway (a ground object keeps off
 * the pavements too), and touches no static footprint and no crowd object.
 */
export function fits(index: SpotIndex, spot: Spot, box: Box): boolean {
  if (spot.cls === "kerb" || spot.cls === "lane") {
    if (box.hd > spot.along + 1e-9) return false;
    const own = String(spot.road);
    if (index.carriageways.hits(box, (road) => road.owner === own)) return false;
  } else if (spot.cls === "ground") {
    if (index.carriageways.hits(box, undefined, SIDEWALK_WIDTH)) return false;
  } else if (index.carriageways.hits(box)) {
    return false;
  }
  const host = spot.building >= 0 ? index.buildings[spot.building].id : null;
  if (index.statics.hits(box, host ? (item) => item.owner === host : undefined)) return false;
  return !index.crowd.hits(box);
}

/**
 * Take a spot for a crowd object. Every other free spot whose centre falls
 * under the object's footprint is retired with it, so later searches never
 * test them again.
 */
export function claim(index: SpotIndex, spot: Spot, box: Box, owner: string): void {
  spot.taken = true;
  index.crowd.insert({ ...box, owner });
  const { minX, maxX, minZ, maxZ } = boxAabb(box);
  const retire = (list: Spot[] | undefined): void => {
    if (!list) return;
    for (const other of list) {
      if (!other.taken && pointInBox(box, other.x, other.z)) other.taken = true;
    }
  };
  for (let i = cellOf(minX); i <= cellOf(maxX); i++) {
    for (let j = cellOf(minZ); j <= cellOf(maxZ); j++) {
      const key = cellKey(i, j);
      retire(index.grids.kerb.get(key));
      retire(index.grids.lane.get(key));
      retire(index.grids.ground.get(key));
      retire(index.wholes.get(key));
    }
  }
}

export type SpotSource = Exclude<SpotClass, "facade"> | "whole";

/** Nearest-first selection passes before `nearestSpot` sorts instead. */
const SELECT_TRIES = 12;

const gridFor = (index: SpotIndex, source: SpotSource): Map<number, Spot[]> =>
  source === "whole" ? index.wholes : index.grids[source];

/**
 * The nearest free spot from any of `sources` within `maxDistance` of
 * `(x, z)` that `accept` takes. Searches the grid ring by ring and tests
 * candidates nearest first, so the answer is the true nearest acceptable
 * spot, not merely a near one. Ties break on spot id, which keeps it
 * deterministic.
 */
export function nearestSpot(
  index: SpotIndex,
  sources: readonly SpotSource[],
  x: number,
  z: number,
  maxDistance: number,
  accept: (spot: Spot) => boolean,
): Spot | null {
  const ci = cellOf(x);
  const cj = cellOf(z);
  const rings = Math.ceil(maxDistance / SPOT_CELL) + 1;
  const grids = sources.map((source) => gridFor(index, source));
  // Candidates not yet tested, with their distances.
  const pool: Spot[] = [];
  const dist: number[] = [];
  // How far the point is from the edge of its own cell, per side.
  const inX = Math.min(x - ci * SPOT_CELL, (ci + 1) * SPOT_CELL - x);
  const inZ = Math.min(z - cj * SPOT_CELL, (cj + 1) * SPOT_CELL - z);

  for (let ring = 0; ring <= rings; ring++) {
    for (let i = ci - ring; i <= ci + ring; i++) {
      const edge = i === ci - ring || i === ci + ring;
      for (let j = cj - ring; j <= cj + ring; j += edge ? 1 : 2 * ring || 1) {
        const key = cellKey(i, j);
        for (const grid of grids) {
          const list = grid.get(key);
          if (!list) continue;
          for (const spot of list) {
            if (spot.taken) continue;
            const d = Math.hypot(spot.x - x, spot.z - z);
            if (d <= maxDistance) {
              pool.push(spot);
              dist.push(d);
            }
          }
        }
      }
    }
    // Anything not gathered yet lies outside the block of cells searched so
    // far, so at least this far away.
    const settled = ring >= rings ? Infinity : Math.min(inX, inZ) + ring * SPOT_CELL;
    // Test the settled candidates nearest first; ties break on id. Usually
    // the first or second one is taken, so a few selection passes beat a
    // sort; a crowded neighbourhood falls back to sorting what is left.
    let tries = 0;
    for (;;) {
      if (tries === SELECT_TRIES) {
        const order: number[] = [];
        for (let k = 0; k < pool.length; k++) if (dist[k] < settled) order.push(k);
        order.sort((a, b) => dist[a] - dist[b] || pool[a].id - pool[b].id);
        for (const k of order) {
          const spot = pool[k];
          if (!spot.taken && accept(spot)) return spot;
        }
        let kept = 0;
        for (let k = 0; k < pool.length; k++) {
          if (dist[k] < settled) continue;
          pool[kept] = pool[k];
          dist[kept] = dist[k];
          kept += 1;
        }
        pool.length = kept;
        dist.length = kept;
        break;
      }
      let best = -1;
      for (let k = 0; k < pool.length; k++) {
        if (dist[k] >= settled) continue;
        if (
          best === -1 ||
          dist[k] < dist[best] ||
          (dist[k] === dist[best] && pool[k].id < pool[best].id)
        ) {
          best = k;
        }
      }
      if (best === -1) break;
      const spot = pool[best];
      const last = pool.length - 1;
      pool[best] = pool[last];
      dist[best] = dist[last];
      pool.pop();
      dist.pop();
      tries += 1;
      if (!spot.taken && accept(spot)) return spot;
    }
  }
  return null;
}

/** The road a point sits on the centre line of, or -1. */
export function roadAt(index: SpotIndex, x: number, z: number): number {
  let found = -1;
  let best = 0.01;
  index.carriageways.forEachNear(x, z, x, z, (box) => {
    const road = Number(box.owner);
    const { d } = nearestOnRoad(x, z, index.roads[road]);
    if (d < best || (d === best && road < found)) {
      best = d;
      found = road;
    }
  });
  return found;
}
