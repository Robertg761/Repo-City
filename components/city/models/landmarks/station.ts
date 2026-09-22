/**
 * The transit station: releases as the city's shipping (PLAN.md section 20).
 * Active releases run a busy station; occasional releases run a quiet one.
 * A repository with no GitHub Releases has no station at all, and section 20
 * is explicit that this is not a penalty.
 *
 * Natural size 26 x 7 x 12, concourse entrance on +z, track along x.
 *
 *   z -5.1  ......... platform 2 (level 3) ............
 *   z -3.0  ==================== track B ==============  parked (level 3)
 *   z  0.0  concourse | ------ platform 1 + canopy
 *   z +3.0  ==================== track A ==============  the moving train
 *   z +5.7  (kept clear: the side the inspection camera arrives on)
 *
 * Level 1 runs one train under a short canopy, level 2 covers the whole
 * platform, and level 3 adds the second platform, the second line and a set
 * stabled on it.
 *
 * The train is built once, centred on the origin, and drawn twice: `Landmark`
 * runs one copy on track A to the timetable below and parks the other on
 * track B.
 *
 * Track A leaves the plot through a tunnel portal at its +x end. The running
 * train comes out of it, stops at the platform, and goes back in, once per
 * arrival: `trainsPerMinute` from the generator (PLAN.md section 20) sets how
 * often, so the inspector's "about N arrivals a minute" is what the platform
 * actually shows. The renderer clips the train at `PORTAL_X`, which is what
 * lets it drive into a hillside that is not there.
 */

import { Assembly, cached, type Slots, type V3 } from "./assembly";

export type StationSlot = "deck" | "wall" | "roof" | "steel" | "glass" | "accent" | "dark";
export type TrainSlot = "body" | "glass" | "gear";

const DECK = 0.4;
const PLATFORM_Y = 0.95;
export const TRACK_A = 3.0;
export const TRACK_B = -3.0;
const TRACK_HALF = 9.4;
const TRACK_X = 3.5;

/** The middle of the platform: both trains are positioned from here. */
export const TRAIN_CENTRE = TRACK_X;
/** Where the parked train stands when the station has two tracks. */
export const PARKED_X = TRACK_X - 1.9;
/**
 * The face of the tunnel portal on track A. The renderer discards any part of
 * the running train beyond it, so the train is only ever seen on this side.
 */
export const PORTAL_X = TRACK_X + TRACK_HALF - 0.6;
/** Half the length of a train set, cab to cab, with a little to spare. */
const TRAIN_HALF = 6.3;
/** Where the running train waits between arrivals: wholly inside the tunnel. */
const OFFSTAGE_X = PORTAL_X + TRAIN_HALF;

type A = Assembly<StationSlot>;

export interface StationLayout {
  slots: Slots<StationSlot>;
  /** Platform lamps, lit by React from the scene atmosphere. */
  lamps: V3[];
  tracks: 1 | 2;
}

function track(a: A, cz: number): void {
  a.box("deck", [TRACK_HALF * 2, 0.3, 2.9], { at: [TRACK_X, 0.15, cz] });
  for (let i = 0; i < 24; i++) {
    a.box("deck", [0.28, 0.14, 2.3], {
      at: [TRACK_X - TRACK_HALF + 0.4 + i * ((TRACK_HALF * 2 - 0.8) / 23), 0.32, cz],
    });
  }
  for (const s of [-1, 1]) {
    a.box("steel", [TRACK_HALF * 2, 0.16, 0.14], { at: [TRACK_X, 0.42, cz + s * 0.72] });
  }
}

/** A catenary mast with its cantilever arm and the contact wire it carries. */
function catenary(a: A, xs: number[], cz: number, side: number): void {
  const height = 4.3;
  for (const x of xs) {
    a.box("steel", [0.18, height, 0.18], { at: [x, PLATFORM_Y + height / 2 - 0.3, cz + side * 1.9] });
    a.box("steel", [0.12, 0.12, 2.0], {
      at: [x, PLATFORM_Y + height - 0.42, cz + side * 0.95],
    });
    a.cylinder("deck", 0.06, 0.06, 0.3, 5, { at: [x, PLATFORM_Y + height - 0.62, cz] });
  }
  for (let i = 0; i < xs.length - 1; i++) {
    a.wire(
      "steel",
      [xs[i], PLATFORM_Y + height - 0.8, cz],
      [xs[i + 1], PLATFORM_Y + height - 0.8, cz],
      0.04,
      0.18,
    );
  }
}

function concourse(a: A): void {
  const x = -9.4;
  a.box("deck", [6.6, 0.25, 5.8], { at: [x, 0.125, 0] });
  a.box("wall", [6.0, 4.2, 5.2], { at: [x, 2.35, 0] });
  a.box("roof", [6.8, 0.5, 6.0], { at: [x, 4.7, 0] });
  a.box("glass", [4.6, 2.8, 0.12], { at: [x, 1.95, 2.66] });
  for (const s of [-1, 1]) {
    a.box("roof", [0.2, 3.0, 0.2], { at: [x + s * 1.6, 2.0, 2.7] });
    a.box("glass", [0.1, 1.6, 3.0], { at: [x + (s * 6.0) / 2, 2.6, 0] });
  }
  a.box("roof", [4.8, 0.24, 0.34], { at: [x, 3.5, 2.7] });
  // A clock over the doors and the station name board above it.
  a.cylinder("steel", 0.66, 0.66, 0.1, 14, { at: [x, 3.95, 2.72], rot: [Math.PI / 2, 0, 0] });
  a.cylinder("glass", 0.56, 0.56, 0.12, 14, { at: [x, 3.95, 2.76], rot: [Math.PI / 2, 0, 0] });
  a.box("steel", [0.07, 0.34, 0.04], { at: [x, 4.1, 2.84] });
  a.box("steel", [0.26, 0.07, 0.04], { at: [x + 0.11, 3.95, 2.84] });
  a.box("accent", [3.4, 0.62, 0.14], { at: [x, 4.98, 2.5] });
}

/**
 * The tunnel mouth track A runs into: a headwall with a dark opening, a
 * coping and two buttresses. The train is clipped at the opening's face, so
 * the wall only has to be deep and tall enough to hide the cut.
 */
function portal(a: A): void {
  // The plot ends at x = 13; the opening stands just proud of the wall so the
  // two never share a plane.
  const x0 = PORTAL_X + 0.04;
  const x1 = 13.0;
  const depth = x1 - x0;
  const x = (x0 + x1) / 2;
  a.box("wall", [depth, 4.1, 4.4], { at: [x, 2.05, TRACK_A] });
  a.box("dark", [0.06, 2.6, 2.3], { at: [PORTAL_X + 0.03, 1.6, TRACK_A] });
  // A round-headed arch over the opening, then the coping over the wall.
  a.cylinder("dark", 1.15, 1.15, 0.06, 12, {
    at: [PORTAL_X + 0.03, 2.9, TRACK_A],
    rot: [0, 0, Math.PI / 2],
  });
  a.box("roof", [depth, 0.3, 4.8], { at: [x, 4.25, TRACK_A] });
  for (const s of [-1, 1]) {
    a.box("roof", [depth + 0.3, 3.4, 0.5], { at: [x - 0.15, 1.7, TRACK_A + s * 2.0] });
  }
}

function buildStation(level: number): StationLayout {
  const a = new Assembly<StationSlot>();
  const lamps: V3[] = [];
  const tracks: 1 | 2 = level >= 3 ? 2 : 1;

  a.box("deck", [25.4, DECK, 11.4], { at: [0, DECK / 2, 0] });

  concourse(a);

  // The island platform, its edge strips and its shelter.
  a.box("deck", [18.8, PLATFORM_Y, 3.0], { at: [TRACK_X, PLATFORM_Y / 2, 0] });
  for (const s of [-1, 1]) {
    a.box("accent", [18.8, 0.07, 0.34], { at: [TRACK_X, PLATFORM_Y + 0.02, s * 1.33] });
  }

  const columns = level >= 2 ? 5 : 3;
  const canopyLength = level >= 2 ? 16.8 : 10.4;
  const canopyX = level >= 2 ? TRACK_X : TRACK_X - 3.2;
  for (let i = 0; i < columns; i++) {
    const cx = canopyX - canopyLength / 2 + 1.2 + i * ((canopyLength - 2.4) / (columns - 1));
    a.cylinder("steel", 0.14, 0.18, 3.1, 8, { at: [cx, PLATFORM_Y + 1.55, 0] });
    a.box("steel", [0.12, 0.12, 2.6], { at: [cx, PLATFORM_Y + 2.95, 0] });
  }
  // A ridged canopy: a flat slab this size reads as a lid from the overview
  // camera, and the clerestory is what makes it read as a train shed.
  a.box("roof", [canopyLength, 0.28, 3.6], { at: [canopyX, PLATFORM_Y + 3.3, 0] });
  a.box("roof", [canopyLength - 1.6, 0.5, 1.2], { at: [canopyX, PLATFORM_Y + 3.65, 0] });
  a.box("glass", [canopyLength - 1.7, 0.3, 1.25], { at: [canopyX, PLATFORM_Y + 3.6, 0] });
  for (const s of [-1, 1]) {
    a.box("accent", [canopyLength, 0.32, 0.14], {
      at: [canopyX, PLATFORM_Y + 3.06, s * 1.8],
    });
  }
  // Platform furniture: a bench, a departure board, two lamps.
  a.box("roof", [2.0, 0.12, 0.5], { at: [TRACK_X + 4.4, PLATFORM_Y + 0.45, -0.4] });
  for (const s of [-1, 1]) {
    a.box("roof", [0.12, 0.42, 0.42], { at: [TRACK_X + 4.4 + s * 0.8, PLATFORM_Y + 0.22, -0.4] });
  }
  a.box("steel", [0.14, 1.3, 0.14], { at: [TRACK_X - 2.0, PLATFORM_Y + 0.65, 0.6] });
  a.box("accent", [1.9, 0.9, 0.12], { at: [TRACK_X - 2.0, PLATFORM_Y + 1.6, 0.6] });
  for (const lx of [TRACK_X - 6.2, TRACK_X + 6.6]) {
    a.cylinder("steel", 0.08, 0.11, 2.6, 6, { at: [lx, PLATFORM_Y + 1.3, 0] });
    a.box("steel", [0.44, 0.14, 0.44], { at: [lx, PLATFORM_Y + 2.68, 0] });
    lamps.push([lx, PLATFORM_Y + 2.52, 0]);
  }

  track(a, TRACK_A);
  catenary(a, [TRACK_X - 7.4, TRACK_X - 2.4, TRACK_X + 2.6, TRACK_X + 7.6], TRACK_A, 1);

  // Nothing is ever built between track A and the plot edge: the running
  // line is the side the inspection camera arrives on, and the train has to
  // be the thing it sees.
  if (tracks === 2) {
    // The second platform and the line it serves, both behind the island.
    track(a, TRACK_B);
    a.box("deck", [18.8, PLATFORM_Y, 1.6], { at: [TRACK_X, PLATFORM_Y / 2, -5.1] });
    a.box("accent", [18.8, 0.07, 0.3], { at: [TRACK_X, PLATFORM_Y + 0.02, -4.4] });
    for (let i = 0; i < 2; i++) {
      const sx = TRACK_X - 4.4 + i * 8.8;
      a.box("roof", [3.4, 0.22, 1.6], { at: [sx, PLATFORM_Y + 2.3, -5.1] });
      a.box("wall", [3.2, 1.5, 0.12], { at: [sx, PLATFORM_Y + 1.4, -5.75] });
      for (const s of [-1, 1]) {
        a.box("steel", [0.12, 2.3, 0.12], { at: [sx + s * 1.5, PLATFORM_Y + 1.15, -5.7] });
      }
    }
  } else {
    // No second line: the far strip is a goods dock with a few crates.
    a.box("deck", [9.0, 0.7, 2.4], { at: [TRACK_X + 3.0, 0.35, -3.6] });
    for (const [bx, bz, h] of [
      [1.2, -3.2, 0.9],
      [2.6, -4.0, 0.7],
      [5.4, -3.4, 1.1],
    ] as const) {
      a.box("roof", [1.1, h, 1.1], { at: [bx, 0.7 + h / 2, bz] });
    }
  }

  // Signal posts at both ends of the running line.
  for (const s of [-1, 1]) {
    const sx = TRACK_X + s * 8.6;
    a.box("steel", [0.14, 2.6, 0.14], { at: [sx, 1.3, TRACK_A + s * 1.8] });
    a.box("steel", [0.36, 0.8, 0.22], { at: [sx, 2.6, TRACK_A + s * 1.8] });
    a.box("glass", [0.2, 0.2, 0.06], { at: [sx, 2.78, TRACK_A + s * 1.92] });
  }

  portal(a);

  return { slots: a.build(), lamps, tracks };
}

/**
 * One train: a locomotive and two cars, centred on the origin with the nose
 * towards +x. Cached once and drawn by every station.
 */
function buildTrain(): Slots<TrainSlot> {
  const a = new Assembly<TrainSlot>();
  const railTop = 0.5;

  const bogies = (cx: number, reach: number) => {
    a.box("gear", [reach * 2 + 0.6, 0.5, 1.7], { at: [cx, railTop + 0.42, 0] });
    for (const dx of [-reach, reach]) {
      for (const dz of [-0.8, 0.8]) {
        a.cylinder("gear", 0.34, 0.34, 0.24, 8, {
          at: [cx + dx, railTop + 0.34, dz],
          rot: [0, 0, Math.PI / 2],
        });
      }
    }
  };

  // Locomotive.
  const loco = 3.7;
  bogies(loco, 1.2);
  a.box("body", [3.6, 1.5, 1.9], { at: [loco, railTop + 1.42, 0] });
  a.box("body", [3.2, 0.26, 1.72], { at: [loco, railTop + 2.28, 0] });
  a.box("body", [0.95, 1.15, 1.86], { at: [loco + 1.9, railTop + 1.25, 0], rot: [0, 0, -0.16] });
  a.box("glass", [0.12, 0.62, 1.62], { at: [loco + 1.78, railTop + 1.78, 0] });
  for (const s of [-1, 1]) {
    a.box("glass", [1.1, 0.52, 0.1], { at: [loco - 0.4, railTop + 1.72, s * 0.96] });
    a.box("glass", [0.14, 0.2, 0.2], { at: [loco + 2.24, railTop + 0.95, s * 0.52] });
  }

  // Two cars behind it.
  for (const cx of [-0.05, -3.7]) {
    bogies(cx, 1.15);
    a.box("body", [3.4, 1.4, 1.85], { at: [cx, railTop + 1.4, 0] });
    a.box("body", [3.1, 0.22, 1.7], { at: [cx, railTop + 2.2, 0] });
    for (const s of [-1, 1]) {
      a.box("glass", [2.7, 0.56, 0.1], { at: [cx, railTop + 1.62, s * 0.94] });
      a.box("gear", [0.14, 1.2, 0.1], { at: [cx + 1.5, railTop + 1.35, s * 0.94] });
    }
  }
  // The last car is a driving trailer, so the set leads with a cab whichever
  // way it runs: it comes in trailer first and leaves locomotive first.
  const tail = -3.7 - 1.7;
  a.box("body", [0.95, 1.15, 1.86], { at: [tail - 0.2, railTop + 1.25, 0], rot: [0, 0, 0.16] });
  a.box("glass", [0.12, 0.62, 1.62], { at: [tail + 0.02, railTop + 1.78, 0] });
  for (const s of [-1, 1]) {
    a.box("glass", [0.14, 0.2, 0.2], { at: [tail - 0.54, railTop + 0.95, s * 0.52] });
  }

  // Couplers, so the set reads as one train rather than three blocks.
  for (const gx of [1.8, -1.85]) {
    a.box("gear", [0.35, 0.3, 0.4], { at: [gx, railTop + 0.75, 0] });
  }

  return a.build();
}

export function transitStation(level: number): StationLayout {
  const clamped = Math.min(3, Math.max(1, Math.round(level)));
  return cached(`station:${clamped}`, () => buildStation(clamped));
}

export function trainCars(): Slots<TrainSlot> {
  return cached("station:train", buildTrain);
}

/**
 * Arrivals a minute when the generator did not say (the development fixture,
 * or a model from before E5): the same bands `trainsPerMinute` in
 * `lib/city/entities.ts` uses, at their midpoints.
 */
export function fallbackArrivals(level: number): number {
  if (level >= 3) return 4.5;
  if (level === 2) return 1.4;
  return level === 1 ? 0.8 : 0;
}

export interface TrainPose {
  /** Centre of the set along the track, in the station's natural frame. */
  x: number;
  /** False while the set is wholly inside the tunnel, so it costs nothing. */
  visible: boolean;
}

/** Seconds to pull in from the tunnel to the platform, and to pull out. */
const RUN = 4.2;
/** Seconds at the platform. */
const DWELL = 5.5;

const easeOut = (t: number) => 1 - (1 - t) * (1 - t);
const easeIn = (t: number) => t * t;

/**
 * Where the running train is `seconds` into the timetable. One arrival every
 * `60 / perMinute` seconds: out of the tunnel, a stop at the platform, back
 * into the tunnel, then gone until the next one. At the busiest rate the
 * cycle is ten seconds and the run and dwell are squeezed to fit it.
 */
export function trainPose(seconds: number, perMinute: number): TrainPose {
  if (!(perMinute > 0)) return { x: OFFSTAGE_X, visible: false };
  const period = 60 / perMinute;
  const squeeze = Math.min(1, (period * 0.9) / (RUN * 2 + DWELL));
  const run = RUN * squeeze;
  const dwell = DWELL * squeeze;
  const t = ((seconds % period) + period) % period;
  const distance = OFFSTAGE_X - TRAIN_CENTRE;

  if (t < run) {
    return { x: OFFSTAGE_X - distance * easeOut(t / run), visible: true };
  }
  if (t < run + dwell) return { x: TRAIN_CENTRE, visible: true };
  if (t < run * 2 + dwell) {
    return { x: TRAIN_CENTRE + distance * easeIn((t - run - dwell) / run), visible: true };
  }
  return { x: OFFSTAGE_X, visible: false };
}
