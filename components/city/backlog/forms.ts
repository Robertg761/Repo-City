/**
 * The crowd's shapes (PLAN.md 76.9): one small merged geometry per form, so a
 * metropolis with fifteen hundred open issues and pull requests draws them
 * with one instanced call per form.
 *
 *   fire        a skip on fire on a scorched patch
 *   collision   two cars that side-swiped, a warning triangle, hazard lamps
 *   wreck       a rusted car on its side with weeds through it
 *   pothole     a dug-out hole, its spoil and two cones
 *   roadblock   a striped barrier across the way, cones and an amber blinker
 *   survey      a surveyor's tripod and pegs with flagging tape
 *   signpost    a finger post and an information board
 *   scaffold    a bay of scaffolding up a facade, with its netting
 *   trench      a trench in the road behind barriers, spoil beside it
 *   van         a utility van with its roof beacon and cones behind it
 *   hoarding    a fenced, boarded-up empty plot, or a run of boarding
 *               along the pavement when there is no plot to fence
 *
 * FRAME. Like the hero incidents (`models/props/incidentDecor.ts`), `z` runs
 * along the road and `x` crosses it, and `y = 0` is whatever the object
 * stands on. On the kerb, local -x points at the carriageway. A scaffold's
 * frame is centred on the slab S4 reserves in front of the facade, with +z
 * pointing out of the building (`lib/city/backlog.ts`).
 *
 * SIZE. Each form is modelled inside S4's `CROWD_BASE_SIZE` footprint, which
 * is what placement keeps apart and what picking and blockages use; the
 * instance scale is the entity's `size` over that base, which is its heat
 * (`heatScale`). `blockages.test.ts` holds every model inside its footprint.
 *
 * PARTS. Every vertex carries a `crowd` attribute, `[part, weight]`. The part
 * says what the crowd shader (`material.ts`) does with it: the body stays
 * put, flames flicker and glow, lamps blink, a flag waves, a worker bobs. The
 * worker, the failing-checks beacon, the stop board and the approval flag are
 * OPTIONAL parts, baked into every pull request form and switched on or off
 * per instance by a mask. Modifiers therefore cost no draw calls at all, and
 * an abandoned site simply has its worker collapsed away. `weight` is 0..1
 * across the part: how far up a flame, how far out along a flag.
 *
 * Triangle budget (PLAN.md 76.9): at most 160 per issue form and 220 per
 * scaffold, modifiers included. `forms.test.ts` holds every form to it.
 */

import {
  BoxGeometry,
  BufferGeometry,
  CircleGeometry,
  ConeGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  IcosahedronGeometry,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { IncidentForm, WorksForm } from "@/types/analysis";
import { CONCRETE, HAZARD_RED, RUST, TREE_LEAF, WARNING_ORANGE, desaturate, mix } from "../palette";
import { geometryCache, mergeParts, toneKey, type Part, type Triple } from "../models/props/geometry";
import { SCAFFOLD_BAY } from "./constants";

export { SCAFFOLD_BAY };

/** Every form the crowd draws. The hero-only `site` is not one of them. */
export type CrowdForm = IncidentForm | Exclude<WorksForm, "site">;

export const ISSUE_FORMS: readonly IncidentForm[] = [
  "fire",
  "collision",
  "wreck",
  "pothole",
  "roadblock",
  "survey",
  "signpost",
];

export const PULL_FORMS: readonly Exclude<WorksForm, "site">[] = [
  "scaffold",
  "trench",
  "van",
  "hoarding",
];

export const CROWD_FORMS: readonly CrowdForm[] = [...ISSUE_FORMS, ...PULL_FORMS];

/**
 * What the renderer instances: every form, plus the kerb hoarding, which has
 * a model of its own (a long narrow fence along the pavement) rather than the
 * square plot hoarding stretched thin.
 */
export type CrowdMesh = CrowdForm | "hoarding-kerb";

export const CROWD_MESHES: readonly CrowdMesh[] = [...CROWD_FORMS, "hoarding-kerb"];

/** What the crowd shader does with a vertex. */
export const PART = {
  body: 0,
  /** Optional: mask bit 0. Bobs as it works. */
  worker: 1,
  /** Optional: mask bit 1. Red, blinking: the checks are failing. */
  beacon: 2,
  /** Optional: mask bit 2. Red board: changes were requested. */
  board: 3,
  /** Optional: mask bit 3. Green, waving: the pull request is approved. */
  flag: 4,
  /** Always on: flickers and glows. */
  flame: 5,
  /** Always on: a slow amber warning blinker. */
  amber: 6,
  /** Always on: quick hazard lamps. */
  hazard: 7,
} as const;

export type PartId = (typeof PART)[keyof typeof PART];

/** Mask bits for the optional parts: `1 << (part - 1)`. */
export const MASK = {
  worker: 1,
  beacon: 2,
  board: 4,
  flag: 8,
} as const;

/** The per-vertex attribute the crowd shader reads: `[part, weight]`. */
export const CROWD_ATTRIBUTE = "crowd";

/** A lamp the halo layer should glow around, in the form's own frame. */
export interface FormLamp {
  position: Triple;
  color: string;
  part: PartId;
  /** World units across the halo. */
  size: number;
}

export interface FormSpec {
  /** Lamps the halo layer glows around; optional parts only when switched on. */
  lamps: FormLamp[];
  /** Where the smoke rises from, when the form smokes. */
  smoke: Triple | null;
}

interface PartGroup {
  part: PartId;
  parts: Part[];
  /** 0..1 per vertex; absent means 0 everywhere. */
  weight?: (x: number, y: number, z: number) => number;
}

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------

const STEEL = "#9aa0a6";
const PLANK = "#c39a5f";
const NETTING = "#6f9a6a";
const EARTH = "#6e5540";
const HOLE = "#2f302c";
const SCORCH = "#2b2724";
const BURNT = "#4a433d";
const SKIP = "#6c5a44";
const FLAME_OUTER = "#ff8a2a";
const FLAME_INNER = "#ffd35a";
const HIVIS = "#e6c02f";
const HELMET = "#f0d44a";
const SKIN = "#c99f7d";
const SIGN_BLUE = "#3f74b5";
const SIGN_WHITE = "#eeeae0";
const POST = "#6b6f6d";
const BEACON_RED = "#ff3b30";
const AMBER = "#ffb347";
const HAZARD_LAMP = "#ffae3a";
const FLAG_GREEN = "#3fb45a";
const BOARD_RED = "#d8392f";
const VAN_WHITE = "#e9e6dc";
const HOARDING_GREEN = "#3f6b58";
const TAPE = "#ff6f91";

// ---------------------------------------------------------------------------
// Primitives. Boxes are 12 triangles, a six-sided cone 12, which is what the
// budget is spent in.
// ---------------------------------------------------------------------------

function box(size: Triple, position: Triple, color: string, rotation?: Triple): Part {
  return { geometry: new BoxGeometry(size[0], size[1], size[2]), color, position, rotation };
}

function cone(x: number, z: number, color: string, height = 0.62, radius = 0.22): Part {
  return {
    geometry: new ConeGeometry(radius, height, 6),
    color,
    position: [x, height / 2, z],
  };
}

/** A flat disc lying on the ground, facing up: 8 triangles. */
function decal(radius: number, color: string, x = 0, z = 0, y = 0.02): Part {
  return {
    geometry: new CircleGeometry(radius, 8),
    color,
    position: [x, y, z],
    rotation: [-Math.PI / 2, 0, 0],
  };
}

/**
 * A small car, 0.9 across and 2.4 long like the fleet's hatchback: body and
 * cabin (24 triangles), a dark underbody that reads as its wheels from above
 * (12 more), and optionally four tyres (48 more), which is what lets a car
 * lying on its side still read as a car. `roll` tips it about its own long
 * axis before `rotationY` turns it.
 */
function carParts(
  position: Triple,
  rotationY: number,
  color: string,
  cabin = "#3b4450",
  roll = 0,
  tyres: string | null = null,
): Part[] {
  const [x, y, z] = position;
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);
  const up = Math.cos(roll);
  const side = Math.sin(roll);
  // A point in the car's own frame: rolled about z, then turned about y.
  const at = (lx: number, ly: number, lz: number): Triple => {
    const rx = lx * up - ly * side;
    const ry = lx * side + ly * up;
    return [x + rx * cos + lz * sin, y + ry, z - rx * sin + lz * cos];
  };
  const rotation: Triple = [0, rotationY, roll];
  const parts: Part[] = [
    { geometry: new BoxGeometry(0.9, 0.44, 2.4), color, position: at(0, 0.38, 0), rotation },
    { geometry: new BoxGeometry(0.8, 0.36, 1.06), color: cabin, position: at(0, 0.78, -0.12), rotation },
    { geometry: new BoxGeometry(0.84, 0.2, 2.0), color: "#262728", position: at(0, 0.1, 0), rotation },
  ];
  if (tyres) {
    for (const [lx, lz] of [[-0.4, 0.74], [0.4, 0.74], [-0.4, -0.74], [0.4, -0.74]]) {
      parts.push({ geometry: new BoxGeometry(0.14, 0.34, 0.34), color: tyres, position: at(lx, 0.17, lz), rotation });
    }
  }
  return parts;
}

/** A worker in a hi-vis vest and hard hat: 36 triangles. */
function workerParts(x: number, z: number, tone: (hex: string) => string): Part[] {
  return [
    box([0.34, 0.62, 0.24], [x, 0.44, z], tone(HIVIS)),
    box([0.22, 0.22, 0.22], [x, 0.87, z], tone(SKIN)),
    box([0.3, 0.08, 0.3], [x, 1.01, z], tone(HELMET)),
  ];
}

/** The failing-checks beacon: a red lamp. 12 triangles. */
function beaconPart(position: Triple): Part {
  return box([0.22, 0.22, 0.22], position, BEACON_RED);
}

/** The approval flag: a pole and a cloth that waves. 24 triangles. */
function flagParts(x: number, z: number, tone: (hex: string) => string, height = 2.1): Part[] {
  return [
    box([0.06, height, 0.06], [x, height / 2, z], tone(POST)),
    box([0.72, 0.44, 0.03], [x + 0.39, height - 0.26, z], tone(FLAG_GREEN)),
  ];
}

// ---------------------------------------------------------------------------
// The forms
// ---------------------------------------------------------------------------

interface Built {
  groups: PartGroup[];
  spec: FormSpec;
}

/** Height fraction inside `[base, top]`, for flames. */
const rising = (base: number, top: number) => (_x: number, y: number) =>
  Math.min(1, Math.max(0, (y - base) / (top - base)));

/** How far out along a flag cloth from its pole at `x = pole`. */
const outward = (pole: number, length: number) => (x: number) =>
  Math.min(1, Math.max(0, (x - pole) / length));

function fire(tone: (hex: string) => string): Built {
  // A skip on fire: the crowd's small fires. The flames rise out of it.
  const flames: Part[] = [
    { geometry: new ConeGeometry(0.4, 1.35, 6), color: FLAME_OUTER, position: [0, 1.28, -0.05] },
    { geometry: new ConeGeometry(0.27, 0.95, 6), color: FLAME_INNER, position: [0.14, 1.08, 0.2] },
    { geometry: new ConeGeometry(0.24, 0.8, 6), color: FLAME_OUTER, position: [-0.2, 1.0, 0.3] },
  ];
  return {
    groups: [
      {
        part: PART.body,
        parts: [
          decal(0.68, tone(SCORCH)),
          // The skip: a tapered steel bin, charred, with its lifting lugs.
          {
            geometry: new CylinderGeometry(0.72, 0.56, 0.62, 4, 1),
            color: tone(SKIP),
            position: [0, 0.34, 0],
            rotation: [0, Math.PI / 4, 0],
            scale: [1, 1, 1.18],
          },
          box([0.08, 0.14, 0.3], [-0.66, 0.5, 0], tone(BURNT)),
          box([0.08, 0.14, 0.3], [0.66, 0.5, 0], tone(BURNT)),
          box([0.7, 0.1, 0.8], [0, 0.62, 0], tone(BURNT)),
        ],
      },
      { part: PART.flame, parts: flames, weight: rising(0.6, 1.95) },
    ],
    spec: {
      lamps: [{ position: [0, 1.15, 0.1], color: FLAME_OUTER, part: PART.flame, size: 2.4 }],
      smoke: [0, 1.9, 0],
    },
  };
}

function collision(tone: (hex: string) => string): Built {
  // A side-swipe: two cars that met at an angle, a warning triangle behind.
  return {
    groups: [
      {
        part: PART.body,
        parts: [
          ...carParts([-0.5, 0, -0.08], 0.1, tone("#5f8fb0")),
          ...carParts([0.5, 0, 0.1], -0.12, tone("#e9e6dc")),
          box([0.26, 0.06, 0.18], [0.02, 0.04, 1.3], tone("#8c8880"), [0, 0.9, 0]),
          box([0.18, 0.06, 0.26], [0.1, 0.04, -1.3], tone("#8c8880"), [0, -0.4, 0]),
          { geometry: new ConeGeometry(0.2, 0.4, 3), color: tone(HAZARD_RED), position: [0.85, 0.2, -1.28] },
        ],
      },
      {
        part: PART.hazard,
        parts: [
          box([0.8, 0.08, 0.08], [-0.38, 0.5, 1.12], HAZARD_LAMP, [0, 0.1, 0]),
          box([0.8, 0.08, 0.08], [0.35, 0.5, -1.1], HAZARD_LAMP, [0, -0.12, 0]),
        ],
      },
    ],
    spec: {
      lamps: [
        { position: [-0.38, 0.5, 1.12], color: HAZARD_LAMP, part: PART.hazard, size: 1.3 },
        { position: [0.35, 0.5, -1.1], color: HAZARD_LAMP, part: PART.hazard, size: 1.3 },
      ],
      smoke: null,
    },
  };
}

function wreck(tone: (hex: string) => string): Built {
  // A car on its side, rusted, with its tyres to the street and weeds through it.
  const rusted = tone(mix(RUST, "#7a5a44", 0.35));
  const weed = tone(mix(TREE_LEAF, "#9aa36a", 0.4));
  return {
    groups: [
      {
        part: PART.body,
        parts: [
          decal(0.66, tone("#4f4a42"), 0, 0.5),
          decal(0.66, tone("#4f4a42"), 0, -0.5),
          ...carParts([0.46, 0.54, 0], 0, rusted, tone("#4a4038"), 1.5, tone("#2b2a28")),
          { geometry: new ConeGeometry(0.2, 0.62, 5), color: weed, position: [-0.5, 0.31, 1.05] },
          { geometry: new ConeGeometry(0.18, 0.5, 5), color: weed, position: [0.5, 0.25, -1.05] },
          { geometry: new ConeGeometry(0.16, 0.44, 5), color: weed, position: [0.5, 0.22, 0.95] },
        ],
      },
    ],
    spec: { lamps: [], smoke: null },
  };
}

function pothole(tone: (hex: string) => string): Built {
  return {
    groups: [
      {
        part: PART.body,
        parts: [
          decal(0.52, tone(HOLE), 0, 0.1, 0.03),
          decal(0.66, tone("#6a6860"), 0, 0.1, 0.02),
          {
            geometry: new IcosahedronGeometry(0.3, 0),
            color: tone("#4a4740"),
            position: [0.36, 0.12, -0.5],
            scale: [1, 0.5, 1.1],
          },
          cone(-0.5, 0.62, tone(WARNING_ORANGE), 0.46, 0.16),
          cone(0.5, 0.68, tone(WARNING_ORANGE), 0.46, 0.16),
          // White collars, so a cone reads as a cone and not as a spike.
          box([0.2, 0.06, 0.2], [-0.5, 0.27, 0.62], tone("#f2efe6")),
          box([0.2, 0.06, 0.2], [0.5, 0.27, 0.68], tone("#f2efe6")),
        ],
      },
    ],
    spec: { lamps: [], smoke: null },
  };
}

function roadblock(tone: (hex: string) => string): Built {
  return {
    groups: [
      {
        part: PART.body,
        parts: [
          box([1.86, 0.24, 0.1], [0, 0.66, 0], tone(HAZARD_RED)),
          box([1.86, 0.24, 0.1], [0, 0.94, 0], tone("#f2efe6")),
          box([0.1, 1.08, 0.1], [-0.82, 0.54, 0], tone(CONCRETE)),
          box([0.1, 1.08, 0.1], [0.82, 0.54, 0], tone(CONCRETE)),
          box([0.34, 0.06, 0.66], [-0.82, 0.03, 0], tone("#50544f")),
          box([0.34, 0.06, 0.66], [0.82, 0.03, 0], tone("#50544f")),
          cone(-0.4, 0.2, tone(WARNING_ORANGE), 0.5, 0.17),
          cone(0.4, 0.2, tone(WARNING_ORANGE), 0.5, 0.17),
        ],
      },
      { part: PART.amber, parts: [box([0.18, 0.18, 0.18], [0.82, 1.17, 0], AMBER)] },
    ],
    spec: {
      lamps: [{ position: [0.82, 1.17, 0], color: AMBER, part: PART.amber, size: 1.4 }],
      smoke: null,
    },
  };
}

function survey(tone: (hex: string) => string): Built {
  const leg = (angle: number): Part => ({
    geometry: new BoxGeometry(0.05, 0.98, 0.05),
    color: tone("#c9a24a"),
    position: [Math.sin(angle) * 0.17, 0.47, Math.cos(angle) * 0.17],
    rotation: [Math.cos(angle) * 0.34, 0, -Math.sin(angle) * 0.34],
  });
  const peg = (x: number, z: number): Part[] => [
    box([0.07, 0.46, 0.07], [x, 0.23, z], tone("#b59a6f")),
    box([0.18, 0.06, 0.02], [x + 0.09, 0.42, z], tone(TAPE)),
  ];
  return {
    groups: [
      {
        part: PART.body,
        parts: [
          leg(0),
          leg((Math.PI * 2) / 3),
          leg((Math.PI * 4) / 3),
          box([0.24, 0.18, 0.3], [0, 1.02, 0], tone("#e2c46a")),
          box([0.08, 0.08, 0.18], [0, 1.07, 0.22], tone("#2f3330")),
          ...peg(-0.44, 0.44),
          ...peg(0.36, 0.46),
          ...peg(0.0, -0.5),
        ],
      },
    ],
    spec: { lamps: [], smoke: null },
  };
}

function signpost(tone: (hex: string) => string): Built {
  return {
    groups: [
      {
        part: PART.body,
        parts: [
          { geometry: new CylinderGeometry(0.06, 0.07, 2.3, 6), color: tone(POST), position: [0, 1.15, 0] },
          // Finger boards pointing both ways along the road.
          box([0.1, 0.24, 0.62], [0.08, 2.08, 0.08], tone(SIGN_BLUE)),
          box([0.1, 0.24, 0.62], [-0.08, 1.76, -0.08], tone(SIGN_BLUE)),
          // The information board: a white face in a blue frame.
          box([0.1, 0.84, 0.56], [0, 0.92, 0], tone(SIGN_BLUE)),
          box([0.02, 0.68, 0.44], [0.06, 0.92, 0], tone(SIGN_WHITE)),
          box([0.02, 0.68, 0.44], [-0.06, 0.92, 0], tone(SIGN_WHITE)),
        ],
      },
    ],
    spec: { lamps: [], smoke: null },
  };
}

function scaffold(tone: (hex: string) => string): Built {
  const { width, height, depth } = SCAFFOLD_BAY;
  const half = width / 2 - 0.05;
  const front = depth / 2 - 0.06;
  const back = -depth / 2 + 0.1;
  const lift1 = height * 0.36;
  const lift2 = height * 0.7;
  const pole = (x: number, z: number) => box([0.09, height, 0.09], [x, height / 2, z], tone(STEEL));
  return {
    groups: [
      {
        part: PART.body,
        parts: [
          pole(-half, front),
          pole(half, front),
          pole(-half, back),
          pole(half, back),
          box([width - 0.1, 0.08, 0.08], [0, lift1 + 0.9, front], tone(STEEL)),
          box([width - 0.1, 0.08, 0.08], [0, lift2 + 0.9, front], tone(STEEL)),
          // Working platforms across the bay.
          box([width - 0.1, 0.08, depth - 0.2], [0, lift1, 0], tone(PLANK)),
          box([width - 0.1, 0.08, depth - 0.2], [0, lift2, 0], tone(PLANK)),
          // Debris netting over the top lift.
          box([width - 0.2, height - lift2 - 0.15, 0.02], [0, (height + lift2) / 2, front + 0.03], tone(NETTING)),
        ],
      },
      // On the first lift, at work.
      {
        part: PART.worker,
        parts: workerParts(half * 0.35, 0, tone).map((p) => ({ ...p, position: [p.position![0], p.position![1] + lift1 + 0.04, p.position![2]] as Triple })),
        weight: () => 1,
      },
      { part: PART.beacon, parts: [beaconPart([half - 0.12, height + 0.12, front - 0.1])] },
      // The stop board hangs on the front rail at the foot of the bay.
      { part: PART.board, parts: [box([0.62, 0.62, 0.04], [-half * 0.5, lift1 * 0.55, front + 0.03], tone(BOARD_RED))] },
      { part: PART.flag, parts: flagParts(-half, front, tone, height + 1.1), weight: outward(-half + 0.03, 0.72) },
    ],
    spec: {
      lamps: [{ position: [half - 0.12, height + 0.12, front - 0.1], color: BEACON_RED, part: PART.beacon, size: 1.6 }],
      smoke: null,
    },
  };
}

function trench(tone: (hex: string) => string): Built {
  // A rail either side of the cut, one orange and one white, on two posts.
  const barrier = (x: number): Part[] => [
    box([0.1, 0.2, 2.8], [x, 0.62, 0], tone(x > 0 ? WARNING_ORANGE : "#f2efe6")),
    box([0.08, 0.68, 0.08], [x, 0.34, -1.3], tone(CONCRETE)),
    box([0.08, 0.68, 0.08], [x, 0.34, 1.3], tone(CONCRETE)),
  ];
  return {
    groups: [
      {
        part: PART.body,
        parts: [
          box([0.8, 0.04, 2.5], [0, 0.03, 0.1], tone(HOLE)),
          box([1.3, 0.03, 2.9], [0, 0.015, 0], tone(EARTH)),
          {
            geometry: new IcosahedronGeometry(0.4, 0),
            color: tone(EARTH),
            position: [0.1, 0.2, -1.22],
            scale: [1.2, 0.5, 0.55],
          },
          ...barrier(0.72),
          ...barrier(-0.72),
        ],
      },
      { part: PART.worker, parts: workerParts(0, 0.35, tone), weight: () => 1 },
      { part: PART.beacon, parts: [beaconPart([0.72, 0.8, 1.3])] },
      // Turned edge-on to the rail, so it stays inside the barriers' line.
      {
        part: PART.board,
        parts: [
          box([0.07, 1.2, 0.07], [-0.72, 0.6, 1.1], tone(POST)),
          box([0.05, 0.56, 0.56], [-0.72, 1.4, 1.1], tone(BOARD_RED)),
        ],
      },
      { part: PART.flag, parts: flagParts(-0.72, -1.3, tone, 1.8), weight: outward(-0.69, 0.72) },
    ],
    spec: {
      lamps: [{ position: [0.72, 0.8, 1.3], color: BEACON_RED, part: PART.beacon, size: 1.4 }],
      smoke: null,
    },
  };
}

function van(tone: (hex: string) => string): Built {
  return {
    groups: [
      {
        part: PART.body,
        parts: [
          box([1.2, 1.2, 2.06], [0, 0.78, -0.2], tone(VAN_WHITE)),
          box([1.14, 0.78, 0.62], [0, 0.55, 1.14], tone(VAN_WHITE)),
          box([1.08, 0.32, 0.05], [0, 0.94, 1.45], tone("#3b4450")),
          box([1.22, 0.14, 2.68], [0, 0.36, 0.1], tone(WARNING_ORANGE)),
          box([1.2, 0.14, 2.74], [0, 0.13, 0.1], tone("#2f3134")),
          // The roof ladder.
          box([0.07, 0.06, 1.9], [-0.3, 1.42, -0.2], tone(STEEL)),
          box([0.07, 0.06, 1.9], [0.3, 1.42, -0.2], tone(STEEL)),
        ],
      },
      { part: PART.amber, parts: [box([0.34, 0.13, 0.15], [0, 1.45, 0.62], AMBER)] },
      { part: PART.worker, parts: workerParts(0.3, -1.37, tone), weight: () => 1 },
      { part: PART.beacon, parts: [beaconPart([0, 1.5, -1.05])] },
      // The stop board leans on the van's flank, on the pavement side.
      {
        part: PART.board,
        parts: [
          box([0.05, 1.1, 0.07], [0.63, 0.55, -0.7], tone(POST)),
          box([0.04, 0.54, 0.54], [0.63, 1.2, -0.7], tone(BOARD_RED)),
        ],
      },
      { part: PART.flag, parts: flagParts(-0.5, 0.6, tone, 2.2), weight: outward(-0.47, 0.72) },
    ],
    spec: {
      lamps: [
        { position: [0, 1.45, 0.62], color: AMBER, part: PART.amber, size: 1.3 },
        { position: [0, 1.5, -1.05], color: BEACON_RED, part: PART.beacon, size: 1.4 },
      ],
      smoke: null,
    },
  };
}

/**
 * A fence round a plot `w` across and `d` along: four boarded runs with a
 * white band, a planning notice on the front, and the four optional parts
 * inside the line. Ground hoardings are drawn at 2.8 square and stretched to
 * the plot; kerb hoardings have their own long, narrow model so the worker
 * inside is not squashed.
 */
function hoardingOf(w: number, d: number, tone: (hex: string) => string): Built {
  const hx = w / 2 - 0.1;
  const hz = d / 2 - 0.1;
  const run = (length: number, x: number, z: number, along: boolean): Part[] => {
    const size = (thick: number, tall: number): Triple => (along ? [thick, tall, length] : [length, tall, thick]);
    return [
      box(size(0.08, 1.3), [x, 0.68, z], tone(HOARDING_GREEN)),
      box(size(0.1, 0.14), [x, 1.18, z], tone(SIGN_WHITE)),
    ];
  };
  return {
    groups: [
      {
        part: PART.body,
        parts: [
          box([w - 0.1, 0.03, d - 0.1], [0, 0.015, 0], tone("#8d7a5e")),
          ...run(w - 0.1, 0, hz, false),
          ...run(w - 0.1, 0, -hz, false),
          ...run(d - 0.1, hx, 0, true),
          ...run(d - 0.1, -hx, 0, true),
          // The planning notice, on the long side facing the road.
          box([0.04, 0.46, 0.64], [-hx - 0.07, 0.9, 0], tone(SIGN_WHITE)),
        ],
      },
      { part: PART.worker, parts: workerParts(0.1, 0.2, tone), weight: () => 1 },
      { part: PART.beacon, parts: [beaconPart([hx, 1.46, hz])] },
      { part: PART.board, parts: [box([0.04, 0.54, 0.54], [-hx - 0.07, 1.0, -hz * 0.55], tone(BOARD_RED))] },
      {
        part: PART.flag,
        parts: flagParts(-hx + 0.04, hz - 0.04, tone, 2.3).map((p, i) =>
          i === 1 ? { ...p, position: [-hx + 0.04 + 0.39, 2.04, hz - 0.04] as Triple } : p,
        ),
        weight: outward(-hx + 0.07, 0.72),
      },
    ],
    spec: {
      lamps: [{ position: [hx, 1.46, hz], color: BEACON_RED, part: PART.beacon, size: 1.4 }],
      smoke: null,
    },
  };
}

/** The ground hoarding's own size before the plot stretches it (S4's `CROWD_BASE_SIZE`). */
export const HOARDING_GROUND = { w: 2.8, h: 2, d: 2.8 } as const;
/** The kerb hoarding's (S4's `HOARDING_KERB_SIZE`). */
export const HOARDING_KERB = { w: 1.1, h: 2, d: 3 } as const;

const BUILDERS: Record<CrowdMesh, (tone: (hex: string) => string) => Built> = {
  fire,
  collision,
  wreck,
  pothole,
  roadblock,
  survey,
  signpost,
  scaffold,
  trench,
  van,
  hoarding: (tone) => hoardingOf(HOARDING_GROUND.w, HOARDING_GROUND.d, tone),
  "hoarding-kerb": (tone) => hoardingOf(HOARDING_KERB.w, HOARDING_KERB.d, tone),
};

// ---------------------------------------------------------------------------
// Merging, with the part attribute
// ---------------------------------------------------------------------------

function mergeGroup(group: PartGroup): BufferGeometry {
  const merged = mergeParts(group.parts);
  const position = merged.getAttribute("position");
  const data = new Float32Array(position.count * 2);
  for (let i = 0; i < position.count; i++) {
    data[i * 2] = group.part;
    data[i * 2 + 1] = group.weight
      ? group.weight(position.getX(i), position.getY(i), position.getZ(i))
      : 0;
  }
  merged.setAttribute(CROWD_ATTRIBUTE, new Float32BufferAttribute(data, 2));
  return merged;
}

function build(form: CrowdMesh, desaturation: number): BufferGeometry {
  const shade = (hex: string) => desaturate(hex, desaturation);
  const { groups } = BUILDERS[form](shade);
  const pieces = groups.map(mergeGroup);
  const merged = mergeGeometries(pieces, false);
  for (const piece of pieces) piece.dispose();
  if (!merged) throw new Error(`crowd form ${form} could not be merged`);
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

const cache = geometryCache<string>((key) => {
  const [form, tone] = key.split(":");
  return build(form as CrowdMesh, Number(tone));
});

/** One form's merged geometry at the city's tone, built once and shared. */
export function formGeometry(form: CrowdMesh, desaturation = 0): BufferGeometry {
  return cache(`${form}:${toneKey(desaturation)}`);
}

const specs = new Map<CrowdMesh, FormSpec>();

/** A form's lamps and smoke origin. The layout does not depend on the tone. */
export function formSpec(form: CrowdMesh): FormSpec {
  const hit = specs.get(form);
  if (hit) return hit;
  const made = BUILDERS[form]((hex) => hex).spec;
  specs.set(form, made);
  return made;
}

/** Whether a form has the optional pull request parts. */
export const hasModifiers = (form: CrowdMesh): boolean =>
  form === "hoarding-kerb" || (PULL_FORMS as readonly string[]).includes(form);
