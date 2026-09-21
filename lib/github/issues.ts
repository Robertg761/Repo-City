/**
 * Request 4 of PLAN.md section 29:
 * `GET /repos/{o}/{r}/issues?state=open&sort=comments&direction=desc&per_page=100`.
 *
 * Issues become the incidents of the city (PLAN.md section 11), so the most
 * discussed ones matter most — hence sorting by comments rather than by date.
 *
 * The gotcha from section 29: this endpoint also returns pull requests. Every
 * item carrying a `pull_request` key is dropped here, once, so nothing
 * downstream has to remember.
 */

import type { GhIssue, GhLabel } from "@/types/github";
import type { IssueSummary } from "@/types/repository";
import { GitHubClient } from "./client.ts";

/** PLAN.md section 71.1: issue bodies are summarized, never shipped whole. */
export const BODY_EXCERPT_LENGTH = 300;

export async function fetchIssues(
  client: GitHubClient,
  owner: string,
  repo: string,
): Promise<IssueSummary[]> {
  const raw = await client.getList<GhIssue>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues`,
    {
      resource: "issues",
      query: { state: "open", sort: "comments", direction: "desc", per_page: 100 },
    },
  );

  return mapIssues(raw);
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

  return {
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
}

/** Labels arrive either as objects or, on some endpoints, as bare strings. */
export function mapLabels(labels: (GhLabel | string)[] | undefined): string[] {
  if (!Array.isArray(labels)) return [];
  return labels
    .map((label) => (typeof label === "string" ? label : label?.name))
    .filter((name): name is string => typeof name === "string" && name !== "");
}

/**
 * First 300 characters of the body, whitespace collapsed so the inspector gets
 * a readable line rather than a wall of markdown (PLAN.md section 12).
 */
export function excerpt(body: string | null | undefined): string {
  if (typeof body !== "string" || body === "") return "";
  const flattened = body.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
  return flattened.slice(0, BODY_EXCERPT_LENGTH);
}
