/**
 * The construction site's Blender models (spike: `blender/incidents/`
 * `construction_props.py` and `finished_dressing.py`), checked against the
 * contracts the procedural builders publish. The flag is off in tests, so the
 * whole-site checks mock it on and load the modules afresh.
 */
import { Box3, type BufferGeometry } from "three";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { ConstructionState } from "@/types/analysis";
import { desaturate } from "../../palette";
import { SURFACE_ATTRIBUTE } from "../../textures/surface-types";
import { importedParts } from "../imported";
import { MODEL as SITE_PROPS } from "./constructionProps.model";
import { mergeParts, triangleCount } from "./geometry";

const SITES: ConstructionState[] = ["active", "slow", "abandoned", "completed"];
const shade = (hex: string) => desaturate(hex, 0.2);
const bounds = (geometry: BufferGeometry) => new Box3().setFromBufferAttribute(geometry.getAttribute("position") as never);
const prop = (node: string) => mergeParts(importedParts(SITE_PROPS, node, shade));

describe("the Blender site equipment (spike)", () => {
  it("stands every prop on the ground, at the procedural one's size", () => {
    // [node, half width, half depth, height] of the procedural prop, in its own frame.
    const sizes: [string, number, number, number][] = [
      ["Mixer", 0.62, 0.75, 1.9],
      // The Blender arm is folded higher than the procedural one's boom.
      ["Excavator", 0.85, 1.2, 2.3],
      ["SiteHut", 1.4, 1.0, 1.75],
    ];
    for (const [node, hw, hd, h] of sizes) {
      const box = bounds(prop(node));
      expect(Math.abs(box.min.y), node).toBeLessThan(0.02);
      expect(Math.abs(box.max.y - h), node).toBeLessThan(0.3);
      expect(Math.max(-box.min.x, box.max.x), node).toBeLessThan(hw + 0.25);
      expect(-box.min.z, node).toBeLessThan(hd + 0.4);
    }
  });

  it("folds the excavator's arm forward to where the procedural bucket rests", () => {
    const box = bounds(prop("Excavator"));
    // The procedural bucket's front face is at z 3.05, on the ground.
    expect(box.max.z).toBeGreaterThan(2.9);
    expect(box.max.z).toBeLessThan(3.25);
  });

  it("keeps the stock where the procedural stacks, pipes and sand stand", () => {
    const box = bounds(prop("Materials"));
    // Pipes back to x -3.4, sand out to 3.75, the pile's back at z -1.75.
    expect(box.min.x).toBeGreaterThan(-3.5);
    expect(box.max.x).toBeLessThan(4.1);
    expect(box.min.z).toBeGreaterThan(-2.1);
    expect(box.max.z).toBeLessThan(0.8);
    expect(Math.abs(box.min.y)).toBeLessThan(0.02);
  });
});

describe("construction sites with the Blender models", () => {
  let decor: typeof import("./constructionDecor");
  let procedural: typeof import("./constructionDecor");
  let finished: typeof import("./finishedHouse");

  beforeAll(async () => {
    procedural = await import("./constructionDecor");
    vi.resetModules();
    vi.doMock("../modelSource", () => ({ BLENDER_MODELS: true }));
    decor = await import("./constructionDecor");
    finished = await import("./finishedHouse");
  });

  it("keeps the procedural ordering: active over slow, completed under active", () => {
    const tris = (state: ConstructionState) => triangleCount(decor.constructionDecor(state, 0.2));
    expect(tris("active")).toBeGreaterThan(tris("slow"));
    expect(tris("completed")).toBeLessThan(tris("active"));
    const totals = Object.fromEntries(
      SITES.map((s) => [s, [triangleCount(procedural.constructionDecor(s, 0.2)), tris(s)]]),
    );
    console.log("site triangles, procedural -> blender:", JSON.stringify(totals));
  });

  it("stays inside a budget for eight sites, with the excavator as the hero", () => {
    const worst = Math.max(...SITES.map((s) => triangleCount(decor.constructionDecor(s, 0.2))));
    expect(worst).toBeLessThan(6200);
    expect(worst * 8).toBeLessThan(50000);
  });

  it("builds every state with colours and surfaces, cached per state and tone", () => {
    for (const state of SITES) {
      const geometry = decor.constructionDecor(state, 0.2);
      expect(decor.constructionDecor(state, 0.2)).toBe(geometry);
      expect(geometry.hasAttribute("color")).toBe(true);
      expect(geometry.hasAttribute(SURFACE_ATTRIBUTE)).toBe(true);
      // Nothing new below the ground: the abandoned site's fallen hoarding
      // already dips into it.
      const floor = bounds(procedural.constructionDecor(state, 0.2)).min.y;
      expect(bounds(geometry).min.y).toBeGreaterThan(Math.min(floor, 0) - 0.02);
    }
  });

  it("rusts the stock nobody came back for", () => {
    // Timber and pipes go the procedural abandoned site's rust: redder than
    // they are blue, where fresh steel pipes are bluer.
    const materials = (state: ConstructionState) => {
      const geometry = decor.constructionDecor(state, 0);
      const color = geometry.getAttribute("color");
      const position = geometry.getAttribute("position");
      let r = 0;
      let b = 0;
      // The pipe stack, behind the timber in the site's frame: a pipe's
      // vertices are at its ends, one each side of the hoarding's line.
      for (let i = 0; i < color.count; i++) {
        const x = position.getX(i);
        const z = position.getZ(i);
        const ends = x < -5.62 || (x > -5.4 && x < -3.5);
        if (ends && x > -6.3 && z > 1.6 && z < 2.3 && position.getY(i) > 0.1) {
          r += color.getX(i);
          b += color.getZ(i);
        }
      }
      return r / b;
    };
    expect(materials("abandoned")).toBeGreaterThan(materials("slow"));
  });

  it("keeps the finished house's dressing on its plot", () => {
    for (const tier of ["village", "town"] as const) {
      const half = finished.FINISHED[tier].plot / 2;
      const dressing = finished.finishedDressingGeometry(tier, 0);
      expect(dressing).toBe(finished.finishedDressingGeometry(tier, 0));
      const box = bounds(dressing);
      for (const v of [box.min.x, box.max.x, box.min.z, box.max.z]) expect(Math.abs(v), tier).toBeLessThanOrEqual(half + 0.02);
      expect(box.min.y, tier).toBeGreaterThanOrEqual(-0.01);
      expect(triangleCount(dressing), tier).toBeLessThan(2500);
    }
  });

  it("hangs the village bunting from the eaves to the tall gate post", () => {
    const { plot, footprint, setBack, height } = finished.FINISHED.village;
    const dressing = finished.finishedDressingGeometry("village", 0);
    const position = dressing.getAttribute("position");
    const edge = plot / 2 - 0.25;
    const front = -setBack + footprint[1] / 2;
    // Something at each end of the cord: the gate post's top, and the cord's
    // end under the eave.
    const near = (x: number, y: number, z: number) => {
      for (let i = 0; i < position.count; i++) {
        if (Math.hypot(position.getX(i) - x, position.getY(i) - y, position.getZ(i) - z) < 0.1) return true;
      }
      return false;
    };
    expect(near(0.02, 1.85, edge)).toBe(true);
    expect(near(-footprint[0] / 2 + 0.3, height * 0.6, front + 0.1)).toBe(true);
  });
});
