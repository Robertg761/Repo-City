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
  facingYaw,
  surfaceColor,
  type Facing,
  type MeshDraft,
  type Rgb3,
} from "./mesh";
import { SURFACE } from "../../textures/surface-types";
import { importedDraft } from "../imported";
import { BLENDER_MODELS } from "../modelSource";
import { MODEL as CIVIC_KIT } from "./civicKit.model";

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

/**
 * The step between two details stacked on a civic wall, in world units. The
 * archetypes' `PANEL_LIFT` is sized for a unit model stretched over a
 * footprint; a civic building is modelled in world units, where the same
 * 0.006 is a few steps of the depth buffer at best and its windows flickered
 * against the stone from the overview.
 */
const CIVIC_LAYER = 0.03;

// ---------------------------------------------------------------------------
// The Blender kit (the default)
// ---------------------------------------------------------------------------

/**
 * By default the five buildings are assembled from the parts
 * modelled in `blender/civic/civic_kit.py`: columns, pediment, steps, clock,
 * belfry, spire, lantern, doors, containers and the rest. The masses (walls,
 * slabs, the barrel roof) stay boxes here, exact at any plot size, and the
 * cornices are the kit's authored profiles swept round them (`addProfile`),
 * so their corners mitre whatever the plot. A part is placed with one scale
 * where it must keep its proportions, and stretched on one axis only where
 * its authoring allows (see the script's header).
 */
interface KitMeta {
  profiles: Record<"cornice" | "band" | "plinthCap", [number, number][]>;
  pediment: { h: number; d: number };
  door: { h: number };
  belfryH: number;
  spireH: number;
  lanternH: number;
  drumH: number;
  flagSize: number;
}

/** The kit's published sizes and profiles; read on use, once the model is loaded. */
const kit = (): KitMeta => CIVIC_KIT.meta as KitMeta;

/** The palette a build is authored in, and whether it builds from the kit. */
type Authored = CivicPalette & { kit?: boolean };

type KitPart =
  | "ColumnBase" | "ColumnShaft" | "ColumnCapital" | "Pediment" | "Steps3" | "Steps4" | "StepCheek"
  | "Clock" | "Belfry" | "Spire" | "Lantern" | "LanternGlow" | "Baluster" | "Container" | "RollDoor"
  | "Door" | "Buttress" | "Vent" | "FlagPole" | "FlagTop" | "Sill" | "Hood" | "Bench";

interface Placement {
  /** Where the part's origin goes. */
  at: readonly [number, number, number];
  /** Turn about y: a wall part authored facing +z, turned to `facing`. */
  facing?: Facing;
  /** One scale, then per axis on top of it (in the part's own frame). */
  s?: number;
  sx?: number;
  sy?: number;
  sz?: number;
  /** The colour a `container` role takes. */
  container?: Rgb3;
}

function roleColor(p: CivicPalette, role: string, container?: Rgb3): Rgb3 {
  switch (role) {
    case "wall":
      return p.wall;
    case "stone":
      return p.stone;
    case "roof":
      return p.roof;
    case "accent":
      return p.accent;
    case "trim":
      return p.trim;
    case "door":
      return p.door;
    case "window":
      return p.window;
    case "metal":
      return p.metal;
    case "flag":
      return p.flag;
    case "container":
      return container ?? p.containers[0];
    default:
      // Warm glass: white, for the emissive material to colour.
      return [1, 1, 1];
  }
}

/** Add one kit part to a draft at a placement. */
function addPart(draft: MeshDraft, p: CivicPalette, part: KitPart, place: Placement): void {
  const source = importedDraft(CIVIC_KIT, part, (mat) => ({ color: roleColor(p, mat.role, place.container) }));
  const s = place.s ?? 1;
  const sx = s * (place.sx ?? 1);
  const sy = s * (place.sy ?? 1);
  const sz = s * (place.sz ?? 1);
  const yaw = place.facing ? facingYaw(place.facing) : 0;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const [ox, oy, oz] = place.at;
  const base = draft.positions.length / 3;
  const pos = source.positions;
  for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i] * sx;
    const z = pos[i + 2] * sz;
    draft.positions.push(ox + x * cos + z * sin, oy + pos[i + 1] * sy, oz - x * sin + z * cos);
  }
  // Flat shaded, one vertex per corner: the normal is the triangle's own,
  // taken after the scale so a stretched part still lights true.
  const out = draft.positions;
  for (let t = 0; t < pos.length / 9; t++) {
    const a = (base + t * 3) * 3;
    const ux = out[a + 3] - out[a];
    const uy = out[a + 4] - out[a + 1];
    const uz = out[a + 5] - out[a + 2];
    const vx = out[a + 6] - out[a];
    const vy = out[a + 7] - out[a + 1];
    const vz = out[a + 8] - out[a + 2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len;
    ny /= len;
    nz /= len;
    for (let k = 0; k < 3; k++) draft.normals.push(nx, ny, nz);
  }
  for (const c of source.colors) draft.colors.push(c);
  for (let i = 0; i < pos.length / 3; i++) draft.indices.push(base + i);
  if (draft.surface) for (const f of source.surface) draft.surface.push(f);
  if (draft.paint) for (let i = 0; i < pos.length / 3; i++) draft.paint.push(draft.paintValue ?? 0);
}

/** A point on a wall, in the building's frame (`panelCentre`'s convention). */
function onWall(facing: Facing, u: number, v: number, plane: number, cx = 0, cz = 0): readonly [number, number, number] {
  switch (facing) {
    case "+z":
      return [cx + u, v, cz + plane];
    case "-z":
      return [cx - u, v, cz - plane];
    case "+x":
      return [cx + plane, v, cz - u];
    default:
      return [cx - plane, v, cz + u];
  }
}

/**
 * A profile swept round a rectangle `w` by `d` centred on (cx, cz), its foot
 * at `y`: a cornice, a band course. Each point is (projection past the wall,
 * height), scaled by `scale`; offsetting both axes by the projection is what
 * mitres the corners, at any plot size.
 */
function addProfile(
  draft: MeshDraft,
  profile: readonly (readonly [number, number])[],
  spec: { y: number; w: number; d: number; cx?: number; cz?: number; scale?: number },
  color: Rgb3,
): void {
  const k = spec.scale ?? 1;
  const cx = spec.cx ?? 0;
  const cz = spec.cz ?? 0;
  const sides: [number, number, number, number][] = [
    // outward normal (x, z), along-wall axis (x, z) = y cross n
    [0, 1, 1, 0],
    [1, 0, 0, -1],
    [0, -1, -1, 0],
    [-1, 0, 0, 1],
  ];
  for (const [nx, nz, ux, uz] of sides) {
    const halfU = nx === 0 ? spec.w / 2 : spec.d / 2;
    const halfN = nx === 0 ? spec.d / 2 : spec.w / 2;
    const at = (along: number, o: number, y: number): [number, number, number] => [
      cx + ux * along * (halfU + o) + nx * (halfN + o),
      spec.y + y,
      cz + uz * along * (halfU + o) + nz * (halfN + o),
    ];
    for (let i = 0; i + 1 < profile.length; i++) {
      const [o0, y0] = profile[i];
      const [o1, y1] = profile[i + 1];
      if (Math.abs(o0 - o1) < 1e-9 && Math.abs(y0 - y1) < 1e-9) continue;
      addQuad(draft, at(-1, o0 * k, y0 * k), at(1, o0 * k, y0 * k), at(1, o1 * k, y1 * k), at(-1, o1 * k, y1 * k), color);
    }
  }
}

/** A column from the kit: base and capital at one scale, the shaft stretched. */
function addKitColumn(draft: MeshDraft, p: CivicPalette, x: number, y: number, z: number, h: number, r: number): void {
  addPart(draft, p, "ColumnBase", { at: [x, y, z], s: r });
  addPart(draft, p, "ColumnShaft", { at: [x, y + r * 0.7, z], sx: r, sz: r, sy: h - r * 1.5 });
  addPart(draft, p, "ColumnCapital", { at: [x, y + h - r * 0.8, z], s: r });
}

/** The kit's portico pediment, `w` wide, `h` to its apex, `d` deep. */
function addKitPediment(draft: MeshDraft, p: CivicPalette, y: number, z: number, w: number, h: number, d: number): void {
  addPart(draft, p, "Pediment", { at: [0, y, z], s: w, sy: h / w / kit().pediment.h, sz: d / w / kit().pediment.d });
}

/** A door from the kit on a wall: `w` wide and `h` tall. */
function addKitDoor(draft: MeshDraft, p: CivicPalette, facing: Facing, u: number, y: number, plane: number, w: number, h: number): void {
  // Its depth stays in world units: the leaf, panels and surround are layers
  // a fixed distance apart, whatever the door's width.
  addPart(draft, p, "Door", { at: onWall(facing, u, y, plane), facing, s: w, sy: h / w / kit().door.h, sz: 1 / w });
}

/** A lantern from the kit, `diameter` across, glazed into the glow draft. */
function addKitLantern(drafts: CivicDrafts, p: CivicPalette, x: number, y: number, z: number, diameter: number): void {
  addPart(drafts.body, p, "Lantern", { at: [x, y, z], s: diameter });
  addPart(drafts.glow, p, "LanternGlow", { at: [x, y, z], s: diameter });
}

/** A window: a dark pane in the wall, and warm glass just in front of it. */
function addWindow(
  drafts: CivicDrafts,
  palette: Authored,
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
    /** Kit only: a hood moulding over the window as well as a sill. */
    hood?: boolean;
  },
): void {
  addPanel(drafts.body, { ...spec, plane: spec.plane + CIVIC_LAYER }, palette.window);
  const frame = Math.min(0.075, spec.w * 0.08, spec.h * 0.08);
  if (palette.kit) {
    // A stone sill under it, and on the tall windows a hood over it: world
    // sized, stretched only along the wall.
    const span = spec.w + frame * 2 + 0.1;
    const { facing, cx, cz, u, plane } = spec;
    addPart(drafts.body, palette, "Sill", { at: onWall(facing, u, spec.v - spec.h / 2 - frame, plane, cx, cz), facing, sx: span });
    if (spec.hood) {
      addPart(drafts.body, palette, "Hood", { at: onWall(facing, u, spec.v + spec.h / 2 + frame, plane, cx, cz), facing, sx: span });
    }
  }
  const plane = spec.plane + CIVIC_LAYER * 3;
  for (const side of [-1, 1]) {
    addPanel(drafts.body, { ...spec, u: spec.u + side * (spec.w + frame) / 2, w: frame, h: spec.h + frame * 2, plane }, palette.trim);
    addPanel(drafts.body, { ...spec, v: spec.v + side * (spec.h + frame) / 2, w: spec.w, h: frame, plane }, palette.trim);
  }
  // Proud glazing bars remain visible in front of the warm glass at night.
  addPanel(drafts.body, { ...spec, w: frame * 0.7, plane }, palette.trim);
  addPanel(drafts.body, { ...spec, h: frame * 0.7, plane }, palette.trim);
  if (spec.lit !== false) {
    addPanel(
      drafts.glow,
      { ...spec, plane: spec.plane + CIVIC_LAYER * 2, w: spec.w * 0.82, h: spec.h * 0.82, surface: SURFACE.glass },
      [1, 1, 1],
    );
  }
}

/** A run of columns with bases and capitals: a portico, not four pipes. */
function addColonnade(
  draft: MeshDraft,
  palette: Authored,
  spec: { count: number; spanW: number; z: number; y: number; h: number; radius: number },
): void {
  const { count, spanW, z, y, h, radius } = spec;
  for (let i = 0; i < count; i++) {
    const x = count === 1 ? 0 : -spanW / 2 + (spanW * i) / (count - 1);
    if (palette.kit) {
      addKitColumn(draft, palette, x, y, z, h, radius);
      continue;
    }
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
  palette: Authored,
  spec: { z: number; w: number; y: number; h: number; treads?: number; run?: number },
): void {
  const treads = spec.treads ?? 4;
  const run = spec.run ?? 0.42;
  if (palette.kit && (treads === 3 || treads === 4)) {
    // The flight is planar, so it stretches on every axis; the cheeks keep
    // their coping by being stretched only along their run and height.
    addPart(draft, palette, treads === 3 ? "Steps3" : "Steps4", { at: [0, spec.y, spec.z], sx: spec.w, sy: spec.h, sz: run * treads });
    for (const side of [1, -1]) {
      addPart(draft, palette, "StepCheek", { at: [(side * spec.w) / 2, spec.y, spec.z], sx: run * 0.9, sy: spec.h, sz: run * treads });
    }
    return;
  }
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
  palette: Authored,
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
  if (palette.kit) {
    addPart(draft, palette, "Clock", { at: onWall(spec.facing, 0, spec.v, spec.plane, spec.cx, spec.cz), facing: spec.facing, s: r });
    return;
  }
  const at = { facing: spec.facing, cx: spec.cx, cz: spec.cz };
  addDisc(draft, { ...at, u: 0, v: spec.v, plane: spec.plane + CIVIC_LAYER, radius: r * 1.12 }, palette.trim);
  addDisc(draft, { ...at, u: 0, v: spec.v, plane: spec.plane + CIVIC_LAYER * 2, radius: r }, palette.stone);
  addPanel(draft, { ...at, u: 0, v: spec.v + r * 0.35, w: r * 0.16, h: r * 0.9, plane: spec.plane + CIVIC_LAYER * 3 }, palette.door);
  addPanel(draft, { ...at, u: r * 0.3, v: spec.v, w: r * 0.7, h: r * 0.14, plane: spec.plane + CIVIC_LAYER * 3 }, palette.door);
  for (let hour = 0; hour < 12; hour++) {
    const angle = (hour * Math.PI) / 6;
    addPanel(draft, { ...at, u: Math.sin(angle) * r * 0.78, v: spec.v + Math.cos(angle) * r * 0.78, w: r * 0.065, h: r * 0.065, plane: spec.plane + CIVIC_LAYER * 3 }, palette.door);
  }
  addDisc(draft, { ...at, u: 0, v: spec.v, plane: spec.plane + CIVIC_LAYER * 4, radius: r * 0.075, segments: 8 }, palette.metal);
}

/** A flag on a pole, with the halyard cleat that sells the scale. */
function addFlag(
  draft: MeshDraft,
  palette: Authored,
  spec: { x: number; z: number; y: number; h: number; size: number },
): void {
  addBox(draft, { x: spec.x, y: spec.y, z: spec.z, w: spec.size * 0.5, h: 0.22, d: spec.size * 0.5, color: palette.stone });
  if (palette.kit) {
    addPart(draft, palette, "FlagPole", { at: [spec.x, spec.y, spec.z], sx: 0.08, sz: 0.08, sy: spec.h });
    addPart(draft, palette, "FlagTop", { at: [spec.x, spec.y + spec.h, spec.z], s: spec.size / kit().flagSize });
    return;
  }
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

function library(plot: CivicPlot, p: Authored): CivicDrafts {
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
  if (p.kit) addProfile(body, kit().profiles.band, { y: base + h * 0.52, w, d }, p.trim);
  else addBox(body, { y: base + h * 0.52, w: w + 0.16, h: 0.18, d: d + 0.16, color: p.trim });

  // Tall reading-room windows down the flanks and the back.
  for (let i = 0; i < 3; i++) {
    for (const facing of ["+x", "-x"] as const) {
      addWindow(drafts, p, {
        facing,
        u: (i - 1) * d * 0.28,
        v: base + h * 0.62,
        w: d * 0.13,
        h: h * 0.42,
        hood: true,
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
      hood: true,
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
  if (p.kit) {
    // A true pediment, its triangle to the square, and the door on the wall.
    addKitPediment(body, p, base + colH + h * 0.1, porchZ, w * 0.96, h * 0.2, w * 0.26);
    addKitDoor(body, p, "+z", 0, base, d / 2, w * 0.18, h * 0.42);
  } else {
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
  }

  // A flat roof with a cornice and a lantern over the reading room.
  if (p.kit) {
    addBox(body, { y: base + h, w, h: 0.3, d, color: p.roof, surface: SURFACE.concrete, skipBottom: true });
    addProfile(body, kit().profiles.cornice, { y: base + h, w, d }, p.trim);
  } else {
    addBox(body, { y: base + h, w: w + 0.5, h: 0.3, d: d + 0.5, color: p.roof, surface: SURFACE.concrete });
  }
  addBalustrade(body, p, { y: base + h + 0.3, h: h * 0.07, w: w * 0.92, d: d * 0.92, posts: 7 });
  if (p.kit) {
    addKitLantern(drafts, p, 0, base + h + 0.3, -d * 0.06, Math.min(w * 0.34, d * 0.3));
    return drafts;
  }
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

function clockHall(plot: CivicPlot, p: Authored): CivicDrafts {
  const drafts: CivicDrafts = { body: emptyDraft(), glow: emptyDraft() };
  const { w, h, d } = plot;
  const base = PLINTH_H;
  const body = drafts.body;

  addBox(body, { y: base, w, h, d, color: p.wall });
  if (p.kit) addProfile(body, kit().profiles.band, { y: base + h * 0.44, w, d }, p.trim);
  else addBox(body, { y: base + h * 0.44, w: w + 0.14, h: 0.16, d: d + 0.14, color: p.trim });

  // Two storeys of hall windows on every side.
  for (let i = 0; i < 3; i++) {
    for (const [facing, plane, span] of [
      ["+z", d / 2, w],
      ["-z", d / 2, w],
      ["+x", w / 2, d],
      ["-x", w / 2, d],
    ] as const) {
      // The kit's door stands on the front wall, where the middle window was.
      if (!(p.kit && facing === "+z" && i === 1)) addWindow(drafts, p, {
        facing,
        u: (i - 1) * span * 0.3,
        v: base + h * 0.26,
        w: span * 0.13,
        h: h * 0.26,
        hood: true,
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
  if (p.kit) addKitDoor(body, p, "+z", 0, base, d / 2, w * 0.2, h * 0.4);
  else addBox(body, { y: base, z: porchZ, w: w * 0.2, h: h * 0.4, d: 0.16, color: p.door });

  // Hipped roof and balustrade.
  if (p.kit) {
    addBox(body, { y: base + h, w, h: 0.28, d, color: p.roof, surface: SURFACE.concrete, skipBottom: true });
    addProfile(body, kit().profiles.cornice, { y: base + h, w, d, scale: 0.28 / 0.3 }, p.trim);
  } else {
    addBox(body, { y: base + h, w: w + 0.44, h: 0.28, d: d + 0.44, color: p.roof, surface: SURFACE.concrete });
  }
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
  if (p.kit) addProfile(body, kit().profiles.band, { y: towerY + shaftH, w: towerW, d: towerW, cz: towerZ, scale: 1.1 }, p.trim);
  else addBox(body, { y: towerY + shaftH, z: towerZ, w: towerW + 0.3, h: 0.2, d: towerW + 0.3, color: p.trim });

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
  if (p.kit) {
    addPart(body, p, "Belfry", { at: [0, belfryY, towerZ], s: towerW });
    addPart(body, p, "Spire", { at: [0, belfryY + kit().belfryH * towerW, towerZ], s: towerW });
    return drafts;
  }
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

function archive(plot: CivicPlot, p: Authored): CivicDrafts {
  const drafts: CivicDrafts = { body: emptyDraft(), glow: emptyDraft() };
  const { w, h, d } = plot;
  const base = PLINTH_H;
  const body = drafts.body;

  addBox(body, { y: base, w, h, d, color: p.wall });
  // Buttresses: an archive is a building that holds weight.
  if (p.kit) {
    for (let i = -1; i <= 1; i++) {
      for (const facing of ["+x", "-x"] as const) {
        addPart(body, p, "Buttress", { at: onWall(facing, i * d * 0.3 * (facing === "+x" ? -1 : 1), base, w / 2), facing, sx: d * 0.1, sy: h * 0.92, sz: w * 0.07 });
      }
    }
    for (const side of [1, -1]) {
      const facing = side > 0 ? "+z" : "-z";
      // Both on the side away from the record tower, which stands over the
      // back one's procedural twin.
      addPart(body, p, "Buttress", { at: [w * 0.34, base, (side * d) / 2], facing, sx: w * 0.1, sy: h * 0.92, sz: d * 0.07 });
    }
  }
  for (let i = -1; i <= 1 && !p.kit; i++) {
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
  for (const side of p.kit ? [] : [1, -1]) {
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
  if (p.kit) {
    addProfile(body, kit().profiles.cornice, { y: base + h * 0.92, w, d, scale: Math.min(2, (h * 0.08) / 0.3) }, p.trim);
    addBox(body, { y: base + h, w: w * 0.96, h: 0.16, d: d * 0.96, color: p.roof, surface: SURFACE.concrete, skipBottom: true });
    for (const x of [-w * 0.26, w * 0.26]) {
      addPart(body, p, "Vent", { at: [x, base + h + 0.16, -d * 0.2], s: w * 0.05 });
    }
  } else {
    addBox(body, { y: base + h * 0.92, w: w + 0.4, h: h * 0.08, d: d + 0.4, color: p.trim });
    addBox(body, { y: base + h, w: w * 0.96, h: 0.16, d: d * 0.96, color: p.roof, surface: SURFACE.concrete });
    for (const x of [-w * 0.26, w * 0.26]) {
      addCylinder(body, { x, y: base + h + 0.16, z: -d * 0.2, radius: w * 0.05, h: h * 0.1, segments: 6, color: p.metal });
    }
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
    if (p.kit) {
      addProfile(body, kit().profiles.band, { y: base + (towerH * i) / 4, w: towerW, d: towerW, cx: tx, cz: tz }, p.trim);
      continue;
    }
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
  const lanternY = base + towerH + 0.22;
  if (p.kit) {
    addBox(body, { x: tx, y: base + towerH, z: tz, w: towerW, h: 0.22, d: towerW, color: p.roof, surface: SURFACE.concrete, skipBottom: true });
    addProfile(body, kit().profiles.cornice, { y: base + towerH, w: towerW, d: towerW, cx: tx, cz: tz, scale: 0.22 / 0.3 }, p.trim);
    addKitLantern(drafts, p, tx, lanternY, tz, towerW * 0.62);
  } else {
  addBox(body, { x: tx, y: base + towerH, z: tz, w: towerW + 0.36, h: 0.22, d: towerW + 0.36, color: p.trim });
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
  }

  // A reading annex with its own door, tucked against the main block.
  const annexW = w * 0.5;
  addBox(body, { x: w * 0.3, y: base, z: d * 0.62, w: annexW, h: h * 0.4, d: d * 0.3, color: p.wall });
  addBox(body, { x: w * 0.3, y: base + h * 0.4, z: d * 0.62, w: annexW + 0.26, h: 0.18, d: d * 0.3 + 0.26, color: p.roof, surface: SURFACE.concrete });
  if (p.kit) {
    addPart(body, p, "Door", { at: [w * 0.3, base, d * 0.77], s: annexW * 0.3, sy: (h * 0.26) / (annexW * 0.3) / kit().door.h, sz: 1 / (annexW * 0.3) });
  } else {
    addBox(body, { x: w * 0.3, y: base, z: d * 0.77, w: annexW * 0.3, h: h * 0.26, d: 0.14, color: p.door });
  }

  return drafts;
}

// ---------------------------------------------------------------------------
// The Dockerfile: the goods yard
// ---------------------------------------------------------------------------

function warehouse(plot: CivicPlot, p: Authored): CivicDrafts {
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
      SURFACE.metal,
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
    if (p.kit) {
      // A roller door, stretched to its opening: its slats run across it.
      addPart(body, p, "RollDoor", { at: [x, dockH, shedD / 2], sx: w * 0.26, sy: shedH * 0.6 });
      continue;
    }
    addBox(body, { x, y: dockH, z: shedD / 2, w: w * 0.26, h: shedH * 0.6, d: 0.18, color: p.trim });
    addBox(body, { x, y: dockH, z: shedD / 2 + 0.06, w: w * 0.22, h: shedH * 0.55, d: 0.14, color: p.door });
    // The slats stop short of the door's edges; the same width, their ends
    // and the door's sides were one plane.
    for (let i = 1; i <= 3; i++) {
      addBox(body, {
        x,
        y: dockH + (shedH * 0.55 * i) / 4,
        z: shedD / 2 + 0.14,
        w: w * 0.22 - CIVIC_LAYER * 2,
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
    if (p.kit) {
      addPart(body, p, "Container", { at: [x, y, z], s: unit, container: colour });
      return;
    }
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

function flagHouse(plot: CivicPlot, p: Authored): CivicDrafts {
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
        hood: true,
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
  addBox(body, { y: base + porchH, z: porchZ, w: w * 0.92, h: 0.16, d: porchD + 0.3, color: p.roof, surface: SURFACE.concrete });
  if (p.kit) addKitDoor(body, p, "+z", 0, base, d / 2, w * 0.2, wallH * 0.52);
  else addBox(body, { y: base, z: d / 2, w: w * 0.2, h: wallH * 0.52, d: 0.16, color: p.door });
  addWindow(drafts, p, {
    facing: "+z",
    u: 0,
    v: base + wallH * 0.46,
    w: w * 0.16,
    h: wallH * 0.12,
    plane: d / 2 + 0.1,
  });

  // A bench by the door and a noticeboard: newcomers welcome.
  if (p.kit) {
    addPart(body, p, "Bench", { at: [w * 0.42, base, porchZ], facing: "-x", sx: d * 0.2, sy: 0.75, sz: 0.75 });
  } else {
    addBox(body, { x: w * 0.42, y: base, z: porchZ, w: w * 0.06, h: 0.3, d: d * 0.16, color: p.stone });
    addBox(body, { x: w * 0.42, y: base + 0.3, z: porchZ, w: w * 0.1, h: 0.08, d: d * 0.2, color: p.metal });
  }
  const boardX = -w * 0.5;
  const boardZ = d / 2 + porchD * 1.1;
  addBox(body, { x: boardX, y: 0, z: boardZ, w: 0.12, h: base + h * 0.3, d: 0.12, color: p.metal });
  // The board stands clear in front of its post.
  addBox(body, { x: boardX, y: base + h * 0.18, z: boardZ, w: w * 0.22, h: h * 0.16, d: 0.12 + CIVIC_LAYER * 2, color: p.trim });

  addFlag(body, p, { x: w * 0.44, z: d * 0.42, y: base, h: h * 0.95 + 3.2, size: 1.1 });

  return drafts;
}

const BUILDERS: Record<LandmarkFile, (plot: CivicPlot, palette: Authored) => CivicDrafts> = {
  readme: library,
  manifest: clockHall,
  changelog: archive,
  contributing: flagHouse,
  dockerfile: warehouse,
};

/** The plinth every civic building stands on: it reads as important. */
function addPlinth(draft: MeshDraft, plot: CivicPlot, p: CivicPalette): void {
  addBox(draft, { y: 0, w: plot.w * 1.3, h: PLINTH_H * 0.7, d: plot.d * 1.3, color: p.roof, surface: SURFACE.concrete });
  addBox(draft, { y: PLINTH_H * 0.7, w: plot.w * 1.24, h: PLINTH_H * 0.3, d: plot.d * 1.24, color: p.stone });
}

/**
 * Build one civic building at its reserved plot size. `models` picks the
 * procedural build or the one assembled from the Blender kit; by default it
 * follows `BLENDER_MODELS` (`../modelSource`): the kit in the app, the
 * procedural build in tests unless they ask.
 */
export function buildCivic(
  kind: LandmarkFile,
  plot: CivicPlot,
  palette: CivicPalette,
  options: { models?: "procedural" | "blender" } = {},
): CivicDrafts {
  const authored: Authored = {
    kit: (options.models ?? (BLENDER_MODELS ? "blender" : "procedural")) === "blender",
    wall: surfaceColor(palette.wall, SURFACE.plaster),
    stone: surfaceColor(palette.stone, SURFACE.stone),
    roof: surfaceColor(palette.roof, SURFACE.slate),
    accent: surfaceColor(palette.accent, SURFACE.plaster),
    trim: surfaceColor(palette.trim, SURFACE.stone),
    door: surfaceColor(palette.door, SURFACE.timber),
    window: surfaceColor(palette.window, SURFACE.glass),
    metal: surfaceColor(palette.metal, SURFACE.metal),
    flag: surfaceColor(palette.flag, SURFACE.fabric),
    containers: palette.containers.map((color) => surfaceColor(color, SURFACE.metal)) as [Rgb3, Rgb3, Rgb3],
  };
  const drafts = BUILDERS[kind](plot, authored);
  addPlinth(drafts.body, plot, authored);
  return drafts;
}
