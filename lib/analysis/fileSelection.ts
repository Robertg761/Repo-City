/**
 * Building selection (PLAN.md section 9).
 *
 * Turns a pruned tree into at most `max` `BuildingPlan`s, where the budget is
 * the settlement tier's (PLAN.md 76.5: a village 6 to 40, a town 30 to 120, a
 * city 75 to 300, a metropolis 300 to 450). Granularity adapts:
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

/**
 * PLAN.md sections 9 and 37: "Suggested maximum: 300 buildings". This is the
 * city tier's budget and the default when no budget is passed.
 */
export const MAX_BUILDINGS = 300;

/** PLAN.md 76.5: the absolute cap, the metropolis budget. No budget exceeds it. */
export const BUILDING_CAP = 450;

/** PLAN.md section 9 step 4: no district renders empty. */
export const MIN_PER_DISTRICT = 4;

/** PLAN.md section 9 step 2: file level first, then directories at 3, then 2. */
const GRANULARITY_LEVELS = [MAX_DEPTH, 3, 2];

/**
 * Below this many candidates a coarser level makes the city look deserted.
 * The city tier's floor and the default; each settlement tier has its own.
 */
export const MIN_CANDIDATES = 75;

export interface FileSelectionOptions {
  /** README text; paths it mentions earn a bonus (PLAN.md section 9 step 3). */
  readme?: string;
  /**
   * The keep-the-finer-granularity floor: a coarser level with fewer
   * candidates than this is passed over for the finer one, trimmed to `max`.
   * Defaults to `MIN_CANDIDATES`.
   */
  min?: number;
  /** Hard cap on buildings. Defaults to `MAX_BUILDINGS`, never exceeds `BUILDING_CAP`. */
  max?: number;
  /** Share of the buildings per tier. Defaults to `TIER_SHARES`, the city's. */
  shares?: TierShares;
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
 * Share of the buildings in each tier, tallest first: 5% tier 5, 10% tier 4,
 * 15% tier 3, 25% tier 2 and the remaining 45% tier 1 (PLAN.md section 9
 * step 5, "height maps to score rank").
 *
 * A pure log curve on the rank put two thirds of a large repository into
 * tier 1 and left exactly two towers, which is a flat skyline with a spike in
 * it rather than a city. Rank quantiles give the same silhouette at every
 * repository size: a handful of towers, a visible mid-rise, a low majority.
 */
export const TIER_SHARES = { 5: 0.05, 4: 0.1, 3: 0.15, 2: 0.25, 1: 0.45 } as const;

/** A tier-share table: the city's above, or a settlement tier's (PLAN.md 76.5). */
export type TierShares = Readonly<Record<BuildingTier, number>>;

/** Cumulative share of the buildings at or above each tier, tallest first. */
function cumulative(shares: TierShares): [number, number, number, number] {
  return [
    shares[5],
    shares[5] + shares[4],
    shares[5] + shares[4] + shares[3],
    shares[5] + shares[4] + shares[3] + shares[2],
  ];
}

/**
 * Smallest tier 5 count. A city of twenty or more buildings always gets at
 * least two towers, so the eye has something to read a skyline against; below
 * that one is enough, and a single-building repository is all tower.
 */
function minTallest(total: number): number {
  if (total >= 20) return 2;
  return total >= 2 ? 1 : total;
}

/**
 * How many buildings sit at or above tiers 5, 4, 3 and 2, in that order.
 *
 * The quantiles are the target; two guards keep them honest on small repos.
 * Each cut has to clear the one above it, so no tier vanishes once the city is
 * big enough to fill it, and each tier has to be at least as populous as the
 * one above, so the counts always form a pyramid rather than an hourglass.
 */
export function tierCuts(
  total: number,
  shares: TierShares = TIER_SHARES,
): [number, number, number, number] {
  if (total <= 0) return [0, 0, 0, 0];
  const targets = cumulative(shares);
  const cuts: number[] = [];
  const minimums = [minTallest(total), 6, 10, 14];
  for (let i = 0; i < 4; i++) {
    const above = i === 0 ? 0 : cuts[i - 1];
    const gap = i === 0 ? minimums[0] : above + (total >= minimums[i] ? 1 : 0);
    // Pyramid: this tier holds at least as many as the one above it.
    const pyramid = i === 0 ? 0 : above + (above - (i >= 2 ? cuts[i - 2] : 0));
    cuts.push(Math.max(gap, pyramid, Math.round(targets[i] * total)));
  }
  // Clamp back down from the bottom so the cuts stay inside the city.
  cuts[3] = Math.min(cuts[3], total);
  for (let i = 2; i >= 0; i--) cuts[i] = Math.min(cuts[i], cuts[i + 1]);
  return cuts as [number, number, number, number];
}

/**
 * Tier from score rank (PLAN.md section 9 step 5). Rank 0 is the tallest.
 * Root landmark files are ranked separately: see `LANDMARK_TIER`.
 */
export function tierForRank(
  rank: number,
  total: number,
  shares: TierShares = TIER_SHARES,
): BuildingTier {
  if (total <= 1) return 5;
  const [c5, c4, c3, c2] = tierCuts(total, shares);
  if (rank < c5) return 5;
  if (rank < c4) return 4;
  if (rank < c3) return 3;
  if (rank < c2) return 2;
  return 1;
}

/**
 * Root landmark files stand on the civic plaza, not in a district, and they
 * score far above everything else because of the section 9 landmark bonus.
 * Ranking them with the rest handed the whole of tier 5 to a README and a
 * package.json; they get their own fixed heights instead, all below the town
 * hall's, so the plaza reads as civic architecture around a centrepiece.
 */
export const LANDMARK_TIER: Record<LandmarkFile, BuildingTier> = {
  manifest: 3,
  readme: 3,
  contributing: 2,
  changelog: 2,
  dockerfile: 2,
};

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
  const max = Math.max(1, Math.min(options.max ?? MAX_BUILDINGS, BUILDING_CAP));
  const min = Math.min(options.min ?? MIN_CANDIDATES, max);
  const shares = options.shares ?? TIER_SHARES;
  const blobs = blobsOf(entries);
  if (blobs.length === 0 || districts.length === 0) return [];

  const mentioned = readmePaths(options.readme);

  // Step 2: the finest granularity whose candidate count fits the cap. If a
  // coarser level would leave the city under-built, keep the finer set and let
  // the cap below trim it to `max` instead.
  let candidates: Candidate[] | null = null;
  let finer: Candidate[] | null = null;
  for (const level of GRANULARITY_LEVELS) {
    const set = buildCandidates(blobs, districts, level, mentioned);
    if (set.length <= max) {
      candidates = set.length < min && finer ? finer : set;
      break;
    }
    finer = set;
  }
  if (!candidates) candidates = finer ?? [];

  const selected = pickWithDistrictFloor(candidates, districts, max);
  selected.sort(byScore);

  // Rank the ordinary buildings among themselves: the landmark files carry a
  // +6 civic bonus that would otherwise buy them the whole of tier 5.
  const rankOf = new Map<Candidate, number>();
  let rank = 0;
  for (const candidate of selected) {
    if (candidate.landmark) continue;
    rankOf.set(candidate, rank);
    rank += 1;
  }
  const ranked = rank;

  const width = Math.max(3, String(selected.length).length);
  return selected.map((candidate, index) => ({
    id: `b-${String(index + 1).padStart(width, "0")}`,
    path: candidate.path,
    kind: candidate.kind,
    districtId: candidate.districtId,
    score: round(candidate.score, 2),
    tier: candidate.landmark
      ? LANDMARK_TIER[candidate.landmark]
      : tierForRank(rankOf.get(candidate) ?? 0, ranked, shares),
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
