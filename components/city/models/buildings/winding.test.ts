import { describe, expect, it } from "vitest";
import { addBox, addCylinder, addGable, addSawtooth, emptyDraft, type MeshDraft } from "./mesh";

/**
 * Every face of a solid primitive faces out of it. A face wound the wrong
 * way is culled from outside and drawn from inside, so the camera sees
 * through the near side of the solid into its far wall: the hollow, see-
 * through chimney pots and water tanks the cylinder used to make.
 */
function inwardFaces(draft: MeshDraft, centre: readonly [number, number, number]): number {
  const p = draft.positions;
  let inward = 0;
  for (let t = 0; t < draft.indices.length; t += 3) {
    const [a, b, c] = [draft.indices[t], draft.indices[t + 1], draft.indices[t + 2]].map((i) => [
      p[i * 3],
      p[i * 3 + 1],
      p[i * 3 + 2],
    ]);
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    if (Math.hypot(n[0], n[1], n[2]) < 1e-12) continue;
    const mid = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
    const out = [mid[0] - centre[0], mid[1] - centre[1], mid[2] - centre[2]];
    if (n[0] * out[0] + n[1] * out[1] + n[2] * out[2] <= 0) inward++;
  }
  return inward;
}

describe("the primitives face out", () => {
  it("a box", () => {
    const draft = emptyDraft();
    addBox(draft, { x: 0.1, y: 0, z: -0.2, w: 0.4, h: 0.6, d: 0.3, color: [1, 1, 1] });
    expect(inwardFaces(draft, [0.1, 0.3, -0.2])).toBe(0);
  });

  it("a cylinder, walls and cap", () => {
    const draft = emptyDraft();
    addCylinder(draft, { x: 0.2, y: 0.5, z: 0.1, radius: 0.05, h: 0.1, segments: 5, color: [1, 1, 1] });
    expect(inwardFaces(draft, [0.2, 0.55, 0.1])).toBe(0);
  });

  it("a gable, either way round", () => {
    for (const ridge of ["x", "z"] as const) {
      const draft = emptyDraft();
      addGable(draft, { y: 0.6, w: 1, h: 0.3, d: 0.8, color: [1, 1, 1], ridge });
      expect(inwardFaces(draft, [0, 0.7, 0])).toBe(0);
    }
  });

  it("a sawtooth's deck and ends", () => {
    const draft = emptyDraft();
    addSawtooth(draft, { x: 0, y: 0.6, w: 0.2, rise: 0.1, d: 0.9, color: [1, 1, 1], glassColor: [0.5, 0.5, 0.5] });
    // The glazed face is drawn both ways round on purpose; the rest face out.
    expect(inwardFaces(draft, [-0.02, 0.63, 0])).toBe(2);
  });
});
