/**
 * How a car sits on the road and rides it (`Traffic.tsx`). The simulation in
 * `traffic.ts` moves a point with a heading and a speed; this gives that point
 * a body that behaves like one on springs.
 *
 *   - CONTACT. The tyres are the only thing that touches the road: each wheel
 *     stands on the surface height under it, always, whatever the body does.
 *     The body is carried above them and may move against them (`stanceOf`).
 *     On a slope the car takes the road's pitch from its two axles.
 *   - PITCH AND ROLL. Braking dips the nose and acceleration squats the tail;
 *     a bend leans the body out, away from the turn. Each is a damped spring
 *     towards the lean the acceleration asks for, so the body settles with a
 *     slight overshoot rather than snapping to it.
 *   - BOB. A small vertical spring keeps a moving car alive on its springs.
 *   - LAMPS. Brake lights follow the car's own deceleration, and the
 *     indicators follow the turn it is about to make (`signalOf`).
 *
 * All per-car state sits in typed arrays sized once, and nothing here
 * allocates, so it runs for every car on every frame. Pure, no three.js:
 * unit tested.
 */

import type { Car, Traffic } from "./traffic";

/** The carriageway's top, in world units above the ground plate (`Roads.tsx`). */
export const ROAD_TOP = 0.08;

/** A district's ground plate sits this far above the ground plane (`District.tsx`). */
export const DISTRICT_TOP = 0.01;

/**
 * The height of the ground a verge-side car is parked on: a district's plate
 * where one lies under it, the landscape's terrain (`sample`, when it has
 * arrived) beyond the districts, and the plane itself before then.
 */
export function groundUnder(
  rects: readonly { x: number; z: number; w: number; d: number }[],
  sample: Surface | null | undefined,
  x: number,
  z: number,
): number {
  for (const r of rects) {
    if (Math.abs(x - r.x) <= r.w / 2 && Math.abs(z - r.z) <= r.d / 2) return DISTRICT_TOP;
  }
  return sample ? sample(x, z) : 0;
}

/** The height of the road under `(x, z)`. Flat in a city; a hill or a ramp is any other function. */
export type Surface = (x: number, z: number) => number;
export const flatRoad: Surface = () => ROAD_TOP;

/** Spring stiffness (rad/s) and damping ratio of the body on its suspension. */
const OMEGA = 11;
const ZETA = 0.42;
/** Longest step the springs are integrated over; a longer frame is taken in pieces. */
const MAX_STEP = 1 / 40;

/** Radians of pitch per unit of longitudinal acceleration, and its cap. */
const PITCH_GAIN = 0.011;
const PITCH_MAX = 0.06;
/** Radians of roll per unit of lateral acceleration, and its cap. */
const ROLL_GAIN = 0.016;
const ROLL_MAX = 0.055;
/** Peak vertical bob, world units, and how fast it cycles per unit driven. */
const BOB_AMPLITUDE = 0.012;
const BOB_PER_UNIT = 2.3;
/** How quickly the measured acceleration is smoothed, per second. */
const ACCEL_RATE = 9;
/** How quickly the front wheels follow the steering, per second. */
const STEER_RATE = 14;

/** Deceleration past which the brake lights come on, and the speed under which a car is standing. */
export const BRAKE_DECEL = 0.7;
const STANDING = 0.25;
/** Turns smaller than this (radians) are not signalled. */
export const SIGNAL_TURN = 0.4;
/** How far short of the end of its lane a car starts to signal, world units. */
export const SIGNAL_RANGE = 16;
/** Indicator flashes per second. */
export const FLASH_HZ = 1.6;

/** Per-car dynamic state, one slot per car. */
export interface Dynamics {
  pitch: Float32Array;
  pitchV: Float32Array;
  roll: Float32Array;
  rollV: Float32Array;
  bob: Float32Array;
  bobV: Float32Array;
  /** Smoothed longitudinal acceleration (units/s^2, positive speeding up) and last speed. */
  accel: Float32Array;
  speed: Float32Array;
  /** The front wheels' steering angle, radians, and the distance driven (for the bob's phase). */
  steer: Float32Array;
  driven: Float32Array;
  /** 0 until the car has been stepped once, so its first frame does not read a jump in speed. */
  seen: Uint8Array;
}

export function createDynamics(count: number): Dynamics {
  const f = () => new Float32Array(count);
  return {
    pitch: f(), pitchV: f(), roll: f(), rollV: f(), bob: f(), bobV: f(),
    accel: f(), speed: f(), steer: f(), driven: f(),
    seen: new Uint8Array(count),
  };
}

export function resetDynamics(d: Dynamics): void {
  for (const key of Object.keys(d) as (keyof Dynamics)[]) d[key].fill(0);
}

const clamp = (n: number, lo: number, hi: number): number => (n < lo ? lo : n > hi ? hi : n);

/** One damped-spring step of `x` towards `target`, semi-implicit so it stays stable. */
function spring(x: Float32Array, v: Float32Array, i: number, target: number, dt: number): void {
  v[i] += (OMEGA * OMEGA * (target - x[i]) - 2 * ZETA * OMEGA * v[i]) * dt;
  x[i] += v[i] * dt;
}

/**
 * Advances car `i`'s body by `dt` seconds. `speed` is what the car is doing
 * (negative reversing), `curvature` the heading change per unit driven (left
 * positive), `steerAim` the steering angle its front wheels are after.
 */
export function stepDynamics(
  d: Dynamics,
  i: number,
  dt: number,
  speed: number,
  curvature: number,
  steerAim: number,
): void {
  if (!(dt > 0)) return;
  if (!d.seen[i]) {
    d.seen[i] = 1;
    d.speed[i] = speed;
    d.steer[i] = steerAim;
  }
  // Acceleration from the change in speed, smoothed so a frame's jitter does not shake the body.
  const raw = (speed - d.speed[i]) / dt;
  d.speed[i] = speed;
  d.accel[i] += (raw - d.accel[i]) * Math.min(1, dt * ACCEL_RATE);
  d.steer[i] += (steerAim - d.steer[i]) * Math.min(1, dt * STEER_RATE);
  d.driven[i] += Math.abs(speed) * dt;

  // Nose down under braking (positive pitch is nose down), out of the bend under cornering.
  const lateral = speed * Math.abs(speed) * curvature;
  const pitchTarget = clamp(-d.accel[i] * PITCH_GAIN, -PITCH_MAX, PITCH_MAX);
  const rollTarget = clamp(lateral * ROLL_GAIN, -ROLL_MAX, ROLL_MAX);
  const alive = Math.min(1, Math.abs(speed) / 3);
  const bobTarget = Math.sin(d.driven[i] * BOB_PER_UNIT + i * 1.7) * BOB_AMPLITUDE * alive;

  // Long frames are integrated in pieces so the springs stay stable.
  const pieces = Math.max(1, Math.ceil(dt / MAX_STEP));
  const h = dt / pieces;
  for (let k = 0; k < pieces; k++) {
    spring(d.pitch, d.pitchV, i, pitchTarget, h);
    spring(d.roll, d.rollV, i, rollTarget, h);
    spring(d.bob, d.bobV, i, bobTarget, h);
  }
}

/** Where a car's body and wheels stand: heights and tilt, written by `stanceOf`. */
export interface Stance {
  /** The body origin's height: the road under the car's middle. */
  y: number;
  /** The road's own pitch under the car, positive nose down (`rotation.x`). */
  slope: number;
  /** Height of the road under the wheel at each `lz` is `base + rise * lz`. */
  base: number;
  rise: number;
}

/**
 * Samples the road under a car at its axles. `front` and `rear` are the axles'
 * `z` offsets in the body frame (front positive); `(x, z)` and the heading's
 * `cos`/`sin` place them in the world. The road under any wheel is then
 * `base + rise * lz`, and the car pitches with the road.
 */
export function stanceOf(
  out: Stance,
  surface: Surface,
  x: number,
  z: number,
  cos: number,
  sin: number,
  front: number,
  rear: number,
): Stance {
  // In the body frame a point `lz` ahead is at (x + lz * sin, z + lz * cos).
  const hf = surface(x + front * sin, z + front * cos);
  const hr = surface(x + rear * sin, z + rear * cos);
  const run = front - rear;
  out.rise = run > 1e-6 ? (hf - hr) / run : 0;
  out.base = hr - out.rise * rear;
  out.y = out.base;
  // Nose up is a negative rotation about x.
  out.slope = -Math.atan(out.rise);
  return out;
}

/** The height a wheel of `radius` (scaled by `grow`) has its centre at, on the road at `lz`. */
export const wheelCentre = (ride: Stance, lz: number, radius: number, grow: number): number =>
  ride.base + ride.rise * lz + radius * grow;

/**
 * Ease for a car's first appearance: its body grows about the ground, its
 * wheels grow on it (`wheelCentre`), so nothing ever hangs in the air.
 */
export function carGrow(elapsed: number, delay: number, duration = 0.45): number {
  const t = (elapsed - delay) / duration;
  if (!(t > 0)) return 0;
  if (t >= 1) return 1;
  const inv = 1 - t;
  return 1 - inv * inv * inv;
}

// ---------------------------------------------------------------------------
// Lamps
// ---------------------------------------------------------------------------

/** Which way a car is signalling: -1 right, 0 none, +1 left. */
export type Signal = -1 | 0 | 1;

/**
 * The indicator a car should be showing: the turn it is making through a
 * junction, and the turn it has planned for the end of its lane once it is
 * within `SIGNAL_RANGE` of it. Left is positive, as a movement's `turn`.
 */
export function signalOf(traffic: Traffic, car: Car): Signal {
  const { moves } = traffic.network;
  if (car.turn !== null) return 1;
  if (car.move >= 0) {
    const turn = moves[car.move].turn;
    return turn > SIGNAL_TURN ? 1 : turn < -SIGNAL_TURN ? -1 : 0;
  }
  if (car.plan < 0 || car.plan >= moves.length) return 0;
  const turn = moves[car.plan].turn;
  if (Math.abs(turn) < SIGNAL_TURN) return 0;
  const remaining = traffic.graph.lengths[car.segment] * (1 - car.t);
  if (remaining > SIGNAL_RANGE) return 0;
  return turn > 0 ? 1 : -1;
}

/** Whether the indicators are in the lit half of their flash at `time` seconds. */
export const flashOn = (time: number, phase = 0): boolean => ((time + phase) * FLASH_HZ) % 1 < 0.55;

/** True when a car's brake lights should be lit: slowing noticeably, or standing. */
export const braking = (d: Dynamics, i: number, speed: number): boolean =>
  d.accel[i] < -BRAKE_DECEL || Math.abs(speed) < STANDING;
