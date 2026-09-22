/**
 * From `city.backlog` to instance data (PLAN.md 76.9). Pure: no React, no
 * WebGL, unit tested. `Backlog.tsx` turns what this returns into buffers once
 * per city and never touches it per frame.
 *
 * Every crowd object becomes one instance of its form's mesh, carrying:
 *
 *   - a pose: position, heading, and a scale from its heat (PLAN.md 76.7,
 *     `0.9 + 0.35 * heat`), or for a scaffold the fit to its host facade;
 *   - a tint for the instance colour: state and age, before hover;
 *   - a phase, so no two neighbours flicker or blink in step;
 *   - the optional-part mask: worker, failing checks, changes requested,
 *     approved (PLAN.md 76.7's modifiers);
 *   - its reveal time and a glow from its heat;
 *   - a pick box in its own frame, for `pick.ts`.
 *
 * The halos and smoke the effect layers draw come out of the same pass, so
 * they always sit on the lamps and fires they belong to.
 */

import type { ConstructionState, IncidentForm, IncidentState, WorksForm } from "@/types/analysis";
import type { CityModel, ConstructionSite, Incident, RoadSegment } from "@/types/city";
import { RUST, mix } from "../palette";
import { SIDEWALK_HEIGHT, SIDEWALK_WIDTH } from "../groundwork";
import {
  CROWD_FORMS,
  MASK,
  PART,
  SCAFFOLD_BAY,
  formGeometry,
  formSpec,
  type CrowdForm,
} from "./forms";
import { BLINK_RATE } from "./material";

/** A box in an object's own frame, after its scale. `minY` is always the ground. */
export interface LocalBox {
  minX: number;
  maxX: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

export interface CrowdItem {
  id: string;
  form: CrowdForm;
  x: number;
  y: number;
  z: number;
  rotationY: number;
  scale: [number, number, number];
  /** Instance colour before hover and selection: state and age. */
  tint: string;
  /** 0..1. */
  phase: number;
  /** Optional parts switched on (`MASK`). */
  mask: number;
  appearAt: number;
  /** 0..1, from heat: how bright its lamps and flames burn. */
  glow: number;
  lane: boolean;
  pick: LocalBox;
}

export interface CrowdGroup {
  form: CrowdForm;
  items: CrowdItem[];
  /** `ids[i]` is the entity drawn by instance `i` (`useInstanceHandlers`). */
  ids: string[];
}

export interface HaloSpec {
  position: [number, number, number];
  color: string;
  phase: number;
  /** Pulse rate, or 0 for a fire's steady flicker. */
  rate: number;
  size: number;
  appearAt: number;
}

export interface PuffSpec {
  position: [number, number, number];
  phase: number;
  appearAt: number;
}

export interface CrowdPlan {
  groups: CrowdGroup[];
  halos: HaloSpec[];
  smoke: PuffSpec[];
  count: number;
}

/** Surface heights the crowd stands on, matching `Roads.tsx` and `groundwork.ts`. */
export const ROAD_TOP = 0.05;
export const PAVEMENT_TOP = SIDEWALK_HEIGHT;

/** Puffs per smoking object. */
const PUFFS = 3;

/** PLAN.md 76.7: instance scale from heat. */
export function crowdScale(heat: number | undefined): number {
  const h = Number.isFinite(heat) ? Math.min(1, Math.max(0, heat as number)) : 0.3;
  return 0.9 + 0.35 * h;
}

/** A stable 0..1 from an id, for phases. */
export function phaseFor(id: string): number {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return (hash % 10007) / 10007;
}

/** The form an issue draws as, when the model does not say. */
const STATE_FORM: Record<IncidentState, IncidentForm> = {
  major: "fire",
  collision: "collision",
  stale: "wreck",
  minor: "pothole",
};

export function incidentForm(incident: Incident): IncidentForm {
  return incident.form ?? incident.issue.form ?? STATE_FORM[incident.state];
}

export function worksForm(site: ConstructionSite): Exclude<WorksForm, "site"> {
  const form = site.form ?? site.pull.form;
  if (form && form !== "site") return form;
  return site.buildingId ? "scaffold" : "hoarding";
}

/** PLAN.md 76.7's modifiers, as the mask the shader reads. */
export function pullMask(site: ConstructionSite): number {
  let mask = 0;
  if (site.state !== "abandoned") mask |= MASK.worker;
  if (site.pull.checks === "failing") mask |= MASK.beacon;
  if (site.pull.review === "changes-requested") mask |= MASK.board;
  if (site.pull.review === "approved") mask |= MASK.flag;
  return mask;
}

const DAY = 86_400_000;
/** Rust and dust an idle issue gathers, at most. */
const AGE_TINT = 0.32;
const DUST = "#c9b79c";

const WHITE = "#ffffff";

/** State and age, as an instance colour multiplied over the form's paint. */
export function issueTint(state: IncidentState, idleDays: number): string {
  let tint = state === "stale" ? mix(WHITE, mix(RUST, "#ffffff", 0.35), 0.45) : WHITE;
  const age = Math.min(1, Math.max(0, idleDays / 540));
  tint = mix(tint, DUST, age * AGE_TINT);
  return tint;
}

export function pullTint(state: ConstructionState, idleDays: number): string {
  let tint = WHITE;
  if (state === "abandoned") tint = mix(WHITE, RUST, 0.6);
  else if (state === "slow") tint = "#c4c4c0";
  const age = Math.min(1, Math.max(0, idleDays / 540));
  return mix(tint, DUST, age * AGE_TINT * 0.6);
}

interface Bounds {
  minX: number;
  maxX: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

const boundsCache = new Map<CrowdForm, Bounds>();

/** A form's own extent, from its geometry at tone 0. */
export function formBounds(form: CrowdForm): Bounds {
  const hit = boundsCache.get(form);
  if (hit) return hit;
  const geometry = formGeometry(form, 0);
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  const made = {
    minX: box.min.x,
    maxX: box.max.x,
    maxY: box.max.y,
    minZ: box.min.z,
    maxZ: box.max.z,
  };
  boundsCache.set(form, made);
  return made;
}

/** Extra reach around a pick box: a two pixel object is hard to hit. */
const PICK_PAD = 0.2;

/**
 * What the pointer can hit, in the object's frame after its scale. A
 * scaffold's box is only its facade slab (PLAN.md 76.9): the building's other
 * faces and its roof still select the building.
 */
export function pickBox(form: CrowdForm, scale: readonly [number, number, number]): LocalBox {
  const [sx, sy, sz] = scale;
  if (form === "scaffold") {
    const half = (SCAFFOLD_BAY.width / 2) * sx;
    return {
      minX: -half - 0.1,
      maxX: half + 0.1,
      maxY: SCAFFOLD_BAY.height * sy + 0.3,
      minZ: 0,
      maxZ: SCAFFOLD_BAY.depth * sz,
    };
  }
  const b = formBounds(form);
  return {
    minX: b.minX * sx - PICK_PAD,
    maxX: b.maxX * sx + PICK_PAD,
    maxY: b.maxY * sy + PICK_PAD,
    minZ: b.minZ * sz - PICK_PAD,
    maxZ: b.maxZ * sz + PICK_PAD,
  };
}

/**
 * The scaffold's fit to its host facade: `size` is `[facade width, host
 * height, depth]` when the model gives one. It covers the facade's width and
 * the lower storeys, the way a real one goes up a lift at a time.
 */
export function scaffoldScale(size: readonly number[] | undefined): [number, number, number] {
  const width = size?.[0] ?? SCAFFOLD_BAY.width;
  const height = size?.[1] ?? SCAFFOLD_BAY.height;
  const sx = Math.min(1.9, Math.max(0.55, (width * 0.9) / SCAFFOLD_BAY.width));
  const sy = Math.min(1.9, Math.max(0.55, Math.min(height * 0.72, 12) / SCAFFOLD_BAY.height));
  return [sx, sy, 1];
}

// ---------------------------------------------------------------------------
// What each object stands on
// ---------------------------------------------------------------------------

const CELL = 16;

interface RoadIndex {
  cells: Map<string, number[]>;
  roads: readonly RoadSegment[];
}

function indexRoads(roads: readonly RoadSegment[]): RoadIndex {
  const cells = new Map<string, number[]>();
  roads.forEach((road, i) => {
    const reach = road.width / 2 + SIDEWALK_WIDTH + 0.5;
    const x0 = Math.floor((Math.min(road.from[0], road.to[0]) - reach) / CELL);
    const x1 = Math.floor((Math.max(road.from[0], road.to[0]) + reach) / CELL);
    const z0 = Math.floor((Math.min(road.from[2], road.to[2]) - reach) / CELL);
    const z1 = Math.floor((Math.max(road.from[2], road.to[2]) + reach) / CELL);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const key = `${cx}:${cz}`;
        const list = cells.get(key);
        if (list) list.push(i);
        else cells.set(key, [i]);
      }
    }
  });
  return { cells, roads };
}

/**
 * The surface under a point: the carriageway, the raised pavement beside it,
 * or bare ground. Village lanes have no pavement (PLAN.md 76.5), and neither
 * do highways.
 */
export function surfaceAt(x: number, z: number, index: RoadIndex): number {
  const list = index.cells.get(`${Math.floor(x / CELL)}:${Math.floor(z / CELL)}`);
  if (!list) return 0;
  let best = 0;
  for (const i of list) {
    const road = index.roads[i];
    const dx = road.to[0] - road.from[0];
    const dz = road.to[2] - road.from[2];
    const lengthSq = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - road.from[0]) * dx + (z - road.from[2]) * dz) / lengthSq));
    const off = Math.hypot(x - (road.from[0] + dx * t), z - (road.from[2] + dz * t));
    const half = road.width / 2;
    if (off <= half) return ROAD_TOP;
    const paved = road.kind !== "lane" && road.kind !== "highway";
    if (paved && off <= half + SIDEWALK_WIDTH) best = Math.max(best, PAVEMENT_TOP);
  }
  return best;
}

// ---------------------------------------------------------------------------
// The plan
// ---------------------------------------------------------------------------

function newestUpdate(city: CityModel): number {
  let newest = 0;
  const see = (iso: string) => {
    const t = Date.parse(iso);
    if (Number.isFinite(t) && t > newest) newest = t;
  };
  for (const incident of city.backlog?.incidents ?? []) see(incident.issue.updatedAt);
  for (const site of city.backlog?.constructionSites ?? []) see(site.pull.updatedAt);
  return newest;
}

const idleDays = (iso: string, newest: number): number => {
  const t = Date.parse(iso);
  return Number.isFinite(t) && newest > 0 ? Math.max(0, (newest - t) / DAY) : 0;
};

/** Every crowd object in the city, grouped by form, with its halos and smoke. */
export function planCrowd(city: CityModel): CrowdPlan {
  const backlog = city.backlog;
  const byForm = new Map<CrowdForm, CrowdItem[]>();
  const halos: HaloSpec[] = [];
  const smoke: PuffSpec[] = [];
  if (!backlog) return { groups: [], halos, smoke, count: 0 };

  const roads = indexRoads(city.roads);
  const newest = newestUpdate(city);

  const add = (item: CrowdItem) => {
    const list = byForm.get(item.form);
    if (list) list.push(item);
    else byForm.set(item.form, [item]);
  };

  for (const incident of backlog.incidents) {
    const form = incidentForm(incident);
    const s = crowdScale(incident.heat ?? incident.issue.heat);
    const scale: [number, number, number] = [s, s, s];
    const [x, , z] = incident.position;
    add({
      id: incident.id,
      form,
      x,
      y: incident.lane ? ROAD_TOP : surfaceAt(x, z, roads),
      z,
      rotationY: incident.rotationY,
      scale,
      tint: issueTint(incident.state, idleDays(incident.issue.updatedAt, newest)),
      phase: phaseFor(incident.id),
      mask: 0,
      appearAt: incident.appearAt,
      glow: incident.heat ?? incident.issue.heat ?? 0.3,
      lane: incident.lane === true,
      pick: pickBox(form, scale),
    });
  }

  for (const site of backlog.constructionSites) {
    const form = worksForm(site);
    let scale: [number, number, number];
    if (form === "scaffold") {
      scale = scaffoldScale(site.size);
    } else {
      const s = crowdScale(site.heat ?? site.pull.heat);
      scale = [s, s, s];
    }
    const [x, , z] = site.position;
    add({
      id: site.id,
      form,
      x,
      // A scaffold stands on its host's plot; everything else on what is under it.
      y: form === "scaffold" ? 0 : site.lane ? ROAD_TOP : surfaceAt(x, z, roads),
      z,
      rotationY: site.rotationY,
      scale,
      tint: pullTint(site.state, idleDays(site.pull.updatedAt, newest)),
      phase: phaseFor(site.id),
      mask: pullMask(site),
      appearAt: site.appearAt,
      glow: site.heat ?? site.pull.heat ?? 0.3,
      lane: site.lane === true,
      pick: pickBox(form, scale),
    });
  }

  const groups: CrowdGroup[] = [];
  let count = 0;
  for (const form of CROWD_FORMS) {
    const items = byForm.get(form);
    if (!items || items.length === 0) continue;
    groups.push({ form, items, ids: items.map((item) => item.id) });
    count += items.length;

    const spec = formSpec(form);
    for (const item of items) {
      const cos = Math.cos(item.rotationY);
      const sin = Math.sin(item.rotationY);
      const world = (p: readonly number[]): [number, number, number] => {
        const lx = p[0] * item.scale[0];
        const ly = p[1] * item.scale[1];
        const lz = p[2] * item.scale[2];
        return [item.x + lx * cos + lz * sin, item.y + ly, item.z - lx * sin + lz * cos];
      };
      for (const lamp of spec.lamps) {
        const optional = lamp.part >= PART.worker && lamp.part <= PART.flag;
        if (optional && (item.mask & (1 << (lamp.part - 1))) === 0) continue;
        halos.push({
          position: world(lamp.position),
          color: lamp.color,
          phase: item.phase,
          rate: BLINK_RATE[lamp.part] ?? 0,
          size: lamp.size * item.scale[0] * (lamp.part === PART.flame ? 0.7 + 0.5 * item.glow : 1),
          appearAt: item.appearAt,
        });
      }
      if (spec.smoke) {
        const origin = world(spec.smoke);
        for (let k = 0; k < PUFFS; k++) {
          smoke.push({ position: origin, phase: (item.phase + k / PUFFS) % 1, appearAt: item.appearAt });
        }
      }
    }
  }

  return { groups, halos, smoke, count };
}
