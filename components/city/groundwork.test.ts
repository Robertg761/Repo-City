import { describe, expect, it } from "vitest";
import type { CityModel, District, Landmark, RoadSegment, Vec3 } from "@/types/city";
import {
  JUNCTION_INSET,
  SIDEWALK_WIDTH,
  crosswalkLays,
  laneDashLays,
  plazaRect,
  roadLays,
  sidewalkLays,
} from "./groundwork";

const road = (
  id: string,
  from: Vec3,
  to: Vec3,
  { major = false, width }: { major?: boolean; width?: number } = {},
): RoadSegment => ({ id, from, to, width: width ?? (major ? 7 : 4.5), major, appearAt: 0 });

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
