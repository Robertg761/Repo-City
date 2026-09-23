/**
 * What an open issue or pull request looks like in the street (PLAN.md 76.7).
 *
 * Severity stays where it was: `classifyIssue` and `classifyPull` in
 * `metrics.ts` decide `major`/`collision`/`stale`/`minor` and
 * `active`/`slow`/`abandoned`/`completed`. The form decides the shape: a fire,
 * a wreck, a roadblock, a scaffold on the building the change touches. Rules
 * are first-match, read the lower-cased joined label text, and are exposed as
 * data so the inspector copy and the legend can name them.
 *
 * Pure: no clock (`now` is an argument), no randomness, no I/O. Imports
 * nothing from `metrics.ts`, which imports this module.
 */

import type {
  ConstructionState,
  DistrictPlan,
  IncidentForm,
  IncidentState,
  WorksForm,
} from "@/types/analysis";
import type { IssueSummary, PullChecks, PullReview } from "@/types/repository";
import { basename, clamp, daysBetween, dirname, round, segments } from "./tree.ts";

/* ----------------------------------------------------------------- labels */

/** PLAN.md section 11: what makes an issue a bug. */
export const BUG_LABEL = /bug|defect|regression|crash/i;
/** PLAN.md section 11: what makes a label severe. */
export const SEVERE_LABEL = /critical|p0|p1|high|urgent|security|blocker/i;

/** 76.7: `labels` is the lower-cased joined label text. */
export function labelText(labels: readonly string[]): string {
  return labels.join(" ").toLowerCase();
}

/* ------------------------------------------------------------- issue form */

/*
 * Content decides the form and age decides the weathering. An old issue keeps
 * the shape its labels or title give it, and the renderer rusts and dusts it
 * by `state` and idle days. Only an issue with nothing to say about itself
 * and two years of silence becomes a wreck, and wrecks are capped at a
 * quarter of the crowd (`capWrecks`), so an abandoned repository reads as
 * weathered, not as a scrapyard.
 */

/** Rule 1: security work is always a fire. */
const SECURITY_LABEL = /security|vulnerab|cve/;
/**
 * Rule 2: blocked, on hold, or waiting on someone. "triaged" is the opposite
 * of waiting, so `triage` must not match it.
 */
const ROADBLOCK_LABEL =
  /blocked|on[- ]?hold|waiting|awaiting|needs[- ]?(info|more|repro|reproduction|feedback|triage|investigation)|info(rmation)?[- ]?needed|triage(?!d)|question/;
/** Rule 3. */
const SIGNPOST_LABEL = /doc|typo|readme|website|example/;
/** Rule 4. */
const SURVEY_LABEL = /enhancement|feature|proposal|rfc|idea|suggestion|request|discussion/;
/** Rule 8's volunteer flag: the pothole anyone may fill. */
const VOLUNTEER_LABEL = /good[- ]first[- ]issue|help[- ]wanted/;

/*
 * Rule 6, the title, for issues whose labels say nothing. Read in this order:
 * documentation, then an explicit proposal, then a bug report, then a
 * question. Matched on the lower-cased title with curly apostrophes folded.
 */
const SIGNPOST_TITLE = /\b(docs|documentation|readme|typos?|changelog)\b/;
const SURVEY_TITLE =
  /^\W*(feature|feat|proposal|rfc|idea|suggestion|enhancement|request)\b|feature request|would be (nice|great|useful)|\bplease add\b|^(add|allow|support|introduce|implement|provide)\b|\boption to\b/;
const BUG_TITLE =
  /\b(bug|crash(es|ed|ing)?|error|exception|uncaught|fail(s|ed|ing|ure)?|broken|breaks|regression|freez(e|es|ing)|hang(s|ing)?|leak(s|ing)?|incorrect(ly)?|wrong)\b|(\bnot|n't) (work|open|load|start|show)|\bcannot\b|\bcan't\b|\bunable to\b|\bwill not\b/;
const QUESTION_TITLE = /\?\s*$|^\W*(how (to|do|can)|question)\b/;

/** Rule 7: an issue nobody has touched in two years is an abandoned car. */
export const WRECK_IDLE_DAYS = 730;
/** `capWrecks`: at most this share of the crowd is wrecks. */
export const WRECK_SHARE_MAX = 0.25;

export interface IssueFormInput {
  state: IncidentState;
  labels: readonly string[];
  /** Read only when the labels say nothing; omitted, it says nothing either. */
  title?: string;
  comments: number;
  reactions: number;
  /** Days since `updatedAt`. */
  idleDays: number;
}

/** The title rule's form (76.7 rule 6), or `null` when the title says nothing. */
export function titleForm(title: string): IncidentForm | null {
  const text = title.toLowerCase().replace(/[\u2018\u2019]/g, "'");
  if (SIGNPOST_TITLE.test(text)) return "signpost";
  if (SURVEY_TITLE.test(text)) return "survey";
  if (BUG_TITLE.test(text)) return "collision";
  if (QUESTION_TITLE.test(text)) return "roadblock";
  return null;
}

/**
 * 76.7 issue form, first match wins. Labels and content first, age last:
 *
 * 1. `fire`: state `major`, or a security label, or a severe bug with
 *    5 comments or 10 reactions;
 * 2. `roadblock`: blocked, on hold, waiting on someone, awaiting triage, or a
 *    question;
 * 3. `signpost`: docs, typos, the README, the website, examples;
 * 4. `survey`: enhancements, features, proposals, ideas, requests,
 *    discussions;
 * 5. `collision`: a bug label (state `collision` or `stale`; a stale bug is
 *    still a bug, and the renderer rusts it);
 * 6. the title, when no label spoke: documentation is a `signpost`, a
 *    proposal a `survey`, a bug report a `collision`, a question a
 *    `roadblock`;
 * 7. `wreck`: nothing above, and idle for two years;
 * 8. `pothole`: everything else.
 *
 * `capWrecks` then demotes the least significant wrecks past a quarter of the
 * crowd to potholes.
 */
export function issueForm(input: IssueFormInput): IncidentForm {
  const labels = labelText(input.labels);
  const isBug = BUG_LABEL.test(labels);
  const isSevere = SEVERE_LABEL.test(labels);

  if (
    input.state === "major" ||
    SECURITY_LABEL.test(labels) ||
    (isBug && isSevere && (input.comments >= 5 || input.reactions >= 10))
  ) {
    return "fire";
  }
  if (ROADBLOCK_LABEL.test(labels)) return "roadblock";
  if (SIGNPOST_LABEL.test(labels)) return "signpost";
  if (SURVEY_LABEL.test(labels)) return "survey";
  if (input.state === "collision" || input.state === "stale" || isBug) return "collision";
  const fromTitle = input.title ? titleForm(input.title) : null;
  if (fromTitle) return fromTitle;
  if (input.idleDays >= WRECK_IDLE_DAYS) return "wreck";
  return "pothole";
}

/**
 * Keeps wrecks to at most `share` of `items` (rounded up, so one ancient issue
 * in a village can still be a wreck). `items` must already be in significance
 * order: the first wrecks stay, and every wreck past the allowance becomes a
 * pothole. Everything else is returned as it is, in the same order; the input
 * is not mutated.
 */
export function capWrecks<T extends { form: IncidentForm }>(
  items: readonly T[],
  share: number = WRECK_SHARE_MAX,
): T[] {
  let allowed = Math.ceil(items.length * share);
  return items.map((item) => {
    if (item.form !== "wreck") return item;
    if (allowed > 0) {
      allowed -= 1;
      return item;
    }
    return { ...item, form: "pothole" };
  });
}

/** `issueForm` straight from a summary and its severity. */
export function issueFormFor(
  issue: Pick<IssueSummary, "labels" | "comments" | "reactions" | "updatedAt"> & { title?: string },
  state: IncidentState,
  now: Date,
): IncidentForm {
  return issueForm({
    state,
    labels: issue.labels,
    title: issue.title,
    comments: issue.comments,
    reactions: issue.reactions ?? 0,
    idleDays: daysBetween(issue.updatedAt, now),
  });
}

/**
 * 76.7 rule 8: "good first issue" and "help wanted" are potholes that carry a
 * volunteer flag in the inspector copy.
 */
export function wantsVolunteer(labels: readonly string[]): boolean {
  return VOLUNTEER_LABEL.test(labelText(labels));
}

/* ---------------------------------------------------------------- PR form */

/** Rule 1: bots and dependency bumps are utility works. */
const BOT_AUTHOR = /\[bot\]$|^dependabot|^renovate/i;
const DEPENDENCY_LABEL = /dependenc|deps|bump|renovate|dependabot/;
/** Rule 3. */
const TRENCH_LABEL = /\bci\b|build|infra|tooling|chore|refactor|perf|workflow|actions/;

/** Directories that hold CI, hooks and build scripts rather than the product. */
const INFRA_DIR = /^(\.github|\.circleci|\.buildkite|\.gitlab|\.husky|\.devcontainer|\.config|scripts|build|ci)$/i;

/** Build and configuration files, matched on the lower-cased basename. */
const CONFIG_FILE =
  /^(\..+|[^/]*\.config\.[cm]?[jt]s|tsconfig[^/]*\.json|jsconfig\.json|package\.json|package-lock\.json|npm-shrinkwrap\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|yarn\.lock|bun\.lockb?|turbo\.json|nx\.json|lerna\.json|vercel\.json|netlify\.toml|renovate\.json5?|biome\.jsonc?|deno\.jsonc?|deno\.lock|makefile|justfile|rakefile|cmakelists\.txt|dockerfile.*|[^/]*\.dockerfile|docker-compose[^/]*\.ya?ml|compose\.ya?ml|[^/]*\.gradle(\.kts)?|gradle\.properties|pom\.xml|cargo\.toml|cargo\.lock|go\.mod|go\.sum|pyproject\.toml|poetry\.lock|setup\.(py|cfg)|tox\.ini|noxfile\.py|requirements[^/]*\.txt|gemfile(\.lock)?|build\.(rs|zig|sh|ps1)|azure-pipelines\.ya?ml|jenkinsfile|codecov\.ya?ml)$/;

/**
 * True for a path under `.github/`, a build-script directory, or a build or
 * configuration file anywhere (76.7 PR rule 3).
 */
export function isInfraPath(path: string): boolean {
  const parts = segments(path);
  if (parts.length === 0) return false;
  if (parts.length > 1 && INFRA_DIR.test(parts[0])) return true;
  return CONFIG_FILE.test(basename(path).toLowerCase());
}

export interface PullFormInput {
  author: string | null;
  labels: readonly string[];
  draft: boolean;
  /** Touched paths; empty when enrichment did not run. */
  files: readonly string[];
}

/**
 * 76.7 PR form for an open pull request outside the heroes, first match wins:
 *
 * 1. `van`: a bot author, or a dependency label;
 * 2. `hoarding`: a draft, the fenced empty plot;
 * 3. `trench`: CI, build, tooling, chore, refactor or perf labels, or more
 *    than half the touched files are infrastructure;
 * 4. `scaffold`: everything else, on the building the change touches.
 *
 * `site` (the crane) is never returned: it is the hero assembly, chosen by the
 * generator, never by a rule.
 */
export function pullForm(input: PullFormInput): Exclude<WorksForm, "site"> {
  const labels = labelText(input.labels);
  if ((input.author !== null && BOT_AUTHOR.test(input.author)) || DEPENDENCY_LABEL.test(labels)) {
    return "van";
  }
  if (input.draft) return "hoarding";
  if (TRENCH_LABEL.test(labels)) return "trench";
  if (input.files.length > 0) {
    const infra = input.files.filter(isInfraPath).length;
    if (infra > input.files.length / 2) return "trench";
  }
  return "scaffold";
}

/* -------------------------------------------------------------- modifiers */

export type PullModifierId =
  | "checks-failing"
  | "changes-requested"
  | "approved"
  | "abandoned"
  | "slow";

export interface PullModifier {
  id: PullModifierId;
  /** What the renderer adds to the instance. */
  prop: "alarm-beacon" | "stop-board" | "green-flag" | "rust" | "dim";
  /** One inspector sentence, generated from the rule (PLAN.md section 12). */
  sentence: string;
}

/**
 * 76.7 PR modifiers, in drawing order. The fields they read (`checks`,
 * `review`, `state`) already travel on every `BacklogPull` and `RankedPull`,
 * so this is a pure function of the payload and needs no field of its own.
 */
export function pullModifiers(pull: {
  checks?: PullChecks | null;
  review?: PullReview | null;
  state: ConstructionState;
}): PullModifier[] {
  const out: PullModifier[] = [];
  if (pull.checks === "failing") {
    out.push({ id: "checks-failing", prop: "alarm-beacon", sentence: "Its checks are failing." });
  }
  if (pull.review === "changes-requested") {
    out.push({
      id: "changes-requested",
      prop: "stop-board",
      sentence: "A reviewer asked for changes.",
    });
  } else if (pull.review === "approved") {
    out.push({ id: "approved", prop: "green-flag", sentence: "A reviewer approved it." });
  }
  if (pull.state === "abandoned") {
    out.push({ id: "abandoned", prop: "rust", sentence: "Nobody is working on it." });
  } else if (pull.state === "slow") {
    out.push({ id: "slow", prop: "dim", sentence: "Work on it is slow." });
  }
  return out;
}

/* ------------------------------------------------------------------- heat */

/**
 * 76.7: `clamp(log2(1 + comments + 2 * reactions) / 7, 0, 1)`, rounded to
 * three places for the payload. 127 comments, or about 64 reactions, is
 * white-hot. Instance scale is `0.9 + 0.35 * heat`.
 */
export function heatOf(comments: number, reactions = 0): number {
  const c = Math.max(0, comments);
  const r = Math.max(0, reactions);
  return round(clamp(Math.log2(1 + c + 2 * r) / 7), 3);
}

/* ------------------------------------------------------------ relatedPath */

const PATH_TOKEN = /[\w.@-]+(?:\/[\w.@-]+)+/g;

/**
 * PLAN.md section 11: "if an issue title or body mentions a path that falls
 * inside a district, place the incident on a road adjacent to that district".
 * Returns the mentioned directory, or `null`.
 */
export function relatedPathFor(
  issue: Pick<IssueSummary, "title" | "bodyExcerpt">,
  districts: readonly DistrictPlan[],
): string | null {
  const text = `${issue.title}\n${issue.bodyExcerpt}`;
  const sources = districts
    .map((d) => d.sourcePath.replace(/^\/+/, "").replace(/\/+$/, ""))
    .filter(Boolean);
  if (sources.length === 0) return null;

  for (const raw of text.match(PATH_TOKEN) ?? []) {
    const token = raw.replace(/^\.\//, "").replace(/[).,:;]+$/, "");
    if (/^https?:/i.test(raw) || token.includes("://")) continue;
    const last = segments(token).at(-1) ?? "";
    // A trailing segment with an extension is a file: point at its directory.
    const candidate = /\.[a-z0-9]{1,8}$/i.test(last) ? dirname(token) : token;
    if (!candidate) continue;
    if (sources.some((src) => candidate === src || candidate.startsWith(`${src}/`))) {
      return candidate;
    }
  }
  return null;
}

/**
 * The deepest directory that holds more than half of `files`, or `null` when
 * only the repository root does. Deterministic: two different directories at
 * the same depth cannot both hold a majority.
 */
export function majorityDirectory(files: readonly string[]): string | null {
  const paths = files.map((file) => segments(file)).filter((parts) => parts.length > 0);
  if (paths.length === 0) return null;
  const counts = new Map<string, number>();
  for (const parts of paths) {
    // Every ancestor directory of the file, the file itself excluded.
    for (let depth = 1; depth < parts.length; depth++) {
      const dir = parts.slice(0, depth).join("/");
      counts.set(dir, (counts.get(dir) ?? 0) + 1);
    }
  }
  let best: string | null = null;
  let bestDepth = 0;
  for (const [dir, count] of counts) {
    if (count * 2 <= paths.length) continue;
    const depth = segments(dir).length;
    if (depth > bestDepth) {
      best = dir;
      bestDepth = depth;
    }
  }
  return best;
}

/**
 * 76.7 PR `relatedPath`: the deepest directory holding the majority of the
 * touched files; otherwise a path token in the title that falls inside a
 * district; otherwise `null`.
 */
export function pullRelatedPath(
  pull: { title: string; files?: readonly string[] },
  districts: readonly DistrictPlan[],
): string | null {
  return (
    majorityDirectory(pull.files ?? []) ??
    relatedPathFor({ title: pull.title, bodyExcerpt: "" }, districts)
  );
}
