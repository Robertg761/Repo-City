import type { BuildingPlan, DistrictPlan } from "@/types/analysis";

import type { InterpretInput } from "./types";

/**
 * A small hand-built `InterpretInput`, shared by the unit tests. It stands in
 * for what W3 will hand the interpreter; only the shape matters here.
 */
export const TEST_OUTLINE = [
  "README.md",
  "package.json",
  "src/index.ts",
  "src/router/router.ts",
  "src/router/trie.ts",
  "src/middleware/cors.ts",
  "docs/getting-started.md",
  "test/router.test.ts",
].join("\n");

export const TEST_DISTRICTS: DistrictPlan[] = [
  { id: "d-src", sourcePath: "/src", name: "src", purpose: null, fileCount: 4, weight: 0.6 },
  { id: "d-docs", sourcePath: "/docs", name: "docs", purpose: null, fileCount: 1, weight: 0.2 },
  { id: "d-test", sourcePath: "/test", name: "test", purpose: null, fileCount: 1, weight: 0.2 },
];

export const TEST_BUILDINGS: BuildingPlan[] = [
  {
    id: "b-index",
    path: "src/index.ts",
    kind: "file",
    districtId: "d-src",
    score: 9,
    tier: 5,
    descendantCount: 0,
    language: "TypeScript",
    role: null,
    landmark: null,
  },
  {
    id: "b-router",
    path: "src/router/router.ts",
    kind: "file",
    districtId: "d-src",
    score: 7,
    tier: 4,
    descendantCount: 0,
    language: "TypeScript",
    role: null,
    landmark: null,
  },
];

export function makeInput(overrides: Partial<InterpretInput> = {}): InterpretInput {
  return {
    repo: {
      owner: "acme",
      name: "widget",
      fullName: "acme/widget",
      url: "https://github.com/acme/widget",
      description: "A small router",
      defaultBranch: "main",
      headSha: "0".repeat(40),
      stars: 12,
      forks: 3,
      openIssuesCount: 2,
      archived: false,
      isFork: false,
      createdAt: "2024-01-01T00:00:00Z",
      pushedAt: "2026-09-01T00:00:00Z",
      license: "MIT",
      primaryLanguage: "TypeScript",
      topics: ["router"],
    },
    treeOutline: TEST_OUTLINE,
    readme: "# widget\n\nA small router.",
    manifests: [{ path: "package.json", content: '{"name":"widget"}' }],
    workflows: [{ name: "CI", path: ".github/workflows/ci.yml" }],
    metricsSummary: "health 0.72 (Healthy); commits last 30d: 14; CI healthy",
    districts: TEST_DISTRICTS,
    buildings: TEST_BUILDINGS,
    ...overrides,
  };
}
