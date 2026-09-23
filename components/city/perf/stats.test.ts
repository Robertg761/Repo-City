import { describe, expect, it } from "vitest";
import {
  FrameWindow,
  STALL_MS,
  WINDOW_MAX,
  compact,
  formatPerf,
  median,
  percentile,
  perfEnabled,
  perfWindowMs,
  WINDOW_MS,
  type PerfSnapshot,
} from "./stats";

/** Push `count` frames `ms` apart, starting at `start`; returns the last timestamp. */
function run(window: FrameWindow, ms: number, count: number, start = 0, cpu = 0): number {
  let t = start;
  for (let i = 0; i < count; i++) {
    window.push(t, cpu);
    t += ms;
  }
  return t - ms;
}

describe("percentile", () => {
  it("interpolates between ranks", () => {
    expect(percentile([1, 2, 3, 4, 5], 50)).toBe(3);
    expect(percentile([1, 2, 3, 4], 50)).toBe(2.5);
    expect(percentile([10, 20], 95)).toBeCloseTo(19.5);
    expect(percentile([5, 1, 3], 0)).toBe(1);
    expect(percentile([5, 1, 3], 100)).toBe(5);
  });

  it("is NaN on nothing, never zero", () => {
    expect(percentile([], 50)).toBeNaN();
    expect(median([])).toBeNaN();
  });

  it("does not reorder the caller's list", () => {
    const values = [3, 1, 2];
    median(values);
    expect(values).toEqual([3, 1, 2]);
  });
});

describe("the rolling frame window", () => {
  it("reports sixty frames a second from 16.7 ms intervals", () => {
    const window = new FrameWindow();
    run(window, 1000 / 60, 120);
    const stats = window.stats();
    expect(stats.fps).toBeCloseTo(60, 5);
    expect(stats.frameMs).toBeCloseTo(16.667, 2);
    expect(stats.samples).toBe(119);
  });

  it("keeps occasional long frames out of the median and in the p95", () => {
    const window = new FrameWindow();
    let t = run(window, 16, 50);
    // One 80 ms hitch in every ten frames: under 7% of the window.
    for (let i = 0; i < 100; i++) {
      t += i % 10 === 0 ? 80 : 16;
      window.push(t);
    }
    const stats = window.stats();
    expect(stats.frameMs).toBe(16);
    expect(stats.fps).toBeCloseTo(62.5);
    expect(stats.frameP95).toBeGreaterThan(16);
    expect(stats.frameP95).toBeLessThanOrEqual(80);
  });

  it("forgets frames older than its window", () => {
    const window = new FrameWindow(1000);
    const t = run(window, 50, 40); // two seconds at 20 fps
    run(window, 10, 150, t + 10); // then 1.5 s at 100 fps
    expect(window.stats().fps).toBeCloseTo(100);
    expect(window.stats().samples).toBeLessThanOrEqual(101);
  });

  it("never holds more than its cap", () => {
    const window = new FrameWindow(60_000);
    run(window, 1, WINDOW_MAX * 3);
    expect(window.stats().samples).toBe(WINDOW_MAX);
  });

  it("treats a stall as a gap, not a frame", () => {
    const window = new FrameWindow();
    const t = run(window, 20, 30);
    window.push(t + STALL_MS + 500);
    run(window, 20, 30, t + STALL_MS + 520);
    const stats = window.stats();
    expect(stats.frameMs).toBe(20);
    expect(stats.frameP95).toBe(20);
    expect(window.frames).toBe(61);
  });

  it("keeps a software renderer's slow frames: they are the measurement", () => {
    const window = new FrameWindow(20_000);
    run(window, 1400, 12);
    expect(window.stats().samples).toBe(11);
    expect(window.stats().fps).toBeCloseTo(1000 / 1400);
  });

  it("does not count the time a hidden tab was away as a frame", () => {
    const window = new FrameWindow(60_000);
    const t = run(window, 20, 30);
    window.gap();
    run(window, 20, 30, t + 4000);
    expect(window.stats().frameP95).toBe(20);
    expect(window.stats().samples).toBe(58);
  });

  it("reports main-thread time separately from the interval", () => {
    const window = new FrameWindow();
    run(window, 33, 20, 0, 4);
    expect(window.stats().cpuMs).toBe(4);
  });

  it("starts clean after clear()", () => {
    const window = new FrameWindow();
    const t = run(window, 100, 20);
    window.clear();
    // The first push after clearing only sets the reference point.
    run(window, 10, 11, t + 5000);
    expect(window.stats().frameMs).toBe(10);
    expect(window.stats().samples).toBe(10);
  });

  it("has nothing to say before two frames", () => {
    const window = new FrameWindow();
    window.push(0);
    expect(window.stats().samples).toBe(0);
    expect(window.stats().fps).toBeNaN();
  });
});

describe("perfEnabled", () => {
  it("needs ?perf=1 (or true) in a development build", () => {
    expect(perfEnabled("?perf=1", "development")).toBe(true);
    expect(perfEnabled("?tier=village&perf=true", "development")).toBe(true);
    expect(perfEnabled("?perf=0", "development")).toBe(false);
    expect(perfEnabled("", "development")).toBe(false);
    expect(perfEnabled("?perf=1", "test")).toBe(true);
  });

  it("is always off in production", () => {
    expect(perfEnabled("?perf=1", "production")).toBe(false);
  });

  it("takes a longer window for a slow renderer, within bounds", () => {
    expect(perfWindowMs("?perf=1")).toBe(WINDOW_MS);
    expect(perfWindowMs("?perfWindow=20000")).toBe(20_000);
    expect(perfWindowMs("?perfWindow=10")).toBe(1000);
    expect(perfWindowMs("?perfWindow=9999999")).toBe(60_000);
    expect(perfWindowMs("?perfWindow=soon")).toBe(WINDOW_MS);
  });
});

describe("the overlay text", () => {
  const snapshot: PerfSnapshot = {
    fps: 58.84,
    frameMs: 17,
    frameP95: 21.26,
    cpuMs: 3.2,
    samples: 294,
    frames: 1200,
    calls: 412,
    triangles: 1_184_000,
    points: 0,
    lines: 0,
    shadowCalls: 180,
    shadowTriangles: 402_300,
    geometries: 310,
    textures: 22,
    programs: 41,
    quality: "high",
    settlement: "metropolis",
    width: 1920,
    height: 1080,
    dpr: 1,
    at: 0,
  };

  it("puts the gate numbers on the first lines", () => {
    const lines = formatPerf(snapshot);
    expect(lines[0]).toBe("58.8 fps  median 17.0 ms  p95 21.3 ms");
    expect(lines[2]).toBe("calls 412  tris 1.18M");
    expect(lines[3]).toBe("shadow 180 calls  402.3k tris");
    expect(lines[5]).toBe("quality high  metropolis  1920x1080 @1.0");
  });

  it("shows a dash rather than NaN before the window fills", () => {
    const lines = formatPerf({ ...snapshot, fps: Number.NaN, frameMs: Number.NaN, frameP95: Number.NaN });
    expect(lines[0]).toBe("- fps  median - ms  p95 - ms");
  });

  it("abbreviates large counts", () => {
    expect(compact(950)).toBe("950");
    expect(compact(9_999)).toBe("9,999");
    expect(compact(12_345)).toBe("12.3k");
    expect(compact(2_500_000)).toBe("2.50M");
  });
});
