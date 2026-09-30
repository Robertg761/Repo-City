import { afterEach, describe, expect, it, vi } from "vitest";
import { SURFACE } from "../../textures/surface-types";
import { importedDraft, type ImportedModel } from "../imported";
import type { ModelKey } from "./archetypes";
import { MODEL as MIDRISE_MECH } from "./buildingMidriseMech.model";
import { MODEL as MIDRISE_MECH_NEAR } from "./buildingMidriseMechNear.model";
import { MODEL as MIDRISE_SETBACK } from "./buildingMidriseSetback.model";
import { MODEL as MIDRISE_SETBACK_NEAR } from "./buildingMidriseSetbackNear.model";
import { MODEL as TOWER_CROWN } from "./buildingTowerCrown.model";
import { MODEL as TOWER_CROWN_NEAR } from "./buildingTowerCrownNear.model";
import { MODEL as TOWER_GLASS } from "./buildingTowerGlass.model";
import { MODEL as TOWER_GLASS_NEAR } from "./buildingTowerGlassNear.model";
import { MODEL as TOWER_SPIRE } from "./buildingTowerSpire.model";
import { MODEL as TOWER_SPIRE_NEAR } from "./buildingTowerSpireNear.model";
import { MODEL as TOWER_STEPPED } from "./buildingTowerStepped.model";
import { MODEL as TOWER_STEPPED_NEAR } from "./buildingTowerSteppedNear.model";
import { MODEL as TOWER_TWIN } from "./buildingTowerTwin.model";
import { MODEL as TOWER_TWIN_NEAR } from "./buildingTowerTwinNear.model";
import { towerRole } from "./metropolis";
import { PANEL_LIFT, type MeshDraft, type Panel } from "./mesh";
import { blenderRole } from "./models";
import {
  FACING,
  NEAR_LIP,
  NEAR_NARROWEST,
  NEAR_WITHIN,
  dot,
  firstHit,
  insideTri,
  panelPoint,
  slivers,
  sub,
  toneBySurface,
  tris,
  visibleFights,
  withLitPanes,
  type V,
} from "./near-checks";
import { LIT_LIFT } from "./placement";

/**
 * The near levels of the towers and the mid-rises (`blender/buildings/near.py`,
 * `nkit.py`). Each is the lean model's script run again with a detailer, so
 * these tests hold it to what a near level owes the lean one: the same
 * footprint and height, the very same window rectangles (the lit-window pass
 * draws them from the lean model), glazing in every one of them, and the
 * city's z-fighting and ledge rules, which a richer mesh has more chances to
 * break. Budgets are the brief's: 15,000 triangles a tower, 10,000 a mid-rise.
 */

interface Family {
  id: ModelKey;
  lean: ImportedModel;
  near: ImportedModel;
  roles: (role: string) => readonly [number, number, number];
  /** The archetype script's `SCALE`: what the unit box is stretched to. */
  scale: readonly [number, number, number];
  budget: number;
  /** The near level must be at least this many times the lean one's triangles. */
  gain: number;
}

const FAMILIES: Family[] = [
  { id: "tower-crown", scale: [6, 23, 6], lean: TOWER_CROWN, near: TOWER_CROWN_NEAR, roles: blenderRole, budget: 15000, gain: 6 },
  { id: "tower-stepped", scale: [6, 19, 6], lean: TOWER_STEPPED, near: TOWER_STEPPED_NEAR, roles: blenderRole, budget: 15000, gain: 6 },
  { id: "tower-glass", scale: [6.5, 20, 6.5], lean: TOWER_GLASS, near: TOWER_GLASS_NEAR, roles: towerRole, budget: 15000, gain: 4 },
  { id: "tower-twin", scale: [7.5, 28, 7.5], lean: TOWER_TWIN, near: TOWER_TWIN_NEAR, roles: towerRole, budget: 15000, gain: 4 },
  { id: "tower-spire", scale: [7.5, 34, 7.5], lean: TOWER_SPIRE, near: TOWER_SPIRE_NEAR, roles: towerRole, budget: 15000, gain: 6 },
  { id: "midrise-mech", scale: [5.5, 14, 5.5], lean: MIDRISE_MECH, near: MIDRISE_MECH_NEAR, roles: blenderRole, budget: 10000, gain: 4 },
  { id: "midrise-setback", scale: [5.5, 12, 5.5], lean: MIDRISE_SETBACK, near: MIDRISE_SETBACK_NEAR, roles: blenderRole, budget: 10000, gain: 4 },
];

const draftOf = (model: ImportedModel, roles: Family["roles"]): MeshDraft =>
  importedDraft(model, "Building", (mat) => ({ color: roles(mat.role) })) as MeshDraft;

const extent = (draft: MeshDraft, axis: 0 | 1 | 2): [number, number] => {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = axis; i < draft.positions.length; i += 3) {
    lo = Math.min(lo, draft.positions[i]);
    hi = Math.max(hi, draft.positions[i]);
  }
  return [lo, hi];
};

describe.each(FAMILIES)("the near level of $id", (family) => {
  const lean = draftOf(family.lean, family.roles);
  const near = draftOf(family.near, family.roles);
  const windows = (family.lean.meta as { windows: Panel[] }).windows;
  const all = tris(near);

  it("is far more detailed than the lean model, inside its budget", () => {
    const count = near.indices.length / 3;
    expect(count).toBeLessThanOrEqual(family.budget);
    expect(count).toBeGreaterThan((lean.indices.length / 3) * family.gain);
    expect(near.colors.length).toBe(near.positions.length);
    expect(near.normals.length).toBe(near.positions.length);
    expect(near.surface?.length).toBe(near.positions.length / 3);
    expect(Math.max(...near.indices)).toBeLessThan(near.positions.length / 3);
  });

  it("reads as bright as the lean model from afar: walls and glass, surface by surface", () => {
    // The near level swaps in for the lean one among lean neighbours: the
    // occlusion baked into its finer cells and its relief must not darken it.
    // `blender/buildings/tone.py` matches it per material role; metal is left
    // out, being mostly plant and frames the lean model has little of.
    const leanTone = toneBySurface(lean, family.scale);
    const nearTone = toneBySurface(near, family.scale);
    for (const surface of [SURFACE.plaster, SURFACE.stone, SURFACE.concrete, SURFACE.glass]) {
      const theirs = leanTone.get(surface);
      const mine = nearTone.get(surface);
      if (!theirs || !mine || theirs.area < 1) continue;
      const what = `surface ${surface}: lean ${theirs.tone.toFixed(3)}, near ${mine.tone.toFixed(3)}`;
      expect(mine.tone / theirs.tone, what).toBeGreaterThan(0.95);
      expect(mine.tone / theirs.tone, what).toBeLessThan(1.05);
    }
  });

  it("stands on the lean model's footprint and to its height", () => {
    for (const axis of [0, 1, 2] as const) {
      const [lo, hi] = extent(lean, axis);
      const [nlo, nhi] = extent(near, axis);
      // Detail may stand a little proud of the lean walls (quoins, sills) and
      // a mast may carry a beacon, but the outline does not move.
      expect(nlo, `axis ${axis} low`).toBeGreaterThan(lo - 0.025);
      expect(nhi, `axis ${axis} high`).toBeLessThan(hi + (axis === 1 ? 0.09 : 0.03));
      expect(nhi, `axis ${axis} high`).toBeGreaterThan(hi - 0.002);
    }
  });

  it("was built with the very windows the lean model publishes", () => {
    expect((family.near.meta as { windows: Panel[] }).windows).toEqual(windows);
    expect((family.near.meta as { roofPads: unknown }).roofPads).toEqual((family.lean.meta as { roofPads: unknown }).roofPads);
  });

  it("keeps a pane of dark glass in every published window, its middle open", () => {
    for (const panel of windows) {
      const facing = FACING[panel.facing];
      const glass = all.filter(
        (t) => t.surface === SURFACE.glass && dot(t.n, facing) > 0.9999 && Math.abs(t.d - dot(facing, panelPoint(panel, 0, 0, PANEL_LIFT))) < 2e-4,
      );
      for (const [du, dv] of [[0, 0], [-0.9, -0.9], [0.9, -0.9], [0.9, 0.9], [-0.9, 0.9]]) {
        const q = panelPoint(panel, du, dv, PANEL_LIFT);
        const pane = glass.find((t) => insideTri(t, q, 1e-6));
        expect(pane, `${panel.facing} window at u ${panel.u} v ${panel.v}: no glass at ${q.map((c) => c.toFixed(3))}`).toBeDefined();
        if (du === 0) {
          const from: V = [q[0] + facing[0] * 1e-4, q[1] + facing[1] * 1e-4, q[2] + facing[2] * 1e-4];
          const blocker = firstHit(all, from, facing, pane!.i);
          if (blocker) expect(dot(sub(blocker.p[0], q), facing)).toBeGreaterThan(LIT_LIFT * 1.5);
        }
      }
    }
  });

  it("faces its faces out: nothing looks into the solid behind it", () => {
    // The lean test's rule, on every 7th face (the full check is quadratic):
    // a face is wrong only if every sample on it looks into a solid, so a
    // face partly under a frame is not, and a buried one is never seen.
    const samples = [[1 / 3, 1 / 3, 1 / 3], [0.7, 0.15, 0.15], [0.15, 0.7, 0.15], [0.15, 0.15, 0.7]];
    const inward: string[] = [];
    for (let k = 0; k < all.length; k += 7) {
      const t = all[k];
      const wrong = samples.every(([a, b, cc]) => {
        const c: V = [0, 1, 2].map((axis) => a * t.p[0][axis] + b * t.p[1][axis] + cc * t.p[2][axis]) as V;
        const hit = firstHit(all, [c[0] + t.n[0] * 1e-5, c[1] + t.n[1] * 1e-5, c[2] + t.n[2] * 1e-5], t.n, t.i);
        const back: V = [-t.n[0], -t.n[1], -t.n[2]];
        const behind = firstHit(all, [c[0] + back[0] * 1e-5, c[1] + back[1] * 1e-5, c[2] + back[2] * 1e-5], back, t.i);
        const buried = behind !== null && dot(behind.n, back) > 1e-6;
        return hit !== null && dot(hit.n, t.n) > 1e-6 && !buried;
      });
      if (wrong) inward.push(t.p[0].map((x) => x.toFixed(3)).join(","));
    }
    expect(inward).toEqual([]);
  }, 60_000);

  it("has no two faces flickering through each other, lit or not", () => {
    expect(visibleFights(near, family.scale, NEAR_WITHIN)).toEqual([]);
    expect(visibleFights(withLitPanes(near, windows), family.scale, NEAR_WITHIN)).toEqual([]);
  }, 60_000);

  it("leaves no sliver of ledge showing", () => {
    expect(slivers(near, family.scale, NEAR_NARROWEST, NEAR_LIP)).toEqual([]);
  }, 120_000);
});

/**
 * The glazed towers keep their character when the near level swaps in: the
 * lean model reads as bands of glass between spandrels, and the near one used
 * to cast every transom, glazing bead and corner post in the spandrel's wall
 * material, so a glass shaft turned into a stone wall with punched windows.
 * The hardware is metal now (`nkit.Near.curtain`), which shows as more metal
 * and no more plaster.
 */
describe.each(["tower-glass", "tower-twin", "tower-spire"] as ModelKey[])("the near level of %s keeps its curtain wall glazed", (id) => {
  const family = FAMILIES.find((f) => f.id === id)!;
  const lean = toneBySurface(draftOf(family.lean, family.roles), family.scale);
  const near = toneBySurface(draftOf(family.near, family.roles), family.scale);
  const area = (m: typeof lean, surface: number) => m.get(surface)?.area ?? 0;

  it("has all of the lean model's glass", () => {
    expect(area(near, SURFACE.glass)).toBeGreaterThanOrEqual(area(lean, SURFACE.glass) * 0.999);
  });

  it("adds no wall to it: its frames, beads and posts are metal", () => {
    expect(area(near, SURFACE.plaster)).toBeLessThanOrEqual(area(lean, SURFACE.plaster) * 1.05);
    expect(area(near, SURFACE.metal)).toBeGreaterThan(area(lean, SURFACE.metal) * 1.5);
    // Stone (quoins, sills, the podium's dressing) may grow, but not into a second facade.
    expect(area(near, SURFACE.stone)).toBeLessThan(area(lean, SURFACE.stone) * 1.4);
  });
});

describe("archetypeNearGeometry", () => {
  afterEach(() => {
    vi.doUnmock("../modelSource");
    vi.resetModules();
  });

  it("draws no near level while the Blender models are off", async () => {
    const { archetypeNearGeometry } = await import("./geometry");
    for (const { id } of FAMILIES) expect(archetypeNearGeometry(id)).toBeNull();
  });

  it("builds each near level once, on the lean model's bounding sphere", async () => {
    vi.resetModules();
    vi.doMock("../modelSource", () => ({ BLENDER_MODELS: true, PROCEDURAL_PARAM: "procedural" }));
    const { archetypeGeometry, archetypeNearGeometry } = await import("./geometry");
    for (const { id } of FAMILIES) {
      const geometry = archetypeNearGeometry(id);
      expect(geometry, id).not.toBeNull();
      expect(archetypeNearGeometry(id)).toBe(geometry);
      for (const name of ["position", "normal", "color", "surface"]) expect(geometry!.getAttribute(name), `${id} ${name}`).toBeDefined();
      // The far and near levels pick their instances by one radius.
      const lean = archetypeGeometry(id);
      lean.computeBoundingSphere();
      geometry!.computeBoundingSphere();
      expect(Math.abs(geometry!.boundingSphere!.radius - lean.boundingSphere!.radius) / lean.boundingSphere!.radius, id).toBeLessThan(0.05);
    }
  });
});
