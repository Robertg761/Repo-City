import { BufferGeometry, Float32BufferAttribute } from "three";
import { SURFACE } from "../../../textures/surface-types";
import { importedDraft, isModelLoaded, type ImportedModel } from "../../imported";
import { BLENDER_MODELS } from "../../modelSource";
import type { ModelKey } from "../archetypes";
import { surfaceColor, type MeshDraft, type Rgb3 } from "../mesh";
import { importedSettlementDraft } from "../kit";
import { blenderRole } from "../models";
import { MODEL as APARTMENT_NEAR } from "../apartmentLowNear.model";
import { MODEL as BARN_NEAR } from "../barnNear.model";
import { MODEL as COTTAGE_NEAR } from "../cottageNear.model";
import { MODEL as FARMHOUSE_NEAR } from "../farmhouseNear.model";
import { MODEL as HOUSE_NEAR } from "../buildingHouseNear.model";
import { MODEL as PARAPET_NEAR } from "../buildingLowriseParapetNear.model";
import { MODEL as PITCHED_NEAR } from "../buildingLowrisePitchedNear.model";
import { MODEL as WAREHOUSE_NEAR } from "../buildingWarehouseSawtoothNear.model";
import { MODEL as SHOPFRONT_NEAR } from "../shopfrontNear.model";
import { MODEL as TERRACE_NEAR } from "../terraceNear.model";

/**
 * Near levels of detail for the low-rise, residential and industrial
 * archetypes (`blender/buildings/*_near.py`, `blender/settlement/near_*.py`),
 * drawn by `LodInstances` for the few buildings closest to the camera. Each is
 * the lean model's frame, footprint and openings with frames, bars, sills,
 * lintels, doors, roof courses and rainwater goods modelled in; the lit
 * windows still come from the lean model's `windows`, which the near glazing
 * sits exactly on.
 *
 * Nothing here reads a model while the module is evaluated: the data arrives
 * with `loadModels()` (`../../imported.ts`).
 */

/** Window and door frames: painted metal, near white, as the towers' mullions. */
const FRAME: Rgb3 = surfaceColor([1.02, 1.02, 1.02], SURFACE.metal);

function nearRole(role: string): Rgb3 {
  return role === "frame" ? FRAME : blenderRole(role);
}

function toGeometry(draft: MeshDraft): BufferGeometry {
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

/** A city archetype's near draft: the lean model's roles, plus `frame`. */
function cityDraft(model: ImportedModel, node = "BuildingNear"): MeshDraft {
  return importedDraft(model, node, (mat) => ({ color: nearRole(mat.role) }));
}

/** The Blender near builders, whatever the flag says (for tests). */
export const BLENDER_NEAR_LOWRISE: Partial<Record<ModelKey, () => MeshDraft>> = {
  house: () => cityDraft(HOUSE_NEAR),
  "lowrise-parapet": () => cityDraft(PARAPET_NEAR),
  "lowrise-pitched": () => cityDraft(PITCHED_NEAR),
  "warehouse-sawtooth": () => cityDraft(WAREHOUSE_NEAR),
  cottage: () => importedSettlementDraft(COTTAGE_NEAR, "CottageThatchNear"),
  "cottage/tile": () => importedSettlementDraft(COTTAGE_NEAR, "CottageTileNear"),
  farmhouse: () => importedSettlementDraft(FARMHOUSE_NEAR, "FarmhouseNear"),
  barn: () => importedSettlementDraft(BARN_NEAR, "BarnNear"),
  shopfront: () => importedSettlementDraft(SHOPFRONT_NEAR, "ShopfrontNear"),
  "shopfront/tall": () => importedSettlementDraft(SHOPFRONT_NEAR, "ShopfrontTallNear"),
  terrace: () => importedSettlementDraft(TERRACE_NEAR, "TerraceNear"),
  "apartment-low": () => importedSettlementDraft(APARTMENT_NEAR, "ApartmentLowNear"),
  "apartment-low/retail": () => importedSettlementDraft(APARTMENT_NEAR, "ApartmentLowRetailNear"),
};

/** The near model each archetype's draft reads, to know when it has loaded. */
const NEAR_MODEL: Partial<Record<ModelKey, ImportedModel>> = {
  house: HOUSE_NEAR,
  "lowrise-parapet": PARAPET_NEAR,
  "lowrise-pitched": PITCHED_NEAR,
  "warehouse-sawtooth": WAREHOUSE_NEAR,
  cottage: COTTAGE_NEAR,
  "cottage/tile": COTTAGE_NEAR,
  farmhouse: FARMHOUSE_NEAR,
  barn: BARN_NEAR,
  shopfront: SHOPFRONT_NEAR,
  "shopfront/tall": SHOPFRONT_NEAR,
  terrace: TERRACE_NEAR,
  "apartment-low": APARTMENT_NEAR,
  "apartment-low/retail": APARTMENT_NEAR,
};

const CACHE = new Map<ModelKey, BufferGeometry>();

/** Built once per model per page, then shared by every instance of it. */
function cached(id: ModelKey, draft: () => MeshDraft): BufferGeometry {
  let geometry = CACHE.get(id);
  if (!geometry) {
    geometry = toGeometry(draft());
    CACHE.set(id, geometry);
  }
  return geometry;
}

/** What the city draws: null without the Blender models or before the near model has loaded, and the lean model alone. */
export const NEAR_LOWRISE: Partial<Record<ModelKey, () => BufferGeometry | null>> = Object.fromEntries(
  Object.entries(BLENDER_NEAR_LOWRISE).map(([id, draft]) => [
    id,
    () => (BLENDER_MODELS && isModelLoaded(NEAR_MODEL[id as ModelKey] as ImportedModel) ? cached(id as ModelKey, draft) : null),
  ]),
);
