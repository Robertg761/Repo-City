import { describe, expect, it } from "vitest";

import { planDistricts } from "./districts";
import {
  HEALTH_SAMPLE_PULLS,
  HERO_ISSUES,
  HERO_OPEN_PULLS,
  MAX_COMPLETED_CONSTRUCTION,
  MAX_INCIDENTS,
  MAX_OPEN_CONSTRUCTION,
  classifyIssue,
  classifyPull,
  computeMetrics,
  computeStructure,
  pullHealthSample,
  relatedPathFor,
} from "./metrics";
import { syntheticPulls } from "./__fixtures__/backlog";
import { pruneTree } from "./tree";
import { ARCHIVED_NOW, archivedSnapshot } from "./__fixtures__/archived.snapshot";
import { daysBefore, emptySnapshot, treeFromPaths } from "./__fixtures__/helpers";
import { MID_NOW, midSnapshot } from "./__fixtures__/mid.snapshot";

const NOW = MID_NOW;
const ago = (days: number) => daysBefore(NOW, days);

const issue = (over: Partial<Parameters<typeof classifyIssue>[0]> = {}) => ({
  number: 1,
  title: "An issue",
  url: "https://github.com/test/blank/issues/1",
  createdAt: ago(10),
  updatedAt: ago(1),
  comments: 0,
  labels: [] as string[],
  author: "someone",
  bodyExcerpt: "",
  ...over,
});

const pull = (over: Partial<Parameters<typeof classifyPull>[0]> = {}) => ({
  number: 1,
  title: "A pull request",
  url: "https://github.com/test/blank/pull/1",
  createdAt: ago(30),
  updatedAt: ago(1),
  mergedAt: null,
  draft: false,
  comments: 0,
  labels: [] as string[],
  author: "someone",
  state: "open" as const,
  ...over,
});

describe("classifyIssue (PLAN.md section 11)", () => {
  it("assigns major to a heavily discussed severe bug", () => {
    expect(classifyIssue(issue({ labels: ["bug", "p1"], comments: 10 }), NOW).state).toBe("major");
    expect(classifyIssue(issue({ labels: ["crash", "security"], comments: 42 }), NOW).state).toBe("major");
  });

  it("assigns stale to an old bug regardless of discussion", () => {
    expect(classifyIssue(issue({ labels: ["bug"], createdAt: ago(181) }), NOW).state).toBe("stale");
  });

  it("assigns collision to an ordinary bug", () => {
    expect(classifyIssue(issue({ labels: ["defect"], comments: 4 }), NOW).state).toBe("collision");
  });

  it("assigns collision, not major, to a severe bug nobody is discussing", () => {
    expect(classifyIssue(issue({ labels: ["bug", "urgent"], comments: 9 }), NOW).state).toBe("collision");
  });

  it("assigns minor to anything without a bug label", () => {
    expect(classifyIssue(issue({ labels: ["enhancement"], comments: 30 }), NOW).state).toBe("minor");
    expect(classifyIssue(issue({ labels: [], createdAt: ago(900) }), NOW).state).toBe("minor");
  });

  it("scores 3*isBug + 2*isSevere + log2(comments+1) + min(age,365)/120", () => {
    const scored = classifyIssue(
      issue({ labels: ["bug", "critical"], comments: 7, createdAt: ago(240) }),
      NOW,
    );
    expect(scored.score).toBeCloseTo(3 + 2 + 3 + 2, 2);
  });

  it("caps the age term at 365 days", () => {
    const old = classifyIssue(issue({ createdAt: ago(3000) }), NOW).score;
    const year = classifyIssue(issue({ createdAt: ago(365) }), NOW).score;
    expect(old).toBeCloseTo(year, 2);
  });
});

describe("relatedPathFor (PLAN.md section 11)", () => {
  const districts = planDistricts(pruneTree(midSnapshot.tree.entries));

  it("points at the directory of a mentioned file", () => {
    expect(
      relatedPathFor({ title: "x", bodyExcerpt: "broken in src/router/dispatch.ts" }, districts),
    ).toBe("src/router");
  });

  it("accepts a mentioned directory as-is", () => {
    expect(relatedPathFor({ title: "see docs/api for details", bodyExcerpt: "" }, districts)).toBe(
      "docs/api",
    );
  });

  it("is null when nothing inside a district is mentioned", () => {
    expect(relatedPathFor({ title: "General question", bodyExcerpt: "no paths" }, districts)).toBeNull();
    expect(
      relatedPathFor({ title: "x", bodyExcerpt: "see https://example.com/a/b" }, districts),
    ).toBeNull();
  });
});

describe("classifyPull (PLAN.md section 13)", () => {
  it("assigns active to an open pull request updated within 14 days", () => {
    expect(classifyPull(pull({ updatedAt: ago(13) }), NOW).state).toBe("active");
  });

  it("assigns slow to an open pull request between 14 and 60 days", () => {
    expect(classifyPull(pull({ updatedAt: ago(30) }), NOW).state).toBe("slow");
  });

  it("assigns abandoned to an open pull request untouched for 60 days", () => {
    expect(classifyPull(pull({ updatedAt: ago(61) }), NOW).state).toBe("abandoned");
  });

  it("assigns completed to a merged pull request", () => {
    expect(classifyPull(pull({ mergedAt: ago(3), state: "merged" }), NOW).state).toBe("completed");
  });

  it("ranks a recently updated, heavily discussed pull request highest", () => {
    const fresh = classifyPull(pull({ updatedAt: ago(1), comments: 20 }), NOW).score;
    const quiet = classifyPull(pull({ updatedAt: ago(80), comments: 0 }), NOW).score;
    expect(fresh).toBeGreaterThan(quiet);
  });
});

describe("computeMetrics on the mid fixture", () => {
  const districts = planDistricts(pruneTree(midSnapshot.tree.entries));
  const { core, structure } = computeMetrics(midSnapshot, districts, { now: NOW });

  it("measures scale from the pruned tree", () => {
    expect(core.scale.files).toBe(136);
    expect(core.scale.tier).toBe("small");
    expect(Object.keys(core.scale.languages)[0]).toBe("TypeScript");
  });

  it("measures activity without treating a busy repository as quiet", () => {
    expect(core.activity.commitsLast30d).toBe(13);
    expect(core.activity.commitsLast90d).toBe(38);
    expect(core.activity.activeContributors90d).toBe(6);
    expect(core.activity.lastPushDaysAgo).toBe(2);
    expect(core.activity.score).toBeGreaterThan(0.8);
  });

  it("ranks at most 16 hero incidents and explains each from its rule", () => {
    expect(core.issues.open).toBe(30);
    expect(core.issues.ranked).toHaveLength(HERO_ISSUES);
    // #262 leads: a severe defect with 13 comments that has been open 264 days
    // beats the fresher #412 on the age term.
    expect(core.issues.ranked[0].number).toBe(262);
    expect(core.issues.ranked[0].state).toBe("major");
    const router = core.issues.ranked.find((r) => r.number === 412);
    expect(router).toMatchObject({ state: "major", relatedPath: "src/router" });
    for (const ranked of core.issues.ranked) {
      expect(ranked.reason.length).toBeGreaterThan(20);
      expect(ranked.reason.endsWith(".")).toBe(true);
    }
    expect(core.issues.staleShare).toBeCloseTo(0.3, 3);
  });

  it("keeps the ranked issues in descending score order", () => {
    const scores = core.issues.ranked.map((r) => r.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });

  it("takes up to 6 open plus up to 2 merged pull requests", () => {
    expect(core.pulls.open).toBe(6);
    const states = core.pulls.ranked.map((r) => r.state);
    expect(states.filter((s) => s === "completed")).toHaveLength(2);
    expect(states).toContain("active");
    expect(states).toContain("slow");
    expect(states).toContain("abandoned");
    expect(core.pulls.staleShare).toBeCloseTo(0.333, 2);
  });

  it("describes release cadence without punishing repositories that skip releases", () => {
    expect(core.releases).toMatchObject({ count: 5, lastDaysAgo: 9, cadence: "active" });
    const none = computeMetrics(emptySnapshot(), [], { now: NOW }).core.releases;
    expect(none).toMatchObject({ count: 0, lastDaysAgo: null, cadence: "none" });
    expect(none.lastTag).toBeNull();
  });

  it("names the last release so the station can show which train arrived", () => {
    expect(core.releases.lastTag).toBe("v5.1.2");
    expect(core.releases.lastPublishedAt).toBeTruthy();
    expect(core.releases.lastUrl).toContain("/releases/tag/v5.1.2");
  });

  it("counts surveyed files alongside mapped files", () => {
    // The prune drops dot-directories, lockfiles and binaries, so the two
    // numbers differ and must never share a label (QA-2026-09-21 bug 2).
    expect(core.scale.surveyedFiles).toBeGreaterThanOrEqual(core.scale.files);
  });

  it("carries no uncapped totals when ingestion did not count them", () => {
    expect(core.scale).not.toHaveProperty("totalFiles");
    expect(core.scale).not.toHaveProperty("totalDirs");
    expect(core.scale).not.toHaveProperty("lowerBound");
  });

  it("passes the snapshot's uncapped totals through (PLAN.md 76.3)", () => {
    const counted = { ...midSnapshot, tree: { ...midSnapshot.tree, totalFiles: 9_000, totalDirs: 1_200 } };
    const scale = computeMetrics(counted, districts, { now: NOW }).core.scale;
    expect(scale).toMatchObject({ totalFiles: 9_000, totalDirs: 1_200, lowerBound: false });
    // The capped, pruned counts keep their meaning.
    expect(scale.files).toBe(core.scale.files);
    expect(scale.surveyedFiles).toBe(core.scale.surveyedFiles);

    const truncated = { ...counted, tree: { ...counted.tree, githubTruncated: true } };
    expect(computeMetrics(truncated, districts, { now: NOW }).core.scale.lowerBound).toBe(true);
  });

  it("reports the contributor count for the population line", () => {
    expect(core.activity.contributors).toBe(midSnapshot.contributors.length);
  });

  it("measures structure from root clutter and top-level balance", () => {
    expect(structure.rootFileCount).toBe(11);
    expect(structure.topLevelDirs).toBe(5);
    expect(structure.structure).toBeGreaterThan(0.9);
  });
});

describe("computeMetrics on the archived fixture", () => {
  const districts = planDistricts(pruneTree(archivedSnapshot.tree.entries));
  const { core } = computeMetrics(archivedSnapshot, districts, { now: ARCHIVED_NOW });

  it("reports the repository as archived", () => {
    expect(core.archived).toBe(true);
  });

  it("does not apply the maturity floor to an archived repository", () => {
    expect(core.activity.score).toBeLessThan(0.2);
    expect(core.activity.activeContributors90d).toBe(0);
  });

  it("shows every open issue when there are fewer than six", () => {
    expect(core.issues.open).toBe(4);
    expect(core.issues.ranked).toHaveLength(4);
    expect(core.issues.staleShare).toBe(1);
  });

  it("marks both lingering pull requests abandoned and finds no completed ones", () => {
    expect(core.pulls.ranked.map((p) => p.state)).toEqual(["abandoned", "abandoned"]);
  });
});

describe("computeStructure", () => {
  it("penalises a cluttered root", () => {
    const tidy = computeStructure(
      pruneTree(treeFromPaths(["README.md", "src/a.ts", "src/b.ts", "docs/a.md"])),
    );
    const messy = computeStructure(
      pruneTree(
        treeFromPaths([
          ...Array.from({ length: 52 }, (_, i) => `root${i}.ts`),
          "src/a.ts",
          "src/b.ts",
          "docs/a.md",
        ]),
      ),
    );
    expect(messy.structure).toBeLessThan(tidy.structure);
    expect(messy.rootFileCount).toBe(52);
  });

  it("treats a single top-level directory as balanced", () => {
    expect(computeStructure(pruneTree(treeFromPaths(["src/a.ts", "src/b.ts"]))).balance).toBe(1);
  });

  it("survives an empty tree", () => {
    expect(computeStructure([]).structure).toBe(1);
  });
});

describe("determinism", () => {
  it("returns identical metrics for the same snapshot and clock", () => {
    const districts = planDistricts(pruneTree(midSnapshot.tree.entries));
    expect(computeMetrics(midSnapshot, districts, { now: NOW })).toEqual(
      computeMetrics(midSnapshot, districts, { now: NOW }),
    );
  });
});

describe("pull requests past the health sample (PLAN.md 76.1 decision 6, 76.7)", () => {
  const districts = planDistricts(pruneTree(midSnapshot.tree.entries));
  const extra = syntheticPulls(300, {
    now: NOW,
    start: 9_000,
    dirs: ["src/router", "src/cache"],
    newestDays: 0.25,
  });
  const snapshot = { ...midSnapshot, pulls: [...midSnapshot.pulls, ...extra, extra[0]] };
  const { core } = computeMetrics(snapshot, districts, { now: NOW });

  it("measures the first 50 open pull requests by update time, once each", () => {
    const sample = pullHealthSample(snapshot);
    expect(sample).toHaveLength(HEALTH_SAMPLE_PULLS);
    expect(new Set(sample.map((p) => p.number)).size).toBe(HEALTH_SAMPLE_PULLS);
    const newest = Date.parse(sample[0].updatedAt);
    const oldest = Date.parse(sample.at(-1)!.updatedAt);
    expect(newest).toBeGreaterThanOrEqual(oldest);
    expect(core.pulls.open).toBe(HEALTH_SAMPLE_PULLS);
    const stale = sample.filter((p) => Date.parse(p.updatedAt) <= NOW.getTime() - 60 * 86_400_000);
    expect(core.pulls.staleShare).toBeCloseTo(stale.length / HEALTH_SAMPLE_PULLS, 3);
  });

  it("ranks 8 open and 2 merged heroes over every open pull request", () => {
    const open = core.pulls.ranked.filter((r) => r.state !== "completed");
    expect(open).toHaveLength(HERO_OPEN_PULLS);
    const scores = open.map((r) => r.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });

  it("keeps today's 6 open plus 2 merged as the first 8, for a generator that slices 8", () => {
    const states = core.pulls.ranked.map((r) => (r.state === "completed" ? "merged" : "open"));
    expect(states).toEqual([
      ...Array(MAX_OPEN_CONSTRUCTION).fill("open"),
      ...Array(MAX_COMPLETED_CONSTRUCTION).fill("merged"),
      ...Array(HERO_OPEN_PULLS - MAX_OPEN_CONSTRUCTION).fill("open"),
    ]);
  });

  it("keeps today's 12 issues as the first 12 heroes", () => {
    const ranked = computeMetrics(midSnapshot, districts, { now: NOW }).core.issues.ranked;
    expect(ranked).toHaveLength(HERO_ISSUES);
    const scores = ranked.map((r) => r.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
    expect(ranked.slice(0, MAX_INCIDENTS).map((r) => r.number)).toEqual(
      [...midSnapshot.issues]
        .map((issue) => ({ number: issue.number, score: classifyIssue(issue, NOW).score }))
        .sort((a, b) => b.score - a.score || a.number - b.number)
        .slice(0, MAX_INCIDENTS)
        .map((r) => r.number),
    );
  });

  it("carries the enrichment, a crowd form and the touched files' directory on open heroes", () => {
    for (const hero of core.pulls.ranked) {
      if (hero.state === "completed") {
        expect(hero.form).toBe("site");
        continue;
      }
      expect(["van", "hoarding", "trench", "scaffold"]).toContain(hero.form);
      if (hero.files && hero.files.length > 0) {
        expect(hero.files.length).toBeLessThanOrEqual(5);
        expect(hero.relatedPath).toMatch(/^(src\/(router|cache)|\.github\/workflows)/);
      }
    }
  });

  it("leaves a pull request from the old ingestion without enrichment keys", () => {
    const plain = computeMetrics(midSnapshot, districts, { now: NOW }).core.pulls.ranked[0];
    expect(plain).not.toHaveProperty("files");
    expect(plain).not.toHaveProperty("review");
    expect(plain).not.toHaveProperty("checks");
    expect(plain.relatedPath).toBeNull();
  });
});
