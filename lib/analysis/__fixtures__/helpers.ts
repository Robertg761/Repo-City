/**
 * Shared helpers for the hand-written `RepositorySnapshot` fixtures.
 *
 * The fixtures are TypeScript rather than JSON so that every literal union in
 * `types/repository.ts` (`"blob" | "tree"`, `"open" | "merged" | "closed"`) is
 * checked by `pnpm typecheck` instead of drifting silently.
 *
 * Every timestamp is derived from a fixture's own fixed `now`, so the fixtures
 * never age: a test passes `now` to the analysis and the relative distances
 * stay exactly as written.
 */

import type { RepositorySnapshot, TreeEntry } from "@/types/repository";

/** An ISO timestamp `days` before `now`. */
export function daysBefore(now: Date, days: number): string {
  return new Date(now.getTime() - days * 86_400_000).toISOString();
}

/**
 * A stable pseudo-size in bytes for a path. Real trees carry byte sizes and
 * building height depends on them, so the fixtures need sizes that vary
 * plausibly without a random source.
 */
export function sizeFor(path: string, min = 200, max = 14_000): number {
  let hash = 2166136261;
  for (let i = 0; i < path.length; i++) {
    hash ^= path.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const unit = ((hash >>> 0) % 10_000) / 10_000;
  // Skew towards smaller files, the way a real source tree does.
  return Math.round(min + (max - min) * unit * unit);
}

/**
 * Builds tree entries from a list of blob paths, deriving every intermediate
 * directory entry, exactly as `GET /git/trees?recursive=1` returns them.
 */
export function treeFromPaths(paths: readonly string[]): TreeEntry[] {
  const dirs = new Set<string>();
  const blobs: TreeEntry[] = [];
  for (const path of paths) {
    const parts = path.split("/").filter(Boolean);
    blobs.push({ path: parts.join("/"), type: "blob", size: sizeFor(path) });
    for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join("/"));
  }
  const byPath = (a: TreeEntry, b: TreeEntry): number =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
  const trees: TreeEntry[] = [...dirs].map((path) => ({ path, type: "tree" as const }));
  return [...blobs.sort(byPath), ...trees.sort(byPath)];
}

/**
 * An otherwise empty snapshot, for tests that care about exactly one signal.
 * Nothing here is "typical"; it is the floor the detectors must survive.
 */
export function emptySnapshot(overrides: Partial<RepositorySnapshot> = {}): RepositorySnapshot {
  const now = new Date("2026-09-21T12:00:00.000Z").toISOString();
  return {
    repo: {
      owner: "test",
      name: "blank",
      fullName: "test/blank",
      url: "https://github.com/test/blank",
      description: null,
      defaultBranch: "main",
      headSha: "0".repeat(40),
      stars: 0,
      forks: 0,
      openIssuesCount: 0,
      archived: false,
      isFork: false,
      createdAt: now,
      pushedAt: now,
      license: null,
      primaryLanguage: null,
      topics: [],
      ...overrides.repo,
    },
    tree: overrides.tree ?? { truncated: false, totalEntries: 0, entries: [] },
    commits: overrides.commits ?? [],
    issues: overrides.issues ?? [],
    pulls: overrides.pulls ?? [],
    contributors: overrides.contributors ?? [],
    workflows: overrides.workflows ?? [],
    workflowRuns: overrides.workflowRuns ?? [],
    releases: overrides.releases ?? [],
    files: overrides.files ?? [],
    fetchedAt: overrides.fetchedAt ?? now,
    requestCount: overrides.requestCount ?? 2,
    warnings: overrides.warnings ?? [],
  };
}

/** A completed workflow run, for the CI derivation tests (PLAN.md section 14). */
export function run(
  id: number,
  workflowId: number,
  conclusion: string | null,
  createdAt: string,
  status = "completed",
): RepositorySnapshot["workflowRuns"][number] {
  return {
    id,
    workflowId,
    name: `workflow-${workflowId}`,
    status,
    conclusion,
    createdAt,
    url: `https://github.com/test/blank/actions/runs/${id}`,
  };
}
