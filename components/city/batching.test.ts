import { describe, expect, it } from "vitest";
import { BoxGeometry, MeshBasicMaterial, MeshStandardMaterial, ShaderLib } from "three";
import {
  BatchRegistry,
  GLOW_ATTRIBUTE,
  OPACITY_ATTRIBUTE,
  batchKind,
  capacityFor,
  createHandle,
  patchExtras,
  withExtras,
  type BatchKind,
} from "./batching";

const kind = (key: string): BatchKind => ({
  key,
  geometry: () => new BoxGeometry(),
  material: () => new MeshBasicMaterial(),
});

describe("capacityFor", () => {
  it("rounds up to a power of two, at least four", () => {
    expect(capacityFor(0)).toBe(4);
    expect(capacityFor(4)).toBe(4);
    expect(capacityFor(5)).toBe(8);
    expect(capacityFor(33)).toBe(64);
  });
});

describe("BatchRegistry", () => {
  it("pools parts by kind key", () => {
    const registry = new BatchRegistry();
    const ring = kind("ring");
    const a = createHandle("a");
    const b = createHandle("b");
    registry.add(ring, a);
    registry.add(kind("ring"), b);
    registry.add(kind("patch"), createHandle("c"));
    expect([...registry.pools.keys()]).toEqual(["ring", "patch"]);
    expect(registry.pools.get("ring")?.parts).toEqual([a, b]);
  });

  it("tells React only when a mesh has to be rebuilt", () => {
    const registry = new BatchRegistry();
    let calls = 0;
    registry.subscribe(() => calls++);
    const ring = kind("ring");
    const handles = Array.from({ length: 5 }, (_, i) => createHandle(String(i)));
    handles.slice(0, 4).forEach((h) => registry.add(ring, h));
    // A new pool, sized 4: one rebuild for the first four.
    expect(calls).toBe(1);
    registry.add(ring, handles[4]);
    expect(calls).toBe(2);
    expect(registry.pools.get("ring")?.capacity).toBe(8);
    // Removing never shrinks, and never rebuilds.
    registry.remove(ring, handles[0]);
    expect(calls).toBe(2);
    expect(registry.pools.get("ring")?.parts).toHaveLength(4);
    expect(registry.snapshot()).toBe(2);
  });

  it("ignores removing what it never held", () => {
    const registry = new BatchRegistry();
    registry.remove(kind("ring"), createHandle());
    registry.add(kind("ring"), createHandle());
    registry.remove(kind("ring"), createHandle());
    expect(registry.pools.get("ring")?.parts).toHaveLength(1);
  });
});

describe("batchKind", () => {
  it("returns one kind per key, so parts can compare kinds by identity", () => {
    let made = 0;
    const make = () => {
      made++;
      return { geometry: () => new BoxGeometry(), material: () => new MeshBasicMaterial() };
    };
    const first = batchKind("test:kind", make);
    expect(batchKind("test:kind", make)).toBe(first);
    expect(first.key).toBe("test:kind");
    expect(made).toBe(1);
  });
});

describe("patchExtras", () => {
  const standard = () => ({
    vertexShader: ShaderLib.standard.vertexShader,
    fragmentShader: ShaderLib.standard.fragmentShader,
  });

  it("reads the per-instance opacity into the diffuse alpha", () => {
    const shader = standard();
    patchExtras(shader, { opacity: true });
    expect(shader.vertexShader).toContain(`attribute float ${OPACITY_ATTRIBUTE};`);
    expect(shader.vertexShader).toContain(`vInstanceOpacity = ${OPACITY_ATTRIBUTE};`);
    expect(shader.fragmentShader).toContain("diffuseColor.a *= vInstanceOpacity;");
    expect(shader.fragmentShader).not.toContain("vInstanceGlow");
  });

  it("scales the emissive term by the glow and the instance colour", () => {
    const shader = standard();
    patchExtras(shader, { glow: true });
    expect(shader.vertexShader).toContain(`attribute float ${GLOW_ATTRIBUTE};`);
    expect(shader.fragmentShader).toContain("totalEmissiveRadiance *= vInstanceGlow * vColor.rgb;");
    // After the emissive map, before the lighting sums it in.
    const fragment = shader.fragmentShader;
    expect(fragment.indexOf("vInstanceGlow * vColor")).toBeGreaterThan(fragment.indexOf("#include <emissivemap_fragment>"));
    expect(fragment.indexOf("vInstanceGlow * vColor")).toBeLessThan(fragment.indexOf("totalDiffuse + totalSpecular"));
  });

  it("finds every chunk it hooks in the shaders it patches", () => {
    for (const lib of [ShaderLib.standard, ShaderLib.basic]) {
      expect(lib.vertexShader).toContain("#include <common>");
      expect(lib.vertexShader).toContain("#include <begin_vertex>");
      expect(lib.fragmentShader).toContain("#include <color_fragment>");
    }
    expect(ShaderLib.standard.fragmentShader).toContain("#include <emissivemap_fragment>");
  });

  it("gives each combination its own program", () => {
    const opacity = withExtras(new MeshStandardMaterial(), { opacity: true });
    const glow = withExtras(new MeshStandardMaterial(), { glow: true });
    expect(opacity.customProgramCacheKey()).not.toBe(glow.customProgramCacheKey());
  });
});
