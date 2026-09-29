import type { BufferGeometry } from "three";
import type { ModelKey } from "../archetypes";
import { MODEL as MIDRISE_MECH_NEAR } from "../buildingMidriseMechNear.model";
import { MODEL as MIDRISE_SETBACK_NEAR } from "../buildingMidriseSetbackNear.model";
import { MODEL as TOWER_CROWN_NEAR } from "../buildingTowerCrownNear.model";
import { MODEL as TOWER_GLASS_NEAR } from "../buildingTowerGlassNear.model";
import { MODEL as TOWER_SPIRE_NEAR } from "../buildingTowerSpireNear.model";
import { MODEL as TOWER_STEPPED_NEAR } from "../buildingTowerSteppedNear.model";
import { MODEL as TOWER_TWIN_NEAR } from "../buildingTowerTwinNear.model";
import { toGeometry } from "../geometry";
import { towerRole } from "../metropolis";
import { blenderRole } from "../models";
import { importedDraft, isModelLoaded, type ImportedModel } from "../../imported";
import { BLENDER_MODELS } from "../../modelSource";
import type { Rgb3 } from "../mesh";

const CACHE = new Map<ModelKey, BufferGeometry>();

/**
 * The near level of an archetype from its Blender model (`blender/buildings/
 * near.py`, node `Building`): the lean model's script run again with a
 * detailer, so it stands on the lean footprint and holds its glazing in the
 * lean model's window rectangles. Painted with the lean model's own role
 * multipliers, built once per page, and null when the Blender models are off
 * (the procedural buildings have no near level) or the near model has not
 * loaded yet.
 */
function near(id: ModelKey, model: ImportedModel, roles: (role: string) => Rgb3): () => BufferGeometry | null {
  return () => {
    if (!BLENDER_MODELS || !isModelLoaded(model)) return null;
    let geometry = CACHE.get(id);
    if (!geometry) {
      geometry = toGeometry(importedDraft(model, "Building", (mat) => ({ color: roles(mat.role) })));
      CACHE.set(id, geometry);
    }
    return geometry;
  };
}

/** Near levels of detail for the towers archetypes; see `archetypeNearGeometry`. */
export const NEAR_TOWERS: Partial<Record<ModelKey, () => BufferGeometry | null>> = {
  "tower-crown": near("tower-crown", TOWER_CROWN_NEAR, blenderRole),
  "tower-stepped": near("tower-stepped", TOWER_STEPPED_NEAR, blenderRole),
  "midrise-mech": near("midrise-mech", MIDRISE_MECH_NEAR, blenderRole),
  "midrise-setback": near("midrise-setback", MIDRISE_SETBACK_NEAR, blenderRole),
  "tower-glass": near("tower-glass", TOWER_GLASS_NEAR, towerRole),
  "tower-twin": near("tower-twin", TOWER_TWIN_NEAR, towerRole),
  "tower-spire": near("tower-spire", TOWER_SPIRE_NEAR, towerRole),
};
