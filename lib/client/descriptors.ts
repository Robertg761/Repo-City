/**
 * The three short descriptors under the health number (PLAN.md section 3).
 *
 * They describe the city the metrics produced - scale, pace, infrastructure -
 * and never pass judgement on the repository. An archived repository is
 * "Archived repository", not "bad repository" (section 19).
 */

import type { RepoMetrics } from "@/types/analysis";

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
