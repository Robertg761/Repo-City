/**
 * The arithmetic behind the `?perf=1` overlay (PLAN.md 76.11 S9 and 76.13),
 * kept free of three.js and React so it is unit tested rather than eyeballed.
 *
 * Frame rate is judged on the median of a rolling window of frame intervals,
 * not the mean: one garbage-collection pause or a shader compile should show
 * in the p95, not drag the headline number down with it. The window is time
 * based, so a software renderer drawing two frames a second still reports
 * over the last few seconds instead of over the last few minutes.
 */

import type { QualityTier } from "../quality";

/** How far back the rolling window reaches. */
export const WINDOW_MS = 5000;
/** Upper bound on samples kept, whatever the frame rate. */
export const WINDOW_MAX = 600;
/**
 * A gap this long is a stall (a debugger pause, a laptop lid), not a frame.
 * It is generous on purpose: a software renderer really does take a second
 * or two per frame, and those frames are the measurement. A hidden tab is
 * handled by `gap()` rather than by this threshold.
 */
export const STALL_MS = 10_000;

/**
 * Linear-interpolated percentile, `p` in 0..100, of an unsorted list. NaN for
 * an empty list, so a caller cannot mistake "no data" for "zero".
 */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = (Math.min(100, Math.max(0, p)) / 100) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (rank - lo);
}

export const median = (values: readonly number[]): number => percentile(values, 50);

export interface FrameStats {
  /** Frames a second, from the median interval. */
  fps: number;
  /** Median frame interval in ms. */
  frameMs: number;
  /** 95th percentile frame interval in ms. */
  frameP95: number;
  /** Median main-thread time per frame (useFrame work plus draw submission), ms. */
  cpuMs: number;
  /** Intervals in the window. */
  samples: number;
}

/**
 * A rolling, time-bounded window of frames. `push(now, cpuMs)` once per
 * frame with the frame's timestamp; the interval is taken from the previous
 * push. A stall resets the reference point without recording an interval.
 */
export class FrameWindow {
  private times: number[] = [];
  private intervals: number[] = [];
  private cpu: number[] = [];
  private last: number | null = null;
  /** Every frame ever pushed, stalls included. */
  frames = 0;

  constructor(
    private readonly windowMs = WINDOW_MS,
    private readonly max = WINDOW_MAX,
  ) {}

  push(now: number, cpuMs = 0): void {
    this.frames += 1;
    const previous = this.last;
    this.last = now;
    if (previous === null) return;
    const interval = now - previous;
    if (!(interval > 0) || interval >= STALL_MS) return;
    this.times.push(now);
    this.intervals.push(interval);
    this.cpu.push(cpuMs);
    this.trim(now);
  }

  /**
   * The next push starts a new interval instead of closing one: call it when
   * the tab comes back into view, since rAF did not run while it was hidden.
   */
  gap(): void {
    this.last = null;
  }

  /** Forget everything, for a measurement that should start clean. */
  clear(): void {
    this.times = [];
    this.intervals = [];
    this.cpu = [];
    this.last = null;
  }

  private trim(now: number): void {
    let drop = 0;
    while (drop < this.times.length && now - this.times[drop] > this.windowMs) drop += 1;
    drop = Math.max(drop, this.times.length - this.max);
    if (drop > 0) {
      this.times.splice(0, drop);
      this.intervals.splice(0, drop);
      this.cpu.splice(0, drop);
    }
  }

  stats(): FrameStats {
    const frameMs = median(this.intervals);
    return {
      fps: frameMs > 0 ? 1000 / frameMs : Number.NaN,
      frameMs,
      frameP95: percentile(this.intervals, 95),
      cpuMs: median(this.cpu),
      samples: this.intervals.length,
    };
  }
}

/** What the overlay shows and `window.__repoCity.perf` carries. */
export interface PerfSnapshot extends FrameStats {
  /** Frames observed since the overlay mounted. */
  frames: number;
  /** `renderer.info.render` over one whole frame: every pass, shadow included. */
  calls: number;
  triangles: number;
  points: number;
  lines: number;
  /** The shadow-map pass alone, already included in `calls` and `triangles`. */
  shadowCalls: number;
  shadowTriangles: number;
  /** `renderer.info.memory` and the compiled program count. */
  geometries: number;
  textures: number;
  programs: number;
  quality: QualityTier;
  /** The settlement tier of the city on screen, or null on the empty stage. */
  settlement: string | null;
  /** Drawing buffer size in device pixels, and the pixel ratio behind it. */
  width: number;
  height: number;
  dpr: number;
  /** `performance.now()` when the snapshot was taken. */
  at: number;
}

/**
 * Dev only, and only with `?perf=1` (or `?perf=true`). Everything else,
 * `?perf=0` included, leaves the renderer untouched.
 */
export function perfEnabled(search: string, nodeEnv: string | undefined): boolean {
  if (nodeEnv === "production") return false;
  const value = new URLSearchParams(search).get("perf");
  return value === "1" || value === "true";
}

/** `?perfWindow=` in ms, for a software renderer that draws a few frames a second. */
export function perfWindowMs(search: string): number {
  const value = Number(new URLSearchParams(search).get("perfWindow"));
  return Number.isFinite(value) && value > 0 ? Math.min(60_000, Math.max(1000, value)) : WINDOW_MS;
}

const whole = (n: number): string => (Number.isFinite(n) ? Math.round(n).toLocaleString("en-US") : "-");
const tenth = (n: number): string => (Number.isFinite(n) ? n.toFixed(1) : "-");

/** Millions with one decimal past a million, thousands with a k past ten thousand. */
export function compact(n: number): string {
  if (!Number.isFinite(n)) return "-";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 10_000) return `${(n / 1000).toFixed(1)}k`;
  return whole(n);
}

/** The overlay's text, one line per row. */
export function formatPerf(s: PerfSnapshot): string[] {
  return [
    `${tenth(s.fps)} fps  median ${tenth(s.frameMs)} ms  p95 ${tenth(s.frameP95)} ms`,
    `cpu ${tenth(s.cpuMs)} ms  window ${s.samples} frames`,
    `calls ${whole(s.calls)}  tris ${compact(s.triangles)}`,
    `shadow ${whole(s.shadowCalls)} calls  ${compact(s.shadowTriangles)} tris`,
    `geo ${whole(s.geometries)}  tex ${whole(s.textures)}  prog ${whole(s.programs)}`,
    `quality ${s.quality}  ${s.settlement ?? "no city"}  ${s.width}x${s.height} @${tenth(s.dpr)}`,
  ];
}
