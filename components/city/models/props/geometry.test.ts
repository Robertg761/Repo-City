import { describe, expect, it } from "vitest";
import { BoxGeometry } from "three";
import { mergeParts, prismGeometry, triangleCount } from "./geometry";
import { SURFACE, SURFACE_ATTRIBUTE } from "../../textures/surface-types";

describe("prismGeometry", () => {
  it("extrudes a side profile across x, centred on the axis", () => {
    const geometry = prismGeometry(
      [
        [-1, 0],
        [1, 0],
        [1, 0.5],
        [0.4, 0.8],
        [-1, 0.8],
      ],
      0.6,
    );
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    expect(box.min.x).toBeCloseTo(-0.3);
    expect(box.max.x).toBeCloseTo(0.3);
    // The profile's first coordinate is forward, its second is up.
    expect(box.min.z).toBeCloseTo(-1);
    expect(box.max.z).toBeCloseTo(1);
    expect(box.min.y).toBeCloseTo(0);
    expect(box.max.y).toBeCloseTo(0.8);
  });

  it("costs two caps and a quad per edge, nothing more", () => {
    const n = 7;
    const profile = Array.from({ length: n }, (_, i): [number, number] => [
      Math.cos((i / n) * Math.PI * 2),
      Math.sin((i / n) * Math.PI * 2) + 1,
    ]);
    expect(triangleCount(prismGeometry(profile, 1))).toBe(2 * (n - 2) + 2 * n);
  });

  it("faces its caps outwards whichever way the profile is wound", () => {
    const square: [number, number][] = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ];
    for (const profile of [square, [...square].reverse()]) {
      const geometry = prismGeometry(profile, 2);
      const normals = geometry.getAttribute("normal");
      const positions = geometry.getAttribute("position");
      // Every vertex on the +x cap has a normal pointing +x, and vice versa.
      for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i);
        const nx = normals.getX(i);
        if (Math.abs(nx) > 0.9) expect(Math.sign(nx)).toBe(Math.sign(x));
      }
    }
  });

  it("refuses a profile that is not a polygon", () => {
    expect(() => prismGeometry([[0, 0], [1, 1]], 1)).toThrow();
  });

  it("merges alongside boxes into one coloured geometry", () => {
    const merged = mergeParts([
      { geometry: prismGeometry([[0, 0], [1, 0], [0, 1]], 1), color: "#ffffff" },
      { geometry: new BoxGeometry(1, 1, 1), color: "#000000", position: [0, 2, 0] },
    ]);
    expect(merged.getAttribute("color").count).toBe(merged.getAttribute("position").count);
    expect(triangleCount(merged)).toBe(2 + 6 + 12);
  });
});

describe("authored prop surfaces", () => {
  it("omits the optional attribute on untagged primitive assemblies", () => {
    const geometry = mergeParts([{ geometry: new BoxGeometry(1, 1, 1), color: "#ffffff" }]);
    expect(geometry.hasAttribute(SURFACE_ATTRIBUTE)).toBe(false);
  });

  it("preserves nested surface IDs and fills untagged neighbours with the default", () => {
    const nested = mergeParts([
      { geometry: new BoxGeometry(1, 1, 1), color: "#ffffff", surface: SURFACE.timber, paint: true },
      { geometry: new BoxGeometry(1, 1, 1), color: "#ffffff", surface: SURFACE.glass },
    ]);
    const combined = mergeParts([
      { geometry: nested, color: "#ffffff", surface: SURFACE.metal },
      { geometry: new BoxGeometry(1, 1, 1), color: "#ffffff" },
    ]);
    const surfaces = combined.getAttribute(SURFACE_ATTRIBUTE);
    expect(surfaces.count).toBe(combined.getAttribute("position").count);
    expect(new Set(Array.from(surfaces.array))).toEqual(new Set([SURFACE.timber, SURFACE.glass, SURFACE.plaster]));
    expect(Array.from(combined.getAttribute("paint").array).filter((value) => value === 1)).toHaveLength(36);
  });
});
