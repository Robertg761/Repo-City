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

import { Assembly, cached, type Slots, type V3 } from "./assembly";

export type FireSlot = "deck" | "wall" | "red" | "trim" | "steel" | "glass";

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
    }
  }
  for (let i = 0; i < 5; i++) {
    a.box("trim", [0.82, 0.07, 0.07], { at: [cx, DECK + 1.78, cz - 2.15 + i * 0.72] });
  }
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
}

function buildFire(level: number): FireLayout {
  const a = new Assembly<FireSlot>();
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
  return cached(`fire:${clamped}`, () => buildFire(clamped));
}
