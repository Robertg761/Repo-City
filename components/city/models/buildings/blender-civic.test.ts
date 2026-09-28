import { describe, expect, it } from "vitest";
import type { LandmarkFile } from "@/types/analysis";
import { buildCivic as build, type CivicPalette, type CivicPlot } from "./civic";
import { MODEL as CIVIC_KIT } from "./civicKit.model";
import { coplanarOverlaps } from "../coplanar";
import type { MeshDraft } from "./mesh";

/** The civic buildings assembled from the Blender kit (`blender/civic/civic_kit.py`). */
const buildCivic = (kind: LandmarkFile, plot: CivicPlot, palette: CivicPalette) => build(kind, plot, palette, { models: "blender" });

const palette: CivicPalette = {
  wall: [0.9, 0.9, 0.88],
  stone: [0.96, 0.95, 0.92],
  roof: [0.7, 0.76, 0.78],
  accent: [0.5, 0.66, 0.74],
  trim: [0.95, 0.95, 0.94],
  door: [0.35, 0.33, 0.28],
  window: [0.29, 0.33, 0.38],
  metal: [0.6, 0.63, 0.63],
  flag: [0.78, 0.35, 0.24],
  containers: [
    [0.29, 0.53, 0.66],
    [0.71, 0.41, 0.25],
    [0.44, 0.56, 0.42],
  ],
};

const KINDS: LandmarkFile[] = ["readme", "manifest", "changelog", "contributing", "dockerfile"];

/** The plot the generator reserves on the civic plaza, roughly. */
const plot = { w: 7, h: 9.8, d: 7 };

function bounds(positions: number[]) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    minX = Math.min(minX, positions[i]);
    maxX = Math.max(maxX, positions[i]);
    minY = Math.min(minY, positions[i + 1]);
    maxY = Math.max(maxY, positions[i + 1]);
    minZ = Math.min(minZ, positions[i + 2]);
    maxZ = Math.max(maxZ, positions[i + 2]);
  }
  return { minX, maxX, minY, maxY, minZ, maxZ };
}

describe("buildCivic from the Blender kit", () => {
  it("builds all five civic files with real detail", () => {
    for (const kind of KINDS) {
      const { body, glow } = buildCivic(kind, plot, palette);
      const triangles = body.indices.length / 3;
      // The old hand-built versions were 30 to 60 triangles of primitives;
      // this round is meant to be two to three times the detail.
      expect(triangles).toBeGreaterThan(150);
      expect(triangles).toBeLessThan(2600);
      expect(glow.indices.length / 3).toBeGreaterThan(0);
    }
  });

  it("keeps every civic building inside the plot the generator reserved", () => {
    for (const kind of KINDS) {
      const { body } = buildCivic(kind, plot, palette);
      const b = bounds(body.positions);
      // The plinth is 1.3 times the plot, and a flag or a tower may lean a
      // little past it, but nothing may reach the next cell on the plaza.
      expect(b.minX).toBeGreaterThan(-plot.w);
      expect(b.maxX).toBeLessThan(plot.w);
      expect(b.minZ).toBeGreaterThan(-plot.d);
      expect(b.maxZ).toBeLessThan(plot.d);
      expect(b.minY).toBeGreaterThanOrEqual(0);
      // Nothing but the archive's tower and the flag pole goes far above the
      // plot height, and never more than twice it.
      expect(b.maxY).toBeLessThan(plot.h * 2.2);
    }
  });

  it("stands every civic building on the ground, not in a hole", () => {
    for (const kind of KINDS) {
      const { body } = buildCivic(kind, plot, palette);
      expect(bounds(body.positions).minY).toBeLessThan(0.001);
    }
  });

  it("puts the warm glass in front of a dark pane, never on its own", () => {
    for (const kind of KINDS) {
      const { body, glow } = buildCivic(kind, plot, palette);
      expect(glow.positions.length).toBeLessThan(body.positions.length);
      expect(glow.colors.length).toBe(glow.positions.length);
    }
  });

  it("is deterministic and depends only on the plot", () => {
    const a = buildCivic("readme", plot, palette);
    const b = buildCivic("readme", plot, palette);
    expect(b.body.positions).toEqual(a.body.positions);
    const wider = buildCivic("readme", { ...plot, w: plot.w * 2 }, palette);
    expect(wider.body.positions).not.toEqual(a.body.positions);
  });

  it("scales with a small plot without turning inside out", () => {
    const tiny = { w: 3.4, h: 4.2, d: 3.4 };
    for (const kind of KINDS) {
      const { body } = buildCivic(kind, tiny, palette);
      const b = bounds(body.positions);
      expect(b.maxX - b.minX).toBeLessThan(tiny.w * 3);
      expect(Number.isFinite(b.maxY)).toBe(true);
    }
  });

  it("has a colour and a normal for every vertex it draws", () => {
    for (const kind of KINDS) {
      const { body, glow } = buildCivic(kind, plot, palette);
      expect(body.colors.length).toBe(body.positions.length);
      expect(body.normals.length).toBe(body.positions.length);
      expect(glow.normals.length).toBe(glow.positions.length);
    }
  });
});

describe("the civic kit", () => {
  const sizes = [
    { w: 7, h: 9.8, d: 7 },
    { w: 3.4, h: 4.2, d: 3.4 },
    { w: 8, h: 6, d: 8 },
    { w: 5, h: 11, d: 5 },
  ];

  it("keeps every building inside the budget at every plot size", () => {
    for (const plot of sizes) {
      for (const kind of KINDS) {
        const { body } = buildCivic(kind, plot, palette);
        expect(body.indices.length / 3, `${kind} at ${plot.w}`).toBeLessThan(2600);
      }
    }
  });

  it("builds from the kit, not the procedural primitives", () => {
    for (const kind of KINDS) {
      const kit = buildCivic(kind, plot, palette).body.positions;
      const procedural = build(kind, plot, palette).body.positions;
      expect(kit).not.toEqual(procedural);
    }
  });

  it("carries a finish for every vertex, and colours from the palette", () => {
    for (const kind of KINDS) {
      const { body, glow } = buildCivic(kind, plot, palette);
      expect(body.surface?.length).toBe(body.positions.length / 3);
      expect(glow.surface?.length).toBe(glow.positions.length / 3);
      for (const c of body.colors) {
        expect(Number.isFinite(c)).toBe(true);
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(1.0001);
      }
      // Normals are unit length: the parts are scaled before they are lit.
      for (let i = 0; i < body.normals.length; i += 3) {
        expect(Math.hypot(body.normals[i], body.normals[i + 1], body.normals[i + 2])).toBeCloseTo(1, 3);
      }
    }
  });

  it("publishes the profiles and proportions the assembly reads", () => {
    const meta = CIVIC_KIT.meta as { profiles: Record<string, [number, number][]>; pediment: { h: number } };
    for (const name of ["cornice", "band"]) {
      const profile = meta.profiles[name];
      // A profile starts and ends on the wall line, and climbs.
      expect(profile[0][0]).toBe(0);
      expect(profile[profile.length - 1][0]).toBe(0);
      expect(profile[profile.length - 1][1]).toBeGreaterThan(profile[0][1]);
    }
    expect(meta.pediment.h).toBeGreaterThan(0);
  });
});

describe("the civic kit against the z-fight checker", () => {
  /** `zfight.test.ts`: a hundredth of a unit is a step or two of depth from the overview. */
  const LANDMARK_GAP = 0.012;

  function fights(drafts: Record<string, MeshDraft>): string[] {
    const positions: number[] = [];
    const indices: number[] = [];
    const keys: string[] = [];
    for (const [tag, draft] of Object.entries(drafts)) {
      const base = positions.length / 3;
      positions.push(...draft.positions);
      for (let i = 0; i < draft.indices.length; i++) {
        const v = draft.indices[i];
        indices.push(base + v);
        if (i % 3 === 0) keys.push(`${tag}:${[0, 1, 2].map((k) => draft.colors[v * 3 + k].toFixed(3)).join("/")}`);
      }
    }
    return coplanarOverlaps(positions, indices, { within: LANDMARK_GAP, minOverlap: 1e-5, buriedWithin: 0.05 })
      .filter((p) => keys[p.a] !== keys[p.b] && p.normal[1] > -0.99)
      .map((p) => `${keys[p.a]} vs ${keys[p.b]} ${p.separation.toFixed(4)} apart at ${p.at.map((x) => x.toFixed(2)).join(",")}`);
  }

  for (const kind of KINDS) {
    it(`leaves no coplanar faces fighting in the ${kind}`, () => {
      const { body, glow } = buildCivic(kind, plot, palette);
      expect(fights({ body, glow })).toEqual([]);
    });
  }
});
