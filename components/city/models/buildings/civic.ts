/**
 * The five civic file buildings (PLAN.md section 10): README becomes the
 * library, the manifest the clock hall, CHANGELOG the archive, CONTRIBUTING
 * the meeting house and the Dockerfile the goods yard.
 *
 * They are built the same way as the ordinary archetypes -- one merged,
 * flat-shaded draft plus a second draft for the glowing glass -- so a civic
 * building with steps, columns, a pediment, a belfry and a loading dock still
 * costs two draw calls rather than sixty meshes (PLAN.md sections 38 and 63).
 *
 * Unlike the archetypes these are authored in WORLD units from the plot the
 * generator reserved in `building.size`, because a civic building must fill
 * its plaza cell exactly and never grow into the block next door.
 *
 * Colours here are absolute, not multipliers: the renderer re-tints the colour
 * attribute on hover and selection, which is cheap for five buildings and
 * keeps the blue roofs blue.
 *
 * Pure arrays, no three.js. Unit tested.
 */

import type { LandmarkFile } from "@/types/analysis";
import {
  addBox,
  addCylinder,
  addDisc,
  addGable,
  addPanel,
  addQuad,
  emptyDraft,
  type MeshDraft,
  type Rgb3,
} from "./mesh";

export interface CivicPalette {
  wall: Rgb3;
  stone: Rgb3;
  roof: Rgb3;
  accent: Rgb3;
  trim: Rgb3;
  door: Rgb3;
  window: Rgb3;
  metal: Rgb3;
  flag: Rgb3;
  containers: [Rgb3, Rgb3, Rgb3];
}

export interface CivicDrafts {
  /** The building itself. */
  body: MeshDraft;
  /** Warm glass, drawn with the emissive material. */
  glow: MeshDraft;
}

export interface CivicPlot {
  w: number;
  h: number;
  d: number;
}

/** Height of the plinth every civic building stands on. */
const PLINTH_H = 0.5;

/** A window: a dark pane in the wall, and warm glass just in front of it. */
function addWindow(
  drafts: CivicDrafts,
  palette: CivicPalette,
  spec: {
    facing: "+z" | "-z" | "+x" | "-x";
    /** Offset along the wall, world units. */
    u: number;
    /** Centre height, world units. */
    v: number;
    w: number;
    h: number;
    /** Distance from the volume's centre to the wall. */
    plane: number;
    /** Centre of the volume, when it is not on the model's centreline. */
    cx?: number;
    cz?: number;
    lit?: boolean;
  },
): void {
  addPanel(drafts.body, { ...spec, plane: spec.plane }, palette.window);
  if (spec.lit !== false) {
    addPanel(
      drafts.glow,
      { ...spec, plane: spec.plane + 0.02, w: spec.w * 0.82, h: spec.h * 0.82 },
      [1, 1, 1],
    );
  }
}

/** A run of columns with bases and capitals: a portico, not four pipes. */
function addColonnade(
  draft: MeshDraft,
  palette: CivicPalette,
  spec: { count: number; spanW: number; z: number; y: number; h: number; radius: number },
): void {
  const { count, spanW, z, y, h, radius } = spec;
  for (let i = 0; i < count; i++) {
    const x = count === 1 ? 0 : -spanW / 2 + (spanW * i) / (count - 1);
    addBox(draft, { x, y, z, w: radius * 2.7, h: radius * 0.7, d: radius * 2.7, color: palette.stone });
    addCylinder(draft, {
      x,
      y: y + radius * 0.7,
      z,
      radius,
      h: h - radius * 1.5,
      segments: 8,
      color: palette.stone,
    });
    addBox(draft, {
      x,
      y: y + h - radius * 0.8,
      z,
      w: radius * 2.9,
      h: radius * 0.8,
      d: radius * 2.9,
      color: palette.stone,
    });
  }
}

/** Front steps with the cheek walls that make them read as an approach. */
function addSteps(
  draft: MeshDraft,
  palette: CivicPalette,
  spec: { z: number; w: number; y: number; h: number; treads?: number; run?: number },
): void {
  const treads = spec.treads ?? 4;
  const run = spec.run ?? 0.42;
  for (let i = 0; i < treads; i++) {
    addBox(draft, {
      y: spec.y,
      z: spec.z + run * (i + 0.5),
      w: spec.w * (1 - i * 0.04),
      h: spec.h * (1 - i / treads),
      d: run,
      color: palette.stone,
    });
  }
  for (const side of [1, -1]) {
    addBox(draft, {
      x: (side * spec.w) / 2,
      y: spec.y,
      z: spec.z + (run * treads) / 2,
      w: run * 0.9,
      h: spec.h * 1.15,
      d: run * treads,
      color: palette.stone,
    });
  }
}

/** A row of short posts along a roof edge. */
function addBalustrade(
  draft: MeshDraft,
  palette: CivicPalette,
  spec: { y: number; h: number; w: number; d: number; posts: number },
): void {
  const step = spec.w / (spec.posts - 1);
  for (let i = 0; i < spec.posts; i++) {
    const x = -spec.w / 2 + step * i;
    for (const z of [spec.d / 2, -spec.d / 2]) {
      addBox(draft, { x, y: spec.y, z, w: step * 0.28, h: spec.h, d: step * 0.28, color: palette.stone });
    }
  }
  for (const z of [spec.d / 2, -spec.d / 2]) {
    addBox(draft, { y: spec.y + spec.h, z, w: spec.w + step * 0.3, h: spec.h * 0.22, d: step * 0.34, color: palette.stone });
  }
}

/** A clock face with two hands, on the wall of a tower. */
function addClock(
  draft: MeshDraft,
  palette: CivicPalette,
  spec: {
    facing: "+z" | "-z" | "+x" | "-x";
    v: number;
    plane: number;
    radius: number;
    cx?: number;
    cz?: number;
  },
): void {
  const r = spec.radius;
  const at = { facing: spec.facing, cx: spec.cx, cz: spec.cz };
  addDisc(draft, { ...at, u: 0, v: spec.v, plane: spec.plane, radius: r * 1.12 }, palette.trim);
  addDisc(draft, { ...at, u: 0, v: spec.v, plane: spec.plane + 0.02, radius: r }, palette.stone);
  addPanel(draft, { ...at, u: 0, v: spec.v + r * 0.35, w: r * 0.16, h: r * 0.9, plane: spec.plane + 0.04 }, palette.door);
  addPanel(draft, { ...at, u: r * 0.3, v: spec.v, w: r * 0.7, h: r * 0.14, plane: spec.plane + 0.04 }, palette.door);
}

/** A flag on a pole, with the halyard cleat that sells the scale. */
function addFlag(
  draft: MeshDraft,
  palette: CivicPalette,
  spec: { x: number; z: number; y: number; h: number; size: number },
): void {
  addBox(draft, { x: spec.x, y: spec.y, z: spec.z, w: spec.size * 0.5, h: 0.22, d: spec.size * 0.5, color: palette.stone });
  addCylinder(draft, { x: spec.x, y: spec.y, z: spec.z, radius: 0.08, h: spec.h, segments: 6, color: palette.metal });
  const top = spec.y + spec.h;
  addQuad(
    draft,
    [spec.x, top - spec.size * 0.62, spec.z],
    [spec.x + spec.size * 1.5, top - spec.size * 0.62, spec.z + spec.size * 0.18],
    [spec.x + spec.size * 1.5, top - spec.size * 0.06, spec.z + spec.size * 0.18],
    [spec.x, top - spec.size * 0.06, spec.z],
    palette.flag,
  );
  addQuad(
    draft,
    [spec.x, top - spec.size * 0.06, spec.z],
    [spec.x + spec.size * 1.5, top - spec.size * 0.06, spec.z + spec.size * 0.18],
    [spec.x + spec.size * 1.5, top - spec.size * 0.62, spec.z + spec.size * 0.18],
    [spec.x, top - spec.size * 0.62, spec.z],
    palette.flag,
  );
  addCylinder(draft, { x: spec.x, y: top, z: spec.z, radius: 0.12, h: 0.12, segments: 6, color: palette.trim });
}

// ---------------------------------------------------------------------------
// README: the library
// ---------------------------------------------------------------------------

function library(plot: CivicPlot, p: CivicPalette): CivicDrafts {
  const drafts: CivicDrafts = { body: emptyDraft(), glow: emptyDraft() };
  const { w, h, d } = plot;
  const base = PLINTH_H;
  const wingW = w * 0.24;
  const wingH = h * 0.62;
  const body = drafts.body;

  // Two lower reading wings, so the block has a composition.
  for (const side of [1, -1]) {
    addBox(body, {
      x: side * (w / 2 + wingW / 2 - 0.05),
      y: base,
      z: -d * 0.04,
      w: wingW,
      h: wingH,
      d: d * 0.82,
      color: p.wall,
    });
    addBox(body, {
      x: side * (w / 2 + wingW / 2 - 0.05),
      y: base + wingH,
      z: -d * 0.04,
      w: wingW + 0.3,
      h: 0.22,
      d: d * 0.82 + 0.3,
      color: p.roof,
    });
    for (let i = 0; i < 2; i++) {
      addWindow(drafts, p, {
        facing: side > 0 ? "+x" : "-x",
        cx: side * (w / 2 + wingW / 2 - 0.05),
        cz: -d * 0.04,
        u: (i - 0.5) * d * 0.34,
        v: base + wingH * 0.55,
        w: d * 0.16,
        h: wingH * 0.45,
        plane: wingW / 2,
      });
    }
  }

  addBox(body, { y: base, w, h, d, color: p.wall });
  // A band course, halfway up, right round the block.
  addBox(body, { y: base + h * 0.52, w: w + 0.16, h: 0.18, d: d + 0.16, color: p.trim });

  // Tall reading-room windows down the flanks and the back.
  for (let i = 0; i < 3; i++) {
    for (const facing of ["+x", "-x"] as const) {
      addWindow(drafts, p, {
        facing,
        u: (i - 1) * d * 0.28,
        v: base + h * 0.62,
        w: d * 0.13,
        h: h * 0.42,
        plane: w / 2,
        lit: i !== 1,
      });
    }
    addWindow(drafts, p, {
      facing: "-z",
      u: (i - 1) * w * 0.28,
      v: base + h * 0.62,
      w: w * 0.12,
      h: h * 0.42,
      plane: d / 2,
    });
  }

  // The portico: steps, six columns, an entablature and a pediment.
  const porchZ = d / 2 + w * 0.09;
  const colH = h * 0.86;
  addSteps(body, p, { z: d / 2 + w * 0.18, w: w * 0.86, y: 0, h: base, treads: 4, run: w * 0.05 });
  addColonnade(body, p, {
    count: 6,
    spanW: w * 0.82,
    z: porchZ,
    y: base,
    h: colH,
    radius: Math.min(0.3, w * 0.045),
  });
  addBox(body, { y: base + colH, z: porchZ, w: w * 0.96, h: h * 0.1, d: w * 0.26, color: p.stone });
  addGable(body, {
    y: base + colH + h * 0.1,
    z: porchZ,
    w: w * 0.96,
    h: h * 0.2,
    d: w * 0.26,
    color: p.roof,
    ridge: "x",
  });
  // The tympanum: the flat triangle a city carves its name into.
  addPanel(
    body,
    { facing: "+z", u: 0, v: base + colH + h * 0.16, w: w * 0.4, h: h * 0.07, plane: porchZ + w * 0.13 },
    p.accent,
  );
  addBox(body, {
    y: base,
    z: porchZ + w * 0.05,
    w: w * 0.18,
    h: h * 0.42,
    d: 0.16,
    color: p.door,
  });

  // A flat roof with a cornice and a lantern over the reading room.
  addBox(body, { y: base + h, w: w + 0.5, h: 0.3, d: d + 0.5, color: p.roof });
  addBalustrade(body, p, { y: base + h + 0.3, h: h * 0.07, w: w * 0.92, d: d * 0.92, posts: 7 });
  addBox(body, { y: base + h + 0.3, z: -d * 0.06, w: w * 0.34, h: h * 0.16, d: d * 0.3, color: p.wall });
  for (const facing of ["+z", "-z"] as const) {
    addWindow(drafts, p, {
      facing,
      cz: -d * 0.06,
      u: 0,
      v: base + h + 0.3 + h * 0.08,
      w: w * 0.24,
      h: h * 0.08,
      plane: d * 0.15,
    });
  }
  addGable(body, {
    y: base + h + 0.3 + h * 0.16,
    z: -d * 0.06,
    w: w * 0.38,
    h: h * 0.1,
    d: d * 0.34,
    color: p.accent,
    ridge: "x",
  });

  return drafts;
}

// ---------------------------------------------------------------------------
// The manifest: the clock hall
// ---------------------------------------------------------------------------

function clockHall(plot: CivicPlot, p: CivicPalette): CivicDrafts {
  const drafts: CivicDrafts = { body: emptyDraft(), glow: emptyDraft() };
  const { w, h, d } = plot;
  const base = PLINTH_H;
  const body = drafts.body;

  addBox(body, { y: base, w, h, d, color: p.wall });
  addBox(body, { y: base + h * 0.44, w: w + 0.14, h: 0.16, d: d + 0.14, color: p.trim });

  // Two storeys of hall windows on every side.
  for (let i = 0; i < 3; i++) {
    for (const [facing, plane, span] of [
      ["+z", d / 2, w],
      ["-z", d / 2, w],
      ["+x", w / 2, d],
      ["-x", w / 2, d],
    ] as const) {
      addWindow(drafts, p, {
        facing,
        u: (i - 1) * span * 0.3,
        v: base + h * 0.26,
        w: span * 0.13,
        h: h * 0.26,
        plane,
        lit: i !== 2,
      });
      addWindow(drafts, p, {
        facing,
        u: (i - 1) * span * 0.3,
        v: base + h * 0.7,
        w: span * 0.13,
        h: h * 0.22,
        plane,
        lit: i !== 0,
      });
    }
  }

  // The portico over the front door.
  const porchZ = d / 2 + w * 0.08;
  const colH = h * 0.6;
  addSteps(body, p, { z: d / 2 + w * 0.17, w: w * 0.62, y: 0, h: base, treads: 3, run: w * 0.05 });
  addColonnade(body, p, {
    count: 4,
    spanW: w * 0.62,
    z: porchZ,
    y: base,
    h: colH,
    radius: Math.min(0.3, w * 0.055),
  });
  addBox(body, { y: base + colH, z: porchZ, w: w * 0.74, h: h * 0.08, d: w * 0.22, color: p.stone });
  addBox(body, { y: base, z: porchZ, w: w * 0.2, h: h * 0.4, d: 0.16, color: p.door });

  // Hipped roof and balustrade.
  addBox(body, { y: base + h, w: w + 0.44, h: 0.28, d: d + 0.44, color: p.roof });
  addBalustrade(body, p, { y: base + h + 0.28, h: h * 0.06, w: w * 0.94, d: d * 0.94, posts: 6 });

  // The clock tower: shaft, clock stage, belfry, spire.
  // Tower proportions are measured against the hall: shaft, clock stage,
  // belfry and spire together come to about four fifths of the hall's height,
  // which is a town hall rather than a lighthouse.
  const towerW = w * 0.3;
  const shaftH = h * 0.3;
  const towerY = base + h + 0.28;
  const towerZ = d * 0.1;
  addBox(body, { y: towerY, z: towerZ, w: towerW, h: shaftH, d: towerW, color: p.wall });
  addBox(body, { y: towerY + shaftH, z: towerZ, w: towerW + 0.3, h: 0.2, d: towerW + 0.3, color: p.trim });

  const clockY = towerY + shaftH + 0.2;
  const clockH = towerW * 0.95;
  addBox(body, { y: clockY, z: towerZ, w: towerW, h: clockH, d: towerW, color: p.stone });
  for (const facing of ["+z", "-z", "+x", "-x"] as const) {
    addClock(body, p, {
      facing,
      cz: towerZ,
      v: clockY + clockH / 2,
      plane: towerW / 2,
      radius: towerW * 0.3,
    });
  }

  // The belfry: four posts, an open stage and a roof.
  const belfryY = clockY + clockH;
  const belfryH = towerW * 0.7;
  addBox(body, { y: belfryY, z: towerZ, w: towerW + 0.24, h: 0.16, d: towerW + 0.24, color: p.trim });
  for (const [dx, dz] of [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ]) {
    addBox(body, {
      x: (dx * towerW) / 2.6,
      y: belfryY + 0.16,
      z: towerZ + (dz * towerW) / 2.6,
      w: towerW * 0.16,
      h: belfryH,
      d: towerW * 0.16,
      color: p.stone,
    });
  }
  addBox(body, { y: belfryY + 0.16 + belfryH * 0.45, z: towerZ, w: towerW * 0.5, h: belfryH * 0.3, d: towerW * 0.5, color: p.metal });
  addBox(body, { y: belfryY + 0.16 + belfryH, z: towerZ, w: towerW + 0.4, h: 0.18, d: towerW + 0.4, color: p.trim });
  addGable(body, {
    y: belfryY + 0.34 + belfryH,
    z: towerZ,
    w: towerW + 0.4,
    h: towerW * 1.15,
    d: towerW + 0.4,
    color: p.accent,
    ridge: "x",
  });
  addCylinder(body, {
    y: belfryY + 0.34 + belfryH + towerW * 1.15,
    z: towerZ,
    radius: towerW * 0.07,
    h: towerW * 0.5,
    segments: 6,
    color: p.metal,
  });

  return drafts;
}

// ---------------------------------------------------------------------------
// CHANGELOG: the archive
// ---------------------------------------------------------------------------

function archive(plot: CivicPlot, p: CivicPalette): CivicDrafts {
  const drafts: CivicDrafts = { body: emptyDraft(), glow: emptyDraft() };
  const { w, h, d } = plot;
  const base = PLINTH_H;
  const body = drafts.body;

  addBox(body, { y: base, w, h, d, color: p.wall });
  // Buttresses: an archive is a building that holds weight.
  for (let i = -1; i <= 1; i++) {
    for (const side of [1, -1]) {
      addBox(body, {
        x: (side * w) / 2,
        y: base,
        z: i * d * 0.3,
        w: w * 0.07,
        h: h * 0.92,
        d: d * 0.1,
        color: p.stone,
      });
    }
  }
  for (const side of [1, -1]) {
    addBox(body, {
      x: side * w * 0.34,
      y: base,
      z: (side * d) / 2,
      w: w * 0.1,
      h: h * 0.92,
      d: d * 0.07,
      color: p.stone,
    });
  }

  // Slit windows: an archive keeps the daylight off its shelves.
  for (let i = -1; i <= 1; i++) {
    addWindow(drafts, p, {
      facing: "+z",
      u: i * w * 0.24,
      v: base + h * 0.6,
      w: w * 0.06,
      h: h * 0.42,
      plane: d / 2,
      lit: i === 0,
    });
    addWindow(drafts, p, {
      facing: "-z",
      u: i * w * 0.24,
      v: base + h * 0.6,
      w: w * 0.06,
      h: h * 0.42,
      plane: d / 2,
      lit: false,
    });
  }

  // A heavy cornice and a low roof with vents.
  addBox(body, { y: base + h * 0.92, w: w + 0.4, h: h * 0.08, d: d + 0.4, color: p.trim });
  addBox(body, { y: base + h, w: w * 0.96, h: 0.16, d: d * 0.96, color: p.roof });
  for (const x of [-w * 0.26, w * 0.26]) {
    addCylinder(body, { x, y: base + h + 0.16, z: -d * 0.2, radius: w * 0.05, h: h * 0.1, segments: 6, color: p.metal });
  }

  // The record tower, banded, with a lantern that is always lit.
  // The tower stands proud of one corner, and well over the roof, or it reads
  // as a cupola rather than as the building's record stack.
  const towerW = w * 0.34;
  const towerH = h * 1.5;
  const tx = -w * 0.42;
  const tz = -d * 0.38;
  addBox(body, { x: tx, y: base, z: tz, w: towerW, h: towerH, d: towerW, color: p.wall });
  for (let i = 1; i <= 3; i++) {
    addBox(body, {
      x: tx,
      y: base + (towerH * i) / 4,
      z: tz,
      w: towerW + 0.2,
      h: 0.14,
      d: towerW + 0.2,
      color: p.trim,
    });
  }
  for (const facing of ["+z", "+x"] as const) {
    addWindow(drafts, p, {
      facing,
      cx: tx,
      cz: tz,
      u: 0,
      v: base + towerH * 0.62,
      w: towerW * 0.22,
      h: towerH * 0.3,
      plane: towerW / 2,
      lit: false,
    });
  }
  addBox(body, { x: tx, y: base + towerH, z: tz, w: towerW + 0.36, h: 0.22, d: towerW + 0.36, color: p.trim });
  const lanternY = base + towerH + 0.22;
  addBox(body, { x: tx, y: lanternY, z: tz, w: towerW * 0.6, h: towerW * 0.55, d: towerW * 0.6, color: p.stone });
  for (const facing of ["+z", "-z", "+x", "-x"] as const) {
    addWindow(drafts, p, {
      facing,
      cx: tx,
      cz: tz,
      u: 0,
      v: lanternY + towerW * 0.28,
      w: towerW * 0.36,
      h: towerW * 0.34,
      plane: towerW * 0.3,
    });
  }
  addGable(body, {
    x: tx,
    y: lanternY + towerW * 0.55,
    z: tz,
    w: towerW * 0.8,
    h: towerW * 0.7,
    d: towerW * 0.8,
    color: p.accent,
    ridge: "z",
  });

  // A reading annex with its own door, tucked against the main block.
  const annexW = w * 0.5;
  addBox(body, { x: w * 0.3, y: base, z: d * 0.62, w: annexW, h: h * 0.4, d: d * 0.3, color: p.wall });
  addBox(body, { x: w * 0.3, y: base + h * 0.4, z: d * 0.62, w: annexW + 0.26, h: 0.18, d: d * 0.3 + 0.26, color: p.roof });
  addBox(body, { x: w * 0.3, y: base, z: d * 0.77, w: annexW * 0.3, h: h * 0.26, d: 0.14, color: p.door });

  return drafts;
}

// ---------------------------------------------------------------------------
// The Dockerfile: the goods yard
// ---------------------------------------------------------------------------

function warehouse(plot: CivicPlot, p: CivicPalette): CivicDrafts {
  const drafts: CivicDrafts = { body: emptyDraft(), glow: emptyDraft() };
  const { w, h, d } = plot;
  const base = PLINTH_H;
  const body = drafts.body;
  const shedH = Math.max(h * 0.66, 2.6);
  const shedD = d * 0.78;

  addBox(body, { y: base, w, h: shedH, d: shedD, color: p.wall });
  // A barrel roof, built as a fan of facets: nothing else in the city has one.
  const facets = 9;
  const radius = w * 0.5;
  for (let i = 0; i < facets; i++) {
    const a0 = Math.PI * (i / facets);
    const a1 = Math.PI * ((i + 1) / facets);
    const x0 = -Math.cos(a0) * radius;
    const y0 = Math.sin(a0) * radius * 0.52;
    const x1 = -Math.cos(a1) * radius;
    const y1 = Math.sin(a1) * radius * 0.52;
    const top = base + shedH;
    addQuad(
      body,
      [x0, top + y0, shedD / 2],
      [x1, top + y1, shedD / 2],
      [x1, top + y1, -shedD / 2],
      [x0, top + y0, -shedD / 2],
      p.roof,
    );
    // End caps, so the barrel is not hollow from the street.
    addQuad(body, [0, top, shedD / 2], [x0, top + y0, shedD / 2], [x1, top + y1, shedD / 2], [x1, top + y1, shedD / 2], p.wall);
    addQuad(body, [x1, top + y1, -shedD / 2], [x0, top + y0, -shedD / 2], [0, top, -shedD / 2], [0, top, -shedD / 2], p.wall);
  }
  // A ridge vent along the top of the barrel.
  addBox(body, { y: base + shedH + radius * 0.52, w: w * 0.12, h: 0.18, d: shedD * 0.7, color: p.metal });

  // Three roll-up doors with frames, over a loading dock.
  const dockH = base + shedH * 0.12;
  addBox(body, { y: base, z: shedD / 2 + w * 0.09, w: w * 0.94, h: shedH * 0.12, d: w * 0.18, color: p.stone });
  for (const x of [-w * 0.3, 0, w * 0.3]) {
    addBox(body, { x, y: dockH, z: shedD / 2, w: w * 0.26, h: shedH * 0.6, d: 0.18, color: p.trim });
    addBox(body, { x, y: dockH, z: shedD / 2 + 0.06, w: w * 0.22, h: shedH * 0.55, d: 0.14, color: p.door });
    for (let i = 1; i <= 3; i++) {
      addBox(body, {
        x,
        y: dockH + (shedH * 0.55 * i) / 4,
        z: shedD / 2 + 0.14,
        w: w * 0.22,
        h: 0.06,
        d: 0.08,
        color: p.metal,
      });
    }
  }
  // Clerestory windows above the doors.
  for (const x of [-w * 0.3, 0, w * 0.3]) {
    addWindow(drafts, p, {
      facing: "+z",
      u: x,
      v: base + shedH * 0.84,
      w: w * 0.2,
      h: shedH * 0.14,
      plane: shedD / 2,
      lit: x !== 0,
    });
  }
  for (let i = -1; i <= 1; i++) {
    addWindow(drafts, p, {
      facing: "+x",
      u: i * shedD * 0.28,
      v: base + shedH * 0.7,
      w: shedD * 0.16,
      h: shedH * 0.2,
      plane: w / 2,
      lit: i !== 0,
    });
    addWindow(drafts, p, {
      facing: "-x",
      u: i * shedD * 0.28,
      v: base + shedH * 0.7,
      w: shedD * 0.16,
      h: shedH * 0.2,
      plane: w / 2,
      lit: false,
    });
  }

  // The container yard behind the shed: stacked, ribbed, slightly askew.
  const unit = Math.min(w * 0.3, d * 0.3);
  const container = (x: number, y: number, z: number, colour: Rgb3) => {
    addBox(body, { x, y, z, w: unit * 2, h: unit * 0.86, d: unit * 0.92, color: colour });
    for (let i = -2; i <= 2; i++) {
      addBox(body, {
        x: x + i * unit * 0.34,
        y: y + unit * 0.06,
        z,
        w: unit * 0.08,
        h: unit * 0.74,
        d: unit * 0.98,
        color: colour,
      });
    }
    addBox(body, { x, y: y + unit * 0.86, z, w: unit * 2.04, h: unit * 0.06, d: unit * 0.96, color: p.metal });
  };
  const yardZ = -shedD / 2 - unit * 0.8;
  container(-w * 0.16, base, yardZ, p.containers[0]);
  container(w * 0.22, base, yardZ - unit * 0.2, p.containers[1]);
  container(-w * 0.1, base + unit * 0.92, yardZ, p.containers[2]);
  // Pallets, because a yard is never tidy.
  for (const [px, pz] of [
    [w * 0.36, yardZ + unit * 0.9],
    [w * 0.3, yardZ + unit * 1.3],
  ]) {
    addBox(body, { x: px, y: base, z: pz, w: unit * 0.5, h: unit * 0.18, d: unit * 0.5, color: p.metal });
  }

  return drafts;
}

// ---------------------------------------------------------------------------
// CONTRIBUTING: the meeting house
// ---------------------------------------------------------------------------

function flagHouse(plot: CivicPlot, p: CivicPalette): CivicDrafts {
  const drafts: CivicDrafts = { body: emptyDraft(), glow: emptyDraft() };
  const { w, h, d } = plot;
  const base = PLINTH_H;
  const body = drafts.body;
  const wallH = h * 0.78;

  addBox(body, { y: base, w, h: wallH, d, color: p.wall });
  addBox(body, { y: base + wallH, w: w + 0.3, h: 0.18, d: d + 0.3, color: p.trim });
  addGable(body, { y: base + wallH + 0.18, w: w + 0.3, h: h * 0.34, d: d + 0.3, color: p.roof, ridge: "x" });

  // Dormers on the front slope: somebody is upstairs.
  for (const x of [-w * 0.26, w * 0.26]) {
    addBox(body, { x, y: base + wallH + 0.18, z: d * 0.16, w: w * 0.2, h: h * 0.16, d: d * 0.2, color: p.wall });
    addGable(body, {
      x,
      y: base + wallH + 0.18 + h * 0.16,
      z: d * 0.16,
      w: w * 0.24,
      h: h * 0.08,
      d: d * 0.24,
      color: p.roof,
      ridge: "x",
    });
    addWindow(drafts, p, {
      facing: "+z",
      u: x,
      v: base + wallH + h * 0.26,
      w: w * 0.1,
      h: h * 0.1,
      plane: d * 0.26,
    });
  }

  // Windows on every side, and a chimney.
  for (const [facing, plane, span] of [
    ["+z", d / 2, w],
    ["-z", d / 2, w],
    ["+x", w / 2, d],
    ["-x", w / 2, d],
  ] as const) {
    for (const i of [-1, 1]) {
      addWindow(drafts, p, {
        facing,
        u: i * span * 0.29,
        v: base + wallH * 0.56,
        w: span * 0.16,
        h: wallH * 0.38,
        plane,
        lit: i > 0 || facing === "+z",
      });
    }
  }
  addBox(body, { x: -w * 0.34, y: base + wallH, z: -d * 0.24, w: w * 0.12, h: h * 0.42, d: w * 0.12, color: p.stone });
  addBox(body, { x: -w * 0.34, y: base + wallH + h * 0.42, z: -d * 0.24, w: w * 0.16, h: 0.14, d: w * 0.16, color: p.trim });

  // The porch: steps, posts, a railing and a roof, with the door behind it.
  const porchD = d * 0.26;
  const porchZ = d / 2 + porchD / 2;
  const porchH = wallH * 0.74;
  addSteps(body, p, { z: d / 2 + porchD, w: w * 0.44, y: 0, h: base, treads: 3, run: w * 0.05 });
  addBox(body, { y: base - 0.08, z: porchZ, w: w * 0.86, h: 0.12, d: porchD, color: p.stone });
  for (const x of [-w * 0.36, -w * 0.12, w * 0.12, w * 0.36]) {
    addBox(body, { x, y: base, z: porchZ + porchD * 0.36, w: w * 0.05, h: porchH, d: w * 0.05, color: p.stone });
  }
  for (const x of [-w * 0.24, w * 0.24]) {
    addBox(body, { x, y: base + porchH * 0.34, z: porchZ + porchD * 0.36, w: w * 0.2, h: 0.1, d: w * 0.04, color: p.stone });
  }
  addBox(body, { y: base + porchH, z: porchZ, w: w * 0.92, h: 0.16, d: porchD + 0.3, color: p.roof });
  addBox(body, { y: base, z: d / 2, w: w * 0.2, h: wallH * 0.52, d: 0.16, color: p.door });
  addWindow(drafts, p, {
    facing: "+z",
    u: 0,
    v: base + wallH * 0.46,
    w: w * 0.16,
    h: wallH * 0.12,
    plane: d / 2 + 0.1,
  });

  // A bench by the door and a noticeboard: newcomers welcome.
  addBox(body, { x: w * 0.42, y: base, z: porchZ, w: w * 0.06, h: 0.3, d: d * 0.16, color: p.stone });
  addBox(body, { x: w * 0.42, y: base + 0.3, z: porchZ, w: w * 0.1, h: 0.08, d: d * 0.2, color: p.metal });
  const boardX = -w * 0.5;
  const boardZ = d / 2 + porchD * 1.1;
  addBox(body, { x: boardX, y: 0, z: boardZ, w: 0.12, h: base + h * 0.3, d: 0.12, color: p.metal });
  addBox(body, { x: boardX, y: base + h * 0.18, z: boardZ, w: w * 0.22, h: h * 0.16, d: 0.1, color: p.trim });

  addFlag(body, p, { x: w * 0.44, z: d * 0.42, y: base, h: h * 0.95 + 3.2, size: 1.1 });

  return drafts;
}

const BUILDERS: Record<LandmarkFile, (plot: CivicPlot, palette: CivicPalette) => CivicDrafts> = {
  readme: library,
  manifest: clockHall,
  changelog: archive,
  contributing: flagHouse,
  dockerfile: warehouse,
};

/** The plinth every civic building stands on: it reads as important. */
function addPlinth(draft: MeshDraft, plot: CivicPlot, p: CivicPalette): void {
  addBox(draft, { y: 0, w: plot.w * 1.3, h: PLINTH_H * 0.7, d: plot.d * 1.3, color: p.roof });
  addBox(draft, { y: PLINTH_H * 0.7, w: plot.w * 1.24, h: PLINTH_H * 0.3, d: plot.d * 1.24, color: p.stone });
}

/** Build one civic building at its reserved plot size. */
export function buildCivic(
  kind: LandmarkFile,
  plot: CivicPlot,
  palette: CivicPalette,
): CivicDrafts {
  const drafts = BUILDERS[kind](plot, palette);
  addPlinth(drafts.body, plot, palette);
  return drafts;
}
