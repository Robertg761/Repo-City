/**
 * Banks for the land's water (`?land=rich`): how far the ground falls from the
 * level land to a stream's, a river's or a pond's surface, and how the bank is
 * coloured. Pure functions of a distance from the water's edge, shared by the
 * plan (the terrain's trench), the corridor mesh that draws the banks exactly
 * (`build.ts`) and the tests.
 *
 * `d` is the distance from the water's EDGE: negative over the water, zero at
 * the waterline, `bank` where the slope meets the level land.
 */

export interface WaterSpec {
  /** Horizontal width of the slope from the waterline up to the level land. */
  bank: number;
  /** How far the water's surface lies below the level land. */
  drop: number;
}

/** The spec of a river or stream of a given width. */
export function riverSpec(width: number): WaterSpec {
  const w = Math.min(width, 34);
  return { bank: 3.4 + w * 0.13, drop: 0.42 + w * 0.028 };
}

export const POND_SPEC: WaterSpec = { bank: 3.6, drop: 0.5 };

const smooth = (t: number) => {
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return c * c * (3 - 2 * c);
};

/**
 * How far below the level land the bank is at `d` from the water's edge:
 * `drop` at the waterline and on a little past it (the bed), nothing at the
 * top of the bank. The profile is a gentle S: steepest mid-way, flat at the
 * water and at the top.
 */
export function bankDepth(d: number, spec: WaterSpec, halfWidth = Infinity): number {
  if (d >= spec.bank) return 0;
  if (d >= 0) return spec.drop * (1 - smooth(d / spec.bank));
  // Over the water: the bed falls away a little more towards the middle.
  return spec.drop + 0.55 * smooth(Math.min(1, -d / Math.max(0.5, halfWidth * 0.8)));
}

/**
 * The terrain's own trench is deeper than the true bank, so the coarse mesh
 * never stands above the exact corridor mesh drawn in it, and climbs out of it
 * only at the far edge of the bank.
 */
export function trenchDepth(d: number, spec: WaterSpec, halfWidth = Infinity): number {
  const reach = spec.bank * 1.75;
  if (d >= reach) return 0;
  const extra = 0.8 * (1 - smooth(Math.max(0, d) / reach));
  return bankDepth(d, spec, halfWidth) + extra;
}

/** The outermost distance the trench reaches: nothing else of the land comes closer than this. */
export function trenchReach(spec: WaterSpec): number {
  return spec.bank * 1.75;
}

/** Wet edge, mud, then the land's own colour: weights of each at `d` (they sum to one). */
export function bankMix(d: number, spec: WaterSpec): { wet: number; mud: number; land: number; bed: number } {
  if (d < 0) return { wet: 0, mud: 0, land: 0, bed: 1 };
  const wet = 1 - smooth(d / 0.9);
  const mudReach = spec.bank * 0.78;
  const mud = (1 - smooth(d / mudReach)) * (1 - wet);
  return { wet, mud, land: Math.max(0, 1 - wet - mud), bed: 0 };
}
