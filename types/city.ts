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
 *     the origin whose side is `bounds.size` (about 108 units for a ten-file
 *     repository, about 230 for a three-hundred-building one).
 *   - A building's `position` is the CENTRE OF ITS BASE and `size` is
 *     `[width, height, depth]`: footprints run 3.4 to 8.5 units, heights 4.2 to 23.
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
  IncidentForm,
  IncidentState,
  RankedIssue,
  RankedPull,
  RepoMetrics,
  SettlementTier,
  WorksForm,
} from "./analysis";

export type Vec3 = [number, number, number];

export type EntityKind =
  | "building"
  | "district"
  | "incident"
  | "construction"
  | "landmark"
  | "overflow";

/** Hero: the animated assembly. Crowd: one instance of an instanced form (PLAN.md 76.3). */
export type Lod = "hero" | "crowd";

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
  /** Town slot on the high street: the renderer puts a shopfront here. */
  frontage?: "main-street" | null;
}

export interface Incident extends CityEntity {
  kind: "incident";
  state: IncidentState;
  issue: RankedIssue;
  /** District the incident sits next to, when placement was path-related. */
  districtId?: string;
  form?: IncidentForm;
  lod?: Lod;
  /** Sits in a traffic lane and closes it (blockages.ts). Kerbside otherwise. */
  lane?: boolean;
  /** Footprint `[w, h, d]` in the incident's own frame; crowd only. */
  size?: Vec3;
  heat?: number;
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
  form?: WorksForm;
  lod?: Lod;
  lane?: boolean;
  /** Scaffold host. `position` is then the host's facade centre and `rotationY` faces out. */
  buildingId?: string | null;
  heat?: number;
}

export type LandmarkType = "power" | "fire" | "info" | "station" | "civic";

/**
 * Numbers a landmark's renderer may animate to. Everything here is optional
 * and everything is derived from real repository facts, so a landmark that has
 * no such fact simply omits the field.
 */
export interface LandmarkDetail {
  /**
   * Transit station only: train arrivals per minute of wall-clock time, 0.25
   * to 6. Release cadence and recency set it (PLAN.md section 20), so an
   * actively shipping project has freight moving and an occasional one has a
   * train every few minutes.
   */
  trainsPerMinute?: number;
  /** Transit station only: tag of the most recent release, e.g. `v4.2.0`. */
  releaseTag?: string | null;
  /** Transit station only: how many days ago that release was published. */
  releaseDaysAgo?: number | null;
}

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
  /** Facts this landmark may animate to; see `LandmarkDetail`. */
  detail?: LandmarkDetail;
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

/**
 * `"street"` is every road inside the city. `"highway"` is a fork road: it
 * starts on the ring road and runs straight out past `bounds.size` towards the
 * horizon (PLAN.md section 22). A renderer that knows nothing about the field
 * draws a highway as the ordinary major road it already is; one that does can
 * taper it into the distance.
 *
 * PLAN.md 76.3 adds `"lane"` (a village lane: narrow, no pavements) and
 * `"avenue"` (a metropolis dual carriageway). Unknown kinds draw as "street".
 */
export type RoadKind = "street" | "highway" | "lane" | "avenue";

export interface RoadSegment {
  id: string;
  from: Vec3;
  to: Vec3;
  width: number;
  major: boolean;
  /** Reveal delay in milliseconds; a road draws itself in from `from`. */
  appearAt: number;
  /** Absent means `"street"`. Highways are always `major: true`. */
  kind?: RoadKind;
  /** Town high street: shops face it. */
  main?: boolean;
}

/** PLAN.md 76.3: the settlement line in the HUD. */
export interface SettlementInfo {
  tier: SettlementTier;
  /** "Village of p-limit", "Town of zustand", "City of hono", "Greater react". */
  name: string;
  reason: string;
}

export interface FieldPatch {
  x: number;
  z: number;
  w: number;
  d: number;
  rotationY: number;
  crop: 0 | 1 | 2 | 3;
}

export interface OverflowCount {
  total: number;
  drawn: number;
  hidden: number;
}

/** The queue at the city limits: everything open that is not drawn as its own object. */
export interface Overflow extends CityEntity {
  kind: "overflow";
  issues: OverflowCount;
  pulls: OverflowCount;
  exact: boolean;
  /** Signboard plot `[w, h, d]`. */
  size: Vec3;
  /** Stationary queue on the approach roads, one entry per car. */
  queue: { position: Vec3; rotationY: number; body: number; roadId: string }[];
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
    /**
     * 0..1 from the logarithm of the star count: 0 at no stars, 1 at 100,000.
     * Decorative prominence only — banners, a brighter skyline, more street
     * dressing. It must never change health or the health colours (PLAN.md
     * section 21). Absent means "unknown, draw the plain city".
     */
    prestige?: number;
  };
  bounds: { size: number };
  districts: District[];
  buildings: Building[];
  roads: RoadSegment[];
  landmarks: Landmark[];
  incidents: Incident[];
  constructionSites: ConstructionSite[];
  props: { trees: Vec3[]; lamps: Vec3[]; fields?: FieldPatch[] };
  vehicles: {
    count: number;
    /**
     * 0..1, the share of `count` the renderer may dress as out-of-town
     * visitors (coaches, a different palette, entering along the highways).
     * Derived from stars, which are attention and never health (PLAN.md
     * section 21). Absent means "no visitors worth distinguishing".
     */
    visitorShare?: number;
  };
  seed: string;
  /** PLAN.md 76.3. Absent on a model generated before settlements existed. */
  settlement?: SettlementInfo;
  /** Crowd-level objects. `incidents` and `constructionSites` stay heroes only. */
  backlog?: { incidents: Incident[]; constructionSites: ConstructionSite[] };
  overflow?: Overflow | null;
  /** Civic ground: paved plaza (city), setts (town), grass green (village). */
  plaza?: {
    rect: { x: number; z: number; w: number; d: number };
    surface: "paved" | "setts" | "green";
  };
}

/** Every selectable thing in the world. Keyed by `CityEntity["id"]`. */
export type SelectableEntity = Building | Incident | ConstructionSite | Landmark | Overflow;
