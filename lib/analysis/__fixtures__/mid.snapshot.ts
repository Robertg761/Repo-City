/**
 * Fixture: a healthy mid-size TypeScript library.
 *
 * Green CI, a real test suite, full documentation, 30 open issues, 8 pull
 * requests including two merged, 5 releases. This is the "active healthy repo"
 * category from PLAN.md section 59 and the main end-to-end fixture for
 * `analyzeSnapshot`.
 *
 * Every timestamp is relative to `MID_NOW`; pass that same date as `opts.now`
 * so the fixture never ages.
 */

import type { IssueSummary, PullSummary, RepositorySnapshot } from "@/types/repository";
import { daysBefore, treeFromPaths } from "./helpers";

/** The fixed clock this fixture is written against. */
export const MID_NOW = new Date("2026-09-21T12:00:00.000Z");

const ago = (days: number): string => daysBefore(MID_NOW, days);

/* -------------------------------------------------------------------- tree */

const SRC = [
  "src/index.ts",
  "src/client.ts",
  "src/config.ts",
  "src/core/engine.ts",
  "src/core/scheduler.ts",
  "src/core/registry.ts",
  "src/core/errors.ts",
  "src/core/types.ts",
  "src/core/index.ts",
  "src/core/context.ts",
  "src/core/lifecycle.ts",
  "src/router/index.ts",
  "src/router/dispatch.ts",
  "src/router/match.ts",
  "src/router/params.ts",
  "src/router/routes.ts",
  "src/router/guards.ts",
  "src/cache/index.ts",
  "src/cache/store.ts",
  "src/cache/lru.ts",
  "src/cache/ttl.ts",
  "src/cache/serialize.ts",
  "src/http/index.ts",
  "src/http/client.ts",
  "src/http/request.ts",
  "src/http/response.ts",
  "src/http/retry.ts",
  "src/http/headers.ts",
  "src/http/fetchAdapter.ts",
  "src/transform/index.ts",
  "src/transform/parse.ts",
  "src/transform/serialize.ts",
  "src/transform/schema.ts",
  "src/transform/validate.ts",
  "src/plugins/index.ts",
  "src/plugins/registry.ts",
  "src/plugins/hooks.ts",
  "src/plugins/resolve.ts",
  "src/utils/index.ts",
  "src/utils/assert.ts",
  "src/utils/clone.ts",
  "src/utils/debounce.ts",
  "src/utils/deepEqual.ts",
  "src/utils/logger.ts",
  "src/utils/path.ts",
  "src/utils/time.ts",
  "src/utils/uuid.ts",
  "src/telemetry/index.ts",
  "src/telemetry/metrics.ts",
  "src/telemetry/tracing.ts",
  "src/telemetry/span.ts",
  "src/adapters/node/index.ts",
  "src/adapters/node/fs.ts",
  "src/adapters/node/stream.ts",
  "src/adapters/browser/index.ts",
  "src/adapters/browser/storage.ts",
  "src/adapters/browser/worker.ts",
  "src/internal/constants.ts",
  "src/internal/guards.ts",
  "src/internal/symbols.ts",
];

const TESTS = [
  "tests/setup.ts",
  "tests/unit/core.test.ts",
  "tests/unit/router.test.ts",
  "tests/unit/cache.test.ts",
  "tests/unit/http.test.ts",
  "tests/unit/transform.test.ts",
  "tests/unit/plugins.test.ts",
  "tests/unit/utils.test.ts",
  "tests/unit/telemetry.test.ts",
  "tests/integration/client.test.ts",
  "tests/integration/router.test.ts",
  "tests/integration/cache.test.ts",
  "tests/integration/retry.test.ts",
  "tests/e2e/browser.test.ts",
  "tests/e2e/node.test.ts",
  "tests/regression/issue-233.test.ts",
  "tests/regression/issue-398.test.ts",
  "tests/regression/issue-412.test.ts",
  "tests/fixtures/responses.json",
  "tests/fixtures/routes.json",
  "tests/fixtures/schema.json",
  "tests/helpers/server.ts",
  "tests/helpers/mock.ts",
  "tests/helpers/time.ts",
  "tests/bench/router.bench.ts",
];

const DOCS = [
  "docs/index.md",
  "docs/getting-started.md",
  "docs/installation.md",
  "docs/configuration.md",
  "docs/migration.md",
  "docs/faq.md",
  "docs/troubleshooting.md",
  "docs/api/index.md",
  "docs/api/client.md",
  "docs/api/router.md",
  "docs/api/cache.md",
  "docs/api/http.md",
  "docs/api/plugins.md",
  "docs/guides/caching.md",
  "docs/guides/routing.md",
  "docs/guides/plugins.md",
  "docs/guides/testing.md",
  "docs/guides/deployment.md",
  "docs/architecture/overview.md",
  "docs/architecture/decisions.md",
];

const EXAMPLES = [
  "examples/basic/index.ts",
  "examples/basic/package.json",
  "examples/basic/README.md",
  "examples/express/server.ts",
  "examples/express/package.json",
  "examples/next-app/app/page.tsx",
  "examples/next-app/package.json",
  "examples/worker/index.ts",
  "examples/worker/wrangler.toml",
  "examples/cli/index.ts",
  "examples/cli/package.json",
  "examples/deno/main.ts",
];

const SCRIPTS = [
  "scripts/build.ts",
  "scripts/release.ts",
  "scripts/changelog.ts",
  "scripts/docs.ts",
  "scripts/size-limit.ts",
  "scripts/bench.ts",
  "scripts/lint-exports.ts",
  "scripts/verify-types.ts",
];

const ROOT = [
  "README.md",
  "package.json",
  "tsconfig.json",
  "CHANGELOG.md",
  "CONTRIBUTING.md",
  "LICENSE",
  "eslint.config.mjs",
  "vitest.config.ts",
  "tsup.config.ts",
  "Dockerfile",
  "pnpm-workspace.yaml",
  ".gitignore",
  ".prettierrc",
  ".npmrc",
  ".github/workflows/ci.yml",
  ".github/workflows/release.yml",
  ".github/ISSUE_TEMPLATE/bug.md",
  ".github/PULL_REQUEST_TEMPLATE.md",
  "pnpm-lock.yaml",
  "assets/logo.png",
  "node_modules/.modules.yaml",
];

/* ------------------------------------------------------------------ issues */

/** `[number, title, labels, createdDaysAgo, updatedDaysAgo, comments, body]`. */
type IssueRow = [number, string, string[], number, number, number, string];

const ISSUE_ROWS: IssueRow[] = [
  [412, "Router drops the pending transition after a fast refresh", ["bug", "priority-high", "router"], 64, 2, 27, "Navigating twice within one tick leaves src/router/dispatch.ts holding a stale transition, so the second navigation never resolves."],
  [409, "Security: prototype pollution via transform.parse on untrusted input", ["bug", "security"], 38, 3, 14, "A crafted payload reaching src/transform/parse.ts can set __proto__ on the result object."],
  [398, "Cache eviction races with concurrent resolve() calls", ["bug", "cache"], 41, 9, 8, "Two resolve() calls that miss the same key can both write, and the loser's entry is what survives in src/cache/store.ts."],
  [391, "Retry backoff ignores the Retry-After header", ["bug", "http"], 55, 12, 6, "src/http/retry.ts computes its own delay and never reads Retry-After."],
  [386, "Memory grows without bound when telemetry spans are never closed", ["bug", "telemetry", "p1"], 71, 6, 11, "src/telemetry/span.ts keeps finished spans referenced from the registry."],
  [377, "Crash on Node 24 when the fs adapter reads a zero-byte file", ["bug", "crash", "adapters"], 88, 21, 4, "src/adapters/node/fs.ts throws instead of returning an empty buffer."],
  [366, "Types: inferred plugin return type collapses to unknown", ["bug", "types"], 103, 18, 9, "src/plugins/resolve.ts loses the generic parameter."],
  [352, "Regression: deepEqual returns true for differing Date objects", ["bug", "regression"], 121, 34, 5, "src/utils/deepEqual.ts compares Date by reference since 4.2.0."],
  [341, "Router guards run twice for nested routes", ["bug", "router"], 140, 44, 7, "Reported against src/router/guards.ts."],
  [333, "Support streaming responses in the browser adapter", ["enhancement", "adapters"], 152, 11, 12, "It would be useful if src/adapters/browser could expose a ReadableStream."],
  [329, "Document the plugin lifecycle ordering", ["documentation"], 158, 7, 3, "docs/guides/plugins.md does not say when hooks fire."],
  [318, "Add a codemod for the 5.0 migration", ["enhancement", "tooling"], 171, 25, 6, "Referenced from docs/migration.md."],
  [306, "LRU cache size option is ignored when ttl is set", ["bug", "cache"], 188, 61, 4, "src/cache/lru.ts overwrites maxSize."],
  [301, "Stale: request cancellation leaks an abort listener", ["bug", "http"], 196, 201, 2, "src/http/request.ts never removes its listener."],
  [295, "Windows paths are normalized twice in the CLI example", ["bug"], 212, 209, 1, "examples/cli/index.ts double-normalizes."],
  [288, "Improve the error message for an unknown route", ["enhancement", "router"], 224, 33, 5, "src/router/match.ts could suggest the closest route."],
  [277, "Benchmark suite needs a warmup phase", ["enhancement", "performance"], 238, 190, 2, "tests/bench/router.bench.ts reports cold numbers."],
  [269, "Support custom serializers in the cache", ["enhancement", "cache"], 251, 40, 8, "Extend src/cache/serialize.ts."],
  [262, "Defect: scheduler starves low-priority tasks under load", ["defect", "core", "p1"], 264, 15, 13, "src/core/scheduler.ts never drains the low queue."],
  [255, "Docs: getting started example does not compile", ["documentation", "bug"], 271, 29, 3, "docs/getting-started.md uses the 4.x import path."],
  [248, "Add an ESM-only build variant", ["enhancement", "build"], 283, 52, 9, "tsup.config.ts would need a second entry."],
  [240, "Telemetry exporter should batch spans", ["enhancement", "telemetry"], 296, 210, 4, "src/telemetry/metrics.ts sends one request per span."],
  [233, "Windows paths are normalized twice in the codemod package", ["bug", "windows"], 288, 215, 6, "scripts/build.ts normalizes a second time."],
  [226, "Question: how do I share a cache between workers?", ["question"], 305, 195, 2, "Mentions src/adapters/browser/worker.ts."],
  [219, "Allow disabling telemetry entirely", ["enhancement"], 318, 71, 5, "A config flag in src/config.ts."],
  [211, "Flaky integration test: retry.test.ts times out on CI", ["bug", "flaky"], 327, 230, 3, "tests/integration/retry.test.ts."],
  [204, "Add Deno support to the examples", ["enhancement", "documentation"], 340, 88, 2, "examples/deno/main.ts is out of date."],
  [198, "Clarify the license for the bundled fixtures", ["question"], 352, 240, 1, "tests/fixtures/responses.json origin is unclear."],
  [186, "Old: request headers are lowercased inconsistently", ["bug", "http"], 371, 260, 2, "src/http/headers.ts."],
  [175, "Proposal: first-class OpenTelemetry integration", ["enhancement", "telemetry"], 402, 96, 17, "Would build on src/telemetry/tracing.ts."],
];

const issues: IssueSummary[] = ISSUE_ROWS.map(
  ([number, title, labels, created, updated, comments, body]) => ({
    number,
    title,
    url: `https://github.com/hackyard/atlas/issues/${number}`,
    createdAt: ago(created),
    updatedAt: ago(updated),
    comments,
    labels,
    author: ["mara-quinn", "devon-oyelaran", "sasha-lindqvist", "kenji-moreau"][number % 4],
    bodyExcerpt: body,
  }),
);

/* ------------------------------------------------------------------- pulls */

/** `[number, title, createdDaysAgo, updatedDaysAgo, mergedDaysAgo|null, draft, comments]`. */
type PullRow = [number, string, number, number, number | null, boolean, string[]];

const PULL_ROWS: PullRow[] = [
  [421, "fix(router): clear the pending transition on refresh", 5, 1, null, false, ["bug", "router"]],
  [419, "feat(cache): pluggable serializers", 9, 3, null, false, ["enhancement"]],
  [417, "docs: rewrite the plugin lifecycle guide", 12, 6, null, false, ["documentation"]],
  [408, "perf(http): reuse the agent across requests", 40, 31, null, false, ["performance"]],
  [372, "refactor(core): split the scheduler queues", 130, 96, null, true, ["core"]],
  [344, "feat(adapters): experimental Bun adapter", 190, 165, null, false, ["enhancement"]],
  [420, "fix(telemetry): release finished spans", 8, 4, 4, false, ["bug", "telemetry"]],
  [414, "chore: bump the toolchain to TypeScript 5.9", 20, 11, 11, false, ["tooling"]],
];

const pulls: PullSummary[] = PULL_ROWS.map(
  ([number, title, created, updated, merged, draft, labels]) => ({
    number,
    title,
    url: `https://github.com/hackyard/atlas/pull/${number}`,
    createdAt: ago(created),
    updatedAt: ago(updated),
    mergedAt: merged === null ? null : ago(merged),
    draft,
    comments: (number % 7) + 1,
    labels,
    author: ["mara-quinn", "devon-oyelaran", "sasha-lindqvist", "kenji-moreau"][number % 4],
    state: merged === null ? "open" : "merged",
  }),
);

/* ----------------------------------------------------------------- commits */

const COMMIT_AUTHORS = [
  "mara-quinn",
  "devon-oyelaran",
  "sasha-lindqvist",
  "kenji-moreau",
  "priya-raman",
  "tomas-berg",
];

const commits = Array.from({ length: 48 }, (_, i) => ({
  sha: `c${String(i).padStart(3, "0")}${"a1b2c3d4e5f6".repeat(3)}`.slice(0, 40),
  date: ago(Math.round(i * 2.4) + 1),
  authorLogin: COMMIT_AUTHORS[i % COMMIT_AUTHORS.length],
  message: `chore: routine change ${i}`,
}));

/* --------------------------------------------------------- workflows / CI */

const workflowRuns = Array.from({ length: 20 }, (_, i) => ({
  id: 90_000 + i,
  workflowId: i % 2 === 0 ? 1001 : 1002,
  name: i % 2 === 0 ? "CI" : "Release",
  status: "completed",
  // Two older failures, every recent run green: latest-per-workflow is green,
  // so PLAN.md section 14 derives "healthy".
  conclusion: i === 12 || i === 17 ? "failure" : i === 15 ? "skipped" : "success",
  createdAt: ago(i * 2 + 1),
  url: `https://github.com/hackyard/atlas/actions/runs/${90_000 + i}`,
}));

/* ------------------------------------------------------------------- files */

const README = `# Atlas

Atlas is a small, dependency-free TypeScript library for building request
pipelines. It gives you a router, a cache, an HTTP client and a plugin system
that all share one lifecycle, and it runs unchanged on Node, Bun, Deno,
Cloudflare Workers and in the browser.

## Install

\`\`\`bash
pnpm add @hackyard/atlas
\`\`\`

## Quick start

\`\`\`ts
import { createClient } from "@hackyard/atlas";

const client = createClient({
  cache: { maxSize: 500, ttl: 30_000 },
  retry: { attempts: 3 },
});

const user = await client.get("/users/1");
\`\`\`

## How it fits together

The entry point is \`src/index.ts\`. It wires four subsystems:

- \`src/router\` resolves a request to a handler. Route matching lives in
  \`src/router/match.ts\` and dispatch in \`src/router/dispatch.ts\`.
- \`src/cache\` stores resolved responses. The default store is an LRU with a
  TTL sweep (\`src/cache/lru.ts\`).
- \`src/http\` performs the transport. Retries, backoff and header handling are
  isolated in \`src/http/retry.ts\` and \`src/http/headers.ts\`.
- \`src/plugins\` lets you hook every lifecycle phase without patching the core.

Platform differences are confined to \`src/adapters\`: \`src/adapters/node\`
and \`src/adapters/browser\` implement the same three interfaces.

## Documentation

Full documentation lives in \`docs/\`. Start with \`docs/getting-started.md\`,
then \`docs/configuration.md\`. The API reference is generated into
\`docs/api/\`. Architecture decisions are recorded in
\`docs/architecture/decisions.md\`.

## Examples

Runnable projects live in \`examples/\`: a minimal script, an Express server, a
Next.js app, a Cloudflare Worker, a CLI and a Deno entry point. Each one is
built in CI so it cannot rot.

## Testing

\`pnpm test\` runs the Vitest suite in \`tests/\`. Unit tests mirror the source
layout, \`tests/integration\` exercises a real server, and every fixed bug gets
a regression test under \`tests/regression\`.

## Contributing

Read \`CONTRIBUTING.md\` first. In short: open an issue before a large change,
keep commits conventional, and make sure \`pnpm lint\`, \`pnpm typecheck\` and
\`pnpm test\` pass.

## License

MIT. See \`LICENSE\`.
`;

const PACKAGE_JSON = JSON.stringify(
  {
    name: "@hackyard/atlas",
    version: "5.1.2",
    type: "module",
    scripts: {
      build: "tsup",
      test: "vitest run",
      lint: "eslint .",
      typecheck: "tsc --noEmit",
      docs: "tsx scripts/docs.ts",
    },
    dependencies: {},
    devDependencies: {
      vitest: "^3.0.0",
      "@vitest/coverage-v8": "^3.0.0",
      typescript: "^5.9.0",
      eslint: "^9.0.0",
      prettier: "^3.3.0",
      tsup: "^8.0.0",
      "@playwright/test": "^1.48.0",
    },
  },
  null,
  2,
);

const TSCONFIG_JSON = JSON.stringify(
  { compilerOptions: { strict: true, target: "ES2022", module: "esnext", declaration: true } },
  null,
  2,
);

/* ---------------------------------------------------------------- snapshot */

export const midSnapshot: RepositorySnapshot = {
  repo: {
    owner: "hackyard",
    name: "atlas",
    fullName: "hackyard/atlas",
    url: "https://github.com/hackyard/atlas",
    description: "A dependency-free TypeScript request pipeline: router, cache, HTTP and plugins.",
    defaultBranch: "main",
    headSha: "9f2c41ab77de0c3a5b18e4d6f0a9c7b2e13d4856",
    stars: 3421,
    forks: 214,
    openIssuesCount: 38,
    archived: false,
    isFork: false,
    createdAt: ago(1180),
    pushedAt: ago(2),
    license: "MIT",
    primaryLanguage: "TypeScript",
    topics: ["typescript", "http", "cache", "router", "library"],
  },
  tree: (() => {
    const entries = treeFromPaths([...ROOT, ...SRC, ...TESTS, ...DOCS, ...EXAMPLES, ...SCRIPTS]);
    return { truncated: false, totalEntries: entries.length, entries };
  })(),
  commits,
  issues,
  pulls,
  contributors: [
    { login: "mara-quinn", contributions: 812 },
    { login: "devon-oyelaran", contributions: 431 },
    { login: "sasha-lindqvist", contributions: 288 },
    { login: "kenji-moreau", contributions: 154 },
    { login: "priya-raman", contributions: 96 },
    { login: "tomas-berg", contributions: 41 },
  ],
  workflows: [
    { id: 1001, name: "CI", path: ".github/workflows/ci.yml", state: "active" },
    { id: 1002, name: "Release", path: ".github/workflows/release.yml", state: "active" },
  ],
  workflowRuns,
  releases: [
    { tag: "v5.1.2", name: "5.1.2", publishedAt: ago(9), url: "https://github.com/hackyard/atlas/releases/tag/v5.1.2" },
    { tag: "v5.1.1", name: "5.1.1", publishedAt: ago(37), url: "https://github.com/hackyard/atlas/releases/tag/v5.1.1" },
    { tag: "v5.1.0", name: "5.1.0", publishedAt: ago(71), url: "https://github.com/hackyard/atlas/releases/tag/v5.1.0" },
    { tag: "v5.0.0", name: "5.0.0", publishedAt: ago(140), url: "https://github.com/hackyard/atlas/releases/tag/v5.0.0" },
    { tag: "v4.9.3", name: "4.9.3", publishedAt: ago(201), url: "https://github.com/hackyard/atlas/releases/tag/v4.9.3" },
  ],
  files: [
    { path: "README.md", content: README },
    { path: "package.json", content: PACKAGE_JSON },
    { path: "tsconfig.json", content: TSCONFIG_JSON },
  ],
  fetchedAt: MID_NOW.toISOString(),
  requestCount: 14,
  warnings: [],
};
