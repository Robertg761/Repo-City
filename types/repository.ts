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
  tree: { truncated: boolean; totalEntries: number; entries: TreeEntry[] };
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
}

/** Convenience alias: the repo header block reused by `RepoAnalysis`. */
export type RepositoryMeta = RepositorySnapshot["repo"];
