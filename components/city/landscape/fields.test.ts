import { describe, expect, it } from "vitest";
import {
  EDGE_CUT,
  EDGE_FAR,
  clipHalfPlane,
  convexDistance,
  insetPolygon,
  insidePoly,
  polyArea,
  scatterSeeds,
  voronoiCells,
} from "./fields";

const square = [
  { x: -10, z: -10 },
  { x: 10, z: -10 },
  { x: 10, z: 10 },
  { x: -10, z: 10 },
];

describe("clipping", () => {
  it("keeps the side asked for, labels the new edge, and keeps the rest", () => {
    const r = clipHalfPlane(square, [1, 2, 3, 4], 1, 0, 0, EDGE_CUT);
    expect(polyArea(r.pts)).toBeCloseTo(200, 6);
    expect(r.edge).toContain(EDGE_CUT);
    expect(r.pts.length).toBe(4);
    for (const p of r.pts) expect(p.x).toBeLessThanOrEqual(1e-9);
  });

  it("a half-plane that holds everything changes nothing, and one that holds nothing empties it", () => {
    expect(clipHalfPlane(square, [0, 0, 0, 0], 1, 0, 100, EDGE_CUT).pts).toHaveLength(4);
    expect(clipHalfPlane(square, [0, 0, 0, 0], 1, 0, -100, EDGE_CUT).pts).toHaveLength(0);
  });

  it("insets a polygon and measures distance to it", () => {
    const inner = insetPolygon(square, [0, 0, 0, 0], 2);
    expect(polyArea(inner.pts)).toBeCloseTo(256, 6);
    expect(convexDistance(square, 0, 0)).toBeCloseTo(-10, 6);
    expect(convexDistance(square, 13, 0)).toBeCloseTo(3, 6);
    expect(insidePoly(square, 5, 5)).toBe(true);
    expect(insidePoly(square, 11, 0)).toBe(false);
  });
});

describe("scattered seeds and their cells", () => {
  const seeds = scatterSeeds(300, 40, 7, (x) => 0.7 + (Math.abs(x) > 100 ? 0.9 : 0), () => true);
  const cells = voronoiCells(seeds);

  it("are spaced by their radii, and larger where the scale is", () => {
    expect(seeds.length).toBeGreaterThan(40);
    for (let i = 0; i < seeds.length; i++) {
      for (let j = i + 1; j < seeds.length; j++) {
        expect(Math.hypot(seeds[i].x - seeds[j].x, seeds[i].z - seeds[j].z)).toBeGreaterThan((seeds[i].r + seeds[j].r) * 0.97);
      }
    }
    const near = seeds.filter((s) => Math.abs(s.x) <= 100).length / 200;
    const far = seeds.filter((s) => Math.abs(s.x) > 100).length / 400;
    expect(near).toBeGreaterThan(far);
  });

  it("make the same seeds every time", () => {
    const again = scatterSeeds(300, 40, 7, (x) => 0.7 + (Math.abs(x) > 100 ? 0.9 : 0), () => true);
    expect(again).toEqual(seeds);
  });

  it("are convex cells that contain their seeds, labelled by their neighbours", () => {
    expect(cells.length).toBe(seeds.length);
    for (const c of cells) {
      expect(c.pts.length).toBeGreaterThanOrEqual(3);
      expect(c.edge).toHaveLength(c.pts.length);
      expect(insidePoly(c.pts, c.seed.x, c.seed.z)).toBe(true);
      for (const e of c.edge) expect(e === EDGE_FAR || (e >= 0 && e < seeds.length)).toBe(true);
    }
    // An edge shared with a neighbour is the neighbour's too.
    let shared = 0;
    for (const c of cells) {
      c.edge.forEach((e) => {
        if (e >= 0 && cells[e]?.edge.includes(c.id)) shared++;
      });
    }
    expect(shared).toBeGreaterThan(cells.length);
  });
});
