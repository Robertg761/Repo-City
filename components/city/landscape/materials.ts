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

import { Color, DoubleSide, MeshStandardMaterial, type IUniform, type Texture, type WebGLProgramParametersWithUniforms } from "three";
import type { SceneAtmosphere } from "../palette";
import { RELIEF_GLSL } from "../textures/model-detail";
import { MODEL_SURFACE_KINDS } from "../textures/surface-types";
import { modelSurfaceTextureArray } from "../textures/texture-data";

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
float wHash( vec2 p ) { p = fract( p * vec2( 123.34, 456.21 ) ); p += dot( p, p + 45.32 ); return fract( p.x * p.y ); }
float wNoise( vec2 p ) {
  vec2 i = floor( p ); vec2 f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( wHash( i ), wHash( i + vec2( 1.0, 0.0 ) ), f.x ), mix( wHash( i + vec2( 0.0, 1.0 ) ), wHash( i + vec2( 1.0, 1.0 ) ), f.x ), f.y );
}
float wFoam = 0.0;
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
    // Close up: fine wavelets, two scales of drifting noise, faded out as they shrink under a pixel so the far water stays calm.
    float fwW = length( fwidth( p ) );
    float fine = 1.0 - smoothstep( 0.05, 0.4, fwW );
    vec2 q1 = p * 3.1 + vec2( uTime * 0.35, -uTime * 0.27 );
    vec2 q2 = p * 7.3 + vec2( -uTime * 0.5, uTime * 0.41 );
    float e = 0.12;
    vec2 gn = vec2( wNoise( q1 + vec2( e, 0.0 ) ) - wNoise( q1 - vec2( e, 0.0 ) ), wNoise( q1 + vec2( 0.0, e ) ) - wNoise( q1 - vec2( 0.0, e ) ) ) * 0.11;
    gn += vec2( wNoise( q2 + vec2( e, 0.0 ) ) - wNoise( q2 - vec2( e, 0.0 ) ), wNoise( q2 + vec2( 0.0, e ) ) - wNoise( q2 - vec2( 0.0, e ) ) ) * 0.05;
    g += gn * fine;
    normal = normalize( normal + mat3( viewMatrix ) * vec3( g.x, 0.0, g.y ) );
    // Foam lapping at the shore: thin broken lines that run in and out with the ripples.
    float shore = ( 1.0 - smoothstep( 0.02, 0.16, vDepth ) ) * smoothstep( 0.0, 0.05, vDepth );
    float lap = 0.5 + 0.5 * sin( vDepth * 70.0 - uTime * 1.6 + wNoise( p * 1.3 ) * 6.0 );
    wFoam = shore * smoothstep( 0.7, 0.95, lap ) * smoothstep( 0.4, 0.75, wNoise( p * 2.4 + 4.0 ) ) * fine;
    // What it reflects: the sky's horizon band low down and its zenith up high, more of it at a glancing angle.
    vec3 V = normalize( vViewPosition );
    float fres = pow( 1.0 - clamp( dot( normal, V ), 0.0, 1.0 ), 3.0 );
    vec3 R = reflect( -V, normal );
    float up = clamp( dot( R, normalize( mat3( viewMatrix ) * vec3( 0.0, 1.0, 0.0 ) ) ), 0.0, 1.0 );
    vec3 sky = mix( uHorizon, uZenith, pow( up, 0.6 ) );
    vec3 body = mix( uShallow, uDeep, smoothstep( 0.0, 0.9, vDepth ) );
    float toSky = clamp( 0.12 + fres * 0.5, 0.0, 0.78 );
    diffuseColor.rgb = mix( body, sky, toSky );
    // Shallows show their bed: a touch of the wet mud, darker where it is deep.
    diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.93, 0.96, 0.95 ), wFoam * 0.4 );
    // Clear at the shore, where the wet bank shows through.
    diffuseColor.a = opacity * ( 0.12 + 0.86 * smoothstep( 0.0, 0.3, vDepth ) ) + wFoam * 0.15;
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

/** The baked height maps the crops are textured from (`ground.tsx` `LandTextures`). */
export interface CropTextures {
  meadowRelief: Texture;
  soilRelief: Texture;
}

/**
 * Crop surfaces in the shader. `aRow` carries `x` the distance across the rows in row periods,
 * `y` how strongly the rows show, `z` the crop (`CROP_COLORS`) and `w` the distance along the rows
 * in world units; the shader works in row space, so whatever it draws runs with the rows:
 *
 *   wheat, rape  standing crop: streaky height from the baked meadow, stretched along the rows
 *   young crop   rows of plants in dashes, bare soil between them
 *   ploughed     furrows, ridges catching the light, clods from the baked soil
 *   stubble      pale straw streaks along the rows, soil showing through
 *   pasture      meadow grass at two scales
 *
 * Baked height is sampled with mipmaps, so it fades by itself; what is drawn analytically (the
 * rows, the plant dashes) is faded by its own footprint from derivatives, so a field stays
 * textured close up and at a grazing angle and never shimmers far off. The height lights the
 * crop through the relief normal.
 */
export function patchCrops(material: MeshStandardMaterial, textures: CropTextures): void {
  const uniforms = { uCropMeadow: { value: textures.meadowRelief }, uCropSoil: { value: textures.soilRelief } };
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec4 aRow;\nvarying vec4 vRow;\nvarying vec2 vCropXZ;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\n  vRow = aRow;\n  vCropXZ = ( modelMatrix * vec4( transformed, 1.0 ) ).xz;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec4 vRow;
varying vec2 vCropXZ;
uniform sampler2D uCropMeadow;
uniform sampler2D uCropSoil;
float cropH = 0.0;
float cropBump = 1.0;
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
    float kind = floor( vRow.z + 0.5 );
    bool kWheat = kind < 0.5;
    bool kYoung = abs( kind - 1.0 ) < 0.5;
    bool kPlough = abs( kind - 2.0 ) < 0.5;
    bool kStubble = abs( kind - 3.0 ) < 0.5;
    bool kRape = abs( kind - 4.0 ) < 0.5;
    float period = kWheat ? 2.1 : kYoung ? 1.8 : kPlough ? 3.0 : kStubble ? 2.3 : kRape ? 2.5 : 1.0;
    // Row space, in metres: across the rows, along them.
    vec2 q = vec2( vRow.x * period, vRow.w );
    float far = length( vViewPosition );
    float fadeFar = 1.0 - smoothstep( 420.0, 1000.0, far );
    // Patches of ripeness and wear, whatever the angle: a field is never one flat colour.
    float ripe = ( cNoise( vCropXZ / 15.0 ) - 0.5 ) * 0.26 + ( cNoise( vCropXZ / 4.5 + 7.0 ) - 0.5 ) * 0.12;
    diffuseColor.rgb *= 1.0 + ripe * vec3( 1.0, 0.9, 0.7 ) * ( 1.0 - smoothstep( 300.0, 700.0, far ) );
    // Baked height at two scales; standing crop and stubble are stretched along the rows.
    bool along = kWheat || kStubble;
    vec2 u1 = along ? vec2( q.x / 0.55, q.y / 2.2 ) : q / ( kPlough ? 1.0 : 1.25 );
    vec2 u2 = vec2( q.y / 5.3, q.x / 4.1 ) + 0.3;
    float fw1 = length( fwidth( u1 ) );
    float det1 = 1.0 - smoothstep( 0.05, 0.22, fw1 );
    float det2 = 1.0 - smoothstep( 0.05, 0.22, length( fwidth( u2 ) ) );
    float detS = 1.0 - smoothstep( 0.05, 0.22, length( fwidth( q / 1.1 ) ) );
    // Reads are skipped where the detail has faded to nothing (far, or grazing).
    float h1 = 0.0;
    float h2 = 0.0;
    float s1 = 0.0;
    vec2 u3 = q / 1.1;
    vec2 g1x = dFdx( u1 ); vec2 g1y = dFdy( u1 ); vec2 g2x = dFdx( u2 ); vec2 g2y = dFdy( u2 ); vec2 g3x = dFdx( u3 ); vec2 g3y = dFdy( u3 );
    if ( det1 > 0.003 ) h1 = ( textureGrad( uCropMeadow, u1, g1x, g1y ).r - 0.39 ) * det1;
    if ( det2 > 0.003 ) h2 = ( textureGrad( uCropMeadow, u2, g2x, g2y ).r - 0.39 ) * det2;
    if ( detS > 0.003 ) s1 = ( textureGrad( uCropSoil, u3, g3x, g3y ).r - 0.36 ) * detS;
    float stripe = 0.5 + 0.5 * cos( 6.2831853 * vRow.x );
    float rowId = floor( vRow.x + 0.5 );
    // Rows show while a period spans about four pixels, and fade to nothing only below that.
    float fadeRes = 1.0 - smoothstep( 0.14, 0.4, fwidth( vRow.x ) );
    float a = vRow.y * fadeRes * fadeFar;
    vec3 c = diffuseColor.rgb;
    float hgt = 0.0;
    if ( kPlough ) {
      // Furrows: ridges catch the light, troughs are dark and damp, clods lie along the ridges.
      float ridge = pow( stripe, 1.5 );
      c *= mix( 1.0, mix( 0.6, 1.12, ridge ), a ) * ( 1.0 + s1 * 1.5 + h2 * 0.5 );
      hgt = ridge * 0.17 * a + s1 * 0.11 * ( 0.4 + ridge ) + h2 * 0.05;
    } else if ( kYoung ) {
      // Rows of plants in dashes, bare soil between.
      float dash = smoothstep( 0.22, 0.55, cNoise( vec2( q.y / 0.55, rowId * 3.7 + 1.3 ) ) );
      float plant = smoothstep( 0.42, 0.85, stripe ) * dash;
      vec3 soil = mix( vec3( 0.34, 0.27, 0.15 ), c * 0.6, 0.35 ) * ( 1.0 + s1 * 1.6 );
      vec3 leaf = c * ( 1.0 + h1 * 1.1 + 0.12 );
      float shown = plant * fadeRes + ( 1.0 - fadeRes ) * 0.78;
      c = mix( soil, leaf, mix( 1.0, shown, vRow.y ) );
      hgt = plant * 0.09 * fadeRes + h1 * 0.03 + s1 * 0.03;
    } else if ( kStubble ) {
      c *= 1.0 + h1 * 1.0 + s1 * 0.6 + h2 * 0.4 - a * 0.1 * ( 1.0 - stripe );
      hgt = h1 * 0.04 + s1 * 0.035 + a * stripe * 0.02;
    } else if ( kRape ) {
      c *= 1.0 + h1 * 1.5 + h2 * 0.6 - a * 0.14 * ( 1.0 - stripe );
      hgt = h1 * 0.07 + h2 * 0.03;
    } else if ( kWheat ) {
      c *= 1.0 + h1 * 1.0 + h2 * 0.5 - a * 0.26 * ( 1.0 - stripe ) + a * 0.04 * stripe;
      hgt = h1 * 0.06 + h2 * 0.03 + stripe * a * 0.05;
    } else {
      c *= 1.0 + h1 * 1.0 + h2 * 0.6;
      hgt = h1 * 0.04 + h2 * 0.03;
    }
    diffuseColor.rgb = c;
    cropH = hgt;
    cropBump = 0.4 + 0.6 * fadeFar;
  }`,
      )
      .replace("#include <normal_fragment_maps>", "#include <normal_fragment_maps>\n  normal = rcReliefNormal( normal, cropH, cropBump );");
  };
  material.customProgramCacheKey = () => "land-crops3";
}

/**
 * The hedge's skin: the baked foliage layer of the model texture array, sampled in world units
 * along and round the hedge (`hedges.ts` UVs) at two scales, turned against one another. Its
 * height makes leaf clumps: cavities go dark, the tops catch the sun, and the relief normal
 * breaks the smooth tube into leaves. The underside is darker and cooler, the top warmer, by the
 * direction the skin faces; the little emissive fill (a hedge in its own shadow is leaf-dark, not
 * black) follows the leaf shade, so the texture survives in shadow.
 */
export function hedgeMaterial(textureSize: number, anisotropy: number): MeshStandardMaterial {
  const uniforms = { uHedgeLeaves: { value: modelSurfaceTextureArray(textureSize, anisotropy) }, uHedgeLayer: { value: MODEL_SURFACE_KINDS.indexOf("foliage") } };
  const material = new MeshStandardMaterial({
    color: "#ffffff",
    vertexColors: true,
    roughness: 0.95,
    metalness: 0,
    side: DoubleSide,
    emissive: "#24421a",
    emissiveIntensity: 0.55,
  });
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vHedgeUv;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\n  vHedgeUv = uv;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec2 vHedgeUv;
uniform highp sampler2DArray uHedgeLeaves;
uniform float uHedgeLayer;
float hedgeH = 0.0;
float hedgeShade = 1.0;
${RELIEF_GLSL}`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
  {
    vec2 uA = vHedgeUv * vec2( 1.0, 1.0 );
    vec2 uB = vec2( vHedgeUv.y * 0.83 - vHedgeUv.x * 0.56, vHedgeUv.x * 0.83 + vHedgeUv.y * 0.56 ) * 2.3 + 0.41;
    float visA = 1.0 - smoothstep( 0.06, 0.26, length( fwidth( uA ) ) );
    float visB = 1.0 - smoothstep( 0.06, 0.26, length( fwidth( uB ) ) );
    float hA = 0.0;
    float hB = 0.0;
    vec2 gAx = dFdx( uA ); vec2 gAy = dFdy( uA ); vec2 gBx = dFdx( uB ); vec2 gBy = dFdy( uB );
    if ( visA > 0.003 ) hA = ( textureGrad( uHedgeLeaves, vec3( uA, uHedgeLayer ), gAx, gAy ).b - 0.45 ) * visA;
    if ( visB > 0.003 ) hB = ( textureGrad( uHedgeLeaves, vec3( uB, uHedgeLayer ), gBx, gBy ).b - 0.45 ) * visB;
    float leaf = hA * 0.8 + hB * 0.5;
    // Which way the skin faces, against the sky: its underside is cool and dark, its crown warm and bright.
    vec3 worldUp = normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz );
    float facing = dot( normalize( vNormal ), worldUp );
    float sky = smoothstep( -0.5, 0.75, facing );
    vec3 tintLow = vec3( 0.62, 0.78, 0.92 );
    vec3 tintHigh = vec3( 1.06, 1.03, 0.9 );
    diffuseColor.rgb *= mix( tintLow, tintHigh, sky ) * mix( 0.72, 1.0, sky );
    diffuseColor.rgb *= 1.0 + leaf * 1.15;
    hedgeH = hA * 0.06 + hB * 0.035;
    hedgeShade = clamp( 0.55 + leaf * 1.3, 0.2, 1.4 );
  }`,
      )
      .replace("#include <normal_fragment_maps>", "#include <normal_fragment_maps>\n  normal = rcReliefNormal( normal, hedgeH, 1.0 );")
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\n  totalEmissiveRadiance *= hedgeShade;");
  };
  material.customProgramCacheKey = () => "land-hedge";
  return material;
}
