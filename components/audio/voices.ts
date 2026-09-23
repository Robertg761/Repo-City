/**
 * The short sounds: each function here builds one event (a bird's phrase, a
 * cricket's chirps, a clank on a building site) out of oscillators, noise
 * and filters, starts it at `when`, and lets it clean itself up when it
 * ends. `engine.ts` decides when they happen and how loud their layer is.
 *
 * Everything is kept soft on purpose: every voice goes through a low-pass,
 * attacks are never instant (no clicks), and the pitches sit where they
 * carry without piercing. Every choice of pitch, length and pan is drawn
 * from the engine's seeded generator, so no two birds sing the same phrase
 * and nothing repeats on a grid.
 */

import type { Prng } from "@/lib/city/prng";
import type { NoiseBank } from "./buffers";

/** What a voice needs from the engine. */
export interface Kit {
  ctx: BaseAudioContext;
  bank: NoiseBank;
  rng: Prng;
  /** Counts nodes in and out, so the engine can report and cap them. */
  ledger: Ledger;
}

export interface Ledger {
  /** Registers a node as live. */
  track<T extends AudioNode>(node: T): T;
  /**
   * Frees `nodes` when `source` ends: disconnects them and counts them out.
   * Every one-shot voice ends through here.
   */
  release(source: AudioScheduledSourceNode, nodes: AudioNode[], oneShot?: boolean): void;
}

const TINY = 0.0001;

/** A gain envelope: silent, up to `peak` over `attack`, then down to silence by `end`. */
function envelope(param: AudioParam, start: number, attack: number, peak: number, end: number): void {
  param.setValueAtTime(0, start);
  param.linearRampToValueAtTime(peak, start + attack);
  param.exponentialRampToValueAtTime(TINY, Math.max(start + attack + 0.01, end));
  param.linearRampToValueAtTime(0, end + 0.02);
}

function osc(kit: Kit, type: OscillatorType, frequency: number): OscillatorNode {
  const node = kit.ledger.track(kit.ctx.createOscillator());
  node.type = type;
  node.frequency.value = frequency;
  return node;
}

function gain(kit: Kit, value = 0): GainNode {
  const node = kit.ledger.track(kit.ctx.createGain());
  node.gain.value = value;
  return node;
}

function filter(kit: Kit, type: BiquadFilterType, frequency: number, q = 0.7): BiquadFilterNode {
  const node = kit.ledger.track(kit.ctx.createBiquadFilter());
  node.type = type;
  node.frequency.value = frequency;
  node.Q.value = q;
  return node;
}

function panner(kit: Kit, pan: number): StereoPannerNode {
  const node = kit.ledger.track(kit.ctx.createStereoPanner());
  node.pan.value = Math.max(-1, Math.min(1, pan));
  return node;
}

function noise(kit: Kit, buffer: AudioBuffer): AudioBufferSourceNode {
  const node = kit.ledger.track(kit.ctx.createBufferSource());
  node.buffer = buffer;
  node.loop = true;
  return node;
}

/** Starts looped noise somewhere different in its loop each time. */
function startNoise(kit: Kit, node: AudioBufferSourceNode, when: number, end: number): void {
  node.start(when, kit.rng.next() * (node.buffer?.duration ?? 0));
  node.stop(end);
}

/**
 * A bird: a phrase of two to six chirps from one of three songs, somewhere
 * off to one side and at some distance (a further bird is quieter and
 * duller). Returns when it ends.
 */
export function bird(kit: Kit, when: number, dest: AudioNode, level: number): number {
  const { rng } = kit;
  const song = rng.int(0, 2);
  const distance = rng.range(0.35, 1);
  const base = rng.range(2100, 3600);
  const carrier = osc(kit, "sine", base);
  const wobble = osc(kit, "sine", rng.range(28, 70));
  const depth = gain(kit, base * rng.range(0.015, 0.05));
  const amp = gain(kit, 0);
  const tone = filter(kit, "lowpass", 3800 + 2600 * distance, 0.5);
  const out = gain(kit, level * (0.35 + 0.65 * distance));
  const pan = panner(kit, rng.range(-0.85, 0.85));
  wobble.connect(depth).connect(carrier.frequency);
  carrier.connect(amp).connect(tone).connect(out).connect(pan).connect(dest);

  const chirps = rng.int(2, song === 1 ? 7 : 5);
  let t = when;
  for (let i = 0; i < chirps; i++) {
    const length = song === 1 ? rng.range(0.04, 0.07) : rng.range(0.07, 0.14);
    const from = song === 2 ? base * rng.range(1.15, 1.3) : base * rng.range(0.9, 1.05);
    const to = song === 0 ? from * rng.range(1.2, 1.45) : song === 1 ? from * rng.range(0.9, 1.15) : base * rng.range(0.8, 0.95);
    carrier.frequency.setValueAtTime(from, t);
    carrier.frequency.exponentialRampToValueAtTime(to, t + length);
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(1, t + 0.012);
    amp.gain.setTargetAtTime(0, t + length * 0.6, length * 0.2);
    t += length + (song === 1 ? rng.range(0.03, 0.06) : rng.range(0.07, 0.16));
  }
  const end = t + 0.1;
  amp.gain.setValueAtTime(0, end - 0.01);
  carrier.start(when);
  wobble.start(when);
  carrier.stop(end);
  wobble.stop(end);
  kit.ledger.release(carrier, [carrier, wobble, depth, amp, tone, out, pan], true);
  return end;
}

/** The three crickets of the night, each with its own pitch, place and pace. */
const CRICKETS = [
  { pitch: 3950, pan: -0.55, pulses: 3 },
  { pitch: 4300, pan: 0.45, pulses: 4 },
  { pitch: 3700, pan: 0.05, pulses: 3 },
] as const;

/** A cricket: two to four chirps, each a few quick pulses of one soft tone. */
export function cricket(kit: Kit, when: number, dest: AudioNode, level: number): number {
  const { rng } = kit;
  const who = CRICKETS[rng.int(0, CRICKETS.length - 1)];
  const carrier = osc(kit, "sine", who.pitch * rng.range(0.985, 1.015));
  const amp = gain(kit, 0);
  const tone = filter(kit, "lowpass", 5200, 0.5);
  const out = gain(kit, level * rng.range(0.6, 1));
  const pan = panner(kit, who.pan + rng.range(-0.15, 0.15));
  carrier.connect(amp).connect(tone).connect(out).connect(pan).connect(dest);

  const chirps = rng.int(2, 4);
  const gap = rng.range(0.22, 0.34);
  let t = when;
  for (let c = 0; c < chirps; c++) {
    for (let p = 0; p < who.pulses; p++) {
      const at = t + p * 0.034;
      amp.gain.setValueAtTime(0, at);
      amp.gain.linearRampToValueAtTime(1, at + 0.006);
      amp.gain.linearRampToValueAtTime(0, at + 0.022);
    }
    t += gap;
  }
  const end = t;
  carrier.start(when);
  carrier.stop(end);
  kit.ledger.release(carrier, [carrier, amp, tone, out, pan], true);
  return end;
}

/** A car horn a few streets away: two notes a third apart, short, muffled by distance. */
export function horn(kit: Kit, when: number, dest: AudioNode, level: number): number {
  const { rng } = kit;
  const f = rng.range(330, 440);
  const a = osc(kit, "sawtooth", f);
  const b = osc(kit, "sawtooth", f * 1.26);
  const amp = gain(kit, 0);
  const tone = filter(kit, "lowpass", rng.range(700, 1100), 0.6);
  const out = gain(kit, level);
  const pan = panner(kit, rng.range(-0.8, 0.8));
  a.connect(amp);
  b.connect(amp);
  amp.connect(tone).connect(out).connect(pan).connect(dest);

  const beeps = rng.next() < 0.3 ? 2 : 1;
  let t = when;
  for (let i = 0; i < beeps; i++) {
    const length = beeps === 2 ? rng.range(0.12, 0.18) : rng.range(0.25, 0.5);
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(1, t + 0.025);
    amp.gain.setValueAtTime(1, t + length);
    amp.gain.linearRampToValueAtTime(0, t + length + 0.05);
    t += length + 0.12;
  }
  const end = t + 0.05;
  a.start(when);
  b.start(when);
  a.stop(end);
  b.stop(end);
  kit.ledger.release(a, [a, b, amp, tone, out, pan], true);
  return end;
}

/** A car going by in the distance: a swell of road noise that crosses from one side to the other. */
export function carPass(kit: Kit, when: number, dest: AudioNode, level: number): number {
  const { rng } = kit;
  const length = rng.range(4, 7);
  const end = when + length;
  const src = noise(kit, kit.bank.pink);
  const band = filter(kit, "bandpass", 700, 0.9);
  const tone = filter(kit, "lowpass", 1400, 0.5);
  const amp = gain(kit, 0);
  const pan = panner(kit, 0);
  src.connect(band).connect(tone).connect(amp).connect(pan).connect(dest);

  // Approaching, it is higher; going away, lower: a gentle Doppler.
  band.frequency.setValueAtTime(rng.range(650, 850), when);
  band.frequency.linearRampToValueAtTime(rng.range(380, 480), end);
  const peakAt = when + length * rng.range(0.4, 0.6);
  amp.gain.setValueAtTime(0, when);
  amp.gain.linearRampToValueAtTime(level * 0.25, when + length * 0.25);
  amp.gain.linearRampToValueAtTime(level, peakAt);
  amp.gain.linearRampToValueAtTime(level * 0.2, end - length * 0.2);
  amp.gain.linearRampToValueAtTime(0, end);
  const side = rng.next() < 0.5 ? -1 : 1;
  pan.pan.setValueAtTime(-0.7 * side, when);
  pan.pan.linearRampToValueAtTime(0.7 * side, end);
  startNoise(kit, src, when, end);
  kit.ledger.release(src, [src, band, tone, amp, pan], true);
  return end;
}

/** A tractor somewhere across the fields: a low diesel putter that comes and goes. */
export function tractor(kit: Kit, when: number, dest: AudioNode, level: number): number {
  const { rng } = kit;
  const length = rng.range(9, 15);
  const end = when + length;
  const engine = osc(kit, "sawtooth", rng.range(38, 48));
  const firing = osc(kit, "sine", rng.range(9, 12.5));
  const firingDepth = gain(kit, 0.45);
  const putter = gain(kit, 0.55);
  const tone = filter(kit, "lowpass", 240, 0.8);
  const amp = gain(kit, 0);
  const pan = panner(kit, 0);
  firing.connect(firingDepth).connect(putter.gain);
  engine.connect(putter).connect(tone).connect(amp).connect(pan).connect(dest);

  amp.gain.setValueAtTime(0, when);
  amp.gain.linearRampToValueAtTime(level, when + length * 0.35);
  amp.gain.setValueAtTime(level, when + length * 0.6);
  amp.gain.linearRampToValueAtTime(0, end);
  const from = rng.range(-0.8, 0.8);
  pan.pan.setValueAtTime(from, when);
  pan.pan.linearRampToValueAtTime(Math.max(-0.8, Math.min(0.8, from + rng.range(-0.6, 0.6))), end);
  engine.start(when);
  firing.start(when);
  engine.stop(end);
  firing.stop(end);
  kit.ledger.release(engine, [engine, firing, firingDepth, putter, tone, amp, pan], true);
  return end;
}

/** A sheep or, less often, a cow, a field or two away. */
export function livestock(kit: Kit, when: number, dest: AudioNode, level: number): number {
  const { rng } = kit;
  const cow = rng.next() < 0.3;
  const length = cow ? rng.range(1.1, 1.6) : rng.range(0.55, 0.8);
  const end = when + length + 0.1;
  const f = cow ? rng.range(105, 125) : rng.range(290, 360);
  const voice = osc(kit, "sawtooth", f);
  const vibrato = osc(kit, "sine", cow ? 4 : rng.range(5.5, 7));
  const vibratoDepth = gain(kit, cow ? 1.5 : f * 0.03);
  const formant = filter(kit, "bandpass", cow ? 420 : 950, cow ? 2 : 3);
  const tone = filter(kit, "lowpass", cow ? 700 : 1500, 0.6);
  const amp = gain(kit, 0);
  const pan = panner(kit, rng.range(-0.75, 0.75));
  vibrato.connect(vibratoDepth).connect(voice.frequency);
  voice.connect(formant).connect(tone).connect(amp).connect(pan).connect(dest);

  voice.frequency.setValueAtTime(f, when);
  voice.frequency.linearRampToValueAtTime(f * (cow ? 0.86 : 0.93), when + length);
  amp.gain.setValueAtTime(0, when);
  amp.gain.linearRampToValueAtTime(level, when + (cow ? 0.3 : 0.08));
  amp.gain.setValueAtTime(level, when + length * 0.7);
  amp.gain.linearRampToValueAtTime(0, when + length);
  voice.start(when);
  vibrato.start(when);
  voice.stop(end);
  vibrato.stop(end);
  kit.ledger.release(voice, [voice, vibrato, vibratoDepth, formant, tone, amp, pan], true);
  return end;
}

/** Steel on steel on a building site: a knock of filtered noise and a short metallic ring. */
export function clank(kit: Kit, when: number, dest: AudioNode, level: number): number {
  const { rng } = kit;
  const pitch = rng.range(0.85, 1.2);
  const end = when + 0.5;
  const knock = noise(kit, kit.bank.pink);
  const knockBand = filter(kit, "bandpass", 1900 * pitch, 5);
  const knockAmp = gain(kit, 0);
  const ringA = osc(kit, "sine", 840 * pitch);
  const ringB = osc(kit, "sine", 1310 * pitch * rng.range(0.98, 1.02));
  const ringAmp = gain(kit, 0);
  const tone = filter(kit, "lowpass", 3200, 0.5);
  const out = gain(kit, level * rng.range(0.6, 1));
  knock.connect(knockBand).connect(knockAmp).connect(tone);
  ringA.connect(ringAmp);
  ringB.connect(ringAmp);
  ringAmp.connect(tone);
  tone.connect(out).connect(dest);

  envelope(knockAmp.gain, when, 0.003, 1.6, when + 0.05);
  envelope(ringAmp.gain, when, 0.004, 0.22, when + rng.range(0.25, 0.42));
  startNoise(kit, knock, when, end);
  ringA.start(when);
  ringB.start(when);
  ringA.stop(end);
  ringB.stop(end);
  kit.ledger.release(ringA, [knock, knockBand, knockAmp, ringA, ringB, ringAmp, tone, out], true);
  return end;
}

/** A siren a few streets off: a soft rise and fall, twice, muffled. */
export function siren(kit: Kit, when: number, dest: AudioNode, level: number): number {
  const { rng } = kit;
  const cycle = rng.range(2.2, 2.8);
  const cycles = 2;
  const end = when + cycle * cycles + 0.6;
  const low = rng.range(560, 620);
  const high = low * 1.45;
  const voice = osc(kit, "triangle", low);
  const tone = filter(kit, "lowpass", 1300, 0.5);
  const amp = gain(kit, 0);
  voice.connect(tone).connect(amp).connect(dest);
  for (let i = 0; i < cycles; i++) {
    const t = when + i * cycle;
    voice.frequency.setValueAtTime(low, t);
    voice.frequency.linearRampToValueAtTime(high, t + cycle * 0.5);
    voice.frequency.linearRampToValueAtTime(low, t + cycle);
  }
  amp.gain.setValueAtTime(0, when);
  amp.gain.linearRampToValueAtTime(level, when + 1.2);
  amp.gain.setValueAtTime(level, end - 1.4);
  amp.gain.linearRampToValueAtTime(0, end);
  voice.start(when);
  voice.stop(end);
  kit.ledger.release(voice, [voice, tone, amp], true);
  return end;
}

/** The station's arrival chime: two soft bell notes, falling a third. */
export function chime(kit: Kit, when: number, dest: AudioNode, level: number): number {
  const notes = [659.25, 523.25];
  const end = when + 0.5 * notes.length + 1.8;
  const out = gain(kit, level);
  const tone = filter(kit, "lowpass", 3000, 0.5);
  tone.connect(out).connect(dest);
  const nodes: AudioNode[] = [out, tone];
  const oscillators: OscillatorNode[] = [];
  notes.forEach((f, i) => {
    const t = when + i * 0.5;
    // A bell: the fundamental and two quieter, faster-dying inharmonic partials.
    for (const [ratio, weight, decay] of [
      [1, 1, 1.6],
      [2.76, 0.28, 0.7],
      [5.4, 0.08, 0.35],
    ] as const) {
      const partial = osc(kit, "sine", f * ratio);
      const amp = gain(kit, 0);
      partial.connect(amp).connect(tone);
      envelope(amp.gain, t, 0.008, weight, t + decay);
      partial.start(t);
      partial.stop(end);
      oscillators.push(partial);
      nodes.push(partial, amp);
    }
  });
  kit.ledger.release(oscillators[oscillators.length - 1], nodes, true);
  return end;
}
