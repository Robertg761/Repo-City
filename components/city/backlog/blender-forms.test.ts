/**
 * The Blender crowd forms (`blender/crowd/forms.py`, drawn under
 * the Blender models) held to what `forms.test.ts` and `blockages.test.ts`
 * hold the procedural forms to, and to their procedural forms' own triangle
 * counts: fifteen hundred of them are instanced at once.
 */
import { describe, expect, it } from "vitest";
import { triangleCount } from "../models/props/geometry";
import { SURFACE, SURFACE_ATTRIBUTE } from "../textures/surface-types";
import { CROWD_FOOTPRINT } from "../blockages";
import { MODEL as CROWD_MODEL } from "./crowd.model";
import {
  BLENDER_FORM_NODE,
  CROWD_ATTRIBUTE,
  CROWD_MESHES,
  FORM_PAINT,
  PAINT_SLOT,
  PART,
  ISSUE_FORMS,
  PULL_FORMS,
  blenderFormGeometry,
  formGeometry,
  formSpec,
  hasModifiers,
  HOARDING_PLOT_STEP,
  hoardingPlot,
  hoardingPlotGeometry,
  partOfRole,
  type CrowdMesh,
} from "./forms";

const MODELLED = Object.keys(BLENDER_FORM_NODE) as CrowdMesh[];

const partsOf = (form: CrowdMesh) => {
  const attribute = blenderFormGeometry(form).getAttribute(CROWD_ATTRIBUTE);
  const parts = new Map<number, number[]>();
  for (let i = 0; i < attribute.count; i++) {
    const list = parts.get(attribute.getX(i)) ?? [];
    list.push(attribute.getY(i));
    parts.set(attribute.getX(i), list);
  }
  return parts;
};

describe("Blender crowd forms", () => {
  it("models the forms it claims, and gives every role in a node its own colour", () => {
    expect(MODELLED.sort()).toEqual(
      [...CROWD_MESHES].sort(),
    );
    // blenderBuilt finds a part's role by its material's colour.
    const byHex = new Map<string, string>();
    for (const material of CROWD_MODEL.materials) {
      const seen = byHex.get(material.hex);
      if (seen !== undefined) expect(seen, material.hex).toBe(material.role);
      byHex.set(material.hex, material.role);
    }
  });

  it("spends no more triangles than the procedural form, within PLAN.md 76.9's budget", () => {
    for (const form of MODELLED) {
      const tris = triangleCount(blenderFormGeometry(form));
      expect(tris, form).toBeLessThanOrEqual(triangleCount(formGeometry(form)));
      expect(tris, form).toBeLessThanOrEqual(form === "scaffold" || hasModifiers(form) ? 220 : 160);
    }
  });

  it("keeps 1,500 Blender crowd objects under a quarter of a million triangles", () => {
    const issue = Math.max(...ISSUE_FORMS.map((form) => triangleCount(blenderFormGeometry(form))));
    const pull = Math.max(...PULL_FORMS.map((form) => triangleCount(blenderFormGeometry(form))));
    expect(issue * 1000 + pull * 500).toBeLessThanOrEqual(250_000);
  });

  it("carries exactly the attributes the crowd material and the merge expect", () => {
    for (const form of MODELLED) {
      const ours = blenderFormGeometry(form);
      const theirs = formGeometry(form);
      expect(Object.keys(ours.attributes).sort(), form).toEqual(Object.keys(theirs.attributes).sort());
      for (const name of Object.keys(theirs.attributes)) {
        expect(ours.getAttribute(name).itemSize, `${form} ${name}`).toBe(theirs.getAttribute(name).itemSize);
      }
      const surfaces = new Set<number>(Object.values(SURFACE));
      const surface = ours.getAttribute(SURFACE_ATTRIBUTE);
      for (let i = 0; i < surface.count; i++) expect(surfaces.has(surface.getX(i))).toBe(true);
    }
  });

  it("builds once per tone", () => {
    for (const form of MODELLED) {
      expect(blenderFormGeometry(form, 0.2)).toBe(blenderFormGeometry(form, 0.201));
      expect(blenderFormGeometry(form, 0.2)).not.toBe(blenderFormGeometry(form, 0.8));
    }
  });

  it("stands on the ground inside its footprint", () => {
    for (const form of MODELLED) {
      const geometry = blenderFormGeometry(form);
      geometry.computeBoundingBox();
      const box = geometry.boundingBox!;
      const rect = CROWD_FOOTPRINT[form];
      const slack = 0.03;
      expect(box.min.y, form).toBeGreaterThanOrEqual(-0.01);
      expect(box.max.y, form).toBeLessThan(form === "scaffold" ? 9 : 3.2);
      expect(box.min.x, form).toBeGreaterThanOrEqual(rect.minX - slack);
      expect(box.max.x, form).toBeLessThanOrEqual(rect.maxX + slack);
      expect(box.min.z, form).toBeGreaterThanOrEqual(rect.minZ - slack);
      expect(box.max.z, form).toBeLessThanOrEqual(rect.maxZ + slack);
    }
  });

  it("has the same parts as the procedural form, and a part for every lamp", () => {
    for (const form of MODELLED) {
      const ours = partsOf(form);
      const attribute = formGeometry(form).getAttribute(CROWD_ATTRIBUTE);
      const theirs = new Set<number>();
      for (let i = 0; i < attribute.count; i++) theirs.add(attribute.getX(i));
      expect([...ours.keys()].sort(), form).toEqual([...theirs].sort());
      for (const lamp of formSpec(form).lamps) expect(ours.has(lamp.part), form).toBe(true);
    }
    for (const form of PULL_FORMS.filter((f) => MODELLED.includes(f))) {
      for (const part of [PART.worker, PART.beacon, PART.board, PART.flag]) {
        expect(partsOf(form).has(part), `${form} ${part}`).toBe(true);
      }
    }
  });

  it("paints the slots the form's paint lists cover, and nothing else", () => {
    for (const form of MODELLED) {
      const slots = new Set(partsOf(form).get(PART.body));
      const lists = FORM_PAINT[form];
      expect(slots.has(PAINT_SLOT.a), form).toBe(lists !== undefined);
      expect(slots.has(PAINT_SLOT.b), form).toBe(lists?.b !== undefined);
      for (const slot of slots) expect([0, 1, 2]).toContain(slot);
    }
  });

  it("weights the flames up their height, the flag cloth outwards and every worker fully", () => {
    const flames = partsOf("fire").get(PART.flame)!;
    expect(Math.min(...flames)).toBe(0);
    expect(Math.max(...flames)).toBeGreaterThan(0.9);
    for (const form of ["van", "scaffold", "trench", "hoarding", "hoarding-kerb"] as const) {
      const flag = partsOf(form).get(PART.flag)!;
      expect(flag.some((w) => w === 0), form).toBe(true);
      expect(flag.some((w) => w > 0.9), form).toBe(true);
      expect(new Set(partsOf(form).get(PART.worker))).toEqual(new Set([1]));
    }
  });

  it("does not darken what glows: flames and lamps keep their full colour", () => {
    const geometry = blenderFormGeometry("van");
    const crowd = geometry.getAttribute(CROWD_ATTRIBUTE);
    const color = geometry.getAttribute("color");
    let lamps = 0;
    for (let i = 0; i < crowd.count; i++) {
      if (crowd.getX(i) !== PART.amber && crowd.getX(i) !== PART.beacon) continue;
      lamps++;
      expect(Math.max(color.getX(i), color.getY(i), color.getZ(i))).toBeGreaterThan(0.9);
    }
    expect(lamps).toBeGreaterThan(0);
  });

  it("reads roles by prefix", () => {
    expect(partOfRole("flameOuter")).toBe(PART.flame);
    expect(partOfRole("workerHelmet")).toBe(PART.worker);
    expect(partOfRole("paintA")).toBe(PART.body);
    expect(partOfRole("vanWhite")).toBe(PART.body);
  });

  it("leaves every other form procedural", () => {
    for (const form of CROWD_MESHES) {
      if (MODELLED.includes(form)) continue;
      const ours = blenderFormGeometry(form, 0.3).getAttribute("position").array;
      expect(Array.from(ours), form).toEqual(Array.from(formGeometry(form, 0.3).getAttribute("position").array));
    }
  });
});

describe("Blender hoarding kit", () => {
  const plots: [number, number][] = [[2.5, 2.5], [4, 6], [8, 8], [12, 3]];

  it("builds a hoarding at a plot's real size, within the pull form budget", () => {
    for (const [w, d] of plots) {
      const geometry = hoardingPlotGeometry(w, d);
      expect(triangleCount(geometry), `${w}x${d}`).toBeLessThanOrEqual(triangleCount(formGeometry("hoarding")));
      geometry.computeBoundingBox();
      const box = geometry.boundingBox!;
      // Its own size, not the 2.8 model stretched: the fence is at the plot's edge.
      expect(box.max.x - box.min.x, `${w}x${d}`).toBeGreaterThan(w - 0.3);
      expect(box.max.x - box.min.x, `${w}x${d}`).toBeLessThanOrEqual(w + 0.06);
      expect(box.max.z - box.min.z, `${w}x${d}`).toBeLessThanOrEqual(d + 0.06);
      expect(box.min.y).toBeGreaterThanOrEqual(-0.01);
      expect(box.max.y).toBeLessThan(2.4);
    }
  });

  it("keeps the paint slot, the white band and all four optional parts at every size", () => {
    for (const [w, d] of plots) {
      const attribute = hoardingPlotGeometry(w, d).getAttribute(CROWD_ATTRIBUTE);
      const parts = new Set<number>();
      const slots = new Set<number>();
      for (let i = 0; i < attribute.count; i++) {
        parts.add(attribute.getX(i));
        if (attribute.getX(i) === PART.body) slots.add(attribute.getY(i));
      }
      for (const part of [PART.worker, PART.beacon, PART.board, PART.flag]) expect(parts.has(part)).toBe(true);
      expect(slots).toEqual(new Set([PAINT_SLOT.own, PAINT_SLOT.a]));
    }
    expect(CROWD_MODEL.materials.some((m) => m.role === "band")).toBe(true);
  });

  it("rounds a plot to the build step, and draws the 2.8 plot as the form's own model", () => {
    expect(hoardingPlot([1, 1, 1])).toEqual([2.75, 2.75]);
    expect(hoardingPlot([2, 1, 1.5])).toEqual([5.5, 4.25]);
    expect(HOARDING_PLOT_STEP).toBeLessThanOrEqual(0.25);
    expect(triangleCount(hoardingPlotGeometry(2.8, 2.8))).toBe(triangleCount(blenderFormGeometry("hoarding")));
  });
});
