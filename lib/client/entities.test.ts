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
    expect(resolved?.provisional).toBe(false);
  });

  it("falls back to the analysis for building ids before the generator lands", () => {
    const resolved = resolveEntity("b-001", null, analysis, NOW);

    expect(resolved?.label).toBe("BUILDING");
    expect(resolved?.title).toBe("README.md");
    expect(resolved?.provisional).toBe(true);
    expect(resolved?.sourceUrl).toBe("https://github.com/sample/repo-city/blob/main/README.md");
    expect(resolved?.facts[0]).toEqual({ label: "Path", value: "README.md" });
  });

  it("resolves districts from the analysis fallback", () => {
    const resolved = resolveEntity("d-src", null, analysis, NOW);

    expect(resolved?.label).toBe("DISTRICT");
    expect(resolved?.title).toBe("Core District");
    expect(resolved?.subtitle).toBe("/src");
  });

  it("returns null for an unknown id", () => {
    expect(resolveEntity("nope-1", city, analysis, NOW)).toBeNull();
  });
});
