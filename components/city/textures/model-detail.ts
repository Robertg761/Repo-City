import type { MeshStandardMaterial, WebGLProgramParametersWithUniforms } from "three";
import { modelSurfaceTextureArray, type ModelDetailOptions } from "./texture-data";
import { SURFACE } from "./surface-types";
import { SKY_REFLECTION } from "./sky-reflection";

/** Screen-space height gradients add relief without extra texture lookups. */
export const RELIEF_GLSL = /* glsl */ `
vec3 rcReliefNormal(vec3 surfaceNormal, float height, float scale) {
  vec3 sigmaX = dFdx(-vViewPosition);
  vec3 sigmaY = dFdy(-vViewPosition);
  vec3 r1 = cross(sigmaY, surfaceNormal);
  vec3 r2 = cross(surfaceNormal, sigmaX);
  float determinant = dot(sigmaX, r1);
  vec3 gradient = sign(determinant) * (dFdx(height) * r1 + dFdy(height) * r2);
  return normalize(max(abs(determinant), 1e-10) * surfaceNormal - gradient * scale);
}
`;

const VERTEX_HEAD = /* glsl */ `
varying vec3 rcDetailPosition;
varying vec3 rcDetailNormal;
varying vec3 rcDetailBaseColor;
varying float rcDetailPaint;
varying float rcDetailSurface;
`;

const SURFACE_VERTEX_HEAD = /* glsl */ `
uniform float rcDefaultSurface;
#ifdef RC_SURFACE_ATTRIBUTE
  attribute float surface;
#endif
`;

const VERTEX_BODY = /* glsl */ `
vec3 rcDetailScale = vec3(1.0);
#ifdef USE_INSTANCING
  rcDetailScale = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
#endif
rcDetailPosition = position * rcDetailScale;
rcDetailNormal = normal;
#if defined(USE_COLOR) || defined(USE_COLOR_ALPHA)
  rcDetailBaseColor = color.rgb;
#else
  rcDetailBaseColor = vec3(1.0);
#endif
rcDetailPaint = paint;
#ifdef RC_SURFACE_ATTRIBUTE
  rcDetailSurface = surface;
#else
  rcDetailSurface = rcDefaultSurface;
#endif
`;

const FRAGMENT_HEAD = /* glsl */ `
${VERTEX_HEAD}
uniform highp sampler2DArray rcSurfacePatterns;
${RELIEF_GLSL}
`;

const COORDINATES = /* glsl */ `
vec3 rcAxis = abs(normalize(rcDetailNormal));
vec2 rcDetailUv = rcDetailPosition.xy;
if (rcAxis.y > rcAxis.x && rcAxis.y > rcAxis.z) rcDetailUv = rcDetailPosition.xz;
else if (rcAxis.x > rcAxis.z) rcDetailUv = rcDetailPosition.zy;
rcDetailUv /= 2.0;
// Mipmaps soften small texels; this also fades relief as a whole tile becomes small.
float rcDetailVisible = 1.0 - smoothstep(0.09, 0.28, max(length(dFdx(rcDetailUv)), length(dFdy(rcDetailUv))));
`;

/**
 * Tiles are two world units across, and a building's world unit is about
 * two metres of the real thing (a storey is 3 to 4 units of a tower and its
 * window a little over one), so a layer baked at real size reads oversized
 * beside the windows and doors. Brick is sampled 1.6 times finer: its 24
 * courses a tile become 38, a window is then some sixteen courses tall rather
 * than ten. Stone is sampled twice as fine, its 0.5 blocks becoming 0.25.
 * The relief is divided by the same factor, since the height gradient grows
 * with the sampling rate and the features are that much shallower.
 */
export const BRICK_SCALE = 1.6;
export const STONE_SCALE = 2.0;

const SURFACE_SAMPLE = /* glsl */ `
${COORDINATES}
float rcSurfaceLayer = clamp(floor(rcDetailSurface + 0.5), 0.0, 11.0);
vec2 rcSurfaceScale = vec2(1.0);
float rcDetailBump = 0.012;
if (rcSurfaceLayer > 0.5 && rcSurfaceLayer < 1.5) {
  rcSurfaceScale = vec2(${BRICK_SCALE.toFixed(2)});
  rcDetailBump = 0.025 / ${BRICK_SCALE.toFixed(2)};
} else if (rcSurfaceLayer > 1.5 && rcSurfaceLayer < 2.5) {
  rcSurfaceScale = vec2(${STONE_SCALE.toFixed(2)});
  rcDetailBump = 0.025 / ${STONE_SCALE.toFixed(2)};
} else if (rcSurfaceLayer < 3.5 && rcSurfaceLayer > 2.5) {
  rcSurfaceScale = vec2(1.5, 0.8);
  rcDetailBump = 0.008;
} else if (rcSurfaceLayer > 3.5 && rcSurfaceLayer < 6.5) rcDetailBump = 0.021;
else if (rcSurfaceLayer > 6.5 && rcSurfaceLayer < 7.5) rcDetailBump = 0.003;
else if (rcSurfaceLayer > 7.5 && rcSurfaceLayer < 8.5) rcDetailBump = 0.0;
else if (rcSurfaceLayer > 8.5 && rcSurfaceLayer < 9.5) rcSurfaceScale = vec2(1.25);
else if (rcSurfaceLayer > 9.5 && rcSurfaceLayer < 10.5) {
  rcSurfaceScale = vec2(8.0);
  rcDetailBump = 0.0015;
}
vec4 rcDetailTexel = texture(rcSurfacePatterns, vec3(rcDetailUv * rcSurfaceScale, rcSurfaceLayer));
float rcDetailAmount = rcDetailVisible;
diffuseColor.rgb *= mix(1.0, rcDetailTexel.r, rcDetailAmount);
`;

/**
 * Glass reflects the sky it faces, the street it looks down on and the
 * sun (`sky-reflection.ts`), added as light rather than as paint: a pane in
 * shadow still shows the sky. The view's angle sets the share, a fifth head
 * on and most of it at a grazing angle, and the pane's own tint (the tower's
 * blue, green or bronze) colours it. Only glass fragments (layer 8) take it.
 */
const GLASS_HEAD = /* glsl */ `
uniform vec3 rcSkyZenith;
uniform vec3 rcSkyHorizon;
uniform vec3 rcSkyGround;
uniform vec3 rcSunColor;
uniform vec3 rcSunDirection;
uniform float rcGlassSky;
`;

const GLASS_REFLECTION = /* glsl */ `
if (rcSurfaceLayer > 7.5 && rcSurfaceLayer < 8.5) {
  vec3 rcView = normalize(vViewPosition);
  float rcFacing = clamp(dot(normal, rcView), 0.0, 1.0);
  vec3 rcBounce = inverseTransformDirection(reflect(-rcView, normal), viewMatrix);
  float rcUpward = rcBounce.y;
  vec3 rcSkyTone = mix(rcSkyHorizon, rcSkyZenith, smoothstep(0.0, 0.85, rcUpward));
  vec3 rcSeen = mix(rcSkyTone, rcSkyGround, smoothstep(0.0, -0.35, rcUpward));
  float rcGlint = pow(max(dot(rcBounce, rcSunDirection), 0.0), 48.0);
  vec3 rcTint = diffuseColor.rgb / max(max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b)), 0.05);
  float rcShare = 0.2 + 0.65 * pow(1.0 - rcFacing, 3.0);
  totalEmissiveRadiance += (rcSeen * mix(vec3(1.0), rcTint, 0.55) * rcShare + rcSunColor * rcGlint * 0.5) * rcGlassSky;
}
`;

const ORGANIC_SAMPLE = /* glsl */ `
${COORDINATES}
// The paint mask remains authoritative for the original tree and crop models.
float rcSurfaceLayer = rcDetailPaint > 0.5 ? 9.0 : 12.0;
vec2 rcSurfaceScale = rcDetailPaint > 0.5 ? vec2(1.25) : vec2(4.0, 1.2);
#ifdef RC_SURFACE_ATTRIBUTE
  rcSurfaceLayer = clamp(floor(rcDetailSurface + 0.5), 0.0, 11.0);
  if (rcSurfaceLayer > 2.5 && rcSurfaceLayer < 3.5) rcSurfaceLayer = 12.0;
#endif
vec4 rcDetailTexel = texture(rcSurfacePatterns, vec3(rcDetailUv * rcSurfaceScale, rcSurfaceLayer));
float rcDetailAmount = rcDetailVisible;
float rcDetailBump = 0.012;
diffuseColor.rgb *= mix(1.0, rcDetailTexel.r, rcDetailAmount);
`;

/** Opt-in declarations avoid reading an attribute absent from older geometry. */
export function configureSurfaceMaterial(material: MeshStandardMaterial, detail: ModelDetailOptions = {}): void {
  const defines = { ...material.defines };
  if (detail.surfaceAttribute) defines.RC_SURFACE_ATTRIBUTE = "";
  else delete defines.RC_SURFACE_ATTRIBUTE;
  material.defines = defines;
}

/** Instancing, paint masks and tree sway are preserved by the caller's patch. */
export function patchModelDetail(
  shader: WebGLProgramParametersWithUniforms,
  profile: "settlement" | "building" | "organic" | "prop",
  { textureSize = 256, anisotropy = 4, surface = SURFACE.plaster }: ModelDetailOptions = {},
): void {
  shader.uniforms.rcSurfacePatterns = { value: modelSurfaceTextureArray(textureSize, anisotropy) };
  shader.uniforms.rcDefaultSurface = { value: surface };
  // Buildings and the settlement models glaze; props (cars, kiosks) keep their dark glass.
  const glass = profile === "building" || profile === "settlement";
  if (glass) Object.assign(shader.uniforms, SKY_REFLECTION);
  const vertexBody = profile === "building" ? VERTEX_BODY.replace("rcDetailPaint = paint;", "rcDetailPaint = 0.0;") : VERTEX_BODY;
  const sample = profile === "organic" ? ORGANIC_SAMPLE : SURFACE_SAMPLE;
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", `#include <common>\n${VERTEX_HEAD}\n${SURFACE_VERTEX_HEAD}`)
    .replace("#include <begin_vertex>", `#include <begin_vertex>\n${vertexBody}`);
  shader.fragmentShader = shader.fragmentShader
    .replace("#include <common>", `#include <common>\n${FRAGMENT_HEAD}${glass ? GLASS_HEAD : ""}`)
    .replace("#include <map_fragment>", `#include <map_fragment>\n${sample}`)
    .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>\n${glass ? GLASS_REFLECTION : ""}`)
    .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>\nroughnessFactor = clamp(rcDetailTexel.g * (0.85 + roughness * 0.15), 0.04, 1.0);`)
    .replace("#include <metalnessmap_fragment>", `#include <metalnessmap_fragment>\nmetalnessFactor = max(metalnessFactor, rcDetailTexel.a);`)
    .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>\nnormal = rcReliefNormal(normal, rcDetailTexel.b, rcDetailBump * rcDetailAmount);`);
}
