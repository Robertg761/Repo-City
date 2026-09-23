/**
 * THE MIX MODEL for the ambient soundscape: what the city should sound like,
 * as numbers, before any of it is made audible (`components/audio/engine.ts`
 * turns these numbers into Web Audio gains and event schedules).
 *
 * Pure: no Web Audio, no React, no three.js. Unit tested in
 * `audioMix.test.ts`.
 *
 * THREE THINGS SET THE MIX.
 *
 *   The hour. The day is the sky's loop (`components/city/timeOfDay.ts`):
 *   morning 0, afternoon 1, evening 2, night 3, and 4 is morning again. Each
 *   hour has a weight that peaks at its own point and fades to nothing at its
 *   neighbours', so the weights always add up to one and a sky travelling
 *   between hours crossfades the sound with it. Morning is birdsong;
 *   afternoon the city's hum at its busiest; evening softer, with a few
 *   birds; night is crickets and quiet, with the odd car in the distance.
 *
 *   The settlement. A village is rural (wind in the grass, birds, a tractor
 *   somewhere, now and then a sheep or a cow), a town is in between, and a
 *   metropolis is a dense traffic hum over a low rumble with the occasional
 *   horn. The health of the repository sets how lively all of it is, and an
 *   archived one is eerily quiet: wind, and very little else.
 *
 *   The camera. Pulled back, the listener hears a soft bed of the whole
 *   place, and a little more wind. Down among the buildings the bed gives
 *   way to local sources: the nearest fires, cranes, the power station and
 *   the transit station (`audioSources.ts`).
 *
 * Every gain here is RELATIVE, 0 to 1: how much of that layer this scene
 * wants. How loud a layer is at 1 is the engine's calibration. Every rate is
 * events a second before the engine's own seeded jitter.
 */

import type { SettlementTier } from "@/types/analysis";

export const DAY_LOOP = 4;

export interface TimeWeights {
  morning: number;
  afternoon: number;
  evening: number;
  night: number;
}

/** A scene as the soundscape sees it. */
export interface MixScene {
  /** Null for the empty stage before any repository is surveyed. */
  tier: SettlementTier | null;
  /** The hour, on the sky's loop: `[0, 4)`, any real number is wrapped. */
  phase: number;
  /** Health score, 0 to 100. */
  health: number;
  /** Activity score, 0 to 1. */
  activity: number;
  archived: boolean;
  /** `ambience.trafficDensity`, 0 to 1. */
  traffic: number;
}

/** The event layers: short sounds scheduled at random, never on a grid. */
export const EVENT_LAYERS = ["birds", "crickets", "horns", "cars", "tractor", "livestock"] as const;
export type EventLayer = (typeof EVENT_LAYERS)[number];

/** The bed layers: continuous, looped, filtered noise. */
export const BED_LAYERS = ["wind", "hum", "rumble"] as const;
export type BedLayer = (typeof BED_LAYERS)[number];

export interface EventMix {
  /** Relative level, 0..1. */
  gain: number;
  /** Mean events a second (a Poisson process in the engine). 0 is silent. */
  rate: number;
}

export interface Mix {
  beds: Record<BedLayer, number>;
  events: Record<EventLayer, EventMix>;
  /** How much of the local sources (fires, cranes, landmarks) to let through, 0..1. */
  local: number;
}

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : Number.isFinite(n) ? n : 0);

/** Wraps any phase onto the loop, `[0, 4)`. */
export function wrapPhase(phase: number): number {
  if (!Number.isFinite(phase)) return 1;
  return ((phase % DAY_LOOP) + DAY_LOOP) % DAY_LOOP;
}

/**
 * How much of each hour a point on the loop is. Two neighbouring hours share
 * every point between them, linearly, so the weights sum to one everywhere.
 */
export function timeWeights(phase: number): TimeWeights {
  const p = wrapPhase(phase);
  const near = (centre: number) => {
    const d = Math.abs(p - centre);
    return Math.max(0, 1 - Math.min(d, DAY_LOOP - d));
  };
  return { morning: near(0), afternoon: near(1), evening: near(2), night: near(3) };
}

/** How rural and how urban each settlement sounds, 0 to 1. */
export const TIER_CHARACTER: Record<SettlementTier | "empty", { rural: number; urban: number }> = {
  empty: { rural: 0.85, urban: 0 },
  village: { rural: 1, urban: 0.08 },
  town: { rural: 0.6, urban: 0.38 },
  city: { rural: 0.3, urban: 0.7 },
  metropolis: { rural: 0.1, urban: 1 },
};

/**
 * How lively the place is, 0 to 1. Health and activity make a thriving
 * repository lively; an archived one is eerily quiet whatever its score.
 */
export function liveliness(scene: Pick<MixScene, "health" | "activity" | "archived">): number {
  if (scene.archived) return 0.12;
  return clamp01(0.35 + 0.4 * clamp01(scene.health / 100) + 0.25 * clamp01(scene.activity));
}

/** The closest the orbit lets the camera come, near enough (`CityCanvas`'s `minDistance`). */
export const NEAR_DISTANCE = 12;

/**
 * Where the camera is between the ground (0) and the overview (1), from its
 * distance to the point it looks at. Logarithmic, as zooming feels: halving
 * the distance is the same step anywhere in the range.
 */
export function cameraAltitude(distance: number, citySize: number): number {
  if (!Number.isFinite(distance) || distance <= NEAR_DISTANCE) return 0;
  const far = Math.max(140, (Number.isFinite(citySize) ? citySize : 120) * 1.5);
  return clamp01(Math.log(distance / NEAR_DISTANCE) / Math.log(far / NEAR_DISTANCE));
}

/** One event layer at `gain`, `rate` events a second; silent when either is nothing. */
const event = (gain: number, rate: number): EventMix => {
  const g = clamp01(gain);
  return g < 0.01 ? { gain: 0, rate: 0 } : { gain: g, rate: Math.max(0, rate) };
};

/**
 * The mix for a scene seen from `altitude` (0 on the ground, 1 at the
 * overview). The single source of truth for the soundscape's balance.
 */
export function mixFor(scene: MixScene, altitude: number): Mix {
  const t = timeWeights(scene.phase);
  const { rural, urban } = TIER_CHARACTER[scene.tier ?? "empty"];
  const life = liveliness(scene);
  const alt = clamp01(altitude);
  const traffic = clamp01(scene.traffic);
  const isVillage = scene.tier === "village";
  const quiet = scene.archived ? 1 : 0;
  // Down among the buildings the bed steps back for the local sources.
  const bed = 0.72 + 0.28 * alt;

  // Wind is the one layer an archived city keeps, and it is stronger for it;
  // a little stronger at night and up high, where nothing shelters it.
  const wind = clamp01(
    (0.3 + 0.4 * rural + 0.25 * quiet) * (0.85 + 0.15 * t.night + 0.1 * t.evening) * (0.75 + 0.35 * alt),
  );

  // The traffic hum: the city's working day.
  const busy = 0.3 * t.morning + 1 * t.afternoon + 0.65 * t.evening + 0.22 * t.night;
  const hum = clamp01(urban * busy * life * (0.6 + 0.4 * traffic) * bed);

  // The low rumble of a big place, heard best from above. Nothing at all in
  // a village, so the engine can stop rendering it there.
  const bigness = clamp01((urban - 0.3) / 0.7) ** 1.3;
  const rumble = clamp01(bigness * (0.4 + 0.6 * (t.afternoon + 0.6 * t.evening)) * life * (0.55 + 0.45 * alt));

  // Birdsong: the morning chorus, a few in the afternoon and evening, none at
  // night. Fewer in a big city, and hardly any around an archived one.
  const birdHours = 1 * t.morning + 0.28 * t.afternoon + 0.3 * t.evening;
  const birdLife = scene.archived ? 0.15 : 0.55 + 0.45 * life;
  const birds = event(birdHours * (0.35 + 0.65 * rural) * birdLife, 0.1 + 1.1 * birdHours * (0.3 + 0.7 * rural) * birdLife);

  // Crickets at night, and the first of them at dusk; strongest in the country.
  const cricketHours = t.night + 0.25 * t.evening;
  const crickets = event(
    cricketHours * (0.35 + 0.65 * rural) * (scene.archived ? 0.6 : 1),
    cricketHours * (0.8 + 1.6 * rural),
  );

  // Horns: a metropolis and, rarely, a city; never a town or a village.
  const hornUrban = clamp01((urban - 0.55) / 0.45);
  const hornHours = 0.25 * t.morning + 1 * t.afternoon + 0.55 * t.evening + 0.08 * t.night;
  const horns = event(hornUrban * hornHours * life * 0.9, hornUrban * hornHours * life * 0.06);

  // A car passing somewhere in the quiet: evening and night, in anything
  // bigger than a village.
  const carHours = t.night + 0.4 * t.evening;
  const cars = event(carHours * (0.25 + 0.6 * urban) * life * (0.6 + 0.4 * traffic), carHours * (0.03 + 0.07 * urban) * life);

  // The village's own: a tractor across the fields by day, and very
  // occasionally a sheep or a cow.
  const farmHours = 0.7 * t.morning + 1 * t.afternoon + 0.35 * t.evening;
  const tractor = event(isVillage ? farmHours * life : 0, isVillage ? farmHours * life * 0.022 : 0);
  const livestock = event(isVillage ? farmHours * (0.4 + 0.6 * life) : 0, isVillage ? farmHours * 0.016 : 0);

  return {
    beds: { wind: wind * (0.85 + 0.15 * bed), hum, rumble },
    events: { birds, crickets, horns, cars, tractor, livestock },
    // Local sources fade in as the camera comes down; above roughly two
    // thirds of the way to the overview they are gone.
    local: clamp01((0.7 - alt) / 0.55) * (scene.archived ? 0.4 : 1),
  };
}

/** The ceiling on how often any event layer may fire, whatever the mix says. */
export const MAX_EVENT_RATE = 2.5;

/**
 * A step towards a target for a value the engine smooths itself (a rate, or
 * anything not on an `AudioParam`): exponential, `dt` seconds at time
 * constant `tau`.
 */
export function approach(current: number, target: number, dt: number, tau: number): number {
  if (tau <= 0) return target;
  return target + (current - target) * Math.exp(-Math.max(0, dt) / tau);
}
