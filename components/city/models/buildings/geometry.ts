/**
 * Drafts -> three.js geometry, built once per page and shared by every
 * instance (PLAN.md section 38).
 *
 * The archetype geometry carries vertex colours; the material multiplies them
 * by the per-instance district colour, so roofs, cornices, doors and recessed
 * windows all come out of ONE palette entry and cost no extra draw call.
 */

import { BufferGeometry, Float32BufferAttribute } from "three";
import type { ModelKey } from "./archetypes";
import { FACINGS, LAYER, addBox, addCylinder, addPanel, addQuad, emptyDraft, type MeshDraft } from "./mesh";
import { archetypeModel } from "./models";
import type { PropKind } from "./placement";
import { SURFACE } from "../../textures/surface-types";

export function toGeometry(draft: MeshDraft): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(draft.positions, 3));
  geometry.setAttribute("normal", new Float32BufferAttribute(draft.normals, 3));
  geometry.setAttribute("color", new Float32BufferAttribute(draft.colors, 3));
  if (draft.paint) geometry.setAttribute("paint", new Float32BufferAttribute(draft.paint, 1));
  if (draft.surface) geometry.setAttribute("surface", new Float32BufferAttribute(draft.surface, 1));
  geometry.setIndex(draft.indices);
  geometry.computeBoundingSphere();
  return geometry;
}

const ARCHETYPE_CACHE = new Map<ModelKey, BufferGeometry>();

export function archetypeGeometry(id: ModelKey): BufferGeometry {
  const cached = ARCHETYPE_CACHE.get(id);
  if (cached) return cached;
  const geometry = toGeometry(archetypeModel(id).draft);
  ARCHETYPE_CACHE.set(id, geometry);
  return geometry;
}

/** Triangles in one instance of an archetype: the perf budget, measurable. */
export function archetypeTriangles(id: ModelKey): number {
  return archetypeModel(id).draft.indices.length / 3;
}

// ---------------------------------------------------------------------------
// Rooftop props: two shared meshes for five kinds (PLAN.md section 63)
// ---------------------------------------------------------------------------

export type PropMesh = "block" | "tank";

export const PROP_MESH: Record<PropKind, PropMesh> = {
  ac: "block",
  vent: "block",
  skylight: "block",
  antenna: "block",
  tank: "tank",
};

let blockGeometry: BufferGeometry | null = null;
let tankGeometry: BufferGeometry | null = null;
let panelGeometry: BufferGeometry | null = null;

/**
 * A box with an inset cap. Scaled cubic it is an air-conditioning unit, flat
 * it is a skylight, thin and tall it is an antenna mast with a tip.
 */
export function propBlockGeometry(): BufferGeometry {
  if (blockGeometry) return blockGeometry;
  const draft = emptyDraft();
  draft.surfaceValue = SURFACE.metal;
  addBox(draft, { y: 0, w: 1, h: 0.84, d: 1, color: [0.82, 0.83, 0.84] });
  addBox(draft, { y: 0.84, w: 0.74, h: 0.16, d: 0.74, color: [0.95, 0.96, 0.97], skipBottom: true });
  for (const facing of FACINGS) {
    for (let row = 0; row < 4; row++) {
      addPanel(draft, { facing, u: 0, v: 0.28 + row * 0.13, w: 0.72, h: 0.035, plane: 0.5 }, [0.47, 0.5, 0.54]);
    }
  }
  // The top grille also reads as framed glazing when scaled into a skylight.
  for (const x of [-0.145, 0.145]) {
    for (const z of [-0.145, 0.145]) {
      addQuad(draft, [x - 0.125, 1 + LAYER, z + 0.125], [x + 0.125, 1 + LAYER, z + 0.125], [x + 0.125, 1 + LAYER, z - 0.125], [x - 0.125, 1 + LAYER, z - 0.125], [0.53, 0.62, 0.7], SURFACE.glass);
    }
  }
  addPanel(draft, { facing: "+z", u: 0.25, v: 0.12, w: 0.13, h: 0.06, plane: 0.5 }, [1.02, 0.9, 0.58]);
  blockGeometry = toGeometry(draft);
  return blockGeometry;
}

/** A water tank on legs, with the pipe that makes it read as plumbing. */
export function propTankGeometry(): BufferGeometry {
  if (tankGeometry) return tankGeometry;
  const draft = emptyDraft();
  draft.surfaceValue = SURFACE.metal;
  for (const [x, z] of [
    [0.25, 0.25],
    [-0.25, 0.25],
    [0.25, -0.25],
    [-0.25, -0.25],
  ]) {
    addBox(draft, { x, y: 0, z, w: 0.08, h: 0.34, d: 0.08, color: [0.62, 0.63, 0.65] });
  }
  addCylinder(draft, {
    y: 0.3,
    radius: 0.46,
    h: 0.6,
    segments: 9,
    color: [0.86, 0.85, 0.82],
    topColor: [0.7, 0.71, 0.72],
  });
  addCylinder(draft, { x: 0.3, y: 0.9, radius: 0.05, h: 0.12, segments: 5, color: [0.6, 0.61, 0.63] });
  for (const y of [0.42, 0.76]) {
    addCylinder(draft, { y, radius: 0.478, h: 0.032, segments: 9, color: [0.62, 0.63, 0.65] });
  }
  // Inspection hatch on the lid, set well inside the rolled rim.
  addCylinder(draft, { x: -0.17, y: 0.9, z: 0.03, radius: 0.105, h: 0.018, segments: 8, color: [0.64, 0.66, 0.69] });
  tankGeometry = toGeometry(draft);
  return tankGeometry;
}

/** A single quad facing +z: one lit window (PLAN.md section 19). */
export function windowPanelGeometry(): BufferGeometry {
  if (panelGeometry) return panelGeometry;
  const draft = emptyDraft();
  draft.surfaceValue = SURFACE.glass;
  addQuad(draft, [-0.5, -0.5, 0], [0.5, -0.5, 0], [0.5, 0.5, 0], [-0.5, 0.5, 0], [1, 1, 1]);
  panelGeometry = toGeometry(draft);
  return panelGeometry;
}
