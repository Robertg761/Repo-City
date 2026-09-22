/**
 * The generation reveal (PLAN.md section 43): terrain, roads, districts,
 * buildings, landmarks, incidents, construction, then traffic. Every entity
 * carries `appearAt` in milliseconds; this module turns that plus a wall clock
 * into a 0..1 scale factor. Pure, so it is unit tested.
 */

export const REVEAL_MS = 400;

/** Ease-out cubic: fast start, soft landing, no overshoot through the ground. */
export function revealScale(now: number, start: number, appearAt: number): number {
  const t = (now - start - appearAt) / REVEAL_MS;
  if (!(t > 0)) return 0;
  if (t >= 1) return 1;
  const inv = 1 - t;
  return 1 - inv * inv * inv;
}

/** The moment every `appearAt` in the model has finished animating. */
export function revealEnd(appearAts: readonly number[]): number {
  let last = 0;
  for (const a of appearAts) if (a > last) last = a;
  return last + REVEAL_MS;
}

/** Peak of the settle curve, about three percent over the final size. */
const OVERSHOOT = 0.55;

/**
 * The same schedule with a small settle at the end: the piece rises a few
 * percent past its mark and drops back onto it, which reads as a building
 * being set down rather than inflated (PLAN.md section 43).
 */
export function revealSettle(now: number, start: number, appearAt: number): number {
  const t = (now - start - appearAt) / REVEAL_MS;
  if (!(t > 0)) return 0;
  if (t >= 1) return 1;
  const p = t - 1;
  return 1 + (OVERSHOOT + 1) * p * p * p + OVERSHOOT * p * p;
}

/** How long a crane's opening sweep takes, in milliseconds. */
export const SWING_MS = 520;

/** How long after a site starts rising its crane begins to swing. */
export const SWING_DELAY = REVEAL_MS * 0.45;

/**
 * How far through that sweep a crane is, 0..1. A site's crane swings once,
 * quickly, as the site finishes rising -- the last movement of the reveal --
 * and then settles into its idle behaviour (PLAN.md section 43, step 7).
 */
export function craneSwing(now: number, start: number, appearAt: number): number {
  const t = (now - start - appearAt - SWING_DELAY) / SWING_MS;
  if (!(t > 0)) return 0;
  if (t >= 1) return 1;
  const inv = 1 - t;
  return 1 - inv * inv * inv;
}
