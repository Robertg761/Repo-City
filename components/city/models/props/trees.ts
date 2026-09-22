/**
 * Three tree species (PLAN.md sections 4, 37, 38).
 *
 * The generator decides WHERE the hundred trees go; this module decides what
 * each one is. A district picks a dominant species from the seed, so a park
 * reads as a stand of the same tree rather than as a bag of shapes, and a
 * quarter of the trees break ranks so the stand is not a plantation.
 *
 * Each species is one merged geometry drawn from the tree's base, so the whole
 * green layer is four instanced draws: one trunk plus one crown per species.
 */

import { ConeGeometry, CylinderGeometry, IcosahedronGeometry, type BufferGeometry } from "three";
import type { Prng } from "@/lib/city/prng";
import type { District, Vec3 } from "@/types/city";
import { mergeParts, type Part } from "./geometry";

export type TreeSpecies = "conifer" | "broadleaf" | "poplar";

export const TREE_SPECIES: readonly TreeSpecies[] = ["conifer", "broadleaf", "poplar"];

/** Relative crown shades. Multiplied by the tree's own seeded leaf colour. */
const CROWN = "#ffffff";
const CROWN_SHADE = "#c8d0bd";

/** Which species dominates a district, from its colour index and the seed. */
export function districtSpecies(district: District, prng: Prng): TreeSpecies {
  const bias = (district.colorIndex + prng.int(0, 2)) % TREE_SPECIES.length;
  return TREE_SPECIES[bias];
}

/** The district a point falls inside, or null for the ring road and the verges. */
function districtAt(position: Vec3, districts: readonly District[]): District | null {
  for (const district of districts) {
    const { x, z, w, d } = district.rect;
    if (
      position[0] >= x - w / 2 &&
      position[0] <= x + w / 2 &&
      position[2] >= z - d / 2 &&
      position[2] <= z + d / 2
    ) {
      return district;
    }
  }
  return null;
}

/**
 * A species per tree. Deterministic: the same seed and the same positions
 * always produce the same wood.
 */
export function assignSpecies(
  trees: readonly Vec3[],
  districts: readonly District[],
  prng: Prng,
): TreeSpecies[] {
  const dominant = new Map<string, TreeSpecies>();
  for (const district of districts) dominant.set(district.id, districtSpecies(district, prng));
  // Trees outside every district -- the ring road verges and the civic plaza
  // -- share one species, so the city's edge reads as a single planting.
  const verge = TREE_SPECIES[prng.int(0, TREE_SPECIES.length - 1)];

  return trees.map((position) => {
    const district = districtAt(position, districts);
    const local = district ? (dominant.get(district.id) ?? verge) : verge;
    // One tree in four is something else: a stand, not a plantation.
    return prng.next() < 0.25 ? TREE_SPECIES[prng.int(0, TREE_SPECIES.length - 1)] : local;
  });
}

const crownCache = new Map<TreeSpecies, BufferGeometry>();

/**
 * A species' crown, measured from the tree's base so the instance matrix is
 * the tree's position and scale and nothing else.
 */
export function crownGeometry(species: TreeSpecies): BufferGeometry {
  const hit = crownCache.get(species);
  if (hit) return hit;

  let parts: Part[];
  if (species === "conifer") {
    parts = [
      { geometry: new ConeGeometry(1.1, 2.3, 7), color: CROWN_SHADE, position: [0, 1.85, 0] },
      { geometry: new ConeGeometry(0.78, 1.75, 7), color: CROWN, position: [0, 2.95, 0] },
    ];
  } else if (species === "broadleaf") {
    parts = [
      { geometry: new IcosahedronGeometry(1.25, 0), color: CROWN_SHADE, position: [0, 2.3, 0] },
      {
        geometry: new IcosahedronGeometry(0.85, 0),
        color: CROWN,
        position: [0.25, 3.15, -0.15],
      },
      {
        geometry: new IcosahedronGeometry(0.7, 0),
        color: CROWN_SHADE,
        position: [-0.5, 2.85, 0.35],
      },
    ];
  } else {
    parts = [
      { geometry: new ConeGeometry(0.62, 3.4, 6), color: CROWN_SHADE, position: [0, 2.6, 0] },
      { geometry: new ConeGeometry(0.44, 1.5, 6), color: CROWN, position: [0, 4.3, 0] },
    ];
  }

  const made = mergeParts(parts);
  crownCache.set(species, made);
  return made;
}

let trunkCache: BufferGeometry | null = null;

/** One trunk, shared by every species: a metre and a half of bark. */
export function trunkGeometry(): BufferGeometry {
  if (trunkCache) return trunkCache;
  trunkCache = mergeParts([
    {
      geometry: new CylinderGeometry(0.15, 0.24, 1.5, 6),
      color: "#ffffff",
      position: [0, 0.75, 0],
    },
  ]);
  return trunkCache;
}

/** Per-species scale bands, so a poplar is not a fat conifer. */
export const SPECIES_SCALE: Record<TreeSpecies, [number, number]> = {
  conifer: [0.78, 1.25],
  broadleaf: [0.82, 1.2],
  poplar: [0.9, 1.35],
};
