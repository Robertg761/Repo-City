/**
 * The power station: continuous integration as the city's grid (PLAN.md
 * section 14).
 *
 * Natural size 17 x 13 x 12, front (+z) towards the city centre.
 *
 *   x -8.5 ............................................. +8.5
 *        turbine hall  |  cooling towers  |  cooling tower      z -6
 *        turbine hall  |     chimney      |  switchyard         z  0
 *        pylon    pylon  status board     |  switchyard         z +6
 *
 * `state` changes the geometry in exactly one place: a failing plant's chimney
 * goes cold, which is why the `cold` slot exists. Everything else a CI state
 * says -- beacons, smoke, sparks, flicker -- is animation, and lives in
 * `Landmark.tsx` on top of this shell.
 */

import { Assembly, cached, type Slots, type V3 } from "./assembly";

export type PowerSlot = "deck" | "hull" | "steel" | "hazard" | "glass" | "cold";
export type PowerMode = "full" | "failing" | "bare";

/**
 * `"none"` is a repository with no CI at all: section 14 says do not imply
 * failure, so it keeps the substation that feeds the city and loses the plant.
 * The generator drops the landmark entirely in that case; the development
 * fixture still draws one, and so does this.
 */
export function powerMode(state: string): PowerMode {
  if (state === "none") return "bare";
  return state === "failing" ? "failing" : "full";
}

const DECK = 0.5;

/** Where `Landmark.tsx` hangs the animated effects, in the natural frame. */
export const POWER_ANCHORS = {
  /** The warning mast, on the front corner of the hall roof. */
  beacon: [-7.2, 6.15, 3.2] as V3,
  chimney: [0.3, 11.9, 3.3] as V3,
  towerA: [1.6, 8.9, -2.4] as V3,
  towerB: [5.9, 8.9, -2.4] as V3,
  switchyard: [4.6, 4.8, 3.0] as V3,
  board: [-1.8, 2.55, 5.42] as V3,
};

const HALL_X = -4.55;
const CHIMNEY: [number, number] = [0.3, 3.3];
const TOWERS: [number, number][] = [
  [1.6, -2.4],
  [5.9, -2.4],
];
const YARD = { x0: 1.0, x1: 8.2, z0: 1.1, z1: 4.9 };
const PYLONS: [number, number][] = [
  [-6.9, 5.05],
  [0.4, 5.05],
];
const PYLON_H = 7.6;
/** Crossarm half-span. The lines it carries stop just inside the plot edge. */
const ARM_REACH = 0.8;

/** The hyperboloid profile: wide base, pinched waist, flared lip. */
const COOLING_PROFILE: readonly (readonly [number, number])[] = [
  [1.95, 0],
  [1.68, 1.3],
  [1.44, 2.6],
  [1.25, 3.9],
  [1.14, 5.0],
  [1.15, 6.0],
  [1.24, 7.0],
  [1.35, 8.0],
  [1.36, 8.25],
];

type A = Assembly<PowerSlot>;

/** A steel lattice mast with two crossarms and its insulator strings. */
function pylon(a: A, x: number, z: number, height: number): void {
  const foot = 0.44;
  const head = 0.16;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      a.strut(
        "steel",
        [x + sx * foot, DECK, z + sz * foot],
        [x + sx * head, DECK + height, z + sz * head],
        0.055,
        4,
      );
    }
  }
  // Bracing: three square frames plus one diagonal per bay, which is all it
  // takes to read as a lattice from the overview camera.
  for (const [level, spread] of [
    [0.3, 0.4],
    [0.55, 0.32],
    [0.8, 0.23],
  ] as const) {
    const y = DECK + height * level;
    for (const s of [-1, 1]) {
      a.box("steel", [spread * 2, 0.07, 0.07], { at: [x, y, z + s * spread] });
      a.box("steel", [0.07, 0.07, spread * 2], { at: [x + s * spread, y, z] });
    }
    a.strut("steel", [x - spread, y, z - spread], [x + spread, y + height * 0.18, z + spread], 0.04, 4);
  }
  // Crossarms run along z, so the line between two pylons runs along x.
  for (const [dy, reach] of [
    [0.82, ARM_REACH],
    [1.0, 0.55],
  ] as const) {
    const y = DECK + height * dy;
    a.box("steel", [0.12, 0.12, reach * 2], { at: [x, y, z] });
    for (const s of [-1, 1]) {
      a.cylinder("deck", 0.07, 0.07, 0.42, 5, { at: [x, y - 0.24, z + s * reach] });
    }
  }
  a.cylinder("steel", 0.06, 0.1, 0.5, 5, { at: [x, DECK + height + 0.2, z] });
}

/** A perimeter fence: posts on a stride, two rails, one top rail. */
function fence(a: A, x0: number, x1: number, z0: number, z1: number, height: number): void {
  const post = (x: number, z: number) =>
    a.box("steel", [0.1, height, 0.1], { at: [x, DECK + height / 2, z] });
  const stride = 1.6;
  const along = Math.max(1, Math.round((x1 - x0) / stride));
  const across = Math.max(1, Math.round((z1 - z0) / stride));
  for (let i = 0; i <= along; i++) {
    const x = x0 + ((x1 - x0) * i) / along;
    post(x, z0);
    post(x, z1);
  }
  for (let i = 1; i < across; i++) {
    const z = z0 + ((z1 - z0) * i) / across;
    post(x0, z);
    post(x1, z);
  }
  for (const y of [0.45, 0.78]) {
    const at = DECK + height * y;
    a.box("steel", [x1 - x0, 0.06, 0.06], { at: [(x0 + x1) / 2, at, z0] });
    a.box("steel", [x1 - x0, 0.06, 0.06], { at: [(x0 + x1) / 2, at, z1] });
    a.box("steel", [0.06, 0.06, z1 - z0], { at: [x0, at, (z0 + z1) / 2] });
    a.box("steel", [0.06, 0.06, z1 - z0], { at: [x1, at, (z0 + z1) / 2] });
  }
}

/** Transformers, bushings, the gantry above them and the busbars it carries. */
function switchyard(a: A): void {
  a.box("deck", [7.4, 0.16, 4.0], { at: [4.6, DECK + 0.08, 3.0] });

  for (const cx of [2.9, 6.3]) {
    a.box("steel", [2.2, 1.6, 1.9], { at: [cx, DECK + 0.96, 3.0] });
    for (const dx of [-1.02, -0.72, 0.72, 1.02]) {
      a.box("steel", [0.09, 1.15, 2.05], { at: [cx + dx, DECK + 0.95, 3.0] });
    }
    // Porcelain bushings: a post and two sheds, the silhouette everyone reads
    // as high voltage.
    for (const dx of [-0.7, 0, 0.7]) {
      a.cylinder("deck", 0.1, 0.14, 0.85, 6, { at: [cx + dx, DECK + 2.18, 3.0] });
      a.cylinder("deck", 0.24, 0.24, 0.07, 8, { at: [cx + dx, DECK + 1.95, 3.0] });
      a.cylinder("deck", 0.2, 0.2, 0.07, 8, { at: [cx + dx, DECK + 2.3, 3.0] });
    }
  }

  for (const px of [1.4, 7.8]) {
    for (const pz of [1.6, 4.4]) {
      a.box("steel", [0.16, 4.2, 0.16], { at: [px, DECK + 2.1, pz] });
    }
    a.box("steel", [0.16, 0.14, 2.96], { at: [px, DECK + 4.1, 3.0] });
  }
  for (const pz of [1.6, 4.4]) {
    a.box("steel", [6.56, 0.14, 0.14], { at: [4.6, DECK + 4.1, pz] });
    a.wire("steel", [1.4, DECK + 3.96, pz], [7.8, DECK + 3.96, pz], 0.045, 0.35);
  }

  fence(a, YARD.x0, YARD.x1, YARD.z0, YARD.z1, 1.7);
  // Gate posts, striped: the one place on the plot that says "keep out".
  for (const gx of [4.1, 5.3]) {
    a.box("hazard", [0.16, 1.9, 0.16], { at: [gx, DECK + 0.95, YARD.z1] });
  }
}

/** The status board on the forecourt. The lamp itself is drawn by React. */
function board(a: A): void {
  a.box("steel", [0.16, 2.1, 0.16], { at: [-1.8, DECK + 1.05, 5.2] });
  a.box("hazard", [1.7, 1.1, 0.12], { at: [-1.8, DECK + 2.1, 5.2] });
  a.box("deck", [1.42, 0.82, 0.06], { at: [-1.8, DECK + 2.1, 5.29] });
}

function buildPower(mode: PowerMode): Slots<PowerSlot> {
  const a = new Assembly<PowerSlot>();

  a.box("deck", [16.6, DECK, 11.4], { at: [0, DECK / 2, 0] });

  switchyard(a);
  board(a);

  if (mode === "bare") return a.build();

  // -- turbine hall --------------------------------------------------------
  a.box("hull", [7.0, 5.2, 8.6], { at: [HALL_X, DECK + 2.6, 0] });
  a.box("deck", [7.5, 0.45, 9.1], { at: [HALL_X, DECK + 5.42, 0] });
  for (const mz of [-2.3, 2.3]) {
    a.box("hull", [6.0, 0.75, 1.1], { at: [HALL_X, DECK + 6.02, mz] });
    a.box("deck", [6.3, 0.16, 1.4], { at: [HALL_X, DECK + 6.47, mz] });
    a.box("glass", [6.05, 0.34, 1.15], { at: [HALL_X, DECK + 6.05, mz] });
  }
  for (let i = 0; i < 6; i++) {
    const x = HALL_X - 2.9 + i * 1.16;
    a.box("steel", [0.26, 5.2, 0.22], { at: [x, DECK + 2.6, 4.32] });
    a.box("steel", [0.26, 5.2, 0.22], { at: [x, DECK + 2.6, -4.32] });
  }
  for (const wz of [4.33, -4.33]) {
    a.box("glass", [6.1, 1.35, 0.1], { at: [HALL_X, DECK + 3.3, wz] });
  }
  a.box("steel", [2.3, 2.8, 0.14], { at: [HALL_X, DECK + 1.4, 4.36] });
  a.box("hazard", [2.5, 0.18, 0.18], { at: [HALL_X, DECK + 2.95, 4.36] });

  // -- cooling towers ------------------------------------------------------
  for (const [tx, tz] of TOWERS) {
    // Concrete, not the hall's cladding: the towers read as a different
    // material from twenty units away, which is most of what makes them read
    // as cooling towers at all.
    a.cylinder("deck", 2.02, 2.14, 0.45, 16, { at: [tx, DECK + 0.22, tz] });
    a.lathe("deck", COOLING_PROFILE, 16, { at: [tx, DECK + 0.4, tz] });
    // Air inlets round the skirt, and a disc that stops the open lathe from
    // showing the sky through the far wall.
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      a.box("steel", [0.2, 0.95, 0.34], {
        at: [tx + Math.cos(angle) * 1.86, DECK + 0.88, tz + Math.sin(angle) * 1.86],
        rot: [0, -angle, 0],
      });
    }
    a.cylinder("deck", 1.2, 1.2, 0.06, 12, { at: [tx, DECK + 8.0, tz] });
  }

  // -- chimney -------------------------------------------------------------
  const stackSlot = mode === "failing" ? "cold" : "hull";
  a.cylinder(stackSlot, 0.72, 1.0, 11.2, 10, { at: [CHIMNEY[0], DECK + 5.6, CHIMNEY[1]] });
  for (const y of [8.6, 9.8]) {
    a.cylinder(mode === "failing" ? "cold" : "hazard", 0.86, 0.9, 0.55, 10, {
      at: [CHIMNEY[0], DECK + y, CHIMNEY[1]],
    });
  }
  a.cylinder("steel", 0.8, 0.8, 0.26, 10, { at: [CHIMNEY[0], DECK + 11.25, CHIMNEY[1]] });
  for (const sx of [-0.44, 0.44]) {
    a.strut(
      "steel",
      [CHIMNEY[0] + sx, DECK + 0.6, CHIMNEY[1] + 0.95],
      [CHIMNEY[0] + sx * 0.75, DECK + 10.8, CHIMNEY[1] + 0.78],
      0.05,
      4,
    );
  }
  for (let i = 0; i < 9; i++) {
    const y = DECK + 1.2 + i * 1.12;
    a.box("steel", [0.9, 0.06, 0.06], { at: [CHIMNEY[0], y, CHIMNEY[1] + 0.87] });
  }

  // -- pylons and lines ----------------------------------------------------
  for (const [px, pz] of PYLONS) {
    pylon(a, px, pz, PYLON_H);
  }
  const armY = DECK + PYLON_H * 0.82 - 0.4;
  const topY = DECK + PYLON_H * 1.0 - 0.4;
  for (const dz of [-ARM_REACH, ARM_REACH]) {
    a.wire(
      "steel",
      [PYLONS[0][0], armY, PYLONS[0][1] + dz],
      [PYLONS[1][0], armY, PYLONS[1][1] + dz],
      0.05,
      0.55,
    );
  }
  for (const dz of [-0.55, 0.55]) {
    a.wire(
      "steel",
      [PYLONS[0][0], topY, PYLONS[0][1] + dz],
      [PYLONS[1][0], topY, PYLONS[1][1] + dz],
      0.045,
      0.45,
    );
  }
  // Into the hall on one side, down into the switchyard on the other, and one
  // span carrying on across the plot: the plant feeds something.
  a.wire(
    "steel",
    [PYLONS[0][0], armY, PYLONS[0][1] - ARM_REACH],
    [HALL_X + 1.6, DECK + 5.7, 3.4],
    0.045,
    0.3,
  );
  a.wire(
    "steel",
    [PYLONS[1][0], armY, PYLONS[1][1] - ARM_REACH],
    [1.4, DECK + 4.1, 4.4],
    0.045,
    0.3,
  );
  a.wire("steel", [PYLONS[1][0], topY, PYLONS[1][1] + 0.55], [8.2, DECK + 4.4, 5.4], 0.045, 0.45);

  return a.build();
}

export function powerPlant(state: string): Slots<PowerSlot> {
  const mode = powerMode(state);
  return cached(`power:${mode}`, () => buildPower(mode));
}
