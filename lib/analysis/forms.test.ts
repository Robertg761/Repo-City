import { describe, expect, it } from "vitest";

import type { DistrictPlan, IncidentForm, IncidentState, WorksForm } from "@/types/analysis";
import {
  WRECK_IDLE_DAYS,
  WRECK_SHARE_MAX,
  capWrecks,
  heatOf,
  isInfraPath,
  issueForm,
  issueFormFor,
  majorityDirectory,
  pullForm,
  pullModifiers,
  pullRelatedPath,
  titleForm,
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
    ["2 roadblock: blocked", { labels: ["blocked"] }, "roadblock"],
    ["2 roadblock: on hold", { labels: ["on hold"] }, "roadblock"],
    ["2 roadblock: waiting for author", { labels: ["waiting-for-author"] }, "roadblock"],
    ["2 roadblock: needs repro", { labels: ["needs-reproduction"] }, "roadblock"],
    ["2 roadblock: needs investigation", { labels: ["Type: Needs Investigation"] }, "roadblock"],
    ["2 roadblock: info needed", { labels: ["info-needed"] }, "roadblock"],
    ["2 roadblock: more information needed", { labels: ["more-information-needed"] }, "roadblock"],
    ["2 roadblock: needs more information", { labels: ["Resolution: Needs More Information"] }, "roadblock"],
    ["2 roadblock: triage", { labels: ["status: triage"] }, "roadblock"],
    ["2 roadblock: triage needed", { labels: ["triage-needed"] }, "roadblock"],
    ["2 roadblock: question", { labels: ["Question"] }, "roadblock"],
    ["3 signpost: docs", { labels: ["documentation"] }, "signpost"],
    ["3 signpost: typo", { labels: ["typo"] }, "signpost"],
    ["3 signpost: examples", { labels: ["area: examples"] }, "signpost"],
    ["4 survey: enhancement", { labels: ["enhancement"] }, "survey"],
    ["4 survey: feature request", { labels: ["feature request"] }, "survey"],
    ["4 survey: rfc", { labels: ["RFC"] }, "survey"],
    ["4 survey: discussion", { labels: ["Type: Discussion"] }, "survey"],
    ["5 collision: state collision", { state: "collision", labels: ["bug"] }, "collision"],
    ["5 collision: state stale", { state: "stale", labels: ["bug"], idleDays: 900 }, "collision"],
    ["5 collision: a bug label on its own", { labels: ["regression"] }, "collision"],
    ["6 title: documentation", { title: "The README links to a dead forum" }, "signpost"],
    ["6 title: a proposal", { title: "Feature request: turn off code folding" }, "survey"],
    ["6 title: add something", { title: "Add an installation location option" }, "survey"],
    ["6 title: a crash", { title: "Uncaught Error: Module did not self-register." }, "collision"],
    ["6 title: does not work", { title: "Unsetting keybindings doesn't work" }, "collision"],
    ["6 title: a curly can't", { title: "Can\u2019t open DevTools" }, "collision"],
    ["6 title: a question", { title: "Apple M1 and Atom, will it work?" }, "roadblock"],
    ["6 title: how to", { title: "How to open new files in the same tab" }, "roadblock"],
    ["7 wreck: nothing to say, idle two years", { title: "Table of contents on the left", idleDays: 730 }, "wreck"],
    ["7 wreck: no title, no labels, idle two years", { idleDays: 800 }, "wreck"],
    ["8 pothole: no labels", {}, "pothole"],
    ["8 pothole: a title that says nothing", { title: "Table of contents on the left" }, "pothole"],
    ["8 pothole: idle 729 days", { idleDays: 729 }, "pothole"],
    ["8 pothole: good first issue", { labels: ["good first issue"] }, "pothole"],
    ["8 pothole: help wanted", { labels: ["help wanted"] }, "pothole"],
  ];
  it.each(rows)("%s", (_name, over, form) => {
    expect(issueForm(issue(over))).toBe(form);
  });
});

describe("issueForm first-match order", () => {
  it("fire beats everything: a two-year-old security issue still burns", () => {
    expect(issueForm(issue({ labels: ["security"], idleDays: 800, state: "stale" }))).toBe("fire");
  });

  it("content beats age: an old issue keeps the shape its labels give it", () => {
    for (const idleDays of [0, 400, 2000]) {
      expect(issueForm(issue({ state: "stale", labels: ["bug"], idleDays }))).toBe("collision");
      expect(issueForm(issue({ labels: ["enhancement"], idleDays }))).toBe("survey");
      expect(issueForm(issue({ labels: ["docs"], idleDays }))).toBe("signpost");
      expect(issueForm(issue({ labels: ["blocked"], idleDays }))).toBe("roadblock");
      expect(issueForm(issue({ title: "Crash on startup", idleDays }))).toBe("collision");
    }
  });

  it("roadblock beats collision: a bug waiting on a repro is held up, not in progress", () => {
    expect(issueForm(issue({ state: "collision", labels: ["bug", "needs-repro"] }))).toBe("roadblock");
  });

  it("roadblock beats signpost, signpost beats survey, survey beats collision", () => {
    expect(issueForm(issue({ labels: ["question", "documentation"] }))).toBe("roadblock");
    expect(issueForm(issue({ labels: ["docs", "enhancement"] }))).toBe("signpost");
    expect(issueForm(issue({ state: "collision", labels: ["bug", "feature"] }))).toBe("survey");
  });

  it("labels beat the title", () => {
    expect(issueForm(issue({ labels: ["enhancement"], title: "Crash when saving" }))).toBe("survey");
    expect(issueForm(issue({ state: "collision", labels: ["bug"], title: "Docs: how to?" }))).toBe(
      "collision",
    );
  });

  it("reads the title in order: docs, proposal, bug report, question", () => {
    expect(titleForm("Docs page crashes?")).toBe("signpost");
    expect(titleForm("Feature: fail fast when the config is broken")).toBe("survey");
    expect(titleForm("Why does saving fail?")).toBe("collision");
    expect(titleForm("Is there a dark theme?")).toBe("roadblock");
    expect(titleForm("Table of contents on the left")).toBeNull();
  });

  it("does not read a triaged issue as waiting on triage", () => {
    expect(issueForm(issue({ labels: ["triaged"] }))).toBe("pothole");
    expect(issueForm(issue({ labels: ["triaged"], idleDays: 900 }))).toBe("wreck");
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

describe("capWrecks", () => {
  const item = (number: number, form: IncidentForm) => ({ number, form });

  it("keeps the first quarter's worth of wrecks and demotes the rest to potholes", () => {
    const items = [
      item(1, "wreck"),
      item(2, "survey"),
      item(3, "wreck"),
      item(4, "wreck"),
      item(5, "collision"),
      item(6, "wreck"),
      item(7, "wreck"),
      item(8, "pothole"),
    ];
    // Eight items, so two wrecks: the first two in significance order.
    expect(capWrecks(items).map((i) => i.form)).toEqual([
      "wreck",
      "survey",
      "wreck",
      "pothole",
      "collision",
      "pothole",
      "pothole",
      "pothole",
    ]);
    expect(capWrecks(items).map((i) => i.number)).toEqual(items.map((i) => i.number));
  });

  it("rounds the allowance up, so one ancient issue can still be a wreck", () => {
    expect(capWrecks([item(1, "wreck")])[0].form).toBe("wreck");
    expect(capWrecks([item(1, "wreck"), item(2, "wreck")]).map((i) => i.form)).toEqual([
      "wreck",
      "pothole",
    ]);
  });

  it("never demotes when wrecks are within the share, and never mutates", () => {
    const items = [item(1, "wreck"), item(2, "fire"), item(3, "survey"), item(4, "pothole")];
    const frozen = Object.freeze(items.map((i) => Object.freeze(i)));
    expect(capWrecks(frozen)).toEqual(items);
    expect(capWrecks([])).toEqual([]);
  });

  it("holds any crowd to at most a quarter of wrecks plus one", () => {
    for (const n of [1, 3, 10, 99, 1000]) {
      const all = Array.from({ length: n }, (_, i) => item(i, "wreck"));
      const wrecks = capWrecks(all).filter((i) => i.form === "wreck").length;
      expect(wrecks).toBe(Math.ceil(n * WRECK_SHARE_MAX));
      expect(wrecks).toBeLessThanOrEqual(n * WRECK_SHARE_MAX + 1);
    }
  });
});

describe("issueFormFor", () => {
  const now = new Date("2026-09-21T12:00:00.000Z");
  it("reads idle days from updatedAt and treats missing reactions as zero", () => {
    const base = { labels: [] as string[], comments: 0, title: "Table of contents" };
    expect(issueFormFor({ ...base, updatedAt: daysBefore(now, WRECK_IDLE_DAYS - 1) }, "minor", now)).toBe(
      "pothole",
    );
    expect(issueFormFor({ ...base, updatedAt: daysBefore(now, WRECK_IDLE_DAYS + 1) }, "minor", now)).toBe(
      "wreck",
    );
    const hot = { labels: ["bug", "p1"], comments: 0, reactions: 10, updatedAt: daysBefore(now, 1) };
    expect(issueFormFor(hot, "collision" as IncidentState, now)).toBe("fire");
    expect(issueFormFor({ ...hot, reactions: undefined }, "collision", now)).toBe("collision");
  });

  it("reads the title", () => {
    const quiet = { labels: [] as string[], comments: 0, updatedAt: daysBefore(now, 1000) };
    expect(issueFormFor({ ...quiet, title: "Crash on start" }, "minor", now)).toBe("collision");
    expect(issueFormFor(quiet, "minor", now)).toBe("wreck");
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
