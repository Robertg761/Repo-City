/**
 * Wall and accent colours for the village and town models (PLAN.md 76.1
 * decision 7, section 4).
 *
 * The city paints every building in its district's colour. A village does not
 * look like that: its cottages are limewashed white, cream, ochre and a faded
 * pink whatever lane they stand on, its barns are barn red or tarred timber,
 * and every front door is a colour of its own. A town adds brick and painted
 * shopfronts. So each settlement model draws its wall from its own palette,
 * seeded by the building's path, and keeps a little of the district's colour
 * so a lane still hangs together.
 *
 * All the colours are held a step off full saturation: they sit under the
 * same sun and the same PBR Neutral tone mapping as the city's beige housing,
 * and they must never out-shout an incident's beacon.
 *
 * Pure: hex strings in, hex strings out. Unit tested.
 */

import type { Building } from "@/types/city";
import { buildingColor, mix } from "../../palette";
import { archetypeSeed, variantValue, type ModelKey } from "./archetypes";

/** Limewash and render: the cottage and farmhouse walls. */
export const VILLAGE_WALLS = [
  "#f2ede1", // limewash
  "#efe3c6", // cream
  "#e9d3a2", // ochre wash
  "#ecd5c9", // faded pink
  "#dcd0b8", // warm stone
  "#e4e1cd", // lichen white
  "#d8c19a", // honey stone
] as const;

/** Barn paint and weathered boards. */
export const BARN_WALLS = [
  "#9c4a3b", // barn red
  "#8f6d51", // weathered oak
  "#5e5048", // tarred boards
  "#7d8a6d", // faded sage
  "#a55a41", // rust red
] as const;

/** Painted shopfronts and terrace fronts. */
export const TOWN_FRONTS = [
  "#e9dcc2", // stucco cream
  "#c6d5cf", // duck-egg
  "#e6c8b5", // plaster pink
  "#d6cfe0", // lavender grey
  "#efe0ae", // primrose
  "#c5d0db", // powder blue
  "#b76a4f", // red brick
  "#d9d4c6", // portland
] as const;

/** Render and brick for the low blocks. */
export const TOWN_BLOCKS = [
  "#d9ccb4", // buff render
  "#b87157", // brick
  "#cdd2cb", // grey render
  "#e1d3bd", // sandstone
  "#a9674f", // dark brick
] as const;

/** Front doors and shutters: deep, cheerful, a little chalky. */
export const DOOR_ACCENTS = [
  "#3f6f8f", // harbour blue
  "#2f6a52", // bottle green
  "#9b3b36", // pillar-box red, faded
  "#c59a3a", // mustard
  "#5d4a6e", // plum
  "#2f3d4c", // navy
  "#6f8a5a", // sage
  "#8a5a3c", // oak
] as const;

/** Shop fascias and awnings: the high street's colour. */
export const SHOP_ACCENTS = [
  "#8e2f35", // burgundy
  "#2e6049", // racing green
  "#2c4a6e", // navy
  "#c08a2e", // gold
  "#3d7c7a", // teal
  "#6a3f63", // plum
  "#b0513b", // terracotta
] as const;

const pick = <T>(list: readonly T[], roll: number): T => list[Math.min(list.length - 1, Math.floor(roll * list.length))];

/** How much of the district's colour each wall keeps. */
export const DISTRICT_SHARE = 0.16;

export interface SettlementPaint {
  wall: string;
  accent: string;
}

/**
 * The wall and accent of one settlement building, or null when its model is
 * one of the city's (which take the district colour as they always have).
 * Deterministic: seeded by the building's path, like its archetype.
 */
export function settlementPaint(model: ModelKey, building: Building): SettlementPaint | null {
  const seed = archetypeSeed(building);
  const wallRoll = variantValue(seed, 31);
  const accentRoll = variantValue(seed, 32);
  let walls: readonly string[];
  let accents: readonly string[] = DOOR_ACCENTS;
  switch (model) {
    case "cottage":
    case "cottage/tile":
    case "farmhouse":
      walls = VILLAGE_WALLS;
      break;
    case "barn":
      walls = BARN_WALLS;
      break;
    case "terrace":
      walls = TOWN_FRONTS;
      break;
    case "shopfront":
    case "shopfront/tall":
      walls = TOWN_FRONTS;
      accents = SHOP_ACCENTS;
      break;
    case "apartment-low":
    case "apartment-low/retail":
      walls = TOWN_BLOCKS;
      accents = model === "apartment-low/retail" ? SHOP_ACCENTS : DOOR_ACCENTS;
      break;
    default:
      return null;
  }
  const district = buildingColor(building.colorIndex);
  return {
    wall: mix(pick(walls, wallRoll), district, DISTRICT_SHARE),
    accent: pick(accents, accentRoll),
  };
}
