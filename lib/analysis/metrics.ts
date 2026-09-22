/**
 * Deterministic repository metrics (PLAN.md sections 7, 11, 13, 17 to 22).
 *
 * This module answers factual questions only: how big, how recent, which issues
 * matter, which pull requests are live, how often releases ship. It never makes
 * a quality judgement — that is `scoring.ts` — and it never invents a reason
 * string: every `reason` here is generated from the rule that matched.
 *
 * Determinism: the clock is an argument (`options.now`), never `Date.now()`.
 */

import type {
  DistrictPlan,
  IncidentState,
  RankedIssue,
  RankedPull,
  RepoMetrics,
} from "@/types/analysis";
import type { IssueSummary, PullSummary, RepositorySnapshot, TreeEntry } from "@/types/repository";
import { detectCi, detectDocs, detectTests, detectTooling } from "./detect";
import {
  BUG_LABEL,
  SEVERE_LABEL,
  heatOf,
  issueFormFor,
  pullForm,
  pullRelatedPath,
  relatedPathFor,
} from "./forms";
import {
  blobsOf,
  clamp,
  countLanguages,
  daysBetween,
  pruneTree,
  round,
  segments,
} from "./tree";

// Moved to `forms.ts` with the rest of the 76.7 placement rules.
export { relatedPathFor };

/**
 * The city tier's hero budget: PLAN.md section 11's "6 to 12 visible
 * incidents" and section 13's "up to 6 open plus up to 2 recently merged".
 * The server ranks more than this (`HERO_*` below); the generator slices the
 * ranked lists per tier, and these stay today's city numbers so a city-tier
 * repository draws exactly the heroes it drew before settlements.
 */
export const MAX_INCIDENTS = 12;
export const MAX_OPEN_CONSTRUCTION = 6;
export const MAX_COMPLETED_CONSTRUCTION = 2;

/**
 * PLAN.md 76.7: the ranked hero lists are sized for the largest tier, the
 * metropolis (16 incidents, 8 open plus 2 merged sites). Issues are in score
 * order, so the first 12 are today's. Pull requests are the top 6 open, then
 * the merged ones, then open heroes 7 and 8, so the first 8 are today's; a
 * tier takes `ranked.filter(open).slice(0, n)` plus the completed ones.
 */
export const HERO_ISSUES = 16;
export const HERO_OPEN_PULLS = 8;
export const HERO_MERGED_PULLS = 2;

/**
 * PLAN.md 76.1 decision 6: health reads the first 50 open pull requests by
 * update time, exactly the set the single `per_page=50` request returned
 * before ingestion started paging.
 */
export const HEALTH_SAMPLE_PULLS = 50;

/** 76.6: touched paths on the wire, per pull request, heroes and crowd alike. */
export const RANKED_FILES_MAX = 5;
/** A merged pull request older than this is not a "freshly finished building". */
const COMPLETED_WINDOW_DAYS = 90;

export interface MetricsOptions {
  /** Fixed clock for deterministic output. Defaults to `new Date()`. */
  now?: Date;
  /**
   * The snapshot tree with PLAN.md section 8's exclusions applied. Scale and
   * structure use it; the detectors deliberately read the raw tree instead, so
   * that `.github/`, `.eslintrc` and friends still count as evidence.
   * Defaults to `pruneTree(snapshot.tree.entries)`.
   */
  prunedEntries?: readonly TreeEntry[];
}

/** Everything `RepoMetrics` holds except the two judged fields. */
export type MetricsCore = Omit<RepoMetrics, "health" | "confidence">;

/** Deterministic structure inputs for the organization sub-score (section 23). */
export interface StructureMetrics {
  rootFileCount: number;
  topLevelDirs: number;
  /** Normalized entropy of the top-level file distribution, 0..1. */
  balance: number;
  /** 0..1, the deterministic half of `organization`. */
  structure: number;
}

export interface MetricsResult {
  core: MetricsCore;
  structure: StructureMetrics;
}

/* ------------------------------------------------------------------- scale */

function computeScale(
  entries: readonly TreeEntry[],
  surveyed: readonly TreeEntry[],
): RepoMetrics["scale"] {
  const blobs = blobsOf(entries);
  const dirs = entries.filter((e) => e.type === "tree").length;
  const files = blobs.length;
  const tier =
    files < 50 ? "tiny" : files < 300 ? "small" : files < 2000 ? "medium" : files < 10_000 ? "large" : "huge";
  // What the ingestion layer listed, before this layer dropped dot-directories,
  // lockfiles, binaries and anything past the depth cap. The two numbers are
  // both true and must never be shown under one label (QA-2026-09-21 bug 2).
  const surveyedFiles = Math.max(files, blobsOf(surveyed).length);
  return { files, dirs, languages: countLanguages(blobs), tier, surveyedFiles };
}

/* ---------------------------------------------------------------- activity */

function computeActivity(
  snapshot: RepositorySnapshot,
  now: Date,
): RepoMetrics["activity"] {
  const commits30 = snapshot.commits.filter((c) => daysBetween(c.date, now) <= 30);
  const commits90 = snapshot.commits.filter((c) => daysBetween(c.date, now) <= 90);
  const authors = new Set(
    commits90.map((c) => c.authorLogin).filter((login): login is string => Boolean(login)),
  );
  const lastPushDaysAgo = Math.floor(daysBetween(snapshot.repo.pushedAt, now));
  const ageDays = daysBetween(snapshot.repo.createdAt, now);

  const recency = recencyScore(lastPushDaysAgo);
  // 100 commits in 90 days saturates the volume term.
  const volume = clamp(Math.log2(commits90.length + 1) / Math.log2(101));
  let score = 0.6 * recency + 0.4 * volume;

  // PLAN.md section 18: "Low recent commit activity should not automatically
  // produce decay. A stable mature project might simply be quiet." An
  // established repository that is still reachable keeps a floor.
  if (!snapshot.repo.archived && ageDays > 365 && lastPushDaysAgo <= 365) {
    score = Math.max(score, 0.35);
  }

  return {
    commitsLast30d: commits30.length,
    commitsLast90d: commits90.length,
    activeContributors90d: authors.size,
    lastPushDaysAgo,
    score: round(clamp(score), 3),
    // The contributor list is one page of the API and can fail on its own
    // (PLAN.md section 29), in which case it is simply absent.
    contributors: snapshot.contributors.length,
  };
}

/** PLAN.md section 23: pushed within 30d = 1, 90d = 0.7, 365d = 0.4, older = 0.15. */
export function recencyScore(lastPushDaysAgo: number): number {
  if (lastPushDaysAgo <= 30) return 1;
  if (lastPushDaysAgo <= 90) return 0.7;
  if (lastPushDaysAgo <= 365) return 0.4;
  return 0.15;
}

/* ------------------------------------------------------------------ issues */

/** PLAN.md section 11. Exposed for tests and for the inspector's explanation. */
export function classifyIssue(
  issue: IssueSummary,
  now: Date,
): { score: number; state: IncidentState; ageDays: number; isBug: boolean; isSevere: boolean } {
  const labels = issue.labels.join(" ");
  const isBug = BUG_LABEL.test(labels);
  const isSevere = SEVERE_LABEL.test(labels);
  const ageDays = daysBetween(issue.createdAt, now);
  const score =
    3 * (isBug ? 1 : 0) +
    2 * (isSevere ? 1 : 0) +
    Math.log2(issue.comments + 1) +
    Math.min(ageDays, 365) / 120;

  let state: IncidentState;
  if (isBug && isSevere && issue.comments >= 10) state = "major";
  else if (isBug && ageDays > 180) state = "stale";
  else if (isBug) state = "collision";
  else state = "minor";

  return { score: round(score, 2), state, ageDays, isBug, isSevere };
}

/**
 * The inspector's "WHY THIS EXISTS" sentence (PLAN.md section 12). Generated
 * from the matched rule; never free-form, never model-written.
 */
function issueReason(
  state: IncidentState,
  ageDays: number,
  isSevere: boolean,
  comments: number,
): string {
  // Separated, because this sentence sits directly under a facts list that
  // formats the same number with `toLocaleString` (QA-2026-09-21 bug 6).
  const days = Math.floor(ageDays).toLocaleString("en-US");
  switch (state) {
    case "major":
      return "An unresolved bug carrying a high-severity label with heavy discussion activity.";
    case "stale":
      return `An unresolved bug that has stayed open for ${days} days.`;
    case "collision":
      return isSevere
        ? "An unresolved bug carrying a high-severity label."
        : comments > 0
          ? "An unresolved bug with ongoing discussion but no severity label."
          : "An unresolved bug with no severity label and no discussion yet.";
    default:
      return comments >= 5
        ? "An open issue with no bug label, kept visible by its discussion activity."
        : "An open issue with no bug label: routine maintenance work.";
  }
}

/**
 * An issue with its severity, form, heat and related path: a hero. Heroes keep
 * `bodyExcerpt`; the compact backlog drops it (`backlog.ts`).
 */
export function toRankedIssue(
  issue: IssueSummary,
  districts: readonly DistrictPlan[],
  now: Date,
): RankedIssue {
  const { score, state, ageDays, isSevere } = classifyIssue(issue, now);
  return {
    ...issue,
    score,
    state,
    reason: issueReason(state, ageDays, isSevere, issue.comments),
    relatedPath: relatedPathFor(issue, districts),
    form: issueFormFor(issue, state, now),
    heat: heatOf(issue.comments, issue.reactions ?? 0),
  };
}

/** Significance order: score descending, then number ascending. */
export function bySignificance(
  a: { score: number; number: number },
  b: { score: number; number: number },
): number {
  return b.score - a.score || a.number - b.number;
}

/** Most recently updated first; number descending breaks ties. */
export function byRecency(
  a: { updatedAt: string; number: number },
  b: { updatedAt: string; number: number },
): number {
  return (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0) || b.number - a.number;
}

/**
 * Heroes and the health sample. Both read `snapshot.issues` only, the
 * comment-sorted first page (76.6 request A1). `issueBacklog` never reaches
 * this function, which is half of what keeps health invariant (76.1
 * decision 6).
 */
function computeIssues(
  snapshot: RepositorySnapshot,
  districts: readonly DistrictPlan[],
  now: Date,
): RepoMetrics["issues"] {
  const open = snapshot.issues;
  const ranked: RankedIssue[] = open
    .map((issue) => ({ issue, number: issue.number, score: classifyIssue(issue, now).score }))
    .sort(bySignificance)
    .slice(0, HERO_ISSUES)
    .map(({ issue }) => toRankedIssue(issue, districts, now));

  const stale = open.filter((issue) => daysBetween(issue.updatedAt, now) >= 180).length;
  return {
    open: open.length,
    ranked,
    staleShare: open.length === 0 ? 0 : round(stale / open.length, 3),
  };
}

/* ------------------------------------------------------------------- pulls */

/** PLAN.md section 13. Exposed for tests. */
export function classifyPull(
  pull: PullSummary,
  now: Date,
): { state: RankedPull["state"]; score: number; daysSinceUpdate: number } {
  const daysSinceUpdate = daysBetween(pull.updatedAt, now);
  const merged = pull.mergedAt !== null;
  let state: RankedPull["state"];
  if (merged) state = "completed";
  else if (daysSinceUpdate <= 14) state = "active";
  else if (daysSinceUpdate >= 60) state = "abandoned";
  else state = "slow";

  // Rank open pull requests by recency of update and comment count.
  const score = round(Math.log2(pull.comments + 1) + 3 * clamp(1 - daysSinceUpdate / 90), 2);
  return { state, score, daysSinceUpdate };
}

function pullReason(state: RankedPull["state"], days: number, draft: boolean): string {
  const value = Math.floor(days);
  const whole = value.toLocaleString("en-US");
  switch (state) {
    case "completed":
      return `Merged ${whole} day${value === 1 ? "" : "s"} ago: a newly finished building.`;
    case "active": {
      // "updated 0 days ago" is how a machine says "updated today".
      const when = value === 0 ? "today" : `${whole} day${value === 1 ? "" : "s"} ago`;
      return draft
        ? `An open draft pull request updated ${when}.`
        : `An open pull request updated ${when}: active construction.`;
    }
    case "abandoned":
      return `An open pull request untouched for ${whole} days: construction has stopped.`;
    default:
      return `An open pull request last updated ${whole} days ago: construction is slow.`;
  }
}

/**
 * `RankedPull` is `Omit<PullSummary, "state">` plus a `ConstructionState`, so
 * the raw `open | merged | closed` field is dropped here on purpose: the
 * construction state carries it ("completed" means merged, anything else open).
 *
 * `form` on an open pull request is its crowd form (`van`, `hoarding`,
 * `trench` or `scaffold`), because the generator demotes the heroes past a
 * tier's budget to the crowd; a hero it keeps is drawn as the crane `site`
 * whatever its form. A merged pull request is only ever a hero: `site`.
 */
export function toRankedPull(
  pull: PullSummary,
  districts: readonly DistrictPlan[],
  now: Date,
): RankedPull {
  const { state, score, daysSinceUpdate } = classifyPull(pull, now);
  const days =
    state === "completed" && pull.mergedAt ? daysBetween(pull.mergedAt, now) : daysSinceUpdate;
  const files = pull.files ?? [];
  const ranked: RankedPull = {
    number: pull.number,
    title: pull.title,
    url: pull.url,
    createdAt: pull.createdAt,
    updatedAt: pull.updatedAt,
    mergedAt: pull.mergedAt,
    draft: pull.draft,
    comments: pull.comments,
    labels: pull.labels,
    author: pull.author,
    score,
    state,
    reason: pullReason(state, days, pull.draft),
    form:
      state === "completed"
        ? "site"
        : pullForm({ author: pull.author, labels: pull.labels, draft: pull.draft, files }),
    relatedPath: pullRelatedPath({ title: pull.title, files }, districts),
    heat: heatOf(pull.comments, pull.reactions ?? 0),
  };
  // Enrichment travels only when ingestion supplied it, so an analysis of an
  // older snapshot keeps exactly its old keys.
  if (pull.reactions !== undefined) ranked.reactions = pull.reactions;
  if (pull.review !== undefined) ranked.review = pull.review;
  if (pull.checks !== undefined) ranked.checks = pull.checks;
  if (pull.files !== undefined) ranked.files = pull.files.slice(0, RANKED_FILES_MAX);
  if (pull.changedFiles !== undefined) ranked.changedFiles = pull.changedFiles;
  return ranked;
}

/** Open pull requests in the snapshot, one per number, in snapshot order. */
export function openPullsOf(snapshot: RepositorySnapshot): PullSummary[] {
  const seen = new Set<number>();
  const out: PullSummary[] = [];
  for (const pull of snapshot.pulls) {
    if (pull.mergedAt !== null || pull.state !== "open" || seen.has(pull.number)) continue;
    seen.add(pull.number);
    out.push(pull);
  }
  return out;
}

/**
 * The health sample: the first `HEALTH_SAMPLE_PULLS` open pull requests by
 * update time (76.1 decision 6). Ingestion now lists up to 500; health keeps
 * reading the 50 the old single request returned.
 */
export function pullHealthSample(snapshot: RepositorySnapshot): PullSummary[] {
  return openPullsOf(snapshot).sort(byRecency).slice(0, HEALTH_SAMPLE_PULLS);
}

function computePulls(
  snapshot: RepositorySnapshot,
  districts: readonly DistrictPlan[],
  now: Date,
): RepoMetrics["pulls"] {
  const sample = pullHealthSample(snapshot);
  const merged = snapshot.pulls.filter((p) => p.mergedAt !== null);

  // Heroes rank every open pull request surveyed, not only the health sample.
  const rankedOpen = openPullsOf(snapshot)
    .map((pull) => ({ pull, number: pull.number, score: classifyPull(pull, now).score }))
    .sort(bySignificance)
    .slice(0, HERO_OPEN_PULLS)
    .map(({ pull }) => toRankedPull(pull, districts, now));

  const rankedMerged = merged
    .filter((pull) => pull.mergedAt !== null && daysBetween(pull.mergedAt, now) <= COMPLETED_WINDOW_DAYS)
    .sort((a, b) => Date.parse(b.mergedAt ?? "") - Date.parse(a.mergedAt ?? ""))
    .slice(0, HERO_MERGED_PULLS)
    .map((pull) => toRankedPull(pull, districts, now));

  const stale = sample.filter((pull) => daysBetween(pull.updatedAt, now) >= 60).length;
  return {
    open: sample.length,
    // Today's city heroes first (6 open, then 2 merged), then the extra open
    // heroes a metropolis draws. A generator that slices the first 8 gets
    // exactly the pre-settlement city; a tier-aware one splits by state.
    ranked: [
      ...rankedOpen.slice(0, MAX_OPEN_CONSTRUCTION),
      ...rankedMerged,
      ...rankedOpen.slice(MAX_OPEN_CONSTRUCTION),
    ],
    staleShare: sample.length === 0 ? 0 : round(stale / sample.length, 3),
  };
}

/* ---------------------------------------------------------------- releases */

function computeReleases(snapshot: RepositorySnapshot, now: Date): RepoMetrics["releases"] {
  const published = snapshot.releases
    .filter((r) => Boolean(r.publishedAt))
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  if (published.length === 0) {
    // PLAN.md section 20: not using GitHub Releases is not a fault.
    return { count: 0, lastDaysAgo: null, cadence: "none", lastTag: null, lastPublishedAt: null, lastUrl: null };
  }
  const latest = published[0];
  const lastDaysAgo = Math.floor(daysBetween(latest.publishedAt, now));
  const cadence =
    lastDaysAgo <= 60 || (published.length >= 3 && lastDaysAgo <= 120) ? "active" : "occasional";
  // The tag and its date name the last train that arrived, which is what the
  // station's inspector shows (PLAN.md section 20).
  return {
    count: published.length,
    lastDaysAgo,
    cadence,
    lastTag: latest.tag || null,
    lastPublishedAt: latest.publishedAt,
    lastUrl: latest.url || null,
  };
}

/* --------------------------------------------------------------- structure */

/** PLAN.md section 23's deterministic half of `organization`. */
export function computeStructure(
  entries: readonly TreeEntry[],
): StructureMetrics {
  const blobs = blobsOf(entries);
  const rootFileCount = blobs.filter((b) => segments(b.path).length === 1).length;

  const counts = new Map<string, number>();
  for (const blob of blobs) {
    const parts = segments(blob.path);
    if (parts.length < 2) continue;
    counts.set(parts[0], (counts.get(parts[0]) ?? 0) + 1);
  }

  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  const k = counts.size;
  let balance = 1;
  if (k > 1 && total > 0) {
    let entropy = 0;
    for (const count of counts.values()) {
      const p = count / total;
      entropy -= p * Math.log(p);
    }
    balance = clamp(entropy / Math.log(k));
  }

  const rootTerm = 1 - clamp((rootFileCount - 12) / 40);
  return {
    rootFileCount,
    topLevelDirs: k,
    balance: round(balance, 3),
    structure: round(clamp((rootTerm + balance) / 2), 3),
  };
}

/* ----------------------------------------------------------------- compute */

/**
 * Computes every deterministic metric. `districts` is used only to resolve
 * issue `relatedPath`s.
 */
export function computeMetrics(
  snapshot: RepositorySnapshot,
  districts: readonly DistrictPlan[],
  options: MetricsOptions = {},
): MetricsResult {
  const now = options.now ?? new Date();
  const pruned = options.prunedEntries ?? pruneTree(snapshot.tree.entries);

  const core: MetricsCore = {
    scale: computeScale(pruned, snapshot.tree.entries),
    activity: computeActivity(snapshot, now),
    issues: computeIssues(snapshot, districts, now),
    pulls: computePulls(snapshot, districts, now),
    ci: detectCi(snapshot),
    tests: detectTests(snapshot),
    docs: detectDocs(snapshot),
    tooling: detectTooling(snapshot),
    releases: computeReleases(snapshot, now),
    archived: snapshot.repo.archived,
  };

  return { core, structure: computeStructure(pruned) };
}
