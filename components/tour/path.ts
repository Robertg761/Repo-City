/**
 * The tour's camera work (`lib/client/tour.ts` chooses the stops).
 *
 * Each stop gets a SHOT, the camera's move while the caption is read:
 *
 *   orbit  a slow turn round the subject, pushing in a little;
 *   track  once per tour, for the busiest district: low and fast along a
 *          road with the tallest tower growing ahead, then a climb round it.
 *          That swoop is what gives the city its scale.
 *
 * Between shots the camera FLIES, over an arc that rises above the roofs and
 * settles again, or, into the track, down out of the sky onto the road.
 *
 * Every pose is checked against the building and landmark boxes the
 * inspector's framing uses (`components/city/entities.ts`): an orbit that
 * would look through a tower is narrowed until it does not, and a flight that
 * would pass through one is lifted until it clears. No pose goes below the
 * ground or inside a box, and each stays inside the camera's own limits
 * (distance and tilt), so `<CameraControls>` never corrects what it is given.
 *
 * Pure and three-free: unit tested in `path.test.ts`.
 */

import { hashString } from "@/lib/city/prng";
import type { TourStop } from "@/lib/client/tour";
import type { CityModel, Vec3 } from "@/types/city";
import {
  cameraBoundary,
  cameraInside,
  clearInspectionFraming,
  focusTargetFor,
  framingBlocked,
  framingObstacles,
  orbitFraming,
  overviewFraming,
  tallestPoint,
  viewAngles,
  MIN_DISTANCE,
  type FocusTarget,
  type Framing,
  type Obstacle,
} from "@/components/city/entities";

export interface Pose {
  position: Vec3;
  target: Vec3;
}

export interface Orbit {
  azimuth: number;
  polar: number;
  distance: number;
}

export type Shot =
  | {
      kind: "orbit";
      key: string;
      target: Vec3;
      from: Orbit;
      to: Orbit;
    }
  | {
      kind: "track";
      key: string;
      /** Evenly spaced poses along the way. */
      poses: Pose[];
      /** The way the camera is travelling when the track begins, on the ground plane. */
      along: Vec3;
    };

/**
 * A flight from one pose to the next, as poses evenly spaced along the way.
 * `poses[0]` is where it starts and the last is where it lands. `endSpeed`
 * is the eased speed it lands with, 0 for a stop and more to run straight
 * into a moving shot.
 */
export interface Flight {
  kind: "cut" | "arc" | "descent";
  durationMs: number;
  poses: Pose[];
  endSpeed: number;
}

// ---------------------------------------------------------------------------
// Limits and small maths
// ---------------------------------------------------------------------------

/** Never closer to the target than this: `<CameraControls minDistance={10}>`, plus room. */
export const TOUR_MIN_DISTANCE = MIN_DISTANCE + 1;
/** The flattest look an orbit or a flight allows, inside `maxPolarAngle` (0.48 PI). */
export const TOUR_MAX_POLAR = 1.42;
/**
 * The track looks up at its tower, past the horizon. The director lifts the
 * controls' `maxPolarAngle` to this for the length of the tour.
 */
export const TOUR_LOOK_UP_POLAR = 1.8;
/** The steepest look down, inside `minPolarAngle` (0.15). */
export const TOUR_MIN_POLAR = 0.2;
/** The camera never flies lower than this over the ground. */
export const TOUR_MIN_HEIGHT = 3;
/** Clearance kept round every box in flight, a little more than the near plane needs. */
export const FLIGHT_CLEARANCE = 3;

const clamp = (n: number, lo: number, hi: number) => (n < lo ? lo : n > hi ? hi : n);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const dist3 = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const smoothstep = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
/** The shorter signed turn from `a` to `b`. */
const turn = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

/**
 * Progress along a move with the given starting and ending speeds, where 1 is
 * the speed of a straight constant pace: 0 and 0 ease in and out, 1 and 0
 * sets off at speed and settles. A cubic Hermite, monotone for speeds up to 3.
 */
export function ease(u: number, startSpeed = 0, endSpeed = 0): number {
  const t = clamp(u, 0, 1);
  const t2 = t * t;
  const t3 = t2 * t;
  return (t3 - 2 * t2 + t) * startSpeed + (-2 * t3 + 3 * t2) + (t3 - t2) * endSpeed;
}

/**
 * The pose, nudged inside the camera's own limits: far enough from its aim,
 * no flatter than `maxPolar`, and above the ground. A pose already inside
 * them comes back unchanged.
 */
export function safePose(pose: Pose, maxPolar = TOUR_MAX_POLAR): Pose {
  const position: Vec3 = [pose.position[0], Math.max(TOUR_MIN_HEIGHT, pose.position[1]), pose.position[2]];
  let target: Vec3 = [pose.target[0], Math.max(0, pose.target[1]), pose.target[2]];
  const flat = Math.hypot(position[0] - target[0], position[2] - target[2]);
  // Too flat, or looking up further than allowed: move the aim point down.
  // Past the horizon the tangent is negative, so the aim may sit above the
  // camera, by no more than the angle allows.
  const drop = flat / Math.tan(maxPolar);
  if (position[1] - target[1] < drop) {
    if (position[1] - drop >= 0) {
      target = [target[0], position[1] - drop, target[2]];
    } else {
      // The aim cannot go below the ground: bring it nearer instead.
      const reach = position[1] * Math.tan(maxPolar);
      const k = flat > 1e-6 ? reach / flat : 0;
      target = [position[0] + (target[0] - position[0]) * k, 0, position[2] + (target[2] - position[2]) * k];
    }
  }
  // Too steep: straight down is where the orbit controls flip. Slide the aim
  // point out sideways until the camera looks down at the allowed angle.
  const rise = position[1] - target[1];
  const flatNow = Math.hypot(position[0] - target[0], position[2] - target[2]);
  const minFlat = rise * Math.tan(TOUR_MIN_POLAR);
  if (rise > 0 && flatNow < minFlat) {
    const ux = flatNow > 1e-6 ? (target[0] - position[0]) / flatNow : 0;
    const uz = flatNow > 1e-6 ? (target[2] - position[2]) / flatNow : 1;
    target = [position[0] + ux * minFlat, target[1], position[2] + uz * minFlat];
  }
  // Too close: slide the aim point further along the line of sight.
  const d = dist3(position, target);
  if (d < TOUR_MIN_DISTANCE) {
    const dir: Vec3 =
      d > 1e-6
        ? [(target[0] - position[0]) / d, (target[1] - position[1]) / d, (target[2] - position[2]) / d]
        : [0, -1, 0];
    target = [
      position[0] + dir[0] * TOUR_MIN_DISTANCE,
      Math.max(0, position[1] + dir[1] * TOUR_MIN_DISTANCE),
      position[2] + dir[2] * TOUR_MIN_DISTANCE,
    ];
  }
  return { position, target };
}

// ---------------------------------------------------------------------------
// Evenly spaced paths
// ---------------------------------------------------------------------------

/** Poses per flight or track, evenly spaced along the way. */
const PATH_SAMPLES = 180;
/** Raw samples taken before evening out the spacing. */
const RAW_SAMPLES = 480;

/**
 * Evens out a path given as a function of `t`, so the camera covers equal
 * ground in equal time before the easing is applied. Aim-point travel counts
 * a little too, so a turn on the spot still takes a moment.
 */
function resample(path: (t: number) => Pose, maxPolar = TOUR_MAX_POLAR): Pose[] {
  const raw: Pose[] = [];
  const walked: number[] = [0];
  for (let i = 0; i <= RAW_SAMPLES; i++) {
    raw.push(path(i / RAW_SAMPLES));
    if (i > 0) {
      const a = raw[i - 1];
      const b = raw[i];
      walked.push(walked[i - 1] + dist3(a.position, b.position) + 0.35 * dist3(a.target, b.target));
    }
  }
  const total = walked[RAW_SAMPLES];
  if (total < 1e-6) return [raw[0], raw[RAW_SAMPLES]].map((p) => safePose(p, maxPolar));
  const poses: Pose[] = [];
  let j = 0;
  for (let k = 0; k < PATH_SAMPLES; k++) {
    const want = (k / (PATH_SAMPLES - 1)) * total;
    while (j < RAW_SAMPLES - 1 && walked[j + 1] < want) j++;
    const span = walked[j + 1] - walked[j];
    const f = span > 1e-9 ? (want - walked[j]) / span : 0;
    poses.push({
      position: lerp3(raw[j].position, raw[j + 1].position, f),
      target: lerp3(raw[j].target, raw[j + 1].target, f),
    });
  }
  return poses.map((p) => safePose(p, maxPolar));
}

/** A pose along evenly spaced `poses`, `s` from 0 to 1. */
function along(poses: readonly Pose[], s: number): Pose {
  if (poses.length === 1) return poses[0];
  const x = clamp(s, 0, 1) * (poses.length - 1);
  const i = Math.min(poses.length - 2, Math.floor(x));
  const f = x - i;
  return {
    position: lerp3(poses[i].position, poses[i + 1].position, f),
    target: lerp3(poses[i].target, poses[i + 1].target, f),
  };
}

export function pathLength(poses: readonly Pose[]): number {
  let length = 0;
  for (let i = 1; i < poses.length; i++) length += dist3(poses[i - 1].position, poses[i].position);
  return length;
}

/** Cubic Hermite between two points with the given end tangents. */
function hermite(p0: Vec3, m0: Vec3, p1: Vec3, m1: Vec3, t: number): Vec3 {
  const t2 = t * t;
  const t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;
  return [0, 1, 2].map((k) => h00 * p0[k] + h10 * m0[k] + h01 * p1[k] + h11 * m1[k]) as Vec3;
}

const bezier = (a: Vec3, c: Vec3, b: Vec3, t: number): Vec3 => {
  const u = 1 - t;
  return [
    u * u * a[0] + 2 * u * t * c[0] + t * t * b[0],
    u * u * a[1] + 2 * u * t * c[1] + t * t * b[1],
    u * u * a[2] + 2 * u * t * c[2] + t * t * b[2],
  ];
};

// ---------------------------------------------------------------------------
// Obstacles
// ---------------------------------------------------------------------------

/** The boxes a flying camera must keep out of: buildings, landmarks and cranes. */
export function flightObstacles(city: CityModel): Obstacle[] {
  const obstacles = [...framingObstacles(city)];
  for (const site of city.constructionSites) {
    if (!site.size) continue;
    obstacles.push({
      id: site.id,
      x: site.position[0],
      z: site.position[2],
      cos: Math.cos(site.rotationY),
      sin: Math.sin(site.rotationY),
      hw: site.size[0] / 2,
      hd: site.size[2] / 2,
      // The crane may stand a little over the plot's height.
      top: site.position[1] + site.size[1] * 1.3,
    });
  }
  return obstacles;
}

/** Whether a flying camera at `p` is clear of the ground and every box. */
export function flightClear(p: Vec3, obstacles: readonly Obstacle[]): boolean {
  return p[1] >= TOUR_MIN_HEIGHT - 1e-6 && !cameraInside(p, obstacles, FLIGHT_CLEARANCE);
}

/**
 * Whether every pose of a path is clear. Poses above the tallest roof are
 * clear by definition, and the boxes are narrowed to the path's own ground
 * first, so a long flight over a metropolis costs a fraction of a millisecond.
 */
export function pathClear(poses: readonly Pose[], obstacles: readonly Obstacle[]): boolean {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const { position: p } of poses) {
    if (p[1] < TOUR_MIN_HEIGHT - 1e-6) return false;
    minX = Math.min(minX, p[0]);
    maxX = Math.max(maxX, p[0]);
    minZ = Math.min(minZ, p[2]);
    maxZ = Math.max(maxZ, p[2]);
  }
  const reach = FLIGHT_CLEARANCE;
  const nearby = obstacles.filter((o) => {
    const r = Math.hypot(o.hw, o.hd) + reach;
    return o.x + r >= minX && o.x - r <= maxX && o.z + r >= minZ && o.z - r <= maxZ;
  });
  let roof = 0;
  for (const o of nearby) roof = Math.max(roof, o.top);
  for (const { position: p } of poses) {
    if (p[1] > roof + reach) continue;
    if (cameraInside(p, nearby, reach)) return false;
  }
  return true;
}

/** The box `<CameraControls>` keeps its target in (`cameraBoundary`). */
export function aimBox(city: CityModel): [Vec3, Vec3] {
  return cameraBoundary(city.bounds.size, tallestPoint(city));
}

// ---------------------------------------------------------------------------
// Shots
// ---------------------------------------------------------------------------

/** A track sets off at its average pace, then eases to a stop. */
export const TRACK_START_SPEED = 1;

/** A pose partway through a shot, `u` from 0 to 1. */
export function shotPose(shot: Shot, u: number): Pose {
  if (shot.kind === "track") {
    // Sets off at the pace the descent arrived with and settles at the end.
    return along(shot.poses, ease(u, TRACK_START_SPEED, 0));
  }
  const t = ease(u);
  const framing = orbitFraming(
    shot.target,
    {
      azimuth: shot.from.azimuth + turn(shot.from.azimuth, shot.to.azimuth) * t,
      polar: lerp(shot.from.polar, shot.to.polar, t),
    },
    lerp(shot.from.distance, shot.to.distance, t),
  );
  return safePose(framing);
}

function orbitOf(framing: Framing): Orbit {
  const angles = viewAngles(framing.position, framing.target);
  return { ...angles, distance: dist3(framing.position, framing.target) };
}

/** One of two directions, fixed per repository and stop, so tours differ but never change. */
function spin(city: CityModel, key: string): 1 | -1 {
  return hashString(`${city.seed}:${key}`) % 2 === 0 ? 1 : -1;
}

/** How each kind of hold moves: how far it orbits, how much it pushes in, how wide it starts. */
const HOLD_MOVES: Record<string, { sweep: number; push: number; widen: number; polar?: number }> = {
  district: { sweep: 0.5, push: 0.14, widen: 1.05, polar: 1.12 },
  power: { sweep: 0.45, push: 0.12, widen: 1.15, polar: 0.98 },
  station: { sweep: 0.45, push: 0.12, widen: 1.15, polar: 0.98 },
  hall: { sweep: 0.45, push: 0.12, widen: 1.2, polar: 0.98 },
  archive: { sweep: 0.3, push: 0.08, widen: 1.3, polar: 0.95 },
  incident: { sweep: 0.36, push: 0.14, widen: 1.0 },
  wreck: { sweep: 0.36, push: 0.12, widen: 1.0 },
  construction: { sweep: 0.36, push: 0.12, widen: 1.05 },
  queue: { sweep: 0.3, push: 0.1, widen: 1.5 },
};

/** Samples along a hold that must all see their subject. */
const HOLD_CHECKS = Array.from({ length: 21 }, (_, i) => i / 20);

/** The wide establishing and closing shots, round the overview's own aim. */
function wideShot(key: string, finale: boolean, city: CityModel, aspect: number): Shot {
  const overview = overviewFraming(city.bounds.size, aspect);
  const base = orbitOf(overview);
  const s = spin(city, key);
  if (finale) {
    // A rising pull-back that lands exactly on the overview, so handing the
    // camera back afterwards moves nothing.
    return {
      kind: "orbit",
      key,
      target: overview.target,
      from: { azimuth: base.azimuth + s * 0.5, polar: base.polar + 0.22, distance: base.distance * 0.62 },
      to: base,
    };
  }
  // The opening: high and wide, turning and settling lower over the city.
  return {
    kind: "orbit",
    key,
    target: overview.target,
    from: { azimuth: base.azimuth - s * 1.0, polar: Math.max(0.35, base.polar - 0.24), distance: base.distance * 1.06 },
    to: { azimuth: base.azimuth - s * 0.2, polar: base.polar + 0.3, distance: base.distance * 0.7 },
  };
}

/** Whether every sampled pose of the hold sees its target past the obstacles. */
function holdClear(shot: Shot, obstacles: readonly Obstacle[]): boolean {
  return HOLD_CHECKS.every((u) => {
    const pose = shotPose(shot, u);
    return (
      !framingBlocked(pose.target, pose.position, obstacles) &&
      !cameraInside(pose.position, obstacles, FLIGHT_CLEARANCE)
    );
  });
}

/** A phone held upright sees a narrow slice of the frame: stand a little further back. */
function narrowWiden(aspect: number): number {
  return aspect < 1 ? 1 + (1 / Math.max(aspect, 0.4) - 1) * 0.28 : 1;
}

/**
 * The hold on one subject. It starts from the inspector's own clear framing,
 * approached from the side the camera is coming from, then orbits a little
 * and pushes in. When the orbit would put a building in the way it narrows,
 * and in the worst case the camera simply holds still on the clear framing.
 */
function orbitShot(stop: TourStop, focus: FocusTarget, city: CityModel, previous: Pose, aspect: number): Shot {
  const moves = HOLD_MOVES[stop.kind] ?? HOLD_MOVES.incident;
  const s = spin(city, stop.key);

  // Come in from the side the camera already is, turned a little either way
  // so two stops in a row are not framed alike.
  const approach = viewAngles(previous.position, focus.lookAt);
  const from = { azimuth: approach.azimuth + s * 0.35, polar: moves.polar ?? approach.polar };
  // Cranes count too: the flight in has to reach this framing without one.
  const all = flightObstacles(city);
  const obstacles = all.filter((o) => o.id !== focus.id && o.id !== focus.host);
  const clear = clearInspectionFraming(focus, from, all);
  const base = orbitOf(clear);
  const distance = base.distance * moves.widen * narrowWiden(aspect);

  for (const scale of [1, 0.6, 0.3, 0]) {
    const sweep = moves.sweep * scale;
    const push = moves.push * scale;
    const shot: Shot = {
      kind: "orbit",
      key: stop.key,
      target: clear.target,
      from: { azimuth: base.azimuth - (s * sweep) / 2, polar: base.polar, distance: distance * (1 + push / 2) },
      to: { azimuth: base.azimuth + (s * sweep) / 2, polar: base.polar, distance: distance * (1 - push / 2) },
    };
    if (holdClear(shot, obstacles)) return shot;
  }
  // Nothing moving works: hold still, stepping back until the view is clear,
  // and in the worst case exactly where the inspector would.
  for (const scale of [1.15, 1.3, 1.5, 1.8]) {
    const still: Orbit = { ...base, distance: base.distance * scale };
    const shot: Shot = { kind: "orbit", key: stop.key, target: clear.target, from: still, to: still };
    if (holdClear(shot, obstacles)) return shot;
  }
  return { kind: "orbit", key: stop.key, target: clear.target, from: base, to: base };
}

/** How high the track runs over the road, clear of lamps, trees and trucks. */
export const TRACK_HEIGHT = 8;
/** How far along the road the camera looks while it runs low. */
const LOOK_AHEAD = 26;

export interface TrackRoad {
  start: Vec3;
  end: Vec3;
}

/**
 * Roads the track could run along towards `towerAt`: long enough to feel the
 * speed, ending short of the tower with the tower ahead. Best first; the
 * order depends only on the model.
 */
export function trackRoads(city: CityModel, towerAt: Vec3): TrackRoad[] {
  const candidates: { road: TrackRoad; score: number }[] = [];
  const village = city.settlement?.tier === "village";
  const minLength = village ? 12 : 26;
  // The whole run stays in town: a highway out, or a road that begins in
  // the fields, spends the shot on grass and the queue at the limits.
  const limit = city.bounds.size * 0.42;
  const inside = (p: Vec3) => Math.max(Math.abs(p[0]), Math.abs(p[2])) <= limit + 1e-6;
  for (const road of city.roads) {
    for (const [s, e] of [
      [road.from, road.to],
      [road.to, road.from],
    ] as const) {
      const length = Math.hypot(e[0] - s[0], e[2] - s[2]);
      if (length < minLength) continue;
      const dir = [(e[0] - s[0]) / length, (e[2] - s[2]) / length];
      const toTower = [towerAt[0] - e[0], towerAt[2] - e[2]];
      const reach = Math.hypot(toTower[0], toTower[1]);
      if (reach < (village ? 8 : 12) || reach > 80) continue;
      const ahead = (dir[0] * toTower[0] + dir[1] * toTower[1]) / reach;
      if (ahead < 0.35) continue;
      if (!inside(e)) continue;
      // The last stretch only: a long avenue is cut to its final 64 units,
      // and a road in from the fields to the part inside the town.
      let run = Math.min(length, 64);
      while (run > 0 && !inside([e[0] - dir[0] * run, 0, e[2] - dir[1] * run])) run -= 2;
      if (run < minLength) continue;
      const start: Vec3 = [e[0] - dir[0] * run, 0, e[2] - dir[1] * run];
      const kind = road.kind === "avenue" ? 1.3 : road.major ? 1.15 : 1;
      const score = kind * (ahead + Math.min(run, 56) / 56 - Math.abs(reach - 28) / 60);
      candidates.push({ road: { start, end: [e[0], 0, e[2]] }, score });
    }
  }
  return candidates
    .sort((x, y) => y.score - x.score || x.road.start[0] - y.road.start[0] || x.road.start[2] - y.road.start[2])
    .map((c) => c.road);
}

/**
 * The track: low along the road, the tower growing ahead, then a climb that
 * swings round to one side of it and ends looking at it. The climb leaves the
 * road level and rises all the way, so it can never dip below the road.
 */
function trackPoses(road: TrackRoad, landing: Pose, towerAim: Vec3): { poses: Pose[]; along: Vec3 } {
  const dx = road.end[0] - road.start[0];
  const dz = road.end[2] - road.start[2];
  const l = Math.hypot(dx, dz) || 1;
  const dir: Vec3 = [dx / l, 0, dz / l];
  const p1: Vec3 = [road.start[0], TRACK_HEIGHT, road.start[2]];
  const p2: Vec3 = [road.end[0], TRACK_HEIGHT + 1.5, road.end[2]];
  const p3 = landing.position;
  const run = dist3(p1, p2);
  const climb = dist3(p2, p3);
  const cut = run / (run + climb);
  const ahead = (p: Vec3): Vec3 => [p[0] + dir[0] * LOOK_AHEAD, 1.5, p[2] + dir[2] * LOOK_AHEAD];
  // The climb sets off forwards and upwards at once, like a crane shot up the
  // face of the tower, rather than skimming the roofs of the next block.
  const forward = Math.min(climb * 0.5, 40);
  const m2: Vec3 = [dir[0] * forward, climb * 0.9, dir[2] * forward];
  const m3: Vec3 = [p3[0] - p2[0], p3[1] - p2[1], p3[2] - p2[2]];
  const poses = resample((t) => {
    if (t <= cut) {
      const u = cut > 0 ? t / cut : 1;
      const position = lerp3(p1, p2, u);
      // Down the road, then up at the tower as it comes near.
      // The tower is already in the frame as the camera levels out.
      return { position, target: lerp3(ahead(position), towerAim, 0.3 + 0.7 * smoothstep(0.1, 1, u)) };
    }
    const u = (t - cut) / (1 - cut);
    return {
      position: hermite(p2, m2, p3, m3, u),
      target: lerp3(towerAim, landing.target, smoothstep(0.2, 1, u)),
    };
  }, TOUR_LOOK_UP_POLAR);
  return { poses, along: dir };
}

/** Where the climb may end, as distance scale and tilt, in order of preference. */
const LANDINGS: readonly [number, number][] = [
  [1, 1.1],
  [1.2, 1.05],
  [1, 0.9],
  [1.3, 0.8],
];

/**
 * The busiest district's shot: the track to its tallest tower, when a road
 * leads there and the whole run and climb are clear. Null otherwise, and the
 * district gets an ordinary orbit.
 */
function trackShot(
  stop: TourStop,
  focus: FocusTarget,
  city: CityModel,
  previous: Pose,
  aspect: number,
): Shot | null {
  if (focus.kind !== "building") return null;
  const obstacles = flightObstacles(city);
  const sight = framingObstacles(city).filter((o) => o.id !== focus.id);
  const s = spin(city, stop.key);
  // `radius` is 0.7 of the tower's largest side, its height for any tower.
  const height = focus.radius / 0.7;
  // Far enough out to hold the whole tower at the end of the climb.
  const distance = clamp(height * 1.9 + 16, 36, 110) * narrowWiden(aspect);
  for (const road of trackRoads(city, focus.position).slice(0, 14)) {
    const bearing = Math.atan2(road.end[0] - focus.position[0], road.end[2] - focus.position[2]);
    for (const offset of [Math.PI / 2, Math.PI / 3, (2 * Math.PI) / 3]) {
      for (const side of [s, -s]) {
        for (const [scale, polar] of LANDINGS) {
          const landing = safePose(
            orbitFraming(focus.lookAt, { azimuth: bearing + side * offset, polar }, distance * scale),
          );
          if (framingBlocked(landing.target, landing.position, sight)) continue;
          if (!flightClear(landing.position, obstacles)) continue;
          const { poses, along: dir } = trackPoses(road, landing, focus.lookAt);
          if (!pathClear(poses, obstacles)) continue;
          const shot: Shot = { kind: "track", key: stop.key, poses, along: dir };
          // The way down onto the road has to be clear too, from where the
          // previous shot leaves the camera.
          if (descentFrom(previous, shot, obstacles)) return shot;
        }
      }
    }
  }
  return null;
}

/**
 * Every stop's shot, planned in order: each subject is approached from where
 * the previous shot left the camera. `start` is where the camera is when the
 * tour begins, the overview by default.
 */
export function planShots(
  city: CityModel,
  stops: readonly TourStop[],
  aspect: number,
  start?: Pose,
): Shot[] {
  let previous: Pose = start ?? overviewFraming(city.bounds.size, aspect);
  const shots: Shot[] = [];
  for (const stop of stops) {
    const focus = stop.subjectId ? focusTargetFor(city, stop.subjectId) : null;
    const shot = !focus
      ? wideShot(stop.key, stop.kind === "finale", city, aspect)
      : ((stop.kind === "district" ? trackShot(stop, focus, city, previous, aspect) : null) ??
        orbitShot(stop, focus, city, previous, aspect));
    shots.push(shot);
    previous = shotPose(shot, 1);
  }
  return shots;
}

// ---------------------------------------------------------------------------
// Flights
// ---------------------------------------------------------------------------

/**
 * The ordinary flight: a curve through a raised midpoint, so the camera lifts
 * over the roofs between stops and settles on the next one. The aim point
 * reaches the next subject early, so the camera looks where it is going.
 * The curve is a weighted average of its three points, so it can never dip
 * below the lower end; if a sample still grazes a box, the midpoint rises.
 */
function arcFlight(from: Pose, to: Pose, obstacles: readonly Obstacle[]): Pose[] {
  const a = from.position;
  const b = to.position;
  const flat = Math.hypot(b[0] - a[0], b[2] - a[2]);
  const mid: Vec3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 0.14 * flat, (a[2] + b[2]) / 2];
  let poses: Pose[] = [];
  for (let lift = 0; lift <= 320; lift += 8) {
    const control: Vec3 = [mid[0], mid[1] + lift, mid[2]];
    poses = resample((t) => ({
      position: bezier(a, control, b, t),
      target: lerp3(from.target, to.target, smoothstep(0, 0.72, t)),
    }));
    if (pathClear(poses, obstacles)) return poses;
  }
  return poses;
}

/**
 * Down out of the sky onto the start of a track: leaves along the straight
 * line and levels out along the road, so it runs straight into the track.
 * Its height never drops below the road end (a Hermite curve whose end
 * tangent is level cannot undershoot).
 */
function descentFlight(from: Pose, to: Pose, alongDir: Vec3, level: number): Pose[] {
  const p0 = from.position;
  const p1 = to.position;
  const d = dist3(p0, p1);
  const m0: Vec3 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
  // How long the camera flies level with the road before it reaches it: a
  // longer run-in reads better, a shorter one threads a denser city.
  const k = Math.min(d * 0.6, level);
  const m1: Vec3 = [alongDir[0] * k, 0, alongDir[2] * k];
  return resample((t) => ({
    position: hermite(p0, m0, p1, m1, t),
    target: lerp3(from.target, to.target, smoothstep(0, 0.85, t)),
  }));
}

/** Run-in lengths a descent tries, longest first. */
const DESCENT_LEVELS = [90, 55, 30, 12];

/** The first clear descent from `from` onto the start of `track`, if any. */
function descentFrom(from: Pose, track: Shot, obstacles: readonly Obstacle[]): Pose[] | null {
  if (track.kind !== "track") return null;
  const to = shotPose(track, 0);
  for (const level of DESCENT_LEVELS) {
    const poses = descentFlight(from, to, track.along, level);
    if (pathClear(poses, obstacles)) return poses;
  }
  return null;
}

/** How long a flight of this length takes. Short hops are brisk, long ones never drag. */
export function flightDuration(length: number, kind: Flight["kind"]): number {
  if (kind === "cut") return 0;
  if (kind === "descent") return Math.round(clamp(1600 + 6.5 * length, 2600, 5200));
  return Math.round(clamp(1500 + 7 * length, 2200, 5200));
}

export interface FlightOptions {
  /** Cut instead of flying: `prefers-reduced-motion`. */
  reduced?: boolean;
  /** The shot the flight lands in, when it is a track to be run straight into. */
  into?: Shot;
  /** How long that track lasts, so the descent can land at its pace. */
  intoMs?: number;
}

/** The way from one pose to the next. */
export function planFlight(city: CityModel, from: Pose, to: Pose, options: FlightOptions = {}): Flight {
  if (options.reduced) return { kind: "cut", durationMs: 0, poses: [safePose(to)], endSpeed: 0 };
  const obstacles = flightObstacles(city);
  const into = options.into;
  const poses = into?.kind === "track" ? descentFrom(from, into, obstacles) : null;
  if (into && poses) {
    const flight: Flight = {
      kind: "descent",
      durationMs: flightDuration(pathLength(poses), "descent"),
      poses,
      endSpeed: 0,
    };
    return { ...flight, endSpeed: matchedEndSpeed(flight, into, options.intoMs ?? trackMs(into)) };
  }
  const arc = arcFlight(from, to, obstacles);
  return { kind: "arc", durationMs: flightDuration(pathLength(arc), "arc"), poses: arc, endSpeed: 0 };
}

/**
 * The speed a descent should land with so the track carries on at the same
 * pace, as an `ease` speed: the track's opening pace over the flight's own.
 */
export function matchedEndSpeed(flight: Flight, track: Shot, trackMs: number): number {
  if (flight.kind !== "descent" || track.kind !== "track" || flight.durationMs <= 0 || trackMs <= 0) return 0;
  const trackPace = (TRACK_START_SPEED * pathLength(track.poses)) / trackMs;
  const flightPace = pathLength(flight.poses) / flight.durationMs;
  return flightPace > 1e-9 ? clamp(trackPace / flightPace, 0, 1.6) : 0;
}

/**
 * How long a track takes: long enough to feel fast rather than frantic, and
 * never shorter than `floor`, the time its caption needs.
 */
export function trackMs(shot: Shot, floor = 0): number {
  if (shot.kind !== "track") return floor;
  return Math.round(clamp((pathLength(shot.poses) / TRACK_PACE) * 1000, Math.max(floor, 4500), 8000));
}
/** World units a second along a track, on average. */
const TRACK_PACE = 26;

/** A pose partway through a flight, `u` from 0 to 1. */
export function flightPose(flight: Flight, u: number): Pose {
  return along(flight.poses, ease(u, 0, flight.endSpeed));
}
