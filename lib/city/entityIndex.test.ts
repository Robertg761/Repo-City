import { describe, expect, it } from "vitest";
import sample from "@/fixtures/sample.analysis.json";
import type { RepoAnalysis } from "@/types/analysis";
import type { CityModel, Incident, Overflow } from "@/types/city";
import { entityById, indexEntities } from "./entityIndex";
import { generateCity } from "./generator";

const base = generateCity(sample as unknown as RepoAnalysis);

function withCrowd(city: CityModel): CityModel {
  const hero = city.incidents[0];
  const crowd: Incident = { ...hero, id: "crowd-issue-1", lod: "crowd", form: "pothole" };
  const siteHero = city.constructionSites[0];
  const overflow: Overflow = {
    id: "overflow",
    kind: "overflow",
    position: [0, 0, 0],
    rotationY: 0,
    title: "QUEUE AT THE CITY LIMITS",
    subtitle: "",
    description: "",
    reason: "",
    sourceUrl: null,
    visualState: "queued",
    appearAt: 0,
    issues: { total: 20, drawn: 5, hidden: 15 },
    pulls: { total: 3, drawn: 3, hidden: 0 },
    exact: true,
    size: [6, 5, 1],
    queue: [],
  };
  return {
    ...city,
    backlog: {
      incidents: [crowd],
      constructionSites: [{ ...siteHero, id: "crowd-pull-1", lod: "crowd", form: "van" }],
    },
    overflow,
  };
}

describe("indexEntities", () => {
  it("indexes every building, landmark, hero incident and hero site by id", () => {
    const index = indexEntities(base);
    const all = [
      ...base.buildings,
      ...base.landmarks,
      ...base.incidents,
      ...base.constructionSites,
    ];
    expect(index.size).toBe(new Set(all.map((e) => e.id)).size);
    for (const entity of all) expect(index.get(entity.id)).toBe(entity);
  });

  it("includes the crowd and the overflow when the city has them", () => {
    const city = withCrowd(base);
    const index = indexEntities(city);
    expect(index.get("crowd-issue-1")?.kind).toBe("incident");
    expect(index.get("crowd-pull-1")?.kind).toBe("construction");
    expect(index.get("overflow")?.kind).toBe("overflow");
    expect(index.size).toBe(indexEntities(base).size + 3);
  });

  it("does not index districts", () => {
    const index = indexEntities(base);
    for (const district of base.districts) expect(index.has(district.id)).toBe(false);
  });

  it("is memoised per city object", () => {
    expect(indexEntities(base)).toBe(indexEntities(base));
    const copy = { ...base };
    expect(indexEntities(copy)).not.toBe(indexEntities(base));
    expect(indexEntities(copy).size).toBe(indexEntities(base).size);
  });

  it("lets a hero win over a crowd object with the same id", () => {
    const hero = base.incidents[0];
    const city: CityModel = {
      ...base,
      backlog: { incidents: [{ ...hero, lod: "crowd" }], constructionSites: [] },
    };
    expect(indexEntities(city).get(hero.id)).toBe(hero);
  });
});

describe("entityById", () => {
  it("resolves ids and tolerates nulls and unknown ids", () => {
    const building = base.buildings[0];
    expect(entityById(base, building.id)).toBe(building);
    expect(entityById(base, "nope")).toBeNull();
    expect(entityById(base, null)).toBeNull();
    expect(entityById(null, building.id)).toBeNull();
  });
});
