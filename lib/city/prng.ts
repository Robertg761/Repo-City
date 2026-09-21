/**
 * Deterministic pseudo-random numbers for city generation (PLAN.md section 35).
 *
 * Same repository revision -> same seed string -> byte-identical city. Nothing
 * in here may call `Math.random()`, `Date.now()`, or read any global state.
 */

/**
 * cyrb53: a fast, well-distributed 53-bit string hash by bryc (public domain).
 * Returns a non-negative integer below 2^53.
 */
export function hashString(input: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/** A seeded random source. Every method advances the same internal state. */
export interface Prng {
  /** Uniform in [0, 1). */
  next(): number;
  /** Uniform float in [min, max). */
  range(min: number, max: number): number;
  /** Uniform integer in [min, max] inclusive. */
  int(min: number, max: number): number;
  /** Uniform element of `arr`. Throws on an empty array. */
  pick<T>(arr: readonly T[]): T;
}

/**
 * mulberry32: 32-bit state, period 2^32, good enough for cosmetic variation
 * and cheap enough to call tens of thousands of times during layout.
 */
export function mulberry32(seed: number): Prng {
  let state = seed >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const range = (min: number, max: number): number => min + next() * (max - min);

  const int = (min: number, max: number): number => {
    const lo = Math.ceil(min);
    const hi = Math.floor(max);
    if (hi < lo) return lo;
    return lo + Math.floor(next() * (hi - lo + 1));
  };

  const pick = <T,>(arr: readonly T[]): T => {
    if (arr.length === 0) throw new Error("prng.pick: cannot pick from an empty array");
    return arr[int(0, arr.length - 1)];
  };

  return { next, range, int, pick };
}

/** Convenience: hash a string and return the PRNG seeded from it. */
export function prngFromString(input: string): Prng {
  return mulberry32(hashString(input));
}
