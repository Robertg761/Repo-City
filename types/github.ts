/**
 * Minimal shapes for the raw GitHub REST v3 responses listed in PLAN.md
 * section 29. These are deliberately partial: only the fields Repo City
 * actually reads are declared, so an unexpected extra field from GitHub is
 * never a type error.
 *
 * Used ONLY by `lib/github/*`. Everything downstream consumes
 * `types/repository.ts` instead.
 */

/** GET /repos/{owner}/{repo} */
export interface GhRepo {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  default_branch: string;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  archived: boolean;
  disabled: boolean;
  fork: boolean;
  created_at: string;
  updated_at: string;
  pushed_at: string;
  size: number;
  language: string | null;
  topics?: string[];
  owner: GhUser;
  license: { key: string; name: string; spdx_id: string | null } | null;
}

export interface GhUser {
  login: string;
  id: number;
  avatar_url: string;
  html_url: string;
  type: string;
}

/** GET /repos/{o}/{r}/git/trees/{ref}?recursive=1 */
export interface GhTreeResponse {
  sha: string;
  url: string;
  truncated: boolean;
  tree: GhTreeItem[];
}

export interface GhTreeItem {
  path: string;
  mode: string;
  type: "blob" | "tree" | "commit";
  sha: string;
  size?: number;
  url?: string;
}

/** GET /repos/{o}/{r}/commits */
export interface GhCommit {
  sha: string;
  html_url: string;
  commit: {
    message: string;
    author: { name: string; email: string; date: string } | null;
    committer: { name: string; email: string; date: string } | null;
  };
  author: GhUser | null;
  committer: GhUser | null;
}

export interface GhLabel {
  id: number;
  name: string;
  color: string;
  description: string | null;
}

/**
 * GET /repos/{o}/{r}/issues
 *
 * The issues endpoint also returns pull requests. Every item carrying a
 * `pull_request` key must be dropped (PLAN.md section 29).
 */
export interface GhIssue {
  number: number;
  title: string;
  html_url: string;
  state: "open" | "closed";
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  comments: number;
  labels: (GhLabel | string)[];
  user: GhUser | null;
  body: string | null;
  draft?: boolean;
  pull_request?: { url: string; html_url: string };
}

/** GET /repos/{o}/{r}/pulls */
export interface GhPull {
  number: number;
  title: string;
  html_url: string;
  state: "open" | "closed";
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  merged_at: string | null;
  draft: boolean;
  comments?: number;
  review_comments?: number;
  labels: (GhLabel | string)[];
  user: GhUser | null;
  head: { ref: string; sha: string };
  base: { ref: string; sha: string };
}

/** GET /repos/{o}/{r}/contributors — may answer 204/202 with no body. */
export interface GhContributor {
  login: string;
  id: number;
  type: string;
  contributions: number;
}

/** GET /repos/{o}/{r}/actions/workflows */
export interface GhWorkflowsResponse {
  total_count: number;
  workflows: GhWorkflow[];
}

export interface GhWorkflow {
  id: number;
  name: string;
  path: string;
  state: string;
  html_url: string;
}

/** GET /repos/{o}/{r}/actions/runs */
export interface GhWorkflowRunsResponse {
  total_count: number;
  workflow_runs: GhWorkflowRun[];
}

export interface GhWorkflowRun {
  id: number;
  name: string | null;
  workflow_id: number;
  head_branch: string | null;
  head_sha: string;
  status: string | null;
  conclusion: string | null;
  created_at: string;
  updated_at: string;
  html_url: string;
  event: string;
}

/** GET /repos/{o}/{r}/releases */
export interface GhRelease {
  id: number;
  tag_name: string;
  name: string | null;
  draft: boolean;
  prerelease: boolean;
  created_at: string;
  published_at: string | null;
  html_url: string;
}

/** GET /repos/{o}/{r}/readme and /contents/{path} for a single file. */
export interface GhContentFile {
  type: "file";
  name: string;
  path: string;
  sha: string;
  size: number;
  html_url: string;
  download_url: string | null;
  content: string;
  encoding: "base64" | "none";
}

/** Error body GitHub returns for 403/404/422. */
export interface GhErrorBody {
  message: string;
  documentation_url?: string;
  status?: string;
}
