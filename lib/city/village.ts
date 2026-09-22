/**
 * The organic village (PLAN.md 76.5, "Village").
 *
 * A village is not a grid. It is a green with a chapel on it, a lane looping
 * the green, a main street running along the green's south side and out of
 * the village east and west, and one lane per district heading out into the
 * country with houses along both sides, each house facing its lane. Landmark
 * plots stand along the main street and fields fill the land between the
 * houses and the edge of the village.
 *
 * Like `layout.ts` this is a pure function of the district list and the
 * counts. It reads no PRNG, no clock and no global: every bend and every
 * jitter comes from `hashString` of the district ids (PLAN.md section 35), so
 * the same repository always grows the same village.
 *
 * Conventions, shared with `layout.ts` and `types/city.ts`: +x is east, +z is
 * SOUTH (the power station of a city stands at -z, "north"), `Rect` has its
 * centre at `x`/`z`. Inside this file a direction is an angle `a` with the
 * unit vector `(cos a, sin a)` on XZ, so 0 is east, pi/2 is south and -pi/2 is
 * north. Anything handed out as a yaw uses the renderer's convention instead,
 * `atan2(dx, dz)`: the rotation that turns a model's local +z to point along
 * (dx, dz).
 *
 * Nothing at the top level of this file may read a value imported from
 * `layout.ts`: the two import each other, and `layout.ts` may still be
 * initialising when this module is evaluated.
 */

import type { FieldPatch, LandmarkType, RoadKind, RoadSegment, Vec3 } from "@/types/city";
import { hashString } from "./prng.ts";
import {
  CIVIC_BUILDING_SLOTS,
  KERB,
  NATURAL_LANDMARK_SIZE,
  ROAD_REVEAL,
  clamp,
  round3,
  type CityLayout,
  type CivicLayout,
  type DistrictLayout,
  type LandmarkPlot,
  type LayoutDistrictInput,
  type PropSpot,
  type Rect,
  type RoadExit,
  type Slot,
} from "./layout.ts";
import { SETTLEMENT_PARAMS } from "./settlement.ts";

// ---------------------------------------------------------------------------
// Parameters (PLAN.md 76.5; the table's numbers come from SETTLEMENT_PARAMS)
// ---------------------------------------------------------------------------

const VILLAGE = SETTLEMENT_PARAMS.village;
/** The main street: `major: true`, width 5. */
const MAIN_WIDTH = VILLAGE.roads.major.width;
/** Every lane, the loop round the green included: width 3.6, `kind: "lane"`. */
const LANE_WIDTH = VILLAGE.roads.minor.width;
const LANE_KIND: RoadKind = VILLAGE.roads.minor.kind;
/** Houses stand at this pitch along a lane. */
const PITCH = VILLAGE.slotPitch;
/** A house cell is a square this big, aligned with its lane. */
export const VILLAGE_CELL = 6;
/**
 * The largest footprint a house may take: `cell / sqrt 2`, rounded down, so
 * the house fits its cell at any rotation and nothing downstream has to know
 * the cell is turned.
 */
export const VILLAGE_HOUSE_MAX = Math.floor((VILLAGE_CELL / Math.SQRT2) * 1000) / 1000;
/** Lane centreline to cell centre: half the lane, the kerb, half a cell. */
const KERB_GAP = 1.4;
const SETBACK = LANE_WIDTH / 2 + KERB_GAP + VILLAGE_CELL / 2;
/** First house position along a lane, measured from the junction. */
const FIRST_HOUSE = 7;
/** A lane joins its parent at least this far from the parent's bends. */
const JUNCTION_CLEAR = 4;
/** Most a lane turns from square to its parent, towards its compass sector. */
const LEAN = 20 * (Math.PI / 180);
/** Clear ground between two roads that do not meet. */
const ROAD_GAP = 2;
/** Loop centreline distance from the green's edge. */
const LOOP_GAP = 4;
/** The green's corners are cut back by this share of its side. */
export const GREEN_CHAMFER_SHARE = 0.2;
/** Target band for `bounds.size`. */
const BOUNDS = VILLAGE.bounds;
/** Terrain kept around the outermost thing in the village (step 8). */
const EDGE_MARGIN = 5;
/**
 * The furthest a house cell may reach from the centre on either axis, so a
 * typical village stays inside its band: `(bounds.max - 2 * margin) / 2`.
 */
const HOUSE_REACH = (BOUNDS.max - 2 * EDGE_MARGIN) / 2;
/** Houses a lane holds before the district is given another one. */
const LANE_CAPACITY = 8;
/**
 * Most lanes a village lays, unless it has more districts than this: past
 * nine, lanes crowd the loop so closely that they only block each other.
 */
const MAX_LANES = 9;

const DEG = Math.PI / 180;

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

interface P {
  x: number;
  z: number;
}

/** A convex polygon, vertices in order. */
type Poly = P[];

const pt = (x: number, z: number): P => ({ x: round3(x), z: round3(z) });
const dirOf = (a: number): P => ({ x: Math.cos(a), z: Math.sin(a) });
const add = (p: P, d: P, s: number): P => ({ x: p.x + d.x * s, z: p.z + d.z * s });
const same = (a: P, b: P): boolean => Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.z - b.z) < 1e-6;
/** The renderer's yaw for something facing along (dx, dz). */
const yawOf = (dx: number, dz: number): number => Math.atan2(dx, dz);

/** A square or rectangle turned to `a`: `along` runs with the direction. */
function box(c: P, a: number, halfAlong: number, halfAcross: number): Poly {
  const u = dirOf(a);
  const v = { x: -u.z, z: u.x };
  const corner = (su: number, sv: number): P => ({
    x: c.x + u.x * halfAlong * su + v.x * halfAcross * sv,
    z: c.z + u.z * halfAlong * su + v.z * halfAcross * sv,
  });
  return [corner(1, 1), corner(1, -1), corner(-1, -1), corner(-1, 1)];
}

const aabb = (minX: number, minZ: number, maxX: number, maxZ: number): Poly => [
  { x: minX, z: minZ },
  { x: maxX, z: minZ },
  { x: maxX, z: maxZ },
  { x: minX, z: maxZ },
];

function pointSegDist(p: P, a: P, b: P): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len = dx * dx + dz * dz;
  const t = len === 0 ? 0 : clamp(((p.x - a.x) * dx + (p.z - a.z) * dz) / len, 0, 1);
  return Math.hypot(p.x - (a.x + t * dx), p.z - (a.z + t * dz));
}

const cross = (o: P, a: P, b: P): number => (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);

function segmentsCross(a: P, b: P, c: P, d: P): boolean {
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/** Shortest distance between two segments; zero when they cross. */
export function segmentDistance(a: P, b: P, c: P, d: P): number {
  if (segmentsCross(a, b, c, d)) return 0;
  return Math.min(pointSegDist(a, c, d), pointSegDist(b, c, d), pointSegDist(c, a, b), pointSegDist(d, a, b));
}

function insideConvex(p: P, poly: Poly): boolean {
  let sign = 0;
  for (let i = 0; i < poly.length; i++) {
    const c = cross(poly[i], poly[(i + 1) % poly.length], p);
    if (Math.abs(c) < 1e-12) continue;
    const s = c > 0 ? 1 : -1;
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

/** Shortest distance from a convex polygon to a segment; zero on contact. */
export function polygonSegmentDistance(poly: Poly, a: P, b: P): number {
  if (insideConvex(a, poly) || insideConvex(b, poly)) return 0;
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    best = Math.min(best, segmentDistance(poly[i], poly[(i + 1) % poly.length], a, b));
    if (best === 0) return 0;
  }
  return best;
}

/**
 * Separating-axis test for two convex polygons. They "overlap" unless some
 * edge normal separates them by at least `gap`.
 */
export function polygonsOverlap(a: Poly, b: Poly, gap = 0): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i];
      const q = poly[(i + 1) % poly.length];
      const nx = q.z - p.z;
      const nz = p.x - q.x;
      const len = Math.hypot(nx, nz) || 1;
      let minA = Infinity;
      let maxA = -Infinity;
      for (const v of a) {
        const s = (v.x * nx + v.z * nz) / len;
        minA = Math.min(minA, s);
        maxA = Math.max(maxA, s);
      }
      let minB = Infinity;
      let maxB = -Infinity;
      for (const v of b) {
        const s = (v.x * nx + v.z * nz) / len;
        minB = Math.min(minB, s);
        maxB = Math.max(maxB, s);
      }
      if (maxA + gap <= minB + 1e-9 || maxB + gap <= minA + 1e-9) return false;
    }
  }
  return true;
}

/** Axis-aligned bounds of a polygon. */
function boundsOf(poly: Poly): { minX: number; minZ: number; maxX: number; maxZ: number } {
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (const v of poly) {
    minX = Math.min(minX, v.x);
    minZ = Math.min(minZ, v.z);
    maxX = Math.max(maxX, v.x);
    maxZ = Math.max(maxZ, v.z);
  }
  return { minX, minZ, maxX, maxZ };
}

/** A deterministic number in [0, 1) from a string: the village's only "randomness". */
const unit = (key: string): number => hashString(key) / 2 ** 53;

// ---------------------------------------------------------------------------
// Roads as polylines ("strokes"), split at their junctions at the end
// ---------------------------------------------------------------------------

interface Stroke {
  points: P[];
  width: number;
  major: boolean;
  kind: RoadKind;
  /** Points where another road joins mid-segment; the stroke is cut there. */
  cuts: P[];
}

interface Seg {
  a: P;
  b: P;
  width: number;
  stroke: Stroke | null;
}

function segmentsOf(strokes: readonly Stroke[]): Seg[] {
  const out: Seg[] = [];
  for (const stroke of strokes) {
    for (let i = 0; i + 1 < stroke.points.length; i++) {
      out.push({ a: stroke.points[i], b: stroke.points[i + 1], width: stroke.width, stroke });
    }
  }
  return out;
}

function strokeLength(points: readonly P[]): number {
  let total = 0;
  for (let i = 0; i + 1 < points.length; i++) {
    total += Math.hypot(points[i + 1].x - points[i].x, points[i + 1].z - points[i].z);
  }
  return total;
}

/** The point `s` units along a polyline, and the direction there. */
function along(points: readonly P[], s: number): { p: P; a: number } {
  let left = s;
  for (let i = 0; i + 1 < points.length; i++) {
    const p = points[i];
    const q = points[i + 1];
    const len = Math.hypot(q.x - p.x, q.z - p.z);
    const a = Math.atan2(q.z - p.z, q.x - p.x);
    if (left <= len || i + 2 === points.length) {
      const t = len === 0 ? 0 : left / len;
      return { p: { x: p.x + (q.x - p.x) * t, z: p.z + (q.z - p.z) * t }, a };
    }
    left -= len;
  }
  return { p: points[0], a: 0 };
}

// ---------------------------------------------------------------------------
// Village plan
// ---------------------------------------------------------------------------

interface Lane {
  districtId: string;
  stroke: Stroke;
  /** Longest this lane may grow without leaving the village's band. */
  maxLength: number;
  /** Heading of each segment, the direction angle `a`. */
  headings: number[];
  /** Arc length of the furthest house, for trimming the dead end. */
  lastHouse: number;
  /** Its end is a junction with branches, so it is never trimmed. */
  branched?: boolean;
}

interface House {
  districtId: string;
  lane: number;
  t: number;
  side: number;
  poly: Poly;
  slot: Slot;
}

interface Obstacle {
  poly: Poly;
  gap: number;
  /**
   * A landmark plot: roads also keep their axis-aligned bounding boxes off
   * it, because that box is what `generator.ts` checks plots against.
   */
  plot?: boolean;
}

export interface VillageOptions {
  landmarkFiles?: number;
}

/**
 * Plan a village. The steps are PLAN.md 76.5's eight, in order: the green,
 * the loop, the main street, landmark plots (reserved before any lane), one
 * or more lanes per district, houses along them, fields, and the bounds.
 */
export function planVillage(
  districts: LayoutDistrictInput[],
  totalBuildings: number,
  options: VillageOptions = {},
): CityLayout {
  const n = Math.max(0, totalBuildings);
  const key = [...districts.map((d) => d.id)].sort().join("|") || "village";

  // -- Step 1: the green ---------------------------------------------------
  const greenSide = round3(clamp(16 + 0.5 * n, 16, 26));
  const g = greenSide / 2;
  const greenRect: Rect = { x: 0, z: 0, w: greenSide, d: greenSide };
  const greenPoly = chamferedSquare(g, greenSide * GREEN_CHAMFER_SHARE);
  const civic = planGreen(greenRect, options.landmarkFiles ?? CIVIC_BUILDING_SLOTS);

  // -- Step 2: the loop ----------------------------------------------------
  // An octagon: a square round the green with its corners cut. Its south side
  // is the main street's centre piece, so the loop has eight segments and the
  // main street runs straight through the village along the green.
  const a = round3(g + LOOP_GAP);
  const b = round3(a / 2);
  const V = [
    pt(-b, -a),
    pt(b, -a),
    pt(a, -b),
    pt(a, b),
    pt(b, a),
    pt(-b, a),
    pt(-a, b),
    pt(-a, -b),
  ];
  const loop: Stroke = {
    points: [V[5], V[6], V[7], V[0], V[1], V[2], V[3], V[4]],
    width: LANE_WIDTH,
    major: false,
    kind: LANE_KIND,
    cuts: [],
  };
  const centre: Stroke = { points: [V[5], V[4]], width: MAIN_WIDTH, major: true, kind: "street", cuts: [] };

  // -- Step 3: the main street, out east and west ------------------------------
  const plotSide = round3(clamp(8.5 + 0.1 * n, 9, 12));
  const halfLength = clamp(24 + 1.6 * n, 30, 55);
  // The plot beside the green needs a straight stretch: clear of the loop's
  // corner, its own width, and a margin before the first bend. The plot by
  // the road out stands across the street, so it only needs the arm to reach
  // a little past the straight.
  const straight = a - b + plotSide + 7.5;
  const armLength = Math.min(55 - b, Math.max(halfLength - b, straight + 16));
  const east = mainArm(V[4], 0, armLength, straight, `${key}:east`);
  const west = mainArm(V[5], Math.PI, armLength, straight, `${key}:west`);

  // The ways out: the main street carried on past each end. Houses and fields
  // keep clear of them whether or not the repository earns a highway.
  const exitsFor = (arm: Stroke): { p: P; a: number } => {
    const last = arm.points[arm.points.length - 1];
    const prev = arm.points[arm.points.length - 2];
    return { p: last, a: Math.atan2(last.z - prev.z, last.x - prev.x) };
  };
  const exitEast = exitsFor(east);
  const exitWest = exitsFor(west);
  const outRoads: Seg[] = [exitEast, exitWest].map((exit) => ({
    a: exit.p,
    b: add(exit.p, dirOf(exit.a), 300),
    width: MAIN_WIDTH,
    stroke: null,
  }));

  // -- Step 6 (reserved first): landmark plots along the main street ----------
  const fixed: Stroke[] = [loop, centre, east, west];
  const fixedSegs = [...segmentsOf(fixed), ...outRoads];
  const greenObstacle: Obstacle = { poly: greenPoly, gap: 1 };
  const hallPoly = aabb(
    civic.hall.x - civic.hall.w / 2,
    civic.hall.z - civic.hall.d / 2,
    civic.hall.x + civic.hall.w / 2,
    civic.hall.z + civic.hall.d / 2,
  );
  const plots: Record<Exclude<LandmarkType, "civic">, LandmarkPlot> = {} as Record<
    Exclude<LandmarkType, "civic">,
    LandmarkPlot
  >;
  const plotPolys: Poly[] = [];
  const place = (type: Exclude<LandmarkType, "civic">, arm: Stroke, atEnd: boolean): void => {
    const plot = plotAlong(arm, type, plotSide, atEnd, fixedSegs, [
      greenObstacle,
      ...plotPolys.map((poly) => ({ poly, gap: 2 })),
    ]);
    plots[type] = plot;
    plotPolys.push(plotPoly(plot));
  };
  place("fire", east, false);
  place("info", west, false);
  place("power", east, true);
  place("station", west, true);

  const staticObstacles: Obstacle[] = [
    greenObstacle,
    { poly: hallPoly, gap: 1 },
    ...plotPolys.map((poly) => ({ poly, gap: 1 })),
  ];

  // -- Steps 4 and 5: lanes and houses ----------------------------------------
  const order = [...districts].sort(
    (x, y) => y.buildingCount - x.buildingCount || (x.id < y.id ? -1 : 1),
  );
  const need = new Map(order.map((d) => [d.id, housesWanted(d.buildingCount)]));
  const laneCount = lanesPerDistrict(order, need);

  // Later passes only when the first could not seat every building, which is
  // rare inside the village budget: the village then grows past its band a
  // step at a time rather than leave a building without a house.
  let result: { lanes: Lane[]; houses: House[]; deficit: Map<string, number> } | null = null;
  let usedReach = HOUSE_REACH;
  for (const reach of [HOUSE_REACH, HOUSE_REACH + 6, HOUSE_REACH + 14, 400]) {
    usedReach = reach;
    result = growLanes(order, laneCount, need, {
      loop,
      main: [centre, east, west],
      fixedSegs,
      obstacles: staticObstacles,
      // A lane leaves the loop four units from the green, so it may pass
      // closer to the grass than a house may stand.
      laneObstacles: [
        { poly: greenPoly, gap: -1 },
        { poly: hallPoly, gap: 0 },
        ...plotPolys.map((poly) => ({ poly, gap: 0, plot: true })),
      ],
      key,
      reach,
    });
    if ([...result.deficit.values()].every((missing) => missing <= 0)) break;
  }
  const { lanes, houses } = result!;

  // Trim every lane to just past its last house: a dead end, not a spur into
  // the fields.
  for (const lane of lanes) {
    if (lane.branched) continue;
    const keep = Math.max(12, lane.lastHouse + VILLAGE_CELL / 2 + 1.5);
    if (strokeLength(lane.stroke.points) > keep + 0.5) {
      lane.stroke.points = cutTo(lane.stroke.points, keep);
    }
  }

  const roadsNow: Stroke[] = [...fixed, ...lanes.map((lane) => lane.stroke)];
  const allSegs = [...segmentsOf(roadsNow), ...outRoads];
  const housePolys = houses.map((house) => house.poly);

  // -- Construction plots: one or two open plots at the end of each district's
  // lanes, where a village grows. They are kept clear of every road's bounding
  // box as well as the road itself, so an axis-aligned site stays clear.
  const sitePolys: Poly[] = [];
  const sitesByDistrict = new Map<string, Slot[]>();
  for (const district of order) {
    const own = lanes.filter((lane) => lane.districtId === district.id);
    const sites: Slot[] = [];
    const around = (): Obstacle[] => [
      ...staticObstacles,
      ...housePolys.map((poly) => ({ poly, gap: 1 })),
      ...sitePolys.map((poly) => ({ poly, gap: 2 })),
    ];
    for (const lane of own) {
      if (sites.length >= 2) break;
      const site = siteAtLaneEnd(lane, allSegs, around(), usedReach);
      if (!site) continue;
      sites.push(site.slot);
      sitePolys.push(site.poly);
    }
    // No room at a lane end: behind one of its own houses instead. A district
    // with houses and no open plot would see its construction built on a
    // house plot beside a slanted lane.
    if (sites.length === 0) {
      for (const house of houses.filter((h) => h.districtId === district.id)) {
        const yaw = house.slot.rotationY ?? 0;
        const behind = Math.atan2(-Math.cos(yaw), -Math.sin(yaw));
        const site = siteNear({ x: house.slot.x, z: house.slot.z }, behind, allSegs, around(), usedReach);
        if (!site) continue;
        sites.push(site.slot);
        sitePolys.push(site.poly);
        break;
      }
    }
    sitesByDistrict.set(district.id, sites);
  }

  // -- Step 8: bounds --------------------------------------------------------
  let extent = g;
  const reach = (poly: Poly, pad = 0): void => {
    for (const v of poly) extent = Math.max(extent, Math.abs(v.x) + pad, Math.abs(v.z) + pad);
  };
  for (const poly of [...housePolys, ...plotPolys, ...sitePolys]) reach(poly);
  for (const seg of segmentsOf(roadsNow)) reach([seg.a, seg.b], seg.width / 2);
  const natural = 2 * extent + 2 * EDGE_MARGIN;
  let size = round3(Math.max(BOUNDS.min, natural));

  // -- Step 7: fields --------------------------------------------------------
  const fieldTarget = clamp(6 + Math.floor(n / 6), 6, 14);
  let fields = planFields(size, allSegs, roadsNow, [
    ...staticObstacles.map((o) => ({ poly: o.poly, gap: o.gap + 1 })),
    ...housePolys.map((poly) => ({ poly, gap: 1.5 })),
    ...sitePolys.map((poly) => ({ poly, gap: 1.5 })),
  ], fieldTarget, key);
  // A village with no room for its fields grows a little, up to its band.
  while (fields.length < 6 && size + 1e-9 < BOUNDS.max) {
    size = round3(Math.min(BOUNDS.max, size + 6));
    fields = planFields(size, allSegs, roadsNow, [
      ...staticObstacles.map((o) => ({ poly: o.poly, gap: o.gap + 1 })),
      ...housePolys.map((poly) => ({ poly, gap: 1.5 })),
      ...sitePolys.map((poly) => ({ poly, gap: 1.5 })),
    ], fieldTarget, key);
  }

  // -- District rects: the bounding box of each district's house cells --------
  const laidOut: DistrictLayout[] = districts.map((district) => {
    const own = houses.filter((house) => house.districtId === district.id);
    const slots = [...own]
      .sort((x, y) => x.t - y.t || x.lane - y.lane || y.side - x.side)
      .map((house) => house.slot);
    slots.push(...(sitesByDistrict.get(district.id) ?? []));
    let rect: Rect;
    if (own.length > 0) {
      const box = boundsOf(own.flatMap((house) => house.poly));
      rect = {
        x: round3((box.minX + box.maxX) / 2),
        z: round3((box.minZ + box.maxZ) / 2),
        w: round3(box.maxX - box.minX),
        d: round3(box.maxZ - box.minZ),
      };
    } else {
      // A district with no house at all still needs somewhere to be: the
      // start of its first lane, or the green.
      const lane = lanes.find((l) => l.districtId === district.id);
      const at = lane ? lane.stroke.points[0] : { x: 0, z: 0 };
      rect = { x: round3(at.x), z: round3(at.z), w: VILLAGE_CELL, d: VILLAGE_CELL };
    }
    return { id: district.id, rect, blocks: [], slots };
  });

  // -- Roads: split at every junction, then ordered and timed -----------------
  const roads = emitRoads([centre, east, west], [loop, ...lanes.map((lane) => lane.stroke)]);
  const lastOf = (arm: Stroke): string => {
    const end = arm.points[arm.points.length - 1];
    const road = roads.find((r) => same({ x: r.to[0], z: r.to[2] }, end));
    return road?.id ?? "";
  };
  const exits: RoadExit[] = [
    { x: exitEast.p.x, z: exitEast.p.z, heading: round3(yawOf(Math.cos(exitEast.a), Math.sin(exitEast.a))), roadId: lastOf(east) },
    { x: exitWest.p.x, z: exitWest.p.z, heading: round3(yawOf(Math.cos(exitWest.a), Math.sin(exitWest.a))), roadId: lastOf(west) },
  ];

  return {
    size,
    // There is no district square, band or ring in a village. These three
    // describe its edge instead, which is where `generator.ts` plants the
    // tree line and the corner groves: the ring's plantation lands on the
    // bounds, the band's just inside it, and both clear every house.
    districtSide: round3(size - 8),
    bandDepth: 4,
    ringRadius: round3(size / 2 - 5),
    districts: laidOut,
    civic,
    landmarkPlots: plots,
    roads,
    tier: "village",
    plaza: { rect: greenRect, surface: "green" },
    fields,
    exits,
  };
}

/** Houses a district asks for: one per building plus a little room to grow. */
function housesWanted(buildings: number): number {
  return Math.max(1, buildings) + Math.max(1, Math.ceil(0.15 * buildings));
}

function chamferedSquare(half: number, cut: number): Poly {
  const c = half - cut;
  return [
    { x: -c, z: -half },
    { x: c, z: -half },
    { x: half, z: -c },
    { x: half, z: c },
    { x: c, z: half },
    { x: -c, z: half },
    { x: -half, z: c },
    { x: -half, z: -c },
  ];
}

// ---------------------------------------------------------------------------
// Step 1: the green, its chapel and the root landmark files round it
// ---------------------------------------------------------------------------

/**
 * The chapel (the civic landmark) stands on the green's north edge facing
 * down it. The root landmark files stand round the green's other three edges
 * facing its middle, on square civic cells like the city plaza's, so the
 * generator treats them exactly as it treats the plaza.
 */
function planGreen(green: Rect, landmarkFiles: number): CivicLayout {
  const g = green.w / 2;
  const hall = round3(clamp(0.36 * green.w, 6, 9));
  const hallPlot: LandmarkPlot = { x: 0, z: round3(-g + hall / 2 + 0.6), w: hall, d: hall, rotationY: 0 };

  const cell = round3(clamp(0.18 * green.w, 3, 4.4));
  const inset = cell / 2 + 0.8;
  const W: [number, number] = [-(g - inset), 0];
  const E: [number, number] = [g - inset, 0];
  const S: [number, number] = [0, g - inset];
  const SW: [number, number] = [-g / 2, g - inset];
  const SE: [number, number] = [g / 2, g - inset];
  const arrangement: [number, number][][] = [[], [S], [W, E], [S, W, E], [W, E, SW, SE], [S, W, E, SW, SE]];
  const count = clamp(Math.round(landmarkFiles), 0, CIVIC_BUILDING_SLOTS);
  const facing = ([x, z]: [number, number]): number => {
    if (Math.abs(x) >= Math.abs(z)) return round3(x < 0 ? Math.PI / 2 : -Math.PI / 2);
    return round3(z < 0 ? 0 : Math.PI);
  };
  const maxHeight = round3(hall * 0.7);
  const buildingSlots: Slot[] = arrangement[count].map(([x, z]) => ({
    x: round3(x),
    z: round3(z),
    cellW: cell,
    cellD: cell,
    facing: facing([x, z]),
    maxHeight,
  }));

  // Trees on the green where nothing stands, and a lamp at each cut corner
  // between the green and the loop.
  const taken = [
    ...buildingSlots.map((s) => ({ x: s.x, z: s.z, r: cell / 2 + 1.2 })),
    { x: hallPlot.x, z: hallPlot.z, r: (hall * Math.SQRT2) / 2 + 1.2 },
  ];
  const trees: PropSpot[] = [
    [0, 0.12 * g],
    [-0.62 * g, -0.62 * g],
    [0.62 * g, -0.62 * g],
    ...arrangement[CIVIC_BUILDING_SLOTS].filter(
      ([x, z]) => !buildingSlots.some((s) => Math.abs(s.x - x) < 1e-6 && Math.abs(s.z - z) < 1e-6),
    ),
  ]
    .map(([x, z]) => ({ x: round3(x), z: round3(z) }))
    .filter((spot) => taken.every((t) => Math.hypot(spot.x - t.x, spot.z - t.z) >= t.r));
  const cut = green.w * GREEN_CHAMFER_SHARE;
  const corner = g - cut / 2 + 0.55;
  const lamps: PropSpot[] = [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ].map(([sx, sz]) => ({ x: round3(sx * corner), z: round3(sz * corner) }));

  return { rect: green, hall: hallPlot, buildingSlots, props: { trees, lamps } };
}

// ---------------------------------------------------------------------------
// Step 3: the main street
// ---------------------------------------------------------------------------

/**
 * One arm of the main street: two or three segments from `start`, the first
 * straight on from the green, each later one bent 8 to 18 degrees. The bends
 * alternate, so the street wanders but keeps its line out of the village.
 */
function mainArm(start: P, heading: number, length: number, straight: number, key: string): Stroke {
  // Three stretches: straight on from the green for at least `straight`, long
  // enough for the plot beside the green; then a bend of 8 to 18 degrees; then
  // the same bend back, so the street leaves the village on its own line.
  // Leaving square to the world keeps the road out's bounding box honest,
  // which is what the generator checks plots and sites against.
  const sign = unit(`${key}:sign`) < 0.5 ? -1 : 1;
  const bend = (8 + 10 * unit(`${key}:bend`)) * DEG;
  const first = Math.min(length - 16, Math.max(length / 3, straight));
  const rest = (length - first) / 2;
  const headings = [heading, heading + sign * bend, heading];
  const points: P[] = [start];
  let at = start;
  headings.forEach((a, i) => {
    at = add(at, dirOf(a), i === 0 ? first : rest);
    points.push(pt(at.x, at.z));
  });
  return { points, width: MAIN_WIDTH, major: true, kind: "street", cuts: [] };
}

// ---------------------------------------------------------------------------
// Step 6: landmark plots
// ---------------------------------------------------------------------------

function plotPoly(plot: LandmarkPlot): Poly {
  const quarter = Math.abs(Math.sin(plot.rotationY)) > 0.5;
  const hw = (quarter ? plot.d : plot.w) / 2;
  const hd = (quarter ? plot.w : plot.d) / 2;
  return aabb(plot.x - hw, plot.z - hd, plot.x + hw, plot.z + hd);
}

/** A road's own footprint and the axis-aligned box round it. */
function roadClear(poly: Poly, segs: readonly Seg[], kerb: number): boolean {
  const own = boundsOf(poly);
  for (const seg of segs) {
    const half = seg.width / 2;
    if (polygonSegmentDistance(poly, seg.a, seg.b) < half + kerb - 1e-6) return false;
    // `generator.ts` checks plots against each road's axis-aligned box, which
    // for a slanted road is far bigger than the road. Staying out of the box
    // keeps that check honest for the plots the village reserves.
    const minX = Math.min(seg.a.x, seg.b.x) - half;
    const maxX = Math.max(seg.a.x, seg.b.x) + half;
    const minZ = Math.min(seg.a.z, seg.b.z) - half;
    const maxZ = Math.max(seg.a.z, seg.b.z) + half;
    if (own.minX < maxX + 0.2 && minX < own.maxX + 0.2 && own.minZ < maxZ + 0.2 && minZ < own.maxZ + 0.2) {
      return false;
    }
  }
  return true;
}

const clearOf = (poly: Poly, obstacles: readonly Obstacle[]): boolean =>
  obstacles.every((o) => !polygonsOverlap(poly, o.poly, o.gap));

/**
 * A plot on the north side of a main-street arm, facing the street. Plots
 * turn only by quarter turns, so their bounding box is exact; `atEnd` puts it
 * as near the road out as it fits, otherwise as near the green.
 */
function plotAlong(
  arm: Stroke,
  type: Exclude<LandmarkType, "civic">,
  side: number,
  atEnd: boolean,
  segs: readonly Seg[],
  obstacles: readonly Obstacle[],
): LandmarkPlot {
  const [naturalW, , naturalD] = NATURAL_LANDMARK_SIZE[type];
  const scale = Math.min(1, side / Math.max(naturalW, naturalD));
  const w = round3(naturalW * scale);
  const d = round3(naturalD * scale);
  const length = strokeLength(arm.points);
  // The plot beside the green stands on the street's north side (-z) and
  // faces +z, rotationY 0. The plot by the road out stands across the street
  // on the south side and faces north, a half turn. Opposite sides, so the
  // two plots of one arm never compete for the same frontage.
  const sign = atEnd ? 1 : -1;
  const make = (s: number, extra: number): LandmarkPlot => {
    const { p } = along(arm.points, s);
    return {
      x: round3(p.x),
      z: round3(p.z + sign * (MAIN_WIDTH / 2 + KERB + 0.4 + d / 2 + extra)),
      w,
      d,
      rotationY: atEnd ? round3(Math.PI) : 0,
    };
  };
  // As near its end of the arm and as near the street as it fits, trading
  // one unit back from the kerb for a unit and a half along.
  const tries: [number, number][] = [];
  for (let step = 0; step <= Math.ceil(length); step += 0.5) {
    for (let extra = 0; extra <= 10; extra += 0.5) tries.push([step, extra]);
  }
  tries.sort((p, q) => p[0] + 1.5 * p[1] - (q[0] + 1.5 * q[1]) || p[0] - q[0]);
  for (const [step, extra] of tries) {
    const s = atEnd ? length - w / 2 - step : w / 2 + 1 + step;
    if (s < w / 2 || s > length) continue;
    const plot = make(s, extra);
    const poly = plotPoly(plot);
    if (roadClear(poly, segs, KERB) && clearOf(poly, obstacles)) return plot;
  }
  // Unreachable for any village the band allows; stand it past the end rather
  // than on the road.
  return make(length, 14);
}

// ---------------------------------------------------------------------------
// Steps 4 and 5: lanes and houses
// ---------------------------------------------------------------------------

interface GrowContext {
  loop: Stroke;
  main: Stroke[];
  fixedSegs: Seg[];
  /** What a house keeps clear of. */
  obstacles: Obstacle[];
  /** What a lane keeps clear of. */
  laneObstacles: Obstacle[];
  key: string;
  /**
   * How far from the centre, on either axis, a house may stand. The first
   * pass holds the band; later passes let it out so no building is left out.
   */
  reach: number;
}

/**
 * Lay every lane, then line them with houses. Compass sectors go to districts
 * in weight order: the lanes that leave the loop share the northern arc and
 * the lanes that leave the main street share the southern one, a district's
 * lanes side by side. East and west belong to the main street and its plots.
 */
function growLanes(
  order: LayoutDistrictInput[],
  laneCount: Map<string, number>,
  need: Map<string, number>,
  ctx: GrowContext,
): { lanes: Lane[]; houses: House[]; deficit: Map<string, number> } {
  // Reset the cuts a previous pass made.
  ctx.loop.cuts = [];
  for (const stroke of ctx.main) stroke.cuts = [];

  // Compass sectors, clockwise from due north, handed to the districts in
  // weight order, a district's lanes side by side.
  const members: { id: string; k: number }[] = [];
  for (const district of order) {
    for (let k = 0; k < laneCount.get(district.id)!; k++) members.push({ id: district.id, k });
  }
  const spacing = 360 / Math.max(1, members.length);
  const jitterMax = Math.min(20, 0.3 * spacing);
  const junctions = junctionCandidates(ctx);

  const lanes: Lane[] = [];
  const strokes: Stroke[] = [];
  members.forEach((member, j) => {
    const jitter = (2 * unit(`${member.id}#lane${member.k}`) - 1) * jitterMax;
    const target = (-90 + j * spacing + jitter) * DEG;
    const lane = layLane(member, target, junctions, need, laneCount, ctx, strokes);
    if (lane) {
      lanes.push(lane);
      strokes.push(lane.stroke);
    }
  });

  // Houses, district by district in weight order, nearest the green first.
  const houses: House[] = [];
  const grid = new CellGrid();
  const deficit = new Map<string, number>();
  const allSegs = (): Seg[] => [...ctx.fixedSegs, ...segmentsOf(lanes.map((l) => l.stroke))];
  for (const district of order) {
    const own = lanes
      .map((lane, index) => ({ lane, index }))
      .filter(({ lane }) => lane.districtId === district.id);
    let wanted = need.get(district.id)!;
    // Only the houses its buildings need count as missing; the spare ones
    // are parkland and construction room, nice to have and nothing more.
    const spare = need.get(district.id)! - Math.max(0, district.buildingCount);
    const cursor = new Map<number, number>();
    // Round robin over the district's lanes, one pitch position at a time.
    const fill = (members: { lane: Lane; index: number }[]): void => {
      for (const { index } of members) if (!cursor.has(index)) cursor.set(index, 0);
      let progress = true;
      while (wanted > 0 && progress) {
        progress = false;
        for (const { lane, index } of members) {
          if (wanted <= 0) break;
          const i = cursor.get(index)!;
          const t = FIRST_HOUSE + i * PITCH;
          const length = strokeLength(lane.stroke.points);
          if (t > length - 1.5) {
            if (lane.branched || !extendLane(lane, index, lanes, ctx, grid)) continue;
          }
          cursor.set(index, i + 1);
          progress = true;
          const segs = allSegs();
          for (const side of [1, -1]) {
            if (wanted <= 0) break;
            const house = tryHouse(lane.stroke, district.id, index, t, side, segs, ctx, grid);
            if (!house) continue;
            houses.push(house);
            grid.add(house.poly);
            lane.lastHouse = Math.max(lane.lastHouse, t);
            wanted -= 1;
          }
        }
      }
    };
    fill(own);
    // Still short: the longest lanes fork at their ends into a T, and the
    // branches run round the outside of the village where there is room.
    const byLength = [...own].sort(
      (x, y) => strokeLength(y.lane.stroke.points) - strokeLength(x.lane.stroke.points) || x.index - y.index,
    );
    for (const { lane } of byLength) {
      if (wanted - spare <= 0) break;
      const branches = branchLane(lane, lanes, houses, ctx);
      if (branches.length === 0) continue;
      const added = branches.map((branch) => {
        lanes.push(branch);
        return { lane: branch, index: lanes.length - 1 };
      });
      own.push(...added);
      fill(added);
    }
    deficit.set(district.id, Math.max(0, wanted - spare));
  }

  // A district its lanes could not hold takes houses facing the loop, across
  // the lane from the green, and then along the main street, nearest its own
  // lanes first: the cottages round a village green.
  if ([...deficit.values()].some((missing) => missing > 0)) {
    const segs = allSegs();
    const fronts: { road: Stroke; t: number; side: number; p: P }[] = [];
    const frontage = (road: Stroke, sides: number[]): void => {
      const length = strokeLength(road.points);
      for (let t = PITCH / 2; t < length; t += PITCH) {
        for (const side of sides) fronts.push({ road, t, side, p: along(road.points, t).p });
      }
    };
    frontage(ctx.loop, [loopOutside(ctx.loop)]);
    for (const road of ctx.main) frontage(road, road === ctx.main[0] ? [1] : [1, -1]);
    for (const district of order) {
      let wanted = deficit.get(district.id)!;
      if (wanted <= 0) continue;
      const own = lanes.filter((lane) => lane.districtId === district.id);
      const anchor = own[0]?.stroke.points[0] ?? { x: 0, z: -1 };
      const ranked = [...fronts].sort(
        (x, y) =>
          Math.hypot(x.p.x - anchor.x, x.p.z - anchor.z) - Math.hypot(y.p.x - anchor.x, y.p.z - anchor.z) ||
          x.t - y.t,
      );
      for (const front of ranked) {
        if (wanted <= 0) break;
        const house = tryHouse(front.road, district.id, -1, front.t, front.side, segs, ctx, grid);
        if (!house) continue;
        houses.push({ ...house, t: 1000 + Math.hypot(front.p.x - anchor.x, front.p.z - anchor.z) });
        grid.add(house.poly);
        wanted -= 1;
      }
      deficit.set(district.id, wanted);
    }
  }
  return { lanes, houses, deficit };
}

/**
 * Fork a lane into a T just past its last house: two branches of up to 28
 * units, square to it, with one gentle bend each. Returns the branches that
 * fit; the lane itself then ends at the fork and is never trimmed.
 */
function branchLane(lane: Lane, lanes: readonly Lane[], houses: readonly House[], ctx: GrowContext): Lane[] {
  const fork = lane.lastHouse + VILLAGE_CELL / 2 + KERB + LANE_WIDTH / 2 + 0.5;
  const index = lanes.indexOf(lane);
  let points = lane.stroke.points;
  if (strokeLength(points) + 1e-6 < fork) {
    const grid = new CellGrid();
    for (const house of houses) grid.add(house.poly);
    while (strokeLength(lane.stroke.points) + 1e-6 < fork) {
      if (!extendLane(lane, index, lanes, ctx, grid)) return [];
    }
    points = lane.stroke.points;
  }
  points = cutTo(points, fork);
  const end = points[points.length - 1];
  const prev = points[points.length - 2];
  const a = Math.atan2(end.z - prev.z, end.x - prev.x);
  const parent: Stroke = { ...lane.stroke, points };
  const segs = [
    ...ctx.fixedSegs,
    ...segmentsOf(lanes.filter((l) => l !== lane).map((l) => l.stroke)),
    ...segmentsOf([parent]),
  ];
  const out: Lane[] = [];
  const key = `${lane.districtId}:${end.x}:${end.z}`;
  for (const sign of [1, -1]) {
    const h0 = a + (sign * Math.PI) / 2;
    const maxLength = reachLimit(end, h0, ctx.reach);
    const bend = (8 + 10 * unit(`${key}:${sign}`)) * DEG;
    let laid: Lane | null = null;
    for (const scale of [1, 0.7, 0.5]) {
      const length = Math.min(28, maxLength) * scale;
      if (length < 12 || laid) continue;
      for (const turn of [bend, -bend, 0]) {
        const headings = [h0, h0 + turn];
        const branch = polyline(end, headings, length);
        if (!insideReach(branch, ctx.reach)) continue;
        const others = [...segs, ...segmentsOf(out.map((b) => b.stroke))];
        if (!laneClear(branch, others, ctx.laneObstacles, parent)) continue;
        const blocked = houses.some((house) =>
          branch.some(
            (p, i) =>
              i + 1 < branch.length &&
              polygonSegmentDistance(house.poly, p, branch[i + 1]) < LANE_WIDTH / 2 + KERB - 1e-6,
          ),
        );
        if (blocked) continue;
        laid = {
          districtId: lane.districtId,
          stroke: { points: branch, width: LANE_WIDTH, major: false, kind: LANE_KIND, cuts: [] },
          maxLength,
          headings,
          lastHouse: 0,
        };
        break;
      }
    }
    if (laid) out.push(laid);
  }
  if (out.length > 0) {
    lane.stroke.points = points;
    lane.branched = true;
  }
  return out;
}

/** Which side of the loop, +1 or -1 in `tryHouse` terms, faces away from the green. */
function loopOutside(loop: Stroke): number {
  const { p, a } = along(loop.points, strokeLength(loop.points) / 2);
  const normal = { x: -Math.sin(a), z: Math.cos(a) };
  return normal.x * p.x + normal.z * p.z > 0 ? 1 : -1;
}

/**
 * How many lanes each district gets: enough for its houses at
 * `LANE_CAPACITY` a lane, but never more than `MAX_LANES` in all, because
 * lanes packed tighter than that only block each other's houses. Every
 * district with a building keeps at least one, and the one with the most
 * gives them up first. A district with no building gets no lane: it has
 * nothing to put along it.
 */
function lanesPerDistrict(order: readonly LayoutDistrictInput[], need: Map<string, number>): Map<string, number> {
  const count = new Map(
    order.map((d) => [d.id, d.buildingCount > 0 ? Math.max(1, Math.ceil(need.get(d.id)! / LANE_CAPACITY)) : 0]),
  );
  const occupied = order.filter((d) => d.buildingCount > 0).length;
  let total = [...count.values()].reduce((sum, m) => sum + m, 0);
  while (total > Math.max(MAX_LANES, occupied)) {
    const most = Math.max(...count.values());
    const heaviest = order.find((d) => count.get(d.id)! > 1 && count.get(d.id)! === most);
    if (!heaviest) break;
    count.set(heaviest.id, count.get(heaviest.id)! - 1);
    total -= 1;
  }
  return count;
}

/** A place a lane may leave a road from, square to it. */
interface Junction {
  p: P;
  stroke: Stroke;
  /** Direction angle of the road's normal on the side the lane leaves by. */
  normal: number;
  /** Compass angle, from the centre, of where a lane from here heads. */
  bearing: number;
}

/**
 * Every place a lane could join: along the loop on its outside, along the
 * main street's middle on its south side (its north side is the green), and
 * along both arms on both sides. A junction keeps `JUNCTION_CLEAR` from its
 * road's bends and ends, so no sliver of road is left between them.
 */
function junctionCandidates(ctx: GrowContext): Junction[] {
  const out: Junction[] = [];
  const walk = (stroke: Stroke, sides: (normal: number, p: P) => boolean): void => {
    for (let i = 0; i + 1 < stroke.points.length; i++) {
      const a = stroke.points[i];
      const b = stroke.points[i + 1];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const angle = Math.atan2(b.z - a.z, b.x - a.x);
      for (let s = JUNCTION_CLEAR; s <= len - JUNCTION_CLEAR + 1e-9; s += 1.5) {
        const p = pt(a.x + ((b.x - a.x) * s) / len, a.z + ((b.z - a.z) * s) / len);
        for (const normal of [angle + Math.PI / 2, angle - Math.PI / 2]) {
          if (!sides(normal, p)) continue;
          const ahead = add(p, dirOf(normal), 25);
          out.push({ p, stroke, normal, bearing: Math.atan2(ahead.z, ahead.x) });
        }
      }
    }
  };
  walk(ctx.loop, (normal, p) => Math.cos(normal) * p.x + Math.sin(normal) * p.z > 0);
  const [centre, ...arms] = ctx.main;
  walk(centre, (normal) => Math.sin(normal) > 0);
  for (const arm of arms) walk(arm, () => true);
  return out;
}

/** Lanes start at least this far apart, so houses fit between them. */
const LANE_SPACING = 13;

/**
 * One lane, for the compass bearing `target`: from the junction nearest that
 * bearing, square to its road and turned towards the bearing by at most 20
 * degrees, then two or three segments with alternating bends of 8 to 18
 * degrees, `3.5 * houses + 8` long. A lane that would come too close to
 * another road or a plot is bent the other way, straightened, shortened, or
 * moved to the next junction round; one that fits nowhere within 40 degrees
 * of its bearing is left out, and its district's houses go elsewhere.
 */
function layLane(
  member: { id: string; k: number },
  target: number,
  junctions: readonly Junction[],
  need: Map<string, number>,
  laneCount: Map<string, number>,
  ctx: GrowContext,
  laid: readonly Stroke[],
): Lane | null {
  const key = `${member.id}#${member.k}`;
  const houses = Math.ceil(need.get(member.id)! / laneCount.get(member.id)!);
  const wantLength = 3.5 * houses + 8;
  const segments = 2 + (hashString(`${key}:segments`) % 2);
  const sign0 = unit(`${key}:sign`) < 0.5 ? -1 : 1;
  const bends = [0, (8 + 10 * unit(`${key}:bend1`)) * DEG, (8 + 10 * unit(`${key}:bend2`)) * DEG];
  const segs = [...ctx.fixedSegs, ...segmentsOf(laid)];
  const starts = laid.map((stroke) => stroke.points[0]);

  const ranked = junctions
    .map((junction, index) => ({ junction, index, off: Math.abs(wrap(junction.bearing - target)) }))
    .filter(({ off }) => off <= 40 * DEG)
    .sort((x, y) => x.off - y.off || x.index - y.index)
    .map(({ junction }) => junction)
    .filter((j) => starts.every((s) => Math.hypot(s.x - j.p.x, s.z - j.p.z) >= LANE_SPACING))
    .slice(0, 48);

  // Full length at any junction first; only then a shorter lane.
  for (const scale of [1, 0.75, 0.5]) {
    for (const junction of ranked) {
      const start = junction.p;
      // Square to the road, turned towards its bearing: square enough for a
      // house either side at the junction, turned enough to fan apart.
      const heading = junction.normal + clamp(wrap(target - junction.normal), -LEAN, LEAN);
      const maxLength = reachLimit(start, heading, ctx.reach);
      const length = Math.min(wantLength, maxLength) * scale;
      if (length < 10) continue;
      for (const flip of [1, -1, 0]) {
        const headings = [heading];
        for (let i = 1; i < segments; i++) {
          const turn = flip === 0 ? 0 : (i % 2 === 1 ? 1 : -1) * sign0 * flip * bends[i];
          headings.push(headings[i - 1] + turn);
        }
        const points = polyline(start, headings, length);
        if (!insideReach(points, ctx.reach)) continue;
        if (!laneClear(points, segs, ctx.laneObstacles, junction.stroke)) continue;
        const stroke: Stroke = { points, width: LANE_WIDTH, major: false, kind: LANE_KIND, cuts: [] };
        if (!junction.stroke.points.some((v) => same(v, start))) junction.stroke.cuts.push(start);
        return { districtId: member.id, stroke, maxLength, headings, lastHouse: 0 };
      }
    }
  }
  return null;
}

/** An angle folded into (-pi, pi]. */
function wrap(a: number): number {
  let out = a % (2 * Math.PI);
  if (out <= -Math.PI) out += 2 * Math.PI;
  if (out > Math.PI) out -= 2 * Math.PI;
  return out;
}

function polyline(start: P, headings: readonly number[], length: number): P[] {
  const points: P[] = [start];
  let at = start;
  for (const a of headings) {
    at = add(at, dirOf(a), length / headings.length);
    points.push(pt(at.x, at.z));
  }
  return points;
}

/** How far a lane may run before a house beside its end leaves the band. */
function reachLimit(start: P, a: number, reach: number): number {
  const limit = reach - SETBACK - VILLAGE_CELL / 2;
  const d = dirOf(a);
  let t = Infinity;
  if (Math.abs(d.x) > 1e-9) t = Math.min(t, ((d.x > 0 ? limit : -limit) - start.x) / d.x);
  if (Math.abs(d.z) > 1e-9) t = Math.min(t, ((d.z > 0 ? limit : -limit) - start.z) / d.z);
  return Math.max(0, t - 1);
}

/** Every point of a lane lies where a house beside it stays inside `reach`. */
function insideReach(points: readonly P[], reach: number): boolean {
  const limit = reach - SETBACK - VILLAGE_CELL / 2 + 1e-6;
  return points.every((p) => Math.abs(p.x) <= limit && Math.abs(p.z) <= limit);
}

/**
 * Clear of every other road by `ROAD_GAP` between kerbs, except where it
 * starts: segments that touch its first point are its junction.
 */
function laneClear(
  points: readonly P[],
  segs: readonly Seg[],
  obstacles: readonly Obstacle[],
  parent: Stroke,
): boolean {
  const start = points[0];
  let walked = 0;
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i];
    const b = points[i + 1];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    for (const seg of segs) {
      let from = a;
      // The first stretch leaves the junction, so it is by definition close
      // to the road it leaves and to whatever else meets near there: past it,
      // the lane keeps clear of those roads like any other, and inside it the
      // lane may not cross one.
      const skip = (seg.width + LANE_WIDTH) / 2 + ROAD_GAP + 1.5;
      if (walked < skip && (seg.stroke === parent || pointSegDist(start, seg.a, seg.b) < skip)) {
        const cut = Math.min(len, skip - walked);
        from = { x: a.x + ((b.x - a.x) * cut) / len, z: a.z + ((b.z - a.z) * cut) / len };
        const own = seg.stroke === parent || pointSegDist(start, seg.a, seg.b) < 1e-6;
        if (!own && segmentsCross(a, from, seg.a, seg.b)) return false;
        if (cut >= len) continue;
      }
      if (segmentDistance(from, b, seg.a, seg.b) < (seg.width + LANE_WIDTH) / 2 + ROAD_GAP) return false;
    }
    walked += len;
    if (!obstaclesClear(a, b, obstacles)) return false;
  }
  return true;
}

/** One lane segment clear of the green, the chapel and the landmark plots. */
function obstaclesClear(a: P, b: P, obstacles: readonly Obstacle[]): boolean {
  const half = LANE_WIDTH / 2;
  const own = aabb(
    Math.min(a.x, b.x) - half,
    Math.min(a.z, b.z) - half,
    Math.max(a.x, b.x) + half,
    Math.max(a.z, b.z) + half,
  );
  for (const o of obstacles) {
    if (polygonSegmentDistance(o.poly, a, b) < half + KERB + o.gap) return false;
    // The same bounding-box honesty as `roadClear`: the generator checks
    // landmark plots against each road's axis-aligned box.
    if (o.plot && polygonsOverlap(own, o.poly, 0.2)) return false;
  }
  return true;
}

/** Everything up to `length` along a polyline. */
function cutTo(points: readonly P[], length: number): P[] {
  const out: P[] = [points[0]];
  let left = length;
  for (let i = 0; i + 1 < points.length; i++) {
    const p = points[i];
    const q = points[i + 1];
    const len = Math.hypot(q.x - p.x, q.z - p.z);
    if (left <= len + 1e-6) {
      const t = len === 0 ? 0 : left / len;
      out.push(pt(p.x + (q.x - p.x) * t, p.z + (q.z - p.z) * t));
      return out;
    }
    out.push(q);
    left -= len;
  }
  return out;
}

/** Lengthen a lane's last segment by one pitch, if the new stretch is clear. */
function extendLane(lane: Lane, index: number, lanes: readonly Lane[], ctx: GrowContext, grid: CellGrid): boolean {
  const points = lane.stroke.points;
  const length = strokeLength(points);
  if (length + PITCH > lane.maxLength + 1e-6) return false;
  const last = points[points.length - 1];
  const prev = points[points.length - 2];
  const a = Math.atan2(last.z - prev.z, last.x - prev.x);
  const next = pt(last.x + Math.cos(a) * PITCH, last.z + Math.sin(a) * PITCH);
  const others = [
    ...ctx.fixedSegs,
    ...segmentsOf(lanes.filter((_, i) => i !== index).map((l) => l.stroke)),
  ];
  const stretch = [last, next];
  for (const seg of others) {
    if (segmentDistance(last, next, seg.a, seg.b) < (seg.width + LANE_WIDTH) / 2 + ROAD_GAP) return false;
  }
  if (!insideReach(stretch, ctx.reach)) return false;
  const half = LANE_WIDTH / 2;
  // The whole lengthened segment, whose bounding box grows with it.
  if (!obstaclesClear(prev, next, ctx.laneObstacles)) return false;
  for (const cell of grid.near({ x: (last.x + next.x) / 2, z: (last.z + next.z) / 2 }, PITCH)) {
    if (polygonSegmentDistance(cell, last, next) < half + KERB - 1e-6) return false;
  }
  lane.stroke.points = [...points.slice(0, -1), next];
  return true;
}

/**
 * A house at `t` along a lane, on one side of it: a lane-aligned square cell,
 * set back `lane.width / 2 + KERB + 3`, turned to face the lane. Rejected when
 * it comes within the kerb of any road or overlaps another cell or a plot.
 */
function tryHouse(
  road: Stroke,
  districtId: string,
  index: number,
  t: number,
  side: number,
  segs: readonly Seg[],
  ctx: GrowContext,
  grid: CellGrid,
): House | null {
  const { p, a } = along(road.points, t);
  const normal = { x: -Math.sin(a), z: Math.cos(a) };
  const setback = road.width / 2 + KERB_GAP + VILLAGE_CELL / 2;
  const c = add(p, normal, side * setback);
  const poly = box(c, a, VILLAGE_CELL / 2, VILLAGE_CELL / 2);
  for (const seg of segs) {
    if (polygonSegmentDistance(poly, seg.a, seg.b) < seg.width / 2 + KERB - 1e-6) return null;
  }
  if (!clearOf(poly, ctx.obstacles)) return null;
  for (const other of grid.near(c, VILLAGE_CELL * 1.5)) {
    if (polygonsOverlap(poly, other, 0.4)) return null;
  }
  if (poly.some((v) => Math.abs(v.x) > ctx.reach || Math.abs(v.z) > ctx.reach)) {
    return null;
  }
  // Facing the road: from the house towards it.
  const yaw = yawOf(-normal.x * side, -normal.z * side);
  return {
    districtId,
    lane: index,
    t,
    side,
    poly,
    slot: {
      x: round3(c.x),
      z: round3(c.z),
      cellW: VILLAGE_HOUSE_MAX,
      cellD: VILLAGE_HOUSE_MAX,
      rotationY: round3(yaw),
    },
  };
}

/** A uniform grid over cell centres, for the overlap check (step 5). */
class CellGrid {
  private readonly buckets = new Map<string, Poly[]>();
  private static readonly SIZE = 8;

  private keyOf(x: number, z: number): string {
    return `${Math.floor(x / CellGrid.SIZE)},${Math.floor(z / CellGrid.SIZE)}`;
  }

  add(poly: Poly): void {
    const c = poly.reduce((acc, v) => ({ x: acc.x + v.x / poly.length, z: acc.z + v.z / poly.length }), { x: 0, z: 0 });
    const k = this.keyOf(c.x, c.z);
    const list = this.buckets.get(k);
    if (list) list.push(poly);
    else this.buckets.set(k, [poly]);
  }

  near(c: P, radius: number): Poly[] {
    const out: Poly[] = [];
    const r = Math.ceil((radius + VILLAGE_CELL) / CellGrid.SIZE);
    const cx = Math.floor(c.x / CellGrid.SIZE);
    const cz = Math.floor(c.z / CellGrid.SIZE);
    for (let i = -r; i <= r; i++) {
      for (let j = -r; j <= r; j++) {
        const list = this.buckets.get(`${cx + i},${cz + j}`);
        if (list) out.push(...list);
      }
    }
    return out;
  }
}

// ---------------------------------------------------------------------------
// Construction plots at the lane ends
// ---------------------------------------------------------------------------

function siteAtLaneEnd(
  lane: Lane,
  segs: readonly Seg[],
  obstacles: readonly Obstacle[],
  reach: number,
): { slot: Slot; poly: Poly } | null {
  const points = lane.stroke.points;
  const end = points[points.length - 1];
  const prev = points[points.length - 2];
  return siteNear(end, Math.atan2(end.z - prev.z, end.x - prev.x), segs, obstacles, reach);
}

/**
 * An open square plot near `end`, looking along direction `a`: beside it
 * first, nearest first, and ahead of it only when nothing beside it is free.
 */
function siteNear(
  end: P,
  a: number,
  segs: readonly Seg[],
  obstacles: readonly Obstacle[],
  reach: number,
): { slot: Slot; poly: Poly } | null {
  const d = dirOf(a);
  const n = { x: -d.z, z: d.x };
  // Beside the dead end first, nearest first; beyond it only when nothing
  // beside it is free, since a plot past the end would widen the village.
  const offsets: [number, number][] = [];
  for (let out = -10; out <= 12; out += 1) {
    for (let lateral = -12; lateral <= 12; lateral += 1.5) offsets.push([out, lateral]);
  }
  const cost = ([out, lateral]: [number, number]): number => (out > 0 ? 100 : 0) + Math.hypot(out, lateral);
  offsets.sort((p, q) => cost(p) - cost(q) || p[0] - q[0] || p[1] - q[1]);
  for (const half of [5, 4.5, 4, 3.5]) {
    for (const [out, lateral] of offsets) {
      const x = round3(end.x + d.x * out + n.x * lateral);
      const z = round3(end.z + d.z * out + n.z * lateral);
      if (Math.max(Math.abs(x), Math.abs(z)) + half > reach + 1e-6) continue;
      const poly = aabb(x - half, z - half, x + half, z + half);
      if (!roadClear(poly, segs, KERB)) continue;
      if (!clearOf(poly, obstacles)) continue;
      return { slot: { x, z, cellW: half * 2, cellD: half * 2 }, poly };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Step 7: fields
// ---------------------------------------------------------------------------

/**
 * Six to fourteen fields between the houses and the edge of the village, each
 * turned to run along its nearest road. A field is `w` across and `d` along
 * the road, in its own frame after `rotationY` (the renderer's yaw), which is
 * the convention `LandmarkPlot` uses too.
 */
function planFields(
  size: number,
  segs: readonly Seg[],
  strokes: readonly Stroke[],
  obstacles: readonly Obstacle[],
  target: number,
  key: string,
): FieldPatch[] {
  const half = size / 2 - 1.5;
  const candidates: { c: P; a: number; key: string }[] = [];
  // Behind the houses of every lane and both arms of the main street.
  strokes.forEach((stroke, si) => {
    if (stroke.kind === LANE_KIND && stroke.points.length > 8) return; // the loop
    const length = strokeLength(stroke.points);
    for (let s = 6; s < length; s += 9) {
      const { p, a } = along(stroke.points, s);
      const normal = { x: -Math.sin(a), z: Math.cos(a) };
      for (const side of [1, -1]) {
        for (const depth of [SETBACK + VILLAGE_CELL / 2 + 8, SETBACK + VILLAGE_CELL / 2 + 20]) {
          candidates.push({ c: add(p, normal, side * depth), a, key: `${key}:f${si}:${s}:${side}:${depth}` });
        }
      }
    }
  });
  // And anywhere else on a grid over the village, turned to the nearest road.
  // These come after the ones behind the houses, so the fields hug the lanes
  // first and fill the open corners with what is left.
  const behind = candidates.length;
  for (let x = -half + 8; x <= half - 8; x += 6) {
    for (let z = -half + 8; z <= half - 8; z += 6) {
      const c = { x, z };
      let best: Seg | null = null;
      let bestD = Infinity;
      for (const seg of segs) {
        if (!seg.stroke) continue;
        const dist = pointSegDist(c, seg.a, seg.b);
        if (dist < bestD) {
          bestD = dist;
          best = seg;
        }
      }
      const a = best ? Math.atan2(best.b.z - best.a.z, best.b.x - best.a.x) : 0;
      candidates.push({ c, a, key: `${key}:g${x}:${z}` });
    }
  }
  const rank = (index: number, k: string): number => (index < behind ? 0 : 1) + unit(k);
  const order = candidates.map((c, i) => ({ c, r: rank(i, c.key) })).sort((x, y) => x.r - y.r);
  candidates.splice(0, candidates.length, ...order.map((o) => o.c));

  const fields: FieldPatch[] = [];
  const polys: Poly[] = [];
  for (const candidate of candidates) {
    if (fields.length >= target) break;
    const alongLength = 12 + 10 * unit(`${candidate.key}:along`);
    const across = 10 + 6 * unit(`${candidate.key}:across`);
    for (const shrink of [1, 0.8, 0.65]) {
      const d = Math.max(10, alongLength * shrink);
      const w = Math.max(10, across * shrink);
      const poly = box(candidate.c, candidate.a, d / 2, w / 2);
      if (poly.some((v) => Math.abs(v.x) > half || Math.abs(v.z) > half)) continue;
      if (segs.some((seg) => polygonSegmentDistance(poly, seg.a, seg.b) < seg.width / 2 + 1.5)) continue;
      if (!clearOf(poly, obstacles)) continue;
      if (polys.some((other) => polygonsOverlap(poly, other, 1.5))) continue;
      polys.push(poly);
      fields.push({
        x: round3(candidate.c.x),
        z: round3(candidate.c.z),
        w: round3(w),
        d: round3(d),
        rotationY: round3(yawOf(Math.cos(candidate.a), Math.sin(candidate.a))),
        crop: (hashString(`${candidate.key}:crop`) % 4) as FieldPatch["crop"],
      });
      break;
    }
  }
  return fields;
}

// ---------------------------------------------------------------------------
// Roads out: split at junctions, ordered outwards, timed
// ---------------------------------------------------------------------------

function piecesOf(stroke: Stroke): [P, P][] {
  const out: [P, P][] = [];
  for (let i = 0; i + 1 < stroke.points.length; i++) {
    const a = stroke.points[i];
    const b = stroke.points[i + 1];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const cuts = stroke.cuts
      .filter((c) => !same(c, a) && !same(c, b) && pointSegDist(c, a, b) < 0.01)
      .map((c) => ({ c, t: Math.hypot(c.x - a.x, c.z - a.z) / Math.max(len, 1e-9) }))
      .sort((x, y) => x.t - y.t);
    let from = a;
    for (const { c } of cuts) {
      out.push([from, c]);
      from = c;
    }
    out.push([from, b]);
  }
  return out;
}

function emitRoads(majors: readonly Stroke[], minors: readonly Stroke[]): RoadSegment[] {
  const toSegment = (piece: [P, P], stroke: Stroke) => ({ piece, stroke });
  // Majors from the green outwards; minors in the order they were laid, the
  // loop first, each lane from its junction to its dead end.
  const majorPieces = majors
    .flatMap((stroke) => piecesOf(stroke).map((piece) => toSegment(piece, stroke)))
    .map((entry, i) => ({ ...entry, i }))
    .sort((x, y) => {
      const mx = Math.hypot((x.piece[0].x + x.piece[1].x) / 2, (x.piece[0].z + x.piece[1].z) / 2);
      const my = Math.hypot((y.piece[0].x + y.piece[1].x) / 2, (y.piece[0].z + y.piece[1].z) / 2);
      return mx - my || x.i - y.i;
    });
  const minorPieces = minors.flatMap((stroke) => piecesOf(stroke).map((piece) => toSegment(piece, stroke)));
  const total = majorPieces.length;
  const spread = (window: readonly [number, number], index: number, count: number): number =>
    count <= 1 ? Math.round(window[0]) : Math.round(window[0] + ((window[1] - window[0]) * index) / (count - 1));
  const segment = (entry: { piece: [P, P]; stroke: Stroke }, index: number, major: boolean, count: number, local: number): RoadSegment => ({
    id: `road-${major ? "maj" : "min"}-${index}`,
    from: [entry.piece[0].x, 0, entry.piece[0].z] as Vec3,
    to: [entry.piece[1].x, 0, entry.piece[1].z] as Vec3,
    width: entry.stroke.width,
    major,
    appearAt: spread(major ? ROAD_REVEAL.major : ROAD_REVEAL.minor, local, count),
    ...(entry.stroke.kind !== "street" ? { kind: entry.stroke.kind } : {}),
  });
  return [
    ...majorPieces.map((entry, i) => segment(entry, i, true, majorPieces.length, i)),
    ...minorPieces.map((entry, i) => segment(entry, total + i, false, minorPieces.length, i)),
  ];
}
