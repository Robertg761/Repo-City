import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { RepoAnalysis } from "@/types/analysis";
import { detectLayout, fixtureSettlement } from "./migrate-fixtures";

const load = (name: string): { raw: string; analysis: RepoAnalysis } => {
  const raw = readFileSync(path.join(process.cwd(), "fixtures", name), "utf8");
  return { raw, analysis: JSON.parse(raw) as RepoAnalysis };
};

/** PLAN.md 76.4's calibration table, for every committed fixture. */
const EXPECTED: Record<string, { tier: string; base: string; lowerBound: boolean }> = {
  "atom__atom.analysis.json": { tier: "city", base: "city", lowerBound: false },
  "facebook__react.analysis.json": { tier: "metropolis", base: "city", lowerBound: false },
  "honojs__hono.analysis.json": { tier: "city", base: "city", lowerBound: false },
  "microsoft__vscode.analysis.json": { tier: "metropolis", base: "metropolis", lowerBound: true },
  "react__react.analysis.json": { tier: "metropolis", base: "city", lowerBound: false },
  "sample.analysis.json": { tier: "city", base: "city", lowerBound: false },
  "sindresorhus__p-limit.analysis.json": { tier: "village", base: "village", lowerBound: false },
  "vercel__turborepo.analysis.json": { tier: "city", base: "city", lowerBound: true },
};

describe("migrate-fixtures (PLAN.md 76.4)", () => {
  it.each(Object.entries(EXPECTED))("%s carries the settlement the rules give", (name, want) => {
    const { analysis } = load(name);
    expect(analysis.settlement).toBeDefined();
    expect(analysis.settlement!.tier).toBe(want.tier);
    expect(analysis.settlement!.baseTier).toBe(want.base);
    expect(analysis.settlement!.lowerBound).toBe(want.lowerBound);

    // The committed value is exactly what the script computes now, so the
    // fixtures are never stale against the classifier.
    const { settlement, ...rest } = analysis;
    expect(fixtureSettlement(rest as RepoAnalysis)).toEqual(settlement);
  });

  it("marks the capped vscode fixture a floor of at least 10,000", () => {
    const { settlement } = load("microsoft__vscode.analysis.json").analysis;
    expect(settlement!.lowerBound).toBe(true);
    expect(settlement!.footprint).toBeGreaterThanOrEqual(10_000);
  });

  it("uses surveyed files and folders the way the calibration table does", () => {
    const { settlement } = load("react__react.analysis.json").analysis;
    expect(settlement!.files).toBe(2922);
    expect(settlement!.dirs).toBe(516);
    expect(settlement!.footprint).toBe(3954);
  });

  it("recognises the layout of every fixture, so it never reformats one", () => {
    for (const name of Object.keys(EXPECTED)) {
      expect(detectLayout(load(name).raw)).not.toBeNull();
    }
  });
});
