/**
 * The city's vehicle fleet, built from side profiles and boxes (PLAN.md
 * sections 4, 17, 18).
 *
 * Six body types so a street reads as traffic rather than as a row of
 * identical blocks: hatchback, sedan, taxi, van, pickup, bus. Each body is a
 * handful of parts:
 *
 *   - a lower body drawn as a side profile and extruded across the car
 *     (`prismGeometry`), which is what gives a bonnet its slope and a boot its
 *     step without leaving the low-poly look;
 *   - a glasshouse a little narrower than the body, so the windows read as a
 *     dark band under a painted roof from every side;
 *   - dark wheel arches, bumpers and a grille, which is what makes a painted
 *     block read as a car at the size one is actually drawn;
 *   - lamps, reported separately so they can be drawn unlit (`lightsGeometry`).
 *
 * Each body is merged into one geometry (see `../props/geometry`), so a whole
 * body type costs a single instanced draw call however many are on the road.
 *
 * FRAME. Forward is `+z`, because `traffic.ts` yields `atan2(ux, uz)` as the
 * heading and a rotation of that about `y` maps local `+z` onto the direction
 * of travel. `y = 0` is the road surface. The fleet drives on the right, and
 * with `+z` forward and `+y` up the car's right-hand side is `-x`: that is the
 * kerb side, where the bus keeps its door.
 *
 * WIDTH. Nothing is wider than 1.2 units, arches and bumpers included.
 * `traffic.test.ts` checks that a car's lane offset plus half a body (0.6)
 * fits inside half a carriageway, and a minor road is only 4.5 wide: the bus
 * is long and tall, never wide.
 *
 * COLOUR. The paintwork's vertex colours are near white and flagged as paint,
 * so under `tintedMaterial` (`../props/material`) the per-instance colour set
 * by `Traffic.tsx` paints the body; the glass, arches, bumpers and tyres keep
 * their own colours on every car.
 */

import { BoxGeometry, CylinderGeometry, type BufferGeometry } from "three";
import type { Prng } from "@/lib/city/prng";
import {
  mergeParts,
  prismGeometry,
  type Part,
  type ProfilePoint,
  type Triple,
} from "../props/geometry";

export type VehicleBody = "hatchback" | "sedan" | "taxi" | "van" | "pickup" | "bus";

export const VEHICLE_BODIES: readonly VehicleBody[] = [
  "hatchback",
  "sedan",
  "taxi",
  "van",
  "pickup",
  "bus",
];

/** The widest body, in world units. Half of it has to fit the carriageway. */
export const MAX_BODY_WIDTH = 1.2;

/**
 * Paintwork shades: RELATIVE, multiplied by the car's own colour under
 * `tintedMaterial`. The roof catches a touch more light than the flanks.
 */
const PAINT = "#f0f0f0";
const ROOF = "#ffffff";
/** A slightly darker panel: the skirt of a bus, the stripe on a van. */
const PANEL = "#b4b4b4";
const PAINTWORK = new Set([PAINT, ROOF, PANEL]);

/** Everything else is ABSOLUTE: glass is glass whatever colour the car is. */
const GLASS = "#51647a";
const TRIM = "#3d4045";
const ARCH = "#232427";
const TYRE = "#26282b";
const HUB = "#b9bcc0";

/** Lamp colours. `Traffic.tsx` scales them with the city's lit windows. */
export const HEADLIGHT = "#fff2cf";
export const TAILLIGHT = "#ff4a3a";
const SIGN = "#ffd66b";

export interface BodySpec {
  /** Overall length along `z` and width along `x`, world units. */
  length: number;
  width: number;
  /** Wheel radius and the `[x, z]` positions of the four wheels. */
  wheelRadius: number;
  wheels: readonly [number, number][];
  /** Where the headlight and taillight lamps sit, in the body frame. */
  headlights: readonly Triple[];
  taillights: readonly Triple[];
  /** Width and height of one lamp. */
  lamp: [number, number];
  /** Rarity weight when a fleet is drawn; buses and vans are rare. */
  weight: number;
}

const wheelSet = (x: number, front: number, rear: number): [number, number][] => [
  [x, front],
  [-x, front],
  [x, -rear],
  [-x, -rear],
];

const pair = (x: number, y: number, z: number): Triple[] => [
  [x, y, z],
  [-x, y, z],
];

const SEDAN: BodySpec = {
  length: 2.85,
  width: 1.1,
  wheelRadius: 0.25,
  wheels: wheelSet(0.5, 0.92, 0.92),
  headlights: pair(0.36, 0.37, 1.415),
  taillights: pair(0.38, 0.44, -1.415),
  lamp: [0.24, 0.1],
  weight: 26,
};

export const BODY_SPECS: Record<VehicleBody, BodySpec> = {
  hatchback: {
    length: 2.35,
    width: 1.02,
    wheelRadius: 0.24,
    wheels: wheelSet(0.47, 0.74, 0.72),
    headlights: pair(0.32, 0.38, 1.165),
    taillights: pair(0.34, 0.55, -1.165),
    lamp: [0.2, 0.1],
    weight: 28,
  },
  sedan: SEDAN,
  taxi: { ...SEDAN, weight: 6 },
  van: {
    length: 3.1,
    width: 1.16,
    wheelRadius: 0.26,
    wheels: wheelSet(0.54, 1.02, 1.0),
    headlights: pair(0.4, 0.42, 1.545),
    taillights: pair(0.44, 0.66, -1.545),
    lamp: [0.18, 0.2],
    weight: 12,
  },
  pickup: {
    length: 3,
    width: 1.14,
    wheelRadius: 0.27,
    wheels: wheelSet(0.52, 0.95, 0.98),
    headlights: pair(0.38, 0.4, 1.495),
    taillights: pair(0.42, 0.6, -1.495),
    lamp: [0.18, 0.14],
    weight: 16,
  },
  bus: {
    length: 4.5,
    width: 1.16,
    wheelRadius: 0.3,
    wheels: wheelSet(0.54, 1.55, 1.4),
    headlights: pair(0.4, 0.48, 2.245),
    taillights: pair(0.44, 0.62, -2.245),
    lamp: [0.2, 0.14],
    weight: 8,
  },
};

const box = (size: Triple, position: Triple, color: string): Part => ({
  geometry: new BoxGeometry(size[0], size[1], size[2]),
  color,
  paint: PAINTWORK.has(color),
  position,
});

const prism = (profile: readonly ProfilePoint[], width: number, color: string): Part => ({
  geometry: prismGeometry(profile, width),
  color,
  paint: PAINTWORK.has(color),
});

/**
 * A wheel arch: a dark trapezoid over the tyre, a touch wider than the body so
 * it shows on both flanks. It is what stops a car looking as if it were
 * resting on four pucks.
 */
function arch(z: number, radius: number, bottom: number, width: number): Part {
  return prism(
    [
      [z - radius * 1.3, bottom],
      [z + radius * 1.3, bottom],
      [z + radius * 0.85, radius * 2.2],
      [z - radius * 0.85, radius * 2.2],
    ],
    width + 0.03,
    ARCH,
  );
}

/** The four corners a car shares: arches over both axles, both bumpers. */
function running(spec: BodySpec, bottom: number, bumperY: number, sill = true): Part[] {
  const w = spec.width;
  const r = spec.wheelRadius;
  const half = spec.length / 2;
  const front = spec.wheels[0][1];
  const rear = spec.wheels[2][1];
  const parts = [
    arch(front, r, bottom, w),
    arch(rear, r, bottom, w),
    box([w * 1.03, 0.14, 0.16], [0, bumperY, half - 0.05], TRIM),
    box([w * 1.03, 0.14, 0.16], [0, bumperY, -half + 0.05], TRIM),
  ];
  // A dark sill between the arches grounds the body on the road. The bus has
  // a painted skirt there instead.
  if (sill) {
    parts.push(
      box([w * 1.01, 0.07, front - rear - r * 2.4], [0, bottom + 0.04, (front + rear) / 2], TRIM),
    );
  }
  return parts;
}

/** Every body's parts, in its own frame. */
function bodyParts(kind: VehicleBody): Part[] {
  const spec = BODY_SPECS[kind];
  const w = spec.width;
  const h = spec.length / 2;

  if (kind === "hatchback") {
    // Two boxes: a short bonnet and a near-vertical tailgate.
    return [
      prism(
        [
          [-h, 0.18],
          [h, 0.18],
          [h, 0.42],
          [1.0, 0.6],
          [0.5, 0.66],
          [-1.1, 0.7],
          [-h, 0.6],
        ],
        w,
        PAINT,
      ),
      prism(
        [
          [0.53, 0.64],
          [0.04, 1.05],
          [-0.86, 1.05],
          [-1.1, 0.68],
        ],
        w * 0.86,
        GLASS,
      ),
      box([w * 0.9, 0.07, 0.98], [0, 1.08, -0.41], ROOF),
      box([w * 0.88, 0.4, 0.09], [0, 0.86, -0.32], PAINT),
      box([w * 0.4, 0.08, 0.04], [0, 0.38, h + 0.005], ARCH),
      ...running(spec, 0.18, 0.27),
    ];
  }

  if (kind === "sedan" || kind === "taxi") {
    // Three boxes: bonnet, cabin, boot.
    const parts: Part[] = [
      prism(
        [
          [-h, 0.18],
          [h, 0.18],
          [h, 0.42],
          [1.28, 0.57],
          [0.62, 0.63],
          [-1.0, 0.65],
          [-1.36, 0.63],
          [-h, 0.5],
        ],
        w,
        PAINT,
      ),
      prism(
        [
          [0.64, 0.61],
          [0.14, 1.0],
          [-0.6, 1.0],
          [-1.02, 0.63],
        ],
        w * 0.86,
        GLASS,
      ),
      box([w * 0.9, 0.07, 0.84], [0, 1.03, -0.23], ROOF),
      box([w * 0.88, 0.36, 0.09], [0, 0.82, -0.2], PAINT),
      box([w * 0.4, 0.08, 0.04], [0, 0.37, h + 0.005], ARCH),
      ...running(spec, 0.18, 0.26),
    ];
    if (kind === "taxi") {
      // The sign's lit face is in `lightsGeometry`; this is its base, and a
      // dark band down each flank where a livery would run.
      parts.push(box([0.44, 0.05, 0.22], [0, 1.09, -0.23], TRIM));
      parts.push(box([w * 1.01, 0.06, 1.5], [0, 0.5, -0.05], TRIM));
    }
    return parts;
  }

  if (kind === "van") {
    // One box and a stub of a bonnet: a high-roofed delivery van.
    return [
      prism(
        [
          [-h, 0.2],
          [h, 0.2],
          [h, 0.5],
          [1.34, 0.76],
          [0.5, 0.8],
          [-h, 0.8],
        ],
        w,
        PAINT,
      ),
      // The load box, full width and blind: only the cab has windows.
      box([w, 0.72, 2.06], [0, 1.16, -0.52], ROOF),
      prism(
        [
          [1.36, 0.76],
          [0.95, 1.38],
          [0.5, 1.38],
          [0.5, 0.76],
        ],
        w * 0.94,
        GLASS,
      ),
      box([w * 0.96, 0.08, 0.5], [0, 1.41, 0.74], ROOF),
      box([w * 1.01, 0.1, 1.9], [0, 1.02, -0.54], PANEL),
      // The seam between the rear doors.
      box([0.04, 0.66, 0.02], [0, 1.14, -h - 0.005], TRIM),
      box([w * 0.5, 0.14, 0.04], [0, 0.44, h + 0.005], ARCH),
      ...running(spec, 0.2, 0.3),
    ];
  }

  if (kind === "pickup") {
    // A cab forward of an open bed.
    return [
      prism(
        [
          [-h, 0.22],
          [h, 0.22],
          [h, 0.48],
          [1.28, 0.66],
          [0.6, 0.72],
          [-h, 0.72],
        ],
        w,
        PAINT,
      ),
      prism(
        [
          [0.62, 0.7],
          [0.24, 1.18],
          [-0.3, 1.18],
          [-0.3, 0.7],
        ],
        w * 0.88,
        GLASS,
      ),
      box([w * 0.92, 0.07, 0.62], [0, 1.21, -0.04], ROOF),
      // The bed: a bulkhead, two sides and a tailgate around a dark floor.
      box([w, 0.3, 0.07], [0, 0.87, -0.37], PAINT),
      box([0.07, 0.3, 1.1], [w / 2 - 0.035, 0.87, -0.95], PAINT),
      box([0.07, 0.3, 1.1], [-w / 2 + 0.035, 0.87, -0.95], PAINT),
      box([w, 0.3, 0.07], [0, 0.87, -h + 0.035], PAINT),
      box([w * 0.86, 0.02, 1.06], [0, 0.73, -0.93], TRIM),
      box([w * 0.5, 0.1, 0.04], [0, 0.42, h + 0.005], ARCH),
      ...running(spec, 0.22, 0.32),
    ];
  }

  // The bus: a painted skirt, a band of glass the full length of the body with
  // pillars through it, a roof and the pod on top of it.
  const pillars = [-1.75, -1.05, -0.35, 0.35, 1.05];
  return [
    box([w, 0.8, spec.length], [0, 0.64, 0], PAINT),
    box([w * 1.02, 0.2, spec.length * 0.97], [0, 0.34, 0], PANEL),
    box([w * 0.97, 0.56, spec.length * 0.995], [0, 1.32, 0], GLASS),
    ...pillars.map((z) => box([w, 0.56, 0.1], [0, 1.32, z], PAINT)),
    // The windscreen runs down over the front of the skirt, as a bus's does.
    box([w * 0.9, 0.34, 0.03], [0, 0.94, h + 0.005], GLASS),
    box([w, 0.26, spec.length], [0, 1.73, 0], ROOF),
    box([w * 0.62, 0.14, 1.1], [0, 1.93, -0.9], PANEL),
    // The door, on the kerb side (`-x`), just behind the front axle.
    box([0.03, 0.9, 0.62], [-w / 2 - 0.005, 0.78, 0.8], GLASS),
    box([w * 0.44, 0.1, 0.04], [0, 0.52, h + 0.005], ARCH),
    ...running(spec, 0.24, 0.34, false),
  ];
}

const bodyCache = new Map<VehicleBody, BufferGeometry>();

/** The merged body of one vehicle type. Built once, shared by every instance. */
export function bodyGeometry(kind: VehicleBody): BufferGeometry {
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
 * Radius 1, so the instance scale sets the size. The hub is six-sided and
 * pale against an eight-sided tyre, which is what makes the spin visible.
 */
export function wheelGeometry(): BufferGeometry {
  if (wheelCache) return wheelCache;
  const tyre = new CylinderGeometry(1, 1, 0.9, 8);
  const hub = new CylinderGeometry(0.5, 0.5, 0.94, 6);
  wheelCache = mergeParts([
    { geometry: tyre, color: TYRE, rotation: [0, 0, Math.PI / 2] },
    { geometry: hub, color: HUB, rotation: [0, 0, Math.PI / 2] },
  ]);
  return wheelCache;
}

const lightsCache = new Map<VehicleBody, BufferGeometry>();

/**
 * Head and tail lamps as small boxes, drawn with an unlit material so they
 * read as lit glass at dusk without adding a light to the scene (section 39).
 * The taxi's roof sign and the bus's destination board are lamps too: they
 * come up with the city's windows.
 */
export function lightsGeometry(kind: VehicleBody): BufferGeometry {
  const hit = lightsCache.get(kind);
  if (hit) return hit;
  const spec = BODY_SPECS[kind];
  const lamp = new BoxGeometry(spec.lamp[0], spec.lamp[1], 0.05);
  const parts: Part[] = [
    ...spec.headlights.map((position) => ({
      geometry: lamp,
      color: HEADLIGHT,
      position: [...position] as Triple,
    })),
    ...spec.taillights.map((position) => ({
      geometry: lamp,
      color: TAILLIGHT,
      position: [...position] as Triple,
    })),
  ];
  if (kind === "taxi") {
    parts.push(box([0.4, 0.13, 0.18], [0, 1.18, -0.23], SIGN));
  }
  if (kind === "bus") {
    parts.push(box([spec.width * 0.66, 0.14, 0.03], [0, 1.73, spec.length / 2 + 0.01], SIGN));
  }
  const made = mergeParts(parts);
  lightsCache.set(kind, made);
  return made;
}

const parkedCache = new Map<VehicleBody, BufferGeometry>();

/**
 * A parked vehicle: the body with its wheels baked in, because a car at the
 * kerb never moves and one geometry is one draw call for the whole street.
 * Its lamps are baked in too, unlit: a parked car's lights are off.
 */
export function parkedGeometry(kind: VehicleBody): BufferGeometry {
  const hit = parkedCache.get(kind);
  if (hit) return hit;
  const spec = BODY_SPECS[kind];
  const tyre = new CylinderGeometry(spec.wheelRadius, spec.wheelRadius, 0.22, 7);
  const lamp = new BoxGeometry(spec.lamp[0], spec.lamp[1], 0.05);
  const parts: Part[] = [
    ...bodyParts(kind),
    ...spec.wheels.map(([x, z]) => ({
      geometry: tyre,
      color: TYRE,
      position: [x, spec.wheelRadius, z] as Triple,
      rotation: [0, 0, Math.PI / 2] as Triple,
    })),
    ...spec.headlights.map((position) => ({
      geometry: lamp,
      color: "#d8d8d2",
      position: [...position] as Triple,
    })),
    ...spec.taillights.map((position) => ({
      geometry: lamp,
      color: "#8a3a33",
      position: [...position] as Triple,
    })),
  ];
  const made = mergeParts(parts);
  parkedCache.set(kind, made);
  return made;
}

/**
 * Seeded body colours: a street is mostly whites, silvers and greys with a
 * few colours through it, the way a real one is, all held a little muted so
 * the fleet sits inside the city palette. The last entry is the taxi's.
 */
export const CAR_COLORS = [
  "#e9e6dc", // warm white
  "#c4c9cd", // silver
  "#7a8189", // graphite
  "#46505c", // slate
  "#5f8fb0", // steel blue
  "#4f8a86", // teal
  "#7f9e77", // sage
  "#c26a58", // brick
  "#d98b6a", // terracotta
  "#e2c46a", // mustard
  "#8d8391", // plum
  "#e8b53a", // taxi yellow
];

const NEUTRALS = [0, 1, 2, 3];
const COLOURS = [4, 5, 6, 7, 8, 9, 10];
/** Municipal liveries: a city runs its buses in two or three colours at most. */
const BUS_LIVERIES = [4, 7, 5];
export const TAXI_COLOR = CAR_COLORS.length - 1;

/**
 * A colour for one vehicle. Taxis are always taxi yellow and buses wear the
 * city's liveries; vans are mostly fleet white; everything else is a neutral
 * a little more often than not.
 */
export function paintFor(body: VehicleBody, prng: Prng): number {
  if (body === "taxi") return TAXI_COLOR;
  if (body === "bus") return prng.pick(BUS_LIVERIES);
  const neutralShare = body === "van" ? 0.7 : 0.5;
  return prng.next() < neutralShare ? prng.pick(NEUTRALS) : prng.pick(COLOURS);
}

const TOTAL_WEIGHT = VEHICLE_BODIES.reduce((sum, kind) => sum + BODY_SPECS[kind].weight, 0);

/** One seeded body type. Vans, taxis and buses are rare; hatchbacks and sedans are not. */
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
    const body = pickBody(prng);
    looks.push({ body, colorIndex: paintFor(body, prng) });
  }
  return looks;
}
