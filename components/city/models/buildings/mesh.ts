/**
 * A tiny CPU-side geometry builder for the building archetypes (PLAN.md
 * sections 4, 9, 38).
 *
 * Every archetype is authored once as a merged, flat-shaded mesh in UNIT SPACE
 * -- x and z in [-0.5, 0.5], y in [0, 1] -- and then drawn as one
 * `InstancedMesh` whose per-instance matrix scales it to the building's
 * `size`. That is what keeps three hundred buildings at a handful of draw
 * calls while still giving them roofs, parapets, mullions and doors.
 *
 * Detail colours are VERTEX colours in the 0..1 multiplier sense: the
 * instanced mesh carries the district's building colour per instance, and the
 * vertex colour shades it (a roof at 0.7 is the same hue, darker). One
 * palette, one art style, no textures.
 *
 * Pure arrays, no three.js, so it is unit tested directly.
 */

export type Rgb3 = readonly [number, number, number];

export interface MeshDraft {
  positions: number[];
  normals: number[];
  colors: number[];
  indices: number[];
}

export const emptyDraft = (): MeshDraft => ({
  positions: [],
  normals: [],
  colors: [],
  indices: [],
});

export const triangleCount = (draft: MeshDraft): number => draft.indices.length / 3;

type P = readonly [number, number, number];

/** Flat-shaded quad, wound a -> b -> c -> d. The normal comes from the winding. */
export function addQuad(draft: MeshDraft, a: P, b: P, c: P, d: P, color: Rgb3): void {
  const ux = b[0] - a[0];
  const uy = b[1] - a[1];
  const uz = b[2] - a[2];
  const vx = d[0] - a[0];
  const vy = d[1] - a[1];
  const vz = d[2] - a[2];
  let nx = uy * vz - uz * vy;
  let ny = uz * vx - ux * vz;
  let nz = ux * vy - uy * vx;
  const len = Math.hypot(nx, ny, nz) || 1;
  nx /= len;
  ny /= len;
  nz /= len;

  const base = draft.positions.length / 3;
  for (const p of [a, b, c, d]) {
    draft.positions.push(p[0], p[1], p[2]);
    draft.normals.push(nx, ny, nz);
    draft.colors.push(color[0], color[1], color[2]);
  }
  draft.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

export interface BoxSpec {
  /** Centre on x and z, BASE on y: buildings grow upward from their plot. */
  x?: number;
  y: number;
  z?: number;
  w: number;
  h: number;
  d: number;
  color: Rgb3;
  /** Overrides `color` for the +y face, e.g. a roof deck under a parapet. */
  topColor?: Rgb3;
  /** Skip the bottom face when it is buried in another volume. */
  skipBottom?: boolean;
}

/** An axis-aligned box whose `y` is its BASE, not its centre. */
export function addBox(draft: MeshDraft, spec: BoxSpec): void {
  const x = spec.x ?? 0;
  const z = spec.z ?? 0;
  const hw = spec.w / 2;
  const hd = spec.d / 2;
  const y0 = spec.y;
  const y1 = spec.y + spec.h;
  const c = spec.color;
  const top = spec.topColor ?? c;

  // +z, -z, +x, -x, +y, -y
  addQuad(draft, [x - hw, y0, z + hd], [x + hw, y0, z + hd], [x + hw, y1, z + hd], [x - hw, y1, z + hd], c);
  addQuad(draft, [x + hw, y0, z - hd], [x - hw, y0, z - hd], [x - hw, y1, z - hd], [x + hw, y1, z - hd], c);
  addQuad(draft, [x + hw, y0, z + hd], [x + hw, y0, z - hd], [x + hw, y1, z - hd], [x + hw, y1, z + hd], c);
  addQuad(draft, [x - hw, y0, z - hd], [x - hw, y0, z + hd], [x - hw, y1, z + hd], [x - hw, y1, z - hd], c);
  addQuad(draft, [x - hw, y1, z + hd], [x + hw, y1, z + hd], [x + hw, y1, z - hd], [x - hw, y1, z - hd], top);
  if (!spec.skipBottom) {
    addQuad(draft, [x - hw, y0, z - hd], [x + hw, y0, z - hd], [x + hw, y0, z + hd], [x - hw, y0, z + hd], c);
  }
}

export interface GableSpec {
  x?: number;
  y: number;
  z?: number;
  w: number;
  h: number;
  d: number;
  color: Rgb3;
  /** The ridge runs along this axis. */
  ridge: "x" | "z";
  /** 0 = a flat ridge line, 1 = the ridge sits at the full width. */
  overhangEaves?: number;
}

/** A pitched roof: two slopes and two gable ends. */
export function addGable(draft: MeshDraft, spec: GableSpec): void {
  const x = spec.x ?? 0;
  const z = spec.z ?? 0;
  const hw = spec.w / 2;
  const hd = spec.d / 2;
  const y0 = spec.y;
  const y1 = spec.y + spec.h;
  const c = spec.color;

  if (spec.ridge === "x") {
    const a: P = [x - hw, y0, z + hd];
    const b: P = [x + hw, y0, z + hd];
    const cc: P = [x + hw, y0, z - hd];
    const dd: P = [x - hw, y0, z - hd];
    const r0: P = [x - hw, y1, z];
    const r1: P = [x + hw, y1, z];
    addQuad(draft, a, b, r1, r0, c); // +z slope
    addQuad(draft, cc, dd, r0, r1, c); // -z slope
    addQuad(draft, b, cc, r1, r1, c); // +x gable (degenerate 4th point = triangle)
    addQuad(draft, dd, a, r0, r0, c); // -x gable
  } else {
    const a: P = [x + hw, y0, z + hd];
    const b: P = [x + hw, y0, z - hd];
    const cc: P = [x - hw, y0, z - hd];
    const dd: P = [x - hw, y0, z + hd];
    const r0: P = [x, y1, z + hd];
    const r1: P = [x, y1, z - hd];
    addQuad(draft, a, b, r1, r0, c);
    addQuad(draft, cc, dd, r0, r1, c);
    addQuad(draft, b, cc, r1, r1, c);
    addQuad(draft, dd, a, r0, r0, c);
  }
}

/**
 * One tooth of a sawtooth roof: a sloped deck with a vertical face on its high
 * side. `glassColor` paints that vertical face, which is what makes a
 * warehouse read as a workshop rather than a shed.
 */
export function addSawtooth(
  draft: MeshDraft,
  spec: {
    x: number;
    y: number;
    z?: number;
    w: number;
    rise: number;
    d: number;
    color: Rgb3;
    glassColor: Rgb3;
  },
): void {
  const z = spec.z ?? 0;
  const hd = spec.d / 2;
  const x0 = spec.x - spec.w / 2;
  const x1 = spec.x + spec.w / 2;
  const y0 = spec.y;
  const y1 = spec.y + spec.rise;

  // Sloped deck, low at x0 and high at x1.
  addQuad(draft, [x0, y0, z + hd], [x1, y1, z + hd], [x1, y1, z - hd], [x0, y0, z - hd], spec.color);
  // The vertical glazed face that drops back to the deck.
  addQuad(draft, [x1, y0, z + hd], [x1, y1, z + hd], [x1, y1, z - hd], [x1, y0, z - hd], spec.glassColor);
  addQuad(draft, [x1, y0, z - hd], [x1, y1, z - hd], [x1, y1, z + hd], [x1, y0, z + hd], spec.glassColor);
  // End caps so the tooth is solid from the side.
  addQuad(draft, [x0, y0, z + hd], [x1, y0, z + hd], [x1, y1, z + hd], [x1, y1, z + hd], spec.color);
  addQuad(draft, [x1, y0, z - hd], [x0, y0, z - hd], [x1, y1, z - hd], [x1, y1, z - hd], spec.color);
}

/** A vertical prism, used for tanks, masts and columns. */
export function addCylinder(
  draft: MeshDraft,
  spec: {
    x?: number;
    y: number;
    z?: number;
    radius: number;
    h: number;
    segments?: number;
    color: Rgb3;
    topColor?: Rgb3;
  },
): void {
  const x = spec.x ?? 0;
  const z = spec.z ?? 0;
  const seg = spec.segments ?? 8;
  const y0 = spec.y;
  const y1 = spec.y + spec.h;
  const top = spec.topColor ?? spec.color;
  const px = (i: number) => x + Math.cos((i / seg) * Math.PI * 2) * spec.radius;
  const pz = (i: number) => z + Math.sin((i / seg) * Math.PI * 2) * spec.radius;

  for (let i = 0; i < seg; i++) {
    const j = (i + 1) % seg;
    addQuad(
      draft,
      [px(i), y0, pz(i)],
      [px(j), y0, pz(j)],
      [px(j), y1, pz(j)],
      [px(i), y1, pz(i)],
      spec.color,
    );
  }
  // Flat cap as a fan of degenerate quads: cheap and it reads from above.
  for (let i = 0; i < seg; i++) {
    const j = (i + 1) % seg;
    addQuad(draft, [x, y1, z], [px(i), y1, pz(i)], [px(j), y1, pz(j)], [px(j), y1, pz(j)], top);
  }
}

/** Which way a facade panel faces, in unit space. */
export type Facing = "+z" | "-z" | "+x" | "-x";

export const FACINGS: readonly Facing[] = ["+z", "-z", "+x", "-x"];

/** The yaw, in radians, that turns a +z-facing panel onto `facing`. */
export function facingYaw(facing: Facing): number {
  switch (facing) {
    case "+z":
      return 0;
    case "+x":
      return Math.PI / 2;
    case "-z":
      return Math.PI;
    default:
      return -Math.PI / 2;
  }
}

/**
 * A flat panel on one wall: windows, doors and vents are all this. `plane` is
 * the distance from the centreline to the wall it sits on, so a setback
 * tower's upper windows land on the upper volume's wall, not the base's.
 */
export interface Panel {
  facing: Facing;
  /** Offset along the wall, in unit space. */
  u: number;
  /** Centre height, 0..1. */
  v: number;
  /** Width along the wall and height, in unit space. */
  w: number;
  h: number;
  /** Half-extent of the volume this wall belongs to. */
  plane: number;
}

/** Nudge outward so a panel never z-fights the wall behind it. */
export const PANEL_LIFT = 0.006;

/** World-space centre of a panel, in the archetype's unit space. */
export function panelCentre(panel: Panel, extraLift = 0): [number, number, number] {
  const out = panel.plane + PANEL_LIFT + extraLift;
  switch (panel.facing) {
    case "+z":
      return [panel.u, panel.v, out];
    case "-z":
      return [-panel.u, panel.v, -out];
    case "+x":
      return [out, panel.v, -panel.u];
    default:
      return [-out, panel.v, panel.u];
  }
}

/** Bake a panel into the merged geometry as a flat-shaded quad. */
export function addPanel(draft: MeshDraft, panel: Panel, color: Rgb3): void {
  const [cx, cy, cz] = panelCentre(panel);
  const hh = panel.h / 2;
  const hw = panel.w / 2;
  switch (panel.facing) {
    case "+z":
      addQuad(draft, [cx - hw, cy - hh, cz], [cx + hw, cy - hh, cz], [cx + hw, cy + hh, cz], [cx - hw, cy + hh, cz], color);
      break;
    case "-z":
      addQuad(draft, [cx + hw, cy - hh, cz], [cx - hw, cy - hh, cz], [cx - hw, cy + hh, cz], [cx + hw, cy + hh, cz], color);
      break;
    case "+x":
      addQuad(draft, [cx, cy - hh, cz + hw], [cx, cy - hh, cz - hw], [cx, cy + hh, cz - hw], [cx, cy + hh, cz + hw], color);
      break;
    default:
      addQuad(draft, [cx, cy - hh, cz - hw], [cx, cy - hh, cz + hw], [cx, cy + hh, cz + hw], [cx, cy + hh, cz - hw], color);
      break;
  }
}

/**
 * A grid of windows across one wall, returned rather than drawn so the lit
 * window pass can reuse exactly the same rectangles (PLAN.md section 19).
 */
export function windowGrid(spec: {
  facing: Facing;
  plane: number;
  /** Fraction of the wall the grid spans horizontally. */
  span: number;
  columns: number;
  rows: number;
  /** First and last row centres, 0..1. */
  from: number;
  to: number;
  /** Window size in unit space. */
  w: number;
  h: number;
}): Panel[] {
  const panels: Panel[] = [];
  const width = spec.plane * 2 * spec.span;
  for (let r = 0; r < spec.rows; r++) {
    const v = spec.rows === 1 ? (spec.from + spec.to) / 2 : spec.from + ((spec.to - spec.from) * r) / (spec.rows - 1);
    for (let c = 0; c < spec.columns; c++) {
      const u =
        spec.columns === 1 ? 0 : -width / 2 + (width * c) / (spec.columns - 1);
      panels.push({ facing: spec.facing, u, v, w: spec.w, h: spec.h, plane: spec.plane });
    }
  }
  return panels;
}

/** The same grid on all four walls. */
export function windowRing(spec: {
  plane: number;
  span: number;
  columns: number;
  rows: number;
  from: number;
  to: number;
  w: number;
  h: number;
}): Panel[] {
  return FACINGS.flatMap((facing) => windowGrid({ ...spec, facing }));
}
