import { describe, expect, it } from "vitest";
import { audioScenes, lookingAtOrigin, measureLevels, toDb } from "./audioLevels";
import { MAX_LOCAL_SOURCES } from "./audioSources";

describe("measureLevels", () => {
  it("reads a full-scale square wave as 0 dBFS RMS and peak", () => {
    const square = Float32Array.from({ length: 1000 }, (_, i) => (i % 2 ? 1 : -1));
    const { rmsDb, peakDb } = measureLevels([square, square]);
    expect(rmsDb).toBeCloseTo(0, 6);
    expect(peakDb).toBeCloseTo(0, 6);
  });

  it("reads a sine at amplitude 0.5 as about -9 dBFS RMS and -6 peak", () => {
    const sine = Float32Array.from({ length: 48000 }, (_, i) => 0.5 * Math.sin((2 * Math.PI * 440 * i) / 48000));
    const { rmsDb, peakDb } = measureLevels([sine]);
    expect(rmsDb).toBeCloseTo(-9.03, 1);
    expect(peakDb).toBeCloseTo(-6.02, 1);
  });

  it("skips the fade-in, and calls silence minus infinity", () => {
    const data = new Float32Array(100);
    data[5] = 1;
    expect(measureLevels([data], 10).peakDb).toBe(Number.NEGATIVE_INFINITY);
    expect(measureLevels([data]).peakDb).toBe(0);
    expect(toDb(0)).toBe(Number.NEGATIVE_INFINITY);
  });
});

describe("audioScenes", () => {
  const scenes = audioScenes();

  it("covers every settlement at every hour, and the close-ups", () => {
    for (const tier of ["village", "town", "city", "metropolis"]) {
      for (const time of ["morning", "afternoon", "evening", "night"]) {
        expect(scenes.some((s) => s.name === `${tier} ${time}`)).toBe(true);
      }
    }
    expect(scenes.filter((s) => s.local.length > 0).length).toBeGreaterThanOrEqual(3);
    expect(new Set(scenes.map((s) => s.name)).size).toBe(scenes.length);
  });

  it("keeps each close-up within the voice budget", () => {
    for (const scene of scenes) expect(scene.local.length).toBeLessThanOrEqual(MAX_LOCAL_SOURCES);
  });

  it("aims the camera at the origin with an up vector square to its view", () => {
    const pose = lookingAtOrigin(100);
    const dot = pose.forward.reduce((sum, v, i) => sum + v * pose.up[i], 0);
    expect(dot).toBeCloseTo(0, 9);
    expect(Math.hypot(...pose.position)).toBeCloseTo(100, 9);
    expect(pose.up[1]).toBeGreaterThan(0);
  });
});
