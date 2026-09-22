import { describe, expect, it } from "vitest";

import type { DistrictPlan } from "@/types/analysis";
import type { RepositorySnapshot } from "@/types/repository";
import {
  FILES_MAX,
  ISSUE_CEILING,
  LABELS_MAX,
  LABEL_MAX,
  PAYLOAD_TARGET,
  PULL_CEILING,
  TITLE_MAX,
  buildIssueBacklog,
  buildPullBacklog,
  compactLabels,
  fitBacklog,
  openTotalsFor,
  utf8Length,
  surveyedIssues,
  toBacklogIssue,
  toBacklogPull,
  truncate,
} from "./backlog";
import { planDistricts } from "./districts";
import { computeMetrics } from "./metrics";
import { pruneTree } from "./tree";
import { syntheticIssues, syntheticPulls, withBacklog } from "./__fixtures__/backlog";
import { daysBefore, emptySnapshot } from "./__fixtures__/helpers";
import { MID_NOW, midSnapshot } from "./__fixtures__/mid.snapshot";

const NOW = MID_NOW;
const DIRS = ["src/router", "src/cache", "src/http", "docs", "examples/cli"];
const districts = planDistricts(pruneTree(midSnapshot.tree.entries));

/** The mid fixture as a giant's survey would return it. */
const giant = withBacklog(midSnapshot, { now: NOW, issues: 1_200, pulls: 600, dirs: DIRS });

function heroesOf(snapshot: RepositorySnapshot) {
  return computeMetrics(snapshot, districts, { now: NOW }).core;
}

describe("truncate and compactLabels (PLAN.md 76.6 payload)", () => {
  it("leaves short text alone and cuts long text to the limit with an ellipsis", () => {
    expect(truncate("short", 140)).toBe("short");
    const cut = truncate("x".repeat(200), TITLE_MAX);
    expect(cut).toHaveLength(TITLE_MAX);
    expect(cut.endsWith("…")).toBe(true);
  });

  it("never splits a surrogate pair", () => {
    const text = `${"a".repeat(8)}😀tail`;
    const cut = truncate(text, 10);
    expect(cut.length).toBeLessThanOrEqual(10);
    expect(cut).toBe(`${"a".repeat(8)}…`);
    expect(JSON.stringify(cut)).not.toMatch(/\\ud8/);
  });

  it("keeps at most 4 labels of at most 32 characters", () => {
    const labels = compactLabels(["a", "b", "c", "d", "e", "x".repeat(50)]);
    expect(labels).toEqual(["a", "b", "c", "d"]);
    expect(compactLabels(["y".repeat(50)])[0]).toHaveLength(LABEL_MAX);
  });
});

describe("toBacklogIssue", () => {
  const [raw] = syntheticIssues(1, { now: NOW, start: 5000, dirs: DIRS, long: true });
  const compact = toBacklogIssue(raw, districts, NOW);

  it("drops the body and the URL", () => {
    expect(Object.keys(compact).sort()).toEqual(
      [
        "author",
        "comments",
        "createdAt",
        "form",
        "heat",
        "labels",
        "number",
        "reactions",
        "relatedPath",
        "score",
        "state",
        "title",
        "updatedAt",
      ].sort(),
    );
  });

  it("finds relatedPath in the body before dropping it", () => {
    const [plain] = syntheticIssues(1, { now: NOW, start: 5001, dirs: ["src/cache"] });
    expect(plain.title).not.toMatch(/src\/cache\//);
    expect(toBacklogIssue(plain, districts, NOW).relatedPath).toBe("src/cache");
  });

  it("truncates the title and labels, and decides the form from the full labels", () => {
    expect(compact.title.length).toBeLessThanOrEqual(TITLE_MAX);
    expect(compact.labels.length).toBeLessThanOrEqual(LABELS_MAX);
    for (const label of compact.labels) expect(label.length).toBeLessThanOrEqual(LABEL_MAX);

    // The fifth label is the security one: it is cut from the payload but
    // still sets the fire.
    const security = {
      ...raw,
      labels: ["a", "b", "c", "d", "security"],
      updatedAt: daysBefore(NOW, 1),
    };
    const fire = toBacklogIssue(security, districts, NOW);
    expect(fire.labels).toEqual(["a", "b", "c", "d"]);
    expect(fire.form).toBe("fire");
  });
});

describe("toBacklogPull", () => {
  const [raw] = syntheticPulls(1, { now: NOW, start: 7000, dirs: DIRS, long: true });
  const compact = toBacklogPull(raw, districts, NOW);

  it("keeps at most 5 files, the enrichment, and no URL", () => {
    expect(raw.files!.length).toBe(8);
    expect(compact.files).toHaveLength(FILES_MAX);
    expect(compact).not.toHaveProperty("url");
    expect(compact.review).toBe(raw.review ?? null);
    expect(compact.checks).toBe(raw.checks ?? null);
    expect(compact.reactions).toBe(raw.reactions);
  });

  it("reads relatedPath from all touched files, not just the five kept", () => {
    const pull = {
      ...raw,
      files: ["a/x.ts", "a/y.ts", "b/1.ts", "b/2.ts", "b/3.ts", "b/4.ts", "b/5.ts", "b/6.ts"],
    };
    expect(toBacklogPull(pull, districts, NOW).relatedPath).toBe("b");
  });

  it("is never completed and never a site", () => {
    for (const pull of syntheticPulls(200, { now: NOW, start: 8000, dirs: DIRS })) {
      const compactPull = toBacklogPull(pull, districts, NOW);
      expect(compactPull.state).not.toBe("completed");
      expect(compactPull.form).not.toBe("site");
    }
  });

  it("defaults missing enrichment to null and zero", () => {
    const bare = { ...raw, reactions: undefined, review: undefined, checks: undefined, files: undefined };
    expect(toBacklogPull(bare, districts, NOW)).toMatchObject({
      reactions: 0,
      review: null,
      checks: null,
      files: [],
    });
  });
});

describe("buildIssueBacklog (PLAN.md 76.7)", () => {
  const core = heroesOf(giant);
  const heroes = core.issues.ranked;
  const backlog = buildIssueBacklog(giant, heroes, districts, NOW);

  it("holds 1,000 issues in total, heroes included", () => {
    expect(heroes).toHaveLength(16);
    expect(backlog).toHaveLength(ISSUE_CEILING - heroes.length);
  });

  it("excludes every hero and repeats no number", () => {
    const heroNumbers = new Set(heroes.map((h) => h.number));
    expect(backlog.some((item) => heroNumbers.has(item.number))).toBe(false);
    expect(new Set(backlog.map((item) => item.number)).size).toBe(backlog.length);
  });

  it("keeps the health sample's non-heroes alongside the bulk pages", () => {
    const numbers = new Set(backlog.map((item) => item.number));
    const sampleNonHeroes = midSnapshot.issues.filter(
      (issue) => !heroes.some((hero) => hero.number === issue.number),
    );
    // The mid sample is 30 issues, mostly more recently updated than the
    // synthetic tail, so they survive the recency cut.
    const kept = sampleNonHeroes.filter((issue) => numbers.has(issue.number));
    expect(kept.length).toBeGreaterThan(0);
  });

  it("chooses by recency, then orders by significance", () => {
    const pool = surveyedIssues(giant).filter((i) => !heroes.some((h) => h.number === i.number));
    const cutoff = Math.min(...backlog.map((item) => Date.parse(item.updatedAt)));
    const chosen = new Set(backlog.map((item) => item.number));
    for (const issue of pool) {
      if (!chosen.has(issue.number)) expect(Date.parse(issue.updatedAt)).toBeLessThanOrEqual(cutoff);
    }
    for (let i = 1; i < backlog.length; i++) {
      const a = backlog[i - 1];
      const b = backlog[i];
      expect(a.score > b.score || (a.score === b.score && a.number < b.number)).toBe(true);
    }
  });

  it("gives every item a form, a heat in 0..1 and a relatedPath where the body names one", () => {
    const withPath = backlog.filter((item) => item.relatedPath !== null).length;
    expect(withPath).toBeGreaterThan(backlog.length / 2);
    for (const item of backlog) {
      expect(item.heat).toBeGreaterThanOrEqual(0);
      expect(item.heat).toBeLessThanOrEqual(1);
      expect(["fire", "collision", "wreck", "pothole", "roadblock", "survey", "signpost"]).toContain(
        item.form,
      );
    }
  });

  it("is empty for a repository whose heroes are all its issues", () => {
    const small = heroesOf(midSnapshot);
    const tiny = { ...midSnapshot, issues: midSnapshot.issues.slice(0, 5) };
    expect(buildIssueBacklog(tiny, heroesOf(tiny).issues.ranked, districts, NOW)).toEqual([]);
    expect(buildIssueBacklog(midSnapshot, small.issues.ranked, districts, NOW)).toHaveLength(
      midSnapshot.issues.length - small.issues.ranked.length,
    );
  });
});

describe("buildPullBacklog (PLAN.md 76.7)", () => {
  const core = heroesOf(giant);
  const heroes = core.pulls.ranked;
  const openHeroes = heroes.filter((h) => h.state !== "completed");
  const backlog = buildPullBacklog(giant, heroes, districts, NOW);

  it("ranks 8 open plus 2 merged heroes", () => {
    expect(openHeroes).toHaveLength(8);
    expect(heroes.filter((h) => h.state === "completed")).toHaveLength(2);
  });

  it("holds 500 open pull requests in total, open heroes included", () => {
    expect(backlog).toHaveLength(PULL_CEILING - openHeroes.length);
    const heroNumbers = new Set(heroes.map((h) => h.number));
    expect(backlog.some((item) => heroNumbers.has(item.number))).toBe(false);
  });

  it("orders by significance", () => {
    for (let i = 1; i < backlog.length; i++) {
      const a = backlog[i - 1];
      const b = backlog[i];
      expect(a.score > b.score || (a.score === b.score && a.number < b.number)).toBe(true);
    }
  });

  it("never includes a merged or closed pull request", () => {
    const merged = new Set(giant.pulls.filter((p) => p.state !== "open").map((p) => p.number));
    expect(backlog.some((item) => merged.has(item.number))).toBe(false);
  });
});

describe("utf8Length", () => {
  it("matches TextEncoder on ASCII, accents, CJK and emoji", () => {
    for (const text of ["", "plain", "café", "修复路由", "fix 😀 bug", "\ud800 lone", "end \ud83d"]) {
      expect(utf8Length(text)).toBe(new TextEncoder().encode(text).length);
    }
  });
});

describe("fitBacklog (PLAN.md 76.6 ceiling)", () => {
  const core = heroesOf(giant);
  const issues = buildIssueBacklog(giant, core.issues.ranked, districts, NOW);
  const pulls = buildPullBacklog(giant, core.pulls.ranked, districts, NOW);
  const bytes = (items: unknown[]) => items.reduce<number>((sum, item) => sum + JSON.stringify(item).length + 1, 0);

  it("returns the lists untouched when they fit", () => {
    const fitted = fitBacklog(issues, pulls, PAYLOAD_TARGET);
    expect(fitted.trimmed).toBe(0);
    expect(fitted.issues).toBe(issues);
    expect(fitted.pulls).toBe(pulls);
  });

  it("trims the least significant tail of both lists, in proportion, until they fit", () => {
    const budget = Math.round((bytes(issues) + bytes(pulls)) / 2);
    const fitted = fitBacklog(issues, pulls, budget);
    expect(bytes(fitted.issues) + bytes(fitted.pulls)).toBeLessThanOrEqual(budget);
    expect(fitted.issues).toEqual(issues.slice(0, fitted.issues.length));
    expect(fitted.pulls).toEqual(pulls.slice(0, fitted.pulls.length));
    expect(fitted.trimmed).toBe(
      issues.length - fitted.issues.length + pulls.length - fitted.pulls.length,
    );
    const issueShare = fitted.issues.length / ISSUE_CEILING;
    const pullShare = fitted.pulls.length / PULL_CEILING;
    expect(Math.abs(issueShare - pullShare)).toBeLessThan(0.02);
  });

  it("empties both lists for a budget of nothing", () => {
    const fitted = fitBacklog(issues, pulls, 0);
    expect(fitted.issues).toEqual([]);
    expect(fitted.pulls).toEqual([]);
  });
});

describe("openTotalsFor", () => {
  it("is undefined without ingestion's totals", () => {
    expect(openTotalsFor(midSnapshot)).toBeUndefined();
  });

  it("passes the real totals through", () => {
    expect(openTotalsFor(giant)).toEqual({
      issues: giant.openTotals!.issues,
      pulls: giant.openTotals!.pulls,
    });
  });

  it("never reports fewer than the survey counted", () => {
    const lagging = {
      ...giant,
      openTotals: { issues: 10, pulls: 3, exact: false, source: "estimate" as const },
    };
    expect(openTotalsFor(lagging)).toEqual({
      issues: surveyedIssues(giant).length,
      pulls: giant.pulls.filter((p) => p.state === "open").length,
    });
  });

  it("counts an issue in both the sample and the backlog once", () => {
    const dup = emptySnapshot({ issues: syntheticIssues(3, { now: NOW, start: 10, dirs: DIRS }) });
    const snapshot = {
      ...dup,
      issueBacklog: syntheticIssues(5, { now: NOW, start: 12, dirs: DIRS }),
      openTotals: { issues: 0, pulls: 0, exact: true, source: "graphql" as const },
    };
    // Numbers 10..8 in the sample, 12..8 in the backlog: 5 distinct.
    expect(openTotalsFor(snapshot)?.issues).toBe(5);
  });
});

it("districts used in these tests resolve relatedPaths", () => {
  const sources: DistrictPlan["sourcePath"][] = districts.map((d) => d.sourcePath);
  expect(sources).toContain("/src");
});
