/**
 * The near levels of the street scenery (`near.ts`, authored in
 * `blender/props/*_near.py` and `blender/street2/street2_near.py`): each holds
 * its own triangle budget, stands in the lean model's frame and outline with
 * the same material roles, and carries exactly the attributes the lean
 * geometry does, because `LodInstances` draws both with one material.
 */
import { describe, expect, it } from "vitest";
import { BoxGeometry, type BufferGeometry } from "three";
import { PAINT_ATTRIBUTE, triangleCount } from "./geometry";
import { TREE_SPECIES, blenderTreeGeometry } from "./trees";
import { blenderFurnitureGeometry, blenderLampGeometry, type FurnitureKind } from "./streetFurniture";
import {
  baleNearGeometry,
  blenderBaleNearGeometry,
  blenderFurnitureNearGeometry,
  blenderLampNearGeometry,
  blenderPropBlockNearGeometry,
  blenderPropTankNearGeometry,
  blenderTreeNearGeometry,
  furnitureNearGeometry,
  lampNearGeometry,
  nearSizeAt,
  propBlockNearGeometry,
  propTankNearGeometry,
  treeNearGeometry,
} from "./near";
import { SURFACE, SURFACE_ATTRIBUTE } from "../../textures/surface-types";
import { blenderPropBlockGeometry, blenderPropTankGeometry } from "../buildings/geometry";
import { blenderFarmGeometry } from "../buildings/farmland";

const KINDS: FurnitureKind[] = ["bench", "bin", "stop", "bush", "bed"];

const bounds = (geometry: BufferGeometry) => {
  geometry.computeBoundingBox();
  return geometry.boundingBox!;
};

/** The near model's box against the lean one's, edge by edge, within `tolerance` world units. */
function sameOutline(near: BufferGeometry, lean: BufferGeometry, tolerance: number) {
  const a = bounds(near);
  const b = bounds(lean);
  for (const axis of ["x", "y", "z"] as const) {
    expect(Math.abs(a.min[axis] - b.min[axis])).toBeLessThan(tolerance);
    expect(Math.abs(a.max[axis] - b.max[axis])).toBeLessThan(tolerance);
  }
}

/** The same attributes, item sizes and surface kinds: what one shared material needs. */
function sameContract(near: BufferGeometry, lean: BufferGeometry) {
  expect(Object.keys(near.attributes).sort()).toEqual(Object.keys(lean.attributes).sort());
  for (const [name, attribute] of Object.entries(lean.attributes)) {
    expect(near.getAttribute(name).itemSize).toBe(attribute.itemSize);
  }
  const kinds = (geometry: BufferGeometry) => {
    const surface = geometry.getAttribute(SURFACE_ATTRIBUTE);
    const out = new Set<number>();
    for (let i = 0; i < surface.count; i++) out.add(surface.getX(i));
    return out;
  };
  if (lean.hasAttribute(SURFACE_ATTRIBUTE)) {
    // A near model may use fewer roles than the lean one but only one more:
    // the bush's bare stems are timber, which every surface shader can draw.
    for (const kind of kinds(near)) expect(kinds(lean).has(kind) || kind === SURFACE.timber).toBe(true);
  }
}

describe("near trees", () => {
  it("hold the 5,000 triangle budget and add real detail over the lean tree", () => {
    for (const kind of TREE_SPECIES) {
      const near = triangleCount(blenderTreeNearGeometry(kind));
      expect(near).toBeLessThanOrEqual(5000);
      expect(near).toBeGreaterThan(triangleCount(blenderTreeGeometry(kind)) * 10);
    }
  });

  it("stand where the lean species stand, with the same contract and paint mask", () => {
    for (const kind of TREE_SPECIES) {
      const near = blenderTreeNearGeometry(kind, 0.2);
      const lean = blenderTreeGeometry(kind, 0.2);
      expect(blenderTreeNearGeometry(kind, 0.2)).toBe(near);
      sameOutline(near, lean, 0.9);
      // The root flares end on the ground, as the lean trunk does.
      expect(bounds(near).min.y).toBeGreaterThan(-0.03);
      expect(bounds(near).min.y).toBeLessThan(0.02);
      sameContract(near, lean);
    }
  });

  it("paint the crown and not the trunk, so the leaf tint and the wind reach the same parts", () => {
    for (const kind of TREE_SPECIES) {
      const geometry = blenderTreeNearGeometry(kind);
      const paint = geometry.getAttribute(PAINT_ATTRIBUTE);
      const position = geometry.getAttribute("position");
      let crown = 0;
      for (let i = 0; i < paint.count; i++) {
        if (paint.getX(i) < 0.5) continue;
        crown++;
        // Nothing painted below the sway base (`SWAY_BASE`, 1.2): the crown starts above the trunk.
        expect(position.getY(i)).toBeGreaterThan(0.5);
      }
      expect(crown).toBeGreaterThan(paint.count * 0.5);
      expect(crown).toBeLessThan(paint.count);
    }
  });
});

describe("near street furniture", () => {
  it("keeps each kind under 1,500 triangles, well above the lean model", () => {
    for (const kind of KINDS) {
      const near = triangleCount(blenderFurnitureNearGeometry(kind));
      expect(near).toBeLessThanOrEqual(1500);
      expect(near).toBeGreaterThan(triangleCount(blenderFurnitureGeometry(kind, 0)) * 3);
    }
  });

  it("keeps each kind's footprint and pivot, and the lean material roles", () => {
    for (const kind of KINDS) {
      const near = blenderFurnitureNearGeometry(kind, 0.2);
      expect(blenderFurnitureNearGeometry(kind, 0.2)).toBe(near);
      sameOutline(near, blenderFurnitureGeometry(kind, 0.2), 0.16);
      sameContract(near, blenderFurnitureGeometry(kind, 0.2));
      expect(bounds(near).min.y).toBeGreaterThanOrEqual(-0.03);
    }
  });

  it("paints nothing: furniture takes no instance colour", () => {
    for (const kind of KINDS) {
      const paint = blenderFurnitureNearGeometry(kind).getAttribute(PAINT_ATTRIBUTE);
      for (let i = 0; i < paint.count; i++) expect(paint.getX(i)).toBe(0);
    }
  });
});

describe("near street lamp", () => {
  const { pole, head } = blenderLampNearGeometry();
  const lean = blenderLampGeometry();

  it("holds the 1,500 triangle budget for pole and lantern together", () => {
    expect(triangleCount(pole) + triangleCount(head)).toBeLessThanOrEqual(1500);
    expect(triangleCount(pole)).toBeGreaterThan(triangleCount(lean.pole) * 5);
    expect(triangleCount(head)).toBeGreaterThan(triangleCount(lean.head));
  });

  it("stands on the ground like the lean pole, with the lantern where the lean one is", () => {
    sameOutline(pole, lean.pole, 0.12);
    sameOutline(head, lean.head, 0.06);
    expect(bounds(pole).min.y).toBeCloseTo(0, 2);
    // Both share one origin, so one instance matrix places both.
    const glass = bounds(head);
    expect(Math.abs(glass.min.x + glass.max.x)).toBeLessThan(1e-3);
    expect(Math.abs(glass.min.z + glass.max.z)).toBeLessThan(1e-3);
    sameContract(pole, lean.pole);
    sameContract(head, lean.head);
  });
});

describe("near rooftop plant and hay bales", () => {
  it("keep the unit box and the tank's footprint of the lean models, under budget", () => {
    const block = blenderPropBlockNearGeometry();
    const tank = blenderPropTankNearGeometry();
    expect(triangleCount(block)).toBeLessThanOrEqual(3000);
    expect(triangleCount(tank)).toBeLessThanOrEqual(3000);
    expect(triangleCount(block)).toBeGreaterThan(triangleCount(blenderPropBlockGeometry()) * 8);
    expect(triangleCount(tank)).toBeGreaterThan(triangleCount(blenderPropTankGeometry()) * 4);
    sameOutline(block, blenderPropBlockGeometry(), 0.06);
    sameOutline(tank, blenderPropTankGeometry(), 0.1);
    sameContract(block, blenderPropBlockGeometry());
    sameContract(tank, blenderPropTankGeometry());
  });

  it("keeps the bale's pivot and outline under 1,500 triangles", () => {
    const bale = blenderBaleNearGeometry();
    expect(triangleCount(bale)).toBeLessThanOrEqual(1500);
    expect(triangleCount(bale)).toBeGreaterThan(triangleCount(blenderFarmGeometry("bale")) * 8);
    sameOutline(bale, blenderFarmGeometry("bale"), 0.1);
    sameContract(bale, blenderFarmGeometry("bale"));
  });
});

describe("the accessors", () => {
  it("give no near level under the procedural models (the node tests' default)", () => {
    expect(treeNearGeometry("broadleaf")).toBeNull();
    expect(furnitureNearGeometry("bench")).toBeNull();
    expect(lampNearGeometry()).toBeNull();
    expect(propBlockNearGeometry()).toBeNull();
    expect(propTankNearGeometry()).toBeNull();
    expect(baleNearGeometry()).toBeNull();
  });

  it("turn a switch-over distance into a projected size", () => {
    const box = new BoxGeometry(2, 2, 2);
    expect(nearSizeAt(box, 10)).toBeCloseTo(Math.sqrt(3) / 10, 5);
  });
});
