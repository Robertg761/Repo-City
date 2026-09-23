import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { RepoAnalysis } from "@/types/analysis";
import { generateCity } from "@/lib/city/generator";
import { QUEUE_MAX, queueLength } from "@/lib/city/overflow";
import { SETTLEMENT_PARAMS } from "@/lib/city/settlement";

const file = (name: string): string => path.join(process.cwd(), "fixtures", name);
const raw = readFileSync(file("stress.analysis.json"), "utf8");
const stress = JSON.parse(raw) as RepoAnalysis;
const backlog = JSON.parse(readFileSync(file("backlog.analysis.json"), "utf8")) as RepoAnalysis;
const metropolis = SETTLEMENT_PARAMS.metropolis;

describe("fixtures/stress.analysis.json (PLAN.md 76.13)", () => {
  const { issues, pulls } = stress.metrics;

  it("fills every metropolis budget: 450 buildings, 16 + 984 issues, 10 + 490 PRs", () => {
    expect(stress.settlement!.tier).toBe("metropolis");
    expect(stress.buildings).toHaveLength(metropolis.buildings.max);
    expect(issues.ranked).toHaveLength(metropolis.heroes.incidents);
    expect(pulls.ranked).toHaveLength(metropolis.heroes.sites);
    expect(issues.backlog).toHaveLength(984);
    expect(pulls.backlog).toHaveLength(490);
    // The 76.1 ceilings exactly.
    expect(issues.ranked.length + issues.backlog!.length).toBe(1000);
    expect(pulls.ranked.length + pulls.backlog!.length).toBe(500);
  });

  it("keeps S0's crowd and react's repository, under a seed of its own", () => {
    expect(issues.backlog).toEqual(backlog.metrics.issues.backlog);
    expect(pulls.backlog).toEqual(backlog.metrics.pulls.backlog);
    expect(stress.repo).toEqual(backlog.repo);
    expect(stress.seed).not.toBe(backlog.seed);
    expect(stress.source).toBe("fixture");
    expect(stress.warnings.some((w) => w.startsWith("Synthetic stress fixture"))).toBe(true);
  });

  it("gives every building a unique id and path in one of react's districts", () => {
    const districts = new Set(stress.districts.map((d) => d.id));
    expect(new Set(stress.buildings.map((b) => b.id)).size).toBe(stress.buildings.length);
    expect(new Set(stress.buildings.map((b) => b.path)).size).toBe(stress.buildings.length);
    for (const building of stress.buildings) {
      if (building.landmark === null) expect(districts.has(building.districtId)).toBe(true);
    }
  });

  it("tiers the buildings with the metropolis share table", () => {
    const plain = stress.buildings.filter((b) => b.landmark === null);
    for (const tier of [5, 4, 3, 2, 1] as const) {
      const share = plain.filter((b) => b.tier === tier).length / plain.length;
      expect(share).toBeCloseTo(metropolis.tierShares[tier], 1);
    }
  });

  it("orders hero PRs open first, then the merged ones", () => {
    const states = pulls.ranked.map((p) => p.state);
    expect(states.slice(0, 8).every((s) => s !== "completed")).toBe(true);
    expect(states.slice(8)).toEqual(["completed", "completed"]);
  });

  it("never repeats an issue or PR number", () => {
    const numbers = [
      ...issues.ranked.map((i) => i.number),
      ...pulls.ranked.map((p) => p.number),
      ...issues.backlog!.map((i) => i.number),
      ...pulls.backlog!.map((p) => p.number),
    ];
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it("hides enough issues for the longest queue, and stays under the 1 MB payload ceiling", () => {
    const drawn = issues.ranked.length + issues.backlog!.length;
    expect(queueLength(issues.total! - drawn)).toBe(QUEUE_MAX);
    expect(raw.length).toBeLessThan(1_000_000);
  });

  it("builds the heaviest city the generator allows", () => {
    const city = generateCity(stress);
    expect(city.settlement!.tier).toBe("metropolis");
    expect(city.buildings).toHaveLength(metropolis.buildings.max);
    expect(city.incidents).toHaveLength(metropolis.heroes.incidents);
    expect(city.constructionSites).toHaveLength(metropolis.heroes.sites);
    expect(city.backlog!.incidents.length).toBe(984);
    // A spot or two may be lost to placement; the overflow counts it.
    expect(city.backlog!.constructionSites.length).toBeGreaterThanOrEqual(480);
    expect(city.overflow!.queue).toHaveLength(QUEUE_MAX);
    // React's activity is saturated, so cars are limited only by road room.
    // With today's layout that is more than a city's 40; once the metropolis
    // layout (S3) reaches its 285-unit band there is room for all 64.
    expect(city.vehicles.count).toBeGreaterThan(SETTLEMENT_PARAMS.city.vehicles.max);
    if (city.bounds.size >= metropolis.bounds.min) {
      expect(city.vehicles.count).toBe(metropolis.vehicles.max);
    }
  });
});
