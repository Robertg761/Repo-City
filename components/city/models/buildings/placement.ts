/**
 * Per-building instance planning (PLAN.md sections 19, 35, 38).
 *
 * Turns a list of buildings into:
 *   - one group per archetype, each with the `ids` array that maps an
 *     `event.instanceId` back to the entity the inspector must show;
 *   - the quarter turn that points each building's door at the city centre,
 *     with the footprint swap that keeps its plot unchanged;
 *   - the lit windows, drawn from each archetype's own window rectangles;
 *   - the rooftop props, more of them the taller the building.
 *
 * Everything here is deterministic: the same city always gets the same doors,
 * the same lit windows and the same air-conditioning units. Pure, unit tested.
 */

import type { SettlementTier } from "@/types/analysis";
import type { Building, RoadSegment } from "@/types/city";
import {
  archetypeSeed,
  chooseArchetype,
  hash32,
  modelKeyFor,
  type ArchetypeId,
  type ModelKey,
} from "./archetypes";
import { archetypeModel, type RoofPad } from "./models";
import { facingYaw, panelCentre } from "./mesh";
import { settlementPaint } from "./palettes";

/** A building, with everything the renderer needs that is not in the model. */
export interface BuildingInstance {
  building: Building;
  archetype: ArchetypeId;
  /** The geometry drawn: the archetype or one of its variants. */
  model: ModelKey;
  /** Final yaw: the generator's rotation plus the quarter turn for the door. */
  yaw: number;
  /**
   * True when that quarter turn was odd, so the instance scale has to use
   * `[depth, height, width]` to leave the building's plot exactly as the
   * generator laid it out.
   */
  swapped: boolean;
  /**
   * The height the model is drawn at: the building's own, except that a
   * cottage or a farmhouse is never drawn taller than its proportions allow
   * (`MODEL_MAX_ASPECT`).
   */
  height: number;
  /** This building's windows are lit tonight (PLAN.md section 19). */
  lit: boolean;
  /** Hue, saturation and lightness offsets inside the district's colour. */
  hueShift: number;
  satShift: number;
  lightShift: number;
  /**
   * Settlement models only: the wall and accent colours, as hex (see
   * `palettes.ts`). Absent on the city's archetypes, which take the district
   * colour.
   */
  paint?: { wall: string; accent: string };
}

export interface ArchetypeGroup {
  archetype: ArchetypeId;
  /** One group per model, so a variant is its own instanced mesh. */
  model: ModelKey;
  /** Index of this group's first instance in the flat instance list. */
  offset: number;
  count: number;
  /** `ids[instanceId]` is the entity id of that instance (section 38). */
  ids: string[];
}

/**
 * One lit window. Everything is precomputed in the archetype's unit space so
 * the reveal loop only multiplies: no allocation, no trigonometry beyond the
 * building's own yaw (PLAN.md section 63).
 */
export interface WindowInstance {
  /** Index into the flat instance list. */
  buildingIndex: number;
  /** Centre, in unit space: x and z are footprint fractions, y is a height fraction. */
  ox: number;
  oy: number;
  oz: number;
  /** Yaw of the panel's outward normal, before the building's own yaw. */
  panelYaw: number;
  /** Width along the wall and height, in unit space. */
  uw: number;
  uh: number;
  /** True when the wall runs along the model's x axis (a +z or -z facade). */
  alongX: boolean;
}

/** The lit pane sits inside the dark one, so its frame still reads. */
const LIT_INSET = 0.86;
/** ... and a touch proud of it, so it never z-fights the pane behind it. */
const LIT_LIFT = 0.004;

export type PropKind = "ac" | "vent" | "skylight" | "antenna" | "tank";

export interface PropInstance {
  buildingIndex: number;
  kind: PropKind;
  /** Position on the roof, in the archetype's unit space. */
  x: number;
  z: number;
  /** Roof height as a fraction of the building height. */
  y: number;
  /** World-space size. Props do not stretch with the building they stand on. */
  size: [number, number, number];
  /** A few degrees of turn so a row of units is not a row of clones. */
  spin: number;
}

export interface CityBuildingPlan {
  /** Every instanced building, grouped by archetype, groups back to back. */
  instances: BuildingInstance[];
  groups: ArchetypeGroup[];
  windows: WindowInstance[];
  props: PropInstance[];
}

export interface PlanOptions {
  /** The settlement the buildings belong to. Absent means today's city. */
  settlement?: SettlementTier;
  /**
   * The street network. The village turns each house to its lane and the
   * town turns each high-street shop to the high street; the city never
   * reads it.
   */
  roads?: readonly RoadSegment[];
  /** 0..1 share of buildings whose windows are lit. */
  litShare: number;
  /** Hard cap on lit window quads, so a metropolis cannot run away. */
  windowCap?: number;
  /** Hard cap on rooftop props. */
  propCap?: number;
}

const unit = (seed: string, channel: number): number => (hash32(`${seed}:${channel}`) % 10000) / 10000;

const clamp = (n: number, lo: number, hi: number) => (n < lo ? lo : n > hi ? hi : n);

/**
 * The quarter turn that points the model's front (+z) closest to the city
 * centre. The renderer has no road data of its own, and every district faces
 * its own inner streets, so "towards the middle" is the honest approximation
 * of "towards the nearest road" (PLAN.md section 9).
 */
export function doorTurn(position: readonly number[], rotationY: number): { yaw: number; swapped: boolean } {
  const toCentreX = -position[0];
  const toCentreZ = -position[2];
  const length = Math.hypot(toCentreX, toCentreZ);
  if (length < 1e-3) return { yaw: rotationY, swapped: false };
  const nx = toCentreX / length;
  const nz = toCentreZ / length;

  let best = 0;
  let bestDot = -Infinity;
  for (let q = 0; q < 4; q++) {
    const yaw = rotationY + (q * Math.PI) / 2;
    // The model's +z axis, once the instance is rotated by `yaw`.
    const dot = Math.sin(yaw) * nx + Math.cos(yaw) * nz;
    if (dot > bestDot) {
      bestDot = dot;
      best = q;
    }
  }
  return { yaw: rotationY + (best * Math.PI) / 2, swapped: best % 2 === 1 };
}

/** The nearest point on a road's centreline to `(x, z)`, and how far away it is. */
export function nearestOnRoad(road: RoadSegment, x: number, z: number): { x: number; z: number; distance: number } {
  const ax = road.from[0];
  const az = road.from[2];
  const dx = road.to[0] - ax;
  const dz = road.to[2] - az;
  const lengthSq = dx * dx + dz * dz;
  const t = lengthSq > 0 ? clamp(((x - ax) * dx + (z - az) * dz) / lengthSq, 0, 1) : 0;
  const px = ax + dx * t;
  const pz = az + dz * t;
  return { x: px, z: pz, distance: Math.hypot(x - px, z - pz) };
}

/** The nearest point on any of `roads`, or null when there are none. */
export function nearestRoadPoint(
  roads: readonly RoadSegment[],
  x: number,
  z: number,
): { x: number; z: number; distance: number } | null {
  let best: { x: number; z: number; distance: number } | null = null;
  for (const road of roads) {
    const hit = nearestOnRoad(road, x, z);
    if (!best || hit.distance < best.distance) best = hit;
  }
  return best;
}

/**
 * A village house faces its lane (PLAN.md 76.5, village step 5). The layout
 * already turned it: `rotationY` is the lane heading plus or minus a quarter,
 * and the model's front (+z) is `(sin rotationY, cos rotationY)`. Which of the
 * two quarters is the layout's business, so the renderer only checks: if the
 * front points away from the nearest road, the house is turned round. A half
 * turn maps its square-safe footprint onto itself, so the plot is unchanged.
 */
export function laneTurn(
  position: readonly number[],
  rotationY: number,
  roads: readonly RoadSegment[],
): { yaw: number; swapped: boolean } {
  const near = nearestRoadPoint(roads, position[0], position[2]);
  if (!near || near.distance < 1e-3) return { yaw: rotationY, swapped: false };
  const toRoadX = near.x - position[0];
  const toRoadZ = near.z - position[2];
  const facing = Math.sin(rotationY) * toRoadX + Math.cos(rotationY) * toRoadZ;
  return { yaw: facing < 0 ? rotationY + Math.PI : rotationY, swapped: false };
}

/**
 * A high-street shop faces the high street (PLAN.md 76.5, town): the quarter
 * turn that points the model's front at the nearest `main` road, with the same
 * footprint swap as `doorTurn`. Without a main road it falls back to
 * `doorTurn`.
 */
export function streetTurn(
  position: readonly number[],
  rotationY: number,
  roads: readonly RoadSegment[],
): { yaw: number; swapped: boolean } {
  const main = roads.filter((road) => road.main);
  const near = nearestRoadPoint(main, position[0], position[2]);
  if (!near || near.distance < 1e-3) return doorTurn(position, rotationY);
  const nx = (near.x - position[0]) / near.distance;
  const nz = (near.z - position[2]) / near.distance;
  let best = 0;
  let bestDot = -Infinity;
  for (let q = 0; q < 4; q++) {
    const yaw = rotationY + (q * Math.PI) / 2;
    const d = Math.sin(yaw) * nx + Math.cos(yaw) * nz;
    if (d > bestDot + 1e-9) {
      bestDot = d;
      best = q;
    }
  }
  return { yaw: rotationY + (best * Math.PI) / 2, swapped: best % 2 === 1 };
}

/**
 * How a building is turned, by settlement: lane-facing in an organic village,
 * street-facing on a town's high street, and towards the centre everywhere
 * else, which is today's rule. A village drawn on the grid (no `lane` roads,
 * for instance before its layout lands) keeps the grid rule.
 */
export function buildingTurn(
  building: Building,
  settlement: SettlementTier,
  roads: readonly RoadSegment[],
): { yaw: number; swapped: boolean } {
  const rotationY = building.rotationY ?? 0;
  if (settlement === "village" && roads.some((road) => road.kind === "lane")) {
    return laneTurn(building.position, rotationY, roads);
  }
  if (settlement === "town" && building.frontage === "main-street") {
    return streetTurn(building.position, rotationY, roads);
  }
  return doorTurn(building.position, rotationY);
}

/**
 * The tallest a low settlement model may be drawn, as a multiple of its mean
 * footprint. A cottage is authored as one storey under a deep roof: stretched
 * to half again its width it stops being a cottage and becomes a witch's hat.
 * The building keeps its plot and its tier; only the drawn height is held.
 * The city's archetypes have no cap, so the city is unchanged.
 */
export const MODEL_MAX_ASPECT: Partial<Record<ModelKey, number>> = {
  cottage: 1.0,
  "cottage/tile": 1.1,
  farmhouse: 1.45,
  barn: 1.6,
  terrace: 1.25,
};

/** The height a building's model is drawn at (see `MODEL_MAX_ASPECT`). */
export function drawnHeight(model: ModelKey, size: readonly number[]): number {
  const aspect = MODEL_MAX_ASPECT[model];
  if (aspect === undefined) return size[1];
  return Math.min(size[1], aspect * ((size[0] + size[2]) / 2));
}

/** How many rooftop props a building carries: taller means busier roofs. */
export function propCount(tier: number, maxProps: number, roll: number): number {
  if (maxProps <= 0) return 0;
  let count: number;
  if (tier <= 1) count = roll < 0.25 ? 1 : 0;
  else if (tier === 2) count = roll < 0.55 ? 1 : 0;
  else if (tier === 3) count = roll < 0.4 ? 2 : 1;
  else if (tier === 4) count = roll < 0.6 ? 2 : 1;
  else count = roll < 0.75 ? 3 : 2;
  return clamp(count, 0, maxProps);
}

const PROP_SIZE: Record<PropKind, [number, number, number]> = {
  ac: [0.9, 0.5, 0.7],
  vent: [0.4, 0.62, 0.4],
  skylight: [1.0, 0.12, 0.7],
  antenna: [0.09, 2.3, 0.09],
  tank: [0.62, 1.05, 0.62],
};

/** Which props suit which height. Low roofs get skylights, towers get masts. */
function propKind(tier: number, roll: number): PropKind {
  if (tier <= 2) return roll < 0.45 ? "skylight" : roll < 0.8 ? "ac" : "vent";
  if (tier === 3) return roll < 0.45 ? "ac" : roll < 0.7 ? "vent" : roll < 0.9 ? "tank" : "skylight";
  if (tier === 4) return roll < 0.4 ? "ac" : roll < 0.62 ? "tank" : roll < 0.85 ? "vent" : "antenna";
  return roll < 0.35 ? "antenna" : roll < 0.6 ? "tank" : roll < 0.85 ? "ac" : "vent";
}

function placeOnPad(pad: RoofPad, a: number, b: number): { x: number; z: number } {
  return {
    x: pad.x + (a - 0.5) * pad.w * 0.72,
    z: pad.z + (b - 0.5) * pad.d * 0.72,
  };
}

const DEFAULT_WINDOW_CAP = 1500;
const DEFAULT_PROP_CAP = 480;

/**
 * Plan a whole city's buildings. Groups come out in a stable archetype order,
 * so React keys and instance ids are stable across re-renders of the same
 * model.
 */
export function planBuildings(
  buildings: readonly Building[],
  options: PlanOptions,
): CityBuildingPlan {
  const litShare = clamp(options.litShare, 0, 1);
  const windowCap = options.windowCap ?? DEFAULT_WINDOW_CAP;
  const propCap = options.propCap ?? DEFAULT_PROP_CAP;
  const settlement = options.settlement ?? "city";
  const roads = options.roads ?? [];

  const byModel = new Map<ModelKey, { archetype: ArchetypeId; list: Building[] }>();
  for (const building of buildings) {
    const archetype = chooseArchetype(building, settlement);
    const model = modelKeyFor(archetype, building, settlement);
    const entry = byModel.get(model);
    if (entry) entry.list.push(building);
    else byModel.set(model, { archetype, list: [building] });
  }

  const instances: BuildingInstance[] = [];
  const groups: ArchetypeGroup[] = [];
  // Map iteration order is insertion order, which follows the building list:
  // deterministic for a given city, and stable across renders of it.
  for (const [model, { archetype, list }] of byModel) {
    const offset = instances.length;
    for (const building of list) {
      const seed = archetypeSeed(building);
      const { yaw, swapped } = buildingTurn(building, settlement, roads);
      const paint = settlementPaint(model, building);
      instances.push({
        building,
        archetype,
        model,
        ...(paint ? { paint } : {}),
        height: drawnHeight(model, building.size),
        yaw,
        swapped,
        lit: unit(seed, 11) < litShare,
        // Small enough that the district still reads as one colour, large
        // enough that a block of twelve buildings is not twelve clones.
        hueShift: (unit(seed, 12) - 0.5) * 0.045,
        satShift: (unit(seed, 13) - 0.5) * 0.11,
        lightShift: (unit(seed, 14) - 0.5) * 0.15,
      });
    }
    groups.push({ archetype, model, offset, count: list.length, ids: list.map((b) => b.id) });
  }

  const windows: WindowInstance[] = [];
  const props: PropInstance[] = [];

  for (let i = 0; i < instances.length; i++) {
    const instance = instances[i];
    const model = archetypeModel(instance.model);
    const seed = archetypeSeed(instance.building);
    const tier = instance.building.tier ?? 1;

    if (instance.lit && windows.length < windowCap) {
      for (let w = 0; w < model.windows.length && windows.length < windowCap; w++) {
        // Roughly three windows in five are on in a lit building, always the
        // same three for a given building.
        if (hash32(`${seed}/w${w}`) % 100 >= 58) continue;
        const panel = model.windows[w];
        const centre = panelCentre(panel, LIT_LIFT);
        windows.push({
          buildingIndex: i,
          ox: centre[0],
          oy: centre[1],
          oz: centre[2],
          panelYaw: facingYaw(panel.facing),
          uw: panel.w * LIT_INSET,
          uh: panel.h * LIT_INSET,
          alongX: panel.facing === "+z" || panel.facing === "-z",
        });
      }
    }

    if (model.roofPads.length > 0 && props.length < propCap) {
      const count = propCount(tier, model.maxProps, unit(seed, 21));
      for (let p = 0; p < count && props.length < propCap; p++) {
        const pad = model.roofPads[p % model.roofPads.length];
        const kind = propKind(tier, unit(seed, 30 + p));
        const spot = placeOnPad(pad, unit(seed, 40 + p), unit(seed, 50 + p));
        const footprint = Math.min(instance.building.size[0], instance.building.size[2]);
        // Props are world-sized, but a shed's roof cannot take a full-size
        // tank, so they scale gently with the footprint they stand on.
        const scale = clamp(footprint / 5, 0.62, 1.35);
        const size = PROP_SIZE[kind];
        props.push({
          buildingIndex: i,
          kind,
          x: spot.x,
          z: spot.z,
          y: pad.y,
          size: [size[0] * scale, size[1] * (kind === "antenna" ? 1 : scale), size[2] * scale],
          spin: (unit(seed, 60 + p) - 0.5) * 0.7,
        });
      }
    }
  }

  return { instances, groups, windows, props };
}
