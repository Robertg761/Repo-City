/**
 * The Blender street props and people (`blender/props/*.py`, drawn under
 * the Blender models) held to the procedural models' own budgets and
 * contracts: triangle counts, feet on the ground, pivots and anchors where
 * the renderers put them, and the paint mask on the parts an instance colour
 * is meant to reach.
 */
import { describe, expect, it } from "vitest";
import { PAINT_ATTRIBUTE, mergeParts, triangleCount } from "./geometry";
import { TREE_CAP, TREE_SPECIES, blenderTreeGeometry } from "./trees";
import {
  LAMP_HEAD_Y,
  LAMP_HEIGHT,
  blenderFurnitureGeometry,
  blenderLampGeometry,
  furnitureGeometry,
  type FurnitureKind,
} from "./streetFurniture";
import { blenderWalkerBodyParts, blenderWalkerHeadParts, walkerBodyGeometry, walkerHeadGeometry } from "./walkerModel";
import { figureParts } from "./figures";
import { SURFACE_ATTRIBUTE } from "../../textures/surface-types";

const bounds = (geometry: ReturnType<typeof mergeParts>) => {
  geometry.computeBoundingBox();
  return geometry.boundingBox!;
};

describe("Blender trees", () => {
  it("stay within trees.test.ts's budget", () => {
    let forest = 0;
    for (const kind of TREE_SPECIES) {
      const tris = triangleCount(blenderTreeGeometry(kind));
      expect(tris).toBeLessThan(170);
      forest = Math.max(forest, tris);
    }
    expect(forest * TREE_CAP).toBeLessThan(17000);
  });

  it("keep each species' silhouette", () => {
    const [broadleaf, conifer, poplar, birch] = TREE_SPECIES.map((kind) => {
      const box = bounds(blenderTreeGeometry(kind));
      return { height: box.max.y, width: box.max.x - box.min.x, foot: box.min.y };
    });
    expect(poplar.height).toBeGreaterThan(Math.max(broadleaf.height, conifer.height, birch.height));
    expect(poplar.width).toBeLessThan(Math.min(broadleaf.width, conifer.width, birch.width));
    expect(broadleaf.width).toBeGreaterThan(Math.max(poplar.width, birch.width));
    for (const tree of [broadleaf, conifer, poplar, birch]) {
      expect(tree.height).toBeLessThan(6.5);
      // Stands on its foot (the root flares dip a little into the ground):
      // an instance matrix is position, heading and size.
      expect(tree.foot).toBeGreaterThan(-0.03);
      expect(tree.foot).toBeLessThan(0.01);
    }
  });

  it("paint the crown and not the trunk, and nothing low enough to sway off it", () => {
    for (const kind of TREE_SPECIES) {
      const geometry = blenderTreeGeometry(kind);
      const paint = geometry.getAttribute(PAINT_ATTRIBUTE);
      const position = geometry.getAttribute("position");
      const color = geometry.getAttribute("color");
      let crown = 0;
      for (let i = 0; i < paint.count; i++) {
        if (paint.getX(i) < 0.5) continue;
        crown++;
        expect(position.getY(i)).toBeGreaterThan(0.5);
        // The crown is white shaded grey by its bake: the leaf tint is the colour.
        expect(color.getX(i)).toBeCloseTo(color.getY(i), 5);
        expect(color.getX(i)).toBeCloseTo(color.getZ(i), 5);
        expect(color.getX(i)).toBeGreaterThan(0.3);
      }
      expect(crown).toBeGreaterThan(0);
      expect(crown).toBeLessThan(paint.count);
    }
  });

  it("builds once per species and tone", () => {
    expect(blenderTreeGeometry("conifer", 0.2)).toBe(blenderTreeGeometry("conifer", 0.201));
    expect(blenderTreeGeometry("conifer", 0.2)).not.toBe(blenderTreeGeometry("conifer", 0.6));
  });
});

describe("Blender street furniture", () => {
  const KINDS: FurnitureKind[] = ["bench", "bin", "stop", "bush", "bed"];

  it("stays within streetFurniture.test.ts's budget and carries colours and surfaces", () => {
    for (const kind of KINDS) {
      const geometry = blenderFurnitureGeometry(kind, 0.2);
      expect(blenderFurnitureGeometry(kind, 0.2)).toBe(geometry);
      expect(triangleCount(geometry)).toBeLessThan(220);
      expect(geometry.getAttribute("color")).toBeDefined();
      expect(geometry.getAttribute(SURFACE_ATTRIBUTE)).toBeDefined();
    }
  });

  it("keeps each kind's footprint, standing on the ground", () => {
    for (const kind of KINDS) {
      const ours = bounds(blenderFurnitureGeometry(kind, 0));
      const theirs = bounds(furnitureGeometry(kind, 0));
      expect(ours.min.y).toBeGreaterThanOrEqual(-0.03);
      expect(ours.min.y).toBeLessThan(0.02);
      for (const axis of ["x", "z"] as const) {
        const span = (b: typeof ours) => b.max[axis] - b.min[axis];
        expect(Math.abs(span(ours) - span(theirs))).toBeLessThan(0.3);
      }
      expect(Math.abs(ours.max.y - theirs.max.y)).toBeLessThan(0.25);
    }
  });

  it("paints nothing: street furniture takes no instance colour", () => {
    for (const kind of KINDS) {
      const paint = blenderFurnitureGeometry(kind, 0).getAttribute(PAINT_ATTRIBUTE);
      for (let i = 0; i < paint.count; i++) expect(paint.getX(i)).toBe(0);
    }
  });

  it("stands the lamp's pole and lantern on the procedural lamp's instance origins", () => {
    const { pole, head } = blenderLampGeometry();
    expect(triangleCount(pole)).toBeLessThanOrEqual(56);
    expect(triangleCount(head)).toBeLessThanOrEqual(16);
    const p = bounds(pole);
    // The pole's instance stands at half its height, as the cylinder's does.
    expect(p.min.y).toBeCloseTo(-LAMP_HEIGHT / 2, 3);
    expect(p.max.y + LAMP_HEIGHT / 2).toBeLessThan(LAMP_HEAD_Y + 0.25);
    // The lantern is centred on the halo's anchor.
    const h = bounds(head);
    expect((h.min.y + h.max.y) / 2).toBeCloseTo(0, 1);
    expect(Math.abs(h.min.x + h.max.x)).toBeLessThan(1e-3);
    expect(Math.abs(h.min.z + h.max.z)).toBeLessThan(1e-3);
    // Pole colour comes from the material: the vertex colour is shade only.
    const color = pole.getAttribute("color");
    for (let i = 0; i < color.count; i++) {
      expect(color.getX(i)).toBeCloseTo(color.getY(i), 5);
      expect(color.getX(i)).toBeLessThanOrEqual(1);
    }
  });
});

describe("Blender walker", () => {
  const body = mergeParts(blenderWalkerBodyParts());
  const head = mergeParts(blenderWalkerHeadParts());

  it("keeps walkerModel.test.ts's triangle and footprint budget", () => {
    expect(triangleCount(body) + triangleCount(head)).toBeLessThanOrEqual(240);
    // No more than the procedural figure: eighty of them walk at once.
    expect(triangleCount(body) + triangleCount(head)).toBeLessThanOrEqual(
      triangleCount(walkerBodyGeometry()) + triangleCount(walkerHeadGeometry()),
    );
    const b = bounds(body);
    const h = bounds(head);
    expect(b.min.y).toBeCloseTo(-0.44);
    expect(b.max.y).toBeLessThanOrEqual(0.34 + 1e-6);
    expect(b.max.x - b.min.x).toBeLessThan(0.46);
    expect(h.max.y).toBeLessThan(0.17);
    expect(h.min.y).toBeGreaterThanOrEqual(-0.15 - 1e-6);
  });

  it("paints clothes and skin, and leaves shoes, trousers, hands and hair fixed", () => {
    for (const geometry of [body, head]) {
      const paint = geometry.getAttribute(PAINT_ATTRIBUTE);
      const color = geometry.getAttribute("color");
      let tinted = 0;
      let fixed = 0;
      for (let i = 0; i < paint.count; i++) {
        if (paint.getX(i) > 0.5) {
          tinted++;
          // White, shaded by the bake: grey, never a colour of its own.
          expect(color.getX(i)).toBeCloseTo(color.getY(i), 5);
          expect(color.getX(i)).toBeCloseTo(color.getZ(i), 5);
          expect(color.getX(i)).toBeGreaterThan(0.5);
        } else fixed++;
      }
      expect(tinted).toBeGreaterThan(0);
      expect(fixed).toBeGreaterThan(0);
    }
  });

  it("colours a figure's clothes and hands, and takes the hair off under a helmet", () => {
    const hatless = blenderWalkerHeadParts("#c99f7d");
    const helmeted = blenderWalkerHeadParts("#c99f7d", { hair: false });
    expect(helmeted.length).toBe(hatless.length - 1);
    const dressed = blenderWalkerBodyParts("#e6c02f", "#a8795a");
    expect(dressed.some((part) => part.color === "#e6c02f" && part.paint)).toBe(true);
    expect(dressed.some((part) => part.color === "#a8795a" && !part.paint)).toBe(true);
  });

  it("still places a procedural crew at their feet (figures accept parts without a position)", () => {
    const geometry = mergeParts(figureParts({ position: [2, 3, 4], color: "#e6c02f", helmet: "#f0d44a" }));
    expect(bounds(geometry).min.y).toBeCloseTo(3);
  });
});
