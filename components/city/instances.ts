/**
 * Instancing bookkeeping for the building layer (PLAN.md sections 37, 38).
 *
 * Buildings render as one `InstancedMesh` per visual tier. The pointer handler
 * reads `event.instanceId` and maps it back to an entity id through the `ids`
 * array built here, which is kept in exactly the same order as the instance
 * matrices. Pure, no three.js: unit tested.
 */

import type { BuildingTier } from "@/types/analysis";
import type { Building } from "@/types/city";

export const TIERS: readonly BuildingTier[] = [1, 2, 3, 4, 5];

/** Landmark files become hand-built civic meshes, not instances (section 10). */
export function isCivic(building: Building): boolean {
  return building.plan.landmark !== null;
}

export interface BuildingSplit {
  instanced: Building[];
  civic: Building[];
}

export function splitBuildings(buildings: readonly Building[]): BuildingSplit {
  const instanced: Building[] = [];
  const civic: Building[] = [];
  for (const b of buildings) (isCivic(b) ? civic : instanced).push(b);
  return { instanced, civic };
}

export interface TierGroup {
  tier: BuildingTier;
  buildings: Building[];
  /** `ids[instanceId]` is the entity id of that instance. */
  ids: string[];
}

/** One group per tier, in tier order. Empty tiers are dropped. */
export function groupByTier(buildings: readonly Building[]): TierGroup[] {
  const byTier = new Map<BuildingTier, Building[]>();
  for (const b of buildings) {
    const tier: BuildingTier = TIERS.includes(b.tier) ? b.tier : 1;
    const list = byTier.get(tier);
    if (list) list.push(b);
    else byTier.set(tier, [b]);
  }
  const groups: TierGroup[] = [];
  for (const tier of TIERS) {
    const list = byTier.get(tier);
    if (!list || list.length === 0) continue;
    groups.push({ tier, buildings: list, ids: list.map((b) => b.id) });
  }
  return groups;
}

export interface WindowBand {
  /** Index into the owning building list. */
  buildingIndex: number;
  /** Band centre height as a fraction of the building height. */
  fraction: number;
  /** Band thickness in world units. */
  thickness: number;
}

/**
 * Lit window stripes: one thin emissive band per storey band, as a second
 * instanced mesh. Cheap, reads from the default camera, and invisible from
 * directly overhead, which is what a texture on a box cannot manage.
 *
 * `share` below 1 leaves some of them unlit: an archived repository's city
 * keeps its shape but loses most of its lit windows (PLAN.md section 19).
 */
export function windowBands(
  buildings: readonly Building[],
  cap = 600,
  /** Share of bands to keep, 0..1. Dropped deterministically, never randomly. */
  share = 1,
): WindowBand[] {
  const bands: WindowBand[] = [];
  const keep = share >= 1 ? 100 : Math.round(Math.max(0, share) * 100);
  for (let i = 0; i < buildings.length && bands.length < cap; i++) {
    const height = buildings[i].size[1];
    const count = Math.max(0, Math.min(3, Math.floor(height / 2.6)));
    for (let k = 0; k < count && bands.length < cap; k++) {
      // A cheap stable hash of the band's address: the same city always goes
      // dark in the same windows (PLAN.md section 35).
      if ((i * 37 + k * 53 + ((i * i) % 11)) % 100 >= keep) continue;
      bands.push({
        buildingIndex: i,
        fraction: (k + 1) / (count + 1),
        thickness: Math.min(0.34, height * 0.06),
      });
    }
  }
  return bands;
}
