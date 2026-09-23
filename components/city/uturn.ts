/**
 * How a car turns round (PLAN.md sections 17 and 18).
 *
 * Traffic drives on the right, so a U-turn swings to the left, across the
 * centre line, into the other lane. A car only has the carriageway to do it
 * in, and it has a turning circle:
 *
 *   - on a road wide enough for that circle (a metropolis avenue or the
 *     motorway ring) it sweeps round in one half circle from its own lane to
 *     the other;
 *   - on anything narrower it makes a THREE-POINT TURN: forward and left
 *     towards the far kerb, back and to the right, then forward and left again
 *     into the other lane, stopping at each change of gear.
 *
 * Every leg is an arc of the same turning circle, so the heading changes at a
 * steady rate and never jumps, and the car ends exactly abreast of where it
 * started, in the other lane, facing the other way.
 *
 * FRAME. A manoeuvre is described in the car's frame where it started: `x`
 * runs to the LEFT across the road and `y` straight ahead; the car starts at
 * `(-lane, 0)` facing `+y` and ends at `(+lane, 0)` facing `-y`. The heading
 * `psi` is measured from `+y` towards `+x`, so a left turn increases it.
 *
 * Pure, no three.js: unit tested.
 */

/**
 * The fleet's turning circle, world units (radius of the path of the car's
 * centre). About three and a half metres at the scale the generator builds
 * to: a small car on full lock.
 */
export const TURN_RADIUS = 2.4;

/** A half circle of at least this radius reads as a smooth sweep, not a spin. */
export const LOOP_MIN_RADIUS = 2;

export interface UTurnShape {
  /** One half circle (true) or a three-point turn. */
  loop: boolean;
  /** Radius of every leg. */
  radius: number;
  /** The lane offset it starts and ends at. */
  lane: number;
  /** Heading at the end of the first leg and at the end of the second. */
  psi1: number;
  psi2: number;
  /** Length of each leg, along the path of the car's centre; loops use only the first. */
  legs: [number, number, number];
  total: number;
}

/**
 * The manoeuvre for a lane this far from the centre line. The three-point
 * turn is symmetric: the first and last legs turn through the same angle, and
 * the angle is whatever lands the car back in the other lane.
 */
export function uTurnShape(lane: number): UTurnShape {
  if (lane >= LOOP_MIN_RADIUS) {
    const length = Math.PI * lane;
    return { loop: true, radius: lane, lane, psi1: Math.PI, psi2: Math.PI, legs: [length, 0, 0], total: length };
  }
  const radius = TURN_RADIUS;
  // 1 - cos(psi1) + cos(psi2) = lane / radius, with psi2 = pi - psi1.
  const psi1 = Math.acos(Math.min(1, Math.max(-1, (1 - lane / radius) / 2)));
  const psi2 = Math.PI - psi1;
  const legs: [number, number, number] = [radius * psi1, radius * (psi2 - psi1), radius * (Math.PI - psi2)];
  return { loop: false, radius, lane, psi1, psi2, legs, total: legs[0] + legs[1] + legs[2] };
}

/** A pose in the manoeuvre's own frame. */
export interface UTurnPose {
  x: number;
  y: number;
  /** Heading, from +y towards +x. */
  psi: number;
  /** True while backing up: the car moves against its heading. */
  reverse: boolean;
  /** Which leg, 0 to 2. */
  leg: number;
  /** Rate of turn of the heading per unit travelled, radians per unit. */
  curvature: number;
}

/**
 * Where the car is `s` units along its manoeuvre, written into `out` so the
 * frame loop does not allocate.
 */
export function uTurnPose(shape: UTurnShape, s: number, out: UTurnPose): UTurnPose {
  const { radius: r, lane, psi1, psi2, legs } = shape;
  const d = Math.min(Math.max(s, 0), shape.total);
  const k = 1 / r;
  if (shape.loop || d <= legs[0]) {
    const psi = d / r;
    out.x = -lane + r * (1 - Math.cos(psi));
    out.y = r * Math.sin(psi);
    out.psi = psi;
    out.reverse = false;
    out.leg = 0;
    out.curvature = k;
    return out;
  }
  // The end of the first leg, and the centre of the second: to the car's right.
  const p1x = -lane + r * (1 - Math.cos(psi1));
  const p1y = r * Math.sin(psi1);
  const c2x = p1x - r * Math.cos(psi1);
  const c2y = p1y + r * Math.sin(psi1);
  if (d <= legs[0] + legs[1]) {
    // Backing up with the wheels to the right: the heading keeps turning left.
    const psi = psi1 + (d - legs[0]) / r;
    out.x = c2x + r * Math.cos(psi);
    out.y = c2y - r * Math.sin(psi);
    out.psi = psi;
    out.reverse = true;
    out.leg = 1;
    out.curvature = k;
    return out;
  }
  const p2x = c2x + r * Math.cos(psi2);
  const p2y = c2y - r * Math.sin(psi2);
  const c3x = p2x + r * Math.cos(psi2);
  const c3y = p2y - r * Math.sin(psi2);
  const psi = psi2 + (d - legs[0] - legs[1]) / r;
  out.x = c3x - r * Math.cos(psi);
  out.y = c3y + r * Math.sin(psi);
  out.psi = psi;
  out.reverse = false;
  out.leg = 2;
  out.curvature = k;
  return out;
}

const probe: UTurnPose = { x: 0, y: 0, psi: 0, reverse: false, leg: 0, curvature: 0 };

/**
 * How far ahead of where it started any corner of a body `halfLength` by
 * `halfWidth` reaches during the manoeuvre. Measured, not derived, so it holds
 * for either shape.
 */
export function uTurnAhead(shape: UTurnShape, halfLength: number, halfWidth: number): number {
  let ahead = halfLength;
  const steps = 96;
  for (let i = 0; i <= steps; i++) {
    uTurnPose(shape, (shape.total * i) / steps, probe);
    const fy = Math.cos(probe.psi);
    const fx = Math.sin(probe.psi);
    // The corner furthest along +y: half a length along the heading and half
    // a width across it, each on whichever side points forward.
    const reach = probe.y + halfLength * Math.abs(fy) + halfWidth * Math.abs(fx);
    if (reach > ahead) ahead = reach;
  }
  return ahead;
}
