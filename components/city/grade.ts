/**
 * `?grade=rich` (`look.ts`): light, atmosphere and depth.
 *
 * The current look holds every hour close to one soft, similar light: a sun
 * and a sky fill that are both nearly white, a haze that only hides the rim of
 * the landscape, and a tone mapping that leaves paint exactly as written. This
 * gives the frame more to read from:
 *
 *   - KEY AND FILL. A warmer sun against a cooler sky, and a warm ground
 *     bounce, so a lit face and a shaded one differ in colour, not only in
 *     brightness. A slightly stronger key and a bluer fill make the shadows
 *     deeper in colour without crushing them to black.
 *   - AERIAL PERSPECTIVE. The fog starts inside the city, in a blue-shifted
 *     haze rather than a grey one, so the far streets sit back in the frame.
 *   - GRADE. A gentle lift of saturation and contrast in the composer, and
 *     stronger ambient occlusion (high tier only; medium and low tiers are
 *     unchanged apart from the light).
 *   - GROUND. Greener lawns, darker asphalt and a warmer pavement, set in
 *     `palette.ts`, for figure and ground.
 *
 * Every term fades with `nightness`: at night the moon and the city's own
 * lights are the picture, and this leaves them alone.
 *
 * Pure: a `SceneAtmosphere` in, a `SceneAtmosphere` out. Unit tested.
 */

import { RICH_GRADE } from "./look";
import { mix, type SceneAtmosphere } from "./palette";

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

export const RICH = {
  warmSun: "#ffd8a0",
  coolFill: "#86b1e6",
  warmBounce: "#a38d6a",
  greenTerrain: "#62ad58",
  haze: "#aecbea",
  /** Fog starts inside the city; see `FOG_NEAR` in `palette.ts` for the default. */
  fogNear: 1.7,
  fogFar: 4.4,
};

/** The sky an hour resolves to, made richer. Identity when the grade is off. */
export function richSky(sky: SceneAtmosphere, on: boolean = RICH_GRADE): SceneAtmosphere {
  if (!on) return sky;
  const day = 1 - clamp01(sky.nightness);
  const background = mix(sky.background, RICH.haze, 0.34 * day);
  return {
    ...sky,
    background,
    skyHorizonColor: background,
    skyGroundColor: mix(background, "#ffffff", 0.2),
    sunColor: mix(sky.sunColor, RICH.warmSun, 0.3 * day),
    sunIntensity: sky.sunIntensity * (1 + 0.06 * day),
    skyColor: mix(sky.skyColor, RICH.coolFill, 0.42 * day),
    hemiIntensity: sky.hemiIntensity * (1 + 0.04 * day),
    groundBounceColor: mix(sky.groundBounceColor, RICH.warmBounce, 0.4 * day),
    terrainColor: mix(sky.terrainColor, RICH.greenTerrain, 0.45),
    fogNearFactor: RICH.fogNear,
    fogFarFactor: RICH.fogFar,
  };
}

/** What the composer does on top of the light. Identity values when the grade is off. */
export interface FilmGrade {
  /** Tone-mapping operator: the current look's PBR Neutral, or AgX. */
  toneMapping: "neutral" | "agx";
  /** `HueSaturation` amount, -1..1. */
  saturation: number;
  /** `BrightnessContrast` contrast, -1..1. */
  contrast: number;
  /** N8AO strength and radius scale (high tier only). */
  aoIntensity: number;
  aoRadius: number;
}

const CURRENT: FilmGrade = { toneMapping: "neutral", saturation: 0, contrast: 0, aoIntensity: 1.05, aoRadius: 2.6 };
const RICHER: FilmGrade = { toneMapping: "neutral", saturation: 0.16, contrast: 0.05, aoIntensity: 1.25, aoRadius: 3 };

export function filmGrade(on: boolean = RICH_GRADE): FilmGrade {
  return on ? RICHER : CURRENT;
}
