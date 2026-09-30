/**
 * Colour from real materials (`?palette=materials`, `look.ts`).
 *
 * The city's archetypes used to be painted one colour per district: eight
 * near-white pastels, so towers, low-rises and warehouses all read off-white.
 * This gives each building a facade of its own, chosen from a set that suits
 * its archetype and seeded from its path (like `palettes.ts` does for the
 * settlements): red, brown and yellow brick; sandstone, limestone and dark
 * granite; painted render in varied but tasteful hues; concrete and dark metal
 * cladding; glass towers tinted blue, green, bronze or smoke. The roof takes a
 * material of its own (slate, terracotta, copper, membrane) and the doors,
 * shopfronts, awnings and window frames an accent.
 *
 * The district colour is no longer the paint. It is a light tint over the
 * facade and the accent (`DISTRICT_SHARE`), and it nudges which families a
 * district leans towards, so a district still hangs together.
 *
 * Each material also names the surface layer its texture should use, so brick
 * gets the brick pattern and stone the stone (`textures/surface-types.ts`).
 *
 * Pure: hex strings and numbers in, hex strings and numbers out. Unit tested.
 */

import type { Building } from "@/types/city";
import { SURFACE, type SurfaceId } from "../../textures/surface-types";
import { buildingColor, desaturate, mix } from "../../palette";
import { archetypeSeed, variantValue, type ModelKey } from "./archetypes";
import { DOOR_ACCENTS, SHOP_ACCENTS } from "./palettes";
import { PAINT_ACCENT, PAINT_GLASS, PAINT_NONE, PAINT_ROOF, PAINT_WALL, type Rgb3 } from "./mesh";

export interface Facade {
  id: string;
  hex: string;
  surface: SurfaceId;
}

const BRICK: Facade[] = [
  { id: "brick-red", hex: "#b9634c", surface: SURFACE.brick },
  { id: "brick-brown", hex: "#96725b", surface: SURFACE.brick },
  { id: "brick-yellow", hex: "#d8ba7c", surface: SURFACE.brick },
  { id: "brick-orange", hex: "#bd7050", surface: SURFACE.brick },
];

const STONE: Facade[] = [
  { id: "sandstone", hex: "#d9bd93", surface: SURFACE.stone },
  { id: "limestone", hex: "#e6dfcd", surface: SURFACE.stone },
  { id: "granite", hex: "#9aa0a7", surface: SURFACE.stone },
  { id: "granite-warm", hex: "#a89d91", surface: SURFACE.stone },
];

const RENDER: Facade[] = [
  { id: "render-cream", hex: "#eadfc6", surface: SURFACE.plaster },
  { id: "render-butter", hex: "#e8cf8c", surface: SURFACE.plaster },
  { id: "render-blush", hex: "#e0b5a6", surface: SURFACE.plaster },
  { id: "render-terracotta", hex: "#d1946f", surface: SURFACE.plaster },
  { id: "render-sage", hex: "#a9b99f", surface: SURFACE.plaster },
  { id: "render-duckegg", hex: "#a5c3c2", surface: SURFACE.plaster },
  { id: "render-blue", hex: "#94abc4", surface: SURFACE.plaster },
  { id: "render-white", hex: "#f0ebe1", surface: SURFACE.plaster },
  { id: "render-ochre", hex: "#d3a95c", surface: SURFACE.plaster },
];

const CONCRETE: Facade[] = [
  { id: "concrete-light", hex: "#c2beb6", surface: SURFACE.concrete },
  { id: "concrete-mid", hex: "#a5a3a0", surface: SURFACE.concrete },
  { id: "concrete-warm", hex: "#b7afa2", surface: SURFACE.concrete },
];

const METAL: Facade[] = [
  // Painted cladding panels: the metal surface layer is metallic in the
  // shader, which goes near black wherever the sun does not reach a wall.
  { id: "metal-charcoal", hex: "#69717b", surface: SURFACE.plaster },
  { id: "metal-bronze", hex: "#86735f", surface: SURFACE.plaster },
  { id: "metal-green", hex: "#628078", surface: SURFACE.plaster },
  { id: "metal-blue", hex: "#6a86a4", surface: SURFACE.plaster },
];

export const FACADES = { brick: BRICK, stone: STONE, render: RENDER, concrete: CONCRETE, metal: METAL } as const;
export type FacadeFamily = keyof typeof FACADES;

export interface RoofMaterial {
  id: string;
  hex: string;
  surface: SurfaceId;
}

export const ROOFS: Record<string, RoofMaterial> = {
  slate: { id: "slate", hex: "#727984", surface: SURFACE.slate },
  slateWarm: { id: "slate-warm", hex: "#7d746c", surface: SURFACE.slate },
  terracotta: { id: "terracotta", hex: "#c2734d", surface: SURFACE.clayTile },
  copper: { id: "copper", hex: "#78b39d", surface: SURFACE.plaster },
  membrane: { id: "membrane", hex: "#63656a", surface: SURFACE.concrete },
  gravel: { id: "gravel", hex: "#9d988e", surface: SURFACE.concrete },
};

export interface GlassTint {
  id: string;
  hex: string;
}

/** Curtain-wall glass: what a tower's tint reads as in daylight. */
export const GLASS_TINTS: GlassTint[] = [
  { id: "blue", hex: "#8bb3da" },
  { id: "green", hex: "#7cbfa9" },
  { id: "bronze", hex: "#b3a48e" },
  { id: "smoke", hex: "#7b8794" },
];

/** Shopfront glass and the glazing of the lower buildings: a pale, clear blue-green. */
const CLEAR_GLASS = "#8db3c4";

const INDUSTRIAL_ACCENTS = ["#c4462f", "#2e5b8a", "#d9a521", "#3f6b4f", "#7a7f86"] as const;
const FRAME_ACCENTS = ["#c9ced4", "#aeb3b9", "#cbb99a", "#8f969e", "#3f454c", "#d7d2c6"] as const;

type Weights = readonly (readonly [FacadeFamily, number])[];

interface Recipe {
  walls: Weights;
  /** Pitched archetypes roof in slate or tile; flat ones in membrane or gravel. */
  roofs: readonly (readonly [string, number])[];
  accents: readonly string[];
  glass: readonly GlassTint[];
}

const CLEAR: readonly GlassTint[] = [{ id: "clear", hex: CLEAR_GLASS }];

const RECIPES: Partial<Record<ModelKey, Recipe>> = {
  house: {
    walls: [["brick", 4], ["render", 4], ["stone", 2]],
    roofs: [["slate", 3], ["terracotta", 2], ["slateWarm", 3]],
    accents: DOOR_ACCENTS,
    glass: CLEAR,
  },
  "lowrise-pitched": {
    walls: [["brick", 4], ["render", 3], ["stone", 3]],
    roofs: [["slate", 3], ["terracotta", 2], ["slateWarm", 3]],
    accents: DOOR_ACCENTS,
    glass: CLEAR,
  },
  "lowrise-parapet": {
    walls: [["brick", 4], ["render", 3], ["stone", 2], ["concrete", 1]],
    roofs: [["membrane", 3], ["gravel", 2]],
    accents: SHOP_ACCENTS,
    glass: CLEAR,
  },
  "warehouse-sawtooth": {
    walls: [["brick", 3], ["concrete", 3], ["metal", 3]],
    roofs: [["slate", 2], ["membrane", 2], ["gravel", 1]],
    accents: INDUSTRIAL_ACCENTS,
    glass: CLEAR,
  },
  "midrise-setback": {
    walls: [["brick", 3], ["stone", 4], ["concrete", 2], ["render", 1]],
    roofs: [["membrane", 3], ["gravel", 2], ["copper", 1]],
    accents: FRAME_ACCENTS,
    glass: CLEAR,
  },
  "midrise-mech": {
    walls: [["concrete", 4], ["render", 2], ["brick", 2], ["metal", 2]],
    roofs: [["membrane", 3], ["gravel", 2]],
    accents: FRAME_ACCENTS,
    glass: CLEAR,
  },
  "tower-stepped": {
    walls: [["stone", 5], ["concrete", 2], ["brick", 1], ["metal", 1]],
    roofs: [["membrane", 2], ["copper", 2], ["gravel", 1]],
    accents: FRAME_ACCENTS,
    glass: [GLASS_TINTS[0], GLASS_TINTS[3], GLASS_TINTS[2]],
  },
  "tower-crown": {
    walls: [["stone", 4], ["concrete", 2], ["metal", 3]],
    roofs: [["copper", 1], ["membrane", 3]],
    accents: FRAME_ACCENTS,
    glass: GLASS_TINTS,
  },
  "tower-glass": {
    walls: [["metal", 4], ["concrete", 3], ["stone", 2]],
    roofs: [["membrane", 3], ["gravel", 1]],
    accents: FRAME_ACCENTS,
    glass: GLASS_TINTS,
  },
  "tower-twin": {
    walls: [["metal", 4], ["concrete", 2], ["stone", 3]],
    roofs: [["membrane", 3], ["copper", 1]],
    accents: FRAME_ACCENTS,
    glass: GLASS_TINTS,
  },
  "tower-spire": {
    walls: [["stone", 3], ["metal", 4], ["concrete", 2]],
    roofs: [["copper", 2], ["membrane", 3]],
    accents: FRAME_ACCENTS,
    glass: GLASS_TINTS,
  },
};

/** How much of the district colour each facade and accent keeps. */
export const DISTRICT_TINT = 0.1;

/** What one building of the city is painted with under `?palette=materials`. */
export interface CityPaint {
  wall: string;
  accent: string;
  roof: string;
  glass: string;
  wallSurface: SurfaceId;
  roofSurface: SurfaceId;
  /** Which facade and roof were picked, for tests and the inspector. */
  facade: string;
  roofId: string;
  glassId: string;
}

/** Whether a model takes the material palette (the city's eleven shapes). */
export const hasFacadeRecipe = (model: ModelKey): boolean => RECIPES[model] !== undefined;

const frac = (n: number) => n - Math.floor(n);

function pickWeighted<T extends string>(list: readonly (readonly [T, number])[], roll: number): T {
  const total = list.reduce((sum, [, w]) => sum + w, 0);
  let at = Math.min(0.9999, Math.max(0, roll)) * total;
  for (const [item, weight] of list) {
    if (at < weight) return item;
    at -= weight;
  }
  return list[list.length - 1][0];
}

const pick = <T>(list: readonly T[], roll: number): T =>
  list[Math.min(list.length - 1, Math.floor(roll * list.length))];

/**
 * A district's lean: 0..0.3, from its colour index. Added to a building's own
 * roll so neighbours in one district favour the same end of an archetype's
 * facade list (a brick district, a stone district) without every building
 * being alike.
 */
export function districtLean(colorIndex: number): number {
  const i = Number.isFinite(colorIndex) ? Math.trunc(colorIndex) : 0;
  return frac(i * 0.618034) * 0.3;
}

/**
 * The paint of one city building, or null for a model that keeps the current
 * look. Deterministic: seeded by the building's path, like its archetype.
 */
export function cityPaint(model: ModelKey, building: Building): CityPaint | null {
  const recipe = RECIPES[model];
  if (!recipe) return null;
  const seed = archetypeSeed(building);
  const lean = districtLean(building.colorIndex);
  const family = pickWeighted(recipe.walls, variantValue(seed, 41) * 0.7 + lean);
  const facade = pick(FACADES[family], variantValue(seed, 42));
  const roof = ROOFS[pickWeighted(recipe.roofs, variantValue(seed, 43))];
  const glass = pick(recipe.glass, variantValue(seed, 44));
  const accent = pick(recipe.accents, variantValue(seed, 45));
  const district = buildingColor(building.colorIndex);
  return {
    wall: mix(facade.hex, district, DISTRICT_TINT),
    accent: mix(accent, district, DISTRICT_TINT * 0.6),
    roof: roof.hex,
    glass: glass.hex,
    wallSurface: facade.surface,
    roofSurface: roof.surface,
    facade: facade.id,
    roofId: roof.id,
    glassId: glass.id,
  };
}

/**
 * How a repository's health reads on a materials palette. The current look
 * drains every colour by `desaturation`; a brick wall drained like that is
 * grey, and so is every neighbour. Health here is gentler: about half the
 * desaturation, and a little grime, a share of a dull warm grey worked into
 * the surface, the way a neglected block looks.
 */
export const GRIME = "#6e675d";
export function weather(hex: string, desaturation: number): string {
  if (desaturation <= 0) return hex;
  return desaturate(mix(hex, GRIME, desaturation * 0.2), desaturation * 0.45);
}

// ---------------------------------------------------------------------------
// Roles: how a Blender material role takes the palette
// ---------------------------------------------------------------------------

/** How a material role is painted under `?palette=materials`. */
export interface RolePaint {
  color: Rgb3;
  paint: number;
}

const grey = (k: number): Rgb3 => [k, k, k];
const luma = (c: Rgb3) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
/** The old glass ramp's luma at its brightest; the tint's own brightness is the reference. */
const GLASS_REFERENCE = 0.75;

/**
 * The vertex colour and paint channel of a role. `color` is the role's old
 * multiplier on the district colour (`base`), which the wall, trim and
 * unknown roles keep exactly, so a role this file has not heard of paints as
 * it always did.
 */
export function rolePaint(role: string, base: Rgb3): RolePaint {
  switch (role) {
    case "wall":
    case "core":
    case "wallSoft":
    case "trim":
      return { color: base, paint: PAINT_WALL };
    case "roof":
    case "deck":
      return { color: grey(1), paint: PAINT_ROOF };
    case "roofLight":
      return { color: grey(1.16), paint: PAINT_ROOF };
    case "door":
      return { color: grey(0.95), paint: PAINT_ACCENT };
    case "frame":
      return { color: grey(1), paint: PAINT_ACCENT };
    case "glass":
    case "lobby":
      return { color: grey(Math.min(1.1, luma(base) / GLASS_REFERENCE)), paint: PAINT_GLASS };
    case "plinth":
      return { color: grey(0.3), paint: PAINT_NONE };
    case "window":
    case "mech":
    case "metal":
      return { color: [base[0] * 0.78, base[1] * 0.78, base[2] * 0.78], paint: PAINT_NONE };
    default:
      if (/^glass\d$/.test(role)) {
        return { color: grey(Math.min(1.1, luma(base) / GLASS_REFERENCE)), paint: PAINT_GLASS };
      }
      return { color: base, paint: PAINT_WALL };
  }
}
