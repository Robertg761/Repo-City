import type { SettlementTier } from "@/types/analysis";
import type { District } from "@/types/city";
import type { SurfaceKind } from "./textures/texture-data";

/** The paving remains the same size across differently sized district plots. */
export const DISTRICT_SURFACE_TILE = 4.8;

export function districtSurfaceKind(tier: SettlementTier | undefined): SurfaceKind {
  return tier === "town" ? "setts" : tier === "village" ? "lawn" : "concrete";
}

/** PlaneGeometry order, after its -PI/2 rotation: northwest, northeast, southwest, southeast. */
export function districtSurfaceUvs(rect: District["rect"]): Float32Array {
  const x0 = (rect.x - rect.w / 2) / DISTRICT_SURFACE_TILE;
  const x1 = (rect.x + rect.w / 2) / DISTRICT_SURFACE_TILE;
  const z0 = (rect.z - rect.d / 2) / DISTRICT_SURFACE_TILE;
  const z1 = (rect.z + rect.d / 2) / DISTRICT_SURFACE_TILE;
  return Float32Array.from([x0, z0, x1, z0, x0, z1, x1, z1]);
}
