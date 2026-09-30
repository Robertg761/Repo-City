import { describe, expect, it } from "vitest";
import { GRASS_HEIGHT_FADE, GRASS_SETTINGS, flowerGeometry, tuftGeometry } from "./grass";
import { QUALITY_SETTINGS } from "../quality";
import { readLook } from "../look";

describe("the grass", () => {
  it("a tuft is a few crossed blades, darker at the foot, all facing up for the light", () => {
    const g = tuftGeometry();
    const pos = g.getAttribute("position");
    expect(pos.count / 3).toBeLessThanOrEqual(12);
    g.computeBoundingBox();
    expect(g.boundingBox!.max.y).toBeGreaterThan(0.25);
    expect(g.boundingBox!.max.y).toBeLessThan(0.4);
    const col = g.getAttribute("color");
    for (let i = 0; i < pos.count; i++) {
      // Base darker than tip.
      if (pos.getY(i) === 0) expect(col.getX(i)).toBeLessThan(0.5);
      if (pos.getY(i) > 0.3) expect(col.getX(i)).toBeGreaterThan(1);
      expect(g.getAttribute("normal").getY(i)).toBe(1);
      expect(g.getAttribute("aHead").getX(i)).toBe(0);
    }
  });

  it("a flower has a stem and a head, and only the head takes the flower's colour", () => {
    const g = flowerGeometry();
    const heads = g.getAttribute("aHead");
    let head = 0;
    for (let i = 0; i < heads.count; i++) head += heads.getX(i);
    expect(head).toBeGreaterThan(0);
    expect(head).toBeLessThan(heads.count);
    g.computeBoundingBox();
    expect(g.boundingBox!.max.y).toBeLessThan(0.35);
  });

  it("is a few thousand instances, fewer on the medium tier, and none on the low", () => {
    const n = (s: { grid: number }) => s.grid * s.grid;
    expect(n(GRASS_SETTINGS.high.tufts)).toBeLessThan(12_000);
    expect(n(GRASS_SETTINGS.medium.tufts)).toBeLessThan(n(GRASS_SETTINGS.high.tufts));
    expect(n(GRASS_SETTINGS.high.flowers)).toBeLessThan(n(GRASS_SETTINGS.high.tufts) / 2);
    // Only drawn close to the ground.
    expect(GRASS_HEIGHT_FADE[0]).toBeLessThan(GRASS_HEIGHT_FADE[1]);
    expect(GRASS_HEIGHT_FADE[1]).toBeLessThan(60);
    // The low tier's settings carry no grass entry at all.
    expect((GRASS_SETTINGS as Record<string, unknown>).low).toBeUndefined();
    expect(QUALITY_SETTINGS.low.groundDetail).toBe(false);
  });
});

describe("the switch", () => {
  it("?land=rich turns the rich landscape on, and anything else leaves the current look", () => {
    expect(readLook("?land=rich").land).toBe("rich");
    expect(readLook("").land).toBe("classic");
    expect(readLook("?land=classic").land).toBe("classic");
    expect(readLook("?land=rich&grade=classic").grade).toBe("classic");
  });
});
