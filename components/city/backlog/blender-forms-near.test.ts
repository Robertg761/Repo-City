/**
 * The near (detailed) crowd forms (`blender/crowd/near.py`, drawn by
 * `LodInstances` for the crowd objects nearest the camera) held to what the
 * lean forms are held to in `blender-forms.test.ts`, and to their own
 * budget: up to 3,000 triangles a form.
 */
import { describe, expect, it } from "vitest";
import { triangleCount } from "../models/props/geometry";
import { SURFACE, SURFACE_ATTRIBUTE } from "../textures/surface-types";
import { CROWD_FOOTPRINT } from "../blockages";
import { MODEL as CROWD_NEAR_MODEL } from "./crowdNear.model";
import { CROWD_VERTEX_PARS, INSTANCE_ATTRIBUTES } from "./material";
import {
  BLENDER_FORM_NODE,
  CROWD_ATTRIBUTE,
  CROWD_MESHES,
  FORM_PAINT,
  PAINT_SLOT,
  PART,
  PULL_FORMS,
  blenderFormGeometry,
  blenderNearFormGeometry,
  blenderNearHoardingPlotGeometry,
  formSpec,
  hoardingPlotGeometry,
  nearFormGeometry,
  nearHoardingPlotGeometry,
  partOfRole,
  type CrowdMesh,
} from "./forms";

const BUDGET = 3000;

const partsOf = (geometry: ReturnType<typeof blenderNearFormGeometry>) => {
  const attribute = geometry.getAttribute(CROWD_ATTRIBUTE);
  const parts = new Map<number, number[]>();
  for (let i = 0; i < attribute.count; i++) {
    const list = parts.get(attribute.getX(i)) ?? [];
    list.push(attribute.getY(i));
    parts.set(attribute.getX(i), list);
  }
  return parts;
};

/** The plots hoardings come in, from a corner lot to a wide, shallow one. */
const PLOTS: [number, number][] = [[2.5, 2.5], [4, 6], [8, 8], [12, 3], [2.75, 2.75]];

describe("near crowd forms", () => {
  it("has a near node for every form the crowd draws, and gives every role its own colour", () => {
    const nodes = new Set(CROWD_NEAR_MODEL.nodes.map((n) => n.name));
    for (const form of CROWD_MESHES) {
      if (form === "hoarding" || form === "hoarding-kerb") continue;
      expect(nodes.has(`${BLENDER_FORM_NODE[form]}Near`), form).toBe(true);
    }
    for (const piece of ["Ground", "Sheet", "SheetAlt", "Band", "Post", "Gate", "Notice", "Worker", "Beacon", "Stop", "Flag"]) {
      expect(nodes.has(`Hoard${piece}Near`), piece).toBe(true);
    }
    // blenderGroups finds a part's role by its material's colour.
    const byHex = new Map<string, string>();
    for (const material of CROWD_NEAR_MODEL.materials) {
      const seen = byHex.get(material.hex);
      if (seen !== undefined) expect(seen, material.hex).toBe(material.role);
      byHex.set(material.hex, material.role);
    }
  });

  it("spends up to 3,000 triangles a form, and a real jump over the lean form", () => {
    for (const form of CROWD_MESHES) {
      const near = triangleCount(blenderNearFormGeometry(form));
      expect(near, form).toBeLessThanOrEqual(BUDGET);
      expect(near, form).toBeGreaterThan(triangleCount(blenderFormGeometry(form)) * 5);
    }
    // The busiest hoarding: fifteen sheets, four bands and posts, gate, notice and the optional parts.
    for (const [w, d] of PLOTS) {
      const tris = triangleCount(blenderNearHoardingPlotGeometry(w, d));
      expect(tris, `${w}x${d}`).toBeLessThanOrEqual(BUDGET);
      expect(tris, `${w}x${d}`).toBeGreaterThan(triangleCount(hoardingPlotGeometry(w, d)));
    }
  });

  it("carries exactly the attributes the crowd material and the lean forms have", () => {
    for (const form of CROWD_MESHES) {
      const near = blenderNearFormGeometry(form);
      const lean = blenderFormGeometry(form);
      expect(Object.keys(near.attributes).sort(), form).toEqual(Object.keys(lean.attributes).sort());
      for (const name of Object.keys(lean.attributes)) {
        expect(near.getAttribute(name).itemSize, `${form} ${name}`).toBe(lean.getAttribute(name).itemSize);
      }
      const surfaces = new Set<number>(Object.values(SURFACE));
      const surface = near.getAttribute(SURFACE_ATTRIBUTE);
      for (let i = 0; i < surface.count; i++) expect(surfaces.has(surface.getX(i))).toBe(true);
    }
  });

  it("builds once per tone", () => {
    for (const form of CROWD_MESHES) {
      expect(blenderNearFormGeometry(form, 0.2)).toBe(blenderNearFormGeometry(form, 0.201));
      expect(blenderNearFormGeometry(form, 0.2)).not.toBe(blenderNearFormGeometry(form, 0.8));
    }
    expect(blenderNearHoardingPlotGeometry(4, 6)).toBe(blenderNearHoardingPlotGeometry(4, 6));
    expect(blenderNearHoardingPlotGeometry(4, 6)).not.toBe(blenderNearHoardingPlotGeometry(6, 4));
  });

  it("stands where the lean form stands: on the ground, inside its footprint, at its size", () => {
    for (const form of CROWD_MESHES) {
      const near = blenderNearFormGeometry(form);
      near.computeBoundingBox();
      const lean = blenderFormGeometry(form);
      lean.computeBoundingBox();
      const box = near.boundingBox!;
      const rect = CROWD_FOOTPRINT[form];
      const slack = 0.03;
      expect(box.min.y, form).toBeGreaterThanOrEqual(-0.01);
      expect(box.max.x, form).toBeLessThanOrEqual(rect.maxX + slack);
      expect(box.min.x, form).toBeGreaterThanOrEqual(rect.minX - slack);
      expect(box.max.z, form).toBeLessThanOrEqual(rect.maxZ + slack);
      expect(box.min.z, form).toBeGreaterThanOrEqual(rect.minZ - slack);
      // The same outline: it may refine the lean silhouette, not grow, shrink or move it.
      const lb = lean.boundingBox!;
      const tolerance = form === "scaffold" ? 0.45 : 0.3;
      for (const axis of ["x", "y", "z"] as const) {
        expect(Math.abs(box.max[axis] - lb.max[axis]), `${form} max ${axis}`).toBeLessThan(tolerance);
        expect(Math.abs(box.min[axis] - lb.min[axis]), `${form} min ${axis}`).toBeLessThan(tolerance);
      }
    }
  });

  it("has the same parts as the lean form, and a part for every lamp", () => {
    for (const form of CROWD_MESHES) {
      const ours = partsOf(blenderNearFormGeometry(form));
      const theirs = partsOf(blenderFormGeometry(form));
      expect([...ours.keys()].sort(), form).toEqual([...theirs.keys()].sort());
      for (const lamp of formSpec(form).lamps) expect(ours.has(lamp.part), form).toBe(true);
    }
    for (const form of PULL_FORMS) {
      for (const part of [PART.worker, PART.beacon, PART.board, PART.flag]) {
        expect(partsOf(blenderNearFormGeometry(form)).has(part), `${form} ${part}`).toBe(true);
      }
    }
    for (const [w, d] of PLOTS) {
      const parts = partsOf(blenderNearHoardingPlotGeometry(w, d));
      for (const part of [PART.worker, PART.beacon, PART.board, PART.flag]) expect(parts.has(part), `${w}x${d} ${part}`).toBe(true);
    }
  });

  it("paints the slots the lean form paints, and nothing else", () => {
    for (const form of CROWD_MESHES) {
      const slots = new Set(partsOf(blenderNearFormGeometry(form)).get(PART.body));
      const lean = new Set(partsOf(blenderFormGeometry(form)).get(PART.body));
      expect(slots.has(PAINT_SLOT.a), form).toBe(lean.has(PAINT_SLOT.a));
      expect(slots.has(PAINT_SLOT.b), form).toBe(lean.has(PAINT_SLOT.b));
      expect(slots.has(PAINT_SLOT.a), form).toBe(FORM_PAINT[form] !== undefined);
      for (const slot of slots) expect([0, 1, 2]).toContain(slot);
    }
  });

  it("weights the flames up their height, the flag cloth outwards and every worker fully", () => {
    const flames = partsOf(blenderNearFormGeometry("fire")).get(PART.flame)!;
    expect(Math.min(...flames)).toBe(0);
    expect(Math.max(...flames)).toBeGreaterThan(0.9);
    for (const form of ["van", "scaffold", "trench", "hoarding", "hoarding-kerb"] as const) {
      const parts = partsOf(blenderNearFormGeometry(form));
      const flag = parts.get(PART.flag)!;
      expect(flag.some((w) => w === 0), form).toBe(true);
      expect(flag.some((w) => w > 0.9), form).toBe(true);
      expect(new Set(parts.get(PART.worker)), form).toEqual(new Set([1]));
    }
  });

  it("does not darken what glows: flames and lamps keep their full colour", () => {
    for (const form of ["fire", "van", "roadblock", "collision"] as CrowdMesh[]) {
      const geometry = blenderNearFormGeometry(form);
      const crowd = geometry.getAttribute(CROWD_ATTRIBUTE);
      const color = geometry.getAttribute("color");
      let lamps = 0;
      for (let i = 0; i < crowd.count; i++) {
        if (![PART.amber, PART.hazard, PART.flame].includes(crowd.getX(i) as never)) continue;
        lamps++;
        expect(Math.max(color.getX(i), color.getY(i), color.getZ(i)), form).toBeGreaterThan(0.5);
      }
      expect(lamps, form).toBeGreaterThan(0);
    }
    // A beacon's base is dark on purpose; its lens is the glow.
    for (const form of PULL_FORMS) {
      const geometry = blenderNearFormGeometry(form);
      const crowd = geometry.getAttribute(CROWD_ATTRIBUTE);
      const color = geometry.getAttribute("color");
      let brightest = 0;
      for (let i = 0; i < crowd.count; i++) {
        if (crowd.getX(i) === PART.beacon) brightest = Math.max(brightest, color.getX(i), color.getY(i), color.getZ(i));
      }
      expect(brightest, form).toBeGreaterThan(0.9);
    }
  });

  it("reads the near roles by the same prefixes as the lean ones", () => {
    for (const material of CROWD_NEAR_MODEL.materials) {
      const part = partOfRole(material.role);
      if (material.role.startsWith("worker")) expect(part).toBe(PART.worker);
      if (material.role.startsWith("flag")) expect(part).toBe(PART.flag);
      if (material.role.startsWith("board")) expect(part).toBe(PART.board);
      if (material.role.startsWith("beacon")) expect(part).toBe(PART.beacon);
    }
  });

  it("mirrors every per-instance attribute the crowd shader reads onto the near mesh", () => {
    const read = [...CROWD_VERTEX_PARS.matchAll(/^attribute \w+ (instance\w+);/gm)].map((m) => m[1]);
    expect([...INSTANCE_ATTRIBUTES].sort()).toEqual(read.sort());
  });

  it("draws no near forms without the Blender models", () => {
    // Tests see the procedural forms, like the rest of the city's tests.
    for (const form of CROWD_MESHES) expect(nearFormGeometry(form), form).toBeNull();
    expect(nearHoardingPlotGeometry(4, 6)).toBeNull();
  });
});
