"use client";

/**
 * The GPU half of the surface textures: uploads the pure patterns from
 * `patterns.ts`, caches them for the session, and teaches the road and
 * pavement materials where to sample them.
 *
 * CACHING. One `DataTexture` per pattern and size, built on first use and
 * shared by every surface and every city after it. Surfaces that need their
 * own `repeat` take a clone, which shares the uploaded image with the
 * original (three keys the GPU texture on the source, not the wrapper).
 *
 * SIZE. The quality tier chooses the resolution and filtering. Mipmaps
 * soften close-up detail in the overview, while the low tier keeps the
 * same material patterns at a smaller side length.
 *
 * WHY A SHADER PATCH FOR THE ROADS. The carriageways and pavements are unit
 * boxes scaled per instance, so their own UVs run 0..1 across a slab whatever
 * its length: a texture on them would stretch along every road differently.
 * The patch recovers real distances instead -- metres across the road from
 * the instance's scale, metres along it from the world position -- so the
 * pattern keeps one scale on every street and does not slide while a road
 * grows in during the reveal.
 */

import { useEffect, useMemo } from "react";
import {
  MeshStandardMaterial,
  Vector2,
  type Texture,
  type WebGLProgramParametersWithUniforms,
} from "three";
import { JUNCTION_INSET } from "../groundwork";
import { useQuality } from "../quality";
import {
  SURFACE_BUMP,
  surfaceTexture,
  surfaceReliefTexture,
  tiledSurface,
  type ModelDetailOptions,
  type SurfaceKind,
} from "./texture-data";
import { RELIEF_GLSL } from "./model-detail";

export { surfaceTexture, surfaceReliefTexture, tiledSurface } from "./texture-data";
export type { SurfaceKind, ModelDetailOptions } from "./texture-data";

// ---------------------------------------------------------------------------
// The instanced street shader patch
// ---------------------------------------------------------------------------

/**
 * `patch` is asphalt without the oil line down each lane: the joint discs and
 * corner squares at a bend (`groundwork.ts` `jointLays`), which have no lanes.
 */
export type StreetSurface = "asphalt" | "patch" | "pavers" | "paint" | "concrete" | "gravel" | "lawn" | "soil";

/**
 * World units per pattern tile, across (u) and along (v).
 *
 * The asphalt is mapped in world space on both axes so that two carriageways
 * overlapping in a junction square sample the same texel and do not fight.
 * The pavers are mapped across the slab exactly -- u runs 0..1 from one edge
 * of the 1.2 unit pavement to the other, four columns, so the kerb on either
 * side covers one column whole and `TILE.pavers[0]` is only documentation --
 * and along the road in world units. The paint borrows the asphalt's wear
 * mask.
 */
const TILE: Record<StreetSurface, [number, number]> = {
  asphalt: [9, 9],
  patch: [9, 9],
  pavers: [1.2, 3.6],
  paint: [9, 9],
  concrete: [3.6, 3.6],
  gravel: [3.6, 3.6],
  lawn: [9, 9],
  soil: [4, 4],
};

/**
 * How dark the oil line down the middle of each lane gets, at its worst.
 * Faded out towards both junctions, where every lane's line meets every
 * other's and the carriageways overlap.
 */
const LANE_WEAR = 0.16;
/** How much the paint scuffs where the wear mask is high. */
const PAINT_WEAR = 0.12;

const VERTEX_HEAD = /* glsl */ `
uniform vec2 rcTile;
varying vec2 rcUv;
varying vec3 rcFrame;
varying float rcUp;
varying float rcHalfWidth;
`;

const VERTEX_BODY = /* glsl */ `
{
  mat4 rcInstance = mat4(1.0);
  #ifdef USE_INSTANCING
    rcInstance = instanceMatrix;
  #endif
  vec4 rcWorld = modelMatrix * rcInstance * vec4(position, 1.0);
  float rcWidth = length(rcInstance[0].xyz);
  float rcLength = length(rcInstance[2].xyz);
  vec2 rcDir = rcInstance[2].xz / max(rcLength, 1e-4);
  float rcAcross = position.x * rcWidth;
  float rcAlong = dot(rcWorld.xz, rcDir);
  #ifdef RC_WORLD_UV
    rcUv = rcWorld.xz / rcTile;
  #else
    rcUv = vec2(position.x + 0.5, rcAlong / rcTile.y);
  #endif
  // Metres across from the centre line, and from each end of the segment.
  rcFrame = vec3(rcAcross, (position.z + 0.5) * rcLength, (0.5 - position.z) * rcLength);
  rcUp = normal.y;
  rcHalfWidth = rcWidth * 0.5;
}
`;

const FRAGMENT_HEAD = /* glsl */ `
uniform sampler2D rcPattern;
uniform float rcLaneWear;
uniform float rcPaintWear;
uniform sampler2D rcRelief;
uniform float rcBumpScale;
varying vec2 rcUv;
varying vec3 rcFrame;
varying float rcUp;
varying float rcHalfWidth;
${RELIEF_GLSL}
`;

const FRAGMENT_BODY = /* glsl */ `
{
  vec4 rcTex = texture2D(rcPattern, rcUv);
  // Only the top face carries the pattern; the sides of a kerb are plain.
  float rcTop = smoothstep(0.3, 0.7, rcUp);
  vec3 rcMul = rcTex.rgb;
  #ifdef RC_LANE_WEAR
    // The dark line tyres and drips leave down the middle of each lane,
    // patchy where the wear mask says so, gone within a junction.
    float rcLane = abs(abs(rcFrame.x) - rcHalfWidth * 0.5);
    float rcLine = 1.0 - smoothstep(0.18, 0.55, rcLane);
    float rcEnds = smoothstep(${(JUNCTION_INSET - 0.4).toFixed(2)}, ${(JUNCTION_INSET + 2).toFixed(2)}, min(rcFrame.y, rcFrame.z));
    rcMul *= 1.0 - rcLine * rcEnds * rcLaneWear * smoothstep(0.3, 0.75, rcTex.a);
  #endif
  #ifdef RC_PAINT
    // Paint is its own colour; the asphalt texture only scuffs it.
    rcMul = vec3(1.0 - rcPaintWear * smoothstep(0.45, 0.9, rcTex.a));
  #endif
  diffuseColor.rgb *= mix(vec3(1.0), rcMul, rcTop);
}
`;

/**
 * Patches a `MeshStandardMaterial` on an instanced street mesh to sample
 * `texture` in street coordinates. Safe to call again with a new texture: the
 * uniform is shared, so swapping the tier's texture needs no recompile.
 */
export function patchStreetMaterial(
  material: MeshStandardMaterial,
  surface: StreetSurface,
  texture: Texture,
  relief?: Texture,
): void {
  const uniforms = {
    rcPattern: { value: texture },
    rcTile: { value: new Vector2(...TILE[surface]) },
    rcLaneWear: { value: LANE_WEAR },
    rcPaintWear: { value: PAINT_WEAR },
    rcRelief: { value: relief ?? texture },
    rcBumpScale: { value: surface === "paint" || !relief ? 0 : SURFACE_BUMP[STREET_PATTERN[surface]] },
  };
  material.userData.rcUniforms = uniforms;

  material.defines = {
    ...material.defines,
    ...(surface === "pavers" ? {} : { RC_WORLD_UV: "" }),
    ...(surface === "asphalt" ? { RC_LANE_WEAR: "" } : {}),
    ...(surface === "paint" ? { RC_PAINT: "" } : {}),
  };

  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${VERTEX_HEAD}`)
      .replace("#include <fog_vertex>", `#include <fog_vertex>\n${VERTEX_BODY}`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${FRAGMENT_HEAD}`)
      .replace("#include <map_fragment>", `#include <map_fragment>\n${FRAGMENT_BODY}\nvec4 rcSurfaceRelief = texture2D(rcRelief, rcUv);`)
      .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>\nroughnessFactor *= mix(1.0, rcSurfaceRelief.g, smoothstep(0.3, 0.7, rcUp));`)
      .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>\nnormal = rcReliefNormal(normal, rcSurfaceRelief.r, rcBumpScale * smoothstep(0.3, 0.7, rcUp));`);
  };
  material.customProgramCacheKey = () => `repo-city-street-${surface}`;
  material.needsUpdate = true;
}

/** Points an already patched material at another texture, e.g. on a tier change. */
export function setStreetTexture(material: MeshStandardMaterial, texture: Texture, relief?: Texture): void {
  const uniforms = material.userData.rcUniforms as {
    rcPattern: { value: Texture };
    rcRelief: { value: Texture };
  } | undefined;
  if (uniforms) uniforms.rcPattern.value = texture;
  if (uniforms && relief) uniforms.rcRelief.value = relief;
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

const STREET_PATTERN: Record<StreetSurface, SurfaceKind> = {
  asphalt: "asphalt",
  patch: "asphalt",
  pavers: "pavers",
  paint: "asphalt",
  concrete: "concrete",
  gravel: "gravel",
  lawn: "lawn",
  soil: "soil",
};

/**
 * A street material for one of the instanced meshes in `Roads.tsx`, at the
 * quality tier's texture size. Rebuilt only when its colour or the tier
 * changes; the compiled program is shared across rebuilds by its cache key.
 *
 * `behind` pushes the surface back in the depth test by that many polygon
 * offset units, so where it lies coplanar with another road surface -- a
 * lane running into the village main street -- the other one wins cleanly
 * instead of the two fighting.
 */
export function useStreetMaterial(
  surface: StreetSurface,
  color: string,
  roughness: number,
  behind = 0,
  vertexColors = false,
): MeshStandardMaterial {
  const { textureSize, anisotropy } = useQuality();
  const material = useMemo(
    () => streetMaterial(surface, color, roughness, behind, vertexColors, { textureSize, anisotropy }),
    [surface, color, roughness, behind, vertexColors, textureSize, anisotropy],
  );
  useEffect(() => () => material.dispose(), [material]);
  return material;
}

/** Factory form also supports vertex-coloured field patches and material tests. */
export function streetMaterial(
  surface: StreetSurface,
  color: string,
  roughness: number,
  behind = 0,
  vertexColors = false,
  { textureSize = 256, anisotropy = 4 }: ModelDetailOptions = {},
): MeshStandardMaterial {
  const material = new MeshStandardMaterial({ color, roughness, metalness: 0, vertexColors });
  if (behind > 0) {
    material.polygonOffset = true;
    material.polygonOffsetFactor = behind;
    material.polygonOffsetUnits = behind;
  }
  patchStreetMaterial(
    material, surface,
    surfaceTexture(STREET_PATTERN[surface], textureSize, anisotropy),
    surfaceReliefTexture(STREET_PATTERN[surface], textureSize, anisotropy),
  );
  return material;
}

/**
 * A private, tiled copy of a surface texture at the tier's size: one tile
 * every `tile` world units across a plane `extent` units wide. The copy is
 * disposed with the caller; the shared image it points at is not.
 */
export function useTiledSurface(kind: SurfaceKind, extent: number, tile: number): Texture {
  const { textureSize, anisotropy } = useQuality();
  const texture = useMemo(
    () => tiledSurface(kind, textureSize, Math.max(1, Math.round(extent / tile)), anisotropy),
    [kind, extent, tile, textureSize, anisotropy],
  );
  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}

/** Colour and relief use the same repeat and share their cached source images. */
export function useTiledSurfaceDetail(kind: SurfaceKind, extent: number, tile: number) {
  const { textureSize, anisotropy } = useQuality();
  const detail = useMemo(() => {
    const repeat = Math.max(1, Math.round(extent / tile));
    const map = tiledSurface(kind, textureSize, repeat, anisotropy);
    const relief = tiledSurface(kind, textureSize, repeat, anisotropy, true);
    return { map, bumpMap: relief, roughnessMap: relief, bumpScale: SURFACE_BUMP[kind] };
  }, [kind, extent, tile, textureSize, anisotropy]);
  useEffect(() => () => { detail.map.dispose(); detail.bumpMap.dispose(); }, [detail]);
  return detail;
}
