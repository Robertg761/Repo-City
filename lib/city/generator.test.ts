import { describe, expect, it } from "vitest";
import sampleAnalysis from "@/fixtures/sample.analysis.json";
import type { BuildingPlan, RepoAnalysis } from "@/types/analysis";
import type { CityModel } from "@/types/city";
import { distanceToRoad, ROAD_MAJOR_WIDTH, ROAD_MINOR_WIDTH } from "./layout";
import {
  buildingsOnRoads,
  districtForPath,
  generateCity,
  highwayCount,
  LIMITS,
  MAX_FOOTPRINT,
  MIN_FOOTPRINT,
  nearestRoadDistance,
  obstructedPlots,
  overlappingBuildings,
  prestigeOf,
  REVEAL,
  TIER_HEIGHT,
  vehicleCount,
  visitorShare,
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

  it("never stands a landmark or a construction site on a building or a road", () => {
    expect(obstructedPlots(city)).toEqual([]);
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
    for (const building of city.buildings) {
      // The civic plaza sizes its own buildings: square cells cut to the plaza
      // and a height ceiling that keeps them under the town hall.
      if (building.plan.landmark !== null) continue;
      const base = TIER_HEIGHT[building.tier];
      expect(building.size[1]).toBeGreaterThanOrEqual(base * 0.85 - 1e-3);
      expect(building.size[1]).toBeLessThanOrEqual(base * 1.15 + 1e-3);
      // Footprints stay under the documented maximum. The floor is the slot:
      // a crowded district squeezes its cells, and a footprint that would not
      // fit its cell is what puts two buildings through each other.
      expect(building.size[0]).toBeLessThanOrEqual(MAX_FOOTPRINT);
      expect(building.size[2]).toBeLessThanOrEqual(MAX_FOOTPRINT);
      expect(Math.min(building.size[0], building.size[2])).toBeGreaterThan(1.4 - 1e-9);
    }

    // Most of the city is still built at the documented size: the squeezed
    // cells are the exception, not the rule.
    const widths = city.buildings
      .filter((b) => b.plan.landmark === null)
      .map((b) => Math.min(b.size[0], b.size[2]))
      .sort((a, b) => a - b);
    expect(widths[Math.floor(widths.length / 2)]).toBeGreaterThanOrEqual(MIN_FOOTPRINT - 1e-9);
  });

  it("composes the civic plaza around the town hall", () => {
    const hall = city.landmarks.find((l) => l.landmarkType === "civic");
    expect(hall).toBeDefined();
    const plaza = city.buildings.filter((b) => b.plan.landmark !== null);
    expect(plaza.length).toBeGreaterThan(0);

    const hallHeight = hall!.size![1];
    const radii = new Set<number>();
    for (const building of plaza) {
      // Square footprints, so the quarter turn that faces the hall never
      // changes the footprint the geometry checks reason about.
      expect(building.size[0]).toBeCloseTo(building.size[2], 3);
      // A quarter turn, and it points back at the hall. Rotations are stored
      // to three decimals, so half a milliradian of slop is the exact answer.
      expect(Math.abs(Math.sin(2 * building.rotationY))).toBeLessThan(2e-3);
      // Nothing on the plaza out-tops the hall.
      expect(building.size[1]).toBeLessThan(hallHeight);
      radii.add(
        Math.round(
          Math.hypot(
            building.position[0] - hall!.position[0],
            building.position[2] - hall!.position[2],
          ) * 10,
        ),
      );
    }
    // Symmetric: every plaza building stands the same distance from the hall,
    // or on one of the two rows of a band plaza.
    expect(radii.size).toBeLessThanOrEqual(Math.ceil(plaza.length / 2));
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

  it("keeps incidents at least 9 units apart", () => {
    for (let i = 0; i < city.incidents.length; i++) {
      for (let j = i + 1; j < city.incidents.length; j++) {
        const a = city.incidents[i].position;
        const b = city.incidents[j].position;
        expect(Math.hypot(a[0] - b[0], a[2] - b[2])).toBeGreaterThanOrEqual(9 - 1e-6);
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

  it("keeps the plots clear in a crowded city too", () => {
    const dense = clone();
    const template = dense.buildings[0];
    dense.buildings = Array.from({ length: 300 }, (_, index) => ({
      ...template,
      id: `b-dense-${index}`,
      path: `src/dense/module-${index}.ts`,
      landmark: null,
      score: 5,
    })) as BuildingPlan[];
    const big = generateCity(dense);
    expect(obstructedPlots(big)).toEqual([]);
    expect(overlappingBuildings(big)).toEqual([]);
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
  it("counts vehicles from the activity score, scaled by the road network", () => {
    // Highways are added after the fleet is sized: nobody commutes to the
    // horizon, so they must not inflate the car count.
    const roads = city.roads
      .filter((road) => road.kind !== "highway")
      .reduce(
        (sum, road) => sum + Math.hypot(road.to[0] - road.from[0], road.to[2] - road.from[2]),
        0,
      );
    expect(city.vehicles.count).toBe(vehicleCount(fixture, roads));
    expect(city.vehicles.count).toBeGreaterThan(0);
    expect(city.vehicles.count).toBeLessThanOrEqual(LIMITS.vehicles);
  });

  it("scales the fleet with the road network, not with the building count", () => {
    const quiet = { ...fixture, metrics: { ...fixture.metrics } };
    // Same repository, ten times the streets: ten times busier, up to the cap.
    expect(vehicleCount(quiet, 2800)).toBeGreaterThan(vehicleCount(quiet, 900));
    // A small town never reads as gridlocked.
    expect(vehicleCount(quiet, 900)).toBeLessThan(20);
  });

  it("quiets and cools an archived repository", () => {
    const archived = clone();
    archived.metrics.archived = true;
    const rebuilt = generateCity(archived);

    expect(rebuilt.vehicles.count).toBeLessThanOrEqual(4);
    expect(rebuilt.ambience.trafficDensity).toBeLessThan(city.ambience.trafficDensity);
    expect(rebuilt.ambience.warmth).toBeLessThan(city.ambience.warmth);
    expect(rebuilt.ambience.fog).toBeGreaterThan(city.ambience.fog);
    // Section 19 lists vegetation among the abandoned signals, next to the
    // quiet roads and the dimmer lighting: an archived city is being taken
    // back by the greenery, so it never ends up with less of it.
    expect(rebuilt.props.trees.length).toBeGreaterThanOrEqual(city.props.trees.length);
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

  it("gives every district inspector copy, a reveal time and a centred rect", () => {
    for (const district of city.districts) {
      expect(district.description.length).toBeGreaterThan(0);
      expect(district.reason.length).toBeGreaterThan(0);
      expect(district.sourceUrl).toContain("https://github.com/");
      expect(district.appearAt).toBeGreaterThanOrEqual(REVEAL.districts[0]);
      expect(district.appearAt).toBeLessThanOrEqual(REVEAL.districts[1]);
      // Centre semantics: every building of the district sits inside the rect.
      for (const id of district.buildingIds) {
        const building = city.buildings.find((b) => b.id === id)!;
        if (building.plan.landmark) continue; // civic centre, not the district
        expect(Math.abs(building.position[0] - district.rect.x)).toBeLessThanOrEqual(
          district.rect.w / 2 + 1e-6,
        );
        expect(Math.abs(building.position[2] - district.rect.z)).toBeLessThanOrEqual(
          district.rect.d / 2 + 1e-6,
        );
      }
    }
  });

  it("times every road inside the reveal window", () => {
    for (const road of city.roads) {
      expect(road.appearAt).toBeGreaterThanOrEqual(REVEAL.roads[0]);
      expect(road.appearAt).toBeLessThanOrEqual(REVEAL.roads[1]);
    }
  });

  it("hands each landmark the plot it was given, power carrying the CI state", () => {
    for (const landmark of city.landmarks) {
      expect(landmark.size).toBeDefined();
      expect(landmark.size![0]).toBeGreaterThan(3);
      expect(landmark.size![2]).toBeGreaterThan(3);
    }
    const power = city.landmarks.find((l) => l.landmarkType === "power")!;
    expect(power.state).toBe(fixture.metrics.ci.state);
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
    const widths = new Set(
      model.roads.filter((r) => r.kind !== "highway").map((r) => r.width),
    );
    expect([...widths].sort((a, b) => a - b)).toEqual([ROAD_MINOR_WIDTH, ROAD_MAJOR_WIDTH]);
    for (const road of model.roads) {
      expect(road.from[1]).toBe(0);
      expect(road.to[1]).toBe(0);
    }
  });
});

describe("forks as highways (PLAN.md section 22)", () => {
  it("earns one highway per power of ten forks, capped at four", () => {
    expect(highwayCount(0)).toBe(0);
    expect(highwayCount(9)).toBe(0);
    expect(highwayCount(10)).toBe(1);
    expect(highwayCount(999)).toBe(2);
    expect(highwayCount(1_000)).toBe(3);
    expect(highwayCount(46_000)).toBe(4);
    expect(highwayCount(3_000_000)).toBe(4);
    expect(highwayCount(Number.NaN)).toBe(0);
  });

  it("emits highways into roads[] as major segments that leave the world square", () => {
    const forked = clone();
    forked.repo = { ...forked.repo, forks: 12_000 };
    const model = generateCity(forked);
    const highways = model.roads.filter((road) => road.kind === "highway");

    expect(highways).toHaveLength(4);
    const half = model.bounds.size / 2;
    for (const road of highways) {
      expect(road.major).toBe(true);
      expect(road.from[1]).toBe(0);
      expect(road.to[1]).toBe(0);
      // Starts inside the world square, ends well outside it.
      expect(Math.max(Math.abs(road.from[0]), Math.abs(road.from[2]))).toBeLessThan(half);
      expect(Math.max(Math.abs(road.to[0]), Math.abs(road.to[2]))).toBeGreaterThan(half);
    }
    // Ids stay unique against the layout's own road ids.
    expect(new Set(model.roads.map((r) => r.id)).size).toBe(model.roads.length);
  });

  it("gives an unforked repository no highways at all", () => {
    const lonely = clone();
    lonely.repo = { ...lonely.repo, forks: 0 };
    const model = generateCity(lonely);
    expect(model.roads.some((road) => road.kind === "highway")).toBe(false);
  });

  it("starts every highway on an existing junction so traffic can turn onto it", () => {
    const forked = clone();
    forked.repo = { ...forked.repo, forks: 20_000 };
    const model = generateCity(forked);
    const streets = model.roads.filter((road) => road.kind !== "highway");
    const near = (a: readonly number[], b: readonly number[]): boolean =>
      Math.hypot(a[0] - b[0], a[2] - b[2]) < 2;

    for (const highway of model.roads.filter((road) => road.kind === "highway")) {
      const joined = streets.some(
        (street) => near(street.from, highway.from) || near(street.to, highway.from),
      );
      expect(joined).toBe(true);
    }
  });

  it("keeps trees out of the carriageway", () => {
    const forked = clone();
    forked.repo = { ...forked.repo, forks: 90_000 };
    const model = generateCity(forked);
    for (const highway of model.roads.filter((road) => road.kind === "highway")) {
      for (const [x, , z] of model.props.trees) {
        expect(distanceToRoad(x, z, highway)).toBeGreaterThan(highway.width / 2);
      }
    }
  });

  it("keeps the layout invariants once highways exist", () => {
    const forked = clone();
    forked.repo = { ...forked.repo, forks: 50_000 };
    const model = generateCity(forked);
    expect(overlappingBuildings(model)).toEqual([]);
    expect(buildingsOnRoads(model)).toEqual([]);
    expect(obstructedPlots(model)).toEqual([]);
  });
});

describe("stars as attention (PLAN.md section 21)", () => {
  it("scales prestige logarithmically and saturates at 100,000 stars", () => {
    expect(prestigeOf(0)).toBe(0);
    expect(prestigeOf(100_000)).toBe(1);
    expect(prestigeOf(1_000_000)).toBe(1);
    expect(prestigeOf(1_000)).toBeCloseTo(0.6, 1);
    expect(prestigeOf(-5)).toBe(0);
  });

  it("turns stars into a share of visitor traffic between a tenth and seven tenths", () => {
    expect(visitorShare(0)).toBeCloseTo(0.1, 2);
    expect(visitorShare(100_000)).toBeCloseTo(0.7, 2);
    expect(visitorShare(5_000)).toBeGreaterThan(visitorShare(50));
  });

  it("never lets stars move health", () => {
    const famous = clone();
    famous.repo = { ...famous.repo, stars: 250_000, forks: 80_000 };
    const model = generateCity(famous);
    expect(model.health).toEqual(city.health);
    expect(model.ambience.prestige).toBe(1);
    expect(model.vehicles.visitorShare).toBeCloseTo(0.7, 2);
  });

  it("keeps the prestige an archived repository already earned", () => {
    const archived = clone();
    archived.metrics = { ...archived.metrics, archived: true };
    const model = generateCity(archived);
    expect(model.ambience.prestige).toBe(prestigeOf(fixture.repo.stars));
  });
});

describe("releases as arriving trains (PLAN.md section 20)", () => {
  it("gives the station an arrival rate, a tag and an age", () => {
    const shipping = clone();
    shipping.metrics = {
      ...shipping.metrics,
      releases: {
        count: 42,
        lastDaysAgo: 4,
        cadence: "active",
        lastTag: "v9.1.0",
        lastPublishedAt: "2026-09-18T00:00:00.000Z",
        lastUrl: "https://github.com/sample/repo-city/releases/tag/v9.1.0",
      },
    };
    const station = generateCity(shipping).landmarks.find((l) => l.landmarkType === "station")!;

    expect(station.detail?.trainsPerMinute).toBeGreaterThan(0);
    expect(station.detail?.releaseTag).toBe("v9.1.0");
    expect(station.detail?.releaseDaysAgo).toBe(4);
    expect(station.description).toContain("v9.1.0");
    expect(station.sourceUrl).toContain("/releases/tag/v9.1.0");
  });

  it("builds no station at all when the project does not publish releases", () => {
    const quiet = clone();
    quiet.metrics = {
      ...quiet.metrics,
      releases: { count: 0, lastDaysAgo: null, cadence: "none" },
    };
    const model = generateCity(quiet);
    expect(model.landmarks.some((l) => l.landmarkType === "station")).toBe(false);
  });
});
