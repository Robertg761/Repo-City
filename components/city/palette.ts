/**
 * The city palette and the ambience -> scene mapping (PLAN.md sections 4, 39).
 *
 * Pure colour maths on hex strings: no three.js, no React. Everything here is
 * unit tested, and the renderer is the only consumer.
 *
 * Art direction rule from section 9: language never changes the art style.
 * There is exactly one building palette and one district palette; `colorIndex`
 * from the generator picks an entry, nothing else.
 */

import type { CityModel } from "@/types/city";

export type Rgb = [number, number, number];

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

export function hexToRgb(hex: string): Rgb {
  const raw = hex.replace("#", "");
  const full =
    raw.length === 3
      ? raw
          .split("")
          .map((c) => c + c)
          .join("")
      : raw;
  const n = Number.parseInt(full, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function rgbToHex(rgb: Rgb): string {
  const part = (v: number) =>
    Math.round(clamp01(v) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${part(rgb[0])}${part(rgb[1])}${part(rgb[2])}`;
}

export function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  const k = clamp01(t);
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

/** Blend two hex colours. `t = 0` returns `a`, `t = 1` returns `b`. */
export function mix(a: string, b: string, t: number): string {
  return rgbToHex(mixRgb(hexToRgb(a), hexToRgb(b), t));
}

/** Pull a colour towards its own luminance. `amount = 1` yields pure grey. */
export function desaturate(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return rgbToHex(mixRgb([r, g, b], [luma, luma, luma], amount));
}

/**
 * Eight low-saturation district tints. They sit under the buildings as ground
 * colour, so they stay pale: the buildings must read, not the lawn.
 *
 * Softened once the sidewalks and plaza landed: eight bright plates edge to
 * edge read as a colour chart, and the district that happened to draw the
 * brightest tint looked like the important one. Each entry is a quarter of the
 * way towards a common neutral, which keeps them distinguishable side by side
 * while letting the buildings and the road furniture carry the frame.
 */
export const DISTRICT_COLORS = [
  "#cbd3c2", // sage
  "#d6cebe", // sand
  "#c6d1d3", // mist
  "#d5c8c8", // dusty rose
  "#caced6", // periwinkle
  "#d4d0bc", // wheat
  "#c4d3c7", // seafoam
  "#d0cad3", // lilac
] as const;

/** Eight building colours. Warm neutrals with two cool accents for rhythm. */
export const BUILDING_COLORS = [
  "#ece3d4",
  "#d8c9b2",
  "#c9d5cd",
  "#bfced8",
  "#e2cfc2",
  "#ccc4d6",
  "#dbdacf",
  "#c2cbc0",
] as const;

/** Wraps out-of-range and negative indices, so bad generator input still renders. */
export function paletteEntry(palette: readonly string[], colorIndex: number): string {
  const n = palette.length;
  const i = Number.isFinite(colorIndex) ? Math.trunc(colorIndex) : 0;
  return palette[((i % n) + n) % n];
}

export const districtColor = (colorIndex: number) => paletteEntry(DISTRICT_COLORS, colorIndex);
export const buildingColor = (colorIndex: number) => paletteEntry(BUILDING_COLORS, colorIndex);

export const HIGHLIGHT = "#ffd089";
export const SELECT = "#ffb347";

export const ROAD_COLOR = "#8e8d88";
export const ROAD_LINE_COLOR = "#e9e5d8";
/** The raised slab either side of every carriageway (PLAN.md section 36). */
export const SIDEWALK_COLOR = "#bdb9ad";
/** The lip of that slab: a shade darker, so the kerb reads as a step. */
export const CURB_COLOR = "#9d998f";
/** Zebra stripes and lane dashes. Brighter than the centre line was. */
export const CROSSWALK_COLOR = "#e7e3d5";
/** Raked gravel around the civic centre. */
export const PLAZA_COLOR = "#cfc8b6";
export const ROOF_COLOR = "#a7a49b";
export const WINDOW_COLOR = "#ffdca5";
export const CIVIC_COLOR = "#eceadf";
export const CIVIC_ROOF = "#b4c3c6";
export const TREE_TRUNK = "#8a6d52";
export const TREE_LEAF = "#7fa46a";
export const LAMP_POST = "#6f7270";
export const WARNING_ORANGE = "#e8853c";
export const HAZARD_RED = "#c8493c";
export const CONCRETE = "#cfcabd";
export const RUST = "#9a7b5f";

/** Hover brightens, selection pushes to a warm accent (PLAN.md section 42). */
export function stateTint(base: string, hovered: boolean, selected: boolean): string {
  // Enough to read at overview distance, not so much that the entity stops
  // looking like a building: the ground ring carries the rest of the signal.
  if (selected) return mix(base, SELECT, 0.38);
  if (hovered) return mix(base, HIGHLIGHT, 0.28);
  return base;
}

/**
 * TIME OF DAY (PLAN.md sections 4 and 39).
 *
 * There is no clock in the model and no control in the HUD, so the hour is
 * inferred: a repository whose windows are lit is a repository people are
 * still working in, and that is the late afternoon. `ambience.litWindowShare`
 * is the generator's activity-and-health blend (0.05 for an archived
 * repository, about 0.55 for a quiet healthy one, 0.9 upwards for a busy one),
 * and it maps to a single `evening` number, 0 = midday, 1 = golden hour:
 *
 *   litWindowShare <= 0.55   evening 0     sun 52 degrees, short shadows, clear
 *   litWindowShare    0.78   evening 0.5   sun 41 degrees, warmer, longer shadows
 *   litWindowShare >= 1.0    evening 1     sun 30 degrees, amber, long shadows
 *
 * Archived repositories are held near midday whatever they score: the
 * abandoned treatment of section 19 is a cold flat overcast noon, not a sunset.
 * It never reaches night -- section 39 forbids an unreadable city -- so the
 * top of the ramp is a golden hour and the windows and lamps glow against a
 * sky that is still bright.
 *
 * E5: to put this on a HUD control later, override the `evening` field on the
 * `SceneAtmosphere` this module returns (and `sunDirection`, `exposure`,
 * `lampGlow`, `skyZenithColor` and `sunGlowColor`, which are all derived from
 * it by `atmosphere` below). Nothing else in the renderer reads the hour.
 */
export function eveningFactor(litWindowShare: number, archived = false): number {
  const t = clamp01((clamp01(litWindowShare) - 0.55) / 0.45);
  const smooth = t * t * (3 - 2 * t);
  return archived ? smooth * 0.25 : smooth;
}

/** Midday and golden-hour sun angles, in degrees above and around the city. */
const SUN_ELEVATION = [52, 30] as const;
const SUN_AZIMUTH = [58, 86] as const;

/**
 * Unit vector from the city centre towards the sun. `Lighting` multiplies it
 * by the city size to place the directional light, and `Environment` paints
 * the glow in the sky dome at the same bearing, so the haze and the shadows
 * always agree about where the sun is.
 */
export function sunDirection(evening: number): [number, number, number] {
  const e = clamp01(evening);
  const elevation = ((SUN_ELEVATION[0] + (SUN_ELEVATION[1] - SUN_ELEVATION[0]) * e) * Math.PI) / 180;
  const azimuth = ((SUN_AZIMUTH[0] + (SUN_AZIMUTH[1] - SUN_AZIMUTH[0]) * e) * Math.PI) / 180;
  const flat = Math.cos(elevation);
  return [flat * Math.sin(azimuth), Math.sin(elevation), flat * Math.cos(azimuth)];
}

export interface SceneAtmosphere {
  background: string;
  /** Multiplied by `bounds.size` to get the fog near/far planes. */
  fogNearFactor: number;
  fogFarFactor: number;
  sunColor: string;
  sunIntensity: number;
  skyColor: string;
  groundBounceColor: string;
  hemiIntensity: number;
  terrainColor: string;
  /** 0..1, applied to every palette lookup so a tired city reads as tired. */
  desaturation: number;
  /** 0..1 emissive strength for lit windows. */
  windowGlow: number;
  /**
   * 0..1 share of the window bands actually drawn. Brightness alone cannot
   * say "half this office block went home": an archived city needs fewer lit
   * windows, not only dimmer ones (PLAN.md section 19).
   */
  litWindowShare: number;

  // --- Time of day and sky. See `eveningFactor` above for the mapping. ---

  /** 0 = midday, 1 = golden hour. */
  evening: number;
  /** Unit vector towards the sun; shared by the light and the sky dome. */
  sunDirection: [number, number, number];
  /** ACES filmic exposure. A low sun and thick haze both need a little more. */
  exposure: number;
  /** Top of the sky dome. */
  skyZenithColor: string;
  /** The band at eye level. Matches the fog, so distance dissolves into sky. */
  skyHorizonColor: string;
  /** Below the horizon: the haze the ground plate runs out into. */
  skyGroundColor: string;
  /** The halo painted around the sun's bearing in the dome. */
  sunGlowColor: string;
  /** 0..1 strength of that halo. */
  sunGlowStrength: number;
  /**
   * 0..1 for anything that should glow as the light goes: street lamps, shop
   * fronts, vehicle lights. E3 owns those meshes; this is the number to
   * multiply their emissive intensity by so they light up with the windows.
   */
  lampGlow: number;
  /** 0..1 opacity for the contact shadows under the buildings. */
  contactShadowOpacity: number;
}

const COOL_SUN = "#cfe0ff";
const WARM_SUN = "#ffeccb";
const COOL_SKY = "#a8c3dd";
const WARM_SKY = "#cfe5ee";
const COOL_TERRAIN = "#78877f";
const WARM_TERRAIN = "#8a9470";

/** Zenith colours: flat overcast, clear afternoon, and the golden hour. */
const ZENITH_COOL = "#8ba6bf";
const ZENITH_WARM = "#5f92c9";
const ZENITH_EVENING = "#43719f";
/** The colour the low sun turns its own halo. */
const EVENING_GLOW = "#ffca8a";

/**
 * Ambience drives light temperature, fog and background tint (section 39).
 * Archived repositories get the deliberate cool, foggy, quiet treatment of
 * section 19 -- but never so dark that the city stops being readable.
 */
export function atmosphere(ambience: CityModel["ambience"], archived: boolean): SceneAtmosphere {
  const warmth = clamp01(archived ? ambience.warmth * 0.5 - 0.1 : ambience.warmth);
  const saturation = clamp01(archived ? ambience.saturation * 0.55 : ambience.saturation);
  const fog = clamp01(archived ? ambience.fog * 0.6 + 0.35 : ambience.fog);

  const desaturation = (1 - saturation) * 0.55;
  const background = desaturate(mix(COOL_SKY, WARM_SKY, warmth), desaturation * 0.6);
  const evening = eveningFactor(ambience.litWindowShare, archived);
  // A low sun is a warm sun, and it is also a weaker one across a horizontal
  // surface: the exposure below buys most of that back, so a golden-hour city
  // is golden rather than merely dim (PLAN.md section 39).
  const sunColor = mix(mix(COOL_SUN, WARM_SUN, warmth), EVENING_GLOW, evening * 0.55);

  return {
    background,
    evening,
    sunDirection: sunDirection(evening),
    // Haze scatters light and a low sun delivers less of it; both want the
    // shutter open a little wider. Capped so no city blows out its facades.
    exposure: Math.min(0.96 + evening * 0.16 + fog * 0.13, 1.3),
    skyZenithColor: desaturate(
      mix(mix(ZENITH_COOL, ZENITH_WARM, warmth), ZENITH_EVENING, evening * 0.75),
      desaturation * 0.75,
    ),
    // The horizon IS the fog colour: anything far enough away to fade has to
    // fade into something, and a seam there is the one thing that makes a
    // diorama look like a box.
    skyHorizonColor: background,
    skyGroundColor: desaturate(mix(background, mix(COOL_TERRAIN, WARM_TERRAIN, warmth), 0.45), 0.2),
    sunGlowColor: mix(mix("#fff6e2", sunColor, 0.5), EVENING_GLOW, evening),
    // The halo is the sun's only presence in frame, so it grows as the sun
    // drops towards the haze it has to shine through.
    sunGlowStrength: 0.3 + evening * 0.45 - desaturation * 0.25,
    lampGlow: clamp01((archived ? 0.35 : 1) * (0.2 + evening * 0.8)),
    // Deliberately gentle: the directional light already draws the cast
    // shadow, and this only has to seat the building on the ground.
    contactShadowOpacity: 0.3 + fog * 0.1,
    // Both planes are multiples of `bounds.size`, and the overview sits at
    // about 1.75 of it: the near plane starts just short of the city so haze
    // reads as depth rather than as a dirty window.
    fogNearFactor: 2 - fog * 1.1,
    fogFarFactor: 5.6 - fog * 2.6,
    sunColor,
    // Floor of ~1.5 so a struggling city is still lit well enough to read.
    // A sun at 30 degrees lands about two thirds as much light on a roof as
    // one at 52, and from this camera the roofs are most of the frame: the
    // evening term buys that back, so the hour reads as long shadows and warm
    // light rather than as somebody turning the lights down.
    sunIntensity: 1.55 + warmth * 0.75 - fog * 0.25 + evening * 0.85,
    // The hemisphere fill is the sky and the ground bouncing back into the
    // shadows, so it is tinted by both rather than being neutral grey.
    skyColor: mix(mix("#c3d7ea", "#e2eef4", warmth), ZENITH_EVENING, evening * 0.35),
    groundBounceColor: desaturate(mix("#5d6a63", "#7b7358", warmth), desaturation),
    // Overcast means more fill and less sun; a clear golden hour is the
    // opposite, and that contrast is most of what sells the hour.
    hemiIntensity: 0.7 + fog * 0.35 - evening * 0.08,
    terrainColor: desaturate(mix(COOL_TERRAIN, WARM_TERRAIN, warmth), desaturation),
    desaturation,
    windowGlow: clamp01(ambience.litWindowShare) * (archived ? 0.25 : 1),
    // A live city keeps most of its bands whatever its activity; an archived
    // one keeps a third of them, so the facades go quiet without going dark.
    litWindowShare: archived
      ? 0.3 + clamp01(ambience.litWindowShare) * 0.2
      : 0.62 + clamp01(ambience.litWindowShare) * 0.38,
  };
}
