/**
 * WORLD layer types (PLAN.md section 71.3). Browser only.
 *
 * `lib/city/generator.ts` turns a `RepoAnalysis` into a `CityModel`; the
 * renderer consumes nothing else. Generation is deterministic for a given
 * `seed` (PLAN.md section 35).
 *
 * Binding contract: field names may be added, never renamed.
 *
 * WORLD CONVENTIONS. The generator and the renderer agree on exactly these:
 *
 *   - +y is up, the ground plane is y = 0, and the city is a square centred on
 *     the origin whose side is `bounds.size` (about 112 units for a ten-file
 *     repository, about 230 for a three-hundred-building one).
 *   - A building's `position` is the CENTRE OF ITS BASE and `size` is
 *     `[width, height, depth]`: footprints run 3.4 to 8 units, heights 3 to 18.
 *   - Roads are centrelines: `from`/`to` with a full carriageway `width`,
 *     4.5 units for a minor road and 7 for a major one.
 *   - `District.rect` uses `x`/`z` as the rect CENTRE with `w`/`d` as the full
 *     extents, so the region covers `[x - w/2, x + w/2]` on x.
 *   - Landmarks and construction sites carry a reserved plot in `size`; the
 *     renderer scales its hand-built assembly to fit that plot, which is what
 *     keeps a power station out of the buildings around it.
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
  /**
   * Reserved plot, `[width, height, depth]`, cleared of buildings and roads by
   * the generator. The renderer scales its fenced site and crane to fit it.
   */
  size?: Vec3;
  districtId?: string;
}

export type LandmarkType = "power" | "fire" | "info" | "station" | "civic";

export interface Landmark extends CityEntity {
  kind: "landmark";
  landmarkType: LandmarkType;
  level: 0 | 1 | 2 | 3;
  /**
   * For `power` this is exactly `RepoMetrics["ci"]["state"]`; the other kinds
   * carry their own vocabulary (`strength-2`, `occasional`, a health band).
   */
  state: string;
  /**
   * Reserved plot in the landmark's OWN frame (after `rotationY`):
   * `[width, height, depth]`. The renderer draws its assembly at a natural
   * size and scales it uniformly to fit. Absent means "draw at natural size".
   */
  size?: Vec3;
  districtId?: string;
}

export interface District {
  id: string;
  name: string;
  sourcePath: string;
  purpose: string | null;
  /** `x`/`z` are the rect CENTRE; `w`/`d` are the full extents. */
  rect: { x: number; z: number; w: number; d: number };
  colorIndex: number;
  buildingIds: string[];
  /** Inspector copy, the same three fields every other entity carries. */
  description: string;
  reason: string;
  sourceUrl: string | null;
  /** Reveal delay in milliseconds (PLAN.md section 43). */
  appearAt: number;
}

export interface RoadSegment {
  id: string;
  from: Vec3;
  to: Vec3;
  width: number;
  major: boolean;
  /** Reveal delay in milliseconds; a road draws itself in from `from`. */
  appearAt: number;
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
