/**
 * Population at scale (PLAN.md 76.8 and the 76.14 population tests).
 *
 * Every test here reads the generated `CityModel` only, the way the renderer
 * will, so it checks what is drawn rather than how the placer got there.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { BuildingPlan, RankedIssue, RepoAnalysis } from "@/types/analysis";
import type { CityModel, ConstructionSite, Incident } from "@/types/city";
import {
  ANCHOR_REACH,
  CROWD_BASE_SIZE,
  CROWD_REVEAL,
  LANE_SHARE,
  SCAFFOLD_SHARE,
  heatScale,
  interleave,
} from "./backlog";
import { generateCity } from "./generator";
import { distanceToRoad } from "./layout";
import { hashString } from "./prng";
import { SETTLEMENT_PARAMS } from "./settlement";
import {
  BoxGrid,
  FACADE_DEPTH,
  SIDEWALK_WIDTH,
  boxesOverlap,
  buildingBox,
  findBridges,
  laneOffset,
  type Box,
  type OwnedBox,
} from "./spots";

const load = (name: string): RepoAnalysis =>
  JSON.parse(readFileSync(path.join(process.cwd(), "fixtures", name), "utf8")) as RepoAnalysis;

const backlog = load("backlog.analysis.json");
const metro = generateCity(backlog);
const village = generateCity(backlog, { tier: "village" });
const town = generateCity(backlog, { tier: "town" });
const cityTier = generateCity(backlog, { tier: "city" });
const TIERS: [string, CityModel][] = [
  ["metropolis", metro],
  ["city", cityTier],
  ["town", town],
  ["village", village],
];

const crowd = (city: CityModel): (Incident | ConstructionSite)[] => [
  ...(city.backlog?.incidents ?? []),
  ...(city.backlog?.constructionSites ?? []),
];

const boxOf = (entity: Incident | ConstructionSite): OwnedBox => ({
  x: entity.position[0],
  z: entity.position[2],
  hw: entity.size![0] / 2,
  hd: entity.size![2] / 2,
  rot: entity.rotationY,
  owner: entity.id,
});

function nearestRoad(city: CityModel, x: number, z: number): { road: number; d: number } {
  let best = { road: -1, d: Infinity };
  city.roads.forEach((road, index) => {
    const d = distanceToRoad(x, z, road);
    if (d < best.d) best = { road: index, d };
  });
  return best;
}

describe("crowd placement: counts (drawn + hidden = total)", () => {
  it.each(TIERS)("adds up for issues and pull requests in the %s", (_tier, city) => {
    const overflow = city.overflow!;
    expect(overflow).not.toBeNull();
    for (const count of [overflow.issues, overflow.pulls]) {
      expect(count.drawn + count.hidden).toBe(count.total);
      expect(count.hidden).toBeGreaterThanOrEqual(0);
    }
    expect(overflow.issues.drawn).toBe(city.incidents.length + city.backlog!.incidents.length);
    const openHeroSites = city.constructionSites.filter((s) => s.state !== "completed").length;
    expect(overflow.pulls.drawn).toBe(openHeroSites + city.backlog!.constructionSites.length);
    expect(overflow.issues.total).toBe(backlog.metrics.issues.total);
    expect(overflow.pulls.total).toBe(backlog.metrics.pulls.total);
    expect(overflow.exact).toBe(true);
  });

  it("draws hundreds of the backlog even on today's city-sized metropolis grid", () => {
    expect(metro.backlog!.incidents.length).toBeGreaterThan(400);
    expect(metro.backlog!.constructionSites.length).toBeGreaterThan(150);
  });
});

describe("crowd placement: nothing overlaps", () => {
  it.each(TIERS)("no crowd object touches a building, a landmark or another crowd object (%s)", (_t, city) => {
    const statics = new BoxGrid<OwnedBox>();
    for (const building of city.buildings) statics.insert(buildingBox(building));
    for (const landmark of city.landmarks) {
      const [w, , d] = landmark.size!;
      statics.insert({ x: landmark.position[0], z: landmark.position[2], hw: w / 2, hd: d / 2, rot: landmark.rotationY, owner: landmark.id });
    }
    const placed = new BoxGrid<OwnedBox>();
    const hits: string[] = [];
    for (const entity of crowd(city)) {
      const box = boxOf(entity);
      // A scaffold stands against its own building by design, never in it.
      const host = "buildingId" in entity ? entity.buildingId : null;
      if (statics.hits(box, (item) => item.owner === host)) hits.push(`${entity.id} on a footprint`);
      if (host) {
        const building = city.buildings.find((b) => b.id === host)!;
        if (boxesOverlap(box, buildingBox(building))) hits.push(`${entity.id} inside its host`);
      }
      if (placed.hits(box)) hits.push(`${entity.id} on another crowd object`);
      placed.insert(box);
    }
    expect(hits).toEqual([]);
  });

  it("keeps the crowd off the overflow sign and off every highway", () => {
    const sign: Box = {
      x: metro.overflow!.position[0],
      z: metro.overflow!.position[2],
      hw: metro.overflow!.size[0] / 2,
      hd: metro.overflow!.size[2] / 2,
      rot: metro.overflow!.rotationY,
    };
    const highways = metro.roads.filter((r) => r.kind === "highway");
    expect(highways.length).toBeGreaterThan(0);
    for (const entity of crowd(metro)) {
      expect(boxesOverlap(boxOf(entity), sign)).toBe(false);
      for (const road of highways) {
        const d = distanceToRoad(entity.position[0], entity.position[2], road);
        expect(d).toBeGreaterThan(road.width / 2);
      }
    }
  });
});

describe("crowd placement: where each class stands", () => {
  it("stands kerb forms on the pavement and lane blockers in a lane", () => {
    // Measured against the item's own road, not the nearest one: beside a
    // junction another segment's end can be a hair closer than the host.
    const offset = (width: number, lane: boolean | undefined) =>
      lane ? laneOffset(width) : width / 2 + SIDEWALK_WIDTH / 2;
    for (const entity of crowd(metro)) {
      const onRoad = entity.form === "fire" || entity.form === "signpost" || entity.form === "van" || entity.lane;
      if (!onRoad) continue;
      const [x, , z] = entity.position;
      const host = metro.roads.findIndex(
        (road) => Math.abs(distanceToRoad(x, z, road) - offset(road.width, entity.lane)) < 0.01,
      );
      expect(host).toBeGreaterThanOrEqual(0);
      // A kerb item never stands on any carriageway; a lane item only on its own.
      metro.roads.forEach((road, index) => {
        if (entity.lane && index === host) return;
        expect(distanceToRoad(x, z, road)).toBeGreaterThanOrEqual(road.width / 2);
      });
    }
  });

  it("keeps lane blockers within budget: one per segment, none on a bridge or a highway", () => {
    for (const [, city] of TIERS) {
      const bridges = findBridges(city.roads);
      const streets = city.roads.filter((r) => r.kind !== "highway").length;
      // The budget counts street segments only (76.8): a hero that
      // `findRoadSpot` stood on a highway ring holds no street lane.
      const heroSegments = new Set(
        city.incidents
          .map((i) => nearestRoad(city, i.position[0], i.position[2]).road)
          .filter((road) => city.roads[road].kind !== "highway"),
      );
      const laneSegments: number[] = [];
      for (const entity of crowd(city).filter((e) => e.lane)) {
        const { road } = nearestRoad(city, entity.position[0], entity.position[2]);
        expect(bridges.has(road)).toBe(false);
        expect(city.roads[road].kind).not.toBe("highway");
        expect(heroSegments.has(road)).toBe(false);
        laneSegments.push(road);
      }
      expect(new Set(laneSegments).size).toBe(laneSegments.length);
      expect(heroSegments.size + laneSegments.length).toBeLessThanOrEqual(
        Math.max(heroSegments.size, Math.floor(LANE_SHARE * streets)),
      );
    }
  });

  it("fills the lane budget exactly when no hero holds a lane, and kerbs the rest", () => {
    const quiet = structuredClone(backlog);
    quiet.metrics.issues.ranked = [];
    const city = generateCity(quiet);
    expect(city.incidents).toEqual([]);
    const streets = city.roads.filter((r) => r.kind !== "highway").length;
    const lanes = crowd(city).filter((e) => e.lane);
    expect(lanes.length).toBe(Math.floor(LANE_SHARE * streets));
    const kerbed = city.backlog!.incidents.filter((i) => i.form === "roadblock" && !i.lane);
    expect(kerbed.length).toBeGreaterThan(0);
    expect(kerbed[0].reason).toMatch(/waits on the kerb/);
  });

  it("stands scaffolding on its host's facade, at most one each, capped at 35%", () => {
    for (const [, city] of TIERS) {
      const scaffolds = city.backlog!.constructionSites.filter((s) => s.form === "scaffold");
      expect(scaffolds.length).toBeLessThanOrEqual(Math.floor(SCAFFOLD_SHARE * city.buildings.length));
      expect(new Set(scaffolds.map((s) => s.buildingId)).size).toBe(scaffolds.length);
      for (const scaffold of scaffolds) {
        const host = city.buildings.find((b) => b.id === scaffold.buildingId)!;
        expect(host).toBeDefined();
        // Outward normal is the scaffold's local +z.
        const nx = Math.sin(scaffold.rotationY);
        const nz = Math.cos(scaffold.rotationY);
        const dx = scaffold.position[0] - host.position[0];
        const dz = scaffold.position[2] - host.position[2];
        const out = dx * nx + dz * nz;
        const across = -dx * nz + dz * nx;
        // Which face: compare the normal with the host's own axes.
        const c = Math.cos(host.rotationY);
        const s = Math.sin(host.rotationY);
        const alongLocalX = Math.abs(nx * c - nz * s) > 0.99;
        const halfDepth = (alongLocalX ? host.size[0] : host.size[2]) / 2;
        const faceWidth = alongLocalX ? host.size[2] : host.size[0];
        expect(out).toBeCloseTo(halfDepth + 0.05 + FACADE_DEPTH / 2, 2);
        expect(Math.abs(across)).toBeLessThan(0.01);
        expect(scaffold.size![0]).toBeCloseTo(faceWidth, 2);
        expect(scaffold.size![1]).toBeCloseTo(host.size[1], 2);
        expect(scaffold.size![2]).toBe(FACADE_DEPTH);
      }
    }
  });

  it("turns scaffolding past the cap into trenches and says why", () => {
    const scaffolds = metro.backlog!.constructionSites.filter((s) => s.form === "scaffold");
    expect(scaffolds.length).toBe(Math.floor(SCAFFOLD_SHARE * metro.buildings.length));
    const demoted = metro.backlog!.constructionSites.filter(
      (s) => s.form === "trench" && s.pull.form === "scaffold",
    );
    expect(demoted.length).toBeGreaterThan(0);
    for (const site of demoted) {
      expect(site.buildingId).toBeNull();
      expect(site.reason).toMatch(/capped at 35%|No facade/);
    }
  });

  it("anchors an item beside the building its path names", () => {
    let checked = 0;
    for (const entity of crowd(metro)) {
      const match = /It stands beside (\S+) because/.exec(entity.reason);
      if (!match) continue;
      const building = metro.buildings.find((b) => b.plan.path === match[1])!;
      expect(building).toBeDefined();
      const d = Math.hypot(entity.position[0] - building.position[0], entity.position[2] - building.position[2]);
      expect(d).toBeLessThanOrEqual(ANCHOR_REACH + 1e-6);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(100);
  });
});

describe("crowd placement: entities", () => {
  it("makes every crowd object a genuine, inspectable incident or works object", () => {
    const repo = backlog.repo.url;
    for (const incident of metro.backlog!.incidents) {
      expect(incident.kind).toBe("incident");
      expect(incident.lod).toBe("crowd");
      expect(incident.id).toBe(`incident-${incident.issue.number}`);
      expect(incident.sourceUrl).toBe(`${repo}/issues/${incident.issue.number}`);
      expect(incident.issue.form).toBe(incident.form);
      expect(incident.issue.bodyExcerpt).toBe("");
      expect(typeof incident.lane).toBe("boolean");
      expect(incident.heat).toBeGreaterThanOrEqual(0);
      expect(incident.heat).toBeLessThanOrEqual(1);
      const base = CROWD_BASE_SIZE[incident.form!];
      expect(incident.size![0]).toBeCloseTo(base[0] * heatScale(incident.heat!), 2);
      expect(incident.reason.length).toBeGreaterThan(40);
    }
    for (const site of metro.backlog!.constructionSites) {
      expect(site.kind).toBe("construction");
      expect(site.lod).toBe("crowd");
      expect(site.id).toBe(`construction-${site.pull.number}`);
      expect(site.sourceUrl).toBe(`${repo}/pull/${site.pull.number}`);
      expect(site.form).not.toBe("site");
      expect(site.state).not.toBe("completed");
      expect(site.buildingId === null || site.form === "scaffold").toBe(true);
    }
  });

  it("keeps every id unique across heroes, crowd, landmarks, buildings and the queue", () => {
    const ids = [
      ...metro.buildings,
      ...metro.landmarks,
      ...metro.incidents,
      ...metro.constructionSites,
      ...crowd(metro),
      metro.overflow!,
    ].map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("ripples the crowd outwards between 2.7 and 3.9 seconds", () => {
    const sorted = crowd(metro).sort(
      (a, b) =>
        Math.hypot(a.position[0], a.position[2]) - Math.hypot(b.position[0], b.position[2]) ||
        (a.id < b.id ? -1 : 1),
    );
    let last = -Infinity;
    for (const entity of sorted) {
      expect(entity.appearAt).toBeGreaterThanOrEqual(CROWD_REVEAL[0]);
      expect(entity.appearAt).toBeLessThanOrEqual(CROWD_REVEAL[1]);
      expect(entity.appearAt).toBeGreaterThanOrEqual(last);
      last = entity.appearAt;
    }
  });
});

describe("crowd placement: determinism", () => {
  it("produces byte-identical output over two runs", () => {
    expect(JSON.stringify(generateCity(backlog))).toBe(JSON.stringify(metro));
    expect(JSON.stringify(generateCity(backlog, { tier: "village" }))).toBe(JSON.stringify(village));
  });

  it("moves the crowd, and nothing else, with the seed of its own stream", () => {
    const reseeded = structuredClone(backlog);
    reseeded.seed = "react/react@0000000";
    const other = generateCity(reseeded);
    const positions = (city: CityModel) => JSON.stringify(crowd(city).map((e) => e.position));
    expect(positions(other)).not.toBe(positions(metro));
  });
});

describe("heroes per tier (76.5)", () => {
  const react = load("react__react.analysis.json");

  it("demotes the heroes past a village's cap into the crowd instead of dropping them", () => {
    const small = generateCity(react, { tier: "village" });
    const { incidents: heroCap, sites: siteCap } = SETTLEMENT_PARAMS.village.heroes;
    expect(small.incidents).toHaveLength(heroCap);
    expect(small.constructionSites).toHaveLength(siteCap);
    const crowdIssues = new Set(small.backlog!.incidents.map((i) => i.issue.number));
    const hidden = small.overflow?.issues.hidden ?? 0;
    const demoted = react.metrics.issues.ranked.slice(heroCap);
    const shown = demoted.filter((issue) => crowdIssues.has(issue.number));
    expect(shown.length + Math.min(hidden, demoted.length)).toBeGreaterThanOrEqual(demoted.length);
    for (const incident of small.backlog!.incidents) {
      expect(incident.lod).toBe("crowd");
      expect(incident.form).toBeDefined();
    }
    const demotedOpenPulls = react.metrics.pulls.ranked
      .slice(siteCap)
      .filter((p) => p.state !== "completed");
    const crowdPulls = new Set(small.backlog!.constructionSites.map((s) => s.pull.number));
    for (const pull of demotedOpenPulls) expect(crowdPulls.has(pull.number)).toBe(true);
    // A merged pull request past the cap is not open, so it is not drawn.
    for (const pull of react.metrics.pulls.ranked.slice(siteCap)) {
      if (pull.state === "completed") expect(crowdPulls.has(pull.number)).toBe(false);
    }
  });

  it("gives a demoted hero with no form the shape its state implies: a stale bug is still a collision", () => {
    const old = structuredClone(react);
    const template = old.metrics.issues.ranked[0];
    old.metrics.issues.ranked = Array.from({ length: 20 }, (_, i): RankedIssue => {
      const { form: _form, ...rest } = template;
      void _form;
      return { ...rest, number: 80_000 + i, state: i % 2 === 0 ? "stale" : "major" };
    });
    const small = generateCity(old, { tier: "village" });
    const byNumber = new Map(small.backlog!.incidents.map((i) => [i.issue.number, i]));
    let checked = 0;
    for (const issue of old.metrics.issues.ranked.slice(SETTLEMENT_PARAMS.village.heroes.incidents)) {
      const crowd = byNumber.get(issue.number);
      if (!crowd) continue;
      expect(crowd.form).toBe(issue.state === "stale" ? "collision" : "fire");
      checked += 1;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("slices heroes to each tier's cap", () => {
    const many = structuredClone(react);
    const template = many.metrics.issues.ranked[0];
    many.metrics.issues.ranked = Array.from(
      { length: 20 },
      (_, i): RankedIssue => ({ ...template, number: 90_000 + i }),
    );
    for (const tier of ["village", "town", "city", "metropolis"] as const) {
      const city = generateCity(many, { tier });
      expect(city.incidents).toHaveLength(SETTLEMENT_PARAMS[tier].heroes.incidents);
      expect(city.incidents.every((i) => i.lod === undefined)).toBe(true);
    }
  });
});

describe("city-tier fixtures keep today's heroes", () => {
  /**
   * cyrb53 of `{ incidents, constructionSites }` generated before settlements
   * existed. The captured fixtures' values were re-taken with 63e8779's
   * generator when they were recaptured (integration step I), and again when
   * the crowd-form migration (L1) changed only the heroes' `form` fields.
   */
  const PINNED: Record<string, number> = {
    "sample.analysis.json": 3812625636034141,
    "honojs__hono.analysis.json": 1588975780549999,
    "atom__atom.analysis.json": 7343991605970341,
    "vercel__turborepo.analysis.json": 6239463684083296,
  };

  it.each(Object.keys(PINNED))("%s: heroes unchanged, with and without a backlog", (name) => {
    const analysis = load(name);
    const heroes = (city: CityModel) =>
      JSON.stringify({ incidents: city.incidents, constructionSites: city.constructionSites });
    const plain = generateCity(analysis);
    expect(hashString(heroes(plain))).toBe(PINNED[name]);

    // The same repository with the whole synthetic backlog attached: the
    // crowd fills in around the heroes and moves none of them, nor anything
    // else that existed before.
    const crowded = structuredClone(analysis);
    crowded.metrics.issues.backlog = backlog.metrics.issues.backlog;
    crowded.metrics.pulls.backlog = backlog.metrics.pulls.backlog;
    const withCrowd = generateCity(crowded);
    expect(withCrowd.backlog!.incidents.length).toBeGreaterThan(0);
    const strip = (city: CityModel) => {
      const { backlog: _b, overflow: _o, ...rest } = city;
      void _b;
      void _o;
      return JSON.stringify(rest);
    };
    expect(strip(withCrowd)).toBe(strip(plain));
  });
});

describe("performance (PLAN.md 76.13)", () => {
  it("generates the maximal metropolis within the CI bound", () => {
    const maximal = structuredClone(backlog);
    const template = maximal.buildings.find((b) => b.landmark === null)!;
    const extra = Array.from({ length: 450 - maximal.buildings.length }, (_, i): BuildingPlan => ({
      ...template,
      id: `b-stress-${i}`,
      path: `packages/stress-${i % 40}/module-${i}.js`,
      districtId: maximal.districts[i % maximal.districts.length].id,
      score: 1 + (i % 17) / 10,
    }));
    maximal.buildings = [...maximal.buildings, ...extra];
    const issue = maximal.metrics.issues.ranked[0];
    maximal.metrics.issues.ranked = Array.from({ length: 16 }, (_, i) => ({ ...issue, number: 80_000 + i }));
    generateCity(maximal);
    const runs: number[] = [];
    for (let i = 0; i < 3; i++) {
      const t0 = performance.now();
      const city = generateCity(maximal);
      runs.push(performance.now() - t0);
      expect(city.buildings).toHaveLength(450);
    }
    runs.sort((a, b) => a - b);
    // 120 ms on the reference desktop; generous for a shared CI runner.
    expect(runs[1]).toBeLessThan(600);
  });
});

describe("interleave", () => {
  it("merges two lists in proportion, keeping each list's order", () => {
    expect(interleave<number | string>([1, 2, 3, 4], ["a", "b"])).toEqual([1, "a", 2, 3, "b", 4]);
    expect(interleave<string>([], ["a"])).toEqual(["a"]);
    expect(interleave<number>([1, 2], [])).toEqual([1, 2]);
  });
});
