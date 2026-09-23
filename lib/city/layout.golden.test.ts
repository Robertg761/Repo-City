/**
 * The city tier is byte-identical to the city before settlements (PLAN.md
 * 76.5, and the orchestrator's ruling after S0).
 *
 * The hashes below were taken from `main` at 63e8779, before the settlement
 * layouts existed. For every committed fixture the city-tier layout, and the
 * city-tier model the generator builds from it, must hash the same. Only the
 * fields that existed then are hashed: the additive settlement fields
 * (`plaza`, `fields`, `tier` and so on) are new by definition.
 */

import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { BuildingPlan, DistrictPlan, RepoAnalysis } from "@/types/analysis";
import type { CityModel } from "@/types/city";
import { generateCity } from "./generator";
import { CIVIC_BUILDING_SLOTS, planLayout, type CityLayout } from "./layout";

const DIR = path.join(process.cwd(), "fixtures");

const load = (name: string): RepoAnalysis =>
  JSON.parse(readFileSync(path.join(DIR, name), "utf8")) as RepoAnalysis;

const sha = (value: unknown): string =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);

/** The generator's own inputs to `planLayout`, reproduced step for step. */
export function layoutInputs(analysis: RepoAnalysis): {
  districts: { id: string; buildingCount: number }[];
  total: number;
  landmarkFiles: number;
} {
  const root: DistrictPlan = {
    id: "d-outskirts",
    sourcePath: "/",
    name: "Outskirts",
    purpose: null,
    fileCount: 0,
    weight: 1,
  };
  const plans = analysis.districts.length > 0 ? analysis.districts : [root];
  const ids = new Set(plans.map((d) => d.id));
  const fallback = plans[0].id;
  const all: BuildingPlan[] = [...analysis.buildings]
    .sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1))
    .slice(0, 300);
  const counts = new Map<string, number>(plans.map((d) => [d.id, 0]));
  for (const plan of all) {
    const id = ids.has(plan.districtId) ? plan.districtId : fallback;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return {
    districts: plans.map((d) => ({ id: d.id, buildingCount: counts.get(d.id) ?? 0 })),
    total: all.length,
    landmarkFiles: all.filter((b) => b.landmark !== null).slice(0, CIVIC_BUILDING_SLOTS).length,
  };
}

/** The layout as it was before settlements: no additive keys. */
const legacyLayout = (layout: CityLayout): unknown => ({
  size: layout.size,
  districtSide: layout.districtSide,
  bandDepth: layout.bandDepth,
  ringRadius: layout.ringRadius,
  districts: layout.districts,
  civic: layout.civic,
  landmarkPlots: layout.landmarkPlots,
  roads: layout.roads,
});

/** The model as it was before settlements. */
const legacyModel = (city: CityModel): unknown => {
  const {
    settlement: _settlement,
    backlog: _backlog,
    overflow: _overflow,
    plaza: _plaza,
    ...rest
  } = city;
  void _settlement;
  void _backlog;
  void _overflow;
  void _plaza;
  return { ...rest, props: { trees: city.props.trees, lamps: city.props.lamps } };
};

const GOLDEN: Record<string, { layout: string; model: string }> = {
  "atom__atom.analysis.json": { layout: "bf43d8eaffa545ce", model: "395f897808110726" },
  "backlog.analysis.json": { layout: "69894b5fbfeabc0c", model: "dd2c46ee622870c5" },
  "facebook__react.analysis.json": { layout: "69894b5fbfeabc0c", model: "dd2c46ee622870c5" },
  "honojs__hono.analysis.json": { layout: "5f1bc463a7fd686a", model: "aebde119a1a6ccf8" },
  "microsoft__vscode.analysis.json": { layout: "cc587154bdd7f692", model: "c5e5c141c095106f" },
  "react__react.analysis.json": { layout: "69894b5fbfeabc0c", model: "dd2c46ee622870c5" },
  "sample.analysis.json": { layout: "2d9a1983ea58b1ee", model: "3045f4a3be7539b1" },
  "sindresorhus__p-limit.analysis.json": { layout: "6c72e7efdcd78400", model: "63bda767c66a4699" },
  "vercel__turborepo.analysis.json": { layout: "b8733f651e58671b", model: "e45d48574afec451" },
};

const files = readdirSync(DIR)
  .filter((name) => name.endsWith(".analysis.json"))
  .sort();

describe("the city tier is byte-identical to the city before settlements", () => {
  it.each(files)("%s", (name) => {
    const analysis = load(name);
    const inputs = layoutInputs(analysis);
    const layout = planLayout(inputs.districts, inputs.total, {
      landmarkFiles: inputs.landmarkFiles,
      tier: "city",
    });
    const model = generateCity(analysis, { tier: "city" });
    const got = { layout: sha(legacyLayout(layout)), model: sha(legacyModel(model)) };
    // A fixture added later has no hash yet; the other tests still cover it.
    if (GOLDEN[name]) expect(got).toEqual(GOLDEN[name]);
  });
});
