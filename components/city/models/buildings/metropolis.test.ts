import { describe, expect, it } from "vitest";
import { triangleCount, type MeshDraft } from "./mesh";
import {
  METROPOLIS_ARCHETYPE_IDS,
  METROPOLIS_BUILDERS,
  glassAt,
  towerGlass,
  towerSpire,
  towerTwin,
} from "./metropolis";
import { SETTLEMENT_ARCHETYPE_IDS } from "./archetypes";

/** Every vertex, as [x, y, z, r, g, b]. */
function vertices(draft: MeshDraft): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < draft.positions.length; i += 3) {
    out.push([...draft.positions.slice(i, i + 3), ...draft.colors.slice(i, i + 3)]);
  }
  return out;
}

interface Tri {
  c: number[];
  area: number;
  /** Faces sideways: part of a facade, not a roof or a floor. */
  wall: boolean;
  color: number[];
}

/** Every triangle: its centroid, its area and the colour of its first corner. */
function triangles(draft: MeshDraft): Tri[] {
  const p = (i: number) => draft.positions.slice(i * 3, i * 3 + 3);
  const out: Tri[] = [];
  for (let t = 0; t < draft.indices.length; t += 3) {
    const [a, b, c] = [p(draft.indices[t]), p(draft.indices[t + 1]), p(draft.indices[t + 2])];
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    out.push({
      c: [0, 1, 2].map((k) => (a[k] + b[k] + c[k]) / 3),
      area: Math.hypot(...cross) / 2,
      wall: Math.abs(cross[1]) < 0.1 * Math.hypot(...cross),
      color: draft.colors.slice(draft.indices[t] * 3, draft.indices[t] * 3 + 3),
    });
  }
  return out;
}

const blueness = ([r, g, b]: readonly number[]) => b - (r + g) / 2;

describe("the metropolis towers (PLAN.md 76.5)", () => {
  it("are keyed by the settlement archetype ids S0 declared", () => {
    for (const id of METROPOLIS_ARCHETYPE_IDS) {
      expect(SETTLEMENT_ARCHETYPE_IDS).toContain(id);
      expect(METROPOLIS_BUILDERS[id]().id).toBe(id);
    }
  });

  // The same limits the city's own archetypes are held to (archetypes.test.ts),
  // so the towers drop into the archetype table without special cases.
  it.each(METROPOLIS_ARCHETYPE_IDS)("%s stays inside the unit box with a sane budget", (id) => {
    const { draft } = METROPOLIS_BUILDERS[id]();
    const triangles = triangleCount(draft);
    expect(triangles).toBeGreaterThan(20);
    expect(triangles).toBeLessThan(1300);
    for (const [x, y, z] of vertices(draft)) {
      expect(Math.abs(x)).toBeLessThanOrEqual(0.62);
      expect(Math.abs(z)).toBeLessThanOrEqual(0.62);
      expect(y).toBeGreaterThanOrEqual(-0.001);
      expect(y).toBeLessThanOrEqual(1.12);
    }
    expect(draft.colors.length).toBe(draft.positions.length);
    expect(draft.normals.length).toBe(draft.positions.length);
    expect(draft.indices.length % 3).toBe(0);
    expect(Math.max(...draft.indices)).toBeLessThan(draft.positions.length / 3);
  });

  it.each(METROPOLIS_ARCHETYPE_IDS)("%s publishes windows on a wall and pads on a roof", (id) => {
    const model = METROPOLIS_BUILDERS[id]();
    expect(model.windows.length).toBeGreaterThan(0);
    for (const panel of model.windows) {
      expect(panel.plane).toBeGreaterThan(0.2);
      expect(panel.v).toBeGreaterThan(0);
      expect(panel.v).toBeLessThan(1);
    }
    for (const pad of model.roofPads) {
      expect(pad.y).toBeGreaterThan(0.3);
      expect(pad.y).toBeLessThanOrEqual(1);
    }
    expect(model.roofPads.length > 0 || model.maxProps === 0).toBe(true);
  });

  it("stands at its full height, roughly: nothing short of the plot's top", () => {
    for (const id of METROPOLIS_ARCHETYPE_IDS) {
      const top = Math.max(...vertices(METROPOLIS_BUILDERS[id]().draft).map((v) => v[1]));
      expect(top).toBeGreaterThanOrEqual(0.99);
    }
  });
});

describe("tower-glass", () => {
  it("is mostly glass, and the glass is cooler than the wall", () => {
    // The facades between the lobby and the crown, which is what a viewer sees.
    const tris = triangles(towerGlass().draft).filter((t) => t.wall && t.c[1] > 0.1 && t.c[1] < 0.9);
    const total = tris.reduce((sum, t) => sum + t.area, 0);
    const glass = tris.filter((t) => blueness(t.color) > 0.15).reduce((sum, t) => sum + t.area, 0);
    expect(glass / total).toBeGreaterThan(0.5);
  });

  it("is slimmer than its plot: the shaft is set in from the lobby", () => {
    const shaft = vertices(towerGlass().draft).filter((v) => v[1] > 0.3 && v[1] < 0.9);
    const widest = Math.max(...shaft.map((v) => Math.abs(v[0])));
    expect(widest).toBeLessThan(0.44);
  });

  it("rakes its crown: the roof is higher on one side than the other", () => {
    const top = vertices(towerGlass().draft).filter((v) => v[1] > 0.935);
    const east = Math.max(...top.filter((v) => v[0] > 0.3).map((v) => v[1]));
    const west = Math.max(...top.filter((v) => v[0] < -0.3).map((v) => v[1]));
    expect(east - west).toBeGreaterThan(0.03);
  });
});

describe("tower-twin", () => {
  it("is two shafts with daylight between them above the podium", () => {
    const upper = triangles(towerTwin().draft).filter((t) => t.c[1] > 0.7 && t.c[1] < 0.9);
    // Nothing at the middle of the plot at that height: the gap.
    expect(upper.some((t) => Math.abs(t.c[0]) < 0.03)).toBe(false);
    expect(upper.some((t) => t.c[0] > 0.2)).toBe(true);
    expect(upper.some((t) => t.c[0] < -0.2)).toBe(true);
  });

  it("ties the pair together with a skybridge", () => {
    const middle = triangles(towerTwin().draft).filter((t) => Math.abs(t.c[0]) < 0.03);
    expect(middle.some((t) => t.c[1] > 0.5 && t.c[1] < 0.62)).toBe(true);
  });
});

describe("tower-spire", () => {
  it("steps in as it rises and ends in a spire", () => {
    const verts = vertices(towerSpire().draft);
    const widthAt = (lo: number, hi: number) =>
      Math.max(...verts.filter((v) => v[1] > lo && v[1] < hi).map((v) => Math.abs(v[0])));
    const base = widthAt(0.1, 0.45);
    const middle = widthAt(0.55, 0.7);
    const upper = widthAt(0.75, 0.83);
    expect(middle).toBeLessThan(base);
    expect(upper).toBeLessThan(middle);
    // The tip is a point above everything else, over the centre.
    const tip = verts.reduce((best, v) => (v[1] > best[1] ? v : best));
    expect(tip[1]).toBeGreaterThan(1.02);
    expect(Math.abs(tip[0])).toBeLessThan(0.01);
    expect(Math.abs(tip[2])).toBeLessThan(0.01);
  });
});

describe("glassAt", () => {
  it("pales towards the top, where the glass reflects the sky", () => {
    const low = glassAt(0);
    const high = glassAt(1);
    for (let c = 0; c < 3; c++) expect(high[c]).toBeGreaterThan(low[c]);
    expect(blueness(low)).toBeGreaterThan(0.1);
    expect(glassAt(-1)).toEqual(glassAt(0));
    expect(glassAt(2)).toEqual(glassAt(1));
  });
});
