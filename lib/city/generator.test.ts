import { describe, expect, it } from "vitest";
import sampleAnalysis from "@/fixtures/sample.analysis.json";
import type { BuildingPlan, RepoAnalysis } from "@/types/analysis";
import type { CityModel } from "@/types/city";
import {
  buildingsOnRoads,
  districtForPath,
  generateCity,
  LIMITS,
  nearestRoadDistance,
  overlappingBuildings,
  REVEAL,
} from "./generator";

const fixture = sampleAnalysis as unknown as RepoAnalysis;

const clone = (): RepoAnalysis => structuredClone(fixture);

const city = generateCity(fixture);

const minAppear = (items: { appearAt: number }[]): number =>
  items.length === 0 ? Infinity : Math.min(...items.map((i) => i.appearAt));
const maxAppear = (items: { appearAt: number }[]): number =>
  items.length === 0 ? -Infinity : Math.max(...items.map((i) => i.appearAt));

describe("generateCity: determinism (PLAN.md section 35)", () => {
  it("produces byte-identical JSON across two runs", () => {
    expect(JSON.stringify(generateCity(fixture))).toBe(JSON.stringify(generateCity(fixture)));
  });

  it("changes prop placement but not district rects when the seed changes", () => {
    const other = clone();
    other.seed = "sample/repo-city@0000000000";
    const rebuilt = generateCity(other);

    expect(rebuilt.districts.map((d) => d.rect)).toEqual(city.districts.map((d) => d.rect));
    expect(rebuilt.bounds).toEqual(city.bounds);
    expect(rebuilt.roads).toEqual(city.roads);

    expect(JSON.stringify(rebuilt.props.trees)).not.toBe(JSON.stringify(city.props.trees));
    expect(JSON.stringify(rebuilt.buildings.map((b) => b.position))).not.toBe(
      JSON.stringify(city.buildings.map((b) => b.position)),
    );
    // Same buildings, same tiers: only the cosmetic jitter moved.
    expect(rebuilt.buildings.map((b) => b.id)).toEqual(city.buildings.map((b) => b.id));
    expect(rebuilt.buildings.map((b) => b.tier)).toEqual(city.buildings.map((b) => b.tier));
  });

  it("reads no clock: the model depends only on the analysis", () => {
    const first = generateCity(clone());
    const second = generateCity(clone());
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });
});

describe("generateCity: geometry", () => {
  it("never intersects two building footprints", () => {
    expect(overlappingBuildings(city)).toEqual([]);
  });

  it("never builds on a road", () => {
    expect(buildingsOnRoads(city)).toEqual([]);
  });

  it("keeps every building inside the bounds, on the ground", () => {
    const half = city.bounds.size / 2;
    for (const building of city.buildings) {
      expect(Math.abs(building.position[0]) + building.size[0] / 2).toBeLessThanOrEqual(half);
      expect(Math.abs(building.position[2]) + building.size[2] / 2).toBeLessThanOrEqual(half);
      expect(building.position[1]).toBe(0);
      expect(building.size[1]).toBeGreaterThan(0);
    }
  });

  it("gives every building a district that exists", () => {
    const ids = new Set(city.districts.map((d) => d.id));
    for (const building of city.buildings) {
      expect(ids.has(building.districtId)).toBe(true);
    }
    const listed = city.districts.flatMap((d) => d.buildingIds).sort();
    expect(listed).toEqual(city.buildings.map((b) => b.id).sort());
  });

  it("places every building of the analysis, none dropped", () => {
    expect(city.buildings).toHaveLength(fixture.buildings.length);
  });

  it("scales heights by tier with at most 15 percent jitter", () => {
    const nominal: Record<number, number> = { 1: 1.5, 2: 2.5, 3: 4, 4: 6.5, 5: 10 };
    for (const building of city.buildings) {
      const base = nominal[building.tier];
      expect(building.size[1]).toBeGreaterThanOrEqual(base * 0.85 - 1e-3);
      expect(building.size[1]).toBeLessThanOrEqual(base * 1.15 + 1e-3);
      // Footprints stay in the documented 1.6 to 4 unit band.
      expect(building.size[0]).toBeLessThanOrEqual(4);
      expect(building.size[2]).toBeLessThanOrEqual(4);
      expect(Math.min(building.size[0], building.size[2])).toBeGreaterThanOrEqual(1.6 - 1e-9);
    }
  });

  it("stands the root landmark files in the civic centre", () => {
    const landmarkPlans = fixture.buildings.filter((b) => b.landmark !== null);
    expect(landmarkPlans.length).toBeGreaterThan(0);
    for (const plan of landmarkPlans.slice(0, 5)) {
      const placed = city.buildings.find((b) => b.id === plan.id);
      expect(placed).toBeDefined();
      const distance = Math.hypot(placed!.position[0], placed!.position[2]);
      expect(distance).toBeLessThan(city.bounds.size * 0.2);
      expect(placed!.visualState).toBe("landmark");
    }
  });
});

describe("generateCity: incidents (PLAN.md section 11)", () => {
  it("sits every incident on a road centreline", () => {
    expect(city.incidents.length).toBeGreaterThan(0);
    for (const incident of city.incidents) {
      const distance = nearestRoadDistance(incident.position[0], incident.position[2], city.roads);
      expect(distance).toBeLessThan(0.01);
    }
  });

  it("keeps incidents at least 3 units apart", () => {
    for (let i = 0; i < city.incidents.length; i++) {
      for (let j = i + 1; j < city.incidents.length; j++) {
        const a = city.incidents[i].position;
        const b = city.incidents[j].position;
        expect(Math.hypot(a[0] - b[0], a[2] - b[2])).toBeGreaterThanOrEqual(3 - 1e-6);
      }
    }
  });

  it("places an incident inside the district its path names", () => {
    const issue = fixture.metrics.issues.ranked.find((i) => i.relatedPath)!;
    const district = districtForPath(issue.relatedPath, fixture.districts)!;
    expect(district).toBeDefined();
    const rect = city.districts.find((d) => d.id === district.id)!.rect;
    const incident = city.incidents.find((i) => i.id === `incident-${issue.number}`)!;
    // Adjacent means on one of the district's own streets or on its seam.
    expect(Math.abs(incident.position[0] - rect.x)).toBeLessThanOrEqual(rect.w / 2 + 1e-6);
    expect(Math.abs(incident.position[2] - rect.z)).toBeLessThanOrEqual(rect.d / 2 + 1e-6);
  });

  it("shows no incidents when the repository has no issues (PLAN.md section 61)", () => {
    const quiet = clone();
    quiet.metrics.issues = { open: 0, ranked: [], staleShare: 0 };
    expect(generateCity(quiet).incidents).toEqual([]);
  });
});

describe("generateCity: landmarks (PLAN.md sections 14 to 20 and 62)", () => {
  it("builds all five landmarks for the sample repository", () => {
    expect(city.landmarks.map((l) => l.landmarkType).sort()).toEqual([
      "civic",
      "fire",
      "info",
      "power",
      "station",
    ]);
  });

  it("omits the power grid when no CI provider was detected", () => {
    const noCi = clone();
    noCi.metrics.ci = { state: "none", provider: "none", failureRate: 0, recentRuns: 0 };
    const rebuilt = generateCity(noCi);
    expect(rebuilt.landmarks.find((l) => l.landmarkType === "power")).toBeUndefined();
    expect(rebuilt.landmarks.find((l) => l.landmarkType === "civic")).toBeDefined();
  });

  it("omits the fire station, information centre and transit station at zero", () => {
    const bare = clone();
    bare.metrics.tests = { strength: 0, signals: [] };
    bare.metrics.docs = { strength: 0, signals: [], readmeLength: 0 };
    bare.metrics.releases = { count: 0, lastDaysAgo: null, cadence: "none" };
    const types = generateCity(bare).landmarks.map((l) => l.landmarkType);
    expect(types).toEqual(["power", "civic"]);
  });

  it("carries the CI state on the power grid", () => {
    const power = city.landmarks.find((l) => l.landmarkType === "power")!;
    expect(power.state).toBe(fixture.metrics.ci.state);
    expect(power.level).toBe(3);
    expect(power.sourceUrl).toContain("/actions");
  });
});

describe("generateCity: limits (PLAN.md section 37)", () => {
  it("respects every budget", () => {
    expect(city.buildings.length).toBeLessThanOrEqual(LIMITS.buildings);
    expect(city.props.trees.length).toBeLessThanOrEqual(LIMITS.trees);
    expect(city.vehicles.count).toBeLessThanOrEqual(LIMITS.vehicles);
    expect(city.incidents.length).toBeLessThanOrEqual(LIMITS.incidents);
    expect(city.constructionSites.length).toBeLessThanOrEqual(LIMITS.construction);
  });

  it("caps buildings at 300 and incidents at 12 even when handed more", () => {
    const huge = clone();
    const template = huge.buildings[huge.buildings.length - 1];
    huge.buildings = Array.from({ length: 420 }, (_, index) => ({
      ...template,
      id: `b-extra-${index}`,
      path: `src/generated/module-${index}.ts`,
      landmark: null,
      score: 10 + (index % 50),
    })) as BuildingPlan[];
    const issue = huge.metrics.issues.ranked[0];
    huge.metrics.issues.ranked = Array.from({ length: 30 }, (_, index) => ({
      ...issue,
      number: 1000 + index,
    }));

    const big = generateCity(huge);
    expect(big.buildings).toHaveLength(LIMITS.buildings);
    expect(big.incidents).toHaveLength(LIMITS.incidents);
    expect(overlappingBuildings(big)).toEqual([]);
    expect(buildingsOnRoads(big)).toEqual([]);
  });
});

describe("generateCity: ambience and traffic (PLAN.md sections 19 and 39)", () => {
  it("counts vehicles from the activity score", () => {
    expect(city.vehicles.count).toBe(Math.round(6 + 34 * fixture.metrics.activity.score));
  });

  it("quiets and cools an archived repository", () => {
    const archived = clone();
    archived.metrics.archived = true;
    const rebuilt = generateCity(archived);

    expect(rebuilt.vehicles.count).toBeLessThanOrEqual(4);
    expect(rebuilt.ambience.trafficDensity).toBeLessThan(city.ambience.trafficDensity);
    expect(rebuilt.ambience.warmth).toBeLessThan(city.ambience.warmth);
    expect(rebuilt.ambience.fog).toBeGreaterThan(city.ambience.fog);
    expect(rebuilt.props.trees.length).toBeLessThan(city.props.trees.length);
    // Never unreadable: saturation keeps a floor (PLAN.md section 39).
    expect(rebuilt.ambience.saturation).toBeGreaterThanOrEqual(0.3);
    expect(rebuilt.repository.archived).toBe(true);
  });

  it("keeps every ambience channel inside 0..1", () => {
    for (const value of Object.values(city.ambience)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });
});

describe("generateCity: reveal schedule (PLAN.md section 43)", () => {
  it("runs stage by stage and finishes under 3.5 seconds", () => {
    expect(minAppear(city.buildings)).toBeGreaterThanOrEqual(REVEAL.buildings[0]);
    expect(maxAppear(city.buildings)).toBeLessThan(minAppear(city.landmarks));
    expect(maxAppear(city.landmarks)).toBeLessThan(minAppear(city.incidents));
    expect(maxAppear(city.incidents)).toBeLessThan(minAppear(city.constructionSites));
    expect(maxAppear(city.constructionSites)).toBeLessThan(3500);
  });

  it("raises each district's buildings together, centre outwards", () => {
    const byDistrict = new Map<string, number[]>();
    for (const building of city.buildings) {
      const list = byDistrict.get(building.districtId) ?? [];
      list.push(building.appearAt);
      byDistrict.set(building.districtId, list);
    }
    // Districts do not interleave: their reveal windows are disjoint.
    const windows = [...byDistrict.values()].map((list) => [
      Math.min(...list),
      Math.max(...list),
    ]);
    windows.sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < windows.length; i++) {
      expect(windows[i][0]).toBeGreaterThanOrEqual(windows[i - 1][1]);
    }
  });
});

describe("generateCity: model shape", () => {
  it("copies the repository header, health and activity through", () => {
    expect(city.repository).toEqual({
      fullName: fixture.repo.fullName,
      url: fixture.repo.url,
      archived: fixture.metrics.archived,
    });
    expect(city.health).toEqual(fixture.metrics.health);
    expect(city.confidence).toEqual(fixture.metrics.confidence);
    expect(city.activity).toEqual(fixture.metrics.activity);
    expect(city.seed).toBe(fixture.seed);
  });

  it("cycles district colours through 0..7", () => {
    city.districts.forEach((district, index) => {
      expect(district.colorIndex).toBe(index % 8);
    });
  });

  it("keeps entity ids unique across every selectable kind", () => {
    const ids: string[] = [
      ...city.buildings,
      ...city.incidents,
      ...city.constructionSites,
      ...city.landmarks,
    ].map((entity) => entity.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every selectable entity inspector copy", () => {
    const entities: { title: string; reason: string; sourceUrl: string | null }[] = [
      ...city.buildings,
      ...city.incidents,
      ...city.constructionSites,
      ...city.landmarks,
    ];
    for (const entity of entities) {
      expect(entity.title.length).toBeGreaterThan(0);
      expect(entity.reason.length).toBeGreaterThan(0);
      expect(entity.sourceUrl).toContain("https://github.com/");
    }
  });

  it("describes construction sites from the ranked pull requests", () => {
    expect(city.constructionSites).toHaveLength(fixture.metrics.pulls.ranked.length);
    city.constructionSites.forEach((site, index) => {
      const pull = fixture.metrics.pulls.ranked[index];
      expect(site.title).toBe(`Pull Request #${pull.number}`);
      expect(site.state).toBe(pull.state);
      expect(site.reason).toBe(pull.reason);
    });
  });

  it("exposes a square world with roads of the two documented widths", () => {
    const model: CityModel = city;
    expect(model.bounds.size).toBeGreaterThan(0);
    const widths = new Set(model.roads.map((r) => r.width));
    expect([...widths].sort()).toEqual([1.6, 2.6]);
    for (const road of model.roads) {
      expect(road.from[1]).toBe(0);
      expect(road.to[1]).toBe(0);
    }
  });
});
