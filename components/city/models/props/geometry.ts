/**
 * Merging primitives into one geometry (PLAN.md sections 4 and 38).
 *
 * Every model in the city-life layer is built from boxes, cylinders, cones and
 * spheres -- section 4 rules out downloaded assets -- but a police car made of
 * eleven little meshes costs eleven draw calls, and a dozen incidents exist at
 * once. So each assembly is merged into a single `BufferGeometry` with its
 * per-part colours baked into a `color` attribute.
 *
 * That still works with instancing: three multiplies the vertex colour by the
 * per-instance colour, so a merged car body can carry a pale cabin and a dark
 * windscreen and still be painted per car.
 *
 * Merged geometries are built once and cached by their caller. Nothing here
 * runs per frame.
 */

import {
  BufferGeometry,
  Color,
  Euler,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Matrix4,
  Quaternion,
  Shape,
  Vector2,
  Vector3,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export type Triple = [number, number, number];

export interface Part {
  geometry: BufferGeometry;
  /**
   * Baked into the merged geometry's `color` attribute. When the source
   * geometry already carries colours -- a whole vehicle body, say -- this
   * multiplies them instead of flattening them, so a car can be merged into a
   * larger assembly and still keep its glass and its tyres while being tinted
   * rusty or scorched.
   */
  color: string;
  /**
   * Whether the per-instance colour paints this part. Only meaningful under a
   * `tintedMaterial` (`./material`): there a car's paintwork takes the
   * instance colour while its glass and tyres keep their own, and a tree's
   * crown takes its leaf tint while the trunk stays bark. Under an ordinary
   * material the flag is carried and ignored.
   */
  paint?: boolean;
  position?: Triple;
  /** Euler angles in radians, XYZ order. */
  rotation?: Triple;
  scale?: number | Triple;
}

const scratchMatrix = new Matrix4();
const scratchPosition = new Vector3();
const scratchQuaternion = new Quaternion();
const scratchEuler = new Euler();
const scratchScale = new Vector3();
const scratchColor = new Color();

/** The per-vertex paint mask `tintedMaterial` reads: 1 painted, 0 not. */
export const PAINT_ATTRIBUTE = "paint";

/** Attributes every merged geometry carries; merging needs identical sets. */
const KEPT = new Set(["position", "normal", "uv", "color", PAINT_ATTRIBUTE]);

/**
 * A clone of `part`, transformed into the assembly frame and coloured.
 *
 * Boxes and cylinders are indexed and the polyhedra are not, and three will
 * only merge geometries that agree about that, so everything is expanded to
 * non-indexed here. It costs a few dozen extra vertices in an assembly that is
 * drawn with one instanced call; triangles, which are what the budget is
 * written in, are unchanged.
 */
function preparePart(part: Part): BufferGeometry {
  const source = part.geometry;
  const geometry = source.getIndex() ? source.toNonIndexed() : source.clone();

  const [px, py, pz] = part.position ?? [0, 0, 0];
  const [rx, ry, rz] = part.rotation ?? [0, 0, 0];
  const scale = part.scale ?? 1;
  scratchPosition.set(px, py, pz);
  scratchEuler.set(rx, ry, rz);
  scratchQuaternion.setFromEuler(scratchEuler);
  if (typeof scale === "number") scratchScale.setScalar(scale);
  else scratchScale.set(scale[0], scale[1], scale[2]);
  scratchMatrix.compose(scratchPosition, scratchQuaternion, scratchScale);
  geometry.applyMatrix4(scratchMatrix);

  // `Color.setStyle` converts sRGB into the renderer's working colour space,
  // which is exactly what a `color` attribute has to hold.
  scratchColor.setStyle(part.color);
  const count = geometry.getAttribute("position").count;
  const existing = geometry.getAttribute("color");
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = scratchColor.r * (existing ? existing.getX(i) : 1);
    colors[i * 3 + 1] = scratchColor.g * (existing ? existing.getY(i) : 1);
    colors[i * 3 + 2] = scratchColor.b * (existing ? existing.getZ(i) : 1);
  }
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));

  // A part that is itself a merged assembly keeps its own mask: a parked car
  // baked into a wreck still knows which of its faces were paintwork.
  const existingPaint = geometry.getAttribute(PAINT_ATTRIBUTE);
  const paint = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    paint[i] = existingPaint ? existingPaint.getX(i) : part.paint ? 1 : 0;
  }
  geometry.setAttribute(PAINT_ATTRIBUTE, new Float32BufferAttribute(paint, 1));

  for (const name of Object.keys(geometry.attributes)) {
    if (!KEPT.has(name)) geometry.deleteAttribute(name);
  }
  return geometry;
}

/**
 * Merge an assembly into one geometry. The intermediate clones are disposed on
 * the way out; nothing else ever references them.
 */
export function mergeParts(parts: readonly Part[]): BufferGeometry {
  const prepared = parts.map(preparePart);
  const merged = mergeGeometries(prepared, false);
  for (const geometry of prepared) geometry.dispose();
  if (!merged) throw new Error("mergeParts: geometries could not be merged");
  merged.computeBoundingSphere();
  return merged;
}

/** A point in a side profile: `[z, y]`, forward and up. */
export type ProfilePoint = [number, number];

/**
 * A side profile pushed straight across `width`, centred on `x = 0`.
 *
 * This is what gives a car a raked windscreen and a sloping bonnet without a
 * modelling tool: draw the silhouette as a polygon seen from the side, and
 * extrude it across the body. No bevels, so an eight point profile costs 28
 * triangles and still reads as a car rather than as a stack of crates.
 *
 * The polygon is `[z, y]` pairs in either winding; three sorts out which way
 * round the caps face.
 */
export function prismGeometry(profile: readonly ProfilePoint[], width: number): BufferGeometry {
  if (profile.length < 3) throw new Error("prismGeometry: a profile needs three points");
  const shape = new Shape(profile.map(([z, y]) => new Vector2(z, y)));
  const geometry = new ExtrudeGeometry(shape, { depth: width, bevelEnabled: false, steps: 1 });
  // The shape is drawn in (x, y) and extruded along +z. Turn it a quarter so
  // shape x becomes forward (+z) and the extrusion runs across the body,
  // then centre that extrusion on the axis.
  geometry.rotateY(-Math.PI / 2);
  geometry.translate(width / 2, 0, 0);
  return geometry;
}

/** Triangles in a geometry, for the budget assertions in the model tests. */
export function triangleCount(geometry: BufferGeometry): number {
  const index = geometry.getIndex();
  return (index ? index.count : geometry.getAttribute("position").count) / 3;
}

/**
 * A cache keyed by a string, for geometries that depend on a state and on the
 * city's desaturation: an assembly is built at most once per distinct look and
 * shared by every mesh that wants it.
 */
export function geometryCache<K extends string>(
  build: (key: K) => BufferGeometry,
): (key: K) => BufferGeometry {
  const cache = new Map<string, BufferGeometry>();
  return (key: K) => {
    const hit = cache.get(key);
    if (hit) return hit;
    const made = build(key);
    cache.set(key, made);
    return made;
  };
}

/** Rounds a 0..1 look parameter so the cache has a handful of buckets, not a cloud. */
export const toneKey = (value: number): string => (Math.round(value * 20) / 20).toFixed(2);
