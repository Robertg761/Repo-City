"use client";

/**
 * Landmark files become recognisable civic structures rather than ordinary
 * blocks (PLAN.md section 10): README, the manifest, CONTRIBUTING, CHANGELOG
 * and the Dockerfile.
 *
 * Each one gets a civic identity a viewer can name without a caption -- a
 * library behind its columns and pediment, a hall with a clock tower and a
 * belfry, an archive under its buttresses and lantern, a goods yard with
 * roll-up doors and stacked containers, a meeting house with a porch, dormers
 * and a flag -- and each is built to the plot the generator reserved in
 * `building.size`, so a landmark never grows into the block next door.
 *
 * They are drawn the way the ordinary buildings are: one merged, flat-shaded
 * mesh for the body and one for the warm glass, which is what lets them carry
 * three times the detail for two draw calls each (PLAN.md sections 38, 63).
 * The colour attribute is re-tinted on hover and selection -- five buildings,
 * a few thousand vertices, no new geometry.
 *
 * They share the palette and the silhouette language of the rest of the city:
 * the difference is a roof feature, not a different art style.
 */

import { useEffect, useMemo, useRef } from "react";
import { Color, type BufferAttribute, type BufferGeometry } from "three";
import type { LandmarkFile } from "@/types/analysis";
import type { Building } from "@/types/city";
import { toGeometry } from "./models/buildings/geometry";
import { buildCivic, type CivicPalette } from "./models/buildings/civic";
import type { Rgb3 } from "./models/buildings/mesh";
import {
  CIVIC_COLOR,
  CIVIC_ROOF,
  HAZARD_RED,
  HIGHLIGHT,
  SELECT,
  WINDOW_COLOR,
  desaturate,
  mix,
  type SceneAtmosphere,
} from "./palette";
import { useEntityHandlers, useEntityState } from "./useEntity";
import { useRevealGroup } from "./useReveal";

interface CivicBuildingProps {
  building: Building;
  atmosphere: SceneAtmosphere;
}

const scratchColor = new Color();

/** Palette hex -> the renderer's working colour space, once per city. */
function toRgb(hex: string, desaturation: number): Rgb3 {
  scratchColor.set(desaturate(hex, desaturation));
  return [scratchColor.r, scratchColor.g, scratchColor.b];
}

function civicPalette(desaturation: number): CivicPalette {
  return {
    wall: toRgb(CIVIC_COLOR, desaturation),
    stone: toRgb("#f4f1e8", desaturation),
    roof: toRgb(CIVIC_ROOF, desaturation),
    accent: toRgb("#7fa9bd", desaturation),
    trim: toRgb(mix(CIVIC_COLOR, "#ffffff", 0.5), desaturation),
    door: toRgb("#5a5347", desaturation),
    window: toRgb("#4a5560", desaturation),
    metal: toRgb("#9aa0a0", desaturation),
    flag: toRgb(mix(HAZARD_RED, "#e8853c", 0.35), desaturation),
    containers: [
      toRgb("#4a86a8", desaturation),
      toRgb("#b4693f", desaturation),
      toRgb("#6f8f6a", desaturation),
    ],
  };
}

/** Hover brightens, selection pushes to the warm accent (PLAN.md section 42). */
function tintInto(geometry: BufferGeometry, base: Float32Array, hovered: boolean, selected: boolean) {
  const attribute = geometry.getAttribute("color") as BufferAttribute | undefined;
  if (!attribute) return;
  const array = attribute.array as Float32Array;
  const amount = selected ? 0.38 : hovered ? 0.28 : 0;
  if (amount === 0) {
    array.set(base);
  } else {
    scratchColor.set(selected ? SELECT : HIGHLIGHT);
    const { r, g, b } = scratchColor;
    for (let i = 0; i < array.length; i += 3) {
      array[i] = base[i] + (r - base[i]) * amount;
      array[i + 1] = base[i + 1] + (g - base[i + 1]) * amount;
      array[i + 2] = base[i + 2] + (b - base[i + 2]) * amount;
    }
  }
  attribute.needsUpdate = true;
}

export default function CivicBuilding({ building, atmosphere }: CivicBuildingProps) {
  const { hovered, selected } = useEntityState(building.id);
  const handlers = useEntityHandlers(building.id);
  const reveal = useRevealGroup(building.appearAt);
  const [width, height, depth] = building.size;
  const kind: LandmarkFile | null = building.plan.landmark;

  const model = useMemo(() => {
    if (!kind) return null;
    const palette = civicPalette(atmosphere.desaturation);
    const drafts = buildCivic(kind, { w: width, h: height, d: depth }, palette);
    return {
      body: toGeometry(drafts.body),
      glow: toGeometry(drafts.glow),
      baseColors: Float32Array.from(drafts.body.colors),
    };
  }, [kind, width, height, depth, atmosphere.desaturation]);

  // The geometry belongs to this model, not to a module cache: a new city has
  // to be able to hand the old one back to the GPU.
  useEffect(() => {
    if (!model) return;
    return () => {
      model.body.dispose();
      model.glow.dispose();
    };
  }, [model]);

  const tinted = useRef(false);
  useEffect(() => {
    if (!model) return;
    if (!hovered && !selected && !tinted.current) return;
    tintInto(model.body, model.baseColors, hovered, selected);
    tinted.current = hovered || selected;
  }, [model, hovered, selected]);

  if (!model) return null;

  return (
    <group
      ref={reveal}
      position={building.position}
      rotation-y={building.rotationY}
      {...handlers}
    >
      <mesh geometry={model.body} castShadow receiveShadow>
        <meshStandardMaterial vertexColors flatShading roughness={0.8} metalness={0} />
      </mesh>
      {model.glow.getAttribute("position").count > 0 && (
        <mesh geometry={model.glow}>
          <meshStandardMaterial
            color={WINDOW_COLOR}
            emissive={WINDOW_COLOR}
            emissiveIntensity={0.18 + atmosphere.windowGlow}
            roughness={0.42}
            metalness={0}
            toneMapped={false}
          />
        </mesh>
      )}
    </group>
  );
}
