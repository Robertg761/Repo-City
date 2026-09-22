/**
 * Emergency vehicles (PLAN.md section 11).
 *
 * Section 11 asks for emergency response at a collision, a fire at a major
 * bug, barricades and an abandoned wreck at a stale one, and a road crew at a
 * generic issue. These are the vehicles that show up: a police car and an
 * ambulance, a fire truck with its ladder raised at the smoke, a tow truck for
 * the wreck nobody has moved, and a works truck with a stack of cones.
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

export interface EmergencyLight {
  /** In the vehicle's own frame. */
  position: Triple;
  color: string;
  /** Blinks per second, roughly. */
  rate: number;
  radius: number;
}

export type EmergencyKind = "police" | "ambulance" | "fire" | "tow" | "works";

/**
 * How far the fire truck's ladder is raised, in radians above horizontal.
 * `incidentDecor.ts` parks the engine so that this points at the smoke.
 */
export const LADDER_PITCH = 0.78;

const TYRE = "#26282b";
const GLASS = "#2f343b";
const STEEL = "#8b9097";
const DARK = "#3a3d42";

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

function partsFor(kind: EmergencyKind, tone: number): Part[] {
  const shade = (hex: string) => desaturate(hex, tone);
  const box = (w: number, h: number, d: number) => new BoxGeometry(w, h, d);

  if (kind === "police") {
    const shell = shade("#f0f2f4");
    const livery = shade("#2f4f80");
    return [
      { geometry: box(1.25, 0.5, 3.1), color: shell, position: [0, 0.56, 0] },
      { geometry: box(1.12, 0.46, 1.4), color: shell, position: [0, 0.99, -0.2] },
      { geometry: box(1.15, 0.24, 1.44), color: shade(GLASS), position: [0, 1.02, -0.2] },
      // The livery: a band down each flank, which is what says "police" at
      // the distance this is actually looked at from.
      { geometry: box(1.27, 0.26, 2.2), color: livery, position: [0, 0.52, 0.1] },
      { geometry: box(1.27, 0.12, 0.14), color: shade(DARK), position: [0, 0.42, 1.52] },
      // Light bar: the housing here, the lamps as blinking meshes.
      { geometry: box(0.94, 0.1, 0.3), color: shade(DARK), position: [0, 1.25, -0.1] },
      ...wheels(0.26, 0.57, 1.0, 1.0),
    ];
  }

  if (kind === "ambulance") {
    const shell = shade("#f4f5f2");
    const stripe = shade("#c8493c");
    return [
      { geometry: box(1.35, 1.3, 2.5), color: shell, position: [0, 1.0, -0.55] },
      { geometry: box(1.3, 0.85, 1.25), color: shell, position: [0, 0.78, 1.35] },
      { geometry: box(1.32, 0.34, 0.14), color: shade(GLASS), position: [0, 1.02, 1.98] },
      { geometry: box(1.37, 0.28, 2.3), color: stripe, position: [0, 0.78, -0.55] },
      // A cross on each flank.
      { geometry: box(1.4, 0.46, 0.14), color: stripe, position: [0, 1.3, -0.6] },
      { geometry: box(1.4, 0.14, 0.46), color: stripe, position: [0, 1.3, -0.6] },
      { geometry: box(1.2, 0.6, 0.1), color: shade(GLASS), position: [0, 1.0, -1.79] },
      { geometry: box(0.9, 0.1, 0.3), color: shade(DARK), position: [0, 1.7, 0.6] },
      ...wheels(0.3, 0.6, 1.25, 0.95),
    ];
  }

  if (kind === "fire") {
    const shell = shade("#b8342c");
    const ladder = shade(STEEL);
    const parts: Part[] = [
      { geometry: box(1.4, 0.95, 3.4), color: shell, position: [0, 0.86, -0.5] },
      { geometry: box(1.36, 0.95, 1.3), color: shell, position: [0, 1.0, 1.75] },
      { geometry: box(1.38, 0.32, 0.14), color: shade(GLASS), position: [0, 1.28, 2.38] },
      { geometry: box(1.42, 0.3, 1.2), color: shade(DARK), position: [0, 1.28, 2.4 - 1.2] },
      // Locker doors down the body: a fire truck is a wall of shutters.
      { geometry: box(1.44, 0.5, 3.2), color: shade("#9c2b24"), position: [0, 0.72, -0.5] },
      { geometry: box(1.2, 0.12, 3.3), color: shade(STEEL), position: [0, 1.36, -0.5] },
      // Turntable and ladder, raised towards the fire at the incident's
      // centre: the incident places the truck so that this points at it.
      {
        geometry: new CylinderGeometry(0.42, 0.5, 0.3, 10),
        color: shade(STEEL),
        position: [0, 1.5, -1.0],
      },
    ];
    // The ladder pivots at the turntable and runs up and back over the truck's
    // tail, so the incident can park the engine short of the fire and have the
    // ladder reach it. `LADDER_PITCH` is the elevation; everything else is
    // that one angle applied to a pivot, which is what keeps the rails and the
    // rungs on the same line.
    const pitch = LADDER_PITCH;
    const pivot: Triple = [0, 1.62, -1.0];
    const up = Math.sin(pitch);
    const back = -Math.cos(pitch);
    const length = 4.6;
    for (const side of [-0.22, 0.22]) {
      parts.push({
        geometry: box(0.09, 0.09, length),
        color: ladder,
        position: [side, pivot[1] + up * (length / 2), pivot[2] + back * (length / 2)],
        rotation: [pitch, 0, 0],
      });
    }
    for (let i = 1; i <= 7; i++) {
      const along = (i * length) / 8;
      parts.push({
        geometry: box(0.5, 0.06, 0.06),
        color: ladder,
        position: [0, pivot[1] + up * along, pivot[2] + back * along],
      });
    }
    parts.push({ geometry: box(0.9, 0.1, 0.3), color: shade(DARK), position: [0, 1.5, 1.6] });
    parts.push(...wheels(0.34, 0.62, 1.7, 1.3));
    return parts;
  }

  if (kind === "tow") {
    const shell = shade("#d8a43c");
    return [
      { geometry: box(1.25, 0.5, 3.2), color: shell, position: [0, 0.56, 0] },
      { geometry: box(1.15, 0.62, 1.2), color: shell, position: [0, 1.06, 0.85] },
      { geometry: box(1.18, 0.28, 1.24), color: shade(GLASS), position: [0, 1.12, 0.85] },
      { geometry: box(1.2, 0.12, 1.7), color: shade(DARK), position: [0, 0.83, -0.75] },
      // The boom, angled back over the wreck, with its hook on a short line.
      {
        geometry: box(0.28, 0.28, 2.4),
        color: shade(STEEL),
        position: [0, 1.35, -1.25],
        rotation: [0.42, 0, 0],
      },
      { geometry: box(0.06, 0.62, 0.06), color: shade(DARK), position: [0, 1.5, -2.35] },
      { geometry: box(0.24, 0.2, 0.24), color: shade(STEEL), position: [0, 1.15, -2.35] },
      { geometry: box(0.9, 0.1, 0.3), color: shade(DARK), position: [0, 1.4, 1.1] },
      ...wheels(0.28, 0.58, 1.05, 1.15),
    ];
  }

  // The road crew's truck: a flatbed with a stack of cones on the back.
  const shell = shade("#e8853c");
  const parts: Part[] = [
    { geometry: box(1.22, 0.48, 2.9), color: shell, position: [0, 0.54, 0] },
    { geometry: box(1.14, 0.6, 1.1), color: shell, position: [0, 1.04, 0.75] },
    { geometry: box(1.17, 0.26, 1.14), color: shade(GLASS), position: [0, 1.1, 0.75] },
    { geometry: box(1.2, 0.06, 1.6), color: shade(DARK), position: [0, 0.8, -0.8] },
    { geometry: box(1.2, 0.34, 0.09), color: shade(DARK), position: [0, 0.97, -1.58] },
    { geometry: box(0.09, 0.34, 1.6), color: shade(DARK), position: [0.56, 0.97, -0.8] },
    { geometry: box(0.09, 0.34, 1.6), color: shade(DARK), position: [-0.56, 0.97, -0.8] },
  ];
  for (let i = 0; i < 4; i++) {
    parts.push({
      geometry: new ConeGeometry(0.2, 0.5, 7),
      color: shade("#e8853c"),
      position: [-0.28 + (i % 2) * 0.52, 1.08, -1.2 + Math.floor(i / 2) * 0.6],
    });
  }
  parts.push(...wheels(0.26, 0.56, 0.95, 1.0));
  return parts;
}

/** Where each vehicle's lamps sit, in its own frame. */
export const EMERGENCY_LIGHTS: Record<EmergencyKind, EmergencyLight[]> = {
  police: [
    { position: [-0.3, 1.36, -0.1], color: "#4f8bff", rate: 3.4, radius: 0.19 },
    { position: [0.3, 1.36, -0.1], color: "#ff4d4d", rate: 3.4, radius: 0.19 },
  ],
  ambulance: [
    { position: [-0.28, 1.8, 0.6], color: "#4f8bff", rate: 2.8, radius: 0.18 },
    { position: [0.28, 1.8, 0.6], color: "#4f8bff", rate: 2.4, radius: 0.18 },
  ],
  fire: [
    { position: [-0.3, 1.6, 1.6], color: "#ff4d4d", rate: 3, radius: 0.2 },
    { position: [0.3, 1.6, 1.6], color: "#ff4d4d", rate: 2.6, radius: 0.2 },
  ],
  tow: [{ position: [0, 1.5, 1.1], color: "#ffb347", rate: 1.8, radius: 0.19 }],
  works: [{ position: [0, 1.42, 0.75], color: "#ffb347", rate: 1.3, radius: 0.18 }],
};

const builder = geometryCache<string>((key) => {
  const [kind, tone] = key.split(":");
  return mergeParts(partsFor(kind as EmergencyKind, Number(tone)));
});

/** The merged geometry for one emergency vehicle at the city's tone. */
export function emergencyGeometry(kind: EmergencyKind, desaturation: number): BufferGeometry {
  return builder(`${kind}:${toneKey(desaturation)}`);
}

/** The same vehicle as parts, for baking into a larger merged assembly. */
export function emergencyParts(kind: EmergencyKind, desaturation: number): Part[] {
  return partsFor(kind, desaturation);
}
