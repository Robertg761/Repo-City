import { describe, expect, it } from "vitest";
import { ShaderChunk } from "three";
import { INSTANCE_TINT, PAINTED_TINT, paintedColorChunk, tintedMaterial } from "./material";
import { SURFACE } from "../../textures/surface-types";

describe("tintedMaterial", () => {
  it("finds the instance tint in three's colour chunk", () => {
    // If a three upgrade rewrites this line the patch would silently stop
    // applying and every windscreen would be painted: catch it here.
    expect(ShaderChunk.color_vertex).toContain(INSTANCE_TINT);
    const chunk = paintedColorChunk();
    expect(chunk).toContain(PAINTED_TINT);
    expect(chunk).not.toContain(INSTANCE_TINT);
  });

  it("patches the vertex shader and keys the program by variant", () => {
    const shader = {
      uniforms: {} as Record<string, { value: unknown }>,
      vertexShader: "#include <common>\n#include <begin_vertex>\n#include <color_vertex>",
      fragmentShader: "",
    };
    const time = { value: 0 };
    const swaying = tintedMaterial({}, { time, amount: 0.02, base: 1 });
    swaying.onBeforeCompile(shader as never, undefined as never);
    expect(shader.vertexShader).toContain("attribute float paint;");
    expect(shader.vertexShader).toContain(PAINTED_TINT);
    expect(shader.vertexShader).toContain("uSwayTime");
    expect(shader.uniforms.uSwayTime).toBe(time);
    expect(swaying.customProgramCacheKey()).toBe("tinted-sway");

    const still = tintedMaterial();
    expect(still.vertexColors).toBe(true);
    expect(still.customProgramCacheKey()).toBe("tinted");
  });

  it("selects authored prop finishes without applying facade patterns to vehicles", () => {
    const material = tintedMaterial({}, undefined, { surfaceAttribute: true });
    const shader = {
      uniforms: {} as Record<string, { value: unknown }>,
      vertexShader: "#include <common>\n#include <begin_vertex>\n#include <color_vertex>",
      fragmentShader: "#include <common>\n#include <map_fragment>\n#include <roughnessmap_fragment>\n#include <metalnessmap_fragment>\n#include <normal_fragment_maps>",
    };
    material.onBeforeCompile(shader as never, undefined as never);
    expect(material.defines?.RC_SURFACE_ATTRIBUTE).toBe("");
    expect(shader.uniforms.rcDefaultSurface.value).toBe(SURFACE.metal);
    expect(shader.uniforms.rcSurfacePatterns.value).toBeDefined();
    expect(shader.vertexShader).toContain("rcDetailSurface = surface;");
    expect(shader.vertexShader).toContain(PAINTED_TINT);
    expect(shader.fragmentShader).toContain("rcPropFresnel");
    expect(material.customProgramCacheKey()).not.toBe(tintedMaterial().customProgramCacheKey());
  });
});
