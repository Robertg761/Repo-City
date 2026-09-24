import { describe, expect, it, vi } from "vitest";

import {
  analyzeSnapshot,
  buildInterpretInput,
  buildTreeOutline,
  type Interpreter,
  type StageEvent,
} from "./analyze";
import { planDistricts } from "./districts";
import { BUILDING_CAP, selectBuildings } from "./fileSelection";
import { SETTLEMENT_PARAMS } from "@/lib/city/settlement";
import { computeMetrics } from "./metrics";
import { pruneTree } from "./tree";
import type { AiInterpretation, RepoAnalysis } from "@/types/analysis";
import type { RepositorySnapshot } from "@/types/repository";
import { PAYLOAD_CEILING, buildIssueBacklog } from "./backlog";
import { syntheticIssues, withBacklog } from "./__fixtures__/backlog";
import { syntheticTree } from "./__fixtures__/syntheticTree";
import { ARCHIVED_NOW, archivedSnapshot } from "./__fixtures__/archived.snapshot";
import { MID_NOW, midSnapshot } from "./__fixtures__/mid.snapshot";

/** Asserts the shape every consumer of `RepoAnalysis` relies on. */
function expectValidAnalysis(analysis: RepoAnalysis): void {
  expect(analysis.repo.fullName).toMatch(/^[\w.-]+\/[\w.-]+$/);
  expect(analysis.seed).toBe(
    `${analysis.repo.owner}/${analysis.repo.name}@${analysis.repo.headSha}`,
  );
  expect(analysis.source).toBe("live");
  expect(() => new Date(analysis.generatedAt).toISOString()).not.toThrow();
  expect(Array.isArray(analysis.warnings)).toBe(true);

  expect(analysis.districts.length).toBeGreaterThan(0);
  expect(analysis.districts.length).toBeLessThanOrEqual(9);
  const districtIds = new Set(analysis.districts.map((d) => d.id));
  expect(districtIds.size).toBe(analysis.districts.length);

  expect(analysis.buildings.length).toBeGreaterThan(0);
  // PLAN.md 76.5: the settlement tier's budget, never past the absolute cap.
  const budget = SETTLEMENT_PARAMS[analysis.settlement?.tier ?? "city"].buildings;
  expect(analysis.buildings.length).toBeLessThanOrEqual(Math.min(budget.max, BUILDING_CAP));
  for (const building of analysis.buildings) {
    expect(districtIds.has(building.districtId)).toBe(true);
    expect([1, 2, 3, 4, 5]).toContain(building.tier);
    expect(["file", "directory"]).toContain(building.kind);
  }

  const { metrics } = analysis;
  expect(metrics.health.score).toBeGreaterThanOrEqual(0);
  expect(metrics.health.score).toBeLessThanOrEqual(100);
  expect(["Critical", "Struggling", "Mixed", "Healthy", "Thriving"]).toContain(metrics.health.band);
  expect(["low", "medium", "high"]).toContain(metrics.confidence.level);
  expect(metrics.confidence.reasons.length).toBeGreaterThan(0);
  expect(metrics.issues.ranked.length).toBeLessThanOrEqual(16);
  expect(metrics.pulls.ranked.length).toBeLessThanOrEqual(10);
  for (const value of Object.values(metrics.health.breakdown)) {
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThanOrEqual(1);
  }
}

describe("analyzeSnapshot without an interpreter", () => {
  it("produces a valid analysis for the mid fixture", async () => {
    const analysis = await analyzeSnapshot(midSnapshot, { now: MID_NOW });
    expectValidAnalysis(analysis);

    expect(analysis.aiStatus).toBe("skipped");
    expect(analysis.ai).toBeNull();
    expect(analysis.metrics.health.score).toBe(92);
    expect(analysis.metrics.health.band).toBe("Thriving");
    expect(analysis.metrics.confidence.level).toBe("high");
    expect(analysis.districts.map((d) => d.name)).toEqual([
      "The Foundry",
      "Proving Grounds",
      "The Library",
      "The Showrooms",
      "Maintenance Depot",
    ]);
    // 136 files make a town (footprint 224), whose budget is 30 to 120: the
    // file level is too many, so the depth-3 folders stand instead.
    expect(analysis.settlement!.tier).toBe("town");
    expect(analysis.buildings).toHaveLength(56);
    expect(analysis.warnings).toEqual([]);
  });

  it("produces a valid analysis for the archived fixture", async () => {
    const analysis = await analyzeSnapshot(archivedSnapshot, { now: ARCHIVED_NOW });
    expectValidAnalysis(analysis);

    expect(analysis.aiStatus).toBe("skipped");
    expect(analysis.metrics.archived).toBe(true);
    expect(analysis.metrics.health.score).toBe(23);
    expect(analysis.metrics.health.band).toBe("Struggling");
    expect(analysis.metrics.ci.state).toBe("none");
    expect(analysis.metrics.confidence.level).toBe("medium");
  });

  it("reports the ai stage as done with detail skipped", async () => {
    const events: StageEvent[] = [];
    await analyzeSnapshot(midSnapshot, { now: MID_NOW, onStage: (e) => events.push(e) });
    expect(events).toContainEqual({ type: "stage", id: "ai", status: "done", detail: "skipped" });
    expect(events.at(-1)?.id).toBe("done");
  });

  it("is deterministic apart from generatedAt", async () => {
    const a = await analyzeSnapshot(midSnapshot, { now: MID_NOW });
    const b = await analyzeSnapshot(midSnapshot, { now: MID_NOW });
    expect(a).toEqual(b);
  });

  it("warns and lowers confidence when the tree was truncated", async () => {
    const truncated = {
      ...midSnapshot,
      tree: { ...midSnapshot.tree, truncated: true },
    };
    const analysis = await analyzeSnapshot(truncated, { now: MID_NOW });
    expect(analysis.warnings.join(" ")).toMatch(/partial survey/);
    expect(analysis.metrics.confidence.level).toBe("medium");
  });

  it("classifies the settlement from the surveyed counts and activity (PLAN.md 76.4)", async () => {
    const analysis = await analyzeSnapshot(midSnapshot, { now: MID_NOW });
    const settlement = analysis.settlement!;
    const { scale } = analysis.metrics;
    expect(settlement.files).toBe(scale.surveyedFiles ?? scale.files);
    expect(settlement.footprint).toBe(settlement.files + 2 * settlement.dirs);
    expect(settlement.lowerBound).toBe(false);
    expect(settlement.activity.commitsLast90d).toBe(analysis.metrics.activity.commitsLast90d);
    expect(settlement.reason).toMatch(/^\d[\d,]* files? in \d[\d,]* folders? make/);
  });

  it("never promotes the archived fixture", async () => {
    const analysis = await analyzeSnapshot(archivedSnapshot, { now: ARCHIVED_NOW });
    expect(analysis.settlement!.promoted).toBe(false);
    expect(analysis.settlement!.tier).toBe(analysis.settlement!.baseTier);
  });

  it("prefers ingestion's uncapped totals and treats a GitHub truncation as a metropolis", async () => {
    const withTotals = {
      ...midSnapshot,
      tree: { ...midSnapshot.tree, totalFiles: 700, totalDirs: 50 },
    };
    const counted = await analyzeSnapshot(withTotals, { now: MID_NOW });
    expect(counted.settlement!.footprint).toBe(800);
    expect(counted.settlement!.baseTier).toBe("city");

    const truncated = {
      ...midSnapshot,
      tree: { ...midSnapshot.tree, truncated: true, githubTruncated: true },
    };
    const huge = await analyzeSnapshot(truncated, { now: MID_NOW });
    expect(huge.settlement!.tier).toBe("metropolis");
    expect(huge.settlement!.lowerBound).toBe(true);
  });

  it("floors a capped tree's footprint at the entries that survived the exclusions", async () => {
    const capped = {
      ...midSnapshot,
      tree: { ...midSnapshot.tree, truncated: true, totalEntries: 12_000 },
    };
    const analysis = await analyzeSnapshot(capped, { now: MID_NOW });
    expect(analysis.settlement!.lowerBound).toBe(true);
    expect(analysis.settlement!.footprint).toBe(12_000);
    expect(analysis.settlement!.baseTier).toBe("metropolis");
  });
});

/* ------------------------------------------------------------ interpreter */

const INTERPRETATION: AiInterpretation = {
  summary: "A small request pipeline split into router, cache, HTTP and plugins.",
  districts: [
    {
      sourcePath: "/src",
      name: "Pipeline Works",
      purpose: "The request pipeline: routing, caching, transport and plugins.",
      evidence: ["src/index.ts", "src/router/dispatch.ts", "src/nope/missing.ts"],
    },
    {
      sourcePath: "/nonexistent",
      name: "Ghost District",
      purpose: "Should be ignored.",
      evidence: [],
    },
  ],
  importantModules: [
    { path: "src/router/dispatch.ts", role: "Resolves a request to a handler", evidence: ["src/router/dispatch.ts"] },
    { path: "src/cache/lru.ts", role: "Bounded response cache", evidence: [] },
  ],
  strengths: ["Adapters isolate every platform difference."],
  concerns: ["The scheduler starves low-priority work."],
  organizationClarity: 0.9,
  model: "stub-model-1",
};

const okInterpreter: Interpreter = async () => ({ status: "ok", interpretation: INTERPRETATION });

describe("analyzeSnapshot with an interpreter", () => {
  it("renames the matched district, sets a purpose and reports aiStatus ok", async () => {
    const analysis = await analyzeSnapshot(midSnapshot, { now: MID_NOW, interpreter: okInterpreter });
    expectValidAnalysis(analysis);

    expect(analysis.aiStatus).toBe("ok");
    expect(analysis.ai?.model).toBe("stub-model-1");
    const src = analysis.districts.find((d) => d.sourcePath === "/src");
    expect(src?.name).toBe("Pipeline Works");
    expect(src?.purpose).toMatch(/request pipeline/);
  });

  it("does not add, remove or re-path districts", async () => {
    const plain = await analyzeSnapshot(midSnapshot, { now: MID_NOW });
    const interpreted = await analyzeSnapshot(midSnapshot, {
      now: MID_NOW,
      interpreter: okInterpreter,
    });
    expect(interpreted.districts.map((d) => d.sourcePath)).toEqual(
      plain.districts.map((d) => d.sourcePath),
    );
    expect(interpreted.districts.some((d) => d.name === "Ghost District")).toBe(false);
  });

  it("sets role on the buildings the interpretation names", async () => {
    // A city-sized tree, so every file stands as its own building.
    const asCity = { ...midSnapshot, tree: { ...midSnapshot.tree, totalFiles: 700, totalDirs: 50 } };
    const analysis = await analyzeSnapshot(asCity, { now: MID_NOW, interpreter: okInterpreter });
    expect(analysis.settlement!.tier).toBe("city");
    const dispatch = analysis.buildings.find((b) => b.path === "src/router/dispatch.ts");
    expect(dispatch?.role).toBe("Resolves a request to a handler");
    expect(analysis.buildings.find((b) => b.path === "src/utils/uuid.ts")?.role).toBeNull();
  });

  it("drops evidence paths that are not in the tree and warns", async () => {
    const analysis = await analyzeSnapshot(midSnapshot, { now: MID_NOW, interpreter: okInterpreter });
    expect(analysis.ai?.districts[0].evidence).toEqual([
      "src/index.ts",
      "src/router/dispatch.ts",
    ]);
    expect(analysis.warnings.join(" ")).toMatch(/evidence path/);
  });

  it("feeds organizationClarity into the organization sub-score", async () => {
    const plain = await analyzeSnapshot(midSnapshot, { now: MID_NOW });
    const low = await analyzeSnapshot(midSnapshot, {
      now: MID_NOW,
      interpreter: async () => ({
        status: "ok",
        interpretation: { ...INTERPRETATION, organizationClarity: 0 },
      }),
    });
    expect(low.metrics.health.breakdown.organization).toBeLessThan(
      plain.metrics.health.breakdown.organization,
    );
    expect(low.metrics.health.breakdown.organization).toBeCloseTo(
      0.6 * plain.metrics.health.breakdown.organization,
      2,
    );
  });

  it("emits the ai stage running then done", async () => {
    const events: StageEvent[] = [];
    await analyzeSnapshot(midSnapshot, {
      now: MID_NOW,
      interpreter: okInterpreter,
      onStage: (e) => events.push(e),
    });
    const ai = events.filter((e) => e.id === "ai");
    expect(ai.map((e) => e.status)).toEqual(["running", "done"]);
    expect(ai[1].detail).toBe("stub-model-1");
  });

  it("still builds the city when the interpreter fails", async () => {
    const events: StageEvent[] = [];
    const analysis = await analyzeSnapshot(midSnapshot, {
      now: MID_NOW,
      onStage: (e) => events.push(e),
      interpreter: async () => ({ status: "failed", interpretation: null }),
    });
    expectValidAnalysis(analysis);
    expect(analysis.aiStatus).toBe("failed");
    expect(analysis.ai).toBeNull();
    expect(analysis.warnings.join(" ")).toMatch(/interpretation unavailable/i);
    expect(events.filter((e) => e.id === "ai").map((e) => e.status)).toEqual(["running", "failed"]);
  });

  it("treats a thrown interpreter exactly like a failure", async () => {
    const analysis = await analyzeSnapshot(midSnapshot, {
      now: MID_NOW,
      interpreter: async () => {
        throw new Error("timeout");
      },
    });
    expect(analysis.aiStatus).toBe("failed");
    expectValidAnalysis(analysis);
  });

  it("honours a skipped interpreter", async () => {
    const analysis = await analyzeSnapshot(midSnapshot, {
      now: MID_NOW,
      interpreter: async () => ({ status: "skipped", interpretation: null }),
    });
    expect(analysis.aiStatus).toBe("skipped");
  });

  it("does not change the health score when only the district names change", async () => {
    const plain = await analyzeSnapshot(midSnapshot, { now: MID_NOW });
    const interpreted = await analyzeSnapshot(midSnapshot, {
      now: MID_NOW,
      interpreter: async () => ({
        status: "ok",
        interpretation: { ...INTERPRETATION, organizationClarity: plain.metrics.health.breakdown.organization },
      }),
    });
    expect(interpreted.metrics.health.score).toBe(plain.metrics.health.score);
  });
});

/* ---------------------------------------------- settlements (PLAN.md 76) */

const DIRS = ["src/router", "src/cache", "src/http", "docs/guides", "examples/cli"];

/**
 * What the pre-settlement ingestion saw of `snapshot`: the same health sample
 * of issues, no bulk pages, and only the 50 most recently updated open pull
 * requests (the old single `per_page=50` request) beside the merged ones.
 */
function todaysView(snapshot: RepositorySnapshot): RepositorySnapshot {
  const open = snapshot.pulls
    .filter((p) => p.state === "open" && p.mergedAt === null)
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || b.number - a.number)
    .slice(0, 50);
  const rest = snapshot.pulls.filter((p) => !(p.state === "open" && p.mergedAt === null));
  return {
    ...snapshot,
    issueBacklog: undefined,
    openTotals: undefined,
    coverage: undefined,
    pulls: [...open, ...rest],
  };
}

describe("health invariance (PLAN.md 76.1 decision 6, 76.14)", () => {
  const cases = [
    ["mid", midSnapshot, MID_NOW],
    ["archived", archivedSnapshot, ARCHIVED_NOW],
  ] as const;

  it.each(cases)(
    "%s: a 1,000-issue backlog leaves health and confidence exactly as they were",
    async (_name, snapshot, now) => {
      const plain = await analyzeSnapshot(snapshot, { now });
      const giant = withBacklog(snapshot, { now, issues: 1_000, pulls: 0, dirs: DIRS });
      const withIt = await analyzeSnapshot(giant, { now });
      expect(withIt.metrics.health).toEqual(plain.metrics.health);
      expect(withIt.metrics.confidence).toEqual(plain.metrics.confidence);
      expect(withIt.metrics.issues.open).toBe(plain.metrics.issues.open);
      expect(withIt.metrics.issues.staleShare).toBe(plain.metrics.issues.staleShare);
      expect(withIt.metrics.issues.backlog!.length).toBeGreaterThan(900);
    },
  );

  it.each(cases)(
    "%s: 500 open pull requests give the health the first 50 would have given",
    async (_name, snapshot, now) => {
      const giant = withBacklog(snapshot, { now, issues: 1_000, pulls: 500, dirs: DIRS });
      const before = await analyzeSnapshot(todaysView(giant), { now });
      const after = await analyzeSnapshot(giant, { now });
      expect(after.metrics.health).toEqual(before.metrics.health);
      expect(after.metrics.confidence).toEqual(before.metrics.confidence);
      expect(after.metrics.pulls.open).toBe(50);
      expect(after.metrics.pulls.staleShare).toBe(before.metrics.pulls.staleShare);
      expect(after.metrics.pulls.backlog!.length).toBeGreaterThan(before.metrics.pulls.backlog!.length);
    },
  );

  it("keeps the settlement independent of the backlog too", async () => {
    const plain = await analyzeSnapshot(midSnapshot, { now: MID_NOW });
    const giant = await analyzeSnapshot(
      withBacklog(midSnapshot, { now: MID_NOW, issues: 1_000, pulls: 500, dirs: DIRS }),
      { now: MID_NOW },
    );
    expect(giant.settlement).toEqual(plain.settlement);
    expect(giant.buildings).toEqual(plain.buildings);
  });
});

describe("analyzeSnapshot with a settlement-era survey (PLAN.md 76.6, 76.7)", () => {
  const giantSnapshot = withBacklog(midSnapshot, { now: MID_NOW, issues: 1_200, pulls: 600, dirs: DIRS });

  it("carries the real totals, the coverage and whether the totals are exact", async () => {
    const analysis = await analyzeSnapshot(giantSnapshot, { now: MID_NOW });
    expect(analysis.metrics.issues.total).toBe(giantSnapshot.openTotals!.issues);
    expect(analysis.metrics.pulls.total).toBe(giantSnapshot.openTotals!.pulls);
    expect(analysis.coverage).toEqual(giantSnapshot.coverage);
    expect(analysis.totalsExact).toBe(true);
  });

  it("fills 1,000 issues and 500 pull requests, heroes included", async () => {
    const { metrics } = await analyzeSnapshot(giantSnapshot, { now: MID_NOW });
    expect(metrics.issues.ranked).toHaveLength(16);
    expect(metrics.issues.ranked.length + metrics.issues.backlog!.length).toBe(1_000);
    const openHeroes = metrics.pulls.ranked.filter((r) => r.state !== "completed");
    expect(openHeroes).toHaveLength(8);
    expect(metrics.pulls.ranked.filter((r) => r.state === "completed")).toHaveLength(2);
    expect(openHeroes.length + metrics.pulls.backlog!.length).toBe(500);
  });

  it("gives heroes a form, a heat and, for pull requests, a relatedPath from the touched files", async () => {
    const { metrics } = await analyzeSnapshot(giantSnapshot, { now: MID_NOW });
    for (const hero of metrics.issues.ranked) {
      expect(hero.form).toBeDefined();
      expect(hero.heat).toBeGreaterThanOrEqual(0);
    }
    const enriched = metrics.pulls.ranked.filter((r) => r.files && r.files.length > 0);
    expect(enriched.length).toBeGreaterThan(0);
    for (const hero of enriched) {
      expect(hero.files!.length).toBeLessThanOrEqual(5);
      expect(hero.relatedPath).not.toBeNull();
    }
    for (const hero of metrics.pulls.ranked) {
      if (hero.state === "completed") expect(hero.form).toBe("site");
      else expect(hero.form).not.toBe("site");
    }
  });

  it("omits totals and coverage for a snapshot from the old ingestion", async () => {
    const analysis = await analyzeSnapshot(midSnapshot, { now: MID_NOW });
    expect(analysis.metrics.issues.total).toBeUndefined();
    expect(analysis.metrics.pulls.total).toBeUndefined();
    expect(analysis).not.toHaveProperty("coverage");
    expect(analysis).not.toHaveProperty("totalsExact");
    // The sample's non-heroes are still the crowd.
    expect(analysis.metrics.issues.backlog).toHaveLength(30 - 16);
  });

  it("marks estimated totals as inexact", async () => {
    const estimated = {
      ...giantSnapshot,
      openTotals: { ...giantSnapshot.openTotals!, exact: false, source: "estimate" as const },
    };
    expect((await analyzeSnapshot(estimated, { now: MID_NOW })).totalsExact).toBe(false);
  });

  it("builds a metropolis past its building floor", async () => {
    const huge = {
      ...midSnapshot,
      tree: {
        truncated: false,
        totalEntries: 12_000,
        entries: syntheticTree(8_000),
        totalFiles: 8_000,
        totalDirs: 1_500,
      },
    };
    const analysis = await analyzeSnapshot(huge, { now: MID_NOW });
    expect(analysis.settlement!.tier).toBe("metropolis");
    expect(analysis.buildings.length).toBeGreaterThanOrEqual(300);
    expect(analysis.buildings.length).toBeLessThanOrEqual(450);
  });
});

describe("payload ceiling (PLAN.md 76.6)", () => {
  it("keeps the maximal synthetic analysis under 1 MB", async () => {
    const now = MID_NOW;
    const long = withBacklog(
      {
        ...midSnapshot,
        tree: {
          truncated: true,
          totalEntries: 100_000,
          entries: syntheticTree(5_000),
          totalFiles: 90_000,
          totalDirs: 10_000,
          githubTruncated: true,
        },
        // A full health sample of long issues, as request A1 returns it.
        issues: syntheticIssues(100, { now, start: 99_000, dirs: DIRS, long: true }),
      },
      { now, issues: 1_500, pulls: 700, dirs: DIRS, long: true },
    );
    const analysis = await analyzeSnapshot(long, { now, interpreter: okInterpreter });
    const bytes = new TextEncoder().encode(JSON.stringify(analysis)).length;
    expect(analysis.buildings.length).toBe(450);
    expect(bytes).toBeLessThanOrEqual(PAYLOAD_CEILING);

    // Every string at its limit is more than 1 MB of crowd, so the least
    // significant tail of each list is trimmed, in proportion, and queues.
    const { issues, pulls } = analysis.metrics;
    expect(issues.backlog!.length).toBeGreaterThan(600);
    expect(pulls.backlog!.length).toBeGreaterThan(250);
    const full = buildIssueBacklog(long, issues.ranked, analysis.districts, now);
    expect(issues.backlog).toEqual(full.slice(0, issues.backlog!.length));
    expect(issues.total).toBe(long.openTotals!.issues);
  });

  it("trims nothing from a giant with realistic titles, labels and paths", async () => {
    const giant = withBacklog(
      {
        ...midSnapshot,
        tree: { ...midSnapshot.tree, entries: syntheticTree(5_000), totalFiles: 20_000, totalDirs: 6_000 },
      },
      { now: MID_NOW, issues: 2_000, pulls: 800, dirs: DIRS },
    );
    const analysis = await analyzeSnapshot(giant, { now: MID_NOW, interpreter: okInterpreter });
    const { issues, pulls } = analysis.metrics;
    expect(issues.ranked.length + issues.backlog!.length).toBe(1_000);
    expect(pulls.ranked.filter((r) => r.state !== "completed").length + pulls.backlog!.length).toBe(500);
    expect(new TextEncoder().encode(JSON.stringify(analysis)).length).toBeLessThan(700_000);
  });
});

describe("buildInterpretInput (PLAN.md section 28)", () => {
  const pruned = pruneTree(midSnapshot.tree.entries);
  const districts = planDistricts(pruned);
  const buildings = selectBuildings(pruned, districts, {});
  const metrics = computeMetrics(midSnapshot, districts, { now: MID_NOW, prunedEntries: pruned });
  const input = buildInterpretInput(midSnapshot, districts, buildings, metrics);

  it("sends the tree as an indented outline no deeper than three levels", () => {
    const lines = input.treeOutline.split("\n");
    expect(lines.length).toBeLessThanOrEqual(600);
    for (const line of lines) {
      expect(line.match(/^ */)?.[0].length ?? 0).toBeLessThanOrEqual(4);
    }
    expect(input.treeOutline).toContain("src/");
    expect(input.treeOutline).not.toContain("node_modules");
  });

  it("caps the outline at 600 lines", () => {
    const big = Array.from({ length: 2000 }, (_, i) => ({
      path: `src/f${i}.ts`,
      type: "blob" as const,
      size: 100,
    }));
    expect(buildTreeOutline(big).split("\n")).toHaveLength(600);
  });

  it("sends the README and up to three manifests, budgeted", () => {
    expect(input.readme.length).toBeGreaterThan(100);
    expect(input.readme.length).toBeLessThanOrEqual(6000);
    expect(input.manifests.length).toBeLessThanOrEqual(3);
    expect(input.manifests.map((m) => m.path)).toContain("package.json");
    for (const manifest of input.manifests) expect(manifest.content.length).toBeLessThanOrEqual(2000);
  });

  it("sends workflow names and paths only, never workflow bodies", () => {
    expect(input.workflows).toEqual([
      { name: "CI", path: ".github/workflows/ci.yml" },
      { name: "Release", path: ".github/workflows/release.yml" },
    ]);
  });

  it("sends a factual metrics summary, the districts and the buildings", () => {
    expect(input.metricsSummary).toContain("ci: healthy");
    expect(input.metricsSummary).toContain("files: 136");
    expect(input.districts).toHaveLength(districts.length);
    expect(input.buildings).toHaveLength(buildings.length);
  });

  it("never sends issue bodies or source files", () => {
    const serialized = JSON.stringify(input);
    expect(serialized).not.toContain("Navigating twice within one tick");
  });

  it("is what the interpreter actually receives", async () => {
    const spy = vi.fn<Interpreter>(async () => ({ status: "skipped", interpretation: null }));
    await analyzeSnapshot(midSnapshot, { now: MID_NOW, interpreter: spy });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0].repo.fullName).toBe("hackyard/atlas");
  });
});
