"use client";

/**
 * Levels of detail for instanced models.
 *
 * Every instanced layer (buildings, cars, trees, people, props, the crowd)
 * draws its lean model for the whole city, as it always has, and a detailed
 * model for the few instances that are close to the camera. `LodInstances`
 * replaces a layer's `<instancedMesh>`: the renderer keeps writing matrices,
 * colours and per-instance attributes to the lean ("far") mesh exactly as
 * before (the ref IS that mesh), and each frame this picks the instances that
 * cover the most of the screen, copies them into the detailed ("near") mesh
 * and hides them in the far one.
 *
 * Hiding goes through a per-instance `lodHidden` attribute that only this
 * file writes, read in the vertex shader to collapse the instance to a point.
 * Moving a hidden instance's matrix instead would fight the layers that
 * rewrite every matrix every frame (traffic, the reveal). The near mesh has no
 * such attribute, so the same patched material draws both.
 *
 * Near selection is by projected size (instance radius over distance), so the
 * overview camera shows no near instances at all and a street-level view
 * shows the closest dozen or two. The quality tier scales the near cap: high
 * keeps it, medium halves it, low turns detail off entirely.
 */

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import {
  BufferGeometry,
  InstancedBufferAttribute,
  InstancedMesh,
  Vector3,
  type Intersection,
  type Material,
  type Raycaster,
} from "three";
import { useQuality, type QualityTier } from "./quality";

export const LOD_HIDDEN_ATTRIBUTE = "lodHidden";

/** Share of a layer's near cap each tier draws. */
export const NEAR_SHARE: Record<QualityTier, number> = { high: 1, medium: 0.5, low: 0 };

/** Frames between near-set selections; copying the chosen matrices runs every frame. */
const SELECT_EVERY = 4;

const LOD_PATCHED = Symbol("lodPatched");

/**
 * Teaches a material to skip instances flagged `lodHidden`. Idempotent and in
 * place: geometry without the attribute reads it as 0, so every other mesh
 * that shares the material is unaffected.
 */
export function patchLodHidden(material: Material): Material {
  const tagged = material as Material & { [LOD_PATCHED]?: true };
  if (tagged[LOD_PATCHED]) return material;
  tagged[LOD_PATCHED] = true;
  const before = material.onBeforeCompile.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    before(shader, renderer);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\nattribute float ${LOD_HIDDEN_ATTRIBUTE};`)
      // After every other patch has moved the vertex (sway, reveal), so a
      // hidden instance collapses to one point whatever was done to it.
      .replace(
        "#include <project_vertex>",
        `if (${LOD_HIDDEN_ATTRIBUTE} > 0.5) transformed = vec3(0.0);\n#include <project_vertex>`,
      );
  };
  const key = material.customProgramCacheKey.bind(material);
  material.customProgramCacheKey = () => `${key()}-lod`;
  material.needsUpdate = true;
  return material;
}

/**
 * The instances to draw in detail: those whose projected size (bounding
 * radius times the instance's largest scale, over distance to the camera)
 * exceeds `threshold`, the largest first, at most `max`. Instances scaled to
 * nothing (not yet revealed, or parked off stage) are never chosen. Pure, for
 * the tests.
 */
export function selectNear(
  matrices: ArrayLike<number>,
  count: number,
  camera: { x: number; y: number; z: number },
  radius: number,
  threshold: number,
  max: number,
): number[] {
  if (max <= 0 || count <= 0) return [];
  const picked: { index: number; size: number }[] = [];
  for (let i = 0; i < count; i++) {
    const o = i * 16;
    const sx = Math.hypot(matrices[o], matrices[o + 1], matrices[o + 2]);
    const sy = Math.hypot(matrices[o + 4], matrices[o + 5], matrices[o + 6]);
    const sz = Math.hypot(matrices[o + 8], matrices[o + 9], matrices[o + 10]);
    const scale = Math.max(sx, sy, sz);
    if (scale < 1e-4 || Math.min(sx, sy, sz) < 1e-4) continue;
    const dx = matrices[o + 12] - camera.x;
    const dy = matrices[o + 13] - camera.y;
    const dz = matrices[o + 14] - camera.z;
    const distance = Math.max(Math.hypot(dx, dy, dz), 1e-3);
    const size = (radius * scale) / distance;
    if (size >= threshold) picked.push({ index: i, size });
  }
  picked.sort((a, b) => b.size - a.size);
  return picked.slice(0, max).map((p) => p.index);
}

/** Un-hides the far instances that were near and hides those that now are. */
export function swapHidden(hidden: { setX(index: number, value: number): unknown }, previous: readonly number[], next: readonly number[]): void {
  for (const i of previous) hidden.setX(i, 0);
  for (const i of next) hidden.setX(i, 1);
}

/** A geometry that shares every attribute of `source` but can carry its own instanced ones. */
function shareGeometry(source: BufferGeometry): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setIndex(source.index);
  for (const [name, attribute] of Object.entries(source.attributes)) geometry.setAttribute(name, attribute);
  for (const group of source.groups) geometry.addGroup(group.start, group.count, group.materialIndex);
  if (!source.boundingSphere) source.computeBoundingSphere();
  geometry.boundingSphere = source.boundingSphere?.clone() ?? null;
  return geometry;
}

/** A raycast that hits nothing: the near mesh's, when the far one does the picking. */
export const NO_RAYCAST: (raycaster: Raycaster, intersects: Intersection[]) => void = () => {};

export interface LodHandlers {
  onPointerOver?: (event: ThreeEvent<PointerEvent>) => void;
  onPointerMove?: (event: ThreeEvent<PointerEvent>) => void;
  onPointerOut?: (event: ThreeEvent<PointerEvent>) => void;
  onClick?: (event: ThreeEvent<MouseEvent>) => void;
}

export interface LodInstancesProps {
  /** The lean model, drawn for every instance that is not near. */
  geometry: BufferGeometry;
  /** The detailed model, in the same frame and unit space; null draws only the lean one. */
  nearGeometry?: BufferGeometry | null;
  material: Material;
  count: number;
  /** Most instances drawn in detail at once on the high tier. */
  maxNear: number;
  /** Projected size (radius over distance) past which an instance is drawn in detail. */
  nearSize?: number;
  /**
   * Shares one selection between the parts of a single object (a person's body
   * and head, which move by separate matrices and would otherwise pick their
   * near sets independently). The first part publishes what it chose here; the
   * others pass `follow` and draw exactly that set, so mount the publisher first.
   */
  selection?: { current: number[] };
  follow?: boolean;
  /** Per-instance attributes on `geometry` (e.g. `instanceAccent`) to mirror onto the near mesh. */
  instancedAttributes?: readonly string[];
  /** Pointer handlers; near-mesh events are mapped back to the far instance id. */
  handlers?: LodHandlers;
  /**
   * The far mesh's own picking, for a layer that does not use three's per-
   * triangle `InstancedMesh.raycast` (the crowd's box table). A far instance
   * that is drawn near keeps its far matrix, so this still finds it, by its
   * far id and with no mapping; the near mesh is then not raycast at all
   * (no second hit on the same object, no triangle tests over its detail).
   */
  raycast?: (raycaster: Raycaster, intersects: Intersection[]) => void;
  castShadow?: boolean;
  receiveShadow?: boolean;
  frustumCulled?: boolean;
  renderOrder?: number;
}

/**
 * An instanced layer with a detailed near level. The forwarded ref is the far
 * `InstancedMesh`: write to it exactly as to the `<instancedMesh>` it replaces.
 */
export const LodInstances = forwardRef<InstancedMesh, LodInstancesProps>(function LodInstances(
  {
    geometry,
    nearGeometry = null,
    material,
    count,
    maxNear,
    nearSize = 0.06,
    instancedAttributes = [],
    selection,
    follow = false,
    handlers,
    raycast,
    castShadow = false,
    receiveShadow = false,
    frustumCulled = false,
    renderOrder,
  },
  ref,
) {
  const { tier } = useQuality();
  const cap = nearGeometry ? Math.floor(maxNear * NEAR_SHARE[tier]) : 0;

  const farRef = useRef<InstancedMesh>(null);
  const nearRef = useRef<InstancedMesh>(null);
  useImperativeHandle(ref, () => farRef.current as InstancedMesh, []);

  useMemo(() => patchLodHidden(material), [material]);

  const farGeometry = useMemo(() => {
    const shared = shareGeometry(geometry);
    shared.setAttribute(LOD_HIDDEN_ATTRIBUTE, new InstancedBufferAttribute(new Float32Array(Math.max(1, count)), 1));
    return shared;
  }, [geometry, count]);

  const nearShared = useMemo(() => {
    if (!nearGeometry || cap === 0) return null;
    const shared = shareGeometry(nearGeometry);
    for (const name of instancedAttributes) {
      const source = geometry.getAttribute(name);
      if (source) shared.setAttribute(name, new InstancedBufferAttribute(new Float32Array(cap * source.itemSize), source.itemSize));
    }
    return shared;
  }, [nearGeometry, cap, geometry, instancedAttributes]);

  useEffect(() => () => farGeometry.dispose(), [farGeometry]);
  useEffect(() => () => nearShared?.dispose(), [nearShared]);

  const near = useRef<number[]>([]);
  const frame = useRef(0);
  const radius = useMemo(() => {
    if (!geometry.boundingSphere) geometry.computeBoundingSphere();
    return geometry.boundingSphere?.radius ?? 1;
  }, [geometry]);
  const cameraAt = useMemo(() => new Vector3(), []);

  useFrame(({ camera }) => {
    const far = farRef.current;
    const nearMesh = nearRef.current;
    if (!far) return;
    const hidden = farGeometry.getAttribute(LOD_HIDDEN_ATTRIBUTE) as InstancedBufferAttribute;
    if (!nearMesh || !nearShared || cap === 0) {
      if (near.current.length) {
        for (const i of near.current) hidden.setX(i, 0);
        hidden.needsUpdate = true;
        near.current = [];
      }
      return;
    }

    if (follow && selection) {
      if (selection.current !== near.current) {
        swapHidden(hidden, near.current, selection.current);
        hidden.needsUpdate = true;
        near.current = selection.current;
      }
    } else if (frame.current++ % SELECT_EVERY === 0) {
      camera.getWorldPosition(cameraAt);
      // Matrices are in the layer's parent frame; the city groups are not
      // transformed, so world and parent frames agree.
      const chosen = selectNear(far.instanceMatrix.array, far.count, cameraAt, radius, nearSize, cap);
      swapHidden(hidden, near.current, chosen);
      hidden.needsUpdate = true;
      near.current = chosen;
      if (selection) selection.current = chosen;
    }

    // Copy every frame: moving layers rewrite their far matrices each frame.
    const chosen = near.current;
    const src = far.instanceMatrix.array;
    const dst = nearMesh.instanceMatrix.array;
    for (let k = 0; k < chosen.length; k++) {
      const from = chosen[k] * 16;
      for (let e = 0; e < 16; e++) dst[k * 16 + e] = src[from + e];
    }
    nearMesh.instanceMatrix.needsUpdate = true;
    if (far.instanceColor) {
      if (!nearMesh.instanceColor) {
        nearMesh.instanceColor = new InstancedBufferAttribute(new Float32Array(cap * 3), 3);
      }
      const cs = far.instanceColor.array;
      const cd = nearMesh.instanceColor.array;
      for (let k = 0; k < chosen.length; k++) {
        const from = chosen[k] * 3;
        cd[k * 3] = cs[from];
        cd[k * 3 + 1] = cs[from + 1];
        cd[k * 3 + 2] = cs[from + 2];
      }
      nearMesh.instanceColor.needsUpdate = true;
    }
    for (const name of instancedAttributes) {
      const source = geometry.getAttribute(name);
      const target = nearShared.getAttribute(name);
      if (!source || !target) continue;
      const size = source.itemSize;
      for (let k = 0; k < chosen.length; k++) {
        for (let c = 0; c < size; c++) target.array[k * size + c] = source.array[chosen[k] * size + c];
      }
      target.needsUpdate = true;
    }
    nearMesh.count = chosen.length;
  });

  const nearHandlers = useMemo<LodHandlers | undefined>(() => {
    if (!handlers) return undefined;
    // A near-mesh event carries the near instance's index: hand the handler
    // the far instance it stands for.
    const map = <E extends { instanceId?: number }>(event: E): E => {
      const k = event.instanceId;
      if (k === undefined) return event;
      return Object.assign(Object.create(Object.getPrototypeOf(event)) as E, event, { instanceId: near.current[k] });
    };
    const { onPointerOver, onPointerMove, onPointerOut, onClick } = handlers;
    return {
      onPointerOver: onPointerOver && ((event) => onPointerOver(map(event))),
      onPointerMove: onPointerMove && ((event) => onPointerMove(map(event))),
      onPointerOut: onPointerOut && ((event) => onPointerOut(map(event))),
      onClick: onClick && ((event) => onClick(map(event))),
    };
  }, [handlers]);

  return (
    <>
      <instancedMesh
        ref={farRef}
        args={[farGeometry, material, count]}
        castShadow={castShadow}
        receiveShadow={receiveShadow}
        frustumCulled={frustumCulled}
        renderOrder={renderOrder}
        {...(raycast ? { raycast } : {})}
        {...handlers}
      />
      {nearShared && (
        <instancedMesh
          ref={nearRef}
          args={[nearShared, material, cap]}
          count={0}
          castShadow={castShadow}
          receiveShadow={receiveShadow}
          frustumCulled={false}
          renderOrder={renderOrder}
          {...(raycast ? { raycast: NO_RAYCAST } : {})}
          {...nearHandlers}
        />
      )}
    </>
  );
});
