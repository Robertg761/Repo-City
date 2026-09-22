/**
 * Generates `fixtures/stress.analysis.json` (PLAN.md 76.11 S9 and 76.13): the
 * largest city the product is allowed to build, for the performance gate.
 *
 * It starts from `fixtures/backlog.analysis.json` (S0's react fixture plus
 * 984 synthetic backlog issues and 490 synthetic backlog PRs) and fills every
 * remaining budget up to the metropolis ceiling:
 *
 *   - 450 buildings: react's 115 plus 335 synthetic ones, each under one of
 *     react's real directories so the districts keep react's proportions, and
 *     all of them re-tiered with the metropolis share table (76.5);
 *   - 16 hero issues and 10 hero PRs (8 open, then react's 2 merged), so
 *     every hero slot is taken: 16 + 984 = 1,000 issues and 10 + 490 = 500
 *     PRs, exactly the 76.1 ceilings;
 *   - an open issue total large enough that the overflow queue reaches its
 *     60-car maximum. 76.8's queue is `round(8 log10(hidden + 1))`, so 60
 *     cars needs about 27.4 million hidden issues. The number is absurd on
 *     purpose; this fixture measures the renderer, not a repository;
 *   - react's activity (score 1) and road network already buy the full 64
 *     moving cars, and its 51k forks four highways for the queue.
 *
 * Nothing reads the clock or `Math.random`, so re-running reproduces the
 * file byte for byte. Run it after regenerating the backlog fixture:
 *
 *   node scripts/make-stress-fixture.ts
 *
 * In development, type `stress` into the repository box to load it (once the
 * store registers the name) and add `?perf=1` for the overlay.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { SETTLEMENT_PARAMS } from "../lib/city/settlement.ts";
import { hashString, mulberry32 } from "../lib/city/prng.ts";
import type {
  BuildingPlan,
  BuildingTier,
  IncidentState,
  RankedIssue,
  RankedPull,
  RepoAnalysis,
} from "../types/analysis.ts";

const STRESS_BUILDINGS = 450;
const STRESS_HERO_ISSUES = 16;
const STRESS_HERO_PULLS = 10;
/** Past 27.4 million hidden, the queue is at its 60-car maximum. */
const STRESS_TOTAL_ISSUES = 30_000_000;
const STRESS_TOTAL_PULLS = 640;
const STRESS_SEED = "react/react@stress-v1";

const SOURCE = fileURLToPath(new URL("../fixtures/backlog.analysis.json", import.meta.url));
const OUT = fileURLToPath(new URL("../fixtures/stress.analysis.json", import.meta.url));

const DAY = 86_400_000;
const prng = mulberry32(hashString("repo-city/stress-fixture/v1"));

const round2 = (n: number): number => Math.round(n * 100) / 100;

const STEMS = [
  "Fiber", "Hooks", "Lane", "Scheduler", "Context", "Suspense", "Transition", "Hydration",
  "Portal", "Event", "Ref", "Effect", "Commit", "Work", "Update", "Profiler", "Cache", "Action",
  "Form", "Stream", "Flight", "Resource", "Host", "Root", "Offscreen", "Activity", "Memo",
];
const SUFFIXES = ["Loop", "Queue", "Tracker", "Utils", "Config", "Stack", "Scope", "Types", "Flags", "Log"];
const DIRECTORIES = ["src", "src/client", "src/server", "src/shared", "src/__tests__", "npm", "fixtures", "types"];
const EXTENSIONS = [".js", ".js", ".js", ".ts", ".tsx", ".rs"];

/** Cumulative metropolis tier cuts, tallest first: tier 5 gets the first 8%. */
function tierFor(rank: number, total: number): BuildingTier {
  const shares = SETTLEMENT_PARAMS.metropolis.tierShares;
  let cut = 0;
  for (const tier of [5, 4, 3, 2] as const) {
    cut += shares[tier];
    if (rank < Math.round(cut * total)) return tier;
  }
  return 1;
}

/** 335 synthetic buildings under react's real directory buildings. */
function extraBuildings(source: readonly BuildingPlan[], count: number): BuildingPlan[] {
  const parents = source.filter((b) => b.kind === "directory" && b.landmark === null);
  // Weighted by how much each directory holds, so `packages` stays the big district.
  const weights = parents.map((p) => Math.sqrt(p.descendantCount + 1));
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  const pickParent = (): BuildingPlan => {
    let roll = prng.next() * totalWeight;
    for (let i = 0; i < parents.length; i++) {
      roll -= weights[i];
      if (roll < 0) return parents[i];
    }
    return parents[parents.length - 1];
  };

  const taken = new Set(source.map((b) => b.path));
  const floor = Math.min(...source.map((b) => b.score));
  const out: BuildingPlan[] = [];
  while (out.length < count) {
    const parent = pickParent();
    const directory = prng.next() < 0.3;
    const name = `${prng.pick(STEMS)}${prng.pick(SUFFIXES)}`;
    const path = directory
      ? `${parent.path}/${prng.pick(DIRECTORIES)}/${name.toLowerCase()}`
      : `${parent.path}/${prng.pick(DIRECTORIES)}/React${name}${prng.pick(EXTENSIONS)}`;
    if (taken.has(path)) continue;
    taken.add(path);
    const extension = path.slice(path.lastIndexOf("."));
    out.push({
      id: "",
      path,
      kind: directory ? "directory" : "file",
      districtId: parent.districtId,
      // Below every real building, descending, so the real ones keep their rank.
      score: round2(floor - 0.01 - (out.length * 9) / count),
      tier: 1,
      descendantCount: directory ? prng.int(2, 40) : 0,
      language: directory
        ? parent.language
        : extension === ".rs"
          ? "Rust"
          : extension === ".js"
            ? "JavaScript"
            : "TypeScript",
      role: null,
      landmark: null,
    });
  }
  return out;
}

const HERO_ISSUE_STATES: readonly IncidentState[] = ["major", "collision", "minor", "stale"];
const HERO_ISSUE_TITLES = [
  "Crash in the reconciler when a suspended tree unmounts during a transition",
  "Two roots updating the same external store render conflicting snapshots",
  "useEffect cleanup runs twice after a hydration mismatch in production",
  "Old report: memory keeps growing with a long-lived portal",
];
const HERO_ISSUE_REASONS: Record<IncidentState, string> = {
  major: "A bug with heavy discussion and a severe label: a fire.",
  collision: "Two reports that contradict each other: a collision.",
  minor: "An open bug with a little discussion: a minor incident.",
  stale: "An unresolved bug that has stayed open for years.",
};

function main(): void {
  const backlog = JSON.parse(readFileSync(SOURCE, "utf8")) as RepoAnalysis;
  const now = Date.parse(backlog.generatedAt);
  const iso = (daysAgo: number): string => new Date(now - Math.round(daysAgo * DAY)).toISOString();
  const url = backlog.repo.url;

  // Buildings: react's, then the synthetic ones, re-tiered and renumbered.
  const real = backlog.buildings;
  const all = [...real, ...extraBuildings(real, STRESS_BUILDINGS - real.length)];
  const ranked = all.filter((b) => b.landmark === null).sort((a, b) => b.score - a.score);
  const tiers = new Map(ranked.map((b, rank) => [b.path, tierFor(rank, ranked.length)]));
  const buildings: BuildingPlan[] = all.map((b, i) => ({
    ...b,
    id: `b-${String(i + 1).padStart(3, "0")}`,
    tier: tiers.get(b.path) ?? b.tier,
  }));

  // Numbers nobody uses yet, for the extra heroes.
  const taken = new Set<number>([
    ...backlog.metrics.issues.ranked.map((i) => i.number),
    ...backlog.metrics.pulls.ranked.map((p) => p.number),
    ...(backlog.metrics.issues.backlog ?? []).map((i) => i.number),
    ...(backlog.metrics.pulls.backlog ?? []).map((p) => p.number),
  ]);
  let cursor = 39_000;
  const nextNumber = (): number => {
    do cursor += prng.int(1, 7);
    while (taken.has(cursor));
    taken.add(cursor);
    return cursor;
  };
  const pathsWithCode = buildings.filter((b) => b.landmark === null).map((b) => b.path);

  const heroIssues = [...backlog.metrics.issues.ranked];
  const lowestIssue = Math.min(...heroIssues.map((i) => i.score));
  for (let i = 0; heroIssues.length < STRESS_HERO_ISSUES; i++) {
    const state = HERO_ISSUE_STATES[i % HERO_ISSUE_STATES.length];
    const number = nextNumber();
    const idle = state === "stale" ? 400 : prng.range(0, 10);
    const issue: RankedIssue = {
      number,
      title: HERO_ISSUE_TITLES[i % HERO_ISSUE_TITLES.length],
      url: `${url}/issues/${number}`,
      createdAt: iso(idle + prng.range(10, 300)),
      updatedAt: iso(idle),
      comments: prng.int(8, 90),
      labels: ["Type: Bug"],
      author: "synthetic",
      bodyExcerpt: "Synthetic hero issue for the stress fixture.",
      reactions: prng.int(0, 40),
      score: round2(lowestIssue - 0.1 * (i + 1)),
      state,
      reason: HERO_ISSUE_REASONS[state],
      relatedPath: prng.pick(pathsWithCode),
    };
    heroIssues.push(issue);
  }

  // Open heroes first, merged last, as `classifyPull`'s ranking orders them.
  const open = backlog.metrics.pulls.ranked.filter((p) => p.state !== "completed");
  const merged = backlog.metrics.pulls.ranked.filter((p) => p.state === "completed");
  const lowestPull = Math.min(...open.map((p) => p.score));
  for (let i = 0; open.length + merged.length < STRESS_HERO_PULLS; i++) {
    const number = nextNumber();
    const idle = prng.range(0, 5);
    const pull: RankedPull = {
      number,
      title: `Synthetic hero pull request ${i + 1} for the stress fixture`,
      url: `${url}/pull/${number}`,
      createdAt: iso(idle + prng.range(1, 20)),
      updatedAt: iso(idle),
      mergedAt: null,
      draft: false,
      comments: prng.int(0, 12),
      labels: ["CLA Signed"],
      author: "synthetic",
      score: round2(lowestPull - 0.1 * (i + 1)),
      state: "active",
      reason: "An open pull request updated this week: active construction.",
      relatedPath: prng.pick(pathsWithCode),
    };
    open.push(pull);
  }

  const analysis: RepoAnalysis = {
    ...backlog,
    seed: STRESS_SEED,
    buildings,
    metrics: {
      ...backlog.metrics,
      issues: { ...backlog.metrics.issues, ranked: heroIssues, total: STRESS_TOTAL_ISSUES },
      pulls: { ...backlog.metrics.pulls, ranked: [...open, ...merged], total: STRESS_TOTAL_PULLS },
    },
    warnings: [
      ...backlog.warnings.filter((w) => !w.startsWith("Synthetic backlog fixture")),
      "Synthetic stress fixture: 335 of the buildings, 6 of the heroes, the whole crowd and the open totals are invented.",
    ],
    source: "fixture",
    totalsExact: true,
    settlement: { ...backlog.settlement!, tier: "metropolis" },
  };

  writeFileSync(OUT, `${JSON.stringify(analysis)}\n`, "utf8");
  console.log(
    `wrote ${OUT}: ${buildings.length} buildings, ${heroIssues.length} hero issues, ` +
      `${open.length + merged.length} hero PRs, ${analysis.metrics.issues.backlog?.length ?? 0} crowd issues, ` +
      `${analysis.metrics.pulls.backlog?.length ?? 0} crowd PRs`,
  );
}

main();
