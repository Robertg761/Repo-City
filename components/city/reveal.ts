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
