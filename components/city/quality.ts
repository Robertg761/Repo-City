"use client";

/**
 * The quality tier (PLAN.md sections 63 and 75).
 *
 * Repo City has to look like a lit diorama on a workstation and still run on
 * the laptop someone opens the demo link on. Rather than guess from the GPU
 * string -- which lies, and which says nothing about a browser throttled on
 * battery -- the renderer measures itself and steps down when frames are too
 * long. There are three tiers, and what each one gives up follows section
 * 63's order:
 *
 *   - `high` is the full picture: ambient occlusion, bloom, antialiasing, a
 *     2,048 shadow map and up to twice the CSS resolution.
 *   - `medium` drops the ambient occlusion -- the expensive half of the
 *     composer -- and caps the pixel ratio at 1.5, which on a Retina screen
 *     draws a little over half the pixels and still reads sharp. Bloom, tone
 *     mapping, antialiasing, shadows and every texture stay.
 *   - `low` drops the composer, halves the shadow map and the surface
 *     textures, caps the pixel ratio at 1.25 and drops the ground detail pass
 *     and the crowd's smoke and halos, all fill rate spent on decoration.
 *
 * Nothing that carries meaning -- buildings, incidents, selection, camera,
 * inspector -- is ever touched by this file, and no tier hides an issue or a
 * pull request.
 *
 * WHEN IT MEASURES (`useQualityProbe`):
 *
 *   1. On the empty stage, once: a machine too slow for the lawn will be too
 *      slow for any city, and learning it here means the first city arrives
 *      at the right tier instead of revealing itself at two frames a second.
 *   2. After the first city's reveal, once a session: three seconds of
 *      frames. A step down is followed by another look once the new tier has
 *      settled, so a machine can go from high to low in two steps.
 *   3. Then continuously, as a guard: if the frame rate sags below about 28
 *      a second for eight seconds running -- night over a metropolis, a
 *      browser gone to battery saving -- it steps down once more.
 *
 * It only ever steps down, so it cannot flap. And a step that did not make
 * frames at least a tenth quicker is the last one: the frame rate is bound by
 * something no tier changes (a CPU, or a browser capping at 30), and
 * stepping further would only cost the look.
 *
 * A phone starts at `medium` rather than measuring its way down from `high`
 * through the most expensive seconds of the visit.
 *
 * `?quality=low`, `?quality=medium` and `?quality=high` pin the tier for
 * testing and skip the measurement. The chosen tier, and every change with
 * its reason, is on `window.__repoCity.quality` and `.qualityLog` in dev, and
 * the tier on `<html data-quality>` everywhere.
 *
 * The tier lives in a module-level store rather than in React state or in the
 * city store: it is a property of the machine, not of the repository, so it
 * survives analysing another repo, and both `Lighting` (inside the keyed
 * `<City>` subtree) and `Environment` (outside it) have to read it.
 */

import { useEffect, useSyncExternalStore } from "react";

export type QualityTier = "high" | "medium" | "low";

/** Best first. A step down is one place along this list. */
export const TIER_ORDER: readonly QualityTier[] = ["high", "medium", "low"];

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
  /**
   * The crowd's decoration (PLAN.md 76.9): smoke over crowd fires and the
   * soft halos round crowd beacons. Both are transparent, overdrawn and
   * animated, so the low tier drops them. It never drops a crowd object: every
   * open issue and pull request stays on the street, whatever the machine.
   */
  crowdEffects: boolean;
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
    crowdEffects: true,
  },
  medium: {
    tier: "medium",
    postProcessing: true,
    ambientOcclusion: false,
    bloom: true,
    smaa: true,
    shadowMapSize: 2048,
    contactShadows: false,
    maxDpr: 1.5,
    textureSize: 256,
    anisotropy: 4,
    groundDetail: true,
    crowdEffects: true,
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
    crowdEffects: false,
  },
};

/** Frame budget from PLAN.md section 75: slower than this and the probe steps down. */
export const STEP_DOWN_MS = 25;
/**
 * The guard's budget, well above the probe's so the two cannot argue: a
 * machine the probe passed at 40 frames a second is only stepped down later
 * if it sags under about 28 for a sustained stretch.
 */
export const GUARD_MS = 1000 / 28;
/** Past this the frame rate is under 20, and the tier goes straight to low. */
export const VERY_SLOW_MS = 50;

/** How long the probe watches, and how long the shortest usable sample is. */
export const PROBE_MS = 3000;
const MIN_SAMPLES = 24;
/** The guard's window, and how many slow windows in a row it takes to act. */
export const GUARD_WINDOW_MS = 4000;
export const GUARD_STREAK = 2;
/** The empty stage is watched this long after it first draws. */
const LANDING_WAIT_MS = 2000;
/** After a step the new tier compiles and resizes; its first frames are not its rate. */
const STEP_SETTLE_MS = 1500;
/** A step that left frames slower than this share of before did not help. */
export const HELPED_RATIO = 0.9;

/**
 * A frame gap longer than this is a stall -- a backgrounded tab, a driver
 * hiccup, the analysis response landing -- not a frame rate. Counting those
 * would send a fast machine to the low tier for being interrupted once.
 */
const STALL_MS = 250;

export type Verdict = "ok" | "slow" | "very-slow" | "unknown";

export interface Judgement {
  verdict: Verdict;
  /** The mean frame, stalls included when the stalls are the verdict. NaN when unknown. */
  meanMs: number;
}

/**
 * The measurement itself, kept pure so the rule is unit tested rather than
 * screenshotted: the mean of the usable samples against a budget.
 *
 * A slow enough machine produces nothing but "stalls": a software renderer
 * drawing a frame every 750 ms fills the whole window with gaps longer than
 * `STALL_MS`. Filtering those out and then shrugging at the short list that
 * is left kept exactly the machines that most needed the low tier on the high
 * one. So the rule is:
 *
 *   - enough ordinary frames: judge on their mean, stalls ignored;
 *   - a full window watched but too few ordinary frames in it: the frame rate
 *     is under eight a second whatever the gaps are called, very slow;
 *   - more stall time than frame time over three or more stalls: repeated,
 *     not an interruption, very slow;
 *   - otherwise there is not enough to judge on.
 *
 * The probe restarts its window when the tab is hidden (`useQualityProbe`),
 * so a backgrounded tab never reaches this function as one long "frame".
 */
export function judgeFrames(
  samples: readonly number[],
  budgetMs: number = STEP_DOWN_MS,
  windowMs: number = PROBE_MS,
): Judgement {
  let elapsed = 0;
  let stallTime = 0;
  let stalls = 0;
  let count = 0;
  const usable: number[] = [];
  for (const ms of samples) {
    if (!(ms > 0)) continue;
    elapsed += ms;
    count += 1;
    if (ms < STALL_MS) {
      usable.push(ms);
    } else {
      stalls += 1;
      stallTime += ms;
    }
  }
  const overall = count > 0 ? elapsed / count : Number.NaN;
  if (stalls >= 3 && stallTime > elapsed / 2) return { verdict: "very-slow", meanMs: overall };
  if (usable.length >= MIN_SAMPLES) {
    const mean = usable.reduce((sum, ms) => sum + ms, 0) / usable.length;
    const verdict = mean > Math.max(budgetMs, VERY_SLOW_MS) ? "very-slow" : mean > budgetMs ? "slow" : "ok";
    return { verdict, meanMs: mean };
  }
  if (elapsed >= windowMs * 0.9) return { verdict: "very-slow", meanMs: overall };
  return { verdict: "unknown", meanMs: Number.NaN };
}

/** The tier a verdict asks for, from `current`. Never up. */
export function tierAfter(current: QualityTier, verdict: Verdict): QualityTier {
  if (verdict === "very-slow") return "low";
  if (verdict !== "slow") return current;
  return TIER_ORDER[Math.min(TIER_ORDER.indexOf(current) + 1, TIER_ORDER.length - 1)];
}

/**
 * The one-shot rule the probe has always applied, from `high`: kept for its
 * tests and for anything that wants a verdict as a tier.
 */
export function tierForSamples(
  samples: readonly number[],
  fallback: QualityTier = "high",
): QualityTier {
  const { verdict } = judgeFrames(samples);
  return verdict === "unknown" ? fallback : tierAfter(fallback, verdict);
}

/** `?quality=low|medium|high`. Anything else is ignored. */
export function tierFromSearch(search: string): QualityTier | null {
  const value = new URLSearchParams(search).get("quality");
  return value === "low" || value === "medium" || value === "high" ? value : null;
}

/**
 * Where a visit starts before anything is measured. A phone -- a touch screen
 * no wider than 600 CSS pixels on its short side -- starts at `medium`:
 * ambient occlusion over a DPR 3 panel is the most expensive thing the app
 * can ask of a phone GPU, it is hard to see at that size, and learning it by
 * measurement means several seconds of a stuttering reveal first.
 */
export function startingTier(handheld: boolean): QualityTier {
  return handheld ? "medium" : "high";
}

function isHandheld(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const short = Math.min(window.screen?.width ?? Infinity, window.screen?.height ?? Infinity);
  return coarse && short <= 600;
}

// ---------------------------------------------------------------------------
// The governor: every decision about stepping, kept pure and time-free
// ---------------------------------------------------------------------------

export interface QualityChange {
  tier: QualityTier;
  reason: string;
  /** The mean frame that prompted it, ms; NaN for a change that was not measured. */
  meanMs: number;
}

/**
 * Decides whether a measured window steps the tier down. It holds the only
 * state that matters for flapping: the tier only ever moves down the list,
 * and once a step fails to help, nothing moves it again.
 */
export class QualityGovernor {
  tier: QualityTier;
  /** A step did not help; the frame rate is bound by something else. */
  stuck = false;
  /** The mean frame before the last step, until the next window reports on it. */
  private before: number | null = null;
  readonly history: QualityChange[] = [];

  constructor(tier: QualityTier = "high") {
    this.tier = tier;
  }

  /**
   * Takes one window's judgement. Returns the new tier when it stepped down,
   * or null when it stayed.
   */
  consider(judgement: Judgement, reason: string): QualityTier | null {
    const { verdict, meanMs } = judgement;
    if (verdict === "unknown") return null;
    if (this.before !== null) {
      // The first window after a step reports on it, whatever its verdict.
      if (Number.isFinite(meanMs) && meanMs > this.before * HELPED_RATIO) this.stuck = true;
      this.before = null;
    }
    if (this.stuck) return null;
    const next = tierAfter(this.tier, verdict);
    if (next === this.tier) return null;
    this.tier = next;
    this.before = meanMs;
    this.history.push({ tier: next, reason, meanMs });
    return next;
  }

  /** An unmeasured step down, one place (a lost context). Returns the new tier or null. */
  force(reason: string): QualityTier | null {
    const next = tierAfter(this.tier, "slow");
    if (next === this.tier) return null;
    this.tier = next;
    this.before = null;
    this.history.push({ tier: next, reason, meanMs: Number.NaN });
    return next;
  }

  /** True when nothing further can happen: the floor, or a step that did not help. */
  get settled(): boolean {
    return this.stuck || this.tier === TIER_ORDER[TIER_ORDER.length - 1];
  }
}

// ---------------------------------------------------------------------------
// The store
// ---------------------------------------------------------------------------

let current: QualitySettings | null = null;
let pinned = false;
let governor: QualityGovernor | null = null;
let landingProbed = false;
let cityProbed = false;
const listeners = new Set<() => void>();

/**
 * The tier in force, decided on first read in the browser: a `?quality=`
 * override, else the starting tier for this kind of device. Deciding before
 * the first frame, rather than in an effect after it, means the canvas is
 * created at the right pixel ratio instead of being resized a moment later.
 */
function ensure(): QualitySettings {
  if (current) return current;
  if (typeof window === "undefined") return QUALITY_SETTINGS.high;
  const override = tierFromSearch(window.location.search);
  pinned = override !== null;
  const tier = override ?? startingTier(isHandheld());
  current = QUALITY_SETTINGS[tier];
  governor = new QualityGovernor(tier);
  if (!override && tier !== "high") {
    governor.history.push({ tier, reason: "phone", meanMs: Number.NaN });
  }
  announce();
  return current;
}

function publish(tier: QualityTier): void {
  if (ensure().tier === tier) return;
  current = QUALITY_SETTINGS[tier];
  for (const listener of listeners) listener();
  announce();
}

/**
 * The dev console handle is the store hook itself (`store/useCityStore.ts`);
 * hanging the tier off it keeps one name to remember and costs nothing in
 * production, where the handle does not exist. The tier alone goes on the
 * root element everywhere, so a report from a visitor's machine can say which
 * tier it ran.
 */
function announce(): void {
  if (typeof window === "undefined" || !current) return;
  document.documentElement.dataset.quality = current.tier;
  if (process.env.NODE_ENV === "production") return;
  const handle = (
    window as unknown as {
      __repoCity?: { quality?: QualityTier; qualityLog?: QualityChange[] };
    }
  ).__repoCity;
  if (handle) {
    handle.quality = current.tier;
    handle.qualityLog = governor ? [...governor.history] : [];
  }
}

/** Pins the tier and stops the probe from overriding it. Used by `?quality=`. */
export function pinQualityTier(tier: QualityTier): void {
  ensure();
  pinned = true;
  publish(tier);
  // `publish` only announces a change; pinning the tier already in force is
  // still worth reporting.
  announce();
}

export function setQualityTier(tier: QualityTier): void {
  ensure();
  if (!pinned) publish(tier);
}

export const qualitySettings = (): QualitySettings => ensure();
const serverSettings = (): QualitySettings => QUALITY_SETTINGS.high;

/**
 * A lost WebGL context usually means the GPU ran out of memory or was reset.
 * The next tier down asks for less of both (no composer targets, a smaller
 * shadow map, smaller textures), so the restored scene is less likely to be
 * lost again. A pinned tier stays pinned.
 */
export function stepDownAfterContextLoss(): void {
  ensure();
  if (pinned || !governor) return;
  const next = governor.force("context lost");
  if (next) publish(next);
}

/** Test seam: forget the pin and the measurement. */
export function resetQuality(): void {
  pinned = false;
  landingProbed = false;
  cityProbed = false;
  governor = new QualityGovernor("high");
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
  return useSyncExternalStore(subscribe, qualitySettings, serverSettings);
}

type Watch = "landing" | "city" | "guard";

/**
 * Times frames and steps the tier down when they are too long (see the top of
 * this file for when).
 *
 * `afterMs` is how long to wait from the moment the caller mounts the model:
 * the end of the generation animation. Measuring during the reveal would time
 * three hundred buildings growing out of the ground and condemn a fast machine
 * to the low tier for the rest of the session. `null` is the empty stage.
 *
 * `surveying` holds the empty stage's look off while a survey is in flight:
 * parsing a large analysis and generating its city are long main-thread
 * tasks, and timed as frames they sent a laptop to a lower tier before its
 * first city had even arrived.
 */
export function useQualityProbe(afterMs: number | null, surveying = false): void {
  useEffect(() => {
    if (typeof window === "undefined") return;
    ensure();
    announce();
    if (pinned || !governor) return;
    const judge = governor;

    let watch: Watch;
    let waitMs: number;
    if (afterMs === null) {
      if (landingProbed || surveying) return;
      watch = "landing";
      waitMs = LANDING_WAIT_MS;
    } else {
      watch = cityProbed ? "guard" : "city";
      waitMs = afterMs;
    }
    if (judge.settled) return;

    let startAt = performance.now() + waitMs;
    let windowStart = 0;
    let samples: number[] = [];
    let last = 0;
    let streak = 0;
    let frame = 0;

    const again = (delay: number, now: number) => {
      samples = [];
      last = 0;
      startAt = now + delay;
    };

    // rAF stops while the tab is hidden, and the window it was measuring is
    // then mostly absence. Start it again once the tab is back.
    const restart = () => {
      if (document.hidden) return;
      samples = [];
      last = 0;
      streak = 0;
      startAt = Math.max(startAt, performance.now() + 500);
    };
    document.addEventListener("visibilitychange", restart);

    const step = (judgement: Judgement, reason: string, now: number): boolean => {
      const next = judge.consider(judgement, reason);
      if (!next) return false;
      setQualityTier(next);
      again(STEP_SETTLE_MS, now);
      return true;
    };

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      if (now < startAt) return;
      if (last === 0) {
        last = now;
        windowStart = now;
        return;
      }
      samples.push(now - last);
      last = now;
      const length = watch === "guard" ? GUARD_WINDOW_MS : PROBE_MS;
      if (now - windowStart < length) return;

      if (watch === "guard") {
        const judgement = judgeFrames(samples, GUARD_MS, length);
        const slow = judgement.verdict === "slow" || judgement.verdict === "very-slow";
        streak = slow ? streak + 1 : 0;
        if (streak >= GUARD_STREAK) {
          streak = 0;
          step(judgement, "guard", now);
        } else {
          // A window after a step reports on it even when it is not slow.
          if (!slow) judge.consider(judgement, "guard");
          again(0, now);
        }
      } else {
        const judgement = judgeFrames(samples, STEP_DOWN_MS, length);
        // A step is followed by another look at the new tier; anything else
        // ends this watch.
        if (!step(judgement, watch, now)) {
          if (watch === "landing") {
            landingProbed = true;
            cancelAnimationFrame(frame);
            return;
          }
          cityProbed = true;
          watch = "guard";
          again(0, now);
        }
      }
      if (judge.settled) {
        if (watch === "landing") landingProbed = true;
        else cityProbed = true;
        cancelAnimationFrame(frame);
      }
    };

    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", restart);
    };
  }, [afterMs, surveying]);
}
