import { describe, expect, it } from "vitest";
import { narrowLedges } from "../ledges";
import { MODEL_KEYS } from "./archetypes";
import { addBox, emptyDraft, LAYER, type MeshDraft } from "./mesh";
import { archetypeModel } from "./models";

/**
 * Slivers (the dashed light line along the cornice of the metropolis towers):
 * a strip of flat surface left showing at the foot of a wall, a hair wide. A
 * parapet a hair inside its cornice leaves one, and so does a roof deck a hair
 * short of its parapet or a door a hair behind the plinth it stands on. Lit
 * from above beside walls that are not, the strip reads as a bright line, and
 * a line that thin rasterizes as dashes that crawl as the camera moves.
 *
 * The rule: a wall stands flush with the edge of what it stands on, or at
 * least two layers back from it. Two layers is the smallest step a model
 * shows on purpose (the plinth proud of a tower's lobby); one would be a
 * sliver again from the overview.
 *
 * Every model is held to it: the city's eight shapes, the metropolis towers,
 * and the village's and the town's, variants included. The landmarks, props
 * and fields of the village and the town are held to it in `../ledges.test.ts`
 * and `farmland.test.ts`.
 */

/** A little under two layers, so a ledge exactly two layers deep passes. */
const NARROWEST = LAYER * 1.9;

/**
 * A lip lower than a layer: a wall that comes up through a surface and stops
 * a hair above it. Heights stretch four times as far as widths on a tower, so
 * one layer is already a clear step there. A little under one, so a step
 * exactly a layer high (a door's step on its plinth) passes whatever the
 * rounding.
 */
const LOWEST = LAYER * 0.95;

function slivers(draft: MeshDraft): string[] {
  return narrowLedges(draft.positions, draft.indices, { narrowerThan: NARROWEST, lowerThan: LOWEST }).map(
    (ledge) =>
      `${ledge.height > 0 ? `lip ${ledge.height.toFixed(4)} high` : `${ledge.width.toFixed(4)} wide`} at ${ledge.at
        .map((c) => c.toFixed(3))
        .join(",")}, facing ${ledge.normal.map((c) => c.toFixed(0)).join(",")}`,
  );
}

describe("no building leaves a sliver of ledge showing", () => {
  for (const id of MODEL_KEYS) {
    it(`${id}`, () => {
      expect(slivers(archetypeModel(id).draft)).toEqual([]);
    });
  }
});

describe("the check itself", () => {
  const TRIM = [1.06, 1.06, 1.05] as const;

  /** A cornice with four parapet walls on it, the parapet `inset` inside. */
  function roof(inset: number): MeshDraft {
    const draft = emptyDraft();
    addBox(draft, { y: 0, w: 1, h: 0.5, d: 1, color: [1, 1, 1] });
    addBox(draft, { y: 0.5, w: 1.04, h: 0.02, d: 1.04, color: TRIM, skipBottom: true });
    const w = 1.04 - inset * 2;
    const t = 0.03;
    const hw = w / 2 - t / 2;
    addBox(draft, { y: 0.52, z: hw, w, h: 0.03, d: t, color: TRIM, skipBottom: true });
    addBox(draft, { y: 0.52, z: -hw, w, h: 0.03, d: t, color: TRIM, skipBottom: true });
    addBox(draft, { y: 0.52, x: hw, w: t, h: 0.03, d: w - t * 2, color: TRIM, skipBottom: true });
    addBox(draft, { y: 0.52, x: -hw, w: t, h: 0.03, d: w - t * 2, color: TRIM, skipBottom: true });
    return draft;
  }

  it("finds a parapet a hair inside its cornice, on every side", () => {
    const draft = roof(0.005);
    const found = narrowLedges(draft.positions, draft.indices, { narrowerThan: NARROWEST });
    expect(found.length).toBeGreaterThanOrEqual(4);
    for (const ledge of found) expect(ledge.width).toBeCloseTo(0.005, 4);
  });

  it("passes a parapet flush with its cornice, and one set well back", () => {
    expect(slivers(roof(0))).toEqual([]);
    expect(slivers(roof(0.03))).toEqual([]);
  });

  it("finds a deck stopped a hair short of the parapet round it", () => {
    const draft = roof(0);
    // The parapet's inner faces stand at 0.52 - 0.03 = 0.49.
    addBox(draft, { y: 0.52, w: 0.97, h: 0.01, d: 0.97, color: [0.6, 0.62, 0.66], skipBottom: true });
    const found = narrowLedges(draft.positions, draft.indices, { narrowerThan: NARROWEST });
    expect(found.length).toBeGreaterThan(0);
    for (const ledge of found) expect(ledge.width).toBeCloseTo(0.005, 4);

    const snug = roof(0);
    addBox(snug, { y: 0.52, w: 0.98, h: 0.01, d: 0.98, color: [0.6, 0.62, 0.66], skipBottom: true });
    expect(slivers(snug)).toEqual([]);
  });

  it("measures in world units once the model is stretched", () => {
    const draft = roof(0.005);
    const [ledge] = narrowLedges(draft.positions, draft.indices, { narrowerThan: 1, scale: [8, 30, 8] });
    expect(ledge.width).toBeCloseTo(0.04, 3);
  });
});
