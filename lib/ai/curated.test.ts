import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import {
  CURATED_DIRECTORY,
  clearCuratedCache,
  createCuratedInterpreter,
  curatedFileName,
  listCuratedRepositories,
  loadCuratedInterpretation,
} from "./curated";
import { buildKnownPathIndex } from "./paths";
import { LIMITS, aiInterpretationSchema, sanitizeInterpretation } from "./schema";
import { makeInput } from "./testInput";

const directory = path.join(process.cwd(), CURATED_DIRECTORY);
const files = (await readdir(directory)).filter((file) => file.endsWith(".json")).sort();

beforeEach(() => {
  clearCuratedCache();
});

describe("fixtures/interpretations", () => {
  it("covers the reference repositories from PLAN.md section 59", async () => {
    const repositories = await listCuratedRepositories();
    expect(repositories.length).toBe(files.length);
    expect(repositories).toContain("honojs/hono");
    expect(repositories).toContain("vitejs/vite");
    expect(repositories).toContain("react/react");
    expect(repositories).toContain("facebook/react");
    expect(repositories).toContain("vercel/turborepo");
    expect(repositories).toContain("atom/atom");
  });

  it.each(files)("%s is a valid AiInterpretation", async (file) => {
    const raw = JSON.parse(await readFile(path.join(directory, file), "utf8"));
    const parsed = aiInterpretationSchema.safeParse(raw);
    expect(parsed.error?.issues ?? []).toEqual([]);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    const interpretation = parsed.data;
    expect(interpretation.model).toContain("curated");
    expect(file).toMatch(/^[a-z0-9._-]+__[a-z0-9._-]+\.json$/);

    // Section 8 shape: enough districts to make a city, never more than the
    // planner can produce.
    expect(interpretation.districts.length).toBeGreaterThanOrEqual(4);
    expect(interpretation.districts.length).toBeLessThanOrEqual(LIMITS.districts);
    expect(interpretation.importantModules.length).toBeGreaterThanOrEqual(6);

    const sourcePaths = interpretation.districts.map((district) => district.sourcePath);
    expect(new Set(sourcePaths).size).toBe(sourcePaths.length);
    for (const sourcePath of sourcePaths) {
      expect(sourcePath.startsWith("/")).toBe(true);
    }

    // Everything must be able to point at something.
    for (const district of interpretation.districts) {
      expect(district.evidence.length).toBeGreaterThan(0);
    }
    const modulePaths = interpretation.importantModules.map((module) => module.path);
    expect(new Set(modulePaths).size).toBe(modulePaths.length);
    for (const modulePath of modulePaths) {
      expect(modulePath.startsWith("/")).toBe(false);
    }
  });

  it("keeps facebook__react.json identical to react__react.json", async () => {
    const [canonical, alias] = await Promise.all([
      readFile(path.join(directory, "react__react.json"), "utf8"),
      readFile(path.join(directory, "facebook__react.json"), "utf8"),
    ]);
    expect(alias).toBe(canonical);
  });

  it.each(files)("%s survives grounding against its own evidence", async (file) => {
    const interpretation = aiInterpretationSchema.parse(
      JSON.parse(await readFile(path.join(directory, file), "utf8")),
    );
    const knownPaths = buildKnownPathIndex([
      ...interpretation.districts.flatMap((district) => district.evidence),
      ...interpretation.importantModules.flatMap((module) => [module.path, ...module.evidence]),
    ]);
    const districts = interpretation.districts.map((district, index) => ({
      id: `d-${index}`,
      sourcePath: district.sourcePath,
      name: district.sourcePath.slice(1),
      purpose: null,
      fileCount: 1,
      weight: 1,
    }));

    const sanitized = sanitizeInterpretation(interpretation, knownPaths, districts);

    expect(sanitized.districts).toHaveLength(interpretation.districts.length);
    expect(sanitized.importantModules).toHaveLength(interpretation.importantModules.length);
    for (const [index, district] of sanitized.districts.entries()) {
      expect(district.evidence).toHaveLength(interpretation.districts[index].evidence.length);
    }
  });
});

describe("curatedFileName", () => {
  it("lower-cases and joins with a double underscore", () => {
    expect(curatedFileName("HonoJS/Hono")).toBe("honojs__hono.json");
    expect(curatedFileName("tj/commander.js")).toBe("tj__commander.js.json");
  });

  it("rejects anything that is not owner/repo", () => {
    expect(curatedFileName("hono")).toBeNull();
    expect(curatedFileName("a/b/c")).toBeNull();
    expect(curatedFileName("../../etc/passwd")).toBeNull();
    expect(curatedFileName("owner/../secret")).toBeNull();
  });
});

describe("loadCuratedInterpretation", () => {
  it("reads a committed file and caches the result", async () => {
    const first = await loadCuratedInterpretation("honojs/hono");
    const second = await loadCuratedInterpretation("HONOJS/HONO");
    expect(first?.summary).toContain("Hono");
    expect(second).toBe(first);
  });

  it("returns null for a repository with no curated file", async () => {
    expect(await loadCuratedInterpretation("acme/widget")).toBeNull();
  });
});

describe("createCuratedInterpreter", () => {
  it("skips repositories it has no file for", async () => {
    const result = await createCuratedInterpreter()(makeInput());
    expect(result).toEqual({ status: "skipped", interpretation: null });
  });
});
