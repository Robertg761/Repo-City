import { describe, expect, it } from "vitest";
import { ShaderChunk } from "three";
import { INSTANCE_TINT, PAINTED_TINT, paintedColorChunk, tintedMaterial } from "./material";

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
});
