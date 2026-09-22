/**
 * DATA layer types (PLAN.md section 71.1). Server only.
 *
 * These describe the normalized snapshot produced by `lib/github/snapshot.ts`
 * after the raw GitHub responses in `types/github.ts` have been pruned and
 * flattened. The renderer must never see anything from this file; it crosses
 * only as far as `lib/analysis`.
 *
 * Binding contract: field names may be added, never renamed.
 */

export interface RepositorySnapshot {
  repo: {
    owner: string;
    name: string;
    fullName: string;
    url: string;
    description: string | null;
    defaultBranch: string;
    headSha: string;
    stars: number;
    forks: number;
    openIssuesCount: number;
    archived: boolean;
    isFork: boolean;
    createdAt: string;
    pushedAt: string;
    license: string | null;
    primaryLanguage: string | null;
    topics: string[];
  };
  /** Pruned tree: exclusions from PLAN.md section 8 applied before storing. */
  tree: {
    truncated: boolean;
    totalEntries: number;
    entries: TreeEntry[];
    /** Blobs that passed the exclusions, counted BEFORE the depth cap and the 5,000-entry cap. */
    totalFiles?: number;
    /** Directories that passed the exclusions, counted the same way. */
    totalDirs?: number;
    /** GitHub itself truncated the recursive listing (100,000 entries or 7 MB). */
    githubTruncated?: boolean;
  };
  commits: { sha: string; date: string; authorLogin: string | null; message: string }[];
  issues: IssueSummary[];
  pulls: PullSummary[];
  contributors: { login: string; contributions: number }[];
  workflows: { id: number; name: string; path: string; state: string }[];
  workflowRuns: {
    id: number;
    workflowId: number;
    name: string;
    status: string;
    conclusion: string | null;
    createdAt: string;
    url: string;
  }[];
  releases: { tag: string; name: string | null; publishedAt: string; url: string }[];
  /** README and manifests only; each entry at most 8 KB of decoded text. */
  files: { path: string; content: string }[];
  fetchedAt: string;
  requestCount: number;
  warnings: string[];
  /**
   * Open issues beyond `issues`, most recently updated first. Never repeats a
   * number from `issues`, which stays the comment-sorted health sample
   * (PLAN.md section 76.3).
   */
  issueBacklog?: IssueSummary[];
  /** Real open totals for the overflow queue. */
  openTotals?: OpenTotals;
  /** How far the survey got before a budget ran out. */
  coverage?: SurveyCoverage;
}

/** PLAN.md section 76.3: the repository's real open issue and PR counts. */
export interface OpenTotals {
  issues: number;
  pulls: number;
  /** False when estimated from `open_issues_count` minus a PR count. */
  exact: boolean;
  source: "graphql" | "rest-link" | "estimate";
}

/** PLAN.md section 76.3: how much of the issue and PR survey landed in time. */
export interface SurveyCoverage {
  issuePages: { planned: number; received: number };
  pullPages: { planned: number; received: number };
  enrichment: "complete" | "partial" | "skipped";
  stoppedBy: "deadline" | "rate-limit" | "error" | null;
}

export interface TreeEntry {
  path: string;
  type: "blob" | "tree";
  size?: number;
}

export interface IssueSummary {
  number: number;
  title: string;
  url: string;
  createdAt: string;
  updatedAt: string;
  comments: number;
  labels: string[];
  author: string | null;
  bodyExcerpt: string;
  /** `reactions.total_count` from the REST issue object. */
  reactions?: number;
  assignees?: number;
  milestone?: string | null;
}

export interface PullSummary {
  number: number;
  title: string;
  url: string;
  createdAt: string;
  updatedAt: string;
  mergedAt: string | null;
  draft: boolean;
  comments: number;
  labels: string[];
  author: string | null;
  state: "open" | "merged" | "closed";
  reactions?: number;
  requestedReviewers?: number;
  headSha?: string;
  /** GraphQL enrichment; null or absent when enrichment did not run. */
  review?: PullReview | null;
  checks?: PullChecks | null;
  /** Up to 8 touched paths, from GraphQL `files(first: 8)`. */
  files?: string[];
  changedFiles?: number;
}

export type PullReview = "approved" | "changes-requested" | "review-required";
export type PullChecks = "passing" | "failing" | "pending";

/** Convenience alias: the repo header block reused by `RepoAnalysis`. */
export type RepositoryMeta = RepositorySnapshot["repo"];
