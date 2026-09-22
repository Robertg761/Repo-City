import { describe, expect, it } from "vitest";
import type { ConstructionState, IncidentState } from "@/types/analysis";
import type { ConstructionSite, Incident, RoadSegment } from "@/types/city";
import { devCity } from "@/fixtures/dev.city";
import {
  INCIDENT_FOOTPRINT,
  SITE_FOOTPRINT,
  SITE_SIDE,
  blockedStretches,
  cityObstacles,
  type Obstacle,
} from "./blockages";
import { incidentDecor } from "./models/props/incidentDecor";
import { constructionDecor } from "./models/props/constructionDecor";
import { CAR_HALF_WIDTH, laneOffset, roadGraph } from "./traffic";

const road = (id: string, from: [number, number], to: [number, number], width = 7): RoadSegment => ({
  id,
  from: [from[0], 0, from[1]],
  to: [to[0], 0, to[1]],
  width,
  major: width > 5,
  appearAt: 0,
});

/** An incident obstacle exactly as `cityObstacles` builds one. */
const incident = (state: IncidentState, x: number, z: number, rotationY: number): Obstacle => ({
  id: `incident-${state}`,
  x,
  z,
  rotationY,
  ...INCIDENT_FOOTPRINT[state],
});

/** A straight eighty unit road along z, and the same road drawn the other way. */
const NORTH = [road("north", [0, -40], [0, 40])];
const SOUTH = [road("south", [0, 40], [0, -40])];

/** A plus-shaped junction: four twenty unit arms meeting at the origin. */
const CROSS: RoadSegment[] = [
  road("n", [0, -20], [0, 0], 6),
  road("s", [0, 0], [0, 20], 6),
  road("w", [-20, 0], [0, 0], 4),
  road("e", [0, 0], [20, 0], 4),
];

describe("blockedStretches", () => {
  it("blocks the stretch an incident covers along its own road", () => {
    const { stretches } = blockedStretches(roadGraph(NORTH), [incident("minor", 0, 0, 0)]);
    expect(stretches).toHaveLength(1);
    const [stretch] = stretches;
    expect(stretch.segment).toBe(0);
    expect(stretch.closed).toBe(false);
    expect(stretch.start).toBeCloseTo(40 + INCIDENT_FOOTPRINT.minor.minZ);
    expect(stretch.end).toBeCloseTo(40 + INCIDENT_FOOTPRINT.minor.maxZ);
    expect(stretch.causes).toEqual(["incident-minor"]);
  });

  it("follows the incident's heading when the road is drawn the other way", () => {
    // The generator gives an incident its road's heading: pi for a road
    // running towards -z. Its scene then lies the other way round in the
    // world, and the stretch measured from `from` comes out the same.
    const { stretches } = blockedStretches(roadGraph(SOUTH), [incident("minor", 0, 0, Math.PI)]);
    expect(stretches).toHaveLength(1);
    expect(stretches[0].start).toBeCloseTo(40 + INCIDENT_FOOTPRINT.minor.minZ);
    expect(stretches[0].end).toBeCloseTo(40 + INCIDENT_FOOTPRINT.minor.maxZ);
  });

  it("ignores dressing on the verge and counts it once it reaches a lane", () => {
    const graph = roadGraph(NORTH);
    const band = laneOffset(7) + CAR_HALF_WIDTH;
    const reach = INCIDENT_FOOTPRINT.stale.maxX;
    // Just clear of the lanes: the scene's near edge stops short of the band.
    const verge = blockedStretches(graph, [incident("stale", band + reach + 0.05, 0, 0)]);
    expect(verge.stretches).toEqual([]);
    // Half a unit into the kerb lane: blocked.
    const kerb = blockedStretches(graph, [incident("stale", band + reach - 0.5, 0, 0)]);
    expect(kerb.stretches).toHaveLength(1);
  });

  it("carries a scene that spills over a junction onto every road it reaches", () => {
    const graph = roadGraph(CROSS);
    // A collision three units short of the junction: the ambulance parked
    // behind it is on "n", the police car ahead is across the junction.
    const { bySegment } = blockedStretches(graph, [incident("collision", 0, -3, 0)]);
    const [n, s, w, e] = bySegment;
    expect(n).toHaveLength(1);
    expect(n[0].start).toBeCloseTo(20 - 3 + INCIDENT_FOOTPRINT.collision.minZ);
    expect(n[0].end).toBeCloseTo(20);
    expect(s[0].start).toBeCloseTo(0);
    expect(s[0].end).toBeCloseTo(-3 + INCIDENT_FOOTPRINT.collision.maxZ);
    // The side roads are blocked only where they cross the scene.
    expect(w[0].start).toBeCloseTo(20 - INCIDENT_FOOTPRINT.collision.maxX);
    expect(w[0].end).toBeCloseTo(20);
    expect(e[0].start).toBeCloseTo(0);
    expect(e[0].end).toBeCloseTo(INCIDENT_FOOTPRINT.collision.maxX);
    for (const list of bySegment) expect(list.every((stretch) => !stretch.closed)).toBe(true);
  });

  it("merges overlapping scenes and names every cause", () => {
    const { stretches } = blockedStretches(roadGraph(NORTH), [
      incident("minor", 0, 0, 0),
      { ...incident("major", 0, 6, 0), id: "other" },
    ]);
    expect(stretches).toHaveLength(1);
    expect(stretches[0].causes).toEqual(["incident-minor", "other"]);
    expect(stretches[0].end).toBeCloseTo(46 + INCIDENT_FOOTPRINT.major.maxZ);
  });

  it("closes a segment with no room to pull in from either end", () => {
    const short = [road("stub", [0, 0], [0, 14])];
    const { stretches, bySegment } = blockedStretches(roadGraph(short), [incident("minor", 0, 7, 0)]);
    expect(stretches).toHaveLength(1);
    expect(stretches[0].closed).toBe(true);
    // Shut as a whole, but the stretch still says where the scene is.
    expect(stretches[0].start).toBeCloseTo(7 + INCIDENT_FOOTPRINT.minor.minZ);
    expect(stretches[0].end).toBeCloseTo(7 + INCIDENT_FOOTPRINT.minor.maxZ);
    expect(bySegment[0]).toEqual(stretches);
  });

  it("closes a junction a scene comes within a car's reach of", () => {
    const graph = roadGraph(CROSS);
    // A collision on the north arm stopping 1.6 short of the junction: clear
    // of the side roads' lanes, but a car turning across the junction would
    // put its nose into it.
    const at = -1.6 - INCIDENT_FOOTPRINT.collision.maxZ;
    const { bySegment } = blockedStretches(graph, [incident("collision", 0, at, 0)]);
    const [n, s, w, e] = bySegment;
    expect(n[0].end).toBeCloseTo(18.4);
    // Every other road into the junction is shut across the junction's box,
    // the widest lane band there.
    const box = laneOffset(6) + CAR_HALF_WIDTH;
    expect(s).toMatchObject([{ start: 0, closed: false }]);
    expect(s[0].end).toBeCloseTo(box);
    expect(e[0].end).toBeCloseTo(box);
    expect(w[0].start).toBeCloseTo(20 - box);
    expect(w[0].causes).toEqual(n[0].causes);
  });

  it("leaves a junction open when the scene stops a car's reach short of it", () => {
    const graph = roadGraph(CROSS);
    const at = -6 - INCIDENT_FOOTPRINT.collision.maxZ;
    const { bySegment } = blockedStretches(graph, [incident("collision", 0, at, 0)]);
    expect(bySegment.map((list) => list.length)).toEqual([1, 0, 0, 0]);
  });

  it("blocks nothing for a clear road network", () => {
    const { stretches, bySegment } = blockedStretches(roadGraph(CROSS), []);
    expect(stretches).toEqual([]);
    expect(bySegment).toEqual([[], [], [], []]);
  });
});

describe("cityObstacles", () => {
  const site = (position: [number, number], size: number, state: ConstructionState = "active") =>
    ({
      id: `construction-${state}`,
      kind: "construction",
      position: [position[0], 0, position[1]],
      rotationY: 0,
      state,
      size: [size, 12, size],
    }) as ConstructionSite;

  it("takes an incident's scene and a site's plot, scaled to fit", () => {
    const obstacles = cityObstacles({
      incidents: [
        { id: "incident-1", position: [3, 0, 4], rotationY: 1, state: "major" } as Incident,
      ],
      constructionSites: [site([10, 10], SITE_SIDE / 2)],
    });
    expect(obstacles[0]).toEqual({ id: "incident-1", x: 3, z: 4, rotationY: 1, ...INCIDENT_FOOTPRINT.major });
    expect(obstacles[1].minX).toBeCloseTo(SITE_FOOTPRINT.active.minX / 2);
    expect(obstacles[1].maxZ).toBeCloseTo(SITE_FOOTPRINT.active.maxZ / 2);
  });

  it("lets a site on the kerb be, unless its dressing leans into a lane", () => {
    // A minor road, and a plot whose edge sits right on its kerb, as the
    // generator allows. The excavator's arm is on the site's -x side.
    const graph = roadGraph([road("minor", [0, -40], [0, 40], 4.5)]);
    const kerb = 2.25 + SITE_SIDE / 2;
    const away = cityObstacles({ incidents: [], constructionSites: [site([-kerb, 0], SITE_SIDE)] });
    expect(blockedStretches(graph, away).stretches).toEqual([]);
    // Across the road the arm swings out over the kerb and into the lane.
    const over = cityObstacles({ incidents: [], constructionSites: [site([kerb, 0], SITE_SIDE)] });
    expect(blockedStretches(graph, over).stretches).toHaveLength(1);
  });

  it("finds every fixture incident in the road and every fixture site off it", () => {
    const graph = roadGraph(devCity.roads);
    const { stretches } = blockedStretches(graph, cityObstacles(devCity));
    for (const one of devCity.incidents) {
      expect(stretches.some((stretch) => stretch.causes.includes(one.id))).toBe(true);
    }
    for (const one of devCity.constructionSites) {
      expect(stretches.some((stretch) => stretch.causes.includes(one.id))).toBe(false);
    }
  });
});

/**
 * The footprints are hand-kept copies of what the decor modules draw. If a
 * scene grows -- a vehicle parked further out, a wider barricade line -- the
 * traffic would drive through the new part, so the copies are held to the
 * decor's real bounding boxes here.
 */
describe("footprints", () => {
  const holds = (outer: { minX: number; maxX: number; minZ: number; maxZ: number }, geometry: ReturnType<typeof constructionDecor>) => {
    geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    expect(box).not.toBeNull();
    if (!box) return;
    expect(outer.minX).toBeLessThanOrEqual(box.min.x);
    expect(outer.maxX).toBeGreaterThanOrEqual(box.max.x);
    expect(outer.minZ).toBeLessThanOrEqual(box.min.z);
    expect(outer.maxZ).toBeGreaterThanOrEqual(box.max.z);
  };

  it.each(["minor", "collision", "stale", "major"] as const)("covers the %s incident scene", (state) => {
    for (const variant of [0, 1]) holds(INCIDENT_FOOTPRINT[state], incidentDecor(state, variant, 0).geometry);
  });

  it.each(["active", "slow", "abandoned", "completed"] as const)("covers the %s site and its plot", (state) => {
    const rect = SITE_FOOTPRINT[state];
    holds(rect, constructionDecor(state, 0));
    expect(rect.minX).toBeLessThanOrEqual(-SITE_SIDE / 2);
    expect(rect.maxX).toBeGreaterThanOrEqual(SITE_SIDE / 2);
    expect(rect.minZ).toBeLessThanOrEqual(-SITE_SIDE / 2);
    expect(rect.maxZ).toBeGreaterThanOrEqual(SITE_SIDE / 2);
  });
});
