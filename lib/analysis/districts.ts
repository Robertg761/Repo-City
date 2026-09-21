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
 * Deterministic names for the directory conventions the plan calls out
 * (PLAN.md section 8). Anything unlisted falls back to Title Case + District,
 * which is also the AI-unavailable fallback required by section 27.
 */
const KNOWN_NAMES: Record<string, string> = {
  src: "Core District",
  source: "Core District",
  lib: "Core District",
  app: "Application District",
  apps: "Application District",
  packages: "Packages District",
  package: "Packages District",
  crates: "Packages District",
  modules: "Packages District",
  plugins: "Plugins District",
  docs: "Knowledge District",
  doc: "Knowledge District",
  documentation: "Knowledge District",
  website: "Knowledge District",
  test: "Safety District",
  tests: "Safety District",
  __tests__: "Safety District",
  spec: "Safety District",
  e2e: "Safety District",
  examples: "Demo District",
  example: "Demo District",
  samples: "Demo District",
  demo: "Demo District",
  demos: "Demo District",
  scripts: "Operations District",
  script: "Operations District",
  tools: "Operations District",
  tooling: "Operations District",
  build: "Operations District",
  ci: "Operations District",
  infra: "Operations District",
  infrastructure: "Operations District",
  deploy: "Operations District",
  config: "Civic District",
  configs: "Civic District",
  assets: "Assets District",
  static: "Assets District",
  public: "Assets District",
  resources: "Assets District",
  benchmarks: "Proving Grounds",
  bench: "Proving Grounds",
};

function titleCase(name: string): string {
  return name
    .replace(/[_-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** Deterministic district name for a source directory. */
export function districtNameFor(sourcePath: string): string {
  const parts = segments(sourcePath);
  if (parts.length === 0) return OUTSKIRTS_NAME;
  const key = parts[parts.length - 1].toLowerCase();
  const known = KNOWN_NAMES[key];
  if (known && parts.length === 1) return known;
  return `${titleCase(parts[parts.length - 1])} District`;
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
  const maxCount = Math.max(1, ...chosen.map((c) => c.fileCount), catchAllFiles);

  const districts: DistrictPlan[] = chosen.map((c) => ({
    id: districtIdFor(c.path, taken),
    sourcePath: `/${c.path}`,
    name: districtNameFor(c.path),
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
