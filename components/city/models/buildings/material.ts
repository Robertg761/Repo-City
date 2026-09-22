/**
 * The material the village and town archetypes are drawn with (PLAN.md 76.11,
 * S6).
 *
 * three multiplies the per-instance colour into every vertex. The settlement
 * models need three answers instead of one, per vertex, and `kit.ts` bakes
 * which one into a `paint` attribute:
 *
 *   0  keep the vertex colour: thatch, tile, glass, frames, flowers;
 *   1  multiply by the instance colour: the wall;
 *   2  multiply by the instance's `instanceAccent`: the door, the shutters,
 *      the shop's fascia and awning.
 *
 * The patch replaces one line of three's `color_vertex` chunk and touches no
 * lighting code, so the material takes the scene's sun, shadows and fog like
 * every other. One program for every settlement archetype.
 */

import { MeshStandardMaterial, ShaderChunk, type MeshStandardMaterialParameters } from "three";

/** The per-instance accent colour, a `vec3` `InstancedBufferAttribute`. */
export const ACCENT_ATTRIBUTE = "instanceAccent";

/** The line in three's `color_vertex` chunk that applies the instance colour. */
const INSTANCE_TINT = "vColor.rgb *= instanceColor.rgb;";

const PAINT_TINT = `vColor.rgb *= paint < 0.5 ? vec3( 1.0 ) : ( paint < 1.5 ? instanceColor.rgb : ${ACCENT_ATTRIBUTE} );`;

/** three's `color_vertex` chunk with the three-way paint switch in place of the tint. */
export function paintSwitchChunk(): string {
  const chunk = ShaderChunk.color_vertex;
  if (!chunk.includes(INSTANCE_TINT)) {
    throw new Error("settlementMaterial: three's color_vertex chunk has changed");
  }
  return chunk.replace(INSTANCE_TINT, PAINT_TINT);
}

export function settlementMaterial(parameters: MeshStandardMaterialParameters = {}): MeshStandardMaterial {
  const material = new MeshStandardMaterial({ vertexColors: true, ...parameters });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>\nattribute float paint;\nattribute vec3 ${ACCENT_ATTRIBUTE};`,
      )
      .replace("#include <color_vertex>", paintSwitchChunk());
  };
  material.customProgramCacheKey = () => "settlement-paint";
  return material;
}
