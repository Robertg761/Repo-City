import { describe, expect, it } from "vitest";
import sample from "@/fixtures/sample.analysis.json";
import type { RepoAnalysis } from "@/types/analysis";
import type { CityModel, Incident } from "@/types/city";
import { resolveEntity } from "./entities";

const analysis = sample as unknown as RepoAnalysis;

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
      { label: "Comments", value: "27 comments" },
      { label: "Reported by", value: "mara-quinn" },
    ]);
    expect(resolved?.tags).toEqual(["bug", "priority-high", "router"]);
    expect(resolved?.reason).toMatch(/unresolved bug/);
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
});
