/**
 * THE SOUNDSCAPE ENGINE: one Web Audio graph that plays whatever mix
 * `lib/client/audioMix.ts` asks for.
 *
 *   beds      wind, traffic hum and a low rumble: looped noise through
 *             filters, each on its own gain, always running, crossfaded
 *   events    birds, crickets, horns, a passing car, a tractor, a sheep:
 *             short voices (`voices.ts`) fired at random on a seeded
 *             Poisson clock, each layer on its own gain
 *   local     the nearest few fires, cranes and landmarks, each on a
 *             `PannerNode` at its place in the city, heard from the camera
 *
 * All three meet on one bus, then the master volume, the fade (for the
 * switch and for a hidden tab), and a soft safety shaper that can never
 * pass -4 dBFS, whatever piles up.
 *
 * The engine knows nothing of React, the store or three.js: `live.ts` feeds
 * it a `Frame` a few times a second, and `offline.ts` feeds the same frames
 * to an `OfflineAudioContext` to measure levels. Every change of mix is a
 * `setTargetAtTime` glide, so nothing ever jumps.
 *
 * VOICE BUDGET. At most `MAX_ONE_SHOTS` short voices sound at once (an
 * event past that is dropped, not queued) and at most `MAX_LOCAL_SOURCES`
 * local sources. Every node the engine makes is counted in and out, so the
 * live count is observable (`stats()`) and a city reload can be seen to
 * clean up after itself.
 */

import { mulberry32, type Prng } from "@/lib/city/prng";
import {
  BED_LAYERS,
  EVENT_LAYERS,
  MAX_EVENT_RATE,
  type BedLayer,
  type EventLayer,
  type Mix,
} from "@/lib/client/audioMix";
import { nextTrainArrival, type NearSource, type SourceKind } from "@/lib/client/audioSources";
import type { Vec3 } from "@/types/city";
import { noiseBank, safetyCurve, type NoiseBank } from "./buffers";
import * as voices from "./voices";
import type { Kit, Ledger } from "./voices";

/**
 * How loud each layer is at a mix gain of 1 and full volume. Balanced by ear
 * on paper and by meter in `scripts/audio-levels.ts` (the table is in the
 * branch's report): beds sit around -30 to -24 dBFS RMS, events peak well
 * under the -3 dBFS ceiling.
 */
export const LEVELS: Record<BedLayer | EventLayer, number> & Record<string, number> = {
  wind: 0.22,
  hum: 0.4,
  rumble: 0.26,
  birds: 0.11,
  crickets: 0.035,
  horns: 0.035,
  cars: 0.22,
  tractor: 0.12,
  livestock: 0.15,
  // Local sources, before distance.
  crackle: 0.22,
  roar: 0.24,
  siren: 0.04,
  clank: 0.16,
  mains: 0.055,
  fan: 0.08,
  chime: 0.14,
};

/**
 * The bus's gain into the master volume: the layers above are balanced
 * against each other, and this sets the whole soundscape's loudness.
 */
export const MAKEUP = 1.6;

/** The most short voices at once. */
export const MAX_ONE_SHOTS = 12;
/** How far ahead `schedule` is asked to look, in seconds. */
export const LOOKAHEAD = 0.6;
/** How fast the mix glides to a new target (time constant, seconds). */
export const GLIDE = 0.7;

/** Never two events of a layer closer than this, in seconds. */
const MIN_GAP: Record<EventLayer, number> = {
  birds: 0.35,
  crickets: 0.4,
  horns: 5,
  cars: 5,
  tractor: 20,
  livestock: 25,
};

const SYNTHS: Record<EventLayer, (kit: Kit, when: number, dest: AudioNode, level: number) => number> = {
  birds: voices.bird,
  crickets: voices.cricket,
  horns: voices.horn,
  cars: voices.carPass,
  tractor: voices.tractor,
  livestock: voices.livestock,
};

/** Where the camera is: the listener. */
export interface Pose {
  position: Vec3;
  forward: Vec3;
  up: Vec3;
}

/** Everything the engine needs to know, a few times a second. */
export interface Frame {
  mix: Mix;
  /** The local sources to voice, from `nearestSources`. */
  local: readonly NearSource[];
  pose: Pose | null;
  /** The renderer's clock in seconds (R3F's `clock.elapsedTime`), for the station timetable. */
  clock: number | null;
}

export interface EngineStats {
  /** Nodes created and not yet released. */
  liveNodes: number;
  /** Nodes created since the engine started. */
  createdNodes: number;
  oneShots: number;
  locals: number;
  localIds: string[];
  /** Events fired since the engine started, by layer, and the local ones by sound. */
  events: Record<string, number>;
}

interface Voice {
  nodes: AudioNode[];
  sources: AudioScheduledSourceNode[];
  oneShot: boolean;
}

interface LocalVoice {
  id: string;
  kind: SourceKind;
  bus: GainNode;
  panner: PannerNode;
  /** The next clank or siren, in context time. */
  next: number;
  /** Station: the last arrival seen, and the last one chimed (renderer clock). */
  lastArrival: number;
  lastChime: number;
  level: number;
  trainsPerMinute: number;
  /** Everything that runs in the voice; stopping them all ends it. */
  sources: AudioScheduledSourceNode[];
}

/** A gap drawn from an exponential with mean `1 / rate`, never below `min`. */
function gap(rng: Prng, rate: number, min: number): number {
  const mean = Math.max(min, 1 / rate);
  return min + -Math.log(1 - rng.next() * 0.999) * (mean - min * 0.5);
}

export class Soundscape implements Ledger {
  readonly ctx: BaseAudioContext;
  private readonly rng: Prng;
  private readonly bank: NoiseBank;
  private readonly kit: Kit;

  private readonly bus: GainNode;
  private readonly volume: GainNode;
  private readonly fader: GainNode;
  private readonly beds: Record<BedLayer, GainNode>;
  private readonly eventBus: Record<EventLayer, GainNode>;
  private readonly localBus: GainNode;

  private readonly persistent: AudioNode[] = [];
  private readonly persistentSources: AudioScheduledSourceNode[] = [];
  private readonly active = new Set<Voice>();
  private readonly locals = new Map<string, LocalVoice>();

  private rates: Record<EventLayer, number>;
  private nextEvent: Partial<Record<EventLayer, number>> = {};
  private drawnAt: Partial<Record<EventLayer, number>> = {};
  private clockAt: { clock: number; audio: number } | null = null;

  private live = 0;
  private created = 0;
  private oneShots = 0;
  private disposed = false;
  private fired: Record<string, number> = {};

  constructor(ctx: BaseAudioContext, { seed = 1, destination }: { seed?: number; destination?: AudioNode } = {}) {
    this.ctx = ctx;
    this.rng = mulberry32(seed);
    this.bank = noiseBank(ctx, seed);
    this.kit = { ctx, bank: this.bank, rng: this.rng, ledger: this };
    this.rates = Object.fromEntries(EVENT_LAYERS.map((layer) => [layer, 0])) as Record<EventLayer, number>;

    // The master chain.
    this.bus = this.keep(ctx.createGain());
    this.bus.gain.value = MAKEUP;
    this.volume = this.keep(ctx.createGain());
    this.fader = this.keep(ctx.createGain());
    this.fader.gain.value = 0;
    const shaper = this.keep(ctx.createWaveShaper());
    shaper.curve = safetyCurve();
    this.bus.connect(this.volume).connect(this.fader).connect(shaper).connect(destination ?? ctx.destination);

    this.beds = {
      wind: this.buildWind(),
      hum: this.buildHum(),
      rumble: this.buildRumble(),
    };
    this.eventBus = Object.fromEntries(
      EVENT_LAYERS.map((layer) => {
        const node = this.keep(ctx.createGain());
        node.gain.value = 0;
        node.connect(this.bus);
        return [layer, node];
      }),
    ) as Record<EventLayer, GainNode>;
    this.localBus = this.keep(ctx.createGain());
    this.localBus.gain.value = 0;
    this.localBus.connect(this.bus);
  }

  // --- Ledger -------------------------------------------------------------

  track<T extends AudioNode>(node: T): T {
    this.live++;
    this.created++;
    return node;
  }

  release(source: AudioScheduledSourceNode, nodes: AudioNode[], oneShot = true): void {
    const voice: Voice = { nodes, sources: [source], oneShot };
    this.active.add(voice);
    if (oneShot) this.oneShots++;
    source.onended = () => this.free(voice);
  }

  private free(voice: Voice): void {
    if (!this.active.delete(voice)) return;
    for (const node of voice.nodes) {
      try {
        node.disconnect();
      } catch {
        /* already gone */
      }
    }
    this.live -= voice.nodes.length;
    if (voice.oneShot) this.oneShots--;
  }

  private keep<T extends AudioNode>(node: T): T {
    this.persistent.push(this.track(node));
    return node;
  }

  // --- Beds ---------------------------------------------------------------

  private loop(buffer: AudioBuffer): AudioBufferSourceNode {
    const src = this.keep(this.ctx.createBufferSource());
    src.buffer = buffer;
    src.loop = true;
    src.start(0, this.rng.next() * buffer.duration);
    this.persistentSources.push(src);
    return src;
  }

  private lfo(frequency: number, depth: number, target: AudioParam): void {
    const osc = this.keep(this.ctx.createOscillator());
    osc.frequency.value = frequency;
    const amount = this.keep(this.ctx.createGain());
    amount.gain.value = depth;
    osc.connect(amount).connect(target);
    osc.start(0);
    this.persistentSources.push(osc);
  }

  private filter(type: BiquadFilterType, frequency: number, q = 0.7): BiquadFilterNode {
    const node = this.keep(this.ctx.createBiquadFilter());
    node.type = type;
    node.frequency.value = frequency;
    node.Q.value = q;
    return node;
  }

  private bedGain(): GainNode {
    const node = this.keep(this.ctx.createGain());
    node.gain.value = 0;
    node.connect(this.bus);
    return node;
  }

  /** Wind: brown noise, low-passed, in slow uneven gusts. */
  private buildWind(): GainNode {
    const out = this.bedGain();
    const tone = this.filter("lowpass", 520, 0.6);
    const gust = this.keep(this.ctx.createGain());
    gust.gain.value = 0.78;
    this.loop(this.bank.brown).connect(tone).connect(gust).connect(out);
    // Two slow swells at unrelated rates, so the gusts never fall into a pattern.
    this.lfo(0.071, 0.14, gust.gain);
    this.lfo(0.029, 0.08, gust.gain);
    this.lfo(0.053, 170, tone.frequency);
    return out;
  }

  /** The traffic hum: pink noise, low and warm, drifting a little. */
  private buildHum(): GainNode {
    const out = this.bedGain();
    const low = this.filter("highpass", 45);
    const tone = this.filter("lowpass", 300, 0.5);
    this.loop(this.bank.pink).connect(low).connect(tone).connect(out);
    this.lfo(0.043, 45, tone.frequency);
    return out;
  }

  /** The rumble of a big place: brown noise below 120 Hz. */
  private buildRumble(): GainNode {
    const out = this.bedGain();
    const tone = this.filter("lowpass", 120, 0.6);
    const low = this.filter("highpass", 28);
    this.loop(this.bank.brown).connect(tone).connect(low).connect(out);
    return out;
  }

  // --- Mix ----------------------------------------------------------------

  private glide(param: AudioParam, value: number, immediate: boolean, tau = GLIDE): void {
    const now = this.ctx.currentTime;
    if (immediate) {
      param.cancelScheduledValues(now);
      param.setValueAtTime(value, now);
    } else {
      param.setTargetAtTime(value, now, tau);
    }
  }

  /** Master volume, 0..1, on a gentle curve (half the slider is about -12 dB). */
  setVolume(volume: number, immediate = false): void {
    const v = Math.max(0, Math.min(1, volume));
    this.glide(this.volume.gain, v * v, immediate, 0.08);
  }

  /** Fades the whole soundscape to `level` (0 or 1) over about `seconds`. */
  fade(level: number, seconds: number): void {
    const now = this.ctx.currentTime;
    const param = this.fader.gain;
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    param.linearRampToValueAtTime(level, now + Math.max(0.01, seconds));
  }

  /** Takes a new frame: every gain glides to it, and the local voices follow the camera. */
  update(frame: Frame, immediate = false): void {
    if (this.disposed) return;
    const { mix } = frame;
    for (const layer of BED_LAYERS) this.glide(this.beds[layer].gain, mix.beds[layer] * LEVELS[layer], immediate);
    for (const layer of EVENT_LAYERS) {
      this.glide(this.eventBus[layer].gain, mix.events[layer].gain * LEVELS[layer], immediate);
      const rate = Math.min(MAX_EVENT_RATE, mix.events[layer].rate);
      this.rates[layer] = rate;
      // A layer that has just woken up (the night coming on) is redrawn, so
      // it does not wait out a gap drawn when it was nearly silent.
      if (rate <= 0) {
        delete this.nextEvent[layer];
      } else if (rate > 2 * (this.drawnAt[layer] ?? 0)) {
        this.nextEvent[layer] = this.ctx.currentTime + gap(this.rng, rate, MIN_GAP[layer]) * 0.5;
        this.drawnAt[layer] = rate;
      }
    }
    this.glide(this.localBus.gain, mix.local, immediate);

    if (frame.pose) this.place(frame.pose, immediate);
    if (frame.clock !== null) this.clockAt = { clock: frame.clock, audio: this.ctx.currentTime };
    this.follow(mix.local > 0.02 ? frame.local : [], immediate);
  }

  private place(pose: Pose, immediate: boolean): void {
    const listener = this.ctx.listener;
    const now = this.ctx.currentTime;
    const set = (param: AudioParam | undefined, value: number) => {
      if (!param) return;
      if (immediate) param.setValueAtTime(value, now);
      else param.setTargetAtTime(value, now, 0.12);
    };
    if (listener.positionX) {
      set(listener.positionX, pose.position[0]);
      set(listener.positionY, pose.position[1]);
      set(listener.positionZ, pose.position[2]);
      set(listener.forwardX, pose.forward[0]);
      set(listener.forwardY, pose.forward[1]);
      set(listener.forwardZ, pose.forward[2]);
      set(listener.upX, pose.up[0]);
      set(listener.upY, pose.up[1]);
      set(listener.upZ, pose.up[2]);
    } else {
      // Older Firefox: the listener has only the deprecated setters.
      const legacy = listener as unknown as {
        setPosition(x: number, y: number, z: number): void;
        setOrientation(x: number, y: number, z: number, ux: number, uy: number, uz: number): void;
      };
      legacy.setPosition(...pose.position);
      legacy.setOrientation(...pose.forward, ...pose.up);
    }
  }

  // --- Local sources ------------------------------------------------------

  /** Adds voices for newly chosen sources and fades out the ones no longer chosen. */
  private follow(chosen: readonly NearSource[], immediate: boolean): void {
    const keep = new Set(chosen.map((near) => near.source.id));
    for (const [id, voice] of this.locals) {
      if (!keep.has(id)) this.retire(voice);
    }
    for (const { source } of chosen) {
      let voice = this.locals.get(source.id);
      if (!voice) {
        voice = this.voice(source.id, source.kind, source.position, source.trainsPerMinute ?? 0, !!source.troubled);
        this.locals.set(source.id, voice);
      }
      voice.level = source.level;
      voice.trainsPerMinute = source.trainsPerMinute ?? 0;
      this.glide(voice.bus.gain, source.level, immediate, 0.5);
    }
  }

  private voice(id: string, kind: SourceKind, at: Vec3, trainsPerMinute: number, troubled: boolean): LocalVoice {
    const { ctx } = this;
    const nodes: AudioNode[] = [];
    const sources: AudioScheduledSourceNode[] = [];
    const t = <T extends AudioNode>(node: T): T => {
      nodes.push(this.track(node));
      return node;
    };
    const bus = t(ctx.createGain());
    bus.gain.value = 0;
    const panner = t(ctx.createPanner());
    panner.panningModel = "equalpower";
    panner.distanceModel = "inverse";
    panner.refDistance = 14;
    panner.rolloffFactor = 1.1;
    panner.maxDistance = 2000;
    if (panner.positionX) {
      panner.positionX.value = at[0];
      panner.positionY.value = at[1] + 2;
      panner.positionZ.value = at[2];
    } else {
      (panner as unknown as { setPosition(x: number, y: number, z: number): void }).setPosition(at[0], at[1] + 2, at[2]);
    }
    bus.connect(panner).connect(this.localBus);

    const loop = (buffer: AudioBuffer) => {
      const src = t(ctx.createBufferSource());
      src.buffer = buffer;
      src.loop = true;
      src.start(ctx.currentTime, this.rng.next() * buffer.duration);
      sources.push(src);
      return src;
    };
    const tone = (frequency: number) => {
      const osc = t(ctx.createOscillator());
      osc.frequency.value = frequency;
      osc.start(ctx.currentTime);
      sources.push(osc);
      return osc;
    };
    const level = (value: number) => {
      const node = t(ctx.createGain());
      node.gain.value = value;
      return node;
    };
    const band = (type: BiquadFilterType, frequency: number, q = 0.7) => {
      const node = t(ctx.createBiquadFilter());
      node.type = type;
      node.frequency.value = frequency;
      node.Q.value = q;
      return node;
    };

    if (kind === "fire") {
      // Crackle over a low, breathing roar.
      loop(this.bank.crackle).connect(band("highpass", 700)).connect(band("lowpass", 5000, 0.5)).connect(level(LEVELS.crackle)).connect(bus);
      const roar = level(LEVELS.roar * 0.8);
      loop(this.bank.brown).connect(band("lowpass", 280)).connect(roar).connect(bus);
      const flicker = tone(0.31);
      flicker.connect(level(LEVELS.roar * 0.25)).connect(roar.gain);
    } else if (kind === "power") {
      // Transformer hum at twice the mains, its harmonics, and the fans.
      const mains = level(LEVELS.mains);
      for (const [f, w] of [
        [110, 0.55],
        [220, 0.3],
        [330, 0.12],
      ] as const) {
        tone(f).connect(level(w)).connect(mains);
      }
      mains.connect(band("lowpass", 700, 0.5)).connect(bus);
      loop(this.bank.pink).connect(band("bandpass", 190, 1.5)).connect(level(LEVELS.fan)).connect(bus);
      if (troubled) {
        // A failing build: the hum wavers.
        tone(0.8).connect(level(LEVELS.mains * 0.4)).connect(mains.gain);
      }
    }
    // Cranes and the station make only events, which play into `bus`.

    // Keep the voice's nodes on the books even when it has no running source
    // of its own: a silent buffer-less source that ends when the voice does.
    const anchor = t(ctx.createConstantSource());
    anchor.offset.value = 0;
    anchor.connect(bus);
    anchor.start(ctx.currentTime);
    sources.push(anchor);
    const record: Voice = { nodes, sources, oneShot: false };
    this.active.add(record);
    anchor.onended = () => this.free(record);

    const now = ctx.currentTime;
    return {
      id,
      kind,
      bus,
      panner,
      next: now + (kind === "fire" ? this.rng.range(6, 20) : this.rng.range(0.4, 2)),
      lastArrival: Number.NEGATIVE_INFINITY,
      lastChime: Number.NEGATIVE_INFINITY,
      level: 1,
      trainsPerMinute,
      sources,
    };
  }

  /** Fades a local voice out and lets it go. */
  private retire(voice: LocalVoice): void {
    this.locals.delete(voice.id);
    const now = this.ctx.currentTime;
    voice.bus.gain.cancelScheduledValues(now);
    voice.bus.gain.setTargetAtTime(0, now, 0.25);
    for (const src of voice.sources) {
      try {
        src.stop(now + 1.2);
      } catch {
        /* already stopped */
      }
    }
  }

  // --- Events -------------------------------------------------------------

  /** Schedules every event due before `until` (context time). Call a few times a second. */
  schedule(until: number): void {
    if (this.disposed) return;
    const now = this.ctx.currentTime;

    for (const layer of EVENT_LAYERS) {
      const rate = this.rates[layer];
      if (!(rate > 0)) continue;
      let next = this.nextEvent[layer] ?? now + gap(this.rng, rate, MIN_GAP[layer]);
      while (next < until) {
        if (next >= now - 0.05) this.fire(layer, Math.max(next, now + 0.02));
        next += gap(this.rng, rate, MIN_GAP[layer]);
      }
      this.nextEvent[layer] = next;
    }

    for (const voice of this.locals.values()) this.scheduleLocal(voice, now, until);
  }

  private fire(layer: EventLayer, when: number): void {
    if (this.oneShots >= MAX_ONE_SHOTS) return;
    SYNTHS[layer](this.kit, when, this.eventBus[layer], 1);
    this.count(layer);
  }

  private count(name: string): void {
    this.fired[name] = (this.fired[name] ?? 0) + 1;
  }

  private scheduleLocal(voice: LocalVoice, now: number, until: number): void {
    if (voice.kind === "crane") {
      while (voice.next < until) {
        const at = Math.max(voice.next, now + 0.02);
        if (this.oneShots < MAX_ONE_SHOTS) {
          voices.clank(this.kit, at, voice.bus, LEVELS.clank);
          this.count("clank");
          // Now and then a second knock straight after the first.
          if (this.rng.next() < 0.3) voices.clank(this.kit, at + this.rng.range(0.18, 0.3), voice.bus, LEVELS.clank * 0.7);
        }
        const mean = voice.level >= 1 ? 3.4 : 6.5;
        voice.next = at + gap(this.rng, 1 / mean, 1.1);
      }
    } else if (voice.kind === "fire") {
      while (voice.next < until) {
        const at = Math.max(voice.next, now + 0.02);
        if (this.oneShots < MAX_ONE_SHOTS) {
          voices.siren(this.kit, at, voice.bus, LEVELS.siren);
          this.count("siren");
        }
        voice.next = at + this.rng.range(28, 55);
      }
    } else if (voice.kind === "station" && voice.trainsPerMinute > 0) {
      // The renderer's clock, carried forward from the last frame.
      const clockNow = this.clockAt ? this.clockAt.clock + (now - this.clockAt.audio) : now;
      const arrival = nextTrainArrival(clockNow, voice.trainsPerMinute);
      const at = now + (arrival - clockNow);
      if (at < until && arrival > voice.lastArrival + 0.5) {
        voice.lastArrival = arrival;
        // A busy line chimes for some trains, not all of them.
        if (arrival - voice.lastChime >= 18 && this.oneShots < MAX_ONE_SHOTS) {
          voice.lastChime = arrival;
          voices.chime(this.kit, Math.max(at, now + 0.02), voice.bus, LEVELS.chime);
          this.count("chime");
        }
      }
    }
  }

  // --- Lifecycle ----------------------------------------------------------

  stats(): EngineStats {
    return {
      liveNodes: this.live,
      createdNodes: this.created,
      oneShots: this.oneShots,
      locals: this.locals.size,
      localIds: [...this.locals.keys()],
      events: { ...this.fired },
    };
  }

  /** Stops and disconnects everything, at once. The context is the caller's to close. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const voice of [...this.active]) {
      for (const src of voice.sources) {
        src.onended = null;
        try {
          src.stop();
        } catch {
          /* never started, or already stopped */
        }
      }
      this.free(voice);
    }
    this.locals.clear();
    for (const src of this.persistentSources) {
      try {
        src.stop();
      } catch {
        /* already stopped */
      }
    }
    for (const node of this.persistent) {
      try {
        node.disconnect();
      } catch {
        /* already gone */
      }
    }
    this.live -= this.persistent.length;
    this.persistent.length = 0;
    this.persistentSources.length = 0;
  }
}
