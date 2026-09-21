/**
 * Request 1 of PLAN.md section 29: `GET /repos/{owner}/{repo}`.
 *
 * This is one of the two fatal requests — without metadata there is no default
 * branch, no head, no city. It also settles the canonical name: a renamed or
 * transferred repository answers 301 to `/repositories/{id}`, `fetch` follows
 * it, and `full_name` in the body is the name every later request, the cache
 * key, the seed and the HUD must use.
 */

import type { GhRepo } from "@/types/github";
import type { RepositoryMeta } from "@/types/repository";
import { GitHubClient } from "./client.ts";
import { GitHubError } from "./errors.ts";

export interface RepositoryResult {
  meta: RepositoryMeta;
  /** Canonical `owner` from the response, for building later request paths. */
  owner: string;
  /** Canonical `repo` from the response. */
  repo: string;
  /** True when GitHub answered with a name other than the one requested. */
  renamedFrom: string | null;
}

export async function fetchRepository(
  client: GitHubClient,
  owner: string,
  repo: string,
): Promise<RepositoryResult> {
  const raw = await client.get<GhRepo>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, {
    resource: "repository",
  });

  if (!raw || typeof raw.full_name !== "string") {
    throw new GitHubError("UPSTREAM", "repository metadata missing", { resource: "repository" });
  }

  const meta = mapRepository(raw);
  const requested = `${owner}/${repo}`.toLowerCase();
  return {
    meta,
    owner: meta.owner,
    repo: meta.name,
    renamedFrom: meta.fullName.toLowerCase() === requested ? null : requested,
  };
}

/** `GhRepo` -> `RepositorySnapshot["repo"]` (PLAN.md section 71.1). */
export function mapRepository(raw: GhRepo): RepositoryMeta {
  // `full_name` is authoritative; `owner.login` can be missing on redirected
  // payloads from very old transfers, so derive from `full_name` first.
  const [ownerFromFullName, nameFromFullName] = String(raw.full_name).split("/");

  return {
    owner: raw.owner?.login ?? ownerFromFullName ?? "",
    name: raw.name ?? nameFromFullName ?? "",
    fullName: raw.full_name,
    url: raw.html_url ?? `https://github.com/${raw.full_name}`,
    description: raw.description ?? null,
    defaultBranch: raw.default_branch ?? "main",
    // Filled in from the commits response by `fetchSnapshot`; the tree SHA is
    // the fallback when the commits request degrades.
    headSha: "",
    stars: raw.stargazers_count ?? 0,
    forks: raw.forks_count ?? 0,
    openIssuesCount: raw.open_issues_count ?? 0,
    archived: raw.archived === true,
    isFork: raw.fork === true,
    createdAt: raw.created_at ?? "",
    pushedAt: raw.pushed_at ?? raw.updated_at ?? "",
    license: raw.license?.spdx_id ?? raw.license?.name ?? null,
    primaryLanguage: raw.language ?? null,
    topics: Array.isArray(raw.topics) ? raw.topics : [],
  };
}
