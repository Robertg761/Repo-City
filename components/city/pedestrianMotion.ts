/**
 * How a walker is drawn, as opposed to where the simulation says it is
 * (`models/props/pedestrians.ts`). Pure and allocation-free, so it runs for
 * every figure on every frame and is unit tested.
 *
 * The simulation is a point on a pavement centreline. Followed exactly, it
 * jumped: at a junction the next pavement starts a few units from where the
 * last one ended, a walker changing sides crossed the road in one frame, and
 * turning back at a hoarding or rounding a corner snapped the heading through
 * up to half a turn at once. Everyone also walked the same line, so passing
 * figures went straight through each other.
 *
 * Here the drawn figure follows its simulated point instead of sitting on
 * it: it keeps to its own line on the pavement, catches up over a gap at a
 * brisk walk rather than teleporting (a change of sides reads as crossing the
 * street), turns at a person's pace, and steps aside for whoever it meets.
 */

/** Drawn state for a crowd, one slot per figure. */
export interface CrowdMotion {
  x: Float32Array;
  z: Float32Array;
  angle: Float32Array;
  /** 0 until the figure has been placed once. */
  placed: Uint8Array;
}

export function createCrowdMotion(count: number): CrowdMotion {
  return {
    x: new Float32Array(count),
    z: new Float32Array(count),
    angle: new Float32Array(count),
    placed: new Uint8Array(count),
  };
}

/** How far either side of the pavement's centreline a walker keeps. */
export const LANE_SPREAD = 0.32;
/** How quickly a figure closes on its point while walking normally, per second. */
const FOLLOW_RATE = 12;
/** How much faster than its stroll a figure covers a gap: a brisk walk. */
const HURRY = 2.4;
/** The fastest a figure turns, radians per second: half a turn in under half a second. */
const TURN_RATE = 7.5;
/** A gap past which the figure faces where it is going, not the pavement. */
const CROSSING = 0.35;
/** A gap too wide to walk across in the open: the figure is simply placed. */
const TOO_FAR = 14;
/** Two figures closer than this, centre to centre, step apart. Bodies are 0.34 across. */
export const PERSONAL_SPACE = 0.42;

/** A walker's own line on the pavement, from its seeded phase: -spread..spread. */
export function laneOffset(phase: number): number {
  // The phase is uniform over a turn; its sine spreads the crowd across the
  // pavement, a little denser towards the edges than the middle.
  return Math.sin(phase * 1.7) * LANE_SPREAD;
}

const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * Move figure `i` towards its simulated pose over `dt` seconds. `lane` is its
 * offset to the right of its heading; `speed` its stroll in units a second.
 * A `dt` of zero (the reveal still running) places it exactly.
 */
export function followPose(
  motion: CrowdMotion,
  i: number,
  poseX: number,
  poseZ: number,
  poseAngle: number,
  lane: number,
  speed: number,
  dt: number,
): void {
  // Right of the heading, the same convention as `walkerPose`'s pavement side.
  const tx = poseX - Math.cos(poseAngle) * lane;
  const tz = poseZ + Math.sin(poseAngle) * lane;
  if (!motion.placed[i] || !(dt > 0)) {
    motion.x[i] = tx;
    motion.z[i] = tz;
    motion.angle[i] = poseAngle;
    motion.placed[i] = 1;
    return;
  }

  const dx = tx - motion.x[i];
  const dz = tz - motion.z[i];
  const gap = Math.hypot(dx, dz);
  if (gap > TOO_FAR) {
    // Nothing a person could walk: place it, as on the first frame.
    motion.placed[i] = 0;
    followPose(motion, i, poseX, poseZ, poseAngle, lane, speed, 0);
    return;
  }
  // Walking, the figure is a whisker behind its point; over a gap it walks
  // the gap, never faster than a brisk walk.
  const step = Math.min(gap * Math.min(1, dt * FOLLOW_RATE), speed * HURRY * dt);
  if (gap > 1e-6) {
    motion.x[i] += (dx / gap) * step;
    motion.z[i] += (dz / gap) * step;
  }

  // Face the way the figure is actually going while it covers a gap, and the
  // pavement's direction otherwise; either way, turn at a person's pace.
  const facing = gap > CROSSING ? Math.atan2(dx, dz) : poseAngle;
  const turn = wrap(facing - motion.angle[i]);
  const most = TURN_RATE * dt;
  motion.angle[i] = wrap(motion.angle[i] + Math.max(-most, Math.min(most, turn)));
}

/** Pins figures from `from` on to where they stand: the idle groups. */
export function standStill(
  motion: CrowdMotion,
  from: number,
  figures: readonly { position: readonly number[]; angle: number }[],
): void {
  for (let i = 0; i < figures.length; i++) {
    motion.x[from + i] = figures[i].position[0];
    motion.z[from + i] = figures[i].position[2];
    motion.angle[from + i] = figures[i].angle;
    motion.placed[from + i] = 1;
  }
}

/**
 * Nudge apart any two of the first `count` figures that stand closer than
 * `PERSONAL_SPACE`, sharing the step between them. Figures from `fixedFrom`
 * on (the idle groups) stand their ground; walkers step round them. The
 * nudge is to the drawn position only, so the follow pulls each back onto
 * its line once they have passed.
 */
export function keepApart(motion: CrowdMotion, count: number, fixedFrom = count): void {
  const { x, z } = motion;
  for (let i = 0; i < Math.min(count, fixedFrom); i++) {
    for (let j = i + 1; j < count; j++) {
      const dx = x[j] - x[i];
      const dz = z[j] - z[i];
      const d2 = dx * dx + dz * dz;
      if (d2 >= PERSONAL_SPACE * PERSONAL_SPACE) continue;
      const d = Math.sqrt(d2);
      // Exactly on top of each other: part them across an arbitrary line.
      const nx = d > 1e-4 ? dx / d : 1;
      const nz = d > 1e-4 ? dz / d : 0;
      const push = PERSONAL_SPACE - d;
      if (j >= fixedFrom) {
        x[i] -= nx * push;
        z[i] -= nz * push;
      } else {
        x[i] -= nx * push * 0.5;
        z[i] -= nz * push * 0.5;
        x[j] += nx * push * 0.5;
        z[j] += nz * push * 0.5;
      }
    }
  }
}
