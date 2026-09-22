/**
 * Surface patterns for the ground, the roads and the pavements (PLAN.md
 * section 4: procedural only, no downloaded assets, no photorealism).
 *
 * Pure: pixels in, pixels out, from the seeded PRNG the city generator uses.
 * No three.js, no DOM, so every rule here is unit tested and the renderer in
 * `surfaces.ts` only uploads the result.
 *
 * WHAT A PIXEL MEANS. Every pattern is a MULTIPLIER on the material colour,
 * stored as linear data (255 = 1.0, the colour exactly). That is what lets the
 * texture follow everything the scene already does to a surface -- the hour,
 * the haze, an archived city's desaturation, a hovered district's tint --
 * without knowing about any of it: the pattern only ever says "a little
 * darker here". Values stay in a narrow band just under white, because a
 * miniature painted by hand has tone, not detail.
 *
 * Every pattern wraps: the right column continues into the left one and the
 * bottom row into the top, so a surface can repeat it without a seam.
 */

import { prngFromString, type Prng } from "@/lib/city/prng";

export interface Pattern {
  /** Side in pixels. Always a power of two, so the GPU can mipmap it. */
  size: number;
  /** RGBA, row-major, `size * size * 4` bytes. */
  data: Uint8Array;
}

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);
const smooth = (t: number) => t * t * (3 - 2 * t);
const smoothstep = (a: number, b: number, x: number) => smooth(clamp01((x - a) / (b - a)));

/** Rounds a requested side to the nearest power of two between 16 and 1024. */
export function patternSize(requested: number): number {
  const side = Math.max(16, Math.min(1024, Math.round(requested) || 16));
  return 2 ** Math.round(Math.log2(side));
}

/**
 * Smooth value noise on a `period` x `period` lattice, sampled at `size`
 * pixels a side. The lattice wraps, so the field tiles. Values in [0, 1].
 */
export function noiseField(size: number, period: number, prng: Prng): Float32Array {
  const cells = Math.max(1, Math.round(period));
  const lattice = new Float32Array(cells * cells);
  for (let i = 0; i < lattice.length; i++) lattice[i] = prng.next();

  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const fy = (y / size) * cells;
    const y0 = Math.floor(fy);
    const sy = smooth(fy - y0);
    const r0 = (y0 % cells) * cells;
    const r1 = ((y0 + 1) % cells) * cells;
    for (let x = 0; x < size; x++) {
      const fx = (x / size) * cells;
      const x0 = Math.floor(fx);
      const sx = smooth(fx - x0);
      const c0 = x0 % cells;
      const c1 = (x0 + 1) % cells;
      const top = lattice[r0 + c0] + (lattice[r0 + c1] - lattice[r0 + c0]) * sx;
      const bottom = lattice[r1 + c0] + (lattice[r1 + c1] - lattice[r1 + c0]) * sx;
      out[y * size + x] = top + (bottom - top) * sy;
    }
  }
  return out;
}

/**
 * Per-pixel grain, softened by one wrapped 3x3 box blur so it reads as
 * texture in the paint rather than as sensor noise. Centred on 0.5.
 */
export function grainField(size: number, prng: Prng): Float32Array {
  const raw = new Float32Array(size * size);
  for (let i = 0; i < raw.length; i++) raw[i] = prng.next();
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let sum = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const row = ((y + dy + size) % size) * size;
        for (let dx = -1; dx <= 1; dx++) sum += raw[row + ((x + dx + size) % size)];
      }
      out[y * size + x] = sum / 9;
    }
  }
  return out;
}

/** Packs per-pixel multipliers into RGBA bytes. */
function pack(size: number, pixel: (i: number, x: number, y: number) => [number, number, number, number]): Pattern {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const [r, g, b, a] = pixel(i, x, y);
      const o = i * 4;
      data[o] = Math.round(clamp01(r) * 255);
      data[o + 1] = Math.round(clamp01(g) * 255);
      data[o + 2] = Math.round(clamp01(b) * 255);
      data[o + 3] = Math.round(clamp01(a) * 255);
    }
  }
  return { size, data };
}

// ---------------------------------------------------------------------------
// Grass
// ---------------------------------------------------------------------------

export interface GrassOptions {
  /**
   * Mowing stripes across one tile, light and dark pairs running along v.
   * 0 for none: the landscape beyond the city is meadow, not lawn.
   */
  stripes?: number;
  seed?: string;
}

/**
 * Lawn and meadow. Broad patches of tone, a finer graininess, a few warmer
 * drier patches, and on the city lawn a mower's stripes, stronger in some
 * passes than others so the plate does not look ruled like a football pitch.
 */
export function grassPattern(size: number, { stripes = 0, seed = "grass" }: GrassOptions = {}): Pattern {
  const side = patternSize(size);
  const prng = prngFromString(`texture:${seed}`);
  const broad = noiseField(side, 4, prng);
  const mid = noiseField(side, 9, prng);
  const fine = grainField(side, prng);
  const dry = noiseField(side, 3, prng);
  const mowed = noiseField(side, 2, prng);

  return pack(side, (i, x) => {
    let level = 0.94 + (broad[i] - 0.5) * 0.1 + (mid[i] - 0.5) * 0.04 + (fine[i] - 0.5) * 0.06;
    if (stripes > 0) {
      // A soft square wave: two flat bands with a short ramp between, so the
      // stripe reads as a mower pass and not as a sine ripple.
      const phase = ((x / side) * stripes) % 1;
      const band = smoothstep(0.08, 0.16, phase) - smoothstep(0.58, 0.66, phase);
      // Some passes are fresher than others: the stripe never vanishes, it
      // only weakens, or it reads as brush strokes rather than a mower.
      const patch = 0.55 + 0.45 * smoothstep(0.3, 0.6, mowed[i]);
      level += (band - 0.5) * 0.055 * patch;
    }
    // Dry grass is a touch warmer: more red, less blue.
    const warm = smoothstep(0.58, 0.85, dry[i]) * 0.035;
    return [level + warm * 0.4, level, level - warm, 1];
  });
}

// ---------------------------------------------------------------------------
// Asphalt
// ---------------------------------------------------------------------------

/**
 * Road surface. RGB is a grey multiplier: mottled tone, aggregate grain, a few
 * darker repair patches with soft edges. Alpha is a separate wear mask the
 * road shader uses to make the oil line down each lane patchy instead of
 * ruled; it is never shown directly.
 */
export function asphaltPattern(size: number, seed = "asphalt"): Pattern {
  const side = patternSize(size);
  const prng = prngFromString(`texture:${seed}`);
  const mottle = noiseField(side, 5, prng);
  const mid = noiseField(side, 13, prng);
  const grain = grainField(side, prng);
  const wear = noiseField(side, 6, prng);

  // Tar repairs: a handful of rotated-by-nothing rectangles, which is how a
  // road crew patches a street. Placed in pattern space and wrapped.
  const patches = Array.from({ length: 3 }, () => ({
    x: prng.next(),
    y: prng.next(),
    w: prng.range(0.08, 0.2),
    h: prng.range(0.05, 0.14),
    depth: prng.range(0.05, 0.075),
  }));

  const stones = new Float32Array(side * side);
  const stoneCount = Math.round(side * side * 0.01);
  for (let n = 0; n < stoneCount; n++) stones[prng.int(0, side * side - 1)] = prng.range(0.03, 0.06);

  return pack(side, (i, x, y) => {
    const u = x / side;
    const v = y / side;
    let level =
      0.93 + (mottle[i] - 0.5) * 0.12 + (mid[i] - 0.5) * 0.06 + (grain[i] - 0.5) * 0.3 + stones[i];
    for (const patch of patches) {
      const du = Math.abs(((u - patch.x + 1.5) % 1) - 0.5);
      const dv = Math.abs(((v - patch.y + 1.5) % 1) - 0.5);
      const edge = 0.012;
      const inside =
        (1 - smoothstep(patch.w / 2 - edge, patch.w / 2, du)) *
        (1 - smoothstep(patch.h / 2 - edge, patch.h / 2, dv));
      level -= inside * patch.depth;
    }
    return [level, level, level, wear[i]];
  });
}

// ---------------------------------------------------------------------------
// Pavement
// ---------------------------------------------------------------------------

export interface PaverOptions {
  /** Slab columns across one tile (u). */
  columns?: number;
  /** Slab rows along one tile (v). */
  rows?: number;
  seed?: string;
}

/** Joint half-width and the shading ramp inside each slab, as slab fractions. */
const JOINT = 0.035;
const BEVEL = 0.12;
const JOINT_LEVEL = 0.8;

/**
 * Where a slab starts along v in column `column`. Alternate columns are set
 * half a slab along, the running bond every paved street has.
 */
function rowOffset(column: number): number {
  return column % 2 === 1 ? 0.5 : 0;
}

/**
 * Pavement flags: a grid of slabs, alternate columns offset by half a slab,
 * each slab its own shade, with a darker joint and a faint bevel so a slab
 * catches a little light at its edges up close. From the overview the joints
 * average away into a slightly deeper tone, which is the right answer there.
 */
export function paverPattern(
  size: number,
  { columns = 4, rows = 8, seed = "pavers" }: PaverOptions = {},
): Pattern {
  const side = patternSize(size);
  const prng = prngFromString(`texture:${seed}`);
  const grain = grainField(side, prng);
  const stain = noiseField(side, 5, prng);
  const tones = new Float32Array(columns * rows);
  for (let i = 0; i < tones.length; i++) tones[i] = prng.range(-0.035, 0.035);

  return pack(side, (i, x, y) => {
    const cu = (x / side) * columns;
    const column = Math.floor(cu);
    const cv = (y / side) * rows + rowOffset(column);
    const row = Math.floor(cv) % rows;
    // Distance to the nearest joint, in slab fractions.
    const fu = cu - column;
    const fv = cv - Math.floor(cv);
    const edge = Math.min(fu, 1 - fu, fv, 1 - fv);
    const joint = 1 - smoothstep(JOINT * 0.5, JOINT, edge);
    const bevel = 1 - smoothstep(JOINT, BEVEL, edge);

    const slab =
      0.97 + tones[column * rows + row] + (grain[i] - 0.5) * 0.04 + (stain[i] - 0.5) * 0.025 - bevel * 0.025;
    const level = slab + (JOINT_LEVEL - slab) * joint;
    return [level, level, level, 1];
  });
}

/** The pattern-space centre of slab `(column, row)`, for tests and callers. */
export function paverCentre(column: number, row: number, columns = 4, rows = 8): [number, number] {
  return [(column + 0.5) / columns, (((row + 0.5 - rowOffset(column)) % rows) + rows) % rows / rows];
}

// ---------------------------------------------------------------------------
// Gravel and ground
// ---------------------------------------------------------------------------

/**
 * The civic square's raked gravel: a dense speckle of light and dark stones
 * and, faintly, the lines a rake leaves along u.
 */
export function gravelPattern(size: number, { lines = 18, seed = "gravel" } = {}): Pattern {
  const side = patternSize(size);
  const prng = prngFromString(`texture:${seed}`);
  const grain = grainField(side, prng);
  const broad = noiseField(side, 4, prng);
  const speck = new Float32Array(side * side);
  for (let i = 0; i < speck.length; i++) speck[i] = prng.next();

  return pack(side, (i, x, y) => {
    const rake = Math.sin((y / side) * lines * Math.PI * 2 + Math.sin((x / side) * Math.PI * 2) * 1.2);
    let level = 0.95 + (grain[i] - 0.5) * 0.1 + (broad[i] - 0.5) * 0.04 + rake * 0.012;
    if (speck[i] > 0.985) level += 0.05;
    else if (speck[i] < 0.012) level -= 0.06;
    return [level, level, level * 0.995, 1];
  });
}

/**
 * The detail layer laid over the district ground. The districts are flat
 * tinted plates; this breaks them with soft mottling and a whisper of grain,
 * so a big plate stops reading as injection-moulded plastic. Kept the
 * gentlest of all the patterns: it sits under every building in the city.
 */
export function groundDetailPattern(size: number, seed = "ground"): Pattern {
  const side = patternSize(size);
  const prng = prngFromString(`texture:${seed}`);
  const broad = noiseField(side, 3, prng);
  const mid = noiseField(side, 8, prng);
  const grain = grainField(side, prng);

  return pack(side, (i) => {
    const level =
      0.95 + (broad[i] - 0.5) * 0.09 + (mid[i] - 0.5) * 0.045 + (grain[i] - 0.5) * 0.05;
    return [level, level, level, 1];
  });
}

/** Reads a pattern's red channel back as a multiplier. For tests and tools. */
export function levelAt(pattern: Pattern, x: number, y: number, channel = 0): number {
  const s = pattern.size;
  const px = ((Math.floor(x) % s) + s) % s;
  const py = ((Math.floor(y) % s) + s) % s;
  return pattern.data[(py * s + px) * 4 + channel] / 255;
}
