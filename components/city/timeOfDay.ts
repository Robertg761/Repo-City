/**
 * TIME OF DAY (PLAN.md sections 4 and 39, and Robert, 2026-09-23: "Can we add
 * different time of day selection as well, like morning, afternoon, evening
 * and nighttime?").
 *
 * The viewer picks one of five settings in the HUD. Four are hours, and the
 * fifth, Auto, is the hour the city has always inferred from its repository
 * (`eveningFactor` in `palette.ts`: the busier the repository, the later in
 * the afternoon).
 *
 * THE DAY IS A LOOP OF FOUR STRETCHES. A single number, the phase, runs round
 * it, and the whole sky -- sun, sky dome, exposure, lamps, windows -- is a
 * pure function of the phase:
 *
 *   0    morning     low sun from the east, cool-gold light, few windows lit
 *   1    afternoon   the clean midday look the city has always had
 *   1.8  (Auto's golden hour, the latest the old ramp ever reached)
 *   2    evening     a deeper golden hour: amber sun low in the west, lamps on
 *   3    night       moonlight, a deep blue sky, stars, lit windows and lamps
 *   4    = 0         morning again, through the dawn
 *
 * The stretch from 1 to 1.8 is exactly the old midday-to-golden-hour ramp, so
 * Auto sits on it at `1 + 0.8 * eveningFactor(...)` and draws precisely as
 * it always did. Every other point on the loop is new.
 *
 * WHERE EAST IS. There is no compass in the city, so the camera decides. The
 * default view looks across the city from the +x +z corner; with the sun
 * behind the viewer, the viewer faces north, east is on the left (+z) and
 * west on the right (+x). A morning sun from the left and an evening sun from
 * the right both light the faces the camera sees, and throw their shadows
 * away from it, on opposite diagonals.
 *
 * A change of setting travels round the loop, the short way (ties go
 * forward, as time does), over `TRANSITION_MS`: afternoon to night passes
 * through the golden hour, and night to morning through the dawn.
 *
 * Pure: no three.js, no React. Unit tested in `timeOfDay.test.ts`.
 */

import {
  TIME_SETTINGS,
  isTimeSetting,
  parseTimeSetting,
  type TimeSetting,
} from "@/lib/client/timeSetting";
import type { CityModel } from "@/types/city";
import {
  COOL_SUN,
  WARM_SUN,
  ZENITH_WARM,
  cityTone,
  dayAtmosphere,
  desaturate,
  eveningFactor,
  hexToRgb,
  mix,
  type SceneAtmosphere,
} from "./palette";

type Ambience = CityModel["ambience"];

export { TIME_SETTINGS, isTimeSetting, parseTimeSetting, type TimeSetting };
export type TimePreset = Exclude<TimeSetting, "auto">;

/** Where each preset sits on the loop. */
export const PRESET_PHASE: Record<TimePreset, number> = {
  morning: 0,
  afternoon: 1,
  evening: 2,
  night: 3,
};

/** The loop's length: four stretches of one phase unit each. */
export const DAY_LOOP = 4;

/** How long a change of setting takes to play out. */
export const TRANSITION_MS = 1500;

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Wraps any phase onto the loop, `[0, 4)`. */
export function wrapPhase(phase: number): number {
  return ((phase % DAY_LOOP) + DAY_LOOP) % DAY_LOOP;
}

/**
 * How much of the loop the old midday-to-golden-hour ramp takes: Auto's whole
 * range, from 1 to 1.8. The rest of the way to the evening preset is a
 * deeper golden hour than any repository's activity ever implied.
 */
export const AUTO_SPAN = 0.8;

/** Auto: the hour the repository's own activity implies (`eveningFactor`). */
export function autoPhase(ambience: Ambience, archived: boolean): number {
  return PRESET_PHASE.afternoon + AUTO_SPAN * eveningFactor(ambience.litWindowShare, archived);
}

/** Where a setting puts the sky for this city. */
export function targetPhase(setting: TimeSetting, ambience: Ambience, archived: boolean): number {
  return setting === "auto" ? autoPhase(ambience, archived) : PRESET_PHASE[setting];
}

/**
 * The destination of a trip round the loop from `from` (which may be
 * unwrapped, mid-transition) to `target`: never more than half the loop
 * away, and forwards when both ways are the same length. The result is
 * unwrapped, so interpolating from `from` to it is the trip itself.
 */
export function travelTo(from: number, target: number): number {
  const ahead = wrapPhase(target - from);
  return from + (ahead > DAY_LOOP / 2 ? ahead - DAY_LOOP : ahead);
}

/** Ease in and out, so the sun neither jerks away nor stops dead. */
export function easeInOut(k: number): number {
  const t = clamp01(k);
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

/** The phase `elapsed` milliseconds into a trip from `from` to `to` (both unwrapped). */
export function phaseAlong(from: number, to: number, elapsed: number, duration = TRANSITION_MS): number {
  if (duration <= 0) return to;
  return lerp(from, to, easeInOut(elapsed / duration));
}

/**
 * Unit vector towards a light `elevation` degrees above the horizon and
 * `azimuth` degrees round from +z towards +x: the convention `sunDirection`
 * in `palette.ts` uses, which this reproduces exactly.
 */
export function keyDirection(elevation: number, azimuth: number): [number, number, number] {
  const el = (elevation * Math.PI) / 180;
  const az = (azimuth * Math.PI) / 180;
  const flat = Math.cos(el);
  return [flat * Math.sin(az), Math.sin(el), flat * Math.cos(az)];
}

/** Degrees above the horizon of a key-light direction. */
export function keyElevation(direction: readonly number[]): number {
  return (Math.asin(Math.max(-1, Math.min(1, direction[1]))) * 180) / Math.PI;
}

// --- The key light's path. Elevation and azimuth, in degrees. ---

/** Morning: low, from the east (the camera's left), long shadows to the west. */
const MORNING_SUN = { elevation: 24, azimuth: 2 } as const;
/** Midday and the golden hour: `palette.ts`'s own two points, unchanged. */
const NOON_SUN = { elevation: 52, azimuth: 58 } as const;
const GOLDEN_SUN = { elevation: 30, azimuth: 86 } as const;
/** The evening preset: lower and further round into the west. */
const EVENING_SUN = { elevation: 20, azimuth: 93 } as const;
/** The last of the sun on the western horizon, and the first on the eastern. */
const SUNSET = { elevation: 5, azimuth: 95 } as const;
const SUNRISE = { elevation: 4, azimuth: -10 } as const;
/**
 * The moon: high on the eastern side, so its light falls on the faces the
 * camera sees and its soft shadows run away from the viewer, as the day's do.
 */
const MOON = { elevation: 34, azimuth: 22 } as const;
const MOONRISE = { elevation: 18, azimuth: 26 } as const;
const MOONSET = { elevation: 16, azimuth: 16 } as const;

/**
 * The key light at the handover between sun and moon: the one has set and
 * the other not yet risen, so the light is at its weakest here and the
 * shadow's jump from one side to the other is too faint to see.
 */
const TWILIGHT_KEY = 0.7;

// --- Colours. ---

/** Morning sun: gold, but a paler, cooler gold than the evening's amber. */
const MORNING_GOLD = "#ffdca6";
/** The morning sky: a clear, fresh blue, and a backdrop with the dew still on it. */
const MORNING_ZENITH = "#7fb2e0";
const MORNING_HAZE = "#e3eef5";
/** The evening preset's sun and sky: amber light, a warm band at the horizon. */
const EVENING_AMBER = "#ffb878";
const EVENING_HORIZON = "#f2dfcf";
const EVENING_ZENITH = "#5f82b8";
const EVENING_HALO = "#ffb676";
/**
 * Shadows under a golden sky are cool: a clear blue fill, which also keeps
 * the grass green under an amber sun rather than letting it go olive.
 */
const EVENING_FILL = "#b7d0e6";
/** The sun going down, and coming up. */
const SUNSET_SUN = "#ff9868";
const DAWN_SUN = "#ffb48c";
const SUNSET_GLOW = "#ff9f78";
const DAWN_GLOW = "#ffc3a0";

/**
 * Night is deep blue, never black: a diorama in a dark room with the lights
 * of the model on, not a scene nobody can see (section 39).
 */
const NIGHT_ZENITH = "#0d1a38";
const NIGHT_HORIZON = "#2a4272";
/** Moonlight: a cool, clear blue-white. */
const MOONLIGHT = "#bcc4f4";
const MOON_GLOW = "#c3d4ff";
/** The night sky bouncing into the shadows, and the dark ground bouncing back. */
const NIGHT_FILL = "#6670ad";
const NIGHT_BOUNCE = "#353a4a";
/** The light as the sun hands over to the moon, or the moon to the sun. */
const TWILIGHT_BLUE = "#98ace0";

/**
 * The day between midday (`evening` 0) and the golden hour (1), as the time
 * control draws it. Two additions to `dayAtmosphere`, both provably inert on
 * Auto's own stretch, so Auto still equals `atmosphere()` exactly:
 *
 *   - Windows come on with the hour, not only with the repository's
 *     activity. Auto puts a live city at `evening` only when its lit-window
 *     share is at least `0.55 + 0.45 t` where `evening = smoothstep(t)`, and
 *     that is never less than `0.9 * evening`, so a floor of `0.9 * evening`
 *     never binds on Auto's stretch.
 *   - An archived city keeps its drained, cool character into the golden
 *     hour: the amber is taken out of its sun as `evening` passes 0.25,
 *     which is as far as Auto ever takes an archived repository.
 */
const WINDOW_FLOOR = 0.9;

export function daySky(ambience: Ambience, archived: boolean, evening: number): SceneAtmosphere {
  const e = clamp01(evening);
  const base = dayAtmosphere(ambience, archived, e);
  if (!archived) {
    const floor = WINDOW_FLOOR * e;
    return {
      ...base,
      windowGlow: Math.max(base.windowGlow, floor),
      litWindowShare: Math.max(base.litWindowShare, 0.62 + 0.38 * floor),
    };
  }
  const drain = clamp01((e - 0.25) / 0.75);
  if (drain === 0) return base;
  return {
    ...base,
    sunColor: desaturate(base.sunColor, 0.45 * drain),
    sunGlowColor: desaturate(base.sunGlowColor, 0.45 * drain),
    sunGlowStrength: base.sunGlowStrength * (1 - 0.3 * drain),
    windowGlow: Math.max(base.windowGlow, 0.3 * drain),
  };
}

/** Auto: today's inferred hour, exactly (`atmosphere()` in `palette.ts`). */
export function autoSky(ambience: Ambience, archived: boolean): SceneAtmosphere {
  return daySky(ambience, archived, eveningFactor(ambience.litWindowShare, archived));
}

/**
 * Evening: a deeper golden hour than Auto ever reaches. The sun is low in the
 * west and amber, the backdrop warms at the horizon, the shadows go cool and
 * long, every awake building has its lights on and the street lamps are lit.
 */
export function eveningSky(ambience: Ambience, archived: boolean): SceneAtmosphere {
  const golden = daySky(ambience, archived, 1);
  const { desaturation } = cityTone(ambience, archived);
  // An archived city keeps its drained character: half the amber, grey light.
  const drain = archived ? 0.5 : 0;
  const background = desaturate(mix(golden.background, EVENING_HORIZON, 0.28), desaturation * 0.6 + drain * 0.3);
  return {
    ...golden,
    background,
    evening: 1,
    sunDirection: keyDirection(EVENING_SUN.elevation, EVENING_SUN.azimuth),
    exposure: 1.12,
    skyZenithColor: desaturate(EVENING_ZENITH, desaturation * 0.75 + drain * 0.3),
    skyHorizonColor: background,
    skyGroundColor: mix(background, "#ffffff", 0.18),
    sunColor: desaturate(mix(golden.sunColor, EVENING_AMBER, 0.22), drain),
    sunGlowColor: desaturate(EVENING_HALO, drain),
    sunGlowStrength: 0.95 - desaturation * 0.25 - drain * 0.3,
    // A low sun lands less light on a roof again; this buys it back.
    sunIntensity: golden.sunIntensity + 0.25,
    skyColor: desaturate(mix(golden.skyColor, EVENING_FILL, 0.55), drain),
    hemiIntensity: golden.hemiIntensity - 0.05,
    lampGlow: archived ? 0.35 : 1,
    windowGlow: archived ? 0.3 : 1,
    litWindowShare: archived ? golden.litWindowShare : 1,
    lampPool: archived ? 0.1 : 0.22,
    headlights: archived ? 0.15 : 0.35,
  };
}

/** Morning: a low gold sun from the east, a fresh sky, the lamps going off. */
export function morningSky(ambience: Ambience, archived: boolean): SceneAtmosphere {
  const noon = dayAtmosphere(ambience, archived, 0);
  const { warmth, overcast, desaturation } = cityTone(ambience, archived);
  const background = desaturate(mix(noon.background, MORNING_HAZE, 0.45), desaturation * 0.6);
  const sunColor = desaturate(
    mix(mix(COOL_SUN, WARM_SUN, warmth), MORNING_GOLD, 0.62),
    archived ? 0.45 : 0,
  );
  return {
    ...noon,
    background,
    evening: 0,
    sunDirection: keyDirection(MORNING_SUN.elevation, MORNING_SUN.azimuth),
    exposure: 1.07,
    skyZenithColor: desaturate(mix(ZENITH_WARM, MORNING_ZENITH, 0.6), desaturation * 0.75),
    skyHorizonColor: background,
    skyGroundColor: mix(background, "#ffffff", 0.2),
    sunGlowColor: desaturate(mix("#fff4e0", MORNING_GOLD, 0.7), archived ? 0.45 : 0),
    sunGlowStrength: 0.62 - desaturation * 0.25,
    // A low sun lands less light on the roofs; this buys it back, as the
    // golden hour's term does, so the morning is bright and not dim.
    sunIntensity: 3.0 + warmth * 0.4 - (archived ? 0.5 : 0) + 0.8,
    sunColor,
    // Cool, clean fill: the shadows of a clear morning are blue.
    skyColor: mix("#c8def5", "#d4e7f8", warmth),
    hemiIntensity: 1.0 + overcast * 0.35,
    lampGlow: (archived ? 0.35 : 1) * 0.3,
    windowGlow: archived ? 0.06 : 0.3,
    litWindowShare: archived ? 0.22 : 0.42,
    nightness: 0,
    starStrength: 0,
    moonStrength: 0,
    lampPool: 0,
    headlights: 0,
  };
}

/**
 * Night: moonlight as the key, a deep blue sky with stars, and the city's own
 * lights doing the rest. Bright enough everywhere that the roads, the roofs
 * and the crowd read at a glance: a cosy model at night, not a dark scene.
 */
export function nightSky(ambience: Ambience, archived: boolean): SceneAtmosphere {
  const noon = dayAtmosphere(ambience, archived, 0);
  const { desaturation, warmth } = cityTone(ambience, archived);
  // An archived city's night is greyer and quieter, like its day.
  const drain = archived ? 0.4 : 0;
  const background = desaturate(NIGHT_HORIZON, desaturation * 0.6 + drain * 0.5);
  return {
    ...noon,
    background,
    evening: 0,
    sunDirection: keyDirection(MOON.elevation, MOON.azimuth),
    exposure: 1.18,
    skyZenithColor: desaturate(NIGHT_ZENITH, desaturation * 0.6 + drain * 0.4),
    skyHorizonColor: background,
    skyGroundColor: mix(background, "#ffffff", 0.05),
    sunGlowColor: MOON_GLOW,
    sunGlowStrength: 0.34,
    sunColor: desaturate(MOONLIGHT, drain),
    sunIntensity: 1.6,
    skyColor: desaturate(mix(NIGHT_FILL, "#8199cc", warmth * 0.3), drain),
    groundBounceColor: NIGHT_BOUNCE,
    hemiIntensity: 0.95,
    lampGlow: archived ? 0.45 : 1,
    windowGlow: archived ? 0.5 : 1,
    litWindowShare: archived ? 0.28 : 0.7,
    nightness: 1,
    starStrength: archived ? 0.75 : 1,
    moonStrength: 1,
    lampPool: archived ? 0.5 : 1,
    headlights: 1,
  };
}

/**
 * Blends every field of two skies: numbers linearly, colours in RGB,
 * directions by normalised lerp. The segments below then re-draw the key
 * light's own path, which a blend of end points would cut short.
 */
export function blendSky(a: SceneAtmosphere, b: SceneAtmosphere, t: number): SceneAtmosphere {
  const k = clamp01(t);
  const out = { ...a } as Record<string, unknown>;
  const from = a as unknown as Record<string, unknown>;
  const to = b as unknown as Record<string, unknown>;
  for (const key of Object.keys(from)) {
    const x = from[key];
    const y = to[key];
    if (typeof x === "number" && typeof y === "number") out[key] = lerp(x, y, k);
    else if (typeof x === "string" && typeof y === "string") out[key] = k === 0 ? x : k === 1 ? y : mix(x, y, k);
    else if (Array.isArray(x) && Array.isArray(y)) {
      const v = x.map((n: number, i: number) => lerp(n, y[i] as number, k));
      const length = Math.hypot(...v) || 1;
      out[key] = v.map((n) => n / length);
    }
  }
  return out as unknown as SceneAtmosphere;
}

type KeyPoint = { elevation: number; azimuth: number };
const between = (a: KeyPoint, b: KeyPoint, t: number) =>
  keyDirection(lerp(a.elevation, b.elevation, t), lerp(a.azimuth, b.azimuth, t));

/**
 * The whole sky at any point on the loop. `phase` wraps, so 3.5 and -0.5
 * are the same small hours.
 */
export function skyAt(ambience: Ambience, archived: boolean, phase: number): SceneAtmosphere {
  const p = wrapPhase(phase);

  // Afternoon to the golden hour: the old ramp, which Auto lives on.
  if (p >= 1 && p <= 1 + AUTO_SPAN) return daySky(ambience, archived, (p - 1) / AUTO_SPAN);

  // On into the evening preset: the sun drops lower and goes amber.
  if (p > 1 + AUTO_SPAN && p <= 2) {
    const k = (p - 1 - AUTO_SPAN) / (1 - AUTO_SPAN);
    const sky = blendSky(daySky(ambience, archived, 1), eveningSky(ambience, archived), k);
    sky.sunDirection = between(GOLDEN_SUN, EVENING_SUN, k);
    return sky;
  }

  // Morning to afternoon: the sun climbs and swings round to the south.
  if (p < 1) {
    const sky = blendSky(morningSky(ambience, archived), daySky(ambience, archived, 0), p);
    sky.sunDirection = between(MORNING_SUN, NOON_SUN, p);
    return sky;
  }

  // Evening to night: the sun sets in the west, then the moon rises.
  if (p < 3) {
    const k = p - 2;
    const evening = eveningSky(ambience, archived);
    const night = nightSky(ambience, archived);
    const sky = blendSky(evening, night, k);
    if (k < 0.5) {
      const s = k / 0.5;
      sky.sunDirection = between(EVENING_SUN, SUNSET, s);
      sky.sunIntensity = lerp(evening.sunIntensity, TWILIGHT_KEY, s);
      sky.sunColor = mix(evening.sunColor, desaturate(SUNSET_SUN, archived ? 0.45 : 0), s);
      sky.sunGlowColor = mix(evening.sunGlowColor, desaturate(SUNSET_GLOW, archived ? 0.45 : 0), s);
      sky.sunGlowStrength = lerp(evening.sunGlowStrength, 0.55, s);
      sky.moonStrength = 0;
    } else {
      const s = (k - 0.5) / 0.5;
      sky.sunDirection = between(MOONRISE, MOON, s);
      sky.sunIntensity = lerp(TWILIGHT_KEY, night.sunIntensity, s);
      sky.sunColor = mix(TWILIGHT_BLUE, night.sunColor, s);
      sky.sunGlowColor = night.sunGlowColor;
      sky.sunGlowStrength = lerp(0.1, night.sunGlowStrength, s);
      sky.moonStrength = s * night.moonStrength;
    }
    return sky;
  }

  // Night to morning: the moon sets, then the sun comes up in the east.
  const k = p - 3;
  const night = nightSky(ambience, archived);
  const morning = morningSky(ambience, archived);
  const sky = blendSky(night, morning, k);
  if (k < 0.5) {
    const s = k / 0.5;
    sky.sunDirection = between(MOON, MOONSET, s);
    sky.sunIntensity = lerp(night.sunIntensity, TWILIGHT_KEY, s);
    sky.sunColor = mix(night.sunColor, TWILIGHT_BLUE, s);
    sky.sunGlowColor = night.sunGlowColor;
    sky.sunGlowStrength = lerp(night.sunGlowStrength, 0.1, s);
    sky.moonStrength = (1 - s) * night.moonStrength;
  } else {
    const s = (k - 0.5) / 0.5;
    sky.sunDirection = between(SUNRISE, MORNING_SUN, s);
    sky.sunIntensity = lerp(TWILIGHT_KEY, morning.sunIntensity, s);
    sky.sunColor = mix(desaturate(DAWN_SUN, archived ? 0.45 : 0), morning.sunColor, s);
    sky.sunGlowColor = mix(desaturate(DAWN_GLOW, archived ? 0.45 : 0), morning.sunGlowColor, s);
    sky.sunGlowStrength = lerp(0.5, morning.sunGlowStrength, s);
    sky.moonStrength = 0;
  }
  return sky;
}

/**
 * How much longer than midday's the key light's shadows run, 0 at midday's
 * 52 degrees and 1 at the golden hour's 30, as `shadowReach` in `scale.ts`
 * wants it. Lower lights run on past 1, up to a cap: the shadow map covers a
 * fixed patch, and a sun on the horizon would otherwise ask for the world.
 */
export function lowLight(direction: readonly number[]): number {
  const elevation = keyElevation(direction);
  const t = (NOON_SUN.elevation - elevation) / (NOON_SUN.elevation - GOLDEN_SUN.elevation);
  return Math.max(0, Math.min(1.4, t));
}

/** Relative luminance of a hex colour, for tests and for picking contrast. */
export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
