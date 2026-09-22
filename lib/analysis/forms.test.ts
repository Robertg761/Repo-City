import { describe, expect, it } from "vitest";

import type { DistrictPlan, IncidentForm, IncidentState, WorksForm } from "@/types/analysis";
import {
  heatOf,
  isInfraPath,
  issueForm,
  issueFormFor,
  majorityDirectory,
  pullForm,
  pullModifiers,
  pullRelatedPath,
  wantsVolunteer,
  type IssueFormInput,
  type PullFormInput,
} from "./forms";
import { daysBefore } from "./__fixtures__/helpers";

const issue = (over: Partial<IssueFormInput> = {}): IssueFormInput => ({
  state: "minor",
  labels: [],
  comments: 0,
  reactions: 0,
  idleDays: 3,
  ...over,
});

const pr = (over: Partial<PullFormInput> = {}): PullFormInput => ({
  author: "someone",
  labels: [],
  draft: false,
  files: [],
  ...over,
});

describe("issueForm (PLAN.md 76.7), one row per rule", () => {
  const rows: [string, Partial<IssueFormInput>, IncidentForm][] = [
    ["1 fire: state major", { state: "major", labels: ["bug", "p1"], comments: 12 }, "fire"],
    ["1 fire: a security label", { labels: ["Security"] }, "fire"],
    ["1 fire: a vulnerability label", { labels: ["vulnerability"] }, "fire"],
    ["1 fire: a CVE label", { labels: ["CVE-2026-1234"] }, "fire"],
    ["1 fire: severe bug, 5 comments", { state: "collision", labels: ["bug", "critical"], comments: 5 }, "fire"],
    ["1 fire: severe bug, 10 reactions", { state: "collision", labels: ["crash", "p0"], reactions: 10 }, "fire"],
    ["2 wreck: state stale", { state: "stale", labels: ["bug"] }, "wreck"],
    ["2 wreck: idle for a year", { labels: ["enhancement"], idleDays: 365 }, "wreck"],
    ["3 collision: state collision", { state: "collision", labels: ["bug"] }, "collision"],
    ["4 roadblock: blocked", { labels: ["blocked"] }, "roadblock"],
    ["4 roadblock: on hold", { labels: ["on hold"] }, "roadblock"],
    ["4 roadblock: waiting for author", { labels: ["waiting-for-author"] }, "roadblock"],
    ["4 roadblock: needs repro", { labels: ["needs-reproduction"] }, "roadblock"],
    ["4 roadblock: triage", { labels: ["status: triage"] }, "roadblock"],
    ["4 roadblock: question", { labels: ["Question"] }, "roadblock"],
    ["5 signpost: docs", { labels: ["documentation"] }, "signpost"],
    ["5 signpost: typo", { labels: ["typo"] }, "signpost"],
    ["5 signpost: examples", { labels: ["area: examples"] }, "signpost"],
    ["6 survey: enhancement", { labels: ["enhancement"] }, "survey"],
    ["6 survey: feature request", { labels: ["feature request"] }, "survey"],
    ["6 survey: rfc", { labels: ["RFC"] }, "survey"],
    ["7 pothole: no labels", {}, "pothole"],
    ["7 pothole: good first issue", { labels: ["good first issue"] }, "pothole"],
    ["7 pothole: help wanted", { labels: ["help wanted"] }, "pothole"],
  ];
  it.each(rows)("%s", (_name, over, form) => {
    expect(issueForm(issue(over))).toBe(form);
  });
});

describe("issueForm first-match order", () => {
  it("fire beats wreck: a year-old security issue still burns", () => {
    expect(issueForm(issue({ labels: ["security"], idleDays: 800, state: "stale" }))).toBe("fire");
  });

  it("wreck beats collision: an idle bug is an abandoned car", () => {
    expect(issueForm(issue({ state: "collision", labels: ["bug"], idleDays: 400 }))).toBe("wreck");
  });

  it("collision beats roadblock: a bug waiting on a repro is still a collision", () => {
    expect(issueForm(issue({ state: "collision", labels: ["bug", "needs-repro"] }))).toBe("collision");
  });

  it("roadblock beats signpost, and signpost beats survey", () => {
    expect(issueForm(issue({ labels: ["question", "documentation"] }))).toBe("roadblock");
    expect(issueForm(issue({ labels: ["docs", "enhancement"] }))).toBe("signpost");
  });

  it("a severe bug with little discussion is not a fire", () => {
    expect(issueForm(issue({ state: "collision", labels: ["bug", "p1"], comments: 4, reactions: 9 }))).toBe(
      "collision",
    );
  });

  it("a severe label without a bug label is not a fire by rule 1's third clause", () => {
    expect(issueForm(issue({ labels: ["urgent"], comments: 50 }))).toBe("pothole");
  });
});

describe("issueFormFor", () => {
  const now = new Date("2026-09-21T12:00:00.000Z");
  it("reads idle days from updatedAt and treats missing reactions as zero", () => {
    const base = { labels: ["enhancement"], comments: 0 };
    expect(issueFormFor({ ...base, updatedAt: daysBefore(now, 364) }, "minor", now)).toBe("survey");
    expect(issueFormFor({ ...base, updatedAt: daysBefore(now, 366) }, "minor", now)).toBe("wreck");
    const hot = { labels: ["bug", "p1"], comments: 0, reactions: 10, updatedAt: daysBefore(now, 1) };
    expect(issueFormFor(hot, "collision" as IncidentState, now)).toBe("fire");
    expect(issueFormFor({ ...hot, reactions: undefined }, "collision", now)).toBe("collision");
  });
});

describe("wantsVolunteer", () => {
  it("flags good first issue and help wanted only", () => {
    expect(wantsVolunteer(["Good First Issue"])).toBe(true);
    expect(wantsVolunteer(["help-wanted"])).toBe(true);
    expect(wantsVolunteer(["bug"])).toBe(false);
  });
});

describe("pullForm (PLAN.md 76.7), one row per rule", () => {
  const rows: [string, Partial<PullFormInput>, WorksForm][] = [
    ["1 van: dependabot", { author: "dependabot[bot]" }, "van"],
    ["1 van: renovate", { author: "renovate[bot]" }, "van"],
    ["1 van: any bot", { author: "github-actions[bot]" }, "van"],
    ["1 van: a dependency label", { labels: ["dependencies"] }, "van"],
    ["1 van: a bump label", { labels: ["bump"] }, "van"],
    ["2 hoarding: a draft", { draft: true }, "hoarding"],
    ["3 trench: ci label", { labels: ["CI"] }, "trench"],
    ["3 trench: build label", { labels: ["build"] }, "trench"],
    ["3 trench: chore label", { labels: ["chore"] }, "trench"],
    ["3 trench: refactor label", { labels: ["refactor"] }, "trench"],
    ["3 trench: perf label", { labels: ["perf"] }, "trench"],
    [
      "3 trench: most files under .github",
      { files: [".github/workflows/ci.yml", ".github/workflows/release.yml", "src/a.ts"] },
      "trench",
    ],
    ["3 trench: config files", { files: ["tsconfig.json", "package.json", "src/a.ts"] }, "trench"],
    ["4 scaffold: plain source change", { files: ["src/a.ts", "src/b.ts"] }, "scaffold"],
    ["4 scaffold: no files, no labels", {}, "scaffold"],
  ];
  it.each(rows)("%s", (_name, over, form) => {
    expect(pullForm(pr(over))).toBe(form);
  });

  it("never returns site", () => {
    for (const draft of [true, false]) {
      for (const labels of [[], ["ci"], ["deps"]]) {
        expect(pullForm(pr({ draft, labels }))).not.toBe("site");
      }
    }
  });

  it("applies the rules in order: van, hoarding, trench, scaffold", () => {
    expect(pullForm(pr({ author: "dependabot[bot]", draft: true, labels: ["ci"] }))).toBe("van");
    expect(pullForm(pr({ draft: true, labels: ["ci"] }))).toBe("hoarding");
    expect(pullForm(pr({ labels: ["refactor"], files: ["src/a.ts"] }))).toBe("trench");
  });

  it("needs more than half the files to be infrastructure", () => {
    expect(pullForm(pr({ files: [".github/workflows/ci.yml", "src/a.ts"] }))).toBe("scaffold");
    expect(pullForm(pr({ files: [".github/workflows/ci.yml", "Makefile", "src/a.ts"] }))).toBe("trench");
  });
});

describe("isInfraPath", () => {
  it.each([
    ".github/workflows/ci.yml",
    ".circleci/config.yml",
    "scripts/release.ts",
    "build/rollup.js",
    "package.json",
    "packages/core/package.json",
    "tsconfig.base.json",
    "vite.config.ts",
    "eslint.config.mjs",
    ".eslintrc.json",
    "Dockerfile",
    "Makefile",
    "Cargo.toml",
    "pnpm-lock.yaml",
  ])("%s is infrastructure", (path) => {
    expect(isInfraPath(path)).toBe(true);
  });

  it.each(["src/index.ts", "docs/guide.md", "packages/core/src/build-graph.ts", "README.md", ""])(
    "%s is not",
    (path) => {
      expect(isInfraPath(path)).toBe(false);
    },
  );
});

describe("heatOf", () => {
  it("is log2(1 + comments + 2 * reactions) / 7, clamped to 0..1", () => {
    expect(heatOf(0, 0)).toBe(0);
    expect(heatOf(1, 0)).toBe(round3(1 / 7));
    expect(heatOf(3, 2)).toBe(round3(Math.log2(8) / 7));
    expect(heatOf(127, 0)).toBe(1);
    expect(heatOf(0, 64)).toBe(1);
    expect(heatOf(10_000, 10_000)).toBe(1);
  });

  it("treats missing or negative counts as zero", () => {
    expect(heatOf(5)).toBe(heatOf(5, 0));
    expect(heatOf(-3, -1)).toBe(0);
  });

  it("rises with reactions twice as fast as with comments", () => {
    expect(heatOf(0, 3)).toBe(heatOf(6, 0));
  });
});

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

describe("majorityDirectory", () => {
  it("returns the deepest directory holding more than half the files", () => {
    expect(
      majorityDirectory([
        "src/router/match.ts",
        "src/router/params.ts",
        "src/router/guards/auth.ts",
        "src/cache/lru.ts",
      ]),
    ).toBe("src/router");
    expect(majorityDirectory(["src/router/match.ts"])).toBe("src/router");
  });

  it("walks up until a directory holds the majority", () => {
    expect(majorityDirectory(["src/a/x.ts", "src/b/y.ts", "src/c/z.ts", "docs/q.md"])).toBe("src");
  });

  it("returns null when only the root holds a majority, or at exactly half", () => {
    expect(majorityDirectory(["src/a.ts", "docs/b.md"])).toBeNull();
    expect(majorityDirectory(["package.json", "README.md"])).toBeNull();
    expect(majorityDirectory([])).toBeNull();
  });
});

describe("pullRelatedPath (PLAN.md 76.7)", () => {
  const districts: DistrictPlan[] = [
    { id: "d-src", sourcePath: "/src", name: "Src", purpose: null, fileCount: 10, weight: 1 },
  ];

  it("prefers the touched files", () => {
    expect(
      pullRelatedPath(
        { title: "Fix src/cache/lru.ts", files: ["src/router/a.ts", "src/router/b.ts"] },
        districts,
      ),
    ).toBe("src/router");
  });

  it("falls back to a path token in the title that lies in a district", () => {
    expect(pullRelatedPath({ title: "Fix src/cache/lru.ts eviction", files: [] }, districts)).toBe(
      "src/cache",
    );
    expect(pullRelatedPath({ title: "Fix src/cache/lru.ts" }, districts)).toBe("src/cache");
  });

  it("is null when neither the files nor the title point anywhere", () => {
    expect(pullRelatedPath({ title: "fix(router): typo", files: ["a.ts", "b/c.ts"] }, districts)).toBeNull();
    expect(pullRelatedPath({ title: "Update lib/other/x.ts" }, districts)).toBeNull();
  });
});

describe("pullModifiers (PLAN.md 76.7)", () => {
  it("adds the alarm beacon, the stop board, the flag, rust and dimming", () => {
    expect(pullModifiers({ checks: "failing", review: "changes-requested", state: "abandoned" })).toEqual([
      { id: "checks-failing", prop: "alarm-beacon", sentence: "Its checks are failing." },
      { id: "changes-requested", prop: "stop-board", sentence: "A reviewer asked for changes." },
      { id: "abandoned", prop: "rust", sentence: "Nobody is working on it." },
    ]);
    expect(pullModifiers({ review: "approved", state: "slow" }).map((m) => m.id)).toEqual([
      "approved",
      "slow",
    ]);
  });

  it("adds nothing to a healthy active pull request or one without enrichment", () => {
    expect(pullModifiers({ checks: "passing", review: "review-required", state: "active" })).toEqual([]);
    expect(pullModifiers({ checks: null, review: null, state: "active" })).toEqual([]);
    expect(pullModifiers({ state: "active" })).toEqual([]);
  });
});
