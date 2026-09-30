"use client";

/**
 * The ground shader of `?land=rich`: a patch over `MeshStandardMaterial` that
 * reads the control map (`ctl.ts`) and world-space noise, and gives every
 * ground surface the same large-scale life --
 *
 *   - lawn against meadow (the terrain blends two baked textures by the map),
 *   - lighter and darker grass in soft patches at three scales,
 *   - drier, yellower ground and greener, cooler clover blotches,
 *   - soil where the ground is worn: desire lines between buildings, dust
 *     along the road edges.
 *
 * Up close the terrain is textured from the baked ground images (lawn, meadow
 * and soil, `textures/baked-surfaces.ts`): their height channels are sampled
 * in world space at two scales each, rotated against one another and warped by
 * a slow noise, so nothing repeats visibly from two metres to a hundred. The
 * height lights the ground through a screen-space relief normal and darkens its
 * cavities. The control map's patch borders are broken up by noise in the
 * shader, so they read as organic edges, not texels.
 *
 * The same tone (`landTone`) tints the grass tufts, so a blade is the colour
 * of the ground it grows from. `mode` 0 is the terrain; mode 1 is a district
 * plate, which keeps its own colour and texture and only takes the tone and
 * the wear (district lawns still read as districts: the macro strength is
 * lower there).
 *
 * The control map and the uniforms live in a context so every plate and the
 * terrain share one texture.
 */

import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import {
  DataTexture,
  LinearFilter,
  RGBAFormat,
  ClampToEdgeWrapping,
  UnsignedByteType,
  Vector4,
  type IUniform,
  type MeshStandardMaterial,
  type Texture,
  type WebGLProgramParametersWithUniforms,
} from "three";
import { RELIEF_GLSL } from "../textures/model-detail";
import type { Control } from "./ctl";

export const LAND_TONE_GLSL = /* glsl */ `
float lHash( vec2 p ) {
  p = fract( p * vec2( 123.34, 456.21 ) );
  p += dot( p, p + 45.32 );
  return fract( p.x * p.y );
}
float lNoise( vec2 p ) {
  vec2 i = floor( p );
  vec2 f = fract( p );
  f = f * f * ( 3.0 - 2.0 * f );
  float a = lHash( i );
  float b = lHash( i + vec2( 1.0, 0.0 ) );
  float c = lHash( i + vec2( 0.0, 1.0 ) );
  float d = lHash( i + vec2( 1.0, 1.0 ) );
  return mix( mix( a, b, f.x ), mix( c, d, f.x ), f.y );
}
// A multiplier on grass colour: patches, dry ground, clover.
vec3 landTone( vec2 lp, float dryBase, float macro ) {
  float n1 = lNoise( lp / 120.0 + 3.1 );
  float n2 = lNoise( lp / 36.0 + 17.0 );
  float n3 = lNoise( lp / 11.0 + 5.0 );
  float n4 = lNoise( lp / 3.2 );
  float dry = clamp( dryBase + smoothstep( 0.58, 0.8, n1 * 0.65 + n2 * 0.35 ) * 0.7, 0.0, 1.0 );
  vec3 tone = mix( vec3( 0.88, 1.02, 0.88 ), vec3( 1.14, 1.02, 0.72 ), dry * 0.85 * macro );
  float blotch = ( n1 - 0.5 ) * 0.44 + ( n2 - 0.5 ) * 0.3 + ( n3 - 0.5 ) * 0.14 + ( n4 - 0.5 ) * 0.06;
  tone *= 1.0 + blotch * macro;
  float clover = smoothstep( 0.62, 0.74, lNoise( lp / 7.5 + 41.0 ) ) * smoothstep( 0.35, 0.6, n2 );
  tone = mix( tone, tone * vec3( 0.78, 0.96, 0.85 ), clover * 0.6 * macro );
  return tone;
}
`;

export interface LandUniforms {
  uLandCtl: IUniform<Texture | null>;
  uLandRect: IUniform<Vector4>;
  /** World metres across one texel of the control map. */
  uLandTexel: IUniform<number>;
  uLandMeadow: IUniform<Texture | null>;
  uLandMeadowTile: IUniform<number>;
  uLandLift: IUniform<number>;
  /** Height (R) of the baked lawn, meadow and soil, for the close-up relief. */
  uLandLawnRelief: IUniform<Texture | null>;
  uLandMeadowRelief: IUniform<Texture | null>;
  uLandSoilRelief: IUniform<Texture | null>;
}

/** The baked ground images the land is textured from. */
export interface LandTextures {
  meadow: Texture;
  lawnRelief: Texture;
  meadowRelief: Texture;
  soilRelief: Texture;
}

export function landUniforms(): LandUniforms {
  return {
    uLandCtl: { value: null },
    uLandRect: { value: new Vector4(0, 0, 1, 1) },
    uLandTexel: { value: 1 },
    uLandMeadow: { value: null },
    uLandMeadowTile: { value: 17 },
    uLandLift: { value: 1.06 },
    uLandLawnRelief: { value: null },
    uLandMeadowRelief: { value: null },
    uLandSoilRelief: { value: null },
  };
}

export function controlTexture(c: Control): DataTexture {
  const t = new DataTexture(c.data, c.size, c.size, RGBAFormat, UnsignedByteType);
  t.wrapS = t.wrapT = ClampToEdgeWrapping;
  t.magFilter = LinearFilter;
  t.minFilter = LinearFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

export function writeRect(u: LandUniforms, c: Control): void {
  u.uLandRect.value.set(c.min, c.min, c.span, c.span);
  u.uLandTexel.value = c.span / c.size;
}

/** Points the ground at a control map (or, with none, at a neutral one that covers the world). */
function bindControl(u: LandUniforms, texture: Texture, control: Control | null): void {
  u.uLandCtl.value = texture;
  if (control) writeRect(u, control);
  else {
    u.uLandRect.value.set(-1e5, -1e5, 2e5, 2e5);
    u.uLandTexel.value = 1;
  }
}

function bindTextures(u: LandUniforms, t: LandTextures | null): void {
  u.uLandMeadow.value = t?.meadow ?? null;
  u.uLandLawnRelief.value = t?.lawnRelief ?? null;
  u.uLandMeadowRelief.value = t?.meadowRelief ?? null;
  u.uLandSoilRelief.value = t?.soilRelief ?? null;
}

/** Height channel reads: the baked images' mean height, so detail is measured from its average. */
const H_LAWN = 0.31;
const H_MEADOW = 0.39;
const H_SOIL = 0.36;

/**
 * Patch a standard material. `mode` 0: terrain; 1: a district plate.
 * `macro` is how strongly the large-scale patches show. `detail` 2 is the
 * full close-up texturing (two scales of lawn and meadow, clods), 1 the cheap
 * one-scale version for the low tier.
 */
export function patchLand(material: MeshStandardMaterial, u: LandUniforms, mode: 0 | 1, macro: number, detail: 1 | 2 = 2): void {
  const uMode = { value: mode };
  const uMacro = { value: macro };
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, u, { uLandMode: uMode, uLandMacro: uMacro });
    const terrain = mode === 0;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vLandXZ;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\n  vLandXZ = ( modelMatrix * vec4( transformed, 1.0 ) ).xz;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec2 vLandXZ;
uniform sampler2D uLandCtl;
uniform vec4 uLandRect;
uniform float uLandTexel;
uniform sampler2D uLandMeadow;
uniform float uLandMeadowTile;
uniform float uLandLift;
uniform float uLandMode;
uniform float uLandMacro;
uniform sampler2D uLandLawnRelief;
uniform sampler2D uLandMeadowRelief;
uniform sampler2D uLandSoilRelief;
float landH = 0.0;
${LAND_TONE_GLSL}
${terrain ? RELIEF_GLSL : ""}
mat2 landRot( float a ) { float c = cos( a ); float s = sin( a ); return mat2( c, s, -s, c ); }`,
      )
      .replace(
        "#include <color_fragment>",
        terrain
          ? `#include <color_fragment>
  {
    vec2 lp = vLandXZ;
    // The map is read through a slow noise warp, a texel or so wide, and its soft values are
    // thresholded against fine noise: patch borders come out ragged and organic, not stair-stepped.
    vec2 warp = ( vec2( lNoise( lp * 0.9 + 3.1 ), lNoise( lp * 0.9 + 8.7 ) ) - 0.5 ) * uLandTexel * 2.2;
    vec4 ctl = texture2D( uLandCtl, ( lp + warp - uLandRect.xy ) / uLandRect.zw );
    float fn = lNoise( lp * 1.9 ) * 0.55 + lNoise( lp * 6.1 + 9.0 ) * 0.45;
    float meadowK = smoothstep( 0.4, 0.6, ctl.r + ( fn - 0.5 ) * 0.55 );
    // Ground height from the baked images: two scales each, turned against one another and warped, so no tile shows.
    vec2 w1 = ( vec2( lNoise( lp / 6.3 + 1.7 ), lNoise( lp / 6.3 + 6.1 ) ) - 0.5 ) * 0.7;
    vec2 pA = landRot( 0.52 ) * lp / 4.7 + w1;
    vec2 pM = landRot( -0.4 ) * lp / 5.9 + 0.3 - w1;
    float fwA = length( fwidth( pA ) );
    float visA = 1.0 - smoothstep( 0.05, 0.22, fwA );
    // Out where the detail has faded to nothing (far, or grazing) the reads are skipped.
    float lawnH = 0.0;
    float meadH = 0.0;
    // (textureGrad, with the gradients taken out here, so the branch is safe on every compiler.)
    vec2 gAx = dFdx( pA ); vec2 gAy = dFdy( pA ); vec2 gMx = dFdx( pM ); vec2 gMy = dFdy( pM );
    if ( visA > 0.003 ) {
      lawnH = textureGrad( uLandLawnRelief, pA, gAx, gAy ).r - ${H_LAWN.toFixed(2)};
      meadH = textureGrad( uLandMeadowRelief, pM, gMx, gMy ).r - ${H_MEADOW.toFixed(2)};
    }
    float dn = mix( lawnH, meadH, meadowK ) * 0.75 * visA;
    float hm = mix( lawnH * 0.02, meadH * 0.032, meadowK ) * visA;
    #if ${detail} > 1
      vec2 pB = landRot( -0.63 ) * lp / 1.55 + 0.37;
      vec2 pN = landRot( 0.9 ) * lp / 1.25 + 0.7;
      vec2 gBx = dFdx( pB ); vec2 gBy = dFdy( pB ); vec2 gNx = dFdx( pN ); vec2 gNy = dFdy( pN );
      float visB = 1.0 - smoothstep( 0.05, 0.22, length( fwidth( pB ) ) );
      float lawnB = 0.0;
      float meadB = 0.0;
      if ( visB > 0.003 ) {
        lawnB = textureGrad( uLandLawnRelief, pB, gBx, gBy ).r - ${H_LAWN.toFixed(2)};
        meadB = textureGrad( uLandMeadowRelief, pN, gNx, gNy ).r - ${H_MEADOW.toFixed(2)};
      }
      dn += mix( lawnB, meadB, meadowK ) * 0.55 * visB;
      hm += mix( lawnB * 0.007, meadB * 0.011, meadowK ) * visB;
    #endif
    vec3 base = diffuseColor.rgb;
    #ifdef USE_COLOR
    {
      vec3 meadow = texture2D( uLandMeadow, lp / uLandMeadowTile ).rgb * diffuse * vColor.rgb;
      base = mix( base * uLandLift, meadow, meadowK );
    }
    #endif
    base *= landTone( lp, ctl.g, uLandMacro );
    base *= 1.0 + dn;
    // Worn ground: soil, broken into clods by its own height, never a smooth stain.
    vec2 pS = landRot( 1.1 ) * lp / 2.6;
    float soilH = 0.0;
    vec2 gSx = dFdx( pS ); vec2 gSy = dFdy( pS );
    if ( length( fwidth( pS ) ) < 0.25 ) soilH = textureGrad( uLandSoilRelief, pS, gSx, gSy ).r - ${H_SOIL.toFixed(2)};
    float worn = smoothstep( 0.3, 0.62, ctl.b * 1.15 + soilH * 0.9 + ( fn - 0.5 ) * 0.3 );
    float n3 = lNoise( lp / 11.0 + 5.0 );
    vec3 soil = vec3( 0.30, 0.20, 0.11 ) * ( 0.8 + 0.4 * n3 ) * ( 1.0 + soilH * 0.9 );
    base = mix( base, soil * ( 0.7 + 0.6 * dot( base, vec3( 0.33 ) ) ), worn * 0.8 );
    landH = mix( hm, soilH * 0.06, worn * 0.8 );
    diffuseColor.rgb = base;
  }`
          : `#include <color_fragment>
  {
    vec2 lp = vLandXZ;
    vec4 ctl = texture2D( uLandCtl, ( lp - uLandRect.xy ) / uLandRect.zw );
    vec3 base = diffuseColor.rgb;
    base *= landTone( lp, ctl.g, uLandMacro );
    float n3 = lNoise( lp / 11.0 + 5.0 );
    vec3 soil = vec3( 0.30, 0.20, 0.11 ) * ( 0.8 + 0.4 * n3 );
    float worn = ctl.b;
    base = mix( base, soil * ( 0.7 + 0.6 * dot( base, vec3( 0.33 ) ) ), worn * 0.6 );
    diffuseColor.rgb = base;
  }`,
      );
    if (terrain) {
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <normal_fragment_maps>",
        "#include <normal_fragment_maps>\n  normal = rcReliefNormal( normal, landH, 1.0 );",
      );
    }
  };
  material.customProgramCacheKey = () => `land-${mode}-${detail}`;
}

export interface LandGroundValue {
  uniforms: LandUniforms;
  /** The baked images the ground is textured from (null before they are made). */
  textures: LandTextures | null;
  /** The baked map, for the grass; null until the bake has finished. */
  control: Control | null;
}

const LandGroundContext = createContext<LandGroundValue | null>(null);

/** A neutral 1 x 1 map for before the bake lands: lawn, no dryness, no wear, grass allowed. */
function neutralMap(): DataTexture {
  const t = new DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, RGBAFormat, UnsignedByteType);
  t.needsUpdate = true;
  return t;
}

/**
 * Provides the ground's uniforms from the moment the city arrives, so that the
 * district plates compile their patched program with the city and not later;
 * the bake's map is swapped in when it is done, with no recompile.
 */
export function LandGroundProvider({ control, textures, children }: { control: Control | null; textures: LandTextures | null; children: ReactNode }) {
  const uniforms = useMemo(() => landUniforms(), []);
  const neutral = useMemo(() => neutralMap(), []);
  const baked = useMemo(() => (control ? controlTexture(control) : null), [control]);
  useEffect(() => {
    bindControl(uniforms, baked ?? neutral, control);
  }, [uniforms, neutral, baked, control]);
  useEffect(() => {
    bindTextures(uniforms, textures);
  }, [uniforms, textures]);
  useEffect(() => () => baked?.dispose(), [baked]);
  useEffect(() => () => neutral.dispose(), [neutral]);
  const value = useMemo(() => ({ uniforms, control, textures }), [uniforms, control, textures]);
  return <LandGroundContext.Provider value={value}>{children}</LandGroundContext.Provider>;
}

/** The ground context, or null when the rich landscape is off or not ready. */
export function useLandGround(): LandGroundValue | null {
  return useContext(LandGroundContext);
}

/**
 * Props for a district plate's material, so the plate takes the tone and the
 * wear of the land. Empty when there is nothing to patch.
 */
export function useLandPlate(): { onBeforeCompile?: MeshStandardMaterial["onBeforeCompile"]; customProgramCacheKey?: () => string } {
  const ground = useLandGround();
  return useMemo(() => {
    if (!ground) return {};
    const carrier = { onBeforeCompile: undefined as MeshStandardMaterial["onBeforeCompile"] | undefined, customProgramCacheKey: (() => "") as () => string };
    patchLand(carrier as unknown as MeshStandardMaterial, ground.uniforms, 1, 0.5);
    return { onBeforeCompile: carrier.onBeforeCompile, customProgramCacheKey: carrier.customProgramCacheKey };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ground?.uniforms]);
}
