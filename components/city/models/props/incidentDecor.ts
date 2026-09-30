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
 * lie across the street, vehicles park along it, in a lane (a minor road is
 * 4.5 wide, so a vehicle's outer flank stays inside `|x| < 2.25`).
 *
 * Each state is one merged geometry, built once per state, variant and tone
 * and shared by every incident that wants it. The blinking parts are reported
 * separately, because a merged geometry cannot blink.
 */

import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  DataTexture,
  Euler,
  IcosahedronGeometry,
  LinearFilter,
  RGBAFormat,
  Vector3,
  type BufferGeometry,
} from "three";
import type { IncidentState } from "@/types/analysis";
import { SURFACE } from "../../textures/surface-types";
import { CONCRETE, TREE_LEAF, WARNING_ORANGE, desaturate, mix } from "../../palette";
import {
  EMERGENCY_LIGHTS,
  emergencyParts,
  ladderYawToward,
  type EmergencyKind,
  type EmergencyLight,
} from "../vehicles/emergency";
import { BODY_SPECS, parkedGeometry, type VehicleBody } from "../vehicles/shapes";
import { placePhase } from "../../phase";
import { blenderNearParked } from "../vehicles/near";
import { atLevel, detailLevel, modelFor, type DetailLevel } from "../detailLevel";
import { importedParts } from "../imported";
import { BLENDER_MODELS } from "../modelSource";
import { MODEL as INCIDENT_PROPS } from "./incidentProps.model";
import { MODEL as INCIDENT_PROPS_NEAR } from "./incidentPropsNear.model";
import { figureParts } from "./figures";
import { WORKER_YELLOW } from "./pedestrians";
import { geometryCache, mergeParts, surfacePanel, toneKey, type Part, type Triple } from "./geometry";
import { debrisPiece, hoseCoilParts, hoseParts, potholeParts, scorchParts, skidParts, spoilParts, tapeParts, weedParts } from "./incidentKit";

/**
 * The top of the carriageway above the ground plate (`Roads.tsx`: a box
 * 0.08 tall standing on it). Everything that STANDS on the road -- the
 * vehicles, wrecks, cones, crew, barricades and signs -- is set on this, so a
 * tyre's tread meets the tarmac instead of sinking 8 cm into it; the flat
 * things laid ON it (skid marks, hose, the burnt patch) were already drawn
 * relative to it.
 */
export const ROAD_SURFACE = 0.08;

const lift = (parts: Part[]): Part[] =>
  parts.map((part) => {
    const [x, y, z] = part.position ?? [0, 0, 0];
    return { ...part, position: [x, y + ROAD_SURFACE, z] as Triple };
  });

/** Just above the dark patch the incident draws on the tarmac. */
const DECAL_Y = 0.135;

/**
 * Where the fire burns at a major incident, `[x, z]`: the centre.
 * `IssueIncident.tsx` puts its flames and its smoke column here, and the
 * engine's ladder is turned to reach it.
 */
export const FIRE_AT: [number, number] = [0, 0];

export interface DecorLight extends EmergencyLight {
  /** Already in the incident's frame. */
  position: Triple;
  /** The phase the vehicle's lamps share, in cycles: one vehicle blinks as one. */
  sync?: number;
  /** A strobe rather than a pulse. */
  flash?: boolean;
}

/** A crew member, drawn on his own so he can work: feet at `position`. */
export interface DecorCrew {
  position: Triple;
  rotationY: number;
  geometry: BufferGeometry;
}

export interface IncidentDecor {
  geometry: BufferGeometry;
  lights: DecorLight[];
  crew: DecorCrew[];
}

export interface Placement {
  position: Triple;
  rotationY: number;
}

/** A vehicle parked at an incident. */
export interface ParkedService {
  kind: EmergencyKind;
  place: Placement;
  /** The fire engine's turntable, turned towards the fire. */
  ladderYaw: number;
}

/**
 * Something standing on the ground at an incident that a parked vehicle must
 * not stand on: a cone, a crew member, a barricade post, a wreck. A circle,
 * `[x, z]` and a radius, in the incident's frame.
 */
export interface Clutter {
  x: number;
  z: number;
  radius: number;
  what: string;
}

/** A vehicle's parts, moved into the incident's frame. */
function vehicleAt(kind: EmergencyKind, place: Placement, tone: number, ladderYaw = 0): Part[] {
  return [
    {
      geometry: mergeParts(emergencyParts(kind, tone, ladderYaw)),
      color: "#ffffff",
      position: [place.position[0], place.position[1] + ROAD_SURFACE, place.position[2]],
      rotation: [0, place.rotationY, 0],
    },
  ];
}

/** A point in a vehicle's own frame, `[x, z]`, in the incident's frame. */
function toIncident(place: Placement, x: number, z: number): [number, number] {
  const cos = Math.cos(place.rotationY);
  const sin = Math.sin(place.rotationY);
  return [place.position[0] + x * cos + z * sin, place.position[2] - x * sin + z * cos];
}

/** A point in the incident's frame, `[x, z]`, in a vehicle's own frame. */
function toVehicle(place: Placement, x: number, z: number): [number, number] {
  const cos = Math.cos(place.rotationY);
  const sin = Math.sin(place.rotationY);
  const dx = x - place.position[0];
  const dz = z - place.position[2];
  return [dx * cos - dz * sin, dx * sin + dz * cos];
}

/**
 * That vehicle's lamps, moved into the incident's frame. A light bar's lamps
 * share one rate and alternate (half a cycle apart), as the two sides of a
 * real bar do; a lone lamp is a strobe. The lenses are a little smaller than
 * the markers' spheres, which were drawn wider than the bar.
 */
function lightsAt(kind: EmergencyKind, place: Placement): DecorLight[] {
  const lamps = EMERGENCY_LIGHTS[kind];
  const base = placePhase(place.position[0], place.position[1], place.position[2]);
  return lamps.map((light, i) => {
    const [x, z] = toIncident(place, light.position[0], light.position[2]);
    return {
      ...light,
      rate: lamps[0].rate,
      radius: light.radius * 0.62,
      position: [x, place.position[1] + ROAD_SURFACE + light.position[1], z] as Triple,
      sync: base + (i % 2) * 0.5,
      flash: true,
    };
  });
}

/**
 * A wrecked car's four hazard lamps: the body's own headlamp and taillamp
 * positions (`BODY_SPECS`), carried by the wreck's rotation and tilt, so a
 * tipped car's lamps tip with it. They blink together.
 */
const scratchLamp = new Vector3();
const scratchTurn = new Euler();
function wreckLights(body: VehicleBody, position: Triple, rotationY: number, tilt: number, tone: number): DecorLight[] {
  const spec = BODY_SPECS[body];
  scratchTurn.set(0, rotationY, tilt, "XYZ");
  const sync = placePhase(position[0], position[1], position[2]);
  return [...spec.headlights, ...spec.taillights].map(([x, y, z]) => {
    scratchLamp.set(x, y, z).applyEuler(scratchTurn);
    return {
      position: [position[0] + scratchLamp.x, position[1] + scratchLamp.y, position[2] + scratchLamp.z] as Triple,
      color: desaturate("#ffae3a", tone * 0.4),
      rate: 2.6,
      radius: 0.06,
      sync,
    };
  });
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
    // At the near level the wreck is the fleet's near body on its near wheels.
    geometry: detailLevel() === "near" && BLENDER_MODELS ? blenderNearParked(body) : parkedGeometry(body),
    color,
    position,
    rotation: [0, rotationY, tilt],
  };
}

/**
 * A skid mark: a long thin decal on the tarmac, or with the Blender models
 * whole tiles of tyre mark laid end to end (`incidentKit.ts`).
 */
function skid(position: Triple, rotationY: number, length: number, tone: number): Part[] {
  if (BLENDER_MODELS) return skidParts(position, rotationY, length, tone);
  return [{
    geometry: new BoxGeometry(0.16, 0.02, length),
    color: desaturate("#2e2f30", tone * 0.4),
    position,
    rotation: [0, rotationY, 0],
  }];
}

/** Scattered debris: a handful of small angular pieces. */
function debris(count: number, spread: number, color: string, seed: number, shade: (hex: string) => string): Part[] {
  const parts: Part[] = [];
  for (let i = 0; i < count; i++) {
    // A fixed pseudo-random scatter: the same state always looks the same,
    // which is what lets the geometry be cached and shared.
    const angle = (i * 2.399 + seed) % (Math.PI * 2);
    const distance = 0.9 + ((i * 0.37 + seed * 0.11) % 1) * spread;
    const size = 0.12 + ((i * 0.53 + seed * 0.29) % 1) * 0.22;
    if (BLENDER_MODELS) {
      // Panels, bumper ends, a hub cap and glass, at the same scatter.
      parts.push(...debrisPiece(i, Math.sin(angle) * distance, Math.cos(angle) * distance, size, angle * 1.7, color, shade));
      continue;
    }
    parts.push({
      geometry: new BoxGeometry(size, size * 0.5, size * 1.4),
      color,
      position: [Math.sin(angle) * distance, 0.14 + size * 0.25, Math.cos(angle) * distance],
      rotation: [0, angle * 1.7, 0],
    });
  }
  return parts;
}

/**
 * The Blender props (`blender/incidents/incident_props.py`), one merged
 * geometry per node and shade, placed like any other part. `paint` shades the
 * model's own colours: fresh at a live incident, faded at a stale one.
 */
const blenderPropCache = new Map<string, BufferGeometry>();

export function blenderProp(node: string, paint: (hex: string) => string, position: Triple, rotation?: Triple): Part {
  const key = `${detailLevel()}:${node}:${paint(WARNING_ORANGE)}`;
  let geometry = blenderPropCache.get(key);
  if (!geometry) {
    geometry = mergeParts(importedParts(modelFor(INCIDENT_PROPS, INCIDENT_PROPS_NEAR, node), node, paint));
    blenderPropCache.set(key, geometry);
  }
  return { geometry, color: "#ffffff", position, rotation };
}

/** The Blender barricade's boards stand this high at their middle. */
export const BLENDER_RAIL_MID = 0.785;

/** Where the road crew's sign carries its lamp, above its foot. */
export const SIGN_LAMP_Y = 3.32;

function cone(position: Triple, color: string, tone: number): Part[] {
  if (BLENDER_MODELS) return [blenderProp("Cone", (hex) => desaturate(hex, tone), [position[0], DECAL_Y, position[2]])];
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
    {
      geometry: new CylinderGeometry(0.128, 0.173, 0.12, 8, 1, true),
      color: desaturate("#e6e1ca", tone),
      position: [position[0], DECAL_Y + 0.5, position[2]],
    },
  ];
}

function barricade(
  place: Placement,
  color: string,
  stripe: string,
  lean = 0,
  paint: (hex: string) => string = (hex) => hex,
): Part[] {
  const [x, , z] = place.position;
  const rotation: Triple = [0, place.rotationY, lean];
  if (BLENDER_MODELS) {
    // The boards knocked askew about their middle; the posts stay upright.
    const ends = [-1, 1].map((side) =>
      blenderProp("BarricadePost", paint, [x + side * 1.1 * Math.cos(place.rotationY), 0, z - side * 1.1 * Math.sin(place.rotationY)], [0, place.rotationY, 0]),
    );
    return [blenderProp("BarricadeRails", paint, [x, BLENDER_RAIL_MID, z], rotation), ...ends];
  }
  const panels: Part[] = [];
  for (const side of [-1, 1]) {
    for (const dx of [-0.94, -0.47, 0, 0.47, 0.94]) {
      const along = dx * Math.cos(lean);
      panels.push(surfacePanel(0.14, 0.21,
        [x + along * Math.cos(place.rotationY) + side * 0.072 * Math.sin(place.rotationY), 0.95 + dx * Math.sin(lean), z - along * Math.sin(place.rotationY) + side * 0.072 * Math.cos(place.rotationY)],
        color, [0, place.rotationY + (side < 0 ? Math.PI : 0), lean + side * 0.35]));
    }
  }
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
    ...panels,
  ];
}

/** The road crew's sign: a board on a post. The blinker is added separately. */
function worksSign(
  place: Placement,
  color: string,
  lean: number,
  tone: number,
  paint: (hex: string) => string = (hex) => desaturate(hex, tone),
): Part[] {
  const [x, , z] = place.position;
  const rotation: Triple = [0, place.rotationY, lean];
  // The Blender sign leans from its foot, as a sign knocked over would.
  if (BLENDER_MODELS) return [blenderProp("WorksSign", paint, [x, 0, z], rotation)];
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
  if (BLENDER_MODELS) {
    return weedParts(
      Array.from({ length: count }, (_, i) => {
        const angle = i * 2.11;
        const distance = 1 + ((i * 0.41) % 1) * spread;
        const size = 0.7 + ((i * 0.27) % 1) * 0.6;
        return { x: Math.sin(angle) * distance, z: Math.cos(angle) * distance, height: 0.9 * size, turn: angle };
      }),
      color,
    );
  }
  const parts: Part[] = [];
  for (let i = 0; i < count; i++) {
    const angle = i * 2.11;
    const distance = 1 + ((i * 0.41) % 1) * spread;
    const size = 0.7 + ((i * 0.27) % 1) * 0.6;
    parts.push({
      geometry: new ConeGeometry(0.3 * size, 0.9 * size, 5),
      color,
      surface: SURFACE.foliage,
      position: [Math.sin(angle) * distance, 0.45 * size, Math.cos(angle) * distance],
      rotation: [0, angle, 0],
    });
  }
  return parts;
}

/** A crew member's place, before his geometry (which depends on the tone and level). */
interface CrewSpot {
  position: Triple;
  rotationY: number;
  helmet: string;
}

interface Scene {
  crew: CrewSpot[];
  parts: Part[];
  lights: DecorLight[];
  vehicles: ParkedService[];
  clutter: Clutter[];
}

function sceneFor(state: IncidentState, variant: number, tone: number): Scene {
  const shade = (hex: string) => desaturate(hex, tone);
  const faded = (hex: string) => desaturate(hex, Math.min(1, tone + 0.45));
  const flip = variant === 1 ? -1 : 1;
  const parts: Part[] = [];
  const lights: DecorLight[] = [];
  const vehicles: ParkedService[] = [];
  const clutter: Clutter[] = [];
  const crew: CrewSpot[] = [];

  // Everything that stands on the ground goes through these, so the layout
  // the tests check is the layout that is drawn.
  const mark = (x: number, z: number, radius: number, what: string) =>
    clutter.push({ x, z, radius, what });
  const addCone = (x: number, z: number, color: string) => {
    parts.push(...lift(cone([x, 0, z], color, tone)));
    mark(x, z, 0.32, "cone");
  };
  const addCrew = (x: number, z: number, rotationY: number, helmet: string) => {
    // Not merged into the scene: each worker is his own small piece, so he can
    // lean into his work (`IssueIncident.tsx`).
    crew.push({ position: [x, ROAD_SURFACE, z], rotationY, helmet });
    mark(x, z, 0.22, "crew");
  };
  // The Blender props take the scene's shading, so a stale scene's fade too.
  const paint = state === "stale" ? faded : shade;
  const addBarricade = (place: Placement, color: string, stripe: string, lean = 0) => {
    parts.push(...lift(barricade(place, color, stripe, lean, paint)));
    // Along its length, so a vehicle cannot stand across the middle of it.
    for (const along of [-1.3, -0.65, 0, 0.65, 1.3]) {
      mark(
        place.position[0] + along * Math.cos(place.rotationY),
        place.position[2] - along * Math.sin(place.rotationY),
        0.1,
        "barricade",
      );
    }
  };
  const addWreck = (wrecked: Part, hazard?: VehicleBody) => {
    const part = lift([wrecked])[0];
    parts.push(part);
    if (hazard) {
      lights.push(...wreckLights(hazard, part.position!, part.rotation![1], part.rotation![2], tone));
    }
    const [x, , z] = part.position!;
    mark(x, z, 1.5, "wreck");
  };
  const park = (kind: EmergencyKind, place: Placement, ladderYaw = 0) => {
    parts.push(...vehicleAt(kind, place, tone, ladderYaw));
    lights.push(...lightsAt(kind, place));
    vehicles.push({ kind, place, ladderYaw });
  };

  if (state === "minor") {
    // A dug-out pothole with the spoil beside it.
    if (BLENDER_MODELS) {
      parts.push(...potholeParts(shade), ...spoilParts(1.1 * flip, -0.9, shade));
    } else parts.push({
      geometry: new CylinderGeometry(0.78, 0.66, 0.1, 16),
      color: shade("#33352f"),
      position: [0, DECAL_Y, 0],
    });
    mark(0, 0, 0.78, "pothole");
    if (!BLENDER_MODELS) {
      parts.push({
        geometry: new IcosahedronGeometry(0.5, 0),
        color: shade("#4a4740"),
        position: [1.1 * flip, 0.3, -0.9],
        scale: [1, 0.55, 1],
      });
    }
    mark(1.1 * flip, -0.9, 0.5, "spoil");
    for (const spot of [
      [-1 * flip, 0.5],
      [1 * flip, -0.4],
      [0.3 * flip, 1.5],
      [-1.6 * flip, -1.1],
      [1.5 * flip, 1.2],
    ] as [number, number][]) {
      addCone(spot[0], spot[1], shade(WARNING_ORANGE));
    }
    const sign: Placement = { position: [1.7 * flip, 0, 2.2], rotationY: 0.4 * flip };
    parts.push(...lift(worksSign(sign, shade(WARNING_ORANGE), 0, tone)));
    // The board is wider than its post, and stands at a cab's height.
    mark(sign.position[0], sign.position[2], 0.85, "sign");
    lights.push({
      position: [sign.position[0], SIGN_LAMP_Y + ROAD_SURFACE, sign.position[2]],
      color: WARNING_ORANGE,
      rate: 1.1,
      radius: 0.2,
      flash: true,
    });

    if (detailLevel() === "near") {
      // A barrier across the carriageway behind the hole, as the crew would
      // put out first, and hazard tape round the hole tied to the cones' shoulders.
      addBarricade({ position: [0, 0, -2.7], rotationY: 0.05 * flip }, shade(WARNING_ORANGE), shade("#e8e3d6"));
      const ring: [number, number][] = [[-1.6, -1.1], [-1, 0.5], [0.3, 1.5], [1.5, 1.2], [1, -0.4]];
      ring.forEach(([x, z], i) => {
        const [nx, nz] = ring[(i + 1) % ring.length];
        parts.push(...tapeParts([x * flip, 0.68, z], [nx * flip, 0.68, nz], shade));
      });
    }

    // The crew's truck, parked facing the hole with its bed of cones to the
    // street behind, just clear of the crew.
    park("works", { position: [-1.35 * flip, 0, 4.3], rotationY: Math.PI });

    addCrew(0.9 * flip, 1.1, -2.2, shade("#f0d44a"));
    addCrew(-0.9 * flip, 1.9, 1.6, shade("#f0d44a"));
    return { parts, lights, vehicles, clutter, crew };
  }

  if (state === "collision") {
    addWreck(wreck([-1.2 * flip, 0.02, 0.5], 0.5 * flip, 0, shade("#5f8fb0")), "sedan");
    addWreck(
      wreck([1.3 * flip, 0.02, -0.7], -0.95 * flip, 0.08 * flip, shade("#c9c3b4"), "hatchback"),
      "hatchback",
    );
    // The braking that led to it, printed on the road.
    parts.push(
      ...skid([-1.55 * flip, DECAL_Y, 2.5], 0.2 * flip, 3.4, tone),
      ...skid([-0.85 * flip, DECAL_Y, 2.5], 0.2 * flip, 3.4, tone),
      ...skid([1.75 * flip, DECAL_Y, -2.6], -0.3 * flip, 2.6, tone),
      ...skid([1.05 * flip, DECAL_Y, -2.6], -0.3 * flip, 2.6, tone),
    );
    parts.push(...debris(7, 1.6, shade("#8c8880"), 1.3, shade));
    addCone(0.2 * flip, 2.6, shade(WARNING_ORANGE));
    addCone(-2.3 * flip, -1.8, shade(WARNING_ORANGE));

    park("police", { position: [-1.45 * flip, 0, 4.8], rotationY: Math.PI + 0.1 });
    park("ambulance", { position: [1.45 * flip, 0, -5], rotationY: -0.05 });
    return { parts, lights, vehicles, clutter, crew };
  }

  if (state === "stale") {
    // The wreck nobody has moved: on its side, rusted through.
    // Tipped onto its flank rather than flat on its roof: from the overview
    // a car on its side still reads as a car.
    // A mid-tone rust, not the faded rust multiplied over a dark body, and tipped
    // about 0.6 rad so its flank catches the light.
    addWreck(wreck([0, 0.36, 0], 0.7 * flip, 0.6 * flip, faded("#d2a57c")));
    parts.push(...debris(5, 2.1, faded("#7c766c"), 2.7, faded));
    addBarricade({ position: [0, 0, 3], rotationY: 0 }, faded(WARNING_ORANGE), faded("#e8e3d6"));
    addBarricade(
      { position: [2.5 * flip, 0, 3.1], rotationY: 0.12 },
      faded(WARNING_ORANGE),
      faded("#e8e3d6"),
      0.1 * flip,
    );
    addBarricade(
      { position: [-2.5 * flip, 0, 2.9], rotationY: -0.16 },
      faded(WARNING_ORANGE),
      faded("#e8e3d6"),
      -0.14 * flip,
    );
    addBarricade(
      { position: [0, 0, -3.2], rotationY: 0.08 },
      faded(WARNING_ORANGE),
      faded("#e8e3d6"),
      0.2 * flip,
    );
    // Three slow blinkers along the barricade line: the only thing still
    // working here (PLAN.md section 11, "weathered warning signs").
    for (const [x, z, rate] of [
      [-2.4 * flip, 3.2, 0.7],
      [0.2, 3.25, 0.55],
      [2.4 * flip, 3.35, 0.62],
    ] as [number, number, number][]) {
      lights.push({ position: [x, 1.15 + ROAD_SURFACE, z], color: faded(WARNING_ORANGE), rate, radius: 0.15, flash: true });
    }
    const sign: Placement = { position: [-2.3 * flip, 0, -2.4], rotationY: -0.5 * flip };
    parts.push(...lift(worksSign(sign, faded(WARNING_ORANGE), 0.17 * flip, tone, faded)));
    mark(sign.position[0], sign.position[2], 0.85, "sign");
    parts.push(...weeds(2.6, faded(mix(TREE_LEAF, "#9aa36a", 0.4)), detailLevel() === "near" ? 16 : 9));

    if (detailLevel() === "near") {
      // Tape strung from the barricade line's end post back to the rear one.
      parts.push(...tapeParts([3.55 * flip, 1.0, 3.1], [1.15 * flip, 1.0, -3.2], faded));
    }

    // The tow truck, backed up to the barricade line with its wheel-lift down
    // and its hook over the tape: it came, and nobody let it through.
    park("tow", { position: [-1.4 * flip, 0, 6.05], rotationY: 0.06 * flip });
    return { parts, lights, vehicles, clutter, crew };
  }

  // major: the city is on fire.
  if (BLENDER_MODELS) parts.push(...scorchParts(shade));
  else {
    parts.push({
      geometry: new CylinderGeometry(2.8, 2.8, 0.06, 26),
      color: shade("#2b2724"),
      position: [0, DECAL_Y, 0],
    });
  }
  addWreck(wreck([-1.15 * flip, 0.02, 0.8], 0.45 * flip, 0, shade("#b0a698")));
  addWreck(wreck([1.3 * flip, 0.1, -0.9], -0.25 * flip, 0.42 * flip, shade("#a59b8c"), "pickup"));
  parts.push(...debris(9, 2.4, shade("#5f5a54"), 0.7, shade));
  addBarricade({ position: [0, 0, 4.2], rotationY: 0 }, shade(WARNING_ORANGE), shade("#e8e3d6"));
  addBarricade({ position: [0, 0, -4.2], rotationY: 0 }, shade(WARNING_ORANGE), shade("#e8e3d6"));

  // The engine parks in its lane outside the cordon, and swings its ladder
  // round on the turntable until it reaches in over the barricade at the
  // fire: turned towards it, raised at `LADDER_PITCH`, into the smoke.
  const engine: Placement = { position: [-1.45 * flip, 0, 7.1], rotationY: 0.03 * flip };
  park("fire", engine, ladderYawToward(toVehicle(engine, FIRE_AT[0], FIRE_AT[1])));
  if (detailLevel() === "near") {
    // A line of hose from the engine's tail, under the barricade between its
    // posts, to the crew at the fire, and a spare length flaked beside it.
    parts.push(...hoseParts([-0.75 * flip, 4.7], [0.3 * flip, 1.6], shade), ...hoseCoilParts(1.35 * flip, 2.95, 0.6, shade));
  }

  // The crew, working the fire from upwind, clear of the flames.
  for (const [x, z, facing] of [
    [2.1 * flip, 2.4, -2.4],
    [-2.2 * flip, 3.2, 2.3],
    [2.3 * flip, -1.9, -1.2],
  ] as [number, number, number][]) {
    addCrew(x, z, facing, shade("#f2d43c"));
  }
  return { parts, lights, vehicles, clutter, crew };
}

const sceneCache = new Map<string, Scene>();

function scene(state: IncidentState, variant: number, tone: number): Scene {
  const key = `${detailLevel()}:${state}:${variant}:${toneKey(tone)}`;
  const hit = sceneCache.get(key);
  if (hit) return hit;
  const made = sceneFor(state, variant, tone);
  sceneCache.set(key, made);
  return made;
}

const decorGeometryCache = geometryCache<string>((key) => {
  const [level, state, variant, tone] = key.split(":");
  return atLevel(level as DetailLevel, () =>
    mergeParts(scene(state as IncidentState, Number(variant), Number(tone)).parts.map((part) => ({ ...part, surface: part.surface ?? SURFACE.metal }))),
  );
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
  level: DetailLevel = "lean",
): IncidentDecor {
  const tone = Number(toneKey(desaturation));
  const side = variant === 1 ? 1 : 0;
  // The near level exists only with the Blender models.
  const at = BLENDER_MODELS ? level : "lean";
  return {
    geometry: decorGeometryCache(`${at}:${state}:${side}:${toneKey(desaturation)}`),
    lights: atLevel(at, () => scene(state, side, tone).lights),
    crew: atLevel(at, () =>
      scene(state, side, tone).crew.map((spot) => ({
        position: spot.position,
        rotationY: spot.rotationY,
        geometry: crewGeometry(`${at}:${spot.helmet}:${toneKey(desaturation)}`),
      })),
    ),
  };
}

/** One worker at the origin facing +z, in the crew's hi-vis and a helmet. */
const crewGeometry = geometryCache<string>((key) => {
  const [level, helmet, tone] = key.split(":");
  return atLevel(level as DetailLevel, () =>
    mergeParts(
      figureParts({ position: [0, 0, 0], color: desaturate(WORKER_YELLOW, Number(tone)), rotationY: 0, helmet }),
    ),
  );
});

/**
 * Where the vehicles are parked and what else stands on the ground, for the
 * tests that keep them apart. The layout does not depend on the tone.
 */
export function incidentLayout(
  state: IncidentState,
  variant: number,
  level: DetailLevel = "lean",
): { vehicles: readonly ParkedService[]; clutter: readonly Clutter[] } {
  const { vehicles, clutter } = atLevel(level, () => scene(state, variant === 1 ? 1 : 0, 0));
  return { vehicles, clutter };
}

/** Converts between an incident's frame and a parked vehicle's. */
export const frames = { toIncident, toVehicle };

/**
 * The fire's glow, as a soft round falloff: a `size` by `size` RGBA image,
 * white, opaque at the centre and fading smoothly to nothing at the rim. It is
 * drawn additively under and around the flames in place of a point light,
 * which would have cost every lit material in the city a light per fire.
 * Generated here, never downloaded (PLAN.md section 4).
 */
export function glowFalloff(size = 64): Uint8Array {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = ((x + 0.5) / size) * 2 - 1;
      const dy = ((y + 0.5) / size) * 2 - 1;
      const t = Math.max(0, 1 - Math.hypot(dx, dy));
      // Smoothstep, squared: a warm core that falls away quickly and dies
      // out without a visible edge.
      const smooth = t * t * (3 - 2 * t);
      const i = (y * size + x) * 4;
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = Math.round(smooth * smooth * 255);
    }
  }
  return data;
}

let glowCache: DataTexture | null = null;

/** The falloff as a texture, built once and shared by every fire. */
export function glowTexture(): DataTexture {
  if (glowCache) return glowCache;
  const size = 64;
  const texture = new DataTexture(glowFalloff(size), size, size, RGBAFormat);
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.needsUpdate = true;
  glowCache = texture;
  return texture;
}

/** Which variant an incident gets: stable per id, no state of its own. */
export function variantFor(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return hash % 2;
}
