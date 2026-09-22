/**
 * The eight archetype models (PLAN.md sections 4 and 9).
 *
 * Each one is authored in unit space -- x, z in [-0.5, 0.5], y in [0, 1] --
 * and merged into a single draft, so an archetype costs one draw call however
 * many buildings wear it. Vertical detail is expressed as a fraction of the
 * building's height and each archetype is pinned to one or two tiers
 * (`archetypes.ts`), which keeps parapets, cornices and roof decks at a
 * believable size once the instance matrix stretches the model.
 *
 * Every model also publishes:
 *   - `windows`: the window rectangles, baked into the geometry as recessed
 *     dark panels AND reused by the lit-window pass, so a glowing window is
 *     always exactly where the dark one was (PLAN.md section 19).
 *   - `roofPads`: flat rectangles the rooftop prop pass may stand things on.
 *
 * Pure arrays, no three.js. Unit tested.
 */

import {
  FACINGS,
  addBox,
  addCylinder,
  addGable,
  addPanel,
  addSawtooth,
  emptyDraft,
  windowGrid,
  windowRing,
  type MeshDraft,
  type Panel,
  type Rgb3,
} from "./mesh";
import type { ArchetypeId } from "./archetypes";

/**
 * Vertex colours are MULTIPLIERS on the district's building colour: 1 is the
 * wall itself, 0.62 is the same hue in shadow. One palette, eight shapes.
 */
const WALL: Rgb3 = [1, 1, 1];
const WALL_SOFT: Rgb3 = [0.93, 0.93, 0.94];
const TRIM: Rgb3 = [1.06, 1.06, 1.05];
const ROOF: Rgb3 = [0.6, 0.62, 0.66];
const ROOF_LIGHT: Rgb3 = [0.72, 0.73, 0.75];
const WINDOW: Rgb3 = [0.34, 0.39, 0.46];
const GLASS: Rgb3 = [0.46, 0.54, 0.6];
const DOOR: Rgb3 = [0.4, 0.36, 0.34];
const MECH: Rgb3 = [0.68, 0.69, 0.71];
const PLINTH: Rgb3 = [0.8, 0.8, 0.81];

/** A flat rectangle on a roof that rooftop props may stand on. */
export interface RoofPad {
  x: number;
  z: number;
  /** Height of the surface, 0..1 of the building height. */
  y: number;
  w: number;
  d: number;
}

export interface ArchetypeModel {
  id: ArchetypeId;
  draft: MeshDraft;
  /** Window rectangles, in the same unit space, for the lit-window pass. */
  windows: Panel[];
  roofPads: RoofPad[];
  /** How many rooftop props this shape can carry, before the tier rule. */
  maxProps: number;
}

/**
 * The ground-floor entrance: an optional glazed lobby band right round the
 * building, a door on the front and a small canopy over it. The door always
 * faces the model's +z, and `placement.ts` turns the instance so that side
 * looks towards the city centre -- the closest thing to "the nearest road"
 * this layer can know (PLAN.md section 9).
 */
function addEntrance(
  draft: MeshDraft,
  spec: {
    plane: number;
    v: number;
    w: number;
    h: number;
    canopy?: boolean;
    /** A taller glazed band at street level, for anything above a house. */
    lobby?: { w: number; h: number };
  },
): void {
  if (spec.lobby) {
    for (const facing of FACINGS) {
      addPanel(
        draft,
        {
          facing,
          u: 0,
          v: spec.v + spec.h * 0.12,
          w: spec.lobby.w,
          h: spec.lobby.h,
          plane: spec.plane,
        },
        WINDOW,
      );
    }
  }
  addPanel(draft, { facing: "+z", u: 0, v: spec.v, w: spec.w * 1.3, h: spec.h * 1.15, plane: spec.plane }, WALL_SOFT);
  addPanel(draft, { facing: "+z", u: 0, v: spec.v, w: spec.w, h: spec.h, plane: spec.plane }, DOOR);
  if (spec.canopy !== false) {
    addBox(draft, {
      y: spec.v + spec.h * 0.6,
      z: spec.plane + 0.03,
      w: spec.w * 1.7,
      h: 0.012,
      d: 0.07,
      color: TRIM,
    });
  }
}

/** Thin walls around a flat roof, so the top is not a bare lid. */
function addParapet(
  draft: MeshDraft,
  spec: { y: number; h: number; w: number; d: number; t?: number; color?: Rgb3 },
): void {
  const t = spec.t ?? 0.045;
  const color = spec.color ?? TRIM;
  const hw = spec.w / 2 - t / 2;
  const hd = spec.d / 2 - t / 2;
  addBox(draft, { y: spec.y, z: hd, w: spec.w, h: spec.h, d: t, color, skipBottom: true });
  addBox(draft, { y: spec.y, z: -hd, w: spec.w, h: spec.h, d: t, color, skipBottom: true });
  addBox(draft, { x: hw, y: spec.y, w: t, h: spec.h, d: spec.d - t * 2, color, skipBottom: true });
  addBox(draft, { x: -hw, y: spec.y, w: t, h: spec.h, d: spec.d - t * 2, color, skipBottom: true });
}

/** Vertical fins: the cheapest thing that makes a tower read as a tower. */
function addMullions(
  draft: MeshDraft,
  spec: { y: number; h: number; plane: number; offsets: number[]; t?: number; depth?: number },
): void {
  const t = spec.t ?? 0.035;
  const depth = spec.depth ?? 0.022;
  for (const u of spec.offsets) {
    addBox(draft, {
      x: u,
      y: spec.y,
      z: spec.plane + depth / 2,
      w: t,
      h: spec.h,
      d: depth,
      color: TRIM,
      skipBottom: true,
    });
    addBox(draft, {
      x: -u,
      y: spec.y,
      z: -spec.plane - depth / 2,
      w: t,
      h: spec.h,
      d: depth,
      color: TRIM,
      skipBottom: true,
    });
    addBox(draft, {
      x: spec.plane + depth / 2,
      y: spec.y,
      z: u,
      w: depth,
      h: spec.h,
      d: t,
      color: TRIM,
      skipBottom: true,
    });
    addBox(draft, {
      x: -spec.plane - depth / 2,
      y: spec.y,
      z: -u,
      w: depth,
      h: spec.h,
      d: t,
      color: TRIM,
      skipBottom: true,
    });
  }
}

const bake = (draft: MeshDraft, windows: Panel[]): void => {
  for (const panel of windows) addPanel(draft, panel, WINDOW);
};

// ---------------------------------------------------------------------------
// The eight archetypes
// ---------------------------------------------------------------------------

/** Tier 1. A small house: pitched roof, chimney, a door and four windows. */
function house(): ArchetypeModel {
  const draft = emptyDraft();
  addBox(draft, { y: 0, w: 1, h: 0.04, d: 1, color: PLINTH });
  addBox(draft, { y: 0.04, w: 0.92, h: 0.62, d: 0.92, color: WALL, skipBottom: true });
  addBox(draft, { y: 0.66, w: 1.0, h: 0.022, d: 1.0, color: TRIM, skipBottom: true });
  addGable(draft, { y: 0.682, w: 1.0, h: 0.28, d: 1.0, color: ROOF, ridge: "x" });
  addBox(draft, { x: 0.3, y: 0.7, z: -0.24, w: 0.12, h: 0.28, d: 0.12, color: ROOF_LIGHT, skipBottom: true });

  const windows = [
    ...windowGrid({ facing: "+z", plane: 0.46, span: 0.55, columns: 2, rows: 1, from: 0.36, to: 0.36, w: 0.18, h: 0.15 }),
    ...windowGrid({ facing: "-z", plane: 0.46, span: 0.55, columns: 2, rows: 1, from: 0.36, to: 0.36, w: 0.18, h: 0.15 }),
    ...windowGrid({ facing: "+x", plane: 0.46, span: 0.4, columns: 1, rows: 1, from: 0.34, to: 0.34, w: 0.2, h: 0.16 }),
    ...windowGrid({ facing: "-x", plane: 0.46, span: 0.4, columns: 1, rows: 1, from: 0.34, to: 0.34, w: 0.2, h: 0.16 }),
  ];
  bake(draft, windows);
  addEntrance(draft, { plane: 0.46, v: 0.16, w: 0.16, h: 0.24 });

  return { id: "house", draft, windows, roofPads: [], maxProps: 0 };
}

/** Tiers 1-2. Flat roof behind a parapet, shopfront at the ground floor. */
function lowriseParapet(): ArchetypeModel {
  const draft = emptyDraft();
  addBox(draft, { y: 0, w: 1, h: 0.05, d: 1, color: PLINTH });
  addBox(draft, { y: 0.05, w: 0.96, h: 0.82, d: 0.96, color: WALL, skipBottom: true });
  addBox(draft, { y: 0.85, w: 1.02, h: 0.035, d: 1.02, color: TRIM, skipBottom: true });
  addBox(draft, { y: 0.885, w: 0.94, h: 0.015, d: 0.94, color: ROOF, skipBottom: true });
  addParapet(draft, { y: 0.885, h: 0.055, w: 0.99, d: 0.99 });

  const windows = windowRing({ plane: 0.48, span: 0.66, columns: 3, rows: 2, from: 0.45, to: 0.7, w: 0.17, h: 0.12 });
  bake(draft, windows);
  // A deeper glazed band at street level: this is a building people go into.
  addPanel(draft, { facing: "+z", u: 0, v: 0.2, w: 0.72, h: 0.16, plane: 0.48 }, WINDOW);
  addPanel(draft, { facing: "-z", u: 0, v: 0.2, w: 0.72, h: 0.16, plane: 0.48 }, WINDOW);
  addEntrance(draft, { plane: 0.482, v: 0.17, w: 0.18, h: 0.26 });

  return {
    id: "lowrise-parapet",
    draft,
    windows,
    roofPads: [{ x: 0, z: 0, y: 0.9, w: 0.62, d: 0.62 }],
    maxProps: 2,
  };
}

/** Tier 2. A pitched block with dormers: the working street of the city. */
function lowrisePitched(): ArchetypeModel {
  const draft = emptyDraft();
  addBox(draft, { y: 0, w: 1, h: 0.04, d: 1, color: PLINTH });
  addBox(draft, { y: 0.04, w: 0.96, h: 0.7, d: 0.96, color: WALL, skipBottom: true });
  addBox(draft, { y: 0.74, w: 1.02, h: 0.03, d: 1.02, color: TRIM, skipBottom: true });
  addGable(draft, { y: 0.77, w: 1.0, h: 0.23, d: 1.0, color: ROOF, ridge: "z" });
  for (const side of [1, -1]) {
    addBox(draft, {
      x: side * 0.26,
      y: 0.81,
      z: side * 0.12,
      w: 0.2,
      h: 0.12,
      d: 0.2,
      color: ROOF_LIGHT,
      skipBottom: true,
    });
  }

  const windows = windowRing({ plane: 0.48, span: 0.68, columns: 3, rows: 3, from: 0.22, to: 0.62, w: 0.15, h: 0.1 });
  bake(draft, windows);
  addEntrance(draft, { plane: 0.482, v: 0.15, w: 0.17, h: 0.24 });

  return { id: "lowrise-pitched", draft, windows, roofPads: [], maxProps: 0 };
}

/** Tiers 1-2. A wide shed under a sawtooth roof: storage, data, tooling. */
function warehouseSawtooth(): ArchetypeModel {
  const draft = emptyDraft();
  addBox(draft, { y: 0, w: 1, h: 0.05, d: 1, color: PLINTH });
  addBox(draft, { y: 0.05, w: 0.98, h: 0.6, d: 0.96, color: WALL, skipBottom: true });
  addBox(draft, { y: 0.65, w: 1.0, h: 0.025, d: 0.98, color: TRIM, skipBottom: true });

  const teeth = 4;
  const toothW = 0.98 / teeth;
  for (let i = 0; i < teeth; i++) {
    addSawtooth(draft, {
      x: -0.49 + toothW * (i + 0.5),
      y: 0.675,
      w: toothW,
      rise: 0.18,
      d: 0.96,
      color: ROOF,
      glassColor: GLASS,
    });
  }
  // Two vent pipes, because nothing else stands on a sawtooth roof.
  addCylinder(draft, { x: -0.3, y: 0.7, z: 0.28, radius: 0.028, h: 0.12, segments: 6, color: MECH });
  addCylinder(draft, { x: 0.18, y: 0.78, z: -0.26, radius: 0.028, h: 0.12, segments: 6, color: MECH });

  const windows = [
    ...windowGrid({ facing: "+z", plane: 0.48, span: 0.7, columns: 3, rows: 1, from: 0.5, to: 0.5, w: 0.14, h: 0.1 }),
    ...windowGrid({ facing: "-z", plane: 0.48, span: 0.7, columns: 3, rows: 1, from: 0.5, to: 0.5, w: 0.14, h: 0.1 }),
    ...windowGrid({ facing: "+x", plane: 0.49, span: 0.55, columns: 2, rows: 1, from: 0.48, to: 0.48, w: 0.14, h: 0.1 }),
    ...windowGrid({ facing: "-x", plane: 0.49, span: 0.55, columns: 2, rows: 1, from: 0.48, to: 0.48, w: 0.14, h: 0.1 }),
  ];
  bake(draft, windows);
  // The roll-up door, wide enough for the lorry the city implies.
  addPanel(draft, { facing: "+z", u: 0, v: 0.26, w: 0.42, h: 0.34, plane: 0.481 }, WALL_SOFT);
  addPanel(draft, { facing: "+z", u: 0, v: 0.25, w: 0.36, h: 0.3, plane: 0.483 }, DOOR);
  addPanel(draft, { facing: "-z", u: 0, v: 0.25, w: 0.36, h: 0.3, plane: 0.483 }, DOOR);

  return { id: "warehouse-sawtooth", draft, windows, roofPads: [], maxProps: 0 };
}

/** Tier 3. A base block with a setback upper storey and a terrace. */
function midriseSetback(): ArchetypeModel {
  const draft = emptyDraft();
  addBox(draft, { y: 0, w: 1, h: 0.03, d: 1, color: PLINTH });
  addBox(draft, { y: 0.03, w: 1.0, h: 0.41, d: 1.0, color: WALL, topColor: ROOF, skipBottom: true });
  addBox(draft, { y: 0.44, w: 1.04, h: 0.022, d: 1.04, color: TRIM, skipBottom: true });
  addParapet(draft, { y: 0.462, h: 0.03, w: 1.03, d: 1.03, t: 0.03 });
  addBox(draft, { y: 0.462, w: 0.76, h: 0.45, d: 0.76, color: WALL, topColor: ROOF, skipBottom: true });
  addBox(draft, { y: 0.912, w: 0.82, h: 0.028, d: 0.82, color: TRIM, skipBottom: true });
  addParapet(draft, { y: 0.94, h: 0.04, w: 0.8, d: 0.8, t: 0.035 });

  const windows = [
    ...windowRing({ plane: 0.5, span: 0.72, columns: 3, rows: 4, from: 0.1, to: 0.38, w: 0.15, h: 0.055 }),
    ...windowRing({ plane: 0.38, span: 0.66, columns: 2, rows: 4, from: 0.53, to: 0.86, w: 0.16, h: 0.06 }),
  ];
  bake(draft, windows);
  addEntrance(draft, { plane: 0.502, v: 0.12, w: 0.2, h: 0.18, lobby: { w: 0.66, h: 0.075 } });

  return {
    id: "midrise-setback",
    draft,
    windows,
    roofPads: [
      { x: 0.42, z: 0, y: 0.462, w: 0.11, d: 0.7 },
      { x: 0, z: 0, y: 0.94, w: 0.5, d: 0.5 },
    ],
    maxProps: 2,
  };
}

/** Tiers 3-4. A ribbon-windowed shaft with a mechanical penthouse. */
function midriseMech(): ArchetypeModel {
  const draft = emptyDraft();
  addBox(draft, { y: 0, w: 1, h: 0.025, d: 1, color: PLINTH });
  addBox(draft, { y: 0.025, w: 0.96, h: 0.875, d: 0.96, color: WALL, topColor: ROOF, skipBottom: true });
  addMullions(draft, { y: 0.025, h: 0.875, plane: 0.48, offsets: [0.22] });
  addBox(draft, { y: 0.9, w: 1.0, h: 0.025, d: 1.0, color: TRIM, skipBottom: true });
  addParapet(draft, { y: 0.925, h: 0.032, w: 0.98, d: 0.98 });
  addBox(draft, { x: -0.12, y: 0.925, z: 0.08, w: 0.38, h: 0.06, d: 0.32, color: MECH, skipBottom: true });
  addBox(draft, { x: 0.22, y: 0.925, z: -0.18, w: 0.14, h: 0.035, d: 0.14, color: MECH, skipBottom: true });

  const windows = windowRing({ plane: 0.48, span: 0.72, columns: 3, rows: 7, from: 0.12, to: 0.84, w: 0.16, h: 0.05 });
  bake(draft, windows);
  addEntrance(draft, { plane: 0.482, v: 0.075, w: 0.2, h: 0.12, lobby: { w: 0.66, h: 0.05 } });

  return {
    id: "midrise-mech",
    draft,
    windows,
    roofPads: [{ x: 0.2, z: 0.24, y: 0.925, w: 0.34, d: 0.3 }],
    maxProps: 2,
  };
}

/** Tiers 4-5. Three stacked volumes: the stepped tower of the skyline. */
function towerStepped(): ArchetypeModel {
  const draft = emptyDraft();
  addBox(draft, { y: 0, w: 1, h: 0.02, d: 1, color: PLINTH });
  addBox(draft, { y: 0.02, w: 1.0, h: 0.42, d: 1.0, color: WALL, topColor: ROOF, skipBottom: true });
  addBox(draft, { y: 0.44, w: 1.04, h: 0.018, d: 1.04, color: TRIM, skipBottom: true });
  addParapet(draft, { y: 0.458, h: 0.026, w: 1.03, d: 1.03, t: 0.028 });

  addBox(draft, { y: 0.458, w: 0.78, h: 0.31, d: 0.78, color: WALL, topColor: ROOF, skipBottom: true });
  addBox(draft, { y: 0.768, w: 0.82, h: 0.016, d: 0.82, color: TRIM, skipBottom: true });
  addParapet(draft, { y: 0.784, h: 0.022, w: 0.81, d: 0.81, t: 0.026 });

  addBox(draft, { y: 0.784, w: 0.56, h: 0.18, d: 0.56, color: WALL, topColor: ROOF, skipBottom: true });
  addMullions(draft, { y: 0.784, h: 0.18, plane: 0.28, offsets: [0.14], t: 0.03, depth: 0.018 });
  addBox(draft, { y: 0.964, w: 0.6, h: 0.02, d: 0.6, color: TRIM, skipBottom: true });
  addParapet(draft, { y: 0.984, h: 0.016, w: 0.58, d: 0.58, t: 0.026 });
  addCylinder(draft, { y: 0.984, radius: 0.016, h: 0.09, segments: 6, color: MECH });

  const windows = [
    ...windowRing({ plane: 0.5, span: 0.74, columns: 3, rows: 5, from: 0.08, to: 0.39, w: 0.15, h: 0.04 }),
    ...windowRing({ plane: 0.39, span: 0.66, columns: 2, rows: 4, from: 0.5, to: 0.73, w: 0.15, h: 0.04 }),
    ...windowRing({ plane: 0.28, span: 0.56, columns: 2, rows: 2, from: 0.82, to: 0.93, w: 0.12, h: 0.045 }),
  ];
  bake(draft, windows);
  addEntrance(draft, { plane: 0.502, v: 0.06, w: 0.22, h: 0.1, lobby: { w: 0.68, h: 0.042 } });

  return {
    id: "tower-stepped",
    draft,
    windows,
    roofPads: [
      { x: 0.42, z: 0.1, y: 0.458, w: 0.1, d: 0.62 },
      { x: 0, z: 0.3, y: 0.784, w: 0.5, d: 0.12 },
    ],
    maxProps: 3,
  };
}

/** Tier 5. A mullioned shaft under a crown and a mast: the landmark tower. */
function towerCrown(): ArchetypeModel {
  const draft = emptyDraft();
  addBox(draft, { y: 0, w: 1, h: 0.018, d: 1, color: PLINTH });
  addBox(draft, { y: 0.018, w: 0.92, h: 0.842, d: 0.92, color: WALL, topColor: ROOF, skipBottom: true });
  addMullions(draft, { y: 0.018, h: 0.842, plane: 0.46, offsets: [0.44, 0.2], t: 0.03, depth: 0.02 });
  addBox(draft, { y: 0.86, w: 0.98, h: 0.024, d: 0.98, color: TRIM, skipBottom: true });
  addParapet(draft, { y: 0.884, h: 0.022, w: 0.96, d: 0.96, t: 0.03 });
  addBox(draft, { y: 0.884, w: 0.62, h: 0.072, d: 0.62, color: WALL, topColor: ROOF, skipBottom: true });
  addBox(draft, { y: 0.956, w: 0.66, h: 0.018, d: 0.66, color: TRIM, skipBottom: true });
  addBox(draft, { y: 0.974, w: 0.3, h: 0.016, d: 0.3, color: MECH, skipBottom: true });
  addCylinder(draft, { y: 0.974, radius: 0.014, h: 0.1, segments: 6, color: MECH });

  const windows = [
    ...windowRing({ plane: 0.46, span: 0.66, columns: 3, rows: 8, from: 0.1, to: 0.82, w: 0.13, h: 0.036 }),
    ...windowRing({ plane: 0.31, span: 0.5, columns: 2, rows: 1, from: 0.918, to: 0.918, w: 0.12, h: 0.035 }),
  ];
  bake(draft, windows);
  addEntrance(draft, { plane: 0.462, v: 0.055, w: 0.22, h: 0.09, lobby: { w: 0.62, h: 0.038 } });

  return {
    id: "tower-crown",
    draft,
    windows,
    roofPads: [{ x: 0, z: 0, y: 0.974, w: 0.26, d: 0.26 }],
    maxProps: 2,
  };
}

const BUILDERS: Record<ArchetypeId, () => ArchetypeModel> = {
  house,
  "lowrise-parapet": lowriseParapet,
  "lowrise-pitched": lowrisePitched,
  "warehouse-sawtooth": warehouseSawtooth,
  "midrise-setback": midriseSetback,
  "midrise-mech": midriseMech,
  "tower-stepped": towerStepped,
  "tower-crown": towerCrown,
};

const CACHE = new Map<ArchetypeId, ArchetypeModel>();

/** Built once per archetype per page, then shared by every instance of it. */
export function archetypeModel(id: ArchetypeId): ArchetypeModel {
  const cached = CACHE.get(id);
  if (cached) return cached;
  const model = BUILDERS[id]();
  CACHE.set(id, model);
  return model;
}
