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

import { Assembly, cached, type Slots, type V3 } from "./assembly";

export type CivicSlot = "stone" | "wall" | "accent" | "metal" | "glass";

type A = Assembly<CivicSlot>;

const PODIUM_TOP = 1.2;
const BLOCK_H = 4.8;
const CORNICE_Y = PODIUM_TOP + BLOCK_H;

export interface CivicLayout {
  slots: Slots<CivicSlot>;
  /** The lantern above the dome, which React lights. */
  lantern: V3;
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
  a.cylinder("glass", 0.78, 0.78, 0.12, 14, { at: [0, 0.6, z] });
  a.cylinder("stone", 0.26, 0.34, 0.75, 8, { at: [0, 0.82, z] });
  a.cylinder("glass", 0.1, 0.22, 0.85, 8, { at: [0, 1.6, z] });
  a.sphere("glass", 0.16, { at: [0, 2.06, z] }, 8, 6);
}

function buildCivic(): CivicLayout {
  const a = new Assembly<CivicSlot>();

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
    }
  }
  // The doorway under the portico.
  a.box("stone", [2.0, 3.0, 0.14], { at: [0, PODIUM_TOP + 1.5, 3.62] });
  a.box("glass", [1.6, 2.6, 0.1], { at: [0, PODIUM_TOP + 1.4, 3.68] });

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
  a.cylinder("wall", 0.75, 0.9, 1.1, 10, { at: [0, domeY + 2.75, 0] });
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
  }

  return { slots: a.build(), lantern: [0, domeY + 2.75, 0] };
}

export function townHall(): CivicLayout {
  return cached("civic", buildCivic);
}
