/**
 * Inspector copy for every entity in the city (PLAN.md sections 12 and 41).
 *
 * The rule from section 12: the "why this exists" sentence is generated from
 * the matched rule, never free-form. Everything in this file is a pure string
 * builder over `RepoAnalysis`, so the inspector, the hover card and the stats
 * script all read the same words, and the tests can assert on them.
 *
 * No clock: relative ages are measured against `RepoAnalysis["generatedAt"]`.
 */

import type {
  BuildingPlan,
  CiState,
  ConstructionState,
  DistrictPlan,
  IncidentState,
  RankedIssue,
  RankedPull,
  RepoAnalysis,
  RepoMetrics,
} from "@/types/analysis";
import type { LandmarkType } from "@/types/city";
import type { RepositoryMeta } from "@/types/repository";

/** The fields every `CityEntity` needs, before geometry is attached. */
export interface EntityText {
  title: string;
  subtitle: string;
  description: string;
  reason: string;
  sourceUrl: string | null;
  visualState: string;
}

const DAY = 86_400_000;

const daysBetween = (fromIso: string, toIso: string): number => {
  const from = Date.parse(fromIso);
  const to = Date.parse(toIso);
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  return Math.max(0, Math.round((to - from) / DAY));
};

const plural = (n: number, one: string, many = `${one}s`): string =>
  `${n} ${n === 1 ? one : many}`;

const basename = (path: string): string => {
  const trimmed = path.replace(/\/+$/, "");
  const cut = trimmed.lastIndexOf("/");
  return cut === -1 ? trimmed : trimmed.slice(cut + 1) || trimmed;
};

const dirname = (path: string): string => {
  const trimmed = path.replace(/^\/+|\/+$/g, "");
  const cut = trimmed.lastIndexOf("/");
  return cut === -1 ? "" : trimmed.slice(0, cut);
};

const blobUrl = (repo: RepositoryMeta, plan: BuildingPlan): string => {
  const path = plan.path.replace(/^\/+/, "");
  const kind = plan.kind === "directory" ? "tree" : "blob";
  return `${repo.url}/${kind}/${repo.defaultBranch}/${path}`;
};

// ---------------------------------------------------------------------------
// Buildings (PLAN.md sections 9, 10 and 41)
// ---------------------------------------------------------------------------

const LANDMARK_FILE_REASON: Record<string, string> = {
  readme: "the README is the repository's front door",
  manifest: "the manifest declares what the project is",
  contributing: "CONTRIBUTING sets the ground rules for newcomers",
  changelog: "the changelog records how the project has shipped",
  dockerfile: "the Dockerfile describes how the project is packaged",
};

const TIER_WORD: Record<number, string> = {
  1: "a low-rise",
  2: "a mid-rise",
  3: "a tall block",
  4: "a tower",
  5: "a skyline tower",
};

export function buildingText(
  plan: BuildingPlan,
  district: DistrictPlan | undefined,
  repo: RepositoryMeta,
): EntityText {
  const isDirectory = plan.kind === "directory";
  const kindWord = isDirectory ? "Directory" : "File";
  const districtName = district?.name ?? "Outskirts";

  const description =
    plan.role ??
    (isDirectory
      ? `Directory with ${plural(plan.descendantCount, "file")}.`
      : `${plan.language ?? "Source"} file in ${dirname(plan.path) || "the repository root"}.`);

  const parts = [
    `Its height is ${TIER_WORD[plan.tier]} because this path scores ${plan.score.toFixed(1)} on importance, which puts it in tier ${plan.tier} of 5.`,
  ];
  if (isDirectory) {
    parts.push(`Its footprint follows the ${plural(plan.descendantCount, "file")} it contains.`);
  }
  if (plan.landmark) {
    parts.push(
      `It stands in the civic centre because ${LANDMARK_FILE_REASON[plan.landmark] ?? "it is a root-level landmark file"}.`,
    );
  }

  return {
    title: basename(plan.path) || plan.path,
    subtitle: `${districtName} · ${kindWord}`,
    description,
    reason: parts.join(" "),
    sourceUrl: blobUrl(repo, plan),
    visualState: plan.landmark ? "landmark" : "normal",
  };
}

// ---------------------------------------------------------------------------
// Incidents (PLAN.md sections 11 and 12)
// ---------------------------------------------------------------------------

const INCIDENT_SUBTITLE: Record<IncidentState, string> = {
  major: "Major incident",
  collision: "Collision",
  stale: "Abandoned wreck",
  minor: "Pothole",
};

export function incidentText(issue: RankedIssue, generatedAt: string): EntityText {
  const age = daysBetween(issue.createdAt, generatedAt);
  return {
    title: `Issue #${issue.number}`,
    subtitle: INCIDENT_SUBTITLE[issue.state],
    description: `${issue.title} — open ${plural(age, "day")}, ${plural(issue.comments, "comment")}.`,
    reason: issue.reason,
    sourceUrl: issue.url,
    visualState: issue.state,
  };
}

// ---------------------------------------------------------------------------
// Construction sites (PLAN.md section 13)
// ---------------------------------------------------------------------------

const CONSTRUCTION_SUBTITLE: Record<ConstructionState, string> = {
  active: "Active construction",
  slow: "Slow construction",
  abandoned: "Abandoned construction",
  completed: "Newly completed",
};

export function constructionText(pull: RankedPull, generatedAt: string): EntityText {
  const touched = daysBetween(pull.updatedAt, generatedAt);
  const byline = pull.author ? ` by ${pull.author}` : "";
  return {
    title: `Pull Request #${pull.number}`,
    subtitle: CONSTRUCTION_SUBTITLE[pull.state],
    description: `${pull.title}${byline} — last touched ${touched === 0 ? "today" : `${plural(touched, "day")} ago`}.`,
    reason: pull.reason,
    sourceUrl: pull.url,
    visualState: pull.state,
  };
}

// ---------------------------------------------------------------------------
// Landmarks (PLAN.md sections 14, 15, 16, 20 and 23)
// ---------------------------------------------------------------------------

export interface LandmarkSpec extends EntityText {
  landmarkType: LandmarkType;
  level: 0 | 1 | 2 | 3;
  state: string;
}

const CI_DESCRIPTION: Record<CiState, string> = {
  healthy: "Every latest workflow run on the default branch succeeded.",
  "recent-failure": "Some latest workflow runs failed, but most of the window is green.",
  failing: "Workflow runs fail often enough that the plant is visibly struggling.",
  unknown: "CI configuration was detected, but no completed runs were available to read.",
  none: "No continuous integration was detected.",
};

const CI_LEVEL: Record<CiState, 0 | 1 | 2 | 3> = {
  healthy: 3,
  "recent-failure": 2,
  failing: 1,
  unknown: 1,
  none: 0,
};

const TEST_DESCRIPTION: Record<number, string> = {
  0: "No test infrastructure was detected.",
  1: "A little test infrastructure was detected.",
  2: "Solid test infrastructure covers the project.",
  3: "Extensive test infrastructure surrounds the project.",
};

const DOCS_DESCRIPTION: Record<number, string> = {
  0: "No documentation was detected.",
  1: "Documentation is thin: mostly a README.",
  2: "The project documents itself reasonably well.",
  3: "The project is thoroughly documented and easy to navigate.",
};

const signalList = (signals: string[]): string =>
  signals.length > 0 ? signals.join(", ") : "no signals";

/**
 * Which landmarks exist, at what level, with their copy. Omission is a real
 * answer: no CI means no power grid (section 62), not a broken one, and a
 * repository with no tests, no docs or no releases simply lacks that building.
 */
export function planLandmarks(analysis: RepoAnalysis): LandmarkSpec[] {
  const { metrics, repo, districts } = analysis;
  const specs: LandmarkSpec[] = [];

  const districtUrl = (match: RegExp): string | null => {
    const hit = districts.find((d) => match.test(d.sourcePath));
    if (!hit) return null;
    const path = hit.sourcePath.replace(/^\/+/, "");
    return path ? `${repo.url}/tree/${repo.defaultBranch}/${path}` : null;
  };

  // CI -> power grid.
  if (metrics.ci.provider !== "none") {
    const level = CI_LEVEL[metrics.ci.state];
    specs.push({
      landmarkType: "power",
      level,
      state: metrics.ci.state,
      title: "POWER GRID",
      subtitle: metrics.ci.provider === "github-actions" ? "GitHub Actions" : "External CI",
      description: CI_DESCRIPTION[metrics.ci.state],
      reason: `Read from ${plural(metrics.ci.recentRuns, "recent workflow run")} with a ${Math.round(metrics.ci.failureRate * 100)}% failure rate, which maps to CI state "${metrics.ci.state}".`,
      sourceUrl:
        metrics.ci.provider === "github-actions" ? `${repo.url}/actions` : `${repo.url}`,
      visualState: metrics.ci.state,
    });
  }

  // Tests -> fire station.
  if (metrics.tests.strength > 0) {
    specs.push({
      landmarkType: "fire",
      level: metrics.tests.strength,
      state: `strength-${metrics.tests.strength}`,
      title: "FIRE STATION",
      subtitle: "Test Infrastructure",
      description: TEST_DESCRIPTION[metrics.tests.strength],
      reason: `Test infrastructure strength ${metrics.tests.strength} of 3, detected from ${signalList(metrics.tests.signals)}. This is detected infrastructure, not measured coverage.`,
      sourceUrl: districtUrl(/test|spec/i) ?? repo.url,
      visualState: `level-${metrics.tests.strength}`,
    });
  }

  // Docs -> information centre.
  if (metrics.docs.strength > 0) {
    specs.push({
      landmarkType: "info",
      level: metrics.docs.strength,
      state: `strength-${metrics.docs.strength}`,
      title: "INFORMATION CENTER",
      subtitle: "Documentation",
      description: DOCS_DESCRIPTION[metrics.docs.strength],
      reason: `Documentation strength ${metrics.docs.strength} of 3, detected from ${signalList(metrics.docs.signals)}, with a README of ${plural(metrics.docs.readmeLength, "character")}.`,
      sourceUrl: districtUrl(/doc/i) ?? `${repo.url}#readme`,
      visualState: `level-${metrics.docs.strength}`,
    });
  }

  // Releases -> transit station.
  if (metrics.releases.cadence !== "none") {
    const level = metrics.releases.cadence === "active" ? 3 : 2;
    const last =
      metrics.releases.lastDaysAgo === null
        ? "never"
        : `${plural(metrics.releases.lastDaysAgo, "day")} ago`;
    specs.push({
      landmarkType: "station",
      level,
      state: metrics.releases.cadence,
      title: "TRANSIT STATION",
      subtitle: "Releases",
      description:
        metrics.releases.cadence === "active"
          ? "Freight moves constantly: this project ships on a steady cadence."
          : "Trains run, but not often: releases arrive occasionally.",
      reason: `${plural(metrics.releases.count, "published release")}, most recently ${last}, which maps to "${metrics.releases.cadence}" cadence.`,
      sourceUrl: `${repo.url}/releases`,
      visualState: metrics.releases.cadence,
    });
  }

  // Health -> city hall. Always present: every city has one.
  const band = metrics.health.band;
  const strongest = strongestBreakdown(metrics.health.breakdown);
  specs.push({
    landmarkType: "civic",
    level: band === "Critical" || band === "Struggling" ? 1 : band === "Mixed" ? 2 : 3,
    state: band.toLowerCase(),
    title: "CITY HALL",
    subtitle: repo.fullName,
    description: `${band} city, health ${Math.round(metrics.health.score)} of 100.${
      metrics.archived ? " This repository is archived." : ""
    }`,
    reason: `Health ${Math.round(metrics.health.score)} of 100 puts the city in the "${band}" band; its strongest dimension is ${strongest}.`,
    sourceUrl: repo.url,
    visualState: band.toLowerCase(),
  });

  return specs;
}

function strongestBreakdown(breakdown: RepoMetrics["health"]["breakdown"]): string {
  const entries = Object.entries(breakdown) as [string, number][];
  let best = entries[0];
  for (const entry of entries) {
    if (entry[1] > best[1]) best = entry;
  }
  return `${best[0]} (${Math.round(best[1])})`;
}

// ---------------------------------------------------------------------------
// Districts (PLAN.md sections 8 and 42)
// ---------------------------------------------------------------------------

export interface DistrictText {
  title: string;
  subtitle: string;
  description: string;
  reason: string;
  sourceUrl: string;
}

export function districtText(plan: DistrictPlan, repo: RepositoryMeta): DistrictText {
  const path = plan.sourcePath.replace(/^\/+/, "");
  const where = path ? plan.sourcePath : "the repository root";
  return {
    title: plan.name,
    subtitle: plan.sourcePath,
    description: plan.purpose ?? `${plural(plan.fileCount, "file")} under ${where}.`,
    reason: `${where} is one of the largest areas of the repository, with ${plural(plan.fileCount, "file")}; its size on the map follows that count.`,
    sourceUrl: path ? `${repo.url}/tree/${repo.defaultBranch}/${path}` : repo.url,
  };
}

export { basename, dirname, daysBetween, plural };
