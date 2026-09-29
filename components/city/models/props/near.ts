/**
 * The near levels of the instanced street scenery (`../../lod.tsx`): the
 * detailed models `LodInstances` swaps in for the few trees, lamps, benches,
 * bins, bushes, flower beds, bus stops, rooftop units, water tanks and hay
 * bales the camera is close to. The lean models (`trees.ts`,
 * `streetFurniture.ts`, `../buildings/geometry.ts`, `../buildings/farmland.ts`)
 * still draw everything else.
 *
 * A near model stands in the same frame, on the same pivot and inside the
 * same outline as the lean one, with the same material roles, so the swap
 * shows only as more detail. They are authored in `blender/props/*_near.py`
 * and `blender/street2/street2_near.py`; like every model they are read on
 * use, never when this module loads. Under `?models=procedural` there are no
 * near levels: the accessors return null and the layers draw only the lean
 * ones.
 */

import type { BufferGeometry } from "three";
import { SURFACE } from "../../textures/surface-types";
import { desaturate } from "../../palette";
import { importedParts } from "../imported";
import { BLENDER_MODELS } from "../modelSource";
import { geometryCache, mergeParts, toneKey } from "./geometry";
import type { FurnitureKind } from "./streetFurniture";
import type { TreeSpecies } from "./trees";
import { MODEL as FURNITURE_NEAR } from "./streetFurnitureNear.model";
import { MODEL as STREET2_NEAR } from "./street2Near.model";
import { MODEL as TREES_NEAR } from "./treesNear.model";

/**
 * The projected size (radius over distance) at which a lean model's instance
 * of radius `radius` goes near, for the camera distance in world units where
 * that should happen. Distances read better than sizes: "a bench is detailed
 * inside 14 units".
 */
export function nearSizeAt(geometry: BufferGeometry, distance: number): number {
  if (!geometry.boundingSphere) geometry.computeBoundingSphere();
  return (geometry.boundingSphere?.radius ?? 1) / distance;
}

const TREE_NODE: Record<TreeSpecies, string> = {
  broadleaf: "TreeBroadleafNear",
  conifer: "TreeConiferNear",
  poplar: "TreePoplarNear",
  birch: "TreeBirchNear",
};

const treeBuilder = geometryCache<string>((key) => {
  const [species, tone] = key.split(":");
  return mergeParts(
    importedParts(TREES_NEAR, TREE_NODE[species as TreeSpecies], (hex) => desaturate(hex, Number(tone))).map((part) => ({
      ...part,
      // As the lean trees: the crown is foliage and takes the leaf tint, bark is timber.
      surface: part.paint ? SURFACE.foliage : SURFACE.timber,
    })),
  );
});

/** A species' near tree, whatever the flag says, for its tests and renders. */
export const blenderTreeNearGeometry = (species: TreeSpecies, desaturation = 0): BufferGeometry =>
  treeBuilder(`${species}:${toneKey(desaturation)}`);

/** A species' near tree, or null when the procedural models are on. */
export const treeNearGeometry = (species: TreeSpecies, desaturation = 0): BufferGeometry | null =>
  BLENDER_MODELS ? blenderTreeNearGeometry(species, desaturation) : null;

const FURNITURE_NODE: Record<FurnitureKind, { model: typeof FURNITURE_NEAR; node: string }> = {
  bench: { model: FURNITURE_NEAR, node: "BenchNear" },
  bin: { model: FURNITURE_NEAR, node: "BinNear" },
  stop: { model: STREET2_NEAR, node: "BusStopNear" },
  bush: { model: FURNITURE_NEAR, node: "BushNear" },
  bed: { model: FURNITURE_NEAR, node: "BedNear" },
};

const furnitureBuilder = geometryCache<string>((key) => {
  const [kind, tone] = key.split(":");
  const { model, node } = FURNITURE_NODE[kind as FurnitureKind];
  return mergeParts(importedParts(model, node, (hex) => desaturate(hex, Number(tone))));
});

/** A kind of street furniture's near model, whatever the flag says. */
export const blenderFurnitureNearGeometry = (kind: FurnitureKind, desaturation = 0): BufferGeometry =>
  furnitureBuilder(`${kind}:${toneKey(desaturation)}`);

/** A kind of street furniture's near model, or null under the procedural models. */
export const furnitureNearGeometry = (kind: FurnitureKind, desaturation = 0): BufferGeometry | null =>
  BLENDER_MODELS ? blenderFurnitureNearGeometry(kind, desaturation) : null;

interface LampParts {
  pole: BufferGeometry;
  head: BufferGeometry;
}

let lamp: LampParts | undefined;

/**
 * The near street lamp, standing on the ground like the lean one
 * (`blenderLampGeometry`): the pole with its plinth, fluting, collars and
 * lantern cage, and the lantern's glass and bulb as their own mesh for the
 * emissive material.
 */
export function blenderLampNearGeometry(): LampParts {
  const at = (node: string) => mergeParts(importedParts(FURNITURE_NEAR, node, () => "#ffffff"));
  return (lamp ??= { pole: at("LampPoleNear"), head: at("LampHeadNear") });
}

export const lampNearGeometry = (): LampParts | null => (BLENDER_MODELS ? blenderLampNearGeometry() : null);

let block: BufferGeometry | undefined;
let tank: BufferGeometry | undefined;
let bale: BufferGeometry | undefined;

/** The near rooftop unit: `Block`'s unit box, louvred and fanned in detail. */
export const blenderPropBlockNearGeometry = (): BufferGeometry =>
  (block ??= mergeParts(importedParts(STREET2_NEAR, "BlockNear", (hex) => hex)));

/** The near water tank: `Tank`'s footprint with staves, hoops, bolts and a hatch. */
export const blenderPropTankNearGeometry = (): BufferGeometry =>
  (tank ??= mergeParts(importedParts(STREET2_NEAR, "TankNear", (hex) => hex)));

/** The near round bale: wound ends, twine and loose straw. */
export const blenderBaleNearGeometry = (): BufferGeometry =>
  (bale ??= mergeParts(importedParts(STREET2_NEAR, "BaleNear", (hex) => hex)));

export const propBlockNearGeometry = (): BufferGeometry | null => (BLENDER_MODELS ? blenderPropBlockNearGeometry() : null);
export const propTankNearGeometry = (): BufferGeometry | null => (BLENDER_MODELS ? blenderPropTankNearGeometry() : null);
export const baleNearGeometry = (): BufferGeometry | null => (BLENDER_MODELS ? blenderBaleNearGeometry() : null);
