import { describe, expect, it } from "vitest";
import sample from "@/fixtures/sample.analysis.json";
import stress from "@/fixtures/stress.analysis.json";
import { generateCity } from "@/lib/city/generator";
import { TRAIN_CENTRE, trainPose } from "@/components/city/models/landmarks/station";
import type { RepoAnalysis } from "@/types/analysis";
import type { CityModel } from "@/types/city";
import {
  LOCAL_RANGE,
  MAX_LOCAL_SOURCES,
  distanceGain,
  nearestSources,
  nextTrainArrival,
  soundSources,
  spatialize,
  stationArrivals,
  viewFocus,
  type SoundSource,
} from "./audioSources";

const city = (analysis: unknown, tier?: "village" | "town" | "city" | "metropolis"): CityModel =>
  generateCity(analysis as RepoAnalysis, { tier })!;

const src = (id: string, kind: SoundSource["kind"], x: number, z = 0): SoundSource => ({
  id,
  kind,
  position: [x, 0, z],
  level: 1,
});

describe("soundSources", () => {
  it("finds the sample city's fire, crane, power station and transit station", () => {
    const sources = soundSources(city(sample));
    const kinds = sources.map((s) => s.kind).sort();
    expect(kinds).toEqual(["crane", "fire", "power", "station"]);
    const station = sources.find((s) => s.kind === "station")!;
    expect(station.trainsPerMinute).toBeGreaterThan(0);
  });

  it("voices only hero sites, and only working ones", () => {
    const model = city(stress, "metropolis");
    const sources = soundSources(model);
    const ids = new Set(sources.map((s) => s.id));
    for (const site of model.constructionSites) {
      const working = (site.state === "active" || site.state === "slow") && (site.form ?? "site") === "site";
      expect(ids.has(site.id)).toBe(working && site.lod !== "crowd");
    }
    for (const crowd of model.backlog?.constructionSites ?? []) expect(ids.has(crowd.id)).toBe(false);
    for (const crowd of model.backlog?.incidents ?? []) expect(ids.has(crowd.id)).toBe(false);
  });

  it("gives an empty city nothing to voice", () => {
    const model = city(sample);
    expect(soundSources({ ...model, incidents: [], constructionSites: [], landmarks: [] })).toEqual([]);
  });
});

describe("nearestSources", () => {
  const sources = [
    src("far-fire", "fire", 80),
    src("crane-a", "crane", 5),
    src("crane-b", "crane", 6),
    src("crane-c", "crane", 7),
    src("power", "power", 20),
    src("station", "station", 30),
    src("out-of-range", "fire", LOCAL_RANGE + 1),
  ];

  it("takes the nearest few, nearest first, no more than the cap", () => {
    const near = nearestSources(sources, [0, 0, 0]);
    expect(near).toHaveLength(MAX_LOCAL_SOURCES);
    const distances = near.map((n) => n.distance);
    expect(distances).toEqual([...distances].sort((a, b) => a - b));
  });

  it("keeps any one kind to two, so the landmarks still get a voice", () => {
    const near = nearestSources(sources, [0, 0, 0]).map((n) => n.source.id);
    expect(near).toEqual(["crane-a", "crane-b", "power", "station"]);
  });

  it("ignores what is out of range", () => {
    const near = nearestSources(sources, [LOCAL_RANGE + 1, 0, 0], 8).map((n) => n.source.id);
    expect(near).toContain("out-of-range");
    expect(nearestSources(sources, [0, 0, 0], 8).map((n) => n.source.id)).not.toContain("out-of-range");
  });

  it("follows the listener", () => {
    const near = nearestSources(sources, [80, 0, 0], 1);
    expect(near[0].source.id).toBe("far-fire");
    expect(near[0].distance).toBe(0);
  });

  it("breaks ties by id, and handles nothing", () => {
    const tie = nearestSources([src("b", "fire", 1), src("a", "fire", -1)], [0, 0, 0], 1);
    expect(tie[0].source.id).toBe("a");
    expect(nearestSources([], [0, 0, 0])).toEqual([]);
    expect(nearestSources(sources, [0, 0, 0], 0)).toEqual([]);
  });
});

describe("viewFocus", () => {
  it("meets the ground where the camera looks", () => {
    const { point, distance } = viewFocus([0, 10, 10], [0, -1, -1]);
    expect(point[0]).toBeCloseTo(0);
    expect(point[2]).toBeCloseTo(0);
    expect(distance).toBeCloseTo(Math.hypot(10, 10));
  });

  it("falls back to the point below a camera looking at the horizon", () => {
    expect(viewFocus([5, 30, 7], [1, 0, 0])).toEqual({ point: [5, 0, 7], distance: 30 });
  });
});

describe("nextTrainArrival", () => {
  it("lands exactly when the renderer's train stops at the platform", () => {
    for (const perMinute of [0.25, 0.8, 1.4, 4.5, 6]) {
      let clock = 3.3;
      for (let i = 0; i < 4; i++) {
        const arrival = nextTrainArrival(clock, perMinute);
        expect(arrival).toBeGreaterThanOrEqual(clock);
        expect(trainPose(arrival + 1e-6, perMinute).x).toBeCloseTo(TRAIN_CENTRE, 6);
        // Still running in a moment before.
        expect(trainPose(arrival - 0.2, perMinute).x).toBeGreaterThan(TRAIN_CENTRE);
        clock = arrival + 0.01;
      }
    }
  });

  it("is one period apart", () => {
    const a = nextTrainArrival(0, 2);
    expect(nextTrainArrival(a + 0.001, 2) - a).toBeCloseTo(30);
  });

  it("never comes when no trains run", () => {
    expect(nextTrainArrival(5, 0)).toBe(Number.POSITIVE_INFINITY);
    expect(stationArrivals(0)).toBe(0);
    expect(stationArrivals(2)).toBe(1.4);
    expect(stationArrivals(1, 3)).toBe(3);
  });
});

describe("distanceGain", () => {
  it("is 1 up close and falls with distance", () => {
    expect(distanceGain(0)).toBe(1);
    expect(distanceGain(14)).toBe(1);
    expect(distanceGain(50)).toBeLessThan(distanceGain(30));
    expect(distanceGain(300)).toBeLessThan(0.06);
  });
});

describe("spatialize", () => {
  // A camera at the origin looking down -z, up +y: +x is on its right.
  const pose = { position: [0, 0, 0], forward: [0, 0, -1], up: [0, 1, 0] } as Parameters<typeof spatialize>[0];

  it("puts a source on the right to the right, and one on the left to the left", () => {
    expect(spatialize(pose, [10, 0, 0]).pan).toBeGreaterThan(0.5);
    expect(spatialize(pose, [-10, 0, 0]).pan).toBeLessThan(-0.5);
    expect(spatialize(pose, [0, 0, -10]).pan).toBeCloseTo(0);
  });

  it("never pans hard into one ear", () => {
    expect(Math.abs(spatialize(pose, [100, 0, 0]).pan)).toBeLessThanOrEqual(0.85);
  });

  it("falls off with distance, as the inverse law says", () => {
    const near = spatialize(pose, [0, 0, -10]);
    const far = spatialize(pose, [0, 0, -100]);
    expect(near.gain).toBe(1);
    expect(far.gain).toBeCloseTo(distanceGain(100));
    expect(far.distance).toBeCloseTo(100);
  });

  it("copes with a source exactly at the camera", () => {
    expect(spatialize(pose, [0, 0, 0])).toEqual({ gain: 1, pan: 0, distance: 0 });
  });
});
