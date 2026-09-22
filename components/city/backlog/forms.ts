/**
 * The crowd's shapes (PLAN.md 76.9): one small merged geometry per form, so a
 * metropolis with fifteen hundred open issues and pull requests draws them
 * with one instanced call per form.
 *
 *   fire        a burnt-out car on a scorched patch, flames on its roof
 *   collision   two cars nose to nose, a warning triangle, hazard lamps
 *   wreck       a rusted car on its side with weeds through it
 *   pothole     a dug-out hole, spoil and three cones
 *   roadblock   a striped barrier across the way, cones and an amber blinker
 *   survey      a surveyor's tripod and pegs with flagging tape
 *   signpost    a finger post and an information board
 *   scaffold    a bay of scaffolding up a facade, with its netting
 *   trench      a trench in the road behind barriers, spoil beside it
 *   van         a utility van with its roof beacon and cones behind it
 *   hoarding    a fenced, boarded-up empty plot
 *
 * FRAME. Like the hero incidents (`models/props/incidentDecor.ts`), `z` runs
 * along the road and `x` crosses it, and `y = 0` is whatever the object
 * stands on. A scaffold is the exception: its generator `position` is its
 * host's facade centre and `rotationY` faces out, so it stands in front of
 * the wall from `z = 0` outwards.
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
const BURNT = "#5b524a";
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
 * A small car as two boxes, body and cabin: 24 triangles, or 72 with its four
 * tyres, which is what lets a car lying on its side still read as a car.
 * `roll` tips it about its own long axis before `rotationY` turns it.
 */
function carParts(
  position: Triple,
  rotationY: number,
  color: string,
  roll = 0,
  cabin = "#3b4450",
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
  const parts: Part[] = [
    { geometry: new BoxGeometry(1.05, 0.5, 2.2), color, position: at(0, 0.38, 0), rotation: [0, rotationY, roll] },
    { geometry: new BoxGeometry(0.92, 0.4, 1.1), color: cabin, position: at(0, 0.82, -0.12), rotation: [0, rotationY, roll] },
  ];
  if (tyres) {
    for (const [lx, lz] of [[-0.5, 0.68], [0.5, 0.68], [-0.5, -0.68], [0.5, -0.68]]) {
      parts.push({
        geometry: new BoxGeometry(0.16, 0.36, 0.36),
        color: tyres,
        position: at(lx, 0.18, lz),
        rotation: [0, rotationY, roll],
      });
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

/** The changes-requested stop board: a post and a red board. 24 triangles. */
function boardParts(x: number, z: number, tone: (hex: string) => string, height = 1.5): Part[] {
  return [
    box([0.08, height, 0.08], [x, height / 2, z], tone(POST)),
    box([0.62, 0.62, 0.06], [x, height + 0.2, z], tone(BOARD_RED)),
  ];
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
  const flames: Part[] = [
    { geometry: new ConeGeometry(0.46, 1.5, 6), color: FLAME_OUTER, position: [0, 1.62, -0.1] },
    { geometry: new ConeGeometry(0.3, 1.05, 6), color: FLAME_INNER, position: [0.12, 1.45, 0.25] },
    { geometry: new ConeGeometry(0.26, 0.9, 6), color: FLAME_OUTER, position: [-0.2, 1.3, 0.55] },
  ];
  return {
    groups: [
      {
        part: PART.body,
        parts: [
          decal(1.45, tone(SCORCH)),
          ...carParts([0, 0, 0], 0.18, tone(BURNT), 0, tone("#2c2825"), tone("#1f1d1b")),
          box([0.5, 0.12, 0.3], [0.95, 0.08, 1.05], tone("#4a4540"), [0, 0.7, 0]),
        ],
      },
      { part: PART.flame, parts: flames, weight: rising(0.85, 2.4) },
    ],
    spec: {
      lamps: [{ position: [0, 1.5, 0.1], color: FLAME_OUTER, part: PART.flame, size: 2.6 }],
      smoke: [0, 2.3, 0],
    },
  };
}

function collision(tone: (hex: string) => string): Built {
  return {
    groups: [
      {
        part: PART.body,
        parts: [
          ...carParts([-0.35, 0, -0.95], 0.55, tone("#5f8fb0")),
          ...carParts([0.4, 0, 1.0], Math.PI - 0.35, tone("#e9e6dc")),
          box([0.28, 0.08, 0.2], [0.55, 0.05, -0.1], tone("#8c8880"), [0, 0.9, 0]),
          box([0.2, 0.08, 0.3], [-0.6, 0.05, 0.4], tone("#8c8880"), [0, -0.4, 0]),
          // The warning triangle, set out behind the first car.
          { geometry: new ConeGeometry(0.3, 0.52, 3), color: tone(HAZARD_RED), position: [-0.9, 0.26, -2.25] },
        ],
      },
      {
        part: PART.hazard,
        parts: [box([0.9, 0.1, 0.1], [-0.35, 1.3, -0.9], HAZARD_LAMP, [0, 0.55, 0])],
      },
    ],
    spec: {
      lamps: [{ position: [-0.35, 1.3, -0.9], color: HAZARD_LAMP, part: PART.hazard, size: 1.6 }],
      smoke: null,
    },
  };
}

function wreck(tone: (hex: string) => string): Built {
  const rusted = tone(mix(RUST, "#7a5a44", 0.35));
  const weed = tone(mix(TREE_LEAF, "#9aa36a", 0.4));
  return {
    groups: [
      {
        part: PART.body,
        parts: [
          decal(1.3, tone("#4f4a42")),
          ...carParts([0.1, 0.57, 0], 0.45, rusted, 1.4, tone("#4a4038"), tone("#2b2a28")),
          { geometry: new ConeGeometry(0.28, 0.8, 5), color: weed, position: [-0.85, 0.4, 0.9] },
          { geometry: new ConeGeometry(0.24, 0.66, 5), color: weed, position: [0.95, 0.33, -0.95] },
          { geometry: new ConeGeometry(0.2, 0.55, 5), color: weed, position: [-0.7, 0.28, -1.05] },
          box([0.36, 0.1, 0.24], [0.9, 0.05, 0.85], tone("#7c766c"), [0, 0.5, 0]),
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
          decal(0.78, tone(HOLE), 0, 0, 0.025),
          decal(1.05, tone("#5b5a53"), 0, 0, 0.015),
          {
            geometry: new IcosahedronGeometry(0.42, 0),
            color: tone("#4a4740"),
            position: [0.7, 0.2, -0.85],
            scale: [1, 0.55, 1],
          },
          cone(-0.75, 0.55, tone(WARNING_ORANGE)),
          cone(0.8, 0.5, tone(WARNING_ORANGE)),
          cone(-0.2, -1.05, tone(WARNING_ORANGE)),
          // White collars, so a cone reads as a cone and not as a spike.
          box([0.3, 0.08, 0.3], [-0.75, 0.36, 0.55], tone("#f2efe6")),
          box([0.3, 0.08, 0.3], [0.8, 0.36, 0.5], tone("#f2efe6")),
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
          box([1.9, 0.26, 0.1], [0, 0.72, 0], tone(HAZARD_RED)),
          box([1.9, 0.26, 0.1], [0, 1.02, 0], tone("#f2efe6")),
          box([0.1, 1.15, 0.1], [-0.82, 0.575, 0], tone(CONCRETE)),
          box([0.1, 1.15, 0.1], [0.82, 0.575, 0], tone(CONCRETE)),
          box([0.5, 0.06, 0.34], [-0.82, 0.03, 0], tone("#50544f")),
          box([0.5, 0.06, 0.34], [0.82, 0.03, 0], tone("#50544f")),
          cone(-0.55, 0.65, tone(WARNING_ORANGE)),
          cone(0.55, 0.7, tone(WARNING_ORANGE)),
        ],
      },
      { part: PART.amber, parts: [box([0.2, 0.2, 0.2], [0.82, 1.28, 0], AMBER)] },
    ],
    spec: {
      lamps: [{ position: [0.82, 1.28, 0], color: AMBER, part: PART.amber, size: 1.5 }],
      smoke: null,
    },
  };
}

function survey(tone: (hex: string) => string): Built {
  const leg = (angle: number): Part => ({
    geometry: new BoxGeometry(0.05, 1.3, 0.05),
    color: tone("#c9a24a"),
    position: [Math.sin(angle) * 0.22, 0.62, Math.cos(angle) * 0.22],
    rotation: [Math.cos(angle) * 0.32, 0, -Math.sin(angle) * 0.32],
  });
  const peg = (x: number, z: number): Part[] => [
    box([0.07, 0.5, 0.07], [x, 0.25, z], tone("#b59a6f")),
    box([0.2, 0.06, 0.02], [x + 0.1, 0.46, z], tone(TAPE)),
  ];
  return {
    groups: [
      {
        part: PART.body,
        parts: [
          leg(0),
          leg((Math.PI * 2) / 3),
          leg((Math.PI * 4) / 3),
          box([0.26, 0.2, 0.34], [0, 1.34, 0], tone("#e2c46a")),
          box([0.08, 0.08, 0.2], [0, 1.4, 0.24], tone("#2f3330")),
          ...peg(-0.65, 0.7),
          ...peg(0.6, 0.75),
          ...peg(0.05, -0.85),
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
          { geometry: new CylinderGeometry(0.06, 0.07, 2.4, 6), color: tone(POST), position: [0, 1.2, 0] },
          // Finger boards pointing both ways along the road.
          box([0.12, 0.26, 1.0], [0.1, 2.1, 0.38], tone(SIGN_BLUE)),
          box([0.12, 0.26, 1.0], [-0.1, 1.76, -0.38], tone(SIGN_BLUE)),
          { geometry: new ConeGeometry(0.16, 0.24, 3), color: tone(SIGN_BLUE), position: [0.1, 2.1, 0.98], rotation: [Math.PI / 2, 0, 0] },
          // The information board: a white face in a blue frame.
          box([0.1, 0.9, 0.7], [0, 0.95, 0], tone(SIGN_BLUE)),
          box([0.02, 0.72, 0.56], [0.06, 0.95, 0], tone(SIGN_WHITE)),
          box([0.02, 0.72, 0.56], [-0.06, 0.95, 0], tone(SIGN_WHITE)),
        ],
      },
    ],
    spec: { lamps: [], smoke: null },
  };
}

/** The scaffold's bay, before the instance scale fits it to its facade. */
export const SCAFFOLD_BAY = { width: 4.4, height: 6.4, depth: 0.9 } as const;

function scaffold(tone: (hex: string) => string): Built {
  const { width, height, depth } = SCAFFOLD_BAY;
  const half = width / 2;
  const front = depth - 0.05;
  const back = 0.08;
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
          box([width, 0.08, 0.08], [0, height * 0.36, front], tone(STEEL)),
          box([width, 0.08, 0.08], [0, height * 0.7, front], tone(STEEL)),
          // Working platforms across the bay.
          box([width, 0.08, depth - 0.1], [0, height * 0.36 + 0.06, depth / 2], tone(PLANK)),
          box([width, 0.08, depth - 0.1], [0, height * 0.7 + 0.06, depth / 2], tone(PLANK)),
          // Debris netting over the top lift.
          box([width - 0.1, height * 0.28, 0.02], [0, height * 0.86, front + 0.03], tone(NETTING)),
        ],
      },
      { part: PART.worker, parts: workerParts(half * 0.4, depth / 2, tone), weight: () => 1 },
      { part: PART.beacon, parts: [beaconPart([half, height + 0.12, front])] },
      { part: PART.board, parts: boardParts(-half + 0.5, depth + 0.55, tone) },
      { part: PART.flag, parts: flagParts(-half, front, tone, height + 1.2), weight: outward(-half + 0.03, 0.72) },
    ],
    spec: {
      lamps: [{ position: [half, height + 0.12, front], color: BEACON_RED, part: PART.beacon, size: 1.6 }],
      smoke: null,
    },
  };
}

function trench(tone: (hex: string) => string): Built {
  // A rail either side of the cut, striped orange and white, on two posts.
  const barrier = (x: number): Part[] => [
    box([0.1, 0.2, 2.9], [x, 0.66, 0], tone(x > 0 ? WARNING_ORANGE : "#f2efe6")),
    box([0.08, 0.72, 0.08], [x, 0.36, -1.3], tone(CONCRETE)),
    box([0.08, 0.72, 0.08], [x, 0.36, 1.3], tone(CONCRETE)),
  ];
  return {
    groups: [
      {
        part: PART.body,
        parts: [
          box([0.9, 0.04, 2.8], [0, 0.03, 0], tone(HOLE)),
          box([1.2, 0.03, 3.1], [0, 0.015, 0], tone(EARTH)),
          {
            geometry: new IcosahedronGeometry(0.55, 0),
            color: tone(EARTH),
            position: [-0.95, 0.24, 0.9],
            scale: [0.8, 0.5, 1.5],
          },
          ...barrier(0.72),
          ...barrier(-0.72),
        ],
      },
      { part: PART.worker, parts: workerParts(-0.2, -0.5, tone), weight: () => 1 },
      { part: PART.beacon, parts: [beaconPart([0.72, 0.84, 1.3])] },
      { part: PART.board, parts: boardParts(0.75, 1.9, tone, 1.3) },
      { part: PART.flag, parts: flagParts(0.72, -1.3, tone, 1.9), weight: outward(0.75, 0.72) },
    ],
    spec: {
      lamps: [{ position: [0.72, 0.84, 1.3], color: BEACON_RED, part: PART.beacon, size: 1.5 }],
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
          box([1.2, 1.25, 2.3], [0, 0.78, -0.2], tone(VAN_WHITE)),
          box([1.14, 0.8, 0.7], [0, 0.55, 1.2], tone(VAN_WHITE)),
          box([1.1, 0.34, 0.06], [0, 0.95, 1.56], tone("#3b4450")),
          box([1.22, 0.16, 2.9], [0, 0.34, 0.1], tone(WARNING_ORANGE)),
          box([1.24, 0.14, 3.0], [0, 0.12, 0.1], tone("#2f3134")),
          // The roof ladder.
          box([0.08, 0.06, 2.1], [-0.3, 1.46, -0.2], tone(STEEL)),
          box([0.08, 0.06, 2.1], [0.3, 1.46, -0.2], tone(STEEL)),
          cone(-0.35, -2.05, tone(WARNING_ORANGE)),
          cone(0.4, -2.2, tone(WARNING_ORANGE)),
        ],
      },
      { part: PART.amber, parts: [box([0.36, 0.14, 0.16], [0, 1.5, 0.55], AMBER)] },
      { part: PART.worker, parts: workerParts(0.95, -1.4, tone), weight: () => 1 },
      { part: PART.beacon, parts: [beaconPart([0, 1.55, -1.1])] },
      { part: PART.board, parts: boardParts(-0.9, -1.6, tone, 1.2) },
      { part: PART.flag, parts: flagParts(0.55, 1.35, tone, 2.3), weight: outward(0.58, 0.72) },
    ],
    spec: {
      lamps: [
        { position: [0, 1.5, 0.55], color: AMBER, part: PART.amber, size: 1.4 },
        { position: [0, 1.55, -1.1], color: BEACON_RED, part: PART.beacon, size: 1.5 },
      ],
      smoke: null,
    },
  };
}

function hoarding(tone: (hex: string) => string): Built {
  const side = 2.5;
  const half = side / 2;
  const panel = (x: number, z: number, rotationY: number): Part[] => [
    box([side, 1.3, 0.08], [x, 0.7, z], tone(HOARDING_GREEN), [0, rotationY, 0]),
    box([side, 0.14, 0.1], [x, 1.2, z], tone(SIGN_WHITE), [0, rotationY, 0]),
  ];
  return {
    groups: [
      {
        part: PART.body,
        parts: [
          box([side, 0.03, side], [0, 0.015, 0], tone("#8d7a5e")),
          ...panel(0, half, 0),
          ...panel(0, -half, 0),
          ...panel(half, 0, Math.PI / 2),
          ...panel(-half, 0, Math.PI / 2),
          // A board on the front: "planning notice".
          box([0.7, 0.5, 0.04], [0.5, 0.95, half + 0.07], tone(SIGN_WHITE)),
        ],
      },
      { part: PART.worker, parts: workerParts(0.2, 0.1, tone), weight: () => 1 },
      { part: PART.beacon, parts: [beaconPart([half, 1.5, half])] },
      { part: PART.board, parts: boardParts(-0.7, half + 0.4, tone, 1.3) },
      { part: PART.flag, parts: flagParts(-half, -half, tone, 2.3), weight: outward(-half + 0.03, 0.72) },
    ],
    spec: {
      lamps: [{ position: [half, 1.5, half], color: BEACON_RED, part: PART.beacon, size: 1.5 }],
      smoke: null,
    },
  };
}

const BUILDERS: Record<CrowdForm, (tone: (hex: string) => string) => Built> = {
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
  hoarding,
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

function build(form: CrowdForm, desaturation: number): BufferGeometry {
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
  return build(form as CrowdForm, Number(tone));
});

/** One form's merged geometry at the city's tone, built once and shared. */
export function formGeometry(form: CrowdForm, desaturation = 0): BufferGeometry {
  return cache(`${form}:${toneKey(desaturation)}`);
}

const specs = new Map<CrowdForm, FormSpec>();

/** A form's lamps and smoke origin. The layout does not depend on the tone. */
export function formSpec(form: CrowdForm): FormSpec {
  const hit = specs.get(form);
  if (hit) return hit;
  const made = BUILDERS[form]((hex) => hex).spec;
  specs.set(form, made);
  return made;
}

/** Whether a form has the optional pull request parts. */
export const hasModifiers = (form: CrowdForm): boolean =>
  (PULL_FORMS as readonly string[]).includes(form);
