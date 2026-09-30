import { describe, expect, it } from "vitest";
import type { LandmarkFile } from "@/types/analysis";
import { buildCivic, type CivicPalette, type CivicPlot } from "./civic";
import type { MeshDraft } from "./mesh";
import { NEAR_LIP, NEAR_NARROWEST, slivers, visibleFights } from "./near-checks";

/**
 * The civic buildings assembled from the near kit (`blender/civic/civic_kit_near.py`,
 * `buildCivic(..., { near: true })`), which the app draws in place of the lean
 * assembly when the camera is close. The same plot, walls and placements, so
 * the same footprint and height; finer parts, inside the near budget, and
 * held to the near models' z-fighting and ledge rules (in world units: a civic
 * building is authored in them).
 */

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
const PLOTS: Record<string, CivicPlot> = { std: { w: 7, h: 9.8, d: 7 }, small: { w: 3.4, h: 4.2, d: 3.4 }, low: { w: 8, h: 6, d: 8 } };
const BUDGET = 12_000;

const lean = (kind: LandmarkFile, plot: CivicPlot) => buildCivic(kind, plot, palette, { models: "blender" });
const near = (kind: LandmarkFile, plot: CivicPlot) => buildCivic(kind, plot, palette, { models: "blender", near: true });

function bounds(draft: MeshDraft) {
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < draft.positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      lo[k] = Math.min(lo[k], draft.positions[i + k]);
      hi[k] = Math.max(hi[k], draft.positions[i + k]);
    }
  }
  return { lo, hi };
}

describe.each(KINDS)("the near %s", (kind) => {
  for (const [size, plot] of Object.entries(PLOTS)) {
    describe(size, () => {
      const a = lean(kind, plot);
      const b = near(kind, plot);

      it("is far richer than the lean one and inside the budget", () => {
        const triangles = b.body.indices.length / 3;
        expect(triangles).toBeLessThanOrEqual(BUDGET);
        expect(triangles).toBeGreaterThan((a.body.indices.length / 3) * 1.5);
        expect(b.body.colors.length).toBe(b.body.positions.length);
        expect(b.body.surface?.length).toBe(b.body.positions.length / 3);
        expect(b.glow.indices.length / 3).toBeGreaterThan(0);
      });

      it("stands on the same plot and as tall", () => {
        const p = bounds(a.body);
        const q = bounds(b.body);
        for (let k = 0; k < 3; k++) {
          expect(q.lo[k]).toBeGreaterThanOrEqual(p.lo[k] - 0.2);
          expect(q.hi[k]).toBeLessThanOrEqual(p.hi[k] + 0.2);
        }
        expect(q.hi[1]).toBeGreaterThan(p.hi[1] - 0.3);
        expect(q.hi[0] - q.lo[0]).toBeGreaterThan((p.hi[0] - p.lo[0]) * 0.95);
        expect(q.hi[2] - q.lo[2]).toBeGreaterThan((p.hi[2] - p.lo[2]) * 0.95);
      });

      it("lights the same windows", () => {
        expect(b.glow.indices.length).toBe(a.glow.indices.length);
      });

      // The lean civic buildings are held to a coarser rule (`CIVIC_LAYER`, 3 cm,
      // is their step) and a few of their faces already lie closer than the
      // near rule's 2 cm. The near level adds no more within 5 mm of another (a
      // depth step is about a millimetre at the near distance, so 5 mm is
      // several) than a handful where its parts meet the lean walls, and no more
      // slivers than the lean level plus a few.
      // (Not on the small plot: its parts are a third the size, and what is a
      // hair there is under a millimetre.)
      it.skipIf(size === "small")("has no faces within a hair of each other beyond a handful", { timeout: 60_000 }, () => {
        const before = visibleFights(a.body, [1, 1, 1], 0.005).length;
        expect(visibleFights(b.body, [1, 1, 1], 0.005).length).toBeLessThanOrEqual(before + 16);
      });

      it.skipIf(size === "small")("leaves few slivers of ledge showing", { timeout: 60_000 }, () => {
        const before = slivers(a.body, [1, 1, 1], NEAR_NARROWEST, NEAR_LIP).length;
        expect(slivers(b.body, [1, 1, 1], NEAR_NARROWEST, NEAR_LIP).length).toBeLessThanOrEqual(before + 8);
      });
    });
  }
});
