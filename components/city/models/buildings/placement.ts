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

import type { Building } from "@/types/city";
import { chooseArchetype, archetypeSeed, hash32, type ArchetypeId } from "./archetypes";
import { archetypeModel, type RoofPad } from "./models";
import { facingYaw, panelCentre } from "./mesh";

/** A building, with everything the renderer needs that is not in the model. */
export interface BuildingInstance {
  building: Building;
  archetype: ArchetypeId;
  /** Final yaw: the generator's rotation plus the quarter turn for the door. */
  yaw: number;
  /**
   * True when that quarter turn was odd, so the instance scale has to use
   * `[depth, height, width]` to leave the building's plot exactly as the
   * generator laid it out.
   */
  swapped: boolean;
  /** This building's windows are lit tonight (PLAN.md section 19). */
  lit: boolean;
  /** Hue, saturation and lightness offsets inside the district's colour. */
  hueShift: number;
  satShift: number;
  lightShift: number;
}

export interface ArchetypeGroup {
  archetype: ArchetypeId;
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

  const byArchetype = new Map<ArchetypeId, Building[]>();
  for (const building of buildings) {
    const id = chooseArchetype(building);
    const list = byArchetype.get(id);
    if (list) list.push(building);
    else byArchetype.set(id, [building]);
  }

  const instances: BuildingInstance[] = [];
  const groups: ArchetypeGroup[] = [];
  // Map iteration order is insertion order, which follows the building list:
  // deterministic for a given city, and stable across renders of it.
  for (const [archetype, list] of byArchetype) {
    const offset = instances.length;
    for (const building of list) {
      const seed = archetypeSeed(building);
      const { yaw, swapped } = doorTurn(building.position, building.rotationY ?? 0);
      instances.push({
        building,
        archetype,
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
    groups.push({ archetype, offset, count: list.length, ids: list.map((b) => b.id) });
  }

  const windows: WindowInstance[] = [];
  const props: PropInstance[] = [];

  for (let i = 0; i < instances.length; i++) {
    const instance = instances[i];
    const model = archetypeModel(instance.archetype);
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
