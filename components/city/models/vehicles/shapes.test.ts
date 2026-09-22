import { describe, expect, it } from "vitest";
import {
  BODY_SPECS,
  CAR_COLORS,
  MAX_BODY_WIDTH,
  TAXI_COLOR,
  VEHICLE_BODIES,
  bodyGeometry,
  fleetLooks,
  lightsGeometry,
  paintFor,
  parkedGeometry,
  wheelGeometry,
} from "./shapes";
import { triangleCount } from "../props/geometry";
import { prngFor } from "@/lib/city/seed";

describe("body specs", () => {
  it("fits every body inside a minor road's carriageway", () => {
    // `traffic.test.ts` asserts that a car's lane offset plus 0.6 fits inside
    // half a carriageway. That 0.6 is half of the widest body drawn here, so
    // no vehicle may grow past 1.2 units wide.
    for (const kind of VEHICLE_BODIES) {
      expect(BODY_SPECS[kind].width).toBeLessThanOrEqual(MAX_BODY_WIDTH);
    }
  });

  it("puts four wheels on the ground under every body", () => {
    for (const kind of VEHICLE_BODIES) {
      const spec = BODY_SPECS[kind];
      expect(spec.wheels).toHaveLength(4);
      for (const [x, z] of spec.wheels) {
        expect(Math.abs(x)).toBeLessThanOrEqual(spec.width / 2);
        expect(Math.abs(z)).toBeLessThan(spec.length / 2);
      }
    }
  });

  it("puts the headlights at the front and the tail lamps at the back", () => {
    for (const kind of VEHICLE_BODIES) {
      const spec = BODY_SPECS[kind];
      for (const [, , z] of spec.headlights) expect(z).toBeGreaterThan(0);
      for (const [, , z] of spec.taillights) expect(z).toBeLessThan(0);
    }
  });
});

describe("merged geometry", () => {
  it("builds one coloured geometry per body and caches it", () => {
    for (const kind of VEHICLE_BODIES) {
      const geometry = bodyGeometry(kind);
      expect(geometry.getAttribute("color")).toBeDefined();
      expect(geometry.getAttribute("position").count).toBeGreaterThan(0);
      expect(bodyGeometry(kind)).toBe(geometry);
    }
  });

  it("stays inside the triangle budget for a forty car fleet", () => {
    // Section 37 allows 30 to 40 moving cars. Bodies, lamps and four wheels
    // each have to stay small enough that the whole fleet is a rounding error
    // against three hundred buildings.
    const heaviest = Math.max(
      ...VEHICLE_BODIES.map(
        (kind) =>
          triangleCount(bodyGeometry(kind)) +
          triangleCount(lightsGeometry(kind)) +
          4 * triangleCount(wheelGeometry()),
      ),
    );
    expect(heaviest).toBeLessThan(520);
    expect(heaviest * 40).toBeLessThan(21000);
    for (const kind of VEHICLE_BODIES) {
      expect(triangleCount(bodyGeometry(kind))).toBeLessThan(240);
    }
  });

  it("keeps arches and bumpers inside the widest body", () => {
    // The arches and bumpers stand proud of the paintwork so they read from
    // the side; they still may not push a car out of its lane.
    for (const kind of VEHICLE_BODIES) {
      const geometry = bodyGeometry(kind);
      geometry.computeBoundingBox();
      const box = geometry.boundingBox!;
      expect(box.max.x - box.min.x).toBeLessThanOrEqual(MAX_BODY_WIDTH);
      expect(box.min.y).toBeGreaterThan(0);
      // Nothing hangs more than a bumper's depth past the spec's length.
      expect(box.max.z).toBeLessThan(BODY_SPECS[kind].length / 2 + 0.05);
      expect(box.min.z).toBeGreaterThan(-BODY_SPECS[kind].length / 2 - 0.05);
    }
  });

  it("gives every body a distinct silhouette", () => {
    const heights = VEHICLE_BODIES.filter((kind) => kind !== "taxi").map((kind) => {
      const geometry = bodyGeometry(kind);
      geometry.computeBoundingBox();
      const box = geometry.boundingBox!;
      return `${box.max.y.toFixed(2)}x${(box.max.z - box.min.z).toFixed(2)}`;
    });
    expect(new Set(heights).size).toBe(heights.length);
  });

  it("puts the taxi's sign and the bus's board in the lamps, not the paint", () => {
    expect(triangleCount(lightsGeometry("taxi"))).toBeGreaterThan(
      triangleCount(lightsGeometry("sedan")),
    );
    expect(triangleCount(lightsGeometry("bus"))).toBeGreaterThan(
      triangleCount(lightsGeometry("van")),
    );
  });

  it("bakes the wheels into a parked vehicle", () => {
    const parked = triangleCount(parkedGeometry("sedan"));
    expect(parked).toBeGreaterThan(triangleCount(bodyGeometry("sedan")));
    expect(parkedGeometry("sedan")).toBe(parkedGeometry("sedan"));
  });
});

describe("fleetLooks", () => {
  it("is deterministic for a seed and differs across seeds", () => {
    const a = fleetLooks(40, prngFor("owner/repo@aaa", "fleet"));
    const b = fleetLooks(40, prngFor("owner/repo@aaa", "fleet"));
    const c = fleetLooks(40, prngFor("owner/repo@bbb", "fleet"));
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it("keeps buses and vans rare and paints from the car palette", () => {
    const looks = fleetLooks(600, prngFor("s", "fleet"));
    const share = (body: string) =>
      looks.filter((look) => look.body === body).length / looks.length;
    expect(share("bus")).toBeLessThan(0.16);
    expect(share("van")).toBeLessThan(0.2);
    expect(share("hatchback") + share("sedan")).toBeGreaterThan(0.5);
    for (const look of looks) {
      expect(look.colorIndex).toBeGreaterThanOrEqual(0);
      expect(look.colorIndex).toBeLessThan(CAR_COLORS.length);
    }
  });

  it("paints taxis yellow, buses in a livery and the rest mostly neutral", () => {
    const prng = prngFor("s", "paint");
    for (let i = 0; i < 20; i++) expect(paintFor("taxi", prng)).toBe(TAXI_COLOR);
    const liveries = new Set(Array.from({ length: 60 }, () => paintFor("bus", prng)));
    expect(liveries.size).toBeLessThanOrEqual(3);
    const sedans = Array.from({ length: 400 }, () => paintFor("sedan", prng));
    expect(sedans).not.toContain(TAXI_COLOR);
    const neutral = sedans.filter((index) => index < 4).length / sedans.length;
    expect(neutral).toBeGreaterThan(0.35);
    expect(neutral).toBeLessThan(0.65);
    expect(new Set(sedans).size).toBeGreaterThan(8);
  });

  it("gives a city with a handful of cars a mix of shapes", () => {
    const bodies = new Set(fleetLooks(20, prngFor("s", "fleet")).map((look) => look.body));
    expect(bodies.size).toBeGreaterThan(1);
  });
});
