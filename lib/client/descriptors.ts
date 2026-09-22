/**
 * The three short descriptors under the health number (PLAN.md section 3).
 *
 * They describe the city the metrics produced - scale, pace, infrastructure -
 * and never pass judgement on the repository. An archived repository is
 * "Archived repository", not "bad repository" (section 19).
 */

import type { RepoAnalysis, RepoMetrics } from "@/types/analysis";

const count = (value: number): string => value.toLocaleString("en-US");

/**
 * The city's population (PLAN.md section 17).
 *
 * This is a property of the *city*, not a claim about the repository: Repo
 * City houses three residents per mapped file, eight per commit in the last
 * ninety days, and sixty per listed contributor. The mix matters more than the
 * constants — a one-person project with a real codebase still comes out as a
 * small lively town rather than a ghost town, which is exactly what section 17
 * asks for, and no term can be gamed into changing health.
 */
export const POPULATION_PER_FILE = 3;
export const POPULATION_PER_COMMIT = 8;
export const POPULATION_PER_CONTRIBUTOR = 60;

export function cityPopulation(metrics: RepoMetrics): number {
  const people = metrics.activity.contributors ?? metrics.activity.activeContributors90d;
  return Math.max(
    1,
    Math.round(
      metrics.scale.files * POPULATION_PER_FILE +
        metrics.activity.commitsLast90d * POPULATION_PER_COMMIT +
        people * POPULATION_PER_CONTRIBUTOR,
    ),
  );
}

/** One sentence explaining the population line, shown on hover. */
export function explainPopulation(metrics: RepoMetrics): string {
  const people = metrics.activity.contributors ?? metrics.activity.activeContributors90d;
  return (
    `Repo City's own number, not GitHub's: ${POPULATION_PER_FILE} residents for each of ` +
    `${count(metrics.scale.files)} mapped files, ${POPULATION_PER_COMMIT} for each of ` +
    `${count(metrics.activity.commitsLast90d)} commits in ninety days, and ` +
    `${POPULATION_PER_CONTRIBUTOR} for each of ${count(people)} listed contributors.`
  );
}

/**
 * Stars and forks, framed as attention (PLAN.md sections 21 and 22). They buy
 * visitor traffic and highways on the map and nothing at all in the score, so
 * they are deliberately kept away from the health card's own chips.
 */
export function attentionChips(repo: RepoAnalysis["repo"]): string[] {
  return [
    `${count(repo.stars)} ${repo.stars === 1 ? "star" : "stars"}`,
    `${count(repo.forks)} ${repo.forks === 1 ? "fork" : "forks"}`,
  ];
}

export interface ScoreLine {
  key: keyof RepoMetrics["health"]["breakdown"];
  label: string;
  /** Percentage of the total score this dimension is worth (section 23). */
  weight: number;
  /** 0..1, the sub-score itself. */
  value: number;
  /** The actual readings behind it, e.g. "pushed 2 days ago". */
  inputs: string[];
}

const strength = (level: 0 | 1 | 2 | 3): string =>
  ["none detected", "light", "solid", "strong"][level];

const staleCount = (open: number, share: number): number => Math.round(open * share);

/**
 * The five sub-scores with the readings that produced them (PLAN.md section
 * 23). Every string here is a measurement, so a reader can check the city
 * against the repository rather than taking the number on faith.
 */
export function scoreLines(analysis: RepoAnalysis): ScoreLine[] {
  const { metrics } = analysis;
  const { breakdown } = metrics.health;
  const pushed = metrics.activity.lastPushDaysAgo;

  const ci =
    metrics.ci.provider === "none"
      ? "no CI detected"
      : metrics.ci.recentRuns === 0
        ? `CI configured, no completed runs read`
        : `CI ${metrics.ci.state.replace("-", " ")}: ${count(metrics.ci.recentRuns)} recent runs, ${Math.round((1 - metrics.ci.failureRate) * 100)}% green`;

  const organization = [
    `${count(analysis.districts.length)} districts over ${count(metrics.scale.files)} mapped files`,
  ];
  if (analysis.ai) {
    organization.push(
      `interpretation rates the layout ${Math.round(analysis.ai.organizationClarity * 100)}% clear`,
    );
  }

  return [
    {
      key: "maintenance",
      label: "Maintenance",
      weight: 30,
      value: breakdown.maintenance,
      inputs: [
        pushed === 0 ? "pushed today" : `pushed ${count(pushed)} ${pushed === 1 ? "day" : "days"} ago`,
        `${count(metrics.activity.commitsLast90d)} commits in 90 days`,
        `${count(metrics.activity.activeContributors90d)} authors in that window`,
      ],
    },
    {
      key: "reliability",
      label: "Reliability infrastructure",
      weight: 25,
      value: breakdown.reliability,
      inputs: [ci, `test infrastructure ${strength(metrics.tests.strength)}`],
    },
    {
      key: "documentation",
      label: "Documentation",
      weight: 20,
      value: breakdown.documentation,
      inputs: [
        `README ${count(metrics.docs.readmeLength)} characters`,
        metrics.docs.signals.length > 0
          ? `signals: ${metrics.docs.signals.slice(0, 3).join(", ")}`
          : "no documentation signals",
      ],
    },
    {
      key: "organization",
      label: "Organization",
      weight: 15,
      value: breakdown.organization,
      inputs: organization,
    },
    {
      key: "responsiveness",
      label: "Responsiveness",
      weight: 10,
      value: breakdown.responsiveness,
      inputs: [
        metrics.issues.open === 0
          ? "no open issues sampled"
          : `${count(staleCount(metrics.issues.open, metrics.issues.staleShare))} of ${count(metrics.issues.open)} sampled issues stale`,
        metrics.pulls.open === 0
          ? "no open pull requests sampled"
          : `${count(staleCount(metrics.pulls.open, metrics.pulls.staleShare))} of ${count(metrics.pulls.open)} open pull requests stale`,
      ],
    },
  ];
}

export function describeRepository(metrics: RepoMetrics): string[] {
  const chips: string[] = [];

  if (metrics.archived) chips.push("Archived repository");
  else if (metrics.activity.score >= 0.6) chips.push("Active development");
  else if (metrics.activity.score >= 0.25) chips.push("Steady development");
  else chips.push("Quiet lately");

  const infrastructure = metrics.tests.strength + (metrics.ci.state === "healthy" ? 2 : 0);
  if (infrastructure >= 4) chips.push("Strong infrastructure");
  else if (infrastructure >= 2) chips.push("Some infrastructure");
  else chips.push("Light infrastructure");

  const tier = metrics.scale.tier;
  if (tier === "huge" || tier === "large") chips.push("Large project");
  else if (tier === "medium") chips.push("Mid-size project");
  else chips.push("Small project");

  return chips;
}
