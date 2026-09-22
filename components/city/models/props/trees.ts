/**
 * Four tree species (PLAN.md sections 4, 37, 38).
 *
 * The generator decides WHERE the hundred trees go; this module decides what
 * each one is and how it stands. A district picks a dominant species from the
 * seed, so a park reads as a stand of the same tree rather than as a bag of
 * shapes, and a quarter of the trees break ranks so the stand is not a
 * plantation.
 *
 *   broadleaf  a round, layered crown of five clustered blobs on a forked trunk
 *   conifer    four stepped tiers, dark and blue-green, on a stub of trunk
 *   poplar     a tall narrow column, the exclamation mark of a skyline
 *   birch      a slender white trunk with dark bark marks under a loose crown
 *
 * Each species is ONE merged geometry, trunk and crown together, so the whole
 * green layer is four instanced draws. The crown is flagged as paint and the
 * trunk is not: under `tintedMaterial` (`./material`) each tree's seeded leaf
 * colour reaches its leaves and leaves the bark alone, and the crown alone
 * sways.
 *
 * Every per-tree variation -- species, size, a little stretch, heading and a
 * hue, saturation and lightness jitter on the leaf colour -- is drawn from the
 * seeded PRNG in `planTrees`, so the same repository always grows the same
 * wood (section 35).
 */

import {
  Color,
  ConeGeometry,
  CylinderGeometry,
  IcosahedronGeometry,
  BoxGeometry,
  type BufferGeometry,
} from "three";
import type { Prng } from "@/lib/city/prng";
import type { District, Vec3 } from "@/types/city";
import { TREE_LEAF, TREE_TRUNK, desaturate, mix } from "../../palette";
import { geometryCache, mergeParts, toneKey, type Part, type Triple } from "./geometry";

export type TreeSpecies = "broadleaf" | "conifer" | "poplar" | "birch";

export const TREE_SPECIES: readonly TreeSpecies[] = ["broadleaf", "conifer", "poplar", "birch"];

/** Section 37: at most a hundred trees, whatever the generator offers. */
export const TREE_CAP = 100;

/**
 * Each species' own green, all drawn from the city's one leaf colour so a
 * park of four species still sits in one palette: conifers darker and bluer,
 * poplars and birches brighter and yellower.
 */
export const SPECIES_LEAF: Record<TreeSpecies, string> = {
  broadleaf: TREE_LEAF,
  conifer: mix(TREE_LEAF, "#2f5a4c", 0.5),
  poplar: mix(TREE_LEAF, "#b4bd5a", 0.32),
  birch: mix(TREE_LEAF, "#cfd57a", 0.42),
};

/** Per-species scale bands, so a poplar is not a fat conifer. */
export const SPECIES_SCALE: Record<TreeSpecies, [number, number]> = {
  broadleaf: [0.82, 1.2],
  conifer: [0.8, 1.22],
  poplar: [0.9, 1.25],
  birch: [0.82, 1.12],
};

/**
 * Relative crown shades, multiplied by the tree's leaf colour: the underside
 * of a crown is in its own shade, the top catches the sun. Flat shading does
 * the rest.
 */
const SHADE = "#b6c0ab";
const MID = "#e2e8da";
const LIT = "#ffffff";

const BIRCH_BARK = "#e4e0d5";
const BIRCH_MARK = "#3b3935";

/** Which species dominates a district, from its colour index and the seed. */
export function districtSpecies(district: District, prng: Prng): TreeSpecies {
  const bias = (district.colorIndex + prng.int(0, TREE_SPECIES.length - 1)) % TREE_SPECIES.length;
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

/** One tree, placed and varied. */
export interface PlannedTree {
  position: Vec3;
  species: TreeSpecies;
  /** Uniform size, from the species' band. */
  scale: number;
  /** Extra height over width, about 1: some trees are leggier than others. */
  stretch: number;
  /** Heading about `y`, radians. The crowns are lopsided, so this shows. */
  rotation: number;
  /** Seeded leaf colour, multiplied into the crown's baked shading. */
  tint: string;
}

const scratchColor = new Color();
const hsl = { h: 0, s: 0, l: 0 };

/**
 * A leaf colour a little off the species' green: hue, saturation and
 * lightness each nudged by the seed, so a stand is never one flat colour but
 * never leaves the palette either.
 */
export function jitterLeaf(base: string, prng: Prng): string {
  scratchColor.set(base).getHSL(hsl);
  const h = hsl.h + prng.range(-0.035, 0.035);
  const s = Math.min(1, Math.max(0, hsl.s + prng.range(-0.08, 0.06)));
  const l = Math.min(0.8, Math.max(0.12, hsl.l + prng.range(-0.06, 0.06)));
  return `#${scratchColor.setHSL((h + 1) % 1, s, l).getHexString()}`;
}

/**
 * Every tree the city draws, capped at section 37's hundred. Pure and seeded.
 */
export function planTrees(
  positions: readonly Vec3[],
  districts: readonly District[],
  prng: Prng,
): PlannedTree[] {
  const kept = positions.slice(0, TREE_CAP);
  const kinds = assignSpecies(kept, districts, prng);
  return kept.map((position, i) => {
    const species = kinds[i];
    const [low, high] = SPECIES_SCALE[species];
    return {
      position,
      species,
      scale: prng.range(low, high),
      stretch: prng.range(0.9, 1.14),
      rotation: prng.range(0, Math.PI * 2),
      tint: jitterLeaf(SPECIES_LEAF[species], prng),
    };
  });
}

/** A blob of foliage: a twenty-face ball, the unit of every broadleaf crown. */
const blob = (radius: number, position: Triple, color: string, squash: Triple = [1, 1, 1]): Part => ({
  geometry: new IcosahedronGeometry(radius, 0),
  color,
  paint: true,
  position,
  scale: squash,
});

/** A tapering trunk. Open ended: nobody sees the bottom of a tree. */
const trunk = (bottom: number, top: number, height: number, color: string, sides = 6): Part => ({
  geometry: new CylinderGeometry(top, bottom, height, sides, 1, true),
  color,
  position: [0, height / 2, 0],
});

function speciesParts(species: TreeSpecies, tone: number): Part[] {
  const bark = desaturate(TREE_TRUNK, tone);

  if (species === "broadleaf") {
    return [
      trunk(0.21, 0.13, 1.8, bark),
      // One limb forking off, which is what says "tree" rather than "lollipop".
      {
        geometry: new CylinderGeometry(0.05, 0.08, 0.8, 5, 1, true),
        color: bark,
        position: [0.24, 1.55, 0.05],
        rotation: [0, 0, -0.75],
      },
      blob(1.15, [0, 2.5, 0], MID, [1, 0.88, 1]),
      blob(0.82, [-0.72, 2.15, 0.28], SHADE),
      blob(0.78, [0.66, 2.2, -0.34], SHADE),
      blob(0.74, [0.12, 2.3, 0.74], MID),
      blob(0.7, [0.14, 3.22, -0.06], LIT),
    ];
  }

  if (species === "conifer") {
    // Four tiers, each turned a little against the one below so the facets
    // do not line up into a single cone.
    const tiers: [number, number, number, string][] = [
      [1.25, 1.6, 1.5, SHADE],
      [1.0, 1.45, 2.4, MID],
      [0.74, 1.25, 3.2, MID],
      [0.44, 1.0, 3.9, LIT],
    ];
    return [
      trunk(0.17, 0.12, 1.0, bark),
      ...tiers.map(([radius, height, y, color], i) => ({
        geometry: new ConeGeometry(radius, height, 8, 1, false),
        color,
        paint: true,
        position: [0, y, 0] as Triple,
        rotation: [0, i * 0.39, 0] as Triple,
      })),
    ];
  }

  if (species === "poplar") {
    return [
      trunk(0.15, 0.1, 1.3, bark, 5),
      blob(1, [-0.04, 1.95, 0.06], SHADE, [0.58, 0.95, 0.58]),
      blob(1, [0, 3.05, 0], MID, [0.64, 1.75, 0.64]),
      blob(1, [0.07, 4.4, 0.04], LIT, [0.46, 1.15, 0.46]),
    ];
  }

  // Birch: a pale trunk with two dark bands, and a loose, lifted crown.
  const pale = desaturate(BIRCH_BARK, tone);
  const mark = desaturate(BIRCH_MARK, tone);
  return [
    trunk(0.12, 0.08, 2.7, pale, 5),
    { geometry: new BoxGeometry(0.26, 0.05, 0.06), color: mark, position: [0, 0.75, 0] },
    { geometry: new BoxGeometry(0.06, 0.05, 0.22), color: mark, position: [0, 1.35, 0], rotation: [0, 0.5, 0] },
    blob(0.7, [0.2, 2.6, 0.1], SHADE),
    blob(0.76, [-0.24, 3.2, -0.12], MID),
    blob(0.5, [0.46, 3.15, -0.36], MID),
    blob(0.56, [0.12, 3.86, 0.06], LIT),
  ];
}

const builder = geometryCache<string>((key) => {
  const [species, tone] = key.split(":");
  return mergeParts(speciesParts(species as TreeSpecies, Number(tone)));
});

/**
 * One species, trunk and crown, measured from the tree's base so an instance
 * matrix is the tree's position, heading and size and nothing else. Cached per
 * species and tone: the bark desaturates with the city (section 19).
 */
export function treeGeometry(species: TreeSpecies, desaturation = 0): BufferGeometry {
  return builder(`${species}:${toneKey(desaturation)}`);
}

/**
 * The height, in a tree's own units, below which nothing sways: about where
 * the lowest crown starts. The trunk never moves anyway (it is not paint);
 * this keeps the underside of a crown from sliding across the top of it.
 */
export const SWAY_BASE = 1.2;

/** Sideways travel per unit of height above `SWAY_BASE`: a breeze, not a gale. */
export const SWAY_AMOUNT = 0.02;
