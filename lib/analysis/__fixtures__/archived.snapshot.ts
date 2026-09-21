/**
 * Fixture: an archived micro-library.
 *
 * Archived, no CI of any kind, 14 files, a two-paragraph README, four issues
 * nobody has touched in a year and two pull requests that will never land.
 * This is the "archived repo" category from PLAN.md section 59 and the reason
 * the HUD must say "Archived repository", not "Bad repository" (section 19).
 *
 * Every timestamp is relative to `ARCHIVED_NOW`.
 */

import type { IssueSummary, PullSummary, RepositorySnapshot } from "@/types/repository";
import { daysBefore, treeFromPaths } from "./helpers";

/** The fixed clock this fixture is written against. */
export const ARCHIVED_NOW = new Date("2026-09-21T12:00:00.000Z");

const ago = (days: number): string => daysBefore(ARCHIVED_NOW, days);

const PATHS = [
  "README.md",
  "package.json",
  "index.js",
  "LICENSE",
  ".gitignore",
  "lib/parse.js",
  "lib/format.js",
  "lib/tokens.js",
  "lib/errors.js",
  "lib/index.js",
  "test/basic.js",
  "test/parse.js",
  "bench/run.js",
  "example.js",
];

const ISSUE_ROWS: [number, string, string[], number, number, number, string][] = [
  [27, "Crash on an empty input string", ["bug"], 705, 690, 3, "lib/parse.js throws instead of returning an empty list."],
  [24, "Does this work with ESM?", ["question"], 812, 780, 1, "index.js only ships CommonJS."],
  [19, "Regression: format() drops the trailing separator", ["bug", "regression"], 1010, 995, 2, "Since 1.2.0, lib/format.js swallows it."],
  [12, "Add a TypeScript declaration file", ["enhancement"], 1240, 1180, 4, "Would need index.d.ts."],
];

const issues: IssueSummary[] = ISSUE_ROWS.map(
  ([number, title, labels, created, updated, comments, body]) => ({
    number,
    title,
    url: `https://github.com/oldshop/tinyparse/issues/${number}`,
    createdAt: ago(created),
    updatedAt: ago(updated),
    comments,
    labels,
    author: number % 2 === 0 ? "rory-havel" : "ines-bettencourt",
    bodyExcerpt: body,
  }),
);

const pulls: PullSummary[] = [
  {
    number: 26,
    title: "fix: guard against an empty input",
    url: "https://github.com/oldshop/tinyparse/pull/26",
    createdAt: ago(700),
    updatedAt: ago(698),
    mergedAt: null,
    draft: false,
    comments: 1,
    labels: ["bug"],
    author: "rory-havel",
    state: "open",
  },
  {
    number: 21,
    title: "feat: add an ESM build",
    url: "https://github.com/oldshop/tinyparse/pull/21",
    createdAt: ago(930),
    updatedAt: ago(925),
    mergedAt: null,
    draft: true,
    comments: 0,
    labels: [],
    author: "ines-bettencourt",
    state: "open",
  },
];

const README = `# tinyparse

A 200-line tokenizer for simple key=value strings. No dependencies.

**This project is archived.** It still works, but it is not maintained. Use
\`smol-parse\` instead.
`;

const PACKAGE_JSON = JSON.stringify(
  { name: "tinyparse", version: "1.3.1", main: "index.js", scripts: {}, dependencies: {} },
  null,
  2,
);

export const archivedSnapshot: RepositorySnapshot = {
  repo: {
    owner: "oldshop",
    name: "tinyparse",
    fullName: "oldshop/tinyparse",
    url: "https://github.com/oldshop/tinyparse",
    description: "A tiny key=value tokenizer. Archived; use smol-parse instead.",
    defaultBranch: "master",
    headSha: "3b71c0de55a1f948e2c6b0d47a91f3e8cc402715",
    stars: 187,
    forks: 23,
    openIssuesCount: 6,
    archived: true,
    isFork: false,
    createdAt: ago(3150),
    pushedAt: ago(688),
    license: "ISC",
    primaryLanguage: "JavaScript",
    topics: ["parser", "deprecated"],
  },
  tree: (() => {
    const entries = treeFromPaths(PATHS);
    return { truncated: false, totalEntries: entries.length, entries };
  })(),
  commits: Array.from({ length: 6 }, (_, i) => ({
    sha: `a${String(i).padStart(2, "0")}${"9f8e7d6c5b4a".repeat(4)}`.slice(0, 40),
    date: ago(688 + i * 31),
    authorLogin: i % 2 === 0 ? "rory-havel" : "ines-bettencourt",
    message: `chore: final tidy ${i}`,
  })),
  issues,
  pulls,
  contributors: [
    { login: "rory-havel", contributions: 61 },
    { login: "ines-bettencourt", contributions: 9 },
  ],
  workflows: [],
  workflowRuns: [],
  releases: [
    {
      tag: "v1.3.1",
      name: "1.3.1",
      publishedAt: ago(702),
      url: "https://github.com/oldshop/tinyparse/releases/tag/v1.3.1",
    },
  ],
  files: [
    { path: "README.md", content: README },
    { path: "package.json", content: PACKAGE_JSON },
  ],
  fetchedAt: ARCHIVED_NOW.toISOString(),
  requestCount: 11,
  warnings: [],
};
