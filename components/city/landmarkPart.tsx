"use client";

/**
 * One landmark slot, drawn with one material: the unit every landmark is
 * painted from (`Landmark.tsx`) and the animated parts hang on
 * (`landmarkAnimated.tsx`).
 */

import { useEffect, useMemo, type Ref } from "react";
import type { BufferGeometry, InstancedMesh, MeshStandardMaterial, Plane } from "three";
import { buildingDetailMaterial } from "./models/buildings/material";
import { useQuality } from "./quality";
import { waveFlag } from "./flagWave";

/** One merged slot, drawn with one material. Absent slots draw nothing. */
export function Part({
  geometry,
  color,
  roughness = 0.8,
  metalness = 0,
  emissive,
  emissiveIntensity = 0,
  materialRef,
  cast = true,
  receive = true,
  clip,
  instances,
  meshRef,
  wave = false,
}: {
  geometry: BufferGeometry | undefined;
  color: string;
  roughness?: number;
  metalness?: number;
  emissive?: string;
  emissiveIntensity?: number;
  materialRef?: Ref<MeshStandardMaterial>;
  cast?: boolean;
  receive?: boolean;
  /** World-space clipping planes, shadows included. */
  clip?: Plane[];
  /** Draws this many copies as an instanced mesh, placed by the caller through `meshRef`. */
  instances?: number;
  meshRef?: Ref<InstancedMesh>;
  /** Waves the cloth in the wind: the geometry carries the flap attributes (`flagWave.ts`). */
  wave?: boolean;
}) {
  const { textureSize, anisotropy } = useQuality();
  const material = useMemo(() => {
    const parameters = {
      color, roughness, metalness,
      emissive: emissive ?? "#000000", emissiveIntensity,
      toneMapped: emissive === undefined,
      clippingPlanes: clip ?? null, clipShadows: clip !== undefined,
      // Only the Blender models carry vertex colours (baked occlusion).
      vertexColors: geometry?.hasAttribute("color") ?? false,
    };
    const made = buildingDetailMaterial(parameters, {
      textureSize, anisotropy, surfaceAttribute: geometry?.hasAttribute("surface") ?? false,
    });
    return wave ? waveFlag(made) : made;
  }, [geometry, color, roughness, metalness, emissive, emissiveIntensity, clip, textureSize, anisotropy, wave]);
  useEffect(() => () => material.dispose(), [material]);
  if (!geometry) return null;
  if (instances !== undefined) {
    return (
      <instancedMesh
        ref={meshRef}
        key={instances}
        args={[geometry, undefined, instances]}
        castShadow={cast}
        receiveShadow={receive}
        frustumCulled={false}
      >
        <primitive ref={materialRef} object={material} attach="material" />
      </instancedMesh>
    );
  }
  return (
    <mesh geometry={geometry} castShadow={cast} receiveShadow={receive}>
      <primitive ref={materialRef} object={material} attach="material" />
    </mesh>
  );
}

