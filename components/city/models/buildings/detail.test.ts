import { describe, expect, it } from "vitest";
import { M, gableRoof, hipRoof, settlementDraft } from "./kit";
import { LAYER, type MeshDraft, type Rgb3 } from "./mesh";
import { archetypeModel } from "./models";
import { METROPOLIS_ARCHETYPE_IDS } from "./metropolis";
import { propBlockGeometry, propTankGeometry } from "./geometry";
import { coplanarOverlaps } from "../coplanar";
import { narrowLedges } from "../ledges";

function paintedVertices(draft: MeshDraft, color: Rgb3): number[] {
  return Array.from({ length: draft.positions.length / 3 }, (_, i) => i).filter((i) =>
    color.every((c, k) => Math.abs(draft.colors[i * 3 + k] - c) < 1e-9),
  );
}

describe("roof construction details", () => {
  it.each(["x", "z"] as const)("tile joints on a %s ridge face the sky and clear the roof", (ridge) => {
    const draft = settlementDraft();
    const spec = { y: 0.5, w: 0.8, d: 0.8, rise: 0.3, overhang: 0.04, thickness: 0.03, ridge, roof: M.tile, gable: M.wall };
    gableRoof(draft, spec);
    const seams = paintedVertices(draft, [M.tile.color[0] * 0.8, M.tile.color[1] * 0.8, M.tile.color[2] * 0.8]);
    expect(seams.length).toBeGreaterThan(40);
    for (const i of seams) {
      const b = draft.positions[i * 3 + (ridge === "x" ? 2 : 0)];
      const roofY = spec.y + spec.rise * (1 - Math.abs(b) / 0.4);
      const normalY = draft.normals[i * 3 + 1];
      expect(normalY).toBeGreaterThan(0);
      expect((draft.positions[i * 3 + 1] - roofY) * normalY).toBeGreaterThan(LAYER);
    }
  });

  it("reed courses stay below the thick ridge dressing", () => {
    const draft = settlementDraft();
    hipRoof(draft, { y: 0.5, w: 0.84, d: 0.74, rise: 0.46, overhang: 0.05, thickness: 0.065, ridge: "x", ridgeLength: 0.3, roof: M.thatch, gable: M.wall, ridgeBand: M.thatchLight });
    const courses = paintedVertices(draft, [M.thatch.color[0] * 0.8, M.thatch.color[1] * 0.8, M.thatch.color[2] * 0.8]);
    expect(courses.length).toBeGreaterThan(0);
    for (const i of courses) {
      expect(Math.abs(draft.positions[i * 3 + 2])).toBeGreaterThan(0.2);
      expect(draft.normals[i * 3 + 1]).toBeGreaterThan(0);
    }
  });

  it.each(["house", "lowrise-pitched"] as const)("%s has upward-facing roof courses", (id) => {
    const draft = archetypeModel(id).draft;
    const seams = paintedVertices(draft, [0.72, 0.73, 0.75]).filter((i) => Math.abs(draft.normals[i * 3 + 1]) > 0.2 && Math.abs(draft.normals[i * 3 + 1]) < 0.99);
    expect(seams.length).toBeGreaterThan(0);
    for (const i of seams) expect(draft.normals[i * 3 + 1]).toBeGreaterThan(0);
  });
});

describe("curtain-wall glass", () => {
  it.each(METROPOLIS_ARCHETYPE_IDS)("%s reflects different sky tones across a storey", (id) => {
    const draft = archetypeModel(id).draft;
    const storeys = new Map<string, Set<string>>();
    for (let i = 0; i < draft.positions.length / 3; i++) {
      const [r, g, b] = draft.colors.slice(i * 3, i * 3 + 3);
      if (b - (r + g) / 2 < 0.15 || draft.normals[i * 3 + 2] < 0.99) continue;
      const height = draft.positions[i * 3 + 1].toFixed(5);
      const shades = storeys.get(height) ?? new Set<string>();
      shades.add([r, g, b].join("/"));
      storeys.set(height, shades);
    }
    expect([...storeys.values()].some((shades) => shades.size > 1)).toBe(true);
  });
});

describe("shared rooftop equipment", () => {
  for (const [name, build, budget] of [["block", propBlockGeometry, 96], ["tank", propTankGeometry, 220]] as const) {
    it(`${name} stays cached, compact, and free of flickering overlays`, () => {
      const geometry = build();
      expect(build()).toBe(geometry);
      const positions = Array.from(geometry.getAttribute("position").array);
      const indices = geometry.index ? Array.from(geometry.index.array) : Array.from({ length: positions.length / 3 }, (_, i) => i);
      expect(indices.length / 3).toBeLessThanOrEqual(budget);
      for (let i = 0; i < positions.length; i += 3) {
        expect(Math.abs(positions[i])).toBeLessThanOrEqual(0.52);
        expect(Math.abs(positions[i + 2])).toBeLessThanOrEqual(0.52);
        expect(positions[i + 1]).toBeGreaterThanOrEqual(0);
        expect(positions[i + 1]).toBeLessThanOrEqual(1.03);
      }
      const colors = geometry.getAttribute("color").array;
      const colorAt = (triangle: number) => Array.from(colors.slice(indices[triangle * 3] * 3, indices[triangle * 3] * 3 + 3)).join("/");
      const fights = coplanarOverlaps(positions, indices, { within: LAYER * 0.9, minOverlap: 1e-6, buriedWithin: 0.03 })
        .filter((p) => colorAt(p.a) !== colorAt(p.b) && p.normal[1] > -0.99);
      expect(fights).toEqual([]);
      expect(narrowLedges(positions, indices, { narrowerThan: LAYER * 1.9, lowerThan: LAYER * 0.95 })).toEqual([]);
    });
  }
});
