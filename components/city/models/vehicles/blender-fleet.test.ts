/**
 * The fleet modelled in Blender (`blender/fleet/fleet.py`, spike). The app
 * only draws it by default, so every test here calls the Blender
 * builders directly: the same budgets and contracts `shapes.test.ts` holds the
 * procedural fleet to, plus the points other code leans on (the lamps drawn as
 * their own instances, the roof a police light bar stands on).
 */
import { describe, expect, it } from "vitest";
import { DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3, type BufferGeometry } from "three";
import { PAINT_ATTRIBUTE, mergeParts, triangleCount } from "../props/geometry";
import { coplanarOverlaps } from "../coplanar";
import {
  BODY_SPECS,
  MAX_BODY_WIDTH,
  PANEL_SHADE,
  ROOF_SHADE,
  TRACTOR_SPEC,
  VEHICLE_BODIES,
  blenderBodyParts,
  blenderTractorParts,
  lightsGeometry,
  tractorLightsGeometry,
  wheelGeometry,
  type VehicleBody,
} from "./shapes";

const PAINT = "#f0f0f0";
const body = (kind: VehicleBody) => mergeParts(blenderBodyParts(kind));

const caster = new Raycaster();
const material = new MeshBasicMaterial({ side: DoubleSide });

/** The first surface a ray from `from` along `dir` meets, or null. */
function hit(geometry: BufferGeometry, from: [number, number, number], dir: [number, number, number]): Vector3 | null {
  caster.set(new Vector3(...from), new Vector3(...dir).normalize());
  const hits = caster.intersectObject(new Mesh(geometry, material));
  return hits.length ? hits[0].point : null;
}

describe("the Blender fleet", () => {
  it("stays inside the fleet's triangle budget", () => {
    for (const kind of VEHICLE_BODIES) {
      const tris = triangleCount(body(kind));
      expect(tris).toBeLessThan(240);
      const car = tris + triangleCount(lightsGeometry(kind)) + 4 * triangleCount(wheelGeometry());
      expect(car).toBeLessThan(520);
      expect(car * 40).toBeLessThan(21000);
    }
  });

  it("keeps every body in its lane and on its spec's footprint", () => {
    for (const kind of VEHICLE_BODIES) {
      const geometry = body(kind);
      geometry.computeBoundingBox();
      const box = geometry.boundingBox!;
      const spec = BODY_SPECS[kind];
      expect(box.max.x - box.min.x).toBeLessThanOrEqual(MAX_BODY_WIDTH);
      expect(box.min.y).toBeGreaterThan(0);
      expect(box.max.z).toBeLessThan(spec.length / 2 + 0.05);
      expect(box.min.z).toBeGreaterThan(-spec.length / 2 - 0.05);
      // Long enough to be the spec's car, not a shrunken one.
      expect(box.max.z - box.min.z).toBeGreaterThan(spec.length - 0.02);
    }
  });

  it("gives every body a distinct silhouette", () => {
    const shapes = VEHICLE_BODIES.filter((kind) => kind !== "taxi").map((kind) => {
      const geometry = body(kind);
      geometry.computeBoundingBox();
      const box = geometry.boundingBox!;
      return `${box.max.y.toFixed(2)}x${(box.max.z - box.min.z).toFixed(2)}`;
    });
    expect(new Set(shapes).size).toBe(shapes.length);
  });

  it("flags the paintwork in the three shades a livery repaints", () => {
    for (const kind of VEHICLE_BODIES) {
      const parts = blenderBodyParts(kind);
      const painted = parts.filter((part) => part.paint);
      expect(painted.length).toBeGreaterThan(0);
      for (const part of painted) expect([PAINT, ROOF_SHADE, PANEL_SHADE]).toContain(part.color);
      // Glass, trim and arches keep their own colours.
      expect(parts.some((part) => !part.paint)).toBe(true);
      const mask = body(kind).getAttribute(PAINT_ATTRIBUTE);
      let share = 0;
      for (let i = 0; i < mask.count; i++) share += mask.getX(i);
      expect(share / mask.count).toBeGreaterThan(0.2);
      expect(share / mask.count).toBeLessThan(0.9);
    }
  });

  it("puts a face behind every lamp, where the street draws it", () => {
    // `lightsGeometry` draws each lamp as a box 5 cm deep centred on the
    // spec's point. The body's face must pass through that box at all four
    // corners of the lamp, or the lamp floats off the car or sinks into it.
    for (const kind of VEHICLE_BODIES) {
      const spec = BODY_SPECS[kind];
      const geometry = body(kind);
      const [lw, lh] = spec.lamp;
      for (const [lamps, dir] of [[spec.headlights, -1], [spec.taillights, 1]] as const) {
        for (const [x, y, z] of lamps) {
          for (const [dx, dy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
            const p = hit(geometry, [x + (dx * lw) / 2.2, y + (dy * lh) / 2.2, -dir * 5], [0, 0, dir]);
            expect(p, `${kind} lamp at ${x},${y}`).not.toBeNull();
            expect(Math.abs(p!.z - z), `${kind} lamp at ${x},${y}`).toBeLessThan(0.025);
          }
        }
      }
    }
  });

  it("leaves the tyres showing proud of the flanks", () => {
    for (const kind of VEHICLE_BODIES) {
      const spec = BODY_SPECS[kind];
      const geometry = body(kind);
      for (const [x, z] of spec.wheels) {
        const outer = Math.abs(x) + 0.45 * spec.wheelRadius;
        const side = Math.sign(x);
        // At the hub's height the ray meets the arch, which must stand inside
        // the tyre's outer face.
        const p = hit(geometry, [side * 3, spec.wheelRadius, z], [-side, 0, 0]);
        expect(p, `${kind} wheel ${x},${z}`).not.toBeNull();
        expect(Math.abs(p!.x), `${kind} wheel ${x},${z}`).toBeLessThan(outer);
      }
    }
  });

  it("keeps the roofs the services and the taxi stand things on", () => {
    const top = (kind: VehicleBody, z: number) => hit(body(kind), [0, 5, z], [0, -1, 0])!.y;
    // The police light bar is centred 1.1 up, 8 cm deep (`emergency.ts`).
    expect(top("sedan", -0.23)).toBeGreaterThan(1.04);
    expect(top("sedan", -0.23)).toBeLessThan(1.07);
    // The taxi's lit sign stands on its base, from 1.115 (`lightsGeometry`).
    expect(top("taxi", -0.23)).toBeCloseTo(1.115, 2);
    // The ambulance's beacon is centred 1.57 up, 10 cm deep.
    expect(top("van", 0.2)).toBeGreaterThan(1.5);
    expect(top("van", 0.2)).toBeLessThan(1.53);
    // The bus's destination board is on the nose below the roof line.
    const board = hit(body("bus"), [0, 1.73, 5], [0, 0, -1])!;
    expect(Math.abs(board.z - (BODY_SPECS.bus.length / 2 + 0.01))).toBeLessThan(0.025);
  });
});

describe("the Blender tractor", () => {
  const tractor = () => mergeParts(blenderTractorParts());

  it("stays inside the tractor's budget and its lane", () => {
    const geometry = tractor();
    expect(triangleCount(geometry)).toBeLessThan(400);
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    expect(box.max.x - box.min.x).toBeLessThanOrEqual(MAX_BODY_WIDTH + 1e-6);
    expect(box.max.z - box.min.z).toBeLessThanOrEqual(TRACTOR_SPEC.length + 0.02);
    expect(box.min.y).toBeGreaterThanOrEqual(-1e-6);
    expect(triangleCount(tractorLightsGeometry())).toBeLessThan(80);
  });

  it("paints only the bodywork", () => {
    const mask = tractor().getAttribute(PAINT_ATTRIBUTE);
    let painted = 0;
    for (let i = 0; i < mask.count; i++) painted += mask.getX(i);
    expect(painted).toBeGreaterThan(0);
    expect(painted).toBeLessThan(mask.count);
  });

  it("puts a face behind the lamps and a roof under the beacon", () => {
    const geometry = tractor();
    const [lw, lh] = TRACTOR_SPEC.lamp;
    for (const [lamps, dir] of [[TRACTOR_SPEC.headlights, -1], [TRACTOR_SPEC.taillights, 1]] as const) {
      for (const [x, y, z] of lamps) {
        for (const [dx, dy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
          const p = hit(geometry, [x + (dx * lw) / 2.2, y + (dy * lh) / 2.2, -dir * 5], [0, 0, dir]);
          expect(p, `lamp at ${x},${y}`).not.toBeNull();
          expect(Math.abs(p!.z - z), `lamp at ${x},${y}`).toBeLessThan(0.025);
        }
      }
    }
    // The beacon (`tractorLightsGeometry`) is 10 cm tall, centred 1.92 up.
    const roof = hit(geometry, [0.3, 5, -0.45], [0, -1, 0])!;
    expect(roof.y).toBeGreaterThan(1.85);
    expect(roof.y).toBeLessThan(1.88);
  });

  it("clears the big rear wheels and the front ones", () => {
    const geometry = tractor();
    TRACTOR_SPEC.wheels.forEach(([x, z], i) => {
      const r = TRACTOR_SPEC.wheelRadii[i];
      const side = Math.sign(x);
      const p = hit(geometry, [side * 3, r, z], [-side, 0, 0]);
      // Nothing of the body stands outside the tyre at the hub's height.
      if (p) expect(Math.abs(p.x)).toBeLessThan(Math.abs(x) + TRACTOR_SPEC.wheelWidths[i] / 2);
    });
  });
});

describe("the Blender fleet against the z-fight checker", () => {
  /** `zfight.test.ts`: a prop is small and close, and this gap is enough for it. */
  const PROP_GAP = 0.0036;

  function fights(geometry: BufferGeometry): string[] {
    const positions = Array.from(geometry.getAttribute("position").array as Float32Array);
    const color = geometry.getAttribute("color").array as Float32Array;
    const indices = Array.from({ length: positions.length / 3 }, (_, i) => i);
    const keys = indices.filter((i) => i % 3 === 0).map((v) => [0, 1, 2].map((k) => color[v * 3 + k].toFixed(3)).join("/"));
    return coplanarOverlaps(positions, indices, { within: PROP_GAP, minOverlap: 1e-5, buriedWithin: 0.05 })
      .filter((p) => keys[p.a] !== keys[p.b] && p.normal[1] > -0.99)
      .map((p) => `${p.separation.toFixed(4)} apart at ${p.at.map((x) => x.toFixed(2)).join(",")}`);
  }

  for (const kind of VEHICLE_BODIES) {
    it(`leaves no coplanar faces fighting on the ${kind}`, () => expect(fights(body(kind))).toEqual([]));
  }
  it("leaves no coplanar faces fighting on the tractor", () => expect(fights(mergeParts(blenderTractorParts()))).toEqual([]));
});
