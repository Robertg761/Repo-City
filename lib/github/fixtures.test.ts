import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { RepoAnalysis } from "@/types/analysis";
import { fixtureFileName, isFixtureFallbackEnabled, loadFixtureAnalysis } from "./fixtures";

function fixtureRoot(name: string, body: string): string {
  const root = mkdtempSync(path.join(tmpdir(), "repo-city-fixture-"));
  mkdirSync(path.join(root, "fixtures"));
  writeFileSync(path.join(root, "fixtures", name), body, "utf8");
  return root;
}

const analysis = {
  repo: { fullName: "honojs/hono" },
  metrics: { health: { score: 72 } },
  source: "live",
} as unknown as RepoAnalysis;

describe("isFixtureFallbackEnabled", () => {
  it("is on for truthy values and off otherwise", () => {
    for (const value of ["true", "1", "yes", "TRUE"]) {
      expect(isFixtureFallbackEnabled({ FIXTURE_FALLBACK: value } as unknown as NodeJS.ProcessEnv)).toBe(true);
    }
    for (const value of ["false", "0", "off", "", undefined]) {
      expect(isFixtureFallbackEnabled({ FIXTURE_FALLBACK: value } as unknown as NodeJS.ProcessEnv)).toBe(false);
    }
    expect(isFixtureFallbackEnabled({} as unknown as NodeJS.ProcessEnv)).toBe(false);
  });
});

describe("fixtureFileName", () => {
  it("is lower case with a double underscore", () => {
    expect(fixtureFileName("HonoJS", "Hono")).toBe("honojs__hono.analysis.json");
  });
});

describe("loadFixtureAnalysis", () => {
  it("loads a fixture and marks it as one", async () => {
    const root = fixtureRoot("honojs__hono.analysis.json", JSON.stringify(analysis));

    const loaded = await loadFixtureAnalysis("honojs", "hono", root);

    expect(loaded?.repo.fullName).toBe("honojs/hono");
    expect(loaded?.source).toBe("fixture");
  });

  it("matches case-insensitively", async () => {
    const root = fixtureRoot("honojs__hono.analysis.json", JSON.stringify(analysis));
    expect(await loadFixtureAnalysis("HonoJS", "Hono", root)).not.toBeNull();
  });

  it("answers null when there is no fixture", async () => {
    const root = fixtureRoot("other__repo.analysis.json", JSON.stringify(analysis));
    expect(await loadFixtureAnalysis("honojs", "hono", root)).toBeNull();
  });

  it("answers null for malformed or incomplete JSON instead of throwing", async () => {
    const broken = fixtureRoot("honojs__hono.analysis.json", "{not json");
    expect(await loadFixtureAnalysis("honojs", "hono", broken)).toBeNull();

    const partial = fixtureRoot("honojs__hono.analysis.json", JSON.stringify({ repo: {} }));
    expect(await loadFixtureAnalysis("honojs", "hono", partial)).toBeNull();
  });
});
