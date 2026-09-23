import { describe, expect, it } from "vitest";
import type { CityModel, District, Landmark, RoadKind, RoadSegment, Vec3 } from "@/types/city";
import {
  JUNCTION_INSET,
  MEDIAN_WIDTH,
  SIDEWALK_WIDTH,
  TUNED_WIDTH,
  barrierLays,
  chamferedOutline,
  crosswalkLays,
  edgeLineLays,
  jointLays,
  junctionClearance,
  laneDashLays,
  medianLays,
  medianTreeSpots,
  plazaRect,
  plazaSurface,
  roadLays,
  roadNodes,
  roadStyle,
  sidewalkLays,
  vergeLays,
  type RoadLay,
} from "./groundwork";

const road = (
  id: string,
  from: Vec3,
  to: Vec3,
  { major = false, width, kind }: { major?: boolean; width?: number; kind?: RoadKind } = {},
): RoadSegment => ({
  id,
  from,
  to,
  width: width ?? (major ? 7 : 4.5),
  major,
  appearAt: 0,
  ...(kind ? { kind } : {}),
});

/** A crossroads: four arms meeting at the origin, all split at the junction. */
const CROSSROADS: RoadSegment[] = [
  road("w", [-40, 0, 0], [0, 0, 0], { major: true }),
  road("e", [0, 0, 0], [40, 0, 0], { major: true }),
  road("n", [0, 0, -40], [0, 0, 0]),
  road("s", [0, 0, 0], [0, 0, 40]),
];

describe("roadLays", () => {
  it("describes each segment from its `from` end, which is where it grows", () => {
    const [west] = roadLays([road("w", [-40, 0, 0], [0, 0, 0])]);
    expect(west.x).toBe(-40);
    expect(west.z).toBe(0);
    expect(west.length).toBe(40);
    expect(west.dx).toBe(1);
    expect(west.dz).toBe(0);
  });

  it("survives a zero-length segment rather than dividing by it", () => {
    const [stub] = roadLays([road("stub", [5, 0, 5], [5, 0, 5])]);
    expect(Number.isFinite(stub.dx)).toBe(true);
    expect(Number.isFinite(stub.angle)).toBe(true);
    expect(stub.length).toBeGreaterThan(0);
  });

  it("maps its angle so that local +z runs along the road", () => {
    const [north] = roadLays([road("n", [0, 0, -40], [0, 0, 0])]);
    // Direction (0, 1) in xz: atan2(0, 1) is zero, i.e. no rotation.
    expect(north.angle).toBeCloseTo(0, 6);
    const [east] = roadLays([road("e", [0, 0, 0], [40, 0, 0])]);
    expect(east.angle).toBeCloseTo(Math.PI / 2, 6);
  });
});

describe("sidewalkLays", () => {
  const lays = roadLays(CROSSROADS);

  it("lays a slab on each side of every road", () => {
    expect(sidewalkLays(lays)).toHaveLength(CROSSROADS.length * 2);
  });

  it("clears the kerb of the carriageway", () => {
    const avenue = road("e", [0, 0, 0], [40, 0, 0], { major: true });
    const [left, right] = sidewalkLays(roadLays([avenue]));
    expect(left.lateral).toBeCloseTo(avenue.width / 2 + SIDEWALK_WIDTH / 2, 6);
    expect(right.lateral).toBeCloseTo(-left.lateral, 6);
  });

  it("stops short of both junctions, leaving the corner for the crossing", () => {
    const [slab] = sidewalkLays(roadLays([road("e", [0, 0, 0], [40, 0, 0])]));
    expect(slab.start).toBe(JUNCTION_INSET);
    expect(slab.start + slab.along).toBeCloseTo(40 - JUNCTION_INSET, 6);
  });

  it("skips a segment too short to hold anything but corners", () => {
    expect(sidewalkLays(roadLays([road("stub", [0, 0, 0], [6, 0, 0])]))).toHaveLength(0);
  });
});

describe("crosswalkLays", () => {
  it("paints a band at a junction and nothing at an open end", () => {
    const lays = roadLays(CROSSROADS);
    const bands = crosswalkLays(lays, CROSSROADS);
    // Every arm has exactly one end at the crossroads.
    const perRoad = new Map<number, number>();
    for (const mark of bands) perRoad.set(mark.road, (perRoad.get(mark.road) ?? 0) + 1);
    expect(perRoad.size).toBe(4);

    // Each band sits at the junction end, not out in the open road.
    for (const mark of bands) {
      const lay = lays[mark.road];
      const atJunction = Math.min(mark.s, lay.length - mark.s);
      expect(atJunction).toBeLessThan(JUNCTION_INSET);
    }
  });

  it("paints a T-junction, which is three arms", () => {
    const tee = [
      road("a", [-40, 0, 0], [0, 0, 0], { major: true }),
      road("b", [0, 0, 0], [40, 0, 0], { major: true }),
      road("c", [0, 0, 0], [0, 0, 40], { major: true }),
    ];
    expect(crosswalkLays(roadLays(tee), tee).length).toBeGreaterThan(0);
  });

  it("leaves a road that merely continues alone", () => {
    // Two segments end to end: a split in one avenue, not a crossing.
    const straight = [
      road("a", [-40, 0, 0], [0, 0, 0], { major: true }),
      road("b", [0, 0, 0], [40, 0, 0], { major: true }),
    ];
    expect(crosswalkLays(roadLays(straight), straight)).toHaveLength(0);
  });

  it("stripes across the carriageway, wider roads getting more stripes", () => {
    const bands = crosswalkLays(roadLays(CROSSROADS), CROSSROADS);
    const major = bands.filter((mark) => mark.road === 0);
    const minor = bands.filter((mark) => mark.road === 2);
    expect(major.length).toBeGreaterThan(minor.length);
    for (const mark of bands) {
      const lay = roadLays(CROSSROADS)[mark.road];
      expect(Math.abs(mark.lateral)).toBeLessThan(lay.width / 2);
    }
  });
});

describe("laneDashLays", () => {
  const lays = roadLays(CROSSROADS);

  it("dashes the avenues and leaves the side streets plain", () => {
    const dashes = laneDashLays(lays);
    expect(dashes.length).toBeGreaterThan(0);
    for (const dash of dashes) {
      expect(lays[dash.road].major).toBe(true);
      expect(dash.lateral).toBe(0);
    }
  });

  it("keeps every dash clear of both junctions", () => {
    for (const dash of laneDashLays(lays)) {
      const lay = lays[dash.road];
      expect(dash.s - dash.along / 2).toBeGreaterThan(JUNCTION_INSET);
      expect(dash.s + dash.along / 2).toBeLessThan(lay.length - JUNCTION_INSET);
    }
  });

  it("spaces them evenly", () => {
    const dashes = laneDashLays(lays).filter((dash) => dash.road === 0);
    const gaps = dashes.slice(1).map((dash, i) => dash.s - dashes[i].s);
    for (const gap of gaps) expect(gap).toBeCloseTo(gaps[0], 6);
  });
});

// ---------------------------------------------------------------------------

const district = (id: string, x: number, z: number, w: number, d: number): District => ({
  id,
  name: id,
  sourcePath: `/${id}`,
  purpose: null,
  rect: { x, z, w, d },
  colorIndex: 0,
  buildingIds: [],
  description: "",
  reason: "",
  sourceUrl: null,
  appearAt: 0,
});

const hall = (position: Vec3, size: Vec3): Landmark => ({
  id: "l-civic",
  kind: "landmark",
  position,
  rotationY: 0,
  title: "Town hall",
  subtitle: "",
  description: "",
  reason: "",
  sourceUrl: null,
  visualState: "healthy",
  appearAt: 0,
  landmarkType: "civic",
  level: 2,
  state: "healthy",
  size,
});

const city = (districts: District[], landmarks: Landmark[]): CityModel =>
  ({ districts, landmarks }) as CityModel;

describe("plazaRect", () => {
  it("recovers the civic cell from the gap the districts leave around it", () => {
    // A twenty-unit hole at the origin, with a district on each side.
    const rect = plazaRect(
      city(
        [
          district("west", -30, 0, 40, 100),
          district("east", 30, 0, 40, 100),
          district("north", 0, -30, 20, 40),
          district("south", 0, 30, 20, 40),
        ],
        [hall([0, 0, 0], [14, 10, 14])],
      ),
    );

    expect(rect).not.toBeNull();
    expect(rect!.x).toBeCloseTo(0, 6);
    expect(rect!.z).toBeCloseTo(0, 6);
    // The 20-unit gap, less the inset from the kerbs on both sides.
    expect(rect!.w).toBeLessThan(20);
    expect(rect!.w).toBeGreaterThan(14);
    expect(rect!.d).toBeLessThan(20);
  });

  it("falls back to the hall's own plot when nothing bounds it", () => {
    const rect = plazaRect(city([], [hall([4, 0, -6], [12, 9, 12])]));
    expect(rect).not.toBeNull();
    expect(rect!.x).toBeCloseTo(4, 6);
    expect(rect!.z).toBeCloseTo(-6, 6);
    expect(rect!.w).toBeGreaterThan(12);
  });

  it("prefers a rect the model carries, if the generator ever adds one", () => {
    const model: CityModel = {
      ...city([], [hall([0, 0, 0], [14, 10, 14])]),
      plaza: { rect: { x: 1, z: 2, w: 30, d: 20 }, surface: "paved" },
    };
    expect(plazaRect(model)).toEqual({ x: 1, z: 2, w: 30, d: 20 });
  });

  it("has nothing to draw in a city with no town hall", () => {
    expect(plazaRect(city([district("only", 0, 0, 80, 80)], []))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Settlement roads (PLAN.md 76.5 and 76.15): styles, angled roads and bends
// ---------------------------------------------------------------------------

/** World position of a point `s` along and `lateral` across a lay. */
const worldAt = (lay: RoadLay, s: number, lateral: number): [number, number] => [
  lay.x + lay.dx * s + lay.dz * lateral,
  lay.z + lay.dz * s - lay.dx * lateral,
];

/** Rotates a road about the origin by `angle` radians, in the ground plane. */
const rotated = (segment: RoadSegment, angle: number): RoadSegment => {
  const turn = ([x, y, z]: Vec3): Vec3 => [
    x * Math.cos(angle) - z * Math.sin(angle),
    y,
    x * Math.sin(angle) + z * Math.cos(angle),
  ];
  return { ...segment, from: turn(segment.from), to: turn(segment.to) };
};

/** A polyline of roads through `points`, one segment per leg. */
const polyline = (
  id: string,
  points: [number, number][],
  options: { width: number; kind?: RoadKind; major?: boolean },
): RoadSegment[] =>
  points
    .slice(1)
    .map(([x, z], i) => road(`${id}-${i}`, [points[i][0], 0, points[i][1]], [x, 0, z], options));

/** A bend of `degrees` at the origin: in from the west, out at an angle. */
const bend = (degrees: number, options: { width: number; kind?: RoadKind; major?: boolean }) => {
  const a = (degrees * Math.PI) / 180;
  return polyline(
    "bend",
    [
      [-40, 0],
      [0, 0],
      [40 * Math.cos(a), 40 * Math.sin(a)],
    ],
    options,
  );
};

describe("roadStyle", () => {
  it("dresses every road the model does not mark as a street", () => {
    expect(roadStyle({ width: 4.5 })).toBe("street");
    expect(roadStyle({ width: 3.6, kind: "lane" })).toBe("lane");
    expect(roadStyle({ width: 9.5, kind: "avenue" })).toBe("avenue");
    expect(roadStyle({ width: 10, kind: "highway" })).toBe("motorway");
  });

  it("keeps the city's 8.4 unit fork highway a street, exactly as it draws today", () => {
    expect(roadStyle({ width: 8.4, kind: "highway" })).toBe("street");
  });
});

describe("a city's roads are dressed exactly as before settlements", () => {
  // The ring road's corner: two major streets meeting at a right angle, the
  // only degree-2 node today's layout makes.
  const corner = polyline(
    "ring",
    [
      [-40, 40],
      [-40, -40],
      [40, -40],
    ],
    { width: 7, major: true },
  );
  const lays = roadLays(corner);

  it("keeps the junction inset on both pavements at a right-angled corner", () => {
    for (const walk of sidewalkLays(lays)) {
      expect(walk.start).toBeCloseTo(JUNCTION_INSET, 9);
      expect(walk.along).toBeCloseTo(80 - JUNCTION_INSET * 2, 9);
    }
  });

  it("fills nothing and paints nothing at the corner", () => {
    expect(jointLays(lays)).toHaveLength(0);
    expect(crosswalkLays(lays, corner)).toHaveLength(0);
  });

  it("adds no verges, medians, barriers, edge lines or joints", () => {
    const grid = roadLays(CROSSROADS);
    expect(vergeLays(grid)).toHaveLength(0);
    expect(medianLays(grid)).toHaveLength(0);
    expect(barrierLays(grid)).toHaveLength(0);
    expect(edgeLineLays(grid)).toHaveLength(0);
    expect(jointLays(grid)).toHaveLength(0);
  });

  it("sets a crossing and a pavement back no further at a fork highway", () => {
    const tee = [
      road("a", [-40, 0, 0], [0, 0, 0], { major: true }),
      road("b", [0, 0, 0], [40, 0, 0], { major: true }),
      road("h", [0, 0, 0], [0, 0, 40], { major: true, width: TUNED_WIDTH, kind: "highway" }),
    ];
    const teeLays = roadLays(tee);
    for (const walk of sidewalkLays(teeLays)) expect(walk.start).toBeCloseTo(JUNCTION_INSET, 9);
    const east = crosswalkLays(teeLays, tee).filter((mark) => mark.road === 1);
    expect(Math.min(...east.map((mark) => mark.s))).toBeCloseTo(2.3, 9);
  });
});

describe("angled roads (PLAN.md 76.15)", () => {
  const strip = (list: { road: number; s?: number; start?: number; lateral: number }[]) =>
    list.map((m) => [m.road, +(m.s ?? m.start ?? 0).toFixed(6), +m.lateral.toFixed(6)]);

  it.each([17, 30, 45, 71])(
    "paints and paves a crossroads turned %i degrees exactly as a square one",
    (degrees) => {
      const turned = CROSSROADS.map((segment) => rotated(segment, (degrees * Math.PI) / 180));
      const square = roadLays(CROSSROADS);
      const angled = roadLays(turned);

      expect(strip(crosswalkLays(angled, turned))).toEqual(strip(crosswalkLays(square, CROSSROADS)));
      expect(strip(sidewalkLays(angled))).toEqual(strip(sidewalkLays(square)));
      expect(strip(laneDashLays(angled))).toEqual(strip(laneDashLays(square)));

      // The bands still sit at the junction end of each arm, in world space.
      for (const mark of crosswalkLays(angled, turned)) {
        const [x, z] = worldAt(angled[mark.road], mark.s, 0);
        expect(Math.hypot(x, z)).toBeLessThan(JUNCTION_INSET);
      }
    },
  );

  it("matches the ends of a junction whose coordinates are off the grid", () => {
    const skew = [
      road("a", [-31.7, 0, 12.3], [1.9, 0, 2.2]),
      road("b", [1.9, 0, 2.2], [30.4, 0, -17.8]),
      road("c", [1.9, 0, 2.2], [12.5, 0, 38.1]),
    ];
    const lays = roadLays(skew);
    expect(roadNodes(lays).nodes.find((node) => node.arms.length === 3)).toBeDefined();
    expect(crosswalkLays(lays, skew).length).toBeGreaterThan(0);
  });
});

describe("a bend in the village main street", () => {
  const street = bend(15, { width: 5, major: true });
  const lays = roadLays(street);

  it("mitres the pavements so the slabs meet on the bend", () => {
    const walks = sidewalkLays(lays);
    expect(walks).toHaveLength(4);
    for (const side of [1, -1]) {
      const inLeg = walks.find((w) => w.road === 0 && Math.sign(w.lateral) === side)!;
      const outLeg = walks.find((w) => w.road === 1 && Math.sign(w.lateral) === side)!;
      const a = worldAt(lays[0], inLeg.start + inLeg.along, inLeg.lateral);
      const b = worldAt(lays[1], outLeg.start, outLeg.lateral);
      expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeLessThan(1e-6);
    }
    // One side runs past the node, the other stops short of it, both by little.
    const starts = walks.filter((w) => w.road === 1).map((w) => w.start);
    expect(Math.min(...starts)).toBeLessThan(0);
    expect(Math.max(...starts)).toBeGreaterThan(0);
    expect(Math.max(...starts.map(Math.abs))).toBeLessThan(1);
  });

  it("fills the wedge with a disc as wide as the road, and paints no crossing", () => {
    const joints = jointLays(lays);
    expect(joints).toHaveLength(1);
    expect(joints[0]).toMatchObject({ x: 0, z: 0, size: 5, shape: "disc", lane: false });
    expect(crosswalkLays(lays, street)).toHaveLength(0);
  });

  it("runs the centre line on round the bend", () => {
    const nearBend = laneDashLays(lays).filter((d) => d.road === 1 && d.s < JUNCTION_INSET);
    expect(nearBend.length).toBeGreaterThan(0);
  });

  it("leaves a corner sharper than the bend limit as the city leaves it", () => {
    const corner = roadLays(bend(80, { width: 5, major: true }));
    expect(jointLays(corner)).toHaveLength(0);
    for (const walk of sidewalkLays(corner)) expect(walk.start).toBeCloseTo(JUNCTION_INSET, 9);
  });
});

describe("village lanes", () => {
  const lane = { width: 3.6, kind: "lane" as const };

  it("have no pavements, no crossings and no centre line, but a verge each side", () => {
    const lanes = [
      road("a", [-40, 0, 0], [0, 0, 0], lane),
      road("b", [0, 0, 0], [30, 0, 20], lane),
      road("c", [0, 0, 0], [10, 0, -35], lane),
    ];
    const lays = roadLays(lanes);
    expect(sidewalkLays(lays)).toHaveLength(0);
    expect(crosswalkLays(lays, lanes)).toHaveLength(0);
    expect(laneDashLays(lays)).toHaveLength(0);
    expect(vergeLays(lays)).toHaveLength(lanes.length * 2);
  });

  it("get a disc wherever they meet, at any angle, and a turning head at a dead end", () => {
    const lanes = [road("a", [-40, 0, 0], [0, 0, 0], lane), road("b", [0, 0, 0], [30, 0, 20], lane)];
    const joints = jointLays(roadLays(lanes));
    const atNode = joints.find((j) => j.x === 0 && j.z === 0)!;
    expect(atNode).toMatchObject({ size: 3.6, shape: "disc", lane: true });
    const ends = joints.filter((j) => j !== atNode);
    expect(ends).toHaveLength(2);
    for (const end of ends) expect(end.size).toBeGreaterThan(3.6);
  });

  it("mitre their verges round a bend", () => {
    const lays = roadLays(bend(20, lane));
    const verges = vergeLays(lays);
    for (const side of [1, -1]) {
      const a = verges.find((v) => v.road === 0 && Math.sign(v.lateral) === side)!;
      const b = verges.find((v) => v.road === 1 && Math.sign(v.lateral) === side)!;
      const end = worldAt(lays[0], a.start + a.along, a.lateral);
      const start = worldAt(lays[1], b.start, b.lateral);
      expect(Math.hypot(end[0] - start[0], end[1] - start[1])).toBeLessThan(1e-6);
    }
  });

  it.each([90, 60, 35])(
    "joining the main street at %i degrees: no zebra, and the verge starts clear of the street",
    (degrees) => {
      const a = (degrees * Math.PI) / 180;
      const roads = [
        road("w", [-40, 0, 0], [0, 0, 0], { width: 5, major: true }),
        road("e", [0, 0, 0], [40, 0, 0], { width: 5, major: true }),
        road("lane", [0, 0, 0], [30 * Math.cos(a), 0, 30 * Math.sin(a)], lane),
      ];
      const lays = roadLays(roads);
      expect(crosswalkLays(lays, roads)).toHaveLength(0);
      // The street already covers the node the lane runs into.
      expect(jointLays(lays).filter((j) => j.x === 0 && j.z === 0)).toHaveLength(0);

      const band = 5 / 2 + SIDEWALK_WIDTH;
      for (const verge of vergeLays(lays).filter((v) => v.road === 2)) {
        const [, z] = worldAt(lays[2], verge.start + 0.01, verge.lateral);
        expect(Math.abs(z)).toBeGreaterThanOrEqual(band - 1e-6);
        expect(verge.start).toBeLessThan(15);
      }
    },
  );

  it("do not stop a verge for a lane that merely runs on past a branch", () => {
    // Straight on with a branch: the far arm's line extended backwards through
    // the node is not road the verge would lie on.
    const roads = [
      road("a", [-40, 0, 0], [0, 0, 0], lane),
      road("b", [0, 0, 0], [40, 0, 1], lane),
      road("c", [0, 0, 0], [0, 0, 30], lane),
    ];
    const lays = roadLays(roads);
    for (const verge of vergeLays(lays).filter((v) => v.road === 0)) {
      expect(lays[0].length - verge.start - verge.along).toBeLessThan(6);
    }
  });
});

describe("metropolis avenues", () => {
  const avenue = { width: 9.5, kind: "avenue" as const, major: true };
  const grid = [
    road("w", [-60, 0, 0], [0, 0, 0], avenue),
    road("e", [0, 0, 0], [60, 0, 0], avenue),
    road("n", [0, 0, -60], [0, 0, 0], { width: 5.5 }),
    road("s", [0, 0, 0], [0, 0, 60], { width: 5.5 }),
  ];
  const lays = roadLays(grid);

  it("keep their pavements and trade the centre line for a median", () => {
    expect(sidewalkLays(lays).filter((w) => w.road < 2)).toHaveLength(4);
    expect(laneDashLays(lays)).toHaveLength(0);
    const medians = medianLays(lays);
    expect(medians).toHaveLength(2);
    // The median stops short of the zebra band at the junction.
    const bands = crosswalkLays(lays, grid).filter((m) => m.road === 1);
    const band = Math.max(...bands.map((m) => m.s + m.along / 2));
    expect(medians.find((m) => m.road === 1)!.start).toBeGreaterThan(band);
  });

  it("stripe their zebra with more bars, at no coarser a pitch than a side street's", () => {
    const bands = crosswalkLays(lays, grid).filter((m) => m.road === 1);
    expect(bands).toHaveLength(6);
    const pitch = Math.abs(bands[1].lateral - bands[0].lateral);
    expect(pitch).toBeLessThan((5.5 * 0.78) / 3);
  });

  it("move a side street's zebra out of the junction box, clear of the avenue", () => {
    const side = crosswalkLays(lays, grid).filter((m) => m.road === 3 && m.s < 20);
    const band = side[0];
    // The band starts beyond the avenue's carriageway, not inside it.
    expect(band.s - band.along / 2).toBeGreaterThan(9.5 / 2);
    expect(band.s).toBeCloseTo(junctionClearance(9.5).crossing, 9);
    // And the pavement stops beyond the band, as a city's does.
    const walk = sidewalkLays(lays).find((w) => w.road === 3)!;
    expect(walk.start).toBeGreaterThan(band.s + band.along / 2);
  });

  it("keep their own zebras at a side street where the city would put them", () => {
    // The avenue running straight on past the junction does not cross it.
    const own = crosswalkLays(lays, grid).filter((m) => m.road === 1);
    expect(Math.min(...own.map((m) => m.s))).toBeCloseTo(2.3, 9);
    expect(junctionClearance(TUNED_WIDTH)).toEqual({ crossing: 2.3, pavement: JUNCTION_INSET });
  });

  it("clear an avenue's zebra of another avenue's carriageway", () => {
    const cross = [
      road("w", [-60, 0, 0], [0, 0, 0], avenue),
      road("e", [0, 0, 0], [60, 0, 0], avenue),
      road("n", [0, 0, -60], [0, 0, 0], avenue),
      road("s", [0, 0, 0], [0, 0, 60], avenue),
    ];
    const crossLays = roadLays(cross);
    for (const mark of crosswalkLays(crossLays, cross)) {
      const fromNode = Math.min(mark.s, crossLays[mark.road].length - mark.s);
      expect(fromNode - mark.along / 2).toBeGreaterThan(9.5 / 2);
    }
    // Each median's nose at the junction end stays behind the pavement's end.
    for (const median of medianLays(crossLays)) {
      const lay = crossLays[median.road];
      const atNode = lay.x === 0 && lay.z === 0 ? median.start : lay.length - median.start - median.along;
      expect(atNode).toBeGreaterThan(junctionClearance(9.5).pavement);
    }
  });

  it("plant trees down the median, evenly, on its centre line, never over the cap", () => {
    const medians = medianLays(lays);
    const trees = medianTreeSpots(medians, lays, 100);
    expect(trees.length).toBeGreaterThan(4);
    for (const tree of trees) {
      const median = medians.find((m) => m.road === tree.road)!;
      expect(tree.s).toBeGreaterThan(median.start);
      expect(tree.s).toBeLessThan(median.start + median.along);
      const [x, z] = worldAt(lays[tree.road], tree.s, 0);
      expect(Math.hypot(x - tree.x, z - tree.z)).toBeLessThan(1e-9);
    }
    const onOne = trees.filter((tree) => tree.road === 1).map((tree) => tree.s);
    const gaps = onOne.slice(1).map((s, i) => s - onOne[i]);
    for (const gap of gaps) expect(gap).toBeCloseTo(gaps[0], 9);
    expect(medianTreeSpots(medians, lays, 3).length).toBeLessThanOrEqual(3);
    expect(medianTreeSpots(medians, lays, 0)).toHaveLength(0);
    expect(MEDIAN_WIDTH).toBeLessThan(9.5 / 2);
  });
});

describe("the metropolis motorway ring", () => {
  const motorway = { width: 10, kind: "highway" as const, major: true };
  const ring = polyline(
    "ring",
    [
      [-150, -150],
      [150, -150],
      [150, 150],
      [-150, 150],
      [-150, -150],
    ],
    motorway,
  );
  const lays = roadLays(ring);

  it("has no pavements and no crossings, a verge each side, a square at each corner", () => {
    expect(sidewalkLays(lays)).toHaveLength(0);
    expect(crosswalkLays(lays, ring)).toHaveLength(0);
    expect(vergeLays(lays)).toHaveLength(8);
    const joints = jointLays(lays);
    expect(joints).toHaveLength(4);
    for (const joint of joints) expect(joint).toMatchObject({ shape: "square", size: 10 });
  });

  it("runs its barrier unbroken round the corners", () => {
    for (const barrier of barrierLays(lays)) {
      expect(barrier.start).toBeCloseTo(0, 9);
      expect(barrier.along).toBeCloseTo(300, 9);
    }
  });

  it("mitres its edge lines so they meet at every corner", () => {
    const lines = edgeLineLays(lays);
    expect(lines).toHaveLength(8);
    for (let i = 0; i < 4; i++) {
      const next = (i + 1) % 4;
      for (const side of [1, -1]) {
        const a = lines.find((l) => l.road === i && Math.sign(l.lateral) === side)!;
        const b = lines.find((l) => l.road === next && Math.sign(l.lateral) === side)!;
        const end = worldAt(lays[i], a.s + a.along / 2, a.lateral);
        const start = worldAt(lays[next], b.s - b.along / 2, b.lateral);
        expect(Math.hypot(end[0] - start[0], end[1] - start[1])).toBeLessThan(1e-6);
      }
    }
  });

  it("opens its barrier where an avenue comes in, and paints no zebra across it", () => {
    const withAvenue = [
      ...polyline(
        "ring",
        [
          [-150, -150],
          [0, -150],
          [150, -150],
        ],
        motorway,
      ),
      road("av", [0, 0, -150], [0, 0, 0], { width: 9.5, kind: "avenue", major: true }),
    ];
    const junction = roadLays(withAvenue);
    const west = barrierLays(junction).find((b) => b.road === 0)!;
    expect(150 - (west.start + west.along)).toBeGreaterThan(JUNCTION_INSET);
    expect(crosswalkLays(junction, withAvenue)).toHaveLength(0);
    // The avenue's pavements stop clear of the motorway's carriageway.
    for (const walk of sidewalkLays(junction).filter((w) => w.road === 2)) {
      expect(walk.start).toBeGreaterThanOrEqual(5);
    }
  });
});

describe("plaza surfaces", () => {
  it("default to the city's gravel", () => {
    expect(plazaSurface({} as CityModel)).toBe("paved");
    const green = { plaza: { rect: { x: 0, z: 0, w: 10, d: 10 }, surface: "green" } } as CityModel;
    expect(plazaSurface(green)).toBe("green");
  });

  it("cut the village green's corners, inside its rect", () => {
    const rect = { x: 4, z: -2, w: 20, d: 16 };
    const outline = chamferedOutline(rect);
    expect(outline).toHaveLength(8);
    for (const [x, z] of outline) {
      expect(Math.abs(x - rect.x)).toBeLessThanOrEqual(rect.w / 2 + 1e-9);
      expect(Math.abs(z - rect.z)).toBeLessThanOrEqual(rect.d / 2 + 1e-9);
      const onCorner =
        Math.abs(Math.abs(x - rect.x) - rect.w / 2) < 1e-9 && Math.abs(Math.abs(z - rect.z) - rect.d / 2) < 1e-9;
      expect(onCorner).toBe(false);
    }
    // Most of the rect, less the four small triangles.
    let area = 0;
    outline.forEach(([x0, z0], i) => {
      const [x1, z1] = outline[(i + 1) % outline.length];
      area += x0 * z1 - x1 * z0;
    });
    expect(Math.abs(area) / 2).toBeLessThan(rect.w * rect.d);
    expect(Math.abs(area) / 2).toBeGreaterThan(rect.w * rect.d * 0.9);
  });
});
