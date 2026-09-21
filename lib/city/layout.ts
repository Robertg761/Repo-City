/**
 * Deterministic city layout (PLAN.md section 36).
 *
 * Stages 1 to 4 live here: district regions from a squarified treemap, a ring
 * road, major roads on the treemap seams, minor roads subdividing each district
 * into blocks, and one building slot per parking space inside those blocks.
 *
 * Nothing in this file reads a PRNG, the clock, or any global. The geometry is
 * a pure function of the district list and the building counts, which is what
 * makes "different seed, same district rects" testable (PLAN.md section 35):
 * the seed only moves props and the jitter inside a slot, never the plan.
 *
 * World conventions, shared with `generator.ts` and the renderer:
 *   +y is up, the ground plane is y = 0, and the city is a square centred on
 *   the origin whose side length is `CityLayout.size` (`CityModel.bounds.size`).
 *   Every `Rect` here is axis aligned on XZ with `x`/`z` at its CENTRE.
 */

import type { RoadSegment } from "@/types/city";

/** Axis-aligned rectangle on the XZ plane. `x` and `z` are the centre. */
export interface Rect {
  x: number;
  z: number;
  w: number;
  d: number;
}

/**
 * One reserved parking space for a building-sized object. Slot cells tile their
 * block without overlapping and never touch a road, so anything that stays
 * inside its own cell is guaranteed not to collide with anything else.
 */
export interface Slot {
  x: number;
  z: number;
  /** Maximum footprint the slot can hold, per axis. */
  cellW: number;
  cellD: number;
}

export interface DistrictLayout {
  id: string;
  rect: Rect;
  /** Buildable areas, already inset away from every road. */
  blocks: Rect[];
  /** Ordered from the district centre outwards. */
  slots: Slot[];
}

export type CivicLandmarkSlotId = "power" | "fire" | "info" | "civic";

export interface CivicLayout {
  rect: Rect;
  /** Power at one corner, fire and info at two more, civic hall centred. */
  landmarkSlots: Record<CivicLandmarkSlotId, Slot>;
  /** On the ring road edge, outside the district square. */
  stationSlot: Slot;
  /** Free corner plus the four mid-edge positions, for root landmark files. */
  buildingSlots: Slot[];
}

export interface CityLayout {
  /** `CityModel.bounds.size`: side of the square centred on the origin. */
  size: number;
  /** Side of the inner square the districts and civic centre tile. */
  treemapSide: number;
  /** Half-extent of the ring road centreline. */
  ringRadius: number;
  districts: DistrictLayout[];
  civic: CivicLayout;
  roads: RoadSegment[];
}

export interface LayoutDistrictInput {
  id: string;
  /** Buildings that actually need a slot in this district. */
  buildingCount: number;
}

// ---------------------------------------------------------------------------
// Constants (PLAN.md section 36 and the world conventions above)
// ---------------------------------------------------------------------------

export const ROAD_MAJOR_WIDTH = 2.6;
export const ROAD_MINOR_WIDTH = 1.6;

const MAJOR_HALF = ROAD_MAJOR_WIDTH / 2;
const MINOR_HALF = ROAD_MINOR_WIDTH / 2;
/** Kerb: how far a building must stay clear of a road edge. */
const KERB = 0.45;
/** Blocks are separated by minor roads; aim for this block side. */
const TARGET_BLOCK = 10;
/** Terrain kept outside the ring road, for the station and the tree line. */
const OUTER_MARGIN = 5;
/** Free space between the district square and the ring road centreline. */
const RING_GAP = ROAD_MAJOR_WIDTH;
/** Fixed number of civic-centre slots for root landmark files. */
export const CIVIC_BUILDING_SLOTS = 5;
/** Reserved footprint of a civic landmark, in world units (square). */
export const LANDMARK_FOOTPRINT = 4;
/** Reserved footprint of the transit station on the ring road. */
export const STATION_FOOTPRINT: [number, number] = [5, 3];

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));
const round3 = (n: number): number => Math.round(n * 1000) / 1000;

const rectFromBounds = (x0: number, z0: number, x1: number, z1: number): Rect => ({
  x: (x0 + x1) / 2,
  z: (z0 + z1) / 2,
  w: x1 - x0,
  d: z1 - z0,
});

export const rectMinX = (r: Rect): number => r.x - r.w / 2;
export const rectMaxX = (r: Rect): number => r.x + r.w / 2;
export const rectMinZ = (r: Rect): number => r.z - r.d / 2;
export const rectMaxZ = (r: Rect): number => r.z + r.d / 2;

const insetRect = (r: Rect, by: number): Rect => ({
  x: r.x,
  z: r.z,
  w: Math.max(0, r.w - 2 * by),
  d: Math.max(0, r.d - 2 * by),
});

/** Side of the world square. About 40 units for 20 buildings, 110 for 300. */
export function cityBoundsSize(totalBuildings: number): number {
  const n = clamp(totalBuildings, 1, 600);
  const lo = Math.sqrt(20);
  const hi = Math.sqrt(300);
  const t = (Math.sqrt(n) - lo) / (hi - lo);
  return round3(clamp(40 + 70 * t, 38, 124));
}

// ---------------------------------------------------------------------------
// Squarified treemap (PLAN.md section 36: "a large district never dwarfs the
// rest", so the weight is sqrt(count + 4), not the count itself)
// ---------------------------------------------------------------------------

export function districtWeight(buildingCount: number): number {
  return Math.sqrt(Math.max(0, buildingCount) + 4);
}

interface WeightedItem {
  id: string;
  weight: number;
}

function worstRatio(row: WeightedItem[], rowArea: number, shortSide: number): number {
  const thickness = rowArea / shortSide;
  let worst = 1;
  for (const item of row) {
    const length = (item.weight / rowArea) * shortSide;
    const ratio = Math.max(thickness / length, length / thickness);
    if (ratio > worst) worst = ratio;
  }
  return worst;
}

/**
 * Classic squarified treemap. `items` must already be sorted by weight,
 * descending; weights are areas in the same units as the rectangle.
 */
function squarify(items: WeightedItem[], bounds: Rect, out: Map<string, Rect>): void {
  if (items.length === 0) return;
  const x0 = rectMinX(bounds);
  const z0 = rectMinZ(bounds);
  const x1 = rectMaxX(bounds);
  const z1 = rectMaxZ(bounds);

  if (items.length === 1) {
    out.set(items[0].id, rectFromBounds(x0, z0, x1, z1));
    return;
  }

  const w = x1 - x0;
  const d = z1 - z0;
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  if (total <= 0) {
    out.set(items[0].id, rectFromBounds(x0, z0, x1, z1));
    return;
  }

  // Areas in world units, so the row arithmetic below is plain geometry.
  const scale = (w * d) / total;
  const scaled = items.map((item) => ({ id: item.id, weight: item.weight * scale }));

  // A column when the remaining space is wider than deep, a row otherwise.
  const column = w >= d;
  const shortSide = column ? d : w;

  let rowArea = 0;
  let best = Infinity;
  let count = 0;
  for (let i = 0; i < scaled.length; i++) {
    const nextArea = rowArea + scaled[i].weight;
    const ratio = worstRatio(scaled.slice(0, i + 1), nextArea, shortSide);
    if (i > 0 && ratio > best) break;
    best = ratio;
    rowArea = nextArea;
    count = i + 1;
  }

  const thickness = rowArea / shortSide;
  let cursor = column ? z0 : x0;
  for (let i = 0; i < count; i++) {
    const length = scaled[i].weight / thickness;
    out.set(
      scaled[i].id,
      column
        ? rectFromBounds(x0, cursor, x0 + thickness, cursor + length)
        : rectFromBounds(cursor, z0, cursor + length, z0 + thickness),
    );
    cursor += length;
  }

  const rest = items.slice(count);
  if (rest.length === 0) return;
  squarify(
    rest,
    column ? rectFromBounds(x0 + thickness, z0, x1, z1) : rectFromBounds(x0, z0 + thickness, x1, z1),
    out,
  );
}

// ---------------------------------------------------------------------------
// Stage 2: district regions around a reserved civic centre
// ---------------------------------------------------------------------------

/** Side of the reserved civic centre cell, given the district square side. */
function civicSide(treemapSide: number): number {
  return round3(Math.max(8, Math.min(clamp(0.34 * treemapSide, 16, 26), treemapSide - 12)));
}

/**
 * Cut the district square into a reserved civic cell that contains the origin
 * (so it is always "the treemap cell nearest the origin") plus rectangular
 * regions that tile the rest exactly. Four regions pinwheel around the civic
 * square when there are enough districts to fill them; with three or fewer the
 * civic cell becomes a full-width band and the regions are the two bands above
 * and below it.
 */
function carveRegions(
  treemapSide: number,
  civic: number,
  districtCount: number,
): { civicRect: Rect; regions: Rect[] } {
  const h = treemapSide / 2;
  const c = civic / 2;

  if (districtCount >= 4) {
    return {
      civicRect: rectFromBounds(-c, -c, c, c),
      regions: [
        rectFromBounds(-h, -h, h, -c), // north
        rectFromBounds(-h, c, h, h), // south
        rectFromBounds(-h, -c, -c, c), // west
        rectFromBounds(c, -c, h, c), // east
      ],
    };
  }

  if (districtCount >= 2) {
    return {
      civicRect: rectFromBounds(-h, -c, h, c),
      regions: [rectFromBounds(-h, -h, h, -c), rectFromBounds(-h, c, h, h)],
    };
  }

  return {
    civicRect: rectFromBounds(-h, -c, h, h),
    regions: [rectFromBounds(-h, -h, h, -c)],
  };
}

/** Spread districts over the regions so each region is close to its capacity. */
function assignRegions(items: WeightedItem[], regions: Rect[]): WeightedItem[][] {
  const buckets: WeightedItem[][] = regions.map(() => []);
  const totalArea = regions.reduce((sum, r) => sum + r.w * r.d, 0);
  const totalWeight = items.reduce((sum, i) => sum + i.weight, 0) || 1;
  const remaining = regions.map((r) => (r.w * r.d) / totalArea);

  for (const item of items) {
    let best = 0;
    for (let i = 1; i < regions.length; i++) {
      if (remaining[i] > remaining[best]) best = i;
    }
    buckets[best].push(item);
    remaining[best] -= item.weight / totalWeight;
  }

  // No empty regions: an empty cell would leave a hole in the city.
  for (let guard = 0; guard < regions.length; guard++) {
    const empty = buckets.findIndex((b) => b.length === 0);
    if (empty === -1) break;
    let donor = -1;
    for (let i = 0; i < buckets.length; i++) {
      if (buckets[i].length > 1 && (donor === -1 || buckets[i].length > buckets[donor].length)) {
        donor = i;
      }
    }
    if (donor === -1) break;
    buckets[empty].push(buckets[donor].pop() as WeightedItem);
  }

  return buckets;
}

// ---------------------------------------------------------------------------
// Stages 3 and 4: roads, blocks, slots
// ---------------------------------------------------------------------------

interface RoadDraft {
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  width: number;
  major: boolean;
}

class RoadSet {
  private readonly seen = new Set<string>();
  private readonly drafts: RoadDraft[] = [];

  add(x1: number, z1: number, x2: number, z2: number, major: boolean): void {
    const a = `${round3(x1)},${round3(z1)}`;
    const b = `${round3(x2)},${round3(z2)}`;
    if (a === b) return;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (this.seen.has(key)) return;
    this.seen.add(key);
    this.drafts.push({
      x1: round3(x1),
      z1: round3(z1),
      x2: round3(x2),
      z2: round3(z2),
      width: major ? ROAD_MAJOR_WIDTH : ROAD_MINOR_WIDTH,
      major,
    });
  }

  addRectEdges(rect: Rect, major: boolean): void {
    const x0 = rectMinX(rect);
    const x1 = rectMaxX(rect);
    const z0 = rectMinZ(rect);
    const z1 = rectMaxZ(rect);
    this.add(x0, z0, x1, z0, major);
    this.add(x0, z1, x1, z1, major);
    this.add(x0, z0, x0, z1, major);
    this.add(x1, z0, x1, z1, major);
  }

  build(): RoadSegment[] {
    return this.drafts.map((r, index) => ({
      id: `road-${r.major ? "maj" : "min"}-${index}`,
      from: [r.x1, 0, r.z1] as [number, number, number],
      to: [r.x2, 0, r.z2] as [number, number, number],
      width: r.width,
      major: r.major,
    }));
  }
}

/** Subdivide a district into blocks, emitting the minor roads between them. */
function subdivide(rect: Rect, roads: RoadSet): Rect[] {
  const usable = insetRect(rect, MAJOR_HALF + KERB);
  if (usable.w <= 0.5 || usable.d <= 0.5) return [];

  const cols = Math.max(1, Math.round(usable.w / TARGET_BLOCK));
  const rows = Math.max(1, Math.round(usable.d / TARGET_BLOCK));
  const cellW = usable.w / cols;
  const cellD = usable.d / rows;

  const x0 = rectMinX(usable);
  const z0 = rectMinZ(usable);

  for (let c = 1; c < cols; c++) {
    const x = x0 + c * cellW;
    roads.add(x, rectMinZ(rect), x, rectMaxZ(rect), false);
  }
  for (let r = 1; r < rows; r++) {
    const z = z0 + r * cellD;
    roads.add(rectMinX(rect), z, rectMaxX(rect), z, false);
  }

  const blocks: Rect[] = [];
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      const left = x0 + c * cellW + (c === 0 ? 0 : MINOR_HALF + KERB);
      const right = x0 + (c + 1) * cellW - (c === cols - 1 ? 0 : MINOR_HALF + KERB);
      const top = z0 + r * cellD + (r === 0 ? 0 : MINOR_HALF + KERB);
      const bottom = z0 + (r + 1) * cellD - (r === rows - 1 ? 0 : MINOR_HALF + KERB);
      if (right - left <= 0.5 || bottom - top <= 0.5) continue;
      blocks.push(rectFromBounds(left, top, right, bottom));
    }
  }
  return blocks;
}

const shrinkToGrid = (n: number): number => Math.max(0.1, Math.floor(n * 1000) / 1000 - 0.002);

/** Lay a jittered-grid-ready set of slots over the blocks at the given pitch. */
function slotsForBlocks(blocks: Rect[], pitch: number): Slot[] {
  const slots: Slot[] = [];
  for (const block of blocks) {
    const nx = Math.max(1, Math.floor(block.w / pitch));
    const nz = Math.max(1, Math.floor(block.d / pitch));
    const cellW = block.w / nx;
    const cellD = block.d / nz;
    const x0 = rectMinX(block);
    const z0 = rectMinZ(block);
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < nz; j++) {
        slots.push({
          x: round3(x0 + (i + 0.5) * cellW),
          z: round3(z0 + (j + 0.5) * cellD),
          // Shrunk by a whisker so that rounding the centres to millimetres can
          // never make two neighbouring cells touch.
          cellW: shrinkToGrid(cellW),
          cellD: shrinkToGrid(cellD),
        });
      }
    }
  }
  return slots;
}

/**
 * Enough slots for every building, plus headroom for construction sites.
 * A crowded district never drops a building (PLAN.md section 9 keeps them all):
 * its blocks are re-gridded at a tighter pitch until the buildings fit.
 */
function planSlots(blocks: Rect[], buildingCount: number): Slot[] {
  const need = Math.max(1, Math.ceil((buildingCount + 2) * 1.1));
  const area = blocks.reduce((sum, b) => sum + b.w * b.d, 0);
  let pitch = clamp(Math.sqrt(area / need), 2.2, 5);
  let slots = slotsForBlocks(blocks, pitch);
  for (let guard = 0; guard < 32 && slots.length < need && pitch > 1.3; guard++) {
    pitch *= 0.92;
    slots = slotsForBlocks(blocks, pitch);
  }
  return slots;
}

/** Nearest the district centre first, so the tallest buildings cluster there. */
function orderSlots(slots: Slot[], centre: Rect): Slot[] {
  return [...slots].sort((a, b) => {
    const da = (a.x - centre.x) ** 2 + (a.z - centre.z) ** 2;
    const db = (b.x - centre.x) ** 2 + (b.z - centre.z) ** 2;
    if (da !== db) return da - db;
    if (a.z !== b.z) return a.z - b.z;
    return a.x - b.x;
  });
}

// ---------------------------------------------------------------------------
// Stage 6 support: the civic centre
// ---------------------------------------------------------------------------

function planCivic(civicRect: Rect, ringRadius: number): CivicLayout {
  const side = Math.min(civicRect.w, civicRect.d);
  const inner = side / 2 - (MAJOR_HALF + KERB);
  // Landmark footprints are a fixed 4 x 4 in every city large enough to hold
  // them, so the renderer can model them once; only a toy repository shrinks
  // them. The corner radius `q` then follows, and guarantees that no two civic
  // cells overlap: q >= cell and q >= (hall + cell) / 2.
  const cell = round3(clamp(inner * 0.55, 1, LANDMARK_FOOTPRINT));
  const hall = round3(clamp(cell * 1.25, 1.2, 5));
  const q = round3(inner - cell / 2);

  const slot = (x: number, z: number, size: number): Slot => ({
    x: round3(civicRect.x + x),
    z: round3(civicRect.z + z),
    cellW: size,
    cellD: size,
  });

  return {
    rect: civicRect,
    landmarkSlots: {
      // Power at one corner, fire and info at two others; the fourth corner is
      // left to a root landmark file so the square never reads as symmetrical.
      power: slot(-q, -q, cell),
      fire: slot(q, -q, cell),
      info: slot(-q, q, cell),
      civic: slot(0, 0, hall),
    },
    stationSlot: {
      x: 0,
      z: round3(ringRadius + MAJOR_HALF + 0.4 + 1.5),
      cellW: STATION_FOOTPRINT[0],
      cellD: STATION_FOOTPRINT[1],
    },
    buildingSlots: [
      slot(q, q, cell),
      slot(0, -q, cell),
      slot(q, 0, cell),
      slot(0, q, cell),
      slot(-q, 0, cell),
    ],
  };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Stages 1 to 4 of PLAN.md section 36. Deterministic and seed independent:
 * the same district ids and counts always produce the same rectangles.
 */
export function planLayout(districts: LayoutDistrictInput[], totalBuildings: number): CityLayout {
  const size = cityBoundsSize(totalBuildings);
  const treemapSide = round3(size - 2 * (OUTER_MARGIN + MAJOR_HALF + RING_GAP));
  const ringRadius = round3(treemapSide / 2 + RING_GAP);
  const civic = civicSide(treemapSide);
  const { civicRect, regions } = carveRegions(treemapSide, civic, districts.length);

  const items: WeightedItem[] = districts
    .map((d) => ({ id: d.id, weight: districtWeight(d.buildingCount) }))
    .sort((a, b) => b.weight - a.weight || (a.id < b.id ? -1 : 1));

  const buckets = assignRegions(items, regions);
  const rects = new Map<string, Rect>();
  for (let i = 0; i < regions.length; i++) {
    squarify(buckets[i], regions[i], rects);
  }

  const roads = new RoadSet();

  // Ring road around the whole city.
  const ring = rectFromBounds(-ringRadius, -ringRadius, ringRadius, ringRadius);
  roads.addRectEdges(ring, true);
  // Four spokes connecting the district square to the ring.
  const half = treemapSide / 2;
  roads.add(0, -half, 0, -ringRadius, true);
  roads.add(0, half, 0, ringRadius, true);
  roads.add(-half, 0, -ringRadius, 0, true);
  roads.add(half, 0, ringRadius, 0, true);

  // Major roads on every treemap seam, including the civic centre's edges.
  roads.addRectEdges(civicRect, true);
  const laidOut: DistrictLayout[] = [];
  for (const district of districts) {
    const rect = rects.get(district.id);
    if (!rect) continue;
    roads.addRectEdges(rect, true);
  }

  // Blocks and slots, after every major road exists so nothing is built on one.
  for (const district of districts) {
    const rect = rects.get(district.id);
    if (!rect) continue;
    const blocks = subdivide(rect, roads);
    const slots = orderSlots(planSlots(blocks, district.buildingCount), rect);
    laidOut.push({ id: district.id, rect, blocks, slots });
  }

  return {
    size,
    treemapSide,
    ringRadius,
    districts: laidOut,
    civic: planCivic(civicRect, ringRadius),
    roads: roads.build(),
  };
}

// ---------------------------------------------------------------------------
// Geometry helpers shared with the generator, the stats script and the tests
// ---------------------------------------------------------------------------

/** Shortest distance from a point on the XZ plane to a road centreline. */
export function distanceToRoad(x: number, z: number, road: RoadSegment): number {
  const [ax, , az] = road.from;
  const [bx, , bz] = road.to;
  const dx = bx - ax;
  const dz = bz - az;
  const lengthSq = dx * dx + dz * dz;
  if (lengthSq === 0) return Math.hypot(x - ax, z - az);
  const t = clamp(((x - ax) * dx + (z - az) * dz) / lengthSq, 0, 1);
  return Math.hypot(x - (ax + t * dx), z - (az + t * dz));
}

/** A point at `t` along a road centreline. */
export function pointOnRoad(road: RoadSegment, t: number): { x: number; z: number } {
  return {
    x: round3(road.from[0] + (road.to[0] - road.from[0]) * t),
    z: round3(road.from[2] + (road.to[2] - road.from[2]) * t),
  };
}

export function roadLength(road: RoadSegment): number {
  return Math.hypot(road.to[0] - road.from[0], road.to[2] - road.from[2]);
}

/** Heading of a road, for objects that should lie along it. */
export function roadHeading(road: RoadSegment): number {
  return Math.atan2(road.to[0] - road.from[0], road.to[2] - road.from[2]);
}

export { clamp, round3, rectFromBounds, insetRect };
