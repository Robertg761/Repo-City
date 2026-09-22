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
 * SIZE. The quality tier picks the side: 256 on the high tier, 128 on the low
 * one. Anything larger would be detail no one can see from the overview, and
 * the joints and stripes are drawn soft enough to survive the halving.
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
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  MeshStandardMaterial,
  NoColorSpace,
  RGBAFormat,
  RepeatWrapping,
  UnsignedByteType,
  Vector2,
  type Texture,
  type WebGLProgramParametersWithUniforms,
} from "three";
import { JUNCTION_INSET } from "../groundwork";
import { useQuality } from "../quality";
import {
  asphaltPattern,
  grassPattern,
  gravelPattern,
  groundDetailPattern,
  paverPattern,
  type Pattern,
} from "./patterns";

export type SurfaceKind = "lawn" | "meadow" | "asphalt" | "pavers" | "gravel" | "ground";

/** Mowing stripe pairs across one lawn tile. */
const LAWN_STRIPES = 4;
/** Slabs across one pavers tile, and along it. */
const PAVER_COLUMNS = 4;
const PAVER_ROWS = 8;

const MAKERS: Record<SurfaceKind, (size: number) => Pattern> = {
  lawn: (size) => grassPattern(size, { stripes: LAWN_STRIPES, seed: "lawn" }),
  meadow: (size) => grassPattern(size, { seed: "meadow", mottle: 0.35 }),
  asphalt: (size) => asphaltPattern(size),
  pavers: (size) => paverPattern(size, { columns: PAVER_COLUMNS, rows: PAVER_ROWS }),
  gravel: (size) => gravelPattern(size),
  ground: (size) => groundDetailPattern(size),
};

const cache = new Map<string, DataTexture>();

/** The shared texture for a surface at a side length. Built once. */
export function surfaceTexture(kind: SurfaceKind, size: number, anisotropy = 1): DataTexture {
  const key = `${kind}:${size}`;
  let texture = cache.get(key);
  if (!texture) {
    const pattern = MAKERS[kind](size);
    texture = new DataTexture(
      pattern.data,
      pattern.size,
      pattern.size,
      RGBAFormat,
      UnsignedByteType,
    );
    // Linear data: every pattern is a multiplier, not a colour.
    texture.colorSpace = NoColorSpace;
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
    texture.magFilter = LinearFilter;
    texture.minFilter = LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.needsUpdate = true;
    cache.set(key, texture);
  }
  if (texture.anisotropy !== anisotropy) {
    texture.anisotropy = anisotropy;
    texture.needsUpdate = true;
  }
  return texture;
}

/** A private wrapper around the shared texture, tiled `repeat` times. */
export function tiledSurface(
  kind: SurfaceKind,
  size: number,
  repeat: number,
  anisotropy = 1,
): Texture {
  const texture = surfaceTexture(kind, size, anisotropy).clone();
  texture.repeat.set(repeat, repeat);
  texture.needsUpdate = true;
  return texture;
}

// ---------------------------------------------------------------------------
// The instanced street shader patch
// ---------------------------------------------------------------------------

export type StreetSurface = "asphalt" | "pavers" | "paint";

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
  pavers: [1.2, 3.6],
  paint: [9, 9],
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
varying vec2 rcUv;
varying vec3 rcFrame;
varying float rcUp;
varying float rcHalfWidth;
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
): void {
  const uniforms = {
    rcPattern: { value: texture },
    rcTile: { value: new Vector2(...TILE[surface]) },
    rcLaneWear: { value: LANE_WEAR },
    rcPaintWear: { value: PAINT_WEAR },
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
      .replace("#include <map_fragment>", `#include <map_fragment>\n${FRAGMENT_BODY}`);
  };
  material.customProgramCacheKey = () => `repo-city-street-${surface}`;
  material.needsUpdate = true;
}

/** Points an already patched material at another texture, e.g. on a tier change. */
export function setStreetTexture(material: MeshStandardMaterial, texture: Texture): void {
  const uniforms = material.userData.rcUniforms as { rcPattern: { value: Texture } } | undefined;
  if (uniforms) uniforms.rcPattern.value = texture;
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

const STREET_PATTERN: Record<StreetSurface, SurfaceKind> = {
  asphalt: "asphalt",
  pavers: "pavers",
  paint: "asphalt",
};

/**
 * A street material for one of the instanced meshes in `Roads.tsx`, at the
 * quality tier's texture size. Rebuilt only when its colour or the tier
 * changes; the compiled program is shared across rebuilds by its cache key.
 */
export function useStreetMaterial(
  surface: StreetSurface,
  color: string,
  roughness: number,
): MeshStandardMaterial {
  const { textureSize, anisotropy } = useQuality();
  const material = useMemo(() => {
    const next = new MeshStandardMaterial({ color, roughness, metalness: 0 });
    patchStreetMaterial(next, surface, surfaceTexture(STREET_PATTERN[surface], textureSize, anisotropy));
    return next;
  }, [surface, color, roughness, textureSize, anisotropy]);
  useEffect(() => () => material.dispose(), [material]);
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
