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
import { useFrame } from "@react-three/fiber";
import { Color, type BufferAttribute, type BufferGeometry, type Group } from "three";
import type { LandmarkFile } from "@/types/analysis";
import type { Building } from "@/types/city";
import { toGeometry } from "./models/buildings/geometry";
import { buildCivic, type CivicPalette } from "./models/buildings/civic";
import { BLENDER_MODELS } from "./models/modelSource";
import type { Rgb3 } from "./models/buildings/mesh";
import {
  CIVIC_COLOR,
  CIVIC_ROOF,
  HAZARD_RED,
  HIGHLIGHT,
  HOVER_TINT,
  SELECT_LIFT,
  SELECT_TINT,
  WINDOW_COLOR,
  desaturate,
  mix,
  type SceneAtmosphere,
} from "./palette";
import { useEntityHandlers, useEntityState } from "./useEntity";
import { useRevealGroup } from "./useReveal";
import { useSkyValue } from "./sky";
import { useQuality } from "./quality";
import { buildingDetailMaterial } from "./models/buildings/material";

interface CivicBuildingProps {
  building: Building;
  atmosphere: SceneAtmosphere;
}

const scratchColor = new Color();

/**
 * How close the camera has to be, in world units, for a civic building to be
 * drawn from the near kit's finer parts (`blender/civic/civic_kit_near.py`) in
 * place of the lean ones: the same distance the ordinary buildings switch at
 * (`BUILDING_NEAR_DISTANCE` in `Buildings.tsx`). Each civic building is drawn
 * once, so this swaps two whole models rather than instancing.
 */
const CIVIC_NEAR_DISTANCE = 64;

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

/** Same tints as `stateTint`: hover warms slightly, selection lifts towards warm white (PLAN.md section 42). */
function tintInto(geometry: BufferGeometry, base: Float32Array, hovered: boolean, selected: boolean) {
  const attribute = geometry.getAttribute("color") as BufferAttribute | undefined;
  if (!attribute) return;
  const array = attribute.array as Float32Array;
  const amount = selected ? SELECT_TINT : hovered ? HOVER_TINT : 0;
  if (amount === 0) {
    array.set(base);
  } else {
    scratchColor.set(selected ? SELECT_LIFT : HIGHLIGHT);
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
  const { textureSize, anisotropy } = useQuality();
  const bodyMaterial = useMemo(
    () => buildingDetailMaterial({ flatShading: true, roughness: 0.8, metalness: 0 }, { textureSize, anisotropy, surfaceAttribute: true }),
    [textureSize, anisotropy],
  );
  useEffect(() => () => bodyMaterial.dispose(), [bodyMaterial]);
  // The windows follow the live hour, brightest at night (`sky.tsx`).
  const glow = useSkyValue((a) => a.windowGlow + a.nightness * 0.4);
  const [width, height, depth] = building.size;
  const kind: LandmarkFile | null = building.plan.landmark;

  const model = useMemo(() => {
    if (!kind) return null;
    const palette = civicPalette(atmosphere.desaturation);
    const plot = { w: width, h: height, d: depth };
    const lean = buildCivic(kind, plot, palette);
    // The near level: the same building from the kit's finer parts. Only the
    // Blender kit has one.
    const near = BLENDER_MODELS ? buildCivic(kind, plot, palette, { near: true }) : null;
    return {
      body: toGeometry(lean.body),
      glow: toGeometry(lean.glow),
      baseColors: Float32Array.from(lean.body.colors),
      near: near && {
        body: toGeometry(near.body),
        glow: toGeometry(near.glow),
        baseColors: Float32Array.from(near.body.colors),
      },
    };
  }, [kind, width, height, depth, atmosphere.desaturation]);

  // The geometry belongs to this model, not to a module cache: a new city has
  // to be able to hand the old one back to the GPU.
  useEffect(() => {
    if (!model) return;
    return () => {
      model.body.dispose();
      model.glow.dispose();
      model.near?.body.dispose();
      model.near?.glow.dispose();
    };
  }, [model]);

  const tinted = useRef(false);
  useEffect(() => {
    if (!model) return;
    if (!hovered && !selected && !tinted.current) return;
    tintInto(model.body, model.baseColors, hovered, selected);
    if (model.near) tintInto(model.near.body, model.near.baseColors, hovered, selected);
    tinted.current = hovered || selected;
  }, [model, hovered, selected]);

  // Near or lean: one of the two is drawn, by the camera's distance to the
  // building (with a margin either way, so it does not flicker at the edge).
  const leanRef = useRef<Group>(null);
  const nearRef = useRef<Group>(null);
  const isNear = useRef(false);
  useFrame(({ camera }) => {
    if (!nearRef.current || !leanRef.current) return;
    const dx = camera.position.x - building.position[0];
    const dy = camera.position.y - building.position[1];
    const dz = camera.position.z - building.position[2];
    const distance = Math.hypot(dx, dy, dz);
    const near = distance < CIVIC_NEAR_DISTANCE * (isNear.current ? 1.1 : 0.95);
    if (near === isNear.current && nearRef.current.visible === near) return;
    isNear.current = near;
    nearRef.current.visible = near;
    leanRef.current.visible = !near;
  });

  if (!model) return null;

  const glowMaterial = (
    <meshStandardMaterial
      color={WINDOW_COLOR}
      emissive={WINDOW_COLOR}
      emissiveIntensity={0.18 + glow}
      roughness={0.42}
      metalness={0}
      toneMapped={false}
    />
  );

  return (
    <group
      ref={reveal}
      position={building.position}
      rotation-y={building.rotationY}
      {...handlers}
    >
      <group ref={leanRef}>
        <mesh geometry={model.body} castShadow receiveShadow>
          <primitive object={bodyMaterial} attach="material" />
        </mesh>
        {model.glow.getAttribute("position").count > 0 && <mesh geometry={model.glow}>{glowMaterial}</mesh>}
      </group>
      {model.near && (
        <group ref={nearRef} visible={false}>
          <mesh geometry={model.near.body} castShadow receiveShadow>
            <primitive object={bodyMaterial} attach="material" />
          </mesh>
          {model.near.glow.getAttribute("position").count > 0 && <mesh geometry={model.near.glow}>{glowMaterial}</mesh>}
        </group>
      )}
    </group>
  );
}
