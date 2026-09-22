/**
 * `RepoAnalysis` -> `CityModel` (PLAN.md sections 34 to 37).
 *
 * This is the whole world layer. It runs in the browser, it is pure, and it is
 * deterministic: every random draw comes from `prngFor(seed, salt)` with one
 * salt per subsystem, so adding a draw to the tree placement never moves a
 * building (PLAN.md section 35).
 *
 * Stages, in the order of PLAN.md section 36:
 *   1 districts, 2 district regions, 3 major roads, 4 blocks, 5 buildings,
 *   6 landmarks, 7 incidents (then construction), 8 props.
 *
 * World conventions the renderer must match: written out in full at the top of
 * `types/city.ts`. In short: +y up; `bounds.size` is the side of a square
 * centred on the origin on XZ; a building's `position` is its base centre on
 * y = 0 and `size` is [width, height, depth]; roads are centrelines with a
 * `width`; incidents sit on a road centreline; `District.rect` uses `x`/`z` as
 * the rect CENTRE; landmarks and construction sites carry the reserved plot
 * they were given in `size`, and the renderer scales its assembly to fit.
 */

import type {
  BuildingPlan,
  DistrictPlan,
  RankedIssue,
  RankedPull,
  RepoAnalysis,
  SettlementTier,
} from "@/types/analysis";
import type {
  Building,
  CityModel,
  ConstructionSite,
  District,
  FieldPatch,
  Incident,
  Landmark,
  RoadSegment,
  SettlementInfo,
  Vec3,
} from "@/types/city";
import { districtForPath, districtForText, placeCrowd, type CrowdResult } from "./backlog.ts";
import {
  buildingText,
  constructionText,
  districtText,
  incidentText,
  planLandmarks,
} from "./entities.ts";
import {
  CIVIC_BUILDING_SLOTS,
  NATURAL_LANDMARK_SIZE,
  ROAD_REVEAL,
  clamp,
  distanceToRoad,
  planHighways,
  planLayout,
  pointOnRoad,
  rectMaxX,
  rectMaxZ,
  rectMinX,
  rectMinZ,
  roadHeading,
  roadLength,
  round3,
  type CityLayout,
  type LandmarkPlot,
  type Rect,
  type Slot,
} from "./layout.ts";
import { buildOverflow, overflowTotals, planOverflowSite } from "./overflow.ts";
import type { Prng } from "./prng.ts";
import { prngFor, seedFor } from "./seed.ts";
import {
  DEFAULT_SETTLEMENT_TIER,
  SETTLEMENT_PARAMS,
  settlementName,
  type SettlementParams,
} from "./settlement.ts";
import {
  boxesOverlap,
  buildingBox,
  createIndex,
  populateSpots,
  type GroundArea,
  type OwnedBox,
} from "./spots.ts";

export { districtForPath, districtForText };

/**
 * What the layout may carry beyond `CityLayout` once the per-tier layouts land
 * (PLAN.md 76.5, S3): village fields and an explicit plaza. Read structurally,
 * so the generator works with or without them.
 */
type LayoutExtras = CityLayout & {
  fields?: FieldPatch[];
  plaza?: NonNullable<CityModel["plaza"]>;
};

/**
 * What a slot may carry beyond `Slot`: a village house faces its lane at
 * `rotationY`, and a town slot on the high street is `frontage: "main-street"`.
 */
type SlotExtras = Slot & { rotationY?: number; frontage?: "main-street" | null };

// ---------------------------------------------------------------------------
// Limits (PLAN.md section 37) and timings (PLAN.md section 43)
// ---------------------------------------------------------------------------

export const LIMITS = {
  buildings: 300,
  trees: 100,
  vehicles: 40,
  incidents: 12,
  construction: 8,
  /** Matches `LAMP_CAP` in `components/city/Props.tsx`: past it nothing draws. */
  lamps: 120,
} as const;

/** Share of the tree budget that goes to the parks rather than the decoration. */
const PARK_SHARE = 0.62;
/** The same for an archived city, where the greenery is the whole point. */
const ARCHIVED_PARK_SHARE = 0.8;

/**
 * Reveal schedule in milliseconds. The last thing appears before 3.3 s, so the
 * whole generation animation lands inside PLAN.md section 43's 2 to 4 seconds.
 * Every entity carries its own `appearAt`, including roads and districts, so
 * the renderer never invents a timing of its own.
 */
export const REVEAL = {
  terrain: 0,
  roads: [ROAD_REVEAL.major[0], ROAD_REVEAL.minor[1]],
  districts: [420, 640],
  buildings: [700, 2300],
  landmarks: [2300, 2650],
  incidents: [2650, 3000],
  construction: [3000, 3300],
} as const;

function spread(window: readonly number[], index: number, total: number): number {
  const [start, end] = window;
  if (total <= 1) return Math.round(start);
  return Math.round(start + ((end - start) * index) / total);
}

/** A repository with no district plan still gets one place to put buildings. */
const ROOT_DISTRICT: DistrictPlan = {
  id: "d-outskirts",
  sourcePath: "/",
  name: "Outskirts",
  purpose: null,
  fileCount: 0,
  weight: 1,
};

/**
 * Visual height per tier, before the seeded +/-15% jitter.
 *
 * The spread is deliberately wider than a linear ramp. From the default
 * camera a city is read at a shallow angle, which foreshortens height hard:
 * at a four-to-one range between the shortest and tallest tier the skyline
 * still flattened into one mass. Six-to-one is the exaggeration PLAN.md
 * section 4 allows, and it is what makes rank legible from the opening shot.
 */
export const TIER_HEIGHT: Record<number, number> = { 1: 4.2, 2: 7, 3: 11, 4: 16, 5: 23 };

export const MIN_FOOTPRINT = 4;
export const MAX_FOOTPRINT = 8.5;
/** Gap kept inside a slot cell so neighbouring footprints never touch. */
const SLOT_GAP = 1;
/**
 * Minimum separation between two incidents. The renderer draws an incident
 * about six units across (two cars, cones and barricades), so anything closer
 * would read as one pile-up instead of two issues.
 */
const INCIDENT_SPACING = 9;
/** What the renderer draws a construction site at, before scaling. */
const NATURAL_SITE = 11;
/** Natural height of the crane, used to fill in `ConstructionSite.size`. */
const NATURAL_SITE_HEIGHT = 12.6;

/**
 * Footprints the crowd keeps clear of, beyond buildings and landmark plots.
 * A hero site's dressing leans a quarter past its plot (`SITE_FOOTPRINT` in
 * `components/city/blockages.ts`); a hero incident's scene runs up to ten
 * units along its road and three across (`INCIDENT_FOOTPRINT`); a tree's
 * canopy is about 1.6 across; a lamp post is a thin pole.
 */
const HERO_SITE_REACH = 1.25;
const HERO_SCENE: { hw: number; hd: number } = { hw: 3, hd: 10 };
const TREE_HALF = 0.8;
const LAMP_HALF = 0.3;

/** The renderer's own plaza inset (`PLAZA_INSET` in `components/city/groundwork.ts`). */
const PLAZA_INSET = 1.6;
const PLAZA_SURFACE: Record<SettlementTier, NonNullable<CityModel["plaza"]>["surface"]> = {
  village: "green",
  town: "setts",
  city: "paved",
  metropolis: "paved",
};

// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------

export interface GenerateOptions {
  /**
   * Forces the settlement tier, overriding `analysis.settlement`. Only the
   * dev-only `?tier=` override in the store passes it (PLAN.md 76.11).
   */
  tier?: SettlementTier;
}

/**
 * The settlement the city is built as. The generator never classifies: it
 * reads the server's `analysis.settlement` and, when that is absent (older
 * caches and fixtures), renders today's city (PLAN.md 76.1 decision 3).
 */
export function settlementFor(analysis: RepoAnalysis, forced?: SettlementTier): SettlementInfo {
  const planned = analysis.settlement;
  const tier = forced ?? planned?.tier ?? DEFAULT_SETTLEMENT_TIER;
  let reason: string;
  if (planned && planned.tier === tier) {
    reason = planned.reason;
  } else if (forced) {
    reason = `Shown as ${tier === "city" ? "a city" : `a ${tier}`} by the ?tier= development override.`;
  } else {
    reason = "This analysis predates settlement sizes, so it is drawn as a city.";
  }
  return { tier, name: settlementName(tier, analysis.repo.name), reason };
}

export function generateCity(analysis: RepoAnalysis, options: GenerateOptions = {}): CityModel {
  const seed = analysis.seed || seedFor(analysis);
  const { metrics, repo } = analysis;
  const settlement = settlementFor(analysis, options.tier);
  const params = SETTLEMENT_PARAMS[settlement.tier];

  // -- Stage 1: districts -------------------------------------------------
  const districtPlans = analysis.districts.length > 0 ? analysis.districts : [ROOT_DISTRICT];
  const districtById = new Map<string, DistrictPlan>(districtPlans.map((d) => [d.id, d]));
  const fallbackDistrictId = districtPlans[0]?.id ?? "d-outskirts";

  const resolveDistrict = (id: string): string =>
    districtById.has(id) ? id : fallbackDistrictId;

  // Section 37, per tier (76.5): a city never renders more than 300
  // buildings, a village 40, a metropolis 450.
  const allPlans = [...analysis.buildings]
    .sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1))
    .slice(0, params.buildings.max);

  // Root landmark files live in the civic centre, not in their district
  // (PLAN.md section 8). Everything past the reserved civic slots falls back
  // into its own district rather than being dropped.
  const wanted = allPlans.filter((b) => b.landmark !== null).slice(0, CIVIC_BUILDING_SLOTS);

  // -- Stages 2 to 4: regions, roads, blocks, slots ------------------------
  const countsById = new Map<string, number>(districtPlans.map((d) => [d.id, 0]));
  for (const plan of allPlans) {
    const id = resolveDistrict(plan.districtId);
    countsById.set(id, (countsById.get(id) ?? 0) + 1);
  }
  const layout = planLayout(
    districtPlans.map((d) => ({ id: d.id, buildingCount: countsById.get(d.id) ?? 0 })),
    allPlans.length,
    { landmarkFiles: wanted.length, tier: settlement.tier },
  );
  const layoutById = new Map(layout.districts.map((d) => [d.id, d]));

  // A cramped plaza may have room for fewer files than the repository has;
  // the ones it cannot seat go back to their own district.
  const civicPlans = wanted.slice(0, layout.civic.buildingSlots.length);
  const civicIds = new Set(civicPlans.map((b) => b.id));
  const districtPlansById = new Map<string, BuildingPlan[]>(districtPlans.map((d) => [d.id, []]));
  if (!districtPlansById.has(fallbackDistrictId)) districtPlansById.set(fallbackDistrictId, []);
  for (const plan of allPlans) {
    if (civicIds.has(plan.id)) continue;
    districtPlansById.get(resolveDistrict(plan.districtId))!.push(plan);
  }

  // -- Stage 5: buildings --------------------------------------------------
  const slotPrng = prngFor(seed, "layout");
  const buildingPrng = prngFor(seed, "buildings");
  const buildings: Building[] = [];
  const districts: District[] = [];
  /** Slots already taken, so construction sites can claim what is left. */
  const usedSlots = new Map<string, number>();

  districtPlans.forEach((plan, index) => {
    const placed = layoutById.get(plan.id);
    const rect: Rect = placed?.rect ?? { x: 0, z: 0, w: 0, d: 0 };
    const colorIndex = index % 8;
    const slots = placed?.slots ?? [];
    const members = districtPlansById.get(plan.id) ?? [];

    let cursor = 0;
    for (const member of members) {
      const slot = slots[cursor] ?? fallbackSlot(rect, cursor);
      cursor += 1;
      buildings.push(
        makeBuilding(member, plan, plan.id, colorIndex, slot, analysis, slotPrng, buildingPrng, params),
      );
    }
    usedSlots.set(plan.id, cursor);

    const text = districtText(plan, repo, metrics.scale.files);
    districts.push({
      id: plan.id,
      name: plan.name,
      sourcePath: plan.sourcePath,
      purpose: plan.purpose,
      rect: { x: round3(rect.x), z: round3(rect.z), w: round3(rect.w), d: round3(rect.d) },
      colorIndex,
      buildingIds: [],
      description: text.description,
      reason: text.reason,
      sourceUrl: text.sourceUrl,
      appearAt: spread(REVEAL.districts, index, districtPlans.length),
    });
  });

  civicPlans.forEach((plan, index) => {
    const districtId = resolveDistrict(plan.districtId);
    const colorIndex = districts.find((d) => d.id === districtId)?.colorIndex ?? 0;
    const slot = layout.civic.buildingSlots[index];
    buildings.push(
      makeBuilding(
        plan,
        districtById.get(districtId),
        districtId,
        colorIndex,
        slot,
        analysis,
        slotPrng,
        buildingPrng,
        params,
      ),
    );
  });

  assignBuildingReveal(buildings, districts);
  const districtIndex = new Map(districts.map((d) => [d.id, d]));
  for (const building of buildings) {
    districtIndex.get(building.districtId)?.buildingIds.push(building.id);
  }

  // -- Stage 6: landmarks --------------------------------------------------
  const landmarks = placeLandmarks(analysis, layout, settlement.tier);

  // -- Stage 7: incidents, then construction -------------------------------
  // Heroes per tier (76.5). Whatever the cap leaves out joins the crowd.
  const rankedIssues = analysis.metrics.issues.ranked;
  const rankedPulls = analysis.metrics.pulls.ranked;
  const heroIssues = rankedIssues.slice(0, params.heroes.incidents);
  const heroPulls = rankedPulls.slice(0, params.heroes.sites);
  const incidents = placeIncidents(analysis, heroIssues, layout, districtPlans, seed);
  const construction = placeConstruction(
    analysis,
    heroPulls,
    layout,
    districtPlans,
    buildings,
    usedSlots,
    seed,
  );

  // -- Stage 8: highways, then props ---------------------------------------
  // Highways are planned after the city so nothing else can be placed on one:
  // incidents, construction and slots all read `layout.roads`, which does not
  // contain them.
  const highways = planHighways(
    layout,
    clamp(highwayCount(repo.forks), params.highways.min, params.highways.max),
  );
  const trees = placeTrees(
    analysis,
    layout,
    landmarks,
    construction,
    incidents,
    usedSlots,
    seed,
    highways,
    params.trees,
  );
  const lamps = [...plazaLamps(layout), ...placeLamps(layout, analysis, params.lamps)].slice(
    0,
    params.lamps,
  );

  // -- Stage 9: the crowd and the queue at the limits (PLAN.md 76.8) -------
  const extras = layout as LayoutExtras;
  const plaza = extras.plaza ?? {
    rect: roundRect(insetBy(layout.civic.rect, PLAZA_INSET)),
    surface: PLAZA_SURFACE[settlement.tier],
  };
  const crowdInput = {
    demotedIssues: rankedIssues.slice(params.heroes.incidents),
    demotedPulls: rankedPulls.slice(params.heroes.sites).filter((p) => p.state !== "completed"),
  };
  const roads = [...layout.roads, ...highways];
  const obstacles: OwnedBox[] = [
    ...landmarks.map((l) => plotOwnedBox(l.id, l.position, l.size ?? NATURAL_LANDMARK_SIZE[l.landmarkType], l.rotationY)),
    ...construction.map((site) => {
      const side = (site.size?.[0] ?? NATURAL_SITE) * HERO_SITE_REACH;
      return plotOwnedBox(site.id, site.position, [side, 0, side], site.rotationY);
    }),
    ...incidents.map((incident) => ({
      x: incident.position[0],
      z: incident.position[2],
      ...HERO_SCENE,
      rot: incident.rotationY,
      owner: incident.id,
    })),
    ...trees.map(([x, , z]) => ({ x, z, hw: TREE_HALF, hd: TREE_HALF, rot: 0, owner: "tree" })),
    ...lamps.map(([x, , z]) => ({ x, z, hw: LAMP_HALF, hd: LAMP_HALF, rot: 0, owner: "lamp" })),
  ];
  const spotIndex = createIndex(roads, buildings, obstacles);
  const site = planOverflowSite(
    roads,
    (box) => spotIndex.statics.hits(box) || spotIndex.carriageways.hits(box),
  );
  if (site) spotIndex.statics.insert(site.sign);

  const backlogIssues = metrics.issues.backlog ?? [];
  const backlogPulls = metrics.pulls.backlog ?? [];
  const offered =
    crowdInput.demotedIssues.length +
    crowdInput.demotedPulls.length +
    backlogIssues.length +
    backlogPulls.length;
  let crowd: CrowdResult | null = null;
  if (offered > 0) {
    populateSpots(spotIndex, {
      roads,
      buildings,
      obstacles,
      lamps,
      heroes: incidents.map((incident) => ({ x: incident.position[0], z: incident.position[2] })),
      ground: groundAreas(layout, usedSlots, params, settlement.tier, plaza.rect, extras.fields),
      reserved: site?.reserved,
    });
    crowd = placeCrowd({
      analysis,
      tier: settlement.tier,
      index: spotIndex,
      buildings,
      districtPlans,
      districtCentres: new Map(layout.districts.map((d) => [d.id, { x: d.rect.x, z: d.rect.z }])),
      heroIncidents: incidents,
      ...crowdInput,
      prng: prngFor(seed, "backlog"),
    });
  }
  const crowdIncidents = crowd?.incidents ?? [];
  const crowdSites = crowd?.constructionSites ?? [];
  const surveyed = {
    issues: rankedIssues.length + backlogIssues.length,
    pulls: rankedPulls.filter((p) => p.state !== "completed").length + backlogPulls.length,
  };
  const totals = overflowTotals(
    analysis,
    {
      issues: incidents.length + crowdIncidents.length,
      pulls: construction.filter((s) => s.state !== "completed").length + crowdSites.length,
    },
    surveyed,
  );
  const overflow = buildOverflow({
    site,
    totals,
    surveyed,
    tier: settlement.tier,
    repoUrl: repo.url,
    prng: prngFor(seed, "overflow"),
  });

  return {
    repository: { fullName: repo.fullName, url: repo.url, archived: metrics.archived },
    health: metrics.health,
    confidence: metrics.confidence,
    activity: metrics.activity,
    ambience: ambienceFor(analysis),
    bounds: { size: layout.size },
    districts,
    buildings,
    roads: [...layout.roads, ...highways],
    landmarks,
    incidents,
    constructionSites: construction,
    props: { trees, lamps, ...(extras.fields ? { fields: extras.fields } : {}) },
    vehicles: {
      count: vehicleCount(
        analysis,
        layout.roads.reduce((sum, road) => sum + roadLength(road), 0),
        params.vehicles.max,
      ),
      visitorShare: visitorShare(repo.stars),
    },
    seed,
    settlement,
    backlog: { incidents: crowdIncidents, constructionSites: crowdSites },
    overflow,
    plaza,
  };
}

const insetBy = (rect: Rect, by: number): Rect => ({
  x: rect.x,
  z: rect.z,
  w: Math.max(0, rect.w - 2 * by),
  d: Math.max(0, rect.d - 2 * by),
});

const roundRect = (rect: Rect): Rect => ({
  x: round3(rect.x),
  z: round3(rect.z),
  w: round3(rect.w),
  d: round3(rect.d),
});

function plotOwnedBox(owner: string, position: Vec3, size: Vec3, rotationY: number): OwnedBox {
  return { x: position[0], z: position[2], hw: size[0] / 2, hd: size[2] / 2, rot: rotationY, owner };
}

/**
 * Open ground the crowd may stand on (PLAN.md 76.8, "Ground spots"): every
 * district slot no building and no hero site took, the village green, the
 * fields, and the four corners of the landmark band that the compass leaves
 * empty.
 */
function groundAreas(
  layout: CityLayout,
  usedSlots: Map<string, number>,
  params: SettlementParams,
  tier: SettlementTier,
  green: Rect,
  fields: readonly FieldPatch[] | undefined,
): GroundArea[] {
  const areas: GroundArea[] = [];
  for (const district of layout.districts) {
    const cursor = usedSlots.get(district.id) ?? 0;
    for (const slot of district.slots.slice(cursor) as SlotExtras[]) {
      areas.push({
        x: slot.x,
        z: slot.z,
        w: slot.cellW,
        d: slot.cellD,
        rotationY: slot.rotationY ?? 0,
        whole: true,
      });
    }
  }
  if (tier === "village") areas.push({ ...green, rotationY: 0 });
  for (const field of fields ?? []) {
    areas.push({ x: field.x, z: field.z, w: field.w, d: field.d, rotationY: field.rotationY });
  }
  if (params.landmarkBand) {
    const from = layout.districtSide / 2 + params.roads.major.width / 2 + 1;
    const to = layout.ringRadius - (params.ring?.width ?? params.roads.major.width) / 2 - 1;
    const side = to - from;
    if (side >= 3.5) {
      const centre = (from + to) / 2;
      for (const [sx, sz] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ]) {
        areas.push({ x: sx * centre, z: sz * centre, w: side, d: side, rotationY: 0 });
      }
    }
  }
  return areas;
}

// ---------------------------------------------------------------------------
// Stage 5 helpers
// ---------------------------------------------------------------------------

/** Only reached if a district somehow runs out of slots; never drops a building. */
function fallbackSlot(rect: Rect, index: number): Slot {
  const ring = 1 + Math.floor(index / 8);
  const angle = (index % 8) * (Math.PI / 4);
  return {
    x: round3(rect.x + Math.cos(angle) * ring * 2.6),
    z: round3(rect.z + Math.sin(angle) * ring * 2.6),
    cellW: MIN_FOOTPRINT,
    cellD: MIN_FOOTPRINT,
  };
}

/**
 * A directory's footprint follows what it holds; a file's follows its tier.
 * Written as a share of the tier's footprint range, arranged so the city row
 * (4 to 8.5, a range of exactly 4.5, so `k` is exactly 1) evaluates the very
 * same floating-point expression it always did.
 */
function desiredFootprint(plan: BuildingPlan, params: SettlementParams): number {
  const { min, max } = params.footprint;
  const k = (max - min) / 4.5;
  const base =
    plan.kind === "directory"
      ? min + k + 3.5 * Math.sqrt(Math.min(plan.descendantCount, 40) / 40) * k
      : min + 1.4 * ((plan.tier - 1) / 4) * k;
  return clamp(base, min, max);
}

function makeBuilding(
  plan: BuildingPlan,
  districtPlan: DistrictPlan | undefined,
  districtId: string,
  colorIndex: number,
  slot: SlotExtras,
  analysis: RepoAnalysis,
  slotPrng: Prng,
  buildingPrng: Prng,
  params: SettlementParams,
): Building {
  const { min, max } = params.footprint;
  const base = desiredFootprint(plan, params);
  // Footprints stay in the tier's documented band, unless a crowded district
  // has squeezed the slot cell below that.
  const fit = (cell: number): number => {
    const wobbled = clamp(base * (1 + buildingPrng.range(-0.08, 0.08)), min, max);
    return clamp(Math.min(wobbled, cell - SLOT_GAP), 1.4, max);
  };
  // A civic plaza slot is a composition, not a parking space: the building
  // fills its square cell, faces the town hall, and stays under the ceiling
  // the plaza set for it. Everything else takes a footprint and some jitter.
  const civic = slot.facing !== undefined;
  const width = civic ? slot.cellW : fit(slot.cellW);
  const depth = civic ? slot.cellD : fit(slot.cellD);
  const raw = params.tierHeight[plan.tier] * (1 + buildingPrng.range(-0.15, 0.15));
  const height = Math.min(raw, slot.maxHeight ?? Infinity);

  // Jitter stays inside the slot cell, which is what keeps footprints disjoint.
  const freeX = civic ? 0 : Math.max(0, (slot.cellW - width) / 2);
  const freeZ = civic ? 0 : Math.max(0, (slot.cellD - depth) / 2);
  const jx = slotPrng.range(-1, 1) * freeX * 0.85;
  const jz = slotPrng.range(-1, 1) * freeZ * 0.85;
  // A village house faces its lane: the cell, and the jitter inside it, turn
  // with the slot.
  const turn = slot.rotationY ?? 0;
  const x = turn === 0 ? slot.x + jx : slot.x + jx * Math.cos(turn) + jz * Math.sin(turn);
  const z = turn === 0 ? slot.z + jz : slot.z - jx * Math.sin(turn) + jz * Math.cos(turn);

  const text = buildingText(plan, districtPlan, analysis.repo);

  return {
    id: plan.id,
    kind: "building",
    position: [round3(x), 0, round3(z)],
    rotationY: slot.facing ?? (turn === 0 ? 0 : round3(turn)),
    ...text,
    appearAt: 0,
    districtId,
    size: [round3(width), round3(height), round3(depth)],
    tier: plan.tier,
    colorIndex,
    plan,
    ...(slot.frontage ? { frontage: slot.frontage } : {}),
  };
}

/** Buildings rise district by district, and inside a district centre outwards. */
function assignBuildingReveal(buildings: Building[], districts: District[]): void {
  const order = new Map(districts.map((d, i) => [d.id, i]));
  const sorted = [...buildings].sort((a, b) => {
    const da = order.get(a.districtId) ?? 99;
    const db = order.get(b.districtId) ?? 99;
    if (da !== db) return da - db;
    const ra = a.position[0] ** 2 + a.position[2] ** 2;
    const rb = b.position[0] ** 2 + b.position[2] ** 2;
    if (ra !== rb) return ra - rb;
    return a.id < b.id ? -1 : 1;
  });
  sorted.forEach((building, index) => {
    building.appearAt = spread(REVEAL.buildings, index, sorted.length);
  });
}

// ---------------------------------------------------------------------------
// Stage 6: landmarks
// ---------------------------------------------------------------------------

/**
 * The infrastructure landmarks stand on their reserved plots in the band
 * between the district square and the ring road, one per compass point; the
 * town hall stands at the centre of the civic square. `size` is the plot, in
 * the landmark's own frame: the renderer scales its assembly into it, so a
 * landmark can never overlap a building or a road (PLAN.md section 36).
 */
function placeLandmarks(
  analysis: RepoAnalysis,
  layout: CityLayout,
  tier: SettlementTier,
): Landmark[] {
  const specs = planLandmarks(analysis, tier);
  return specs.map((spec, index) => {
    const plot: LandmarkPlot =
      spec.landmarkType === "civic"
        ? layout.civic.hall
        : layout.landmarkPlots[spec.landmarkType];
    const natural = NATURAL_LANDMARK_SIZE[spec.landmarkType];
    const scale = Math.min(plot.w / natural[0], plot.d / natural[2]);
    return {
      id: `landmark-${spec.landmarkType}`,
      kind: "landmark" as const,
      position: [plot.x, 0, plot.z] as Vec3,
      rotationY: plot.rotationY,
      title: spec.title,
      subtitle: spec.subtitle,
      description: spec.description,
      reason: spec.reason,
      sourceUrl: spec.sourceUrl,
      visualState: spec.visualState,
      appearAt: spread(REVEAL.landmarks, index, specs.length),
      landmarkType: spec.landmarkType,
      level: spec.level,
      state: spec.state,
      size: [round3(plot.w), round3(natural[1] * scale), round3(plot.d)] as Vec3,
      ...(spec.detail ? { detail: spec.detail } : {}),
    };
  });
}

// ---------------------------------------------------------------------------
// Stage 7: incidents and construction (PLAN.md sections 11 and 13)
// ---------------------------------------------------------------------------

/** Rotate an array so a seeded start index becomes the first candidate. */
function rotate<T>(items: readonly T[], start: number): T[] {
  if (items.length === 0) return [];
  const offset = ((start % items.length) + items.length) % items.length;
  return [...items.slice(offset), ...items.slice(0, offset)];
}

/** Roads nearest a district, closest first: its own streets, then its seams. */
function roadsNear(roads: RoadSegment[], rect: Rect | null): RoadSegment[] {
  if (!rect) return roads;
  return [...roads]
    .map((road) => {
      const mid = pointOnRoad(road, 0.5);
      return { road, distance: Math.hypot(mid.x - rect.x, mid.z - rect.z) };
    })
    .sort((a, b) => a.distance - b.distance || (a.road.id < b.road.id ? -1 : 1))
    .map((entry) => entry.road);
}

function placeIncidents(
  analysis: RepoAnalysis,
  ranked: readonly RankedIssue[],
  layout: CityLayout,
  districtPlans: DistrictPlan[],
  seed: string,
): Incident[] {
  if (ranked.length === 0) return [];

  const prng = prngFor(seed, "incidents");
  const rectById = new Map(layout.districts.map((d) => [d.id, d.rect]));
  const taken: { x: number; z: number }[] = [];
  const incidents: Incident[] = [];

  ranked.forEach((issue, index) => {
    // Section 11: the related path first, then any path the issue text names.
    const district =
      districtForPath(issue.relatedPath, districtPlans) ??
      districtForText(`${issue.title} ${issue.bodyExcerpt}`, districtPlans);
    const rect = district ? (rectById.get(district.id) ?? null) : null;
    const candidates = rect
      ? roadsNear(layout.roads, rect).slice(0, 24)
      : rotate(layout.roads, prng.int(0, Math.max(0, layout.roads.length - 1)));
    const spot = findRoadSpot(candidates, taken, prng);
    taken.push({ x: spot.x, z: spot.z });

    incidents.push({
      id: `incident-${issue.number}`,
      kind: "incident",
      position: [spot.x, 0, spot.z],
      rotationY: round3(spot.heading),
      ...incidentText(issue, analysis.generatedAt),
      appearAt: spread(REVEAL.incidents, index, ranked.length),
      state: issue.state,
      issue,
    });
  });

  return incidents;
}

/**
 * A point on a road centreline at least `INCIDENT_SPACING` from every incident
 * placed so far. Candidate roads are tried in preference order; within a road
 * the sample points are evenly spaced from a seeded phase, so the search is
 * exhaustive and deterministic rather than a retry loop that can fail.
 */
function findRoadSpot(
  candidates: RoadSegment[],
  taken: { x: number; z: number }[],
  prng: Prng,
): { x: number; z: number; heading: number } {
  const samples = 11;
  const phase = prng.int(0, samples - 1);
  let fallback: { x: number; z: number; heading: number } | null = null;

  // A stub between two junctions is no place for a crash scene; fall back to
  // the full list only if nothing longer exists.
  const roomy = candidates.filter((road) => roadLength(road) >= 14);
  for (const road of roomy.length > 0 ? roomy : candidates) {
    const heading = roadHeading(road);
    for (let i = 0; i < samples; i++) {
      // Evenly spaced along the middle of the segment, from a seeded phase, so
      // an incident never lands on a junction.
      const t = 0.12 + (0.76 * ((i + phase) % samples)) / (samples - 1);
      const point = pointOnRoad(road, t);
      const spot = { x: point.x, z: point.z, heading };
      if (!fallback) fallback = spot;
      const clear = taken.every(
        (other) => Math.hypot(other.x - spot.x, other.z - spot.z) >= INCIDENT_SPACING,
      );
      if (clear) return spot;
    }
  }
  return fallback ?? { x: 0, z: 0, heading: 0 };
}

function placeConstruction(
  analysis: RepoAnalysis,
  ranked: readonly RankedPull[],
  layout: CityLayout,
  districtPlans: DistrictPlan[],
  buildings: Building[],
  usedSlots: Map<string, number>,
  seed: string,
): ConstructionSite[] {
  if (ranked.length === 0) return [];

  const prng = prngFor(seed, "construction");
  const layoutById = new Map(layout.districts.map((d) => [d.id, d]));
  const sites: ConstructionSite[] = [];
  // A site has to keep clear of everything already standing, and of the sites
  // placed before it, so the obstacle list grows as we go.
  const obstacles: Aabb[] = buildings.map(footprintOf);
  for (const road of layout.roads) obstacles.push(roadFootprint(road));

  ranked.forEach((pull, index) => {
    const mentioned =
      districtForText(`${pull.title} ${pull.labels.join(" ")}`, districtPlans) ??
      districtPlans[prng.int(0, Math.max(0, districtPlans.length - 1))];
    const slot =
      claimSlot(mentioned?.id, layoutById, usedSlots) ?? bandCorner(layout, index);

    // The renderer draws an eleven unit site; it is scaled down to whatever is
    // actually free here, which is usually a slot cell plus the gap around it.
    const half = clamp(clearHalfExtent(slot.x, slot.z, obstacles, NATURAL_SITE / 2), 1.8, NATURAL_SITE / 2);
    const side = round3(half * 2);
    obstacles.push({
      id: `construction-${pull.number}`,
      minX: slot.x - half,
      maxX: slot.x + half,
      minZ: slot.z - half,
      maxZ: slot.z + half,
    });

    sites.push({
      id: `construction-${pull.number}`,
      kind: "construction",
      position: [round3(slot.x), 0, round3(slot.z)],
      // Square sites, square plots: a rotated site would poke out of its clear
      // square, so only a whisker of rotation is allowed.
      rotationY: round3(prng.range(-0.06, 0.06)),
      ...constructionText(pull, analysis.generatedAt),
      appearAt: spread(REVEAL.construction, index, ranked.length),
      state: pull.state,
      pull,
      size: [side, round3((NATURAL_SITE_HEIGHT * side) / NATURAL_SITE), side],
    });
  });

  return sites;
}

/**
 * Half the side of the largest axis-aligned square centred on `(x, z)` that
 * touches none of `obstacles`. Everything here is axis aligned, so this is
 * just the largest per-axis gap, minimised over the obstacles.
 */
function clearHalfExtent(x: number, z: number, obstacles: readonly Aabb[], cap: number): number {
  let best = cap;
  for (const box of obstacles) {
    const gapX = Math.max(box.minX - x, x - box.maxX);
    const gapZ = Math.max(box.minZ - z, z - box.maxZ);
    const gap = Math.max(gapX, gapZ);
    if (gap < best) best = gap;
    if (best <= 0) return 0;
  }
  return best;
}

/** The road surface as a box, for clearance tests. */
function roadFootprint(road: RoadSegment): Aabb {
  const half = road.width / 2;
  return {
    id: road.id,
    minX: Math.min(road.from[0], road.to[0]) - half,
    maxX: Math.max(road.from[0], road.to[0]) + half,
    minZ: Math.min(road.from[2], road.to[2]) - half,
    maxZ: Math.max(road.from[2], road.to[2]) + half,
  };
}

/**
 * Last resort when every district slot is taken: the corners of the landmark
 * band, which nothing else ever uses.
 */
function bandCorner(layout: CityLayout, index: number): Slot {
  const r = layout.districtSide / 2 + layout.bandDepth / 2;
  const corners: [number, number][] = [
    [-r, -r],
    [r, -r],
    [r, r],
    [-r, r],
  ];
  const [x, z] = corners[index % corners.length];
  const ring = 1 + Math.floor(index / corners.length);
  return { x: round3(x / ring), z: round3(z / ring), cellW: NATURAL_SITE, cellD: NATURAL_SITE };
}

/**
 * Take a free slot in a district, preferring the roomiest one that is left:
 * a construction site is the biggest single object in a district, so it wants
 * the largest plot available.
 */
function claimSlot(
  preferredId: string | undefined,
  layoutById: Map<string, { slots: Slot[] }>,
  usedSlots: Map<string, number>,
): Slot | null {
  const order = preferredId
    ? [preferredId, ...[...layoutById.keys()].filter((id) => id !== preferredId)]
    : [...layoutById.keys()];
  for (const id of order) {
    const slots = layoutById.get(id)?.slots ?? [];
    const cursor = usedSlots.get(id) ?? 0;
    if (cursor >= slots.length) continue;
    // Free slots run from `cursor` to the end; take the roomiest and close the
    // gap by moving the one at the cursor into its place.
    let best = cursor;
    for (let i = cursor + 1; i < slots.length; i++) {
      if (Math.min(slots[i].cellW, slots[i].cellD) > Math.min(slots[best].cellW, slots[best].cellD)) {
        best = i;
      }
    }
    const chosen = slots[best];
    slots[best] = slots[cursor];
    slots[cursor] = chosen;
    usedSlots.set(id, cursor + 1);
    return chosen;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Stage 8: props (PLAN.md sections 17, 18, 19 and 37)
// ---------------------------------------------------------------------------

/**
 * How many trees the city gets. Documentation and health set the baseline
 * (PLAN.md sections 16 and 23); open parkland lifts it, because a city with a
 * lot of unbuilt ground needs the greenery to explain the ground.
 */
function treeCount(analysis: RepoAnalysis, parkSlots: number, cap: number): number {
  const { metrics } = analysis;
  const base = 34 + 11 * metrics.docs.strength + 0.26 * metrics.health.score;
  const green = base + Math.min(34, parkSlots * 0.45);
  // An archived repository gets MORE greenery, not less: PLAN.md section 19
  // lists vegetation alongside quiet roads and dimmer lighting, because the
  // abandoned reading is nature taking the place back, not a bald grey plate.
  const scaled = metrics.archived ? green * 1.15 : green;
  return Math.round(clamp(scaled, 0, cap));
}

/** The slots in a district that no building and no construction site took. */
function parkSlotsOf(layout: CityLayout, usedSlots: Map<string, number>): Map<string, Slot[]> {
  const out = new Map<string, Slot[]>();
  for (const district of layout.districts) {
    const cursor = usedSlots.get(district.id) ?? 0;
    out.set(district.id, district.slots.slice(cursor));
  }
  return out;
}

function placeTrees(
  analysis: RepoAnalysis,
  layout: CityLayout,
  landmarks: readonly Landmark[],
  sites: readonly ConstructionSite[],
  incidents: readonly Incident[],
  usedSlots: Map<string, number>,
  seed: string,
  highways: readonly RoadSegment[] = [],
  cap: number = LIMITS.trees,
): Vec3[] {
  const parkSlots = parkSlotsOf(layout, usedSlots);
  let free = 0;
  for (const slots of parkSlots.values()) free += slots.length;
  const want = treeCount(analysis, free, cap);
  if (want === 0) return [];
  const prng = prngFor(seed, "trees");
  const candidates: Vec3[] = [];

  // Nothing grows on a landmark that was actually built, on a building site or
  // on a crash scene. A landmark the repository did not earn -- no CI, so no
  // power station -- leaves its plot empty, and an empty plot is planted.
  const built = new Set(landmarks.map((l) => l.landmarkType));
  const keepOut: { x: number; z: number; radius: number }[] = [
    ...Object.entries(layout.landmarkPlots)
      .filter(([type]) => built.has(type as Landmark["landmarkType"]))
      .map(([, plot]) => ({
        x: plot.x,
        z: plot.z,
        radius: Math.max(plot.w, plot.d) * 0.6,
      })),
    { x: layout.civic.hall.x, z: layout.civic.hall.z, radius: layout.civic.hall.w * 0.75 },
    ...sites.map((site) => ({
      x: site.position[0],
      z: site.position[2],
      radius: (site.size?.[0] ?? NATURAL_SITE) * 0.6,
    })),
    ...incidents.map((incident) => ({
      x: incident.position[0],
      z: incident.position[2],
      radius: INCIDENT_SPACING / 2,
    })),
  ];
  const clear = (x: number, z: number): boolean =>
    keepOut.every((zone) => Math.hypot(x - zone.x, z - zone.z) > zone.radius) &&
    // The ring plantation crosses every highway where it leaves the city; a
    // tree in the fast lane is the one place this reads as a bug.
    highways.every((road) => distanceToRoad(x, z, road) > road.width / 2 + 1.4);

  // Along the ring road, on the outside.
  const ringRadius = layout.ringRadius + 5;
  const perimeter = 8 * ringRadius;
  const ringCount = Math.max(8, Math.round(perimeter / 8));
  for (let i = 0; i < ringCount; i++) {
    const t = (i + 0.5) / ringCount;
    const point = squarePerimeter(ringRadius, t);
    const x = point.x + prng.range(-1.2, 1.2);
    const z = point.z + prng.range(-1.2, 1.2);
    if (!clear(x, z)) continue;
    candidates.push([round3(x), 0, round3(z)]);
  }

  // In the landmark band, filling the space the landmarks do not use.
  const bandRadius = layout.districtSide / 2 + layout.bandDepth * 0.55;
  const bandCount = Math.max(8, Math.round((8 * bandRadius) / 11));
  for (let i = 0; i < bandCount; i++) {
    const point = squarePerimeter(bandRadius, (i + 0.25) / bandCount);
    const x = point.x + prng.range(-1.5, 1.5);
    const z = point.z + prng.range(-1.5, 1.5);
    if (!clear(x, z)) continue;
    candidates.push([round3(x), 0, round3(z)]);
  }

  // In the block margins, between a block edge and the kerb.
  for (const district of layout.districts) {
    for (const block of district.blocks) {
      const corners: [number, number][] = [
        [rectMinX(block) - 0.7, rectMinZ(block) - 0.7],
        [rectMaxX(block) + 0.7, rectMinZ(block) - 0.7],
        [rectMinX(block) - 0.7, rectMaxZ(block) + 0.7],
        [rectMaxX(block) + 0.7, rectMaxZ(block) + 0.7],
      ];
      for (const [x, z] of corners) {
        if (!clear(x, z)) continue;
        const jx = round3(x + prng.range(-0.25, 0.25));
        const jz = round3(z + prng.range(-0.25, 0.25));
        candidates.push([jx, 0, jz]);
      }
    }
  }

  // The four corners of the landmark band, which the compass leaves empty, and
  // the plot of any landmark the repository did not earn.
  const corner = layout.districtSide / 2 + layout.bandDepth * 0.5;
  const groves: { x: number; z: number; radius: number }[] = [
    { x: -corner, z: -corner, radius: layout.bandDepth * 0.34 },
    { x: corner, z: -corner, radius: layout.bandDepth * 0.34 },
    { x: -corner, z: corner, radius: layout.bandDepth * 0.34 },
    { x: corner, z: corner, radius: layout.bandDepth * 0.34 },
    ...Object.entries(layout.landmarkPlots)
      .filter(([type]) => !built.has(type as Landmark["landmarkType"]))
      .map(([, plot]) => ({ x: plot.x, z: plot.z, radius: Math.min(plot.w, plot.d) * 0.42 })),
  ];
  const groveTrees: Vec3[] = [];
  for (const grove of groves) {
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2 + prng.range(-0.4, 0.4);
      const radius = grove.radius * prng.range(0.25, 1);
      const x = round3(grove.x + Math.cos(angle) * radius);
      const z = round3(grove.z + Math.sin(angle) * radius);
      if (!clear(x, z)) continue;
      groveTrees.push([x, 0, z]);
    }
  }

  // Parks: the slots no building claimed, planted district by district so the
  // quiet corners of a repository get the greenery rather than the busy ones.
  // An abandoned city is reclaimed from the inside: nearly all of its budget
  // goes to the ground between the buildings rather than the ornamental ring.
  const parks = plantParks(
    layout,
    parkSlots,
    want,
    analysis.metrics.archived ? ARCHIVED_PARK_SHARE : PARK_SHARE,
    prng,
    clear,
  );
  const plaza = layout.civic.props.trees
    .map((spot) => [round3(spot.x), 0, round3(spot.z)] as Vec3)
    .filter(([x, , z]) => clear(x, z));

  // Order of precedence when the budget runs out: the plaza and the parks are
  // the ones doing the explaining, the ring and the margins are decoration.
  const kept: Vec3[] = [...plaza, ...parks, ...groveTrees];
  if (kept.length >= want) return kept.slice(0, want);

  const remaining = want - kept.length;
  for (let i = 0; i < remaining && i < candidates.length; i++) {
    // An even stride, so the selection stays mixed between the ring, the band
    // and the block margins rather than exhausting one of them.
    kept.push(candidates[Math.floor((i * candidates.length) / remaining)]);
  }
  return kept;
}

/**
 * Plant the free slots. Each district's share of the park budget follows how
 * much open ground it has, so a four-file district in a large region reads as
 * a green quarter instead of a vacant lot, and trees go in as small clusters:
 * one tree alone in a nine unit cell reads as a bald patch.
 */
function plantParks(
  layout: CityLayout,
  parkSlots: Map<string, Slot[]>,
  want: number,
  share: number,
  prng: Prng,
  clear: (x: number, z: number) => boolean,
): Vec3[] {
  const budget = Math.round(want * share);
  // A district's claim on the budget is its open ground weighted by how open
  // it is. A busy district with a few gaps between its towers does not read as
  // empty and does not need the trees; a district that is nine tenths grass
  // does, and gets several times the share per free slot.
  const claims = layout.districts.map((district) => {
    const slots = parkSlots.get(district.id) ?? [];
    const total = district.slots.length || 1;
    const openness = slots.length / total;
    return { id: district.id, slots, claim: slots.length * (0.25 + 1.75 * openness) };
  });
  const totalClaim = claims.reduce((sum, c) => sum + c.claim, 0);
  if (totalClaim <= 0) return [];

  const out: Vec3[] = [];
  for (const { slots, claim } of claims) {
    if (slots.length === 0) continue;
    const share = Math.round((budget * claim) / totalClaim);
    if (share <= 0) continue;
    // Clusters, not a lattice: one tree in the middle of a nine unit cell
    // reads as a bald patch, three around its edge read as a copse.
    const perSlot = clamp(Math.ceil(share / slots.length), 1, 4);
    let planted = 0;
    for (const slot of slots) {
      if (planted >= share) break;
      for (let i = 0; i < perSlot && planted < share; i++) {
        const angle = (i / perSlot) * Math.PI * 2 + prng.range(-0.5, 0.5);
        const x = round3(slot.x + Math.cos(angle) * slot.cellW * 0.3 + prng.range(-0.4, 0.4));
        const z = round3(slot.z + Math.sin(angle) * slot.cellD * 0.3 + prng.range(-0.4, 0.4));
        if (!clear(x, z)) continue;
        out.push([x, 0, z]);
        planted += 1;
      }
    }
  }
  return out;
}

/** Point at `t` (0..1) around a square of half-extent `r`, starting north-west. */
function squarePerimeter(r: number, t: number): { x: number; z: number } {
  const side = Math.floor(t * 4) % 4;
  const local = t * 4 - Math.floor(t * 4);
  const from = -r + 2 * r * local;
  if (side === 0) return { x: from, z: -r };
  if (side === 1) return { x: r, z: from };
  if (side === 2) return { x: -from, z: r };
  return { x: -r, z: -from };
}

/**
 * Street lamps along the major roads, set back from the kerb.
 *
 * The spacing is solved rather than fixed. At a fixed thirteen units a large
 * city ran past the renderer's cap part way round, so one quarter of it stood
 * unlit while a small town was lit like a runway; here the whole network is
 * spaced to land just under the cap, and a quiet repository gets its lamps
 * thinned out (PLAN.md sections 19 and 39: activity reads as light).
 */
function placeLamps(layout: CityLayout, analysis: RepoAnalysis, cap: number = LIMITS.lamps): Vec3[] {
  const lamps: Vec3[] = [];
  const majors = layout.roads.filter((road) => road.major);
  const total = majors.reduce((sum, road) => sum + roadLength(road), 0);
  const activity = analysis.metrics.archived
    ? 0
    : clamp(analysis.metrics.activity.score, 0, 1);
  const target = clamp(total / 17, Math.min(18, cap - 4), cap - 4) * (0.55 + 0.45 * activity);
  const spacing = clamp(total / Math.max(1, target), 12, 34);

  for (const road of majors) {
    const length = roadLength(road);
    if (length < 8) continue;
    const count = Math.max(1, Math.floor(length / spacing));
    const dx = (road.to[0] - road.from[0]) / length;
    const dz = (road.to[2] - road.from[2]) / length;
    // Perpendicular, always to the same side of a given segment.
    const offset = road.width / 2 + 0.9;
    for (let i = 0; i < count; i++) {
      const along = ((i + 0.5) * length) / count;
      lamps.push([
        round3(road.from[0] + dx * along - dz * offset),
        0,
        round3(road.from[2] + dz * along + dx * offset),
      ]);
      if (lamps.length >= cap) return lamps;
    }
  }
  return lamps;
}

/** The civic plaza is lit by hand, not by the road pass that runs past it. */
function plazaLamps(layout: CityLayout): Vec3[] {
  return layout.civic.props.lamps.map((spot) => [round3(spot.x), 0, round3(spot.z)] as Vec3);
}

// ---------------------------------------------------------------------------
// Ambience and traffic (PLAN.md sections 17 to 19 and 39)
// ---------------------------------------------------------------------------

const WARMTH = { Critical: 0.18, Struggling: 0.32, Mixed: 0.5, Healthy: 0.72, Thriving: 0.88 };
const SATURATION = { Critical: 0.4, Struggling: 0.55, Mixed: 0.7, Healthy: 0.85, Thriving: 1 };
const FOG = { Critical: 0.4, Struggling: 0.3, Mixed: 0.2, Healthy: 0.12, Thriving: 0.08 };

export function ambienceFor(analysis: RepoAnalysis): CityModel["ambience"] {
  const { metrics } = analysis;
  const band = metrics.health.band;
  const archived = metrics.archived;
  const activity = clamp(metrics.activity.score, 0, 1);
  const crowd = Math.min(metrics.activity.activeContributors90d, 6);

  // Archived is cooler, mildly foggy and quiet, but never unreadable
  // (PLAN.md sections 19 and 39: saturation keeps a floor).
  const warmth = archived ? WARMTH[band] * 0.35 : WARMTH[band];
  const saturation = archived ? Math.max(0.3, SATURATION[band] * 0.5) : SATURATION[band];
  const fog = archived ? Math.min(0.75, FOG[band] + 0.3) : FOG[band];

  return {
    warmth: round3(clamp(warmth, 0, 1)),
    saturation: round3(clamp(saturation, 0, 1)),
    fog: round3(clamp(fog, 0, 1)),
    trafficDensity: round3(archived ? 0.06 : clamp(0.1 + 0.85 * activity, 0, 1)),
    pedestrianDensity: round3(
      archived ? 0.04 : clamp(0.1 + 0.6 * activity + 0.05 * crowd, 0, 1),
    ),
    litWindowShare: round3(
      archived ? 0.05 : clamp(0.2 + 0.5 * activity + 0.3 * (metrics.health.score / 100), 0, 1),
    ),
    // Attention, not quality: an archived repository keeps the reputation it
    // earned, so prestige is not dimmed the way warmth and traffic are.
    prestige: prestigeOf(analysis.repo.stars),
  };
}

/**
 * Traffic follows activity, scaled by the road network the cars drive on.
 *
 * Building count was the wrong yardstick: thirty-three cars looked deserted on
 * three kilometres of arterial and gridlocked on one. Road length is what the
 * eye is actually reading, so the fleet is a density on it -- roughly one car
 * per seventy-five units of road at full activity -- and a quiet repository
 * thins out from there. An archived city keeps a couple of cars rather than
 * none: a frozen city reads as a bug, a nearly empty one reads as abandoned
 * (PLAN.md section 19).
 */
/**
 * Forks become highways leaving the city (PLAN.md section 22).
 *
 * One highway per power of ten: ten forks earn the first, a hundred the
 * second, and the fourth arrives at ten thousand. A repository nobody has
 * forked gets none, which is an honest answer rather than an empty road — and
 * because this is ecosystem information, it changes the map and never the
 * health score.
 */
export function highwayCount(forks: number): number {
  const safe = Number.isFinite(forks) ? Math.max(0, Math.floor(forks)) : 0;
  if (safe < 10) return 0;
  return Math.min(4, Math.floor(Math.log10(safe)));
}

/**
 * Stars as decorative prominence, 0..1 (PLAN.md section 21).
 *
 * Logarithmic, because the gap between 10 and 1,000 stars is the interesting
 * one and the gap between 40,000 and 60,000 is not: 100,000 stars saturates.
 * Nothing here is allowed near `health`.
 */
export function prestigeOf(stars: number): number {
  const safe = Number.isFinite(stars) ? Math.max(0, stars) : 0;
  return round3(clamp(Math.log10(safe + 1) / 5, 0, 1));
}

/**
 * Share of the fleet the renderer may draw as visitors, 0.1 to 0.7 (PLAN.md
 * section 21: stars buy visitor traffic, not quality). An unstarred repository
 * still keeps a tenth: every town has somebody passing through.
 */
export function visitorShare(stars: number): number {
  return round3(clamp(0.1 + 0.6 * prestigeOf(stars), 0, 0.7));
}

/** `cap` is the tier's moving-vehicle budget (76.5): 10 in a village, 64 in a metropolis. */
export function vehicleCount(
  analysis: RepoAnalysis,
  roadLengthTotal: number,
  cap: number = LIMITS.vehicles,
): number {
  const activity = clamp(analysis.metrics.activity.score, 0, 1);
  const room = clamp(roadLengthTotal / 75, 3, cap);
  if (analysis.metrics.archived) {
    return Math.round(clamp(room * 0.12 * (0.4 + activity), 0, 5));
  }
  return Math.round(clamp(room * (0.28 + 0.72 * activity), 2, cap));
}

// ---------------------------------------------------------------------------
// Shared geometry helper, used by the tests and `scripts/city-stats.ts`
// ---------------------------------------------------------------------------

/** Distance from a point to the nearest road centreline. */
export function nearestRoadDistance(x: number, z: number, roads: RoadSegment[]): number {
  let best = Infinity;
  for (const road of roads) {
    const distance = distanceToRoad(x, z, road);
    if (distance < best) best = distance;
  }
  return best;
}

interface Aabb {
  id: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/**
 * A building's footprint as a world-axis box. Grid buildings are unrotated or
 * quarter turned (civic plaza cells are square), which is exact; a village
 * house at any angle gets the box round its rotated footprint.
 */
const footprintOf = (building: Building): Aabb => {
  const turn = building.rotationY;
  if (Math.abs(Math.sin(2 * turn)) < 1e-6) {
    const quarter = Math.abs(Math.sin(turn)) > 0.5;
    const w = (quarter ? building.size[2] : building.size[0]) / 2;
    const d = (quarter ? building.size[0] : building.size[2]) / 2;
    return {
      id: building.id,
      minX: building.position[0] - w,
      maxX: building.position[0] + w,
      minZ: building.position[2] - d,
      maxZ: building.position[2] + d,
    };
  }
  const c = Math.abs(Math.cos(turn));
  const s = Math.abs(Math.sin(turn));
  const w = (building.size[0] * c + building.size[2] * s) / 2;
  const d = (building.size[0] * s + building.size[2] * c) / 2;
  return {
    id: building.id,
    minX: building.position[0] - w,
    maxX: building.position[0] + w,
    minZ: building.position[2] - d,
    maxZ: building.position[2] + d,
  };
};

/**
 * Every pair of building footprints that intersect. The layout guarantees this
 * is empty: a building never leaves its slot cell and cells never overlap.
 * Footprints are tested as oriented boxes, so two village houses turned to
 * face a bending lane are not reported for boxes that merely brush.
 */
export function overlappingBuildings(city: CityModel): [string, string][] {
  const boxes = city.buildings
    .map((building) => ({ aabb: footprintOf(building), box: buildingBox(building) }))
    .sort((a, b) => a.aabb.minX - b.aabb.minX);
  const hits: [string, string][] = [];
  const epsilon = 1e-6;
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      if (boxes[j].aabb.minX >= boxes[i].aabb.maxX) break;
      const a = boxes[i].aabb;
      const b = boxes[j].aabb;
      if (!(a.minZ < b.maxZ - epsilon && b.minZ < a.maxZ - epsilon)) continue;
      if (boxesOverlap(boxes[i].box, boxes[j].box, -epsilon)) hits.push([a.id, b.id]);
    }
  }
  return hits;
}

/**
 * The world-axis footprint of a reserved plot. Landmarks are only ever rotated
 * by quarter turns, so the box is exact: a quarter turn swaps w and d.
 */
function plotBox(id: string, position: Vec3, size: Vec3, rotationY: number): Aabb {
  const quarter = Math.abs(Math.sin(rotationY)) > 0.5;
  const w = (quarter ? size[2] : size[0]) / 2;
  const d = (quarter ? size[0] : size[2]) / 2;
  return {
    id,
    minX: position[0] - w,
    maxX: position[0] + w,
    minZ: position[2] - d,
    maxZ: position[2] + d,
  };
}

/**
 * Landmarks and construction sites that reach into a building or a road.
 * The layout guarantees this is empty: landmarks stand on reserved plots in
 * the band outside the district square, and a construction site is shrunk to
 * the space that was actually free around its slot.
 */
export function obstructedPlots(city: CityModel): { id: string; against: string }[] {
  const plots: Aabb[] = [
    ...city.landmarks.map((l) =>
      plotBox(l.id, l.position, l.size ?? [14, 10, 12], l.rotationY),
    ),
    ...city.constructionSites.map((s) =>
      plotBox(s.id, s.position, s.size ?? [11, 12.6, 11], s.rotationY),
    ),
  ];
  const obstacles: Aabb[] = [
    ...city.buildings.map(footprintOf),
    ...city.roads.map(roadFootprint),
  ];
  const hits: { id: string; against: string }[] = [];
  const epsilon = 1e-6;
  for (const plot of plots) {
    for (const box of obstacles) {
      if (
        plot.minX < box.maxX - epsilon &&
        box.minX < plot.maxX - epsilon &&
        plot.minZ < box.maxZ - epsilon &&
        box.minZ < plot.maxZ - epsilon
      ) {
        hits.push({ id: plot.id, against: box.id });
        break;
      }
    }
  }
  return hits;
}

/** Buildings whose footprint reaches into a road surface, with the overlap. */
export function buildingsOnRoads(city: CityModel): { id: string; clearance: number }[] {
  const hits: { id: string; clearance: number }[] = [];
  for (const building of city.buildings) {
    const [x, , z] = building.position;
    const [w, , d] = building.size;
    const corners: [number, number][] = [
      [x, z],
      [x - w / 2, z - d / 2],
      [x + w / 2, z - d / 2],
      [x - w / 2, z + d / 2],
      [x + w / 2, z + d / 2],
    ];
    let worst = Infinity;
    for (const road of city.roads) {
      for (const [cx, cz] of corners) {
        const clearance = distanceToRoad(cx, cz, road) - road.width / 2;
        if (clearance < worst) worst = clearance;
      }
    }
    if (worst < -1e-6) hits.push({ id: building.id, clearance: round3(worst) });
  }
  return hits;
}
