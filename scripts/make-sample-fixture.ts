/**
 * Generates `fixtures/sample.analysis.json`: one fake mid-size repository
 * conforming to `RepoAnalysis` (PLAN.md sections 50 and 71.2).
 *
 * This is Monday's fake city. It is fed through the real generator and the
 * real store, so swapping to live data on Tuesday is a data-source change
 * rather than a rewrite. Nothing here reads the clock or `Math.random`, so
 * re-running the script reproduces the committed JSON byte for byte.
 *
 *   pnpm fixture      # node scripts/make-sample-fixture.ts
 */

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { hashString, mulberry32 } from "../lib/city/prng.ts";
import { fixtureSettlement } from "./migrate-fixtures.ts";
import type {
  AiInterpretation,
  BuildingPlan,
  BuildingTier,
  DistrictPlan,
  RankedIssue,
  RankedPull,
  RepoAnalysis,
  RepoMetrics,
} from "../types/analysis.ts";

/** Frozen "now" so every derived timestamp is stable. */
const NOW = Date.UTC(2026, 8, 21, 12, 0, 0);
const DAY = 86_400_000;

const daysAgo = (days: number): string => new Date(NOW - days * DAY).toISOString();

const prng = mulberry32(hashString("repo-city/sample-fixture/v1"));

const round2 = (n: number): number => Math.round(n * 100) / 100;

// ---------------------------------------------------------------------------
// Districts (PLAN.md section 8)
// ---------------------------------------------------------------------------

interface DistrictSpec {
  id: string;
  sourcePath: string;
  name: string;
  purpose: string;
  buildings: number;
  fileCount: number;
  weight: number;
  /** Directory-style districts render folders as buildings, not files. */
  directoryKind: boolean;
  segments: string[];
  leaves: string[];
  extensions: string[];
}

const DISTRICT_SPECS: DistrictSpec[] = [
  {
    id: "d-src",
    sourcePath: "/src",
    name: "Core District",
    purpose: "Runtime entry points, routing, and the shared application core.",
    buildings: 32,
    fileCount: 168,
    weight: 1,
    directoryKind: false,
    segments: ["runtime", "router", "state", "render", "parse", "resolve", "cache", "io"],
    leaves: [
      "index",
      "engine",
      "context",
      "registry",
      "pipeline",
      "scheduler",
      "dispatch",
      "normalize",
      "traverse",
      "compile",
      "serialize",
      "diagnostics",
      "options",
      "plugins",
      "errors",
      "logger",
    ],
    extensions: [".ts", ".ts", ".ts", ".tsx"],
  },
  {
    id: "d-packages",
    sourcePath: "/packages",
    name: "Packages District",
    purpose: "Independently published workspace packages.",
    buildings: 21,
    fileCount: 121,
    weight: 0.74,
    directoryKind: true,
    segments: ["core", "cli", "codemod", "config", "plugin", "adapter", "preset"],
    leaves: [
      "runtime",
      "loader",
      "transform",
      "schema",
      "types",
      "testing",
      "eslint",
      "bundler",
      "devtools",
      "shared",
    ],
    extensions: [""],
  },
  {
    id: "d-docs",
    sourcePath: "/docs",
    name: "Knowledge District",
    purpose: "Guides, API reference, and architecture notes.",
    buildings: 9,
    fileCount: 46,
    weight: 0.31,
    directoryKind: false,
    segments: ["guides", "reference", "concepts", "recipes"],
    leaves: [
      "getting-started",
      "configuration",
      "plugins",
      "architecture",
      "migration",
      "troubleshooting",
      "api",
      "glossary",
    ],
    extensions: [".md", ".md", ".mdx"],
  },
  {
    id: "d-tests",
    sourcePath: "/tests",
    name: "Safety District",
    purpose: "Integration and regression suites.",
    buildings: 12,
    fileCount: 88,
    weight: 0.42,
    directoryKind: false,
    segments: ["integration", "unit", "e2e", "fixtures"],
    leaves: [
      "router",
      "parser",
      "cache",
      "resolver",
      "plugins",
      "cli",
      "errors",
      "regression",
      "snapshot",
      "smoke",
    ],
    extensions: [".test.ts", ".test.ts", ".spec.ts"],
  },
  {
    id: "d-examples",
    sourcePath: "/examples",
    name: "Demo District",
    purpose: "Runnable sample projects kept in sync with the core.",
    buildings: 6,
    fileCount: 37,
    weight: 0.19,
    directoryKind: true,
    segments: ["with-typescript", "with-vite", "minimal", "monorepo"],
    leaves: ["app", "server", "worker", "shared"],
    extensions: [""],
  },
  {
    id: "d-scripts",
    sourcePath: "/scripts",
    name: "Operations District",
    purpose: "Release, codegen, and maintenance tooling.",
    buildings: 5,
    fileCount: 19,
    weight: 0.12,
    directoryKind: false,
    segments: ["release", "codegen", "ci"],
    leaves: ["build", "publish", "changelog", "bench", "verify", "sync"],
    extensions: [".ts", ".mjs"],
  },
];

const districts: DistrictPlan[] = DISTRICT_SPECS.map((spec) => ({
  id: spec.id,
  sourcePath: spec.sourcePath,
  name: spec.name,
  purpose: spec.purpose,
  fileCount: spec.fileCount,
  weight: spec.weight,
}));

// ---------------------------------------------------------------------------
// Buildings (PLAN.md section 9)
// ---------------------------------------------------------------------------

const LANGUAGE_BY_EXT: Record<string, string> = {
  ".ts": "TypeScript",
  ".tsx": "TypeScript",
  ".mjs": "JavaScript",
  ".md": "Markdown",
  ".mdx": "MDX",
  ".test.ts": "TypeScript",
  ".spec.ts": "TypeScript",
  ".json": "JSON",
};

interface Draft {
  path: string;
  kind: "file" | "directory";
  districtId: string;
  score: number;
  descendantCount: number;
  language: string | null;
  role: string | null;
  landmark: BuildingPlan["landmark"];
}

const takenPaths = new Set<string>();

/** Deterministic unique path builder; falls back to a numeric suffix. */
function uniquePath(build: () => string): string {
  for (let attempt = 0; attempt < 24; attempt++) {
    const candidate = build();
    if (!takenPaths.has(candidate)) {
      takenPaths.add(candidate);
      return candidate;
    }
  }
  let n = 2;
  const candidate = build();
  while (takenPaths.has(`${candidate}.${n}`)) n++;
  const final = `${candidate}.${n}`;
  takenPaths.add(final);
  return final;
}

const drafts: Draft[] = [];

// Root-level civic files. They keep a real districtId so downstream lookups
// never miss, but the generator places anything with `landmark !== null` at the
// civic center rather than inside the district (PLAN.md section 8).
const ROOT_LANDMARKS: { path: string; landmark: BuildingPlan["landmark"]; language: string | null; role: string }[] =
  [
    { path: "README.md", landmark: "readme", language: "Markdown", role: "Project overview and quick start" },
    { path: "package.json", landmark: "manifest", language: "JSON", role: "Workspace manifest and scripts" },
    { path: "CONTRIBUTING.md", landmark: "contributing", language: "Markdown", role: "Contribution workflow" },
    { path: "CHANGELOG.md", landmark: "changelog", language: "Markdown", role: "Release history" },
    { path: "Dockerfile", landmark: "dockerfile", language: "Dockerfile", role: "Container build for the dev server" },
  ];

for (const entry of ROOT_LANDMARKS) {
  takenPaths.add(entry.path);
  drafts.push({
    path: entry.path,
    kind: "file",
    districtId: "d-src",
    score: 82 + prng.range(0, 14),
    descendantCount: 0,
    language: entry.language,
    role: entry.role,
    landmark: entry.landmark,
  });
}

for (const spec of DISTRICT_SPECS) {
  const base = spec.sourcePath.replace(/^\//, "");
  for (let i = 0; i < spec.buildings; i++) {
    const segment = prng.pick(spec.segments);
    const deepen = !spec.directoryKind && prng.next() < 0.45;

    const path = uniquePath(() => {
      if (spec.directoryKind) {
        return `${base}/${prng.pick(spec.segments)}/${prng.pick(spec.leaves)}`;
      }
      const ext = prng.pick(spec.extensions);
      return deepen
        ? `${base}/${segment}/${prng.pick(spec.leaves)}${ext}`
        : `${base}/${prng.pick(spec.leaves)}${ext}`;
    });

    const kind: "file" | "directory" = spec.directoryKind ? "directory" : "file";
    const ext = path.includes(".") ? path.slice(path.indexOf(".", path.lastIndexOf("/"))) : "";

    drafts.push({
      path,
      kind,
      districtId: spec.id,
      score: spec.weight * 60 + prng.range(0, 40),
      descendantCount: kind === "directory" ? prng.int(3, 28) : 0,
      language: kind === "directory" ? "TypeScript" : (LANGUAGE_BY_EXT[ext] ?? null),
      role: null,
      landmark: null,
    });
  }
}

// Tier from score rank on a log-ish curve, clamped to five visual tiers.
const ranked = [...drafts].sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
const tierByPath = new Map<string, BuildingTier>();
const TIER_CUTS: { share: number; tier: BuildingTier }[] = [
  { share: 0.05, tier: 5 },
  { share: 0.2, tier: 4 },
  { share: 0.45, tier: 3 },
  { share: 0.75, tier: 2 },
  { share: 1, tier: 1 },
];
ranked.forEach((draft, index) => {
  const pos = (index + 1) / ranked.length;
  const cut = TIER_CUTS.find((c) => pos <= c.share) ?? TIER_CUTS[TIER_CUTS.length - 1];
  tierByPath.set(draft.path, cut.tier);
});

const ROLES: Record<string, string> = {};
for (const draft of ranked.slice(0, 4)) {
  if (!draft.landmark) ROLES[draft.path] = "Highest-traffic module in its district";
}

const buildings: BuildingPlan[] = drafts.map((draft, index) => ({
  id: `b-${String(index + 1).padStart(3, "0")}`,
  path: draft.path,
  kind: draft.kind,
  districtId: draft.districtId,
  score: round2(draft.score),
  tier: tierByPath.get(draft.path) ?? 1,
  descendantCount: draft.descendantCount,
  language: draft.language,
  role: draft.role ?? ROLES[draft.path] ?? null,
  landmark: draft.landmark,
}));

// ---------------------------------------------------------------------------
// Issues -> incidents (PLAN.md section 11). All four IncidentState values.
// ---------------------------------------------------------------------------

const issues: RankedIssue[] = [
  {
    number: 412,
    title: "Router drops the pending transition after a fast refresh",
    url: "https://github.com/sample/repo-city/issues/412",
    createdAt: daysAgo(64),
    updatedAt: daysAgo(2),
    comments: 27,
    labels: ["bug", "priority-high", "router"],
    author: "mara-quinn",
    bodyExcerpt:
      "Navigating twice within one tick leaves src/router/dispatch.ts holding a stale transition, so the second navigation never resolves.",
    score: 8.21,
    state: "major",
    reason: "An unresolved bug carrying a high-severity label with heavy discussion activity.",
    relatedPath: "src/router",
  },
  {
    number: 398,
    title: "Cache eviction races with concurrent resolve() calls",
    url: "https://github.com/sample/repo-city/issues/398",
    createdAt: daysAgo(41),
    updatedAt: daysAgo(9),
    comments: 8,
    labels: ["bug", "cache"],
    author: "devon-oyelaran",
    bodyExcerpt:
      "Two resolve() calls that miss the same key can both write, and the loser's entry is what survives in src/cache.",
    score: 5.4,
    state: "collision",
    reason: "An unresolved bug with ongoing discussion but no severity label.",
    relatedPath: "src/cache",
  },
  {
    number: 233,
    title: "Windows paths are normalized twice in the codemod package",
    url: "https://github.com/sample/repo-city/issues/233",
    createdAt: daysAgo(287),
    updatedAt: daysAgo(214),
    comments: 4,
    labels: ["bug", "platform:windows"],
    author: "ines-hartmann",
    bodyExcerpt:
      "packages/codemod/transform rewrites backslashes and then rewrites the result, producing doubled separators.",
    score: 4.05,
    state: "stale",
    reason: "An unresolved bug that has gone untouched for more than 180 days.",
    relatedPath: "packages/codemod",
  },
  {
    number: 441,
    title: "Document the plugin resolution order",
    url: "https://github.com/sample/repo-city/issues/441",
    createdAt: daysAgo(18),
    updatedAt: daysAgo(6),
    comments: 3,
    labels: ["documentation", "good first issue"],
    author: "sam-ibrahim",
    bodyExcerpt:
      "docs/reference/plugins.md never states whether presets or explicit plugins win when both register the same hook.",
    score: 2.11,
    state: "minor",
    reason: "An open issue that is not labelled as a defect.",
    relatedPath: "docs/reference",
  },
  {
    number: 447,
    title: "CLI --verbose prints the config path twice",
    url: "https://github.com/sample/repo-city/issues/447",
    createdAt: daysAgo(11),
    updatedAt: daysAgo(4),
    comments: 1,
    labels: ["cli"],
    author: "ren-takahashi",
    bodyExcerpt: "Cosmetic duplicate line in the packages/cli startup banner.",
    score: 1.28,
    state: "minor",
    reason: "An open issue that is not labelled as a defect.",
    relatedPath: "packages/cli",
  },
];

// ---------------------------------------------------------------------------
// Pull requests -> construction (PLAN.md section 13)
// ---------------------------------------------------------------------------

const pulls: RankedPull[] = [
  {
    number: 452,
    title: "Rework the resolver cache around a single write path",
    url: "https://github.com/sample/repo-city/pull/452",
    createdAt: daysAgo(12),
    updatedAt: daysAgo(1),
    mergedAt: null,
    draft: false,
    comments: 14,
    labels: ["core", "needs-review"],
    author: "devon-oyelaran",
    state: "active",
    score: 9.4,
    reason: "Open and updated within the last 14 days, so the site is under active construction.",
  },
  {
    number: 301,
    title: "Add an experimental streaming loader",
    url: "https://github.com/sample/repo-city/pull/301",
    createdAt: daysAgo(151),
    updatedAt: daysAgo(118),
    mergedAt: null,
    draft: true,
    comments: 6,
    labels: ["experimental"],
    author: "ines-hartmann",
    state: "abandoned",
    score: 3.1,
    reason: "Open with no update for more than 60 days, so construction has been abandoned.",
  },
  {
    number: 448,
    title: "Tighten the plugin option schema",
    url: "https://github.com/sample/repo-city/pull/448",
    createdAt: daysAgo(16),
    updatedAt: daysAgo(5),
    mergedAt: daysAgo(5),
    draft: false,
    comments: 9,
    labels: ["core"],
    author: "mara-quinn",
    state: "completed",
    score: 7.2,
    reason: "Merged within the last 14 days, so the building is newly completed.",
  },
];

// ---------------------------------------------------------------------------
// Metrics (PLAN.md sections 23 to 25)
// ---------------------------------------------------------------------------

const breakdown = {
  maintenance: 0.72,
  reliability: 0.7,
  documentation: 0.85,
  organization: 0.66,
  responsiveness: 0.55,
};

const healthScore = Math.round(
  100 *
    (0.3 * breakdown.maintenance +
      0.25 * breakdown.reliability +
      0.2 * breakdown.documentation +
      0.15 * breakdown.organization +
      0.1 * breakdown.responsiveness),
);

if (healthScore !== 72) {
  throw new Error(`fixture health drifted: expected 72, computed ${healthScore}`);
}

const metrics: RepoMetrics = {
  scale: {
    files: 479,
    dirs: 63,
    languages: { TypeScript: 331, Markdown: 58, JSON: 41, JavaScript: 29, CSS: 12, Shell: 8 },
    tier: "medium",
  },
  activity: {
    commitsLast30d: 24,
    commitsLast90d: 71,
    activeContributors90d: 4,
    lastPushDaysAgo: 3,
    score: 0.78,
  },
  issues: { open: 18, ranked: issues, staleShare: 0.22 },
  pulls: { open: 5, ranked: pulls, staleShare: 0.2 },
  ci: { state: "healthy", provider: "github-actions", failureRate: 0.04, recentRuns: 50 },
  tests: {
    strength: 2,
    signals: ["tests/ directory", "vitest devDependency", "test script in package.json"],
  },
  docs: {
    strength: 3,
    signals: ["README.md", "docs/ directory", "CONTRIBUTING.md", "CHANGELOG.md", "examples/"],
    readmeLength: 3184,
  },
  tooling: {
    signals: ["eslint config", "prettier config", "tsconfig.json", "build script"],
  },
  releases: { count: 9, lastDaysAgo: 34, cadence: "occasional" },
  health: { score: healthScore, band: "Healthy", breakdown },
  confidence: {
    level: "medium",
    reasons: [
      "Repository tree, commits, issues, pull requests and workflows were all available.",
      "This is a committed fixture, not a live survey, so the ceiling is Medium.",
    ],
  },
  archived: false,
};

// ---------------------------------------------------------------------------
// AI interpretation (PLAN.md section 28)
// ---------------------------------------------------------------------------

const ai: AiInterpretation = {
  summary:
    "A TypeScript monorepo with a clearly separated runtime core, a set of published workspace packages, and documentation kept alongside runnable examples. Test and release tooling exist but cover the core more thoroughly than the packages.",
  districts: DISTRICT_SPECS.map((spec) => ({
    sourcePath: spec.sourcePath,
    name: spec.name,
    purpose: spec.purpose,
    evidence: buildings
      .filter((b) => b.districtId === spec.id && !b.landmark)
      .slice(0, 3)
      .map((b) => b.path),
  })),
  importantModules: [
    { path: "src/router", role: "Navigation and transition scheduling", evidence: ["src/router"] },
    { path: "src/cache", role: "Resolution cache shared by every entry point", evidence: ["src/cache"] },
    { path: "packages/cli", role: "Published command line entry point", evidence: ["packages/cli"] },
    { path: "docs", role: "Guides and API reference", evidence: ["docs"] },
  ],
  strengths: [
    "Documentation covers guides, reference and runnable examples.",
    "Continuous integration is green across the recent run window.",
    "Workspace packages have clear, single-purpose boundaries.",
  ],
  concerns: [
    "One high-severity router bug has been open for two months with heavy discussion.",
    "A draft pull request has been untouched for roughly four months.",
    "Test coverage signals are present but thinner around the packages directory.",
  ],
  organizationClarity: 0.66,
  model: "claude-opus-5",
};

// ---------------------------------------------------------------------------
// Assemble
// ---------------------------------------------------------------------------

const analysis: RepoAnalysis = {
  repo: {
    owner: "sample",
    name: "repo-city",
    fullName: "sample/repo-city",
    url: "https://github.com/sample/repo-city",
    description: "A sample mid-size TypeScript monorepo used as Repo City's offline fixture.",
    defaultBranch: "main",
    headSha: "fixture0001",
    stars: 1284,
    forks: 96,
    openIssuesCount: 23,
    archived: false,
    isFork: false,
    createdAt: daysAgo(1043),
    pushedAt: daysAgo(3),
    license: "MIT",
    primaryLanguage: "TypeScript",
    topics: ["typescript", "monorepo", "tooling", "sample"],
  },
  metrics,
  districts,
  buildings,
  ai,
  aiStatus: "ok",
  seed: "sample/repo-city@fixture0001",
  warnings: [],
  generatedAt: new Date(NOW).toISOString(),
  source: "fixture",
};
// PLAN.md 76.4, the same rule `migrate-fixtures.ts` applies to every fixture.
analysis.settlement = fixtureSettlement(analysis);

if (analysis.seed !== `${analysis.repo.owner}/${analysis.repo.name}@${analysis.repo.headSha}`) {
  throw new Error("fixture seed does not match owner/name@headSha");
}

const outPath = fileURLToPath(new URL("../fixtures/sample.analysis.json", import.meta.url));
writeFileSync(outPath, `${JSON.stringify(analysis, null, 2)}\n`, "utf8");

console.log(
  `wrote ${outPath}: ${analysis.districts.length} districts, ${analysis.buildings.length} buildings, ` +
    `${metrics.issues.ranked.length} issues, ${metrics.pulls.ranked.length} pulls, health ${healthScore}`,
);
