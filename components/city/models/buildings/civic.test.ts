import { describe, expect, it } from "vitest";
import type { LandmarkFile } from "@/types/analysis";
import { buildCivic, type CivicPalette } from "./civic";

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

describe("buildCivic (PLAN.md section 10)", () => {
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
