/**
 * The primitive kit the landmark models are built from (PLAN.md sections 4
 * and 37).
 *
 * A landmark is a hundred little boxes and cylinders, and a hundred meshes is
 * a hundred draw calls. Everything here exists to avoid that: parts are added
 * to a named SLOT, each slot is merged into one `BufferGeometry`, and the
 * renderer draws one mesh per slot. A slot is "everything that shares a
 * material", so a power station is six draw calls instead of twenty-one.
 *
 * Nothing here touches React or the renderer: it is geometry maths, which is
 * why it can be unit tested in node.
 *
 * Conventions, shared with `Landmark.tsx`:
 *   - +y is up and y = 0 is the ground the landmark stands on.
 *   - +z is the side that faces the city centre. `planLandmarkPlots` in
 *     `lib/city/layout.ts` rotates every plot so that this is true, so a fire
 *     station's bay doors and an information centre's glass front both belong
 *     on +z.
 *   - A model is drawn at its NATURAL size (`NATURAL_LANDMARK_SIZE`) and the
 *     renderer scales it uniformly into the plot the generator reserved.
 */

import {
  BoxGeometry,
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  Euler,
  LatheGeometry,
  Matrix4,
  Quaternion,
  SphereGeometry,
  Vector2,
  Vector3,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export type V3 = [number, number, number];

/** Where a part sits in the assembly's own frame. */
export interface Place {
  at?: V3;
  /** Euler angles in radians, XYZ order. */
  rot?: V3;
  scale?: V3 | number;
}

/** One merged geometry per slot. A slot with no parts is simply absent. */
export type Slots<S extends string> = { readonly [K in S]?: BufferGeometry };

const UP = new Vector3(0, 1, 0);

function matrixOf(place: Place): Matrix4 {
  const at = place.at ?? [0, 0, 0];
  const rot = place.rot ?? [0, 0, 0];
  const scale = place.scale ?? 1;
  return new Matrix4().compose(
    new Vector3(at[0], at[1], at[2]),
    new Quaternion().setFromEuler(new Euler(rot[0], rot[1], rot[2])),
    typeof scale === "number"
      ? new Vector3(scale, scale, scale)
      : new Vector3(scale[0], scale[1], scale[2]),
  );
}

/**
 * A builder for one landmark. Add parts, then `build()` once; the result is
 * cached by the model modules, so the merge cost is paid once per variant for
 * the life of the tab rather than once per analysed repository.
 */
export class Assembly<S extends string> {
  private readonly groups = new Map<S, BufferGeometry[]>();

  /** Adds an already-built geometry. The geometry is consumed, not copied. */
  add(slot: S, geometry: BufferGeometry, place: Place = {}): this {
    geometry.applyMatrix4(matrixOf(place));
    this.push(slot, geometry);
    return this;
  }

  private push(slot: S, geometry: BufferGeometry): void {
    const list = this.groups.get(slot);
    if (list) list.push(geometry);
    else this.groups.set(slot, [geometry]);
  }

  box(slot: S, size: V3, place?: Place): this {
    return this.add(slot, new BoxGeometry(size[0], size[1], size[2]), place);
  }

  /** A cylinder or truncated cone, standing on +y by default. */
  cylinder(
    slot: S,
    radiusTop: number,
    radiusBottom: number,
    height: number,
    radial = 8,
    place?: Place,
    openEnded = false,
  ): this {
    return this.add(
      slot,
      new CylinderGeometry(radiusTop, radiusBottom, height, radial, 1, openEnded),
      place,
    );
  }

  cone(slot: S, radius: number, height: number, radial = 8, place?: Place): this {
    return this.add(slot, new ConeGeometry(radius, height, radial), place);
  }

  sphere(slot: S, radius: number, place?: Place, widthSeg = 12, heightSeg = 8): this {
    return this.add(slot, new SphereGeometry(radius, widthSeg, heightSeg), place);
  }

  /** A dome: the top half of a sphere, which is half the triangles. */
  dome(slot: S, radius: number, place?: Place, widthSeg = 16, heightSeg = 8): this {
    return this.add(
      slot,
      new SphereGeometry(radius, widthSeg, heightSeg, 0, Math.PI * 2, 0, Math.PI / 2),
      place,
    );
  }

  /**
   * A surface of revolution from a `[radius, y]` profile: the only way to get
   * a cooling tower's waist without shipping a model file.
   */
  lathe(
    slot: S,
    profile: readonly (readonly [number, number])[],
    radial = 14,
    place?: Place,
  ): this {
    return this.add(
      slot,
      new LatheGeometry(
        profile.map(([r, y]) => new Vector2(r, y)),
        radial,
      ),
      place,
    );
  }

  /**
   * A gable: a triangular prism running along z, apex up, base centred on the
   * origin's height. Two leaning slabs never meet cleanly at the ridge; this
   * does, which is the difference between a pediment and a pile of planks.
   */
  gable(slot: S, halfWidth: number, height: number, depth: number, place?: Place): this {
    // A three-sided cylinder started at pi puts one vertex at -z (the apex
    // once the prism is tipped over) and the other two at +z/2.
    const geometry = new CylinderGeometry(1, 1, depth, 3, 1, false, Math.PI);
    geometry.scale(halfWidth / Math.sin((Math.PI * 2) / 3), 1, height / 1.5);
    geometry.rotateX(Math.PI / 2);
    return this.add(slot, geometry, place);
  }

  /** A rod between two points: handrails, lattice legs, guy wires. */
  strut(slot: S, from: V3, to: V3, radius: number, radial = 5): this {
    const a = new Vector3(from[0], from[1], from[2]);
    const b = new Vector3(to[0], to[1], to[2]);
    const dir = b.clone().sub(a);
    const length = dir.length();
    if (length < 1e-6) return this;
    const geometry = new CylinderGeometry(radius, radius, length, radial, 1, true);
    geometry.applyMatrix4(
      new Matrix4().compose(
        a.clone().add(b).multiplyScalar(0.5),
        new Quaternion().setFromUnitVectors(UP, dir.normalize()),
        new Vector3(1, 1, 1),
      ),
    );
    this.push(slot, geometry);
    return this;
  }

  /**
   * A power line: a strut chain that sags in the middle, because a straight
   * line between two pylons reads as scaffolding rather than as a cable.
   */
  wire(slot: S, from: V3, to: V3, radius = 0.05, sag = 0.6, segments = 4): this {
    const point = (t: number): V3 => [
      from[0] + (to[0] - from[0]) * t,
      from[1] + (to[1] - from[1]) * t - sag * 4 * t * (1 - t),
      from[2] + (to[2] - from[2]) * t,
    ];
    for (let i = 0; i < segments; i++) {
      this.strut(slot, point(i / segments), point((i + 1) / segments), radius, 4);
    }
    return this;
  }

  /** Slots that have at least one part. Used by the tests and by `build`. */
  filled(): S[] {
    return [...this.groups.keys()];
  }

  build(): Slots<S> {
    const out: Record<string, BufferGeometry> = {};
    for (const [slot, list] of this.groups) {
      let merged: BufferGeometry | null;
      if (list.length === 1) {
        merged = list[0];
        // A lone `BoxGeometry` carries six material groups. With one material
        // the renderer ignores them, but clearing keeps `build()` output
        // uniform whatever the caller does with it.
        merged.clearGroups();
      } else {
        merged = mergeGeometries(list, false);
        for (const part of list) part.dispose();
      }
      if (!merged) throw new Error(`landmark slot "${slot}" failed to merge`);
      merged.computeBoundingBox();
      out[slot] = merged;
    }
    return out as Slots<S>;
  }
}

/**
 * Built geometry lives for the life of the page: there are at most a couple of
 * dozen variants across the five landmarks, they are a few thousand triangles
 * each, and analysing a second repository should not rebuild them.
 */
const CACHE = new Map<string, unknown>();

export function cached<T>(key: string, make: () => T): T {
  const hit = CACHE.get(key);
  if (hit !== undefined) return hit as T;
  const made = make();
  CACHE.set(key, made);
  return made;
}

/** Test helper: the extent of a built assembly, as `[width, height, depth]`. */
export function extentOf(slots: Slots<string>): V3 {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (const geometry of Object.values(slots)) {
    if (!geometry) continue;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    if (!box) continue;
    minX = Math.min(minX, box.min.x);
    minY = Math.min(minY, box.min.y);
    minZ = Math.min(minZ, box.min.z);
    maxX = Math.max(maxX, box.max.x);
    maxY = Math.max(maxY, box.max.y);
    maxZ = Math.max(maxZ, box.max.z);
  }
  return [maxX - minX, maxY - minY, maxZ - minZ];
}

/** Test helper: triangles across every slot of a built assembly. */
export function triangleCount(slots: Slots<string>): number {
  let total = 0;
  for (const geometry of Object.values(slots)) {
    if (!geometry) continue;
    const index = geometry.getIndex();
    total += index ? index.count / 3 : geometry.getAttribute("position").count / 3;
  }
  return total;
}
