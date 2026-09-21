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
 */
export const DISTRICT_COLORS = [
  "#cdd8c3", // sage
  "#dbd1bd", // sand
  "#c6d5da", // mist
  "#dac9cb", // dusty rose
  "#ccd1de", // periwinkle
  "#d9d4bb", // wheat
  "#c3d8ca", // seafoam
  "#d3cbd9", // lilac
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
}

const COOL_SUN = "#cfe0ff";
const WARM_SUN = "#ffeccb";
const COOL_SKY = "#a8c3dd";
const WARM_SKY = "#cfe5ee";
const COOL_TERRAIN = "#78877f";
const WARM_TERRAIN = "#8a9470";

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

  return {
    background,
    // Both planes are multiples of `bounds.size`, and the overview sits at
    // about 1.75 of it: the near plane starts just short of the city so haze
    // reads as depth rather than as a dirty window.
    fogNearFactor: 2 - fog * 1.1,
    fogFarFactor: 5.6 - fog * 2.6,
    sunColor: mix(COOL_SUN, WARM_SUN, warmth),
    // Floor of ~1.5 so a struggling city is still lit well enough to read.
    sunIntensity: 1.55 + warmth * 0.75 - fog * 0.25,
    skyColor: mix("#c3d7ea", "#e2eef4", warmth),
    groundBounceColor: desaturate(mix("#5d6a63", "#7b7358", warmth), desaturation),
    hemiIntensity: 0.7 + fog * 0.35,
    terrainColor: desaturate(mix(COOL_TERRAIN, WARM_TERRAIN, warmth), desaturation),
    desaturation,
    windowGlow: clamp01(ambience.litWindowShare) * (archived ? 0.25 : 1),
  };
}
