/**
 * Synthetic survey data for the settlement-era snapshot fields (PLAN.md 76.3):
 * `issueBacklog`, `openTotals`, `coverage`, and the GraphQL enrichment on
 * pull requests (`reactions`, `review`, `checks`, `files`).
 *
 * S1 builds the real ingestion in parallel; until it lands, these stand in
 * for what a giant repository's survey returns. Fully deterministic: no clock
 * of its own (every date is relative to the `now` passed in) and no PRNG.
 */

import type {
  IssueSummary,
  PullChecks,
  PullReview,
  PullSummary,
  RepositorySnapshot,
} from "@/types/repository";
import { daysBefore } from "./helpers";

/** A stable integer mix, so every field varies without a random source. */
export function mix(n: number): number {
  let h = n >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  h = Math.imul(h, 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

const pick = <T>(list: readonly T[], n: number): T => list[mix(n) % list.length];

const LABEL_SETS: string[][] = [
  ["bug"],
  ["bug", "p1"],
  ["bug", "needs-repro"],
  ["security"],
  ["enhancement"],
  ["feature request"],
  ["question"],
  ["documentation"],
  ["good first issue", "help wanted"],
  ["blocked"],
  [],
  ["typo"],
];

const PULL_LABEL_SETS: string[][] = [
  [],
  ["enhancement"],
  ["bug"],
  ["dependencies"],
  ["ci"],
  ["refactor"],
  ["documentation"],
];

const AUTHORS = ["mara-quinn", "devon-oyelaran", "sasha-lindqvist", "kenji-moreau", "dependabot[bot]"];

export interface SyntheticOptions {
  now: Date;
  /** First issue or pull request number; numbers count down from here. */
  start: number;
  /** Directories that bodies and touched files mention. */
  dirs: readonly string[];
  /** Days since update of the most recent item; older items step back from it. */
  newestDays?: number;
  /** Oversized titles, labels and bodies, for the payload ceiling test. */
  long?: boolean;
}

/** `count` open issues, as `issueBacklog` holds them (76.6 A2 pages). */
export function syntheticIssues(count: number, options: SyntheticOptions): IssueSummary[] {
  const { now, start, dirs, long = false } = options;
  const newest = options.newestDays ?? 0;
  return Array.from({ length: count }, (_, i) => {
    const number = start - i;
    const dir = pick(dirs, number * 3 + 1);
    const labels = long
      ? Array.from({ length: 8 }, (_, k) => `${pick(LABEL_SETS, number + k)[0] ?? "area"}-${"x".repeat(40)}-${k}`)
      : pick(LABEL_SETS, number);
    const updated = newest + i * 0.5 + (mix(number) % 5);
    return {
      number,
      title: long
        ? `Issue ${number}: ${"a very long title that keeps going ".repeat(8)}`
        : `Issue ${number} in ${dir}`,
      url: `https://github.com/synthetic/giant/issues/${number}`,
      createdAt: daysBefore(now, updated + 30 + (mix(number + 7) % 400)),
      updatedAt: daysBefore(now, updated),
      comments: mix(number + 11) % 40,
      labels,
      author: pick(AUTHORS.slice(0, 4), number),
      bodyExcerpt: long
        ? `See ${dir}/module.ts. ${"Body text that the backlog must drop. ".repeat(8)}`.slice(0, 300)
        : `Seen in ${dir}/module.ts after the last release.`,
      reactions: mix(number + 13) % 25,
      assignees: mix(number + 17) % 3,
      milestone: number % 5 === 0 ? "v2.0" : null,
    };
  });
}

const REVIEWS: (PullReview | null)[] = ["approved", "changes-requested", "review-required", null];
const CHECKS: (PullChecks | null)[] = ["passing", "failing", "pending", null];

/** `count` open pull requests with GraphQL enrichment (76.6 wave C). */
export function syntheticPulls(count: number, options: SyntheticOptions): PullSummary[] {
  const { now, start, dirs, long = false } = options;
  const newest = options.newestDays ?? 0;
  return Array.from({ length: count }, (_, i) => {
    const number = start - i;
    const dir = pick(dirs, number * 5 + 3);
    const updated = newest + i * 0.4 + (mix(number) % 3);
    const fileCount = long ? 8 : 1 + (mix(number + 19) % 6);
    const files = Array.from({ length: fileCount }, (_, k) =>
      long
        ? `${dir}/${"deeply-nested-directory-name/".repeat(4)}file-${k}.ts`
        : k === 0 && number % 9 === 0
          ? `.github/workflows/ci-${k}.yml`
          : `${dir}/part-${k % 2}/file-${k}.ts`,
    );
    return {
      number,
      title: long
        ? `PR ${number}: ${"a very long pull request title that keeps going ".repeat(6)}`
        : `Change ${number} to ${dir}`,
      url: `https://github.com/synthetic/giant/pull/${number}`,
      createdAt: daysBefore(now, updated + 5 + (mix(number + 23) % 200)),
      updatedAt: daysBefore(now, updated),
      mergedAt: null,
      draft: number % 11 === 0,
      comments: mix(number + 29) % 30,
      labels: long
        ? Array.from({ length: 10 }, (_, k) => `label-${"y".repeat(40)}-${k}`)
        : pick(PULL_LABEL_SETS, number),
      author: pick(AUTHORS, number),
      state: "open",
      reactions: mix(number + 31) % 12,
      requestedReviewers: mix(number + 37) % 3,
      headSha: (mix(number) >>> 0).toString(16).padStart(40, "0"),
      review: pick(REVIEWS, number + 41),
      checks: pick(CHECKS, number + 43),
      files,
      changedFiles: fileCount + (mix(number + 47) % 20),
    };
  });
}

export interface BacklogOptions {
  now: Date;
  /** Extra open issues in `issueBacklog`. */
  issues: number;
  /** Extra open pull requests appended to `pulls`. */
  pulls: number;
  dirs: readonly string[];
  long?: boolean;
  /** Real totals; defaults to the surveyed counts plus 20,000 queued issues. */
  totals?: RepositorySnapshot["openTotals"];
}

/**
 * `snapshot` as the settlement-era ingestion would return it: the same health
 * sample, plus a bulk issue backlog, more open pull requests with enrichment,
 * real totals and coverage.
 */
export function withBacklog(snapshot: RepositorySnapshot, options: BacklogOptions): RepositorySnapshot {
  const issueStart = 100_000;
  const pullStart = 200_000;
  const issueBacklog = syntheticIssues(options.issues, {
    now: options.now,
    start: issueStart,
    dirs: options.dirs,
    long: options.long,
  });
  const extraPulls = syntheticPulls(options.pulls, {
    now: options.now,
    start: pullStart,
    dirs: options.dirs,
    long: options.long,
  });
  const openPulls = snapshot.pulls.filter((p) => p.state === "open").length + extraPulls.length;
  return {
    ...snapshot,
    issueBacklog,
    pulls: [...snapshot.pulls, ...extraPulls],
    openTotals: options.totals ?? {
      issues: snapshot.issues.length + issueBacklog.length + 20_000,
      pulls: openPulls,
      exact: true,
      source: "graphql",
    },
    coverage: {
      issuePages: { planned: 12, received: 12 },
      pullPages: { planned: 5, received: 5 },
      enrichment: "complete",
      stoppedBy: null,
    },
  };
}
