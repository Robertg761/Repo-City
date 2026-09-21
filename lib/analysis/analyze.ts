// TEMPORARY STUB from W2; W3 replaces this file entirely.
//
// `/api/analyze` needs `analyzeSnapshot` to exist to compile and to stream end
// to end. This builds a type-valid but empty `RepoAnalysis`: no districts, no
// buildings, zeroed metrics, `aiStatus: "skipped"`. Keep the signature.

import type { RepoAnalysis, RepoMetrics } from "@/types/analysis";
import type { RepositorySnapshot } from "@/types/repository";

export interface AnalyzeOptions {
  onStage?: (event: { id: string; status: "running" | "done" | "failed"; detail?: string }) => void;
}

export async function analyzeSnapshot(
  snapshot: RepositorySnapshot,
  options: AnalyzeOptions = {},
): Promise<RepoAnalysis> {
  const files = snapshot.tree.entries.filter((entry) => entry.type === "blob").length;
  options.onStage?.({ id: "ai", status: "done", detail: "deterministic analysis" });

  const metrics: RepoMetrics = {
    scale: { files, dirs: snapshot.tree.entries.length - files, languages: {}, tier: "small" },
    activity: {
      commitsLast30d: 0,
      commitsLast90d: 0,
      activeContributors90d: 0,
      lastPushDaysAgo: 0,
      score: 0,
    },
    issues: { open: snapshot.issues.length, ranked: [], staleShare: 0 },
    pulls: { open: snapshot.pulls.length, ranked: [], staleShare: 0 },
    ci: { state: "unknown", provider: "none", failureRate: 0, recentRuns: 0 },
    tests: { strength: 0, signals: [] },
    docs: { strength: 0, signals: [], readmeLength: 0 },
    tooling: { signals: [] },
    releases: { count: snapshot.releases.length, lastDaysAgo: null, cadence: "none" },
    health: {
      score: 0,
      band: "Mixed",
      breakdown: {
        maintenance: 0,
        reliability: 0,
        documentation: 0,
        organization: 0,
        responsiveness: 0,
      },
    },
    confidence: { level: "low", reasons: ["stub analysis"] },
    archived: snapshot.repo.archived,
  };

  return {
    repo: snapshot.repo,
    metrics,
    districts: [],
    buildings: [],
    ai: null,
    aiStatus: "skipped",
    seed: `${snapshot.repo.owner}/${snapshot.repo.name}@${snapshot.repo.headSha}`,
    warnings: snapshot.warnings,
    generatedAt: new Date().toISOString(),
    source: "live",
  };
}
