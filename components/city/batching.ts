/**
 * Batching the heroes (PLAN.md 76.9 and 76.13, S9 tuning pass).
 *
 * A hero incident, a construction site or a landmark's lamps and smoke used
 * to be a handful of meshes each: a ground patch, the merged scene, a hazard
 * ring, a blinking lamp per light bar, eight smoke puffs. Sixteen incidents,
 * ten sites and five landmarks came to about 370 draw calls a frame on the
 * stress metropolis, three quarters of the budget, for shapes that are all
 * copies of a few dozen geometries.
 *
 * So every one of those shapes is drawn from a shared pool: one
 * `InstancedMesh` per geometry and material for the whole city. A hero still
 * places its parts as it always did, as ordinary objects inside its own group
 * (`<BatchPart>` in `Batch.tsx` is an empty group), so the reveal's
 * scale, the crane's swing and the smoke's rise all still reach them through
 * the scene graph. Once a frame the pool copies each part's world matrix,
 * colour, opacity and glow into its instance. What reaches the screen is the
 * same geometry, the same material and the same numbers, from far fewer
 * draw calls.
 *
 * This file is the bookkeeping and the shader patch, free of React.
 */

import { Color, type BufferGeometry, type Material, type Object3D } from "three";

/**
 * What one pool draws. Every part registered under the same `key` shares one
 * instanced mesh, so a key must name exactly one geometry and one material.
 */
export interface BatchKind {
  key: string;
  geometry: () => BufferGeometry;
  /** Called once per pool; the pool owns and disposes the result. */
  material: () => Material;
  castShadow?: boolean;
  receiveShadow?: boolean;
  renderOrder?: number;
  /**
   * Whether the pointer can land on it. Glows and pools of light never took
   * the pointer (a twelve-unit square of firelight is not the incident).
   */
  pickable?: boolean;
}

/** One placed part: its object in the scene graph and its per-instance values. */
export interface BatchHandle {
  object: Object3D | null;
  /** Multiplies the material colour (and any vertex colours), as `instanceColor` does. */
  color: Color;
  /** Multiplies the material's opacity. Only read by materials patched for it. */
  opacity: number;
  /** Multiplies the emissive term. Only read by materials patched for it. */
  glow: number;
  /** Hides the instance without unregistering it. */
  visible: boolean;
  /** The entity a pointer on this part hovers and selects. */
  id: string | undefined;
}

export function createHandle(id?: string): BatchHandle {
  return { object: null, color: new Color(1, 1, 1), opacity: 1, glow: 1, visible: true, id };
}

export interface Pool {
  kind: BatchKind;
  parts: BatchHandle[];
  /** Instances allocated. Grows in powers of two, never shrinks. */
  capacity: number;
}

/** The smallest power of two that holds `count`, and at least 4. */
export function capacityFor(count: number): number {
  let capacity = 4;
  while (capacity < count) capacity *= 2;
  return capacity;
}

/**
 * The set of pools for one city. `version` changes whenever the set of pools
 * or a pool's capacity does, which is when React must remount a mesh; parts
 * coming and going inside the capacity only change `pool.parts`, which the
 * frame loop reads directly.
 */
export class BatchRegistry {
  readonly pools = new Map<string, Pool>();
  private listeners = new Set<() => void>();
  version = 0;

  add(kind: BatchKind, handle: BatchHandle): void {
    let pool = this.pools.get(kind.key);
    if (!pool) {
      pool = { kind, parts: [], capacity: 0 };
      this.pools.set(kind.key, pool);
    }
    pool.parts.push(handle);
    if (pool.parts.length > pool.capacity) {
      pool.capacity = capacityFor(pool.parts.length);
      this.changed();
    }
  }

  remove(kind: BatchKind, handle: BatchHandle): void {
    const pool = this.pools.get(kind.key);
    if (!pool) return;
    const index = pool.parts.indexOf(handle);
    if (index >= 0) pool.parts.splice(index, 1);
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  snapshot = (): number => this.version;

  private changed(): void {
    this.version += 1;
    for (const listener of this.listeners) listener();
  }
}

/**
 * Writes instance `i`'s matrix into `array` if it differs, and says whether
 * it did: the pool uploads a buffer only when something in it changed.
 */
export function writeMatrix(array: Float32Array, i: number, elements: ArrayLike<number>): boolean {
  const o = i * 16;
  let changed = false;
  for (let k = 0; k < 16; k++) {
    // Compared as stored: a float32 never equals the float64 it came from.
    const value = Math.fround(elements[k]);
    if (array[o + k] !== value) {
      array[o + k] = value;
      changed = true;
    }
  }
  return changed;
}

/** The same for an instance colour. */
export function writeColor(array: Float32Array, i: number, color: { r: number; g: number; b: number }): boolean {
  const o = i * 3;
  const r = Math.fround(color.r);
  const g = Math.fround(color.g);
  const b = Math.fround(color.b);
  if (array[o] === r && array[o + 1] === g && array[o + 2] === b) return false;
  array[o] = r;
  array[o + 1] = g;
  array[o + 2] = b;
  return true;
}

/** The same for one float per instance. */
export function writeScalar(array: Float32Array, i: number, value: number): boolean {
  const stored = Math.fround(value);
  if (array[i] === stored) return false;
  array[i] = stored;
  return true;
}

/** Per-instance attribute names the patched materials read. */
export const OPACITY_ATTRIBUTE = "instanceOpacity";
export const GLOW_ATTRIBUTE = "instanceGlow";

export interface ExtrasOptions {
  /** `diffuseColor.a *= instanceOpacity`. */
  opacity?: boolean;
  /**
   * `totalEmissiveRadiance *= instanceGlow * instanceColor`: with the
   * material's emissive white, each instance glows in its own colour at its
   * own strength, exactly as `emissive={color} emissiveIntensity={glow}` did.
   */
  glow?: boolean;
}

/** The shader edit behind `withExtras`, exposed so a test can read it. */
export function patchExtras(
  shader: { vertexShader: string; fragmentShader: string },
  options: ExtrasOptions,
): void {
  const vertexPars: string[] = [];
  const vertexBody: string[] = [];
  const fragmentPars: string[] = [];
  if (options.opacity) {
    vertexPars.push(`attribute float ${OPACITY_ATTRIBUTE};`, "varying float vInstanceOpacity;");
    vertexBody.push(`vInstanceOpacity = ${OPACITY_ATTRIBUTE};`);
    fragmentPars.push("varying float vInstanceOpacity;");
  }
  if (options.glow) {
    vertexPars.push(`attribute float ${GLOW_ATTRIBUTE};`, "varying float vInstanceGlow;");
    vertexBody.push(`vInstanceGlow = ${GLOW_ATTRIBUTE};`);
    fragmentPars.push("varying float vInstanceGlow;");
  }
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", `#include <common>\n${vertexPars.join("\n")}`)
    .replace("#include <begin_vertex>", `#include <begin_vertex>\n${vertexBody.join("\n")}`);
  let fragment = shader.fragmentShader.replace(
    "#include <common>",
    `#include <common>\n${fragmentPars.join("\n")}`,
  );
  if (options.opacity) {
    fragment = fragment.replace(
      "#include <color_fragment>",
      "#include <color_fragment>\ndiffuseColor.a *= vInstanceOpacity;",
    );
  }
  if (options.glow) {
    fragment = fragment.replace(
      "#include <emissivemap_fragment>",
      "#include <emissivemap_fragment>\ntotalEmissiveRadiance *= vInstanceGlow * vColor.rgb;",
    );
  }
  shader.fragmentShader = fragment;
}

const kinds = new Map<string, BatchKind>();

/**
 * The one `BatchKind` for `key`, made on first use. Parts compare kinds by
 * identity, so a kind chosen during render must come from here.
 */
export function batchKind(key: string, make: () => Omit<BatchKind, "key">): BatchKind {
  let kind = kinds.get(key);
  if (!kind) {
    kind = { key, ...make() };
    kinds.set(key, kind);
  }
  return kind;
}

/** Teaches a material to read the per-instance opacity and glow. */
export function withExtras<M extends Material>(material: M, options: ExtrasOptions): M {
  material.onBeforeCompile = (shader) => patchExtras(shader, options);
  material.customProgramCacheKey = () => `batch:${options.opacity ? "o" : ""}${options.glow ? "g" : ""}`;
  return material;
}
