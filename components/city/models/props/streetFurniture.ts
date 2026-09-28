/**
 * Street furniture and greenery (PLAN.md sections 37, 38).
 *
 * Section 37 budgets a hundred trees and "tiny props"; section 63 puts those
 * props last on the list of things to cut. This module places up to 150 small
 * things -- benches, bins, bus stops, bushes, flower beds and parked cars --
 * along the roads and around the parks, and builds one merged geometry per
 * kind so the whole layer is a handful of instanced draws.
 *
 * Placement is seeded and rejects anything that would land on a building, a
 * landmark, an incident, a construction site, a crowd object, the queue at
 * the city limits or the carriageway itself: props decorate the city, they
 * never occlude the things that carry meaning.
 *
 * Pure apart from the geometry builders: unit tested.
 */

import { BoxGeometry, CircleGeometry, CylinderGeometry, IcosahedronGeometry, type BufferGeometry } from "three";
import type { Prng } from "@/lib/city/prng";
import { SURFACE } from "../../textures/surface-types";
import type { CityModel, RoadSegment, Vec3 } from "@/types/city";
import { desaturate } from "../../palette";
import { geometryCache, mergeParts, surfacePanel, toneKey, type Part } from "./geometry";
import { paintFor, parkedGeometry, type VehicleBody } from "../vehicles/shapes";
import { incidentForm, worksForm } from "../../backlog/plan";
import { crowdRect, type LocalRect } from "../../blockages";
import { importedParts } from "../imported";
import { BLENDER_MODELS } from "../modelSource";
import { MODEL as FURNITURE_MODEL } from "./streetFurniture.model";
import { MODEL as STREET2_MODEL } from "./street2.model";

/** Section 37's "tiny props" allowance, over and above the trees and lamps. */
export const SMALL_PROP_BUDGET = 150;

/** Bodies that turn up parked at a kerb. Nobody parks a bus in a side street. */
export const PARKED_BODIES: readonly VehicleBody[] = ["hatchback", "sedan", "pickup", "van"];

export interface PlacedProp {
  position: Vec3;
  rotationY: number;
  scale: number;
}

export interface ParkedVehicle extends PlacedProp {
  body: VehicleBody;
  colorIndex: number;
}

export interface StreetProps {
  benches: PlacedProp[];
  bins: PlacedProp[];
  stops: PlacedProp[];
  bushes: PlacedProp[];
  beds: PlacedProp[];
  parked: ParkedVehicle[];
}

interface Blocker {
  x: number;
  z: number;
  r: number;
}

/** Everything a prop has to keep off, as circles. Rotation is ignored: the */
/** margin is wider than the error that costs. */
function blockersOf(city: CityModel): Blocker[] {
  const blockers: Blocker[] = [];
  for (const building of city.buildings) {
    blockers.push({
      x: building.position[0],
      z: building.position[2],
      r: Math.max(building.size[0], building.size[2]) * 0.5 + 0.8,
    });
  }
  for (const landmark of city.landmarks) {
    const size = landmark.size ? Math.max(landmark.size[0], landmark.size[2]) : 14;
    blockers.push({ x: landmark.position[0], z: landmark.position[2], r: size * 0.5 + 1.5 });
  }
  for (const incident of city.incidents) {
    blockers.push({ x: incident.position[0], z: incident.position[2], r: 6 });
  }
  for (const site of city.constructionSites) {
    const size = site.size ? Math.max(site.size[0], site.size[2]) : 11;
    blockers.push({ x: site.position[0], z: site.position[2], r: size * 0.5 + 1.5 });
  }
  for (const lamp of city.props.lamps) {
    blockers.push({ x: lamp[0], z: lamp[2], r: 1.1 });
  }
  // The crowd (PLAN.md 76.9): a bench never stands on a pothole, and nobody
  // parks across a trench. Each object's footprint, as the circle round it;
  // a scaffold's slab is its facade's width.
  const reach = (rect: LocalRect) =>
    Math.hypot(Math.max(-rect.minX, rect.maxX), Math.max(-rect.minZ, rect.maxZ));
  for (const incident of city.backlog?.incidents ?? []) {
    const rect = crowdRect({ size: incident.size, heat: incident.heat ?? incident.issue.heat }, incidentForm(incident));
    blockers.push({ x: incident.position[0], z: incident.position[2], r: reach(rect) + 0.3 });
  }
  for (const site of city.backlog?.constructionSites ?? []) {
    const rect = crowdRect({ size: site.size, heat: site.heat ?? site.pull.heat }, worksForm(site));
    blockers.push({ x: site.position[0], z: site.position[2], r: reach(rect) + 0.3 });
  }
  const overflow = city.overflow;
  if (overflow) {
    blockers.push({ x: overflow.position[0], z: overflow.position[2], r: 4 });
    for (const car of overflow.queue) {
      blockers.push({ x: car.position[0], z: car.position[2], r: 2.6 });
    }
  }
  return blockers;
}

const clearOf = (x: number, z: number, radius: number, blockers: readonly Blocker[]): boolean => {
  for (const blocker of blockers) {
    const dx = x - blocker.x;
    const dz = z - blocker.z;
    if (dx * dx + dz * dz < (blocker.r + radius) ** 2) return false;
  }
  return true;
};

/** Distance from a point to a road's kerb; negative means on the carriageway. */
function kerbDistance(x: number, z: number, road: RoadSegment): number {
  const dx = road.to[0] - road.from[0];
  const dz = road.to[2] - road.from[2];
  const lengthSq = dx * dx + dz * dz || 1;
  const t = Math.max(
    0,
    Math.min(1, ((x - road.from[0]) * dx + (z - road.from[2]) * dz) / lengthSq),
  );
  const px = road.from[0] + dx * t;
  const pz = road.from[2] + dz * t;
  return Math.hypot(x - px, z - pz) - road.width / 2;
}

const offRoad = (x: number, z: number, margin: number, roads: readonly RoadSegment[]): boolean => {
  for (const road of roads) if (kerbDistance(x, z, road) < margin) return false;
  return true;
};

/**
 * Whether a point is in the built-up part of the city. Furniture belongs to
 * the blocks: a bench on the grass outside the ring road is a bench nobody
 * would ever sit on, and it reads as litter from the overview camera.
 */
function inTown(x: number, z: number, city: CityModel, margin: number): boolean {
  for (const district of city.districts) {
    const { x: cx, z: cz, w, d } = district.rect;
    if (
      x >= cx - w / 2 - margin &&
      x <= cx + w / 2 + margin &&
      z >= cz - d / 2 - margin &&
      z <= cz + d / 2 + margin
    ) {
      return true;
    }
  }
  return false;
}

interface RoadFrame {
  /** Unit direction and its right-hand normal, in the xz plane. */
  ux: number;
  uz: number;
  nx: number;
  nz: number;
  length: number;
  angle: number;
}

function frameOf(road: RoadSegment): RoadFrame {
  const dx = road.to[0] - road.from[0];
  const dz = road.to[2] - road.from[2];
  const length = Math.hypot(dx, dz) || 1;
  const ux = dx / length;
  const uz = dz / length;
  return { ux, uz, nx: -uz, nz: ux, length, angle: Math.atan2(ux, uz) };
}

/** How many props a city of this size should carry, per kind. */
function budgetFor(city: CityModel): Record<keyof StreetProps, number> {
  // A ten file repository is a village: it gets a bench and a bin, not a
  // hundred and fifty pieces of street furniture.
  const weight = Math.min(1, Math.max(0.25, city.buildings.length / 140));
  const scaled = (max: number) => Math.max(2, Math.round(max * weight));
  return {
    benches: scaled(26),
    bins: scaled(20),
    stops: scaled(6),
    bushes: scaled(46),
    beds: scaled(14),
    // An archived city keeps its street furniture -- nobody takes the benches
    // away -- but the kerbs empty out, the way a quiet town's do (section 19).
    parked: scaled(city.repository.archived ? 8 : 24),
  };
}

/**
 * Everything small, placed. The order matters: furniture claims the pavements
 * first, then the kerbside parking, then the parks fill in around the trees.
 */
export function placeStreetProps(city: CityModel, prng: Prng): StreetProps {
  const budget = budgetFor(city);
  const blockers = blockersOf(city);
  const result: StreetProps = { benches: [], bins: [], stops: [], bushes: [], beds: [], parked: [] };

  const roads = city.roads;
  const longRoads = roads
    .map((road) => ({ road, frame: frameOf(road) }))
    .filter(({ frame }) => frame.length > 14);
  const majors = longRoads.filter(({ road }) => road.major);
  const furnitureRoads = majors.length > 0 ? majors : longRoads;

  /** Walk a road and offer points on one pavement or the other. */
  const walk = (
    list: typeof longRoads,
    spacing: number,
    margin: number,
    place: (x: number, z: number, angle: number, side: number) => boolean,
  ) => {
    for (const { road, frame } of list) {
      const steps = Math.floor((frame.length - 12) / spacing);
      for (let i = 0; i <= steps; i++) {
        const along = 6 + i * spacing + prng.range(-1.4, 1.4);
        if (along > frame.length - 6) continue;
        const side = prng.next() < 0.5 ? 1 : -1;
        const offset = (road.width / 2 + margin) * side;
        const x = road.from[0] + frame.ux * along + frame.nx * offset;
        const z = road.from[2] + frame.uz * along + frame.nz * offset;
        if (!inTown(x, z, city, 6)) continue;
        if (!clearOf(x, z, 1, blockers)) continue;
        if (place(x, z, frame.angle, side)) blockers.push({ x, z, r: 1.4 });
      }
    }
  };

  // Benches and bins share the pavement, a little outside the walking line.
  walk(furnitureRoads, 26, 2.1, (x, z, angle, side) => {
    if (result.benches.length >= budget.benches) return false;
    if (prng.next() < 0.45) return false;
    result.benches.push({
      position: [x, 0, z],
      // Facing the traffic: the seat's front is the road side.
      rotationY: angle + (side > 0 ? -Math.PI / 2 : Math.PI / 2),
      scale: 1,
    });
    return true;
  });

  walk(furnitureRoads, 21, 1.8, (x, z, angle, side) => {
    if (result.bins.length >= budget.bins) return false;
    if (prng.next() < 0.5) return false;
    result.bins.push({
      position: [x, 0, z],
      rotationY: angle + (side > 0 ? -Math.PI / 2 : Math.PI / 2),
      scale: 1,
    });
    return true;
  });

  walk(majors.length > 0 ? majors : longRoads, 54, 2.4, (x, z, angle, side) => {
    if (result.stops.length >= budget.stops) return false;
    result.stops.push({
      position: [x, 0, z],
      rotationY: angle + (side > 0 ? -Math.PI / 2 : Math.PI / 2),
      scale: 1,
    });
    return true;
  });

  // Parked cars sit on the verge beyond the pavement, never in the lane the
  // fleet is using: a car is 1.2 wide and the lane is offset by a fifth of
  // the carriageway (`traffic.ts`), so the kerbside bay starts outside both.
  walk(longRoads, 17, 3.1, (x, z, angle, side) => {
    if (result.parked.length >= budget.parked) return false;
    if (prng.next() < 0.45) return false;
    const body = PARKED_BODIES[prng.int(0, PARKED_BODIES.length - 1)];
    result.parked.push({
      position: [x, 0, z],
      rotationY: angle + (side > 0 ? Math.PI : 0) + prng.range(-0.04, 0.04),
      scale: 1,
      body,
      colorIndex: paintFor(body, prng),
    });
    return true;
  });

  // Parks are where the generator planted trees: bushes and beds go in the
  // gaps between them, which is what turns a stand of trees into a park.
  const trees = city.props.trees;
  for (let i = 0; i < trees.length && result.bushes.length < budget.bushes; i++) {
    const tree = trees[i];
    if (prng.next() < 0.45) continue;
    const angle = prng.range(0, Math.PI * 2);
    const distance = prng.range(1.8, 3.6);
    const x = tree[0] + Math.sin(angle) * distance;
    const z = tree[2] + Math.cos(angle) * distance;
    if (!clearOf(x, z, 0.9, blockers) || !offRoad(x, z, 1.2, roads)) continue;
    result.bushes.push({
      position: [x, 0, z],
      rotationY: prng.range(0, Math.PI),
      scale: prng.range(0.75, 1.25),
    });
    blockers.push({ x, z, r: 1.1 });
  }

  // A flower bed needs company: it goes where trees cluster, not on a verge
  // with a single tree on it.
  for (let i = 0; i < trees.length && result.beds.length < budget.beds; i++) {
    const tree = trees[i];
    let neighbours = 0;
    for (const other of trees) {
      if (other === tree) continue;
      if (Math.hypot(other[0] - tree[0], other[2] - tree[2]) < 9) neighbours++;
      if (neighbours >= 2) break;
    }
    if (neighbours < 2) continue;
    const angle = prng.range(0, Math.PI * 2);
    const distance = prng.range(2.4, 4.4);
    const x = tree[0] + Math.sin(angle) * distance;
    const z = tree[2] + Math.cos(angle) * distance;
    if (!clearOf(x, z, 1.3, blockers) || !offRoad(x, z, 1.6, roads)) continue;
    result.beds.push({ position: [x, 0, z], rotationY: prng.range(0, Math.PI), scale: 1 });
    blockers.push({ x, z, r: 1.6 });
  }

  return result;
}

/** Total props placed, for the section 37 budget check. */
export const propCount = (props: StreetProps): number =>
  props.benches.length +
  props.bins.length +
  props.stops.length +
  props.bushes.length +
  props.beds.length +
  props.parked.length;

export type FurnitureKind = "bench" | "bin" | "stop" | "bush" | "bed";

const WOOD = "#9a7c58";
const METAL = "#6b6f6d";
const PAINT = "#c9c3b4";
const LEAF = "#6f9760";
const SOIL = "#6b5a46";

function furnitureParts(kind: FurnitureKind, tone: number): Part[] {
  const shade = (hex: string) => desaturate(hex, tone);
  if (kind === "bench") {
    return [
      ...[-0.17, -0.056, 0.056, 0.17].map((z) => ({ geometry: new BoxGeometry(1.5, 0.1, 0.1), color: shade(WOOD), position: [0, 0.42, z] as Vec3 })),
      ...[0.49, 0.63, 0.77].map((y) => ({ geometry: new BoxGeometry(1.5, 0.12, 0.09), color: shade(WOOD), position: [0, y, -0.2 - Math.sin(0.18) * (y - 0.62)] as Vec3, rotation: [-0.18, 0, 0] as Vec3 })),
      { geometry: new BoxGeometry(0.11, 0.42, 0.42), color: shade(METAL), position: [-0.6, 0.21, 0] },
      { geometry: new BoxGeometry(0.11, 0.42, 0.42), color: shade(METAL), position: [0.6, 0.21, 0] },
      ...[-0.17, -0.056, 0.056, 0.17].flatMap((z) => [-0.63, 0.63].map((x) => ({ geometry: new CircleGeometry(0.014, 6), color: shade(METAL), position: [x, 0.479, z] as Vec3, rotation: [-Math.PI / 2, 0, 0] as Vec3 }))),
      ...[-0.64, 0.64].flatMap((x) => [
        { geometry: new BoxGeometry(0.07, 0.22, 0.07), color: shade(METAL), position: [x, 0.55, 0.1] as Vec3 },
        { geometry: new BoxGeometry(0.09, 0.06, 0.4), color: shade(METAL), position: [x, 0.68, -0.02] as Vec3 },
      ]),
    ];
  }
  if (kind === "bin") {
    return [
      {
        geometry: new CylinderGeometry(0.26, 0.22, 0.72, 8),
        color: shade(METAL),
        position: [0, 0.36, 0],
      },
      {
        geometry: new CylinderGeometry(0.3, 0.3, 0.09, 8),
        color: shade("#4c4f4d"),
        position: [0, 0.76, 0],
      },
      surfacePanel(0.24, 0.055, [0, 0.81, 0], shade("#242b2a"), [-Math.PI / 2, 0, 0]),
      ...Array.from({ length: 8 }, (_, i) => {
        const angle = i * Math.PI / 4;
        return surfacePanel(0.045, 0.5, [Math.sin(angle) * 0.243, 0.39, Math.cos(angle) * 0.243], shade("#47534d"), [0, angle, 0]);
      }),
      surfacePanel(0.18, 0.17, [0, 0.48, 0.256], shade("#a7bb9c")),
      { geometry: new CylinderGeometry(0.27, 0.28, 0.065, 8), color: shade("#3e4842"), position: [0, 0.045, 0] },
      { geometry: new CylinderGeometry(0.306, 0.306, 0.035, 8, 1, true), color: shade("#9ba096"), position: [0, 0.804, 0] },
    ];
  }
  if (kind === "stop") {
    return [
      {
        geometry: new CylinderGeometry(0.07, 0.07, 2.6, 6),
        color: shade(METAL),
        position: [-1.1, 1.3, 0],
      },
      {
        geometry: new CylinderGeometry(0.07, 0.07, 2.6, 6),
        color: shade(METAL),
        position: [1.1, 1.3, 0],
      },
      // A flat canopy and a back panel: a shelter, read from above.
      { geometry: new BoxGeometry(2.7, 0.12, 1.2), color: shade(PAINT), position: [0, 2.6, -0.1] },
      { geometry: new BoxGeometry(2.5, 1.5, 0.09), color: shade("#a8bcc4"), position: [0, 1.6, -0.6] },
      { geometry: new BoxGeometry(1.4, 0.09, 0.4), color: shade(WOOD), position: [0, 0.5, -0.35] },
      // The timetable board, facing the street.
      { geometry: new BoxGeometry(0.62, 0.46, 0.07), color: shade("#37423f"), position: [1.1, 2.1, 0.1] },
      ...[-0.42, 0.42].map((x) => ({ geometry: new BoxGeometry(0.045, 1.45, 0.07), color: shade(METAL), position: [x, 1.6, -0.535] as Vec3 })),
      { geometry: new BoxGeometry(2.45, 0.045, 0.07), color: shade(METAL), position: [0, 1.1, -0.535] },
      surfacePanel(0.23, 0.05, [1.01, 2.23, 0.14], shade("#d6cfb8")),
      ...[0, 1, 2, 3].map((i) => surfacePanel(0.4 - i * 0.045, 0.018, [1.07, 2.14 - i * 0.05, 0.14], shade("#a9b4ab"))),
      surfacePanel(1.4, 0.055, [0, 2.6, 0.506], shade("#68848b")),
    ];
  }
  if (kind === "bush") {
    return [
      { geometry: new IcosahedronGeometry(0.52, 0), color: shade(LEAF), position: [0, 0.46, 0] },
      {
        geometry: new IcosahedronGeometry(0.38, 0),
        color: shade(desaturate(LEAF, 0.12)),
        position: [0.36, 0.34, 0.18],
      },
      {
        geometry: new IcosahedronGeometry(0.32, 0),
        color: shade(LEAF),
        position: [-0.3, 0.3, -0.22],
      },
      { geometry: new IcosahedronGeometry(0.25, 0), color: shade("#8ba575"), position: [-0.05, 0.79, 0.12] },
      { geometry: new IcosahedronGeometry(0.21, 0), color: shade("#597a51"), position: [-0.43, 0.44, 0.15] },
      ...[-1, 1].map((side) => ({ geometry: new CylinderGeometry(0.02, 0.035, 0.36, 5, 1, true), color: shade(WOOD), surface: SURFACE.timber, position: [side * 0.16, 0.2, 0] as Vec3, rotation: [0, 0, side * 0.9] as Vec3 })),
    ];
  }
  // A flower bed: turned soil with a handful of colour in it.
  return [
    { geometry: new BoxGeometry(2.2, 0.22, 1.4), color: shade(SOIL), position: [0, 0.11, 0] },
    { geometry: new BoxGeometry(2.34, 0.16, 1.54), color: shade("#a89f8c"), position: [0, 0.08, 0] },
    { geometry: new IcosahedronGeometry(0.17, 0), color: shade("#d8676a"), position: [-0.7, 0.3, -0.3] },
    { geometry: new IcosahedronGeometry(0.15, 0), color: shade("#e2c46a"), position: [-0.1, 0.3, 0.32] },
    { geometry: new IcosahedronGeometry(0.16, 0), color: shade("#c86fa0"), position: [0.55, 0.3, -0.25] },
    { geometry: new IcosahedronGeometry(0.14, 0), color: shade("#8f6fb0"), position: [0.85, 0.28, 0.3] },
    { geometry: new IcosahedronGeometry(0.15, 0), color: shade("#e2c46a"), position: [0.1, 0.3, -0.42] },
    ...[-0.8, -0.35, 0.2, 0.65].map((x) => ({ geometry: new IcosahedronGeometry(0.17, 0), color: shade(LEAF), position: [x, 0.26, x > 0 ? 0.25 : -0.18] as Vec3, scale: [1.6, 0.55, 1] as Vec3 })),
    ...[-0.78, 0, 0.78].map((x) => surfacePanel(0.02, 0.12, [x, 0.08, 0.779], shade("#6c665a"))),
  ];
}

const furnitureBuilder = geometryCache<string>((key) => {
  const [kind, tone] = key.split(":");
  const shade = (hex: string) => desaturate(hex, Number(tone));
  return mergeParts(furnitureParts(kind as FurnitureKind, Number(tone)).map((part) => ({
    ...part,
    surface: part.surface ?? (part.geometry.type === "IcosahedronGeometry" ? SURFACE.foliage
      : part.color === shade(WOOD) || part.color === shade("#594735") ? SURFACE.timber
      : part.color === shade("#a8bcc4") ? SURFACE.glass
      : kind === "bed" ? SURFACE.stone : SURFACE.metal),
  })));
});

/**
 * The kinds modelled in Blender, for the Blender models (the default): the
 * bench, bin, bushes and beds from `blender/props/street_furniture.py`, and
 * the bus stop from `blender/street2/street2.py`.
 */
const FURNITURE_NODE: Record<FurnitureKind, { model: typeof FURNITURE_MODEL; node: string }> = {
  bench: { model: FURNITURE_MODEL, node: "Bench" },
  bin: { model: FURNITURE_MODEL, node: "Bin" },
  stop: { model: STREET2_MODEL, node: "BusStop" },
  bush: { model: FURNITURE_MODEL, node: "Bush" },
  bed: { model: FURNITURE_MODEL, node: "Bed" },
};

const blenderFurnitureBuilder = geometryCache<string>((key) => {
  const [kind, tone] = key.split(":");
  const { model, node } = FURNITURE_NODE[kind as FurnitureKind];
  return mergeParts(importedParts(model, node, (hex) => desaturate(hex, Number(tone))));
});

/** The merged geometry for one kind of prop at the city's current tone. */
export function furnitureGeometry(kind: FurnitureKind, desaturation: number): BufferGeometry {
  return (BLENDER_MODELS ? blenderFurnitureBuilder : furnitureBuilder)(`${kind}:${toneKey(desaturation)}`);
}

/** The Blender furniture whatever the flag says, for its tests and renders. */
export function blenderFurnitureGeometry(kind: FurnitureKind, desaturation: number): BufferGeometry {
  return blenderFurnitureBuilder(`${kind}:${toneKey(desaturation)}`);
}

/** How tall a street lamp's pole is, and where its lantern's centre sits. */
export const LAMP_HEIGHT = 2.7;
export const LAMP_HEAD_Y = LAMP_HEIGHT + 0.09;

let blenderLamp: { pole: BufferGeometry; head: BufferGeometry } | undefined;

/**
 * The Blender street lamp: a pole (plinth, collar and lantern roof) centred
 * half way up, where the procedural cylinder's centre is, and the lantern
 * glass centred on the halo's anchor, so both instance the way the procedural
 * pole and head do. The pole's vertex colour is only its shade: `Props.tsx`
 * colours it with the lamp post's material, as before.
 */
export function blenderLampGeometry(): { pole: BufferGeometry; head: BufferGeometry } {
  // Both nodes are modelled standing on the ground; shift each onto its
  // instance origin, as the procedural cylinder and box are centred.
  const at = (node: string, y: number) =>
    mergeParts(importedParts(FURNITURE_MODEL, node, () => "#ffffff").map((part) => ({ ...part, position: [0, -y, 0] as Vec3 })));
  return blenderLamp ??= { pole: at("LampPole", LAMP_HEIGHT / 2), head: at("LampHead", LAMP_HEAD_Y) };
}

/** The lamp `Props.tsx` draws: the Blender one by default, else none (its own primitives). */
export const lampGeometry = (): { pole: BufferGeometry; head: BufferGeometry } | null =>
  BLENDER_MODELS ? blenderLampGeometry() : null;

/** Re-exported so `Props.tsx` has one import for everything it draws. */
export { parkedGeometry };
