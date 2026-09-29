/**
 * The fire station: test infrastructure as the city's emergency service
 * (PLAN.md section 15). Detected infrastructure, never claimed coverage.
 *
 * Natural size 18 x 9 x 15, bay doors on +z facing the city centre.
 *
 *   level 1  one bay, a drying mast, a flag
 *   level 2  two bays, a hose tower, one engine on the apron
 *   level 3  three bays, a hose tower, two engines, a training yard
 *
 * Level 0 never reaches the renderer: `planLandmarks` only emits the landmark
 * when test infrastructure was actually detected.
 */

import type { BufferGeometry } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { SURFACE } from "../../textures/surface-types";
import { importedMarkers, importedSlots, type ImportedModel } from "../imported";
import { BLENDER_MODELS } from "../modelSource";
import { Assembly, cached, type Slots, type V3 } from "./assembly";
import { MODEL as FIRE_STATION } from "./fireStation.model";

/**
 * The procedural station's slots, and the Blender one's extra four: light
 * metal, near-black, planting and the engines' blue glass.
 */
export type FireSlot = "deck" | "wall" | "red" | "trim" | "steel" | "glass" | "metal" | "dark" | "green" | "blue";

const DECK = 0.45;
const BAY = 3.5;
const HALL_Z0 = -4.2;
const HALL_Z1 = 2.6;
const HALL_H = 4.6;
const TRUCK_Z = 5.05;

type A = Assembly<FireSlot>;

export interface FireLayout {
  slots: Slots<FireSlot>;
  /** Roof lights on every parked engine, drawn by React so they can blink. */
  beacons: V3[];
}

const bays = (level: number): number => Math.min(3, Math.max(1, level));
const hallWidth = (level: number): number => bays(level) * BAY + 1.0;
const hallCentre = (level: number): number => (level >= 2 ? -1.6 : -1.0);
const towerX = (level: number): number => hallCentre(level) + hallWidth(level) / 2 + 1.5;

/** Bay centres, left to right. */
function bayCentres(level: number): number[] {
  const count = bays(level);
  return Array.from({ length: count }, (_, i) => hallCentre(level) + (i - (count - 1) / 2) * BAY);
}

/** A parked engine, nose out towards the city. */
function engine(a: A, cx: number, cz: number): void {
  a.box("steel", [1.9, 0.45, 4.4], { at: [cx, DECK + 0.35, cz] });
  a.box("red", [2.0, 0.85, 4.6], { at: [cx, DECK + 0.78, cz] });
  a.box("red", [1.8, 0.52, 2.8], { at: [cx, DECK + 1.45, cz - 0.8] });
  a.box("red", [1.95, 1.05, 1.5], { at: [cx, DECK + 1.73, cz + 1.5] });
  a.box("glass", [1.7, 0.6, 0.1], { at: [cx, DECK + 1.82, cz + 2.23] });
  for (const s of [-1, 1]) {
    a.box("glass", [0.1, 0.5, 1.1], { at: [cx + s * 0.99, DECK + 1.82, cz + 1.5] });
    for (const dz of [-0.5, -1.7]) {
      a.box("trim", [0.07, 0.55, 1.05], { at: [cx + s * 1.01, DECK + 0.9, cz + dz] });
    }
    a.box("trim", [0.08, 0.08, 3.3], { at: [cx + s * 0.45, DECK + 1.78, cz - 0.7] });
    for (const wz of [1.45, -1.45]) {
      a.cylinder("steel", 0.42, 0.42, 0.26, 8, {
        at: [cx + s * 0.95, DECK + 0.42, cz + wz],
        rot: [0, 0, Math.PI / 2],
      });
      a.cylinder("trim", 0.2, 0.2, 0.31, 8, { at: [cx + s * 0.95, DECK + 0.42, cz + wz], rot: [0, 0, Math.PI / 2] });
    }
    a.box("glass", [0.09, 0.16, 0.16], { at: [cx + s * 1.025, DECK + 1.88, cz + 2.04] });
    a.panel("trim", 0.12, 0.07, { at: [cx + s * 0.72, DECK + 0.88, cz + 2.325] });
  }
  for (let i = 0; i < 11; i++) {
    a.box("trim", [0.82, 0.055, 0.055], { at: [cx, DECK + 1.78, cz - 2.15 + i * 0.35] });
  }
  for (const y of [0.59, 0.67, 0.75]) a.panel("steel", 1.1, 0.025, { at: [cx, DECK + y, cz + 2.335] });
  a.box("red", [1.2, 0.16, 0.5], { at: [cx, DECK + 2.32, cz + 1.4] });
}

/** The hose-drying tower: the silhouette that says "fire station" at range. */
function hoseTower(a: A, x: number): void {
  const height = 7.4;
  a.box("wall", [2.6, height, 2.6], { at: [x, DECK + height / 2, -1.4] });
  a.box("red", [3.05, 0.3, 3.05], { at: [x, DECK + height - 0.1, -1.4] });
  a.box("trim", [3.0, 0.35, 3.0], { at: [x, DECK + height + 0.22, -1.4] });
  a.box("glass", [0.7, 4.2, 0.1], { at: [x, DECK + 3.6, -0.06] });
  // The rungs stand proud of the window strip they cross.
  for (let i = 0; i < 4; i++) {
    a.box("steel", [1.6, 0.14, 0.16], { at: [x, DECK + 5.3 + i * 0.42, -0.06] });
  }
  for (const s of [-0.45, 0.45]) {
    a.strut("steel", [x + 1.33, DECK, -1.4 + s], [x + 1.33, DECK + height, -1.4 + s], 0.05, 4);
  }
  for (let i = 0; i < 9; i++) {
    a.box("steel", [0.06, 0.06, 0.9], { at: [x + 1.33, DECK + 0.6 + i * 0.78, -1.4] });
  }
}

/** Hurdles, a drill wall and a hose reel: level 3 trains its crews. */
function trainingYard(a: A): void {
  a.box("deck", [4.0, 0.12, 4.6], { at: [6.6, DECK + 0.06, 4.7] });
  a.box("wall", [2.4, 2.6, 0.25], { at: [6.6, DECK + 1.3, 2.9] });
  for (const wx of [-0.6, 0.6]) {
    a.box("glass", [0.7, 0.8, 0.1], { at: [6.6 + wx, DECK + 1.9, 3.05] });
  }
  for (let i = 0; i < 2; i++) {
    const x = 5.6 + i * 2.0;
    for (const s of [-0.7, 0.7]) {
      a.box("steel", [0.1, 1.2, 0.1], { at: [x, DECK + 0.6, 5.2 + s] });
    }
    a.box("steel", [0.1, 0.1, 1.5], { at: [x, DECK + 1.15, 5.2] });
  }
  a.cylinder("red", 0.5, 0.5, 0.6, 10, {
    at: [8.0, DECK + 0.5, 6.4],
    rot: [0, 0, Math.PI / 2],
  });
  a.box("steel", [0.14, 1.0, 0.14], { at: [8.0, DECK + 0.5, 6.4] });
  a.cylinder("steel", 0.31, 0.31, 0.07, 10, { at: [8.34, DECK + 0.5, 6.4], rot: [0, 0, Math.PI / 2] });
}

function buildFire(level: number): FireLayout {
  const a = new Assembly<FireSlot>({ deck: SURFACE.concrete, wall: SURFACE.brick, red: SURFACE.metal, trim: SURFACE.concrete, steel: SURFACE.metal, glass: SURFACE.glass });
  const width = hallWidth(level);
  const x = hallCentre(level);
  const depth = HALL_Z1 - HALL_Z0;
  const midZ = (HALL_Z0 + HALL_Z1) / 2;

  a.box("deck", [17.6, DECK, 14.6], { at: [0, DECK / 2, 0] });
  // The forecourt the engines stand on, a shade lighter than the apron edge.
  a.box("deck", [width + 2.4, 0.08, 4.8], { at: [x, DECK + 0.04, 4.9] });

  a.box("wall", [width, HALL_H, depth], { at: [x, DECK + HALL_H / 2, midZ] });
  a.box("red", [width + 0.9, 0.3, depth + 0.8], { at: [x, DECK + HALL_H - 0.15, midZ] });
  a.box("trim", [width + 0.8, 0.42, depth + 0.7], { at: [x, DECK + HALL_H + 0.21, midZ] });

  for (const bx of bayCentres(level)) {
    a.box("red", [2.9, 3.2, 0.14], { at: [bx, DECK + 1.6, HALL_Z1 + 0.08] });
    for (const s of [-1, 1]) {
      a.box("trim", [0.22, 3.6, 0.13], { at: [bx + s * 1.61, DECK + 1.8, HALL_Z1 + 0.08] });
    }
    a.box("trim", [3.44, 0.22, 0.13], { at: [bx, DECK + 3.31, HALL_Z1 + 0.08] });
    // Door ribs, so a bay door is not one flat red rectangle up close. They
    // stop short of the door's edges: as wide as the door, their ends lay in
    // the plane of its sides.
    for (let i = 0; i < 4; i++) {
      a.box("trim", [2.84, 0.06, 0.04], { at: [bx, DECK + 0.6 + i * 0.7, HALL_Z1 + 0.16] });
    }
    for (const dx of [-0.85, 0, 0.85]) {
      a.panel("glass", 0.58, 0.38, { at: [bx + dx, DECK + 2.42, HALL_Z1 + 0.161] });
    }
    a.panel("steel", 0.38, 0.045, { at: [bx, DECK + 0.42, HALL_Z1 + 0.162] });
  }

  a.box("glass", [width - 1.4, 0.55, 0.1], { at: [x, DECK + 3.95, HALL_Z1 + 0.05] });
  for (const s of [-1, 1]) {
    for (const wz of [-3.0, -0.8, 1.4]) {
      a.box("glass", [0.1, 0.85, 1.2], { at: [x + (s * width) / 2 - s * 0.02, DECK + 3.3, wz] });
    }
  }

  // Level 1 has no tower, so it gets the drying mast a small station uses.
  if (level >= 2) hoseTower(a, towerX(level));
  else {
    a.cylinder("steel", 0.1, 0.14, 5.0, 6, { at: [towerX(level) - 0.4, DECK + 2.5, -1.0] });
    a.box("steel", [0.9, 0.1, 0.1], { at: [towerX(level) - 0.4, DECK + 4.9, -1.0] });
  }

  // Roof parapet and vents: the roof is the largest surface the overview
  // camera sees, and a blank slab that size reads as a missing texture.
  for (const s of [-1, 1]) {
    a.box("trim", [width + 0.8, 0.22, 0.16], {
      at: [x, DECK + HALL_H + 0.5, midZ + (s * (depth + 0.7)) / 2],
    });
    a.box("trim", [0.16, 0.22, depth + 0.7], {
      at: [x + (s * (width + 0.8)) / 2, DECK + HALL_H + 0.5, midZ],
    });
  }
  for (let i = 0; i < 2; i++) {
    a.box("steel", [1.1, 0.42, 0.9], { at: [x - 1.4 + i * 2.8, DECK + HALL_H + 0.63, midZ - 1.6] });
    for (let rib = 0; rib < 5; rib++) {
      a.panel("trim", 0.85, 0.035, { at: [x - 1.4 + i * 2.8, DECK + HALL_H + 0.845, midZ - 1.92 + rib * 0.15], rot: [-Math.PI / 2, 0, 0] });
    }
  }
  const solarY = DECK + HALL_H + 0.6;
  for (const dx of level >= 2 ? [-2.3, 0, 2.3] : [-0.95, 0.95]) {
    const px = x + dx;
    a.box("steel", [1.7, 0.08, 1.3], { at: [px, solarY, midZ + 1.45] });
    a.panel("glass", 1.55, 1.15, { at: [px, solarY + 0.065, midZ + 1.45], rot: [-Math.PI / 2, 0, 0] });
    for (const gx of [-0.48, 0, 0.48]) a.panel("steel", 0.015, 1.1, { at: [px + gx, solarY + 0.095, midZ + 1.45], rot: [-Math.PI / 2, 0, 0] });
    for (const gz of [-0.3, 0.3]) a.panel("steel", 1.5, 0.015, { at: [px, solarY + 0.095, midZ + 1.45 + gz], rot: [-Math.PI / 2, 0, 0] });
  }
  for (const side of [-1, 1]) {
    for (let row = 0; row < 7; row++) {
      if (row === 4 || row === 5) continue;
      a.panel("trim", depth - 0.2, 0.025, { at: [x + side * (width / 2 + 0.008), DECK + 0.35 + row * 0.67, midZ], rot: [0, side * Math.PI / 2, 0] });
    }
    a.box("steel", [0.1, HALL_H - 0.2, 0.1], { at: [x + side * (width / 2 + 0.09), DECK + (HALL_H - 0.2) / 2, HALL_Z0 + 0.25] });
  }

  // Bay approach markings on the forecourt.
  for (const bx of bayCentres(level)) {
    for (let i = 0; i < 4; i++) {
      a.box("trim", [0.14, 0.03, 0.7], {
        at: [bx - 1.5, DECK + 0.1, HALL_Z1 + 0.9 + i * 1.05],
      });
      a.box("trim", [0.14, 0.03, 0.7], {
        at: [bx + 1.5, DECK + 0.1, HALL_Z1 + 0.9 + i * 1.05],
      });
    }
  }

  // The flag: every station flies one, and it is the cheapest colour on the
  // plot that reads from the overview camera. It clears the roof, and it
  // points away from the building so it is never a sliver against a wall.
  const flagX = x - width / 2 - 1.1;
  a.cylinder("steel", 0.07, 0.1, 6.6, 6, { at: [flagX, DECK + 3.3, 2.0] });
  a.box("red", [1.5, 0.9, 0.06], { at: [flagX + 0.78, DECK + 6.0, 2.0] });

  const beacons: V3[] = [];
  if (level >= 2) {
    for (const bx of bayCentres(level).slice(0, level >= 3 ? 2 : 1)) {
      engine(a, bx, TRUCK_Z);
      beacons.push([bx, DECK + 2.52, TRUCK_Z + 1.4]);
    }
  }
  if (level >= 3) trainingYard(a);

  return { slots: a.build(), beacons };
}

export function fireStation(level: number): FireLayout {
  const clamped = Math.min(3, Math.max(1, Math.round(level)));
  if (BLENDER_MODELS) return cached(`fire-blender:${clamped}`, () => blenderFire(clamped));
  return cached(`fire:${clamped}`, () => buildFire(clamped));
}

/**
 * Spike: the station modelled in Blender (`blender/fire_station.py`), with
 * the Blender fire engine parked at each of the level's engine markers.
 * Every slot carries baked occlusion in its vertex colour.
 */
export function blenderFire(level: number): FireLayout {
  return blenderFireFrom(level, FIRE_STATION, "");
}

/**
 * The same station from a model whose nodes are `Station<level><suffix>` and
 * `Engine<suffix>` (the near level, `near.ts`). The engine spots and roof
 * lamps are the lean model's markers, which every level shares.
 */
export function blenderFireFrom(level: number, model: ImportedModel, suffix: string): FireLayout {
  const engines = importedMarkers(FIRE_STATION, `Station${level}.engine.`);
  const lamps = importedMarkers(FIRE_STATION, "Engine.lamp.");
  const lists: Record<string, BufferGeometry[]> = importedSlots(model, `Station${level}${suffix}`);
  if (engines.length) {
    for (const [slot, list] of Object.entries(importedSlots(model, `Engine${suffix}`, engines))) {
      (lists[slot] ??= []).push(...list);
    }
  }
  const slots: Partial<Record<FireSlot, BufferGeometry>> = {};
  for (const [slot, list] of Object.entries(lists)) {
    const merged = mergeGeometries(list, false);
    if (!merged) throw new Error(`blenderFire: slot ${slot} could not be merged`);
    merged.computeBoundingSphere();
    slots[slot as FireSlot] = merged;
  }
  const beacons: V3[] = engines.flatMap(([ex, ey, ez]) =>
    lamps.map(([lx, ly, lz]): V3 => [ex + lx, ey + ly, ez + lz]),
  );
  return { slots, beacons };
}
