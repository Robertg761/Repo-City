/**
 * The two GraphQL uses of PLAN.md section 76.6, and nothing else: exact open
 * totals in one call (A5), and per-PR review decision, CI rollup, discussion
 * counts and touched paths in aliased batches (wave C). REST can do neither
 * cheaply: totals need a `Link` trick per kind, and touched files would take
 * one request per pull request.
 *
 * Every query here costs 1 point (measured 2026-09-22), whatever its size.
 * What a batch really costs is GitHub's time, about 150 ms per pull request,
 * which is what GraphQL's secondary limit meters; see `budgets.ts`.
 */

import type { GhGraphPull, GhGraphTotals } from "@/types/github";
import type { PullChecks, PullReview } from "@/types/repository";
import { GitHubClient } from "./client.ts";

export interface GraphTotals {
  issues: number;
  pulls: number;
}

const TOTALS_QUERY = `query RepoCityTotals($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    issues(states: OPEN) { totalCount }
    pullRequests(states: OPEN) { totalCount }
  }
}`;

/** A5: exact open issue and pull request totals. Throws when GitHub will not say. */
export async function fetchGraphTotals(
  client: GitHubClient,
  owner: string,
  repo: string,
  signal?: AbortSignal,
): Promise<GraphTotals> {
  const { data } = await client.graphql<NonNullable<GhGraphTotals["data"]>>(
    TOTALS_QUERY,
    { owner, name: repo },
    { resource: "open totals", signal },
  );
  const repository = data?.repository;
  const issues = repository?.issues?.totalCount;
  const pulls = repository?.pullRequests?.totalCount;
  if (typeof issues !== "number" || typeof pulls !== "number") {
    throw new Error("open totals missing from GraphQL answer");
  }
  return { issues, pulls };
}

/** Fields read per pull request. Kept in one place so tests can assert the shape. */
export const PULL_FIELDS =
  "number reviewDecision comments { totalCount } reactions { totalCount } changedFiles " +
  "files(first: 8) { nodes { path } } " +
  "commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }";

/**
 * One aliased batch: `p123: pullRequest(number: 123) { ... }` per number.
 * Numbers are integers from GitHub's own REST answer, and are re-checked here,
 * so nothing user-typed is ever spliced into the query text.
 */
export function enrichmentQuery(numbers: number[]): string {
  const aliases = numbers
    .filter((n) => Number.isSafeInteger(n) && n > 0)
    .map((n) => `p${n}: pullRequest(number: ${n}) { ${PULL_FIELDS} }`)
    .join("\n    ");
  return `query RepoCityPulls($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    ${aliases}
  }
}`;
}

/** What wave C adds to one `PullSummary`. */
export interface PullEnrichment {
  review: PullReview | null;
  checks: PullChecks | null;
  comments: number;
  reactions: number;
  files: string[];
  changedFiles: number;
}

/**
 * Runs one batch. Aliases GitHub could not resolve come back `null` beside an
 * error and are simply absent from the result.
 */
export async function fetchPullBatch(
  client: GitHubClient,
  owner: string,
  repo: string,
  numbers: number[],
  signal?: AbortSignal,
): Promise<Map<number, PullEnrichment>> {
  const { data } = await client.graphql<{ repository: Record<string, GhGraphPull | null> | null }>(
    enrichmentQuery(numbers),
    { owner, name: repo },
    { resource: `pull enrichment (${numbers.length})`, signal },
  );
  const out = new Map<number, PullEnrichment>();
  const repository = data?.repository;
  if (!repository) return out;
  for (const node of Object.values(repository)) {
    const mapped = node ? mapGraphPull(node) : null;
    if (mapped) out.set(mapped.number, mapped.enrichment);
  }
  return out;
}

export function mapGraphPull(
  node: GhGraphPull,
): { number: number; enrichment: PullEnrichment } | null {
  if (!node || typeof node.number !== "number") return null;
  const paths = (node.files?.nodes ?? [])
    .map((file) => file?.path)
    .filter((path): path is string => typeof path === "string" && path !== "");
  return {
    number: node.number,
    enrichment: {
      review: reviewOf(node.reviewDecision),
      checks: checksOf(node.commits?.nodes?.[0]?.commit?.statusCheckRollup?.state ?? null),
      comments: node.comments?.totalCount ?? 0,
      reactions: node.reactions?.totalCount ?? 0,
      files: paths.slice(0, 8),
      changedFiles: typeof node.changedFiles === "number" ? node.changedFiles : paths.length,
    },
  };
}

export function reviewOf(decision: GhGraphPull["reviewDecision"] | undefined): PullReview | null {
  switch (decision) {
    case "APPROVED":
      return "approved";
    case "CHANGES_REQUESTED":
      return "changes-requested";
    case "REVIEW_REQUIRED":
      return "review-required";
    default:
      return null;
  }
}

/**
 * `StatusState`: SUCCESS, FAILURE, ERROR, PENDING, EXPECTED. No rollup at all
 * (no CI on the head commit) is `null`, not "passing".
 */
export function checksOf(state: string | null | undefined): PullChecks | null {
  switch (state) {
    case "SUCCESS":
      return "passing";
    case "FAILURE":
    case "ERROR":
      return "failing";
    case "PENDING":
    case "EXPECTED":
      return "pending";
    default:
      return null;
  }
}
