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

import type { BuildingTier } from "@/types/analysis";
import type { Building } from "@/types/city";

export type ArchetypeId =
  | "house"
  | "lowrise-parapet"
  | "lowrise-pitched"
  | "warehouse-sawtooth"
  | "midrise-setback"
  | "midrise-mech"
  | "tower-stepped"
  | "tower-crown";

export const ARCHETYPE_IDS: readonly ArchetypeId[] = [
  "house",
  "lowrise-parapet",
  "lowrise-pitched",
  "warehouse-sawtooth",
  "midrise-setback",
  "midrise-mech",
  "tower-stepped",
  "tower-crown",
];

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

/** Base weight by position in the tier's candidate list. */
const POSITION_WEIGHT = [6, 4, 2];

const FAMILY_WEIGHT: Record<LanguageFamily, Partial<Record<ArchetypeId, number>>> = {
  // Scripts build the ordinary working city: pitched low-rises and setbacks.
  script: { "lowrise-pitched": 1.6, "midrise-setback": 1.5, house: 1.3 },
  // Compiled code gets the heavier, blockier, more engineered silhouettes.
  compiled: { "lowrise-parapet": 1.8, "tower-stepped": 1.7, "midrise-mech": 1.4 },
  // Markup and docs are the small domestic end of the city.
  markup: { house: 1.9, "lowrise-pitched": 1.7 },
  // Data is stored, so data looks like storage.
  data: { "warehouse-sawtooth": 2.4, "midrise-mech": 1.3 },
  config: { "warehouse-sawtooth": 1.9, "lowrise-parapet": 1.4 },
  unknown: {},
};

const DIRECTORY_WEIGHT: Partial<Record<ArchetypeId, number>> = {
  "warehouse-sawtooth": 1.6,
  "midrise-setback": 1.35,
  "tower-stepped": 1.35,
  "lowrise-parapet": 1.2,
};

const FILE_WEIGHT: Partial<Record<ArchetypeId, number>> = {
  house: 1.4,
  "lowrise-pitched": 1.3,
  "tower-crown": 1.3,
};

/**
 * The interpretation's `role` is free-form AI prose, so it is only ever read
 * for keywords, and only ever as a nudge on top of the tier's candidates.
 */
const ROLE_WEIGHT: readonly { pattern: RegExp; weights: Partial<Record<ArchetypeId, number>> }[] = [
  {
    pattern: /\b(test|spec|fixture|mock|bench)/i,
    weights: { "warehouse-sawtooth": 1.7, "lowrise-parapet": 1.4, "tower-crown": 0.5 },
  },
  {
    pattern: /\b(entry|entrypoint|main|core|api|public|server|router|runtime)/i,
    weights: { "tower-crown": 1.8, "midrise-setback": 1.5 },
  },
  {
    pattern: /\b(build|tool|script|ci|deploy|infra|packaging|bundler)/i,
    weights: { "warehouse-sawtooth": 1.6, "midrise-mech": 1.4 },
  },
  {
    pattern: /\b(doc|guide|example|tutorial|website)/i,
    weights: { house: 1.6, "lowrise-pitched": 1.5 },
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

/** Deterministic archetype for a building. Same repository, same city. */
export function chooseArchetype(building: Building): ArchetypeId {
  const tier = tierOf(building.tier ?? building.plan?.tier ?? 1);
  const candidates = TIER_CANDIDATES[tier];
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
