/**
 * What is actually lying in the road at an incident (PLAN.md section 11).
 *
 * The four states were tuned to read from the OVERVIEW camera in the last
 * round -- a ring on the ground, something vertical, a plume. This module is
 * the other half of that: what the viewer finds when they fly down to it.
 *
 *   minor      a dug-out pothole, cones, a crew and their truck
 *   collision  two cars in the wrong places, skid marks, debris, police and
 *              an ambulance with their light bars going
 *   stale      a rusted wreck behind a barricade line, a tow truck nobody
 *              sent, weeds through the tarmac
 *   major      a burnt patch, wrecks, a fire truck with its ladder up, and
 *              firefighters in high-visibility yellow
 *
 * FRAME. The generator gives an incident the heading of the road it sits on
 * (`roadHeading`), so in this local frame the carriageway runs along `z` and
 * `x` crosses it. Everything below is placed on that assumption: barricades
 * lie across the street, vehicles park along it.
 *
 * Each state is one merged geometry, built once per state, variant and tone
 * and shared by every incident that wants it. The blinking parts are reported
 * separately, because a merged geometry cannot blink.
 */

import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  IcosahedronGeometry,
  type BufferGeometry,
} from "three";
import type { IncidentState } from "@/types/analysis";
import { CONCRETE, RUST, TREE_LEAF, WARNING_ORANGE, desaturate, mix } from "../../palette";
import {
  EMERGENCY_LIGHTS,
  emergencyParts,
  type EmergencyKind,
  type EmergencyLight,
} from "../vehicles/emergency";
import { parkedGeometry } from "../vehicles/shapes";
import { figureParts } from "./figures";
import { geometryCache, mergeParts, toneKey, type Part, type Triple } from "./geometry";

/** Just above the dark patch the incident draws on the tarmac. */
const DECAL_Y = 0.135;

export interface DecorLight extends EmergencyLight {
  /** Already in the incident's frame. */
  position: Triple;
}

export interface IncidentDecor {
  geometry: BufferGeometry;
  lights: DecorLight[];
}

interface Placement {
  position: Triple;
  rotationY: number;
}

/** A vehicle's parts, moved into the incident's frame. */
function vehicleAt(kind: EmergencyKind, place: Placement, tone: number): Part[] {
  return [
    {
      geometry: mergeParts(emergencyParts(kind, tone)),
      color: "#ffffff",
      position: place.position,
      rotation: [0, place.rotationY, 0],
    },
  ];
}

/** That vehicle's lamps, moved into the incident's frame. */
function lightsAt(kind: EmergencyKind, place: Placement): DecorLight[] {
  const cos = Math.cos(place.rotationY);
  const sin = Math.sin(place.rotationY);
  return EMERGENCY_LIGHTS[kind].map((light) => ({
    ...light,
    position: [
      place.position[0] + light.position[0] * cos + light.position[2] * sin,
      place.position[1] + light.position[1],
      place.position[2] - light.position[0] * sin + light.position[2] * cos,
    ] as Triple,
  }));
}

/** A wrecked car: a real body, tinted and tipped. */
function wreck(
  position: Triple,
  rotationY: number,
  tilt: number,
  color: string,
  body: "sedan" | "hatchback" | "pickup" = "sedan",
): Part {
  return {
    geometry: parkedGeometry(body),
    color,
    position,
    rotation: [0, rotationY, tilt],
  };
}

/** A skid mark: a long thin decal on the tarmac. */
function skid(position: Triple, rotationY: number, length: number, tone: number): Part {
  return {
    geometry: new BoxGeometry(0.16, 0.02, length),
    color: desaturate("#2e2f30", tone * 0.4),
    position,
    rotation: [0, rotationY, 0],
  };
}

/** Scattered debris: a handful of small angular pieces. */
function debris(count: number, spread: number, color: string, seed: number): Part[] {
  const parts: Part[] = [];
  for (let i = 0; i < count; i++) {
    // A fixed pseudo-random scatter: the same state always looks the same,
    // which is what lets the geometry be cached and shared.
    const angle = (i * 2.399 + seed) % (Math.PI * 2);
    const distance = 0.9 + ((i * 0.37 + seed * 0.11) % 1) * spread;
    const size = 0.12 + ((i * 0.53 + seed * 0.29) % 1) * 0.22;
    parts.push({
      geometry: new BoxGeometry(size, size * 0.5, size * 1.4),
      color,
      position: [Math.sin(angle) * distance, 0.14 + size * 0.25, Math.cos(angle) * distance],
      rotation: [0, angle * 1.7, 0],
    });
  }
  return parts;
}

function cone(position: Triple, color: string, tone: number): Part[] {
  return [
    {
      geometry: new BoxGeometry(0.6, 0.08, 0.6),
      color: desaturate("#3f443f", tone),
      position: [position[0], DECAL_Y + 0.04, position[2]],
    },
    {
      geometry: new ConeGeometry(0.3, 0.8, 8),
      color,
      position: [position[0], DECAL_Y + 0.48, position[2]],
    },
  ];
}

function barricade(place: Placement, color: string, stripe: string, lean = 0): Part[] {
  const [x, , z] = place.position;
  const rotation: Triple = [0, place.rotationY, lean];
  return [
    { geometry: new BoxGeometry(2.6, 0.28, 0.12), color, position: [x, 0.62, z], rotation },
    { geometry: new BoxGeometry(2.6, 0.28, 0.12), color: stripe, position: [x, 0.95, z], rotation },
    {
      geometry: new BoxGeometry(0.14, 1, 0.14),
      color: desaturate(CONCRETE, 0.2),
      position: [x - 1.1 * Math.cos(place.rotationY), 0.5, z + 1.1 * Math.sin(place.rotationY)],
      rotation,
    },
    {
      geometry: new BoxGeometry(0.14, 1, 0.14),
      color: desaturate(CONCRETE, 0.2),
      position: [x + 1.1 * Math.cos(place.rotationY), 0.5, z - 1.1 * Math.sin(place.rotationY)],
      rotation,
    },
  ];
}

/** The road crew's sign: a board on a post. The blinker is added separately. */
function worksSign(place: Placement, color: string, lean: number, tone: number): Part[] {
  const [x, , z] = place.position;
  const rotation: Triple = [0, place.rotationY, lean];
  return [
    {
      geometry: new CylinderGeometry(0.09, 0.11, 2.2, 6),
      color: desaturate("#6b6f6d", tone),
      position: [x, 1.1, z],
      rotation,
    },
    { geometry: new BoxGeometry(1.7, 1.2, 0.12), color, position: [x, 2.5, z], rotation },
    {
      geometry: new BoxGeometry(1.2, 0.26, 0.05),
      color: desaturate("#2f3330", tone),
      position: [x, 2.5, z + 0.09],
      rotation,
    },
  ];
}

function weeds(spread: number, color: string, count: number): Part[] {
  const parts: Part[] = [];
  for (let i = 0; i < count; i++) {
    const angle = i * 2.11;
    const distance = 1 + ((i * 0.41) % 1) * spread;
    const size = 0.7 + ((i * 0.27) % 1) * 0.6;
    parts.push({
      geometry: new ConeGeometry(0.3 * size, 0.9 * size, 5),
      color,
      position: [Math.sin(angle) * distance, 0.45 * size, Math.cos(angle) * distance],
      rotation: [0, angle, 0],
    });
  }
  return parts;
}

interface Scene {
  parts: Part[];
  lights: DecorLight[];
}

function sceneFor(state: IncidentState, variant: number, tone: number): Scene {
  const shade = (hex: string) => desaturate(hex, tone);
  const faded = (hex: string) => desaturate(hex, Math.min(1, tone + 0.45));
  const flip = variant === 1 ? -1 : 1;
  const parts: Part[] = [];
  const lights: DecorLight[] = [];

  if (state === "minor") {
    // A dug-out pothole with the spoil beside it.
    parts.push({
      geometry: new CylinderGeometry(0.78, 0.66, 0.1, 16),
      color: shade("#33352f"),
      position: [0, DECAL_Y, 0],
    });
    parts.push({
      geometry: new IcosahedronGeometry(0.5, 0),
      color: shade("#4a4740"),
      position: [1.1 * flip, 0.3, -0.9],
      scale: [1, 0.55, 1],
    });
    for (const spot of [
      [-1 * flip, 0.5],
      [1 * flip, -0.4],
      [0.3 * flip, 1.5],
      [-1.6 * flip, -1.1],
      [1.5 * flip, 1.2],
    ] as [number, number][]) {
      parts.push(...cone([spot[0], 0, spot[1]], shade(WARNING_ORANGE), tone));
    }
    const sign: Placement = { position: [1.7 * flip, 0, 2.2], rotationY: 0.4 * flip };
    parts.push(...worksSign(sign, shade(WARNING_ORANGE), 0, tone));
    lights.push({
      position: [sign.position[0], 3.32, sign.position[2]],
      color: WARNING_ORANGE,
      rate: 1.1,
      radius: 0.2,
    });

    const truck: Placement = { position: [-1.35 * flip, 0, 4], rotationY: Math.PI };
    parts.push(...vehicleAt("works", truck, tone));
    lights.push(...lightsAt("works", truck));

    parts.push(
      ...figureParts({
        position: [0.9 * flip, 0, 1.1],
        color: shade("#e6c02f"),
        rotationY: -2.2,
        helmet: shade("#f0d44a"),
      }),
      ...figureParts({
        position: [-0.9 * flip, 0, 1.9],
        color: shade("#e6c02f"),
        rotationY: 1.6,
        helmet: shade("#f0d44a"),
      }),
    );
    return { parts, lights };
  }

  if (state === "collision") {
    parts.push(
      wreck([-1.2 * flip, 0.02, 0.5], 0.5 * flip, 0, shade("#5f8fb0")),
      wreck([1.3 * flip, 0.02, -0.7], -0.95 * flip, 0.08 * flip, shade("#c9c3b4"), "hatchback"),
    );
    // The braking that led to it, printed on the road.
    parts.push(
      skid([-1.55 * flip, DECAL_Y, 2.5], 0.2 * flip, 3.4, tone),
      skid([-0.85 * flip, DECAL_Y, 2.5], 0.2 * flip, 3.4, tone),
      skid([1.75 * flip, DECAL_Y, -2.6], -0.3 * flip, 2.6, tone),
      skid([1.05 * flip, DECAL_Y, -2.6], -0.3 * flip, 2.6, tone),
    );
    parts.push(...debris(7, 1.6, shade("#8c8880"), 1.3));
    parts.push(...cone([0.2 * flip, 0, 2.6], shade(WARNING_ORANGE), tone));
    parts.push(...cone([-2.3 * flip, 0, -1.8], shade(WARNING_ORANGE), tone));

    const police: Placement = { position: [-1.45 * flip, 0, 4.8], rotationY: Math.PI + 0.1 };
    const ambulance: Placement = { position: [1.5 * flip, 0, -5], rotationY: -0.08 };
    parts.push(...vehicleAt("police", police, tone), ...vehicleAt("ambulance", ambulance, tone));
    lights.push(...lightsAt("police", police), ...lightsAt("ambulance", ambulance));
    return { parts, lights };
  }

  if (state === "stale") {
    // The wreck nobody has moved: on its side, rusted through.
    parts.push(wreck([0, 0.62, 0], 0.7 * flip, Math.PI * 0.46 * flip, faded(RUST)));
    parts.push(...debris(5, 2.1, faded("#7c766c"), 2.7));
    parts.push(
      ...barricade({ position: [0, 0, 3], rotationY: 0 }, faded(WARNING_ORANGE), faded("#e8e3d6")),
      ...barricade(
        { position: [2.5 * flip, 0, 3.1], rotationY: 0.12 },
        faded(WARNING_ORANGE),
        faded("#e8e3d6"),
        0.1 * flip,
      ),
      ...barricade(
        { position: [-2.5 * flip, 0, 2.9], rotationY: -0.16 },
        faded(WARNING_ORANGE),
        faded("#e8e3d6"),
        -0.14 * flip,
      ),
      ...barricade(
        { position: [0, 0, -3.2], rotationY: 0.08 },
        faded(WARNING_ORANGE),
        faded("#e8e3d6"),
        0.2 * flip,
      ),
    );
    // Three slow blinkers along the barricade line: the only thing still
    // working here (PLAN.md section 11, "weathered warning signs").
    for (const [x, z, rate] of [
      [-2.4 * flip, 3.2, 0.7],
      [0.2, 3.25, 0.55],
      [2.4 * flip, 3.35, 0.62],
    ] as [number, number, number][]) {
      lights.push({ position: [x, 1.15, z], color: faded(WARNING_ORANGE), rate, radius: 0.15 });
    }
    parts.push(
      ...worksSign(
        { position: [-2.3 * flip, 0, -2.4], rotationY: -0.5 * flip },
        faded(WARNING_ORANGE),
        0.17 * flip,
        tone,
      ),
    );
    parts.push(...weeds(2.6, faded(mix(TREE_LEAF, "#9aa36a", 0.4)), 9));

    const tow: Placement = { position: [-1.4 * flip, 0, 4.3], rotationY: 0.08 };
    parts.push(...vehicleAt("tow", tow, tone));
    lights.push(...lightsAt("tow", tow));
    return { parts, lights };
  }

  // major: the city is on fire.
  parts.push({
    geometry: new CylinderGeometry(2.8, 2.8, 0.06, 26),
    color: shade("#2b2724"),
    position: [0, DECAL_Y, 0],
  });
  parts.push(
    wreck([-1.4 * flip, 0.02, 0.8], 0.9 * flip, 0, shade("#3a3532")),
    wreck([1.5 * flip, 0.1, -0.7], -0.5 * flip, 0.42 * flip, shade("#5a5450"), "pickup"),
  );
  parts.push(...debris(9, 2.4, shade("#5f5a54"), 0.7));
  parts.push(
    ...barricade({ position: [0, 0, 4.2], rotationY: 0 }, shade(WARNING_ORANGE), shade("#e8e3d6")),
    ...barricade({ position: [0, 0, -4.2], rotationY: 0 }, shade(WARNING_ORANGE), shade("#e8e3d6")),
  );

  const engine: Placement = { position: [-1.5 * flip, 0, 6], rotationY: 0.06 };
  parts.push(...vehicleAt("fire", engine, tone));
  lights.push(...lightsAt("fire", engine));

  // The crew, working the fire from upwind, clear of the flames.
  for (const [x, z, facing] of [
    [2.1 * flip, 2.4, -2.4],
    [-2.2 * flip, 3.2, 2.3],
    [2.3 * flip, -1.9, -1.2],
  ] as [number, number, number][]) {
    parts.push(
      ...figureParts({
        position: [x, 0, z],
        color: shade("#e6c02f"),
        rotationY: facing,
        helmet: shade("#f2d43c"),
      }),
    );
  }
  return { parts, lights };
}

const sceneCache = new Map<string, Scene>();

function scene(state: IncidentState, variant: number, tone: number): Scene {
  const key = `${state}:${variant}:${toneKey(tone)}`;
  const hit = sceneCache.get(key);
  if (hit) return hit;
  const made = sceneFor(state, variant, tone);
  sceneCache.set(key, made);
  return made;
}

const decorGeometryCache = geometryCache<string>((key) => {
  const [state, variant, tone] = key.split(":");
  return mergeParts(scene(state as IncidentState, Number(variant), Number(tone)).parts);
});

/**
 * The merged scene and its blinking lamps. Two variants per state, chosen by
 * the caller from the incident's id, so a street with two collisions on it
 * does not show the same wreck twice.
 */
export function incidentDecor(
  state: IncidentState,
  variant: number,
  desaturation: number,
): IncidentDecor {
  const tone = Number(toneKey(desaturation));
  const side = variant === 1 ? 1 : 0;
  return {
    geometry: decorGeometryCache(`${state}:${side}:${toneKey(desaturation)}`),
    lights: scene(state, side, tone).lights,
  };
}

/** Which variant an incident gets: stable per id, no state of its own. */
export function variantFor(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return hash % 2;
}
