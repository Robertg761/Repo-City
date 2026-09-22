/**
 * Settlement classification (PLAN.md section 76.4). Pure: no clock, no I/O.
 *
 * Codebase size sets the base tier. Activity can raise it one step, and only
 * when the repository already sits in the upper third of its band. Activity
 * never lowers a tier, and an archived repository is never promoted: a huge
 * abandoned repository is a big quiet city, and a tiny busy one is a lively
 * village.
 *
 * Every number the rules read lives in `SETTLEMENT_THRESHOLDS`, so tuning the
 * classification (S2, integration step I) touches nothing else.
 */

import type { RepoMetrics, SettlementPlan, SettlementTier } from "@/types/analysis";
import type { RepositorySnapshot } from "@/types/repository";

/** Tiers from smallest to largest; promotion is one step along this list. */
export const SETTLEMENT_TIERS: readonly SettlementTier[] = ["village", "town", "city", "metropolis"];

interface PromotionRule {
  /** "Upper third of the band": the next tier's threshold divided by three. */
  minFootprint: number;
  commitsLast90d: number;
  activeContributors90d: number;
}

export interface SettlementThresholds {
  /**
   * Base tier by footprint (`files + 2 * dirs`): a repository is the first
   * tier whose `below` it is under, and a metropolis past the last one.
   */
  base: { village: number; town: number; city: number };
  /** One step up from the keyed tier. A metropolis has nowhere to go. */
  promotion: Record<Exclude<SettlementTier, "metropolis">, PromotionRule>;
  /** Promotion also needs a push this recent. */
  maxPushAgeDays: number;
}

export const SETTLEMENT_THRESHOLDS: SettlementThresholds = {
  base: { village: 120, town: 600, city: 10_000 },
  promotion: {
    village: { minFootprint: 40, commitsLast90d: 30, activeContributors90d: 4 },
    town: { minFootprint: 200, commitsLast90d: 60, activeContributors90d: 12 },
    // `commitsLast90d` saturates at 100 (one page of commits), so 90 here
    // means "saturated" in practice.
    city: { minFootprint: 3_334, commitsLast90d: 90, activeContributors90d: 20 },
  },
  maxPushAgeDays: 30,
};

export interface SettlementInput {
  /** Files that passed the exclusions, ideally counted before any cap. */
  files: number;
  /** Directories, counted the same way. */
  dirs: number;
  /**
   * The counts are a floor: the tree was capped or truncated before they were
   * taken. Changes the wording of the reason, never the thresholds.
   */
  lowerBound?: boolean;
  /**
   * A better floor for the footprint than `files + 2 * dirs`, when a capped
   * survey still knows roughly how much it left out. Implies `lowerBound`.
   */
  footprintFloor?: number;
  /** GitHub itself truncated the listing: a metropolis whatever the counts. */
  githubTruncated?: boolean;
  archived: boolean;
  commitsLast90d: number;
  activeContributors90d: number;
  lastPushDaysAgo: number;
}

const fmt = (n: number): string => Math.round(n).toLocaleString("en-US");

const plural = (n: number, one: string, many: string): string =>
  `${fmt(n)} ${n === 1 ? one : many}`;

const article = (tier: SettlementTier): string => `a ${tier}`;

/** Base tier from the footprint alone. */
export function baseTierFor(
  footprint: number,
  githubTruncated = false,
  thresholds: SettlementThresholds = SETTLEMENT_THRESHOLDS,
): SettlementTier {
  if (githubTruncated) return "metropolis";
  if (footprint < thresholds.base.village) return "village";
  if (footprint < thresholds.base.town) return "town";
  if (footprint < thresholds.base.city) return "city";
  return "metropolis";
}

/** The next tier up, or null for a metropolis. */
export function nextTier(tier: SettlementTier): Exclude<SettlementTier, "village"> | null {
  const index = SETTLEMENT_TIERS.indexOf(tier);
  const next = SETTLEMENT_TIERS[index + 1];
  return (next as Exclude<SettlementTier, "village"> | undefined) ?? null;
}

/**
 * Whether the activity alone clears the promotion bar of `tier`, ignoring
 * size and archiving. A metropolis is measured against the city's bar, the
 * busiest one there is.
 */
function isBusy(input: SettlementInput, tier: SettlementTier, thresholds: SettlementThresholds): boolean {
  const rule = thresholds.promotion[tier === "metropolis" ? "city" : tier];
  return (
    input.lastPushDaysAgo <= thresholds.maxPushAgeDays &&
    input.commitsLast90d >= rule.commitsLast90d &&
    input.activeContributors90d >= rule.activeContributors90d
  );
}

export function classifySettlement(
  input: SettlementInput,
  thresholds: SettlementThresholds = SETTLEMENT_THRESHOLDS,
): SettlementPlan {
  const files = Math.max(0, Math.round(input.files));
  const dirs = Math.max(0, Math.round(input.dirs));
  const counted = files + 2 * dirs;
  const footprint = Math.max(counted, Math.round(input.footprintFloor ?? 0));
  const githubTruncated = input.githubTruncated === true;
  const lowerBound = input.lowerBound === true || githubTruncated || footprint > counted;

  const baseTier = baseTierFor(footprint, githubTruncated, thresholds);
  const busy = isBusy(input, baseTier, thresholds);

  let tier = baseTier;
  let blockedBySize: number | null = null;
  if (baseTier !== "metropolis" && !input.archived && busy) {
    const rule = thresholds.promotion[baseTier];
    if (footprint >= rule.minFootprint) {
      tier = nextTier(baseTier) ?? baseTier;
    } else {
      blockedBySize = rule.minFootprint;
    }
  }
  const promoted = tier !== baseTier;

  const activity = {
    commitsLast90d: input.commitsLast90d,
    activeContributors90d: input.activeContributors90d,
    busy,
  };

  return {
    tier,
    baseTier,
    promoted,
    footprint,
    files,
    dirs,
    lowerBound,
    activity,
    reason: settlementReason({
      tier,
      baseTier,
      promoted,
      footprint,
      files,
      dirs,
      lowerBound,
      githubTruncated,
      archived: input.archived,
      busy,
      blockedBySize,
      commitsLast90d: input.commitsLast90d,
      activeContributors90d: input.activeContributors90d,
    }),
  };
}

interface ReasonFacts {
  tier: SettlementTier;
  baseTier: SettlementTier;
  promoted: boolean;
  footprint: number;
  files: number;
  dirs: number;
  lowerBound: boolean;
  githubTruncated: boolean;
  archived: boolean;
  busy: boolean;
  /** The footprint promotion needed, when activity alone would have promoted. */
  blockedBySize: number | null;
  commitsLast90d: number;
  activeContributors90d: number;
}

/**
 * The inspector and HUD sentence. Generated from the rule that matched, never
 * free-form (PLAN.md section 12), for example:
 *
 *   "18 files in 1 folder make a village. It is busy, but a village stays a
 *    village until it has 40 files and folders."
 *   "2,922 files in 516 folders make a city. 100 commits from 32 people in the
 *    last 90 days raise it to a metropolis."
 */
export function settlementReason(facts: ReasonFacts): string {
  const { baseTier } = facts;
  const counts =
    facts.dirs > 0
      ? `${plural(facts.files, "file", "files")} in ${plural(facts.dirs, "folder", "folders")}`
      : `${plural(facts.files, "file", "files")} at the root`;
  const verb = facts.files === 1 && facts.dirs === 0 ? "makes" : "make";

  let sentence: string;
  if (facts.githubTruncated) {
    sentence = `The file tree is too large for GitHub to list in full, which makes ${article(baseTier)}.`;
  } else if (facts.footprint > facts.files + 2 * facts.dirs) {
    sentence =
      `The survey stopped at ${counts}, but the full tree holds at least ` +
      `${fmt(facts.footprint)} files and folders, which makes ${article(baseTier)}.`;
  } else if (facts.lowerBound) {
    sentence = `At least ${counts} make ${article(baseTier)}.`;
  } else {
    sentence = `${counts} ${verb} ${article(baseTier)}.`;
  }
  sentence = sentence.charAt(0).toUpperCase() + sentence.slice(1);

  const people = plural(facts.activeContributors90d, "person", "people");
  const commits = plural(facts.commitsLast90d, "commit", "commits");

  if (facts.promoted) {
    return `${sentence} ${commits} from ${people} in the last 90 days raise it to ${article(facts.tier)}.`;
  }
  if (facts.archived && baseTier !== "metropolis") {
    return `${sentence} The repository is archived, so it stays ${article(baseTier)}.`;
  }
  if (facts.blockedBySize !== null) {
    return (
      `${sentence} It is busy, but ${article(baseTier)} stays ${article(baseTier)} ` +
      `until it has ${fmt(facts.blockedBySize)} files and folders.`
    );
  }
  return sentence;
}

/**
 * The classifier's input from a live snapshot and its metrics.
 *
 * Prefers the uncapped `tree.totalFiles` / `tree.totalDirs` when ingestion
 * provides them (S1). Until then it uses what the snapshot holds after the
 * 5,000-entry cap, and when the tree was capped it floors the footprint at
 * `tree.totalEntries`, which counts every entry that survived the exclusions
 * and the depth cap (each at weight one, so it is still an underestimate).
 */
export function settlementInputFor(
  snapshot: RepositorySnapshot,
  metrics: Pick<RepoMetrics, "scale" | "activity" | "archived">,
): SettlementInput {
  const { tree } = snapshot;
  const surveyedDirs = tree.entries.filter((entry) => entry.type === "tree").length;
  const hasTotals = tree.totalFiles !== undefined && tree.totalDirs !== undefined;
  const githubTruncated = tree.githubTruncated === true;
  const capped = !hasTotals && tree.truncated;

  return {
    files: hasTotals
      ? tree.totalFiles!
      : (metrics.scale.surveyedFiles ?? metrics.scale.files),
    dirs: hasTotals ? tree.totalDirs! : Math.max(metrics.scale.dirs, surveyedDirs),
    lowerBound: githubTruncated || capped,
    footprintFloor: capped ? tree.totalEntries : undefined,
    githubTruncated,
    archived: metrics.archived,
    commitsLast90d: metrics.activity.commitsLast90d,
    activeContributors90d: metrics.activity.activeContributors90d,
    lastPushDaysAgo: metrics.activity.lastPushDaysAgo,
  };
}
