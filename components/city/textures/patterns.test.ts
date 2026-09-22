import { describe, expect, it } from "vitest";
import { prngFromString } from "@/lib/city/prng";
import {
  asphaltPattern,
  grainField,
  grassPattern,
  gravelPattern,
  groundDetailPattern,
  levelAt,
  noiseField,
  paverCentre,
  paverPattern,
  patternSize,
  type Pattern,
} from "./patterns";

const SIZE = 64;

const ALL: Record<string, (size: number) => Pattern> = {
  lawn: (size) => grassPattern(size, { stripes: 4 }),
  meadow: (size) => grassPattern(size),
  asphalt: (size) => asphaltPattern(size),
  pavers: (size) => paverPattern(size),
  gravel: (size) => gravelPattern(size),
  ground: (size) => groundDetailPattern(size),
};

/** Mean and extremes of one channel. */
function stats(pattern: Pattern, channel = 0) {
  let sum = 0;
  let min = 1;
  let max = 0;
  const n = pattern.size * pattern.size;
  for (let i = 0; i < n; i++) {
    const v = pattern.data[i * 4 + channel] / 255;
    sum += v;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return { mean: sum / n, min, max };
}

/** Mean absolute step between neighbouring pixels, across `x` or across the wrap. */
function stepAcross(pattern: Pattern, atColumn: number): number {
  let sum = 0;
  const s = pattern.size;
  for (let y = 0; y < s; y++) {
    sum += Math.abs(levelAt(pattern, atColumn, y) - levelAt(pattern, atColumn + 1, y));
  }
  return sum / s;
}

describe("patternSize", () => {
  it("rounds to a power of two the GPU can mipmap", () => {
    expect(patternSize(256)).toBe(256);
    expect(patternSize(300)).toBe(256);
    expect(patternSize(400)).toBe(512);
    expect(patternSize(0)).toBe(16);
    expect(patternSize(99999)).toBe(1024);
  });
});

describe("the noise fields", () => {
  it("stay in range and are deterministic for a seed", () => {
    const a = noiseField(32, 4, prngFromString("x"));
    const b = noiseField(32, 4, prngFromString("x"));
    expect(Array.from(a)).toEqual(Array.from(b));
    for (const v of a) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("wrap, so the last column runs into the first", () => {
    const field = noiseField(32, 4, prngFromString("wrap"));
    // The step across the seam is no bigger than a step anywhere else.
    let seam = 0;
    let inner = 0;
    for (let y = 0; y < 32; y++) {
      seam += Math.abs(field[y * 32 + 31] - field[y * 32]);
      inner += Math.abs(field[y * 32 + 15] - field[y * 32 + 16]);
    }
    expect(seam).toBeLessThan(inner * 2 + 0.5);
  });

  it("softens grain towards the middle", () => {
    const grain = grainField(32, prngFromString("grain"));
    const mean = grain.reduce((sum, v) => sum + v, 0) / grain.length;
    expect(mean).toBeGreaterThan(0.4);
    expect(mean).toBeLessThan(0.6);
    expect(Math.max(...grain) - Math.min(...grain)).toBeLessThan(0.9);
  });
});

describe.each(Object.entries(ALL))("the %s pattern", (_name, make) => {
  const pattern = make(SIZE);

  it("is a square power-of-two RGBA buffer", () => {
    expect(pattern.size).toBe(SIZE);
    expect(pattern.data.length).toBe(SIZE * SIZE * 4);
  });

  it("is the same every time, so screenshots reproduce", () => {
    expect(Array.from(make(SIZE).data)).toEqual(Array.from(pattern.data));
  });

  it("only ever darkens a little: low contrast, just under white", () => {
    // A multiplier on the material colour: never brighter than the colour
    // itself by more than rounding, and never a photograph's contrast.
    const { mean, min, max } = stats(pattern);
    expect(max).toBeLessThanOrEqual(1);
    expect(mean).toBeGreaterThan(0.88);
    expect(mean).toBeLessThan(1);
    expect(min).toBeGreaterThan(0.7);
  });

  it("tiles without a seam", () => {
    const seam = stepAcross(pattern, SIZE - 1);
    const inner = stepAcross(pattern, SIZE / 2);
    // Pavers have joints, which make any single column spiky; compare with slack.
    expect(seam).toBeLessThan(inner * 2.5 + 0.02);
  });
});

describe("the grass", () => {
  it("mows stripes into the lawn and not into the meadow", () => {
    const lawn = grassPattern(128, { stripes: 4 });
    const meadow = grassPattern(128);
    // Mean of each vertical band of one stripe width: a striped lawn swings
    // between light and dark bands, the meadow does not.
    const bandMeans = (pattern: Pattern) => {
      const out: number[] = [];
      const band = 128 / 8;
      for (let b = 0; b < 8; b++) {
        let sum = 0;
        for (let y = 0; y < 128; y++)
          for (let x = b * band + 4; x < (b + 1) * band - 4; x++) sum += levelAt(pattern, x, y);
        out.push(sum / (128 * (band - 8)));
      }
      return out;
    };
    const swing = (values: number[]) => {
      let total = 0;
      for (let i = 0; i < values.length; i += 2) total += values[i + 1] - values[i];
      return Math.abs(total / (values.length / 2));
    };
    expect(swing(bandMeans(lawn))).toBeGreaterThan(swing(bandMeans(meadow)));
    expect(swing(bandMeans(lawn))).toBeGreaterThan(0.004);
  });

  it("keeps the stripes gentle", () => {
    const { min, max } = stats(grassPattern(128, { stripes: 4 }));
    expect(max - min).toBeLessThan(0.2);
  });

  it("warms the dry patches rather than tinting the whole lawn", () => {
    const pattern = grassPattern(128);
    const red = stats(pattern, 0).mean;
    const blue = stats(pattern, 2).mean;
    expect(red).toBeGreaterThanOrEqual(blue);
    expect(red - blue).toBeLessThan(0.03);
  });
});

describe("the asphalt", () => {
  it("is grey: the road colour comes from the material, not the texture", () => {
    const pattern = asphaltPattern(64);
    for (let i = 0; i < 64 * 64; i++) {
      expect(pattern.data[i * 4]).toBe(pattern.data[i * 4 + 1]);
      expect(pattern.data[i * 4 + 1]).toBe(pattern.data[i * 4 + 2]);
    }
  });

  it("carries a wear mask in alpha that actually varies", () => {
    const { min, max } = stats(asphaltPattern(64), 3);
    expect(max - min).toBeGreaterThan(0.3);
  });
});

describe("the pavers", () => {
  const columns = 4;
  const rows = 8;
  const size = 256;
  const pattern = paverPattern(size, { columns, rows });

  it("draws a darker joint between slabs than at their centres", () => {
    let centres = 0;
    let joints = 0;
    for (let column = 0; column < columns; column++) {
      for (let row = 0; row < rows; row++) {
        const [u, v] = paverCentre(column, row, columns, rows);
        centres += levelAt(pattern, u * size, v * size);
      }
      // The vertical joint on the left edge of this column.
      joints += levelAt(pattern, (column / columns) * size, size * 0.3);
    }
    const centre = centres / (columns * rows);
    const joint = joints / columns;
    expect(joint).toBeLessThan(centre - 0.08);
  });

  it("offsets alternate columns by half a slab, a running bond", () => {
    // A horizontal joint in column 0 sits mid-slab in column 1.
    const slab = size / rows;
    const y = slab * 2;
    const inZero = levelAt(pattern, (0.5 / columns) * size, y);
    const inOne = levelAt(pattern, (1.5 / columns) * size, y);
    expect(inZero).toBeLessThan(inOne - 0.05);
  });

  it("gives every slab its own shade", () => {
    const shades = new Set<number>();
    for (let row = 0; row < rows; row++) {
      const [u, v] = paverCentre(0, row, columns, rows);
      shades.add(Math.round(levelAt(pattern, u * size, v * size) * 255));
    }
    expect(shades.size).toBeGreaterThan(3);
  });
});
