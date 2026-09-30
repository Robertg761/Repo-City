"use client";

/**
 * The small things in the land (`small.ts` plans them): the yards round the
 * houses and farmsteads (beds, bushes, low hedges, round bales, a parked
 * tractor), and the shrubs along the edges of the woods. All of them are the
 * city's own models (street furniture, farmland, the village tractor), one
 * instanced draw a kind through the city's own materials, each with the near
 * level the city gives it where there is one.
 */

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { Color, Object3D, type BufferGeometry, type InstancedMesh, type Material, type MeshStandardMaterial } from "three";
import { LodInstances } from "../lod";
import { baleGeometry, hedgeGeometry } from "../models/buildings/farmland";
import { buildingDetailMaterial } from "../models/buildings/material";
import { tintedMaterial } from "../models/props/material";
import { CAR_PAINT_PATTERN } from "../models/props/material";
import { baleNearGeometry, furnitureNearGeometry, nearSizeAt } from "../models/props/near";
import { furnitureGeometry } from "../models/props/streetFurniture";
import { SPECIES_LEAF } from "../models/props/trees";
import { useNearModels } from "../models/useModels";
import { TRACTOR_COLORS, tractorParkedGeometry } from "../models/vehicles/shapes";
import { desaturate, mix, type SceneAtmosphere } from "../palette";
import { useQuality } from "../quality";
import { useSkyFrame } from "../sky";
import { planUndergrowth, planYards, type YardItem, type YardKind } from "./small";
import type { HouseSpot } from "./plan";

const scratch = new Object3D();
const tint = new Color();
const none = () => null;

interface Piece {
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** Uniform scale, or along x for a hedge. */
  sx: number;
  sy: number;
  sz: number;
  color?: string;
}

/** One instanced kind of small thing, with a near level for the few the camera is close to. */
function PropLayer({
  geometry,
  nearGeometry = null,
  material,
  pieces,
  maxNear,
  nearDistance,
  castShadow = false,
}: {
  geometry: BufferGeometry;
  nearGeometry?: BufferGeometry | null;
  material: Material;
  pieces: readonly Piece[];
  maxNear: number;
  nearDistance: number;
  castShadow?: boolean;
}) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    pieces.forEach((p, i) => {
      scratch.position.set(p.x, p.y, p.z);
      scratch.rotation.set(0, p.yaw, 0);
      scratch.scale.set(p.sx, p.sy, p.sz);
      scratch.updateMatrix();
      mesh.setMatrixAt(i, scratch.matrix);
      if (p.color) {
        tint.set(p.color);
        mesh.setColorAt(i, tint);
      }
    });
    mesh.count = pieces.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [pieces, material]);
  if (pieces.length === 0) return null;
  return (
    <LodInstances
      key={`${pieces.length}:${material.uuid}`}
      ref={ref}
      geometry={geometry}
      nearGeometry={nearGeometry}
      material={material}
      count={pieces.length}
      maxNear={maxNear}
      nearSize={nearSizeAt(geometry, nearDistance)}
      castShadow={castShadow}
      receiveShadow
      frustumCulled={false}
      raycast={none}
    />
  );
}

const HEDGE_GREEN = "#4f7a3f";

function useDispose(value: { dispose(): void } | null): void {
  useEffect(() => () => value?.dispose(), [value]);
}

/** The city's furniture material: painted by role, the paint mask takes the instance colour. */
function useFurnitureMaterial(): MeshStandardMaterial {
  const { textureSize, anisotropy } = useQuality();
  const material = useMemo(() => tintedMaterial({ roughness: 0.9 }, undefined, { textureSize, anisotropy, surfaceAttribute: true }), [textureSize, anisotropy]);
  useDispose(material);
  return material;
}

/** Shrubs, bushes, beds: the city's furniture models. */
function useFurniture(desat: number) {
  const version = useNearModels();
  return useMemo(
    () => ({
      bush: { lean: furnitureGeometry("bush", desat), near: furnitureNearGeometry("bush", desat) },
      bed: { lean: furnitureGeometry("bed", desat), near: furnitureNearGeometry("bed", desat) },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the version is the near model arriving
    [desat, version],
  );
}

const leaf = new Color();
const hsl = { h: 0, s: 0, l: 0 };
/** A shrub's own green, off the broadleaf's: darker, and a touch bluer or yellower by its roll. */
function shrubColor(t: number, desat: number): string {
  leaf.set(SPECIES_LEAF.broadleaf).getHSL(hsl);
  leaf.setHSL((hsl.h + (t - 0.5) * 0.08 + 1) % 1, Math.min(1, hsl.s * (0.85 + t * 0.3)), Math.max(0.1, hsl.l * (0.95 + ((t * 7.7) % 1) * 0.35)));
  return desaturate(`#${leaf.getHexString()}`, desat);
}

/** The shrubs at the edge of the copses, and the odd one under a lone tree. */
export function Undergrowth({
  trees,
  sample,
  atmosphere,
}: {
  trees: readonly { x: number; z: number; scale: number; kind: 0 | 1 | 2 | 3 | 4; shade: number }[];
  sample: (x: number, z: number) => number;
  atmosphere: SceneAtmosphere;
}) {
  const { tier } = useQuality();
  const desat = atmosphere.desaturation;
  const material = useFurnitureMaterial();
  const geo = useFurniture(desat);
  const pieces = useMemo<Piece[]>(
    () =>
      planUndergrowth(trees, tier === "high" ? 900 : 450).map((s) => ({
        x: s.x,
        y: sample(s.x, s.z) - 0.05,
        z: s.z,
        yaw: s.yaw,
        sx: s.scale,
        sy: s.scale * (0.85 + s.tint * 0.3),
        sz: s.scale,
        color: shrubColor(s.tint, desat),
      })),
    [trees, sample, tier, desat],
  );
  return <PropLayer geometry={geo.bush.lean} nearGeometry={geo.bush.near} material={material} pieces={pieces} maxNear={24} nearDistance={12} />;
}

/** The dressing of the yards: what stands round each farmstead and garden. */
export function Yards({
  houses,
  sample,
  atmosphere,
}: {
  houses: readonly HouseSpot[];
  sample: (x: number, z: number) => number;
  atmosphere: SceneAtmosphere;
}) {
  const { textureSize, anisotropy } = useQuality();
  const desat = atmosphere.desaturation;
  const furnitureMaterial = useFurnitureMaterial();
  const furniture = useFurniture(desat);
  const version = useNearModels();

  const parked = useMemo(
    () => tintedMaterial({ roughness: 0.55, metalness: 0.08 }, undefined, { textureSize, anisotropy, surfaceAttribute: true, patternStrength: CAR_PAINT_PATTERN }),
    [textureSize, anisotropy],
  );
  useDispose(parked);
  // The hedges and the bales share the farmland's own shading, and the hedge its night fill.
  const farm = useMemo(() => {
    const make = (roughness: number, geometry: BufferGeometry) =>
      buildingDetailMaterial({ roughness, flatShading: true }, { textureSize, anisotropy, surfaceAttribute: geometry.hasAttribute("surface"), surface: 9 });
    const hedge = make(0.95, hedgeGeometry());
    hedge.emissive.set("#24421a");
    return {
      hedge,
      bale: make(0.9, baleGeometry()),
      // The hedge's own green fades with the light: the sun's bounce by day, a little moon and sky fill at night.
      tune: (night: number) => {
        hedge.emissiveIntensity = 0.55 * (1 - night) + 0.8 * night;
      },
    };
  }, [textureSize, anisotropy]);
  useDispose(farm.hedge);
  useDispose(farm.bale);
  useSkyFrame((sky) => farm.tune(sky.nightness), farm);

  const items = useMemo(() => planYards(houses), [houses]);
  const pieces = useMemo(() => {
    const by: Record<YardKind, Piece[]> = { bed: [], bush: [], bale: [], tractor: [], hedge: [] };
    const base = (i: YardItem) => sample(i.x, i.z);
    for (const i of items) {
      const y = base(i) - 0.04;
      const piece: Piece = { x: i.x, y, z: i.z, yaw: i.yaw, sx: i.scale, sy: i.scale, sz: i.scale };
      if (i.kind === "hedge") {
        // A yard hedge is knee to waist high, not a field boundary.
        piece.sx = i.length;
        piece.sy = 0.62 + i.tint * 0.2;
        piece.sz = 0.9;
        piece.color = desaturate(mix(HEDGE_GREEN, "#6d9448", i.tint * 0.6), desat);
      } else if (i.kind === "bush") {
        piece.color = shrubColor(i.tint, desat);
        piece.sy = i.scale * (0.85 + i.tint * 0.3);
      } else if (i.kind === "tractor") {
        piece.color = TRACTOR_COLORS[Math.floor(i.tint * 4) % 4];
      } else if (i.kind === "bale") {
        piece.color = "#ffffff";
      }
      by[i.kind].push(piece);
    }
    return by;
  }, [items, sample, desat]);
  const bale = useMemo(
    () => baleNearGeometry(),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the version is the near model arriving
    [version],
  );

  return (
    <group>
      <PropLayer geometry={hedgeGeometry()} material={farm.hedge} pieces={pieces.hedge} maxNear={0} nearDistance={10} />
      <PropLayer geometry={baleGeometry()} nearGeometry={bale} material={farm.bale} pieces={pieces.bale} maxNear={12} nearDistance={16} />
      <PropLayer geometry={tractorParkedGeometry()} material={parked} pieces={pieces.tractor} maxNear={0} nearDistance={10} />
      <PropLayer geometry={furniture.bush.lean} nearGeometry={furniture.bush.near} material={furnitureMaterial} pieces={pieces.bush} maxNear={16} nearDistance={12} />
      <PropLayer geometry={furniture.bed.lean} nearGeometry={furniture.bed.near} material={furnitureMaterial} pieces={pieces.bed} maxNear={16} nearDistance={12} />
    </group>
  );
}
