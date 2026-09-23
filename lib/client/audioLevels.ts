/**
 * Level metering for the soundscape's offline renders
 * (`components/audio/offline.ts`, driven by `scripts/audio-levels.ts`), and
 * the scenes they render: every settlement at every hour from the overview,
 * plus the close-ups where the local sources speak.
 *
 * Nobody on the team can listen from a headless browser, so the balance is
 * checked by meter: every scene's RMS should sit in a narrow, quiet band,
 * and no scene may peak above -3 dBFS.
 *
 * Pure. Unit tested in `audioLevels.test.ts`.
 */

import type { MixScene } from "./audioMix";
import type { NearSource, SoundSource } from "./audioSources";
import type { Vec3 } from "@/types/city";

export interface Levels {
  /** Root mean square over both channels, dBFS. */
  rmsDb: number;
  /** The largest absolute sample, dBFS. */
  peakDb: number;
}

/** Amplitude to dBFS; silence is -Infinity. */
export function toDb(amplitude: number): number {
  return amplitude > 0 ? 20 * Math.log10(amplitude) : Number.NEGATIVE_INFINITY;
}

/** RMS and peak of `channels` from `skip` samples in. */
export function measureLevels(channels: readonly Float32Array[], skip = 0): Levels {
  let sum = 0;
  let count = 0;
  let peak = 0;
  for (const data of channels) {
    for (let i = Math.max(0, skip); i < data.length; i++) {
      const v = data[i];
      sum += v * v;
      count++;
      const a = v < 0 ? -v : v;
      if (a > peak) peak = a;
    }
  }
  return { rmsDb: toDb(count ? Math.sqrt(sum / count) : 0), peakDb: toDb(peak) };
}

/** The ceiling no scene may pass. */
export const PEAK_CEILING_DB = -3;

export interface AudioScene {
  name: string;
  scene: MixScene;
  altitude: number;
  /** Local sources, positioned around the origin, which is where the camera looks. */
  local: NearSource[];
  pose: { position: Vec3; forward: Vec3; up: Vec3 };
}

const TIMES = [
  ["morning", 0],
  ["afternoon", 1],
  ["evening", 2],
  ["night", 3],
] as const;

const TIERS = ["village", "town", "city", "metropolis"] as const;

const base = (over: Partial<MixScene> = {}): MixScene => ({
  tier: "city",
  phase: 1,
  health: 72,
  activity: 0.6,
  archived: false,
  traffic: 0.6,
  ...over,
});

const norm = (v: Vec3): Vec3 => {
  const l = Math.hypot(...v) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

/** A camera `distance` back from the origin, 47 degrees up, looking at it (the overview's angle). */
export function lookingAtOrigin(distance: number): AudioScene["pose"] {
  const up = Math.sin((47 * Math.PI) / 180);
  const out = Math.cos((47 * Math.PI) / 180);
  const position: Vec3 = [0, distance * up, distance * out];
  const forward = norm([0, -position[1], -position[2]]);
  // Perpendicular to forward, in the vertical plane, pointing up.
  const upVec = norm([0, out, -up]);
  return { position, forward, up: upVec };
}

const near = (source: SoundSource): NearSource => ({
  source,
  distance: Math.hypot(...source.position),
});

const src = (id: string, kind: SoundSource["kind"], position: Vec3, extra: Partial<SoundSource> = {}): SoundSource => ({
  id,
  kind,
  position,
  level: 1,
  ...extra,
});

/** Every scene the level check renders. */
export function audioScenes(): AudioScene[] {
  const scenes: AudioScene[] = [];
  const overview = lookingAtOrigin(220);
  const ground = lookingAtOrigin(16);

  for (const tier of TIERS) {
    for (const [time, phase] of TIMES) {
      scenes.push({ name: `${tier} ${time}`, scene: base({ tier, phase }), altitude: 1, local: [], pose: overview });
    }
  }
  scenes.push({ name: "empty stage afternoon", scene: base({ tier: null }), altitude: 1, local: [], pose: overview });
  scenes.push({
    name: "archived metropolis afternoon",
    scene: base({ tier: "metropolis", archived: true, health: 30, activity: 0.02, traffic: 0.06 }),
    altitude: 1,
    local: [],
    pose: overview,
  });
  scenes.push({
    name: "thriving metropolis afternoon",
    scene: base({ tier: "metropolis", health: 96, activity: 1, traffic: 1 }),
    altitude: 1,
    local: [],
    pose: overview,
  });
  scenes.push({
    name: "close: city fire and crane",
    scene: base({ tier: "city" }),
    altitude: 0.1,
    local: [near(src("fire", "fire", [-8, 0, 4])), near(src("crane", "crane", [12, 0, -6]))],
    pose: ground,
  });
  scenes.push({
    name: "close: town station (6 trains/min)",
    scene: base({ tier: "town" }),
    altitude: 0.1,
    local: [near(src("station", "station", [6, 0, -4], { trainsPerMinute: 6 }))],
    pose: ground,
  });
  scenes.push({
    name: "close: village power (failing CI)",
    scene: base({ tier: "village" }),
    altitude: 0.1,
    local: [near(src("power", "power", [5, 0, 3], { level: 1, troubled: true }))],
    pose: ground,
  });
  scenes.push({
    name: "worst case: thriving metropolis, all four locals at 6 units",
    scene: base({ tier: "metropolis", health: 100, activity: 1, traffic: 1 }),
    altitude: 0,
    local: [
      near(src("fire", "fire", [-6, 0, 0])),
      near(src("crane", "crane", [6, 0, 0])),
      near(src("power", "power", [0, 0, 6], { level: 1 })),
      near(src("station", "station", [0, 0, -6], { trainsPerMinute: 6 })),
    ],
    pose: ground,
  });
  return scenes;
}
