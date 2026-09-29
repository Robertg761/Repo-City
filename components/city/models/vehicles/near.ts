/**
 * The fleet's near (detailed) level (`blender/fleet/near.py`): drawn by
 * `LodInstances` for the few cars close to the camera, in place of the lean
 * bodies, wheels and lamps in `shapes.ts`. Same frames, wheel and lamp
 * points and paint roles as the lean models, so the swap changes only the
 * detail. Only the Blender models have a near level; the procedural ones
 * return null and the city draws the lean fleet alone.
 *
 * Nothing here reads the model while this module is evaluated: the data
 * arrives with `loadModels()` (`../imported.ts`).
 */

import type { BufferGeometry } from "three";
import { importedParts, isModelLoaded } from "../imported";
import { BLENDER_MODELS } from "../modelSource";
import type { Part, Triple } from "../props/geometry";
import { MODEL as NEAR_MODEL } from "./fleetNear.model";
import {
  BODY_SPECS,
  FLEET_NODE,
  mergeVehicleParts,
  unlit,
  vehicleSurface,
  type VehicleBody,
} from "./shapes";

const parts = (node: string, shade: (hex: string) => string = (hex) => hex): Part[] =>
  importedParts(NEAR_MODEL, node, shade).map(vehicleSurface);

const cache = new Map<string, BufferGeometry>();

function cached(key: string, build: () => Part[]): BufferGeometry {
  let made = cache.get(key);
  if (!made) {
    made = mergeVehicleParts(build());
    cache.set(key, made);
  }
  return made;
}

/** One near body: the same frame as `bodyGeometry(kind)`, without wheels or lamps. */
export const blenderNearBody = (kind: VehicleBody): BufferGeometry => cached(`body:${kind}`, () => parts(`${FLEET_NODE[kind]}Near`));

/** The near wheel: radius 1, axle along x, as `wheelGeometry()`. */
export const blenderNearWheel = (): BufferGeometry => cached("wheel", () => parts("WheelNear"));

/** The near lamps of a body, at the lean lamps' points and depth. */
export const blenderNearLights = (kind: VehicleBody): BufferGeometry => cached(`lamps:${kind}`, () => parts(`Lamps${FLEET_NODE[kind]}Near`));

export const blenderNearTractor = (): BufferGeometry => cached("tractor", () => parts("TractorNear"));

export const blenderNearTractorLights = (): BufferGeometry => cached("lamps:tractor", () => parts("LampsTractorNear"));

/** The rim's outermost x at radius 1: what a parked wheel's width is measured to. */
const WHEEL_HALF_WIDTH = 0.5;

/** The near wheel at a wheel position, narrowed to a parked tyre's width as the lean parked car does. */
function wheelAt(x: number, z: number, radius: number, halfWidth = 0.11): Part[] {
  return parts("WheelNear").map((part) => ({
    ...part,
    position: [x, radius, z] as Triple,
    scale: [halfWidth / WHEEL_HALF_WIDTH, radius, radius] as Triple,
  }));
}

/**
 * A parked vehicle in detail: the near body, the near wheel at each spec
 * position, and the near lamps switched off (`parkedGeometry`'s counterpart).
 */
export const blenderNearParked = (kind: VehicleBody): BufferGeometry =>
  cached(`parked:${kind}`, () => {
    const spec = BODY_SPECS[kind];
    return [
      ...parts(`${FLEET_NODE[kind]}Near`),
      ...spec.wheels.flatMap(([x, z]) => wheelAt(x, z, spec.wheelRadius)),
      ...parts(`Lamps${FLEET_NODE[kind]}Near`, unlit),
    ];
  });

// What the city draws: null without the Blender models, and the lean fleet alone.
const ready = (): boolean => isModelLoaded(NEAR_MODEL);

export const nearBodyGeometry = (kind: VehicleBody) => (BLENDER_MODELS && ready() ? blenderNearBody(kind) : null);
export const nearWheelGeometry = () => (BLENDER_MODELS && ready() ? blenderNearWheel() : null);
export const nearLightsGeometry = (kind: VehicleBody) => (BLENDER_MODELS && ready() ? blenderNearLights(kind) : null);
export const nearTractorGeometry = () => (BLENDER_MODELS && ready() ? blenderNearTractor() : null);
export const nearTractorLightsGeometry = () => (BLENDER_MODELS && ready() ? blenderNearTractorLights() : null);
export const nearParkedGeometry = (kind: VehicleBody) => (BLENDER_MODELS && ready() ? blenderNearParked(kind) : null);
