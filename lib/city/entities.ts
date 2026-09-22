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
import type { LandmarkDetail, LandmarkType } from "@/types/city";
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

/**
 * Counted noun with a thousands separator. Every number the user reads goes
 * through here or through `count`, so "3,083 days" in the facts list and
 * "3,083 days" in the sentence below it agree (QA-2026-09-21 bug 6).
 */
const plural = (n: number, one: string, many = `${one}s`): string =>
  `${count(n)} ${n === 1 ? one : many}`;

const count = (n: number): string => n.toLocaleString("en-US");

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

/**
 * Link at the exact commit the city was built from, not at the branch tip.
 * A branch link would drift: click it a week later and GitHub shows a file the
 * city never surveyed, or a 404 where a rename happened.
 */
const blobUrl = (repo: RepositoryMeta, plan: BuildingPlan): string => {
  const path = plan.path.replace(/^\/+/, "");
  const kind = plan.kind === "directory" ? "tree" : "blob";
  const ref = repo.headSha || repo.defaultBranch;
  return `${repo.url}/${kind}/${ref}/${path}`;
};

/** Same rule for a directory that has no `BuildingPlan` behind it. */
export const treeUrl = (repo: RepositoryMeta, path: string): string => {
  const clean = path.replace(/^\/+|\/+$/g, "");
  const ref = repo.headSha || repo.defaultBranch;
  return clean ? `${repo.url}/tree/${ref}/${clean}` : repo.url;
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

  // A curated role is the best sentence available, and the facts that would
  // otherwise be the description move into the second line so nothing is lost.
  const plainDescription = isDirectory
    ? `Directory with ${plural(plan.descendantCount, "file")}${
        plan.language ? `, mostly ${plan.language}` : ""
      }.`
    : `${plan.language ?? "Source"} file in ${dirname(plan.path) || "the repository root"}.`;
  const description = plan.role ? `${plan.role} ${plainDescription}` : plainDescription;

  const parts = [
    `Its height is ${TIER_WORD[plan.tier]} because this path scores ${plan.score.toFixed(1)} on importance, which puts it in tier ${plan.tier} of 5.`,
  ];
  if (isDirectory) {
    parts.push(`Its footprint follows the ${plural(plan.descendantCount, "file")} it contains.`);
  }
  if (plan.role) {
    parts.push("Its role was written by the curated architecture interpretation for this repository.");
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
  const facts = [
    `open ${plural(age, "day")}`,
    plural(issue.comments, "comment"),
    issue.author ? `reported by ${issue.author}` : null,
    issue.labels.length > 0 ? `labelled ${issue.labels.slice(0, 3).join(", ")}` : null,
  ].filter((part): part is string => part !== null);

  return {
    title: `Issue #${issue.number}`,
    subtitle: INCIDENT_SUBTITLE[issue.state],
    description: `${issue.title} — ${facts.join(", ")}.`,
    // `reason` is the rule that placed the incident, written in
    // `lib/analysis/metrics.ts` from the matched branch. When the issue named
    // a path, say where the city put it and why (PLAN.md section 11).
    reason: issue.relatedPath
      ? `${issue.reason} It sits beside ${issue.relatedPath} because the issue names that path.`
      : issue.reason,
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
  const opened = daysBetween(pull.createdAt, generatedAt);
  const byline = pull.author ? ` by ${pull.author}` : "";
  const merged = pull.mergedAt ? daysBetween(pull.mergedAt, generatedAt) : null;

  const facts = [
    pull.draft ? "still a draft" : null,
    merged === null
      ? `opened ${opened === 0 ? "today" : `${plural(opened, "day")} ago`}`
      : `merged ${merged === 0 ? "today" : `${plural(merged, "day")} ago`}`,
    merged === null
      ? `last touched ${touched === 0 ? "today" : `${plural(touched, "day")} ago`}`
      : null,
    pull.comments > 0 ? plural(pull.comments, "comment") : null,
  ].filter((part): part is string => part !== null);

  return {
    title: `Pull Request #${pull.number}`,
    subtitle: CONSTRUCTION_SUBTITLE[pull.state],
    description: `${pull.title}${byline} — ${facts.join(", ")}.`,
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
  /** Numbers the renderer may animate to; see `LandmarkDetail`. */
  detail?: LandmarkDetail;
}

/**
 * Train arrivals per minute for the transit station (PLAN.md section 20).
 *
 * Cadence sets the band and recency moves it inside that band, so an actively
 * shipping project has freight moving and a project that released once, long
 * ago, gets a train every few minutes rather than a dead platform. An archived
 * repository keeps a single quiet arrival: section 19 asks for quiet, not for
 * a frozen scene.
 */
export function trainsPerMinute(
  releases: RepoMetrics["releases"],
  archived: boolean,
): number {
  if (releases.cadence === "none") return 0;
  const days = releases.lastDaysAgo ?? 365;
  const recency = Math.min(1, Math.max(0, 1 - days / 180));
  const base = releases.cadence === "active" ? 3 + 3 * recency : 0.8 + 1.2 * recency;
  const scaled = archived ? base * 0.25 : base;
  return Math.round(Math.min(6, Math.max(0.25, scaled)) * 100) / 100;
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
    return path ? treeUrl(repo, path) : null;
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
      description: `${CI_DESCRIPTION[metrics.ci.state]}${
        metrics.ci.workflows
          ? ` ${plural(metrics.ci.workflows, "workflow")}, ${plural(metrics.ci.recentRuns, "recent run")}, ${Math.round((1 - metrics.ci.failureRate) * 100)}% of them green.`
          : ""
      }`,
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
      // British spelling throughout, matching the legend and every comment in
      // the project (QA-2026-09-21 bug 5).
      title: "INFORMATION CENTRE",
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
        : metrics.releases.lastDaysAgo === 0
          ? "today"
          : `${plural(metrics.releases.lastDaysAgo, "day")} ago`;
    const tag = metrics.releases.lastTag;
    const arrivals = trainsPerMinute(metrics.releases, metrics.archived);
    specs.push({
      landmarkType: "station",
      level,
      state: metrics.releases.cadence,
      title: "TRANSIT STATION",
      subtitle: "Releases",
      description: `${
        metrics.releases.cadence === "active"
          ? "Freight moves constantly: this project ships on a steady cadence."
          : "Trains run, but not often: releases arrive occasionally."
      } The last train in was ${tag ? `${tag}, ${last}` : last}.`,
      reason: `${plural(metrics.releases.count, "published release")}, most recently ${last}, which maps to "${metrics.releases.cadence}" cadence; the platform works that out to about ${arrivals} ${arrivals === 1 ? "arrival" : "arrivals"} a minute.`,
      sourceUrl: metrics.releases.lastUrl ?? `${repo.url}/releases`,
      visualState: metrics.releases.cadence,
      detail: {
        trainsPerMinute: arrivals,
        releaseTag: tag ?? null,
        releaseDaysAgo: metrics.releases.lastDaysAgo,
      },
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

export function districtText(
  plan: DistrictPlan,
  repo: RepositoryMeta,
  /** Total mapped files, so the district can state its share of the whole. */
  totalFiles = 0,
): DistrictText {
  const path = plan.sourcePath.replace(/^\/+/, "");
  const where = path ? plan.sourcePath : "the repository root";
  const share =
    totalFiles > 0 ? Math.max(1, Math.round((plan.fileCount / totalFiles) * 100)) : null;
  const size = share === null ? plural(plan.fileCount, "file") : `${plural(plan.fileCount, "file")}, ${share}% of the repository`;

  return {
    title: plan.name,
    subtitle: plan.sourcePath,
    description: plan.purpose ?? `${size} under ${where}.`,
    reason: `${where} is one of the largest areas of the repository, with ${size}; its size on the map follows that count.`,
    sourceUrl: treeUrl(repo, path),
  };
}

export { basename, dirname, daysBetween, plural };
