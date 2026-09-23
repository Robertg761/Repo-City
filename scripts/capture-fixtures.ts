/**
 * Re-captures the committed reference analyses from a running server.
 *
 *   pnpm dev --port 3152 &
 *   node scripts/capture-fixtures.ts                      # the section 59 set
 *   node scripts/capture-fixtures.ts honojs/hono atom/atom
 *   node scripts/capture-fixtures.ts --base=http://localhost:3152 --dry-run pmndrs/zustand
 *
 * Each repository goes through `/api/analyze` exactly as the app asks for it,
 * so a fixture is byte for byte what the hosted route serves: the settlement,
 * the uncapped counts, the backlog, the open totals, coverage and enrichment
 * (PLAN.md 76.6). The file is named after the name that was asked for, which is
 * what `lib/github/fixtures.ts` looks up when GitHub rate-limits the app, so
 * `facebook/react` and `react/react` each get a file (the second one is a cache
 * hit on the first, because the route caches under the canonical name too).
 *
 * Files are written in the single-line `", "` layout the earlier captures
 * used. `--dry-run` writes nothing and only prints the summary, which is how
 * the 76.4 calibration numbers for repositories without a fixture are read.
 *
 * Surveys run one after another, never in parallel: the shared token is rate
 * limited and each giant costs about 35 REST and 5 GraphQL requests.
 */

import { writeFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";
import type { RepoAnalysis } from "../types/analysis.ts";

// `lib/city` imports some siblings without an extension, which the bundler
// resolves and bare `node` does not (see scripts/city-stats.ts).
registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (specifier.startsWith(".") && !/\.[cm]?[jt]s$/.test(specifier)) {
        return nextResolve(`${specifier}.ts`, context);
      }
      throw error;
    }
  },
});

const { generateCity } = await import("../lib/city/generator.ts");
const { compactAsciiJson } = await import("./migrate-fixtures.ts");

const FIXTURES = fileURLToPath(new URL("../fixtures/", import.meta.url));

/** PLAN.md section 59's reference set, as the committed fixtures name it. */
export const REFERENCE_SET = [
  "sindresorhus/p-limit",
  "honojs/hono",
  "atom/atom",
  "vercel/turborepo",
  "facebook/react",
  "react/react",
  "microsoft/vscode",
];

export function fixtureFileFor(requested: string): string {
  const [owner, repo] = requested.toLowerCase().split("/");
  return `${owner}__${repo}.analysis.json`;
}

interface StreamLine {
  type: string;
  id?: string;
  status?: string;
  detail?: string;
  code?: string;
  message?: string;
  analysis?: RepoAnalysis;
}

async function survey(base: string, repo: string, clientId: string): Promise<RepoAnalysis> {
  const response = await fetch(`${base}/api/analyze?repo=${encodeURIComponent(repo)}`, {
    // Each survey gets its own client id so the route's own per-IP limiter
    // (10 per 10 minutes) never refuses a capture run.
    headers: { "x-forwarded-for": clientId },
  });
  const text = await response.text();
  let result: RepoAnalysis | null = null;
  for (const raw of text.split("\n")) {
    if (raw.trim() === "") continue;
    const line = JSON.parse(raw) as StreamLine;
    if (line.type === "error") throw new Error(`${repo}: ${line.code} ${line.message ?? ""}`);
    if (line.type === "stage" && line.detail) {
      process.stderr.write(`  [${line.status}] ${line.id} — ${line.detail}\n`);
    }
    if (line.type === "result" && line.analysis) result = line.analysis;
  }
  if (!result) throw new Error(`${repo}: the stream ended without a result`);
  return result;
}

function summary(analysis: RepoAnalysis, bytes: number): string {
  const { scale, issues, pulls } = analysis.metrics;
  const settlement = analysis.settlement;
  const city = generateCity(analysis);
  const overflow = city.overflow;
  const crowdIssues = city.backlog?.incidents.length ?? 0;
  const crowdPulls = city.backlog?.constructionSites.length ?? 0;
  return [
    `${analysis.repo.fullName}: ${settlement?.tier ?? "(no settlement)"}` +
      ` (base ${settlement?.baseTier ?? "?"}, footprint ${settlement?.footprint ?? "?"}` +
      `${settlement?.lowerBound ? ", lower bound" : ""})`,
    // The uncapped counts ride on the settlement; `metrics.scale` holds the
    // capped and pruned ones the buildings are chosen from.
    `  files ${settlement?.files ?? "?"} / dirs ${settlement?.dirs ?? "?"} uncapped;` +
      ` surveyed ${scale.surveyedFiles ?? "?"}; pruned ${scale.files} files ${scale.dirs} dirs`,
    `  reason: ${settlement?.reason ?? ""}`,
    `  buildings ${analysis.buildings.length} (city ${city.buildings.length}),` +
      ` heroes ${city.incidents.length} incidents / ${city.constructionSites.length} sites,` +
      ` crowd ${crowdIssues} issues / ${crowdPulls} PRs`,
    `  open totals: ${issues.total ?? "?"} issues, ${pulls.total ?? "?"} PRs` +
      `${analysis.totalsExact === false ? " (about)" : ""};` +
      ` backlog ${issues.backlog?.length ?? 0} issues, ${pulls.backlog?.length ?? 0} PRs`,
    overflow
      ? `  overflow: issues drawn ${overflow.issues.drawn} hidden ${overflow.issues.hidden} of ${overflow.issues.total};` +
        ` PRs drawn ${overflow.pulls.drawn} hidden ${overflow.pulls.hidden} of ${overflow.pulls.total}; queue ${overflow.queue.length} cars`
      : "  overflow: none",
    `  coverage: ${analysis.coverage ? JSON.stringify(analysis.coverage) : "(none)"}`,
    `  payload ${(bytes / 1024).toFixed(1)} KB; warnings: ${analysis.warnings.join(" | ") || "none"}`,
  ].join("\n");
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const base = args.find((arg) => arg.startsWith("--base="))?.slice(7) ?? "http://localhost:3152";
  const repos = args.filter((arg) => !arg.startsWith("--"));
  const targets = repos.length > 0 ? repos : REFERENCE_SET;

  let failures = 0;
  for (const [index, repo] of targets.entries()) {
    process.stderr.write(`surveying ${repo} through ${base}\n`);
    const started = Date.now();
    try {
      const analysis = await survey(base, repo, `10.99.0.${index + 1}`);
      const text = compactAsciiJson(analysis);
      const bytes = Buffer.byteLength(text);
      const seconds = ((Date.now() - started) / 1000).toFixed(1);
      if (!dryRun) writeFileSync(`${FIXTURES}${fixtureFileFor(repo)}`, text, "utf8");
      console.log(`${dryRun ? "·" : "✓"} ${repo} in ${seconds} s -> ${dryRun ? "(dry run)" : fixtureFileFor(repo)}`);
      console.log(summary(analysis, bytes));
    } catch (error) {
      failures += 1;
      console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return failures > 0 ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = await main();
}
