/**
 * WORLD layer types (PLAN.md section 71.3). Browser only.
 *
 * `lib/city/generator.ts` turns a `RepoAnalysis` into a `CityModel`; the
 * renderer consumes nothing else. Generation is deterministic for a given
 * `seed` (PLAN.md section 35).
 *
 * Binding contract: field names may be added, never renamed.
 */

import type {
  BuildingPlan,
  BuildingTier,
  ConstructionState,
  IncidentState,
  RankedIssue,
  RankedPull,
  RepoMetrics,
} from "./analysis";

export type Vec3 = [number, number, number];

export type EntityKind = "building" | "district" | "incident" | "construction" | "landmark";

export interface CityEntity {
  id: string;
  kind: EntityKind;
  position: Vec3;
  rotationY: number;
  title: string;
  subtitle: string;
  description: string;
  reason: string;
  sourceUrl: string | null;
  visualState: string;
  /** Reveal delay in milliseconds, used by the generation animation. */
  appearAt: number;
}

export interface Building extends CityEntity {
  kind: "building";
  districtId: string;
  size: Vec3;
  tier: BuildingTier;
  colorIndex: number;
  plan: BuildingPlan;
}

export interface Incident extends CityEntity {
  kind: "incident";
  state: IncidentState;
  issue: RankedIssue;
  /** District the incident sits next to, when placement was path-related. */
  districtId?: string;
}

export interface ConstructionSite extends CityEntity {
  kind: "construction";
  state: ConstructionState;
  pull: RankedPull;
  districtId?: string;
}

export type LandmarkType = "power" | "fire" | "info" | "station" | "civic";

export interface Landmark extends CityEntity {
  kind: "landmark";
  landmarkType: LandmarkType;
  level: 0 | 1 | 2 | 3;
  state: string;
  /** Footprint and height hint; renderer falls back to 4 x 4 (station 5 x 3). */
  size?: Vec3;
  districtId?: string;
}

export interface District {
  id: string;
  name: string;
  sourcePath: string;
  purpose: string | null;
  rect: { x: number; z: number; w: number; d: number };
  colorIndex: number;
  buildingIds: string[];
}

export interface RoadSegment {
  id: string;
  from: Vec3;
  to: Vec3;
  width: number;
  major: boolean;
}

export interface CityModel {
  repository: { fullName: string; url: string; archived: boolean };
  health: RepoMetrics["health"];
  confidence: RepoMetrics["confidence"];
  activity: RepoMetrics["activity"];
  ambience: {
    warmth: number;
    saturation: number;
    fog: number;
    trafficDensity: number;
    pedestrianDensity: number;
    litWindowShare: number;
  };
  bounds: { size: number };
  districts: District[];
  buildings: Building[];
  roads: RoadSegment[];
  landmarks: Landmark[];
  incidents: Incident[];
  constructionSites: ConstructionSite[];
  props: { trees: Vec3[]; lamps: Vec3[] };
  vehicles: { count: number };
  seed: string;
}

/** Every selectable thing in the world. Keyed by `CityEntity["id"]`. */
export type SelectableEntity = Building | Incident | ConstructionSite | Landmark;
