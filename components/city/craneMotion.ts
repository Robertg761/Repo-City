/**
 * How an active site's tower crane moves: the jib slews to and fro between
 * two headings, slowing to a stop at each end as a real operator's does, and
 * the hook with its load hangs from the trolley on its lines like the
 * pendulum it is, so it lags when the jib starts to turn, overshoots when it
 * stops and settles after. Pure: `ConstructionSite.tsx` steps it per frame.
 */

/** Slew speed, radians per second of the driving sine. */
export const SLEW_RATE = 0.3;
/** How far either side of its rest heading the jib turns, radians. */
export const SLEW_SPAN = 0.9;
/** The hook's distance from the mast along the jib. */
export const HOOK_REACH = 5.4;
/** From the trolley to the load's centre. */
export const LINE_LENGTH = 4.3;

const GRAVITY = 9.8;
/** Damping of the swing, per second. */
const DAMPING = 0.3;
/** The longest step integrated at once, so a hitch cannot blow the pendulum up. */
const MAX_STEP = 1 / 30;

/** The jib's heading at time `t`, radians, and its angular acceleration. */
export function slewAt(t: number, phase: number): { angle: number; accel: number } {
  const x = t * SLEW_RATE + phase;
  return { angle: SLEW_SPAN * Math.sin(x), accel: -SLEW_SPAN * SLEW_RATE * SLEW_RATE * Math.sin(x) };
}

/** A gentle, never repeating gust along the jib, metres per second squared. */
export function gust(t: number, phase: number): number {
  return 0.35 * Math.sin(t * 0.7 + phase) + 0.2 * Math.sin(t * 1.9 + phase * 2.3 + 1);
}

/**
 * The hanging load's two angles: `side` about the jib's x axis (the lag and
 * overshoot behind a turn), `along` about its z axis (swinging out and in).
 */
export interface Hanger {
  side: number;
  sideRate: number;
  along: number;
  alongRate: number;
}

export const newHanger = (): Hanger => ({ side: 0, sideRate: 0, along: 0, alongRate: 0 });

/** Advance the pendulum by `dt` seconds under the jib's slew acceleration and the wind. */
export function stepHanger(h: Hanger, dt: number, slewAccel: number, wind: number): void {
  let left = Math.min(dt, 0.25);
  while (left > 1e-6) {
    const step = Math.min(left, MAX_STEP);
    left -= step;
    const side = -(GRAVITY / LINE_LENGTH) * h.side - DAMPING * h.sideRate - (HOOK_REACH * slewAccel) / LINE_LENGTH;
    const along = -(GRAVITY / LINE_LENGTH) * h.along - DAMPING * h.alongRate + wind / LINE_LENGTH;
    h.sideRate += side * step;
    h.side += h.sideRate * step;
    h.alongRate += along * step;
    h.along += h.alongRate * step;
  }
}
