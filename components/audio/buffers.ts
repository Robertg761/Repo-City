/**
 * The soundscape's raw material: a few seconds of noise, made once per audio
 * context from a seeded generator and looped. Everything continuous in the
 * city (wind, the traffic hum, the rumble, a fire's crackle) is one of these
 * through a filter; nothing is downloaded (the art direction is procedural,
 * and so is the sound).
 *
 * Each buffer's end is crossfaded into its start, so the loop has no seam
 * to click on, and the two channels are independent noise, so a bed is wide
 * rather than a point in the middle of the head.
 */

import { mulberry32, type Prng } from "@/lib/city/prng";

export interface NoiseBank {
  /** Pink noise (equal energy per octave): hum, passing cars. */
  pink: AudioBuffer;
  /** Brown noise (steeper still): wind and rumble. */
  brown: AudioBuffer;
  /** Sparse pops with short tails: a fire's crackle. */
  crackle: AudioBuffer;
}

/** Long enough that no one hears the loop, short enough to make in a few milliseconds. */
const LOOP_SECONDS = 5;
const FADE_SECONDS = 0.25;

type Fill = (out: Float32Array, rng: Prng) => void;

/** Paul Kellet's economy pink filter over white noise, normalised to about ±0.5. */
const fillPink: Fill = (out, rng) => {
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  for (let i = 0; i < out.length; i++) {
    const white = rng.next() * 2 - 1;
    b0 = 0.99765 * b0 + white * 0.099046;
    b1 = 0.963 * b1 + white * 0.2965164;
    b2 = 0.57 * b2 + white * 1.0526913;
    out[i] = (b0 + b1 + b2 + white * 0.1848) * 0.11;
  }
};

/** Integrated white noise with a leak, so it wanders but never drifts off. */
const fillBrown: Fill = (out, rng) => {
  let last = 0;
  for (let i = 0; i < out.length; i++) {
    const white = rng.next() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    out[i] = last * 3.2;
  }
};

/** Pops: a few dozen a second, each a decaying burst of noise, of random size. */
const fillCrackle = (sampleRate: number): Fill => (out, rng) => {
  out.fill(0);
  const perSecond = 38;
  const count = Math.round((out.length / sampleRate) * perSecond);
  for (let k = 0; k < count; k++) {
    const at = Math.floor(rng.next() * out.length);
    const size = rng.next() ** 3 * 0.9 + 0.05;
    const tail = Math.floor(sampleRate * (0.002 + rng.next() * 0.012));
    for (let j = 0; j < tail && at + j < out.length; j++) {
      out[at + j] += (rng.next() * 2 - 1) * size * Math.exp((-5 * j) / tail);
    }
  }
};

/**
 * A looping stereo buffer: `LOOP_SECONDS` of `fill`, with the extra
 * `FADE_SECONDS` generated past the end folded back over the start.
 */
function loopBuffer(ctx: BaseAudioContext, seed: number, fill: Fill, channels = 2): AudioBuffer {
  const rate = ctx.sampleRate;
  const length = Math.floor(LOOP_SECONDS * rate);
  const fade = Math.floor(FADE_SECONDS * rate);
  const buffer = ctx.createBuffer(channels, length, rate);
  const scratch = new Float32Array(length + fade);
  for (let c = 0; c < channels; c++) {
    fill(scratch, mulberry32(seed + c * 7919));
    const out = buffer.getChannelData(c);
    for (let i = 0; i < length; i++) out[i] = scratch[i];
    // The last `fade` samples lead into what would have come next; blend
    // that continuation over the start so the wrap is continuous.
    for (let i = 0; i < fade; i++) {
      const k = i / fade;
      out[i] = scratch[length + i] * (1 - k) + scratch[i] * k;
    }
  }
  return buffer;
}

const banks = new WeakMap<BaseAudioContext, NoiseBank>();

/** The context's noise, made on first use. */
export function noiseBank(ctx: BaseAudioContext, seed = 1): NoiseBank {
  const cached = banks.get(ctx);
  if (cached) return cached;
  const bank: NoiseBank = {
    pink: loopBuffer(ctx, seed, fillPink),
    brown: loopBuffer(ctx, seed + 101, fillBrown),
    crackle: loopBuffer(ctx, seed + 202, fillCrackle(ctx.sampleRate), 1),
  };
  banks.set(ctx, bank);
  return bank;
}

/**
 * A curve for the final `WaveShaperNode`: straight through for anything
 * quiet, and a smooth shoulder that can never pass `ceiling` for anything
 * that is not. The soundscape is mixed to sit well under it; this is the
 * guarantee that no stack of chance events can clip.
 */
export function safetyCurve(ceiling = 0.7, points = 1024): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(points);
  for (let i = 0; i < points; i++) {
    const x = (i / (points - 1)) * 2 - 1;
    curve[i] = ceiling * Math.tanh(x / ceiling);
  }
  return curve;
}
