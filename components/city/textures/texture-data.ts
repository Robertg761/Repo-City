/** Cached linear-data textures shared by ground, buildings and small models. */
import {
  DataTexture,
  DataArrayTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  NoColorSpace,
  RGBAFormat,
  RepeatWrapping,
  UnsignedByteType,
  type Texture,
} from "three";
import {
  asphaltPattern,
  barkPattern,
  brickPattern,
  concretePattern,
  facadePattern,
  foliagePattern,
  fabricPattern,
  glassPattern,
  grassPattern,
  gravelPattern,
  groundDetailPattern,
  patternSize,
  plasterPattern,
  paverPattern,
  roofPattern,
  settsPattern,
  slatePattern,
  soilPattern,
  stonePattern,
  thatchPattern,
  metalPattern,
  woodPattern,
  type Pattern,
} from "./patterns";
import { MODEL_SURFACE_KINDS, type SurfaceId } from "./surface-types";
import {
  bakeGroundTexture,
  bakeModelArray,
  bakedGroundKind,
  bakedModelLayerArrived,
  channelMean,
  deferProcedural,
  prefetchBakedSurfaces,
  tintOf,
  writeFlatModelLayer,
} from "./baked-surfaces";

export type SurfaceKind =
  | "lawn" | "turf" | "meadow" | "asphalt" | "pavers" | "gravel" | "ground" | "setts"
  | "concrete" | "soil" | "wood" | "bark" | "facade" | "roof" | "foliage"
  | "plaster" | "brick" | "stone" | "slate" | "thatch" | "metal" | "glass" | "fabric";

const MAKERS: Record<SurfaceKind, (size: number) => Pattern> = {
  lawn: (size) => grassPattern(size, { stripes: 4, seed: "lawn" }),
  turf: (size) => grassPattern(size, { seed: "turf", mottle: 0.15 }),
  meadow: (size) => grassPattern(size, { seed: "meadow", mottle: 0.35 }),
  asphalt: asphaltPattern,
  pavers: (size) => paverPattern(size, { columns: 4, rows: 8 }),
  gravel: gravelPattern,
  ground: groundDetailPattern,
  setts: settsPattern,
  concrete: concretePattern,
  soil: (size) => soilPattern(size),
  wood: woodPattern,
  bark: barkPattern,
  facade: facadePattern,
  roof: roofPattern,
  foliage: foliagePattern,
  plaster: plasterPattern,
  brick: brickPattern,
  stone: stonePattern,
  slate: slatePattern,
  thatch: thatchPattern,
  metal: metalPattern,
  glass: glassPattern,
  fabric: fabricPattern,
};

/** World-unit relief. Kept below the thickness of a kerb or roof tile. */
export const SURFACE_BUMP: Record<SurfaceKind, number> = {
  lawn: 0.025, turf: 0.015, meadow: 0.025, asphalt: 0.018,
  pavers: 0.028, gravel: 0.03, ground: 0.012, setts: 0.04,
  concrete: 0.014, soil: 0.03, wood: 0.008, bark: 0.014,
  facade: 0.015, roof: 0.024, foliage: 0.012,
  plaster: 0.012, brick: 0.025, stone: 0.026, slate: 0.016,
  thatch: 0.022, metal: 0.003, glass: 0, fabric: 0.002,
};

const cache = new Map<string, DataTexture>();

// Fetch and decode the baked images while the app is still starting, so they
// are usually in hand by the time a texture asks for one.
prefetchBakedSurfaces();
const arrayCache = new Map<number, DataArrayTexture>();

/** Material-specific physical finish, independent of a model's colour. */
export const MODEL_FINISH: Partial<Record<SurfaceKind, { roughness: number; variation: number; metalness: number }>> = {
  plaster: { roughness: 0.90, variation: 0.7, metalness: 0 },
  brick: { roughness: 0.82, variation: 0.9, metalness: 0 },
  stone: { roughness: 0.78, variation: 0.9, metalness: 0 },
  wood: { roughness: 0.72, variation: 0.9, metalness: 0 },
  roof: { roughness: 0.73, variation: 0.9, metalness: 0 },
  slate: { roughness: 0.61, variation: 1.1, metalness: 0 },
  thatch: { roughness: 0.96, variation: 0.7, metalness: 0 },
  // The city uses direct and hemisphere light without image-based reflections.
  metal: { roughness: 0.27, variation: 1.9, metalness: 0.30 },
  glass: { roughness: 0.08, variation: 3.3, metalness: 0 },
  foliage: { roughness: 0.88, variation: 0.8, metalness: 0 },
  fabric: { roughness: 0.92, variation: 1, metalness: 0 },
  concrete: { roughness: 0.88, variation: 1.1, metalness: 0 },
  bark: { roughness: 0.94, variation: 0.9, metalness: 0 },
};

/** Height in R, roughness in G. Alpha wear masks never become relief. */
export function surfaceReliefPattern(pattern: Pattern): Pattern {
  const data = new Uint8Array(pattern.data.length);
  for (let i = 0; i < data.length; i += 4) {
    const tone = (pattern.data[i] + pattern.data[i + 1] + pattern.data[i + 2]) / (255 * 3);
    const height = Math.max(0, Math.min(1, (tone - 0.7) / 0.3));
    data[i] = Math.round(height * 255);
    data[i + 1] = Math.round(Math.min(1, 0.78 + (1 - tone) * 1.25) * 255);
    data[i + 2] = data[i];
    data[i + 3] = 255;
  }
  return { size: pattern.size, data };
}

/** Each procedural pattern is made once per side and never written to again. */
const patternCache = new Map<string, Pattern>();

function basePattern(kind: SurfaceKind, side: number): Pattern {
  const key = `${kind}:${side}`;
  let pattern = patternCache.get(key);
  if (!pattern) {
    pattern = MAKERS[kind](side);
    patternCache.set(key, pattern);
  }
  return pattern;
}

/** Model channel layout: tint R, roughness G, height B, metalness A. A new array. */
function modelLayerData(kind: SurfaceKind, side: number): Uint8Array {
  const color = basePattern(kind, side);
  const pattern = surfaceReliefPattern(color);
  const finish = MODEL_FINISH[kind];
  // A single sample supplies tint, roughness and height to merged models.
  for (let i = 0; i < pattern.data.length; i += 4) {
    const tone = (color.data[i] + color.data[i + 1] + color.data[i + 2]) / (3 * 255);
    pattern.data[i + 2] = pattern.data[i];
    pattern.data[i] = Math.round(tone * 255);
    if (finish) {
      pattern.data[i + 1] = Math.round(Math.min(1, finish.roughness + (1 - tone) * finish.variation) * 255);
      pattern.data[i + 3] = Math.round(Math.max(0, finish.metalness - (1 - tone) * 1.4) * 255);
    } else pattern.data[i + 3] = 0;
    if (kind === "glass") pattern.data[i + 2] = 128;
  }
  return pattern.data;
}

function cachedTexture(kind: SurfaceKind, size: number, anisotropy: number, variant: "color" | "relief" | "model"): DataTexture {
  const side = patternSize(size);
  const key = `${kind}:${side}:${variant}`;
  let texture = cache.get(key);
  if (!texture) {
    const color = basePattern(kind, side);
    // The baked ground images replace the colour texture's pixels in place, so
    // it gets its own copy; the cached pattern stays pristine for the relief
    // and model variants.
    const baked = variant !== "model" && bakedGroundKind(kind);
    const data =
      variant === "color" ? (baked ? color.data.slice() : color.data)
      : variant === "relief" ? surfaceReliefPattern(color).data
      : modelLayerData(kind, side);
    texture = new DataTexture(data, side, side, RGBAFormat, UnsignedByteType);
    texture.colorSpace = NoColorSpace;
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
    texture.magFilter = LinearFilter;
    texture.minFilter = LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.needsUpdate = true;
    cache.set(key, texture);
    // Ground kinds swap to their baked image when it arrives; the pattern above
    // stays if it never does.
    if (baked) {
      bakeGroundTexture(kind, side, variant as "color" | "relief", texture, {
        tint: tintOf(color.data),
        roughness: channelMean(color.data, 1),
      });
    }
  }
  if (texture.anisotropy !== anisotropy) {
    texture.anisotropy = anisotropy;
    texture.needsUpdate = true;
  }
  return texture;
}

export function surfaceTexture(kind: SurfaceKind, size: number, anisotropy = 1): DataTexture {
  return cachedTexture(kind, size, anisotropy, "color");
}

export function surfaceReliefTexture(kind: SurfaceKind, size: number, anisotropy = 1): DataTexture {
  return cachedTexture(kind, size, anisotropy, "relief");
}

/** Model channel layout: tint R, roughness G, height B. */
export function surfaceModelTexture(kind: SurfaceKind, size: number, anisotropy = 1): DataTexture {
  return cachedTexture(kind, size, anisotropy, "model");
}

/** One sampler for every authored material, with isolated layers and full mipmaps. */
export function modelSurfaceTextureArray(size: number, anisotropy = 1): DataArrayTexture {
  const side = patternSize(size);
  let texture = arrayCache.get(side);
  if (!texture) {
    const stride = side * side * 4;
    const data = new Uint8Array(stride * MODEL_SURFACE_KINDS.length);
    // In a browser every layer is replaced by its baked image, so the
    // procedural layers are only made for a layer whose image cannot be had.
    // Until then a layer is flat: full albedo, the material's own roughness,
    // no relief. Node (the tests) and custom image sources keep the
    // procedural layers from the start.
    const deferred = deferProcedural();
    const fill = (kind: (typeof MODEL_SURFACE_KINDS)[number], layer: number) => {
      if (!deferred) data.set(modelLayerData(kind, side), layer * stride);
      else if (!bakedModelLayerArrived(kind)) {
        const finish = MODEL_FINISH[kind];
        writeFlatModelLayer(data, layer, side, finish ? Math.min(1, finish.roughness + 0.15 * finish.variation) : 0.85, finish ? finish.metalness * 0.5 : 0);
      }
    };
    MODEL_SURFACE_KINDS.forEach(fill);
    texture = new DataArrayTexture(data, side, side, MODEL_SURFACE_KINDS.length);
    texture.format = RGBAFormat;
    texture.type = UnsignedByteType;
    texture.colorSpace = NoColorSpace;
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
    texture.magFilter = LinearFilter;
    texture.minFilter = LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.needsUpdate = true;
    arrayCache.set(side, texture);
    // Procedural layers first; each baked layer replaces its own as it arrives.
    bakeModelArray(texture, side, deferred ? (layer) => data.set(modelLayerData(MODEL_SURFACE_KINDS[layer], side), layer * stride) : undefined);
  }
  if (texture.anisotropy !== anisotropy) {
    texture.anisotropy = anisotropy;
    texture.needsUpdate = true;
  }
  return texture;
}

/** The wrapper owns its repeat transform; the image stays shared in the cache. */
export function tiledSurface(kind: SurfaceKind, size: number, repeat: number, anisotropy = 1, relief = false): Texture {
  const texture = cachedTexture(kind, size, anisotropy, relief ? "relief" : "color").clone();
  texture.repeat.set(repeat, repeat);
  texture.needsUpdate = true;
  return texture;
}

export interface ModelDetailOptions {
  textureSize?: number;
  anisotropy?: number;
  /** Crops and trees can opt in without a wind displacement. */
  profile?: "organic";
  /** Uniform fallback for parts that do not have authored per-vertex material tags. */
  surface?: SurfaceId;
  /** The caller has verified its geometry contains the optional `surface` attribute. */
  surfaceAttribute?: boolean;
  /**
   * How much of the surface layer's tone pattern reaches the colour, 0..1
   * (default 1). Vehicle paint takes a fraction: the metal layer's mottling
   * read as dirt camouflage on a bus.
   */
  patternStrength?: number;
}
