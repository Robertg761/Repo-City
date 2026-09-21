/**
 * Infrastructure detection (PLAN.md sections 14, 15, 16 and 23).
 *
 * Four detectors over a `RepositorySnapshot`: test infrastructure, docs, CI and
 * tooling. All of them are evidence-based — they report the signals they found
 * and never claim anything the snapshot does not show. In particular this is
 * "Test Infrastructure", never "Test Coverage" (PLAN.md section 15).
 */

import type { CiState, RepoMetrics } from "@/types/analysis";
import type { RepositorySnapshot, TreeEntry } from "@/types/repository";
import { basename, blobsOf, segments } from "./tree";

/* ------------------------------------------------------------------ shared */

function paths(snapshot: RepositorySnapshot): string[] {
  return snapshot.tree.entries.map((e) => e.path.replace(/^\/+/, ""));
}

function dirSegments(entries: readonly TreeEntry[]): Set<string> {
  const out = new Set<string>();
  for (const entry of entries) {
    const parts = segments(entry.path);
    const upto = entry.type === "tree" ? parts.length : parts.length - 1;
    for (let i = 0; i < upto; i++) out.add(parts[i].toLowerCase());
  }
  return out;
}

/** The first snapshot file whose path matches, or `null`. */
export function findFile(
  snapshot: RepositorySnapshot,
  match: RegExp,
): { path: string; content: string } | null {
  return snapshot.files.find((f) => match.test(f.path)) ?? null;
}

/** The README from `snapshot.files`, or `null`. */
export function findReadme(snapshot: RepositorySnapshot): { path: string; content: string } | null {
  return findFile(snapshot, /(^|\/)readme(\.[a-z]+)?$/i);
}

interface PackageJson {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  workspaces?: unknown;
}

/** Parses the root `package.json` from `snapshot.files`, or `null`. */
export function parsePackageJson(snapshot: RepositorySnapshot): PackageJson | null {
  const file = snapshot.files.find((f) => basename(f.path).toLowerCase() === "package.json");
  if (!file) return null;
  try {
    const parsed: unknown = JSON.parse(file.content);
    if (parsed && typeof parsed === "object") return parsed as PackageJson;
  } catch {
    // A manifest we cannot parse is simply one signal fewer.
  }
  return null;
}

/** Every manifest text available in the snapshot, concatenated for regex scans. */
function manifestText(snapshot: RepositorySnapshot): string {
  return snapshot.files
    .filter((f) => !/readme/i.test(basename(f.path)))
    .map((f) => f.content)
    .join("\n");
}

/** Contents of any workflow files the ingestion layer happened to fetch. */
function workflowText(snapshot: RepositorySnapshot): string {
  return snapshot.files
    .filter((f) => /^\.github\/workflows\//.test(f.path.replace(/^\/+/, "")))
    .map((f) => f.content)
    .join("\n");
}

/* ------------------------------------------------------------------- tests */

const TEST_DIR_NAMES = /^(test|tests|__tests__|spec)$/;
const TEST_FILE = /\.(test|spec)\.[a-z0-9]+$/i;
const TEST_CONFIG =
  /^(vitest\.config\.[a-z]+|jest\.config\.[a-z]+|jest\.setup\.[a-z]+|pytest\.ini|tox\.ini|\.mocharc\.[a-z]+|karma\.conf\.[a-z]+|playwright\.config\.[a-z]+|cypress\.config\.[a-z]+|cypress\.json|phpunit\.xml(\.dist)?|\.rspec)$/i;
const TEST_DEP =
  /^(vitest|jest|mocha|jasmine|ava|tape|qunit|karma|playwright|@playwright\/test|cypress|@testing-library\/.+|chai|sinon|supertest|nyc|c8|uvu|node-tap|tap|bun-types|@vitest\/.+|@jest\/.+|ts-jest|enzyme)$/i;
const WORKFLOW_TEST_COMMAND = /\b(go test|cargo test|pytest|npm (run )?test|pnpm test|yarn test|mvn test|gradle test|dotnet test|ctest)\b/i;

/**
 * PLAN.md section 15. Strength counts distinct kinds of evidence, not files:
 * one category is weak, two or three is real, four or more is a fire station
 * with the lights on.
 */
export function detectTests(snapshot: RepositorySnapshot): RepoMetrics["tests"] {
  const signals: string[] = [];
  const categories = new Set<string>();
  const entries = snapshot.tree.entries;
  const blobs = blobsOf(entries);

  const dirs = [...dirSegments(entries)].filter((d) => TEST_DIR_NAMES.test(d)).sort();
  if (dirs.length > 0) {
    categories.add("dirs");
    signals.push(`test directories: ${dirs.join(", ")}`);
  }

  const testFiles = blobs.filter(
    (b) => TEST_FILE.test(basename(b.path)) || /^test_.+\.py$/i.test(basename(b.path)) || /_test\.(go|py|rb)$/i.test(basename(b.path)),
  );
  if (testFiles.length > 0) {
    categories.add("files");
    signals.push(`${testFiles.length} test file${testFiles.length === 1 ? "" : "s"}`);
  }

  const configs = [...new Set(blobs.map((b) => basename(b.path)).filter((n) => TEST_CONFIG.test(n)))].sort();
  if (configs.length > 0) {
    categories.add("config");
    signals.push(`test config: ${configs.join(", ")}`);
  }

  const pkg = parsePackageJson(snapshot);
  const testScript = pkg?.scripts?.test;
  if (testScript && !/no test specified/i.test(testScript)) {
    categories.add("script");
    signals.push(`package.json test script: ${testScript.slice(0, 60)}`);
  }

  const deps = Object.keys({ ...pkg?.dependencies, ...pkg?.devDependencies }).filter((d) =>
    TEST_DEP.test(d),
  );
  const pythonTestDeps = /\b(pytest|unittest2|nose2|hypothesis|tox)\b/i.test(manifestText(snapshot))
    ? ["pytest-family"]
    : [];
  if (deps.length > 0 || pythonTestDeps.length > 0) {
    categories.add("deps");
    signals.push(`testing dependencies: ${[...deps, ...pythonTestDeps].sort().join(", ")}`);
  }

  const workflowSays =
    WORKFLOW_TEST_COMMAND.test(workflowText(snapshot)) ||
    snapshot.workflows.some((w) => /\btests?\b/i.test(w.name) || /\btests?\b/i.test(w.path));
  if (workflowSays) {
    categories.add("workflow");
    signals.push("a workflow runs tests");
  }

  return { strength: strengthFromCategories(categories.size), signals };
}

/** 0 categories -> 0, 1 -> 1, 2-3 -> 2, 4+ -> 3. */
function strengthFromCategories(count: number): 0 | 1 | 2 | 3 {
  if (count === 0) return 0;
  if (count === 1) return 1;
  if (count <= 3) return 2;
  return 3;
}

/* -------------------------------------------------------------------- docs */

/**
 * Canonical documentation signal ids. `scoring.ts` reads these exact strings,
 * so they are part of the interface, not display text — use `DOC_SIGNAL_LABELS`
 * in the HUD.
 */
export const DOC_SIGNALS = {
  readme: "readme",
  docsDir: "docs-dir",
  contributing: "contributing",
  changelog: "changelog",
  examples: "examples",
  apiDocs: "api-docs",
} as const;

export const DOC_SIGNAL_LABELS: Record<string, string> = {
  [DOC_SIGNALS.readme]: "README",
  [DOC_SIGNALS.docsDir]: "Docs directory",
  [DOC_SIGNALS.contributing]: "Contribution guide",
  [DOC_SIGNALS.changelog]: "Changelog",
  [DOC_SIGNALS.examples]: "Examples",
  [DOC_SIGNALS.apiDocs]: "API documentation",
};

const API_DOC_FILE =
  /^(typedoc\.(json|js|cjs|mjs)|mkdocs\.ya?ml|docusaurus\.config\.[a-z]+|conf\.py|openapi\.(ya?ml|json)|swagger\.(ya?ml|json)|\.readthedocs\.ya?ml)$/i;

/** PLAN.md section 16. */
export function detectDocs(snapshot: RepositorySnapshot): RepoMetrics["docs"] {
  const signals: string[] = [];
  const entries = snapshot.tree.entries;
  const blobs = blobsOf(entries);
  const names = blobs.map((b) => basename(b.path).toLowerCase());
  const dirs = dirSegments(entries);

  const readme = findReadme(snapshot);
  const readmeInTree = blobs.some((b) => segments(b.path).length === 1 && /^readme(\.|$)/i.test(basename(b.path)));
  const readmeLength = readme?.content.length ?? 0;
  if (readme || readmeInTree) signals.push(DOC_SIGNALS.readme);

  if (dirs.has("docs") || dirs.has("doc") || dirs.has("documentation")) {
    signals.push(DOC_SIGNALS.docsDir);
  }
  if (names.some((n) => /^contributing(\.|$)/.test(n))) signals.push(DOC_SIGNALS.contributing);
  if (names.some((n) => /^(changelog|changes|history)(\.|$)/.test(n))) {
    signals.push(DOC_SIGNALS.changelog);
  }
  if (dirs.has("examples") || dirs.has("example") || dirs.has("samples") || dirs.has("demo")) {
    signals.push(DOC_SIGNALS.examples);
  }
  const apiDocs =
    names.some((n) => API_DOC_FILE.test(n)) ||
    blobs.some((b) => /(^|\/)docs?\/(api|reference)\//i.test(b.path));
  if (apiDocs) signals.push(DOC_SIGNALS.apiDocs);

  let strength: 0 | 1 | 2 | 3 = 0;
  if (signals.length >= 5) strength = 3;
  else if (signals.length >= 3) strength = 2;
  else if (signals.length >= 1) strength = 1;
  // A README nobody wrote more than a title for should not read as documented.
  if (strength > 1 && readmeLength < 400) strength = (strength - 1) as 0 | 1 | 2 | 3;

  return { strength, signals, readmeLength };
}

/* ---------------------------------------------------------------------- ci */

const OTHER_CI_FILES =
  /^(\.circleci\/config\.ya?ml|\.travis\.ya?ml|Jenkinsfile|\.gitlab-ci\.ya?ml|azure-pipelines\.ya?ml|\.drone\.ya?ml|appveyor\.ya?ml|buildkite\.ya?ml|\.woodpecker\.ya?ml|bitbucket-pipelines\.ya?ml)$/i;

/** PLAN.md section 14: the window is the last 50 runs on the default branch. */
export const CI_RUN_WINDOW = 50;

/** Conclusions that are neither a pass nor a failure and are simply ignored. */
const IGNORED_CONCLUSIONS = new Set(["skipped", "cancelled", "canceled", "stale"]);

/** PLAN.md section 14. `none` never means "broken", only "not observed here". */
export function detectCi(snapshot: RepositorySnapshot): RepoMetrics["ci"] {
  const treePaths = paths(snapshot);
  const hasOtherProvider = treePaths.some(
    (p) => OTHER_CI_FILES.test(p) || /^\.circleci\//.test(p),
  );

  if (snapshot.workflows.length === 0) {
    if (hasOtherProvider) {
      return { state: "unknown", provider: "other", failureRate: 0, recentRuns: 0 };
    }
    return { state: "none", provider: "none", failureRate: 0, recentRuns: 0 };
  }

  const considered = snapshot.workflowRuns
    .filter(
      (run) =>
        run.status === "completed" &&
        run.conclusion !== null &&
        !IGNORED_CONCLUSIONS.has(run.conclusion.toLowerCase()),
    )
    .slice(0, CI_RUN_WINDOW);

  if (considered.length === 0) {
    return { state: "unknown", provider: "github-actions", failureRate: 0, recentRuns: 0 };
  }

  const isSuccess = (conclusion: string | null): boolean =>
    conclusion === "success" || conclusion === "neutral";

  const failures = considered.filter((run) => !isSuccess(run.conclusion)).length;
  const failureRate = failures / considered.length;

  // Latest run per workflow, "latest" by createdAt with the array order as the
  // tie-break (GitHub returns newest first).
  const latest = new Map<number, (typeof considered)[number]>();
  for (const run of considered) {
    const current = latest.get(run.workflowId);
    if (!current || Date.parse(run.createdAt) > Date.parse(current.createdAt)) {
      latest.set(run.workflowId, run);
    }
  }

  const allLatestGreen = [...latest.values()].every((run) => isSuccess(run.conclusion));
  let state: CiState;
  if (allLatestGreen) state = "healthy";
  else if (failureRate >= 0.4) state = "failing";
  else state = "recent-failure";

  return {
    state,
    provider: "github-actions",
    failureRate: Math.round(failureRate * 1000) / 1000,
    recentRuns: considered.length,
  };
}

/* ----------------------------------------------------------------- tooling */

/**
 * Tooling signals are `"<category>: <detail>"` with category in
 * `lint | format | typecheck | build`. `scoring.ts` scores 0.25 per distinct
 * category (PLAN.md section 23), so the prefix is load-bearing.
 */
export const TOOLING_CATEGORIES = ["lint", "format", "typecheck", "build"] as const;
export type ToolingCategory = (typeof TOOLING_CATEGORIES)[number];

/** The distinct categories present in a tooling signal list. */
export function toolingCategoriesOf(signals: readonly string[]): Set<ToolingCategory> {
  const out = new Set<ToolingCategory>();
  for (const signal of signals) {
    const category = signal.split(":")[0].trim() as ToolingCategory;
    if ((TOOLING_CATEGORIES as readonly string[]).includes(category)) out.add(category);
  }
  return out;
}

const TOOLING_FILES: { match: RegExp; category: ToolingCategory; label: string }[] = [
  { match: /^\.eslintrc(\.[a-z]+)?$/i, category: "lint", label: "ESLint" },
  { match: /^eslint\.config\.[a-z]+$/i, category: "lint", label: "ESLint" },
  { match: /^biome\.jsonc?$/i, category: "lint", label: "Biome" },
  { match: /^\.golangci\.ya?ml$/i, category: "lint", label: "golangci-lint" },
  { match: /^\.rubocop\.ya?ml$/i, category: "lint", label: "RuboCop" },
  { match: /^\.flake8$|^ruff\.toml$|^\.ruff\.toml$/i, category: "lint", label: "Ruff/Flake8" },
  { match: /^clippy\.toml$/i, category: "lint", label: "Clippy" },
  { match: /^\.pylintrc$/i, category: "lint", label: "Pylint" },
  { match: /^\.prettierrc(\.[a-z]+)?$|^prettier\.config\.[a-z]+$/i, category: "format", label: "Prettier" },
  { match: /^rustfmt\.toml$|^\.rustfmt\.toml$/i, category: "format", label: "rustfmt" },
  { match: /^\.editorconfig$/i, category: "format", label: "EditorConfig" },
  { match: /^\.clang-format$/i, category: "format", label: "clang-format" },
  { match: /^tsconfig(\.[a-z]+)?\.json$/i, category: "typecheck", label: "TypeScript" },
  { match: /^jsconfig\.json$/i, category: "typecheck", label: "jsconfig" },
  { match: /^mypy\.ini$|^\.mypy\.ini$/i, category: "typecheck", label: "mypy" },
  { match: /^pyrightconfig\.json$/i, category: "typecheck", label: "Pyright" },
  { match: /^(next|vite|webpack|rollup|tsup|esbuild|astro|nuxt|svelte|rspack|gulpfile|babel)\.config\.[a-z]+$/i, category: "build", label: "bundler config" },
  { match: /^makefile$/i, category: "build", label: "Makefile" },
  { match: /^justfile$/i, category: "build", label: "just" },
  { match: /^(cargo\.toml|go\.mod|pyproject\.toml|pom\.xml|build\.gradle(\.kts)?|cmakelists\.txt|build\.zig)$/i, category: "build", label: "build manifest" },
  { match: /^dockerfile$/i, category: "build", label: "Dockerfile" },
];

const TOOLING_DEPS: { match: RegExp; category: ToolingCategory; label: string }[] = [
  { match: /^eslint$/i, category: "lint", label: "ESLint" },
  { match: /^@biomejs\/biome$/i, category: "lint", label: "Biome" },
  { match: /^(oxlint|xo|standard)$/i, category: "lint", label: "linter" },
  { match: /^prettier$/i, category: "format", label: "Prettier" },
  { match: /^typescript$/i, category: "typecheck", label: "TypeScript" },
];

const MANIFEST_TOOLING: { match: RegExp; category: ToolingCategory; label: string }[] = [
  { match: /\[tool\.ruff\]/, category: "lint", label: "Ruff" },
  { match: /\[tool\.black\]/, category: "format", label: "Black" },
  { match: /\[tool\.mypy\]/, category: "typecheck", label: "mypy" },
  { match: /\[build-system\]/, category: "build", label: "build-system" },
];

/** PLAN.md section 23: linting, formatting, type checks and build configuration. */
export function detectTooling(snapshot: RepositorySnapshot): RepoMetrics["tooling"] {
  const found = new Map<string, string>(); // "category: label" -> signal
  const names = new Set(blobsOf(snapshot.tree.entries).map((b) => basename(b.path)));

  for (const name of names) {
    for (const rule of TOOLING_FILES) {
      if (rule.match.test(name)) found.set(`${rule.category}: ${rule.label}`, `${rule.category}: ${rule.label}`);
    }
  }

  const pkg = parsePackageJson(snapshot);
  const deps = Object.keys({ ...pkg?.dependencies, ...pkg?.devDependencies });
  for (const dep of deps) {
    for (const rule of TOOLING_DEPS) {
      if (rule.match.test(dep)) found.set(`${rule.category}: ${rule.label}`, `${rule.category}: ${rule.label}`);
    }
  }
  if (pkg?.scripts?.build) found.set("build: build script", "build: build script");
  if (pkg?.scripts?.lint) found.set("lint: lint script", "lint: lint script");
  if (pkg?.scripts?.typecheck ?? pkg?.scripts?.["type-check"]) {
    found.set("typecheck: typecheck script", "typecheck: typecheck script");
  }

  const text = manifestText(snapshot);
  for (const rule of MANIFEST_TOOLING) {
    if (rule.match.test(text)) found.set(`${rule.category}: ${rule.label}`, `${rule.category}: ${rule.label}`);
  }

  return { signals: [...found.values()].sort() };
}
