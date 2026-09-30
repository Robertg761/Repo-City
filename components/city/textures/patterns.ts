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

const wrappedDelta = (a: number, b: number) => a - b - Math.round(a - b);

/** Small authored marks splatted with wrapped coordinates, independent of resolution. */
function ellipseField(size: number, prng: Prng, count: number, radius: [number, number], stretch = 1, leaves = false): Float32Array {
  const out = new Float32Array(size * size);
  for (let n = 0; n < count; n++) {
    const cx = prng.next() * size;
    const cy = prng.next() * size;
    const rx = prng.range(...radius) * size;
    const ry = rx * stretch * prng.range(0.65, 1.2);
    const angle = prng.range(0, Math.PI * 2);
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    const reach = Math.ceil(Math.max(rx, ry));
    const shade = prng.range(-0.05, 0.045);
    for (let y = -reach; y <= reach; y++) {
      for (let x = -reach; x <= reach; x++) {
        const dx = (x * cosine + y * sine) / Math.max(rx, 0.6);
        const dy = (-x * sine + y * cosine) / Math.max(ry, 0.6);
        const distance = dx * dx + dy * dy;
        if (distance >= 1) continue;
        const row = ((Math.floor(cy) + y) % size + size) % size;
        const column = ((Math.floor(cx) + x) % size + size) % size;
        const dome = 1 - smoothstep(0.45, 1, distance);
        const vein = leaves ? (1 - smoothstep(0.025, 0.10, Math.abs(dx))) * 0.035 : 0;
        out[row * size + column] += dome * (shade + vein);
      }
    }
  }
  return out;
}

/** Tar or mineral cracks, including short branches that join each main path. */
function crackField(size: number, prng: Prng, count = 3): Float32Array {
  const cracks = Array.from({ length: count }, (_, n) => ({
    offset: prng.next(), bend: prng.range(0.025, 0.065), slope: n % 2 ? -1 : 1,
    fork: prng.next(), length: prng.range(0.10, 0.23), branch: prng.range(1.2, 2.5) * (n % 2 ? 1 : -1),
  }));
  const out = new Float32Array(size * size);
  const width = Math.max(0.0015, 0.45 / size);
  for (let y = 0; y < size; y++) {
    const v = y / size;
    const paths = cracks.map((crack) => {
      const dy = wrappedDelta(v, crack.fork);
      const origin = crack.offset + crack.fork * crack.slope + Math.sin(crack.fork * Math.PI * 2) * crack.bend;
      return {
        main: crack.offset + v * crack.slope + Math.sin(v * Math.PI * 2) * crack.bend,
        branch: origin + dy * crack.branch,
        weight: 1 - smoothstep(crack.length * 0.6, crack.length, Math.abs(dy)),
      };
    });
    for (let x = 0; x < size; x++) {
      const u = x / size;
      let value = 0;
      for (const path of paths) {
        value = Math.max(value, 1 - smoothstep(width, width * 3, Math.abs(wrappedDelta(u, path.main))));
        value = Math.max(value, (1 - smoothstep(width * 0.6, width * 2.2, Math.abs(wrappedDelta(u, path.branch)))) * path.weight);
      }
      out[y * size + x] = value;
    }
  }
  return out;
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
  /**
   * 0..1 strength of the broad tonal patches and the dry warm ones. The
   * meadow is tiled four times wider than the lawn, so its patches land a
   * dozen units across: at full strength, seen at a slant past the ring road,
   * they read as cloud shadows drifting over the landscape -- haze, in effect.
   */
  mottle?: number;
}

/**
 * Lawn and meadow. Broad patches of tone, a finer graininess, a few warmer
 * drier patches, and on the city lawn a mower's stripes, stronger in some
 * passes than others so the plate does not look ruled like a football pitch.
 */
export function grassPattern(
  size: number,
  { stripes = 0, seed = "grass", mottle = 1 }: GrassOptions = {},
): Pattern {
  const side = patternSize(size);
  const prng = prngFromString(`texture:${seed}`);
  const broad = noiseField(side, 4, prng);
  const mid = noiseField(side, 9, prng);
  const fine = grainField(side, prng);
  const dry = noiseField(side, 3, prng);
  const mowed = noiseField(side, 2, prng);
  const blades = noiseField(side, 32, prng);
  const cuttings = ellipseField(side, prng, 260, [0.002, 0.006], 4, true);

  return pack(side, (i, x) => {
    let level =
      0.94 + (broad[i] - 0.5) * 0.1 * mottle + (mid[i] - 0.5) * 0.04 + (fine[i] - 0.5) * 0.06 + (blades[i] - 0.5) * 0.035 + cuttings[i];
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
    const warm = smoothstep(0.58, 0.85, dry[i]) * 0.035 * mottle;
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
  const cracks = crackField(side, prng);
  const aggregate = ellipseField(side, prng, 480, [0.0015, 0.005], 0.8);

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
      0.93 + (mottle[i] - 0.5) * 0.12 + (mid[i] - 0.5) * 0.06 + (grain[i] - 0.5) * 0.3 + stones[i] + aggregate[i];
    for (const patch of patches) {
      const du = Math.abs(((u - patch.x + 1.5) % 1) - 0.5);
      const dv = Math.abs(((v - patch.y + 1.5) % 1) - 0.5);
      const edge = 0.006 + mid[i] * 0.009;
      const inside =
        (1 - smoothstep(patch.w / 2 - edge, patch.w / 2, du)) *
        (1 - smoothstep(patch.h / 2 - edge, patch.h / 2, dv));
      level -= inside * patch.depth;
      const rim = (1 - smoothstep(0, edge, Math.abs(du - patch.w / 2))) * (1 - smoothstep(patch.h / 2, patch.h / 2 + edge, dv));
      level -= rim * 0.022;
    }
    level -= cracks[i] * 0.065;
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
  const chips = noiseField(side, 31, prng);
  const spots = ellipseField(side, prng, 75, [0.006, 0.018]);
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
      0.97 + tones[column * rows + row] + (grain[i] - 0.5) * 0.04 + (stain[i] - 0.5) * 0.045 + spots[i] - bevel * (0.025 + (1 - smoothstep(0.22, 0.40, chips[i])) * 0.05);
    const level = slab + (JOINT_LEVEL - slab) * joint;
    return [level, level, level, 1];
  });
}

/** The pattern-space centre of slab `(column, row)`, for tests and callers. */
export function paverCentre(column: number, row: number, columns = 4, rows = 8): [number, number] {
  return [(column + 0.5) / columns, (((row + 0.5 - rowOffset(column)) % rows) + rows) % rows / rows];
}

// ---------------------------------------------------------------------------
// Setts
// ---------------------------------------------------------------------------

export interface SettsOptions {
  /** Stones across one tile (u), per course. */
  columns?: number;
  /** Courses along one tile (v). */
  rows?: number;
  seed?: string;
}

/**
 * The town square's setts (PLAN.md 76.5): small squared stones laid in
 * courses, every other course set half a stone along, each stone its own
 * shade and domed -- darker towards its edges than a paving slab, which is
 * what makes a sett read as a cobble rather than as a tile. The joints are
 * deeper than the pavements' too, but stay inside the patterns' narrow band.
 */
export function settsPattern(
  size: number,
  { columns = 6, rows = 10, seed = "setts" }: SettsOptions = {},
): Pattern {
  const side = patternSize(size);
  const prng = prngFromString(`texture:${seed}`);
  const grain = grainField(side, prng);
  const worn = noiseField(side, 3, prng);
  const chips = noiseField(side, 27, prng);
  const minerals = ellipseField(side, prng, 180, [0.003, 0.012]);
  const tones = new Float32Array(columns * rows);
  for (let i = 0; i < tones.length; i++) tones[i] = prng.range(-0.05, 0.05);

  return pack(side, (i, x, y) => {
    const cv = (y / side) * rows;
    const row = Math.floor(cv);
    const cu = (x / side) * columns + (row % 2 === 1 ? 0.5 : 0);
    const column = Math.floor(cu) % columns;
    const fu = cu - Math.floor(cu);
    const fv = cv - row;
    const edge = Math.min(fu, 1 - fu, fv, 1 - fv);
    const joint = 1 - smoothstep(0.03, 0.07, edge);
    // A dome: full height in the middle of the stone, falling off to its rim.
    const dome = smoothstep(0, 0.32, edge);

    const stone =
      0.93 +
      tones[(row % rows) * columns + column] +
      (dome - 1) * 0.05 +
      (grain[i] - 0.5) * 0.05 +
      (worn[i] - 0.5) * 0.03 + minerals[i] - (1 - smoothstep(0.04, 0.22, edge)) * (1 - smoothstep(0.2, 0.4, chips[i])) * 0.04;
    const level = stone + (0.76 - stone) * joint;
    // A breath of warmth in the stone, none in the joint.
    return [level + (1 - joint) * 0.006, level, level - (1 - joint) * 0.008, 1];
  });
}

/** The pattern-space centre of sett `(column, row)`. */
export function settCentre(column: number, row: number, columns = 6, rows = 10): [number, number] {
  const shift = row % 2 === 1 ? 0.5 : 0;
  return [((((column + 0.5 - shift) / columns) % 1) + 1) % 1, (row + 0.5) / rows];
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
  const stones = ellipseField(side, prng, 420, [0.0035, 0.016], 0.7);
  const speck = new Float32Array(side * side);
  for (let i = 0; i < speck.length; i++) speck[i] = prng.next();

  return pack(side, (i, x, y) => {
    const rake = Math.sin((y / side) * lines * Math.PI * 2 + Math.sin((x / side) * Math.PI * 2) * 1.2);
    let level = 0.95 + (grain[i] - 0.5) * 0.1 + (broad[i] - 0.5) * 0.04 + rake * 0.012 + stones[i];
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
  const mineral = ellipseField(side, prng, 140, [0.002, 0.01]);

  return pack(side, (i) => {
    const level =
      0.95 + (broad[i] - 0.5) * 0.09 + (mid[i] - 0.5) * 0.045 + (grain[i] - 0.5) * 0.05 + mineral[i] * 0.4;
    return [level, level, level, 1];
  });
}

/** Lime render with exposed running-bond masonry and fine mineral pores. */
export function facadePattern(size: number, seed = "facade"): Pattern {
  const side = patternSize(size);
  const prng = prngFromString(`texture:${seed}`);
  const grain = grainField(side, prng);
  const weather = noiseField(side, 5, prng);
  const chips = noiseField(side, 27, prng);
  const pits = ellipseField(side, prng, 180, [0.002, 0.008]);
  const courses = 8;
  const columns = 4;
  const shades = Array.from({ length: courses * columns }, () => prng.range(-0.028, 0.025));
  return pack(side, (i, x, y) => {
    const cy = y / side * courses;
    const row = Math.floor(cy);
    const cx = x / side * columns + (row % 2) * 0.5;
    const column = Math.floor(cx) % columns;
    const edge = Math.min(cx % 1, 1 - cx % 1, cy % 1, 1 - cy % 1);
    const chippedEdge = edge - (1 - smoothstep(0.22, 0.44, chips[i])) * 0.045;
    const mortar = 1 - smoothstep(0.012, 0.045, chippedEdge);
    const level = 0.974 + shades[row * columns + column] + (grain[i] - 0.5) * 0.07 + (weather[i] - 0.5) * 0.035 + pits[i] - mortar * 0.145;
    return [level, level * 0.998, level * 0.992, 1];
  });
}

/** Overlapping clay or slate courses, with a rounded tile crown and worn rims. */
export function roofPattern(size: number, seed = "roof"): Pattern {
  const side = patternSize(size);
  const prng = prngFromString(`texture:${seed}`);
  const grain = grainField(side, prng);
  const weather = noiseField(side, 4, prng);
  const chips = noiseField(side, 35, prng);
  const tones = Array.from({ length: 48 }, () => prng.range(-0.035, 0.025));
  return pack(side, (i, x, y) => {
    const cy = y / side * 8;
    const row = Math.floor(cy);
    const cx = x / side * 6 + (row % 2) * 0.5;
    const fu = cx % 1;
    const fv = cy % 1;
    const sideEdge = 1 - smoothstep(0.012, 0.055, Math.min(fu, 1 - fu));
    const overlap = 1 - smoothstep(0.025, 0.14, fv);
    const crown = Math.sin(fu * Math.PI);
    const chip = (1 - smoothstep(0.10, 0.25, chips[i])) * (1 - smoothstep(0.07, 0.23, fv));
    const level = 0.958 + tones[row * 6 + Math.floor(cx) % 6] + (grain[i] - 0.5) * 0.06 + (weather[i] - 0.5) * 0.025 + crown * 0.018 - sideEdge * 0.07 - overlap * 0.10 - chip * 0.045;
    return [level, level, level * 0.996, 1];
  });
}

/** Concrete aggregate, shallow casting pores and faint weather staining. */
export function concretePattern(size: number, seed = "concrete"): Pattern {
  const side = patternSize(size);
  const prng = prngFromString(`texture:${seed}`);
  const grain = grainField(side, prng);
  const stain = noiseField(side, 5, prng);
  const pores = noiseField(side, 40, prng);
  const aggregate = ellipseField(side, prng, 260, [0.002, 0.008]);
  const cracks = crackField(side, prng, 1);
  return pack(side, (i) => {
    const pit = (1 - smoothstep(0.12, 0.22, pores[i])) * 0.10;
    const level = 0.963 + (grain[i] - 0.5) * 0.09 + (stain[i] - 0.5) * 0.05 + aggregate[i] - pit - cracks[i] * 0.022;
    return [level, level, level * 0.996, 1];
  });
}

/** Soil clods and narrow furrows. Zero furrows gives the garden's loose earth. */
export function soilPattern(size: number, { furrows = 0, seed = "soil" } = {}): Pattern {
  const side = patternSize(size);
  const prng = prngFromString(`texture:${seed}`);
  const broad = noiseField(side, 4, prng);
  const clods = noiseField(side, 24, prng);
  const grain = grainField(side, prng);
  const pebbles = ellipseField(side, prng, 160, [0.003, 0.012], 0.7);
  const roots = crackField(side, prng, 1);
  return pack(side, (i, x) => {
    const furrow = furrows > 0 ? Math.pow(0.5 + 0.5 * Math.cos(x / side * furrows * Math.PI * 2), 5) : 0;
    const level = 0.95 + (broad[i] - 0.5) * 0.07 + (clods[i] - 0.5) * 0.09 + (grain[i] - 0.5) * 0.10 + pebbles[i] - furrow * 0.065 - roots[i] * 0.025;
    return [level, level * 0.994, level * 0.982, 1];
  });
}

/** Timber growth rings bend around wrapped knots, with narrow open grain. */
export function woodPattern(size: number, seed = "wood"): Pattern {
  const side = patternSize(size);
  const prng = prngFromString(`texture:${seed}`);
  const broad = noiseField(side, 4, prng);
  const grain = grainField(side, prng);
  const knots = Array.from({ length: 3 }, () => ({
    x: prng.next(), y: prng.next(), width: prng.range(24, 52), height: prng.range(7, 16),
  }));
  const pores = ellipseField(side, prng, 130, [0.001, 0.003], 4);
  return pack(side, (i, x, y) => {
    const u = x / side;
    const v = y / side;
    let knotShade = 0;
    let rings = 0;
    let bend = 0;
    for (const knot of knots) {
      const dx = wrappedDelta(u, knot.x);
      const dy = wrappedDelta(v, knot.y);
      const radius = Math.sqrt(dx * dx * knot.width + dy * dy * knot.height);
      const influence = 1 - smoothstep(0.13, 0.62, radius);
      knotShade += influence;
      rings += Math.sin(radius * 43) * influence;
      bend += dx * influence * 2.5;
    }
    const fibre = Math.sin((u * 18 + Math.sin(v * Math.PI * 2) * 0.35 + broad[i] * 0.7 + bend) * Math.PI * 2);
    const fineFibre = Math.sin((u * 57 + broad[i] * 1.7 + bend) * Math.PI * 2);
    const level = 0.955 + fibre * 0.020 + fineFibre * 0.009 + rings * 0.020 + (broad[i] - 0.5) * 0.045 + (grain[i] - 0.5) * 0.04 + pores[i] - knotShade * 0.047;
    return [level + 0.005, level, level - 0.014, 1];
  });
}

/** Long bark fissures soften into raised ridges instead of pixel noise. */
export function barkPattern(size: number, seed = "bark"): Pattern {
  const side = patternSize(size);
  const prng = prngFromString(`texture:${seed}`);
  const broad = noiseField(side, 5, prng);
  const grain = grainField(side, prng);
  const scars = ellipseField(side, prng, 24, [0.005, 0.018], 1.9);
  const branchX = prng.next();
  const branchY = prng.next();
  return pack(side, (i, x, y) => {
    const phase = x / side * 16 + Math.sin(y / side * Math.PI * 2) * 0.3 + broad[i] * 0.65;
    const fissure = Math.pow(0.5 + 0.5 * Math.cos(phase * Math.PI * 2), 6);
    const smallFissure = Math.pow(0.5 + 0.5 * Math.cos((phase * 2.5 + Math.sin(y / side * Math.PI * 4) * 0.2) * Math.PI * 2), 10);
    const dx = wrappedDelta(x / side, branchX);
    const dy = wrappedDelta(y / side, branchY);
    const radius = Math.sqrt(dx * dx * 40 + dy * dy * 20);
    const branch = (1 - smoothstep(0.23, 0.5, radius)) * Math.sin(radius * 55);
    const level = 0.966 + (broad[i] - 0.5) * 0.055 + (grain[i] - 0.5) * 0.05 + scars[i] + branch * 0.025 - fissure * 0.09 - smallFissure * 0.025;
    return [level, level * 0.995, level * 0.985, 1];
  });
}

/** Small overlapping leaf clusters give the faceted canopy a second scale. */
export function foliagePattern(size: number, seed = "foliage"): Pattern {
  const side = patternSize(size);
  const prng = prngFromString(`texture:${seed}`);
  const clusters = noiseField(side, 8, prng);
  const leaves = noiseField(side, 30, prng);
  const grain = grainField(side, prng);
  const blades = ellipseField(side, prng, 260, [0.007, 0.017], 1.9, true);
  return pack(side, (i) => {
    const pocket = 1 - smoothstep(0.19, 0.43, leaves[i]);
    const level = 0.965 + (clusters[i] - 0.5) * 0.06 + (leaves[i] - 0.5) * 0.055 + (grain[i] - 0.5) * 0.025 + blades[i] - pocket * 0.07;
    return [level * 0.993, level, level * 0.982, 1];
  });
}

/** Lime plaster has trowel marks, pinholes and faint mineral weathering. */
export function plasterPattern(size: number, seed = "plaster"): Pattern {
  const side = patternSize(size);
  const prng = prngFromString(`texture:${seed}`);
  const broad = noiseField(side, 4, prng);
  const render = noiseField(side, 18, prng);
  const grain = grainField(side, prng);
  const chips = ellipseField(side, prng, 75, [0.003, 0.014]);
  const cracks = crackField(side, prng, 1);
  return pack(side, (i, x, y) => {
    const trowel = Math.sin((x / side * 4 + y / side * 7 + broad[i] * 0.8) * Math.PI * 2);
    const worn = smoothstep(0.68, 0.88, broad[i]);
    const level = 0.966 + (render[i] - 0.5) * 0.055 + (grain[i] - 0.5) * 0.055 + trowel * 0.007 + chips[i] - worn * 0.027 - cracks[i] * 0.022;
    return [level, level * 0.998, level * 0.992, 1];
  });
}

/** The brick alias keeps the facade API while giving authored masonry its own seed. */
export function brickPattern(size: number, seed = "brick"): Pattern {
  return facadePattern(size, seed);
}

/** Larger limestone ashlar blocks, chipped joints, mineral veins and worn crowns. */
export function stonePattern(size: number, seed = "stone"): Pattern {
  const side = patternSize(size);
  const prng = prngFromString(`texture:${seed}`);
  const grain = grainField(side, prng);
  const minerals = noiseField(side, 11, prng);
  const chips = noiseField(side, 29, prng);
  const pores = ellipseField(side, prng, 170, [0.002, 0.008]);
  const tones = Array.from({ length: 16 }, () => prng.range(-0.04, 0.026));
  return pack(side, (i, x, y) => {
    const cy = y / side * 4;
    const row = Math.floor(cy);
    const cx = x / side * 4 + (row % 2) * 0.5;
    const edge = Math.min(cx % 1, 1 - cx % 1, cy % 1, 1 - cy % 1);
    const nibble = (1 - smoothstep(0.2, 0.45, chips[i])) * 0.045;
    const joint = 1 - smoothstep(0.015, 0.055, edge - nibble);
    const vein = Math.pow(0.5 + 0.5 * Math.sin((x / side * 9 + y / side * 3 + minerals[i] * 0.8) * Math.PI * 2), 12);
    const level = 0.969 + tones[row * 4 + Math.floor(cx) % 4] + (grain[i] - 0.5) * 0.07 + pores[i] - joint * 0.15 - vein * 0.018;
    return [level + 0.003, level, level - 0.009, 1];
  });
}

/** Thin split-slate courses with chipped lower rims and diagonal cleavage lines. */
export function slatePattern(size: number, seed = "slate"): Pattern {
  const side = patternSize(size);
  const prng = prngFromString(`texture:${seed}`);
  const grain = grainField(side, prng);
  const splits = noiseField(side, 28, prng);
  const weather = noiseField(side, 4, prng);
  const tones = Array.from({ length: 60 }, () => prng.range(-0.03, 0.035));
  return pack(side, (i, x, y) => {
    const cy = y / side * 10;
    const row = Math.floor(cy);
    const cx = x / side * 6 + (row % 2) * 0.5;
    const fu = cx % 1;
    const fv = cy % 1;
    const edge = Math.min(fu, 1 - fu);
    const joint = 1 - smoothstep(0.015, 0.055, edge);
    const overlap = 1 - smoothstep(0.015, 0.10, fv - (1 - smoothstep(0.22, 0.42, splits[i])) * 0.06);
    const stria = Math.sin((x / side * 23 + y / side * 17 + weather[i] * 0.8) * Math.PI * 2);
    const level = 0.961 + tones[row * 6 + Math.floor(cx) % 6] + (grain[i] - 0.5) * 0.055 + stria * 0.006 - joint * 0.065 - overlap * 0.09;
    return [level * 0.995, level * 0.998, level, 1];
  });
}

/** Bundles of straw have coarse binding courses and individual bent stalks. */
export function thatchPattern(size: number, seed = "thatch"): Pattern {
  const side = patternSize(size);
  const prng = prngFromString(`texture:${seed}`);
  const bundles = noiseField(side, 8, prng);
  const weather = noiseField(side, 4, prng);
  const grain = grainField(side, prng);
  return pack(side, (i, x, y) => {
    const u = x / side;
    const v = y / side;
    const phase = u * 62 + Math.sin(v * Math.PI * 2) * 0.38 + bundles[i] * 0.7;
    const stalk = Math.sin(phase * Math.PI * 2);
    const bundle = Math.sin((u * 12 + weather[i] * 0.35) * Math.PI * 2);
    const course = 1 - smoothstep(0.015, 0.12, (v * 4) % 1);
    const level = 0.948 + stalk * 0.013 + bundle * 0.017 + (weather[i] - 0.5) * 0.035 + (grain[i] - 0.5) * 0.04 - course * 0.034;
    return [level + 0.007, level, level - 0.018, 1];
  });
}

/** Standing seams, pressed ribs, small fasteners, scratches and oxidised patches. */
export function metalPattern(size: number, seed = "metal"): Pattern {
  const side = patternSize(size);
  const prng = prngFromString(`texture:${seed}`);
  const weather = noiseField(side, 5, prng);
  const grain = grainField(side, prng);
  return pack(side, (i, x, y) => {
    const u = x / side;
    const v = y / side;
    const cu = u * 4;
    const cv = v * 8;
    const seam = 1 - smoothstep(0.015, 0.06, Math.min(cu % 1, 1 - cu % 1));
    const bolt = (1 - smoothstep(0.035, 0.08, Math.min(cv % 1, 1 - cv % 1))) * seam;
    const scratch = Math.sin((u * 71 + Math.sin(v * Math.PI * 2) * 0.12) * Math.PI * 2);
    const oxide = (1 - smoothstep(0.22, 0.40, weather[i])) * (0.25 + seam * 0.75);
    const level = 0.973 + (grain[i] - 0.5) * 0.035 + scratch * 0.005 - seam * 0.07 - bolt * 0.035 - oxide * 0.04;
    return [level, level * 0.997, level * 0.991, 1];
  });
}

/** Glass stays mostly clear, with faint wipe streaks and a few dusty patches. */
export function glassPattern(size: number, seed = "glass"): Pattern {
  const side = patternSize(size);
  const prng = prngFromString(`texture:${seed}`);
  const dust = noiseField(side, 5, prng);
  const wipe = noiseField(side, 14, prng);
  return pack(side, (i, x, y) => {
    const streak = Math.sin((x / side * 13 + Math.sin(y / side * Math.PI * 2) * 0.1) * Math.PI * 2);
    const level = 0.991 + streak * 0.002 + (wipe[i] - 0.5) * 0.006 - smoothstep(0.72, 0.91, dust[i]) * 0.023;
    return [level * 0.998, level, level, 1];
  });
}

/** Woven awning and clothing threads cross over alternate fibres. */
export function fabricPattern(size: number, seed = "fabric"): Pattern {
  const side = patternSize(size);
  const prng = prngFromString(`texture:${seed}`);
  const worn = noiseField(side, 5, prng);
  const grain = grainField(side, prng);
  return pack(side, (i, x, y) => {
    const warp = Math.cos(x / side * 32 * Math.PI * 2);
    const weft = Math.cos(y / side * 32 * Math.PI * 2);
    const weave = (warp + weft) * 0.009 + warp * weft * 0.006;
    const level = 0.963 + weave + (worn[i] - 0.5) * 0.03 + (grain[i] - 0.5) * 0.025;
    return [level, level, level * 0.997, 1];
  });
}

/** Reads a pattern's red channel back as a multiplier. For tests and tools. */
export function levelAt(pattern: Pattern, x: number, y: number, channel = 0): number {
  const s = pattern.size;
  const px = ((Math.floor(x) % s) + s) % s;
  const py = ((Math.floor(y) % s) + s) % s;
  return pattern.data[(py * s + px) * 4 + channel] / 255;
}
