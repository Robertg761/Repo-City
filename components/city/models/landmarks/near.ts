/**
 * The landmarks' near (detailed) level (`blender/landmarks/*_near.py`).
 *
 * A landmark is drawn once, so its near level is not an instanced layer's
 * close-up: it simply replaces the lean model wherever the quality tier
 * allows (`Landmark.tsx`), and the lean model stays for the `low` tier and for
 * the procedural fallback. Each near model is the lean model with far more
 * drawn on it, in the same frame, on the same pivot and in the same colour
 * slots, so the renderer's paint, state and animation code takes either.
 * Markers (lamps, engine spots, anchors) stay the lean models': the near
 * models carry none of their own.
 *
 * Only the Blender models have a near level; every accessor here returns null
 * without them, and the caller falls back to the lean layout. The
 * `blender...Near` builders are what the tests call (`BLENDER_MODELS` is
 * false in node).
 *
 * Nothing here reads a model while the module is evaluated: the data arrives
 * with `loadModels()` (`../imported.ts`).
 */

import { importedMarker, importedMarkers, isModelLoaded } from "../imported";
import { BLENDER_MODELS } from "../modelSource";
import { cached, type V3 } from "./assembly";
import { blenderSlots } from "./blenderSlots";
import { landmarkLife } from "./life";
import { blenderFireFrom, type FireLayout } from "./fire";
import { MODEL as FIRE_STATION_NEAR } from "./fireStationNear.model";
import type { InfoLayout, InfoSlot } from "./info";
import { MODEL as INFO_CENTRE } from "./infoCentre.model";
import { MODEL as INFO_CENTRE_NEAR } from "./infoCentreNear.model";
import type { PowerMode, PowerSlot } from "./power";
import { MODEL as POWER_STATION_NEAR } from "./powerStationNear.model";
import type { Pantograph, StationLayout, StationSlot, TrainParts, TrainSlot } from "./station";
import { MODEL as TOWN_HALL } from "./townHall.model";
import { MODEL as TOWN_HALL_NEAR } from "./townHallNear.model";
import { MODEL as TRANSIT_STATION } from "./transitStation.model";
import { MODEL as TRANSIT_STATION_NEAR } from "./transitStationNear.model";
import { MODEL as TRANSIT_TRAIN } from "./transitTrain.model";
import { MODEL as TRANSIT_TRAIN_NEAR } from "./transitTrainNear.model";
import type { CivicLayout, CivicSlot } from "./townhall";
import type {
  ChapelLayout,
  ChapelSlot,
  HaltLayout,
  HaltSlot,
  SubstationLayout,
  SubstationSlot,
  VillageFireLayout,
  VillageFireSlot,
} from "./village";
import { MODEL as VILLAGE_CHAPEL } from "./villageChapel.model";
import { MODEL as VILLAGE_CHAPEL_NEAR } from "./villageChapelNear.model";
import { MODEL as VILLAGE_FIRE } from "./villageFire.model";
import { MODEL as VILLAGE_FIRE_NEAR } from "./villageFireNear.model";
import { MODEL as VILLAGE_HALT } from "./villageHalt.model";
import { MODEL as VILLAGE_HALT_NEAR } from "./villageHaltNear.model";
import { MODEL as VILLAGE_SUBSTATION } from "./villageSubstation.model";
import { MODEL as VILLAGE_SUBSTATION_NEAR } from "./villageSubstationNear.model";

const v3 = ([x, y, z]: readonly number[]): V3 => [x, y, z];
const clampLevel = (level: number): number => Math.min(3, Math.max(1, Math.round(level)));
const villageLevel = (level: number): 1 | 2 => (level >= 2 ? 2 : 1);

// ---------------------------------------------------------------------------
// The city's landmarks
// ---------------------------------------------------------------------------

/** The town hall: the lean hall's lantern marker, the detailed slots. */
export function blenderTownHallNear(): CivicLayout {
  return { slots: blenderSlots<CivicSlot>(TOWN_HALL_NEAR, ["TownHallNear"]), lantern: v3(importedMarker(TOWN_HALL, "TownHall.lantern")), life: landmarkLife(TOWN_HALL_NEAR, "TownHallNear") };
}

/** The fire station with the detailed engine at each of the level's lean engine markers. */
export function blenderFireNear(level: number): FireLayout {
  return blenderFireFrom(clampLevel(level), FIRE_STATION_NEAR, "Near");
}

/** The information centre: its garden lamps are the lean model's markers. */
export function blenderInfoNear(level: number): InfoLayout {
  const clamped = clampLevel(level);
  return {
    slots: blenderSlots<InfoSlot>(INFO_CENTRE_NEAR, [`Info${clamped}Near`]),
    lamps: importedMarkers(INFO_CENTRE, `Info${clamped}.lamp.`).map(v3),
  };
}

/** The power plant and its chimney (lit or cold), or the bare yard when there is no CI. */
export function blenderPowerNear(mode: PowerMode) {
  if (mode === "bare") return blenderSlots<PowerSlot>(POWER_STATION_NEAR, ["BareNear"]);
  return blenderSlots<PowerSlot>(POWER_STATION_NEAR, ["PowerNear", mode === "failing" ? "StackColdNear" : "StackNear"]);
}

/** The station: lamps from the lean markers; the tracks, platform edge and portal face are the lean model's. */
export function blenderStationNear(level: number): StationLayout {
  const clamped = clampLevel(level);
  return {
    slots: blenderSlots<StationSlot>(TRANSIT_STATION_NEAR, [`Station${clamped}Near`]),
    lamps: importedMarkers(TRANSIT_STATION, "Station.lamp.").map(v3),
    tracks: clamped >= 3 ? 2 : 1,
    life: landmarkLife(TRANSIT_STATION_NEAR, "StationNear"),
  };
}

/** The train set with the pantograph raised or folded, its wheelsets at the lean model's axle markers. */
export function blenderTrainNear(pantograph: Pantograph = "raised") {
  const arms = pantograph === "raised" ? "PantographRaisedNear" : "PantographLoweredNear";
  const axles = importedMarkers(TRANSIT_TRAIN, "Train.axle.");
  return blenderSlots<TrainSlot>(TRANSIT_TRAIN_NEAR, ["TrainNear", arms, { node: "WheelsetNear", offsets: axles }]);
}

/** The same set with its wheelsets apart, for the train that runs. */
export function blenderTrainPartsNear(pantograph: Pantograph = "raised"): TrainParts {
  const arms = pantograph === "raised" ? "PantographRaisedNear" : "PantographLoweredNear";
  return {
    slots: blenderSlots<TrainSlot>(TRANSIT_TRAIN_NEAR, ["TrainNear", arms]),
    wheels: blenderSlots<TrainSlot>(TRANSIT_TRAIN_NEAR, ["WheelsetNear"]),
    axles: importedMarkers(TRANSIT_TRAIN, "Train.axle.").map(v3),
  };
}

// ---------------------------------------------------------------------------
// The village's landmarks
// ---------------------------------------------------------------------------

export function blenderChapelNear(): ChapelLayout {
  return { slots: blenderSlots<ChapelSlot>(VILLAGE_CHAPEL_NEAR, ["ChapelNear"]), lamp: v3(importedMarker(VILLAGE_CHAPEL, "Chapel.lamp")), life: landmarkLife(VILLAGE_CHAPEL_NEAR, "ChapelNear") };
}

export function blenderVillageFireNear(level: number): VillageFireLayout {
  const key = villageLevel(level);
  return {
    slots: blenderSlots<VillageFireSlot>(VILLAGE_FIRE_NEAR, [`VFire${key}Near`]),
    beacons: importedMarkers(VILLAGE_FIRE, `VFire${key}.beacon.`).map(v3),
    life: landmarkLife(VILLAGE_FIRE_NEAR, `VFire${key}Near`),
  };
}

export function blenderHaltNear(level: number): HaltLayout {
  const key = villageLevel(level);
  return {
    slots: blenderSlots<HaltSlot>(VILLAGE_HALT_NEAR, [`Halt${key}Near`]),
    lamps: importedMarkers(VILLAGE_HALT, "Halt.lamp.").map(v3),
  };
}

export function blenderSubstationNear(): SubstationLayout {
  return {
    slots: blenderSlots<SubstationSlot>(VILLAGE_SUBSTATION_NEAR, ["SubstationNear"]),
    anchors: {
      lamp: v3(importedMarker(VILLAGE_SUBSTATION, "Substation.lamp")),
      yard: v3(importedMarker(VILLAGE_SUBSTATION, "Substation.yard")),
    },
  };
}

// ---------------------------------------------------------------------------
// What the city draws: null without the Blender models, and the lean model alone.
// ---------------------------------------------------------------------------

export const townHallNear = (): CivicLayout | null => (BLENDER_MODELS && isModelLoaded(TOWN_HALL_NEAR, TOWN_HALL) ? cached("civic-near", blenderTownHallNear) : null);

export const fireStationNear = (level: number): FireLayout | null =>
  BLENDER_MODELS && isModelLoaded(FIRE_STATION_NEAR) ? cached(`fire-near:${clampLevel(level)}`, () => blenderFireNear(level)) : null;

export const infoCentreNear = (level: number): InfoLayout | null =>
  BLENDER_MODELS && isModelLoaded(INFO_CENTRE_NEAR, INFO_CENTRE) ? cached(`info-near:${clampLevel(level)}`, () => blenderInfoNear(level)) : null;

export const powerPlantNear = (mode: PowerMode) => (BLENDER_MODELS && isModelLoaded(POWER_STATION_NEAR) ? cached(`power-near:${mode}`, () => blenderPowerNear(mode)) : null);

export const transitStationNear = (level: number): StationLayout | null =>
  BLENDER_MODELS && isModelLoaded(TRANSIT_STATION_NEAR, TRANSIT_STATION) ? cached(`station-near:${clampLevel(level)}`, () => blenderStationNear(level)) : null;

export const trainCarsNear = (pantograph: Pantograph = "raised") =>
  BLENDER_MODELS && isModelLoaded(TRANSIT_TRAIN_NEAR, TRANSIT_TRAIN) ? cached(`train-near:${pantograph}`, () => blenderTrainNear(pantograph)) : null;

export const trainPartsNear = (pantograph: Pantograph = "raised"): TrainParts | null =>
  BLENDER_MODELS && isModelLoaded(TRANSIT_TRAIN_NEAR, TRANSIT_TRAIN) ? cached(`train-parts-near:${pantograph}`, () => blenderTrainPartsNear(pantograph)) : null;

export const chapelNear = (): ChapelLayout | null => (BLENDER_MODELS && isModelLoaded(VILLAGE_CHAPEL_NEAR, VILLAGE_CHAPEL) ? cached("chapel-near", blenderChapelNear) : null);

export const villageFireStationNear = (level: number): VillageFireLayout | null =>
  BLENDER_MODELS && isModelLoaded(VILLAGE_FIRE_NEAR, VILLAGE_FIRE) ? cached(`village-fire-near:${villageLevel(level)}`, () => blenderVillageFireNear(level)) : null;

export const haltNear = (level: number): HaltLayout | null =>
  BLENDER_MODELS && isModelLoaded(VILLAGE_HALT_NEAR, VILLAGE_HALT) ? cached(`halt-near:${villageLevel(level)}`, () => blenderHaltNear(level)) : null;

export const substationNear = (): SubstationLayout | null =>
  BLENDER_MODELS && isModelLoaded(VILLAGE_SUBSTATION_NEAR, VILLAGE_SUBSTATION) ? cached("substation-near", blenderSubstationNear) : null;

/** The detailed station with its first engine apart (see `fireStationLive`). */
export const fireStationNearLive = (level: number): FireLayout | null =>
  BLENDER_MODELS && isModelLoaded(FIRE_STATION_NEAR) ? cached(`fire-near-live:${clampLevel(level)}`, () => blenderFireFrom(clampLevel(level), FIRE_STATION_NEAR, "Near", true)) : null;
