/**
 * Building archetypes (PLAN.md sections 4, 9, 35, 38).
 *
 * Eight procedural shapes, one `InstancedMesh` each. Which one a building gets
 * is decided HERE, deterministically, from its tier, whether it is a file or a
 * directory, its language family, the role the interpretation gave it, and a
 * hash of its path. The same repository therefore always renders the same
 * city, and a district keeps a coherent look instead of a random one.
 *
 * Section 9's rule still holds: the language never changes the ART STYLE, it
 * only nudges which of the eight shapes in the same style a building takes.
 * Height and footprint keep coming from the generator's `size`.
 *
 * Pure: no three.js, no React. Unit tested.
 */

import type { BuildingTier, SettlementTier } from "@/types/analysis";
import type { Building } from "@/types/city";

/** The eight shapes of today's city. `chooseArchetype` only ever returns these. */
export type CityArchetypeId =
  | "house"
  | "lowrise-parapet"
  | "lowrise-pitched"
  | "warehouse-sawtooth"
  | "midrise-setback"
  | "midrise-mech"
  | "tower-stepped"
  | "tower-crown";

/**
 * Settlement shapes (PLAN.md 76.1 decision 7): village cottages, farmhouses
 * and barns; town shopfronts, terraces and low apartment blocks; metropolis
 * glass, twin and spire towers. Declared by S0 and drawn with the nearest
 * city shape (`ARCHETYPE_STAND_IN`) until S6 and S7 model them.
 */
export type SettlementArchetypeId =
  | "cottage"
  | "farmhouse"
  | "barn"
  | "shopfront"
  | "terrace"
  | "apartment-low"
  | "tower-glass"
  | "tower-twin"
  | "tower-spire";

export type ArchetypeId = CityArchetypeId | SettlementArchetypeId;

export const CITY_ARCHETYPE_IDS: readonly CityArchetypeId[] = [
  "house",
  "lowrise-parapet",
  "lowrise-pitched",
  "warehouse-sawtooth",
  "midrise-setback",
  "midrise-mech",
  "tower-stepped",
  "tower-crown",
];

export const SETTLEMENT_ARCHETYPE_IDS: readonly SettlementArchetypeId[] = [
  "cottage",
  "farmhouse",
  "barn",
  "shopfront",
  "terrace",
  "apartment-low",
  "tower-glass",
  "tower-twin",
  "tower-spire",
];

/** Every archetype with a model, placeholders included. */
export const ARCHETYPE_IDS: readonly ArchetypeId[] = [
  ...CITY_ARCHETYPE_IDS,
  ...SETTLEMENT_ARCHETYPE_IDS,
];

/**
 * Placeholder geometry for each settlement archetype that has no model yet:
 * the closest shape the city already has. `models.ts` builds a placeholder
 * from its stand-in, so a tier table can name "tower-glass" today and get a
 * stepped tower. The village and town models have landed (S6); the three
 * metropolis towers are S7's, in `metropolis.ts`.
 */
export const ARCHETYPE_STAND_IN: Partial<Record<SettlementArchetypeId, CityArchetypeId>> = {
  "tower-glass": "tower-stepped",
  "tower-twin": "tower-stepped",
  "tower-spire": "tower-crown",
};

/**
 * A drawable model: an archetype, or one of its variants. The variants share
 * the archetype's role and differ in construction -- a cottage under tile
 * rather than thatch, a shop with two floors over it rather than one, a
 * block of flats with shops under it -- and each is its own merged geometry
 * and its own instanced draw call.
 */
export type ModelKey = ArchetypeId | "cottage/tile" | "shopfront/tall" | "apartment-low/retail";

export const MODEL_VARIANTS: readonly ModelKey[] = ["cottage/tile", "shopfront/tall", "apartment-low/retail"];

/** Every model with geometry: the archetypes and their variants. */
export const MODEL_KEYS: readonly ModelKey[] = [...ARCHETYPE_IDS, ...MODEL_VARIANTS];

export type LanguageFamily = "script" | "compiled" | "markup" | "data" | "config" | "unknown";

const FAMILY_BY_LANGUAGE: Record<string, LanguageFamily> = {
  javascript: "script",
  typescript: "script",
  tsx: "script",
  jsx: "script",
  python: "script",
  ruby: "script",
  php: "script",
  perl: "script",
  lua: "script",
  shell: "script",
  bash: "script",
  powershell: "script",
  r: "script",
  elixir: "script",
  erlang: "script",

  c: "compiled",
  "c++": "compiled",
  cpp: "compiled",
  "c#": "compiled",
  rust: "compiled",
  go: "compiled",
  java: "compiled",
  kotlin: "compiled",
  swift: "compiled",
  "objective-c": "compiled",
  scala: "compiled",
  haskell: "compiled",
  zig: "compiled",
  dart: "compiled",
  ocaml: "compiled",
  fortran: "compiled",

  html: "markup",
  css: "markup",
  scss: "markup",
  less: "markup",
  markdown: "markup",
  mdx: "markup",
  vue: "markup",
  svelte: "markup",
  handlebars: "markup",
  pug: "markup",
  restructuredtext: "markup",

  json: "data",
  yaml: "data",
  toml: "data",
  xml: "data",
  csv: "data",
  sql: "data",
  graphql: "data",
  protocolbuffer: "data",

  dockerfile: "config",
  makefile: "config",
  cmake: "config",
  ini: "config",
  nix: "config",
  hcl: "config",
  terraform: "config",
  gradle: "config",
};

/** Language name -> family. Unknown languages land in `unknown` and stay plain. */
export function languageFamily(language: string | null | undefined): LanguageFamily {
  if (!language) return "unknown";
  const key = language.trim().toLowerCase();
  return FAMILY_BY_LANGUAGE[key] ?? "unknown";
}

/**
 * Candidates per tier, most likely first. Every archetype is pinned to one or
 * two neighbouring tiers, which is what keeps its baked-in detail -- parapet
 * heights, window rows, roof pitch -- at a sensible size once the instance
 * matrix stretches the unit model to the building's height.
 */
const TIER_CANDIDATES: Record<BuildingTier, readonly ArchetypeId[]> = {
  1: ["house", "lowrise-parapet", "warehouse-sawtooth"],
  2: ["lowrise-pitched", "lowrise-parapet", "warehouse-sawtooth"],
  3: ["midrise-setback", "midrise-mech", "lowrise-parapet"],
  4: ["midrise-mech", "tower-stepped", "midrise-setback"],
  5: ["tower-crown", "tower-stepped", "midrise-mech"],
};

/**
 * The archetypes each settlement builds with, tier by tier (PLAN.md 76.1
 * decision 7). The city row is today's table, untouched, so a city-tier
 * repository draws exactly the city it always did.
 *
 *   village     cottages and farmhouses along the lanes, barns among them,
 *               and a farmhouse or a big barn for the most important files
 *   town        terraces and cottages on the side streets, low blocks of
 *               flats for the bigger directories, and the city's parapet
 *               and setback shapes at the top; shopfronts only ever come
 *               from `frontage` (see `chooseArchetype`)
 *   metropolis  S7's glass, twin and spire towers over the city's own
 *               towers and mid-rises
 */
export const ARCHETYPE_TABLES: Record<SettlementTier, Record<BuildingTier, readonly ArchetypeId[]>> = {
  village: {
    1: ["cottage", "farmhouse", "barn"],
    2: ["cottage", "farmhouse", "barn"],
    3: ["farmhouse", "cottage", "barn"],
    4: ["farmhouse", "barn"],
    5: ["farmhouse", "barn"],
  },
  town: {
    1: ["terrace", "cottage", "lowrise-pitched"],
    2: ["terrace", "lowrise-pitched", "cottage"],
    3: ["apartment-low", "terrace", "lowrise-parapet"],
    4: ["apartment-low", "midrise-setback", "lowrise-parapet"],
    5: ["apartment-low", "midrise-setback", "midrise-mech"],
  },
  city: TIER_CANDIDATES,
  metropolis: {
    1: ["lowrise-parapet", "midrise-setback", "warehouse-sawtooth"],
    2: ["midrise-setback", "lowrise-parapet", "midrise-mech"],
    3: ["midrise-mech", "tower-glass", "midrise-setback"],
    4: ["tower-glass", "tower-stepped", "tower-twin"],
    5: ["tower-spire", "tower-twin", "tower-crown"],
  },
};

/** Base weight by position in the tier's candidate list. */
const POSITION_WEIGHT = [6, 4, 2];

const FAMILY_WEIGHT: Record<LanguageFamily, Partial<Record<ArchetypeId, number>>> = {
  // Scripts build the ordinary working city: pitched low-rises and setbacks.
  script: { "lowrise-pitched": 1.6, "midrise-setback": 1.5, house: 1.3, terrace: 1.3, cottage: 1.2 },
  // Compiled code gets the heavier, blockier, more engineered silhouettes.
  compiled: {
    "lowrise-parapet": 1.8,
    "tower-stepped": 1.7,
    "midrise-mech": 1.4,
    "apartment-low": 1.3,
    farmhouse: 1.3,
    "tower-glass": 1.5,
  },
  // Markup and docs are the small domestic end of the city.
  markup: { house: 1.9, "lowrise-pitched": 1.7, cottage: 1.8, terrace: 1.5 },
  // Data is stored, so data looks like storage.
  data: { "warehouse-sawtooth": 2.4, "midrise-mech": 1.3, barn: 2.2 },
  config: { "warehouse-sawtooth": 1.9, "lowrise-parapet": 1.4, barn: 1.7 },
  unknown: {},
};

const DIRECTORY_WEIGHT: Partial<Record<ArchetypeId, number>> = {
  "warehouse-sawtooth": 1.6,
  "midrise-setback": 1.35,
  "tower-stepped": 1.35,
  "lowrise-parapet": 1.2,
  barn: 1.4,
  farmhouse: 1.3,
  "apartment-low": 1.3,
  "tower-twin": 1.35,
};

const FILE_WEIGHT: Partial<Record<ArchetypeId, number>> = {
  house: 1.4,
  "lowrise-pitched": 1.3,
  "tower-crown": 1.3,
  cottage: 1.4,
  terrace: 1.2,
  "tower-spire": 1.3,
};

/**
 * The interpretation's `role` is free-form AI prose, so it is only ever read
 * for keywords, and only ever as a nudge on top of the tier's candidates.
 */
const ROLE_WEIGHT: readonly { pattern: RegExp; weights: Partial<Record<ArchetypeId, number>> }[] = [
  {
    pattern: /\b(test|spec|fixture|mock|bench)/i,
    weights: { "warehouse-sawtooth": 1.7, "lowrise-parapet": 1.4, "tower-crown": 0.5, barn: 1.5 },
  },
  {
    pattern: /\b(entry|entrypoint|main|core|api|public|server|router|runtime)/i,
    weights: { "tower-crown": 1.8, "midrise-setback": 1.5, farmhouse: 1.5, "tower-spire": 1.8 },
  },
  {
    pattern: /\b(build|tool|script|ci|deploy|infra|packaging|bundler)/i,
    weights: { "warehouse-sawtooth": 1.6, "midrise-mech": 1.4, barn: 1.6 },
  },
  {
    pattern: /\b(doc|guide|example|tutorial|website)/i,
    weights: { house: 1.6, "lowrise-pitched": 1.5, cottage: 1.6, terrace: 1.3 },
  },
];

/** FNV-1a. Small, stable, and it never has to leave this file. */
export function hash32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

const tierOf = (tier: number): BuildingTier =>
  (tier >= 1 && tier <= 5 ? Math.trunc(tier) : 1) as BuildingTier;

/**
 * The seed a building's look is drawn from: its path if it has one, its id
 * otherwise. Paths survive re-ranking, so a repository that gains a file does
 * not reshuffle every other building in the city (PLAN.md section 35).
 */
export function archetypeSeed(building: Building): string {
  return building.plan?.path || building.id;
}

/**
 * Deterministic archetype for a building. Same repository, same city.
 *
 * `settlement` picks the tier table; it defaults to the city, so every caller
 * that predates settlements gets exactly the city's choice. In a town, a slot
 * on the high street (`frontage: "main-street"`) is always a shop: a
 * shopfront up to tier 3, and above that a block of flats over shops.
 */
export function chooseArchetype(building: Building, settlement: SettlementTier = "city"): ArchetypeId {
  const tier = tierOf(building.tier ?? building.plan?.tier ?? 1);
  if (settlement === "town" && building.frontage === "main-street") {
    return tier <= 3 ? "shopfront" : "apartment-low";
  }
  const candidates = (ARCHETYPE_TABLES[settlement] ?? TIER_CANDIDATES)[tier];
  const family = languageFamily(building.plan?.language);
  const isDirectory = building.plan?.kind === "directory";
  const role = building.plan?.role ?? "";

  const weights = candidates.map((id, index) => {
    let weight = POSITION_WEIGHT[index] ?? 1;
    weight *= FAMILY_WEIGHT[family][id] ?? 1;
    weight *= (isDirectory ? DIRECTORY_WEIGHT[id] : FILE_WEIGHT[id]) ?? 1;
    for (const rule of ROLE_WEIGHT) {
      if (role && rule.pattern.test(role)) weight *= rule.weights[id] ?? 1;
    }
    return weight;
  });

  const total = weights.reduce((a, b) => a + b, 0);
  // 0..1 from the hash, then a weighted pick: the shape is random-looking
  // across a city and identical every time that city is generated again.
  const roll = ((hash32(archetypeSeed(building)) % 100000) / 100000) * total;
  let running = 0;
  for (let i = 0; i < candidates.length; i++) {
    running += weights[i];
    if (roll < running) return candidates[i];
  }
  return candidates[candidates.length - 1];
}

/**
 * A second, independent stream of variation from the same seed: door side,
 * rooftop props, window litness and colour jitter each take their own slice so
 * two buildings that share an archetype still differ.
 */
export function variantValue(seed: string, channel: number): number {
  return (hash32(`${seed}#${channel}`) % 10000) / 10000;
}

/**
 * Which construction of its archetype a building gets (see `ModelKey`).
 *
 *   cottage        thatch in the village, three in five; clay tile otherwise,
 *                  and always tile in a town
 *   shopfront      two storeys over the shop up to tier 2, three at tier 3
 *   apartment-low  over shops when it stands on the high street
 *
 * Every other archetype has one construction and is its own key.
 */
export function modelKeyFor(
  archetype: ArchetypeId,
  building: Building,
  settlement: SettlementTier = "city",
): ModelKey {
  const tier = tierOf(building.tier ?? building.plan?.tier ?? 1);
  switch (archetype) {
    case "cottage":
      return settlement === "village" && variantValue(archetypeSeed(building), 7) < 0.6
        ? "cottage"
        : "cottage/tile";
    case "shopfront":
      return tier >= 3 ? "shopfront/tall" : "shopfront";
    case "apartment-low":
      return building.frontage === "main-street" ? "apartment-low/retail" : "apartment-low";
    default:
      return archetype;
  }
}
