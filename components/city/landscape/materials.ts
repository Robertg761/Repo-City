/**
 * Materials for the land (`?land=rich`) that need a patch over
 * `MeshStandardMaterial`: the water, with a sky reflection, a little movement
 * and the hour's colours; and the crop rows of the fields, drawn in the
 * shader with their contrast faded by distance, by the angle of view and by
 * how fast they change across a pixel.
 *
 * The patches touch only colour, the normal and the emissive term, so the
 * materials still take the scene's sun, shadows and fog like every other.
 */

import { Color, MeshStandardMaterial, type IUniform, type WebGLProgramParametersWithUniforms } from "three";
import type { SceneAtmosphere } from "../palette";
import { RELIEF_GLSL } from "../textures/model-detail";

export interface WaterUniforms {
  uTime: IUniform<number>;
  uZenith: IUniform<Color>;
  uHorizon: IUniform<Color>;
  uShallow: IUniform<Color>;
  uDeep: IUniform<Color>;
  uGlow: IUniform<number>;
}

const stillWater = typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function waterMaterial(): { material: MeshStandardMaterial; uniforms: WaterUniforms; tick: (seconds: number) => void } {
  const uniforms: WaterUniforms = {
    uTime: { value: 0 },
    uZenith: { value: new Color("#7fb2e8") },
    uHorizon: { value: new Color("#cfe2f3") },
    uShallow: { value: new Color("#63aeb0") },
    uDeep: { value: new Color("#2f6b8b") },
    uGlow: { value: 0.3 },
  };
  const material = new MeshStandardMaterial({
    color: "#ffffff",
    roughness: 0.26,
    metalness: 0,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aDepth;\nvarying float vDepth;\nvarying vec2 vWxz;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\n  vDepth = aDepth;\n  vWxz = ( modelMatrix * vec4( transformed, 1.0 ) ).xz;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying float vDepth;
varying vec2 vWxz;
uniform float uTime;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uShallow;
uniform vec3 uDeep;
uniform float uGlow;`,
      )
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
  {
    // Ripples: three slow travelling waves, finer and weaker each, tilt the surface a little.
    vec2 p = vWxz;
    vec2 g = vec2( 0.0 );
    g += vec2( cos( p.x * 0.85 + p.y * 0.35 + uTime * 0.8 ), sin( p.y * 0.95 - p.x * 0.3 + uTime * 0.65 ) ) * 0.045;
    g += vec2( cos( p.x * 2.1 - p.y * 1.6 - uTime * 1.5 ), cos( p.y * 2.4 + p.x * 1.0 + uTime * 1.2 ) ) * 0.03;
    g += vec2( sin( p.x * 4.7 + p.y * 3.1 + uTime * 2.3 ), cos( p.y * 5.3 - p.x * 2.2 - uTime * 2.0 ) ) * 0.012;
    normal = normalize( normal + mat3( viewMatrix ) * vec3( g.x, 0.0, g.y ) );
    // What it reflects: the sky's horizon band low down and its zenith up high, more of it at a glancing angle.
    vec3 V = normalize( vViewPosition );
    float fres = pow( 1.0 - clamp( dot( normal, V ), 0.0, 1.0 ), 3.0 );
    vec3 R = reflect( -V, normal );
    float up = clamp( dot( R, normalize( mat3( viewMatrix ) * vec3( 0.0, 1.0, 0.0 ) ) ), 0.0, 1.0 );
    vec3 sky = mix( uHorizon, uZenith, pow( up, 0.6 ) );
    vec3 body = mix( uShallow, uDeep, smoothstep( 0.0, 0.9, vDepth ) );
    float toSky = clamp( 0.12 + fres * 0.5, 0.0, 0.78 );
    diffuseColor.rgb = mix( body, sky, toSky );
    // Clear at the shore, where the wet bank shows through.
    diffuseColor.a = opacity * ( 0.12 + 0.86 * smoothstep( 0.0, 0.3, vDepth ) );
    totalEmissiveRadiance += sky * toSky * uGlow;
  }`,
      );
  };
  material.customProgramCacheKey = () => "land-water";
  return {
    material,
    uniforms,
    // The ripples' clock; a viewer who asked for less motion gets still water.
    tick: (seconds: number) => {
      uniforms.uTime.value = stillWater ? 0 : seconds;
    },
  };
}

/** Writes the hour into the water: the sky it reflects, and the colour of its body. */
export function tuneWater(uniforms: WaterUniforms, sky: SceneAtmosphere): void {
  uniforms.uZenith.value.set(sky.skyZenithColor);
  uniforms.uHorizon.value.set(sky.skyHorizonColor);
  const night = sky.nightness;
  uniforms.uShallow.value.set("#63aeb0").lerp(uniforms.uHorizon.value, 0.28).multiplyScalar(1 - night * 0.35);
  uniforms.uDeep.value.set("#2f6b8b").lerp(uniforms.uZenith.value, 0.22).multiplyScalar(1 - night * 0.4);
  // By day the reflection is bright; at night it is whatever little the sky has.
  uniforms.uGlow.value = 0.34 - night * 0.14;
}

/**
 * Crop rows and texture in the shader: `aRow.x` is the distance across the rows in row periods,
 * `aRow.y` how strongly they show. The surface carries noise of tone and height at a few scales
 * (clods, stalks, patches), each faded out by its own footprint on the screen (from derivatives,
 * so a field stays textured close up and at a grazing angle, and never shimmers); the rows show
 * as long as a row spans a few pixels; and the height lights the crop through the relief normal.
 */
export function patchCrops(material: MeshStandardMaterial): void {
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec2 aRow;\nvarying vec2 vRow;\nvarying vec2 vCropXZ;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\n  vRow = aRow;\n  vCropXZ = ( modelMatrix * vec4( transformed, 1.0 ) ).xz;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec2 vRow;
varying vec2 vCropXZ;
float cropH = 0.0;
float cropBump = 0.0;
float cHash( vec2 p ) { p = fract( p * vec2( 123.34, 456.21 ) ); p += dot( p, p + 45.32 ); return fract( p.x * p.y ); }
float cNoise( vec2 p ) {
  vec2 i = floor( p ); vec2 f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( cHash( i ), cHash( i + vec2( 1.0, 0.0 ) ), f.x ), mix( cHash( i + vec2( 0.0, 1.0 ) ), cHash( i + vec2( 1.0, 1.0 ) ), f.x ), f.y );
}
${RELIEF_GLSL}`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
  {
    // Patches of ripeness and wear, whatever the angle: a field is never one flat colour.
    float ripe = ( cNoise( vCropXZ / 15.0 ) - 0.5 ) * 0.26 + ( cNoise( vCropXZ / 4.5 + 7.0 ) - 0.5 ) * 0.12;
    diffuseColor.rgb *= 1.0 + ripe * vec3( 1.0, 0.9, 0.7 ) * ( 1.0 - smoothstep( 300.0, 700.0, length( vViewPosition ) ) );
  }
  {
    // Texture at three scales (world units across a cell: 0.3 clods and stalks, 1.1 tufts, 4 patches),
    // each faded to its mean once a cell is under about three pixels.
    float fp = length( fwidth( vCropXZ ) );
    float f1 = 1.0 - smoothstep( 0.1, 0.3, fp );
    float f2 = 1.0 - smoothstep( 0.35, 1.1, fp );
    float f3 = 1.0 - smoothstep( 1.3, 4.0, fp );
    float n1 = cNoise( vCropXZ / 0.3 + 3.0 ) * 0.6 + cNoise( vCropXZ / 0.13 + 11.0 ) * 0.4;
    float n2 = cNoise( vCropXZ / 1.1 + 19.0 );
    float n3 = cNoise( vCropXZ / 4.0 + 31.0 );
    float u = vRow.x;
    float stripe = 0.5 + 0.5 * cos( 6.2831853 * u );
    // Rows show as long as a period spans about four pixels, and fade to nothing only below that.
    float fadeRes = 1.0 - smoothstep( 0.14, 0.4, fwidth( u ) );
    float fadeFar = 1.0 - smoothstep( 500.0, 1100.0, length( vViewPosition ) );
    float a = vRow.y * fadeRes * fadeFar;
    float tone = ( n1 - 0.5 ) * 0.34 * f1 + ( n2 - 0.5 ) * 0.26 * f2 + ( n3 - 0.5 ) * 0.2 * f3;
    diffuseColor.rgb *= 1.0 + tone * vec3( 1.0, 0.95, 0.8 );
    diffuseColor.rgb *= 1.0 - a * 0.3 * ( 1.0 - stripe ) + a * 0.06 * stripe;
    cropH = ( n1 * 0.5 * f1 + n2 * 0.5 * f2 ) * 0.6 + stripe * a * 0.9;
    cropBump = 0.1 * ( 0.35 + 0.65 * max( f1, f2 ) ) * fadeFar;
  }`,
      )
      .replace("#include <normal_fragment_maps>", "#include <normal_fragment_maps>\n  normal = rcReliefNormal( normal, cropH, cropBump );");
  };
  material.customProgramCacheKey = () => "land-crops2";
}
