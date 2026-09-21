import { describe, expect, it } from "vitest";
import json from "./sample.analysis.json";
import type {
  ConstructionState,
  IncidentState,
  RepoAnalysis,
} from "@/types/analysis";

/**
 * `resolveJsonModule` widens every string literal in an imported JSON module to
 * `string` and every numeric literal to `number`, so `const a: RepoAnalysis =
 * json` can never compile for any JSON file. `Widen` applies the same widening
 * to the contract, which makes the assignment below a real structural check:
 * a missing, misspelled, or wrongly nested field in the fixture fails
 * `pnpm typecheck`. The literal unions that `Widen` erases (tier, band, kind,
 * landmark, incident and construction states) are asserted at runtime below,
 * and `scripts/make-sample-fixture.ts` builds the object as a fully typed
 * `RepoAnalysis`, so nothing is checked only loosely.
 */
type Widen<T> = T extends string
  ? string
  : T extends number
    ? number
    : T extends boolean
      ? boolean
      : T extends readonly (infer U)[]
        ? Widen<U>[]
        : T extends object
          ? { [K in keyof T]: Widen<T[K]> }
          : T;

const typeLevelCheck: Widen<RepoAnalysis> = json;
void typeLevelCheck;

const analysis = json as unknown as RepoAnalysis;

const INCIDENT_STATES: IncidentState[] = ["major", "collision", "stale", "minor"];
const CONSTRUCTION_STATES: ConstructionState[] = ["active", "slow", "abandoned", "completed"];

describe("sample.analysis.json", () => {
  it("is a fixture-sourced analysis with a matching seed", () => {
    expect(analysis.source).toBe("fixture");
    expect(analysis.seed).toBe("sample/repo-city@fixture0001");
    expect(analysis.seed).toBe(
      `${analysis.repo.owner}/${analysis.repo.name}@${analysis.repo.headSha}`,
    );
    expect(analysis.warnings).toEqual([]);
  });

  it("has six districts with unique ids and rooted source paths", () => {
    expect(analysis.districts).toHaveLength(6);
    const ids = analysis.districts.map((d) => d.id);
    expect(new Set(ids).size).toBe(6);
    expect(analysis.districts.map((d) => d.sourcePath)).toEqual([
      "/src",
      "/packages",
      "/docs",
      "/tests",
      "/examples",
      "/scripts",
    ]);
    for (const d of analysis.districts) {
      expect(d.fileCount).toBeGreaterThan(0);
      expect(d.weight).toBeGreaterThan(0);
    }
  });

  it("has about ninety buildings, all unique and all in a real district", () => {
    expect(analysis.buildings.length).toBe(90);
    expect(new Set(analysis.buildings.map((b) => b.id)).size).toBe(90);
    expect(new Set(analysis.buildings.map((b) => b.path)).size).toBe(90);

    const districtIds = new Set(analysis.districts.map((d) => d.id));
    for (const b of analysis.buildings) {
      expect(districtIds.has(b.districtId)).toBe(true);
      expect([1, 2, 3, 4, 5]).toContain(b.tier);
      expect(["file", "directory"]).toContain(b.kind);
      expect(b.score).toBeGreaterThan(0);
    }
  });

  it("mixes file and directory buildings and uses every tier", () => {
    const kinds = new Set(analysis.buildings.map((b) => b.kind));
    expect(kinds).toEqual(new Set(["file", "directory"]));
    const tiers = new Set(analysis.buildings.map((b) => b.tier));
    expect([...tiers].sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it("marks the civic landmark files", () => {
    const landmarks = analysis.buildings.filter((b) => b.landmark !== null);
    const byKind = Object.fromEntries(landmarks.map((b) => [b.landmark, b.path]));
    expect(byKind).toMatchObject({
      readme: "README.md",
      manifest: "package.json",
      contributing: "CONTRIBUTING.md",
      changelog: "CHANGELOG.md",
    });
    expect(landmarks.length).toBeLessThanOrEqual(6);
  });

  it("ranks five issues covering every incident state", () => {
    const ranked = analysis.metrics.issues.ranked;
    expect(ranked).toHaveLength(5);
    expect(new Set(ranked.map((i) => i.state))).toEqual(new Set(INCIDENT_STATES));
    for (const issue of ranked) {
      expect(INCIDENT_STATES).toContain(issue.state);
      expect(issue.url).toMatch(/^https:\/\/github\.com\/sample\/repo-city\/issues\/\d+$/);
      expect(issue.reason.length).toBeGreaterThan(10);
    }
    expect(analysis.metrics.issues.open).toBeGreaterThanOrEqual(ranked.length);
  });

  it("ranks three pulls as active, abandoned and completed", () => {
    const ranked = analysis.metrics.pulls.ranked;
    expect(ranked).toHaveLength(3);
    expect(ranked.map((p) => p.state)).toEqual(["active", "abandoned", "completed"]);
    for (const pull of ranked) {
      expect(CONSTRUCTION_STATES).toContain(pull.state);
      expect(pull.url).toMatch(/^https:\/\/github\.com\/sample\/repo-city\/pull\/\d+$/);
    }
    // Only the completed site corresponds to a merged pull request.
    expect(ranked.filter((p) => p.mergedAt !== null).map((p) => p.state)).toEqual(["completed"]);
  });

  it("carries the metric values the Monday milestone expects", () => {
    const { metrics } = analysis;
    expect(metrics.ci.state).toBe("healthy");
    expect(metrics.ci.provider).toBe("github-actions");
    expect(metrics.tests.strength).toBe(2);
    expect(metrics.docs.strength).toBe(3);
    expect(metrics.confidence.level).toBe("medium");
    expect(metrics.archived).toBe(false);
    expect(metrics.scale.tier).toBe("medium");
  });

  it("has a health score of 72 that its own breakdown reproduces", () => {
    const { health } = analysis.metrics;
    expect(health.score).toBe(72);
    expect(health.band).toBe("Healthy");
    const recomputed = Math.round(
      100 *
        (0.3 * health.breakdown.maintenance +
          0.25 * health.breakdown.reliability +
          0.2 * health.breakdown.documentation +
          0.15 * health.breakdown.organization +
          0.1 * health.breakdown.responsiveness),
    );
    expect(recomputed).toBe(health.score);
    for (const value of Object.values(health.breakdown)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it("includes an AI interpretation covering every district", () => {
    expect(analysis.aiStatus).toBe("ok");
    expect(analysis.ai).not.toBeNull();
    const ai = analysis.ai!;
    expect(ai.districts.map((d) => d.sourcePath)).toEqual(
      analysis.districts.map((d) => d.sourcePath),
    );
    expect(ai.organizationClarity).toBeGreaterThanOrEqual(0);
    expect(ai.organizationClarity).toBeLessThanOrEqual(1);
    expect(ai.strengths.length).toBeGreaterThan(0);
    expect(ai.concerns.length).toBeGreaterThan(0);
    expect(ai.model).toBe("claude-opus-5");
  });

  it("stays small enough to cross the wire comfortably", () => {
    expect(JSON.stringify(analysis).length).toBeLessThan(300_000);
  });
});
