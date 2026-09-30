import type { MeshStandardMaterial, WebGLProgramParametersWithUniforms } from "three";
import { modelSurfaceTextureArray, type ModelDetailOptions } from "./texture-data";
import { SURFACE } from "./surface-types";

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

const SURFACE_SAMPLE = /* glsl */ `
${COORDINATES}
float rcSurfaceLayer = clamp(floor(rcDetailSurface + 0.5), 0.0, 11.0);
vec2 rcSurfaceScale = vec2(1.0);
float rcDetailBump = 0.012;
if (rcSurfaceLayer > 0.5 && rcSurfaceLayer < 2.5) rcDetailBump = 0.025;
else if (rcSurfaceLayer < 3.5 && rcSurfaceLayer > 2.5) {
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
  const vertexBody = profile === "building" ? VERTEX_BODY.replace("rcDetailPaint = paint;", "rcDetailPaint = 0.0;") : VERTEX_BODY;
  const sample = profile === "organic" ? ORGANIC_SAMPLE : SURFACE_SAMPLE;
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", `#include <common>\n${VERTEX_HEAD}\n${SURFACE_VERTEX_HEAD}`)
    .replace("#include <begin_vertex>", `#include <begin_vertex>\n${vertexBody}`);
  shader.fragmentShader = shader.fragmentShader
    .replace("#include <common>", `#include <common>\n${FRAGMENT_HEAD}`)
    .replace("#include <map_fragment>", `#include <map_fragment>\n${sample}`)
    .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>\nroughnessFactor = clamp(rcDetailTexel.g * (0.85 + roughness * 0.15), 0.04, 1.0);`)
    .replace("#include <metalnessmap_fragment>", `#include <metalnessmap_fragment>\nmetalnessFactor = max(metalnessFactor, rcDetailTexel.a);`)
    .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>\nnormal = rcReliefNormal(normal, rcDetailTexel.b, rcDetailBump * rcDetailAmount);`);
}
