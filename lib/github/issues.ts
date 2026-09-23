/**
 * Open issues (PLAN.md sections 29 and 76.6).
 *
 * A1, the health sample, is today's request 4, unchanged:
 * `GET /repos/{o}/{r}/issues?state=open&sort=comments&direction=desc&per_page=100`.
 * Issues become the incidents of the city (PLAN.md section 11), so the most
 * discussed ones matter most — hence sorting by comments rather than by date.
 * Health and confidence read this sample and nothing else (section 76.1,
 * decision 6).
 *
 * A2 and A', the bulk pages, list open issues most recently updated first;
 * `lib/github/survey.ts` fetches them in parallel.
 *
 * The gotcha from section 29: this endpoint also returns pull requests. Every
 * item carrying a `pull_request` key is dropped from the issue list here, once,
 * so nothing downstream has to remember. Those items are not wasted, though:
 * their `comments` and `reactions` fill in what the pulls list endpoint does
 * not carry (`pullItemStats`).
 */

import type { GhIssue, GhLabel } from "@/types/github";
import type { IssueSummary } from "@/types/repository";
import { GitHubClient } from "./client.ts";
import { plainTextExcerpt } from "./markdown.ts";

/** PLAN.md section 71.1: issue bodies are summarized, never shipped whole. */
export const BODY_EXCERPT_LENGTH = 300;

/** A1's query, verbatim: the health sample must not move (section 76.1, decision 6). */
export const HEALTH_SAMPLE_QUERY = {
  state: "open",
  sort: "comments",
  direction: "desc",
  per_page: 100,
} as const;

/** A2's query; `page` is added per request. */
export const BULK_ISSUES_QUERY = {
  state: "open",
  sort: "updated",
  direction: "desc",
  per_page: 100,
} as const;

/** Discussion counts of a pull request as the issues endpoint reports it. */
export interface PullItemStats {
  comments: number;
  reactions: number | undefined;
}

export interface IssueSample {
  /** The health sample: issues only, comment order. */
  issues: IssueSummary[];
  /** Pull request items on the same page, by number. */
  pullItems: Map<number, PullItemStats>;
  /** Raw items on the page, issues and pull requests together. */
  rawCount: number;
  /** False when `Link` names a next page: the sample is not everything. */
  complete: boolean;
}

export function issuesPath(owner: string, repo: string): string {
  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues`;
}

/** A1: the health sample, plus what its page says about completeness. */
export async function fetchIssueSample(
  client: GitHubClient,
  owner: string,
  repo: string,
): Promise<IssueSample> {
  const page = await client.getPage<GhIssue>(issuesPath(owner, repo), {
    resource: "issues",
    query: { ...HEALTH_SAMPLE_QUERY },
  });
  return {
    issues: mapIssues(page.items),
    pullItems: pullItemStats(page.items),
    rawCount: page.items.length,
    complete: !page.hasNext,
  };
}

/** Drops pull requests, then maps what is left (PLAN.md section 29). */
export function mapIssues(raw: GhIssue[]): IssueSummary[] {
  const issues: IssueSummary[] = [];
  for (const item of raw) {
    const issue = mapIssue(item);
    if (issue) issues.push(issue);
  }
  return issues;
}

/** @returns `null` when the item is really a pull request. */
export function mapIssue(raw: GhIssue): IssueSummary | null {
  if (!raw || typeof raw.number !== "number") return null;
  if (raw.pull_request) return null;

  const issue: IssueSummary = {
    number: raw.number,
    title: raw.title ?? "",
    url: raw.html_url ?? "",
    createdAt: raw.created_at ?? "",
    updatedAt: raw.updated_at ?? raw.created_at ?? "",
    comments: raw.comments ?? 0,
    labels: mapLabels(raw.labels),
    author: raw.user?.login ?? null,
    bodyExcerpt: excerpt(raw.body),
  };

  // Section 76.3 additions. Only written when GitHub sent them, so a sparse
  // payload maps exactly as it always did.
  const reactions = raw.reactions?.total_count;
  if (typeof reactions === "number") issue.reactions = reactions;
  if (Array.isArray(raw.assignees)) issue.assignees = raw.assignees.length;
  if (raw.milestone !== undefined) {
    issue.milestone = typeof raw.milestone?.title === "string" ? raw.milestone.title : null;
  }
  return issue;
}

/**
 * Pull request items from issue pages, by number. The pulls list endpoint has
 * no `comments` and no `reactions`; the issue view of the same PR has both.
 */
export function pullItemStats(raw: GhIssue[], into = new Map<number, PullItemStats>()): Map<number, PullItemStats> {
  for (const item of raw) {
    if (!item || typeof item.number !== "number" || !item.pull_request) continue;
    if (into.has(item.number)) continue;
    const reactions = item.reactions?.total_count;
    into.set(item.number, {
      comments: typeof item.comments === "number" ? item.comments : 0,
      reactions: typeof reactions === "number" ? reactions : undefined,
    });
  }
  return into;
}

/** Labels arrive either as objects or, on some endpoints, as bare strings. */
export function mapLabels(labels: (GhLabel | string)[] | undefined): string[] {
  if (!Array.isArray(labels)) return [];
  return labels
    .map((label) => (typeof label === "string" ? label : label?.name))
    .filter((name): name is string => typeof name === "string" && name !== "");
}

/**
 * At most 300 characters of the body as plain text: markdown and HTML
 * stripped, whitespace collapsed, cut on a whole word, so the inspector gets
 * a readable line rather than a wall of markdown (PLAN.md section 12).
 */
export function excerpt(body: string | null | undefined): string {
  return plainTextExcerpt(body, BODY_EXCERPT_LENGTH);
}
