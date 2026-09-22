/**
 * Writes `settlement` (PLAN.md 76.4) into every committed analysis fixture.
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
 * Nothing reads the clock, so re-running is a no-op. Each file keeps its own
 * JSON layout: the hand-written sample is pretty-printed, the captured ones
 * are single-line with `", "` separators, and the script refuses to touch a
 * file it cannot reproduce byte for byte before the change.
 */

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { classifySettlement, type SettlementInput } from "../lib/analysis/settlement.ts";
import type { RepoAnalysis, SettlementPlan } from "../types/analysis.ts";

const FIXTURES = fileURLToPath(new URL("../fixtures/", import.meta.url));

/** Synthetic fixtures carry a settlement of their own choosing. */
const SYNTHETIC = new Set(["backlog.analysis.json", "stress.analysis.json"]);

const count = (text: string): number => Number(text.replace(/,/g, ""));

/** The classifier input for a captured analysis, reconstructed from its warnings. */
export function fixtureSettlementInput(analysis: RepoAnalysis): SettlementInput {
  const { scale, activity } = analysis.metrics;
  const warnings = analysis.warnings.join("\n");

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
    const next = layout({ ...analysis, settlement } as unknown as Json);
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
