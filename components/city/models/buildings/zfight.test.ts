import { describe, expect, it } from "vitest";
import { coplanarOverlaps } from "../coplanar";
import { MODEL_KEYS } from "./archetypes";
import { addPanel, emptyDraft, LAYER, type MeshDraft } from "./mesh";
import { archetypeModel } from "./models";
import { LIT_INSET, LIT_LIFT } from "./placement";

/**
 * Z-fighting (the owner's "texture glitches with chimneys and some walls"):
 * two faces of one model facing the same way, overlapping, and closer than a
 * layer apart flicker through each other as the camera moves. Every stacked
 * detail -- window on wall, glass in frame, door on surround, stack by gable,
 * cornice under eave -- stands at least a layer off whatever it overlaps.
 *
 * Faces of one colour and paint channel may share a plane (two windows in one
 * band, the mullions of a curtain wall): a fight between identical faces
 * cannot be seen. Faces buried inside the model are not checked either.
 */

/** A little under a layer, so a detail exactly one layer out passes. */
const WITHIN = LAYER * 0.9;

function paintOf(draft: MeshDraft, triangle: number): string {
  const v = draft.indices[triangle * 3];
  const rgb = draft.colors.slice(v * 3, v * 3 + 3).map((c) => c.toFixed(3));
  return `${rgb.join("/")}:${draft.paint?.[v] ?? "-"}`;
}

function describePair(draft: MeshDraft, a: number, b: number, at: readonly number[], separation: number): string {
  return `${paintOf(draft, a)} vs ${paintOf(draft, b)} ${separation.toFixed(4)} apart at ${at.map((x) => x.toFixed(3)).join(",")}`;
}

function visibleFights(draft: MeshDraft): string[] {
  return coplanarOverlaps(draft.positions, draft.indices, { within: WITHIN, minOverlap: 1e-6, buriedWithin: 0.03 })
    .filter((p) => paintOf(draft, p.a) !== paintOf(draft, p.b))
    // The underside of whatever stands on the ground is never seen.
    .filter((p) => !(p.normal[1] < -0.99 && Math.abs(p.at[1]) < 1e-4))
    .map((p) => describePair(draft, p.a, p.b, p.at, p.separation));
}

/** The model with its lit panes merged in, in a colour nothing else uses. */
function withLitPanes(id: (typeof MODEL_KEYS)[number]): MeshDraft {
  const model = archetypeModel(id);
  const draft = emptyDraft();
  draft.positions = [...model.draft.positions];
  draft.normals = [...model.draft.normals];
  draft.colors = [...model.draft.colors];
  draft.indices = [...model.draft.indices];
  if (model.draft.paint) {
    draft.paint = [...model.draft.paint];
    draft.paintValue = 9;
  }
  for (const panel of model.windows) {
    addPanel(
      draft,
      { ...panel, plane: panel.plane + LIT_LIFT, w: panel.w * LIT_INSET, h: panel.h * LIT_INSET },
      [9, 9, 9],
    );
  }
  return draft;
}

describe("no two faces of a building flicker through each other", () => {
  for (const id of MODEL_KEYS) {
    it(`${id}`, () => {
      expect(visibleFights(archetypeModel(id).draft)).toEqual([]);
    });

    it(`${id}, lit`, () => {
      expect(visibleFights(withLitPanes(id))).toEqual([]);
    });
  }
});

describe("the check itself", () => {
  it("finds a door laid in the plane of its surround, and passes it a layer out", () => {
    const flush = emptyDraft();
    addPanel(flush, { facing: "+z", u: 0, v: 0.3, w: 0.2, h: 0.3, plane: 0.5 }, [1, 1, 1]);
    addPanel(flush, { facing: "+z", u: 0, v: 0.3, w: 0.1, h: 0.2, plane: 0.5 }, [0.4, 0.3, 0.3]);
    expect(visibleFights(flush).length).toBeGreaterThan(0);

    const layered = emptyDraft();
    addPanel(layered, { facing: "+z", u: 0, v: 0.3, w: 0.2, h: 0.3, plane: 0.5 }, [1, 1, 1]);
    addPanel(layered, { facing: "+z", u: 0, v: 0.3, w: 0.1, h: 0.2, plane: 0.5 + LAYER }, [0.4, 0.3, 0.3]);
    expect(visibleFights(layered)).toEqual([]);
  });

  it("finds a chimney a hair proud of its gable", () => {
    const draft = emptyDraft();
    // The gable wall, facing +x, and a stack's face 0.005 in front of it.
    addPanel(draft, { facing: "+x", u: 0, v: 0.7, w: 0.6, h: 0.3, plane: 0.33 }, [1, 1, 1]);
    addPanel(draft, { facing: "+x", u: 0, v: 0.8, w: 0.13, h: 0.3, plane: 0.335 }, [0.5, 0.45, 0.37]);
    expect(visibleFights(draft).length).toBeGreaterThan(0);
  });
});
