/**
 * Requests 3, 7 and 10 of PLAN.md section 29: commits, contributors, releases.
 *
 * Together they are the "is anyone home" signal — traffic, lit windows and
 * pedestrians in the city (PLAN.md sections 17, 18 and 20).
 *
 * `commits[0].sha` is also the head SHA, and therefore the seed the whole city
 * is generated from, so the commits request is the first one to fall back on
 * when it degrades: `fetchSnapshot` then uses the tree SHA instead.
 */

import type { GhCommit, GhContributor, GhRelease } from "@/types/github";
import type { RepositorySnapshot } from "@/types/repository";
import { GitHubClient } from "./client.ts";

export type CommitSummary = RepositorySnapshot["commits"][number];
export type ContributorSummary = RepositorySnapshot["contributors"][number];
export type ReleaseSummary = RepositorySnapshot["releases"][number];

export const COMMITS_PER_PAGE = 100;
export const CONTRIBUTORS_PER_PAGE = 100;
export const RELEASES_PER_PAGE = 20;

/** Commit messages are summarized in the HUD, never shown in full. */
const MESSAGE_LENGTH = 120;

export async function fetchCommits(
  client: GitHubClient,
  owner: string,
  repo: string,
): Promise<CommitSummary[]> {
  const raw = await client.getList<GhCommit>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits`,
    { resource: "commits", query: { per_page: COMMITS_PER_PAGE } },
  );
  return mapCommits(raw);
}

export async function fetchContributors(
  client: GitHubClient,
  owner: string,
  repo: string,
): Promise<ContributorSummary[]> {
  const raw = await client.getList<GhContributor>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contributors`,
    { resource: "contributors", query: { per_page: CONTRIBUTORS_PER_PAGE } },
  );
  return mapContributors(raw);
}

export async function fetchReleases(
  client: GitHubClient,
  owner: string,
  repo: string,
): Promise<ReleaseSummary[]> {
  const raw = await client.getList<GhRelease>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases`,
    { resource: "releases", query: { per_page: RELEASES_PER_PAGE } },
  );
  return mapReleases(raw);
}

export function mapCommits(raw: GhCommit[]): CommitSummary[] {
  return raw
    .filter((commit) => commit && typeof commit.sha === "string")
    .map((commit) => ({
      sha: commit.sha,
      date: commit.commit?.author?.date ?? commit.commit?.committer?.date ?? "",
      // `author` is null for commits whose email is not linked to an account;
      // the commit still counts as activity, it just has no avatar behind it.
      authorLogin: commit.author?.login ?? null,
      message: firstLine(commit.commit?.message ?? ""),
    }));
}

export function mapContributors(raw: GhContributor[]): ContributorSummary[] {
  return raw
    .filter((person) => person && typeof person.login === "string")
    .map((person) => ({ login: person.login, contributions: person.contributions ?? 0 }));
}

/** Drafts are invisible to the public, so they are not part of the city. */
export function mapReleases(raw: GhRelease[]): ReleaseSummary[] {
  return raw
    .filter((release) => release && release.draft !== true)
    .map((release) => ({
      tag: release.tag_name ?? "",
      name: release.name ?? null,
      publishedAt: release.published_at ?? release.created_at ?? "",
      url: release.html_url ?? "",
    }))
    .filter((release) => release.tag !== "");
}

function firstLine(message: string): string {
  const line = message.split("\n", 1)[0].trim();
  return line.length > MESSAGE_LENGTH ? `${line.slice(0, MESSAGE_LENGTH - 1)}…` : line;
}
