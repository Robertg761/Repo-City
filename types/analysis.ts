/**
 * INTERPRETATION layer types (PLAN.md section 71.2).
 *
 * `RepoAnalysis` is the only object that crosses the wire from `/api/analyze`
 * to the browser. Target size under 300 KB; it never carries the raw tree.
 *
 * Binding contract: field names may be added, never renamed.
 */

import type { IssueSummary, PullSummary, RepositorySnapshot } from "./repository";

export type CiState = "healthy" | "recent-failure" | "failing" | "unknown" | "none";
export type IncidentState = "major" | "collision" | "stale" | "minor";
export type ConstructionState = "active" | "slow" | "abandoned" | "completed";

export interface RepoMetrics {
  scale: {
    files: number;
    dirs: number;
    languages: Record<string, number>;
    tier: "tiny" | "small" | "medium" | "large" | "huge";
  };
  activity: {
    commitsLast30d: number;
    commitsLast90d: number;
    activeContributors90d: number;
    lastPushDaysAgo: number;
    /** 0..1 */
    score: number;
  };
  issues: { open: number; ranked: RankedIssue[]; staleShare: number };
  pulls: { open: number; ranked: RankedPull[]; staleShare: number };
  ci: {
    state: CiState;
    provider: "github-actions" | "other" | "none";
    failureRate: number;
    recentRuns: number;
  };
  tests: { strength: 0 | 1 | 2 | 3; signals: string[] };
  docs: { strength: 0 | 1 | 2 | 3; signals: string[]; readmeLength: number };
  tooling: { signals: string[] };
  releases: { count: number; lastDaysAgo: number | null; cadence: "active" | "occasional" | "none" };
  health: {
    score: number;
    band: HealthBand;
    breakdown: {
      maintenance: number;
      reliability: number;
      documentation: number;
      organization: number;
      responsiveness: number;
    };
  };
  confidence: { level: ConfidenceLevel; reasons: string[] };
  archived: boolean;
}

/** PLAN.md section 24. */
export type HealthBand = "Critical" | "Struggling" | "Mixed" | "Healthy" | "Thriving";

/** PLAN.md section 25. */
export type ConfidenceLevel = "low" | "medium" | "high";

export interface RankedIssue extends IssueSummary {
  score: number;
  state: IncidentState;
  reason: string;
  relatedPath: string | null;
}

/**
 * PLAN.md 71.2 writes this as `extends PullSummary`, but `PullSummary["state"]`
 * is `"open" | "merged" | "closed"` and here `state` must be a
 * `ConstructionState`, which TypeScript rejects as an incompatible override.
 * `Omit<..., "state">` is the minimal change that keeps every field name in the
 * contract exactly as specified. The raw pull state stays recoverable:
 * `"completed"` means merged, every other construction state means open.
 */
export interface RankedPull extends Omit<PullSummary, "state"> {
  score: number;
  state: ConstructionState;
  reason: string;
}

export interface DistrictPlan {
  id: string;
  sourcePath: string;
  name: string;
  purpose: string | null;
  fileCount: number;
  weight: number;
}

export type BuildingTier = 1 | 2 | 3 | 4 | 5;

export type LandmarkFile = "readme" | "manifest" | "contributing" | "changelog" | "dockerfile";

export interface BuildingPlan {
  id: string;
  path: string;
  kind: "file" | "directory";
  districtId: string;
  score: number;
  tier: BuildingTier;
  descendantCount: number;
  language: string | null;
  /** From AI `importantModules` when a path matched; null otherwise. */
  role: string | null;
  landmark: LandmarkFile | null;
}

export interface AiInterpretation {
  summary: string;
  districts: { sourcePath: string; name: string; purpose: string; evidence: string[] }[];
  importantModules: { path: string; role: string; evidence: string[] }[];
  strengths: string[];
  concerns: string[];
  /** 0..1 */
  organizationClarity: number;
  model: string;
  /** Where the interpretation came from; curated files are labelled in the inspector. */
  source?: "model" | "curated";
}

export type AiStatus = "ok" | "skipped" | "failed";

export interface RepoAnalysis {
  repo: RepositorySnapshot["repo"];
  metrics: RepoMetrics;
  districts: DistrictPlan[];
  buildings: BuildingPlan[];
  ai: AiInterpretation | null;
  aiStatus: AiStatus;
  /** `${owner}/${name}@${headSha}` */
  seed: string;
  warnings: string[];
  generatedAt: string;
  source: "live" | "fixture";
}
