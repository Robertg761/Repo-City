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
import { configureSurfaceMaterial, patchModelDetail } from "../../textures/model-detail";
import type { ModelDetailOptions } from "../../textures/texture-data";

/** The per-instance accent colour, a `vec3` `InstancedBufferAttribute`. */
export const ACCENT_ATTRIBUTE = "instanceAccent";

/** The per-instance roof colour, glass tint and (wall, roof) surface layers of a city building under the material palette. */
export const ROOF_ATTRIBUTE = "instanceRoof";
export const GLASS_ATTRIBUTE = "instanceGlass";
export const SURFACES_ATTRIBUTE = "instanceSurfaces";

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

export function settlementMaterial(
  parameters: MeshStandardMaterialParameters = {},
  detail: ModelDetailOptions = {},
): MeshStandardMaterial {
  const material = new MeshStandardMaterial({ vertexColors: true, ...parameters });
  configureSurfaceMaterial(material, detail);
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>\nattribute float paint;\nattribute vec3 ${ACCENT_ATTRIBUTE};`,
      )
      .replace("#include <color_vertex>", paintSwitchChunk());
    patchModelDetail(shader, "settlement", detail);
  };
  material.customProgramCacheKey = () => `settlement-paint-surface-${detail.surfaceAttribute ? "authored" : "uniform"}`;
  return material;
}

/** The city archetypes have vertex colours but no settlement paint attribute. */
export function buildingDetailMaterial(
  parameters: MeshStandardMaterialParameters = {},
  detail: ModelDetailOptions = {},
): MeshStandardMaterial {
  const material = new MeshStandardMaterial({ vertexColors: true, ...parameters });
  configureSurfaceMaterial(material, detail);
  material.onBeforeCompile = (shader) => patchModelDetail(shader, "building", detail);
  material.customProgramCacheKey = () => `city-building-surface-${detail.surfaceAttribute ? "authored" : "uniform"}`;
  return material;
}

const CITY_PAINT_TINT =
  `vColor.rgb *= paint < 0.5 ? vec3( 1.0 ) : ( paint < 1.5 ? instanceColor.rgb : ( paint < 2.5 ? ${ACCENT_ATTRIBUTE} : ( paint < 3.5 ? ${ROOF_ATTRIBUTE} : ${GLASS_ATTRIBUTE} ) ) );`;

/** The surface a vertex is textured with: its baked one, or the instance's wall or roof material. */
const CITY_SURFACE_OVERRIDE =
  `rcDetailSurface = surface;\n  if ( paint > 0.5 && paint < 1.5 ) rcDetailSurface = ${SURFACES_ATTRIBUTE}.x;\n  else if ( paint > 2.5 && paint < 3.5 ) rcDetailSurface = ${SURFACES_ATTRIBUTE}.y;`;

/**
 * The city archetypes under the material palette: `settlementMaterial`'s paint
 * switch with two more channels (3 the roof, 4 the glass) and a per-instance
 * override of the wall's and the roof's textured surface, so a brick building
 * is brick-textured and a copper roof metal. One program for every city
 * archetype; the geometry must carry `paint` and `surface` attributes.
 */
export function cityPaintMaterial(
  parameters: MeshStandardMaterialParameters = {},
  detail: ModelDetailOptions = {},
): MeshStandardMaterial {
  const material = new MeshStandardMaterial({ vertexColors: true, ...parameters });
  configureSurfaceMaterial(material, { ...detail, surfaceAttribute: true });
  material.onBeforeCompile = (shader) => {
    const chunk = ShaderChunk.color_vertex;
    if (!chunk.includes(INSTANCE_TINT)) throw new Error("cityPaintMaterial: three's color_vertex chunk has changed");
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>\nattribute float paint;\nattribute vec3 ${ACCENT_ATTRIBUTE};\nattribute vec3 ${ROOF_ATTRIBUTE};\nattribute vec3 ${GLASS_ATTRIBUTE};\nattribute vec2 ${SURFACES_ATTRIBUTE};`,
      )
      .replace("#include <color_vertex>", chunk.replace(INSTANCE_TINT, CITY_PAINT_TINT));
    patchModelDetail(shader, "settlement", { ...detail, surfaceAttribute: true });
    if (!shader.vertexShader.includes("rcDetailSurface = surface;")) {
      throw new Error("cityPaintMaterial: the model detail patch has changed");
    }
    shader.vertexShader = shader.vertexShader.replace("rcDetailSurface = surface;", CITY_SURFACE_OVERRIDE);
  };
  material.customProgramCacheKey = () => "city-paint-surface";
  return material;
}
