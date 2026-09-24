/**
 * District planning (PLAN.md section 8).
 *
 * Top-level directories become districts, ranked by descendant file count.
 * Everything a chosen district does not cover collapses into one Outskirts
 * district at `/`. Root-level files belong to the civic center, so in a
 * repository with enough directories they never create a district of their own.
 *
 * The exception is a repository too small to fill `MIN_DISTRICTS` directory
 * districts, where `sindresorhus/p-limit` is the canonical case: folding its
 * five root files into a one-file `/scripts` district gives a city that is one
 * district holding everything. There the root files get the single `/` district
 * for themselves, shared with Outskirts when that would exist too.
 *
 * Deterministic: same tree in, same districts out, same order.
 */

import type { DistrictPlan } from "@/types/analysis";
import type { TreeEntry } from "@/types/repository";
import { blobsOf, round, segments } from "./tree";

/** PLAN.md section 8: "between 3 and 8 districts". */
export const MIN_DISTRICTS = 3;
export const MAX_DISTRICTS = 8;

/** Source path of the catch-all district. There is never more than one. */
export const OUTSKIRTS_PATH = "/";
export const OUTSKIRTS_NAME = "Outskirts";

/** Name of the `/` district when it holds root-level files and nothing else. */
export const ROOT_NAME = "Root";

/**
 * Deterministic names for common directory conventions (PLAN.md section 8),
 * written as places in the same register as the curated interpretations in
 * `fixtures/interpretations`. The folder path is shown under every name, so the
 * name can be flavourful while the path keeps it honest. This is also the
 * AI-unavailable fallback required by section 27.
 *
 * Keys are lowercase folder names, matched against a district's last segment.
 */
const KNOWN_NAMES: Record<string, string> = {
  // Core source
  src: "The Foundry",
  source: "The Foundry",
  sources: "The Foundry",
  lib: "The Mill",
  libs: "The Mill",
  core: "The Old Town",
  pkg: "The Works",
  internal: "The Inner Works",
  cmd: "The Command Post",
  cli: "The Command Post",
  backend: "The Engine Room",
  frontend: "The Storefronts",
  client: "The Storefronts",
  web: "The Boulevard",
  app: "Main Street",
  // Interface
  components: "The Assembly Halls",
  component: "The Assembly Halls",
  ui: "The Façade",
  widgets: "Fittings Row",
  views: "The Galleries",
  pages: "The Promenade",
  routes: "The Crossroads",
  screens: "The Picture House",
  layouts: "The Floor Plans",
  templates: "The Pattern Shop",
  hooks: "The Rigging Loft",
  // Shared helpers
  utils: "The Tool Shed",
  util: "The Tool Shed",
  helpers: "The Tool Shed",
  common: "The Commons",
  shared: "The Commons",
  // Types
  types: "The Drafting Office",
  typings: "The Drafting Office",
  "@types": "The Drafting Office",
  interfaces: "The Blueprint Office",
  include: "The Index Office",
  proto: "The Treaty Office",
  protos: "The Treaty Office",
  // State and data
  store: "The Storehouse",
  stores: "The Storehouse",
  state: "The Counting House",
  models: "The Model Village",
  model: "The Model Village",
  db: "The Vaults",
  database: "The Vaults",
  migrations: "The Removals Yard",
  schema: "The Land Registry",
  schemas: "The Land Registry",
  data: "The Archives",
  // Services
  api: "The Exchange",
  server: "The Power Station",
  services: "The Utilities",
  service: "The Utilities",
  handlers: "The Switchboard",
  controllers: "The Signal Box",
  middleware: "The Toll Gates",
  // Tests
  test: "Proving Grounds",
  tests: "Proving Grounds",
  __tests__: "Proving Grounds",
  spec: "The Inspectorate",
  specs: "The Inspectorate",
  e2e: "The Test Track",
  integration: "The Junction Yard",
  bench: "Speed Trials",
  benchmark: "Speed Trials",
  benchmarks: "Speed Trials",
  fixtures: "The Prop Store",
  mocks: "The Stage Sets",
  __mocks__: "The Stage Sets",
  testdata: "The Specimen Store",
  "test-data": "The Specimen Store",
  // Examples
  examples: "The Showrooms",
  example: "The Showrooms",
  demos: "The Exhibition Hall",
  demo: "The Exhibition Hall",
  samples: "The Sample Shop",
  sample: "The Sample Shop",
  playground: "The Playground",
  // Docs
  docs: "The Library",
  doc: "The Library",
  documentation: "The Library",
  guides: "The Library",
  website: "The Visitor Centre",
  site: "The Visitor Centre",
  // Operations
  scripts: "Maintenance Depot",
  script: "Maintenance Depot",
  tools: "The Machine Shop",
  tooling: "The Machine Shop",
  bin: "The Engine Sheds",
  ci: "The Control Tower",
  ".github": "The Harbour Office",
  infra: "The Waterworks",
  infrastructure: "The Waterworks",
  terraform: "The Waterworks",
  deploy: "The Shipyard",
  deployment: "The Shipyard",
  build: "The Kilns",
  docker: "The Container Yard",
  config: "Civic Offices",
  configs: "Civic Offices",
  conf: "Civic Offices",
  settings: "Civic Offices",
  // Assets
  assets: "The Depot",
  static: "The Stockrooms",
  resources: "The Stockrooms",
  public: "The Town Square",
  images: "The Gallery",
  img: "The Gallery",
  icons: "The Sign Works",
  fonts: "The Type Foundry",
  styles: "The Paint Shop",
  css: "The Paint Shop",
  scss: "The Paint Shop",
  theme: "The Paint Shop",
  // Packages and extensions
  packages: "The Warehouses",
  package: "The Warehouses",
  apps: "The Boroughs",
  modules: "The Boroughs",
  crates: "The Crate Yard",
  plugins: "The Annexes",
  addons: "The Annexes",
  extensions: "The Extension Quarter",
  // Languages
  i18n: "The Embassy",
  l10n: "The Embassy",
  locales: "The Embassy",
  locale: "The Embassy",
  lang: "The Embassy",
  translations: "The Embassy",
  // Borrowed code
  vendor: "The Import Docks",
  third_party: "The Import Docks",
  "third-party": "The Import Docks",
  external: "The Import Docks",
  deps: "The Import Docks",
};

/**
 * Place words for folders with no known name. One is picked per path by a
 * stable hash, so the same folder is always the same place.
 */
const PLACE_SUFFIXES = [
  "Quarter",
  "Works",
  "Yard",
  "Row",
  "Heights",
  "Commons",
  "Wharf",
  "Lane",
] as const;

/** FNV-1a, 32-bit. Stable across runtimes, which is all this needs. */
function stableHash(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function titleCase(name: string): string {
  return name
    .replace(/^[._@]+/, "")
    .replace(/[_.\s-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Title Case folder name plus a place word: the one the path hashes to, moved
 * on by `offset`. Names stay within three words, so a folder name that already
 * needs three keeps them and takes no suffix, and one that needs more is cut.
 */
function placeNameFor(sourcePath: string, offset = 0): string {
  const parts = segments(sourcePath);
  const words = titleCase(parts[parts.length - 1]).split(" ").filter(Boolean);
  if (words.length === 0) words.push("Nameless");
  if (words.length >= 3 && offset === 0) return words.slice(0, 3).join(" ");
  const base = words.slice(0, 2).join(" ");
  const index = (stableHash(parts.join("/").toLowerCase()) + offset) % PLACE_SUFFIXES.length;
  return `${base} ${PLACE_SUFFIXES[index]}`;
}

/** Deterministic district name for a source directory. */
export function districtNameFor(sourcePath: string): string {
  const parts = segments(sourcePath);
  if (parts.length === 0) return OUTSKIRTS_NAME;
  const known = KNOWN_NAMES[parts[parts.length - 1].toLowerCase()];
  return known ?? placeNameFor(sourcePath);
}

/**
 * `districtNameFor`, made unique within one plan. When the name is taken
 * (`src` and `source` are both The Foundry), the later district is named for its
 * own folder with a place word instead, walking the place words until one is
 * free. `planDistricts` calls this in plan order, so the result is deterministic.
 */
export function uniqueDistrictNameFor(sourcePath: string, taken: Set<string>): string {
  let name = districtNameFor(sourcePath);
  for (let offset = 0; taken.has(name) && offset < PLACE_SUFFIXES.length; offset++) {
    name = placeNameFor(sourcePath, offset);
  }
  const base = name;
  for (let n = 2; taken.has(name); n++) name = `${base} ${n}`;
  taken.add(name);
  return name;
}

/** `src/core` -> `d-src-core`. Slugs are lowercase and collision-free. */
export function districtIdFor(sourcePath: string, taken: Set<string>): string {
  const slug =
    segments(sourcePath)
      .join("-")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "outskirts";
  let id = `d-${slug}`;
  let n = 2;
  while (taken.has(id)) id = `d-${slug}-${n++}`;
  taken.add(id);
  return id;
}

interface Candidate {
  /** Directory path without a leading slash. */
  path: string;
  fileCount: number;
}

/** File counts for every directory at exactly `depth` segments. */
function candidatesAtDepth(blobs: readonly TreeEntry[], depth: number): Candidate[] {
  const counts = new Map<string, number>();
  for (const blob of blobs) {
    const parts = segments(blob.path);
    if (parts.length <= depth) continue; // a file at this level, not a directory
    const key = parts.slice(0, depth).join("/");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].map(([path, fileCount]) => ({ path, fileCount }));
}

/** Descending file count, then path ascending: a total, stable order. */
function rank(a: Candidate, b: Candidate): number {
  return b.fileCount - a.fileCount || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}

/**
 * Plans the districts for a repository tree.
 *
 * `entries` must already be pruned with `pruneTree` (PLAN.md section 8 says the
 * exclusions are applied *before* ranking); `analyzeSnapshot` prunes once and
 * shares the result with building selection and the scale metrics.
 */
export function planDistricts(entries: readonly TreeEntry[]): DistrictPlan[] {
  const files = blobsOf(entries);

  let candidates = candidatesAtDepth(files, 1).sort(rank);

  // PLAN.md section 8: "a repository with a single top-level source directory
  // may promote its children to districts". Promote while we are short of the
  // minimum and the largest candidate actually has children to promote.
  while (candidates.length < MIN_DISTRICTS) {
    const biggest = candidates[0];
    if (!biggest) break;
    const children = candidatesAtDepth(files, segments(biggest.path).length + 1)
      .filter((c) => c.path.startsWith(`${biggest.path}/`))
      .sort(rank);
    if (children.length < 2) break;
    candidates = [...candidates.filter((c) => c.path !== biggest.path), ...children].sort(rank);
  }

  const chosen = candidates.slice(0, MAX_DISTRICTS);

  // Nested paths no chosen district covers. These are the Outskirts proper.
  const uncoveredFiles = files.filter((blob) => {
    const parts = segments(blob.path);
    if (parts.length < 2) return false; // root-level file, handled below
    return !chosen.some((c) => blob.path.startsWith(`${c.path}/`));
  }).length;

  // Root-level files are civic-center material and normally have no district
  // (PLAN.md section 8). Below the minimum, though, attributing them to the
  // biggest directory district would bury the whole repository in one place, so
  // they take the `/` district instead — sharing it with Outskirts if needed,
  // because two districts may never claim the same source path.
  const rootFiles = files.filter((blob) => segments(blob.path).length < 2).length;
  const rootNeedsDistrict = chosen.length < MIN_DISTRICTS && rootFiles > 0;
  const catchAllFiles = uncoveredFiles + (rootNeedsDistrict ? rootFiles : 0);

  const taken = new Set<string>();
  // Outskirts and Root are reserved: no directory district may take them.
  const takenNames = new Set<string>([OUTSKIRTS_NAME, ROOT_NAME]);
  const maxCount = Math.max(1, ...chosen.map((c) => c.fileCount), catchAllFiles);

  const districts: DistrictPlan[] = chosen.map((c) => ({
    id: districtIdFor(c.path, taken),
    sourcePath: `/${c.path}`,
    name: uniqueDistrictNameFor(c.path, takenNames),
    purpose: null,
    fileCount: c.fileCount,
    weight: round(c.fileCount / maxCount, 3),
  }));

  if (catchAllFiles > 0) {
    const coversNested = uncoveredFiles > 0;
    districts.push({
      id: districtIdFor(coversNested ? "outskirts" : "root", taken),
      sourcePath: OUTSKIRTS_PATH,
      name: coversNested ? OUTSKIRTS_NAME : ROOT_NAME,
      purpose: null,
      fileCount: catchAllFiles,
      weight: round(catchAllFiles / maxCount, 3),
    });
  }

  if (districts.length === 0) {
    // An empty tree still needs somewhere to put whatever arrives later, and
    // `districts[0]` is the documented home for landmarks.
    districts.push({
      id: "d-outskirts",
      sourcePath: OUTSKIRTS_PATH,
      name: OUTSKIRTS_NAME,
      purpose: null,
      fileCount: files.length,
      weight: 1,
    });
  }

  return districts;
}

/**
 * The `/` district when it is the home of the root-level files, else `null`.
 *
 * Read back from source paths alone, so `districtForPath` and `planDistricts`
 * cannot disagree and an AI rename (allowed by PLAN.md section 8) cannot move a
 * building: below `MIN_DISTRICTS` directory districts, `planDistricts` gave the
 * root files the `/` district, so that is where they belong.
 */
function rootDistrictOf(districts: readonly DistrictPlan[]): DistrictPlan | null {
  const directories = districts.filter((d) => d.sourcePath !== OUTSKIRTS_PATH).length;
  if (directories >= MIN_DISTRICTS) return null;
  return districts.find((d) => d.sourcePath === OUTSKIRTS_PATH) ?? null;
}

/**
 * The district a path belongs to, matching the longest district source path.
 *
 * Root-level files are civic-center material and normally have no district of
 * their own, so they are attributed to `districts[0]` — the convention W0
 * already used for the landmark buildings in `fixtures/sample.analysis.json`.
 * In a repository too small for `MIN_DISTRICTS` directory districts they go to
 * the `/` district `planDistricts` created for them instead. Uncovered nested
 * paths go to Outskirts when it exists.
 */
export function districtForPath(path: string, districts: readonly DistrictPlan[]): DistrictPlan {
  const p = path.replace(/^\/+/, "");
  let best: DistrictPlan | null = null;
  let bestLength = -1;
  for (const district of districts) {
    const dir = district.sourcePath.replace(/^\/+/, "");
    if (dir === "") continue;
    if ((p === dir || p.startsWith(`${dir}/`)) && dir.length > bestLength) {
      best = district;
      bestLength = dir.length;
    }
  }
  if (best) return best;
  if (segments(p).length < 2) return rootDistrictOf(districts) ?? districts[0];
  return districts.find((d) => d.sourcePath === OUTSKIRTS_PATH) ?? districts[0];
}
