/**
 * The crowd: every open issue and pull request that is not a hero gets its
 * own object in the world (PLAN.md 76.1 decision 4, 76.7 and 76.8).
 *
 * Each `BacklogIssue` becomes a genuine `Incident` and each `BacklogPull` a
 * genuine `ConstructionSite`, with `lod: "crowd"`, its form, whether it sits
 * in a traffic lane, its footprint and its heat, so every inspector, focus and
 * tooltip path already written for heroes works on them unchanged. Hero
 * issues and pull requests past the tier's hero cap join the crowd too, most
 * significant first, so a village with twelve ranked issues still shows all
 * twelve.
 *
 * Placement, in significance order:
 *   1. anchor the item: the building with the longest path prefix of its
 *      related path (a pull request also tries its touched files), then the
 *      district its path or its title names, else nothing;
 *   2. an anchored item takes the nearest free spot of an allowed class
 *      within 40 units; an unanchored one, or one whose neighbourhood is full,
 *      takes the next spot in a seeded stride through a shuffled list;
 *   3. scaffolding goes on the host building's facade, or the next building
 *      in the district by distance, up to 35% of the buildings; past that it
 *      becomes a trench beside the host;
 *   4. lane budget: at most one lane blocker per street segment, none on a
 *      bridge of the street graph or on a highway, and at most a quarter of
 *      the street segments closed, heroes included; the rest wait on the kerb;
 *   5. an item that finds no spot is hidden and counted in the overflow.
 *
 * Every random draw comes from `prngFor(seed, "backlog")`, a stream nothing
 * else reads, so a city without a backlog is byte-identical to one generated
 * before this file existed.
 */

import type {
  BacklogIssue,
  BacklogPull,
  ConstructionState,
  DistrictPlan,
  IncidentForm,
  IncidentState,
  RankedIssue,
  RankedPull,
  RepoAnalysis,
  SettlementTier,
  WorksForm,
} from "@/types/analysis";
import type { Building, ConstructionSite, Incident, Vec3 } from "@/types/city";
import { heatOf } from "../analysis/forms.ts";
import {
  crowdConstructionText,
  crowdIncidentText,
  crowdIssueReason,
  crowdPullReason,
  type CrowdPlacement,
} from "./entities.ts";
import type { Prng } from "./prng.ts";
import {
  FACADE_DEPTH,
  claim,
  fits,
  nearestSpot,
  roadAt,
  type Box,
  type Spot,
  type SpotIndex,
  type SpotSource,
} from "./spots.ts";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** An anchored item looks this far for a free spot before it gives up on its neighbourhood. */
export const ANCHOR_REACH = 40;
/** Scaffolding never covers more than this share of the buildings. */
export const SCAFFOLD_SHARE = 0.35;
/** At most this share of the street segments may carry a lane blocker, heroes included. */
export const LANE_SHARE = 0.25;
/** The crowd rises between these times, from the centre outwards (PLAN.md 76.8, "Reveal"). */
export const CROWD_REVEAL = [2700, 3900] as const;

/** A crowd form: every form but the hero crane site. Scaffolds size themselves to their facade. */
export type CrowdForm = IncidentForm | Exclude<WorksForm, "site">;

/**
 * Natural footprint of each crowd form, `[across, height, along]` in the
 * object's own frame: local x across the road, local z along it. The
 * instance is drawn at `heatScale(heat)` times this, and `size` on the entity
 * is the scaled footprint, which is what picking and blockages must use.
 * Scaffolds are sized by their facade; hoardings by their plot when they get
 * a whole vacant slot.
 */
export const CROWD_BASE_SIZE: Record<Exclude<CrowdForm, "scaffold">, Vec3> = {
  fire: [1.4, 2.2, 1.4],
  collision: [2.2, 1.2, 3],
  wreck: [1.4, 1.1, 2.6],
  pothole: [1.4, 0.3, 1.8],
  roadblock: [2, 1.1, 0.8],
  survey: [1.2, 1, 1.2],
  signpost: [0.8, 2.4, 0.8],
  trench: [1.6, 0.5, 3],
  van: [1.3, 1.6, 3],
  hoarding: [2.8, 2, 2.8],
};
/** A hoarding with no plot to fence stands along the pavement instead. */
export const HOARDING_KERB_SIZE: Vec3 = [1.1, 2, 3];
/** Height of a hoarding round a whole vacant slot. */
const HOARDING_HEIGHT = 2;
/** Gap a whole-plot hoarding leaves inside its slot on every side. */
const WHOLE_MARGIN = 0.7;
/** Forms that close a lane when the budget allows, and wait on the kerb when not. */
export const LANE_FORMS: ReadonlySet<CrowdForm> = new Set<CrowdForm>([
  "pothole",
  "roadblock",
  "collision",
  "trench",
]);
/** How many free spots one stride search tests before giving up on a source. */
const STRIDE_ATTEMPTS = 1500;

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));
const round3 = (n: number): number => Math.round(n * 1000) / 1000;

/** PLAN.md 76.7: instance scale from heat. */
export function heatScale(heat: number): number {
  return 0.9 + 0.35 * clamp(heat, 0, 1);
}

/** A hero that carries no form yet (older analyses) gets the nearest shape its state implies. */
const FORM_FOR_STATE: Record<IncidentState, IncidentForm> = {
  major: "fire",
  collision: "collision",
  stale: "wreck",
  minor: "pothole",
};

// ---------------------------------------------------------------------------
// Paths and districts
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

interface Anchor {
  kind: CrowdPlacement["anchor"];
  x: number;
  z: number;
  building: Building | null;
  districtId: string | null;
  near: string | null;
  path: string | null;
}

const NO_ANCHOR: Anchor = {
  kind: "none",
  x: 0,
  z: 0,
  building: null,
  districtId: null,
  near: null,
  path: null,
};

/** Finds the building or district an item belongs to. */
class Anchors {
  /** Building by its own normalised path. */
  private readonly exact = new Map<string, Building>();
  /** The most important building under each directory prefix. */
  private readonly under = new Map<string, Building>();
  // Plain fields, not parameter properties: `node scripts/*.ts` strips types
  // and cannot run parameter properties.
  private readonly districts: DistrictPlan[];
  private readonly rects: ReadonlyMap<string, { x: number; z: number }>;
  private readonly names: ReadonlyMap<string, string>;

  constructor(
    buildings: readonly Building[],
    districts: DistrictPlan[],
    rects: ReadonlyMap<string, { x: number; z: number }>,
    names: ReadonlyMap<string, string>,
  ) {
    this.districts = districts;
    this.rects = rects;
    this.names = names;
    const ranked = [...buildings].sort(
      (a, b) => b.plan.score - a.plan.score || (a.id < b.id ? -1 : 1),
    );
    for (const building of ranked) {
      const path = normalizePath(building.plan.path);
      if (!path) continue;
      if (!this.exact.has(path)) this.exact.set(path, building);
      const segments = path.split("/");
      for (let k = 1; k < segments.length; k++) {
        const prefix = segments.slice(0, k).join("/");
        if (!this.under.has(prefix)) this.under.set(prefix, building);
      }
    }
  }

  resolve(paths: readonly string[], text: string): Anchor {
    // The building with the longest path that is a prefix of the named path.
    for (const raw of paths) {
      const path = normalizePath(raw);
      if (!path) continue;
      const segments = path.split("/");
      for (let k = segments.length; k >= 1; k--) {
        const hit = this.exact.get(segments.slice(0, k).join("/"));
        if (hit) return this.atBuilding(hit, raw);
      }
    }
    // A named directory with no building of its own: its most important building.
    for (const raw of paths) {
      const hit = this.under.get(normalizePath(raw));
      if (hit) return this.atBuilding(hit, raw);
    }
    for (const raw of paths) {
      const district = districtForPath(raw, this.districts);
      if (district) return this.atDistrict(district, "district-path", raw);
    }
    const mentioned = districtForText(text, this.districts);
    if (mentioned) return this.atDistrict(mentioned, "district-text", null);
    return NO_ANCHOR;
  }

  private atBuilding(building: Building, path: string): Anchor {
    return {
      kind: "building",
      x: building.position[0],
      z: building.position[2],
      building,
      districtId: building.districtId,
      near: building.plan.path,
      path,
    };
  }

  private atDistrict(district: DistrictPlan, kind: Anchor["kind"], path: string | null): Anchor {
    const rect = this.rects.get(district.id);
    if (!rect) return NO_ANCHOR;
    return {
      kind,
      x: rect.x,
      z: rect.z,
      building: null,
      districtId: district.id,
      near: this.names.get(district.id) ?? district.name,
      path,
    };
  }
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

interface IssueItem {
  kind: "issue";
  form: IncidentForm;
  heat: number;
  paths: string[];
  text: string;
  issue: RankedIssue;
}

interface PullItem {
  kind: "pull";
  form: Exclude<WorksForm, "site">;
  heat: number;
  paths: string[];
  text: string;
  pull: RankedPull;
}

type Item = IssueItem | PullItem;

function issueItem(issue: BacklogIssue, repoUrl: string): IssueItem {
  const ranked: RankedIssue = {
    number: issue.number,
    title: issue.title,
    url: `${repoUrl}/issues/${issue.number}`,
    createdAt: issue.createdAt,
    updatedAt: issue.updatedAt,
    comments: issue.comments,
    labels: issue.labels,
    author: issue.author,
    bodyExcerpt: "",
    reactions: issue.reactions,
    score: issue.score,
    state: issue.state,
    reason: crowdIssueReason(issue.form, issue.state, issue.labels),
    relatedPath: issue.relatedPath,
    form: issue.form,
    heat: issue.heat,
  };
  return {
    kind: "issue",
    form: issue.form,
    heat: clamp(issue.heat, 0, 1),
    paths: issue.relatedPath ? [issue.relatedPath] : [],
    text: issue.title,
    issue: ranked,
  };
}

/** A ranked issue past the tier's hero cap, turned into a crowd item. */
function demotedIssueItem(issue: RankedIssue): IssueItem {
  const form = issue.form ?? FORM_FOR_STATE[issue.state];
  const heat = issue.heat ?? heatOf(issue.comments, issue.reactions ?? 0);
  return {
    kind: "issue",
    form,
    heat,
    paths: issue.relatedPath ? [issue.relatedPath] : [],
    text: `${issue.title} ${issue.bodyExcerpt}`,
    issue: {
      ...issue,
      form,
      heat,
      reason: crowdIssueReason(form, issue.state, issue.labels),
    },
  };
}

function crowdWorksForm(form: WorksForm | undefined, draft: boolean): Exclude<WorksForm, "site"> {
  if (form && form !== "site") return form;
  return draft ? "hoarding" : "scaffold";
}

function pullItem(pull: BacklogPull, repoUrl: string): PullItem {
  const form = crowdWorksForm(pull.form, pull.draft);
  const ranked: RankedPull = {
    number: pull.number,
    title: pull.title,
    url: `${repoUrl}/pull/${pull.number}`,
    createdAt: pull.createdAt,
    updatedAt: pull.updatedAt,
    mergedAt: null,
    draft: pull.draft,
    comments: pull.comments,
    labels: pull.labels,
    author: pull.author,
    reactions: pull.reactions,
    review: pull.review,
    checks: pull.checks,
    files: pull.files,
    score: pull.score,
    state: openState(pull.state),
    reason: crowdPullReason(form, openState(pull.state), pull.review, pull.checks),
    form,
    relatedPath: pull.relatedPath,
    heat: pull.heat,
  };
  return {
    kind: "pull",
    form,
    heat: clamp(pull.heat, 0, 1),
    paths: [...(pull.relatedPath ? [pull.relatedPath] : []), ...pull.files],
    text: `${pull.title} ${pull.labels.join(" ")}`,
    pull: ranked,
  };
}

/** The backlog never holds a merged pull request; treat a stray one as active. */
const openState = (state: ConstructionState): ConstructionState =>
  state === "completed" ? "active" : state;

/** An open ranked pull request past the tier's hero cap, turned into a crowd item. */
function demotedPullItem(pull: RankedPull): PullItem {
  const form = crowdWorksForm(pull.form, pull.draft);
  const heat = pull.heat ?? heatOf(pull.comments, pull.reactions ?? 0);
  const state = openState(pull.state);
  return {
    kind: "pull",
    form,
    heat,
    paths: [...(pull.relatedPath ? [pull.relatedPath] : []), ...(pull.files ?? [])],
    text: `${pull.title} ${pull.labels.join(" ")}`,
    pull: {
      ...pull,
      form,
      heat,
      state,
      reason: crowdPullReason(form, state, pull.review ?? null, pull.checks ?? null),
    },
  };
}

/**
 * Merge two significance-ordered lists in proportion, so neither issues nor
 * pull requests take every good spot before the other gets a turn.
 */
export function interleave<T>(a: readonly T[], b: readonly T[]): T[] {
  const out: T[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    const takeA = j >= b.length || (i < a.length && i * b.length <= j * a.length);
    if (takeA) out.push(a[i++]);
    else out.push(b[j++]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Placement
// ---------------------------------------------------------------------------

export interface CrowdInput {
  analysis: RepoAnalysis;
  tier: SettlementTier;
  index: SpotIndex;
  buildings: readonly Building[];
  districtPlans: DistrictPlan[];
  /** District rect centres by id. */
  districtCentres: ReadonlyMap<string, { x: number; z: number }>;
  /** Hero incidents already placed; their segments count against the lane budget. */
  heroIncidents: readonly Incident[];
  /** Ranked issues past the tier's hero cap. */
  demotedIssues: readonly RankedIssue[];
  /** Open ranked pull requests past the tier's hero cap. */
  demotedPulls: readonly RankedPull[];
  prng: Prng;
}

export interface CrowdResult {
  incidents: Incident[];
  constructionSites: ConstructionSite[];
  /** Issues and pull requests the survey handed over, crowd only. */
  offered: { issues: number; pulls: number };
  /** Of those, how many found no spot. */
  hidden: { issues: number; pulls: number };
  lanes: { budget: number; used: number; crowd: number };
  scaffolds: { cap: number; placed: number };
}

interface Placed {
  spot: Spot;
  box: Box;
  size: Vec3;
  form: CrowdForm;
  host: Building | null;
  placement: CrowdPlacement;
  districtId: string | null;
}

function shuffled<T>(items: readonly T[], prng: Prng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = prng.int(0, i);
    const swap = out[i];
    out[i] = out[j];
    out[j] = swap;
  }
  return out;
}

export function placeCrowd(input: CrowdInput): CrowdResult {
  const { analysis, tier, index, buildings, prng } = input;
  const repoUrl = analysis.repo.url;

  // -- Items, most significant first ---------------------------------------
  const demoted: Item[] = [
    ...input.demotedIssues.map(demotedIssueItem),
    ...input.demotedPulls.filter((pull) => pull.state !== "completed").map(demotedPullItem),
  ];
  const backlog = interleave<Item>(
    (analysis.metrics.issues.backlog ?? []).map((issue) => issueItem(issue, repoUrl)),
    (analysis.metrics.pulls.backlog ?? []).map((pull) => pullItem(pull, repoUrl)),
  );
  const items = [...demoted, ...backlog];

  const names = new Map(input.districtPlans.map((d) => [d.id, d.name]));
  const anchors = new Anchors(buildings, input.districtPlans, input.districtCentres, names);

  // -- Lane budget --------------------------------------------------------
  const streets = index.roads.filter((road) => road.kind !== "highway").length;
  const laneBudget = Math.floor(LANE_SHARE * streets);
  const laneUsed = new Set<number>();
  for (const hero of input.heroIncidents) {
    const road = roadAt(index, hero.position[0], hero.position[2]);
    if (road >= 0 && index.roads[road].kind !== "highway") laneUsed.add(road);
  }
  const laneOpen = (road: number): boolean =>
    !laneUsed.has(road) && laneUsed.size < laneBudget;

  // -- Scaffolds ----------------------------------------------------------
  const scaffoldCap = Math.floor(SCAFFOLD_SHARE * buildings.length);
  let scaffolds = 0;
  const buildingIndex = new Map(buildings.map((b, i) => [b.id, i]));
  const byDistrict = new Map<string, Building[]>();
  for (const building of buildings) {
    const list = byDistrict.get(building.districtId);
    if (list) list.push(building);
    else byDistrict.set(building.districtId, [building]);
  }

  // -- Stride orders ------------------------------------------------------
  const collect = (predicate: (spot: Spot) => boolean): Spot[] => index.spots.filter(predicate);
  const orders: Record<SpotSource | "facade", Spot[]> = {
    kerb: shuffled(collect((s) => s.cls === "kerb"), prng),
    lane: shuffled(collect((s) => s.cls === "lane"), prng),
    ground: shuffled(collect((s) => s.cls === "ground" && !s.whole), prng),
    whole: shuffled(collect((s) => s.cls === "ground" && s.whole !== null), prng),
    facade: shuffled(collect((s) => s.cls === "facade"), prng),
  };
  const cursors: Record<SpotSource | "facade", number> = { kerb: 0, lane: 0, ground: 0, whole: 0, facade: 0 };
  /**
   * Sources in which a form has already tested every free spot and found none
   * that fits. Spots only ever get taken, never freed, so no later item of
   * that form will find one either: both searches skip the source from then
   * on. (A later item with less heat is a little smaller and might just have
   * fitted; that is the price of keeping a saturated village linear.)
   */
  const exhausted = new Set<string>();

  const stride = (
    source: SpotSource | "facade",
    form: CrowdForm,
    accept: (spot: Spot) => Box | null,
  ): { spot: Spot; box: Box } | null => {
    const key = `${source}:${form}`;
    if (exhausted.has(key)) return null;
    const order = orders[source];
    let start = cursors[source];
    while (start < order.length && order[start].taken) start++;
    cursors[source] = start;
    let attempts = 0;
    let k = start;
    for (; k < order.length && attempts < STRIDE_ATTEMPTS; k++) {
      const spot = order[k];
      if (spot.taken) continue;
      attempts += 1;
      const box = accept(spot);
      if (box) return { spot, box };
    }
    if (k >= order.length) exhausted.add(key);
    return null;
  };

  // -- Footprints ---------------------------------------------------------
  const sizeFor = (form: CrowdForm, spot: Spot, heat: number): Vec3 => {
    if (form === "scaffold" && spot.face) return [spot.face.w, spot.face.h, FACADE_DEPTH];
    if (form === "hoarding" && spot.whole) {
      return [
        round3(Math.max(2.4, spot.whole.w - 2 * WHOLE_MARGIN)),
        HOARDING_HEIGHT,
        round3(Math.max(2.4, spot.whole.d - 2 * WHOLE_MARGIN)),
      ];
    }
    const base =
      form === "hoarding" && (spot.cls === "kerb" || spot.cls === "lane")
        ? HOARDING_KERB_SIZE
        : CROWD_BASE_SIZE[form as Exclude<CrowdForm, "scaffold">];
    const scale = heatScale(heat);
    return [round3(base[0] * scale), round3(base[1] * scale), round3(base[2] * scale)];
  };
  const boxOf = (spot: Spot, size: Vec3): Box => ({
    x: spot.x,
    z: spot.z,
    hw: size[0] / 2,
    hd: size[2] / 2,
    rot: spot.rotationY,
  });

  /** A spot this form may take, with the box it would occupy, or null. */
  const tryAt = (form: CrowdForm, heat: number, spot: Spot): Box | null => {
    if (spot.taken) return null;
    if (spot.cls === "lane" && !laneOpen(spot.road)) return null;
    const box = boxOf(spot, sizeFor(form, spot, heat));
    return fits(index, spot, box) ? box : null;
  };

  /** Nearest acceptable spot over each pass in turn, then the stride over the same passes. */
  const find = (
    form: CrowdForm,
    heat: number,
    anchor: Anchor,
    passes: readonly (readonly SpotSource[])[],
  ): { spot: Spot; box: Box; displaced: boolean } | null => {
    if (anchor.kind !== "none") {
      for (const pass of passes) {
        if (pass.every((source) => exhausted.has(`${source}:${form}`))) continue;
        const held: { box: Box | null } = { box: null };
        const spot = nearestSpot(index, pass, anchor.x, anchor.z, ANCHOR_REACH, (candidate) => {
          held.box = tryAt(form, heat, candidate);
          return held.box !== null;
        });
        if (spot && held.box) return { spot, box: held.box, displaced: false };
      }
    }
    for (const pass of passes) {
      for (const source of pass) {
        const hit = stride(source, form, (spot) => tryAt(form, heat, spot));
        if (hit) return { ...hit, displaced: anchor.kind !== "none" };
      }
    }
    return null;
  };

  const passesFor = (form: CrowdForm): SpotSource[][] => {
    if (LANE_FORMS.has(form)) return [["lane"], ["kerb"]];
    if (form === "wreck" || form === "survey") return [["kerb", "ground"]];
    if (form === "hoarding") return [["whole"], ["ground"], ["kerb"]];
    return [["kerb"]];
  };

  const basePlacement = (anchor: Anchor): CrowdPlacement => ({
    anchor: anchor.kind,
    near: anchor.near,
    path: anchor.path,
    displaced: false,
    kerbed: false,
    host: null,
    demoted: null,
    tier,
  });

  /** Scaffolding on the host's facade, or the next building in its district by distance. */
  const placeScaffold = (item: PullItem, anchor: Anchor): Placed | "cap" | "no-facade" => {
    if (scaffolds >= scaffoldCap) return "cap";
    let host = anchor.building;
    if (!host && anchor.districtId) {
      // A district anchor: the building nearest the district centre hosts it.
      host = nearestIn(byDistrict.get(anchor.districtId) ?? [], anchor.x, anchor.z);
    }
    const tryHost = (building: Building): Placed | null => {
      const spot = index.facades[buildingIndex.get(building.id) ?? -1];
      if (!spot || spot.taken) return null;
      const size = sizeFor("scaffold", spot, item.heat);
      const box = boxOf(spot, size);
      if (!fits(index, spot, box)) return null;
      return {
        spot,
        box,
        size,
        form: "scaffold",
        host: building,
        placement: { ...basePlacement(anchor), host: building.plan.path },
        districtId: building.districtId,
      };
    };
    if (host) {
      const mates = (byDistrict.get(host.districtId) ?? [])
        .filter((b) => b !== host)
        .map((b) => ({ b, d: Math.hypot(b.position[0] - host!.position[0], b.position[2] - host!.position[2]) }))
        .sort((a, b) => a.d - b.d || (a.b.id < b.b.id ? -1 : 1));
      for (const candidate of [host, ...mates.map((m) => m.b)]) {
        const placed = tryHost(candidate);
        if (placed) return placed;
      }
      return "no-facade";
    }
    const hit = stride("facade", "scaffold", (spot) => {
      const placed = tryHost(buildings[spot.building]);
      return placed ? placed.box : null;
    });
    if (!hit) return "no-facade";
    return tryHost(buildings[hit.spot.building]) ?? "no-facade";
  };

  // -- Place everything ---------------------------------------------------
  const incidents: Incident[] = [];
  const sites: ConstructionSite[] = [];
  let hiddenIssues = 0;
  let hiddenPulls = 0;
  let crowdLanes = 0;

  for (const item of items) {
    const anchor = anchors.resolve(item.paths, item.text);
    let placed: Placed | null = null;

    if (item.kind === "pull" && item.form === "scaffold") {
      const result = placeScaffold(item, anchor);
      if (typeof result !== "string") {
        placed = result;
      } else {
        // Past the cap, or no facade free: a trench in the road beside the
        // building or district the pull request points at.
        const found = find("trench", item.heat, anchor, passesFor("trench"));
        if (found) {
          placed = {
            ...found,
            size: sizeFor("trench", found.spot, item.heat),
            form: "trench",
            host: null,
            placement: {
              ...basePlacement(anchor),
              displaced: found.displaced,
              kerbed: found.spot.cls === "kerb",
              demoted: result,
            },
            districtId: anchor.districtId,
          };
        }
      }
    } else {
      const form = item.form;
      const found = find(form, item.heat, anchor, passesFor(form));
      if (found) {
        placed = {
          ...found,
          size: sizeFor(form, found.spot, item.heat),
          form,
          host: null,
          placement: {
            ...basePlacement(anchor),
            displaced: found.displaced,
            kerbed: LANE_FORMS.has(form) && found.spot.cls === "kerb",
          },
          districtId: anchor.districtId,
        };
      }
    }

    if (!placed) {
      if (item.kind === "issue") hiddenIssues += 1;
      else hiddenPulls += 1;
      continue;
    }

    const { spot, box, size } = placed;
    const id = item.kind === "issue" ? `incident-${item.issue.number}` : `construction-${item.pull.number}`;
    claim(index, spot, box, id);
    const lane = spot.cls === "lane";
    if (lane) {
      laneUsed.add(spot.road);
      crowdLanes += 1;
      for (const sibling of index.lanesByRoad.get(spot.road) ?? []) sibling.taken = true;
    }
    if (placed.form === "scaffold") scaffolds += 1;

    const common = {
      position: [spot.x, 0, spot.z] as Vec3,
      rotationY: spot.rotationY,
      appearAt: 0,
      ...(placed.districtId ? { districtId: placed.districtId } : {}),
      lod: "crowd" as const,
      lane,
      size,
    };
    if (item.kind === "issue") {
      incidents.push({
        id,
        kind: "incident",
        ...crowdIncidentText(item.issue, item.form, analysis.generatedAt, placed.placement),
        ...common,
        state: item.issue.state,
        issue: item.issue,
        form: item.form,
        heat: round3(item.heat),
      });
    } else {
      sites.push({
        id,
        kind: "construction",
        ...crowdConstructionText(
          item.pull,
          placed.form as WorksForm,
          analysis.generatedAt,
          placed.placement,
        ),
        ...common,
        state: item.pull.state,
        pull: item.pull,
        form: placed.form as WorksForm,
        buildingId: placed.host?.id ?? null,
        heat: round3(item.heat),
      });
    }
  }

  assignCrowdReveal([...incidents, ...sites]);

  const offeredIssues = items.filter((item) => item.kind === "issue").length;
  return {
    incidents,
    constructionSites: sites,
    offered: { issues: offeredIssues, pulls: items.length - offeredIssues },
    hidden: { issues: hiddenIssues, pulls: hiddenPulls },
    lanes: { budget: laneBudget, used: laneUsed.size, crowd: crowdLanes },
    scaffolds: { cap: scaffoldCap, placed: scaffolds },
  };
}

function nearestIn(buildings: readonly Building[], x: number, z: number): Building | null {
  let best: Building | null = null;
  let bestD = Infinity;
  for (const building of buildings) {
    const d = Math.hypot(building.position[0] - x, building.position[2] - z);
    if (d < bestD - 1e-9 || (Math.abs(d - bestD) <= 1e-9 && best && building.id < best.id)) {
      best = building;
      bestD = d;
    }
  }
  return best;
}

/** The crowd ripples outwards from the centre between 2.7 and 3.9 seconds. */
function assignCrowdReveal(entities: (Incident | ConstructionSite)[]): void {
  const sorted = [...entities].sort((a, b) => {
    const ra = a.position[0] ** 2 + a.position[2] ** 2;
    const rb = b.position[0] ** 2 + b.position[2] ** 2;
    return ra - rb || (a.id < b.id ? -1 : 1);
  });
  const [start, end] = CROWD_REVEAL;
  sorted.forEach((entity, i) => {
    entity.appearAt =
      sorted.length <= 1 ? start : Math.round(start + ((end - start) * i) / (sorted.length - 1));
  });
}
