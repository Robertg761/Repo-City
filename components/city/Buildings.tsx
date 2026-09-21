"use client";

/**
 * The building layer (PLAN.md sections 9, 37, 38).
 *
 * One `InstancedMesh` per visual tier, box geometry, per-instance colour from
 * `colorIndex` through the single building palette -- the programming language
 * never changes the art style. A second instanced mesh per tier draws the lit
 * window stripes, which keeps the facades from reading as blank blocks without
 * costing a texture or a draw call per building.
 *
 * Picking goes through `event.instanceId` into the `ids` array from
 * `instances.ts`. Hover tints the instance, selection tints it harder; neither
 * spawns a mesh.
 */

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Color, Object3D, type InstancedMesh } from "three";
import type { Building } from "@/types/city";
import { useCityStore } from "@/store/useCityStore";
import { groupByTier, windowBands, type TierGroup } from "./instances";
import {
  WINDOW_COLOR,
  buildingColor,
  desaturate,
  stateTint,
  type SceneAtmosphere,
} from "./palette";
import { revealScale } from "./reveal";
import { useInstanceHandlers } from "./useEntity";
import { useRevealClock } from "./useReveal";

const scratch = new Object3D();
const scratchColor = new Color();

function TierInstances({
  group,
  atmosphere,
}: {
  group: TierGroup;
  atmosphere: SceneAtmosphere;
}) {
  const meshRef = useRef<InstancedMesh>(null);
  const bandRef = useRef<InstancedMesh>(null);
  const clock = useRevealClock();
  const settled = useRef(false);
  const handlers = useInstanceHandlers(group.ids);
  const hoveredId = useCityStore((s) => s.hoveredId);
  const selectedId = useCityStore((s) => s.selectedId);

  const bands = useMemo(() => windowBands(group.buildings), [group]);
  const baseColors = useMemo(
    () =>
      group.buildings.map((b) =>
        desaturate(buildingColor(b.colorIndex), atmosphere.desaturation),
      ),
    [group, atmosphere.desaturation],
  );

  // Rebuild the reveal when a new model arrives.
  useEffect(() => {
    settled.current = false;
  }, [clock, group]);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh || settled.current) return;
    const now = performance.now();
    const heights: number[] = [];
    let done = true;

    group.buildings.forEach((b, i) => {
      const grow = revealScale(now, clock.current, b.appearAt);
      if (grow < 1) done = false;
      const height = Math.max(b.size[1] * grow, 0.0001);
      heights[i] = height;
      const visible = grow > 0.002;
      scratch.position.set(b.position[0], b.position[1] + height / 2, b.position[2]);
      scratch.rotation.set(0, b.rotationY, 0);
      scratch.scale.set(visible ? b.size[0] : 0, height, visible ? b.size[2] : 0);
      scratch.updateMatrix();
      mesh.setMatrixAt(i, scratch.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;

    const bandMesh = bandRef.current;
    if (bandMesh) {
      bands.forEach((band, i) => {
        const b = group.buildings[band.buildingIndex];
        const height = heights[band.buildingIndex] ?? 0;
        const visible = height > 0.01;
        scratch.position.set(
          b.position[0],
          b.position[1] + height * band.fraction,
          b.position[2],
        );
        scratch.rotation.set(0, b.rotationY, 0);
        // Slightly proud of the facade so the stripe never z-fights.
        scratch.scale.set(
          visible ? b.size[0] * 1.012 : 0,
          band.thickness,
          visible ? b.size[2] * 1.012 : 0,
        );
        scratch.updateMatrix();
        bandMesh.setMatrixAt(i, scratch.matrix);
      });
      bandMesh.instanceMatrix.needsUpdate = true;
    }

    if (done) settled.current = true;
  });

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    group.buildings.forEach((b, i) => {
      scratchColor.set(stateTint(baseColors[i], b.id === hoveredId, b.id === selectedId));
      mesh.setColorAt(i, scratchColor);
    });
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [group, baseColors, hoveredId, selectedId]);

  return (
    <group>
      <instancedMesh
        ref={meshRef}
        args={[undefined, undefined, group.buildings.length]}
        castShadow
        receiveShadow
        frustumCulled={false}
        {...handlers}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.82} metalness={0} />
      </instancedMesh>

      {bands.length > 0 && (
        <instancedMesh ref={bandRef} args={[undefined, undefined, bands.length]} frustumCulled={false}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial
            color={WINDOW_COLOR}
            emissive={WINDOW_COLOR}
            emissiveIntensity={0.15 + atmosphere.windowGlow * 1.1}
            roughness={0.45}
            metalness={0}
            toneMapped={false}
          />
        </instancedMesh>
      )}
    </group>
  );
}

export default function Buildings({
  buildings,
  atmosphere,
}: {
  buildings: readonly Building[];
  atmosphere: SceneAtmosphere;
}) {
  const groups = useMemo(() => groupByTier(buildings), [buildings]);
  return (
    <group>
      {groups.map((group) => (
        <TierInstances key={group.tier} group={group} atmosphere={atmosphere} />
      ))}
    </group>
  );
}
