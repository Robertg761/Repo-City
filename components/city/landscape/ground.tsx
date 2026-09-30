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
  uLandMeadow: IUniform<Texture | null>;
  uLandMeadowTile: IUniform<number>;
  uLandLift: IUniform<number>;
}

export function landUniforms(): LandUniforms {
  return {
    uLandCtl: { value: null },
    uLandRect: { value: new Vector4(0, 0, 1, 1) },
    uLandMeadow: { value: null },
    uLandMeadowTile: { value: 52 },
    uLandLift: { value: 1.06 },
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
}

/** Points the ground at a control map (or, with none, at a neutral one that covers the world). */
function bindControl(u: LandUniforms, texture: Texture, control: Control | null): void {
  u.uLandCtl.value = texture;
  if (control) writeRect(u, control);
  else u.uLandRect.value.set(-1e5, -1e5, 2e5, 2e5);
}

function bindMeadow(u: LandUniforms, meadow: Texture | null): void {
  u.uLandMeadow.value = meadow;
}

/**
 * Patch a standard material. `mode` 0: terrain; 1: a district plate.
 * `macro` is how strongly the large-scale patches show.
 */
export function patchLand(material: MeshStandardMaterial, u: LandUniforms, mode: 0 | 1, macro: number): void {
  const uMode = { value: mode };
  const uMacro = { value: macro };
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, u, { uLandMode: uMode, uLandMacro: uMacro });
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
uniform sampler2D uLandMeadow;
uniform float uLandMeadowTile;
uniform float uLandLift;
uniform float uLandMode;
uniform float uLandMacro;
${LAND_TONE_GLSL}`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
  {
    vec2 lp = vLandXZ;
    vec4 ctl = texture2D( uLandCtl, ( lp - uLandRect.xy ) / uLandRect.zw );
    vec3 base = diffuseColor.rgb;
    #ifdef USE_COLOR
    if ( uLandMode < 0.5 ) {
      vec3 meadow = texture2D( uLandMeadow, lp / uLandMeadowTile ).rgb * diffuse * vColor.rgb;
      base = mix( base * uLandLift, meadow, ctl.r );
    }
    #endif
    base *= landTone( lp, ctl.g, uLandMacro );
    float n3 = lNoise( lp / 11.0 + 5.0 );
    vec3 soil = vec3( 0.30, 0.20, 0.11 ) * ( 0.8 + 0.4 * n3 );
    float worn = ctl.b;
    base = mix( base, soil * ( 0.7 + 0.6 * dot( base, vec3( 0.33 ) ) ), worn * ( uLandMode < 0.5 ? 0.75 : 0.6 ) );
    diffuseColor.rgb = base;
  }`,
      );
  };
  material.customProgramCacheKey = () => `land-${mode}`;
}

export interface LandGroundValue {
  uniforms: LandUniforms;
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
export function LandGroundProvider({ control, meadow, children }: { control: Control | null; meadow: Texture | null; children: ReactNode }) {
  const uniforms = useMemo(() => landUniforms(), []);
  const neutral = useMemo(() => neutralMap(), []);
  const baked = useMemo(() => (control ? controlTexture(control) : null), [control]);
  useEffect(() => {
    bindControl(uniforms, baked ?? neutral, control);
  }, [uniforms, neutral, baked, control]);
  useEffect(() => {
    bindMeadow(uniforms, meadow);
  }, [uniforms, meadow]);
  useEffect(() => () => baked?.dispose(), [baked]);
  useEffect(() => () => neutral.dispose(), [neutral]);
  const value = useMemo(() => ({ uniforms, control }), [uniforms, control]);
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
