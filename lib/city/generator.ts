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
} from "@/types/analysis";
import type {
  Building,
  CityModel,
  ConstructionSite,
  District,
  Incident,
  Landmark,
  RoadSegment,
  Vec3,
} from "@/types/city";
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
import type { Prng } from "./prng.ts";
import { prngFor, seedFor } from "./seed.ts";

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

// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------

export function generateCity(analysis: RepoAnalysis): CityModel {
  const seed = analysis.seed || seedFor(analysis);
  const { metrics, repo } = analysis;

  // -- Stage 1: districts -------------------------------------------------
  const districtPlans = analysis.districts.length > 0 ? analysis.districts : [ROOT_DISTRICT];
  const districtById = new Map<string, DistrictPlan>(districtPlans.map((d) => [d.id, d]));
  const fallbackDistrictId = districtPlans[0]?.id ?? "d-outskirts";

  const resolveDistrict = (id: string): string =>
    districtById.has(id) ? id : fallbackDistrictId;

  // Section 37: the city never renders more than 300 buildings.
  const allPlans = [...analysis.buildings]
    .sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1))
    .slice(0, LIMITS.buildings);

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
    { landmarkFiles: wanted.length },
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
        makeBuilding(member, plan, plan.id, colorIndex, slot, analysis, slotPrng, buildingPrng),
      );
    }
    usedSlots.set(plan.id, cursor);

    const text = districtText(plan, repo);
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
      ),
    );
  });

  assignBuildingReveal(buildings, districts);
  const districtIndex = new Map(districts.map((d) => [d.id, d]));
  for (const building of buildings) {
    districtIndex.get(building.districtId)?.buildingIds.push(building.id);
  }

  // -- Stage 6: landmarks --------------------------------------------------
  const landmarks = placeLandmarks(analysis, layout);

  // -- Stage 7: incidents, then construction -------------------------------
  const incidents = placeIncidents(analysis, layout, districtPlans, seed);
  const construction = placeConstruction(
    analysis,
    layout,
    districtPlans,
    buildings,
    usedSlots,
    seed,
  );

  // -- Stage 8: props ------------------------------------------------------
  const trees = placeTrees(analysis, layout, landmarks, construction, incidents, usedSlots, seed);
  const lamps = [...plazaLamps(layout), ...placeLamps(layout, analysis)].slice(0, LIMITS.lamps);

  return {
    repository: { fullName: repo.fullName, url: repo.url, archived: metrics.archived },
    health: metrics.health,
    confidence: metrics.confidence,
    activity: metrics.activity,
    ambience: ambienceFor(analysis),
    bounds: { size: layout.size },
    districts,
    buildings,
    roads: layout.roads,
    landmarks,
    incidents,
    constructionSites: construction,
    props: { trees, lamps },
    vehicles: {
      count: vehicleCount(
        analysis,
        layout.roads.reduce((sum, road) => sum + roadLength(road), 0),
      ),
    },
    seed,
  };
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

/** A directory's footprint follows what it holds; a file's follows its tier. */
function desiredFootprint(plan: BuildingPlan): number {
  const base =
    plan.kind === "directory"
      ? 5 + 3.5 * Math.sqrt(Math.min(plan.descendantCount, 40) / 40)
      : MIN_FOOTPRINT + 1.4 * ((plan.tier - 1) / 4);
  return clamp(base, MIN_FOOTPRINT, MAX_FOOTPRINT);
}

function makeBuilding(
  plan: BuildingPlan,
  districtPlan: DistrictPlan | undefined,
  districtId: string,
  colorIndex: number,
  slot: Slot,
  analysis: RepoAnalysis,
  slotPrng: Prng,
  buildingPrng: Prng,
): Building {
  const base = desiredFootprint(plan);
  // Footprints stay in the documented 1.6 to 4 band, unless a crowded district
  // has squeezed the slot cell below that.
  const fit = (cell: number): number => {
    const wobbled = clamp(base * (1 + buildingPrng.range(-0.08, 0.08)), MIN_FOOTPRINT, MAX_FOOTPRINT);
    return clamp(Math.min(wobbled, cell - SLOT_GAP), 1.4, MAX_FOOTPRINT);
  };
  // A civic plaza slot is a composition, not a parking space: the building
  // fills its square cell, faces the town hall, and stays under the ceiling
  // the plaza set for it. Everything else takes a footprint and some jitter.
  const civic = slot.facing !== undefined;
  const width = civic ? slot.cellW : fit(slot.cellW);
  const depth = civic ? slot.cellD : fit(slot.cellD);
  const raw = TIER_HEIGHT[plan.tier] * (1 + buildingPrng.range(-0.15, 0.15));
  const height = Math.min(raw, slot.maxHeight ?? Infinity);

  // Jitter stays inside the slot cell, which is what keeps footprints disjoint.
  const freeX = civic ? 0 : Math.max(0, (slot.cellW - width) / 2);
  const freeZ = civic ? 0 : Math.max(0, (slot.cellD - depth) / 2);
  const x = slot.x + slotPrng.range(-1, 1) * freeX * 0.85;
  const z = slot.z + slotPrng.range(-1, 1) * freeZ * 0.85;

  const text = buildingText(plan, districtPlan, analysis.repo);

  return {
    id: plan.id,
    kind: "building",
    position: [round3(x), 0, round3(z)],
    rotationY: slot.facing ?? 0,
    ...text,
    appearAt: 0,
    districtId,
    size: [round3(width), round3(height), round3(depth)],
    tier: plan.tier,
    colorIndex,
    plan,
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
function placeLandmarks(analysis: RepoAnalysis, layout: CityLayout): Landmark[] {
  const specs = planLandmarks(analysis);
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
    };
  });
}

// ---------------------------------------------------------------------------
// Stage 7: incidents and construction (PLAN.md sections 11 and 13)
// ---------------------------------------------------------------------------

const normalizePath = (path: string): string => path.replace(/^\/+|\/+$/g, "").toLowerCase();

/** The district a repository path belongs to, or null. */
export function districtForPath(
  path: string | null,
  districts: DistrictPlan[],
): DistrictPlan | null {
  if (!path) return null;
  const target = normalizePath(path);
  if (!target) return null;
  let best: DistrictPlan | null = null;
  for (const district of districts) {
    const source = normalizePath(district.sourcePath);
    if (!source) continue;
    if (target === source || target.startsWith(`${source}/`)) {
      if (!best || source.length > normalizePath(best.sourcePath).length) best = district;
    }
  }
  return best;
}

/** The district named by any path-looking token in a free-text string. */
export function districtForText(text: string, districts: DistrictPlan[]): DistrictPlan | null {
  const tokens = text.match(/[\w.-]+(?:\/[\w.-]+)+/g) ?? [];
  for (const token of tokens) {
    const hit = districtForPath(token, districts);
    if (hit) return hit;
  }
  return null;
}

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
  layout: CityLayout,
  districtPlans: DistrictPlan[],
  seed: string,
): Incident[] {
  const ranked: RankedIssue[] = analysis.metrics.issues.ranked.slice(0, LIMITS.incidents);
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
  layout: CityLayout,
  districtPlans: DistrictPlan[],
  buildings: Building[],
  usedSlots: Map<string, number>,
  seed: string,
): ConstructionSite[] {
  const ranked: RankedPull[] = analysis.metrics.pulls.ranked.slice(0, LIMITS.construction);
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
function treeCount(analysis: RepoAnalysis, parkSlots: number): number {
  const { metrics } = analysis;
  const base = 34 + 11 * metrics.docs.strength + 0.26 * metrics.health.score;
  const green = base + Math.min(34, parkSlots * 0.45);
  const scaled = metrics.archived ? green * 0.5 : green;
  return Math.round(clamp(scaled, 0, LIMITS.trees));
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
): Vec3[] {
  const parkSlots = parkSlotsOf(layout, usedSlots);
  let free = 0;
  for (const slots of parkSlots.values()) free += slots.length;
  const want = treeCount(analysis, free);
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
    keepOut.every((zone) => Math.hypot(x - zone.x, z - zone.z) > zone.radius);

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
  const parks = plantParks(layout, parkSlots, want, prng, clear);
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
  prng: Prng,
  clear: (x: number, z: number) => boolean,
): Vec3[] {
  const budget = Math.round(want * PARK_SHARE);
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
function placeLamps(layout: CityLayout, analysis: RepoAnalysis): Vec3[] {
  const lamps: Vec3[] = [];
  const majors = layout.roads.filter((road) => road.major);
  const total = majors.reduce((sum, road) => sum + roadLength(road), 0);
  const activity = analysis.metrics.archived
    ? 0
    : clamp(analysis.metrics.activity.score, 0, 1);
  const target = clamp(total / 17, 18, LIMITS.lamps - 4) * (0.55 + 0.45 * activity);
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
      if (lamps.length >= LIMITS.lamps) return lamps;
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
export function vehicleCount(analysis: RepoAnalysis, roadLengthTotal: number): number {
  const activity = clamp(analysis.metrics.activity.score, 0, 1);
  const room = clamp(roadLengthTotal / 75, 3, LIMITS.vehicles);
  if (analysis.metrics.archived) {
    return Math.round(clamp(room * 0.12 * (0.4 + activity), 0, 5));
  }
  return Math.round(clamp(room * (0.28 + 0.72 * activity), 2, LIMITS.vehicles));
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

const footprintOf = (building: Building): Aabb => ({
  id: building.id,
  minX: building.position[0] - building.size[0] / 2,
  maxX: building.position[0] + building.size[0] / 2,
  minZ: building.position[2] - building.size[2] / 2,
  maxZ: building.position[2] + building.size[2] / 2,
});

/**
 * Every pair of building footprints that intersect. The layout guarantees this
 * is empty: a building never leaves its slot cell and cells never overlap.
 */
export function overlappingBuildings(city: CityModel): [string, string][] {
  const boxes = city.buildings.map(footprintOf).sort((a, b) => a.minX - b.minX);
  const hits: [string, string][] = [];
  const epsilon = 1e-6;
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      if (boxes[j].minX >= boxes[i].maxX) break;
      const a = boxes[i];
      const b = boxes[j];
      if (a.minZ < b.maxZ - epsilon && b.minZ < a.maxZ - epsilon) hits.push([a.id, b.id]);
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
