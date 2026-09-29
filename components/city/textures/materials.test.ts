import { describe, expect, it } from "vitest";
import { NoColorSpace, RepeatWrapping, ShaderLib } from "three";
import { buildingDetailMaterial, settlementMaterial } from "../models/buildings/material";
import { tintedMaterial } from "../models/props/material";
import { paverPattern } from "./patterns";
import { streetMaterial } from "./surfaces";
import {
  surfaceTexture,
  surfaceReliefPattern,
  surfaceReliefTexture,
  surfaceModelTexture,
  modelSurfaceTextureArray,
  MODEL_FINISH,
  tiledSurface,
} from "./texture-data";
import { MODEL_SURFACE_KINDS, SURFACE } from "./surface-types";
import { BRICK_SCALE, STONE_SCALE } from "./model-detail";
import { SKY_REFLECTION } from "./sky-reflection";

function compiledShader(material: ReturnType<typeof settlementMaterial>) {
  const shader = {
    uniforms: {} as Record<string, { value: unknown }>,
    vertexShader: ShaderLib.standard.vertexShader,
    fragmentShader: ShaderLib.standard.fragmentShader,
  };
  material.onBeforeCompile(shader as never, undefined as never);
  return shader;
}

describe("surface texture ownership", () => {
  it("normalises cache sizes and shares images while keeping repeat transforms private", () => {
    const shared = surfaceTexture("concrete", 256);
    expect(surfaceTexture("concrete", 300)).toBe(shared);
    expect(shared.colorSpace).toBe(NoColorSpace);
    expect(shared.wrapS).toBe(RepeatWrapping);
    expect(shared.generateMipmaps).toBe(true);
    const a = tiledSurface("concrete", 256, 3);
    const b = tiledSurface("concrete", 256, 9);
    expect(a.source).toBe(shared.source);
    expect(b.source).toBe(shared.source);
    expect(a.repeat.x).toBe(3);
    expect(b.repeat.x).toBe(9);
    expect(shared.repeat.x).toBe(1);
    a.dispose();
    b.dispose();
    expect(surfaceTexture("concrete", 256)).toBe(shared);
  });

  it("packs tone, roughness and height into one shared model texture", () => {
    const color = surfaceTexture("roof", 128);
    const relief = surfaceReliefTexture("roof", 128);
    const model = surfaceModelTexture("roof", 128);
    expect(surfaceModelTexture("roof", 128)).toBe(model);
    const a = color.image.data as Uint8Array;
    const b = relief.image.data as Uint8Array;
    const c = model.image.data as Uint8Array;
    for (let i = 0; i < a.length; i += 4) {
      expect(c[i]).toBe(Math.round((a[i] + a[i + 1] + a[i + 2]) / 3));
      const tone = c[i] / 255;
      expect(Math.abs(c[i + 1] - Math.round(Math.min(1, MODEL_FINISH.roof!.roughness + (1 - tone) * MODEL_FINISH.roof!.variation) * 255))).toBeLessThanOrEqual(1);
      expect(c[i + 2]).toBe(b[i]);
    }
  });

  it("makes mortar lower and rougher without turning asphalt wear alpha into relief", () => {
    const color = paverPattern(128);
    const relief = surfaceReliefPattern(color);
    const joint = (16 * 128) * 4;
    const centre = (8 * 128 + 16) * 4;
    expect(relief.data[joint]).toBeLessThan(relief.data[centre]);
    expect(relief.data[joint + 1]).toBeGreaterThan(relief.data[centre + 1]);
    const changedAlpha = { ...color, data: new Uint8Array(color.data) };
    for (let i = 3; i < changedAlpha.data.length; i += 4) changedAlpha.data[i] = 0;
    expect(surfaceReliefPattern(changedAlpha).data).toEqual(relief.data);
  });

  it("supports the high tier's 512 textures and requested anisotropy", () => {
    const detail = surfaceModelTexture("facade", 512, 8);
    expect(detail.image.width).toBe(512);
    expect(detail.image.data!.length).toBe(512 * 512 * 4);
    expect(detail.anisotropy).toBe(8);
    expect(surfaceModelTexture("facade", 128, 1).image.width).toBe(128);
  });
});

describe("model detail shaders", () => {
  it("preserves settlement colour channels and adds local metre-scale detail without UV attributes", () => {
    const material = settlementMaterial({}, { textureSize: 128, anisotropy: 1 });
    const shader = compiledShader(material);
    expect(shader.vertexShader).toContain("attribute float paint;");
    expect(shader.vertexShader).toContain("instanceAccent");
    expect(shader.vertexShader).toContain("rcDetailPosition = position * rcDetailScale;");
    expect(shader.vertexShader).not.toContain("attribute vec2 uv");
    expect(shader.fragmentShader).toContain("rcSurfaceLayer");
    expect(shader.fragmentShader).toContain("normal = rcReliefNormal");
    expect(shader.uniforms.rcSurfacePatterns.value).toBe(modelSurfaceTextureArray(128, 1));
    material.dispose();
    expect(modelSurfaceTextureArray(128, 1)).toBe(shader.uniforms.rcSurfacePatterns.value);
  });

  it("details older building meshes without reading a missing paint attribute", () => {
    const material = buildingDetailMaterial();
    const shader = compiledShader(material);
    expect(shader.vertexShader).toContain("rcDetailPaint = 0.0;");
    expect(shader.vertexShader).not.toContain("rcDetailPaint = paint;");
    expect(shader.vertexShader).not.toContain("attribute float paint;");
    expect(shader.fragmentShader).toContain("roughnessFactor = clamp(rcDetailTexel.g");
    material.dispose();
  });

  it("supports matte landmark parts that have neither colour nor paint attributes", () => {
    const material = buildingDetailMaterial({ vertexColors: false });
    const shader = compiledShader(material);
    expect(material.vertexColors).toBe(false);
    expect(shader.vertexShader).toContain("#if defined(USE_COLOR) || defined(USE_COLOR_ALPHA)");
    expect(shader.vertexShader).toContain("rcDetailBaseColor = vec3(1.0);");
    expect(shader.vertexShader).not.toContain("attribute float paint;");
    material.dispose();
  });

  it("preserves the wind uniform and paint mask while separating organic programs from vehicles", () => {
    const time = { value: 2 };
    const tree = tintedMaterial({}, { time, amount: 0.02, base: 1 });
    const shader = compiledShader(tree);
    expect(shader.uniforms.uSwayTime).toBe(time);
    expect(shader.vertexShader).toContain("swayWeight");
    expect(shader.vertexShader).toContain("mix( vec3( 1.0 ), instanceColor.rgb, paint )");
    expect(shader.uniforms.rcSurfacePatterns.value).toBe(modelSurfaceTextureArray(256, 4));
    const crop = tintedMaterial({}, undefined, { profile: "organic" });
    expect(crop.customProgramCacheKey()).toBe("tinted-organic");
    const pedestrian = tintedMaterial({ roughness: 0.92 });
    expect(compiledShader(pedestrian).vertexShader).toContain("rcDetailPaint");
    tree.dispose();
    crop.dispose();
    pedestrian.dispose();
  });
});

describe("authored surface selection", () => {
  it("uses the vertex attribute only for an explicitly opted-in geometry", () => {
    const tagged = buildingDetailMaterial({}, { surfaceAttribute: true });
    const fallback = buildingDetailMaterial({}, { surface: SURFACE.stone });
    expect(tagged.defines?.RC_SURFACE_ATTRIBUTE).toBe("");
    expect(fallback.defines?.RC_SURFACE_ATTRIBUTE).toBeUndefined();
    expect(compiledShader(fallback).uniforms.rcDefaultSurface.value).toBe(SURFACE.stone);
    expect(compiledShader(tagged).vertexShader).toContain("#ifdef RC_SURFACE_ATTRIBUTE");
    expect(tagged.customProgramCacheKey()).not.toBe(fallback.customProgramCacheKey());
    const shader = compiledShader(tagged);
    expect(shader.fragmentShader).not.toContain("rcDarkTimber");
    expect(shader.fragmentShader).not.toContain("rcInclined");
    expect(shader.fragmentShader).not.toContain("rcBlue");
    tagged.dispose();
    fallback.dispose();
  });

  it("packs each semantic finish into an isolated tileable texture-array layer", () => {
    const array = modelSurfaceTextureArray(64, 1);
    expect(array.image.depth).toBe(MODEL_SURFACE_KINDS.length);
    expect(array.generateMipmaps).toBe(true);
    const stride = 64 * 64 * 4;
    MODEL_SURFACE_KINDS.forEach((kind, layer) => {
      expect(array.image.data!.slice(layer * stride, (layer + 1) * stride)).toEqual(surfaceModelTexture(kind, 64, 1).image.data);
    });
    expect(modelSurfaceTextureArray(64, 1)).toBe(array);
  });

  it("keeps glass flat and glossy, metal conductive, and fabric/plaster matte", () => {
    const glass = surfaceModelTexture("glass", 64).image.data as Uint8Array;
    const metal = surfaceModelTexture("metal", 64).image.data as Uint8Array;
    const fabric = surfaceModelTexture("fabric", 64).image.data as Uint8Array;
    const plaster = surfaceModelTexture("plaster", 64).image.data as Uint8Array;
    for (let i = 0; i < glass.length; i += 4) {
      expect(glass[i + 2]).toBe(128);
      expect(glass[i + 3]).toBe(0);
      expect(glass[i + 1]).toBeLessThan(90);
      expect(metal[i + 3]).toBeGreaterThan(0);
      expect(metal[i + 3]).toBeLessThanOrEqual(Math.round(0.3 * 255));
      expect(fabric[i + 1]).toBeGreaterThan(220);
      expect(plaster[i + 1]).toBeGreaterThan(220);
    }
  });
});

describe("the size of masonry", () => {
  it("samples brick and stone finer than their tile, so the courses read at the size of the windows", () => {
    // A unit is about two metres of the real thing, so the 24 baked brick
    // courses of a 2 unit tile (8 cm each at one to one) would sit oversized
    // beside the doors and windows. Brick is 1.6 times finer, stone twice.
    expect(BRICK_SCALE).toBeGreaterThan(1.3);
    expect(STONE_SCALE).toBeGreaterThan(1.7);
    const material = settlementMaterial({}, { surfaceAttribute: true });
    const { fragmentShader } = compiledShader(material);
    expect(fragmentShader).toContain(`rcSurfaceScale = vec2(${BRICK_SCALE.toFixed(2)})`);
    expect(fragmentShader).toContain(`rcSurfaceScale = vec2(${STONE_SCALE.toFixed(2)})`);
    // Relief follows the sampling rate: the finer the courses, the shallower each joint.
    expect(fragmentShader).toContain(`rcDetailBump = 0.025 / ${BRICK_SCALE.toFixed(2)}`);
    material.dispose();
  });
});

describe("what glass reflects", () => {
  it("adds the sky to the glass of buildings and settlement models, from shared uniforms", () => {
    for (const make of [() => settlementMaterial({}, { surfaceAttribute: true }), () => buildingDetailMaterial({}, { surfaceAttribute: true })]) {
      const material = make();
      const shader = compiledShader(material);
      expect(shader.fragmentShader).toContain("rcSurfaceLayer > 7.5 && rcSurfaceLayer < 8.5");
      expect(shader.fragmentShader).toContain("totalEmissiveRadiance +=");
      for (const name of Object.keys(SKY_REFLECTION)) {
        expect(shader.uniforms[name], name).toBe(SKY_REFLECTION[name as keyof typeof SKY_REFLECTION]);
      }
      material.dispose();
    }
  });

  it("leaves the dark glass of props (cars, kiosks) as it was", () => {
    const prop = tintedMaterial({ roughness: 0.92 });
    const shader = compiledShader(prop);
    expect(shader.fragmentShader).not.toContain("rcGlassSky");
    expect(shader.uniforms.rcGlassSky).toBeUndefined();
    prop.dispose();
  });
});

describe("instanced street detail", () => {
  it.each(["asphalt", "patch", "pavers", "paint", "concrete", "gravel", "lawn", "soil"] as const)(
    "maps %s in street coordinates and keeps relief out of the sides",
    (kind) => {
      const material = streetMaterial(kind, "#ffffff", 1, 0, true, { textureSize: 128, anisotropy: 1 });
      const shader = compiledShader(material);
      expect(material.vertexColors).toBe(true);
      expect(shader.fragmentShader).toContain("rcSurfaceRelief");
      expect(shader.fragmentShader).toContain("rcBumpScale * smoothstep(0.3, 0.7, rcUp)");
      expect(shader.uniforms.rcRelief.value).toBeDefined();
      expect(material.defines?.RC_WORLD_UV).toBe(kind === "pavers" ? undefined : "");
      if (kind === "paint") expect(shader.uniforms.rcBumpScale.value).toBe(0);
      material.dispose();
    },
  );
});
