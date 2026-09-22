/**
 * What is on a construction site besides the crane (PLAN.md section 13).
 *
 * Section 13 asks for a fenced area, construction equipment and a partially
 * completed building on an open PR; weathered materials and an empty site on a
 * stale one; a clean new building on a merged one. This module builds all of
 * it, in the eleven unit site frame `ConstructionSite.tsx` draws at:
 *
 *   active     scaffolding up the shell, a mixer, an excavator, stacked
 *              materials, a site hut and a crew in yellow
 *   slow       the same site with one worker left and the mixer stopped
 *   abandoned  no fence, weeds through the hardstanding, a leaning sign and
 *              materials nobody came back for
 *   completed  a clean forecourt, a ribbon across the doors, a young tree
 *
 * One merged geometry per state and tone, built once and shared by every site
 * in that state, so eight sites cost eight draw calls rather than two hundred.
 */

import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  IcosahedronGeometry,
  type BufferGeometry,
} from "three";
import type { ConstructionState } from "@/types/analysis";
import { CONCRETE, RUST, TREE_LEAF, WARNING_ORANGE, desaturate, mix } from "../../palette";
import { figureParts } from "./figures";
import { geometryCache, mergeParts, toneKey, type Part, type Triple } from "./geometry";

/** The site is drawn on an eleven unit square; see `ConstructionSite.tsx`. */
export const SITE = 11;

/** Where the shell stands inside that square, and how wide it is. */
const SHELL_X = SITE * 0.12;
const SHELL_Z = SITE * 0.1;
const SHELL_W = 5.4;

/** Shell height per state, shared with the component that draws the shell. */
export const SHELL_HEIGHT: Record<ConstructionState, number> = {
  active: 5.4,
  slow: 4.2,
  abandoned: 3.4,
  completed: 8.5,
};

const STEEL = "#9aa0a6";
const TIMBER = "#b59a6f";
const WORKER = "#e6c02f";

/** The site hoarding: four runs of boarding with a warning rail on top. */
function fence(color: string, rail: string): Part[] {
  const half = SITE / 2;
  const parts: Part[] = [];
  const sides: [number, number, number][] = [
    [0, half, 0],
    [0, -half, 0],
    [half, 0, Math.PI / 2],
    [-half, 0, Math.PI / 2],
  ];
  for (const [x, z, rotation] of sides) {
    parts.push({
      geometry: new BoxGeometry(SITE, 1.5, 0.12),
      color,
      position: [x, 0.95, z],
      rotation: [0, rotation, 0],
    });
    parts.push({
      geometry: new BoxGeometry(SITE, 0.16, 0.16),
      color: rail,
      position: [x, 1.78, z],
      rotation: [0, rotation, 0],
    });
  }
  return parts;
}

/** Scaffolding: uprights, ledgers and a working platform up one face. */
function scaffold(height: number, color: string, plank: string): Part[] {
  const parts: Part[] = [];
  const reach = SHELL_W / 2 + 0.45;
  const top = height + 0.7;
  const corners: [number, number][] = [
    [-reach, -reach],
    [reach, -reach],
    [-reach, reach],
    [reach, reach],
    [0, -reach],
    [0, reach],
    [-reach, 0],
    [reach, 0],
  ];
  for (const [dx, dz] of corners) {
    parts.push({
      geometry: new CylinderGeometry(0.075, 0.075, top, 5),
      color,
      position: [SHELL_X + dx, top / 2, SHELL_Z + dz],
    });
  }
  // Ledgers every two units, and planks on the top two lifts.
  for (let level = 1; level * 1.9 < top; level++) {
    const y = level * 1.9;
    for (const side of [-1, 1]) {
      parts.push({
        geometry: new BoxGeometry(reach * 2, 0.09, 0.09),
        color,
        position: [SHELL_X, y, SHELL_Z + reach * side],
      });
      parts.push({
        geometry: new BoxGeometry(0.09, 0.09, reach * 2),
        color,
        position: [SHELL_X + reach * side, y, SHELL_Z],
      });
    }
    if (y > top - 4.2) {
      parts.push({
        geometry: new BoxGeometry(reach * 2, 0.08, 0.7),
        color: plank,
        position: [SHELL_X, y + 0.1, SHELL_Z + reach],
      });
    }
  }
  return parts;
}

/** A concrete mixer: a tilted drum on a wheeled frame. */
function mixer(at: Triple, rotationY: number, color: string, frame: string): Part[] {
  const [x, y, z] = at;
  return [
    {
      geometry: new CylinderGeometry(0.62, 0.42, 1.5, 10),
      color,
      position: [x, y + 1.15, z],
      rotation: [0.5, rotationY, 0],
    },
    { geometry: new BoxGeometry(0.9, 0.5, 1.2), color: frame, position: [x, y + 0.42, z] },
    {
      geometry: new CylinderGeometry(0.26, 0.26, 0.16, 8),
      color: "#2f3134",
      position: [x + 0.5, y + 0.26, z],
      rotation: [0, 0, Math.PI / 2],
    },
    {
      geometry: new CylinderGeometry(0.26, 0.26, 0.16, 8),
      color: "#2f3134",
      position: [x - 0.5, y + 0.26, z],
      rotation: [0, 0, Math.PI / 2],
    },
  ];
}

/** A small excavator: tracks, a cab, a boom and a bucket. */
function excavator(at: Triple, rotationY: number, body: string, metal: string): Part[] {
  const [x, y, z] = at;
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);
  const local = (lx: number, ly: number, lz: number): Triple => [
    x + lx * cos + lz * sin,
    y + ly,
    z - lx * sin + lz * cos,
  ];
  return [
    {
      geometry: new BoxGeometry(0.42, 0.42, 2.4),
      color: "#3a3d42",
      position: local(-0.62, 0.21, 0),
      rotation: [0, rotationY, 0],
    },
    {
      geometry: new BoxGeometry(0.42, 0.42, 2.4),
      color: "#3a3d42",
      position: local(0.62, 0.21, 0),
      rotation: [0, rotationY, 0],
    },
    {
      geometry: new BoxGeometry(1.5, 0.34, 2),
      color: metal,
      position: local(0, 0.6, 0),
      rotation: [0, rotationY, 0],
    },
    {
      geometry: new BoxGeometry(1.2, 1, 1.2),
      color: body,
      position: local(-0.1, 1.28, -0.3),
      rotation: [0, rotationY, 0],
    },
    // Boom and dipper, folded the way a parked machine leaves them.
    {
      geometry: new BoxGeometry(0.28, 0.28, 2),
      color: body,
      position: local(0.45, 1.5, 1),
      rotation: [-0.6, rotationY, 0],
    },
    {
      geometry: new BoxGeometry(0.24, 0.24, 1.5),
      color: body,
      position: local(0.45, 1.5, 2.2),
      rotation: [0.9, rotationY, 0],
    },
    {
      geometry: new BoxGeometry(0.5, 0.42, 0.5),
      color: metal,
      position: local(0.45, 0.6, 2.8),
      rotation: [0.4, rotationY, 0],
    },
  ];
}

/** Stacked materials: pipes, a pallet of blocks and a pile of sand. */
function materials(at: Triple, timber: string, pipe: string, sand: string): Part[] {
  const [x, y, z] = at;
  const parts: Part[] = [
    { geometry: new BoxGeometry(2.2, 0.7, 1.3), color: timber, position: [x, y + 0.35, z] },
    { geometry: new BoxGeometry(1.9, 0.5, 1.1), color: timber, position: [x, y + 0.98, z + 0.06] },
    { geometry: new ConeGeometry(1.15, 1.1, 9), color: sand, position: [x + 2.6, y + 0.55, z - 0.6] },
  ];
  for (let i = 0; i < 3; i++) {
    parts.push({
      geometry: new CylinderGeometry(0.22, 0.22, 2.6, 8),
      color: pipe,
      position: [x - 2.1 + i * 0.5, y + 0.22 + (i === 1 ? 0.4 : 0), z - 1.4],
      rotation: [0, 0, Math.PI / 2],
    });
  }
  return parts;
}

/** The site hut: where the kettle is. */
function hut(at: Triple, rotationY: number, body: string, roof: string): Part[] {
  const [x, y, z] = at;
  return [
    {
      geometry: new BoxGeometry(2.6, 1.6, 1.8),
      color: body,
      position: [x, y + 0.8, z],
      rotation: [0, rotationY, 0],
    },
    {
      geometry: new BoxGeometry(2.8, 0.14, 2),
      color: roof,
      position: [x, y + 1.68, z],
      rotation: [0, rotationY, 0],
    },
    {
      geometry: new BoxGeometry(0.62, 1.1, 0.08),
      color: roof,
      position: [x + 0.7 * Math.cos(rotationY), y + 0.55, z + 0.92 - 0.7 * Math.sin(rotationY)],
      rotation: [0, rotationY, 0],
    },
  ];
}

function weeds(color: string, count: number, spread: number): Part[] {
  const parts: Part[] = [];
  for (let i = 0; i < count; i++) {
    const angle = i * 2.39;
    const distance = 1.5 + ((i * 0.43) % 1) * spread;
    const size = 0.6 + ((i * 0.31) % 1) * 0.7;
    parts.push({
      geometry: new ConeGeometry(0.28 * size, 0.85 * size, 5),
      color,
      position: [Math.sin(angle) * distance, 0.42 * size, Math.cos(angle) * distance],
      rotation: [0, angle, 0],
    });
  }
  return parts;
}

function partsFor(state: ConstructionState, tone: number): Part[] {
  const shade = (hex: string) => desaturate(hex, tone);
  const weathered = (hex: string) => desaturate(hex, Math.min(1, tone + 0.4));
  const height = SHELL_HEIGHT[state];
  const parts: Part[] = [];

  if (state === "completed") {
    // A finished building: a swept forecourt, a ribbon across the doors and
    // something planted. The clean opposite of the site next door.
    parts.push(
      {
        geometry: new BoxGeometry(6.4, 0.08, 2.4),
        color: shade("#d9d3c4"),
        position: [SHELL_X, 0.09, SHELL_Z + 4],
      },
      {
        geometry: new CylinderGeometry(0.09, 0.09, 2.2, 6),
        color: shade(STEEL),
        position: [SHELL_X - 2.9, 1.1, SHELL_Z + 3],
      },
      {
        geometry: new CylinderGeometry(0.09, 0.09, 2.2, 6),
        color: shade(STEEL),
        position: [SHELL_X + 2.9, 1.1, SHELL_Z + 3],
      },
      {
        geometry: new BoxGeometry(5.8, 0.34, 0.06),
        color: shade("#c8493c"),
        position: [SHELL_X, 1.75, SHELL_Z + 3],
      },
      // The bow, off centre the way a ribbon actually hangs.
      {
        geometry: new BoxGeometry(0.7, 0.7, 0.08),
        color: shade("#d85c4c"),
        position: [SHELL_X - 0.6, 1.75, SHELL_Z + 2.98],
        rotation: [0, 0, 0.7],
      },
      {
        geometry: new CylinderGeometry(0.16, 0.22, 1.1, 6),
        color: shade("#8a6d52"),
        position: [SHELL_X - 4.1, 0.55, SHELL_Z + 3.4],
      },
      {
        geometry: new IcosahedronGeometry(0.95, 0),
        color: shade(TREE_LEAF),
        position: [SHELL_X - 4.1, 1.7, SHELL_Z + 3.4],
      },
      {
        geometry: new BoxGeometry(1.6, 0.1, 0.5),
        color: shade("#9a7c58"),
        position: [SHELL_X + 4.2, 0.45, SHELL_Z + 3.2],
      },
    );
    return parts;
  }

  if (state === "abandoned") {
    parts.push(...weeds(weathered(mix(TREE_LEAF, "#9aa36a", 0.45)), 14, 4.2));
    parts.push(
      ...materials(
        [-SITE * 0.3, 0, SITE * 0.3],
        weathered(RUST),
        weathered(RUST),
        weathered("#8f8a7c"),
      ),
    );
    // A hoarding that came down years ago, and the sign nobody took away.
    parts.push(
      {
        geometry: new BoxGeometry(SITE * 0.5, 1.5, 0.12),
        color: weathered(CONCRETE),
        position: [-SITE * 0.2, 0.7, SITE / 2],
        rotation: [0, 0, 0.16],
      },
      {
        geometry: new BoxGeometry(SITE * 0.34, 1.5, 0.12),
        color: weathered(CONCRETE),
        position: [SITE * 0.3, 0.6, SITE / 2 - 0.4],
        rotation: [0.9, 0.2, 0],
      },
      {
        geometry: new CylinderGeometry(0.1, 0.12, 2.6, 6),
        color: weathered("#6b6f6d"),
        position: [SITE * 0.34, 1.2, -SITE * 0.34],
        rotation: [0, 0, 0.22],
      },
      {
        geometry: new BoxGeometry(2, 1.3, 0.1),
        color: weathered(WARNING_ORANGE),
        position: [SITE * 0.34 - 0.55, 2.5, -SITE * 0.34],
        rotation: [0, 0, 0.22],
      },
    );
    parts.push(...scaffold(height, weathered(RUST), weathered(TIMBER)));
    return parts;
  }

  // active and slow: a working site, with more of everything when it is
  // actually moving (PLAN.md section 13's "crane moving, equipment").
  const busy = state === "active";
  parts.push(...fence(shade("#bdb6a4"), shade(WARNING_ORANGE)));
  parts.push(...scaffold(height, shade(STEEL), shade(TIMBER)));
  parts.push(...materials([-SITE * 0.3, 0, SITE * 0.32], shade(TIMBER), shade(STEEL), shade("#c2b08a")));
  parts.push(...hut([SITE * 0.3, 0, SITE * 0.34], -0.4, shade("#8fa3a8"), shade("#5f6a6d")));
  parts.push(
    ...mixer([SITE * 0.32, 0, -SITE * 0.1], busy ? 0.4 : 1.2, shade(WARNING_ORANGE), shade(STEEL)),
  );
  if (busy) {
    parts.push(
      ...excavator([-SITE * 0.32, 0, -SITE * 0.02], 2.2, shade("#e0b750"), shade("#6b6f6d")),
    );
  }

  const crew: [number, number, number][] = busy
    ? [
        [SITE * 0.08, SITE * 0.36, 2.6],
        [-SITE * 0.16, SITE * 0.3, -1.1],
        [SITE * 0.3, -SITE * 0.28, 0.6],
      ]
    : [[SITE * 0.26, SITE * 0.3, 1.4]];
  for (const [x, z, facing] of crew) {
    parts.push(
      ...figureParts({
        position: [x, 0, z],
        color: shade(WORKER),
        rotationY: facing,
        helmet: shade("#f0d44a"),
      }),
    );
  }
  return parts;
}

const builder = geometryCache<string>((key) => {
  const [state, tone] = key.split(":");
  return mergeParts(partsFor(state as ConstructionState, Number(tone)));
});

/** The crane's mast colour: rusted on a site nobody has visited for months. */
const mastColor = (state: ConstructionState, tone: number): string =>
  desaturate(state === "abandoned" ? RUST : "#e0b750", 0.15 + tone * 0.4);

const mastBuilder = geometryCache<string>((key) => {
  const [state, tone] = key.split(":");
  const mast = mastColor(state as ConstructionState, Number(tone));
  return mergeParts([
    {
      geometry: new BoxGeometry(2.4, 0.6, 2.4),
      color: desaturate(CONCRETE, Number(tone)),
      position: [0, 0.3, 0],
    },
    { geometry: new BoxGeometry(0.55, 12, 0.55), color: mast, position: [0, 6.6, 0] },
    // A lattice, so the mast is a tower rather than a stick.
    ...[2.4, 5.2, 8, 10.8].map((y) => ({
      geometry: new BoxGeometry(0.8, 0.12, 0.8),
      color: mast,
      position: [0, y, 0] as Triple,
    })),
  ]);
});

const jibBuilder = geometryCache<string>((key) => {
  const [state, tone] = key.split(":");
  const mast = mastColor(state as ConstructionState, Number(tone));
  const hook = desaturate(state === "abandoned" ? RUST : WARNING_ORANGE, Number(tone));
  return mergeParts([
    { geometry: new BoxGeometry(9, 0.42, 0.42), color: mast, position: [2.6, 0, 0] },
    {
      geometry: new BoxGeometry(2.4, 0.7, 0.7),
      color: mix(mast, "#000000", 0.35),
      position: [-2.2, 0, 0],
    },
    { geometry: new BoxGeometry(0.07, 2.8, 0.07), color: "#6f7270", position: [5.4, -1.4, 0] },
    { geometry: new BoxGeometry(0.9, 0.5, 0.9), color: hook, position: [5.4, -3, 0] },
  ]);
});

/** The crane's tower, and its jib in the jib's own turning frame. */
export const craneMastGeometry = (state: ConstructionState, desaturation: number) =>
  mastBuilder(`${state}:${toneKey(desaturation)}`);

export const craneJibGeometry = (state: ConstructionState, desaturation: number) =>
  jibBuilder(`${state}:${toneKey(desaturation)}`);

/** The merged site dressing for one state at the city's tone. */
export function constructionDecor(
  state: ConstructionState,
  desaturation: number,
): BufferGeometry {
  return builder(`${state}:${toneKey(desaturation)}`);
}
