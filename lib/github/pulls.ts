/**
 * Open and recently closed pull requests (PLAN.md sections 29 and 76.6).
 *
 * Open pulls become construction sites and merged ones become finished
 * buildings (PLAN.md section 13), so both halves are needed:
 *
 * - A3, open page 1: `per_page=100` sorted by update time. This replaces
 *   today's `per_page=50`; the health sample is the first 50 of these by
 *   `updatedAt`, which is exactly the set the old request returned.
 * - A4, closed: 30 for the recent-merge signal, unchanged.
 * - B, open pages 2..5: fetched in parallel by `lib/github/survey.ts`.
 */

import type { GhLabel, GhPull, GhUser } from "@/types/github";
import type { PullSummary } from "@/types/repository";
import { GitHubClient, type Page } from "./client.ts";
import { mapLabels } from "./issues.ts";

export const OPEN_PULLS_PER_PAGE = 100;
/** Today's open request size: the health sample is this many, by `updatedAt`. */
export const HEALTH_SAMPLE_PULLS = 50;
export const CLOSED_PULLS_PER_PAGE = 30;

export const OPEN_PULLS_QUERY = {
  state: "open",
  sort: "updated",
  direction: "desc",
  per_page: OPEN_PULLS_PER_PAGE,
} as const;

export function pullsPath(owner: string, repo: string): string {
  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls`;
}

/** A3: the first page of open pull requests, with its `Link` page count. */
export async function fetchOpenPullsPage(
  client: GitHubClient,
  owner: string,
  repo: string,
): Promise<Page<GhPull>> {
  return client.getPage<GhPull>(pullsPath(owner, repo), {
    resource: "pulls (open)",
    query: { ...OPEN_PULLS_QUERY },
    slim: slimPull,
  });
}

const slimUser = (user: GhUser): GhUser => ({
  login: user.login,
  id: user.id,
  avatar_url: user.avatar_url,
  html_url: user.html_url,
  type: user.type,
});

const slimLabel = (label: GhLabel | string): GhLabel | string =>
  typeof label === "string" || !label
    ? label
    : { id: label.id, name: label.name, color: label.color, description: label.description };

/**
 * A pull request list item cut to the fields `types/github.ts` declares, for
 * the response memo (`memo.ts`). A `per_page=100` page is 2 to 3 MB because
 * every item embeds the head and base repositories in full; this keeps about
 * 2 KB of it, and every field `mapPull` and the survey read.
 */
export function slimPull(raw: GhPull): GhPull {
  if (!raw || typeof raw !== "object") return raw;
  const slim: GhPull = {
    number: raw.number,
    title: raw.title,
    html_url: raw.html_url,
    state: raw.state,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    closed_at: raw.closed_at,
    merged_at: raw.merged_at,
    draft: raw.draft,
    labels: Array.isArray(raw.labels) ? raw.labels.map(slimLabel) : raw.labels,
    user: raw.user ? slimUser(raw.user) : raw.user,
    head: raw.head ? { ref: raw.head.ref, sha: raw.head.sha } : raw.head,
    base: raw.base ? { ref: raw.base.ref, sha: raw.base.sha } : raw.base,
  };
  if (raw.comments !== undefined) slim.comments = raw.comments;
  if (raw.review_comments !== undefined) slim.review_comments = raw.review_comments;
  if (Array.isArray(raw.requested_reviewers)) {
    slim.requested_reviewers = raw.requested_reviewers.map(slimUser);
  }
  return slim;
}

/** A4: recently closed pull requests, unchanged from request 6. */
export async function fetchClosedPulls(
  client: GitHubClient,
  owner: string,
  repo: string,
): Promise<GhPull[]> {
  return client.getList<GhPull>(pullsPath(owner, repo), {
    resource: "pulls (closed)",
    query: {
      state: "closed",
      sort: "updated",
      direction: "desc",
      per_page: CLOSED_PULLS_PER_PAGE,
    },
  });
}

export function mapPulls(raw: GhPull[]): PullSummary[] {
  const seen = new Set<number>();
  const pulls: PullSummary[] = [];
  for (const item of raw) {
    const pull = mapPull(item);
    if (!pull || seen.has(pull.number)) continue;
    seen.add(pull.number);
    pulls.push(pull);
  }
  return pulls;
}

export function mapPull(raw: GhPull): PullSummary | null {
  if (!raw || typeof raw.number !== "number") return null;

  const pull: PullSummary = {
    number: raw.number,
    title: raw.title ?? "",
    url: raw.html_url ?? "",
    createdAt: raw.created_at ?? "",
    updatedAt: raw.updated_at ?? raw.created_at ?? "",
    mergedAt: raw.merged_at ?? null,
    draft: raw.draft === true,
    // The list endpoint omits `comments`; review comments are the next best
    // proxy for "how much discussion has this had". `survey.ts` replaces this
    // with the issue view's count or GraphQL's when either is known.
    comments: raw.comments ?? raw.review_comments ?? 0,
    labels: mapLabels(raw.labels),
    author: raw.user?.login ?? null,
    state: pullState(raw),
  };

  // Section 76.3 additions, only when GitHub sent them.
  if (Array.isArray(raw.requested_reviewers)) pull.requestedReviewers = raw.requested_reviewers.length;
  if (typeof raw.head?.sha === "string" && raw.head.sha !== "") pull.headSha = raw.head.sha;
  return pull;
}

/**
 * A closed pull is only "merged" when GitHub set `merged_at`; a closed pull
 * without it was abandoned, which is a different building (PLAN.md section 13).
 */
export function pullState(raw: Pick<GhPull, "state" | "merged_at">): PullSummary["state"] {
  if (raw.merged_at) return "merged";
  return raw.state === "closed" ? "closed" : "open";
}

/**
 * The health sample of open pull requests: the first 50 by `updatedAt`,
 * newest first — exactly what today's `per_page=50` request returned
 * (PLAN.md section 76.1, decision 6). `lib/analysis` reads health from this.
 */
export function healthSamplePulls(pulls: PullSummary[]): PullSummary[] {
  return pulls
    .filter((pull) => pull.state === "open" && pull.mergedAt === null)
    .map((pull, index) => ({ pull, index }))
    .sort((a, b) => compareUpdatedDesc(a.pull, b.pull) || a.index - b.index)
    .slice(0, HEALTH_SAMPLE_PULLS)
    .map(({ pull }) => pull);
}

function compareUpdatedDesc(a: PullSummary, b: PullSummary): number {
  const ta = Date.parse(a.updatedAt);
  const tb = Date.parse(b.updatedAt);
  return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
}
