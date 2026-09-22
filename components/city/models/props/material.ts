/**
 * One material for instanced things whose instance colour should only reach
 * part of them (PLAN.md sections 4 and 38).
 *
 * three multiplies the per-instance colour into every vertex, which is fine
 * for a building and wrong for a car: the glass, the tyres and the lamps come
 * out red on a red car and near black on a dark one. `mergeParts` bakes a
 * `paint` mask next to the vertex colours; this material reads it and lets the
 * instance colour through only where the mask is set. Paintwork takes the
 * car's colour, the glass stays glass. A tree's crown takes its seeded leaf
 * tint while its trunk stays bark, so one species is one draw call.
 *
 * SWAY. Trees can also lean in the wind: the painted part of each instance is
 * pushed sideways by a sine of time and of where the instance stands, growing
 * with height above `base`. It is a few lines in the vertex shader and costs
 * nothing on the CPU; the trunk (unpainted) never moves, so a crown cannot
 * come away from it. Shadows do not sway: at a few hundredths of a unit the
 * difference is invisible.
 *
 * The patch edits one line of one stock chunk and adds a displacement after
 * another, and touches no lighting code, so the material still takes the
 * scene's lights, fog and shadows like any other.
 */

import { MeshStandardMaterial, ShaderChunk, type MeshStandardMaterialParameters } from "three";
import { PAINT_ATTRIBUTE } from "./geometry";

export interface SwayOptions {
  /** Shared clock uniform, in seconds. The caller advances it per frame. */
  time: { value: number };
  /** Sideways travel per unit of height above `base`, world units. */
  amount: number;
  /** Height below which nothing moves: roughly the top of the trunk. */
  base: number;
}

/**
 * The city's one wind: a clock uniform, in seconds, that every swaying
 * material reads. `Props.tsx` advances it once a frame.
 */
export const WIND_CLOCK = { value: 0 };

/** The line in three's `color_vertex` chunk that applies the instance colour. */
export const INSTANCE_TINT = "vColor.rgb *= instanceColor.rgb;";

/** What it becomes: the instance colour, weighted by the paint mask. */
export const PAINTED_TINT = `vColor.rgb *= mix( vec3( 1.0 ), instanceColor.rgb, ${PAINT_ATTRIBUTE} );`;

/** three's `color_vertex` chunk with the instance tint gated by the mask. */
export function paintedColorChunk(): string {
  const chunk = ShaderChunk.color_vertex;
  if (!chunk.includes(INSTANCE_TINT)) {
    // A three upgrade moved the line. Fail loudly in the tests rather than
    // quietly painting every windscreen.
    throw new Error("tintedMaterial: three's color_vertex chunk has changed");
  }
  return chunk.replace(INSTANCE_TINT, PAINTED_TINT);
}

/** The displacement the swaying variant adds after `begin_vertex`. */
const SWAY_GLSL = `
#ifdef USE_INSTANCING
	vec2 swayOrigin = vec2( instanceMatrix[3][0], instanceMatrix[3][2] );
#else
	vec2 swayOrigin = vec2( 0.0 );
#endif
	// Neighbouring trees are out of step, so a park ripples instead of nodding.
	float swayPhase = uSwayTime * 1.1 + swayOrigin.x * 0.23 + swayOrigin.y * 0.19;
	float swayWeight = ${PAINT_ATTRIBUTE} * max( 0.0, transformed.y - uSwayBase ) * uSwayAmount;
	transformed.x += sin( swayPhase ) * swayWeight;
	transformed.z += sin( swayPhase * 0.77 + 1.3 ) * swayWeight * 0.6;
`;

/**
 * A standard material that paints only the masked part of each instance, and
 * optionally sways it. The program is keyed by `customProgramCacheKey`, so
 * every tinted mesh in the city shares one shader (and every swaying one
 * another).
 */
export function tintedMaterial(
  parameters: MeshStandardMaterialParameters = {},
  sway?: SwayOptions,
): MeshStandardMaterial {
  const material = new MeshStandardMaterial({ vertexColors: true, ...parameters });

  material.onBeforeCompile = (shader) => {
    const declarations = [`attribute float ${PAINT_ATTRIBUTE};`];
    if (sway) {
      declarations.push("uniform float uSwayTime;", "uniform float uSwayAmount;", "uniform float uSwayBase;");
      shader.uniforms.uSwayTime = sway.time;
      shader.uniforms.uSwayAmount = { value: sway.amount };
      shader.uniforms.uSwayBase = { value: sway.base };
    }
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${declarations.join("\n")}`)
      .replace("#include <color_vertex>", paintedColorChunk());
    if (sway) {
      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>\n${SWAY_GLSL}`,
      );
    }
  };
  material.customProgramCacheKey = () => (sway ? "tinted-sway" : "tinted");
  return material;
}
