import { describe, expect, it } from "vitest";
import sample from "@/fixtures/sample.analysis.json";
import type { RepoAnalysis } from "@/types/analysis";
import type { CityModel, Incident } from "@/types/city";
import { daysBetween, resolveEntity } from "./entities";

const analysis = sample as unknown as RepoAnalysis;

/** Same wording the resolver uses, so the expectation is not a second copy. */
const relativeDaysFor = (iso: string): string => {
  const days = daysBetween(iso, NOW);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  return `${days.toLocaleString("en-US")} days ago`;
};

/** 2026-09-21, the day of the fixture, so relative days are stable. */
const NOW = Date.parse("2026-09-21T12:00:00.000Z");

const issue = analysis.metrics.issues.ranked[0];

const incident: Incident = {
  id: "inc-412",
  kind: "incident",
  position: [0, 0, 0],
  rotationY: 0,
  title: "unused",
  subtitle: "unused",
  description: "",
  reason: "Represented as a traffic incident because it is an unresolved bug.",
  sourceUrl: "https://github.com/sample/repo-city/issues/412",
  visualState: "major",
  appearAt: 0,
  state: "major",
  issue,
};

const city = {
  repository: { fullName: "sample/repo-city", url: "", archived: false },
  health: analysis.metrics.health,
  confidence: analysis.metrics.confidence,
  activity: analysis.metrics.activity,
  ambience: {
    warmth: 0,
    saturation: 0,
    fog: 0,
    trafficDensity: 0,
    pedestrianDensity: 0,
    litWindowShare: 0,
  },
  bounds: { size: 100 },
  districts: [],
  buildings: [],
  roads: [],
  landmarks: [],
  incidents: [incident],
  constructionSites: [],
  props: { trees: [], lamps: [] },
  vehicles: { count: 0 },
  seed: analysis.seed,
} satisfies CityModel;

describe("resolveEntity", () => {
  it("returns null without an id", () => {
    expect(resolveEntity(null, city, analysis, NOW)).toBeNull();
  });

  it("renders an incident with the section 12 facts", () => {
    const resolved = resolveEntity("inc-412", city, analysis, NOW);

    expect(resolved?.label).toBe("INCIDENT");
    expect(resolved?.title).toBe(issue.title);
    expect(resolved?.subtitle).toBe("Issue #412");
    expect(resolved?.facts).toEqual([
      { label: "State", value: "Major incident" },
      { label: "Open", value: "64 days" },
      { label: "Last activity", value: relativeDaysFor(issue.updatedAt) },
      { label: "Comments", value: "27 comments" },
      { label: "Reported by", value: "mara-quinn" },
      ...(issue.relatedPath
        ? [
            {
              label: "Near",
              value: issue.relatedPath,
              href: `${analysis.repo.url}/tree/${analysis.repo.headSha}/${issue.relatedPath}`,
            },
          ]
        : []),
    ]);
    expect(resolved?.tags).toEqual(["bug", "priority-high", "router"]);
    expect(resolved?.reason).toMatch(/unresolved bug/);
    expect(resolved?.tooltip).toBe("Issue #412 · Major incident");
  });

  it("separates thousands in every counted fact", () => {
    const old = structuredClone(city) as CityModel;
    old.incidents[0].issue = { ...issue, createdAt: "2018-01-01T00:00:00.000Z" };
    const resolved = resolveEntity("inc-412", old, analysis, NOW);
    const open = resolved?.facts.find((fact) => fact.label === "Open");
    expect(open?.value).toMatch(/^\d,\d{3} days$/);
  });

  it("resolves nothing without a city model", () => {
    // The store builds a `CityModel` for every successful analysis, so the
    // analysis-only fallback that used to live here is gone: ids resolve
    // from the model or not at all.
    expect(resolveEntity("b-001", null, analysis, NOW)).toBeNull();
    expect(resolveEntity("d-src", null, analysis, NOW)).toBeNull();
  });

  it("returns null for an unknown id", () => {
    expect(resolveEntity("nope-1", city, analysis, NOW)).toBeNull();
  });

  it("measures ages against the snapshot, so the facts and the reason agree", () => {
    // No clock passed: the resolver must fall back to `generatedAt` rather
    // than to the wall clock, or the facts drift a day from the sentence the
    // server wrote underneath them.
    const stamped = resolveEntity("inc-412", city, analysis);
    const explicit = resolveEntity("inc-412", city, analysis, Date.parse(analysis.generatedAt));
    expect(stamped?.facts).toEqual(explicit?.facts);
  });

  it("does not repeat the labels that already render as chips", () => {
    const resolved = resolveEntity("inc-412", city, analysis, NOW);
    expect(resolved?.facts.map((fact) => fact.label)).not.toContain("Labels");
    expect(resolved?.tags.length).toBeGreaterThan(0);
  });
});

describe("hover copy (PLAN.md section 42)", () => {
  const withBuilding = (role: string | null): CityModel => {
    const plan = { ...analysis.buildings[0], role };
    return {
      ...city,
      districts: [
        {
          id: plan.districtId,
          name: "The Foundry",
          sourcePath: "/src",
          purpose: null,
          rect: { x: 0, z: 0, w: 10, d: 10 },
          colorIndex: 0,
          buildingIds: ["b-001"],
          description: "",
          reason: "",
          sourceUrl: null,
          appearAt: 0,
        },
      ],
      buildings: [
        {
          id: "b-001",
          kind: "building",
          position: [0, 0, 0],
          rotationY: 0,
          title: "context.tsx",
          subtitle: "The Foundry · File",
          description: "",
          reason: "",
          sourceUrl: null,
          visualState: "normal",
          appearAt: 0,
          districtId: plan.districtId,
          size: [4, 6, 4],
          tier: 3,
          colorIndex: 0,
          plan,
        },
      ],
    } satisfies CityModel;
  };

  it("uses the curated role as a building's second line when there is one", () => {
    const resolved = resolveEntity("b-001", withBuilding("Turns a parsed tree into a city."), analysis);
    expect(resolved?.tooltip).toBe("Turns a parsed tree into a city.");
  });

  it("falls back to the district when no role was curated", () => {
    const resolved = resolveEntity("b-001", withBuilding(null), analysis);
    expect(resolved?.tooltip).toBe("The Foundry");
  });

  it("always has a second line for every kind", () => {
    const resolved = resolveEntity("inc-412", city, analysis, NOW);
    expect(resolved?.tooltip.length).toBeGreaterThan(0);
  });
});
