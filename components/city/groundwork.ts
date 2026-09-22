/**
 * Where the pavement goes (PLAN.md sections 36 and 4).
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
 */

import type { CityModel, RoadSegment } from "@/types/city";

/** Width of the raised slab either side of a carriageway. */
export const SIDEWALK_WIDTH = 1.2;
/** Height of that slab above the road surface: the kerb step. */
export const SIDEWALK_HEIGHT = 0.19;

/**
 * Gap left in the pavement at each end of a segment. Segments are split at
 * junctions, so both ends are corners: without this the four slabs meeting
 * there overlap into a lumpy cross, and there is nowhere to paint a crossing.
 * Slightly more than half of the widest carriageway (7 units).
 */
export const JUNCTION_INSET = 4.2;

/** Distance from the junction to the middle of the zebra band. */
const CROSSWALK_AT = 2.3;
const CROSSWALK_ALONG = 1.9;
const STRIPE_ACROSS = 0.42;

/** Dash and gap on the centre line of a major road. */
const DASH_ALONG = 2.8;
const DASH_GAP = 2.8;
const DASH_ACROSS = 0.4;

export interface RoadLay {
  /** The `from` end, which is where the reveal grows from. */
  x: number;
  z: number;
  /** Unit direction towards `to`. */
  dx: number;
  dz: number;
  length: number;
  /** Rotation about y that maps local +z onto the road direction. */
  angle: number;
  width: number;
  major: boolean;
  appearAt: number;
}

export function roadLays(roads: readonly RoadSegment[]): RoadLay[] {
  return roads.map((road) => {
    const dx = road.to[0] - road.from[0];
    const dz = road.to[2] - road.from[2];
    const length = Math.hypot(dx, dz) || 0.001;
    return {
      x: road.from[0],
      z: road.from[2],
      dx: dx / length,
      dz: dz / length,
      length,
      angle: Math.atan2(dx, dz),
      width: Math.max(road.width, 1),
      major: road.major,
      // The generator times the whole reveal (PLAN.md section 43).
      appearAt: road.appearAt,
    };
  });
}

/** A pavement slab: grows with its road, from `start` to `start + along`. */
export interface SidewalkLay {
  /** Index into the `RoadLay[]` this was derived from. */
  road: number;
  lateral: number;
  start: number;
  along: number;
}

/**
 * Two slabs per segment, inset from both junctions. Segments shorter than the
 * two insets plus a stride get none: a two-unit stub of pavement between two
 * crossings reads as litter.
 */
export function sidewalkLays(lays: readonly RoadLay[]): SidewalkLay[] {
  const out: SidewalkLay[] = [];
  lays.forEach((lay, road) => {
    const along = lay.length - JUNCTION_INSET * 2;
    if (along < 3) return;
    const lateral = lay.width / 2 + SIDEWALK_WIDTH / 2;
    out.push({ road, lateral, start: JUNCTION_INSET, along });
    out.push({ road, lateral: -lateral, start: JUNCTION_INSET, along });
  });
  return out;
}

/** A painted mark: appears whole once the road's front has passed it. */
export interface MarkLay {
  road: number;
  /** Centre of the mark along the road. */
  s: number;
  lateral: number;
  along: number;
  across: number;
}

/**
 * Zebra bands at both ends of every segment that meets a junction, which is
 * three or more segment ends at the same point.
 *
 * Deliberately small marks: four stripes on an avenue and three on a side
 * street, less than two units long. A town whose roads are mostly junction to
 * junction ends up with a band every few units, and at full size they were
 * the first thing the eye found in the frame instead of the buildings.
 */
export function crosswalkLays(
  lays: readonly RoadLay[],
  roads: readonly RoadSegment[],
): MarkLay[] {
  const ends = new Map<string, number>();
  const key = (x: number, z: number) => `${Math.round(x * 4)}:${Math.round(z * 4)}`;
  for (const road of roads) {
    for (const [x, , z] of [road.from, road.to]) {
      const k = key(x, z);
      ends.set(k, (ends.get(k) ?? 0) + 1);
    }
  }

  const out: MarkLay[] = [];
  lays.forEach((lay, road) => {
    // Both bands plus room to breathe between them, or the segment is a
    // junction-to-junction stub and one band covers it.
    if (lay.length < CROSSWALK_AT * 2 + CROSSWALK_ALONG * 2 + 2) return;
    const stripes = lay.major ? 4 : 3;
    const pitch = (lay.width * 0.78) / stripes;

    for (const atStart of [true, false]) {
      const end = atStart ? [lay.x, lay.z] : [lay.x + lay.dx * lay.length, lay.z + lay.dz * lay.length];
      // Three arms or more is a junction. Two is the same avenue continuing
      // past a split, and painting a crossing there stripes the open road.
      if ((ends.get(key(end[0], end[1])) ?? 0) < 3) continue;
      const s = atStart ? CROSSWALK_AT : lay.length - CROSSWALK_AT;
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
 * The dashed centre line of a major road. Minor roads keep no centre line at
 * all: at this scale two lanes of hatching on a four-unit lane is noise.
 */
export function laneDashLays(lays: readonly RoadLay[]): MarkLay[] {
  const out: MarkLay[] = [];
  const stride = DASH_ALONG + DASH_GAP;
  lays.forEach((lay, road) => {
    if (!lay.major) return;
    // Clear of both crossings, so a dash never lands inside a zebra band.
    const first = JUNCTION_INSET + DASH_ALONG;
    const last = lay.length - first;
    for (let s = first; s <= last; s += stride) {
      out.push({ road, s, lateral: 0, along: DASH_ALONG, across: DASH_ACROSS });
    }
  });
  return out;
}

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
 * district rect gets in the way. If E5 ever puts the rect in the model
 * (`city.plaza`), that wins.
 */
export function plazaRect(city: CityModel): PlazaRect | null {
  const given = (city as CityModel & { plaza?: PlazaRect }).plaza;
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
