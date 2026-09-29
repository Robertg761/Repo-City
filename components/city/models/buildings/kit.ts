/**
 * The modelling kit for the village and town buildings (PLAN.md 76.1
 * decision 7, 76.11 S6).
 *
 * The city's eight archetypes shade ONE colour: every vertex colour is a
 * multiplier on the district's building colour. A cottage cannot work that
 * way. Its thatch is straw whatever colour its walls are washed, its glass is
 * glass and its door is painted a colour of its own. So the settlement models
 * carry a paint channel per vertex (`MeshDraft.paint`):
 *
 *   PAINT_NONE    the vertex colour is the final colour: thatch, tile, stone,
 *                 timber, glass, window frames, flowers;
 *   PAINT_WALL    multiplied by the instance's wall colour (limewash, brick,
 *                 a painted front);
 *   PAINT_ACCENT  multiplied by the instance's accent colour (the door, the
 *                 shutters, the shop's fascia and awning stripes).
 *
 * `material.ts` reads the channel in the shader, so a whole archetype is still
 * one merged geometry and one instanced draw call.
 *
 * Everything is authored in the same unit space as `models.ts`: x and z in
 * [-0.5, 0.5], y in [0, 1], the front door on +z. Pure arrays, no three.js.
 */

import {
  PAINT_ACCENT,
  PAINT_NONE,
  PAINT_WALL,
  LAYER,
  addBox,
  addCylinder,
  addPanel,
  addQuad,
  emptyDraft,
  panelCentre,
  type BoxSpec,
  type Facing,
  type MeshDraft,
  type Panel,
  type Rgb3,
} from "./mesh";
import { SURFACE, type SurfaceId } from "../../textures/surface-types";
import { importedDraft, type ImportedModel } from "../imported";
import type { ModelKey } from "./archetypes";
import type { ArchetypeModel, RoofPad } from "./models";

/** A colour and the paint channel it is written in. */
export interface Mat {
  color: Rgb3;
  paint: number;
  surface?: SurfaceId;
}

type P = readonly [number, number, number];

/** A draft that records a paint channel for every vertex. */
export function settlementDraft(): MeshDraft {
  return { ...emptyDraft(), paint: [], paintValue: PAINT_WALL };
}

/** sRGB hex to the linear values a `color` attribute holds. */
export function linear(hex: string): Rgb3 {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return [channel((n >> 16) & 255), channel((n >> 8) & 255), channel(n & 255)];
}

const absolute = (hex: string, surface: SurfaceId): Mat => ({ color: linear(hex), paint: PAINT_NONE, surface });
const wallShade = (k: number): Mat => ({ color: [k, k, k], paint: PAINT_WALL, surface: SURFACE.plaster });
const accentShade = (k: number): Mat => ({ color: [k, k, k], paint: PAINT_ACCENT, surface: SURFACE.timber });

/**
 * The village and town materials. Warm and a little muted, so they sit under
 * the same PBR Neutral tone mapping as the city's beige housing without
 * shouting: straw, red-brown clay tile, blue-grey slate, limestone, oak.
 */
export const M = {
  wall: wallShade(1),
  wallShade: wallShade(0.86),
  wallDeep: wallShade(0.72),
  accent: accentShade(1),
  accentDark: accentShade(0.72),

  thatch: absolute("#c6a25e", SURFACE.thatch),
  thatchDark: absolute("#a3823f", SURFACE.thatch),
  thatchLight: absolute("#d6b675", SURFACE.thatch),
  tile: absolute("#a8573f", SURFACE.clayTile),
  tileDark: absolute("#8a4434", SURFACE.clayTile),
  slate: absolute("#6b7680", SURFACE.slate),
  slateDark: absolute("#56606a", SURFACE.slate),
  barnRoof: absolute("#655e58", SURFACE.metal),
  stone: absolute("#bdb4a3", SURFACE.stone),
  stoneDark: absolute("#968d7e", SURFACE.stone),
  brick: absolute("#a95e46", SURFACE.brick),
  brickDark: absolute("#8b4a37", SURFACE.brick),
  timber: absolute("#6b4e39", SURFACE.timber),
  timberDark: absolute("#4e3a2b", SURFACE.timber),
  frame: absolute("#f1ede2", SURFACE.timber),
  glass: absolute("#4f6070", SURFACE.glass),
  shopGlass: absolute("#5d7384", SURFACE.glass),
  door: absolute("#4a3a30", SURFACE.timber),
  flowerRed: absolute("#cf4d57", SURFACE.foliage),
  flowerPink: absolute("#e07ca0", SURFACE.foliage),
  flowerYellow: absolute("#e9c44f", SURFACE.foliage),
  leaf: absolute("#5b8a47", SURFACE.foliage),
  hay: absolute("#d9bd68", SURFACE.thatch),
  concrete: absolute("#c8c2b4", SURFACE.concrete),
  concreteDark: absolute("#a9a397", SURFACE.concrete),
  metal: absolute("#8b9295", SURFACE.metal),
  railing: absolute("#3e4448", SURFACE.metal),
  cream: absolute("#f1e7cf", SURFACE.plaster),
} as const satisfies Record<string, Mat>;

function paintAs(draft: MeshDraft, mat: Mat): Rgb3 {
  draft.paintValue = mat.paint;
  draft.surfaceValue = mat.surface ?? SURFACE.plaster;
  return mat.color;
}

export function box(draft: MeshDraft, spec: Omit<BoxSpec, "color" | "topColor">, mat: Mat): void {
  addBox(draft, { ...spec, color: paintAs(draft, mat) });
}

export function cylinder(
  draft: MeshDraft,
  spec: { x?: number; y: number; z?: number; radius: number; h: number; segments?: number },
  mat: Mat,
): void {
  addCylinder(draft, { ...spec, color: paintAs(draft, mat) });
}

export function panel(draft: MeshDraft, spec: Panel, mat: Mat): void {
  addPanel(draft, spec, paintAs(draft, mat));
}

export function quad(draft: MeshDraft, a: P, b: P, c: P, d: P, mat: Mat): void {
  addQuad(draft, a, b, c, d, paintAs(draft, mat));
}

const sub = (a: P, b: P): [number, number, number] => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: P, b: P): [number, number, number] => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const dot = (a: P, b: P) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const centroid = (points: readonly P[]): P => {
  const sum = points.reduce<[number, number, number]>(
    (acc, p) => [acc[0] + p[0], acc[1] + p[1], acc[2] + p[2]],
    [0, 0, 0],
  );
  return [sum[0] / points.length, sum[1] / points.length, sum[2] / points.length];
};

/**
 * A quad (or a triangle, three points) wound so its normal points away from
 * `inside`. Roofs are all slopes and gables at odd angles: working out every
 * winding by hand is how a model ends up with a black hole in its thatch.
 */
export function face(draft: MeshDraft, points: readonly P[], inside: P, mat: Mat): void {
  const [a, b, c] = points;
  const d = points[3] ?? points[2];
  const normal = cross(sub(b, a), sub(d, a));
  const out = sub(centroid(points), inside);
  if (dot(normal, out) >= 0) quad(draft, a, b, c, d, mat);
  else quad(draft, d, c, b, a, mat);
}

/**
 * A roof plane with thickness: the top face, the underside and the edges.
 * `top` is the upper surface as three or four points; the slab hangs
 * `thickness` below it. The underside is what the camera sees under a deep
 * thatch eave, and the edge is what makes a roof read as a roof rather than
 * a sheet of paper.
 */
export function slab(draft: MeshDraft, top: readonly P[], thickness: number, mat: Mat, under: Mat = mat): void {
  const bottom = top.map((p) => [p[0], p[1] - thickness, p[2]] as P);
  const mid = centroid([...top, ...bottom]);
  face(draft, top, mid, mat);
  face(draft, bottom, mid, under);
  for (let i = 0; i < top.length; i++) {
    const j = (i + 1) % top.length;
    face(draft, [top[i], top[j], bottom[j], bottom[i]], mid, mat);
  }
}

export interface RoofSpec {
  /** Centre of the roof on x and z. */
  x?: number;
  z?: number;
  /** Height of the wall plate the roof sits on. */
  y: number;
  /** Wall extents under the roof. */
  w: number;
  d: number;
  /** Rise from the wall plate to the ridge. */
  rise: number;
  /** How far the roof overhangs the walls, eaves and verges. */
  overhang: number;
  thickness: number;
  ridge: "x" | "z";
  roof: Mat;
  /** The gable-end triangles; usually the wall. */
  gable: Mat;
  /** A capping strip along the ridge. */
  ridgeCap?: Mat;
}

/** Eaves drain to a rear pipe, away from the street doors and shop awnings. */
export function rainwater(draft: MeshDraft, spec: RoofSpec): void {
  if (spec.w * spec.d < 0.3 || spec.rise < 0.1) return;
  const alongX = spec.ridge === "x";
  const halfA = (alongX ? spec.w : spec.d) / 2;
  const halfB = (alongX ? spec.d : spec.w) / 2;
  const outA = halfA + spec.overhang;
  const outB = halfB + spec.overhang;
  const eave = spec.y - spec.overhang * spec.rise / halfB;
  const cx = spec.x ?? 0;
  const cz = spec.z ?? 0;
  for (const side of [-1, 1]) {
    box(draft, alongX
      ? { x: cx, y: eave - 0.03, z: cz + side * (outB + 0.01), w: outA * 2 + LAYER * 4, h: 0.018, d: 0.032 }
      : { x: cx + side * (outB + 0.01), y: eave - 0.03, z: cz, w: 0.032, h: 0.018, d: outA * 2 + LAYER * 4 }, M.metal);
  }
  const a = -halfA + 0.05;
  const b = -outB - 0.01;
  cylinder(draft, { x: cx + (alongX ? a : b), y: 0.02, z: cz + (alongX ? b : a), radius: 0.009, h: Math.max(0.02, eave - 0.045), segments: 5 }, M.railing);
}

/** Overlapping tile courses, kept clear of the roof's depth-buffer layer. */
function roofCourses(
  draft: MeshDraft,
  at: (a: number, y: number, b: number) => P,
  spec: RoofSpec,
  halfA: number,
  halfB: number,
  ridgeHalf = halfA,
  joints = true,
): void {
  if (spec.rise < 0.1 || spec.w * spec.d < 0.2) return;
  const outA = halfA + spec.overhang;
  const outB = halfB + spec.overhang;
  const apex = spec.y + spec.rise;
  const pitch = spec.rise / halfB;
  const seam: Mat = { color: [spec.roof.color[0] * 0.8, spec.roof.color[1] * 0.8, spec.roof.color[2] * 0.8], paint: spec.roof.paint, surface: spec.roof.surface };
  const point = (a: number, b: number): P => at(a, apex - Math.abs(b) * pitch + 0.016, b);
  for (const side of [-1, 1]) {
    for (let row = joints ? 1 : 3; row <= 5; row++) {
      const b0 = (outB * row) / 6;
      const b1 = b0 + 0.012;
      const a0 = ridgeHalf + (outA - ridgeHalf) * (b0 / outB);
      const a1 = ridgeHalf + (outA - ridgeHalf) * (b1 / outB);
      face(draft, [point(-a0, side * b0), point(a0, side * b0), point(a1, side * b1), point(-a1, side * b1)], at(0, spec.y, 0), seam);
      if (!joints) continue;
      // Staggered tile joints stop at each course, like bonded slate or clay.
      const from = b1;
      const to = Math.min(outB, b0 + outB / 6 - 0.012);
      for (let joint = 1; joint < 5; joint++) {
        const a = -a0 + (2 * a0 * (joint + (row % 2) * 0.25)) / 5;
        if (Math.abs(a) + 0.004 > ridgeHalf + (outA - ridgeHalf) * (from / outB)) continue;
        face(draft, [point(a - 0.004, side * from), point(a + 0.004, side * from), point(a + 0.004, side * to), point(a - 0.004, side * to)], at(0, spec.y, 0), seam);
      }
    }
  }
}

/**
 * A gabled roof. The slopes carry on past the wall by `overhang` and drop
 * below the wall plate as they do, so the eave sits a little under the top of
 * the wall exactly as it would on a real house. The gable triangles close the
 * ends in the wall colour.
 */
export function gableRoof(draft: MeshDraft, spec: RoofSpec): void {
  const cx = spec.x ?? 0;
  const cz = spec.z ?? 0;
  // Work in a frame where the ridge runs along `a` and the slopes fall along `b`.
  const alongX = spec.ridge === "x";
  const halfA = (alongX ? spec.w : spec.d) / 2;
  const halfB = (alongX ? spec.d : spec.w) / 2;
  const pitch = spec.rise / halfB;
  const apex = spec.y + spec.rise;
  const eaveY = spec.y - spec.overhang * pitch;
  const outA = halfA + spec.overhang;
  const outB = halfB + spec.overhang;
  const at = (a: number, y: number, b: number): P => (alongX ? [cx + a, y, cz + b] : [cx + b, y, cz + a]);

  for (const side of [1, -1]) {
    slab(
      draft,
      [at(-outA, eaveY, side * outB), at(outA, eaveY, side * outB), at(outA, apex, 0), at(-outA, apex, 0)],
      spec.thickness,
      spec.roof,
    );
  }
  roofCourses(draft, at, spec, halfA, halfB);
  rainwater(draft, spec);
  const inside = at(0, spec.y, 0);
  for (const end of [1, -1]) {
    face(draft, [at(end * halfA, spec.y, -halfB), at(end * halfA, spec.y, halfB), at(end * halfA, apex - 0.004, 0)], inside, spec.gable);
  }
  if (spec.ridgeCap) {
    const t = spec.thickness * 0.9;
    box(
      draft,
      alongX
        ? { x: cx, y: apex - t * 0.4, z: cz, w: outA * 2 + LAYER * 2, h: t * 1.2, d: t * 1.6 }
        : { x: cx, y: apex - t * 0.4, z: cz, w: t * 1.6, h: t * 1.2, d: outA * 2 + LAYER * 2 },
      spec.ridgeCap,
    );
  }
}

/**
 * A hipped roof: four slopes and a short ridge, the shape a thatcher gives a
 * cottage. `ridge` is the long axis; the hips fall from its ends.
 */
export function hipRoof(
  draft: MeshDraft,
  spec: RoofSpec & {
    ridgeLength: number;
    /**
     * A band laid over the top of each slope below the ridge: the block-cut
     * ridge a thatcher finishes a roof with.
     */
    ridgeBand?: Mat;
  },
): void {
  const cx = spec.x ?? 0;
  const cz = spec.z ?? 0;
  const alongX = spec.ridge === "x";
  const halfA = (alongX ? spec.w : spec.d) / 2;
  const halfB = (alongX ? spec.d : spec.w) / 2;
  const pitch = spec.rise / halfB;
  const apex = spec.y + spec.rise;
  const eaveY = spec.y - spec.overhang * pitch;
  const outA = halfA + spec.overhang;
  const outB = halfB + spec.overhang;
  const r = spec.ridgeLength / 2;
  const at = (a: number, y: number, b: number): P => (alongX ? [cx + a, y, cz + b] : [cx + b, y, cz + a]);

  for (const side of [1, -1]) {
    slab(
      draft,
      [at(-outA, eaveY, side * outB), at(outA, eaveY, side * outB), at(r, apex, 0), at(-r, apex, 0)],
      spec.thickness,
      spec.roof,
    );
    slab(
      draft,
      [at(side * outA, eaveY, -outB), at(side * outA, eaveY, outB), at(side * r, apex, 0)],
      spec.thickness,
      spec.roof,
    );
  }
  // Reed courses start below the scalloped ridge and have no tile joints.
  roofCourses(draft, at, spec, halfA, halfB, r, !spec.ridgeBand);
  if (spec.ridgeBand) {
    // A fifth of the way down each long slope, lifted just off it, with a
    // scalloped lower edge: five points instead of a straight line.
    const k = 0.26;
    const lift = spec.thickness * 0.35;
    const yLow = apex - spec.rise * k + lift;
    const bLow = halfB * k;
    for (const side of [1, -1]) {
      const a0 = -r - (outA - r) * k;
      const a1 = r + (outA - r) * k;
      const teeth = 5;
      for (let i = 0; i < teeth; i++) {
        const t0 = a0 + ((a1 - a0) * i) / teeth;
        const t1 = a0 + ((a1 - a0) * (i + 1)) / teeth;
        const dip = bLow * 1.25;
        slab(
          draft,
          [
            at(t0, yLow, side * bLow),
            at(t1, yLow, side * bLow),
            at(Math.min(t1, r), apex + lift * 0.5, 0),
            at(Math.max(t0, -r), apex + lift * 0.5, 0),
          ],
          lift,
          spec.ridgeBand,
        );
        face(
          draft,
          [at(t0, yLow, side * bLow), at(t1, yLow, side * bLow), at((t0 + t1) / 2, yLow - (dip - bLow) * pitch, side * dip)],
          at((t0 + t1) / 2, apex - spec.rise, 0),
          spec.ridgeBand,
        );
      }
    }
  }
  if (spec.ridgeCap) {
    const t = Math.min(spec.thickness * 0.6, 0.03);
    box(
      draft,
      alongX
        ? { x: cx, y: apex - t * 0.3, z: cz, w: r * 2 + t * 2, h: t * 1.2, d: t * 1.8 }
        : { x: cx, y: apex - t * 0.3, z: cz, w: t * 1.8, h: t * 1.2, d: r * 2 + t * 2 },
      spec.ridgeCap,
    );
  }
}

/**
 * A box standing proud of a wall: a sill, a step, a window box, a shutter.
 * `v` is its BASE height and `u` its offset along the wall, in the same
 * convention as `Panel`.
 */
export function wallBox(
  draft: MeshDraft,
  spec: {
    facing: Facing;
    plane: number;
    u: number;
    v: number;
    w: number;
    h: number;
    /** How far it stands out from the wall. */
    depth: number;
    cx?: number;
    cz?: number;
  },
  mat: Mat,
): void {
  const cx = spec.cx ?? 0;
  const cz = spec.cz ?? 0;
  const out = spec.plane + spec.depth / 2;
  const common = { y: spec.v, h: spec.h, skipBottom: false };
  switch (spec.facing) {
    case "+z":
      box(draft, { ...common, x: cx + spec.u, z: cz + out, w: spec.w, d: spec.depth }, mat);
      return;
    case "-z":
      box(draft, { ...common, x: cx - spec.u, z: cz - out, w: spec.w, d: spec.depth }, mat);
      return;
    case "+x":
      box(draft, { ...common, x: cx + out, z: cz - spec.u, w: spec.depth, d: spec.w }, mat);
      return;
    default:
      box(draft, { ...common, x: cx - out, z: cz + spec.u, w: spec.depth, d: spec.w }, mat);
  }
}

/** A point on a wall, `out` in front of it. */
export function onWall(facing: Facing, plane: number, u: number, v: number, out: number, cx = 0, cz = 0): P {
  const [x, y, z] = panelCentre({ facing, u, v, w: 0, h: 0, plane: plane + out, cx, cz });
  return [x, y, z];
}

export interface WindowSpec {
  facing: Facing;
  plane: number;
  u: number;
  /** Centre height. */
  v: number;
  w: number;
  h: number;
  cx?: number;
  cz?: number;
  /** A painted shutter either side. */
  shutters?: boolean;
  /** A planter of flowers under the sill. */
  flowers?: Mat;
  /** A white glazing bar across the middle (sash) or a cross (casement). */
  bars?: "sash" | "cross" | "none";
  glass?: Mat;
  /** Width of the white frame round the glass. */
  frame?: number;
  /** A stone sill under the window; on by default. */
  sill?: boolean;
}

/**
 * A framed window: a white frame, the glass inside it, a stone sill, and
 * optionally shutters and a window box. Returns the glass rectangle, which the
 * lit-window pass reuses exactly (PLAN.md section 19).
 *
 * The glass stands one `LAYER` proud of the frame and the lit pane one more
 * in front of the glass. The glazing bars are not drawn over the glass: the
 * glass is cut into panes and the bars are the frame showing between them,
 * so nothing sits a hair in front of anything else to flicker.
 */
export function framedWindow(draft: MeshDraft, spec: WindowSpec): Panel {
  const base = { facing: spec.facing, u: spec.u, cx: spec.cx, cz: spec.cz };
  const frame = spec.frame ?? 0.016;
  panel(draft, { ...base, v: spec.v, w: spec.w + frame * 2, h: spec.h + frame * 2, plane: spec.plane }, M.frame);
  const glass: Panel = { ...base, v: spec.v, w: spec.w, h: spec.h, plane: spec.plane + LAYER, surface: SURFACE.glass };
  const bar = 0.012;
  const bars = spec.bars ?? "cross";
  // Pane edges across and up the glass: the bars are the gaps between them.
  const across = bars === "cross" ? [-spec.w / 2, -bar / 2, bar / 2, spec.w / 2] : [-spec.w / 2, spec.w / 2];
  const up = bars === "none" ? [-spec.h / 2, spec.h / 2] : [-spec.h / 2, -bar / 2, bar / 2, spec.h / 2];
  for (let i = 0; i < across.length; i += 2) {
    for (let j = 0; j < up.length; j += 2) {
      const w = across[i + 1] - across[i];
      const h = up[j + 1] - up[j];
      panel(
        draft,
        { ...glass, u: spec.u + (across[i] + across[i + 1]) / 2, v: spec.v + (up[j] + up[j + 1]) / 2, w, h },
        spec.glass ?? M.glass,
      );
    }
  }

  if (spec.sill !== false) {
    wallBox(
      draft,
      { ...base, plane: spec.plane, v: spec.v - spec.h / 2 - frame - 0.014, w: spec.w + frame * 3, h: 0.014, depth: 0.03 },
      M.stone,
    );
  }
  if (spec.shutters) {
    for (const side of [-1, 1]) {
      panel(
        draft,
        {
          ...base,
          u: spec.u + side * (spec.w / 2 + frame + spec.w * 0.27),
          v: spec.v,
          w: spec.w * 0.46,
          h: spec.h + frame * 2,
          plane: spec.plane,
        },
        M.accent,
      );
      for (let slat = 0; slat < 3; slat++) {
        panel(draft, {
          ...base,
          u: spec.u + side * (spec.w / 2 + frame + spec.w * 0.27),
          v: spec.v + (slat - 1) * spec.h * 0.25,
          w: spec.w * 0.34,
          h: 0.009,
          plane: spec.plane + LAYER,
        }, M.accentDark);
      }
    }
  }
  if (spec.flowers) {
    // The flowers stand back against the wall and two layers in from the
    // box's front and ends, so the rim of the box they grow in is a rim and
    // not a hairline. A hair off the wall, as they were, a sliver of sill
    // showed behind them and another of the box in front.
    const y = spec.v - spec.h / 2 - frame - 0.05;
    const rim = LAYER * 2;
    wallBox(draft, { ...base, plane: spec.plane, v: y, w: spec.w + frame * 2, h: 0.036, depth: 0.036 + rim }, M.timber);
    wallBox(draft, { ...base, plane: spec.plane, v: y + 0.036, w: spec.w + frame * 2 - rim * 2, h: 0.022, depth: 0.036 }, spec.flowers);
  }
  return glass;
}

/**
 * The front door: a stone surround, the painted door, a fanlight and a step.
 * `v` is the threshold. The door is the accent colour unless told otherwise.
 */
export function door(
  draft: MeshDraft,
  spec: {
    facing: Facing;
    plane: number;
    u: number;
    v: number;
    w: number;
    h: number;
    cx?: number;
    cz?: number;
    mat?: Mat;
    surround?: Mat;
    fanlight?: boolean;
    step?: boolean;
  },
): void {
  const base = { facing: spec.facing, u: spec.u, cx: spec.cx, cz: spec.cz };
  const surround = spec.surround ?? M.frame;
  const fan = spec.fanlight ? spec.h * 0.2 : 0;
  const total = spec.h + fan;
  panel(draft, { ...base, v: spec.v + (total + 0.025) / 2, w: spec.w + 0.05, h: total + 0.025, plane: spec.plane }, surround);
  panel(draft, { ...base, v: spec.v + spec.h / 2, w: spec.w, h: spec.h, plane: spec.plane + LAYER }, spec.mat ?? M.accent);
  // Lower recessed panels stay below the glass of shop doors; the handle
  // sits beside it. Both remain part of the same instanced building mesh.
  for (const side of [-1, 1]) {
    panel(draft, { ...base, u: spec.u + side * spec.w * 0.2, v: spec.v + spec.h * 0.2, w: spec.w * 0.28, h: spec.h * 0.2, plane: spec.plane + LAYER * 2 }, M.accentDark);
  }
  panel(draft, { ...base, u: spec.u + spec.w * 0.38, v: spec.v + spec.h * 0.48, w: Math.min(0.012, spec.w * 0.12), h: 0.012, plane: spec.plane + LAYER * 2 }, M.metal);
  if (fan > 0) {
    panel(draft, { ...base, v: spec.v + spec.h + fan / 2 + 0.004, w: spec.w * 0.9, h: fan - 0.008, plane: spec.plane + LAYER }, M.glass);
  }
  if (spec.step !== false) {
    // A layer above the threshold, so its tread never lies in the plane of
    // the plinth it stands on.
    wallBox(draft, { ...base, plane: spec.plane, v: 0, w: spec.w + 0.08, h: Math.max(0.02, spec.v + LAYER), depth: 0.06 }, M.stone);
  }
}

/** A chimney stack with a cap and a pot, rising from `y0` to `top`. */
export function chimney(
  draft: MeshDraft,
  spec: { x: number; z: number; y0: number; top: number; w?: number; d?: number; mat?: Mat; pots?: number },
): void {
  const w = spec.w ?? 0.1;
  const d = spec.d ?? 0.1;
  const mat = spec.mat ?? M.stone;
  const capH = 0.022;
  box(draft, { x: spec.x, y: spec.y0, z: spec.z, w, h: spec.top - spec.y0 - capH, d, skipBottom: true }, mat);
  // The cap overhangs the stack, so its underside is seen from a low camera.
  box(draft, { x: spec.x, y: spec.top - capH, z: spec.z, w: w + 0.024, h: capH, d: d + 0.024 }, M.stoneDark);
  // Pots in a row along the stack's long side, half its length apart: across
  // a narrow stack two pots overlapped, and left a notch of cap between them
  // too thin to draw.
  const pots = spec.pots ?? 1;
  const alongZ = d > w;
  const pitch = (alongZ ? d : w) * 0.5;
  for (let i = 0; i < pots; i++) {
    const offset = pots === 1 ? 0 : (i - (pots - 1) / 2) * pitch;
    cylinder(
      draft,
      { x: spec.x + (alongZ ? 0 : offset), y: spec.top, z: spec.z + (alongZ ? offset : 0), radius: 0.018, h: 0.04, segments: 5 },
      M.tileDark,
    );
    // A dark opening above the pot's rim reads as a hollow flue at close range.
    const x = spec.x + (alongZ ? 0 : offset);
    const z = spec.z + (alongZ ? offset : 0);
    const y = spec.top + 0.04 + LAYER;
    for (let side = 0; side < 5; side++) {
      const a = side * Math.PI * 2 / 5;
      const b = (side + 1) * Math.PI * 2 / 5;
      face(draft, [[x, y, z], [x + Math.cos(a) * 0.012, y, z + Math.sin(a) * 0.012], [x + Math.cos(b) * 0.012, y, z + Math.sin(b) * 0.012]], [x, spec.top, z], M.railing);
    }
  }
}

/** What a settlement model's Blender script publishes per node (`<name>.meta.json`). */
interface SettlementMeta {
  windows: Panel[];
  roofPads: RoofPad[];
  maxProps: number;
}

/**
 * A settlement model authored in Blender (`blender/settlement/*.py`, behind
 * `BLENDER_MODELS`) as the same `ArchetypeModel` the procedural builders
 * return. The script names its materials by role: `wall` is painted with the
 * instance's wall colour and `accent` with its accent, both in the tone the
 * material carries; every other role keeps its own colour, as `M` does. The
 * baked occlusion rides in the vertex colour. The windows, roof pads and prop
 * count come from the meta the same script wrote while placing the glass.
 */
export function importedArchetype(model: ImportedModel, node: string, id: ModelKey): ArchetypeModel {
  const meta = (model.meta as Record<string, SettlementMeta> | undefined)?.[node];
  if (!meta) throw new Error(`importedArchetype: no meta for ${node}`);
  const draft = importedSettlementDraft(model, node);
  return { id, draft, windows: meta.windows, roofPads: meta.roofPads, maxProps: meta.maxProps };
}

/**
 * The draft of a settlement model node (or of its near level, which has no
 * meta of its own: the lit windows are the lean model's): `wall` takes the
 * instance's wall colour, `accent` its accent, every other role its own.
 */
export function importedSettlementDraft(model: ImportedModel, node: string) {
  return importedDraft(model, node, (mat) => {
    if (mat.role === "wall") return { color: [1, 1, 1], paint: PAINT_WALL };
    if (mat.role === "accent") return { color: [1, 1, 1], paint: PAINT_ACCENT };
    return { color: linear(mat.hex), paint: PAINT_NONE };
  });
}
