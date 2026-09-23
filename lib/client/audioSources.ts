/**
 * LOCAL SOUND SOURCES: the things in the city that make their own noise when
 * the camera is close enough to hear them, and which few of them to voice.
 *
 *   fire      a hero fire: a soft crackle, and now and then a distant siren
 *   crane     an active construction site: the odd clank of steel
 *   power     the CI power station: a low mains hum
 *   station   the transit station: a chime as each train pulls in
 *
 * Only the nearest few, to where the camera is looking, get a voice
 * (`nearestSources`), and never more than two of one kind, so four cranes in
 * a row cannot crowd out the station beside them.
 *
 * Pure: no Web Audio, no three.js. Unit tested in `audioSources.test.ts`.
 */

import type { CityModel, Vec3 } from "@/types/city";

export type SourceKind = "fire" | "crane" | "power" | "station";

export interface SoundSource {
  /** The entity's id: a voice follows its source across updates. */
  id: string;
  kind: SourceKind;
  position: Vec3;
  /** How strongly this source sounds, 0 to 1. */
  level: number;
  /** Station only: arrivals a minute, the timetable the running train keeps. */
  trainsPerMinute?: number;
  /** Power only: CI is failing, so the hum wavers. */
  troubled?: boolean;
}

/** The most local voices at once. */
export const MAX_LOCAL_SOURCES = 4;
/** And the most of any one kind among them. */
export const MAX_PER_KIND = 2;
/** Beyond this distance from the view's focus a source is not a candidate at all. */
export const LOCAL_RANGE = 90;

/**
 * Arrivals a minute when the model does not say, by station level: the
 * bands the renderer falls back to (`fallbackArrivals` in
 * `components/city/models/landmarks/station.ts`).
 */
export function stationArrivals(level: number, perMinute?: number): number {
  if (typeof perMinute === "number" && perMinute > 0) return perMinute;
  if (level >= 3) return 4.5;
  if (level === 2) return 1.4;
  return level === 1 ? 0.8 : 0;
}

/** Every candidate source in a city. Cheap: a scan of the heroes and landmarks. */
export function soundSources(city: CityModel): SoundSource[] {
  const sources: SoundSource[] = [];

  for (const incident of city.incidents) {
    if (incident.lod === "crowd") continue;
    // A hero draws its fire for the "major" state (`IssueIncident.tsx`).
    const fire = incident.state === "major" || incident.form === "fire";
    if (!fire) continue;
    sources.push({
      id: incident.id,
      kind: "fire",
      position: incident.position,
      level: incident.state === "major" ? 1 : 0.7,
    });
  }

  for (const site of city.constructionSites) {
    if (site.lod === "crowd") continue;
    if (site.form !== undefined && site.form !== "site") continue;
    if (site.state !== "active" && site.state !== "slow") continue;
    sources.push({
      id: site.id,
      kind: "crane",
      position: site.position,
      level: site.state === "active" ? 1 : 0.5,
    });
  }

  for (const landmark of city.landmarks) {
    if (landmark.landmarkType === "power") {
      if (landmark.state === "none") continue;
      sources.push({
        id: landmark.id,
        kind: "power",
        position: landmark.position,
        level: 0.55 + 0.15 * Math.min(3, landmark.level),
        troubled: landmark.state === "failing" || landmark.state === "recent-failure",
      });
    } else if (landmark.landmarkType === "station") {
      const perMinute = stationArrivals(landmark.level, landmark.detail?.trainsPerMinute);
      if (perMinute <= 0) continue;
      sources.push({
        id: landmark.id,
        kind: "station",
        position: landmark.position,
        level: 1,
        trainsPerMinute: perMinute,
      });
    }
  }

  return sources;
}

export interface NearSource {
  source: SoundSource;
  distance: number;
}

/**
 * The nearest `n` sources to `point` within `range`, at most `perKind` of any
 * one kind, nearest first. Ties go to the id, so the choice is stable.
 */
export function nearestSources(
  sources: readonly SoundSource[],
  point: Vec3,
  n = MAX_LOCAL_SOURCES,
  range = LOCAL_RANGE,
  perKind = MAX_PER_KIND,
): NearSource[] {
  if (n <= 0) return [];
  const near: NearSource[] = [];
  for (const source of sources) {
    const dx = source.position[0] - point[0];
    const dy = source.position[1] - point[1];
    const dz = source.position[2] - point[2];
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (distance <= range) near.push({ source, distance });
  }
  near.sort((a, b) => a.distance - b.distance || (a.source.id < b.source.id ? -1 : 1));

  const chosen: NearSource[] = [];
  const perKindCount: Partial<Record<SourceKind, number>> = {};
  for (const candidate of near) {
    const count = perKindCount[candidate.source.kind] ?? 0;
    if (count >= perKind) continue;
    perKindCount[candidate.source.kind] = count + 1;
    chosen.push(candidate);
    if (chosen.length >= n) break;
  }
  return chosen;
}

/**
 * Where the camera is looking: its view ray met with the ground plane, or,
 * for a ray that never comes down, the point below the camera. Also the
 * distance from the camera to that point, which is what sets the altitude
 * of the mix (`cameraAltitude` in `audioMix.ts`).
 */
export function viewFocus(position: Vec3, direction: Vec3): { point: Vec3; distance: number } {
  const [px, py, pz] = position;
  const [dx, dy, dz] = direction;
  const length = Math.hypot(dx, dy, dz) || 1;
  const uy = dy / length;
  if (uy < -0.05 && py > 0) {
    const distance = py / -uy;
    return { point: [px + (dx / length) * distance, 0, pz + (dz / length) * distance], distance };
  }
  return { point: [px, 0, pz], distance: Math.max(0, py) };
}

/** The station timetable's run in and dwell, in seconds (`trainPose` in station.ts). */
const TRAIN_RUN = 4.2;
const TRAIN_DWELL = 5.5;

/**
 * The first clock time at or after `seconds` when the running train comes to
 * a stop at the platform, on the renderer's own timetable (`trainPose` in
 * `components/city/models/landmarks/station.ts`, driven by R3F's clock).
 * Infinity when no trains run.
 */
export function nextTrainArrival(seconds: number, perMinute: number): number {
  if (!(perMinute > 0) || !Number.isFinite(seconds)) return Number.POSITIVE_INFINITY;
  const period = 60 / perMinute;
  const squeeze = Math.min(1, (period * 0.9) / (TRAIN_RUN * 2 + TRAIN_DWELL));
  const run = TRAIN_RUN * squeeze;
  const k = Math.ceil((seconds - run) / period);
  return k * period + run;
}

/**
 * Distance attenuation for a local source when the engine does not use a
 * `PannerNode`'s own model: the inverse-distance law with a reference
 * distance, which is what the panner does too, so the offline renders and
 * the unit tests can reason about levels.
 */
export function distanceGain(distance: number, reference = 14, rolloff = 1.1): number {
  if (!(distance > reference)) return 1;
  return reference / (reference + rolloff * (distance - reference));
}
