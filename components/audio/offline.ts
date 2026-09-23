/**
 * Renders a scene of the soundscape into an `OfflineAudioContext`, faster
 * than real time, and meters it. The engine runs exactly as it does live:
 * the context is suspended every quarter second, the frame is fed in, the
 * next events are scheduled, and rendering resumes.
 *
 * Development only: `__repoCity.audio.render(name)` in the browser, driven
 * by `scripts/audio-levels.ts`.
 */

import { BED_LAYERS, EVENT_LAYERS, mixFor, type Mix } from "@/lib/client/audioMix";
import { audioScenes, measureLevels, type AudioScene, type Levels } from "@/lib/client/audioLevels";
import { LOOKAHEAD, Soundscape, type Frame } from "./engine";

const TICK = 0.25;

export interface Render extends Levels {
  name: string;
  seconds: number;
  events: Record<string, number>;
  /** Nodes still live when the render ended, and how many were made. */
  liveNodes: number;
  createdNodes: number;
  /** Wall-clock milliseconds to render. */
  renderMs: number;
}

/** The mix with every layer but `solo` (a bed, an event layer, or "local") silenced. */
export function soloMix(mix: Mix, solo: string): Mix {
  return {
    beds: Object.fromEntries(BED_LAYERS.map((l) => [l, l === solo ? mix.beds[l] : 0])) as Mix["beds"],
    events: Object.fromEntries(
      EVENT_LAYERS.map((l) => [l, l === solo ? mix.events[l] : { gain: 0, rate: 0 }]),
    ) as Mix["events"],
    local: solo === "local" ? mix.local : 0,
  };
}

export async function renderScene(
  scene: AudioScene,
  seconds = 12,
  volume = 1,
  solo: string | null = null,
  seed = 7,
): Promise<Render> {
  const sampleRate = 44100;
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * sampleRate), sampleRate);
  const engine = new Soundscape(ctx, { seed });
  const frame: Frame = {
    mix: solo ? soloMix(mixFor(scene.scene, scene.altitude), solo) : mixFor(scene.scene, scene.altitude),
    local: scene.local,
    pose: scene.pose,
    clock: 0,
  };
  engine.setVolume(volume, true);
  engine.update(frame, true);
  engine.fade(1, 0.5);
  engine.schedule(LOOKAHEAD);

  for (let t = TICK; t < seconds; t += TICK) {
    const at = t;
    void ctx.suspend(at).then(() => {
      engine.update({ ...frame, clock: at });
      engine.schedule(at + LOOKAHEAD);
      void ctx.resume();
    });
  }

  const started = performance.now();
  const buffer = await ctx.startRendering();
  const renderMs = performance.now() - started;
  const channels = [buffer.getChannelData(0), buffer.getChannelData(1)];
  // The first second is the fade in.
  const levels = measureLevels(channels, sampleRate);
  const stats = engine.stats();
  engine.dispose();
  return {
    name: scene.name,
    seconds,
    ...levels,
    events: stats.events,
    liveNodes: stats.liveNodes,
    createdNodes: stats.createdNodes,
    renderMs,
  };
}

/** Every scene in `audioScenes()`, one after another. */
export async function renderAll(seconds = 12, volume = 1): Promise<Render[]> {
  const out: Render[] = [];
  for (const scene of audioScenes()) out.push(await renderScene(scene, seconds, volume));
  return out;
}
