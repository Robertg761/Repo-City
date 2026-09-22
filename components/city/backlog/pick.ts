/**
 * Picking the crowd (PLAN.md 76.9).
 *
 * Three's own `InstancedMesh.raycast` tests every triangle of every instance.
 * For fifteen hundred small objects that is tens of thousands of triangle
 * tests on every pointer move, for objects a couple of pixels wide whose exact
 * silhouette nobody can aim at anyway. So each crowd mesh gets this instead: a
 * box per instance in its own frame, and a slab test against it.
 *
 * The hit it reports has exactly the shape three's raycast produces --
 * `distance`, `point`, `object`, `instanceId` -- so the raycaster sorts it by
 * distance with everything else in the scene, React Three Fiber routes it to
 * the mesh's handlers, and `useInstanceHandlers(ids)` maps `instanceId` to the
 * entity. A building in front of a pothole still wins, because it is nearer.
 *
 * Instances that have not been revealed yet cannot be hit: nothing may be
 * hovered before it exists.
 *
 * Pure apart from the three.js maths types: unit tested against three's own
 * raycast.
 */

import { Matrix4, Ray, Vector3, type Intersection, type Object3D, type Raycaster } from "three";
import type { CrowdItem } from "./plan";

/** Floats per instance: x, y, z, cos, sin, minX, maxX, maxY, minZ, maxZ, appearAt. */
export const PICK_STRIDE = 11;

/** The pick table for a group of items, in instance order. */
export function pickTable(items: readonly CrowdItem[]): Float32Array {
  const data = new Float32Array(items.length * PICK_STRIDE);
  items.forEach((item, i) => {
    const o = i * PICK_STRIDE;
    data[o] = item.x;
    data[o + 1] = item.y;
    data[o + 2] = item.z;
    data[o + 3] = Math.cos(item.rotationY);
    data[o + 4] = Math.sin(item.rotationY);
    data[o + 5] = item.pick.minX;
    data[o + 6] = item.pick.maxX;
    data[o + 7] = item.pick.maxY;
    data[o + 8] = item.pick.minZ;
    data[o + 9] = item.pick.maxZ;
    data[o + 10] = item.appearAt;
  });
  return data;
}

/**
 * The entry distance of a ray into one instance's box, along the ray, or -1.
 * `ox..dz` are the ray in world space; the box is in the instance's frame.
 */
export function slab(
  data: Float32Array,
  i: number,
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
): number {
  const o = i * PICK_STRIDE;
  const cos = data[o + 3];
  const sin = data[o + 4];
  // World to local: undo `rotation.y`, which three applies as
  // world = (x cos + z sin, y, -x sin + z cos).
  const px = ox - data[o];
  const py = oy - data[o + 1];
  const pz = oz - data[o + 2];
  const lox = px * cos - pz * sin;
  const loz = px * sin + pz * cos;
  const ldx = dx * cos - dz * sin;
  const ldz = dx * sin + dz * cos;

  let near = -Infinity;
  let far = Infinity;
  const axis = (origin: number, dir: number, lo: number, hi: number): boolean => {
    if (Math.abs(dir) < 1e-12) return origin >= lo && origin <= hi;
    let t0 = (lo - origin) / dir;
    let t1 = (hi - origin) / dir;
    if (t0 > t1) {
      const swap = t0;
      t0 = t1;
      t1 = swap;
    }
    if (t0 > near) near = t0;
    if (t1 < far) far = t1;
    return near <= far;
  };
  if (!axis(lox, ldx, data[o + 5], data[o + 6])) return -1;
  if (!axis(py, dy, 0, data[o + 7])) return -1;
  if (!axis(loz, ldz, data[o + 8], data[o + 9])) return -1;
  if (far < 0) return -1;
  // A ray that starts inside the box hits it where it starts.
  return near < 0 ? 0 : near;
}

const inverse = new Matrix4();
const localRay = new Ray();
const hitPoint = new Vector3();

/**
 * Raycast every instance in `data` and push one hit per instance struck, as
 * three's `InstancedMesh.raycast` would. `now` is the reveal clock in
 * milliseconds: an instance whose `appearAt` is still ahead is skipped.
 */
export function raycastTable(
  data: Float32Array,
  count: number,
  object: Object3D,
  raycaster: Raycaster,
  intersects: Intersection[],
  now = Infinity,
): void {
  // The crowd meshes sit at the origin, but do not rely on it.
  inverse.copy(object.matrixWorld).invert();
  localRay.copy(raycaster.ray).applyMatrix4(inverse);
  const { origin, direction } = localRay;
  const unit = direction.length() || 1;
  const dx = direction.x / unit;
  const dy = direction.y / unit;
  const dz = direction.z / unit;

  for (let i = 0; i < count; i++) {
    if (data[i * PICK_STRIDE + 10] > now) continue;
    const t = slab(data, i, origin.x, origin.y, origin.z, dx, dy, dz);
    if (t < 0) continue;
    hitPoint.set(origin.x + dx * t, origin.y + dy * t, origin.z + dz * t).applyMatrix4(object.matrixWorld);
    const distance = raycaster.ray.origin.distanceTo(hitPoint);
    if (distance < raycaster.near || distance > raycaster.far) continue;
    intersects.push({
      distance,
      point: hitPoint.clone(),
      object,
      instanceId: i,
      face: null,
    });
  }
}
