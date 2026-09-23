/**
 * The live soundscape: the engine on a real `AudioContext`, fed from the
 * scene a few times a second.
 *
 * Four times a second it reads the city and the viewer's hour from the store
 * and the camera and the clock from React Three Fiber's own state (the
 * canvas's root, reached through `_roots`, so nothing in the scene has to be
 * mounted for the sound's sake and the draw calls are untouched), turns them
 * into a mix (`lib/client/audioMix.ts`) and hands it to the engine. That is
 * the whole per-tick cost: a scan of a handful of heroes and landmarks, some
 * arithmetic, and a few dozen `AudioParam` glides.
 *
 * A hidden tab fades out and suspends the context; coming back resumes it
 * and fades in.
 *
 * Loaded on demand by `controller.ts`, only once the viewer turns sound on.
 */

import { _roots } from "@react-three/fiber";
import { hashString } from "@/lib/city/prng";
import { cameraAltitude, mixFor, type MixScene } from "@/lib/client/audioMix";
import { nearestSources, soundSources, viewFocus, type SoundSource } from "@/lib/client/audioSources";
import { targetPhase } from "@/components/city/timeOfDay";
import { STAGE_AMBIENCE } from "@/components/city/sky";
import { useCityStore } from "@/store/useCityStore";
import type { CityModel, Vec3 } from "@/types/city";
import { LOOKAHEAD, Soundscape, type EngineStats, type Pose } from "./engine";

/** Updates a second. Four is plenty: every change glides anyway. */
const TICK_MS = 250;
const EMPTY_SIZE = 120;

export interface LiveStats extends EngineStats {
  state: AudioContextState;
  ticks: number;
  /** Mean and worst main-thread milliseconds per update. */
  tickMs: number;
  tickMsMax: number;
  altitude: number;
  hidden: boolean;
}

export interface LiveSoundscape {
  setVolume(volume: number): void;
  stats(): LiveStats;
  /** Fades out, stops everything and closes the context. */
  stop(): Promise<void>;
}

/** The camera and the clock, from the canvas's React Three Fiber root, if there is one. */
function readRenderer(): { pose: Pose; clock: number } | null {
  for (const root of _roots.values()) {
    const state = root.store.getState();
    const camera = state.camera;
    if (!camera) continue;
    const m = camera.matrixWorld.elements;
    const position: Vec3 = [m[12], m[13], m[14]];
    // A camera looks down its own -z; its up is its +y.
    const forward: Vec3 = [-m[8], -m[9], -m[10]];
    const up: Vec3 = [m[4], m[5], m[6]];
    return { pose: { position, forward, up }, clock: state.clock.elapsedTime };
  }
  return null;
}

/** The scene as the mix model sees it, from the store. */
function sceneOf(city: CityModel | null, setting: ReturnType<typeof useCityStore.getState>["timeSetting"]): MixScene {
  const ambience = city?.ambience ?? STAGE_AMBIENCE;
  const archived = city?.repository.archived ?? false;
  return {
    tier: city ? (city.settlement?.tier ?? "city") : null,
    phase: targetPhase(setting, ambience, archived),
    health: city?.health.score ?? 70,
    activity: city?.activity.score ?? 0.5,
    archived,
    traffic: ambience.trafficDensity,
  };
}

export function startLive(ctx: AudioContext, volume: number): LiveSoundscape {
  const first = useCityStore.getState().city;
  const engine = new Soundscape(ctx, { seed: hashString(first?.seed ?? "repo-city") >>> 0 });
  engine.setVolume(volume, true);

  let city: CityModel | null | undefined;
  let sources: SoundSource[] = [];
  let ticks = 0;
  let tickTotal = 0;
  let tickMax = 0;
  let altitude = 1;
  let started = false;

  const tick = () => {
    const t0 = performance.now();
    const state = useCityStore.getState();
    if (state.city !== city) {
      city = state.city;
      sources = city ? soundSources(city) : [];
    }
    const renderer = readRenderer();
    const size = city?.bounds.size ?? EMPTY_SIZE;
    const focus = renderer ? viewFocus(renderer.pose.position, renderer.pose.forward) : null;
    altitude = focus ? cameraAltitude(focus.distance, size) : 1;
    const mix = mixFor(sceneOf(city ?? null, state.timeSetting), altitude);
    engine.update(
      {
        mix,
        local: focus ? nearestSources(sources, focus.point) : [],
        pose: renderer?.pose ?? null,
        clock: renderer?.clock ?? null,
      },
      // The first frame is set outright: the fade in is the only glide.
      !started,
    );
    if (!started) {
      started = true;
      engine.fade(1, 1.5);
    }
    engine.schedule(ctx.currentTime + LOOKAHEAD);
    const spent = performance.now() - t0;
    ticks++;
    tickTotal += spent;
    if (spent > tickMax) tickMax = spent;
  };

  let timer: ReturnType<typeof setInterval> | null = null;
  const run = () => {
    if (timer === null) timer = setInterval(tick, TICK_MS);
  };
  const pause = () => {
    if (timer !== null) clearInterval(timer);
    timer = null;
  };

  let suspendTimer: ReturnType<typeof setTimeout> | null = null;
  const onVisibility = () => {
    if (document.hidden) {
      engine.fade(0, 0.3);
      pause();
      suspendTimer = setTimeout(() => {
        suspendTimer = null;
        void ctx.suspend().catch(() => {});
      }, 350);
    } else {
      if (suspendTimer !== null) clearTimeout(suspendTimer);
      suspendTimer = null;
      void ctx
        .resume()
        .catch(() => {})
        .then(() => {
          tick();
          engine.fade(1, 1);
          run();
        });
    }
  };
  document.addEventListener("visibilitychange", onVisibility);

  tick();
  run();

  let stopped: Promise<void> | null = null;
  return {
    setVolume(next) {
      engine.setVolume(next);
    },
    stats() {
      return {
        ...engine.stats(),
        state: ctx.state,
        ticks,
        tickMs: ticks ? tickTotal / ticks : 0,
        tickMsMax: tickMax,
        altitude,
        hidden: document.hidden,
      };
    },
    stop() {
      if (stopped) return stopped;
      stopped = (async () => {
        document.removeEventListener("visibilitychange", onVisibility);
        if (suspendTimer !== null) clearTimeout(suspendTimer);
        pause();
        if (ctx.state === "running") {
          engine.fade(0, 0.35);
          await new Promise((resolve) => setTimeout(resolve, 400));
        }
        engine.dispose();
        await ctx.close().catch(() => {});
      })();
      return stopped;
    },
  };
}
