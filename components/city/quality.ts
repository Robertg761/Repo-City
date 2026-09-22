"use client";

/**
 * The quality tier (PLAN.md sections 63 and 75).
 *
 * Repo City has to look like a lit diorama on a workstation and still run on
 * the laptop someone opens the demo link on. Rather than guess from the GPU
 * string -- which lies, and which says nothing about a browser throttled on
 * battery -- the renderer measures itself: once the generation animation has
 * finished, it times three seconds of frames and steps down if the average
 * frame took longer than 25 ms.
 *
 * What a step down removes follows section 63's order exactly: expensive
 * post-processing first, then the realtime shadow budget. The surface
 * textures shrink and the ground detail pass goes with the post-processing,
 * since both are fill rate spent on decoration. Nothing that carries
 * meaning -- buildings, incidents, selection, camera, inspector -- is ever
 * touched by this file.
 *
 * `?quality=low` and `?quality=high` pin the tier for testing and skip the
 * measurement. The chosen tier is on `window.__repoCity.quality` in dev.
 *
 * The tier lives in a module-level store rather than in React state or in the
 * city store: it is a property of the machine, not of the repository, so it
 * survives analysing another repo, and both `Lighting` (inside the keyed
 * `<City>` subtree) and `Environment` (outside it) have to read it.
 */

import { useEffect, useRef, useSyncExternalStore } from "react";

export type QualityTier = "high" | "low";

export interface QualitySettings {
  tier: QualityTier;
  /** Run the effect composer at all. First thing to go (section 63). */
  postProcessing: boolean;
  /** Ambient occlusion, the expensive half of the composer. */
  ambientOcclusion: boolean;
  /** Bloom, limited to emissive windows, beacons and lamps. */
  bloom: boolean;
  /** Post antialiasing. Only meaningful with the composer running. */
  smaa: boolean;
  /** Directional shadow texture resolution. Second to go (section 63). */
  shadowMapSize: number;
  /** The soft darkening that seats buildings on the ground plate. */
  contactShadows: boolean;
  /** Upper bound on the device pixel ratio. */
  maxDpr: number;
  /**
   * Side in pixels of every procedural surface texture (`textures/`). The low
   * tier halves it: less to upload and a smaller mip chain to sample.
   */
  textureSize: number;
  /** Anisotropic filtering on those textures; it is what keeps paint crisp at a slant. */
  anisotropy: number;
  /**
   * The detail layer over the district ground: a transparent pass over most
   * of the city, so it goes with the post-processing on a slow machine.
   */
  groundDetail: boolean;
}

export const QUALITY_SETTINGS: Record<QualityTier, QualitySettings> = {
  high: {
    tier: "high",
    postProcessing: true,
    ambientOcclusion: true,
    bloom: true,
    smaa: true,
    shadowMapSize: 2048,
    contactShadows: false,
    maxDpr: 2,
    textureSize: 256,
    anisotropy: 4,
    groundDetail: true,
  },
  low: {
    tier: "low",
    postProcessing: false,
    ambientOcclusion: false,
    bloom: false,
    smaa: false,
    shadowMapSize: 1024,
    contactShadows: false,
    maxDpr: 1.25,
    textureSize: 128,
    anisotropy: 1,
    groundDetail: false,
  },
};

/** Frame budget from PLAN.md section 75: slower than this and we step down. */
export const STEP_DOWN_MS = 25;

/** How long the probe watches, and how long the shortest usable sample is. */
export const PROBE_MS = 3000;
const MIN_SAMPLES = 24;

/**
 * A frame gap longer than this is a stall -- a backgrounded tab, a driver
 * hiccup, the analysis response landing -- not a frame rate. Counting those
 * would send a fast machine to the low tier for being interrupted once.
 */
const STALL_MS = 250;

/**
 * The decision itself, kept pure so the rule is unit tested rather than
 * screenshotted: the mean of the usable samples against the budget.
 *
 * A slow enough machine produces nothing but "stalls": a software renderer
 * drawing a frame every 750 ms fills the whole window with gaps longer than
 * `STALL_MS`. Filtering those out and then shrugging at the short list that
 * is left kept exactly the machines that most needed the low tier on the high
 * one. So the rule is:
 *
 *   - enough ordinary frames: judge on their mean, stalls ignored;
 *   - a full window watched but too few ordinary frames in it: the frame rate
 *     is under eight a second whatever the gaps are called, step down;
 *   - more stall time than frame time over three or more stalls: repeated,
 *     not an interruption, step down;
 *   - otherwise there is not enough to judge on, keep `fallback`.
 *
 * The probe restarts its window when the tab is hidden (`useQualityProbe`),
 * so a backgrounded tab never reaches this function as one long "frame".
 */
export function tierForSamples(
  samples: readonly number[],
  fallback: QualityTier = "high",
): QualityTier {
  let elapsed = 0;
  let stallTime = 0;
  let stalls = 0;
  const usable: number[] = [];
  for (const ms of samples) {
    if (!(ms > 0)) continue;
    elapsed += ms;
    if (ms < STALL_MS) {
      usable.push(ms);
    } else {
      stalls += 1;
      stallTime += ms;
    }
  }
  if (stalls >= 3 && stallTime > elapsed / 2) return "low";
  if (usable.length >= MIN_SAMPLES) {
    const mean = usable.reduce((sum, ms) => sum + ms, 0) / usable.length;
    return mean > STEP_DOWN_MS ? "low" : "high";
  }
  if (elapsed >= PROBE_MS * 0.9) return "low";
  return fallback;
}

/** `?quality=low` / `?quality=high`. Anything else is ignored. */
export function tierFromSearch(search: string): QualityTier | null {
  const value = new URLSearchParams(search).get("quality");
  return value === "low" || value === "high" ? value : null;
}

// ---------------------------------------------------------------------------
// The store
// ---------------------------------------------------------------------------

let current: QualitySettings = QUALITY_SETTINGS.high;
let pinned = false;
let probed = false;
const listeners = new Set<() => void>();

function publish(tier: QualityTier): void {
  if (current.tier === tier) return;
  current = QUALITY_SETTINGS[tier];
  for (const listener of listeners) listener();
  announce();
}

/**
 * The dev console handle is the store hook itself (`store/useCityStore.ts`);
 * hanging the tier off it keeps one name to remember and costs nothing in
 * production, where the handle does not exist.
 */
function announce(): void {
  if (process.env.NODE_ENV === "production" || typeof window === "undefined") return;
  const handle = (window as unknown as { __repoCity?: { quality?: QualityTier } }).__repoCity;
  if (handle) handle.quality = current.tier;
}

/** Pins the tier and stops the probe from overriding it. Used by `?quality=`. */
export function pinQualityTier(tier: QualityTier): void {
  pinned = true;
  publish(tier);
}

export function setQualityTier(tier: QualityTier): void {
  if (!pinned) publish(tier);
}

export const qualitySettings = (): QualitySettings => current;

/** Test seam: forget the pin and the measurement. */
export function resetQuality(): void {
  pinned = false;
  probed = false;
  current = QUALITY_SETTINGS.high;
  for (const listener of listeners) listener();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** The current tier's settings, re-rendering the caller when it changes. */
export function useQuality(): QualitySettings {
  return useSyncExternalStore(subscribe, qualitySettings, qualitySettings);
}

/**
 * Times frames and steps the tier down if they are too long.
 *
 * `afterMs` is how long to wait from the moment the caller mounts the model:
 * the end of the generation animation. Measuring during the reveal would time
 * three hundred buildings growing out of the ground and condemn a fast machine
 * to the low tier for the rest of the session.
 *
 * It runs once per session. The answer is about the machine, and re-running it
 * on every repository would let the tier flap mid-demo.
 */
export function useQualityProbe(afterMs: number | null): void {
  const done = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const override = tierFromSearch(window.location.search);
    if (override) {
      pinQualityTier(override);
      return;
    }
    announce();
    if (afterMs === null || probed || done.current) return;

    done.current = true;
    probed = true;

    let startAt = performance.now() + afterMs;
    let samples: number[] = [];
    let last = 0;
    let frame = 0;

    // rAF stops while the tab is hidden, and the window it was measuring is
    // then mostly absence. Start the three seconds again once it is back.
    const restart = () => {
      if (document.hidden) return;
      samples = [];
      last = 0;
      startAt = Math.max(startAt, performance.now() + 500);
    };
    document.addEventListener("visibilitychange", restart);

    const tick = (now: number) => {
      if (now < startAt) {
        frame = requestAnimationFrame(tick);
        return;
      }
      if (last === 0) {
        last = now;
        frame = requestAnimationFrame(tick);
        return;
      }
      samples.push(now - last);
      last = now;
      if (now - startAt < PROBE_MS) {
        frame = requestAnimationFrame(tick);
        return;
      }
      setQualityTier(tierForSamples(samples));
    };

    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", restart);
    };
  }, [afterMs]);
}
