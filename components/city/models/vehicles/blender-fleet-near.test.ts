/**
 * The fleet's near level (`blender/fleet/near.py`): a richer body, wheel and
 * lamps for the cars closest to the camera. The app only draws them by
 * default, so every test calls the Blender builders directly. Near models must
 * be the lean ones with more detail, not different ones: the same footprint,
 * wheel and lamp points and paint roles, inside the vehicle budget.
 */
import { describe, expect, it } from "vitest";
import { Box3, DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3, type BufferGeometry } from "three";
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
  blenderLightsGeometry,
  blenderTractorLightsGeometry,
  blenderTractorParts,
  blenderWheelGeometry,
  type VehicleBody,
} from "./shapes";
import {
  blenderNearBody,
  blenderNearLights,
  blenderNearParked,
  blenderNearTractor,
  blenderNearTractorLights,
  blenderNearWheel,
} from "./near";

const PAINT = "#f0f0f0";
const caster = new Raycaster();
const material = new MeshBasicMaterial({ side: DoubleSide });

/** The first surface a ray from `from` along `dir` meets, or null. */
function hit(geometry: BufferGeometry, from: [number, number, number], dir: [number, number, number]): Vector3 | null {
  caster.set(new Vector3(...from), new Vector3(...dir).normalize());
  const hits = caster.intersectObject(new Mesh(geometry, material));
  return hits.length ? hits[0].point : null;
}

const boxOf = (geometry: BufferGeometry) => new Box3().setFromBufferAttribute(geometry.getAttribute("position") as never);
const lean = (kind: VehicleBody) => mergeParts(blenderBodyParts(kind));
const near = (kind: VehicleBody) => blenderNearBody(kind);

describe("the near fleet", () => {
  it("fills the vehicle budget without passing it", () => {
    const wheels = 4 * triangleCount(blenderNearWheel());
    for (const kind of VEHICLE_BODIES) {
      const car = triangleCount(near(kind)) + triangleCount(blenderNearLights(kind)) + wheels;
      expect(car, kind).toBeLessThanOrEqual(8000);
      expect(car, kind).toBeGreaterThan(5000);
    }
    const tractor = triangleCount(blenderNearTractor()) + triangleCount(blenderNearTractorLights()) + wheels;
    expect(tractor).toBeLessThanOrEqual(8000);
    expect(tractor).toBeGreaterThan(5000);
  });

  it("stands on the lean body's footprint, refined and not moved", () => {
    for (const kind of VEHICLE_BODIES) {
      const a = boxOf(lean(kind));
      const b = boxOf(near(kind));
      const spec = BODY_SPECS[kind];
      expect(b.max.x - b.min.x, kind).toBeLessThanOrEqual(MAX_BODY_WIDTH);
      // Rounded corners take a few centimetres off the extremes and nothing
      // is added beyond a fitting's depth.
      expect(b.max.x, kind).toBeGreaterThan(a.max.x - 0.05);
      expect(b.max.x, kind).toBeLessThan(a.max.x + 0.02);
      expect(b.min.x, kind).toBeLessThan(a.min.x + 0.05);
      expect(b.min.x, kind).toBeGreaterThan(a.min.x - 0.02);
      expect(b.max.y, kind).toBeGreaterThan(a.max.y - 0.03);
      expect(b.max.y, kind).toBeLessThan(a.max.y + 0.09);
      expect(b.min.y, kind).toBeGreaterThan(0);
      expect(b.max.z, kind).toBeGreaterThan(a.max.z - 0.05);
      expect(b.max.z, kind).toBeLessThan(a.max.z + 0.03);
      expect(b.min.z, kind).toBeLessThan(a.min.z + 0.05);
      expect(b.min.z, kind).toBeGreaterThan(a.min.z - 0.05);
      expect(b.max.z - b.min.z, kind).toBeGreaterThan(spec.length - 0.1);
    }
  });

  it("flags the paintwork in the three shades a livery repaints", () => {
    for (const kind of VEHICLE_BODIES) {
      const mask = near(kind).getAttribute(PAINT_ATTRIBUTE);
      let share = 0;
      for (let i = 0; i < mask.count; i++) share += mask.getX(i);
      expect(share / mask.count, kind).toBeGreaterThan(0.2);
      expect(share / mask.count, kind).toBeLessThan(0.9);
    }
    // The same roles as the lean body: nothing is painted that was not, and
    // no new role the renderer could not colour.
    const colours = (kind: VehicleBody) => new Set(blenderBodyParts(kind).filter((p) => p.paint).map((p) => p.color));
    for (const kind of VEHICLE_BODIES) {
      for (const colour of colours(kind)) expect([PAINT, ROOF_SHADE, PANEL_SHADE]).toContain(colour);
    }
  });

  it("puts a face behind every lamp, where the street draws it", () => {
    for (const kind of VEHICLE_BODIES) {
      const spec = BODY_SPECS[kind];
      const geometry = near(kind);
      const [lw, lh] = spec.lamp;
      for (const [lamps, dir] of [[spec.headlights, -1], [spec.taillights, 1]] as const) {
        for (const [x, y, z] of lamps) {
          for (const [dx, dy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
            const p = hit(geometry, [x + (dx * lw) / 2.2, y + (dy * lh) / 2.2, -dir * 5], [0, 0, dir]);
            expect(p, `${kind} lamp at ${x},${y}`).not.toBeNull();
            expect(Math.abs(p!.z - z), `${kind} lamp at ${x},${y}`).toBeLessThan(0.03);
          }
        }
      }
    }
  });

  it("leaves the tyres showing proud of the flanks", () => {
    for (const kind of VEHICLE_BODIES) {
      const spec = BODY_SPECS[kind];
      const geometry = near(kind);
      for (const [x, z] of spec.wheels) {
        const side = Math.sign(x);
        const p = hit(geometry, [side * 3, spec.wheelRadius, z], [-side, 0, 0]);
        expect(p, `${kind} wheel ${x},${z}`).not.toBeNull();
        expect(Math.abs(p!.x), `${kind} wheel ${x},${z}`).toBeLessThan(Math.abs(x) + 0.45 * spec.wheelRadius);
      }
    }
  });

  it("keeps the roofs the services and the taxi stand things on", () => {
    const top = (kind: VehicleBody, z: number) => hit(near(kind), [0, 5, z], [0, -1, 0])!.y;
    expect(top("sedan", -0.23)).toBeGreaterThan(1.03);
    expect(top("sedan", -0.23)).toBeLessThan(1.075);
    expect(top("taxi", -0.23)).toBeCloseTo(1.115, 2);
    expect(top("van", 0.2)).toBeGreaterThan(1.5);
    expect(top("van", 0.2)).toBeLessThan(1.53);
    const board = hit(near("bus"), [0, 1.73, 5], [0, 0, -1])!;
    expect(Math.abs(board.z - (BODY_SPECS.bus.length / 2 + 0.01))).toBeLessThan(0.03);
  });

  it("is built once", () => {
    expect(near("sedan")).toBe(near("sedan"));
    expect(blenderNearWheel()).toBe(blenderNearWheel());
    expect(blenderNearParked("van")).toBe(blenderNearParked("van"));
  });
});

describe("the near wheel", () => {
  it("is the lean wheel's size and pivot: radius 1, axle along x, centred", () => {
    const wheel = blenderNearWheel();
    const box = boxOf(wheel);
    const leanBox = boxOf(blenderWheelGeometry());
    expect(box.max.y).toBeGreaterThan(0.97);
    expect(box.max.y).toBeLessThanOrEqual(1.001);
    expect(box.min.y).toBeLessThan(-0.97);
    expect(box.max.z).toBeGreaterThan(0.97);
    expect(box.max.z).toBeLessThanOrEqual(1.001);
    expect(box.max.x).toBeLessThanOrEqual(leanBox.max.x + 0.01);
    expect(box.min.x).toBeGreaterThanOrEqual(leanBox.min.x - 0.01);
    expect(box.max.x + box.min.x).toBeCloseTo(0, 3);
    expect(box.max.y + box.min.y).toBeCloseTo(0, 1);
    // Nothing farther from the axle than the lean tread.
    const position = wheel.getAttribute("position");
    let far = 0;
    for (let i = 0; i < position.count; i++) far = Math.max(far, Math.hypot(position.getY(i), position.getZ(i)));
    expect(far).toBeLessThanOrEqual(1.001);
  });

  it("stays within the wheel budget and keeps a pale rim against a dark tyre", () => {
    expect(triangleCount(blenderNearWheel())).toBeLessThanOrEqual(900);
    const colour = blenderNearWheel().getAttribute("color");
    let lo = 1;
    let hi = 0;
    for (let i = 0; i < colour.count; i++) {
      lo = Math.min(lo, colour.getX(i));
      hi = Math.max(hi, colour.getX(i));
    }
    expect(hi - lo).toBeGreaterThan(0.1);
  });
});

describe("the near lamps", () => {
  it("sit where the lean lamps do", () => {
    for (const kind of VEHICLE_BODIES) {
      const a = boxOf(blenderLightsGeometry(kind));
      const b = boxOf(blenderNearLights(kind));
      for (const axis of ["x", "y", "z"] as const) {
        expect(Math.abs(a.min[axis] - b.min[axis]), `${kind} ${axis}`).toBeLessThan(0.01);
        expect(Math.abs(a.max[axis] - b.max[axis]), `${kind} ${axis}`).toBeLessThan(0.01);
      }
      expect(triangleCount(blenderNearLights(kind)), kind).toBeLessThanOrEqual(300);
    }
    const a = boxOf(blenderTractorLightsGeometry());
    const b = boxOf(blenderNearTractorLights());
    for (const axis of ["x", "y", "z"] as const) {
      expect(Math.abs(a.min[axis] - b.min[axis])).toBeLessThan(0.01);
      expect(Math.abs(a.max[axis] - b.max[axis])).toBeLessThan(0.01);
    }
  });
});

describe("the near tractor", () => {
  const lean = () => mergeParts(blenderTractorParts());

  it("stays in its lane and on the lean tractor's footprint", () => {
    const a = boxOf(lean());
    const b = boxOf(blenderNearTractor());
    expect(b.max.x - b.min.x).toBeLessThanOrEqual(MAX_BODY_WIDTH + 1e-6);
    expect(b.max.z - b.min.z).toBeLessThanOrEqual(TRACTOR_SPEC.length + 0.02);
    expect(b.min.y).toBeGreaterThanOrEqual(-1e-6);
    expect(b.max.y).toBeGreaterThan(a.max.y - 0.05);
    expect(b.max.y).toBeLessThan(a.max.y + 0.1);
    expect(b.max.x).toBeLessThan(a.max.x + 0.02);
    expect(b.max.z).toBeLessThan(a.max.z + 0.03);
    expect(b.min.z).toBeGreaterThan(a.min.z - 0.05);
  });

  it("paints only the bodywork", () => {
    const mask = blenderNearTractor().getAttribute(PAINT_ATTRIBUTE);
    let painted = 0;
    for (let i = 0; i < mask.count; i++) painted += mask.getX(i);
    expect(painted).toBeGreaterThan(0);
    expect(painted).toBeLessThan(mask.count);
  });

  it("puts a face behind the lamps and a roof under the beacon", () => {
    const geometry = blenderNearTractor();
    const [lw, lh] = TRACTOR_SPEC.lamp;
    for (const [lamps, dir] of [[TRACTOR_SPEC.headlights, -1], [TRACTOR_SPEC.taillights, 1]] as const) {
      for (const [x, y, z] of lamps) {
        for (const [dx, dy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
          const p = hit(geometry, [x + (dx * lw) / 2.2, y + (dy * lh) / 2.2, -dir * 5], [0, 0, dir]);
          expect(p, `lamp at ${x},${y}`).not.toBeNull();
          expect(Math.abs(p!.z - z), `lamp at ${x},${y}`).toBeLessThan(0.03);
        }
      }
    }
    const roof = hit(geometry, [0.3, 5, -0.45], [0, -1, 0])!;
    expect(roof.y).toBeGreaterThan(1.85);
    expect(roof.y).toBeLessThan(1.89);
  });
});

describe("the near parked vehicles", () => {
  it("keep their lane, stand on the road and carry their wheels", () => {
    for (const kind of VEHICLE_BODIES) {
      const box = boxOf(blenderNearParked(kind));
      // The tyres are as wide as the lean parked car's: 0.11 either side of each wheel.
      const wheelX = Math.max(...BODY_SPECS[kind].wheels.map(([x]) => Math.abs(x)));
      expect(box.max.x - box.min.x, kind).toBeLessThanOrEqual(2 * (wheelX + 0.11) + 0.02);
      expect(box.min.y, kind).toBeGreaterThanOrEqual(-1e-3);
      expect(box.max.z - box.min.z, kind).toBeLessThanOrEqual(BODY_SPECS[kind].length + 0.12);
      // Wheels baked in: the tyre reaches the ground at every wheel point.
      const p = hit(blenderNearParked(kind), [BODY_SPECS[kind].wheels[0][0], 3, BODY_SPECS[kind].wheels[0][1]], [0, -1, 0]);
      expect(p, kind).not.toBeNull();
    }
  });
});

describe("the near fleet against the z-fight checker", () => {
  /**
   * The importer quantises positions to 16 bits, which leaves the plane of a
   * small relief's triangle good to about a millimetre, so only faces sharing
   * a plane to within 0.8 mm can be told apart from noise. Near cars are drawn
   * within about 30 units of the camera, where the depth buffer resolves a
   * tenth of a millimetre, so anything more than that apart never fights.
   */
  const PROP_GAP = 0.0008;

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
    it(`leaves no coplanar faces fighting on the ${kind}`, () => expect(fights(near(kind))).toEqual([]));
  }
  it("leaves no coplanar faces fighting on the tractor", () => expect(fights(blenderNearTractor())).toEqual([]));
  it("leaves none on the wheel", () => expect(fights(blenderNearWheel())).toEqual([]));
});
