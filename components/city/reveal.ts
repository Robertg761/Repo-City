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

/**
 * The backlog's window (PLAN.md 76.8, amending section 43): after the heroes,
 * from 2.7 to 3.9 seconds, ordered by distance from the centre so it ripples
 * outward across the city.
 */
export const BACKLOG_REVEAL: readonly [number, number] = [2700, 3900];

/**
 * When a crowd object at `(x, z)` appears, in a city `size` across: the
 * centre at the start of the window, the corners and anything beyond them at
 * its end. The generator writes this into `appearAt`; the renderer only reads
 * `appearAt`, so the two cannot disagree.
 */
export function crowdAppearAt(x: number, z: number, size: number): number {
  const reach = Math.max(1, size * Math.SQRT1_2);
  const t = Math.min(1, Math.hypot(x, z) / reach);
  const [start, end] = BACKLOG_REVEAL;
  return Math.round(start + (end - start) * t);
}

/** Anything with a reveal time. */
interface Appears {
  appearAt: number;
}

/**
 * The moment the whole model has finished revealing, backlog and queue
 * included: when traffic starts and when the quality probe may begin timing
 * frames (PLAN.md 76.9).
 */
export function cityRevealEnd(city: {
  buildings: readonly Appears[];
  landmarks: readonly Appears[];
  incidents: readonly Appears[];
  constructionSites: readonly Appears[];
  backlog?: { incidents: readonly Appears[]; constructionSites: readonly Appears[] };
  overflow?: Appears | null;
}): number {
  const times: number[] = [];
  const add = (list: readonly Appears[] | undefined) => {
    for (const item of list ?? []) times.push(item.appearAt);
  };
  add(city.buildings);
  add(city.landmarks);
  add(city.incidents);
  add(city.constructionSites);
  add(city.backlog?.incidents);
  add(city.backlog?.constructionSites);
  if (city.overflow) times.push(city.overflow.appearAt);
  return revealEnd(times);
}
