/**
 * City health and analysis confidence (PLAN.md sections 23, 24 and 25).
 *
 * The formulas here are the plan's, verbatim. Two properties matter enough to
 * be tested directly:
 *
 *   - stars and forks never enter the health formula (PLAN.md sections 21, 22);
 *   - a repository with almost no observable signal is never presented as a
 *     confident judgement (PLAN.md section 25).
 */

import type { CiState, ConfidenceLevel, HealthBand, RepoMetrics } from "@/types/analysis";
import type { RepositorySnapshot } from "@/types/repository";
import { DOC_SIGNALS, toolingCategoriesOf } from "./detect";
import type { MetricsCore, StructureMetrics } from "./metrics";
import { recencyScore } from "./metrics";
import { blobsOf, clamp, isManifest, round } from "./tree";

/** PLAN.md section 23. */
export const HEALTH_WEIGHTS = {
  maintenance: 0.3,
  reliability: 0.25,
  documentation: 0.2,
  organization: 0.15,
  responsiveness: 0.1,
} as const;

/** PLAN.md section 23: ci healthy 1, recent-failure 0.6, unknown 0.5, failing 0.2, none 0.3. */
const CI_SCORE: Record<CiState, number> = {
  healthy: 1,
  "recent-failure": 0.6,
  unknown: 0.5,
  failing: 0.2,
  none: 0.3,
};

/** PLAN.md section 23: test strength tier 0..3 mapped to 0, 0.4, 0.75, 1. */
const TEST_SCORE = [0, 0.4, 0.75, 1] as const;

/** README length at which the documentation README term is fully earned. */
const README_FULL_LENGTH = 2000;

export interface HealthInputs {
  core: MetricsCore;
  structure: StructureMetrics;
  /**
   * The AI's `organizationClarity`, 0..1. `null` when no interpretation is
   * available, in which case organization is the deterministic structure term
   * alone (PLAN.md section 23).
   */
  aiOrganization?: number | null;
}

/** PLAN.md section 23: `maintenance`. */
export function maintenanceScore(core: MetricsCore): number {
  const recency = recencyScore(core.activity.lastPushDaysAgo);
  return clamp(
    0.4 * recency + 0.3 * (1 - clamp(core.issues.staleShare)) + 0.3 * (1 - clamp(core.pulls.staleShare)),
  );
}

/** PLAN.md section 23: `reliability`. */
export function reliabilityScore(core: MetricsCore): number {
  const ci = CI_SCORE[core.ci.state];
  const tests = TEST_SCORE[core.tests.strength];
  const tooling = clamp(toolingCategoriesOf(core.tooling.signals).size * 0.25);
  return clamp(0.4 * ci + 0.35 * tests + 0.25 * tooling);
}

/** PLAN.md section 23: `documentation`. */
export function documentationScore(core: MetricsCore): number {
  const has = (signal: string): boolean => core.docs.signals.includes(signal);
  const readme = has(DOC_SIGNALS.readme)
    ? 0.35 * clamp(core.docs.readmeLength / README_FULL_LENGTH)
    : 0;
  return clamp(
    readme +
      (has(DOC_SIGNALS.docsDir) ? 0.2 : 0) +
      (has(DOC_SIGNALS.contributing) ? 0.15 : 0) +
      (has(DOC_SIGNALS.examples) ? 0.15 : 0) +
      (has(DOC_SIGNALS.changelog) ? 0.15 : 0),
  );
}

/** PLAN.md section 23: `organization`. AI clarity is 40% when it exists. */
export function organizationScore(
  structure: StructureMetrics,
  aiOrganization?: number | null,
): number {
  if (aiOrganization === null || aiOrganization === undefined || Number.isNaN(aiOrganization)) {
    return clamp(structure.structure);
  }
  return clamp(0.6 * clamp(structure.structure) + 0.4 * clamp(aiOrganization));
}

/** PLAN.md section 23: `responsiveness`. */
export function responsivenessScore(core: MetricsCore, recentlyTouchedIssues: number): number {
  // No open issues is not unresponsive; there is simply nothing to respond to.
  const issueTouchRate = core.issues.open === 0 ? 1 : clamp(recentlyTouchedIssues / core.issues.open);
  const contributorBreadth = Math.min(core.activity.activeContributors90d, 5) / 5;
  return clamp(0.5 * issueTouchRate + 0.5 * contributorBreadth);
}

/** PLAN.md section 24. */
export function healthBand(score: number): HealthBand {
  if (score <= 20) return "Critical";
  if (score <= 40) return "Struggling";
  if (score <= 60) return "Mixed";
  if (score <= 80) return "Healthy";
  return "Thriving";
}

/**
 * Share of open issues touched in the last 90 days. Computed from the snapshot
 * because `RepoMetrics` only keeps the top-ranked issues.
 */
export function recentlyTouchedIssues(snapshot: RepositorySnapshot, now: Date): number {
  const cutoff = now.getTime() - 90 * 86_400_000;
  return snapshot.issues.filter((issue) => Date.parse(issue.updatedAt) >= cutoff).length;
}

/**
 * PLAN.md section 23's weighted total.
 *
 * `stars` and `forks` are not parameters of any term here, by design: they are
 * popularity, not quality (PLAN.md sections 21 and 22).
 */
export function computeHealth(
  inputs: HealthInputs,
  recentlyTouched: number,
): RepoMetrics["health"] {
  const maintenance = maintenanceScore(inputs.core);
  const reliability = reliabilityScore(inputs.core);
  const documentation = documentationScore(inputs.core);
  const organization = organizationScore(inputs.structure, inputs.aiOrganization);
  const responsiveness = responsivenessScore(inputs.core, recentlyTouched);

  const total =
    HEALTH_WEIGHTS.maintenance * maintenance +
    HEALTH_WEIGHTS.reliability * reliability +
    HEALTH_WEIGHTS.documentation * documentation +
    HEALTH_WEIGHTS.organization * organization +
    HEALTH_WEIGHTS.responsiveness * responsiveness;

  const score = Math.round(100 * clamp(total));
  return {
    score,
    band: healthBand(score),
    breakdown: {
      maintenance: round(maintenance, 3),
      reliability: round(reliability, 3),
      documentation: round(documentation, 3),
      organization: round(organization, 3),
      responsiveness: round(responsiveness, 3),
    },
  };
}

/* ------------------------------------------------------------- confidence */

/** PLAN.md section 25: seven observable signals. */
export const CONFIDENCE_SIGNALS = [
  "tree with 20 or more files",
  "20 or more commits",
  "issue data",
  "pull request data",
  "workflow data",
  "README",
  "a parsed manifest",
] as const;

/**
 * PLAN.md section 25. A truncated tree or a partial GitHub failure caps the
 * level at medium and records why, for the HUD tooltip.
 */
export function computeConfidence(
  snapshot: RepositorySnapshot,
  core: MetricsCore,
): RepoMetrics["confidence"] {
  const present: boolean[] = [
    blobsOf(snapshot.tree.entries).length >= 20,
    snapshot.commits.length >= 20,
    snapshot.issues.length > 0,
    snapshot.pulls.length > 0,
    snapshot.workflows.length > 0,
    core.docs.readmeLength > 0,
    snapshot.files.some((f) => isManifest(f.path)),
  ];

  const count = present.filter(Boolean).length;
  let level: ConfidenceLevel = count >= 6 ? "high" : count >= 4 ? "medium" : "low";

  const reasons: string[] = [];
  for (let i = 0; i < present.length; i++) {
    if (!present[i]) reasons.push(`No ${CONFIDENCE_SIGNALS[i]}.`);
  }

  if (snapshot.tree.truncated) {
    if (level === "high") level = "medium";
    reasons.unshift("The repository tree was truncated, so the survey is partial.");
  }
  if (snapshot.warnings.length > 0) {
    if (level === "high") level = "medium";
    reasons.unshift(
      `${snapshot.warnings.length} repository signal${snapshot.warnings.length === 1 ? "" : "s"} could not be fetched.`,
    );
  }
  if (reasons.length === 0) {
    reasons.push(`All ${CONFIDENCE_SIGNALS.length} repository signals were available.`);
  }

  return { level, reasons };
}
