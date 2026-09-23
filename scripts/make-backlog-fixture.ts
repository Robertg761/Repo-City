/**
 * Generates `fixtures/backlog.analysis.json` (PLAN.md 76.11, S0): the react
 * fixture plus 984 synthetic open issues and 490 synthetic open pull requests
 * in `metrics.issues.backlog` / `metrics.pulls.backlog`, tier metropolis.
 *
 * With the 12 hero issues and 8 hero PRs react already carries, that is 996
 * issues and 498 PRs to draw, which is the scale 76.13 budgets for. It exists
 * so the crowd layer, the overflow and the HUD can be built and measured
 * before ingestion (S1) and interpretation (S2) produce real backlogs.
 *
 * Forms are assigned round-robin, so every form appears about equally often,
 * on purpose: the fixture exists to exercise every crowd shape at scale, not
 * to show a realistic mix, so `migrate-fixtures` leaves its forms alone.
 * Severity (`state`) follows the form where 76.7 ties them together: a fire
 * is `major`, a wreck `stale`, a collision `collision`.
 *
 * The base is frozen: the react capture the crowd was first built on (before
 * the settlement round) is read back out of this fixture itself, with the
 * synthetic crowd, totals and warning taken off (`backlogBase`). It never
 * reads `fixtures/react__react.analysis.json`, which has since been
 * recaptured, so a recapture cannot move this fixture or the stress fixture
 * built on it. Nothing reads the clock or `Math.random`, so re-running
 * reproduces the file byte for byte.
 *
 *   node scripts/make-backlog-fixture.ts
 *
 * In development, type `backlog` into the repository box to load it.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { hashString, mulberry32, type Prng } from "../lib/city/prng.ts";
import type {
  BacklogIssue,
  BacklogPull,
  ConstructionState,
  IncidentForm,
  IncidentState,
  RepoAnalysis,
  WorksForm,
} from "../types/analysis.ts";
import type { PullChecks, PullReview } from "../types/repository.ts";

export const BACKLOG_ISSUES = 984;
export const BACKLOG_PULLS = 490;
/** Repository totals, above what is drawn so the overflow queue has work to do. */
export const TOTAL_ISSUES = 1_320;
export const TOTAL_PULLS = 560;

/** Both the frozen base and the output: see `backlogBase`. */
export const FIXTURE = fileURLToPath(new URL("../fixtures/backlog.analysis.json", import.meta.url));

export const SYNTHETIC_WARNING =
  "Synthetic backlog fixture: the crowd issues and pull requests are invented.";

const DAY = 86_400_000;
const SEED = "repo-city/backlog-fixture/v1";

const ISSUE_FORMS: readonly IncidentForm[] = [
  "fire",
  "collision",
  "wreck",
  "pothole",
  "roadblock",
  "survey",
  "signpost",
];
const WORKS_FORMS: readonly Exclude<WorksForm, "site">[] = ["scaffold", "trench", "van", "hoarding"];

const STATE_FOR_FORM: Record<IncidentForm, IncidentState> = {
  fire: "major",
  collision: "collision",
  wreck: "stale",
  pothole: "minor",
  roadblock: "minor",
  survey: "minor",
  signpost: "minor",
};

const LABELS_FOR_FORM: Record<IncidentForm, readonly string[][]> = {
  fire: [["Type: Bug", "Severity: Critical"], ["Type: Security"]],
  collision: [["Type: Bug", "Status: Unconfirmed"], ["Type: Bug"]],
  wreck: [["Type: Bug", "Resolution: Stale"], ["Status: Stale"]],
  pothole: [["Type: Bug"], ["good first issue"], ["Type: Bug", "help wanted"]],
  roadblock: [["Status: Needs Info"], ["Type: Question"], ["Status: Blocked"]],
  survey: [["Type: Feature Request"], ["Type: Enhancement"], ["RFC"]],
  signpost: [["Type: Docs"], ["Component: Website"], ["Type: Docs", "good first issue"]],
};

const ISSUE_TITLE: Record<IncidentForm, readonly string[]> = {
  fire: ["Crash in {m} after upgrading", "{m} throws on hydration in production", "Security: {m} escapes unsafely"],
  collision: ["{m} and {n} disagree about state", "Conflicting updates between {m} and {n}"],
  wreck: ["Old report: {m} leaks on unmount", "{m} warning never cleared"],
  pothole: ["Minor glitch in {m}", "{m} logs a spurious warning", "Off-by-one in {m}"],
  roadblock: ["Question: how should {m} handle {n}?", "Cannot reproduce {m} issue without more info"],
  survey: ["Proposal: let {m} accept {n}", "Feature request: {m} support for {n}"],
  signpost: ["Docs: {m} example is out of date", "Typo in the {m} readme"],
};

const PULL_TITLE: Record<Exclude<WorksForm, "site">, readonly string[]> = {
  scaffold: ["Fix {m} edge case", "Refine {m} when {n} changes", "[{m}] handle empty {n}"],
  trench: ["Build: speed up {m} CI", "Refactor {m} internals", "chore: tidy {m} tooling"],
  van: ["Bump {n} in /{m}", "chore(deps): update {n}"],
  hoarding: ["[WIP] Experiment with {m}", "Draft: rework {m}"],
};

const NOUNS = ["effects", "refs", "context", "suspense", "transitions", "events", "portals", "keys"];
const PEOPLE = ["ada", "grace", "linus", "margaret", "ken", "barbara", "dennis", "frances", "alan", "radia"];
const BOTS = ["dependabot[bot]", "renovate[bot]"];
const REVIEWS: readonly (PullReview | null)[] = ["approved", "changes-requested", "review-required", null];
const CHECKS: readonly (PullChecks | null)[] = ["passing", "failing", "pending", null];
const PULL_STATES: readonly Exclude<ConstructionState, "completed">[] = ["active", "slow", "abandoned"];

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));
const round2 = (n: number): number => Math.round(n * 100) / 100;

/** PLAN.md 76.7's heat. */
const heatOf = (comments: number, reactions: number): number =>
  round2(clamp(Math.log2(1 + comments + 2 * reactions) / 7, 0, 1));

function title(prng: Prng, templates: readonly string[], module: string): string {
  const noun = prng.pick(NOUNS);
  return prng.pick(templates).replace("{m}", module).replace("{n}", noun).slice(0, 140);
}

/**
 * The react capture this fixture was built on: the fixture with its synthetic
 * crowd, totals and warning taken off. Every other field, the settlement
 * included, is already what `buildBacklogFixture` would write over it.
 */
export function backlogBase(fixture: RepoAnalysis): RepoAnalysis {
  const { issues, pulls } = fixture.metrics;
  const { backlog: _issueBacklog, total: _issueTotal, ...issuesBase } = issues;
  const { backlog: _pullBacklog, total: _pullTotal, ...pullsBase } = pulls;
  void _issueBacklog;
  void _issueTotal;
  void _pullBacklog;
  void _pullTotal;
  return {
    ...fixture,
    metrics: { ...fixture.metrics, issues: issuesBase, pulls: pullsBase },
    warnings: fixture.warnings.filter((warning) => warning !== SYNTHETIC_WARNING),
  };
}

/** The fixture built on `react`, a fresh PRNG each call. */
export function buildBacklogFixture(react: RepoAnalysis): RepoAnalysis {
  const prng = mulberry32(hashString(SEED));
  const now = Date.parse(react.generatedAt);
  const iso = (daysAgo: number): string => new Date(now - Math.round(daysAgo * DAY)).toISOString();

  const paths = react.buildings.map((b) => b.path);
  const moduleName = (path: string): string => path.split("/").filter(Boolean).pop() ?? path;

  const taken = new Set<number>([
    ...react.metrics.issues.ranked.map((i) => i.number),
    ...react.metrics.pulls.ranked.map((p) => p.number),
  ]);
  let cursor = 38_000;
  const nextNumber = (): number => {
    do cursor -= prng.int(1, 9);
    while (taken.has(cursor));
    taken.add(cursor);
    return cursor;
  };

  const issues: BacklogIssue[] = [];
  for (let i = 0; i < BACKLOG_ISSUES; i++) {
    const form = ISSUE_FORMS[i % ISSUE_FORMS.length];
    const state = STATE_FOR_FORM[form];
    const related = i % 5 === 4 ? null : prng.pick(paths);
    const idle = state === "stale" ? prng.range(200, 900) : prng.range(0, 120) * (i / BACKLOG_ISSUES + 0.2);
    const age = idle + prng.range(1, 700);
    const comments = Math.floor(prng.next() ** 2 * 60);
    const reactions = Math.floor(prng.next() ** 3 * 80);
    issues.push({
      number: nextNumber(),
      title: title(prng, ISSUE_TITLE[form], related ? moduleName(related) : prng.pick(NOUNS)),
      createdAt: iso(age),
      updatedAt: iso(idle),
      comments,
      reactions,
      labels: prng.pick(LABELS_FOR_FORM[form]).slice(0, 4),
      author: prng.pick(PEOPLE),
      state,
      form,
      score: round2(10 - (9 * i) / BACKLOG_ISSUES),
      relatedPath: related,
      heat: heatOf(comments, reactions),
    });
  }

  const pulls: BacklogPull[] = [];
  for (let i = 0; i < BACKLOG_PULLS; i++) {
    const form = WORKS_FORMS[i % WORKS_FORMS.length];
    const state = PULL_STATES[Math.floor(i / WORKS_FORMS.length) % PULL_STATES.length];
    const idle = state === "active" ? prng.range(0, 7) : state === "slow" ? prng.range(8, 45) : prng.range(46, 400);
    const comments = Math.floor(prng.next() ** 2 * 30);
    const reactions = Math.floor(prng.next() ** 3 * 20);
    const files = Array.from({ length: prng.int(0, 5) }, () => prng.pick(paths));
    const related = files[0] ?? (i % 3 === 0 ? null : prng.pick(paths));
    pulls.push({
      number: nextNumber(),
      title: title(prng, PULL_TITLE[form], related ? moduleName(related) : prng.pick(NOUNS)),
      createdAt: iso(idle + prng.range(0, 60)),
      updatedAt: iso(idle),
      draft: form === "hoarding",
      comments,
      reactions,
      labels: form === "van" ? ["dependencies"] : form === "trench" ? ["CLA Signed", "Type: Build"] : ["CLA Signed"],
      author: form === "van" ? prng.pick(BOTS) : prng.pick(PEOPLE),
      state,
      form,
      score: round2(10 - (9 * i) / BACKLOG_PULLS),
      relatedPath: related,
      files: [...new Set(files)],
      review: REVIEWS[i % REVIEWS.length],
      checks: CHECKS[Math.floor(i / 2) % CHECKS.length],
      heat: heatOf(comments, reactions),
    });
  }

  const analysis: RepoAnalysis = {
    ...react,
    metrics: {
      ...react.metrics,
      issues: { ...react.metrics.issues, total: TOTAL_ISSUES, backlog: issues },
      pulls: { ...react.metrics.pulls, total: TOTAL_PULLS, backlog: pulls },
    },
    warnings: [...react.warnings, SYNTHETIC_WARNING],
    source: "fixture",
    totalsExact: true,
    settlement: { ...react.settlement!, tier: "metropolis" },
  };
  return analysis;
}

/** The file `buildBacklogFixture` writes. */
export function serializeFixture(analysis: RepoAnalysis): string {
  return `${JSON.stringify(analysis)}\n`;
}

function main(): void {
  const committed = JSON.parse(readFileSync(FIXTURE, "utf8")) as RepoAnalysis;
  const analysis = buildBacklogFixture(backlogBase(committed));
  const { issues, pulls } = analysis.metrics;
  writeFileSync(FIXTURE, serializeFixture(analysis), "utf8");
  console.log(
    `wrote ${FIXTURE}: ${issues.backlog!.length} backlog issues, ${pulls.backlog!.length} backlog pulls, ` +
      `tier ${analysis.settlement!.tier}`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
