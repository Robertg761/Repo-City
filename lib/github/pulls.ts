/**
 * Requests 5 and 6 of PLAN.md section 29: open and recently closed pull
 * requests.
 *
 * Open pulls become construction sites and merged ones become finished
 * buildings (PLAN.md section 13), so both halves are needed: 50 open sorted by
 * update time, 30 closed for the recent-merge signal.
 */

import type { GhPull } from "@/types/github";
import type { PullSummary } from "@/types/repository";
import { GitHubClient } from "./client.ts";
import { mapLabels } from "./issues.ts";

export const OPEN_PULLS_PER_PAGE = 50;
export const CLOSED_PULLS_PER_PAGE = 30;

export async function fetchPulls(
  client: GitHubClient,
  owner: string,
  repo: string,
): Promise<PullSummary[]> {
  const base = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls`;

  const [open, closed] = await Promise.all([
    client.getList<GhPull>(base, {
      resource: "pulls (open)",
      query: { state: "open", sort: "updated", direction: "desc", per_page: OPEN_PULLS_PER_PAGE },
    }),
    client.getList<GhPull>(base, {
      resource: "pulls (closed)",
      query: {
        state: "closed",
        sort: "updated",
        direction: "desc",
        per_page: CLOSED_PULLS_PER_PAGE,
      },
    }),
  ]);

  return mapPulls([...open, ...closed]);
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

  return {
    number: raw.number,
    title: raw.title ?? "",
    url: raw.html_url ?? "",
    createdAt: raw.created_at ?? "",
    updatedAt: raw.updated_at ?? raw.created_at ?? "",
    mergedAt: raw.merged_at ?? null,
    draft: raw.draft === true,
    // The list endpoint omits `comments`; review comments are the next best
    // proxy for "how much discussion has this had".
    comments: raw.comments ?? raw.review_comments ?? 0,
    labels: mapLabels(raw.labels),
    author: raw.user?.login ?? null,
    state: pullState(raw),
  };
}

/**
 * A closed pull is only "merged" when GitHub set `merged_at`; a closed pull
 * without it was abandoned, which is a different building (PLAN.md section 13).
 */
export function pullState(raw: Pick<GhPull, "state" | "merged_at">): PullSummary["state"] {
  if (raw.merged_at) return "merged";
  return raw.state === "closed" ? "closed" : "open";
}
