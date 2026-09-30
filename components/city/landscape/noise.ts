/**
 * Deterministic value noise for the landscape (`plan.ts`). Integer hashing
 * only: the same seed gives the same land in node and in the browser, and
 * nothing here reads a clock or `Math.random()`.
 */

import { hashString } from "@/lib/city/prng";

/** A small integer seed from a string. */
export function seedInt(text: string): number {
  return hashString(text) % 2147483647;
}

/** Uniform in [0, 1) for an integer lattice point. */
export function hash01(ix: number, iy: number, seed: number): number {
  let h = Math.imul(ix | 0, 374761393) ^ Math.imul(iy | 0, 668265263) ^ Math.imul(seed | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export const smooth01 = (t: number): number => {
  const k = t < 0 ? 0 : t > 1 ? 1 : t;
  return k * k * (3 - 2 * k);
};

/** Smooth value noise in [0, 1]. One lattice cell per unit. */
export function valueNoise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const a = hash01(ix, iy, seed);
  const b = hash01(ix + 1, iy, seed);
  const c = hash01(ix, iy + 1, seed);
  const d = hash01(ix + 1, iy + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Fractal value noise in [0, 1]: each octave twice as fine and half as strong. */
export function fbm(x: number, y: number, seed: number, octaves = 3): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let fx = x;
  let fy = y;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise(fx, fy, seed + i * 101) * amp;
    norm += amp;
    amp *= 0.5;
    fx *= 2.03;
    fy *= 2.03;
  }
  return sum / norm;
}
