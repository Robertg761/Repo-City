import { describe, expect, it } from "vitest";
import type { BufferGeometry } from "three";
import type { LandmarkFile } from "@/types/analysis";
import { buildCivic, type CivicPalette } from "./buildings/civic";
import type { MeshDraft } from "./buildings/mesh";
import { coplanarOverlaps } from "./coplanar";
import { fireStation } from "./landmarks/fire";
import { infoCentre } from "./landmarks/info";
import { powerPlant } from "./landmarks/power";
import { trainCars, transitStation } from "./landmarks/station";
import { townHall } from "./landmarks/townhall";
import { chapel, halt, substation, villageFireStation } from "./landmarks/village";
import { finishedDressingGeometry } from "./props/finishedHouse";
import { furnitureGeometry } from "./props/streetFurniture";
import { treeGeometry } from "./props/trees";
import { EMERGENCY_KINDS, emergencyGeometry } from "./vehicles/emergency";
import { VEHICLE_BODIES, bodyGeometry, parkedGeometry, tractorGeometry, wheelGeometry } from "./vehicles/shapes";

/**
 * Z-fighting in the landmarks, the civic buildings, the vehicles and the
 * props (`buildings/zfight.test.ts` covers the archetypes): no two faces
 * facing the same way overlap closer than the depth buffer can separate
 * from the overview. A landmark's slots are separate meshes, so they are
 * checked together, each face keyed by its slot and vertex colour.
 *
 * Landmarks and civic buildings are modelled in world units; a vehicle or a
 * prop is small and close, and a smaller gap is enough for it. Undersides
 * are never seen and are not checked.
 */

/** World units: a hundredth of a unit is a step or two of depth from the overview. */
const LANDMARK_GAP = 0.012;
const PROP_GAP = 0.0036;

interface Soup {
  positions: number[];
  indices: number[];
  keys: string[];
}

function add(soup: Soup, geometry: BufferGeometry | MeshDraft, tag: string): void {
  const drafted = !("attributes" in geometry);
  const pos = drafted ? geometry.positions : geometry.attributes.position.array;
  const idx = drafted ? geometry.indices : (geometry.index?.array ?? null);
  const col = drafted ? geometry.colors : (geometry.attributes.color?.array ?? null);
  const base = soup.positions.length / 3;
  for (let i = 0; i < pos.length; i++) soup.positions.push(pos[i]);
  const count = idx ? idx.length : pos.length / 3;
  for (let i = 0; i < count; i++) {
    const v = idx ? idx[i] : i;
    soup.indices.push(base + v);
    if (i % 3 === 0) {
      const rgb = col ? [col[v * 3], col[v * 3 + 1], col[v * 3 + 2]].map((c) => c.toFixed(3)).join("/") : "";
      soup.keys.push(`${tag}:${rgb}`);
    }
  }
}

function soupOf(parts: Record<string, BufferGeometry | MeshDraft | undefined>): Soup {
  const soup: Soup = { positions: [], indices: [], keys: [] };
  for (const [tag, geometry] of Object.entries(parts)) if (geometry) add(soup, geometry, tag);
  return soup;
}

function fights(soup: Soup, gap: number): string[] {
  return coplanarOverlaps(soup.positions, soup.indices, { within: gap, minOverlap: 1e-5, buriedWithin: 0.05 })
    .filter((p) => soup.keys[p.a] !== soup.keys[p.b] && p.normal[1] > -0.99)
    .map(
      (p) =>
        `${soup.keys[p.a]} vs ${soup.keys[p.b]} ${p.separation.toFixed(4)} apart at ${p.at.map((x) => x.toFixed(2)).join(",")}`,
    );
}

const palette: CivicPalette = {
  wall: [0.9, 0.9, 0.88],
  stone: [0.96, 0.95, 0.92],
  roof: [0.7, 0.76, 0.78],
  accent: [0.5, 0.66, 0.74],
  trim: [0.95, 0.95, 0.94],
  door: [0.35, 0.33, 0.28],
  window: [0.29, 0.33, 0.38],
  metal: [0.6, 0.63, 0.63],
  flag: [0.78, 0.35, 0.24],
  containers: [
    [0.29, 0.53, 0.66],
    [0.71, 0.41, 0.25],
    [0.44, 0.56, 0.42],
  ],
};

const LANDMARKS: [string, () => Soup][] = [
  ...(["readme", "manifest", "changelog", "contributing", "dockerfile"] as LandmarkFile[]).map(
    (kind): [string, () => Soup] => [
      `civic ${kind}`,
      () => {
        const drafts = buildCivic(kind, { w: 7, h: 9.8, d: 7 }, palette);
        return soupOf({ body: drafts.body, glow: drafts.glow });
      },
    ],
  ),
  ["town hall", () => soupOf(townHall().slots)],
  ...[1, 2, 3].map((l): [string, () => Soup] => [`fire station ${l}`, () => soupOf(fireStation(l).slots)]),
  ...[1, 2, 3].map((l): [string, () => Soup] => [`station ${l}`, () => soupOf(transitStation(l).slots)]),
  ["train", () => soupOf(trainCars())],
  ...[1, 2, 3].map((l): [string, () => Soup] => [`info centre ${l}`, () => soupOf(infoCentre(l).slots)]),
  ...["full", "failing", "bare"].map((m): [string, () => Soup] => [`power plant ${m}`, () => soupOf(powerPlant(m))]),
  ["chapel", () => soupOf(chapel().slots)],
  ...[1, 2].map((l): [string, () => Soup] => [`village fire station ${l}`, () => soupOf(villageFireStation(l).slots)]),
  ...[1, 2].map((l): [string, () => Soup] => [`halt ${l}`, () => soupOf(halt(l).slots)]),
  ["substation", () => soupOf(substation().slots)],
];

const PROPS: [string, () => Soup][] = [
  ...VEHICLE_BODIES.map((k): [string, () => Soup] => [`${k}`, () => soupOf({ body: bodyGeometry(k) })]),
  ...VEHICLE_BODIES.map((k): [string, () => Soup] => [`parked ${k}`, () => soupOf({ body: parkedGeometry(k) })]),
  ["wheel", () => soupOf({ wheel: wheelGeometry() })],
  ["tractor", () => soupOf({ body: tractorGeometry() })],
  ...EMERGENCY_KINDS.map((k): [string, () => Soup] => [`${k}`, () => soupOf({ body: emergencyGeometry(k, 0) })]),
  ...(["village", "town"] as const).map((t): [string, () => Soup] => [
    `finished ${t} dressing`,
    () => soupOf({ dressing: finishedDressingGeometry(t, 0) }),
  ]),
  ...(["bench", "bin", "stop", "bush", "bed"] as const).map((k): [string, () => Soup] => [
    k,
    () => soupOf({ prop: furnitureGeometry(k, 0) }),
  ]),
  ...(["broadleaf", "conifer", "poplar", "birch"] as const).map((k): [string, () => Soup] => [
    `${k} tree`,
    () => soupOf({ tree: treeGeometry(k, 0) }),
  ]),
];

describe("no two faces of a landmark flicker through each other", () => {
  for (const [name, soup] of LANDMARKS) {
    it(name, () => expect(fights(soup(), LANDMARK_GAP)).toEqual([]));
  }
});

describe("no two faces of a vehicle or a prop flicker through each other", () => {
  for (const [name, soup] of PROPS) {
    it(name, () => expect(fights(soup(), PROP_GAP)).toEqual([]));
  }
});
