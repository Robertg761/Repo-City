/**
 * Building selection (PLAN.md section 9).
 *
 * Turns a pruned tree into at most 300 `BuildingPlan`s. Granularity adapts:
 * a building is a file in a small repository and a folder in a large one, and
 * `kind` records which so the inspector can say so.
 *
 * Deterministic: no clock, no randomness.
 */

import type { BuildingPlan, BuildingTier, DistrictPlan, LandmarkFile } from "@/types/analysis";
import type { TreeEntry } from "@/types/repository";
import { districtForPath } from "./districts";
import {
  MAX_DEPTH,
  basename,
  blobsOf,
  countLanguages,
  isEntryPoint,
  isManifest,
  isTestOrFixturePath,
  landmarkKindOf,
  languageOf,
  round,
  segments,
} from "./tree";

/** PLAN.md sections 9 and 37: "Suggested maximum: 300 buildings". */
export const MAX_BUILDINGS = 300;

/** PLAN.md section 9 step 4: no district renders empty. */
export const MIN_PER_DISTRICT = 4;

/** PLAN.md section 9 step 2: file level first, then directories at 3, then 2. */
const GRANULARITY_LEVELS = [MAX_DEPTH, 3, 2];

/** Below this many candidates a coarser level makes the city look deserted. */
const MIN_CANDIDATES = 75;

export interface FileSelectionOptions {
  /** README text; paths it mentions earn a bonus (PLAN.md section 9 step 3). */
  readme?: string;
  /** Hard cap on buildings. Defaults to `MAX_BUILDINGS`, never exceeds it. */
  max?: number;
}

interface Candidate {
  path: string;
  kind: "file" | "directory";
  /** Sum of blob sizes underneath, in bytes. */
  size: number;
  descendantCount: number;
  language: string | null;
  landmark: LandmarkFile | null;
  score: number;
  districtId: string;
}

/**
 * Collapses blobs to candidates at `level` segments.
 *
 * A blob with at most `level` segments stays a file; anything deeper is folded
 * into its `level`-segment ancestor directory. With `level = MAX_DEPTH` this is
 * the "files" granularity plus the section 9 depth-6 collapse.
 */
function aggregate(blobs: readonly TreeEntry[], level: number): Map<string, TreeEntry[]> {
  const groups = new Map<string, TreeEntry[]>();
  for (const blob of blobs) {
    const parts = segments(blob.path);
    const key = parts.length <= level ? parts.join("/") : parts.slice(0, level).join("/");
    const bucket = groups.get(key);
    if (bucket) bucket.push(blob);
    else groups.set(key, [blob]);
  }
  return groups;
}

/** Paths the README mentions, lowercased, without a leading `./`. */
function readmePaths(readme: string | undefined): Set<string> {
  const out = new Set<string>();
  if (!readme) return out;
  const matches = readme.match(/[\w.@-]+(?:\/[\w.@-]+)+/g) ?? [];
  for (const match of matches) {
    const cleaned = match.replace(/^\.\//, "").replace(/[).,:;]+$/, "").toLowerCase();
    if (cleaned.length < 3) continue;
    out.add(cleaned);
    // Also credit every ancestor, so "src/router/dispatch.ts" lifts "src/router".
    const parts = cleaned.split("/");
    for (let i = 1; i < parts.length; i++) out.add(parts.slice(0, i).join("/"));
  }
  return out;
}

/** PLAN.md section 9 step 3. */
function scoreCandidate(
  candidate: Omit<Candidate, "score" | "districtId">,
  mentioned: Set<string>,
): number {
  let score = Math.log2(candidate.size + 1);
  if (candidate.kind === "directory") score += Math.log2(candidate.descendantCount + 1);
  if (isEntryPoint(candidate.path)) score += 3;
  if (isManifest(candidate.path)) score += 4;
  if (candidate.landmark) score += 6;
  if (mentioned.has(candidate.path.toLowerCase())) score += 2;
  if (isTestOrFixturePath(candidate.path)) score -= 3;
  return round(score, 3);
}

/**
 * Tier from score rank on a log scale, clamped to 5 visual tiers
 * (PLAN.md section 9 step 5). Rank 0 is the tallest building.
 */
export function tierForRank(rank: number, total: number): BuildingTier {
  if (total <= 1) return 5;
  const t = 1 - Math.log2(rank + 1) / Math.log2(total + 1);
  if (t >= 0.8) return 5;
  if (t >= 0.6) return 4;
  if (t >= 0.4) return 3;
  if (t >= 0.2) return 2;
  return 1;
}

function dominantLanguage(blobs: readonly TreeEntry[]): string | null {
  const counts = countLanguages(blobs);
  const first = Object.keys(counts)[0];
  return first ?? null;
}

/** Score descending, then path ascending: a total order, so ids are stable. */
function byScore(a: Candidate, b: Candidate): number {
  return b.score - a.score || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}

function buildCandidates(
  blobs: readonly TreeEntry[],
  districts: readonly DistrictPlan[],
  level: number,
  mentioned: Set<string>,
): Candidate[] {
  const groups = aggregate(blobs, level);
  const out: Candidate[] = [];
  for (const [path, members] of groups) {
    const isFile = members.length === 1 && members[0].path === path;
    const size = members.reduce((sum, m) => sum + (m.size ?? 0), 0);
    const base = {
      path,
      kind: (isFile ? "file" : "directory") as "file" | "directory",
      size,
      descendantCount: isFile ? 0 : members.length,
      language: isFile ? languageOf(path) : dominantLanguage(members),
      // Landmarks are civic structures, and every one the plan lists lives at
      // the repository root; deeper copies stay ordinary buildings.
      landmark: isFile && segments(path).length === 1 ? landmarkKindOf(path) : null,
    };
    out.push({
      ...base,
      score: scoreCandidate(base, mentioned),
      districtId: districtForPath(path, districts).id,
    });
  }
  return out.sort(byScore);
}

/**
 * Selects the buildings for a repository.
 *
 * `entries` must already be pruned with `pruneTree`.
 */
export function selectBuildings(
  entries: readonly TreeEntry[],
  districts: readonly DistrictPlan[],
  options: FileSelectionOptions = {},
): BuildingPlan[] {
  const max = Math.min(options.max ?? MAX_BUILDINGS, MAX_BUILDINGS);
  const blobs = blobsOf(entries);
  if (blobs.length === 0 || districts.length === 0) return [];

  const mentioned = readmePaths(options.readme);

  // Step 2: the finest granularity whose candidate count fits the cap. If a
  // coarser level would leave the city under-built, keep the finer set and let
  // the cap below trim it to 300 instead.
  let candidates: Candidate[] | null = null;
  let finer: Candidate[] | null = null;
  for (const level of GRANULARITY_LEVELS) {
    const set = buildCandidates(blobs, districts, level, mentioned);
    if (set.length <= max) {
      candidates = set.length < MIN_CANDIDATES && finer ? finer : set;
      break;
    }
    finer = set;
  }
  if (!candidates) candidates = finer ?? [];

  const selected = pickWithDistrictFloor(candidates, districts, max);
  selected.sort(byScore);

  const width = Math.max(3, String(selected.length).length);
  return selected.map((candidate, index) => ({
    id: `b-${String(index + 1).padStart(width, "0")}`,
    path: candidate.path,
    kind: candidate.kind,
    districtId: candidate.districtId,
    score: round(candidate.score, 2),
    tier: tierForRank(index, selected.length),
    descendantCount: candidate.descendantCount,
    language: candidate.language,
    role: null,
    landmark: candidate.landmark,
  }));
}

/**
 * Step 4: top `max` by score, then top up every district that has at least
 * `MIN_PER_DISTRICT` candidates but fewer selected, evicting the weakest
 * buildings from the districts that can spare them. Landmarks are never
 * evicted: they are the city's recognizable civic structures.
 */
function pickWithDistrictFloor(
  candidates: readonly Candidate[],
  districts: readonly DistrictPlan[],
  max: number,
): Candidate[] {
  const byDistrict = new Map<string, Candidate[]>();
  for (const district of districts) byDistrict.set(district.id, []);
  for (const candidate of candidates) {
    const bucket = byDistrict.get(candidate.districtId);
    if (bucket) bucket.push(candidate);
    else byDistrict.set(candidate.districtId, [candidate]);
  }

  const selected = new Set<Candidate>(candidates.slice(0, max));

  for (const [, bucket] of byDistrict) {
    const target = Math.min(MIN_PER_DISTRICT, bucket.length);
    let have = bucket.filter((c) => selected.has(c)).length;
    if (have >= target) continue;
    for (const candidate of bucket) {
      if (have >= target) break;
      if (selected.has(candidate)) continue;
      selected.add(candidate);
      have += 1;
    }
  }

  if (selected.size <= max) return [...selected];

  // Over the cap: drop the lowest-scoring buildings from districts that still
  // keep more than the floor afterwards.
  const counts = new Map<string, number>();
  for (const candidate of selected) {
    counts.set(candidate.districtId, (counts.get(candidate.districtId) ?? 0) + 1);
  }
  const evictable = [...selected]
    .filter((c) => !c.landmark)
    .sort(byScore)
    .reverse(); // weakest first
  for (const candidate of evictable) {
    if (selected.size <= max) break;
    const count = counts.get(candidate.districtId) ?? 0;
    const floor = Math.min(MIN_PER_DISTRICT, (byDistrict.get(candidate.districtId) ?? []).length);
    if (count <= floor) continue;
    selected.delete(candidate);
    counts.set(candidate.districtId, count - 1);
  }
  return [...selected].slice(0, max);
}

/** Building ids grouped by district, handy for the city generator. */
export function buildingsByDistrict(buildings: readonly BuildingPlan[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const building of buildings) {
    const bucket = out.get(building.districtId);
    if (bucket) bucket.push(building.id);
    else out.set(building.districtId, [building.id]);
  }
  return out;
}

/** Human label for the inspector: PLAN.md section 9 requires saying which. */
export function buildingKindLabel(building: BuildingPlan): string {
  return building.kind === "file" ? `File ${basename(building.path)}` : `Folder ${building.path}`;
}
