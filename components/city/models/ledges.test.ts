import { describe, expect, it } from "vitest";
import { Matrix4, type BufferGeometry } from "three";
import { archetypeGeometry } from "./buildings/geometry";
import { LAYER } from "./buildings/mesh";
import { chapel, halt, substation, villageFireStation } from "./landmarks/village";
import { narrowLedges } from "./ledges";
import { FINISHED, finishedDressingGeometry, finishedHouseGeometry } from "./props/finishedHouse";
import {
  TRACTOR_SPEC,
  tractorGeometry,
  tractorLightsGeometry,
  tractorParkedGeometry,
  wheelGeometry,
} from "./vehicles/shapes";

/**
 * Slivers in the village's and the town's landmarks and props
 * (`buildings/ledges.test.ts` covers the buildings, `farmland.test.ts` the
 * fields): a strip of flat surface a hair wide at the foot of a wall, or a
 * wall that comes up through a surface and stops a hair above it. Either
 * reads as a line too thin to draw, which breaks into dashes that crawl as
 * the camera moves.
 *
 * The same rule as the buildings: a ledge is flush or two layers wide, a lip
 * at least a layer high. The landmarks and the dressing are modelled in world
 * units and drawn at their natural size or smaller, the tractor at its own
 * size, so here a layer is a layer of world. A landmark's slots are separate
 * meshes drawn together, and are checked together.
 */

/** A little under two layers, so a ledge exactly two layers wide passes. */
const NARROWEST = LAYER * 1.9;
/** A little under one layer, so a lip exactly a layer high passes. */
const LOWEST = LAYER * 0.95;

interface Soup {
  positions: number[];
  indices: number[];
}

function soupOf(parts: readonly (BufferGeometry | undefined)[]): Soup {
  const soup: Soup = { positions: [], indices: [] };
  for (const geometry of parts) {
    if (!geometry) continue;
    const pos = geometry.attributes.position.array;
    const idx = geometry.index?.array ?? null;
    const base = soup.positions.length / 3;
    for (let i = 0; i < pos.length; i++) soup.positions.push(pos[i]);
    const count = idx ? idx.length : pos.length / 3;
    for (let i = 0; i < count; i++) soup.indices.push(base + (idx ? idx[i] : i));
  }
  return soup;
}

function slivers(soup: Soup, scale?: readonly [number, number, number]): string[] {
  return narrowLedges(soup.positions, soup.indices, { narrowerThan: NARROWEST, lowerThan: LOWEST, scale }).map(
    (ledge) =>
      `${ledge.height > 0 ? `lip ${ledge.height.toFixed(4)} high` : `${ledge.width.toFixed(4)} wide`} at ${ledge.at
        .map((c) => c.toFixed(3))
        .join(",")}, facing ${ledge.normal.map((c) => c.toFixed(2)).join(",")}`,
  );
}

const SHAPES: [string, () => Soup][] = [
  ["chapel", () => soupOf(Object.values(chapel().slots))],
  ...[1, 2].map((l): [string, () => Soup] => [`village fire station ${l}`, () => soupOf(Object.values(villageFireStation(l).slots))]),
  ...[1, 2].map((l): [string, () => Soup] => [`halt ${l}`, () => soupOf(Object.values(halt(l).slots))]),
  ["substation", () => soupOf(Object.values(substation().slots))],
  ...(["village", "town"] as const).map((t): [string, () => Soup] => [
    `finished ${t} dressing`,
    () => soupOf([finishedDressingGeometry(t, 0)]),
  ]),
  [
    "tractor",
    () =>
      soupOf([
        tractorGeometry(),
        tractorLightsGeometry(),
        // Its wheels, drawn from the fleet's one wheel scaled to each radius.
        ...TRACTOR_SPEC.wheels.map(([x, z], i) => {
          const r = TRACTOR_SPEC.wheelRadii[i];
          return wheelGeometry().clone().applyMatrix4(new Matrix4().makeScale(r, r, r).setPosition(x, r, z));
        }),
      ]),
  ],
  ["parked tractor", () => soupOf([tractorParkedGeometry(), tractorLightsGeometry()])],
];

describe("no village or town landmark or prop leaves a sliver of ledge showing", () => {
  for (const [name, soup] of SHAPES) {
    it(name, () => expect(slivers(soup())).toEqual([]));
  }

  // The finished house is its settlement's own building with the paint baked
  // in: the same geometry, checked in the same unit space as the buildings.
  for (const tier of ["village", "town"] as const) {
    it(`finished ${tier} house`, () => {
      const house = finishedHouseGeometry(tier, 0);
      expect(house.attributes.position.count).toBe(archetypeGeometry(FINISHED[tier].model).attributes.position.count);
      expect(slivers(soupOf([house]))).toEqual([]);
    });
  }
});
