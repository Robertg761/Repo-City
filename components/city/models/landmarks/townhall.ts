/**
 * The town hall: the repository itself, at the centre of the civic square
 * (PLAN.md sections 10 and 23). It is the tallest thing on the plaza and the
 * one landmark every city has.
 *
 * Not to be confused with the five civic FILE buildings that stand around it
 * (README, manifest, CHANGELOG, CONTRIBUTING, Dockerfile), which are ordinary
 * buildings and live in `components/city/models/buildings/civic.ts`.
 *
 * Natural size 14 x 14 x 14, portico on +z. The plot is square and the
 * generator never rotates it, so the composition is symmetric except for the
 * steps, the clock and the forecourt fountain, which all face the front.
 */

import { SURFACE } from "../../textures/surface-types";
import { importedMarker } from "../imported";
import { BLENDER_MODELS } from "../modelSource";
import { Assembly, cached, type Slots, type V3 } from "./assembly";
import { blenderSlots } from "./blenderSlots";
import { landmarkLife, type LandmarkLife } from "./life";
import { MODEL as TOWN_HALL } from "./townHall.model";

export type CivicSlot = "stone" | "wall" | "accent" | "metal" | "glass";

type A = Assembly<CivicSlot>;

const PODIUM_TOP = 1.2;
const BLOCK_H = 4.8;
const CORNICE_Y = PODIUM_TOP + BLOCK_H;

export interface CivicLayout {
  slots: Slots<CivicSlot>;
  /** The lantern above the dome, which React lights. */
  lantern: V3;
  /** What moves: the clock's hands and the flags' cloth, nodes of their own in the Blender models (`life.ts`). */
  life?: LandmarkLife;
}

function colonnade(a: A): void {
  const z = 3.85;
  for (let i = 0; i < 6; i++) {
    const x = -3.0 + i * 1.2;
    a.cylinder("wall", 0.26, 0.3, 4.3, 8, { at: [x, PODIUM_TOP + 2.15, z] });
    a.cylinder("stone", 0.38, 0.38, 0.18, 8, { at: [x, PODIUM_TOP + 0.09, z] });
    a.cylinder("stone", 0.38, 0.38, 0.2, 8, { at: [x, PODIUM_TOP + 4.2, z] });
  }
  // Pilasters on the two returns, so the order wraps the corner.
  for (const s of [-1, 1]) {
    for (const pz of [1.6, 0.0, -1.6]) {
      a.box("wall", [0.3, 4.3, 0.5], { at: [s * 3.75, PODIUM_TOP + 2.15, pz] });
    }
  }
}

function fountain(a: A): void {
  const z = 5.95;
  a.cylinder("stone", 0.92, 1.0, 0.5, 14, { at: [0, 0.4, z] });
  // The water stands clear of the basin's top rather than a hair above it.
  a.cylinder("glass", 0.78, 0.78, 0.12, 14, { at: [0, 0.62, z] });
  a.cylinder("stone", 0.26, 0.34, 0.75, 8, { at: [0, 0.82, z] });
  a.cylinder("glass", 0.1, 0.22, 0.85, 8, { at: [0, 1.6, z] });
  a.sphere("glass", 0.16, { at: [0, 2.06, z] }, 8, 6);
}

function buildCivic(): CivicLayout {
  const a = new Assembly<CivicSlot>({ stone: SURFACE.stone, wall: SURFACE.stone, accent: SURFACE.metal, metal: SURFACE.metal, glass: SURFACE.glass });

  // Plaza, then three steps up to the hall.
  a.box("stone", [13.2, 0.3, 13.2], { at: [0, 0.15, 0] });
  const tiers: [number, number, number][] = [
    [10.4, 9.8, 0.45],
    [9.6, 9.2, 0.75],
    [8.8, 8.6, 1.05],
  ];
  for (const [w, d, y] of tiers) {
    a.box("stone", [w, 0.3, d], { at: [0, y, 0] });
  }

  a.box("wall", [7.2, BLOCK_H, 7.2], { at: [0, PODIUM_TOP + BLOCK_H / 2, 0] });
  colonnade(a);
  // The architrave the columns carry, then the cornice over the whole block.
  a.box("stone", [8.0, 0.5, 0.95], { at: [0, CORNICE_Y - 0.25, 3.85] });
  a.box("stone", [8.4, 0.55, 8.4], { at: [0, CORNICE_Y + 0.275, 0] });
  for (const side of [-1, 1]) {
    a.box("metal", [0.11, 4.7, 0.11], { at: [side * 3.72, PODIUM_TOP + 2.35, -3.35] });
    for (let i = 0; i < 7; i++) {
      a.box("stone", [0.25, 0.15, 0.25], { at: [side * 4.23, CORNICE_Y + 0.07, -3.6 + i * 1.18] });
    }
    a.box("stone", [8.0, 0.22, 0.24], { at: [0, PODIUM_TOP + 0.45, side * 3.72] });
  }

  // The pediment over the portico, with the town clock in its tympanum.
  const pedimentBase = CORNICE_Y + 0.55;
  a.gable("stone", 3.5, 1.5, 1.5, { at: [0, pedimentBase + 0.5, 3.95] });
  a.cylinder("metal", 0.58, 0.58, 0.12, 14, {
    at: [0, pedimentBase + 0.52, 4.66],
    rot: [Math.PI / 2, 0, 0],
  });
  a.cylinder("glass", 0.48, 0.48, 0.14, 14, {
    at: [0, pedimentBase + 0.52, 4.7],
    rot: [Math.PI / 2, 0, 0],
  });
  a.box("metal", [0.07, 0.3, 0.05], { at: [0, pedimentBase + 0.65, 4.78] });
  a.box("metal", [0.22, 0.07, 0.05], { at: [0.09, pedimentBase + 0.52, 4.78] });

  // Windows: three a side, with a stone surround each.
  for (const s of [-1, 1]) {
    for (const o of [-2.2, 0, 2.2]) {
      a.box("stone", [1.2, 2.3, 0.1], { at: [o, PODIUM_TOP + 2.5, s * 3.61] });
      a.box("glass", [0.92, 1.95, 0.1], { at: [o, PODIUM_TOP + 2.5, s * 3.66] });
      a.box("stone", [0.1, 2.3, 1.2], { at: [s * 3.61, PODIUM_TOP + 2.5, o] });
      a.box("glass", [0.1, 1.95, 0.92], { at: [s * 3.66, PODIUM_TOP + 2.5, o] });
      a.panel("metal", 0.045, 1.93, { at: [o, PODIUM_TOP + 2.5, s * 3.72], rot: [0, s < 0 ? Math.PI : 0, 0] });
      a.panel("metal", 0.9, 0.045, { at: [o, PODIUM_TOP + 2.6, s * 3.722], rot: [0, s < 0 ? Math.PI : 0, 0] });
      a.panel("metal", 0.045, 1.93, { at: [s * 3.72, PODIUM_TOP + 2.5, o], rot: [0, s * Math.PI / 2, 0] });
      a.panel("metal", 0.9, 0.045, { at: [s * 3.722, PODIUM_TOP + 2.6, o], rot: [0, s * Math.PI / 2, 0] });
    }
  }
  // The doorway under the portico.
  a.box("stone", [2.0, 3.0, 0.14], { at: [0, PODIUM_TOP + 1.5, 3.62] });
  a.box("glass", [1.6, 2.6, 0.1], { at: [0, PODIUM_TOP + 1.4, 3.68] });
  a.box("metal", [0.06, 2.5, 0.05], { at: [0, PODIUM_TOP + 1.4, 3.75] });
  for (const x of [-0.12, 0.12]) a.box("metal", [0.035, 0.38, 0.035], { at: [x, PODIUM_TOP + 1.3, 3.79] });
  for (let i = 0; i < 12; i++) {
    const angle = i * Math.PI / 6;
    a.panel("metal", 0.035, 0.085, { at: [Math.sin(angle) * 0.4, pedimentBase + 0.52 + Math.cos(angle) * 0.4, 4.778], rot: [0, 0, -angle] });
  }
  for (let i = 0; i < 13; i++) {
    a.box("wall", [0.22, 0.22, 0.2], { at: [-3.7 + i * 0.62, CORNICE_Y + 0.08, 4.26] });
  }

  // Drum, dome, lantern, spire.
  const drumY = CORNICE_Y + 0.55 + 0.75;
  a.cylinder("wall", 2.55, 2.9, 1.5, 16, { at: [0, drumY, 0] });
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    a.box("stone", [0.22, 1.5, 0.22], {
      at: [Math.cos(angle) * 2.72, drumY, Math.sin(angle) * 2.72],
      rot: [0, -angle, 0],
    });
  }
  a.cylinder("stone", 3.0, 3.0, 0.22, 16, { at: [0, drumY + 0.86, 0] });
  const domeY = drumY + 0.97;
  a.dome("accent", 2.55, { at: [0, domeY, 0] }, 16, 8);
  for (let i = 0; i < 8; i++) {
    const angle = i * Math.PI / 4;
    for (let segment = 0; segment < 4; segment++) {
      const point = (step: number): V3 => {
        const tilt = step * Math.PI / 8;
        return [Math.cos(angle) * 2.565 * Math.cos(tilt), domeY + 2.565 * Math.sin(tilt), Math.sin(angle) * 2.565 * Math.cos(tilt)];
      };
      a.strut("metal", point(segment), point(segment + 1), 0.035, 4);
    }
  }
  a.cylinder("wall", 0.75, 0.9, 1.1, 10, { at: [0, domeY + 2.75, 0] });
  for (let i = 0; i < 8; i++) {
    const angle = i * Math.PI / 4;
    a.box("glass", [0.24, 0.55, 0.055], { at: [Math.sin(angle) * 0.815, domeY + 2.8, Math.cos(angle) * 0.815], rot: [0, angle, 0] });
  }
  a.dome("accent", 0.82, { at: [0, domeY + 3.3, 0] }, 10, 5);
  a.cylinder("metal", 0.05, 0.08, 1.9, 6, { at: [0, domeY + 4.35, 0] });
  a.sphere("accent", 0.17, { at: [0, domeY + 5.34, 0] }, 8, 6);

  // Flags on the plaza, either side of the steps.
  for (const s of [-1, 1]) {
    a.cylinder("metal", 0.06, 0.09, 4.2, 6, { at: [s * 3.4, 2.7, 4.75] });
    a.box("accent", [1.3, 0.8, 0.05], { at: [s * 3.4 + s * 0.68, 4.3, 4.75] });
  }

  fountain(a);

  // Bollards round the forecourt: the plaza has an edge.
  for (const bx of [-4.6, -2.3, 2.3, 4.6]) {
    a.cylinder("stone", 0.16, 0.2, 0.72, 8, { at: [bx, 0.66, 6.4] });
    a.cylinder("metal", 0.175, 0.175, 0.11, 8, { at: [bx, 0.95, 6.4] });
  }
  for (const x of [-5.7, -4.2, 4.2, 5.7]) {
    a.panel("metal", 0.018, 12.7, { at: [x, 0.307, 0], rot: [-Math.PI / 2, 0, 0] });
  }
  for (const z of [-5.6, -4.1, 4.7, 6.1]) {
    a.panel("metal", 12.7, 0.018, { at: [0, 0.308, z], rot: [-Math.PI / 2, 0, 0] });
  }

  return { slots: a.build(), lantern: [0, domeY + 2.75, 0] };
}

export function townHall(): CivicLayout {
  if (BLENDER_MODELS) return cached("civic-blender", blenderTownHall);
  return cached("civic", buildCivic);
}

/**
 * Spike: the hall modelled in Blender (`blender/landmarks/townhall.py`). Same
 * slots and natural size as `buildCivic`; the lantern is open between its
 * posts, so the light React hangs at the `TownHall.lantern` marker shows.
 */
export function blenderTownHall(): CivicLayout {
  const [x, y, z] = importedMarker(TOWN_HALL, "TownHall.lantern");
  return { slots: blenderSlots<CivicSlot>(TOWN_HALL, ["TownHall"]), lantern: [x, y, z], life: landmarkLife(TOWN_HALL, "TownHall") };
}
