/** Authored per-vertex material IDs. Keep these stable across model builders. */
export const SURFACE = {
  plaster: 0,
  brick: 1,
  stone: 2,
  timber: 3,
  clayTile: 4,
  slate: 5,
  thatch: 6,
  metal: 7,
  glass: 8,
  foliage: 9,
  fabric: 10,
  concrete: 11,
} as const;

export type SurfaceId = (typeof SURFACE)[keyof typeof SURFACE];
export const SURFACE_ATTRIBUTE = "surface";

/** Layer order in the shared model texture array; bark is an organic-only layer. */
export const MODEL_SURFACE_KINDS = [
  "plaster", "brick", "stone", "wood", "roof", "slate", "thatch", "metal",
  "glass", "foliage", "fabric", "concrete", "bark",
] as const;
