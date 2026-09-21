import { describe, expect, it, vi } from "vitest";

import {
  analyzeSnapshot,
  buildInterpretInput,
  buildTreeOutline,
  type Interpreter,
  type StageEvent,
} from "./analyze";
import { planDistricts } from "./districts";
import { selectBuildings } from "./fileSelection";
import { computeMetrics } from "./metrics";
import { pruneTree } from "./tree";
import type { AiInterpretation, RepoAnalysis } from "@/types/analysis";
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
  expect(analysis.buildings.length).toBeLessThanOrEqual(300);
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
  expect(metrics.issues.ranked.length).toBeLessThanOrEqual(12);
  expect(metrics.pulls.ranked.length).toBeLessThanOrEqual(8);
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
      "Core District",
      "Safety District",
      "Knowledge District",
      "Demo District",
      "Operations District",
    ]);
    expect(analysis.buildings).toHaveLength(136);
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
    const analysis = await analyzeSnapshot(midSnapshot, { now: MID_NOW, interpreter: okInterpreter });
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
