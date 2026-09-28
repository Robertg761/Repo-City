import { describe, expect, it } from "vitest";
import { Color } from "three";
import { PAINT_ATTRIBUTE, mergeParts, triangleCount } from "./geometry";
import { figureParts } from "./figures";
import { walkerBodyGeometry, walkerHeadGeometry } from "./walkerModel";

describe("clothed crowd geometry", () => {
  it("keeps both cached meshes within the crowd's triangle and footprint budget", () => {
    const body = walkerBodyGeometry();
    const head = walkerHeadGeometry();
    expect(walkerBodyGeometry()).toBe(body);
    expect(walkerHeadGeometry()).toBe(head);
    expect(triangleCount(body) + triangleCount(head)).toBeLessThanOrEqual(240);
    body.computeBoundingBox();
    head.computeBoundingBox();
    expect(body.boundingBox!.min.y).toBeCloseTo(-0.44);
    expect(body.boundingBox!.max.y).toBeLessThanOrEqual(0.34 + 1e-6);
    expect(body.boundingBox!.max.x - body.boundingBox!.min.x).toBeLessThan(0.46);
    expect(head.boundingBox!.max.y).toBeLessThan(0.17);
    expect(head.boundingBox!.min.y).toBeGreaterThanOrEqual(-0.15 - 1e-6);
  });

  it("leaves shoes, trousers and hair fixed while clothing and skin take instance tints", () => {
    for (const geometry of [walkerBodyGeometry(), walkerHeadGeometry()]) {
      const paint = geometry.getAttribute(PAINT_ATTRIBUTE);
      const color = geometry.getAttribute("color");
      let tinted = 0;
      let fixed = 0;
      for (let i = 0; i < paint.count; i++) {
        if (paint.getX(i) > 0.5) {
          tinted++;
          expect(color.getX(i)).toBeCloseTo(1);
          expect(color.getY(i)).toBeCloseTo(1);
          expect(color.getZ(i)).toBeCloseTo(1);
        } else fixed++;
      }
      expect(tinted).toBeGreaterThan(0);
      expect(fixed).toBeGreaterThan(0);
    }
  });

  it("places a helmeted crew at their feet and keeps faces skin coloured", () => {
    const parts = figureParts({ position: [2, 3, 4], color: "#e6c02f", rotationY: Math.PI / 2, helmet: "#f0d44a", scale: 1.1 });
    const geometry = mergeParts(parts);
    geometry.computeBoundingBox();
    expect(geometry.boundingBox!.min.y).toBeCloseTo(3);
    expect(geometry.boundingBox!.max.y).toBeLessThan(4.3);
    expect(parts.some((part) => part.color === "#c99f7d")).toBe(true);
    const skin = new Color("#c99f7d");
    const colors = geometry.getAttribute("color");
    expect(Array.from({ length: colors.count }, (_, i) => Math.abs(colors.getX(i) - skin.r) < 1e-6).some(Boolean)).toBe(true);
  });
});
