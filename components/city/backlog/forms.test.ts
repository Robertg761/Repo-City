import { describe, expect, it } from "vitest";
import { ShaderChunk } from "three";
import { triangleCount } from "../models/props/geometry";
import {
  CROWD_ATTRIBUTE,
  CROWD_FORMS,
  ISSUE_FORMS,
  MASK,
  PART,
  PULL_FORMS,
  formGeometry,
  formSpec,
  hasModifiers,
} from "./forms";
import {
  CROWD_VERTEX_BODY,
  CROWD_VERTEX_PARS,
  crowdMaterial,
  haloMaterial,
  smokeMaterial,
} from "./material";

const partsOf = (form: (typeof CROWD_FORMS)[number]): Set<number> => {
  const attribute = formGeometry(form).getAttribute(CROWD_ATTRIBUTE);
  const parts = new Set<number>();
  for (let i = 0; i < attribute.count; i++) parts.add(attribute.getX(i));
  return parts;
};

describe("crowd forms", () => {
  it("has seven issue forms and four pull request forms", () => {
    expect(ISSUE_FORMS).toHaveLength(7);
    expect(PULL_FORMS).toHaveLength(4);
    expect(CROWD_FORMS).toHaveLength(11);
  });

  it("builds each form once per tone and shares it", () => {
    for (const form of CROWD_FORMS) {
      const geometry = formGeometry(form, 0.2);
      expect(formGeometry(form, 0.2)).toBe(geometry);
      expect(formGeometry(form, 0.8)).not.toBe(geometry);
      expect(geometry.getAttribute("color")).toBeDefined();
      expect(geometry.getAttribute(CROWD_ATTRIBUTE).itemSize).toBe(2);
    }
  });

  it("keeps every form inside the PLAN.md 76.9 triangle budget", () => {
    for (const form of ISSUE_FORMS) {
      expect(triangleCount(formGeometry(form)), form).toBeLessThanOrEqual(160);
    }
    expect(triangleCount(formGeometry("scaffold"))).toBeLessThanOrEqual(220);
    for (const form of PULL_FORMS) {
      expect(triangleCount(formGeometry(form)), form).toBeLessThanOrEqual(220);
    }
  });

  it("keeps 1,500 crowd objects under a quarter of a million triangles", () => {
    // The worst case the ceilings allow: 1,000 issues of the heaviest issue
    // form and 500 pull requests of the heaviest pull request form.
    const issue = Math.max(...ISSUE_FORMS.map((form) => triangleCount(formGeometry(form))));
    const pull = Math.max(...PULL_FORMS.map((form) => triangleCount(formGeometry(form))));
    expect(issue * 1000 + pull * 500).toBeLessThanOrEqual(250_000);
  });

  it("stands every form on the ground and keeps it street-sized", () => {
    for (const form of CROWD_FORMS) {
      const geometry = formGeometry(form);
      geometry.computeBoundingBox();
      const box = geometry.boundingBox!;
      expect(box.min.y, form).toBeGreaterThanOrEqual(-0.01);
      expect(box.max.y, form).toBeLessThan(form === "scaffold" ? 9 : 3.2);
      expect(box.max.x - box.min.x, form).toBeLessThan(form === "scaffold" ? 5.6 : 3.6);
    }
  });

  it("bakes the four modifiers into every pull request form and none into issues", () => {
    for (const form of PULL_FORMS) {
      const parts = partsOf(form);
      for (const part of [PART.worker, PART.beacon, PART.board, PART.flag]) {
        expect(parts.has(part), `${form} part ${part}`).toBe(true);
      }
      expect(hasModifiers(form)).toBe(true);
    }
    for (const form of ISSUE_FORMS) {
      const parts = partsOf(form);
      for (const part of [PART.worker, PART.beacon, PART.board, PART.flag]) {
        expect(parts.has(part), `${form} part ${part}`).toBe(false);
      }
      expect(hasModifiers(form)).toBe(false);
    }
  });

  it("gives the fire flames and smoke, and every lamp a part that glows", () => {
    expect(partsOf("fire").has(PART.flame)).toBe(true);
    expect(formSpec("fire").smoke).not.toBeNull();
    for (const form of CROWD_FORMS) {
      const parts = partsOf(form);
      for (const lamp of formSpec(form).lamps) expect(parts.has(lamp.part), form).toBe(true);
    }
  });

  it("weights flag cloth outwards from the pole and leaves the pole still", () => {
    const attribute = formGeometry("hoarding").getAttribute(CROWD_ATTRIBUTE);
    let still = 0;
    let moving = 0;
    for (let i = 0; i < attribute.count; i++) {
      if (attribute.getX(i) !== PART.flag) continue;
      if (attribute.getY(i) === 0) still++;
      else moving++;
    }
    expect(still).toBeGreaterThan(0);
    expect(moving).toBeGreaterThan(0);
  });

  it("uses one mask bit per optional part", () => {
    expect(MASK.worker).toBe(1 << (PART.worker - 1));
    expect(MASK.beacon).toBe(1 << (PART.beacon - 1));
    expect(MASK.board).toBe(1 << (PART.board - 1));
    expect(MASK.flag).toBe(1 << (PART.flag - 1));
  });
});

describe("crowd materials", () => {
  it("finds the chunks it patches in three's standard shader", () => {
    expect(ShaderChunk.meshphysical_vert).toContain("#include <begin_vertex>");
    expect(ShaderChunk.meshphysical_vert).toContain("#include <common>");
    expect(ShaderChunk.meshphysical_frag).toContain("#include <emissivemap_fragment>");
    expect(ShaderChunk.meshphysical_frag).toContain("#include <color_fragment>");
  });

  it("patches the vertex and fragment stages and shares one program", () => {
    const shader = {
      uniforms: {} as Record<string, { value: unknown }>,
      vertexShader: ShaderChunk.meshphysical_vert,
      fragmentShader: ShaderChunk.meshphysical_frag,
    };
    const material = crowdMaterial();
    material.onBeforeCompile(shader as never, undefined as never);
    expect(shader.vertexShader).toContain(CROWD_VERTEX_PARS);
    expect(shader.vertexShader).toContain(CROWD_VERTEX_BODY);
    expect(shader.fragmentShader).toContain("totalEmissiveRadiance += vCrowdGlow;");
    expect(shader.uniforms.uTime).toBeDefined();
    expect(shader.uniforms.uReveal).toBeDefined();
    expect(material.customProgramCacheKey()).toBe(crowdMaterial().customProgramCacheKey());
    expect(material.vertexColors).toBe(true);
  });

  it("shares the crowd clock between the forms, the smoke and the halos", () => {
    const shader = {
      uniforms: {} as Record<string, { value: unknown }>,
      vertexShader: ShaderChunk.meshphysical_vert,
      fragmentShader: ShaderChunk.meshphysical_frag,
    };
    crowdMaterial().onBeforeCompile(shader as never, undefined as never);
    const smoke = {
      uniforms: {} as Record<string, { value: unknown }>,
      vertexShader: ShaderChunk.meshphysical_vert,
      fragmentShader: ShaderChunk.meshphysical_frag,
    };
    smokeMaterial("#777777").onBeforeCompile(smoke as never, undefined as never);
    expect(smoke.fragmentShader).toContain("diffuseColor.a *= vSmokeFade;");
    const halos = haloMaterial();
    expect(smoke.uniforms.uTime).toBe(shader.uniforms.uTime);
    expect(halos.uniforms.uTime).toBe(shader.uniforms.uTime);
    expect(halos.uniforms.uReveal).toBe(shader.uniforms.uReveal);
  });
});
