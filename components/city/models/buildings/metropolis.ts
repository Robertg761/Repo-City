/**
 * The metropolis towers (PLAN.md 76.1 decision 7 and 76.5): the glass tower,
 * the twin towers and the spire. A metropolis is today's city scaled up, and
 * its top two tiers stand 22 and 34 units tall, half again the city's crowned
 * tower, so the skyline needs silhouettes that still read at that height:
 *
 *   - tower-glass   a slim curtain-wall shaft on a glazed lobby, with a
 *                   raked glass crown. Tiers 4 and 5.
 *   - tower-twin    two slender shafts on one podium, tied by a skybridge.
 *                   Tiers 4 and 5.
 *   - tower-spire   three setbacks, a ribbed crown and a spire. Tier 5.
 *
 * Authored exactly like the city's archetypes (`models.ts`): unit space, x and
 * z in [-0.5, 0.5] and y in [0, 1] -- the spire's tip reaches a little past,
 * as the crowned tower's mast does -- merged into one draft per shape, so a
 * shape costs one draw call however many towers wear it.
 *
 * GLASS WITHOUT A NEW MATERIAL. Every archetype shares one flat-shaded
 * material, and the vertex colours are multipliers on the district's
 * building colour. The glass is therefore a cool multiplier, a little over 1
 * in blue so a warm stone district still gets blue-green glass, and graded
 * by height: darker at the foot, where a real curtain wall reflects the
 * street, paler towards the top, where it reflects the sky. Thin proud
 * spandrel bands and mullions in the wall colour frame it. That is the
 * stylised version of reflective -- tone, not a mirror -- and it keeps the
 * palette rule of section 9. `TOWER_FINISH` is a suggested, optional
 * roughness for the renderer if it ever gives these shapes their own
 * material.
 *
 * Every builder publishes `windows` exactly where the glass cells of every
 * third storey are, so the lit-window pass lights curtain-wall panes rather
 * than punching a grid of dark holes into the glass, and a tower asks that
 * pass for about as many windows as the city's crowned tower does (about a
 * hundred), not three times as many.
 *
 * Pure arrays, no three.js. Unit tested (`metropolis.test.ts`).
 */

import {
  FACINGS,
  LAYER,
  addBox,
  addCylinder,
  addPanel,
  addQuad,
  emptyDraft,
  type Facing,
  type MeshDraft,
  type Panel,
  type Rgb3,
} from "./mesh";
import type { ArchetypeModel, RoofPad } from "./models";

export type MetropolisArchetypeId = "tower-glass" | "tower-twin" | "tower-spire";

export const METROPOLIS_ARCHETYPE_IDS: readonly MetropolisArchetypeId[] = [
  "tower-glass",
  "tower-twin",
  "tower-spire",
];

// Multipliers on the district colour, as in `models.ts`.
const WALL: Rgb3 = [1, 1, 1];
const TRIM: Rgb3 = [1.06, 1.06, 1.05];
const ROOF: Rgb3 = [0.6, 0.62, 0.66];
const MECH: Rgb3 = [0.68, 0.69, 0.71];
const PLINTH: Rgb3 = [0.8, 0.8, 0.81];
const DOOR: Rgb3 = [0.4, 0.36, 0.34];
/** Street-level glazing: the dark of a lobby seen from outside. */
const LOBBY: Rgb3 = [0.42, 0.49, 0.58];
/** Curtain wall at the foot and at the top of a shaft. */
const GLASS_LOW: Rgb3 = [0.5, 0.64, 0.8];
const GLASS_HIGH: Rgb3 = [0.72, 0.88, 1.08];
/** The spandrel and mullion frame: the wall colour, a shade lighter. */
const FRAME: Rgb3 = [1.02, 1.02, 1.02];
/** The spire's metal. */
const METAL: Rgb3 = [0.82, 0.84, 0.88];

/**
 * Optional finish for a renderer that gives the tower shapes their own
 * material: a little smoother than the city's 0.82, so the sun leaves a soft
 * highlight on the glass. Not needed for the towers to read as glass.
 */
export const TOWER_FINISH = { roughness: 0.55, metalness: 0 } as const;

const lerp3 = (a: Rgb3, b: Rgb3, t: number): Rgb3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

/** The glass tone at a height fraction of the whole tower. */
export function glassAt(y: number): Rgb3 {
  const t = Math.max(0, Math.min(1, y));
  return lerp3(GLASS_LOW, GLASS_HIGH, t * t * (3 - 2 * t));
}

interface CurtainSpec {
  /** Centre of the shaft on x and z. */
  x?: number;
  z?: number;
  /** Base and top of the curtain wall. */
  y0: number;
  y1: number;
  /** Half extents of the shaft on x and z. */
  hx: number;
  hz: number;
  /** Storey bands; one spandrel between each pair. */
  bands: number;
  /** Mullions per face, evenly spaced, not counting the corners. */
  mullions: number;
  /** Spandrel height as a fraction of a band: 0.12 is glass, 0.45 is ribbon windows. */
  spandrel: number;
  /** Colour of the spandrels; the wall for ribbon windows, the frame for glass. */
  spandrelColor?: Rgb3;
  /**
   * Publish the cells of every nth storey as windows. The lit-window pass
   * shares one budget across the whole city, and a curtain wall has three
   * times the cells a stone tower has windows.
   */
  litEvery?: number;
  /** The faces whose cells are published as windows; all four by default. */
  litFaces?: readonly Facing[];
  /** Where on the whole tower's height this shaft sits, for the glass grade. */
  gradeFrom?: number;
  gradeTo?: number;
}

/** How far the frame stands proud of the glass: enough to catch the light. */
const PROUD = 0.012;

/** The four walls of a box, no lid and no floor: stacked bands need neither. */
function addSides(
  draft: MeshDraft,
  spec: { x: number; z: number; y: number; h: number; hx: number; hz: number; color: Rgb3 },
): void {
  const { x, z, hx, hz, color } = spec;
  const y0 = spec.y;
  const y1 = spec.y + spec.h;
  // The same windings as `addBox`, so the normals face out.
  addQuad(draft, [x - hx, y0, z + hz], [x + hx, y0, z + hz], [x + hx, y1, z + hz], [x - hx, y1, z + hz], color);
  addQuad(draft, [x + hx, y0, z - hz], [x - hx, y0, z - hz], [x - hx, y1, z - hz], [x + hx, y1, z - hz], color);
  addQuad(draft, [x + hx, y0, z + hz], [x + hx, y0, z - hz], [x + hx, y1, z - hz], [x + hx, y1, z + hz], color);
  addQuad(draft, [x - hx, y0, z - hz], [x - hx, y0, z + hz], [x - hx, y1, z + hz], [x - hx, y1, z - hz], color);
}

/**
 * A curtain-walled shaft: a glass core graded by height, a proud spandrel
 * band between storeys and proud mullions down each face. Returns the glass
 * cells as window panels, one per cell between mullions on each band, for the
 * lit-window pass.
 */
function addCurtainWall(draft: MeshDraft, spec: CurtainSpec): Panel[] {
  const x = spec.x ?? 0;
  const z = spec.z ?? 0;
  const height = spec.y1 - spec.y0;
  const band = height / spec.bands;
  const from = spec.gradeFrom ?? spec.y0;
  const to = spec.gradeTo ?? spec.y1;
  const spandrel = band * spec.spandrel;
  const frame = spec.spandrelColor ?? FRAME;

  // The glass core, four walls per band so each band takes its own tone; only
  // the top band is capped, since every other lid would be buried.
  for (let i = 0; i < spec.bands; i++) {
    const tone = glassAt(from + ((to - from) * (i + 0.5)) / spec.bands);
    addSides(draft, { x, z, y: spec.y0 + band * i, h: band, hx: spec.hx, hz: spec.hz, color: tone });
  }
  const { hx, hz, y1 } = spec;
  addQuad(draft, [x - hx, y1, z + hz], [x + hx, y1, z + hz], [x + hx, y1, z - hz], [x - hx, y1, z - hz], ROOF);

  // Spandrels: a sleeve proud of the glass at the foot of every storey.
  for (let i = 0; i < spec.bands; i++) {
    addSides(draft, {
      x,
      z,
      y: spec.y0 + band * i,
      h: spandrel,
      hx: spec.hx + PROUD,
      hz: spec.hz + PROUD,
      color: frame,
    });
  }

  // Mullions: corner posts plus `mullions` evenly spaced down each face.
  const posts = (half: number) => {
    const out = [-half, half];
    for (let k = 1; k <= spec.mullions; k++) out.push(-half + (2 * half * k) / (spec.mullions + 1));
    return out;
  };
  const t = 0.022;
  for (const u of posts(spec.hx)) {
    for (const side of [1, -1]) {
      addBox(draft, {
        x: x + u,
        z: z + side * (spec.hz + PROUD / 2),
        y: spec.y0,
        w: t,
        h: height,
        d: PROUD,
        color: frame,
        skipBottom: true,
      });
    }
  }
  for (const u of posts(spec.hz)) {
    for (const side of [1, -1]) {
      addBox(draft, {
        x: x + side * (spec.hx + PROUD / 2),
        z: z + u,
        y: spec.y0,
        w: PROUD,
        h: height,
        d: t,
        color: frame,
        skipBottom: true,
      });
    }
  }

  // The glass cells, as window panels on each face.
  const windows: Panel[] = [];
  const glassH = band - spandrel;
  for (const facing of spec.litFaces ?? FACINGS) {
    const alongX = facing === "+z" || facing === "-z";
    const half = alongX ? spec.hx : spec.hz;
    const plane = alongX ? spec.hz : spec.hx;
    const cell = (2 * half) / (spec.mullions + 1);
    for (let i = 0; i < spec.bands; i++) {
      // Every `litEvery`th storey, counting down from the top one.
      if ((spec.bands - 1 - i) % (spec.litEvery ?? 1) !== 0) continue;
      const v = spec.y0 + band * i + spandrel + glassH / 2;
      for (let k = 0; k <= spec.mullions; k++) {
        const u = -half + cell * (k + 0.5);
        windows.push({
          facing,
          u,
          v,
          w: cell * 0.82,
          h: glassH * 0.78,
          plane: plane + PROUD * 0.5,
          ...(x === 0 && z === 0 ? {} : { cx: x, cz: z }),
        });
      }
    }
  }
  return windows;
}

/**
 * Thin walls round a flat roof. Every caller makes it exactly as wide as the
 * cornice it stands on: set a hair inside, it leaves a strip of lit cornice
 * too thin to draw, which breaks up into a dashed line along the roof
 * (`ledges.ts`).
 */
function addParapet(
  draft: MeshDraft,
  spec: { x?: number; z?: number; y: number; h: number; w: number; d: number; t?: number; color?: Rgb3 },
): void {
  const x = spec.x ?? 0;
  const z = spec.z ?? 0;
  const t = spec.t ?? 0.03;
  const color = spec.color ?? TRIM;
  const hw = spec.w / 2 - t / 2;
  const hd = spec.d / 2 - t / 2;
  addBox(draft, { x, z: z + hd, y: spec.y, w: spec.w, h: spec.h, d: t, color, skipBottom: true });
  addBox(draft, { x, z: z - hd, y: spec.y, w: spec.w, h: spec.h, d: t, color, skipBottom: true });
  addBox(draft, { x: x + hw, z, y: spec.y, w: t, h: spec.h, d: spec.d - t * 2, color, skipBottom: true });
  addBox(draft, { x: x - hw, z, y: spec.y, w: t, h: spec.h, d: spec.d - t * 2, color, skipBottom: true });
}

/**
 * The glazed ground floor: a plinth, a lobby band all round, and a door with
 * a canopy on the front. The door faces +z; `placement.ts` turns it to the
 * street as it does for every other archetype.
 */
const PLINTH_H = 0.012;

function addLobby(draft: MeshDraft, spec: { plane: number; h: number }): void {
  // The plinth stands proud of the lobby glass even where the wall fills the
  // plot; flush, the two were one plane in two colours.
  const plinth = Math.max(1, spec.plane * 2 + LAYER * 4);
  addBox(draft, { y: 0, w: plinth, h: PLINTH_H, d: plinth, color: PLINTH });
  // The glass starts a sill above the plinth. Standing on it, a layer in front
  // of the wall, it left a strip of plinth a layer wide in front of it: too
  // thin to draw, so a broken bright line round the foot of the tower.
  const glassFoot = Math.max(spec.h * 0.24, PLINTH_H + spec.h * 0.1);
  const glassHead = spec.h * 0.86;
  for (const facing of FACINGS) {
    addPanel(
      draft,
      { facing, u: 0, v: (glassFoot + glassHead) / 2, w: spec.plane * 1.6, h: glassHead - glassFoot, plane: spec.plane },
      LOBBY,
    );
  }
  // The door stands on the plinth rather than running down behind its face,
  // and comes forward to be flush with it when it would otherwise stand a
  // sliver behind: no strip of plinth too thin to draw in front of it.
  const doorFoot = Math.max(spec.h * 0.09, PLINTH_H);
  const doorHead = spec.h * 0.81;
  const doorPlane = spec.plane + LAYER;
  const plinthFace = plinth / 2 - LAYER;
  addPanel(
    draft,
    {
      facing: "+z",
      u: 0,
      v: (doorFoot + doorHead) / 2,
      w: 0.2,
      h: doorHead - doorFoot,
      plane: plinthFace - doorPlane < LAYER * 2 ? Math.max(doorPlane, plinthFace) : doorPlane,
    },
    DOOR,
  );
  // The canopy starts at the wall, so its top never lies over the lobby's
  // roof, and stops at the roof's height, so its back never stands a hair
  // above the roof's edge.
  const canopy = 0.008;
  addBox(draft, {
    y: Math.min(spec.h * 0.86, spec.h - canopy),
    z: spec.plane + 0.045,
    w: 0.36,
    h: canopy,
    d: 0.09,
    color: TRIM,
  });
}

/**
 * A raked top: the roof slopes from `y0` on the -x side up to `y1` on the +x
 * side, glass on the slope, wall on the triangular ends. The one silhouette
 * move a glass tower needs to stop being a box.
 */
function addRake(
  draft: MeshDraft,
  spec: { y0: number; y1: number; hx: number; hz: number; glass: Rgb3; wall: Rgb3 },
): void {
  const { y0, y1, hx, hz } = spec;
  // The slope.
  addQuad(draft, [-hx, y0, hz], [hx, y1, hz], [hx, y1, -hz], [-hx, y0, -hz], spec.glass);
  // The tall +x wall.
  addQuad(draft, [hx, y0, hz], [hx, y0, -hz], [hx, y1, -hz], [hx, y1, hz], spec.wall);
  // The two triangular ends (degenerate quads, as `addGable` draws them).
  addQuad(draft, [-hx, y0, hz], [hx, y0, hz], [hx, y1, hz], [hx, y1, hz], spec.wall);
  addQuad(draft, [hx, y0, -hz], [-hx, y0, -hz], [hx, y1, -hz], [hx, y1, -hz], spec.wall);
}

/** A four-sided pyramid, base at `y0` and tip at `y1`. */
function addPyramid(draft: MeshDraft, spec: { y0: number; y1: number; half: number; color: Rgb3 }): void {
  const { y0, y1, half: h, color } = spec;
  const tip: [number, number, number] = [0, y1, 0];
  addQuad(draft, [-h, y0, h], [h, y0, h], tip, tip, color);
  addQuad(draft, [h, y0, h], [h, y0, -h], tip, tip, color);
  addQuad(draft, [h, y0, -h], [-h, y0, -h], tip, tip, color);
  addQuad(draft, [-h, y0, -h], [-h, y0, h], tip, tip, color);
}

// ---------------------------------------------------------------------------
// The three towers
// ---------------------------------------------------------------------------

/**
 * Tiers 4-5. A slim glass shaft on a glazed lobby, under a raked glass crown.
 * The shaft is inset from the plot so it reads slimmer than the city's
 * stone towers, which fill theirs.
 */
export function towerGlass(): ArchetypeModel {
  const draft = emptyDraft();
  const lobbyH = 0.045;
  addBox(draft, { y: 0, w: 0.96, h: lobbyH, d: 0.96, color: WALL, topColor: ROOF, skipBottom: true });
  addLobby(draft, { plane: 0.48, h: lobbyH });

  const hx = 0.4;
  const hz = 0.4;
  const top = 0.93;
  const windows = addCurtainWall(draft, {
    y0: lobbyH,
    y1: top,
    hx,
    hz,
    bands: 18,
    mullions: 3,
    spandrel: 0.14,
    litEvery: 3,
    gradeFrom: 0.05,
    gradeTo: 0.95,
  });

  // A frame band where the shaft meets the crown.
  addBox(draft, { y: top, w: hx * 2 + 0.03, h: 0.012, d: hz * 2 + 0.03, color: TRIM, skipBottom: true });
  addRake(draft, { y0: top + 0.012, y1: 1, hx, hz, glass: glassAt(1), wall: FRAME });
  // Plant on the low side of the rake, behind a screen.
  addBox(draft, { x: -0.2, y: top + 0.012, w: 0.16, h: 0.028, d: 0.4, color: MECH, skipBottom: true });

  // Nothing stands on a raked roof.
  return { id: "tower-glass", draft, windows, roofPads: [], maxProps: 0 };
}

/**
 * Tiers 4-5. Two slender shafts on one podium, a skybridge between them at
 * a little over half height, a crown and a mast on each.
 */
export function towerTwin(): ArchetypeModel {
  const draft = emptyDraft();
  const podium = 0.16;
  addBox(draft, { y: 0, w: 1, h: podium, d: 1, color: WALL, topColor: ROOF, skipBottom: true });
  addLobby(draft, { plane: 0.5, h: 0.05 });
  addBox(draft, { y: podium, w: 1.02, h: 0.012, d: 1.02, color: TRIM, skipBottom: true });
  // Flush with the band outside, and thick enough inside to meet the shafts'
  // glass, which stands 0.03 in from the podium's edge.
  addParapet(draft, { y: podium + 0.012, h: 0.014, w: 1.02, d: 1.02, t: 0.04 });

  // Podium ribbon windows above the lobby: dark glass, never lit, so the
  // shafts keep the lit-window budget.
  for (const facing of FACINGS) {
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 4; c++) {
        addPanel(draft, { facing, u: -0.33 + c * 0.22, v: 0.08 + r * 0.045, w: 0.17, h: 0.028, plane: 0.5 }, LOBBY);
      }
    }
  }
  const windows: Panel[] = [];

  // Slender enough that daylight shows between the pair from the overview:
  // a quarter of the plot. Only the broad faces light up, so a lit pane never
  // squeezes onto the narrow ones.
  const hx = 0.17;
  const hz = 0.3;
  const top = 0.95;
  const crownTop = top + 0.04;
  for (const side of [-1, 1]) {
    const x = side * 0.3;
    windows.push(
      ...addCurtainWall(draft, {
        x,
        y0: podium + 0.012,
        y1: top,
        hx,
        hz,
        bands: 16,
        mullions: 1,
        // Ribbon windows: a stone tower with glass bands, the pair's own look.
        spandrel: 0.42,
        litEvery: 2,
        litFaces: ["+z", "-z"],
        spandrelColor: WALL,
        gradeFrom: 0.15,
        gradeTo: 0.95,
      }),
    );
    // Crown: a lighter cap, stepped in, and a mast.
    addBox(draft, { x, y: top, w: hx * 2 + 0.03, h: 0.014, d: hz * 2 + 0.03, color: TRIM, skipBottom: true });
    addBox(draft, { x, y: top + 0.014, w: hx * 1.5, h: 0.026, d: hz * 1.5, color: WALL, topColor: ROOF, skipBottom: true });
    addCylinder(draft, { x, y: crownTop, radius: 0.012, h: 0.06, segments: 6, color: MECH });
  }

  // The skybridge, glazed, on a frame.
  const bridgeY = 0.56;
  addBox(draft, { y: bridgeY, w: 0.16, h: 0.035, d: 0.2, color: glassAt(0.6), topColor: ROOF });
  addBox(draft, { y: bridgeY - 0.008, w: 0.16, h: 0.008, d: 0.22, color: FRAME });
  addBox(draft, { y: bridgeY + 0.035, w: 0.16, h: 0.006, d: 0.22, color: FRAME, skipBottom: true });

  return {
    id: "tower-twin",
    draft,
    windows,
    // Beside the mast on each crown.
    roofPads: [
      { x: -0.3, z: 0.12, y: crownTop, w: 0.2, d: 0.1 },
      { x: 0.3, z: -0.12, y: crownTop, w: 0.2, d: 0.1 },
    ],
    maxProps: 2,
  };
}

/**
 * Tier 5. The landmark of a metropolis skyline: three setbacks of glass
 * between stone piers, a ribbed crown, and a spire. The tip stands a little
 * above the building's height, as a mast does on the city's crowned tower.
 */
export function towerSpire(): ArchetypeModel {
  const draft = emptyDraft();
  const lobbyH = 0.035;
  addBox(draft, { y: 0, w: 1, h: lobbyH, d: 1, color: WALL, topColor: ROOF, skipBottom: true });
  addLobby(draft, { plane: 0.5, h: lobbyH });

  // Each setback rises from the top of the cornice below it. Rising from its
  // foot, the first spandrel came up through the cornice and stopped a hair
  // above it, a lip too low to draw.
  const stages = [
    { y0: lobbyH, y1: 0.5, half: 0.46, bands: 11, mullions: 3 },
    { y0: 0.512, y1: 0.72, half: 0.36, bands: 5, mullions: 2 },
    { y0: 0.732, y1: 0.84, half: 0.26, bands: 3, mullions: 1 },
  ];
  const windows: Panel[] = [];
  for (const stage of stages) {
    windows.push(
      ...addCurtainWall(draft, {
        y0: stage.y0,
        y1: stage.y1,
        hx: stage.half,
        hz: stage.half,
        bands: stage.bands,
        mullions: stage.mullions,
        spandrel: 0.28,
        litEvery: 3,
        spandrelColor: WALL,
      }),
    );
    // A cornice and a parapet at each setback, the parapet flush with it.
    const w = stage.half * 2 + 0.04;
    addBox(draft, { y: stage.y1, w, h: 0.012, d: w, color: TRIM, skipBottom: true });
    addParapet(draft, { y: stage.y1 + 0.012, h: 0.012, w, d: w, t: 0.02 });
  }

  // The crown: a stone lantern with a rib standing proud at each corner and
  // the middle of each face, stepping in towards the spire.
  const crown = 0.852;
  addBox(draft, { y: crown, w: 0.3, h: 0.06, d: 0.3, color: WALL, topColor: ROOF, skipBottom: true });
  for (const facing of FACINGS) {
    addPanel(draft, { facing, u: 0, v: crown + 0.032, w: 0.13, h: 0.04, plane: 0.15 }, glassAt(0.9));
  }
  for (const [x, z] of [
    [0.15, 0.15],
    [-0.15, 0.15],
    [0.15, -0.15],
    [-0.15, -0.15],
  ]) {
    addBox(draft, { x, z, y: crown, w: 0.035, h: 0.085, d: 0.035, color: TRIM, skipBottom: true });
  }
  addBox(draft, { y: crown + 0.06, w: 0.22, h: 0.018, d: 0.22, color: TRIM, skipBottom: true });
  addBox(draft, { y: crown + 0.078, w: 0.14, h: 0.02, d: 0.14, color: WALL, topColor: METAL, skipBottom: true });

  // The spire.
  addPyramid(draft, { y0: crown + 0.098, y1: 1.08, half: 0.07, color: METAL });

  const roofPads: RoofPad[] = [
    { x: 0.41, z: 0, y: 0.512, w: 0.08, d: 0.6 },
    { x: 0, z: 0.31, y: 0.732, w: 0.4, d: 0.07 },
  ];

  return {
    id: "tower-spire",
    draft,
    windows,
    roofPads,
    maxProps: 2,
  };
}

/**
 * The builders, keyed by the S0 archetype ids. `models.ts` registers them in
 * its `BUILDERS` table in place of the stand-ins:
 *
 *     "tower-glass": METROPOLIS_BUILDERS["tower-glass"],
 */
export const METROPOLIS_BUILDERS: Record<MetropolisArchetypeId, () => ArchetypeModel> = {
  "tower-glass": towerGlass,
  "tower-twin": towerTwin,
  "tower-spire": towerSpire,
};
