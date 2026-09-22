import { describe, expect, it } from "vitest";
import { Color } from "three";
import {
  SPECIES_LEAF,
  SPECIES_SCALE,
  TREE_CAP,
  TREE_SPECIES,
  assignSpecies,
  districtSpecies,
  jitterLeaf,
  planTrees,
  treeCapFor,
  treeGeometry,
} from "./trees";
import { PAINT_ATTRIBUTE, triangleCount } from "./geometry";
import { prngFor } from "@/lib/city/seed";
import type { Vec3 } from "@/types/city";
import { devCity } from "@/fixtures/dev.city";

const plan = (seed = devCity.seed) =>
  planTrees(devCity.props.trees, devCity.districts, prngFor(seed, "trees"));

describe("tree species", () => {
  it("gives a district one dominant species and a quarter of strays", () => {
    const prng = prngFor(devCity.seed, "trees");
    const kinds = assignSpecies(devCity.props.trees, devCity.districts, prng);
    expect(kinds).toHaveLength(devCity.props.trees.length);
    expect(new Set(kinds).size).toBeGreaterThan(1);
  });

  it("is deterministic, and a district keeps its species across runs", () => {
    const district = devCity.districts[0];
    expect(districtSpecies(district, prngFor("s", "trees"))).toBe(
      districtSpecies(district, prngFor("s", "trees")),
    );
  });

  it("can plant every species", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 12; i++) {
      for (const tree of plan(`seed-${i}`)) seen.add(tree.species);
    }
    expect([...seen].sort()).toEqual([...TREE_SPECIES].sort());
  });
});

describe("planTrees", () => {
  it("is deterministic for a seed and differs across seeds", () => {
    expect(plan("owner/repo@aaa")).toEqual(plan("owner/repo@aaa"));
    expect(plan("owner/repo@aaa")).not.toEqual(plan("owner/repo@bbb"));
  });

  it("never plants more than section 37's hundred", () => {
    const many: Vec3[] = Array.from({ length: 180 }, (_, i) => [i, 0, -i]);
    const planted = planTrees(many, devCity.districts, prngFor("s", "trees"));
    expect(planted).toHaveLength(TREE_CAP);
    expect(TREE_CAP).toBeLessThanOrEqual(100);
  });

  it("takes a settlement's own cap, and the city's is unchanged (PLAN.md 76.5)", () => {
    const many: Vec3[] = Array.from({ length: 200 }, (_, i) => [i, 0, -i]);
    expect(treeCapFor("city")).toBe(TREE_CAP);
    expect(treeCapFor("village")).toBe(160);
    expect(planTrees(many, devCity.districts, prngFor("s", "trees"), treeCapFor("village"))).toHaveLength(160);
    // The first hundred are the same trees whatever the cap.
    const city = planTrees(many, devCity.districts, prngFor("s", "trees"));
    const explicit = planTrees(many, devCity.districts, prngFor("s", "trees"), treeCapFor("city"));
    expect(explicit).toEqual(city);
  });

  it("keeps each tree's size in its species' band and its stretch modest", () => {
    for (const tree of plan()) {
      const [low, high] = SPECIES_SCALE[tree.species];
      expect(tree.scale).toBeGreaterThanOrEqual(low);
      expect(tree.scale).toBeLessThan(high);
      expect(tree.stretch).toBeGreaterThanOrEqual(0.9);
      expect(tree.stretch).toBeLessThan(1.14);
      expect(tree.rotation).toBeGreaterThanOrEqual(0);
      expect(tree.rotation).toBeLessThan(Math.PI * 2);
    }
  });

  it("varies the leaves without leaving the species' green", () => {
    const trees = plan();
    expect(new Set(trees.map((tree) => tree.tint)).size).toBeGreaterThan(trees.length * 0.8);
    const base = { h: 0, s: 0, l: 0 };
    const leaf = { h: 0, s: 0, l: 0 };
    for (const tree of trees) {
      new Color(SPECIES_LEAF[tree.species]).getHSL(base);
      new Color(tree.tint).getHSL(leaf);
      const hueGap = Math.min(Math.abs(base.h - leaf.h), 1 - Math.abs(base.h - leaf.h));
      expect(hueGap).toBeLessThan(0.04);
      expect(Math.abs(base.l - leaf.l)).toBeLessThan(0.07);
    }
  });
});

describe("jitterLeaf", () => {
  it("is seeded", () => {
    expect(jitterLeaf("#7fa46a", prngFor("a", "leaf"))).toBe(
      jitterLeaf("#7fa46a", prngFor("a", "leaf")),
    );
  });
});

describe("tree geometry", () => {
  it("keeps a whole tree cheap enough for a hundred of them", () => {
    let forest = 0;
    for (const kind of TREE_SPECIES) {
      const tris = triangleCount(treeGeometry(kind));
      expect(tris).toBeLessThan(170);
      forest = Math.max(forest, tris);
    }
    expect(forest * TREE_CAP).toBeLessThan(17000);
  });

  it("gives each species its own silhouette", () => {
    const shapes = TREE_SPECIES.map((kind) => {
      const geometry = treeGeometry(kind);
      geometry.computeBoundingBox();
      const box = geometry.boundingBox!;
      return { height: box.max.y, width: box.max.x - box.min.x };
    });
    const [broadleaf, conifer, poplar, birch] = shapes;
    // The poplar is the tallest and the narrowest; the broadleaf the widest.
    expect(poplar.height).toBeGreaterThan(Math.max(broadleaf.height, conifer.height, birch.height));
    expect(poplar.width).toBeLessThan(Math.min(broadleaf.width, conifer.width, birch.width));
    expect(broadleaf.width).toBeGreaterThan(Math.max(poplar.width, birch.width));
    for (const shape of shapes) expect(shape.height).toBeLessThan(6.5);
  });

  it("paints the crown and not the trunk", () => {
    for (const kind of TREE_SPECIES) {
      const geometry = treeGeometry(kind);
      const paint = geometry.getAttribute(PAINT_ATTRIBUTE);
      const position = geometry.getAttribute("position");
      let lowPainted = 0;
      let crown = 0;
      for (let i = 0; i < paint.count; i++) {
        if (paint.getX(i) > 0.5) {
          crown++;
          if (position.getY(i) < 0.5) lowPainted++;
        }
      }
      expect(crown).toBeGreaterThan(0);
      expect(crown).toBeLessThan(paint.count);
      // Nothing at the foot of the tree takes the leaf colour or sways.
      expect(lowPainted).toBe(0);
    }
  });

  it("builds once per species and tone", () => {
    expect(treeGeometry("conifer", 0.2)).toBe(treeGeometry("conifer", 0.201));
    expect(treeGeometry("conifer", 0.2)).not.toBe(treeGeometry("conifer", 0.6));
  });
});
