/**
 * The city's vehicle fleet, built from boxes (PLAN.md sections 4, 17, 18).
 *
 * Five body types so a street reads as traffic rather than as a row of
 * identical blocks: hatchback, sedan, van, pickup, bus. Each one is a merged
 * geometry (see `../props/geometry`), so a whole body type costs a single
 * instanced draw call however many of them are on the road.
 *
 * FRAME. Forward is `+z`, because `traffic.ts` yields `atan2(ux, uz)` as the
 * heading and a rotation of that about `y` maps local `+z` onto the direction
 * of travel. `y = 0` is the road surface, so a vehicle instance is placed at
 * road height with no vertical offset.
 *
 * WIDTH. No body is wider than 1.2 units. `traffic.test.ts` checks that a
 * car's lane offset plus half a body (0.6) fits inside half a carriageway, and
 * a minor road is only 4.5 wide: the bus is long and tall, never wide.
 *
 * COLOUR. Vertex colours here are RELATIVE: the body shell is near white and
 * everything else is a shade of it, so the per-instance colour set by
 * `Traffic.tsx` paints the car and the glass and tyres stay dark.
 */

import {
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  type BufferGeometry as Geometry,
} from "three";
import type { Prng } from "@/lib/city/prng";
import { mergeParts, type Part } from "../props/geometry";

export type VehicleBody = "hatchback" | "sedan" | "van" | "pickup" | "bus";

export const VEHICLE_BODIES: readonly VehicleBody[] = [
  "hatchback",
  "sedan",
  "van",
  "pickup",
  "bus",
];

/** The widest body, in world units. Half of it has to fit the carriageway. */
export const MAX_BODY_WIDTH = 1.2;

/** Relative shades baked into every body. Multiplied by the car's own colour. */
const SHELL = "#f2f2f2";
const ROOF = "#ffffff";
const GLASS = "#2f343b";
const TRIM = "#6e7278";
const TYRE = "#26282b";
const HUB = "#b9bcc0";

export interface BodySpec {
  /** Overall length along `z` and width along `x`, world units. */
  length: number;
  width: number;
  /** Wheel radius and the `[x, z]` positions of the four wheels. */
  wheelRadius: number;
  wheels: readonly [number, number][];
  /** Where the headlight and taillight quads sit, in the body frame. */
  headlights: readonly [number, number, number][];
  taillights: readonly [number, number, number][];
  /** Rarity weight when a fleet is drawn; buses and vans are rare. */
  weight: number;
}

const wheelSet = (x: number, front: number, rear: number): [number, number][] => [
  [x, front],
  [-x, front],
  [x, -rear],
  [-x, -rear],
];

export const BODY_SPECS: Record<VehicleBody, BodySpec> = {
  hatchback: {
    length: 2.35,
    width: 1.02,
    wheelRadius: 0.24,
    wheels: wheelSet(0.5, 0.72, 0.72),
    headlights: [
      [0.32, 0.58, 1.18],
      [-0.32, 0.58, 1.18],
    ],
    taillights: [
      [0.32, 0.66, -1.18],
      [-0.32, 0.66, -1.18],
    ],
    weight: 30,
  },
  sedan: {
    length: 2.85,
    width: 1.1,
    wheelRadius: 0.25,
    wheels: wheelSet(0.53, 0.92, 0.92),
    headlights: [
      [0.36, 0.56, 1.43],
      [-0.36, 0.56, 1.43],
    ],
    taillights: [
      [0.36, 0.6, -1.43],
      [-0.36, 0.6, -1.43],
    ],
    weight: 30,
  },
  van: {
    length: 3.1,
    width: 1.18,
    wheelRadius: 0.26,
    wheels: wheelSet(0.57, 1.02, 1.0),
    headlights: [
      [0.38, 0.62, 1.56],
      [-0.38, 0.62, 1.56],
    ],
    taillights: [
      [0.38, 0.9, -1.56],
      [-0.38, 0.9, -1.56],
    ],
    weight: 12,
  },
  pickup: {
    length: 3,
    width: 1.14,
    wheelRadius: 0.27,
    wheels: wheelSet(0.55, 0.95, 0.98),
    headlights: [
      [0.36, 0.58, 1.51],
      [-0.36, 0.58, 1.51],
    ],
    taillights: [
      [0.36, 0.66, -1.51],
      [-0.36, 0.66, -1.51],
    ],
    weight: 18,
  },
  bus: {
    length: 4.5,
    width: 1.2,
    wheelRadius: 0.3,
    wheels: wheelSet(0.57, 1.55, 1.45),
    headlights: [
      [0.4, 0.62, 2.26],
      [-0.4, 0.62, 2.26],
    ],
    taillights: [
      [0.4, 0.8, -2.26],
      [-0.4, 0.8, -2.26],
    ],
    weight: 10,
  },
};

/** Every body's parts, in its own frame. Boxes only: this is a diorama. */
function bodyParts(kind: VehicleBody): Part[] {
  const spec = BODY_SPECS[kind];
  const w = spec.width;
  const parts: Part[] = [];
  const box = (size: [number, number, number]) => new BoxGeometry(size[0], size[1], size[2]);

  if (kind === "hatchback") {
    parts.push({ geometry: box([w, 0.5, spec.length]), color: SHELL, position: [0, 0.52, 0] });
    parts.push({ geometry: box([w * 0.9, 0.44, 1.2]), color: ROOF, position: [0, 0.94, -0.16] });
    parts.push({ geometry: box([w * 0.93, 0.24, 1.24]), color: GLASS, position: [0, 0.96, -0.16] });
    parts.push({ geometry: box([w * 0.97, 0.12, 0.12]), color: TRIM, position: [0, 0.42, 1.16] });
    parts.push({ geometry: box([w * 0.97, 0.12, 0.12]), color: TRIM, position: [0, 0.42, -1.16] });
  } else if (kind === "sedan") {
    parts.push({ geometry: box([w, 0.46, spec.length]), color: SHELL, position: [0, 0.5, 0] });
    parts.push({ geometry: box([w * 0.88, 0.42, 1.35]), color: ROOF, position: [0, 0.9, -0.1] });
    parts.push({ geometry: box([w * 0.91, 0.22, 1.4]), color: GLASS, position: [0, 0.92, -0.1] });
    parts.push({ geometry: box([w * 0.7, 0.12, 0.5]), color: TRIM, position: [0, 0.74, 1.1] });
    parts.push({ geometry: box([w * 0.97, 0.12, 0.12]), color: TRIM, position: [0, 0.4, 1.41] });
    parts.push({ geometry: box([w * 0.97, 0.12, 0.12]), color: TRIM, position: [0, 0.4, -1.41] });
  } else if (kind === "van") {
    parts.push({ geometry: box([w, 1.1, spec.length * 0.78]), color: SHELL, position: [0, 0.84, -0.32] });
    parts.push({ geometry: box([w * 0.98, 0.72, 1.0]), color: SHELL, position: [0, 0.65, 1.06] });
    parts.push({ geometry: box([w * 0.94, 0.34, 0.16]), color: GLASS, position: [0, 0.86, 1.55] });
    parts.push({ geometry: box([w * 1.01, 0.3, 0.9]), color: GLASS, position: [0, 0.94, 0.72] });
    parts.push({ geometry: box([w * 0.9, 0.1, spec.length * 0.7]), color: ROOF, position: [0, 1.4, -0.32] });
    parts.push({ geometry: box([w * 0.97, 0.12, 0.12]), color: TRIM, position: [0, 0.4, 1.54] });
  } else if (kind === "pickup") {
    parts.push({ geometry: box([w, 0.42, spec.length]), color: SHELL, position: [0, 0.48, 0] });
    parts.push({ geometry: box([w * 0.93, 0.56, 1.15]), color: ROOF, position: [0, 0.96, 0.5] });
    parts.push({ geometry: box([w * 0.96, 0.26, 1.18]), color: GLASS, position: [0, 1.02, 0.5] });
    // The open bed: two sides, a tailgate and a dark floor.
    parts.push({ geometry: box([0.1, 0.4, 1.5]), color: SHELL, position: [w / 2 - 0.05, 0.88, -0.7] });
    parts.push({ geometry: box([0.1, 0.4, 1.5]), color: SHELL, position: [-w / 2 + 0.05, 0.88, -0.7] });
    parts.push({ geometry: box([w, 0.4, 0.1]), color: SHELL, position: [0, 0.88, -1.44] });
    parts.push({ geometry: box([w * 0.9, 0.06, 1.5]), color: TRIM, position: [0, 0.71, -0.7] });
  } else {
    parts.push({ geometry: box([w, 1.5, spec.length]), color: SHELL, position: [0, 1.05, 0] });
    parts.push({ geometry: box([w * 1.01, 0.42, spec.length * 0.9]), color: GLASS, position: [0, 1.42, -0.05] });
    parts.push({ geometry: box([w * 0.94, 0.12, spec.length * 0.92]), color: ROOF, position: [0, 1.82, 0] });
    parts.push({ geometry: box([w * 0.36, 0.34, 0.1]), color: GLASS, position: [w * 0.26, 1.42, spec.length / 2] });
    // A door well, so the near side reads as a bus rather than a container.
    parts.push({ geometry: box([0.08, 0.86, 0.62]), color: GLASS, position: [w / 2 - 0.02, 0.86, 1.1] });
    parts.push({ geometry: box([w * 0.98, 0.14, 0.14]), color: TRIM, position: [0, 0.4, spec.length / 2 - 0.02] });
  }

  // Wheel arches: a dark strip under the sills makes the body sit on the road.
  parts.push({
    geometry: box([w * 1.02, 0.14, spec.length * 0.92]),
    color: TRIM,
    position: [0, kind === "bus" ? 0.34 : 0.3, 0],
  });
  return parts;
}

const bodyCache = new Map<VehicleBody, BufferGeometry>();

/** The merged body of one vehicle type. Built once, shared by every instance. */
export function bodyGeometry(kind: VehicleBody): Geometry {
  const hit = bodyCache.get(kind);
  if (hit) return hit;
  const made = mergeParts(bodyParts(kind));
  bodyCache.set(kind, made);
  return made;
}

let wheelCache: BufferGeometry | null = null;

/**
 * One wheel, axle along `x` so a spin is a rotation about the instance's own
 * `x` after its heading has been applied (`Traffic.tsx` uses `YXZ` order).
 * Radius 1, so the instance scale sets the size.
 */
export function wheelGeometry(): Geometry {
  if (wheelCache) return wheelCache;
  const tyre = new CylinderGeometry(1, 1, 0.9, 8);
  const hub = new CylinderGeometry(0.45, 0.45, 0.94, 6);
  wheelCache = mergeParts([
    { geometry: tyre, color: TYRE, rotation: [0, 0, Math.PI / 2] },
    { geometry: hub, color: HUB, rotation: [0, 0, Math.PI / 2] },
  ]);
  return wheelCache;
}

const lightsCache = new Map<VehicleBody, BufferGeometry>();

/**
 * Head and tail lamps as small quads, drawn with an unlit material so they
 * read as lit glass at dusk without adding a light to the scene (section 39).
 */
export function lightsGeometry(kind: VehicleBody): Geometry {
  const hit = lightsCache.get(kind);
  if (hit) return hit;
  const spec = BODY_SPECS[kind];
  const lamp = new BoxGeometry(0.2, 0.12, 0.06);
  const parts: Part[] = [
    ...spec.headlights.map((position) => ({
      geometry: lamp,
      color: "#fff4d2",
      position: [...position] as [number, number, number],
    })),
    ...spec.taillights.map((position) => ({
      geometry: lamp,
      color: "#ff5f4a",
      position: [...position] as [number, number, number],
    })),
  ];
  const made = mergeParts(parts);
  lightsCache.set(kind, made);
  return made;
}

const parkedCache = new Map<VehicleBody, BufferGeometry>();

/**
 * A parked vehicle: the body with its wheels baked in, because a car at the
 * kerb never moves and one geometry is one draw call for the whole street.
 */
export function parkedGeometry(kind: VehicleBody): Geometry {
  const hit = parkedCache.get(kind);
  if (hit) return hit;
  const spec = BODY_SPECS[kind];
  const tyre = new CylinderGeometry(spec.wheelRadius, spec.wheelRadius, 0.22, 7);
  const parts: Part[] = [
    ...bodyParts(kind),
    ...spec.wheels.map(([x, z]) => ({
      geometry: tyre,
      color: TYRE,
      position: [x, spec.wheelRadius, z] as [number, number, number],
      rotation: [0, 0, Math.PI / 2] as [number, number, number],
    })),
  ];
  const made = mergeParts(parts);
  parkedCache.set(kind, made);
  return made;
}

/** Seeded body colours. Muted, so the fleet sits inside the city palette. */
export const CAR_COLORS = [
  "#d8d4c8",
  "#5f8fb0",
  "#c26a58",
  "#7f9e77",
  "#e2c46a",
  "#8d8391",
  "#b8bec4",
  "#6d7c86",
];

const TOTAL_WEIGHT = VEHICLE_BODIES.reduce((sum, kind) => sum + BODY_SPECS[kind].weight, 0);

/** One seeded body type. Vans and buses are rare; hatchbacks and sedans are not. */
export function pickBody(prng: Prng): VehicleBody {
  let roll = prng.next() * TOTAL_WEIGHT;
  for (const kind of VEHICLE_BODIES) {
    roll -= BODY_SPECS[kind].weight;
    if (roll <= 0) return kind;
  }
  return "sedan";
}

/** A body type and a colour for each car in a fleet, deterministic per seed. */
export interface VehicleLook {
  body: VehicleBody;
  colorIndex: number;
}

export function fleetLooks(count: number, prng: Prng): VehicleLook[] {
  const looks: VehicleLook[] = [];
  for (let i = 0; i < count; i++) {
    looks.push({ body: pickBody(prng), colorIndex: prng.int(0, CAR_COLORS.length - 1) });
  }
  return looks;
}
