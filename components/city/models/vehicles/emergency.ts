/**
 * Emergency vehicles (PLAN.md section 11).
 *
 * Section 11 asks for emergency response at a collision, a fire at a major
 * bug, barricades and an abandoned wreck at a stale one, and a road crew at a
 * generic issue. These are the vehicles that show up: a police car and an
 * ambulance, a fire truck with its ladder raised at the smoke, a tow truck for
 * the wreck nobody has moved, and a works truck with a stack of cones.
 *
 * All five are built the way the fleet is (`./shapes`): the police car on the
 * fleet's sedan, the ambulance on its van, and the three trucks on the
 * chassis-cabs next to them -- side-profile cabs with a glass band, dark
 * arches and bumpers, lamps. What stands behind a truck's cab is the
 * service's own kit, and is built here.
 *
 * They are props of the incident, not members of the fleet: they never drive,
 * and they are merged into one geometry each so an incident that has three
 * vehicles parked at it still costs a handful of draw calls.
 *
 * Every vehicle is built in its own frame -- forward `+z`, ground `y = 0` --
 * and its light bar is reported separately, because a light bar has to blink
 * and a merged geometry cannot.
 */

import { BoxGeometry, ConeGeometry, CylinderGeometry, type BufferGeometry } from "three";
import { desaturate } from "../../palette";
import { geometryCache, mergeParts, toneKey, type Part, type Triple } from "../props/geometry";
import {
  BODY_SPECS,
  PANEL_SHADE,
  ROOF_SHADE,
  TRUCK_SPECS,
  bodyParts,
  truckParts,
} from "./shapes";

export interface EmergencyLight {
  /** In the vehicle's own frame. */
  position: Triple;
  color: string;
  /** Blinks per second, roughly. */
  rate: number;
  radius: number;
}

export type EmergencyKind = "police" | "ambulance" | "fire" | "tow" | "works";

export const EMERGENCY_KINDS: readonly EmergencyKind[] = [
  "police",
  "ambulance",
  "fire",
  "tow",
  "works",
];

/**
 * How far the fire truck's ladder is raised, in radians above horizontal.
 * `incidentDecor.ts` parks the engine so that this points at the smoke.
 */
export const LADDER_PITCH = 0.78;

/**
 * The ladder's foot: the turntable over the rear axle. The ladder rises from
 * here back over the tail, so the engine can park outside the barricades and
 * still reach in over them.
 */
export const LADDER_PIVOT: Triple = [0, 1.74, -1.75];
export const LADDER_LENGTH = 5.6;

/**
 * The top of the ladder in the engine's own frame, with the turntable turned
 * `yaw` radians about `y` (0: straight back over the tail).
 */
export function ladderTip(yaw = 0): Triple {
  const reach = Math.cos(LADDER_PITCH) * LADDER_LENGTH;
  return [
    LADDER_PIVOT[0] - Math.sin(yaw) * reach,
    LADDER_PIVOT[1] + Math.sin(LADDER_PITCH) * LADDER_LENGTH,
    LADDER_PIVOT[2] - Math.cos(yaw) * reach,
  ];
}

/**
 * The turntable yaw that points the ladder at `target`, a point `[x, z]` in
 * the engine's own frame. The incident parks the engine along the road and
 * swings the ladder round to the fire rather than parking across the street.
 */
export function ladderYawToward(target: [number, number]): number {
  return Math.atan2(-(target[0] - LADDER_PIVOT[0]), -(target[1] - LADDER_PIVOT[2]));
}

const TYRE = "#26282b";
const STEEL = "#8b9097";
const DARK = "#3a3d42";

/**
 * A fleet body in a service's colours. The fleet's paintwork is flagged as
 * paint and left near white for the instance colour to fill; an emergency
 * vehicle is not instanced, so its paint is set here: `shell` for the body,
 * `panel` for the darker panels (the van's stripe becomes the ambulance's),
 * and `roof` for the roof if it differs from the shell (a fire engine's is
 * white). Everything else keeps its own colour, desaturated with the city.
 */
function repaint(
  parts: Part[],
  shell: string,
  panel: string,
  shade: (hex: string) => string,
  roof = shell,
): Part[] {
  const paintFor = (color: string) =>
    color === PANEL_SHADE ? panel : color === ROOF_SHADE ? roof : shell;
  return parts.map((part) => ({
    ...part,
    color: part.paint ? paintFor(part.color) : shade(part.color),
    paint: false,
  }));
}

/** Four wheels under a chassis of the given wheelbase. */
function wheels(radius: number, x: number, front: number, rear: number, color = TYRE): Part[] {
  const tyre = new CylinderGeometry(radius, radius, 0.26, 8);
  return ([
    [x, front],
    [-x, front],
    [x, -rear],
    [-x, -rear],
  ] as [number, number][]).map(([wx, wz]) => ({
    geometry: tyre,
    color,
    position: [wx, radius, wz] as Triple,
    rotation: [0, 0, Math.PI / 2] as Triple,
  }));
}

const box = (size: Triple, position: Triple, color: string, rotation?: Triple): Part => ({
  geometry: new BoxGeometry(size[0], size[1], size[2]),
  color,
  position,
  rotation,
});

/**
 * A bar between two points, for the boom and the ladder rails: one box turned
 * about `x` so its length runs from `from` to `to`. Both ends share `x`.
 */
function strut(from: Triple, to: Triple, thickness: [number, number], color: string): Part {
  const dy = to[1] - from[1];
  const dz = to[2] - from[2];
  const length = Math.hypot(dy, dz);
  return box(
    [thickness[0], thickness[1], length],
    [from[0], (from[1] + to[1]) / 2, (from[2] + to[2]) / 2],
    color,
    // A box's `+z` end tips down under a positive turn about `x`; the struts
    // here all rise towards `-z`.
    [Math.atan2(dy, -dz), 0, 0],
  );
}

/**
 * The fire engine: a red cab-over with a white roof and stripe, a wall of
 * locker shutters down each flank, and a turntable ladder raised back over
 * the tail at the smoke.
 */
function fireParts(shade: (hex: string) => string, ladderYaw: number): Part[] {
  const spec = TRUCK_SPECS.engine;
  const w = spec.width;
  const h = spec.length / 2;
  const red = shade("#b8342c");
  const white = shade("#eeece6");
  const shutter = shade("#8e2923");
  const steel = shade(STEEL);
  const parts: Part[] = [
    // The cab roof is white on most engines, and it is what reads from above.
    ...repaint(truckParts("engine"), red, white, shade, white),
    // The body behind the cab, as high as the cab's waist and a little more.
    box([w, 1.2, h + spec.cabBack - 0.03], [0, 0.9, (spec.cabBack - 0.03 - h) / 2], red),
    // The white stripe along the whole truck, under the cab windows and over
    // the lockers. It stops short of the nose so the grille keeps its face.
    box([w + 0.035, 0.08, 4.78], [0, 1.15, -0.05], white),
    // Locker shutters: two ahead of the rear wheel, a short one over it and
    // one behind. Proud of both flanks, so one box is a door on each side.
    box([w + 0.02, 0.66, 0.76], [0, 0.74, 0.33], shutter),
    box([w + 0.02, 0.66, 0.76], [0, 0.74, -0.49], shutter),
    box([w + 0.02, 0.24, 0.7], [0, 0.95, -1.4], shutter),
    box([w + 0.02, 0.66, 0.5], [0, 0.74, -2.15], shutter),
    // The light bar over the windscreen; its lamps are `EMERGENCY_LIGHTS`.
    box([1.0, 0.1, 0.26], [0, spec.roof + 0.13, 2.0], shade(DARK)),
    // Turntable.
    {
      geometry: new CylinderGeometry(0.38, 0.44, 0.2, 7),
      color: steel,
      position: [0, 1.6, LADDER_PIVOT[2]],
    },
  ];

  // The ladder pivots at the turntable and runs up and back over the tail, so
  // the incident can park the engine short of the fire and have the ladder
  // reach it. `LADDER_PITCH` is the elevation; everything else is that one
  // angle applied to the pivot, which keeps the rails and the rungs on a line.
  // It is built about the pivot and then turned on the turntable as a whole.
  const up = Math.sin(LADDER_PITCH) * LADDER_LENGTH;
  const back = -Math.cos(LADDER_PITCH) * LADDER_LENGTH;
  const ladder: Part[] = [box([0.58, 0.14, 0.42], [0, -0.04, 0], shade(DARK))];
  for (const side of [-0.21, 0.21]) {
    ladder.push(strut([side, 0, 0], [side, up, back], [0.08, 0.1], steel));
  }
  const rungs = 7;
  for (let i = 0; i < rungs; i++) {
    const along = (i + 0.5) / rungs;
    ladder.push(box([0.42, 0.05, 0.05], [0, up * along, back * along], steel));
  }
  parts.push({
    geometry: mergeParts(ladder),
    color: "#ffffff",
    position: LADDER_PIVOT,
    rotation: [0, ladderYaw, 0],
  });
  return parts;
}

/**
 * The tow truck: a yellow short-bonnet cab, lockers either side of the boom
 * mount, a boom angled back with its hook on a line, and the wheel-lift
 * folded down behind the tail.
 */
function towParts(shade: (hex: string) => string): Part[] {
  const spec = TRUCK_SPECS.wrecker;
  const w = spec.width;
  const h = spec.length / 2;
  const yellow = shade("#d8a43c");
  const steel = shade(STEEL);
  const dark = shade(DARK);
  const length = h + spec.cabBack - 0.02;
  const mid = (spec.cabBack - 0.02 - h) / 2;
  const boomFoot: Triple = [0, 1.1, -0.45];
  const boomHead: Triple = [0, 2.05, -2.12];
  return [
    ...repaint(truckParts("wrecker"), yellow, yellow, shade),
    // The body: a painted skirt over the rear wheels, and a locker on each
    // side standing on it with the boom mount between them. The lockers stand
    // taller than a pickup's bed sides and carry dark shutters, which is what
    // stops the whole thing reading as a pickup with a pole in it.
    // The skirt stops short of the tail, so its end and the bumper's are not
    // one plane.
    box([w, 0.34, length - 0.04], [0, 0.45, mid + 0.02], yellow),
    box([0.3, 0.5, length], [w / 2 - 0.15, 0.87, mid], yellow),
    box([0.3, 0.5, length], [-w / 2 + 0.15, 0.87, mid], yellow),
    box([0.02, 0.36, length - 0.24], [w / 2 + 0.005, 0.87, mid], dark),
    box([0.02, 0.36, length - 0.24], [-w / 2 - 0.005, 0.87, mid], dark),
    box([w - 0.6, 0.05, length], [0, 0.645, mid], dark),
    box([0.4, 0.62, 0.44], [0, 0.93, boomFoot[2]], dark),
    // The boom, its line and its hook.
    strut(boomFoot, boomHead, [0.22, 0.22], steel),
    box([0.04, 0.72, 0.04], [0, boomHead[1] - 0.38, boomHead[2]], dark),
    {
      geometry: new ConeGeometry(0.1, 0.2, 5),
      color: steel,
      position: [0, boomHead[1] - 0.82, boomHead[2]],
      rotation: [Math.PI, 0, 0],
    },
    // The wheel-lift: a stinger out of the tail, its crossbar, and the two
    // forks a towed car's wheels sit in.
    box([0.18, 0.1, 0.5], [0, 0.3, -h - 0.25], dark),
    box([1.0, 0.1, 0.14], [0, 0.3, -h - 0.5], dark),
    box([0.12, 0.08, 0.34], [0.42, 0.3, -h - 0.62], dark),
    box([0.12, 0.08, 0.34], [-0.42, 0.3, -h - 0.62], dark),
    // The light bar; its lamp is `EMERGENCY_LIGHTS`.
    box([0.72, 0.1, 0.24], [0, spec.roof + 0.13, 0.36], dark),
  ];
}

/**
 * The road crew's truck: an orange short-bonnet cab and an open dropside bed
 * with stacks of cones in it, ready to be put out round a hole.
 */
function worksParts(shade: (hex: string) => string): Part[] {
  const spec = TRUCK_SPECS.dropside;
  const w = spec.width;
  const h = spec.length / 2;
  const orange = shade("#e8853c");
  const side = shade("#c96f2e");
  const dark = shade(DARK);
  const length = h + spec.cabBack - 0.02;
  const mid = (spec.cabBack - 0.02 - h) / 2;
  const floor = 0.7;
  const parts: Part[] = [
    ...repaint(truckParts("dropside"), orange, orange, shade),
    // The bed floor, and its dropsides: a headboard guarding the cab, two
    // sides and a tailgate, in a darker orange so the bed reads as a tray.
    box([w, 0.1, length], [0, floor - 0.05, mid], dark),
    box([w, 0.5, 0.06], [0, floor + 0.25, spec.cabBack - 0.05], side),
    box([0.06, 0.28, length], [w / 2 - 0.03, floor + 0.14, mid], side),
    box([0.06, 0.28, length], [-w / 2 + 0.03, floor + 0.14, mid], side),
    box([w, 0.28, 0.06], [0, floor + 0.14, -h + 0.03], side),
    // The light bar; its lamp is `EMERGENCY_LIGHTS`.
    box([0.64, 0.1, 0.22], [0, spec.roof + 0.13, 0.44], dark),
  ];
  // Three stacks of cones. Each is two cones nested one into the other and a
  // square foot: the upper cone's rim over the lower is what says "stack".
  const cone = shade("#f06a32");
  const foot = shade("#34322f");
  for (const [x, z] of [
    [-0.3, -0.42],
    [0.3, -0.55],
    [-0.05, -1.2],
  ] as [number, number][]) {
    parts.push(box([0.34, 0.05, 0.34], [x, floor + 0.025, z], foot));
    for (const lift of [0, 0.11]) {
      parts.push({
        geometry: new ConeGeometry(0.16, 0.52, 6),
        color: cone,
        position: [x, floor + 0.05 + lift + 0.26, z],
      });
    }
  }
  return parts;
}

function partsFor(kind: EmergencyKind, tone: number, ladderYaw = 0): Part[] {
  const shade = (hex: string) => desaturate(hex, tone);

  if (kind === "police") {
    // The fleet's own sedan in white, with a livery band down each flank --
    // which is what says "police" at the distance this is looked at from --
    // and a light bar on the roof.
    const spec = BODY_SPECS.sedan;
    return [
      ...repaint(bodyParts("sedan"), shade("#f0f2f4"), shade("#f0f2f4"), shade),
      // Proud of the paint but not as far as the wheel arches it crosses.
      box([spec.width + 0.012, 0.14, 1.9], [0, 0.46, 0.05], shade("#2f4f80")),
      box([0.94, 0.08, 0.28], [0, 1.1, -0.23], shade(DARK)),
      ...wheels(spec.wheelRadius, spec.wheels[0][0], spec.wheels[0][1], -spec.wheels[2][1]),
    ];
  }

  if (kind === "ambulance") {
    // The fleet's van in white, the stripe in red and a cross on each flank.
    const spec = BODY_SPECS.van;
    const stripe = shade("#c8493c");
    return [
      ...repaint(bodyParts("van"), shade("#f4f5f2"), stripe, shade),
      box([spec.width + 0.04, 0.42, 0.13], [0, 1.24, -0.75], stripe),
      box([spec.width + 0.04, 0.13, 0.42], [0, 1.24, -0.75], stripe),
      box([0.9, 0.1, 0.3], [0, 1.57, 0.2], shade(DARK)),
      ...wheels(spec.wheelRadius, spec.wheels[0][0], spec.wheels[0][1], -spec.wheels[2][1]),
    ];
  }

  if (kind === "fire") return fireParts(shade, ladderYaw);
  if (kind === "tow") return towParts(shade);
  return worksParts(shade);
}

/** Where each vehicle's lamps sit, in its own frame: on its light bar. */
export const EMERGENCY_LIGHTS: Record<EmergencyKind, EmergencyLight[]> = {
  police: [
    { position: [-0.3, 1.22, -0.23], color: "#4f8bff", rate: 3.4, radius: 0.19 },
    { position: [0.3, 1.22, -0.23], color: "#ff4d4d", rate: 3.4, radius: 0.19 },
  ],
  ambulance: [
    { position: [-0.28, 1.7, 0.2], color: "#4f8bff", rate: 2.8, radius: 0.18 },
    { position: [0.28, 1.7, 0.2], color: "#4f8bff", rate: 2.4, radius: 0.18 },
  ],
  fire: [
    { position: [-0.32, TRUCK_SPECS.engine.roof + 0.24, 2.0], color: "#ff4d4d", rate: 3, radius: 0.2 },
    { position: [0.32, TRUCK_SPECS.engine.roof + 0.24, 2.0], color: "#ff4d4d", rate: 2.6, radius: 0.2 },
  ],
  tow: [{ position: [0, TRUCK_SPECS.wrecker.roof + 0.24, 0.36], color: "#ffb347", rate: 1.8, radius: 0.19 }],
  works: [{ position: [0, TRUCK_SPECS.dropside.roof + 0.24, 0.44], color: "#ffb347", rate: 1.3, radius: 0.18 }],
};

const builder = geometryCache<string>((key) => {
  const [kind, tone] = key.split(":");
  return mergeParts(partsFor(kind as EmergencyKind, Number(tone)));
});

/** The merged geometry for one emergency vehicle at the city's tone. */
export function emergencyGeometry(kind: EmergencyKind, desaturation: number): BufferGeometry {
  return builder(`${kind}:${toneKey(desaturation)}`);
}

/**
 * The same vehicle as parts, for baking into a larger merged assembly. A fire
 * engine's ladder can be turned on its turntable by `ladderYaw` (see
 * `ladderYawToward`); the other vehicles ignore it.
 */
export function emergencyParts(kind: EmergencyKind, desaturation: number, ladderYaw = 0): Part[] {
  return partsFor(kind, desaturation, ladderYaw);
}
