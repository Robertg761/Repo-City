/**
 * INTERPRETATION layer types (PLAN.md section 71.2).
 *
 * `RepoAnalysis` is the only object that crosses the wire from `/api/analyze`
 * to the browser. Target size under 300 KB; it never carries the raw tree.
 *
 * Binding contract: field names may be added, never renamed.
 */

import type {
  IssueSummary,
  PullChecks,
  PullReview,
  PullSummary,
  RepositorySnapshot,
  SurveyCoverage,
} from "./repository";

export type CiState = "healthy" | "recent-failure" | "failing" | "unknown" | "none";
export type IncidentState = "major" | "collision" | "stale" | "minor";
export type ConstructionState = "active" | "slow" | "abandoned" | "completed";

// ---------------------------------------------------------------------------
// Settlements (PLAN.md section 76.3)
// ---------------------------------------------------------------------------

export type SettlementTier = "village" | "town" | "city" | "metropolis";

export interface SettlementPlan {
  tier: SettlementTier;
  /** Tier from size alone, before any activity promotion. */
  baseTier: SettlementTier;
  promoted: boolean;
  /** totalFiles + 2 * totalDirs, the number the thresholds read. */
  footprint: number;
  files: number;
  dirs: number;
  /** The counts are a floor: GitHub truncated the tree, or a legacy fixture was capped. */
  lowerBound: boolean;
  activity: { commitsLast90d: number; activeContributors90d: number; busy: boolean };
  /** Inspector and HUD sentence, generated from the rule that matched. */
  reason: string;
}

/** What an issue looks like in the street. Severity stays in `IncidentState`. */
export type IncidentForm =
  | "fire"
  | "collision"
  | "wreck"
  | "pothole"
  | "roadblock"
  | "survey"
  | "signpost";

/** What a pull request looks like. `site` is the hero crane site. */
export type WorksForm = "site" | "scaffold" | "trench" | "van" | "hoarding";

/**
 * Compact open issue for the crowd. No body and no URL: the body is only used
 * server side for `relatedPath`, and the URL is `${repo.url}/issues/${number}`.
 */
export interface BacklogIssue {
  number: number;
  /** At most 140 characters. */
  title: string;
  createdAt: string;
  updatedAt: string;
  comments: number;
  reactions: number;
  /** At most 4, each at most 32 characters. */
  labels: string[];
  author: string | null;
  state: IncidentState;
  form: IncidentForm;
  score: number;
  relatedPath: string | null;
  /** 0..1 from discussion and reactions; drives scale and beacon brightness. */
  heat: number;
}

export interface BacklogPull {
  number: number;
  title: string;
  createdAt: string;
  updatedAt: string;
  draft: boolean;
  comments: number;
  reactions: number;
  labels: string[];
  author: string | null;
  /** Never "completed" in the backlog. */
  state: ConstructionState;
  /** Never "site". */
  form: WorksForm;
  score: number;
  relatedPath: string | null;
  /** At most 5. */
  files: string[];
  review: PullReview | null;
  checks: PullChecks | null;
  heat: number;
}

export interface RepoMetrics {
  scale: {
    files: number;
    dirs: number;
    languages: Record<string, number>;
    tier: "tiny" | "small" | "medium" | "large" | "huge";
    /**
     * Blobs in the snapshot tree BEFORE the analysis-layer prune, so the
     * interface can say "10 mapped of 16 surveyed" rather than showing two
     * different file counts under the same label (QA-2026-09-21 bug 2).
     * Always greater than or equal to `files`. Optional: older fixtures
     * captured before this field existed simply omit it.
     */
    surveyedFiles?: number;
    /** PLAN.md 76.3: blobs counted before the depth and entry caps. */
    totalFiles?: number;
    totalDirs?: number;
    /** The totals are a floor (GitHub truncated the tree). */
    lowerBound?: boolean;
  };
  activity: {
    commitsLast30d: number;
    commitsLast90d: number;
    activeContributors90d: number;
    lastPushDaysAgo: number;
    /** 0..1 */
    score: number;
    /**
     * Contributors GitHub listed for the repository. The endpoint returns one
     * page, so this saturates around 100. It feeds the HUD population line and
     * nothing else; it never touches health (PLAN.md section 17).
     */
    contributors?: number;
  };
  issues: {
    /** Unchanged meaning: the health sample, not the repository total. */
    open: number;
    ranked: RankedIssue[];
    staleShare: number;
    /** Real open issue total, for the HUD and the overflow queue. */
    total?: number;
    /** Every other open issue surveyed, significance order, heroes excluded. */
    backlog?: BacklogIssue[];
  };
  pulls: {
    /** Unchanged meaning: the health sample. */
    open: number;
    ranked: RankedPull[];
    staleShare: number;
    total?: number;
    backlog?: BacklogPull[];
  };
  ci: {
    state: CiState;
    provider: "github-actions" | "other" | "none";
    failureRate: number;
    recentRuns: number;
    /**
     * Workflow definitions GitHub listed. `recentRuns` counts executions of
     * them, so the power grid can say "6 workflows, 40 recent runs, 92% green".
     */
    workflows?: number;
  };
  tests: { strength: 0 | 1 | 2 | 3; signals: string[] };
  docs: { strength: 0 | 1 | 2 | 3; signals: string[]; readmeLength: number };
  tooling: { signals: string[] };
  releases: {
    count: number;
    lastDaysAgo: number | null;
    cadence: "active" | "occasional" | "none";
    /** Tag of the most recent published release, e.g. `v4.2.0`. */
    lastTag?: string | null;
    /** ISO timestamp of the most recent published release. */
    lastPublishedAt?: string | null;
    /** GitHub URL of that release, for the transit station's inspector link. */
    lastUrl?: string | null;
  };
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
  form?: IncidentForm;
  heat?: number;
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
  form?: WorksForm;
  relatedPath?: string | null;
  heat?: number;
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
  /** PLAN.md 76.4. Absent means "city", which is how every older analysis renders. */
  settlement?: SettlementPlan;
  coverage?: SurveyCoverage;
  totalsExact?: boolean;
}
