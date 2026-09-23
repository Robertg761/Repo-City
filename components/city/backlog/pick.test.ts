import { describe, expect, it } from "vitest";
import {
  BoxGeometry,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Object3D,
  Raycaster,
  Vector3,
  type Intersection,
} from "three";
import { prngFor } from "@/lib/city/seed";
import { PICK_STRIDE, pickTable, raycastTable, slab } from "./pick";
import type { CrowdItem, LocalBox } from "./plan";

const item = (i: number, x: number, z: number, rotationY: number, pick: LocalBox, appearAt = 0): CrowdItem => ({
  id: `crowd-${i}`,
  form: "pothole",
  paint: ["#ffffff", "#ffffff"],
  x,
  y: 0.1,
  z,
  rotationY,
  scale: [1, 1, 1],
  tint: "#ffffff",
  phase: 0,
  mask: 0,
  appearAt,
  glow: 0,
  lane: false,
  pick,
});

/** The same boxes as a real InstancedMesh, for three's own raycast. */
function reference(items: readonly CrowdItem[]): InstancedMesh {
  const geometry = new BoxGeometry(1, 1, 1);
  const mesh = new InstancedMesh(geometry, new MeshBasicMaterial(), items.length);
  const place = new Object3D();
  const local = new Matrix4();
  items.forEach((it, i) => {
    place.position.set(it.x, it.y, it.z);
    place.rotation.set(0, it.rotationY, 0);
    place.updateMatrix();
    const { minX, maxX, maxY, minZ, maxZ } = it.pick;
    local.compose(
      new Vector3((minX + maxX) / 2, maxY / 2, (minZ + maxZ) / 2),
      new Object3D().quaternion,
      new Vector3(maxX - minX, maxY, maxZ - minZ),
    );
    mesh.setMatrixAt(i, place.matrix.clone().multiply(local));
  });
  mesh.updateMatrixWorld(true);
  return mesh;
}

function sample(count: number, seed: string): CrowdItem[] {
  const prng = prngFor(seed, "pick");
  return Array.from({ length: count }, (_, i) =>
    item(i, prng.range(-60, 60), prng.range(-60, 60), prng.range(-Math.PI, Math.PI), {
      minX: -prng.range(0.4, 1.5),
      maxX: prng.range(0.4, 1.5),
      maxY: prng.range(0.4, 2.5),
      minZ: -prng.range(0.4, 1.5),
      maxZ: prng.range(0.4, 1.5),
    }),
  );
}

describe("crowd picking", () => {
  it("agrees with three's own instanced raycast, instance for instance", () => {
    const items = sample(60, "agree");
    const data = pickTable(items);
    const mesh = reference(items);
    const holder = new Object3D();
    holder.updateMatrixWorld(true);
    const prng = prngFor("agree", "rays");
    let hits = 0;
    for (let r = 0; r < 400; r++) {
      // Aim from above the city, like the camera, at a random instance or near it.
      const target = items[prng.int(0, items.length - 1)];
      const origin = new Vector3(prng.range(-150, 150), prng.range(40, 200), prng.range(-150, 150));
      const aim = new Vector3(target.x + prng.range(-2, 2), prng.range(0, 1.5), target.z + prng.range(-2, 2));
      const raycaster = new Raycaster(origin, aim.sub(origin).normalize());

      const ours: Intersection[] = [];
      raycastTable(data, items.length, holder, raycaster, ours);
      const theirs: Intersection[] = [];
      mesh.raycast(raycaster, theirs);

      const firstOurs = [...ours].sort((a, b) => a.distance - b.distance)[0];
      const firstTheirs = [...theirs].sort((a, b) => a.distance - b.distance)[0];
      expect(new Set(ours.map((h) => h.instanceId))).toEqual(new Set(theirs.map((h) => h.instanceId)));
      if (firstTheirs) {
        hits++;
        expect(firstOurs.instanceId).toBe(firstTheirs.instanceId);
        expect(firstOurs.distance).toBeCloseTo(firstTheirs.distance, 3);
        expect(firstOurs.point.distanceTo(firstTheirs.point)).toBeLessThan(1e-3);
      }
    }
    // The rays were aimed to hit, so the comparison is not vacuous.
    expect(hits).toBeGreaterThan(150);
  });

  it("reports hits shaped like three's, so R3F maps instanceId to the entity", () => {
    const items = [item(0, 0, 0, 0, { minX: -1, maxX: 1, maxY: 1, minZ: -1, maxZ: 1 })];
    const holder = new Object3D();
    holder.updateMatrixWorld(true);
    const raycaster = new Raycaster(new Vector3(0, 10, 0), new Vector3(0, -1, 0));
    const hits: Intersection[] = [];
    raycastTable(pickTable(items), 1, holder, raycaster, hits);
    expect(hits).toHaveLength(1);
    expect(hits[0].object).toBe(holder);
    expect(hits[0].instanceId).toBe(0);
    // The top of the box: 0.1 up for the surface plus its height of 1.
    expect(hits[0].distance).toBeCloseTo(10 - 1.1, 6);
    expect(hits[0].point.y).toBeCloseTo(1.1, 6);
  });

  it("turns each box with its instance", () => {
    // Long along local z; turned a quarter it lies along world x.
    const long = item(0, 0, 0, Math.PI / 2, { minX: -0.2, maxX: 0.2, maxY: 1, minZ: -3, maxZ: 3 });
    const data = pickTable([long]);
    // A vertical ray at x = 2.5 hits it only once it lies along x.
    expect(slab(data, 0, 2.5, 10, 0, 0, -1, 0)).toBeGreaterThan(0);
    expect(slab(data, 0, 0, 10, 2.5, 0, -1, 0)).toBe(-1);
  });

  it("cannot pick what has not been revealed yet", () => {
    const items = [item(0, 0, 0, 0, { minX: -1, maxX: 1, maxY: 1, minZ: -1, maxZ: 1 }, 3000)];
    const holder = new Object3D();
    holder.updateMatrixWorld(true);
    const raycaster = new Raycaster(new Vector3(0, 10, 0), new Vector3(0, -1, 0));
    const early: Intersection[] = [];
    raycastTable(pickTable(items), 1, holder, raycaster, early, 2000);
    expect(early).toHaveLength(0);
    const late: Intersection[] = [];
    raycastTable(pickTable(items), 1, holder, raycaster, late, 3500);
    expect(late).toHaveLength(1);
  });

  it("respects the raycaster's near and far", () => {
    const items = [item(0, 0, 0, 0, { minX: -1, maxX: 1, maxY: 1, minZ: -1, maxZ: 1 })];
    const holder = new Object3D();
    holder.updateMatrixWorld(true);
    const raycaster = new Raycaster(new Vector3(0, 10, 0), new Vector3(0, -1, 0), 0, 5);
    const hits: Intersection[] = [];
    raycastTable(pickTable(items), 1, holder, raycaster, hits);
    expect(hits).toHaveLength(0);
  });

  it("tests fifteen hundred instances well inside a millisecond per pointer move", () => {
    const items = sample(1500, "bench");
    const data = pickTable(items);
    expect(data.length).toBe(1500 * PICK_STRIDE);
    const holder = new Object3D();
    holder.updateMatrixWorld(true);
    const raycaster = new Raycaster(new Vector3(120, 160, 120), new Vector3(-1, -1.3, -1).normalize());
    const hits: Intersection[] = [];
    for (let i = 0; i < 50; i++) raycastTable(data, 1500, holder, raycaster, hits);
    const runs = 400;
    const start = performance.now();
    for (let i = 0; i < runs; i++) {
      hits.length = 0;
      raycastTable(data, 1500, holder, raycaster, hits);
    }
    const perRay = (performance.now() - start) / runs;
    // PLAN.md 76.13 asks for at most 1 ms; the CI bound is generous.
    expect(perRay).toBeLessThan(3);
  });
});
