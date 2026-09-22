import { describe, expect, it } from "vitest";
import type { Building, RoadSegment, Vec3 } from "@/types/city";
import {
  HERO_CLEARANCE,
  JUNCTION_SKIP,
  KERB_PITCH,
  LAMP_CLEARANCE,
  SIDEWALK_WIDTH,
  boxesOverlap,
  claim,
  createIndex,
  findBridges,
  fits,
  laneOffset,
  nearestSpot,
  normalizeAngle,
  pointInBox,
  populateSpots,
  roadAt,
  type Box,
  type SpotIndex,
} from "./spots";

const road = (
  id: string,
  from: [number, number],
  to: [number, number],
  width = 7,
  kind?: RoadSegment["kind"],
): RoadSegment => ({
  id,
  from: [from[0], 0, from[1]],
  to: [to[0], 0, to[1]],
  width,
  major: true,
  appearAt: 0,
  ...(kind ? { kind } : {}),
});

const building = (id: string, x: number, z: number, w = 4, d = 4, rotationY = 0): Building =>
  ({
    id,
    kind: "building",
    position: [x, 0, z],
    rotationY,
    title: id,
    subtitle: "",
    description: "",
    reason: "",
    sourceUrl: null,
    visualState: "normal",
    appearAt: 0,
    districtId: "d",
    size: [w, 10, d],
    tier: 1,
    colorIndex: 0,
    plan: { id, path: id, kind: "file", districtId: "d", score: 1, tier: 1, descendantCount: 0, language: null, role: null, landmark: null },
  }) as Building;

/** A 60-unit square loop with a 40-unit dead-end tail off one corner. */
const loop: RoadSegment[] = [
  road("n", [-30, -30], [30, -30]),
  road("e", [30, -30], [30, 30]),
  road("s", [30, 30], [-30, 30]),
  road("w", [-30, 30], [-30, -30]),
  road("tail", [30, 30], [70, 30], 4.5),
];

function build(
  roads: RoadSegment[],
  opts: {
    buildings?: Building[];
    lamps?: Vec3[];
    heroes?: { x: number; z: number }[];
    ground?: Parameters<typeof populateSpots>[1]["ground"];
    reserved?: Set<string>;
  } = {},
): SpotIndex {
  const buildings = opts.buildings ?? [];
  const index = createIndex(roads, buildings, []);
  return populateSpots(index, {
    roads,
    buildings,
    obstacles: [],
    lamps: opts.lamps ?? [],
    heroes: opts.heroes ?? [],
    ground: opts.ground ?? [],
    reserved: opts.reserved,
  });
}

describe("boxesOverlap (separating axis test)", () => {
  const a: Box = { x: 0, z: 0, hw: 1, hd: 1, rot: 0 };

  it("treats touching boxes as clear and interpenetrating ones as overlapping", () => {
    expect(boxesOverlap(a, { ...a, x: 2 })).toBe(false);
    expect(boxesOverlap(a, { ...a, x: 1.99 })).toBe(true);
    expect(boxesOverlap(a, { ...a, x: 2.5, z: 2.5 })).toBe(false);
  });

  it("finds the gap a pair of axis-aligned boxes would miss", () => {
    // A diamond whose corner points at the square's corner, 0.2 short of it.
    const diamond: Box = { x: 1 + Math.SQRT2 + 0.14, z: 1 + 0.0, hw: 1, hd: 1, rot: Math.PI / 4 };
    const far: Box = { ...diamond, x: 2 + Math.SQRT2, z: 2 + Math.SQRT2 };
    expect(boxesOverlap(a, far)).toBe(false);
    expect(boxesOverlap(a, diamond)).toBe(false);
    expect(boxesOverlap(a, { ...diamond, x: diamond.x - 0.3 })).toBe(true);
  });

  it("asks for daylight when given a margin", () => {
    expect(boxesOverlap(a, { ...a, x: 2.5 })).toBe(false);
    expect(boxesOverlap(a, { ...a, x: 2.5 }, 0.6)).toBe(true);
  });

  it("rotates as three.js does: local z follows (sin, cos)", () => {
    const along: Box = { x: 0, z: 0, hw: 0.1, hd: 5, rot: Math.PI / 2 };
    // Turned a quarter, the long axis lies along world x.
    expect(pointInBox(along, 4, 0)).toBe(true);
    expect(pointInBox(along, 0, 4)).toBe(false);
  });
});

describe("findBridges (Tarjan)", () => {
  it("finds the dead-end tail and nothing on the loop", () => {
    expect([...findBridges(loop)]).toEqual([4]);
  });

  it("merges junctions within the traffic graph's tolerance", () => {
    const nudged = [...loop.slice(0, 4), road("tail", [30.6, 30.4], [70, 30], 4.5)];
    expect([...findBridges(nudged)]).toEqual([4]);
  });

  it("never counts one of two parallel segments as a bridge", () => {
    const pair = [road("a", [0, 0], [10, 0]), road("b", [0, 0], [10, 0]), road("c", [10, 0], [20, 0])];
    expect([...findBridges(pair)]).toEqual([2]);
  });

  it("handles a long chain without recursion", () => {
    const chain = Array.from({ length: 5000 }, (_, i) => road(`c${i}`, [i * 10, 0], [i * 10 + 10, 0]));
    expect(findBridges(chain).size).toBe(5000);
  });
});

describe("populateSpots: kerb and lane spots", () => {
  const index = build(loop);
  const kerb = index.spots.filter((s) => s.cls === "kerb");
  const lane = index.spots.filter((s) => s.cls === "lane");

  it("puts kerb spots on the pavement, both sides, at the documented pitch", () => {
    const north = kerb.filter((s) => s.road === 0);
    const count = Math.floor((60 - 2 * JUNCTION_SKIP) / KERB_PITCH);
    expect(north).toHaveLength(2 * count);
    for (const spot of north) {
      expect(Math.abs(Math.abs(spot.z + 30) - (3.5 + SIDEWALK_WIDTH / 2))).toBeLessThan(1e-6);
      expect(Math.abs(spot.x)).toBeLessThanOrEqual(30 - JUNCTION_SKIP);
      expect(spot.along).toBeGreaterThanOrEqual(KERB_PITCH / 2 - 1e-9);
    }
    const xs = [...new Set(north.map((s) => s.x))].sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeCloseTo(KERB_PITCH, 3);
  });

  it("turns each kerb spot so its local -x points at the carriageway", () => {
    for (const spot of kerb.filter((s) => s.road < 4)) {
      const r = index.roads[spot.road];
      // The direction to the centre line, projected onto local x.
      const dx = r.from[0] === r.to[0] ? r.from[0] - spot.x : 0;
      const dz = r.from[2] === r.to[2] ? r.from[2] - spot.z : 0;
      const localX = dx * Math.cos(spot.rotationY) - dz * Math.sin(spot.rotationY);
      expect(localX).toBeLessThan(0);
    }
  });

  it("puts lane spots in the lanes, never on a bridge", () => {
    expect(lane.length).toBeGreaterThan(0);
    for (const spot of lane) {
      expect(spot.road).not.toBe(4);
      const r = index.roads[spot.road];
      const across =
        r.from[0] === r.to[0] ? Math.abs(spot.x - r.from[0]) : Math.abs(spot.z - r.from[2]);
      expect(across).toBeCloseTo(laneOffset(r.width), 6);
    }
    expect(index.lanesByRoad.has(4)).toBe(false);
    expect(kerb.some((s) => s.road === 4)).toBe(true);
  });

  it("offers nothing on a highway or a reserved road", () => {
    const withHighway = build([...loop, road("hwy", [30, -30], [30, -120], 8.4, "highway")], {
      reserved: new Set(["n"]),
    });
    expect(withHighway.spots.some((s) => s.road === 5)).toBe(false);
    expect(withHighway.spots.some((s) => s.road === 0)).toBe(false);
  });

  it("drops kerb spots by the lamps and every road spot near a hero", () => {
    const lamps: Vec3[] = [[0, 0, -30 - 4.4]];
    const heroes = [{ x: 30, z: 0 }];
    const lit = build(loop, { lamps, heroes });
    for (const spot of lit.spots) {
      if (spot.cls === "kerb") {
        expect(Math.hypot(spot.x - 0, spot.z + 34.4)).toBeGreaterThanOrEqual(LAMP_CLEARANCE);
      }
      if (spot.cls === "kerb" || spot.cls === "lane") {
        expect(Math.hypot(spot.x - 30, spot.z)).toBeGreaterThanOrEqual(HERO_CLEARANCE);
      }
    }
    expect(lit.spots.length).toBeLessThan(index.spots.length);
  });

  it("works on angled roads: offsets are perpendicular to the segment", () => {
    const bent = [road("a", [0, 0], [30, 20], 3.6, "lane"), road("b", [30, 20], [50, 50], 3.6, "lane")];
    const angled = build(bent);
    const onA = angled.spots.filter((s) => s.cls === "kerb" && s.road === 0);
    expect(onA.length).toBeGreaterThan(0);
    const len = Math.hypot(30, 20);
    for (const spot of onA) {
      // Distance to the centre line is the pavement offset.
      const cross = Math.abs(spot.x * 20 - spot.z * 30) / len;
      expect(cross).toBeCloseTo(3.6 / 2 + SIDEWALK_WIDTH / 2, 2);
    }
  });
});

describe("populateSpots: ground and facades", () => {
  it("grids the ground areas, offers a vacant slot whole, and keeps off the pavements", () => {
    const index = build(loop, {
      ground: [
        { x: 0, z: 0, w: 7, d: 7, rotationY: 0, whole: true },
        // Straddles the north road: the points on the road are dropped.
        { x: 0, z: -30, w: 14, d: 14, rotationY: 0 },
      ],
    });
    const ground = index.spots.filter((s) => s.cls === "ground");
    const wholes = ground.filter((s) => s.whole);
    expect(wholes).toHaveLength(1);
    expect(wholes[0].whole).toEqual({ w: 7, d: 7 });
    const points = ground.filter((s) => !s.whole);
    expect(points.filter((s) => Math.abs(s.x) < 3.6 && Math.abs(s.z) < 3.6)).toHaveLength(4);
    for (const spot of points) expect(Math.abs(spot.z + 30)).toBeGreaterThan(3.5 + SIDEWALK_WIDTH);
  });

  it("puts one facade on the face that looks at the nearest road", () => {
    const b = building("b", 0, -20, 4, 6);
    const index = build(loop, { buildings: [b] });
    const facade = index.facades[0]!;
    expect(facade).not.toBeNull();
    // The north road is 10 away; the facade is the north face, facing -z.
    expect(facade.x).toBeCloseTo(0, 6);
    expect(facade.z).toBeCloseTo(-20 - 3 - 0.05 - 0.45, 6);
    expect(facade.face).toEqual({ w: 4, h: 10 });
    expect(Math.abs(facade.rotationY)).toBeCloseTo(Math.PI, 3);
  });

  it("turns the facade with a rotated house", () => {
    const b = building("b", 0, -20, 4, 6, Math.PI / 2);
    const index = build(loop, { buildings: [b] });
    const facade = index.facades[0]!;
    // Turned a quarter, the 6-deep side is now the one facing north.
    expect(facade.face?.w).toBe(6);
    expect(facade.z).toBeCloseTo(-20 - 2 - 0.05 - 0.45, 6);
  });

  it("leaves no facade where the slab would reach a road", () => {
    const b = building("b", 0, -24, 4, 4);
    const index = build(loop, { buildings: [b] });
    expect(index.facades[0]).toBeNull();
  });
});

describe("queries and claims", () => {
  it("returns the true nearest acceptable spot, and nothing past the reach", () => {
    const index = build(loop);
    const spot = nearestSpot(index, ["kerb"], 0, -40, 40, () => true)!;
    expect(spot.z).toBeCloseTo(-34.1, 3);
    expect(Math.abs(spot.x)).toBeLessThanOrEqual(KERB_PITCH / 2 + 1e-6);
    const refusing = nearestSpot(index, ["kerb"], 0, -40, 40, (s) => s.x > 10);
    expect(refusing!.x).toBeGreaterThan(10);
    expect(nearestSpot(index, ["kerb"], 500, 500, 40, () => true)).toBeNull();
  });

  it("refuses footprints that overlap a placed object, and retires the spots under it", () => {
    const index = build(loop);
    const spot = nearestSpot(index, ["kerb"], 0, -40, 40, () => true)!;
    const box: Box = { x: spot.x, z: spot.z, hw: 0.6, hd: 3, rot: spot.rotationY };
    expect(fits(index, spot, box)).toBe(true);
    claim(index, spot, box, "van");
    expect(spot.taken).toBe(true);
    const next = nearestSpot(index, ["kerb"], spot.x, spot.z, 40, (s) =>
      fits(index, s, { x: s.x, z: s.z, hw: 0.6, hd: 1.5, rot: s.rotationY }),
    )!;
    // The spot 3.2 along is under the claimed van's 3-unit half length.
    expect(Math.hypot(next.x - spot.x, next.z - spot.z)).toBeGreaterThan(3);
  });

  it("keeps a road object between its junction skips", () => {
    const index = build(loop);
    const end = index.spots.find((s) => s.cls === "kerb" && s.along < 3)!;
    expect(end).toBeDefined();
    const hd = end.along + 0.1;
    expect(fits(index, end, { x: end.x, z: end.z, hw: 0.5, hd, rot: end.rotationY })).toBe(false);
    expect(fits(index, end, { x: end.x, z: end.z, hw: 0.5, hd: end.along, rot: end.rotationY })).toBe(true);
  });

  it("finds the road a hero sits on", () => {
    const index = build(loop);
    expect(roadAt(index, 0, -30)).toBe(0);
    expect(roadAt(index, 50, 30)).toBe(4);
    expect(roadAt(index, 0, 0)).toBe(-1);
  });
});

describe("normalizeAngle", () => {
  it("folds into (-PI, PI] and rounds to three places", () => {
    expect(normalizeAngle(Math.PI)).toBeCloseTo(3.142, 3);
    expect(normalizeAngle(-Math.PI)).toBeCloseTo(3.142, 3);
    expect(normalizeAngle(3 * Math.PI)).toBeCloseTo(3.142, 3);
    expect(normalizeAngle(0.25)).toBe(0.25);
  });
});
