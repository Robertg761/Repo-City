import { describe, expect, it } from "vitest";
import { mixFor, type Mix, type MixScene } from "@/lib/client/audioMix";
import type { NearSource, SoundSource } from "@/lib/client/audioSources";
import { MAX_ONE_SHOTS, Soundscape, type Frame } from "./engine";
import { safetyCurve } from "./buffers";

// --- A Web Audio stand-in: enough of the API to build the graph, count the
// nodes, and play sources to their end. ---------------------------------

class FakeParam {
  value: number;
  calls = 0;
  constructor(value = 0) {
    this.value = value;
  }
  private record(value?: number) {
    this.calls++;
    if (value !== undefined) this.value = value;
    return this;
  }
  setValueAtTime(v: number) {
    return this.record(v);
  }
  linearRampToValueAtTime(v: number) {
    return this.record(v);
  }
  exponentialRampToValueAtTime(v: number) {
    return this.record(v);
  }
  setTargetAtTime(v: number) {
    return this.record(v);
  }
  cancelScheduledValues() {
    return this.record();
  }
}

class FakeNode {
  readonly ctx: FakeContext;
  readonly kind: string;
  outputs = new Set<unknown>();
  disconnected = false;
  constructor(ctx: FakeContext, kind: string) {
    this.ctx = ctx;
    this.kind = kind;
    ctx.made.push(this);
  }
  connect<T>(target: T): T {
    this.outputs.add(target);
    return target;
  }
  disconnect() {
    this.outputs.clear();
    this.disconnected = true;
  }
}

class FakeSource extends FakeNode {
  startAt: number | null = null;
  stopAt: number | null = null;
  ended = false;
  onended: (() => void) | null = null;
  start(when = 0) {
    if (this.startAt !== null) throw new Error("started twice");
    this.startAt = when;
  }
  stop(when = 0) {
    if (this.startAt === null) throw new Error("stopped before start");
    this.stopAt = when;
  }
}

class FakeContext {
  currentTime = 0;
  sampleRate = 4000;
  made: FakeNode[] = [];
  destination = { connect: () => undefined };
  listener = Object.fromEntries(
    ["positionX", "positionY", "positionZ", "forwardX", "forwardY", "forwardZ", "upX", "upY", "upZ"].map((k) => [
      k,
      new FakeParam(),
    ]),
  );
  createGain() {
    return Object.assign(new FakeNode(this, "gain"), { gain: new FakeParam(1) });
  }
  createBiquadFilter() {
    return Object.assign(new FakeNode(this, "filter"), {
      type: "lowpass",
      frequency: new FakeParam(350),
      Q: new FakeParam(1),
    });
  }
  createStereoPanner() {
    return Object.assign(new FakeNode(this, "stereo"), { pan: new FakeParam(0) });
  }
  createPanner() {
    return Object.assign(new FakeNode(this, "panner"), {
      positionX: new FakeParam(),
      positionY: new FakeParam(),
      positionZ: new FakeParam(),
    });
  }
  createWaveShaper() {
    return Object.assign(new FakeNode(this, "shaper"), { curve: null });
  }
  createOscillator() {
    return Object.assign(new FakeSource(this, "osc"), { type: "sine", frequency: new FakeParam(440) });
  }
  createBufferSource() {
    return Object.assign(new FakeSource(this, "buffer"), { buffer: null, loop: false });
  }
  createConstantSource() {
    return Object.assign(new FakeSource(this, "constant"), { offset: new FakeParam(1) });
  }
  createBuffer(channels: number, length: number, rate: number) {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return { duration: length / rate, numberOfChannels: channels, getChannelData: (c: number) => data[c] };
  }
  /** Moves the clock on and ends every source whose stop time has come. */
  advance(to: number) {
    this.currentTime = to;
    for (const node of this.made) {
      if (node instanceof FakeSource && !node.ended && node.stopAt !== null && node.stopAt <= to) {
        node.ended = true;
        node.onended?.();
      }
    }
  }
  sources() {
    return this.made.filter((n): n is FakeSource => n instanceof FakeSource);
  }
}

const scene = (over: Partial<MixScene> = {}): MixScene => ({
  tier: "metropolis",
  phase: 1,
  health: 90,
  activity: 0.9,
  archived: false,
  traffic: 1,
  ...over,
});

const source = (id: string, kind: SoundSource["kind"], x: number, extra: Partial<SoundSource> = {}): NearSource => ({
  source: { id, kind, position: [x, 0, 0], level: 1, ...extra },
  distance: Math.abs(x),
});

const frame = (mix: Mix, local: NearSource[] = [], clock: number | null = null): Frame => ({
  mix,
  local,
  pose: { position: [0, 10, 10], forward: [0, -0.7, -0.7], up: [0, 0.7, -0.7] },
  clock,
});

function setup(seed = 3) {
  const ctx = new FakeContext();
  const engine = new Soundscape(ctx as unknown as BaseAudioContext, { seed });
  return { ctx, engine };
}

/** Runs the engine the way `live.ts` does, a tick every quarter second. */
function run(ctx: FakeContext, engine: Soundscape, f: Frame, from: number, seconds: number) {
  for (let t = from; t < from + seconds; t += 0.25) {
    ctx.advance(t);
    engine.update({ ...f, clock: f.clock === null ? null : t });
    engine.schedule(t + 0.6);
  }
}

describe("Soundscape", () => {
  it("builds its beds and master chain once, and counts them", () => {
    const { ctx, engine } = setup();
    const stats = engine.stats();
    expect(stats.liveNodes).toBe(ctx.made.length);
    expect(stats.liveNodes).toBeGreaterThan(10);
    expect(stats.oneShots).toBe(0);
    // Three looped beds and their slow modulators, all running.
    expect(ctx.sources().every((s) => s.startAt !== null)).toBe(true);
  });

  it("fires events at the mix's rates, never more than the voice budget at once", () => {
    const { ctx, engine } = setup();
    const busy: Mix = mixFor(scene({ tier: "village", phase: 0 }), 1);
    busy.events.birds.rate = 50; // far past the cap
    run(ctx, engine, frame(busy), 0, 0.25);
    expect(engine.stats().oneShots).toBeLessThanOrEqual(MAX_ONE_SHOTS);
    expect(engine.stats().events.birds).toBeGreaterThan(0);
  });

  it("lets every short voice go when it ends", () => {
    const { ctx, engine } = setup();
    const baseline = engine.stats().liveNodes;
    run(ctx, engine, frame(mixFor(scene({ tier: "village", phase: 0 }), 1)), 0, 20);
    expect(engine.stats().events.birds).toBeGreaterThan(5);
    // Silence every layer and let everything play out.
    const silent = mixFor(scene({ tier: "village", phase: 0, archived: true }), 1);
    for (const layer of Object.keys(silent.events) as (keyof Mix["events"])[]) silent.events[layer] = { gain: 0, rate: 0 };
    run(ctx, engine, frame(silent), 20, 30);
    expect(engine.stats().oneShots).toBe(0);
    expect(engine.stats().liveNodes).toBe(baseline);
  });

  it("follows the chosen local sources, and releases the ones left behind", () => {
    const { ctx, engine } = setup();
    const baseline = engine.stats().liveNodes;
    const near = mixFor(scene(), 0);
    run(ctx, engine, frame(near, [source("fire", "fire", 5), source("power", "power", 9)]), 0, 1);
    expect(engine.stats().localIds.sort()).toEqual(["fire", "power"]);

    // A new city: other sources, the old voices fade and go.
    run(ctx, engine, frame(near, [source("crane", "crane", 4)]), 1, 4);
    expect(engine.stats().localIds).toEqual(["crane"]);

    // Up to the overview: no local voice at all.
    const high = mixFor(scene(), 1);
    for (const layer of Object.keys(high.events) as (keyof Mix["events"])[]) high.events[layer] = { gain: 0, rate: 0 };
    run(ctx, engine, frame(high, [source("crane", "crane", 4)]), 5, 10);
    expect(engine.stats().locals).toBe(0);
    expect(engine.stats().oneShots).toBe(0);
    expect(engine.stats().liveNodes).toBe(baseline);
  });

  it("clanks at a crane", () => {
    const { ctx, engine } = setup();
    run(ctx, engine, frame(mixFor(scene(), 0), [source("crane", "crane", 4)]), 0, 20);
    expect(engine.stats().events.clank).toBeGreaterThan(2);
  });

  it("chimes when the station's train pulls in, and not at every train on a busy line", () => {
    const { ctx, engine } = setup();
    // Six trains a minute: an arrival every ten seconds.
    run(ctx, engine, frame(mixFor(scene(), 0), [source("station", "station", 4, { trainsPerMinute: 6 })], 0), 0, 60);
    const chimes = engine.stats().events.chime ?? 0;
    expect(chimes).toBeGreaterThanOrEqual(2);
    expect(chimes).toBeLessThanOrEqual(4);
  });

  it("places the listener at the camera", () => {
    const { ctx, engine } = setup();
    engine.update(frame(mixFor(scene(), 0)), true);
    expect((ctx.listener.positionY as FakeParam).value).toBe(10);
    expect((ctx.listener.forwardZ as FakeParam).value).toBeCloseTo(-0.7);
  });

  it("disposes of everything at once", () => {
    const { ctx, engine } = setup();
    run(ctx, engine, frame(mixFor(scene({ phase: 0 }), 0), [source("fire", "fire", 5)]), 0, 3);
    engine.dispose();
    expect(engine.stats().liveNodes).toBe(0);
    expect(engine.stats().oneShots).toBe(0);
    expect(ctx.made.every((n) => n.disconnected)).toBe(true);
    // A disposed engine ignores further frames.
    const before = ctx.made.length;
    run(ctx, engine, frame(mixFor(scene({ phase: 0 }), 0), [source("fire", "fire", 5)]), 3, 2);
    expect(ctx.made.length).toBe(before);
  });
});

describe("safetyCurve", () => {
  it("never passes -3 dBFS and leaves quiet signals alone", () => {
    const curve = safetyCurve();
    const ceiling = 10 ** (-3 / 20);
    expect(Math.max(...curve.map(Math.abs))).toBeLessThan(ceiling);
    // An input of 0.05 (-26 dBFS) comes out within a twentieth of a decibel.
    const index = Math.round(((0.05 + 1) / 2) * (curve.length - 1));
    const x = (index / (curve.length - 1)) * 2 - 1;
    expect(Math.abs(20 * Math.log10(curve[index] / x))).toBeLessThan(0.05);
  });
});
