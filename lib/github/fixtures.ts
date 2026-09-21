/**
 * Fixture fallback for the demo (PLAN.md section 30).
 *
 * If GitHub rate-limits the hosted app while voters are clicking through it,
 * and `FIXTURE_FALLBACK` is on, a committed `RepoAnalysis` for that repository
 * is served instead, marked `source: "fixture"` so the HUD can say "cached
 * snapshot". The demo degrades to honest stale data rather than dying.
 *
 * Files live at `fixtures/<owner>__<repo>.analysis.json`, lower case. Reading
 * happens at request time through `fs`, not through a bundler import, so
 * fixtures can be added or refreshed without a rebuild.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import type { RepoAnalysis } from "@/types/analysis";

export function isFixtureFallbackEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const value = env.FIXTURE_FALLBACK;
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  return normalized !== "" && normalized !== "0" && normalized !== "false" && normalized !== "off";
}

export function fixtureFileName(owner: string, repo: string): string {
  return `${owner.toLowerCase()}__${repo.toLowerCase()}.analysis.json`;
}

/**
 * @returns the fixture analysis with `source: "fixture"`, or `null` when there
 * is no readable fixture for this repository. Never throws: an unreadable or
 * malformed fixture must fall through to the real error.
 */
export async function loadFixtureAnalysis(
  owner: string,
  repo: string,
  root: string = process.cwd(),
): Promise<RepoAnalysis | null> {
  const file = path.join(root, "fixtures", fixtureFileName(owner, repo));
  try {
    const raw = await readFile(file, "utf8");
    const parsed = JSON.parse(raw) as RepoAnalysis;
    if (!parsed || typeof parsed !== "object" || !parsed.repo || !parsed.metrics) return null;
    return { ...parsed, source: "fixture" };
  } catch {
    return null;
  }
}
