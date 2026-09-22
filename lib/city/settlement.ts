/**
 * Per-settlement layout and scale (PLAN.md section 76.5).
 *
 * One table, `SETTLEMENT_PARAMS`, holds every number that differs between a
 * village, a town, a city and a metropolis. The server (building budgets and
 * tier shares), the layout, the generator and the renderer read their
 * constants from here, so a tuning pass touches one file.
 *
 * The city row is exactly today's constants, spread across `layout.ts`,
 * `generator.ts`, `fileSelection.ts`, `metrics.ts` and `traffic.ts`;
 * `settlement.test.ts` fails if either side drifts. That equality is what
 * keeps a city-tier repository byte-identical to the city before settlements.
 *
 * S0 only declares the table. Nothing reads the village, town or metropolis
 * rows yet: S3 (layout), S4 (population) and the renderer agents wire them in.
 */

import type { BuildingTier, SettlementTier } from "@/types/analysis";
import type { RoadKind } from "@/types/city";

export interface RoadClass {
  width: number;
  kind: RoadKind;
}

export interface SettlementParams {
  /** Village lanes come from `lib/city/village.ts`; everything else is the grid. */
  layout: "organic" | "grid";
  /** Server `selectBuildings` budget: `min` is the keep-the-finer-level floor. */
  buildings: { min: number; max: number };
  /** Visual height per building tier, before the seeded +/-15% jitter. */
  tierHeight: Record<BuildingTier, number>;
  /** Share of the buildings in each tier (server `tierForRank`). */
  tierShares: Record<BuildingTier, number>;
  footprint: { min: number; max: number };
  /**
   * `major` is the arterial (village main street, metropolis avenue); `minor`
   * the block street (village lane).
   */
  roads: { major: RoadClass; minor: RoadClass };
  /** Target block side; null in the village, which has no blocks. */
  blockSide: number | null;
  /** Building slot pitch (lane pitch in the village). */
  slotPitch: number;
  /** `clamp(base + perRootBuilding * sqrt(n), min, max)`; null in the village. */
  districtSide: { base: number; perRootBuilding: number; min: number; max: number } | null;
  /** Depth of the landmark band; null in the village (plots along the main street). */
  landmarkBand: { min: number; max: number } | null;
  /** Ring road; null in the village, which loops a lane round its green instead. */
  ring: RoadClass | null;
  /** Fork highways (or, in the village, the main street's ways out). */
  highways: { min: number; max: number };
  /** Target band for `bounds.size` for typical repositories (S3 enforces it). */
  bounds: { min: number; max: number };
  /** Hero incidents and hero construction sites; everything else is crowd. */
  heroes: { incidents: number; sites: number };
  /** Moving vehicles, and whether tractors may be among them. */
  vehicles: { max: number; tractors: boolean };
  trees: number;
  lamps: number;
}

export const SETTLEMENT_PARAMS: Record<SettlementTier, SettlementParams> = {
  village: {
    layout: "organic",
    buildings: { min: 6, max: 40 },
    tierHeight: { 1: 3.4, 2: 4.2, 3: 5.2, 4: 6.4, 5: 7.6 },
    tierShares: { 5: 0.02, 4: 0.05, 3: 0.13, 2: 0.3, 1: 0.5 },
    footprint: { min: 3, max: 5.2 },
    roads: { major: { width: 5, kind: "street" }, minor: { width: 3.6, kind: "lane" } },
    blockSide: null,
    slotPitch: 7,
    districtSide: null,
    landmarkBand: null,
    ring: null,
    highways: { min: 0, max: 2 },
    bounds: { min: 80, max: 125 },
    heroes: { incidents: 6, sites: 3 },
    vehicles: { max: 10, tractors: true },
    trees: 160,
    lamps: 30,
  },
  town: {
    layout: "grid",
    buildings: { min: 30, max: 120 },
    tierHeight: { 1: 3.8, 2: 5.4, 3: 7.6, 4: 10.5, 5: 14 },
    tierShares: { 5: 0.03, 4: 0.08, 3: 0.14, 2: 0.3, 1: 0.45 },
    footprint: { min: 3.6, max: 7 },
    roads: { major: { width: 6, kind: "street" }, minor: { width: 4.2, kind: "street" } },
    blockSide: 19,
    slotPitch: 6.6,
    districtSide: { base: 36, perRootBuilding: 6.6, min: 70, max: 125 },
    landmarkBand: { min: 10, max: 14 },
    ring: { width: 6, kind: "street" },
    highways: { min: 0, max: 2 },
    bounds: { min: 115, max: 165 },
    heroes: { incidents: 9, sites: 5 },
    vehicles: { max: 24, tractors: false },
    trees: 100,
    lamps: 90,
  },
  // Today's city, constant for constant. See the file comment.
  city: {
    layout: "grid",
    buildings: { min: 75, max: 300 },
    tierHeight: { 1: 4.2, 2: 7, 3: 11, 4: 16, 5: 23 },
    tierShares: { 5: 0.05, 4: 0.1, 3: 0.15, 2: 0.25, 1: 0.45 },
    footprint: { min: 4, max: 8.5 },
    roads: { major: { width: 7, kind: "street" }, minor: { width: 4.5, kind: "street" } },
    blockSide: 22,
    slotPitch: 7.2,
    // PLAN.md 76.5 lists "clamped 115 to 175" as the city's future band; today's
    // `districtSquareSide` clamps 56 to 170, and the city row must equal today.
    districtSide: { base: 40, perRootBuilding: 7.2, min: 56, max: 170 },
    landmarkBand: { min: 12, max: 20 },
    ring: { width: 7, kind: "street" },
    highways: { min: 0, max: 4 },
    bounds: { min: 170, max: 230 },
    heroes: { incidents: 12, sites: 8 },
    vehicles: { max: 40, tractors: false },
    trees: 100,
    lamps: 120,
  },
  metropolis: {
    layout: "grid",
    buildings: { min: 300, max: 450 },
    tierHeight: { 1: 5, 2: 8.5, 3: 14, 4: 22, 5: 34 },
    tierShares: { 5: 0.08, 4: 0.14, 3: 0.2, 2: 0.26, 1: 0.32 },
    footprint: { min: 4.5, max: 10 },
    roads: { major: { width: 9.5, kind: "avenue" }, minor: { width: 5.5, kind: "street" } },
    blockSide: 27,
    slotPitch: 8.6,
    districtSide: { base: 48, perRootBuilding: 8.8, min: 215, max: 270 },
    landmarkBand: { min: 20, max: 26 },
    ring: { width: 10, kind: "highway" },
    highways: { min: 2, max: 4 },
    bounds: { min: 285, max: 320 },
    heroes: { incidents: 16, sites: 10 },
    vehicles: { max: 64, tractors: false },
    trees: 120,
    lamps: 160,
  },
};

/** The tier a model without a settlement renders as: today's city. */
export const DEFAULT_SETTLEMENT_TIER: SettlementTier = "city";

/**
 * The HUD name (PLAN.md 76.1 decision 9). It uses the repository name, never
 * the owner: "Village of p-limit", "Town of zustand", "City of hono",
 * "Greater react".
 */
export function settlementName(tier: SettlementTier, repoName: string): string {
  switch (tier) {
    case "village":
      return `Village of ${repoName}`;
    case "town":
      return `Town of ${repoName}`;
    case "city":
      return `City of ${repoName}`;
    case "metropolis":
      return `Greater ${repoName}`;
  }
}
