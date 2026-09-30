import { Matrix4, MeshStandardMaterial, Quaternion, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { LOD_HIDDEN_ATTRIBUTE, sameMembers, NO_RAYCAST, patchLodHidden, selectNear, swapHidden } from "./lod";

function matrices(entries: { at: [number, number, number]; scale?: number | [number, number, number] }[]): Float32Array {
  const out = new Float32Array(entries.length * 16);
  entries.forEach(({ at, scale = 1 }, i) => {
    const s = typeof scale === "number" ? new Vector3(scale, scale, scale) : new Vector3(...scale);
    new Matrix4().compose(new Vector3(...at), new Quaternion(), s).toArray(out, i * 16);
  });
  return out;
}

describe("selectNear", () => {
  const camera = { x: 0, y: 10, z: 0 };

  it("picks the instances that cover the most of the screen, largest first, up to the cap", () => {
    const m = matrices([
      { at: [0, 0, 5] }, // distance ~11.2
      { at: [0, 0, 100] }, // far
      { at: [0, 9, 0] }, // distance 1: the largest
      { at: [0, 0, 2], scale: 2 }, // distance ~10.2, twice the size
    ]);
    expect(selectNear(m, 4, camera, 1, 0.05, 3)).toEqual([2, 3, 0]);
    expect(selectNear(m, 4, camera, 1, 0.05, 1)).toEqual([2]);
  });

  it("ignores instances below the size threshold", () => {
    const m = matrices([{ at: [0, 0, 100] }, { at: [0, 0, 5] }]);
    expect(selectNear(m, 2, camera, 1, 0.05, 8)).toEqual([1]);
  });

  it("never picks an instance scaled to nothing (unrevealed or parked away)", () => {
    const m = matrices([{ at: [0, 9, 0], scale: 0 }, { at: [0, 9, 0], scale: [0, 1, 0] }, { at: [0, 0, 5] }]);
    expect(selectNear(m, 3, camera, 1, 0.01, 8)).toEqual([2]);
  });

  it("returns nothing with no cap or no instances", () => {
    const m = matrices([{ at: [0, 9, 0] }]);
    expect(selectNear(m, 1, camera, 1, 0.01, 0)).toEqual([]);
    expect(selectNear(m, 0, camera, 1, 0.01, 4)).toEqual([]);
  });
});

describe("patchLodHidden", () => {
  it("collapses flagged instances after every other vertex patch and keys the program", () => {
    const material = new MeshStandardMaterial();
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\ntransformed.y += 1.0;");
    };
    patchLodHidden(material);
    patchLodHidden(material); // idempotent
    const shader = {
      vertexShader: "#include <common>\n#include <begin_vertex>\n#include <project_vertex>",
      fragmentShader: "",
      uniforms: {},
    };
    material.onBeforeCompile(shader as never, undefined as never);
    expect(shader.vertexShader.match(new RegExp(`attribute float ${LOD_HIDDEN_ATTRIBUTE}`, "g"))).toHaveLength(1);
    expect(shader.vertexShader.indexOf("transformed.y += 1.0")).toBeLessThan(shader.vertexShader.indexOf("> 0.5) transformed = vec3(0.0)"));
    expect(material.customProgramCacheKey()).toMatch(/-lod$/);
  });
});

describe("swapHidden", () => {
  it("un-hides the previous near set and hides the new one", () => {
    const flags = new Float32Array(5);
    const hidden = { setX: (i: number, v: number) => void (flags[i] = v) };
    swapHidden(hidden, [], [1, 3]);
    expect(Array.from(flags)).toEqual([0, 1, 0, 1, 0]);
    swapHidden(hidden, [1, 3], [3, 4]);
    expect(Array.from(flags)).toEqual([0, 0, 0, 1, 1]);
  });
});

describe("NO_RAYCAST", () => {
  it("hits nothing, so a layer with its own picking is found once, on its far mesh", () => {
    const hits: unknown[] = [];
    NO_RAYCAST(undefined as never, hits as never);
    expect(hits).toEqual([]);
  });
});

describe("sameMembers", () => {
  it("compares near sets by membership, so a reordering uploads nothing", () => {
    expect(sameMembers([3, 1, 2], [1, 2, 3])).toBe(true);
    expect(sameMembers([], [])).toBe(true);
    expect(sameMembers([1, 2], [1, 2, 3])).toBe(false);
    expect(sameMembers([1, 4], [1, 2])).toBe(false);
  });
});
