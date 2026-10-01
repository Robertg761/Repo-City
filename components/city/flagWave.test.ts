import { describe, expect, it } from "vitest";
import { BufferGeometry, Float32BufferAttribute, MeshStandardMaterial } from "three";
import {
  FLAP_DATA,
  FLAP_FLY,
  FLAP_NORMAL,
  FLAG_WAVE,
  flagEnvelope,
  flagPhase,
  flagWave,
  flagWaveGlsl,
  flapAttributes,
  waveFlag,
} from "./flagWave";
import { WIND_CLOCK } from "./models/props/material";

/** A flat cloth of `nx` by `ny` cells flying along +x from a hoist at the origin. */
function cloth(nx = 8, ny = 2, length = 1.5, height = 0.8): BufferGeometry {
  const positions: number[] = [];
  for (let i = 0; i <= nx; i++) {
    for (let j = 0; j <= ny; j++) positions.push((i / nx) * length, (j / ny - 0.5) * height, 0);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  return geometry;
}

describe("flag wave", () => {
  it("has no envelope at the hoist and grows to the fly edge", () => {
    expect(flagEnvelope(0)).toBe(0);
    let last = 0;
    for (let s = 0.05; s <= 1.0001; s += 0.05) {
      const e = flagEnvelope(s);
      expect(e).toBeGreaterThan(last);
      last = e;
    }
    expect(flagEnvelope(1)).toBe(1);
  });

  it("never moves the hoist, whatever the time or the flag", () => {
    for (const phase of [0, 1.3, 4.1, 6]) {
      for (let t = 0; t < 40; t += 0.37) {
        const at = flagWave(0, t, phase);
        expect(Math.abs(at.offset)).toBe(0);
      }
    }
  });

  it("waves more the further it is from the pole", () => {
    // Peak sideways swing over a minute, per station along the cloth.
    const peak = (s: number) => {
      let best = 0;
      for (let t = 0; t < 60; t += 0.05) best = Math.max(best, Math.abs(flagWave(s, t, 0.7).offset));
      return best;
    };
    expect(peak(0.1)).toBeLessThan(peak(0.4));
    expect(peak(0.4)).toBeLessThan(peak(0.8));
    expect(peak(1)).toBeGreaterThan(0.05);
    // And stays in proportion: well under half the cloth's own length at the free edge.
    expect(peak(1)).toBeLessThan(0.25);
  });

  it("travels from the hoist to the fly edge, with a flutter and a gust", () => {
    // The wave's crest moves outwards: the same phase of the wave is found further along later.
    const crest = (t: number) => {
      let best = 0;
      let at = 0;
      for (let s = 0.2; s <= 0.8; s += 0.005) {
        const v = flagWave(s, t, 0).offset / flagEnvelope(s);
        if (v > best) {
          best = v;
          at = s;
        }
      }
      return at;
    };
    // Over a short step the dominant crest advances towards the fly edge.
    let moved = 0;
    for (let t = 0; t < 1; t += 0.1) {
      const d = crest(t + 0.05) - crest(t);
      if (Math.abs(d) < 0.3) moved += d;
    }
    expect(moved).toBeGreaterThan(0);
    expect(FLAG_WAVE.flutterSpeed).toBeGreaterThan(FLAG_WAVE.speed);
    expect(FLAG_WAVE.flutterAmplitude).toBeLessThan(FLAG_WAVE.amplitude);
  });

  it("keeps its slope consistent with its offset", () => {
    const h = 1e-5;
    for (const s of [0.1, 0.45, 0.9]) {
      const numeric = (flagWave(s + h, 3.3, 1.1).offset - flagWave(s - h, 3.3, 1.1).offset) / (2 * h);
      expect(flagWave(s, 3.3, 1.1).slope).toBeCloseTo(numeric, 4);
    }
  });

  it("phases flags apart by where they stand", () => {
    expect(flagPhase([-3.45, 4.3, 4.75])).not.toBeCloseTo(flagPhase([3.45, 4.3, 4.75]), 3);
    expect(flagPhase([1, 2, 3])).toBe(flagPhase([1, 2, 3]));
  });
});

describe("flap attributes", () => {
  it("measures every vertex from the hoist along the cloth, and snaps the hoist to zero", () => {
    const geometry = cloth();
    // A little quantisation noise on the hoist, as the model's 16-bit positions leave.
    const position = geometry.getAttribute("position");
    for (let i = 0; i < position.count; i++) if (position.getX(i) === 0) position.setX(i, 1e-5);
    flapAttributes(geometry, [0, 0, 0], [1.5, 0, 0]);
    const data = geometry.getAttribute(FLAP_DATA);
    for (let i = 0; i < position.count; i++) {
      const s = data.getX(i);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(1);
      if (position.getX(i) < 1e-3) expect(s).toBe(0);
      else expect(s).toBeCloseTo(position.getX(i) / 1.5, 6);
    }
    // The cloth's normal is fly x up, scaled by its length; the fly direction is unit.
    expect(geometry.getAttribute(FLAP_NORMAL).getZ(0)).toBeCloseTo(1.5, 6);
    expect(geometry.getAttribute(FLAP_FLY).getX(0)).toBeCloseTo(1, 6);
  });

  it("handles a flag that flies towards -x", () => {
    const geometry = cloth();
    const position = geometry.getAttribute("position");
    for (let i = 0; i < position.count; i++) position.setX(i, -position.getX(i));
    flapAttributes(geometry, [0, 0, 0], [-1.5, 0, 0]);
    expect(geometry.getAttribute(FLAP_FLY).getX(0)).toBeCloseTo(-1, 6);
    // fly x up = (-1,0,0) x (0,1,0) = (0,0,-1)
    expect(geometry.getAttribute(FLAP_NORMAL).getZ(0)).toBeCloseTo(-1.5, 6);
    for (let i = 0; i < position.count; i++) expect(geometry.getAttribute(FLAP_DATA).getX(i)).toBeCloseTo(-position.getX(i) / 1.5, 6);
  });

  it("holds the hoist vertices still through the displacement the shader applies", () => {
    const geometry = cloth(10, 3);
    flapAttributes(geometry, [0, 0, 0], [1.5, 0, 0], 2.2);
    const data = geometry.getAttribute(FLAP_DATA);
    const normal = geometry.getAttribute(FLAP_NORMAL);
    const position = geometry.getAttribute("position");
    let hoisted = 0;
    for (let t = 0; t < 30; t += 0.7) {
      for (let i = 0; i < data.count; i++) {
        const { offset } = flagWave(data.getX(i), t, data.getY(i));
        const moved = [normal.getX(i) * offset, normal.getY(i) * offset, normal.getZ(i) * offset];
        if (position.getX(i) === 0) {
          hoisted++;
          expect(moved.map(Math.abs)).toEqual([0, 0, 0]);
        } else {
          expect(Math.hypot(...moved)).toBeLessThan(0.4);
        }
      }
    }
    expect(hoisted).toBeGreaterThan(0);
  });
});

describe("the shader", () => {
  /** The shader's wave, evaluated in JS from its own GLSL. */
  function glslWave(s: number, t: number, phase: number): { offset: number; slope: number } {
    const lines = flagWaveGlsl()
      .split("\n")
      .filter((l) => l.startsWith("float "))
      .map((l) => l.replace(/^float /, "const ").replace(/\bsin\(/g, "Math.sin(").replace(/\bcos\(/g, "Math.cos("));
    const body = lines.join("\n").replaceAll("flapData.x", "s").replaceAll("flapData.y", "phase");
    return new Function("s", "phase", "uFlagTime", "uFlagAmount", `${body}\nreturn { offset: rcFlagOffset, slope: rcFlagSlope };`)(s, phase, t, 1);
  }

  it("is the same formula as flagWave", () => {
    for (const s of [0, 0.2, 0.5, 0.93, 1]) {
      for (const t of [0, 1.7, 22.4]) {
        const js = flagWave(s, t, 1.9);
        const gl = glslWave(s, t, 1.9);
        expect(gl.offset).toBeCloseTo(js.offset, 3);
        expect(gl.slope).toBeCloseTo(js.slope, 2);
      }
    }
  });

  it("patches any material's vertex shader and keeps its own patch and key", () => {
    const material = new MeshStandardMaterial();
    let own = 0;
    material.onBeforeCompile = (shader) => {
      own++;
      shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\n// own");
    };
    material.customProgramCacheKey = () => "base";
    waveFlag(material, false);
    const shader = {
      uniforms: {} as Record<string, { value: number }>,
      vertexShader: "#include <common>\n#include <beginnormal_vertex>\n#include <begin_vertex>\n",
      fragmentShader: "",
    };
    material.onBeforeCompile(shader as never, undefined as never);
    expect(own).toBe(1);
    expect(shader.vertexShader).toContain("// own");
    expect(shader.vertexShader).toContain(`attribute vec2 ${FLAP_DATA};`);
    expect(shader.vertexShader).toContain("transformed += flapNormal * rcFlagOffset;");
    expect(shader.vertexShader.indexOf("rcFlagOffset")).toBeLessThan(shader.vertexShader.indexOf("transformed +="));
    // The city's wind clock: the one the trees sway on.
    expect(shader.uniforms.uFlagTime).toBe(WIND_CLOCK);
    expect(shader.uniforms.uFlagAmount.value).toBe(1);
    expect(material.customProgramCacheKey()).toBe("base-flag-wave");
  });

  it("stands still under reduced motion", () => {
    const material = waveFlag(new MeshStandardMaterial(), true);
    const shader = { uniforms: {} as Record<string, { value: number }>, vertexShader: "#include <common>\n#include <beginnormal_vertex>\n#include <begin_vertex>", fragmentShader: "" };
    material.onBeforeCompile(shader as never, undefined as never);
    expect(shader.uniforms.uFlagAmount.value).toBe(0);
  });
});
