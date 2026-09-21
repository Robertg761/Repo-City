/**
 * Deterministic city layout (PLAN.md section 36).
 *
 * Stages 1 to 4 live here: district regions from a squarified treemap, a ring
 * road, major roads on the treemap seams, minor roads subdividing each district
 * into blocks, one building slot per parking space inside those blocks, and the
 * reserved plots the infrastructure landmarks stand on.
 *
 * Nothing in this file reads a PRNG, the clock, or any global. The geometry is
 * a pure function of the district list and the building counts, which is what
 * makes "different seed, same district rects" testable (PLAN.md section 35):
 * the seed only moves props and the jitter inside a slot, never the plan.
 *
 * World conventions, shared with `generator.ts` and the renderer, and written
 * out in full at the top of `types/city.ts`:
 *   +y is up, the ground plane is y = 0, and the city is a square centred on
 *   the origin whose side length is `CityLayout.size` (`CityModel.bounds.size`).
 *   Every `Rect` here is axis aligned on XZ with `x`/`z` at its CENTRE.
 *
 * The city is three concentric things:
 *
 *   ┌──────────────────── ring road ────────────────────┐
 *   │            landmark band (power/fire/info/station) │
 *   │   ┌──────────── district square ──────────────┐    │
 *   │   │ districts …   civic centre   … districts  │    │
 *   │   └────────────────────────────────────────────┘   │
 *   └────────────────────────────────────────────────────┘
 *
 * The landmark band exists because the renderer's infrastructure assemblies are
 * 17 to 26 units across: dropped inside the district square they would sit on
 * top of the buildings, and shrunk to a building slot they would be unreadable.
 */

import type { LandmarkType, RoadSegment } from "@/types/city";

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
  /**
   * Set on the civic plaza only. The building fills its square cell exactly,
   * faces the town hall at this quarter turn, and is capped at `maxHeight` so
   * the hall stays the tallest thing on the plaza.
   */
  facing?: number;
  maxHeight?: number;
}

/** A tree or a lamp the layout placed itself, on the XZ plane. */
export interface PropSpot {
  x: number;
  z: number;
}

/**
 * A reserved plot for one hand-built landmark assembly. `w` runs along the
 * landmark's own x axis and `d` along its own z, i.e. after `rotationY`.
 */
export interface LandmarkPlot {
  x: number;
  z: number;
  w: number;
  d: number;
  rotationY: number;
}

export interface DistrictLayout {
  id: string;
  rect: Rect;
  /** Buildable areas, already inset away from every road. */
  blocks: Rect[];
  /** Ordered from the district centre outwards. */
  slots: Slot[];
}

export interface CivicLayout {
  rect: Rect;
  /** The town hall, at the centre of the civic square. */
  hall: LandmarkPlot;
  /** Around the hall, for the root landmark files (README, the manifest...). */
  buildingSlots: Slot[];
  /** Plaza planting and lighting: the ring positions no building claimed. */
  props: { trees: PropSpot[]; lamps: PropSpot[] };
}

export interface CityLayout {
  /** `CityModel.bounds.size`: side of the square centred on the origin. */
  size: number;
  /** Side of the inner square the districts and civic centre tile. */
  districtSide: number;
  /** Depth of the band between the district square and the ring road. */
  bandDepth: number;
  /** Half-extent of the ring road centreline. */
  ringRadius: number;
  districts: DistrictLayout[];
  civic: CivicLayout;
  /** Power north, fire east, info west, station south, in the band. */
  landmarkPlots: Record<Exclude<LandmarkType, "civic">, LandmarkPlot>;
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

export const ROAD_MAJOR_WIDTH = 7;
export const ROAD_MINOR_WIDTH = 4.5;

const MAJOR_HALF = ROAD_MAJOR_WIDTH / 2;
const MINOR_HALF = ROAD_MINOR_WIDTH / 2;
/** Kerb: how far a building must stay clear of a road edge. */
const KERB = 1.4;
/** Blocks are separated by minor roads; aim for this block side. */
const TARGET_BLOCK = 22;
/**
 * Roughly how many buildings one block holds at a comfortable slot pitch. A
 * district is given no more blocks than its buildings need: cutting a
 * three-file district into four blocks turns one quiet corner into four empty
 * lots with streets between them.
 */
const BUILDINGS_PER_BLOCK = 9;
/**
 * Spacing between building slots. One value for the whole city, so density
 * reads the same in a busy district and a quiet one; a district that cannot
 * fit its buildings at it re-grids tighter (see `planSlots`).
 */
const TARGET_PITCH = 7.2;
/** Terrain kept outside the ring road, for the tree line. */
const OUTER_MARGIN = 4;
/** Free space between the ring road and the landmark band. */
const RING_GAP = 3;
/** Deepest the landmark band ever gets, at the metropolis end of the range. */
const LANDMARK_BAND_MAX = 20;
/** Shallowest it gets: still room for a scaled-down station and a tree line. */
const LANDMARK_BAND_MIN = 12;
/** Fixed number of civic-centre slots for root landmark files. */
export const CIVIC_BUILDING_SLOTS = 5;
/** Breathing room between the town hall, the plaza buildings and the kerb. */
const PLAZA_GAP = 2;
/**
 * Smallest share of a pair of pinwheel arms one of them may take. At a half
 * the regions are symmetric and a quiet district gets the same ground as a
 * busy one; below about 0.4 the civic square stops reading as central.
 */
const REGION_SHARE_MIN = 0.4;
/** Margin kept between the outermost plaza cell and the plaza kerb. */
const PLAZA_SLACK = 0.4;
/** How many plaza positions a degenerate row fits on each side of the hall. */
const ROW_PER_SIDE = Math.ceil(CIVIC_BUILDING_SLOTS / 2);

/**
 * Depth of the band between the district square and the ring road.
 *
 * It scales with the town. A fixed twenty-unit band around a sixty-unit town
 * put a full-size power station and a full-size transit terminal in a ring
 * that was a third of the whole city: infrastructure the size of the place it
 * serves. The band shrinks with the district square, and the landmark plots
 * inside it shrink with the band (see `planLandmarkPlots`).
 */
export function landmarkBandDepth(districtSide: number): number {
  return round3(clamp(4 + 0.12 * districtSide, LANDMARK_BAND_MIN, LANDMARK_BAND_MAX));
}

/**
 * The natural footprint and height of each landmark assembly in
 * `components/city/Landmark.tsx`, in world units. The layout reserves a plot
 * of at most this size and the renderer scales its meshes down when the plot
 * came out smaller, so the two sides can never disagree about how much room a
 * power station needs.
 */
export const NATURAL_LANDMARK_SIZE: Record<LandmarkType, [number, number, number]> = {
  power: [17, 13, 12],
  fire: [18, 9, 15],
  info: [18, 8, 12],
  station: [26, 7, 12],
  civic: [14, 14, 14],
};

/** Reveal windows for the road network, in milliseconds (PLAN.md section 43). */
export const ROAD_REVEAL: { major: readonly [number, number]; minor: readonly [number, number] } = {
  major: [150, 340],
  minor: [320, 560],
};

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

/** Side of the square the districts and the civic centre tile. */
export function districtSquareSide(totalBuildings: number): number {
  const n = clamp(totalBuildings, 1, 600);
  return round3(clamp(40 + 7.2 * Math.sqrt(n), 56, 170));
}

/**
 * Side of the world square: the district square plus the landmark band, the
 * ring road and a margin of open terrain. About 108 units for a ten-building
 * town, about 230 for a three-hundred-building metropolis.
 */
export function cityBoundsSize(totalBuildings: number): number {
  const districtSide = districtSquareSide(totalBuildings);
  return round3(
    districtSide +
      2 * (landmarkBandDepth(districtSide) + RING_GAP + MAJOR_HALF + OUTER_MARGIN),
  );
}

// ---------------------------------------------------------------------------
// Squarified treemap (PLAN.md section 36: "a large district never dwarfs the
// rest", so the weight is sqrt(count + 4), not the count itself)
// ---------------------------------------------------------------------------

export function districtWeight(buildingCount: number): number {
  // Sub-linear, so a large district never dwarfs the rest, but not as flat as
  // a plain square root: at sqrt a four-building district claimed a quarter of
  // the ground a hundred-building one did, and the difference read as an empty
  // lot rather than a quiet quarter.
  return Math.pow(Math.max(0, buildingCount) + 2, 0.8);
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

/**
 * Side of the reserved civic centre cell, given the district square side.
 *
 * It scales with the town rather than bottoming out at a fixed 26: on a
 * sixty-unit district square a 26-unit civic cell was two fifths of the whole
 * place, which left the districts as thin strips around a giant empty square.
 */
function civicSide(districtSide: number): number {
  return round3(Math.max(10, Math.min(clamp(0.3 * districtSide, 18, 46), districtSide - 24)));
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
  districtSide: number,
  civic: number,
  districtCount: number,
  loads?: readonly number[],
): { civicRect: Rect; regions: Rect[] } {
  const h = districtSide / 2;
  const c = civic / 2;
  const arms = districtSide - civic;

  /**
   * Divide the two arms either side of the civic cell between the two groups
   * that will stand on them. Bounded, so the civic cell only ever slides by a
   * fraction of its own width and always keeps the origin inside it: a
   * metropolis with two thirds of its files in one directory should not push
   * its town hall into a corner to say so.
   */
  const split = (a = 1, b = 1): [number, number] => {
    const sum = a + b;
    const share = sum > 0 ? clamp(a / sum, REGION_SHARE_MIN, 1 - REGION_SHARE_MIN) : 0.5;
    const first = arms * share;
    return [first, arms - first];
  };

  if (districtCount >= 4) {
    const [north] = split(loads?.[0], loads?.[1]);
    const [west] = split(loads?.[2], loads?.[3]);
    const z0 = -h + north;
    const z1 = z0 + civic;
    const x0 = -h + west;
    const x1 = x0 + civic;
    return {
      civicRect: rectFromBounds(x0, z0, x1, z1),
      regions: [
        rectFromBounds(-h, -h, h, z0), // north
        rectFromBounds(-h, z1, h, h), // south
        rectFromBounds(-h, z0, x0, z1), // west
        rectFromBounds(x1, z0, h, z1), // east
      ],
    };
  }

  if (districtCount >= 2) {
    const [north] = split(loads?.[0], loads?.[1]);
    const z0 = -h + north;
    const z1 = z0 + civic;
    return {
      civicRect: rectFromBounds(-h, z0, h, z1),
      regions: [rectFromBounds(-h, -h, h, z0), rectFromBounds(-h, z1, h, h)],
    };
  }

  return {
    civicRect: rectFromBounds(-h, -c, h, h),
    regions: [rectFromBounds(-h, -h, h, -c)],
  };
}

/**
 * Spread districts over the regions, then hand the heaviest group the largest
 * region.
 *
 * The previous pass filled each region up to its share of the total area. One
 * district heavier than any single region -- hono's `/src`, two thirds of the
 * repository -- overshot its region and every later district piled into the
 * others in arrival order, which left whole regions holding four files. Packing
 * the groups by weight first and only then matching them to regions by size
 * keeps the busy quarters and the quiet ones at comparable densities, which is
 * what stops a small district reading as a vacant lot.
 */
function assignRegions(items: WeightedItem[], regions: Rect[]): WeightedItem[][] {
  const buckets: WeightedItem[][] = regions.map(() => []);
  const load = regions.map(() => 0);

  // Greedy least-loaded over the weight-sorted districts.
  for (const item of items) {
    let best = 0;
    for (let i = 1; i < buckets.length; i++) {
      if (load[i] < load[best]) best = i;
    }
    buckets[best].push(item);
    load[best] += item.weight;
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
    const moved = buckets[donor].pop() as WeightedItem;
    buckets[empty].push(moved);
    load[donor] -= moved.weight;
    load[empty] += moved.weight;
  }

  const byLoad = buckets
    .map((bucket, index) => ({ bucket, load: load[index], index }))
    .sort((a, b) => b.load - a.load || a.index - b.index);
  const byArea = regions
    .map((rect, index) => ({ area: rect.w * rect.d, index }))
    .sort((a, b) => b.area - a.area || a.index - b.index);

  const out: WeightedItem[][] = regions.map(() => []);
  byArea.forEach((region, rank) => {
    out[region.index] = byLoad[rank].bucket;
  });
  return out;
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

const EPS = 1e-6;

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

  /**
   * Split every segment at every junction, then order and time them.
   *
   * The renderer's traffic (components/city/traffic.ts) builds its road graph
   * from segment ENDPOINTS: a car can only turn where two segments share one.
   * Un-split seams would leave every side street a dead end, so a T-junction
   * has to become a real node.
   */
  build(): RoadSegment[] {
    const pieces = splitAtJunctions(this.drafts);

    // Arterials first, longest first inside each class: the city draws itself
    // outwards from its skeleton (PLAN.md section 43).
    pieces.sort((a, b) => {
      if (a.major !== b.major) return a.major ? -1 : 1;
      const la = segLength(a);
      const lb = segLength(b);
      if (Math.abs(la - lb) > 1e-3) return lb - la;
      return a.x1 - b.x1 || a.z1 - b.z1;
    });

    const majors = pieces.filter((p) => p.major).length;
    const minors = pieces.length - majors;

    return pieces.map((r, index) => ({
      id: `road-${r.major ? "maj" : "min"}-${index}`,
      from: [r.x1, 0, r.z1] as [number, number, number],
      to: [r.x2, 0, r.z2] as [number, number, number],
      width: r.width,
      major: r.major,
      appearAt: r.major
        ? spreadWindow(ROAD_REVEAL.major, index, majors)
        : spreadWindow(ROAD_REVEAL.minor, index - majors, minors),
    }));
  }
}

const segLength = (r: RoadDraft): number => Math.hypot(r.x2 - r.x1, r.z2 - r.z1);

function spreadWindow(window: readonly [number, number], index: number, total: number): number {
  const [start, end] = window;
  if (total <= 1) return Math.round(start);
  return Math.round(start + ((end - start) * clamp(index, 0, total - 1)) / (total - 1));
}

/**
 * Cut axis-aligned segments at every crossing and at every collinear endpoint.
 * Identical pieces are deduplicated; where a major and a minor road overlap the
 * major wins, so a seam never renders as a narrow street.
 */
function splitAtJunctions(drafts: readonly RoadDraft[]): RoadDraft[] {
  const horizontal = drafts.filter((r) => Math.abs(r.z1 - r.z2) < EPS);
  const vertical = drafts.filter((r) => Math.abs(r.x1 - r.x2) < EPS);
  const out = new Map<string, RoadDraft>();

  const emit = (r: RoadDraft, a: number, b: number, horizontalSegment: boolean): void => {
    if (b - a < 0.05) return;
    const piece: RoadDraft = horizontalSegment
      ? { ...r, x1: round3(a), x2: round3(b), z1: r.z1, z2: r.z1 }
      : { ...r, z1: round3(a), z2: round3(b), x1: r.x1, x2: r.x1 };
    const key = `${piece.x1},${piece.z1}|${piece.x2},${piece.z2}`;
    const existing = out.get(key);
    if (!existing || (piece.major && !existing.major)) out.set(key, piece);
  };

  for (const road of horizontal) {
    const lo = Math.min(road.x1, road.x2);
    const hi = Math.max(road.x1, road.x2);
    const cuts = new Set<number>([lo, hi]);
    for (const other of vertical) {
      const zLo = Math.min(other.z1, other.z2);
      const zHi = Math.max(other.z1, other.z2);
      if (road.z1 < zLo - EPS || road.z1 > zHi + EPS) continue;
      if (other.x1 > lo + EPS && other.x1 < hi - EPS) cuts.add(other.x1);
    }
    for (const other of horizontal) {
      if (other === road || Math.abs(other.z1 - road.z1) > EPS) continue;
      for (const x of [other.x1, other.x2]) {
        if (x > lo + EPS && x < hi - EPS) cuts.add(x);
      }
    }
    const ordered = [...cuts].sort((a, b) => a - b);
    for (let i = 0; i < ordered.length - 1; i++) emit(road, ordered[i], ordered[i + 1], true);
  }

  for (const road of vertical) {
    const lo = Math.min(road.z1, road.z2);
    const hi = Math.max(road.z1, road.z2);
    const cuts = new Set<number>([lo, hi]);
    for (const other of horizontal) {
      const xLo = Math.min(other.x1, other.x2);
      const xHi = Math.max(other.x1, other.x2);
      if (road.x1 < xLo - EPS || road.x1 > xHi + EPS) continue;
      if (other.z1 > lo + EPS && other.z1 < hi - EPS) cuts.add(other.z1);
    }
    for (const other of vertical) {
      if (other === road || Math.abs(other.x1 - road.x1) > EPS) continue;
      for (const z of [other.z1, other.z2]) {
        if (z > lo + EPS && z < hi - EPS) cuts.add(z);
      }
    }
    const ordered = [...cuts].sort((a, b) => a - b);
    for (let i = 0; i < ordered.length - 1; i++) emit(road, ordered[i], ordered[i + 1], false);
  }

  return [...out.values()];
}

/**
 * Subdivide a district into blocks, emitting the minor roads between them.
 *
 * The grid follows the district's area, then is coarsened until it has no more
 * blocks than its buildings need. A district of three files laid over four
 * blocks reads as four empty lots with streets through them; laid over one it
 * reads as a small neighbourhood with a green around it, which is what a
 * three-file corner of a repository honestly is.
 */
function subdivide(rect: Rect, roads: RoadSet, buildingCount: number): Rect[] {
  const usable = insetRect(rect, MAJOR_HALF + KERB);
  if (usable.w <= 1 || usable.d <= 1) return [];

  let cols = Math.max(1, Math.round(usable.w / TARGET_BLOCK));
  let rows = Math.max(1, Math.round(usable.d / TARGET_BLOCK));
  const wanted = Math.max(1, Math.ceil(Math.max(0, buildingCount) / BUILDINGS_PER_BLOCK));
  while (cols * rows > wanted && cols + rows > 2) {
    if (cols >= rows && cols > 1) cols -= 1;
    else if (rows > 1) rows -= 1;
    else break;
  }

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
      if (right - left <= 1 || bottom - top <= 1) continue;
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
  // One pitch for the whole city, tightened only where a district cannot fit
  // its buildings at it. Spacing the slots to fill the available ground was
  // what turned a quiet district into a car park: thirty-five buildings at an
  // even nine-unit pitch across a 149 by 52 region read as sprawl, while the
  // same thirty-five around the district centre read as a village with a green
  // around it, which is what the slot order and the park pass then deliver.
  let pitch = TARGET_PITCH;
  let slots = slotsForBlocks(blocks, pitch);
  for (let guard = 0; guard < 32 && slots.length < need && pitch > 3; guard++) {
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
// Stage 6 support: the civic centre and the landmark band
// ---------------------------------------------------------------------------

/**
 * Where the root landmark files stand, as offsets from the hall in units of
 * the ring half-extents, ordered so that every count is symmetric about the
 * plaza's north-south axis.
 *
 *   1 file   due north of the hall
 *   2 files  flanking it, west and east
 *   3 files  north, west, east
 *   4 files  all four sides
 *   5 files  an arc of three across the north, plus the two flankers
 */
const PLAZA_RING: readonly (readonly [number, number][])[] = [
  [],
  [[0, -1]],
  [
    [-1, 0],
    [1, 0],
  ],
  [
    [0, -1],
    [-1, 0],
    [1, 0],
  ],
  [
    [0, -1],
    [-1, 0],
    [1, 0],
    [0, 1],
  ],
  [
    [-1, -1],
    [0, -1],
    [1, -1],
    [-1, 0],
    [1, 0],
  ],
];

/** Quarter turn that points a plaza building's entrance back at the hall. */
function facingHall(x: number, z: number): number {
  if (Math.abs(x) >= Math.abs(z)) return round3(x < 0 ? Math.PI / 2 : -Math.PI / 2);
  return round3(z < 0 ? 0 : Math.PI);
}

/**
 * The civic plaza (PLAN.md sections 10 and 36): the town hall in the middle,
 * the root landmark files arranged around it on a symmetric ring, and trees
 * and lamps on whatever the buildings leave.
 *
 * The old arrangement pinned five cells to the corners of the civic square
 * whatever their size, so a small town got 2.4-unit footprints carrying
 * 16-unit heights -- five pencils around a shed. Here the plaza is sized
 * first, the hall takes a fixed share of it, and each file gets a square cell
 * it fills exactly, a quarter turn that faces the hall, and a height ceiling
 * below the hall's, so the composition reads as civic architecture at any
 * scale.
 *
 * When the civic cell is a shallow full-width band (two or three districts)
 * there is no room north or south of the hall, so the ring degenerates into a
 * row along the band: an avenue of civic buildings rather than a ring.
 */
function planCivic(civicRect: Rect, landmarkFiles: number): CivicLayout {
  const plaza = insetRect(civicRect, MAJOR_HALF + KERB);
  const shortest = Math.max(1, Math.min(plaza.w, plaza.d));
  const longest = Math.max(1, Math.max(plaza.w, plaza.d));
  const count = clamp(Math.round(landmarkFiles), 0, CIVIC_BUILDING_SLOTS);

  // The hall takes what is left after an arm for the files is reserved on the
  // short axis. Sizing it first and the files second was what produced the
  // pencils: a hall at four fifths of the plaza leaves nowhere to put them.
  const wantCell = clamp(shortest * 0.16, 3, 8);
  const ringHall = shortest - 2 * (PLAZA_GAP + wantCell) - PLAZA_SLACK;
  // A ring needs a real arm on the short axis and a hall worth centring. Below
  // that the civic cell is a shallow band, and the files line up along it.
  const asRing = ringHall >= 6;
  const hall = round3(
    clamp(asRing ? ringHall : shortest - PLAZA_SLACK, 5, NATURAL_LANDMARK_SIZE.civic[0]),
  );

  // Room left between the hall and the kerb, on each axis.
  const armShort = shortest / 2 - hall / 2 - PLAZA_GAP;
  const armLong = longest / 2 - hall / 2 - PLAZA_GAP;

  // On a band the files share one arm, so the cell is whatever a full row of
  // them fits into; on a ring each cell has an arm to itself. The row is sized
  // for the maximum either way, so the buildings and the plaza trees that fill
  // the rest of the row land on one grid.
  const cell = round3(
    clamp(
      asRing
        ? Math.min(hall * 0.5, armShort - PLAZA_SLACK, 8)
        : Math.min(hall * 0.5, 8, (armLong - (ROW_PER_SIDE - 1) * PLAZA_GAP) / ROW_PER_SIDE),
      1,
      8,
    ),
  );
  const acrossX = plaza.w >= plaza.d;

  // Ring half-extent: the hall, a gap, then half a cell.
  const ring = round3(hall / 2 + PLAZA_GAP + cell / 2);
  // Anything that would cross the kerb is dropped rather than built on the
  // road; the generator puts the file that lost its place back in its own
  // district, which is where it would have gone past the fifth slot anyway.
  const inPlaza = ([x, z]: [number, number]): boolean =>
    Math.abs(x) + cell / 2 <= plaza.w / 2 + 1e-6 && Math.abs(z) + cell / 2 <= plaza.d / 2 + 1e-6;
  const spots: [number, number][] = (
    asRing
      ? PLAZA_RING[count].map(([ux, uz]) => [ux * ring, uz * ring] as [number, number])
      : rowSpots(count, ring, cell, acrossX ? plaza.w : plaza.d, acrossX)
  ).filter(inPlaza);

  const maxHeight = round3(hall * 0.7);
  const place = (x: number, z: number): Slot => ({
    x: round3(civicRect.x + x),
    z: round3(civicRect.z + z),
    cellW: cell,
    cellD: cell,
    facing: facingHall(x, z),
    maxHeight,
  });

  // Trees on the ring positions no file claimed, so a two-file plaza is still
  // a composition rather than a hall with two sheds and a lot of nothing.
  const usedKeys = new Set(spots.map(([x, z]) => `${round3(x)},${round3(z)}`));
  const allSpots: [number, number][] = asRing
    ? ([...PLAZA_RING[CIVIC_BUILDING_SLOTS], [0, 1] as const] as (readonly [number, number])[]).map(
        ([ux, uz]) => [ux * ring, uz * ring],
      )
    : rowSpots(CIVIC_BUILDING_SLOTS, ring, cell, acrossX ? plaza.w : plaza.d, acrossX);
  const greens: PropSpot[] = allSpots
    .filter((spot) => inPlaza(spot) && !usedKeys.has(`${round3(spot[0])},${round3(spot[1])}`))
    .map(([x, z]) => ({ x: round3(civicRect.x + x), z: round3(civicRect.z + z) }));

  // Lamps on the plaza diagonals, always clear of the ring positions.
  const lampRadius = round3(ring * 0.72);
  const lamps: PropSpot[] = [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ]
    .map(([ux, uz]) => ({
      x: round3(civicRect.x + ux * lampRadius),
      z: round3(civicRect.z + uz * lampRadius),
    }))
    .filter(
      (spot) =>
        Math.abs(spot.x - civicRect.x) + cell / 2 <= plaza.w / 2 &&
        Math.abs(spot.z - civicRect.z) + cell / 2 <= plaza.d / 2,
    );

  return {
    rect: civicRect,
    hall: {
      x: round3(civicRect.x),
      z: round3(civicRect.z),
      w: hall,
      d: hall,
      rotationY: 0,
    },
    buildingSlots: spots.map(([x, z]) => place(x, z)),
    props: { trees: greens, lamps },
  };
}

/**
 * The degenerate ring: a row either side of the hall along whichever axis has
 * the room, alternating so the result stays as symmetric as the count allows.
 */
function rowSpots(
  count: number,
  ring: number,
  cell: number,
  extent: number,
  acrossX: boolean,
): [number, number][] {
  const out: [number, number][] = [];
  // `cell` was already solved so that a row of `ROW_PER_SIDE` fits; the step
  // only shrinks towards that, never below a cell, so two never overlap.
  const room = extent / 2 - cell / 2 - ring;
  const step = Math.max(cell + 0.2, Math.min(cell + PLAZA_GAP, room / (ROW_PER_SIDE - 1)));
  for (let i = 0; i < count; i++) {
    const sign = i % 2 === 0 ? -1 : 1;
    const offset = round3(ring + Math.floor(i / 2) * step);
    out.push(acrossX ? [sign * offset, 0] : [0, sign * offset]);
  }
  return out;
}

/**
 * The four infrastructure landmarks, one per side of the landmark band, facing
 * the city. Power to the north, fire to the east, information to the west and
 * the transit station to the south: a fixed compass so a returning user knows
 * where to look (PLAN.md section 36, "fixed reserved slots").
 */
function planLandmarkPlots(
  districtSide: number,
  ringRadius: number,
): Record<Exclude<LandmarkType, "civic">, LandmarkPlot> {
  const half = districtSide / 2;
  // The clear strip runs from the outer kerb of the district square's edge
  // road to the inner kerb of the ring road.
  const from = half + MAJOR_HALF;
  const to = ringRadius - MAJOR_HALF;
  const centre = round3((from + to) / 2);
  const depth = round3((to - from) * 0.94);
  // Narrow enough to leave the two spokes on this side of the city alone.
  const maxWidth = 0.5 * districtSide;

  const plot = (
    type: Exclude<LandmarkType, "civic">,
    x: number,
    z: number,
    rotationY: number,
  ): LandmarkPlot => {
    const [naturalW, , naturalD] = NATURAL_LANDMARK_SIZE[type];
    // Uniform: the renderer scales the assembly, it never stretches it.
    const scale = Math.min(1, maxWidth / naturalW, depth / naturalD);
    return {
      x,
      z,
      w: round3(naturalW * scale),
      d: round3(naturalD * scale),
      rotationY: round3(rotationY),
    };
  };

  return {
    power: plot("power", 0, -centre, 0),
    fire: plot("fire", centre, 0, -Math.PI / 2),
    info: plot("info", -centre, 0, Math.PI / 2),
    station: plot("station", 0, centre, Math.PI),
  };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Stages 1 to 4 of PLAN.md section 36. Deterministic and seed independent:
 * the same district ids and counts always produce the same rectangles.
 */
export function planLayout(
  districts: LayoutDistrictInput[],
  totalBuildings: number,
  options: { landmarkFiles?: number } = {},
): CityLayout {
  const size = cityBoundsSize(totalBuildings);
  const districtSide = districtSquareSide(totalBuildings);
  const half = districtSide / 2;
  const band = landmarkBandDepth(districtSide);
  const ringRadius = round3(half + band + RING_GAP);
  const civic = civicSide(districtSide);

  const items: WeightedItem[] = districts
    .map((d) => ({ id: d.id, weight: districtWeight(d.buildingCount) }))
    .sort((a, b) => b.weight - a.weight || (a.id < b.id ? -1 : 1));

  // Two passes: group the districts against a symmetric carve, then cut the
  // pinwheel again to what those groups actually weigh. Grouping first is what
  // lets the cuts be weight-aware at all, and because a heavier group was
  // already matched to a larger region the second carve preserves the pairing.
  const symmetric = carveRegions(districtSide, civic, districts.length);
  const buckets = assignRegions(items, symmetric.regions);
  const loads = buckets.map((bucket) => bucket.reduce((sum, item) => sum + item.weight, 0));
  const { civicRect, regions } = carveRegions(districtSide, civic, districts.length, loads);

  const rects = new Map<string, Rect>();
  for (let i = 0; i < regions.length; i++) {
    squarify(buckets[i], regions[i], rects);
  }

  const roads = new RoadSet();

  // Ring road around the whole city.
  const ring = rectFromBounds(-ringRadius, -ringRadius, ringRadius, ringRadius);
  roads.addRectEdges(ring, true);
  // Two spokes per side, clear of the landmark plots in the middle of each.
  const spoke = round3(districtSide / 3);
  for (const offset of [-spoke, spoke]) {
    roads.add(offset, -half, offset, -ringRadius, true);
    roads.add(offset, half, offset, ringRadius, true);
    roads.add(-half, offset, -ringRadius, offset, true);
    roads.add(half, offset, ringRadius, offset, true);
  }

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
    const blocks = subdivide(rect, roads, district.buildingCount);
    const slots = orderSlots(planSlots(blocks, district.buildingCount), rect);
    laidOut.push({ id: district.id, rect, blocks, slots });
  }

  return {
    size,
    districtSide,
    bandDepth: band,
    ringRadius,
    districts: laidOut,
    civic: planCivic(civicRect, options.landmarkFiles ?? CIVIC_BUILDING_SLOTS),
    landmarkPlots: planLandmarkPlots(districtSide, ringRadius),
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

export { clamp, round3, rectFromBounds, insetRect, KERB, MAJOR_HALF, MINOR_HALF };
