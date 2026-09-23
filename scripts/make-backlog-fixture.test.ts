import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { RepoAnalysis } from "@/types/analysis";
import { generateCity } from "@/lib/city/generator";
import {
  SYNTHETIC_WARNING,
  backlogBase,
  buildBacklogFixture,
  serializeFixture,
} from "./make-backlog-fixture";

const load = (name: string): RepoAnalysis =>
  JSON.parse(readFileSync(path.join(process.cwd(), "fixtures", name), "utf8")) as RepoAnalysis;

const raw = readFileSync(path.join(process.cwd(), "fixtures", "backlog.analysis.json"), "utf8");
const backlog = load("backlog.analysis.json");

/**
 * The react capture the synthetic backlog was built on. `react__react` was
 * recaptured with a real backlog in integration step I, but this fixture (and
 * the stress fixture built from it) stays frozen on the earlier capture, so
 * the base is the fixture itself with the synthetic crowd taken off.
 */
const react: RepoAnalysis = backlogBase(backlog);

describe("the frozen base (make-backlog-fixture.ts)", () => {
  it("rebuilds the committed file byte for byte from its own base", () => {
    expect(serializeFixture(buildBacklogFixture(react))).toBe(raw);
  });

  it("takes off exactly the synthetic crowd, totals and warning", () => {
    expect(react.metrics.issues).not.toHaveProperty("backlog");
    expect(react.metrics.issues).not.toHaveProperty("total");
    expect(react.metrics.pulls).not.toHaveProperty("backlog");
    expect(react.metrics.pulls).not.toHaveProperty("total");
    expect(react.warnings).not.toContain(SYNTHETIC_WARNING);
    expect(backlog.warnings).toEqual([...react.warnings, SYNTHETIC_WARNING]);
  });

  it("does not depend on the live react capture", () => {
    // The recapture has a real crowd and a different head; the frozen base
    // is the pre-settlement capture.
    const live = load("react__react.analysis.json");
    expect(live.generatedAt).not.toBe(react.generatedAt);
    expect(buildBacklogFixture(react)).toEqual(backlog);
  });
});

describe("fixtures/backlog.analysis.json (PLAN.md 76.11)", () => {
  const issues = backlog.metrics.issues.backlog!;
  const pulls = backlog.metrics.pulls.backlog!;

  it("is the react fixture plus 984 backlog issues and 490 backlog PRs, as a metropolis", () => {
    expect(issues).toHaveLength(984);
    expect(pulls).toHaveLength(490);
    expect(backlog.settlement!.tier).toBe("metropolis");
    expect(backlog.repo.fullName).toBe("react/react");
    // The pre-settlement react capture: 115 buildings, 12 hero issues, 8 hero PRs.
    expect(backlog.buildings).toHaveLength(115);
    expect(backlog.metrics.issues.ranked).toHaveLength(12);
    expect(backlog.metrics.pulls.ranked).toHaveLength(8);
  });

  it("assigns every form round-robin, and never the hero-only ones", () => {
    const issueForms = new Map<string, number>();
    for (const issue of issues) issueForms.set(issue.form, (issueForms.get(issue.form) ?? 0) + 1);
    expect(issueForms.size).toBe(7);
    for (const n of issueForms.values()) expect(Math.abs(n - 984 / 7)).toBeLessThanOrEqual(1);

    const pullForms = new Set(pulls.map((p) => p.form));
    expect([...pullForms].sort()).toEqual(["hoarding", "scaffold", "trench", "van"]);
    for (const pull of pulls) expect(pull.state).not.toBe("completed");
  });

  it("respects the compact backlog limits and never repeats a number", () => {
    const heroes = [
      ...react.metrics.issues.ranked.map((i) => i.number),
      ...react.metrics.pulls.ranked.map((p) => p.number),
    ];
    const numbers = [...issues.map((i) => i.number), ...pulls.map((p) => p.number)];
    expect(new Set(numbers).size).toBe(numbers.length);
    for (const hero of heroes) expect(numbers).not.toContain(hero);

    for (const item of [...issues, ...pulls]) {
      expect(item.title.length).toBeLessThanOrEqual(140);
      expect(item.labels.length).toBeLessThanOrEqual(4);
      for (const label of item.labels) expect(label.length).toBeLessThanOrEqual(32);
      expect(item.heat).toBeGreaterThanOrEqual(0);
      expect(item.heat).toBeLessThanOrEqual(1);
    }
    for (const pull of pulls) expect(pull.files.length).toBeLessThanOrEqual(5);
  });

  it("reports totals above what it draws, so the overflow has something to queue", () => {
    const heroIssues = backlog.metrics.issues.ranked.length;
    expect(backlog.metrics.issues.total!).toBeGreaterThan(issues.length + heroIssues);
    expect(backlog.metrics.pulls.total!).toBeGreaterThan(pulls.length);
  });

  it("builds the same city as react apart from the crowd and the queue", () => {
    const strip = (model: ReturnType<typeof generateCity>) => {
      const { settlement: _settlement, backlog: _backlog, overflow: _overflow, ...rest } = model;
      void _settlement;
      void _backlog;
      void _overflow;
      return rest;
    };
    expect(JSON.stringify(strip(generateCity(backlog)))).toBe(
      JSON.stringify(strip(generateCity(react))),
    );
  });
});
