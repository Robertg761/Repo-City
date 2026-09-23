/**
 * Brings every committed analysis fixture up to the current rules: writes
 * `settlement` (PLAN.md 76.4) and recomputes the crowd forms and heat
 * (76.7) from the fields each fixture stores.
 *
 *   node scripts/migrate-fixtures.ts           # rewrite fixtures/*.analysis.json
 *   node scripts/migrate-fixtures.ts --check   # exit 1 if any fixture is stale
 *
 * Captured fixtures predate the uncapped counts S1 adds, so the counts come
 * from what each fixture has: `surveyedFiles` stands in for `totalFiles`, and
 * `metrics.scale.dirs` for `totalDirs`, exactly as the 76.4 calibration table
 * does. A fixture whose warnings say the tree was capped or truncated gets
 * `lowerBound: true`, and its footprint is floored at the surveyed count plus
 * what the warnings say was left out (the "N lower-value files were left out"
 * and "N paths deeper than 6 levels" lines). For microsoft/vscode that floor
 * is well past 10,000, which is what makes it a metropolis.
 *
 * Forms: an issue's form is re-derived from its stored state, labels, title,
 * counts and `updatedAt` against the fixture's own `generatedAt`, then the
 * backlog's wrecks are capped exactly as `buildIssueBacklog` caps them. Pull
 * request forms are kept (see `migratePull`). Heat is re-derived from the
 * counts. Items without a `form` (the hand-written
 * sample predates forms) are left alone. The stored labels and title are the
 * compacted ones (4 labels of 32 characters, 140-character titles), so on the
 * rare item whose fifth label or 141st character would have decided it, a live
 * recapture can differ; the migration is the reference for committed fixtures.
 *
 * Nothing reads the clock, so re-running is a no-op. Each file keeps its own
 * JSON layout: the hand-written sample is pretty-printed, the captured ones
 * are single-line with `", "` separators, and the script refuses to touch a
 * file it cannot reproduce byte for byte before the change.
 */

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { capWrecks, heatOf, issueForm } from "../lib/analysis/forms.ts";
import { classifySettlement, type SettlementInput } from "../lib/analysis/settlement.ts";
import { daysBetween } from "../lib/analysis/tree.ts";
import type {
  BacklogIssue,
  BacklogPull,
  IncidentForm,
  IncidentState,
  RankedIssue,
  RankedPull,
  RepoAnalysis,
  SettlementPlan,
} from "../types/analysis.ts";

const FIXTURES = fileURLToPath(new URL("../fixtures/", import.meta.url));

/** Synthetic fixtures carry a settlement of their own choosing. */
const SYNTHETIC = new Set(["backlog.analysis.json", "stress.analysis.json"]);

const count = (text: string): number => Number(text.replace(/,/g, ""));

/** The classifier input for a captured analysis, reconstructed from its warnings. */
export function fixtureSettlementInput(analysis: RepoAnalysis): SettlementInput {
  const { scale, activity } = analysis.metrics;
  const warnings = analysis.warnings.join("\n");

  // A fixture captured through the settlement-era server (it carries
  // `coverage`) was classified on the uncapped tree counts, which only the
  // settlement records; `metrics.scale` holds the capped, pruned ones. Re-read
  // those counts rather than reconstructing them, so a recapture passes
  // `--check` and a threshold change still re-tiers it.
  if (analysis.coverage && analysis.settlement) {
    const { files, dirs, lowerBound } = analysis.settlement;
    return {
      files,
      dirs,
      lowerBound,
      footprintFloor: undefined,
      githubTruncated: lowerBound && /GitHub truncated the file tree/.test(warnings),
      archived: analysis.metrics.archived,
      commitsLast90d: activity.commitsLast90d,
      activeContributors90d: activity.activeContributors90d,
      lastPushDaysAgo: activity.lastPushDaysAgo,
    };
  }

  const cappedAway = /([\d,]+) lower-value files were left out/.exec(warnings);
  const tooDeep = /([\d,]+) paths deeper than \d+ levels were collapsed/.exec(warnings);
  const githubTruncated = /GitHub truncated the file tree/.test(warnings);
  const partial = /built from a partial survey/.test(warnings);
  const lowerBound = Boolean(cappedAway) || githubTruncated || partial || scale.lowerBound === true;

  const files = scale.totalFiles ?? scale.surveyedFiles ?? scale.files;
  const dirs = scale.totalDirs ?? scale.dirs;
  const leftOut = (cappedAway ? count(cappedAway[1]) : 0) + (tooDeep ? count(tooDeep[1]) : 0);

  return {
    files,
    dirs,
    lowerBound,
    footprintFloor: lowerBound ? files + 2 * dirs + leftOut : undefined,
    githubTruncated,
    archived: analysis.metrics.archived,
    commitsLast90d: activity.commitsLast90d,
    activeContributors90d: activity.activeContributors90d,
    lastPushDaysAgo: activity.lastPushDaysAgo,
  };
}

export function fixtureSettlement(analysis: RepoAnalysis): SettlementPlan {
  return classifySettlement(fixtureSettlementInput(analysis));
}

// ---------------------------------------------------------------------------
// Forms and heat (PLAN.md 76.7)
// ---------------------------------------------------------------------------

interface IssueFields {
  state: IncidentState;
  labels: string[];
  title: string;
  comments: number;
  reactions?: number;
  updatedAt: string;
}

function formOfIssue(issue: IssueFields, now: Date): IncidentForm {
  return issueForm({
    state: issue.state,
    labels: issue.labels,
    title: issue.title,
    comments: issue.comments,
    reactions: issue.reactions ?? 0,
    idleDays: daysBetween(issue.updatedAt, now),
  });
}

/** Replaces `form` and `heat` in place of the old values, keeping key order. */
function reshape<T extends { form?: unknown; heat?: unknown }>(
  item: T,
  form: T["form"],
  heat: number,
): T {
  const next = { ...item };
  if ("form" in item) next.form = form;
  if ("heat" in item) next.heat = heat;
  return next;
}

function migrateHeroIssue(issue: RankedIssue, now: Date): RankedIssue {
  if (issue.form === undefined) return issue;
  return reshape(issue, formOfIssue(issue, now), heatOf(issue.comments, issue.reactions ?? 0));
}

/**
 * Pull request forms keep their stored value: their rules have not changed,
 * and the stored `files` are cut to 5, which can tip the "more than half are
 * infrastructure" test the full list decided. Heat is re-derived.
 */
function migratePull<T extends BacklogPull | RankedPull>(pull: T): T {
  if (pull.heat === undefined) return pull;
  return reshape(pull, pull.form, heatOf(pull.comments, pull.reactions ?? 0));
}

/**
 * The analysis with every stored form and heat recomputed under the current
 * rules. Everything else, key order included, is kept.
 */
export function fixtureForms(analysis: RepoAnalysis): RepoAnalysis {
  const now = new Date(analysis.generatedAt);
  const { issues, pulls } = analysis.metrics;
  const backlogIssues = issues.backlog?.map(
    (issue): BacklogIssue =>
      reshape(issue, formOfIssue(issue, now), heatOf(issue.comments, issue.reactions)),
  );
  return {
    ...analysis,
    metrics: {
      ...analysis.metrics,
      issues: {
        ...issues,
        ranked: issues.ranked.map((issue) => migrateHeroIssue(issue, now)),
        ...(backlogIssues ? { backlog: capWrecks(backlogIssues) } : {}),
      },
      pulls: {
        ...pulls,
        ranked: pulls.ranked.map(migratePull),
        ...(pulls.backlog ? { backlog: pulls.backlog.map(migratePull) } : {}),
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Layout-preserving JSON
// ---------------------------------------------------------------------------

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/** Python's `json.dumps` default layout: one line, `", "` and `": "`. */
function compact(value: Json, asciiOnly: boolean): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => compact(item, asciiOnly)).join(", ")}]`;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value).map(
      ([key, item]) => `${quote(key, asciiOnly)}: ${compact(item, asciiOnly)}`,
    );
    return `{${entries.join(", ")}}`;
  }
  if (typeof value === "string") return quote(value, asciiOnly);
  return JSON.stringify(value);
}

function quote(text: string, asciiOnly: boolean): string {
  const json = JSON.stringify(text);
  if (!asciiOnly) return json;
  return json.replace(/[\u007f-￿]/g, (ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

/** The layout the captured fixtures are written in (`scripts/capture-fixtures.ts`). */
export function compactAsciiJson(value: unknown): string {
  return compact(JSON.parse(JSON.stringify(value)) as Json, true);
}

type Layout = (value: Json) => string;

const LAYOUTS: Record<string, Layout> = {
  pretty: (value) => `${JSON.stringify(value, null, 2)}\n`,
  "pretty-bare": (value) => JSON.stringify(value, null, 2),
  compact: (value) => compact(value, false),
  "compact-ascii": (value) => compact(value, true),
  "compact-newline": (value) => `${compact(value, false)}\n`,
  "compact-ascii-newline": (value) => `${compact(value, true)}\n`,
};

/** The serializer that reproduces `raw` exactly, or null. */
export function detectLayout(raw: string): Layout | null {
  const parsed = JSON.parse(raw) as Json;
  for (const layout of Object.values(LAYOUTS)) {
    if (layout(parsed) === raw) return layout;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  const check = process.argv.includes("--check");
  const names = readdirSync(FIXTURES)
    .filter((name) => name.endsWith(".analysis.json") && !SYNTHETIC.has(name))
    .sort();

  let stale = 0;
  for (const name of names) {
    const path = join(FIXTURES, name);
    const raw = readFileSync(path, "utf8");
    const layout = detectLayout(raw);
    if (!layout) throw new Error(`${name}: unrecognised JSON layout; refusing to rewrite it.`);

    const analysis = JSON.parse(raw) as RepoAnalysis;
    const settlement = fixtureSettlement(analysis);
    const next = layout(fixtureForms({ ...analysis, settlement }) as unknown as Json);
    const line = `${name}: ${settlement.tier} (footprint ${settlement.footprint}${settlement.lowerBound ? ", lower bound" : ""})`;

    if (next === raw) {
      console.log(`  ${line}, unchanged`);
      continue;
    }
    stale += 1;
    if (check) {
      console.log(`! ${line}, stale`);
    } else {
      writeFileSync(path, next, "utf8");
      console.log(`✓ ${line}`);
    }
  }
  if (check && stale > 0) process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
