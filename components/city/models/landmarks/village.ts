/**
 * The village's landmarks (PLAN.md 76.1 decision 7, 76.5 village step 6):
 * a chapel on the green for the repository itself, a single-bay fire
 * station, a railway halt, and an electricity substation.
 *
 * A village has no room for the city's power station, three-bay fire
 * station or through station, and scaling those down into a nine-unit plot
 * turns their engines and trains into toys. So a village gets its own
 * buildings, modelled at house scale -- a chapel door is a door, not a
 * portico -- and `Landmark.tsx` fits them into the plot without ever
 * enlarging them.
 *
 * Same conventions as the rest of this directory: +y up, y = 0 the ground,
 * the front on +z, one merged geometry per material slot (`assembly.ts`).
 */

import { Assembly, cached, type Slots, type V3 } from "./assembly";

/** Natural sizes, `[width, height, depth]`, for fitting into the plot. */
export const VILLAGE_NATURAL_SIZE = {
  civic: [9, 12.5, 12] as V3,
  fire: [8, 7.4, 8.5] as V3,
  station: [15, 4.6, 6.5] as V3,
  power: [8.5, 5.6, 7] as V3,
} as const;

// ---------------------------------------------------------------------------
// Chapel
// ---------------------------------------------------------------------------

export type ChapelSlot = "stone" | "roof" | "trim" | "wood" | "glass" | "green" | "metal";

export interface ChapelLayout {
  slots: Slots<ChapelSlot>;
  /** The lamp over the door, which React lights at dusk. */
  lamp: V3;
}

const NAVE_W = 4.4;
const NAVE_H = 3.7;
const NAVE_Z0 = -4.0;
const NAVE_Z1 = 2.4;
const TOWER = 2.5;
const TOWER_Z = NAVE_Z1 + TOWER / 2 - 0.3;
const TOWER_H = 6.4;

function buildChapel(): ChapelLayout {
  const a = new Assembly<ChapelSlot>();
  const naveD = NAVE_Z1 - NAVE_Z0;
  const naveZ = (NAVE_Z0 + NAVE_Z1) / 2;

  // The churchyard: a low stone wall round the plot, open at the front.
  const yard: [number, number] = [8.6, 11.6];
  a.box("green", [yard[0] - 0.2, 0.04, yard[1] - 0.2], { at: [0, 0.02, 0] });
  for (const s of [-1, 1]) {
    a.box("stone", [0.35, 0.55, yard[1]], { at: [s * (yard[0] / 2 - 0.18), 0.275, 0] });
    a.box("stone", [0.45, 0.12, yard[1] + 0.05], { at: [s * (yard[0] / 2 - 0.18), 0.6, 0] });
    // The front wall, either side of the gate.
    a.box("stone", [yard[0] / 2 - 1.3, 0.55, 0.35], { at: [s * (yard[0] / 4 + 0.65), 0.275, yard[1] / 2 - 0.18] });
    a.box("stone", [0.5, 0.95, 0.5], { at: [s * 1.3, 0.475, yard[1] / 2 - 0.18] });
  }
  a.box("stone", [yard[0], 0.55, 0.35], { at: [0, 0.275, -yard[1] / 2 + 0.18] });
  // A path of flags from the gate to the door.
  a.box("stone", [1.4, 0.05, yard[1] / 2 - TOWER_Z - TOWER / 2], {
    at: [0, 0.05, (yard[1] / 2 + TOWER_Z + TOWER / 2) / 2],
  });

  // The nave: walls, a plinth, buttresses between the windows.
  a.box("stone", [NAVE_W + 0.3, 0.35, naveD + 0.3], { at: [0, 0.175, naveZ] });
  a.box("stone", [NAVE_W, NAVE_H, naveD], { at: [0, NAVE_H / 2, naveZ] });
  a.gable("roof", NAVE_W / 2 + 0.35, 2.7, naveD + 0.5, { at: [0, NAVE_H - 0.25 + 2.7 / 3, naveZ] });
  // The ridge runs a little past the roof's ends, so its ends and the gables'
  // are never one plane.
  a.box("trim", [0.24, 0.24, naveD + 0.56], { at: [0, NAVE_H - 0.25 + 2.7 - 0.02, naveZ] });
  // The east end: a lower, narrower chancel.
  a.box("stone", [3.2, 3.0, 1.6], { at: [0, 1.5, NAVE_Z0 - 0.7] });
  a.gable("roof", 1.85, 1.9, 1.8, { at: [0, 2.8 + 1.9 / 3, NAVE_Z0 - 0.7] });

  for (const s of [-1, 1]) {
    for (const z of [-2.9, -0.8, 1.3]) {
      // Lancet windows: a tall light under a pointed head.
      a.box("trim", [0.12, 1.9, 0.78], { at: [s * (NAVE_W / 2 + 0.02), 1.95, z] });
      a.box("glass", [0.1, 1.6, 0.52], { at: [s * (NAVE_W / 2 + 0.06), 1.9, z] });
      // The pointed head reaches back to the wall: stopped a hundredth short
      // of it, a thread of the frame's top showed behind the point.
      a.box("glass", [0.11, 0.36, 0.36], { at: [s * (NAVE_W / 2 + 0.055), 2.75, z], rot: [Math.PI / 4, 0, 0] });
    }
    for (const z of [-3.85, -1.85, 0.25, 2.25]) {
      a.box("stone", [0.45, 2.4, 0.4], { at: [s * (NAVE_W / 2 + 0.2), 1.2, z] });
      a.box("stone", [0.3, 0.6, 0.3], { at: [s * (NAVE_W / 2 + 0.12), 2.55, z], rot: [0, 0, s * -0.5] });
    }
  }
  // The east window, big, in the chancel.
  a.box("trim", [1.2, 1.6, 0.1], { at: [0, 1.7, NAVE_Z0 - 1.52] });
  a.box("glass", [0.9, 1.3, 0.1], { at: [0, 1.65, NAVE_Z0 - 1.56] });

  // The tower and its spire.
  a.box("stone", [TOWER + 0.3, 0.4, TOWER + 0.3], { at: [0, 0.2, TOWER_Z] });
  a.box("stone", [TOWER, TOWER_H, TOWER], { at: [0, TOWER_H / 2, TOWER_Z] });
  a.box("trim", [TOWER + 0.22, 0.22, TOWER + 0.22], { at: [0, TOWER_H - 1.9, TOWER_Z] });
  a.box("trim", [TOWER + 0.3, 0.3, TOWER + 0.3], { at: [0, TOWER_H + 0.15, TOWER_Z] });
  // Belfry louvres on every face, and battlements round the top.
  for (const [nx, nz] of [
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0],
  ] as const) {
    const out = TOWER / 2 + 0.03;
    const size: V3 = nx === 0 ? [0.7, 1.1, 0.08] : [0.08, 1.1, 0.7];
    a.box("wood", size, { at: [nx * out, TOWER_H - 1.0, TOWER_Z + nz * out] });
    for (let k = 0; k < 3; k++) {
      const louvre: V3 = nx === 0 ? [0.66, 0.06, 0.1] : [0.1, 0.06, 0.66];
      a.box("trim", louvre, { at: [nx * (out + 0.04), TOWER_H - 1.35 + k * 0.33, TOWER_Z + nz * (out + 0.04)] });
    }
  }
  for (const x of [-1, 1]) {
    for (const z of [-1, 1]) {
      a.box("stone", [0.42, 0.55, 0.42], { at: [x * (TOWER / 2), TOWER_H + 0.55, TOWER_Z + z * (TOWER / 2)] });
    }
  }
  // The spire: four faces, a slender one, and a weathercock.
  a.cone("roof", TOWER * 0.62, 4.6, 4, { at: [0, TOWER_H + 0.3 + 2.3, TOWER_Z], rot: [0, Math.PI / 4, 0] });
  // A square mast as deep as the arm it carries: round, its facets cut the
  // arm's top into threads either side.
  a.box("metal", [0.05, 0.9, 0.05], { at: [0, TOWER_H + 0.3 + 4.6 + 0.35, TOWER_Z] });
  a.box("metal", [0.5, 0.05, 0.05], { at: [0, TOWER_H + 0.3 + 4.6 + 0.5, TOWER_Z] });
  a.box("metal", [0.05, 0.28, 0.4], { at: [0.05, TOWER_H + 0.3 + 4.6 + 0.72, TOWER_Z] });

  // The clock, below the belfry.
  a.cylinder("trim", 0.46, 0.46, 0.08, 12, { at: [0, TOWER_H - 2.6, TOWER_Z + TOWER / 2 + 0.03], rot: [Math.PI / 2, 0, 0] });
  a.box("metal", [0.05, 0.34, 0.04], { at: [0, TOWER_H - 2.47, TOWER_Z + TOWER / 2 + 0.09] });
  a.box("metal", [0.24, 0.05, 0.04], { at: [0.1, TOWER_H - 2.6, TOWER_Z + TOWER / 2 + 0.09] });

  // The door: an arched oak door in a stone surround, a step and a lamp.
  const front = TOWER_Z + TOWER / 2;
  a.box("trim", [1.35, 2.15, 0.14], { at: [0, 1.25, front + 0.04] });
  // The door stands on the tower's plinth, not down behind its face.
  a.box("wood", [1.0, 1.5, 0.1], { at: [0, 1.15, front + 0.1] });
  a.cylinder("wood", 0.5, 0.5, 0.1, 10, { at: [0, 1.9, front + 0.1], rot: [Math.PI / 2, 0, 0] });
  a.box("stone", [1.7, 0.2, 0.7], { at: [0, 0.1, front + 0.35] });
  const lamp: V3 = [0, 2.75, front + 0.28];
  a.box("metal", [0.06, 0.06, 0.3], { at: [0, 2.9, front + 0.14] });

  // A yew by the chancel, and gravestones in rows.
  a.cone("green", 1.2, 3.4, 7, { at: [-2.6, 2.3, -4.6] });
  a.cone("green", 0.95, 2.4, 7, { at: [-2.6, 3.5, -4.6] });
  a.cylinder("wood", 0.16, 0.2, 0.7, 5, { at: [-2.6, 0.35, -4.6] });
  for (const [x, z, tilt] of [
    [2.9, -1.2, 0.05],
    [2.9, -2.6, -0.08],
    [2.9, -4.0, 0.02],
    [-3.0, -0.6, -0.06],
    [-3.0, -2.2, 0.08],
    [3.6, 3.2, -0.05],
    [-3.5, 3.4, 0.07],
  ] as const) {
    a.box("stone", [0.5, 0.7, 0.14], { at: [x, 0.35, z], rot: [tilt, 0, tilt * 0.5] });
  }

  return { slots: a.build(), lamp };
}

export function chapel(): ChapelLayout {
  return cached("village:chapel", buildChapel);
}

// ---------------------------------------------------------------------------
// Fire station
// ---------------------------------------------------------------------------

export type VillageFireSlot = "deck" | "wall" | "red" | "trim" | "roof" | "steel" | "glass";

export interface VillageFireLayout {
  slots: Slots<VillageFireSlot>;
  /** The blue lamp over the door. */
  beacons: V3[];
}

/**
 * A retained station: one bay under a pitched roof, a red door, a bell
 * turret, a hose-drying pole and a little appliance on the apron when the
 * repository's tests are strong enough to keep one (`level` 2 and up).
 */
function buildVillageFire(level: number): VillageFireLayout {
  const a = new Assembly<VillageFireSlot>();
  const w = 4.6;
  const d = 5.2;
  const h = 3.6;
  const z0 = -1.4;

  a.box("deck", [7.8, 0.12, 8.2], { at: [0, 0.06, 0] });
  a.box("deck", [3.6, 0.08, 2.8], { at: [-0.3, 0.14, 2.6] });
  a.box("wall", [w, h, d], { at: [-0.3, h / 2, z0] });
  a.box("trim", [w + 0.1, 0.25, d + 0.1], { at: [-0.3, 0.125, z0] });
  a.gable("roof", w / 2 + 0.3, 1.9, d + 0.4, { at: [-0.3, h + 1.9 / 3 - 0.1, z0], rot: [0, 0, 0] });

  // The bay door facing the lane, with a white frame and a painted band.
  const front = z0 + d / 2;
  a.box("trim", [2.9, 2.75, 0.12], { at: [-0.3, 1.38, front + 0.03] });
  a.box("red", [2.5, 2.45, 0.1], { at: [-0.3, 1.25, front + 0.08] });
  for (let i = 0; i < 4; i++) {
    a.box("trim", [2.44, 0.05, 0.04], { at: [-0.3, 0.45 + i * 0.55, front + 0.14] });
  }
  a.box("red", [w + 0.02, 0.4, 0.06], { at: [-0.3, h - 0.45, front + 0.04] });
  a.box("glass", [0.8, 0.5, 0.06], { at: [-0.3, h + 0.5, front + 0.06] });

  // Side windows and a side door.
  for (const z of [-3.0, -0.8]) {
    a.box("trim", [0.1, 1.0, 0.9], { at: [-0.3 + w / 2 + 0.02, 2.0, z] });
    a.box("glass", [0.1, 0.8, 0.7], { at: [-0.3 + w / 2 + 0.05, 2.0, z] });
  }
  a.box("red", [0.1, 1.9, 0.9], { at: [-0.3 - w / 2 - 0.04, 0.95, -0.4] });

  // The bell turret on the ridge.
  const ridge = h + 1.9 * (2 / 3) - 0.1;
  a.box("trim", [0.8, 0.9, 0.8], { at: [-0.3, ridge + 0.35, z0 - 1.2] });
  a.box("steel", [0.45, 0.45, 0.45], { at: [-0.3, ridge + 0.5, z0 - 1.2] });
  a.cone("red", 0.62, 0.7, 4, { at: [-0.3, ridge + 1.15, z0 - 1.2], rot: [0, Math.PI / 4, 0] });

  // The hose-drying pole and its flag.
  a.cylinder("steel", 0.08, 0.1, 6.2, 6, { at: [2.8, 3.1, -2.6] });
  a.box("steel", [0.7, 0.07, 0.07], { at: [2.8, 6.0, -2.6] });
  a.box("red", [0.9, 0.55, 0.04], { at: [3.28, 5.6, -2.6] });

  const beacons: V3[] = [[-0.3, h - 0.05, front + 0.2]];
  if (level >= 2) {
    // A small appliance, nose out on the apron.
    const cz = 2.9;
    const cx = 1.9;
    a.box("red", [1.3, 0.9, 2.6], { at: [cx, 0.75, cz] });
    a.box("red", [1.25, 0.55, 1.0], { at: [cx, 1.45, cz + 0.7] });
    a.box("glass", [1.1, 0.35, 0.06], { at: [cx, 1.5, cz + 1.22] });
    a.box("trim", [0.9, 0.08, 1.4], { at: [cx, 1.35, cz - 0.55] });
    for (const s of [-1, 1]) {
      for (const wz of [0.8, -0.8]) {
        a.cylinder("steel", 0.28, 0.28, 0.2, 8, { at: [cx + s * 0.62, 0.28, cz + wz], rot: [0, 0, Math.PI / 2] });
      }
    }
    beacons.push([cx, 1.8, cz + 0.7]);
  }

  return { slots: a.build(), beacons };
}

export function villageFireStation(level: number): VillageFireLayout {
  const key = level >= 2 ? 2 : 1;
  return cached(`village:fire:${key}`, () => buildVillageFire(key));
}

// ---------------------------------------------------------------------------
// Halt
// ---------------------------------------------------------------------------

export type HaltSlot = "deck" | "wall" | "roof" | "steel" | "accent" | "dark" | "glass" | "wood";

export interface HaltLayout {
  slots: Slots<HaltSlot>;
  lamps: V3[];
}

/**
 * A halt: one platform on a single line, a timber shelter with a canopy, a
 * name board, a bench and two lamps. A shipping repository (`level` 2 and
 * up) has a two-car railcar waiting at it.
 */
function buildHalt(level: number): HaltLayout {
  const a = new Assembly<HaltSlot>();
  const trackZ = -1.9;
  const platformZ = 0.9;

  // Ballast, sleepers and rails the full width of the plot.
  a.box("dark", [15, 0.2, 2.4], { at: [0, 0.1, trackZ] });
  for (let i = 0; i < 22; i++) {
    a.box("wood", [0.24, 0.08, 1.9], { at: [-7.2 + i * 0.69, 0.24, trackZ] });
  }
  for (const s of [-1, 1]) {
    a.box("steel", [15, 0.12, 0.1], { at: [0, 0.34, trackZ + s * 0.55] });
  }

  // The platform, with a pale edge.
  a.box("deck", [12, 0.75, 3.2], { at: [0, 0.375, platformZ] });
  // Flush with the platform's face: set a hair back, a thread of the deck
  // showed along the edge.
  a.box("wall", [12, 0.06, 0.35], { at: [0, 0.78, platformZ - 1.425] });
  // A ramp down at each end.
  for (const s of [-1, 1]) {
    a.box("deck", [1.6, 0.4, 3.2], { at: [s * 6.6, 0.2, platformZ], rot: [0, 0, s * -0.22] });
  }

  // The shelter: timber walls on three sides, a window, a pitched canopy.
  const sx = -1.2;
  const sz = platformZ + 0.7;
  a.box("wall", [3.6, 2.2, 0.16], { at: [sx, 0.75 + 1.1, sz + 0.7] });
  for (const s of [-1, 1]) a.box("wall", [0.16, 2.2, 1.5], { at: [sx + s * 1.72, 0.75 + 1.1, sz] });
  a.box("glass", [1.4, 0.7, 0.06], { at: [sx - 0.6, 0.75 + 1.5, sz + 0.62] });
  a.box("wood", [3.0, 0.12, 0.45], { at: [sx, 0.75 + 0.45, sz + 0.4] });
  a.gable("roof", 1.35, 0.9, 4.4, { at: [sx, 0.75 + 2.2 + 0.3, sz - 0.1], rot: [0, Math.PI / 2, 0] });
  for (let i = 0; i < 7; i++) {
    a.box("accent", [0.08, 0.28, 0.06], { at: [sx - 2.1 + i * 0.7, 0.75 + 2.1, sz - 1.2] });
  }

  // The name board on two posts, and two lamps.
  // The posts stand behind the board rather than flush with its face.
  a.box("steel", [0.08, 1.8, 0.08], { at: [3.2, 0.75 + 0.9, platformZ + 0.84] });
  a.box("steel", [0.08, 1.8, 0.08], { at: [4.8, 0.75 + 0.9, platformZ + 0.84] });
  a.box("accent", [2.0, 0.55, 0.08], { at: [4.0, 0.75 + 1.75, platformZ + 0.9] });
  a.box("wall", [1.6, 0.14, 0.1], { at: [4.0, 0.75 + 1.75, platformZ + 0.95] });
  const lamps: V3[] = [];
  for (const x of [-4.6, 1.8]) {
    a.cylinder("steel", 0.05, 0.07, 2.6, 6, { at: [x, 0.75 + 1.3, platformZ + 1.2] });
    a.box("steel", [0.3, 0.2, 0.3], { at: [x, 0.75 + 2.65, platformZ + 1.2] });
    lamps.push([x, 0.75 + 2.5, platformZ + 1.2]);
  }
  // A bench.
  a.box("wood", [1.4, 0.08, 0.4], { at: [-4.6, 0.75 + 0.45, platformZ + 0.9] });
  a.box("wood", [1.4, 0.35, 0.06], { at: [-4.6, 0.75 + 0.7, platformZ + 1.1] });

  // Buffers at the end of the line: a siding, as a halt often has.
  a.box("accent", [0.3, 0.6, 1.4], { at: [7.2, 0.6, trackZ] });

  if (level >= 2) {
    // A two-car railcar at the platform.
    const carL = 4.6;
    for (const cx of [-carL / 2 - 0.1, carL / 2 + 0.1]) {
      a.box("accent", [carL, 1.5, 1.7], { at: [cx, 0.4 + 1.05, trackZ] });
      // The cream band stands proud of the body and the glass, and runs a
      // hair past both ends.
      a.box("wall", [carL + 0.04, 0.1, 1.78], { at: [cx, 0.4 + 1.5, trackZ] });
      a.box("roof", [carL - 0.2, 0.2, 1.5], { at: [cx, 0.4 + 1.9, trackZ] });
      a.box("glass", [carL - 0.6, 0.45, 1.74], { at: [cx, 0.4 + 1.35, trackZ] });
      a.box("dark", [carL - 0.8, 0.35, 1.3], { at: [cx, 0.4 + 0.2, trackZ] });
    }
    a.box("glass", [0.06, 0.5, 1.2], { at: [carL + 0.12, 0.4 + 1.35, trackZ] });
    a.box("glass", [0.06, 0.5, 1.2], { at: [-carL - 0.12, 0.4 + 1.35, trackZ] });
  }

  return { slots: a.build(), lamps };
}

export function halt(level: number): HaltLayout {
  const key = level >= 2 ? 2 : 1;
  return cached(`village:halt:${key}`, () => buildHalt(key));
}

// ---------------------------------------------------------------------------
// Substation
// ---------------------------------------------------------------------------

export type SubstationSlot = "deck" | "hull" | "steel" | "hazard" | "glass" | "wood" | "dark";

export interface SubstationLayout {
  slots: Slots<SubstationSlot>;
  /** Where the status lamp and the sparks sit. */
  anchors: { lamp: V3; yard: V3 };
}

/**
 * A village substation: a fenced gravel yard, a transformer with its fins
 * and insulators, a little brick control hut with a status lamp, and a line
 * of wooden poles carrying the supply away. `none` (no CI at all) is the
 * same yard with the lamp unlit: no failure implied (PLAN.md section 14).
 */
function buildSubstation(): SubstationLayout {
  const a = new Assembly<SubstationSlot>();
  a.box("deck", [8.2, 0.1, 6.6], { at: [0, 0.05, 0] });

  // The fence: posts and two wires, open at the gate.
  const fx = 3.9;
  const fz = 3.1;
  const posts: [number, number][] = [];
  for (let i = 0; i <= 8; i++) posts.push([-fx + (i * fx * 2) / 8, -fz]);
  for (let i = 1; i <= 6; i++) posts.push([fx, -fz + (i * fz * 2) / 6], [-fx, -fz + (i * fz * 2) / 6]);
  for (let i = 0; i <= 8; i++) {
    const x = -fx + (i * fx * 2) / 8;
    if (Math.abs(x) > 1.2) posts.push([x, fz]);
  }
  for (const [x, z] of posts) a.box("steel", [0.08, 1.7, 0.08], { at: [x, 0.95, z] });
  for (const y of [0.9, 1.6]) {
    a.box("steel", [fx * 2, 0.03, 0.03], { at: [0, y, -fz] });
    a.box("steel", [0.03, 0.03, fz * 2], { at: [fx, y, 0] });
    a.box("steel", [0.03, 0.03, fz * 2], { at: [-fx, y, 0] });
    for (const s of [-1, 1]) a.box("steel", [fx - 1.2, 0.03, 0.03], { at: [s * (fx + 1.2) / 2, y, fz] });
  }
  a.box("hazard", [0.5, 0.4, 0.04], { at: [1.8, 1.25, fz + 0.06] });

  // The transformer: a tank with cooling fins and three insulators.
  const tx = -1.2;
  const tz = -0.6;
  a.box("dark", [2.4, 0.3, 1.8], { at: [tx, 0.25, tz] });
  a.box("hull", [2.0, 1.6, 1.4], { at: [tx, 1.2, tz] });
  for (let i = 0; i < 6; i++) {
    for (const s of [-1, 1]) {
      a.box("hull", [0.06, 1.2, 0.3], { at: [tx - 0.75 + i * 0.3, 1.1, tz + s * 0.85] });
    }
  }
  a.box("hull", [0.9, 0.5, 0.9], { at: [tx + 0.5, 2.25, tz - 0.2] });
  for (let i = 0; i < 3; i++) {
    const x = tx - 0.6 + i * 0.6;
    a.cylinder("glass", 0.1, 0.14, 0.7, 6, { at: [x, 2.35, tz + 0.3] });
    a.cylinder("glass", 0.16, 0.16, 0.06, 6, { at: [x, 2.3, tz + 0.3] });
    a.cylinder("glass", 0.16, 0.16, 0.06, 6, { at: [x, 2.5, tz + 0.3] });
  }

  // The control hut.
  const hx = 2.0;
  const hz = -1.4;
  a.box("hull", [2.2, 2.2, 2.0], { at: [hx, 1.1, hz] });
  a.gable("dark", 1.3, 0.8, 2.4, { at: [hx, 2.2 + 0.8 / 3, hz] });
  a.box("dark", [0.8, 1.6, 0.08], { at: [hx - 0.3, 0.9, hz + 1.02] });
  a.box("glass", [0.5, 0.4, 0.06], { at: [hx + 0.55, 1.4, hz + 1.02] });
  a.box("hazard", [0.36, 0.36, 0.04], { at: [hx - 0.3, 1.45, hz + 1.07] });
  const lamp: V3 = [hx + 0.55, 2.2 + 0.95, hz + 0.9];
  a.box("steel", [0.06, 0.3, 0.06], { at: [hx + 0.55, 2.2 + 0.6, hz + 0.9] });

  // Wooden poles carrying the line off the plot.
  const poles: V3[] = [
    [-3.2, 0, 2.2],
    [-0.6, 0, 2.3],
    [3.2, 0, 1.9],
  ];
  for (const [x, , z] of poles) {
    a.cylinder("wood", 0.12, 0.16, 5.4, 6, { at: [x, 2.7, z] });
    a.box("wood", [1.4, 0.12, 0.12], { at: [x, 5.1, z] });
    for (const dx of [-0.55, 0, 0.55]) a.cylinder("glass", 0.06, 0.06, 0.18, 5, { at: [x + dx, 5.25, z] });
  }
  // The wires end inside the insulators, below their tops: at the height of
  // the tops, they came up through them a hair.
  const wireY = 5.3;
  for (const dx of [-0.55, 0, 0.55]) {
    for (let i = 0; i < poles.length - 1; i++) {
      const p = poles[i];
      const q = poles[i + 1];
      a.wire("steel", [p[0] + dx, wireY, p[2]], [q[0] + dx, wireY, q[2]], 0.02, 0.3, 3);
    }
    a.wire("steel", [poles[0][0] + dx, wireY, poles[0][2]], [tx - 0.6 + (dx + 0.55), 2.7, tz + 0.3], 0.02, 0.25, 3);
  }

  return { slots: a.build(), anchors: { lamp, yard: [tx, 2.6, tz] } };
}

export function substation(): SubstationLayout {
  return cached("village:substation", buildSubstation);
}
