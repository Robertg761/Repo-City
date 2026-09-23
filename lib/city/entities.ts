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
  IncidentForm,
  IncidentState,
  RankedIssue,
  RankedPull,
  RepoAnalysis,
  RepoMetrics,
  SettlementTier,
  WorksForm,
} from "@/types/analysis";
import type { LandmarkDetail, LandmarkType, OverflowCount } from "@/types/city";
import { WRECK_IDLE_DAYS, pullModifiers, wantsVolunteer } from "../analysis/forms.ts";
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

/**
 * `n.toLocaleString("en-US")`, with integers formatted by hand: the ICU call
 * costs tens of microseconds, and a metropolis writes a few thousand of these
 * for its crowd. The output is the same string.
 */
const count = (n: number): string => {
  if (!Number.isSafeInteger(n)) return n.toLocaleString("en-US");
  const digits = String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return n < 0 ? `-${digits}` : digits;
};

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

/**
 * The height class a building's tier reads as, in the settlement's own
 * buildings (`SETTLEMENT_PARAMS.tierHeight` and the archetype tables in
 * `components/city/models/buildings/archetypes.ts`): a village tops out at a
 * farmhouse, a town at a five-storey block, and only a city and a metropolis
 * build towers. The city's words are the ones it always had.
 */
const TIER_WORD: Record<SettlementTier, Record<number, string>> = {
  village: {
    1: "a single-storey cottage",
    2: "a two-storey cottage",
    3: "a farmhouse",
    4: "a large farmhouse",
    5: "one of the village's biggest farmhouses",
  },
  town: {
    1: "a single-storey house",
    2: "a two-storey terrace",
    3: "a three-storey block",
    4: "a four-storey block",
    5: "a five-storey block, as tall as the town builds",
  },
  city: {
    1: "a low-rise",
    2: "a mid-rise",
    3: "a tall block",
    4: "a tower",
    5: "a skyline tower",
  },
  metropolis: {
    1: "a low-rise",
    2: "a mid-rise",
    3: "a tall block",
    4: "a tower",
    5: "a skyline tower",
  },
};

/** Where the root landmark files stand: the civic ground, named for the settlement. */
const CIVIC_GROUND: Record<SettlementTier, string> = {
  village: "on the village green",
  town: "on the town square",
  city: "in the civic centre",
  metropolis: "in the civic centre",
};

export function buildingText(
  plan: BuildingPlan,
  district: DistrictPlan | undefined,
  repo: RepositoryMeta,
  tier: SettlementTier = "city",
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
    `Its height is ${TIER_WORD[tier][plan.tier]} because this path scores ${plan.score.toFixed(1)} on importance, which puts it in tier ${plan.tier} of 5.`,
  ];
  if (isDirectory) {
    parts.push(`Its footprint follows the ${plural(plan.descendantCount, "file")} it contains.`);
  }
  if (plan.role) {
    parts.push("Its role was written by the curated architecture interpretation for this repository.");
  }
  if (plan.landmark) {
    parts.push(
      `It stands ${CIVIC_GROUND[tier]} because ${LANDMARK_FILE_REASON[plan.landmark] ?? "it is a root-level landmark file"}.`,
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
// The crowd: every other open issue and pull request (PLAN.md 76.7 and 76.10)
// ---------------------------------------------------------------------------

/** The inspector subtitle of a crowd incident: what it looks like in the street. */
export const INCIDENT_FORM_LABEL: Record<IncidentForm, string> = {
  fire: "Fire",
  collision: "Fender-bender",
  wreck: "Abandoned wreck",
  pothole: "Pothole",
  roadblock: "Roadblock",
  survey: "Survey pegs",
  signpost: "Signpost",
};

/** The inspector subtitle of a crowd works object. */
export const WORKS_FORM_LABEL: Record<WorksForm, string> = {
  site: "Construction site",
  scaffold: "Scaffolding",
  trench: "Trench",
  van: "Utility works",
  hoarding: "Hoarding",
};

/**
 * Why an issue has this shape: one sentence per form, naming the rule in
 * `lib/analysis/forms.ts` that chose it (PLAN.md 76.7).
 */
const ISSUE_FORM_RULE: Record<IncidentForm, string> = {
  fire: "A fire, because the issue is marked major or security-related, or it is a severe bug drawing heavy discussion.",
  wreck: "An abandoned wreck, because the issue has gone stale or nobody has touched it for a year.",
  collision: "A fender-bender, because the issue is an unresolved bug.",
  roadblock:
    "A roadblock, because the issue is blocked, on hold or waiting on an answer: the road stays closed until someone replies.",
  signpost: "A signpost, because the issue is about the documentation, the website or an example.",
  survey:
    "Survey pegs, because the issue proposes a feature: the ground is marked out and nothing is built yet.",
  pothole: "A pothole: routine upkeep that no other rule claimed.",
};

/** The severity rule behind the state, as `classifyIssue` applies it. */
const ISSUE_STATE_RULE: Record<IncidentState, string> = {
  major: "Its labels mark it a severe bug and its discussion is heavy.",
  collision: "It is labelled a bug.",
  stale: "It is a bug that has stayed open for more than 180 days.",
  minor: "It carries no bug label.",
};

/** How old an issue or a pull request is, in whole days, against `generatedAt`. */
export interface Ages {
  /** Days since it was opened. */
  open: number;
  /** Days since it was last updated. */
  idle: number;
}

/** `Ages` for an item, measured the way the description's facts are. */
export function agesOf(item: { createdAt: string; updatedAt: string }, generatedAt: string): Ages {
  return { open: daysBetween(item.createdAt, generatedAt), idle: daysBetween(item.updatedAt, generatedAt) };
}

/**
 * The form sentence for this issue in particular: the branch of the rule that
 * matched, not the whole rule. Only the fire and the wreck have more than one
 * branch; a wreck says how long the issue has actually stood idle.
 */
function issueFormSentence(form: IncidentForm, state: IncidentState, labels: string[], ages?: Ages): string {
  if (form === "fire") {
    if (/security|vulnerab|cve/i.test(labels.join(" "))) return "A fire, because the issue is about security.";
    return "A fire, because the issue is a severe bug drawing heavy discussion.";
  }
  if (form === "wreck" && ages) {
    if (state !== "stale" && ages.idle >= WRECK_IDLE_DAYS) {
      return `An abandoned wreck: nobody has touched the issue for ${plural(ages.idle, "day")}.`;
    }
    return "An abandoned wreck, because the bug has gone stale.";
  }
  return ISSUE_FORM_RULE[form];
}

/**
 * The generated "why" of a crowd issue: its form rule, its state rule and,
 * for a "good first issue" or "help wanted", the volunteer flag. With `ages`
 * the sentences say how old this issue actually is rather than quoting the
 * rule's threshold.
 */
export function crowdIssueReason(
  form: IncidentForm,
  state: IncidentState,
  labels: string[],
  ages?: Ages,
): string {
  const volunteer = wantsVolunteer(labels)
    ? " It is marked for volunteers, so anyone can fill it in."
    : "";
  const stateRule =
    state === "stale" && ages
      ? `It is a bug that has stayed open for ${plural(ages.open, "day")}.`
      : ISSUE_STATE_RULE[state];
  return `${issueFormSentence(form, state, labels, ages)} ${stateRule}${volunteer}`;
}

const PULL_FORM_RULE: Record<WorksForm, string> = {
  site: "A construction site with a crane: one of the pull requests ranked high enough to be drawn in full.",
  scaffold:
    "Scaffolding, because the pull request changes the code itself and no other works rule matched.",
  trench:
    "A trench in the road, because the pull request changes the build, CI or tooling rather than the product.",
  van: "A utility van, because the pull request comes from a bot or updates dependencies.",
  hoarding: "A hoarding round an empty plot, because the pull request is still a draft.",
};

/** The recency rule behind the state, as `classifyPull` applies it. */
const PULL_STATE_RULE: Record<ConstructionState, string> = {
  active: "It was updated in the last 14 days, so work is going on.",
  slow: "It was last updated 15 to 59 days ago, so the work is slow.",
  abandoned: "Nobody has touched it for 60 days or more, so the works stand idle.",
  completed: "It has been merged.",
};

/**
 * The state sentence for this pull request, with the days since it was last
 * updated when they are known: "It was last updated 32 days ago, so the work
 * is slow", not the rule's "15 to 59 days".
 */
function pullStateSentence(state: ConstructionState, idle: number | undefined): string {
  if (idle === undefined) return PULL_STATE_RULE[state];
  const ago = idle === 0 ? "today" : `${plural(idle, "day")} ago`;
  switch (state) {
    case "active":
      return `It was last updated ${ago}, so work is going on.`;
    case "slow":
      return `It was last updated ${ago}, so the work is slow.`;
    case "abandoned":
      return `Nobody has touched it for ${plural(idle, "day")}, so the works stand idle.`;
    case "completed":
      return PULL_STATE_RULE.completed;
  }
}

/**
 * The generated "why" of a crowd pull request: form rule, state rule, then
 * the review and CI modifiers `pullModifiers` draws (the state ones, rust and
 * dimming, are already said by the state rule). With `ages` the state rule
 * says how long ago it was actually updated.
 */
export function crowdPullReason(
  form: WorksForm,
  state: ConstructionState,
  review: RankedPull["review"],
  checks: RankedPull["checks"],
  ages?: Ages,
): string {
  const signals = pullModifiers({ review, checks, state })
    .filter((modifier) => modifier.id !== "abandoned" && modifier.id !== "slow")
    .map((modifier) => modifier.sentence);
  return [PULL_FORM_RULE[form], pullStateSentence(state, ages?.idle), ...signals].join(" ");
}

/** How a crowd object found its place, for the last sentence of its "why". */
export interface CrowdPlacement {
  /** What anchored it: a building by path, a district by path or by title, or nothing. */
  anchor: "building" | "district-path" | "district-text" | "none";
  /** The anchor building's path or the anchor district's name. */
  near: string | null;
  /** The related path the issue or pull request named. */
  path: string | null;
  /** Anchored, but every spot within reach was taken, so it stands elsewhere. */
  displaced: boolean;
  /** A lane-closing form that had to wait on the kerb. */
  kerbed: boolean;
  /** Scaffolding: the path of the building it stands on. */
  host: string | null;
  /** Scaffolding that became a trench, and why. */
  demoted: "cap" | "no-facade" | null;
  tier: SettlementTier;
}

/**
 * The placement sentence. Generated from what the placement actually did,
 * never free-form (PLAN.md section 12).
 */
export function placementSentence(kind: "issue" | "pull", p: CrowdPlacement): string {
  const noun = kind === "issue" ? "issue" : "pull request";
  const verb = kind === "issue" ? "names" : "touches";
  const word = SETTLEMENT_WORD[p.tier];
  const parts: string[] = [];

  if (p.host && !p.demoted) {
    parts.push(
      p.anchor === "building" && p.near === p.host
        ? `It stands on ${p.host} because the pull request touches ${p.path ?? p.host}.`
        : p.near
          ? `It stands on ${p.host}, the nearest building with a free face to ${p.near}.`
          : `No path it names has a building in the ${word}, so its scaffolding stands on ${p.host} only because that facade was free.`,
    );
    return parts.join(" ");
  }

  if (p.demoted) {
    const where = p.near ?? p.host;
    parts.push(
      p.demoted === "cap"
        ? `Scaffolding is capped at 35% of the buildings, so the road${where ? ` near ${where}` : ""} is dug up instead.`
        : `No facade${where ? ` near ${where}` : ""} was free for scaffolding, so the road is dug up instead.`,
    );
  } else if (p.anchor === "none") {
    parts.push(`The ${noun} names no path the ${word} knows, so it stands where the streets had room.`);
  } else if (p.displaced) {
    parts.push(
      `The ${noun} points at ${p.near}, but every spot near it was taken, so it stands where the streets had room.`,
    );
  } else if (p.anchor === "building") {
    parts.push(`It stands beside ${p.near} because the ${noun} ${verb} ${p.path ?? p.near}.`);
  } else if (p.anchor === "district-path") {
    parts.push(`It stands in ${p.near} because the ${noun} ${verb} ${p.path ?? "a path there"}.`);
  } else {
    parts.push(`It stands in ${p.near} because the ${noun}'s title mentions a path there.`);
  }

  if (p.kerbed) {
    parts.push(
      "It waits on the kerb rather than in the lane: no more than a quarter of the streets may be closed at once, and never a road that is the only way through.",
    );
  }
  return parts.join(" ");
}

/** Inspector copy for a crowd incident. `issue.reason` is `crowdIssueReason`. */
export function crowdIncidentText(
  issue: RankedIssue,
  form: IncidentForm,
  generatedAt: string,
  placement: CrowdPlacement,
): EntityText {
  const age = daysBetween(issue.createdAt, generatedAt);
  const reactions = issue.reactions ?? 0;
  const facts = [
    `open ${plural(age, "day")}`,
    plural(issue.comments, "comment"),
    reactions > 0 ? plural(reactions, "reaction") : null,
    issue.author ? `reported by ${issue.author}` : null,
    issue.labels.length > 0 ? `labelled ${issue.labels.slice(0, 3).join(", ")}` : null,
  ].filter((part): part is string => part !== null);

  return {
    title: `Issue #${issue.number}`,
    subtitle: INCIDENT_FORM_LABEL[form],
    description: `${issue.title} — ${facts.join(", ")}.`,
    reason: `${issue.reason} ${placementSentence("issue", placement)}`,
    sourceUrl: issue.url,
    visualState: issue.state,
  };
}

/** Inspector copy for a crowd works object. `pull.reason` is `crowdPullReason`. */
export function crowdConstructionText(
  pull: RankedPull,
  form: WorksForm,
  generatedAt: string,
  placement: CrowdPlacement,
): EntityText {
  const touched = daysBetween(pull.updatedAt, generatedAt);
  const opened = daysBetween(pull.createdAt, generatedAt);
  const byline = pull.author ? ` by ${pull.author}` : "";
  const facts = [
    pull.draft ? "still a draft" : null,
    `opened ${opened === 0 ? "today" : `${plural(opened, "day")} ago`}`,
    `last touched ${touched === 0 ? "today" : `${plural(touched, "day")} ago`}`,
    pull.comments > 0 ? plural(pull.comments, "comment") : null,
    (pull.reactions ?? 0) > 0 ? plural(pull.reactions ?? 0, "reaction") : null,
  ].filter((part): part is string => part !== null);

  return {
    title: `Pull Request #${pull.number}`,
    subtitle: WORKS_FORM_LABEL[form],
    description: `${pull.title}${byline} — ${facts.join(", ")}.`,
    reason: `${pull.reason} ${placementSentence("pull", placement)}`,
    sourceUrl: pull.url,
    visualState: pull.state,
  };
}

/** What `overflowText` needs to explain the queue. */
export interface OverflowFacts {
  issues: OverflowCount;
  pulls: OverflowCount;
  exact: boolean;
  /** How many of each the survey actually reached (heroes plus backlog). */
  surveyed: { issues: number; pulls: number };
  tier: SettlementTier;
  repoUrl: string;
  /**
   * False for a remainder too small to queue (`trivialOverflow`): the counts
   * stand, but nothing waits at the limits. Absent means queued.
   */
  queued?: boolean;
}

/**
 * Copy for the queue at the city limits (PLAN.md 76.8 and 76.9). The title is
 * the signboard. The reason says which limit hid what: the survey's reach,
 * the ground the settlement has, or both.
 */
export function overflowText(facts: OverflowFacts): EntityText {
  const { issues, pulls, exact, surveyed, tier, repoUrl } = facts;
  const queued = facts.queued ?? true;
  const word = SETTLEMENT_WORD[tier];
  const about = exact ? "" : "about ";

  const line = (c: OverflowCount, one: string, many: string): string =>
    `${count(c.drawn)} of ${about}${count(c.total)} open ${c.total === 1 ? one : many} ${
      c.drawn === 1 ? "is" : "are"
    } drawn in the ${word}; ${about}${count(c.hidden)} more ${
      queued ? (c.hidden === 1 ? "waits in the queue" : "wait in the queue") : c.hidden === 1 ? "is counted but not drawn" : "are counted but not drawn"
    }.`;

  const sign =
    issues.hidden > 0
      ? `+${count(issues.hidden)} more open ${issues.hidden === 1 ? "issue" : "issues"}`
      : `+${count(pulls.hidden)} more open ${pulls.hidden === 1 ? "pull request" : "pull requests"}`;

  const limits = (c: OverflowCount, reached: number, many: string): string | null => {
    if (c.hidden === 0) return null;
    const clauses: string[] = [];
    if (reached < c.total) {
      clauses.push(`the survey reached ${count(reached)} of the ${about}${count(c.total)} open ${many}`);
    }
    if (c.drawn < Math.min(reached, c.total)) {
      clauses.push(`the ${word} had room for ${count(c.drawn)} of the ${count(Math.min(reached, c.total))} it was given`);
    }
    if (clauses.length === 0) return null;
    const text = clauses.join(", and ");
    return `For ${many}, ${text}.`;
  };

  const reasons = [
    queued
      ? "Every open issue and pull request is drawn as its own object until the survey or the ground runs out; everything past that waits here, counted but not drawn."
      : `Every open issue and pull request is drawn as its own object until the survey or the ground runs out. So few are left over that no queue forms at the ${word} limits; they are counted but not drawn.`,
    limits(issues, surveyed.issues, "issues"),
    limits(pulls, surveyed.pulls, "pull requests"),
    exact
      ? null
      : "The totals are estimates from GitHub's open issue count, which counts pull requests too.",
  ].filter((part): part is string => part !== null);

  return {
    title: sign,
    subtitle: `Queue at the ${word} limits`,
    description: [
      issues.total > 0 ? capitalise(line(issues, "issue", "issues")) : null,
      pulls.total > 0 ? capitalise(line(pulls, "pull request", "pull requests")) : null,
    ]
      .filter((part): part is string => part !== null)
      .join(" "),
    reason: reasons.join(" "),
    sourceUrl: issues.hidden > 0 ? `${repoUrl}/issues` : `${repoUrl}/pulls`,
    visualState: "queue",
  };
}

const capitalise = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

// ---------------------------------------------------------------------------
// Landmarks (PLAN.md sections 14, 15, 16, 20 and 23)
// ---------------------------------------------------------------------------

/**
 * The civic landmark's title follows the settlement (PLAN.md 76.10). A
 * metropolis keeps "CITY HALL": a greater city is still run from one hall.
 */
export const CIVIC_TITLE: Record<SettlementTier, string> = {
  village: "VILLAGE CHAPEL",
  town: "TOWN HALL",
  city: "CITY HALL",
  metropolis: "CITY HALL",
};

/** The word a sentence uses for the settlement. A metropolis reads as a city. */
export const SETTLEMENT_WORD: Record<SettlementTier, string> = {
  village: "village",
  town: "town",
  city: "city",
  metropolis: "city",
};

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
export function planLandmarks(
  analysis: RepoAnalysis,
  tier: SettlementTier = "city",
): LandmarkSpec[] {
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
    title: CIVIC_TITLE[tier],
    subtitle: repo.fullName,
    description: `${band} ${SETTLEMENT_WORD[tier]}, health ${Math.round(metrics.health.score)} of 100.${
      metrics.archived ? " This repository is archived." : ""
    }`,
    reason: `Health ${Math.round(metrics.health.score)} of 100 puts the ${SETTLEMENT_WORD[tier]} in the "${band}" band; its strongest dimension is ${strongest}.`,
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
