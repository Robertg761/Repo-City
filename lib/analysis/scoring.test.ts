import { describe, expect, it } from "vitest";

import { planDistricts } from "./districts";
import { computeMetrics, type MetricsCore, type StructureMetrics } from "./metrics";
import {
  computeConfidence,
  computeHealth,
  documentationScore,
  healthBand,
  maintenanceScore,
  organizationScore,
  recentlyTouchedIssues,
  reliabilityScore,
  responsivenessScore,
} from "./scoring";
import { pruneTree } from "./tree";
import { ARCHIVED_NOW, archivedSnapshot } from "./__fixtures__/archived.snapshot";
import { emptySnapshot, treeFromPaths } from "./__fixtures__/helpers";
import { MID_NOW, midSnapshot } from "./__fixtures__/mid.snapshot";

/** A neutral `MetricsCore` whose every sub-score is zero unless overridden. */
function core(over: Partial<MetricsCore> = {}): MetricsCore {
  return {
    scale: { files: 0, dirs: 0, languages: {}, tier: "tiny" },
    activity: {
      commitsLast30d: 0,
      commitsLast90d: 0,
      activeContributors90d: 0,
      lastPushDaysAgo: 1000,
      score: 0,
    },
    issues: { open: 0, ranked: [], staleShare: 0 },
    pulls: { open: 0, ranked: [], staleShare: 0 },
    ci: { state: "none", provider: "none", failureRate: 0, recentRuns: 0 },
    tests: { strength: 0, signals: [] },
    docs: { strength: 0, signals: [], readmeLength: 0 },
    tooling: { signals: [] },
    releases: { count: 0, lastDaysAgo: null, cadence: "none" },
    archived: false,
    ...over,
  };
}

const structure = (value: number): StructureMetrics => ({
  rootFileCount: 8,
  topLevelDirs: 4,
  balance: value,
  structure: value,
});

describe("sub-scores (PLAN.md section 23)", () => {
  it("maintenance is 0.4*recency + 0.3*(1-staleIssues) + 0.3*(1-stalePrs)", () => {
    const value = maintenanceScore(
      core({
        activity: { ...core().activity, lastPushDaysAgo: 10 },
        issues: { open: 10, ranked: [], staleShare: 0.5 },
        pulls: { open: 4, ranked: [], staleShare: 0.25 },
      }),
    );
    expect(value).toBeCloseTo(0.4 * 1 + 0.3 * 0.5 + 0.3 * 0.75, 6);
  });

  it("maintenance steps down through the recency bands", () => {
    const at = (days: number) =>
      maintenanceScore(core({ activity: { ...core().activity, lastPushDaysAgo: days } }));
    expect(at(29)).toBeCloseTo(1, 6);
    expect(at(60)).toBeCloseTo(0.88, 6);
    expect(at(200)).toBeCloseTo(0.76, 6);
    expect(at(800)).toBeCloseTo(0.66, 6);
  });

  it("reliability is 0.4*ci + 0.35*tests + 0.25*tooling", () => {
    const value = reliabilityScore(
      core({
        ci: { state: "recent-failure", provider: "github-actions", failureRate: 0.1, recentRuns: 10 },
        tests: { strength: 2, signals: [] },
        tooling: { signals: ["lint: ESLint", "format: Prettier"] },
      }),
    );
    expect(value).toBeCloseTo(0.4 * 0.6 + 0.35 * 0.75 + 0.25 * 0.5, 6);
  });

  it("treats a missing CI as 0.3, better than a failing one", () => {
    const none = reliabilityScore(core());
    const failing = reliabilityScore(
      core({ ci: { state: "failing", provider: "github-actions", failureRate: 0.8, recentRuns: 20 } }),
    );
    expect(none).toBeGreaterThan(failing);
  });

  it("documentation scales the README term by length up to 2000 characters", () => {
    const half = documentationScore(core({ docs: { strength: 1, signals: ["readme"], readmeLength: 1000 } }));
    expect(half).toBeCloseTo(0.175, 6);
    const full = documentationScore(
      core({
        docs: {
          strength: 3,
          signals: ["readme", "docs-dir", "contributing", "examples", "changelog"],
          readmeLength: 9000,
        },
      }),
    );
    expect(full).toBeCloseTo(1, 6);
  });

  it("organization uses structure alone without an interpretation", () => {
    expect(organizationScore(structure(0.8), null)).toBeCloseTo(0.8, 6);
    expect(organizationScore(structure(0.8), undefined)).toBeCloseTo(0.8, 6);
  });

  it("organization blends in the AI clarity at 40 percent when present", () => {
    expect(organizationScore(structure(0.8), 0.3)).toBeCloseTo(0.6 * 0.8 + 0.4 * 0.3, 6);
  });

  it("responsiveness treats zero open issues as nothing to answer", () => {
    expect(responsivenessScore(core({ activity: { ...core().activity, activeContributors90d: 5 } }), 0)).toBeCloseTo(1, 6);
  });

  it("responsiveness is half issue touch rate, half contributor breadth", () => {
    const value = responsivenessScore(
      core({
        issues: { open: 10, ranked: [], staleShare: 0 },
        activity: { ...core().activity, activeContributors90d: 2 },
      }),
      4,
    );
    expect(value).toBeCloseTo(0.5 * 0.4 + 0.5 * 0.4, 6);
  });
});

describe("computeHealth", () => {
  it("is Critical when every signal is absent", () => {
    // Not zero: an abandoned repository with no open issues and no open pull
    // requests has nothing stale, and "no CI" scores 0.3 rather than 0 because
    // PLAN.md section 62 forbids reading a missing workflow as a failure.
    const health = computeHealth({ core: core(), structure: structure(0) }, 0);
    expect(health.score).toBe(28);
    expect(health.band).toBe("Struggling");
  });

  it("returns 100 for a perfect repository", () => {
    const perfect = core({
      activity: {
        commitsLast30d: 40,
        commitsLast90d: 120,
        activeContributors90d: 9,
        lastPushDaysAgo: 1,
        score: 1,
      },
      issues: { open: 4, ranked: [], staleShare: 0 },
      pulls: { open: 2, ranked: [], staleShare: 0 },
      ci: { state: "healthy", provider: "github-actions", failureRate: 0, recentRuns: 30 },
      tests: { strength: 3, signals: [] },
      docs: {
        strength: 3,
        signals: ["readme", "docs-dir", "contributing", "examples", "changelog"],
        readmeLength: 4000,
      },
      tooling: { signals: ["lint: a", "format: b", "typecheck: c", "build: d"] },
    });
    const health = computeHealth({ core: perfect, structure: structure(1), aiOrganization: 1 }, 4);
    expect(health.score).toBe(100);
    expect(health.band).toBe("Thriving");
  });

  it("weights the five sub-scores 30/25/20/15/10", () => {
    const inputs = {
      core: core({
        activity: { ...core().activity, lastPushDaysAgo: 5, activeContributors90d: 5 },
        ci: { state: "healthy", provider: "github-actions" as const, failureRate: 0, recentRuns: 5 },
        tests: { strength: 3 as const, signals: [] },
        tooling: { signals: ["lint: a", "format: b", "typecheck: c", "build: d"] },
      }),
      structure: structure(0.5),
    };
    const health = computeHealth(inputs, 0);
    const expected =
      0.3 * maintenanceScore(inputs.core) +
      0.25 * reliabilityScore(inputs.core) +
      0.2 * documentationScore(inputs.core) +
      0.15 * 0.5 +
      0.1 * responsivenessScore(inputs.core, 0);
    expect(health.score).toBe(Math.round(100 * expected));
  });

  it("reports the breakdown alongside the score", () => {
    const health = computeHealth({ core: core(), structure: structure(0.5) }, 0);
    expect(Object.keys(health.breakdown).sort()).toEqual([
      "documentation",
      "maintenance",
      "organization",
      "reliability",
      "responsiveness",
    ]);
    expect(health.breakdown.organization).toBeCloseTo(0.5, 3);
  });
});

describe("stars and forks never affect health (PLAN.md sections 21 and 22)", () => {
  const healthFor = (stars: number, forks: number): number => {
    const snapshot = {
      ...midSnapshot,
      repo: { ...midSnapshot.repo, stars, forks },
    };
    const districts = planDistricts(pruneTree(snapshot.tree.entries));
    const { core: computed, structure: computedStructure } = computeMetrics(snapshot, districts, {
      now: MID_NOW,
    });
    return computeHealth(
      { core: computed, structure: computedStructure },
      recentlyTouchedIssues(snapshot, MID_NOW),
    ).score;
  };

  it("gives an unstarred repository the same score as a famous one", () => {
    expect(healthFor(0, 0)).toBe(healthFor(midSnapshot.repo.stars, midSnapshot.repo.forks));
    expect(healthFor(0, 0)).toBe(healthFor(9_000_000, 1_200_000));
  });
});

describe("healthBand (PLAN.md section 24)", () => {
  it("maps every bucket", () => {
    expect(healthBand(0)).toBe("Critical");
    expect(healthBand(20)).toBe("Critical");
    expect(healthBand(21)).toBe("Struggling");
    expect(healthBand(40)).toBe("Struggling");
    expect(healthBand(41)).toBe("Mixed");
    expect(healthBand(60)).toBe("Mixed");
    expect(healthBand(61)).toBe("Healthy");
    expect(healthBand(80)).toBe("Healthy");
    expect(healthBand(81)).toBe("Thriving");
    expect(healthBand(100)).toBe("Thriving");
  });
});

describe("computeConfidence (PLAN.md section 25)", () => {
  const withSignals = (count: number) => {
    const entries = treeFromPaths(Array.from({ length: 25 }, (_, i) => `src/f${i}.ts`));
    const snapshot = emptySnapshot({
      tree: { truncated: false, totalEntries: entries.length, entries },
      commits: Array.from({ length: 25 }, (_, i) => ({
        sha: `${i}`,
        date: "2026-09-01T00:00:00.000Z",
        authorLogin: "a",
        message: "m",
      })),
      issues: count >= 3 ? [{ number: 1, title: "t", url: "u", createdAt: "", updatedAt: "", comments: 0, labels: [], author: null, bodyExcerpt: "" }] : [],
      pulls: count >= 4 ? [{ number: 1, title: "t", url: "u", createdAt: "", updatedAt: "", mergedAt: null, draft: false, comments: 0, labels: [], author: null, state: "open" as const }] : [],
      workflows: count >= 5 ? [{ id: 1, name: "CI", path: ".github/workflows/ci.yml", state: "active" }] : [],
      files: count >= 7 ? [{ path: "package.json", content: "{}" }] : [],
    });
    return { snapshot, readmeLength: count >= 6 ? 500 : 0 };
  };

  const confidenceFor = (count: number) => {
    const { snapshot, readmeLength } = withSignals(count);
    return computeConfidence(
      snapshot,
      core({ docs: { strength: 1, signals: [], readmeLength } }),
    );
  };

  it("is high with six or seven signals", () => {
    expect(confidenceFor(7).level).toBe("high");
    expect(confidenceFor(6).level).toBe("high");
  });

  it("is medium with four or five", () => {
    expect(confidenceFor(5).level).toBe("medium");
    expect(confidenceFor(4).level).toBe("medium");
  });

  it("is low with three or fewer", () => {
    expect(confidenceFor(3).level).toBe("low");
    expect(computeConfidence(emptySnapshot(), core()).level).toBe("low");
  });

  it("caps a truncated tree at medium and says why", () => {
    const { snapshot } = withSignals(7);
    const truncated = { ...snapshot, tree: { ...snapshot.tree, truncated: true } };
    const confidence = computeConfidence(
      truncated,
      core({ docs: { strength: 1, signals: [], readmeLength: 500 } }),
    );
    expect(confidence.level).toBe("medium");
    expect(confidence.reasons[0]).toMatch(/truncated/i);
  });

  it("caps a partial GitHub failure at medium and says why", () => {
    const { snapshot } = withSignals(7);
    const partial = { ...snapshot, warnings: ["contributors unavailable"] };
    const confidence = computeConfidence(
      partial,
      core({ docs: { strength: 1, signals: [], readmeLength: 500 } }),
    );
    expect(confidence.level).toBe("medium");
    expect(confidence.reasons[0]).toMatch(/could not be fetched/i);
  });

  it("is high for the mid fixture and lower for the archived one", () => {
    const districts = planDistricts(pruneTree(midSnapshot.tree.entries));
    const mid = computeMetrics(midSnapshot, districts, { now: MID_NOW });
    expect(computeConfidence(midSnapshot, mid.core).level).toBe("high");

    const archivedDistricts = planDistricts(pruneTree(archivedSnapshot.tree.entries));
    const archived = computeMetrics(archivedSnapshot, archivedDistricts, { now: ARCHIVED_NOW });
    const confidence = computeConfidence(archivedSnapshot, archived.core);
    expect(confidence.level).toBe("medium");
    expect(confidence.reasons.join(" ")).toMatch(/20 or more/);
  });
});
