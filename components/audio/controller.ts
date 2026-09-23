/**
 * The soundscape's lifecycle, outside React: one `AudioContext` at most,
 * created inside a user gesture (browsers refuse audio that starts any other
 * way), the live engine started on it, and everything torn down again when
 * the viewer turns sound off.
 *
 *   off       nothing exists: no context, no nodes, no timer
 *   waiting   sound is on (remembered from last time) but the page has not
 *             been touched yet, so there is no context to play on
 *   playing   the context runs and the engine is live
 *
 * The engine itself (`live.ts`, with `engine.ts` and the voices) is fetched
 * only the first time sound is turned on, so a visitor who never does pays
 * nothing for it.
 */

import type { LiveSoundscape, LiveStats } from "./live";

export type SoundStatus = "off" | "waiting" | "playing";

let ctx: AudioContext | null = null;
let live: LiveSoundscape | null = null;
let starting: Promise<void> | null = null;
let stopping: Promise<void> | null = null;
let status: SoundStatus = "off";
let volume = 0.7;
const listeners = new Set<() => void>();

/**
 * With the engine live, "playing" once the context actually runs (or while
 * the tab is hidden, which suspends it on purpose), and "waiting" while the
 * browser still holds it back: a touch that began a gesture but has not yet
 * finished it, say.
 */
function recompute(): void {
  if (!live || !ctx) return;
  setStatus(ctx.state === "running" || document.hidden ? "playing" : "waiting");
}

function setStatus(next: SoundStatus): void {
  if (next === status) return;
  status = next;
  for (const listener of listeners) listener();
}

export function subscribeStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const getStatus = (): SoundStatus => status;

/**
 * Creates (or resumes) the context. Call it synchronously inside a click or
 * key handler: that is what lets it start. Returns false where the browser
 * has no Web Audio at all.
 */
export function primeContext(): boolean {
  if (typeof window === "undefined") return false;
  const Ctor =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return false;
  if (!ctx || ctx.state === "closed") {
    // "playback" asks for larger buffers: an ambience has no use for low
    // latency, and larger buffers wake the audio thread less often.
    ctx = new Ctor({ latencyHint: "playback" });
    ctx.addEventListener("statechange", recompute);
  }
  if (ctx.state === "suspended" && !document.hidden) void ctx.resume().catch(() => {});
  return true;
}

/** Whether a context exists that may start (one was primed by a gesture). */
export const hasContext = (): boolean => ctx !== null && ctx.state !== "closed";

/** Starts the engine on the primed context. Sound must be on. */
export function start(nextVolume: number): Promise<void> {
  volume = nextVolume;
  if (live) {
    recompute();
    return Promise.resolve();
  }
  if (starting) return starting;
  const context = ctx;
  if (!context) {
    setStatus("waiting");
    return Promise.resolve();
  }
  starting = (async () => {
    if (stopping) await stopping;
    const { startLive } = await import("./live");
    // Turned off, or replaced, while the engine was loading.
    if (ctx !== context || context.state === "closed") return;
    live = startLive(context, volume);
    recompute();
  })().finally(() => {
    starting = null;
  });
  return starting;
}

/** Fades out, disposes the engine and closes the context. */
export function stop(): Promise<void> {
  const running = live;
  const context = ctx;
  live = null;
  ctx = null;
  setStatus("off");
  if (!running) {
    if (context && context.state !== "closed") void context.close().catch(() => {});
    return Promise.resolve();
  }
  stopping = running.stop().finally(() => {
    stopping = null;
  });
  return stopping;
}

/** Sound is on but nothing may play until the viewer touches the page. */
export function markWaiting(): void {
  if (!live) setStatus("waiting");
}

export function setVolume(next: number): void {
  volume = next;
  live?.setVolume(next);
}

/** For the development handle and the verification script. */
export function stats(): (LiveStats & { status: SoundStatus }) | { status: SoundStatus } {
  return live ? { status, ...live.stats() } : { status };
}
