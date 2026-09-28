/**
 * The fleet's wheel and lamps and the queue's signboard, modelled in Blender
 * (`blender/vehicles2/`). The app draws them by default, so the tests call the
 * Blender builders directly, hold them to the budgets and contracts of the
 * procedural parts they replace, and prove the switch with the flag mocked on.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Box3, Color, DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3, type BufferGeometry } from "three";
import { SURFACE, SURFACE_ATTRIBUTE } from "../../textures/surface-types";
import { PAINT_ATTRIBUTE, mergeParts, triangleCount } from "../props/geometry";
import { BOARD, POST_X, faceGeometry, frameGeometry } from "../../Overflow";
import { importedParts } from "../imported";
import { MODEL as SIGN } from "./overflowSign.model";
import { blenderSignAnchors, blenderSignFaces, blenderSignFrame } from "./overflowSign";
import {
  BODY_SPECS,
  HEADLIGHT,
  TAILLIGHT,
  MAX_BODY_WIDTH,
  TRACTOR_SPEC,
  TRUCK_BODIES,
  VEHICLE_BODIES,
  blenderBodyParts,
  blenderLightsGeometry,
  blenderTractorParts,
  blenderTractorLightsGeometry,
  blenderWheelGeometry,
  lightsGeometry,
  parkedGeometry,
  tractorLightsGeometry,
  tractorParkedGeometry,
  truckParts,
  wheelGeometry,
  type VehicleBody,
} from "./shapes";

const body = (kind: VehicleBody) => mergeParts(blenderBodyParts(kind));
const caster = new Raycaster();
const material = new MeshBasicMaterial({ side: DoubleSide });

function hit(geometry: BufferGeometry, from: [number, number, number], dir: [number, number, number]): Vector3 | null {
  caster.set(new Vector3(...from), new Vector3(...dir).normalize());
  const hits = caster.intersectObject(new Mesh(geometry, material));
  return hits.length ? hits[0].point : null;
}

const boxOf = (geometry: BufferGeometry) => new Box3().setFromBufferAttribute(geometry.getAttribute("position") as never);
const attributes = (geometry: BufferGeometry) => Object.keys(geometry.attributes).sort();

/** Each triangle's corners (with the first corner's vertex colour), in the geometry's own frame. */
function triangles(geometry: BufferGeometry): (Vector3[] & { shade?: number })[] {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  const position = g.getAttribute("position");
  const colour = g.getAttribute("color");
  const out: (Vector3[] & { shade?: number })[] = [];
  for (let i = 0; i < position.count; i += 3) {
    const tri: Vector3[] & { shade?: number } = [0, 1, 2].map((k) => new Vector3().fromBufferAttribute(position, i + k));
    tri.shade = colour.getX(i);
    out.push(tri);
  }
  return out;
}

const centroid = (tri: Vector3[]) => tri[0].clone().add(tri[1]).add(tri[2]).divideScalar(3);
const boxAround = (tris: Vector3[][]) => {
  const box = new Box3();
  for (const tri of tris) for (const p of tri) box.expandByPoint(p);
  return box;
};

describe("the Blender wheel", () => {
  const wheel = blenderWheelGeometry();

  it("stays inside the procedural wheel's triangle count and the car's budget", () => {
    expect(triangleCount(wheel)).toBeLessThanOrEqual(triangleCount(wheelGeometry()));
    for (const kind of VEHICLE_BODIES) {
      const car = triangleCount(body(kind)) + triangleCount(blenderLightsGeometry(kind)) + 4 * triangleCount(wheel);
      expect(car, kind).toBeLessThan(520);
      expect(car * 40).toBeLessThan(21000);
    }
  });

  it("is a wheel of radius 1 on an axle along x, centred on its origin", () => {
    const box = boxOf(wheel);
    expect(box.max.y).toBeCloseTo(1, 3);
    expect(box.min.y).toBeGreaterThan(-1.001);
    expect(box.min.y).toBeLessThan(-0.9);
    expect(box.max.z).toBeGreaterThan(0.9);
    expect(box.max.z).toBeLessThanOrEqual(1.001);
    expect(box.min.z).toBeLessThan(-0.9);
    expect(box.max.x + box.min.x).toBeCloseTo(0, 4);
    // The hub stands proud of the tread, but no further out than the
    // procedural hub (0.514), so a wheel keeps its lane margin.
    expect(box.max.x).toBeGreaterThan(0.45);
    expect(box.max.x).toBeLessThanOrEqual(0.514);
    // The tread is crowned: what touches radius 1 is narrower than the wheel.
    const tread = triangles(wheel).filter((tri) => tri.every((p) => Math.hypot(p.y, p.z) > 0.999));
    expect(tread.length).toBeGreaterThan(0);
    for (const tri of tread) for (const p of tri) expect(Math.abs(p.x)).toBeLessThan(0.4);
  });

  it("has the attributes an instanced fleet wheel needs, and no paint", () => {
    expect(attributes(wheel)).toEqual(attributes(wheelGeometry()));
    const paint = wheel.getAttribute(PAINT_ATTRIBUTE);
    for (let i = 0; i < paint.count; i++) expect(paint.getX(i)).toBe(0);
  });

  it("shows its spin: pale and dark wedges on the rim in a pattern no turn repeats", () => {
    for (const side of [-1, 1]) {
      const rim = triangles(wheel).filter((tri) => tri.every((p) => Math.hypot(p.y, p.z) < 0.61 && side * p.x > 0.45));
      expect(rim).toHaveLength(8);
      // Each wedge lit or dark, in order round the wheel.
      const wedges = rim
        .map((tri) => {
          const c = centroid(tri);
          return { angle: Math.atan2(c.z, c.y), lit: tri.shade! > 0.2 };
        })
        .sort((a, b) => a.angle - b.angle)
        .map((w) => w.lit);
      expect(wedges.some(Boolean) && wedges.some((lit) => !lit)).toBe(true);
      for (let turn = 1; turn < 8; turn++) {
        const shifted = wedges.map((_, i) => wedges[(i + turn) % 8]);
        expect(shifted, `turned ${turn}`).not.toEqual(wedges);
      }
    }
  });

  it("carries the tyre as fabric and the rim as metal", () => {
    const surface = wheel.getAttribute(SURFACE_ATTRIBUTE);
    const seen = new Set<number>();
    for (let i = 0; i < surface.count; i++) seen.add(surface.getX(i));
    expect([...seen].sort()).toEqual([SURFACE.fabric, SURFACE.metal].sort());
  });
});

describe("the Blender lamps", () => {
  it("stay inside the procedural lamps' triangle counts", () => {
    for (const kind of VEHICLE_BODIES) {
      expect(triangleCount(blenderLightsGeometry(kind)), kind).toBeLessThanOrEqual(triangleCount(lightsGeometry(kind)));
    }
    expect(triangleCount(blenderTractorLightsGeometry())).toBeLessThan(triangleCount(tractorLightsGeometry()) + 1);
    expect(triangleCount(blenderTractorLightsGeometry())).toBeLessThan(80);
  });

  it("put a lens on every lamp of the spec, 5 cm deep and inside its outline", () => {
    for (const kind of VEHICLE_BODIES) {
      const spec = BODY_SPECS[kind];
      const tris = triangles(blenderLightsGeometry(kind));
      const [lw, lh] = spec.lamp;
      for (const [lamps, dir] of [[spec.headlights, 1], [spec.taillights, -1]] as const) {
        for (const [x, y, z] of lamps) {
          const mine = tris.filter((tri) => {
            const c = centroid(tri);
            return Math.abs(c.x - x) < lw / 2 && Math.abs(c.y - y) < lh / 2 && Math.abs(c.z - z) < 0.026;
          });
          expect(mine, `${kind} lamp at ${x},${y},${z}`).toHaveLength(10);
          const box = boxAround(mine);
          expect(box.max.x - box.min.x).toBeCloseTo(lw, 3);
          expect(box.max.y - box.min.y).toBeCloseTo(lh, 3);
          expect(box.max.z - box.min.z).toBeCloseTo(0.05, 3);
          expect(dir > 0 ? box.max.z : box.min.z).toBeCloseTo(z + dir * 0.025, 3);
        }
      }
    }
  });

  it("meet the Blender bodies' faces: the body passes through each lamp's depth", () => {
    for (const kind of VEHICLE_BODIES) {
      const spec = BODY_SPECS[kind];
      const geometry = body(kind);
      const [lw, lh] = spec.lamp;
      for (const [lamps, dir] of [[spec.headlights, 1], [spec.taillights, -1]] as const) {
        for (const [x, y, z] of lamps) {
          for (const [dx, dy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
            // From outside the car, at the lamp's corner, looking in.
            const p = hit(geometry, [x + (dx * lw) / 2.2, y + (dy * lh) / 2.2, dir * 5], [0, 0, -dir]);
            expect(p, `${kind} lamp at ${x},${y}`).not.toBeNull();
            // Behind the lens' front and in front of its back.
            expect(dir * (p!.z - z), `${kind} lamp at ${x},${y}`).toBeLessThan(0.025);
            expect(dir * (p!.z - z), `${kind} lamp at ${x},${y}`).toBeGreaterThan(-0.025);
          }
        }
      }
    }
  });

  it("light in the lamp colours, with a darker bezel and nothing brighter than the lens", () => {
    const head = new Color(HEADLIGHT);
    const tail = new Color(TAILLIGHT);
    for (const kind of VEHICLE_BODIES) {
      const colour = blenderLightsGeometry(kind).getAttribute("color");
      let lens = 0;
      let bezel = 0;
      for (let i = 0; i < colour.count; i++) {
        const c = new Color(colour.getX(i), colour.getY(i), colour.getZ(i));
        const near = (k: Color) => Math.abs(c.r - k.r) + Math.abs(c.g - k.g) + Math.abs(c.b - k.b) < 1e-3;
        if (near(head) || near(tail)) lens++;
        else if (c.r < head.r - 0.05) bezel++;
        expect(c.r).toBeLessThanOrEqual(1 + 1e-6);
      }
      expect(lens, kind).toBeGreaterThan(0);
      expect(bezel, kind).toBeGreaterThan(0);
    }
    // Lit glass, like the procedural lamps.
    const surface = blenderLightsGeometry("sedan").getAttribute(SURFACE_ATTRIBUTE);
    for (let i = 0; i < surface.count; i++) expect(surface.getX(i)).toBe(SURFACE.glass);
  });

  it("keep the taxi's roof sign on the roof and the bus's board on the nose", () => {
    // The taxi's sign stands on the roof at 1.115, 13 cm tall, 0.4 x 0.18 in plan.
    const roof = hit(body("taxi"), [0, 5, -0.23], [0, -1, 0])!.y;
    expect(roof).toBeCloseTo(1.115, 2);
    const sign = boxAround(triangles(blenderLightsGeometry("taxi")).filter((tri) => centroid(tri).y > 1));
    expect(sign.min.y).toBeCloseTo(1.115, 3);
    expect(sign.max.y).toBeCloseTo(1.245, 3);
    expect(sign.min.z).toBeCloseTo(-0.32, 3);
    expect(sign.max.z).toBeCloseTo(-0.14, 3);
    expect(sign.max.x).toBeCloseTo(0.2, 3);
    expect(triangles(blenderLightsGeometry("taxi")).filter((tri) => centroid(tri).y > 1)).toHaveLength(10);
    // Only the taxi has one.
    expect(boxOf(blenderLightsGeometry("sedan")).max.y).toBeLessThan(0.5);

    const boardTris = triangles(blenderLightsGeometry("bus")).filter((tri) => centroid(tri).y > 1.5);
    expect(boardTris).toHaveLength(10);
    const board = boxAround(boardTris);
    expect(board.max.z).toBeCloseTo(BODY_SPECS.bus.length / 2 + 0.025, 3);
    expect(board.max.x).toBeCloseTo((BODY_SPECS.bus.width * 0.66) / 2, 3);
    expect((board.min.y + board.max.y) / 2).toBeCloseTo(1.73, 3);
    const nose = hit(body("bus"), [0, 1.73, 5], [0, 0, -1])!;
    expect(Math.abs(nose.z - (board.max.z - 0.015))).toBeLessThan(0.025);
  });

  it("light the tractor's four lamps and its roof beacon", () => {
    const tris = triangles(blenderTractorLightsGeometry());
    expect(tris).toHaveLength(50);
    const [lw, lh] = TRACTOR_SPEC.lamp;
    for (const [lamps, dir] of [[TRACTOR_SPEC.headlights, 1], [TRACTOR_SPEC.taillights, -1]] as const) {
      for (const [x, y, z] of lamps) {
        const mine = tris.filter((tri) => {
          const c = centroid(tri);
          return Math.abs(c.x - x) < lw / 2 && Math.abs(c.y - y) < lh / 2 && Math.abs(c.z - z) < 0.026;
        });
        expect(mine).toHaveLength(10);
        const box = boxAround(mine);
        expect(box.max.x - box.min.x).toBeCloseTo(lw, 3);
        expect(dir > 0 ? box.max.z : box.min.z).toBeCloseTo(z + dir * 0.025, 3);
      }
    }
    // The beacon: 10 cm tall, from the cab roof's 1.87.
    const beacon = boxAround(tris.filter((t) => centroid(t).y > 1.5));
    expect(beacon.min.y).toBeCloseTo(1.87, 3);
    expect(beacon.max.y).toBeCloseTo(1.97, 3);
    expect((beacon.min.x + beacon.max.x) / 2).toBeCloseTo(0.3, 3);
    expect((beacon.min.z + beacon.max.z) / 2).toBeCloseTo(-0.45, 3);
  });

  it("carry the same attributes as the procedural lamps", () => {
    for (const kind of VEHICLE_BODIES) {
      expect(attributes(blenderLightsGeometry(kind))).toEqual(attributes(lightsGeometry(kind)));
    }
    expect(attributes(blenderTractorLightsGeometry())).toEqual(attributes(tractorLightsGeometry()));
  });
});

describe("the service trucks' chassis-cabs", () => {
  it("are only ever drawn by the procedural fallback: the Blender vehicles carry their own", async () => {
    vi.resetModules();
    vi.doMock("../modelSource", () => ({ BLENDER_MODELS: true }));
    vi.doMock("./shapes", async (original) => ({
      ...(await original<typeof import("./shapes")>()),
      truckParts: () => {
        throw new Error("truckParts drawn with the Blender models on");
      },
    }));
    try {
      const emergency = await import("./emergency");
      for (const kind of emergency.EMERGENCY_KINDS) {
        expect(emergency.emergencyParts(kind, 0.2).length, kind).toBeGreaterThan(0);
      }
    } finally {
      vi.doUnmock("./shapes");
      vi.doUnmock("../modelSource");
      vi.resetModules();
    }
    // With the flag off (as in every other test) they are built.
    for (const kind of TRUCK_BODIES) expect(truckParts(kind).length).toBeGreaterThan(5);
  });
});

describe("the Blender signboard", () => {
  const frame = blenderSignFrame();
  const faces = blenderSignFaces(BOARD);

  it("stays cheap: the frame within a few hundred triangles, the sheets two quads", () => {
    expect(triangleCount(frame)).toBeLessThan(300);
    expect(triangleCount(faces)).toBe(4);
  });

  it("stands on the procedural sign's footprint and height", () => {
    const own = boxOf(frame);
    const proc = boxOf(frameGeometry());
    for (const key of ["x", "y", "z"] as const) {
      expect(own.min[key], `min ${key}`).toBeCloseTo(proc.min[key], 1);
      expect(own.max[key], `max ${key}`).toBeCloseTo(proc.max[key], 1);
    }
    // On its six-unit plot (`Overflow.test.ts`): the footings are 0.4 wide.
    expect(own.max.x).toBeLessThanOrEqual(POST_X + 0.2 + 1e-3);
    expect(own.min.y).toBeGreaterThanOrEqual(-1e-3);
  });

  it("holds the board at the procedural board's size, height and thickness", () => {
    // The slab is 0.22 deep and its border 0.12 proud of the face on every side.
    const top = hit(frame, [0, 10, 0], [0, -1, 0])!;
    expect(top.y).toBeCloseTo(BOARD.y + BOARD.height / 2 + 0.12, 2);
    const side = hit(frame, [0, BOARD.y, 0.001], [1, 0, 0])!;
    expect(side.x).toBeCloseTo(BOARD.width / 2 + 0.12, 2);
    // The hazard rail hangs under it, as the procedural one does.
    const rail = hit(frame, [0, 0.2, 0.05], [0, 1, 0])!;
    expect(rail.y).toBeCloseTo(BOARD.y - BOARD.height / 2 - 0.3, 1);
  });

  it("puts each sheet where the text is painted, with the procedural sheet's UVs", () => {
    const depth = BOARD.depth / 2 + 0.01;
    const own = faces.getAttribute("position");
    const uv = faces.getAttribute("uv");
    const proc = faceGeometry().toNonIndexed();
    const procPosition = proc.getAttribute("position");
    const procUv = proc.getAttribute("uv");
    expect(own.count).toBe(6 * 2);
    for (let i = 0; i < own.count; i++) {
      const p = new Vector3().fromBufferAttribute(own, i);
      expect(Math.abs(p.z)).toBeCloseTo(depth, 3);
      expect(Math.abs(p.x)).toBeCloseTo(BOARD.width / 2, 3);
      expect(Math.abs(p.y - BOARD.y)).toBeCloseTo(BOARD.height / 2, 3);
      let matched = false;
      for (let j = 0; j < procPosition.count; j++) {
        if (new Vector3().fromBufferAttribute(procPosition, j).distanceTo(p) < 1e-3) {
          matched = true;
          expect(uv.getX(i)).toBeCloseTo(procUv.getX(j), 3);
          expect(uv.getY(i)).toBeCloseTo(procUv.getY(j), 3);
        }
      }
      expect(matched).toBe(true);
    }
    // Each sheet faces out of its own side.
    const normal = faces.getAttribute("normal");
    for (let i = 0; i < own.count; i++) expect(Math.sign(normal.getZ(i))).toBe(Math.sign(own.getZ(i)));
  });

  it("puts its anchors at the middle of each sheet", () => {
    const { front, back } = blenderSignAnchors();
    const depth = BOARD.depth / 2 + 0.01;
    expect(front[0]).toBeCloseTo(0, 4);
    expect(front[1]).toBeCloseTo(BOARD.y, 4);
    expect(front[2]).toBeCloseTo(depth, 4);
    expect(back[2]).toBeCloseTo(-depth, 4);
  });

  it("leaves the whole face clear of the frame: no post, rail or border crosses the lettering", () => {
    const depth = BOARD.depth / 2 + 0.01;
    const scene = mergeParts([{ geometry: frame, color: "#ffffff" }, { geometry: faces, color: "#ffffff" }]);
    for (const [fx, fy] of [[0, 0], [-0.98, -0.98], [0.98, -0.98], [0.98, 0.98], [-0.98, 0.98], [0.5, 0.2]]) {
      const x = fx * (BOARD.width / 2);
      const y = BOARD.y + fy * (BOARD.height / 2);
      for (const dir of [-1, 1]) {
        const p = hit(scene, [x, y, dir * 5], [0, 0, -dir])!;
        // The sheet is the first thing a ray meets; the lip may stand a hair above it.
        expect(Math.abs(p.z)).toBeGreaterThan(depth - 1e-3);
        expect(Math.abs(p.z)).toBeLessThan(depth + 0.006);
      }
    }
  });

  it("stands its posts outside the board and its footings on the ground", () => {
    const posts = importedParts(SIGN, "Frame", (hex) => hex).find((part) => part.color === "#6f7270")!;
    const reach = new Box3().setFromBufferAttribute(posts.geometry.getAttribute("position") as never);
    // Both posts are outside the board's frame (0.12 past the face), and reach the top of the sign.
    expect(reach.max.y).toBeCloseTo(BOARD.y + BOARD.height / 2 + 0.1, 3);
    const pos = posts.geometry.getAttribute("position");
    // (The base plates at the foot are wider than the posts, and far below the board.)
    for (let i = 0; i < pos.count; i++) {
      if (pos.getY(i) > 1) expect(Math.abs(pos.getX(i))).toBeGreaterThanOrEqual(BOARD.width / 2 + 0.12 - 1e-3);
    }
    const surface = frame.getAttribute(SURFACE_ATTRIBUTE);
    const seen = new Set<number>();
    for (let i = 0; i < surface.count; i++) seen.add(surface.getX(i));
    expect([...seen].sort()).toEqual([SURFACE.concrete, SURFACE.metal].sort());
    const footing = hit(frame, [POST_X, 5, 0.5], [0, -1, 0])!;
    expect(footing.y).toBeCloseTo(0.3, 2);
  });

  it("carries the attributes the procedural frame has", () => {
    expect(attributes(frame)).toEqual(attributes(frameGeometry()));
  });
});

describe("the switch", () => {
  let shapes: typeof import("./shapes");
  let overflow: typeof import("../../Overflow");

  beforeAll(async () => {
    vi.resetModules();
    vi.doMock("../modelSource", () => ({ BLENDER_MODELS: true }));
    shapes = await import("./shapes");
    overflow = await import("../../Overflow");
  });
  afterAll(() => {
    vi.doUnmock("../modelSource");
    vi.resetModules();
  });

  it("draws the Blender wheel, lamps and signboard with the flag on, the procedural ones without", () => {
    expect(triangleCount(shapes.wheelGeometry())).toBe(triangleCount(blenderWheelGeometry()));
    for (const kind of VEHICLE_BODIES) {
      // The Blender lamps are 10 triangles a lamp where the boxes are 12.
      expect(triangleCount(shapes.lightsGeometry(kind)), kind).toBe(triangleCount(blenderLightsGeometry(kind)));
      expect(triangleCount(shapes.lightsGeometry(kind)), kind).toBeLessThan(triangleCount(lightsGeometry(kind)));
    }
    expect(triangleCount(shapes.tractorLightsGeometry())).toBe(triangleCount(blenderTractorLightsGeometry()));
    expect(triangleCount(overflow.frameGeometry())).toBe(triangleCount(blenderSignFrame()));
    expect(triangleCount(overflow.frameGeometry())).toBeGreaterThan(triangleCount(frameGeometry()));
    expect(triangleCount(overflow.faceGeometry())).toBe(triangleCount(faceGeometry()));
    // The default test run sees the procedural parts.
    expect(triangleCount(frameGeometry())).toBe(72);
  });
});

describe("parked vehicles with the Blender parts", () => {
  let shapes: typeof import("./shapes");
  const procedural = { parked: new Map<VehicleBody, BufferGeometry>(), tractor: null as BufferGeometry | null };

  beforeAll(async () => {
    for (const kind of VEHICLE_BODIES) procedural.parked.set(kind, parkedGeometry(kind));
    procedural.tractor = tractorParkedGeometry();
    vi.resetModules();
    vi.doMock("../modelSource", () => ({ BLENDER_MODELS: true }));
    shapes = await import("./shapes");
  });
  afterAll(() => {
    vi.doUnmock("../modelSource");
    vi.resetModules();
  });

  it("bake the body, the Blender wheels and unlit lamps into one cached geometry", () => {
    for (const kind of VEHICLE_BODIES) {
      const parked = shapes.parkedGeometry(kind);
      expect(shapes.parkedGeometry(kind)).toBe(parked);
      const expected = triangleCount(body(kind)) + 4 * triangleCount(blenderWheelGeometry()) + triangleCount(blenderLightsGeometry(kind));
      expect(triangleCount(parked), kind).toBe(expected);
      // Within the fleet's per-car budget, like a moving car, and no fatter than the procedural one.
      expect(triangleCount(parked), kind).toBeLessThan(520);
      const box = boxOf(parked);
      const proc = boxOf(procedural.parked.get(kind)!);
      expect(box.max.x - box.min.x, kind).toBeLessThanOrEqual(proc.max.x - proc.min.x + 0.01);
      expect(box.min.y, kind).toBeGreaterThanOrEqual(-1e-3);
      expect(box.min.y, kind).toBeLessThan(0.03);
      expect(box.max.z, kind).toBeCloseTo(proc.max.z, 1);
      expect(attributes(parked)).toEqual(attributes(procedural.parked.get(kind)!));
    }
  });

  it("stand each wheel at its spec position and radius, and keep the lamps dark", () => {
    for (const kind of VEHICLE_BODIES) {
      const spec = BODY_SPECS[kind];
      const tris = triangles(shapes.parkedGeometry(kind));
      for (const [x, z] of spec.wheels) {
        const wheel = tris.filter((tri) => tri.every((p) => Math.abs(p.z - z) < spec.wheelRadius * 1.01 && Math.abs(p.y - spec.wheelRadius) < spec.wheelRadius * 1.01 && Math.abs(p.x - x) < 0.3 * spec.wheelRadius + 0.3 * 1 && Math.sign(p.x) === Math.sign(x)
          && Math.hypot(p.y - spec.wheelRadius, p.z - z) > spec.wheelRadius * 0.999));
        expect(wheel.length, `${kind} wheel ${x},${z}`).toBeGreaterThan(0);
        const outer = boxAround(wheel);
        expect(outer.min.y).toBeCloseTo(0, 3);
        expect(outer.max.y).toBeCloseTo(spec.wheelRadius * 2, 3);
      }
      // No lit colour survives: the lenses are switched off.
      const colour = shapes.parkedGeometry(kind).getAttribute("color");
      for (const lit of [new Color(HEADLIGHT), new Color(TAILLIGHT)]) {
        for (let i = 0; i < colour.count; i++) {
          const d = Math.abs(colour.getX(i) - lit.r) + Math.abs(colour.getY(i) - lit.g) + Math.abs(colour.getZ(i) - lit.b);
          expect(d).toBeGreaterThan(1e-3);
        }
      }
    }
  });

  it("park the tractor on its Blender wheels, in its lane and under its budget", () => {
    const parked = shapes.tractorParkedGeometry();
    expect(shapes.tractorParkedGeometry()).toBe(parked);
    const expected = triangleCount(mergeParts(blenderTractorParts())) + 2 * 2 * triangleCount(blenderWheelGeometry()) + triangleCount(blenderTractorLightsGeometry());
    expect(triangleCount(parked)).toBe(expected);
    expect(triangleCount(parked)).toBeLessThan(700);
    const box = boxOf(parked);
    expect(box.max.x - box.min.x).toBeLessThanOrEqual(MAX_BODY_WIDTH + 1e-6);
    expect(box.max.z - box.min.z).toBeLessThanOrEqual(TRACTOR_SPEC.length + 0.02);
    expect(box.min.y).toBeGreaterThanOrEqual(-1e-3);
    expect(attributes(parked)).toEqual(attributes(procedural.tractor!));
    // Big wheels behind reach the rear radius, small ones ahead the front's.
    TRACTOR_SPEC.wheels.forEach(([x, z], i) => {
      const r = TRACTOR_SPEC.wheelRadii[i];
      const at = triangles(parked).filter((tri) => tri.every((p) => Math.abs(p.z - z) < r * 1.01 && Math.abs(Math.hypot(p.y - r, p.z - z) - r) < 1e-3 && Math.sign(p.x) === Math.sign(x)));
      expect(at.length, `wheel ${x},${z}`).toBeGreaterThan(0);
      expect(boxAround(at).max.y).toBeCloseTo(2 * r, 3);
    });
  });
});
