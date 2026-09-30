/**
 * A walk cycle for the crowd's lean and near figures, done in the vertex
 * shader so it costs no extra draw and no extra geometry. Each figure carries
 * `aGait` (its stride phase, and how hard it is walking: 0 standing): legs
 * swing about the hip and arms about the shoulder, opposite to each other,
 * and the body drops as the legs spread so the planted foot stays on the
 * pavement (`hipDrop`). The phase advances with the distance the figure
 * actually covers, so feet do not skate.
 *
 * The body model is in `models/props/walkerModel.ts`: origin at chest height,
 * hips at y -0.14, shoulders at y 0.26, arms beyond |x| 0.13. Pure helpers
 * here are unit tested.
 */

import type { MeshStandardMaterial } from "three";

export const GAIT_ATTRIBUTE = "aGait";

/** Stride phase (radians) per unit walked: half a cycle per step of about 0.28 units. */
export const STRIDE_PER_UNIT = 11.3;
/** Swing of the legs and arms at full stride, radians, and the leg's length below the hip. */
export const LEG_SWING = 0.5;
export const ARM_SWING = 0.42;
const LEG_LENGTH = 0.29;

/** How far the body drops so the planted foot stays on the ground, in model units. */
export function hipDrop(phase: number, amp: number): number {
  return LEG_LENGTH * (1 - Math.cos(LEG_SWING * amp * Math.abs(Math.sin(phase))));
}

const GLSL = `
attribute vec2 ${GAIT_ATTRIBUTE};
`;

const SWING = `
{
  float gSide = transformed.x >= 0.0 ? 1.0 : -1.0;
  float gOut = smoothstep(0.128, 0.142, abs(transformed.x));
  float gLeg = (1.0 - gOut) * smoothstep(-0.17, -0.25, transformed.y);
  float gArm = gOut;
  float gs = sin(${GAIT_ATTRIBUTE}.x) * ${GAIT_ATTRIBUTE}.y * gSide;
  float gA = gs * ${LEG_SWING.toFixed(3)} * gLeg - gs * ${ARM_SWING.toFixed(3)} * gArm;
  float gPivot = gLeg > 0.0 ? -0.14 : 0.26;
  float gC = cos(gA);
  float gS = sin(gA);
  float gy = transformed.y - gPivot;
  float gz = transformed.z;
  float gW = max(gLeg, gArm);
  transformed.y = mix(transformed.y, gPivot + gy * gC - gz * gS, gW);
  transformed.z = mix(transformed.z, gy * gS + gz * gC, gW);
}
`;

/** Adds the walk cycle to a figure material, keeping whatever patch it already has. */
export function gaitMaterial<M extends MeshStandardMaterial>(material: M): M {
  const before = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    before.call(material, shader, renderer);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${GLSL}`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>\n${SWING}`);
  };
  const key = material.customProgramCacheKey.bind(material);
  material.customProgramCacheKey = () => `${key()}-gait`;
  return material;
}
