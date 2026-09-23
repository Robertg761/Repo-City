import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { RepoAnalysis } from "@/types/analysis";
import { WRECK_SHARE_MAX } from "@/lib/analysis/forms";
import { detectLayout, fixtureForms, fixtureSettlement } from "./migrate-fixtures";

const load = (name: string): { raw: string; analysis: RepoAnalysis } => {
  const raw = readFileSync(path.join(process.cwd(), "fixtures", name), "utf8");
  return { raw, analysis: JSON.parse(raw) as RepoAnalysis };
};

/**
 * PLAN.md 76.4's calibration table, for every committed fixture. The captured
 * ones were recaptured through the settlement-era route (integration step I),
 * so their counts are GitHub's uncapped totals and none is a lower bound any
 * more: vscode and turborepo were floors only while the counts came from the
 * capped tree.
 */
const EXPECTED: Record<string, { tier: string; base: string; lowerBound: boolean }> = {
  "atom__atom.analysis.json": { tier: "city", base: "city", lowerBound: false },
  "facebook__react.analysis.json": { tier: "metropolis", base: "city", lowerBound: false },
  "honojs__hono.analysis.json": { tier: "city", base: "city", lowerBound: false },
  "microsoft__vscode.analysis.json": { tier: "metropolis", base: "metropolis", lowerBound: false },
  "react__react.analysis.json": { tier: "metropolis", base: "city", lowerBound: false },
  "sample.analysis.json": { tier: "city", base: "city", lowerBound: false },
  "sindresorhus__p-limit.analysis.json": { tier: "village", base: "village", lowerBound: false },
  "vercel__turborepo.analysis.json": { tier: "city", base: "city", lowerBound: false },
};

describe("migrate-fixtures (PLAN.md 76.4)", () => {
  it.each(Object.entries(EXPECTED))("%s carries the settlement the rules give", (name, want) => {
    const { analysis } = load(name);
    expect(analysis.settlement).toBeDefined();
    expect(analysis.settlement!.tier).toBe(want.tier);
    expect(analysis.settlement!.baseTier).toBe(want.base);
    expect(analysis.settlement!.lowerBound).toBe(want.lowerBound);

    // The committed value is exactly what the script computes now, so the
    // fixtures are never stale against the classifier. A captured fixture
    // keeps its uncapped counts only on the settlement, so the script reads
    // them back from there and re-runs the rules on them; a legacy one (the
    // hand-written sample) is rebuilt from its metrics and warnings alone.
    const input = analysis.coverage ? analysis : { ...analysis, settlement: undefined };
    expect(fixtureSettlement(input)).toEqual(analysis.settlement);
  });

  it("classifies vscode on its uncapped counts, well past 10,000", () => {
    const { settlement } = load("microsoft__vscode.analysis.json").analysis;
    expect(settlement!.lowerBound).toBe(false);
    expect(settlement!.files).toBeGreaterThan(15_000);
    expect(settlement!.footprint).toBeGreaterThanOrEqual(10_000);
  });

  it("still floors a legacy capped fixture from its warnings", () => {
    // What the vscode fixture looked like before the recapture: no coverage,
    // no settlement, only the capped counts and the tree-cap warnings.
    const { analysis } = load("microsoft__vscode.analysis.json");
    const legacy: RepoAnalysis = { ...analysis, settlement: undefined, coverage: undefined };
    const floored = fixtureSettlement(legacy);
    expect(floored.lowerBound).toBe(true);
    expect(floored.tier).toBe("metropolis");
    expect(floored.footprint).toBeGreaterThanOrEqual(10_000);
  });

  it("uses the uncapped files and folders the calibration table lists", () => {
    const { settlement } = load("react__react.analysis.json").analysis;
    expect(settlement!.files).toBe(7064);
    expect(settlement!.dirs).toBe(641);
    expect(settlement!.footprint).toBe(8346);
  });

  it("recognises the layout of every fixture, so it never reformats one", () => {
    for (const name of Object.keys(EXPECTED)) {
      expect(detectLayout(load(name).raw)).not.toBeNull();
    }
  });

  it.each(Object.keys(EXPECTED))("%s carries the forms the current rules give", (name) => {
    const { analysis } = load(name);
    expect(fixtureForms(analysis)).toEqual(analysis);
  });

  it("catches a stale form and puts the rule's form back", () => {
    const { analysis } = load("atom__atom.analysis.json");
    const stale = structuredClone(analysis);
    const backlog = stale.metrics.issues.backlog!;
    const target = backlog.findIndex((item) => item.form === "survey");
    backlog[target] = { ...backlog[target], form: "wreck" };
    stale.metrics.issues.ranked[0] = { ...stale.metrics.issues.ranked[0], form: "signpost" };
    expect(fixtureForms(stale)).not.toEqual(stale);
    expect(fixtureForms(stale)).toEqual(analysis);
  });

  it("holds every captured crowd to a quarter of wrecks", () => {
    for (const name of Object.keys(EXPECTED)) {
      const backlog = load(name).analysis.metrics.issues.backlog ?? [];
      const wrecks = backlog.filter((item) => item.form === "wreck").length;
      expect(wrecks).toBeLessThanOrEqual(Math.ceil(backlog.length * WRECK_SHARE_MAX));
    }
    // atom is archived and every crowd issue is years idle: it is the case
    // the cap exists for, and it still reads as neglected.
    const atom = load("atom__atom.analysis.json").analysis.metrics.issues.backlog!;
    expect(atom.filter((item) => item.form === "wreck").length).toBe(
      Math.ceil(atom.length * WRECK_SHARE_MAX),
    );
  });

  it("leaves forms alone on an analysis that predates them", () => {
    const { analysis } = load("sample.analysis.json");
    expect(analysis.metrics.issues.ranked.every((issue) => issue.form === undefined)).toBe(true);
    expect(fixtureForms(analysis)).toEqual(analysis);
  });
});
