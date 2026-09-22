/**
 * The renderer's numbers that grow with the settlement (PLAN.md 76.5, "Scale
 * checks at both ends"). A metropolis is 285 to 320 units across and a phone
 * frames it from nearly 1,300 units away, so the camera's far plane, the sky
 * dome and the per-tier street life all have to follow the settlement rather
 * than the city it used to be.
 *
 * Every function here returns exactly today's value for a city: the city tier
 * must render as it did before settlements existed. Pure and unit tested.
 */

import { DEFAULT_SETTLEMENT_TIER, SETTLEMENT_PARAMS } from "@/lib/city/settlement";
import type { SettlementTier } from "@/types/analysis";
import type { CityModel } from "@/types/city";

/** The tier a model renders as: its settlement, or today's city. */
export function tierOf(city: Pick<CityModel, "settlement"> | null | undefined): SettlementTier {
  return city?.settlement?.tier ?? DEFAULT_SETTLEMENT_TIER;
}

/**
 * The sky dome's radius. Today's rule, `4 * size` held between 700 and 1,400,
 * is kept, and grown only where the camera could otherwise come near the
 * dome: to 1.3 times the furthest the camera may pull back (PLAN.md 76.5). On
 * a desktop that would take a 567 unit city, so every desktop keeps today's
 * dome. A phone pulls back up to 2.1 times as far, and there the rule is what
 * keeps a camera framing a metropolis from 1,277 units inside the sky; a
 * phone's city gets a slightly larger dome than before, which only moves the
 * pale band below the horizon, out past the landscape.
 */
export function skyRadius(size: number, maxCameraDistance: number): number {
  const today = Math.min(Math.max(size * 4, 700), 1400);
  return Math.max(today, 1.3 * maxCameraDistance);
}

/**
 * The camera's far plane. At least today's 2,000; at least `7 * size`
 * (PLAN.md 76.5); and far enough that the far side of the sky dome, seen from
 * the camera at its furthest, is never clipped into the flat background.
 */
export function cameraFar(size: number, maxCameraDistance: number): number {
  return Math.max(2000, 7 * size, skyRadius(size, maxCameraDistance) + maxCameraDistance);
}

/**
 * Street lamps drawn at most, per tier. A village's are few and far between;
 * a metropolis lights its avenues. The city keeps its 120.
 */
export function lampCap(tier: SettlementTier): number {
  return SETTLEMENT_PARAMS[tier].lamps;
}

/** Trees drawn at most, per tier. A village has more of them than a city. */
export function treeCap(tier: SettlementTier): number {
  return SETTLEMENT_PARAMS[tier].trees;
}

/**
 * How many people walk the streets, relative to the city: the same share of
 * the tier's traffic cap the city has. A village's lanes carry a quarter of
 * the city's crowd, a metropolis more than half as many again.
 */
export function crowdScale(tier: SettlementTier): number {
  return SETTLEMENT_PARAMS[tier].vehicles.max / SETTLEMENT_PARAMS.city.vehicles.max;
}

/** Median trees on a metropolis's avenues, over and above the tier's trees. */
export const MEDIAN_TREE_CAP = 90;

/**
 * At most `cap` items, spread evenly through the list rather than cut off at
 * its end: the generator lists lamps road by road, and a cap that kept only
 * the first roads' lamps would light one corner of the village. A list at or
 * under the cap comes back unchanged.
 */
export function thinEvenly<T>(list: readonly T[], cap: number): T[] {
  if (list.length <= cap) return list.slice();
  if (cap <= 0) return [];
  const out: T[] = [];
  for (let i = 0; i < cap; i++) out.push(list[Math.floor((i * list.length) / cap)]);
  return out;
}

// ---------------------------------------------------------------------------
// Shadows
// ---------------------------------------------------------------------------

/**
 * Half the side of the square the sun's shadow camera covers. A shadow cast
 * by a sun 24 degrees up is more than twice as long as one cast from 52
 * degrees: 0.62 of the city covers the midday case, and the evening term
 * covers the rest.
 */
export function shadowReach(size: number, evening: number): number {
  return size * (0.62 + evening * 0.22);
}

/** World units per shadow-map texel. */
export function shadowTexel(size: number, evening: number, mapSize: number): number {
  return (shadowReach(size, evening) * 2) / mapSize;
}

/**
 * World units per screen pixel at the orbit target, for a camera `distance`
 * away with a vertical field of view of `fovDegrees` on a viewport
 * `heightPx` tall.
 */
export function pixelFootprint(distance: number, heightPx: number, fovDegrees = 35): number {
  return (2 * distance * Math.tan((fovDegrees * Math.PI) / 360)) / heightPx;
}
