/**
 * The baked half of the surface library.
 *
 * `blender/textures/` models every layer as real geometry and bakes it into
 * static images under `public/textures/`. This module loads them WITHOUT
 * blocking: `texture-data.ts` still builds every texture from the procedural
 * patterns first (so nothing waits, and node tests need no network), then
 * registers it here; when an image arrives its layer is replaced in place,
 * downsampled to the quality tier's size, and the texture re-uploads with
 * fresh mipmaps. An image that fails to load leaves the procedural layer.
 *
 * FILES
 *   public/textures/surfaces/<layer>.jpg            model layer
 *   public/textures/surfaces/<layer>.metalness.jpg  grey plane, layers with metalness
 *   public/textures/ground/<kind>.jpg               ground surface
 * All 512 px (no tier samples finer; the 1024 px masters stay out of the
 * site), JPEG with full-resolution chroma so the data channels do not bleed:
 * R = albedo multiplier (ambient occlusion included), G = roughness,
 * B = height. Metalness travels as its own grey plane, as a canvas cannot
 * hand back RGB behind a zero alpha.
 *
 * Everything here that does not touch the network is pure and unit tested.
 */

import { MODEL_SURFACE_KINDS } from "./surface-types";

/** A square RGBA image (row 0 = the top of the picture, as decoded). */
export interface Plane {
  size: number;
  data: Uint8Array | Uint8ClampedArray;
}

/** Resolves to the decoded image, or null when it cannot be had. */
export type BakedImageSource = (url: string) => Promise<Plane | null>;

/** The side of the shipped images; tiers that sample smaller downsample them. */
export const BAKED_SIZE = 512;

export const SURFACES_URL = "/textures/surfaces";
export const GROUND_URL = "/textures/ground";

/** Model layers that carry a metalness plane; every other layer is 0. */
export const METALNESS_LAYERS: readonly string[] = ["metal"];

/** Ground kinds baked in Blender, and the model layers reused for two more. */
export const BAKED_GROUND_KINDS = ["lawn", "turf", "meadow", "asphalt", "pavers", "gravel", "setts", "concrete", "soil"] as const;
export const GROUND_FROM_MODEL: Readonly<Record<string, string>> = { wood: "wood", metal: "metal" };

const file = (folder: string, name: string) => `${folder}/${name}.jpg`;

export const bakedModelUrl = (layer: string) => file(SURFACES_URL, layer);
export const bakedMetalnessUrl = (layer: string) => file(SURFACES_URL, `${layer}.metalness`);
export const bakedGroundUrl = (kind: string) => file(GROUND_URL, kind);

// ---------------------------------------------------------------------------
// Pure pixel logic
// ---------------------------------------------------------------------------

/**
 * Area-average downsample of an RGBA image. `to` must divide `from`, which
 * holds for every pair of power-of-two sides the library uses. Returns the
 * source itself (copied) when the sizes match.
 */
export function boxDownsample(source: ArrayLike<number>, from: number, to: number): Uint8Array {
  if (to > from || from % to !== 0) throw new RangeError(`cannot downsample ${from} to ${to}`);
  const out = new Uint8Array(to * to * 4);
  if (to === from) {
    out.set(source as ArrayLike<number>);
    return out;
  }
  const k = from / to;
  const area = k * k;
  for (let y = 0; y < to; y++) {
    for (let x = 0; x < to; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let j = 0; j < k; j++) {
        let i = ((y * k + j) * from + x * k) * 4;
        for (let n = 0; n < k; n++, i += 4) {
          r += source[i]; g += source[i + 1]; b += source[i + 2]; a += source[i + 3];
        }
      }
      const o = (y * to + x) * 4;
      out[o] = Math.round(r / area);
      out[o + 1] = Math.round(g / area);
      out[o + 2] = Math.round(b / area);
      out[o + 3] = Math.round(a / area);
    }
  }
  return out;
}

/**
 * Decoded images arrive top row first; a DataTexture's row 0 is v = 0, the
 * BOTTOM of the picture the artist saw. Flipping once here keeps the baked
 * images upright when the shader samples them.
 */
export function flipRows(data: Uint8Array, size: number): Uint8Array {
  const stride = size * 4;
  const out = new Uint8Array(data.length);
  for (let y = 0; y < size; y++) out.set(data.subarray(y * stride, (y + 1) * stride), (size - 1 - y) * stride);
  return out;
}

/** A baked plane at exactly `side` pixels, upright, ready to be copied. */
export function preparePlane(plane: Plane, side: number): Uint8Array {
  return flipRows(boxDownsample(plane.data, plane.size, side), side);
}

/**
 * Writes one baked model layer into the texture array's data:
 * R tone, G roughness, B height straight from the image, A from the
 * metalness plane (zero when the layer has none).
 */
export function writeModelLayer(
  target: Uint8Array,
  layer: number,
  side: number,
  baked: Uint8Array,
  metalness: Uint8Array | null,
): void {
  const stride = side * side * 4;
  const base = layer * stride;
  for (let i = 0; i < stride; i += 4) {
    target[base + i] = baked[i];
    target[base + i + 1] = baked[i + 1];
    target[base + i + 2] = baked[i + 2];
    target[base + i + 3] = metalness ? metalness[i] : 0;
  }
}

/** Mean of each colour channel divided by their common mean: the surface's tint. */
export function tintOf(data: ArrayLike<number>): [number, number, number] {
  let r = 0, g = 0, b = 0;
  const n = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    r += data[i]; g += data[i + 1]; b += data[i + 2];
  }
  const mean = (r + g + b) / 3 || 1;
  return [r / n / (mean / n), g / n / (mean / n), b / n / (mean / n)];
}

/** Mean of one channel, 0..1. */
export function channelMean(data: ArrayLike<number>, channel: number): number {
  let sum = 0;
  const n = data.length / 4;
  for (let i = channel; i < data.length; i += 4) sum += data[i];
  return sum / n / 255;
}

/**
 * Ground colour texture: the baked tone in every colour channel times the
 * procedural pattern's tint. The alpha the pattern carries (asphalt's wear
 * mask) is left alone.
 */
export function writeGroundColor(target: Uint8Array, baked: Uint8Array, tint: readonly [number, number, number]): void {
  for (let i = 0; i < target.length; i += 4) {
    const tone = baked[i];
    target[i] = Math.min(255, Math.round(tone * tint[0]));
    target[i + 1] = Math.min(255, Math.round(tone * tint[1]));
    target[i + 2] = Math.min(255, Math.round(tone * tint[2]));
  }
}

/**
 * Ground relief texture: height in R and B, roughness multiplier in G.
 * `roughnessScale` rescales the baked roughness to the multiplier range the
 * procedural relief uses (1 for layers baked directly for the ground).
 */
export function writeGroundRelief(target: Uint8Array, baked: Uint8Array, roughnessScale = 1): void {
  for (let i = 0; i < target.length; i += 4) {
    target[i] = baked[i + 2];
    target[i + 1] = Math.min(255, Math.round(baked[i + 1] * roughnessScale));
    target[i + 2] = baked[i + 2];
    target[i + 3] = 255;
  }
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

/** Decodes a PNG to opaque RGBA without colour conversion, in a browser. */
async function browserSource(url: string): Promise<Plane | null> {
  if (typeof fetch !== "function" || typeof createImageBitmap !== "function") return null;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const bitmap = await createImageBitmap(await response.blob(), { premultiplyAlpha: "none", colorSpaceConversion: "none" });
    const size = bitmap.width;
    if (bitmap.height !== size) return null;
    const canvas: OffscreenCanvas | HTMLCanvasElement =
      typeof OffscreenCanvas === "function" ? new OffscreenCanvas(size, size) : Object.assign(document.createElement("canvas"), { width: size, height: size });
    const context = canvas.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    if (!context) return null;
    context.imageSmoothingEnabled = false;
    context.drawImage(bitmap, 0, 0);
    bitmap.close?.();
    return { size, data: context.getImageData(0, 0, size, size).data };
  } catch {
    return null;
  }
}

let source: BakedImageSource = browserSource;
const pending = new Set<Promise<unknown>>();

/** Swaps the image source (tests); pass nothing to restore the browser's. */
export function setBakedImageSource(next?: BakedImageSource): void {
  source = next ?? browserSource;
}

/** Resolves once every load started so far has been applied or has failed. */
export async function bakedSurfacesSettled(): Promise<void> {
  while (pending.size) await Promise.allSettled([...pending]);
  flushBakedUploads();
}

function track<T>(promise: Promise<T>): Promise<T> {
  pending.add(promise);
  const done = () => pending.delete(promise);
  promise.then(done, done);
  return promise;
}

/** A plane that is usable at `side`: square, a power of two, at least that big. */
function usable(plane: Plane | null, side: number): plane is Plane {
  return !!plane && plane.size >= side && plane.size % side === 0 && plane.data.length >= plane.size * plane.size * 4;
}

interface Uploadable {
  needsUpdate: boolean;
}

/** Re-uploads at most every 200 ms while images keep arriving. */
const flushing = new Map<Uploadable, ReturnType<typeof setTimeout>>();
const flushers = new Set<Uploadable>();
function scheduleUpload(texture: Uploadable): void {
  flushers.add(texture);
  if (flushing.has(texture)) return;
  flushing.set(texture, setTimeout(() => {
    flushing.delete(texture);
    flushers.delete(texture);
    texture.needsUpdate = true;
  }, 200));
}

/** Uploads anything still waiting for its throttle, now. */
export function flushBakedUploads(): void {
  for (const timer of flushing.values()) clearTimeout(timer);
  flushing.clear();
  for (const texture of flushers) texture.needsUpdate = true;
  flushers.clear();
}

/**
 * Replaces every model layer of `texture` (`side` pixels a side, layers in
 * `MODEL_SURFACE_KINDS` order) with its baked image as the images arrive.
 */
export function bakeModelArray(texture: Uploadable & { image: unknown }, side: number): Promise<void> {
  const data = (texture.image as { data: Uint8Array }).data;
  const jobs = MODEL_SURFACE_KINDS.map((kind, layer) =>
    track((async () => {
      const [color, metal] = await Promise.all([
        source(bakedModelUrl(kind)),
        METALNESS_LAYERS.includes(kind) ? source(bakedMetalnessUrl(kind)) : Promise.resolve(null),
      ]);
      if (!usable(color, side)) return;
      const metalness = METALNESS_LAYERS.includes(kind) ? (usable(metal, side) ? preparePlane(metal, side) : null) : null;
      // A layer that should carry metalness but lost its plane keeps the procedural layer whole.
      if (METALNESS_LAYERS.includes(kind) && !metalness) return;
      writeModelLayer(data, layer, side, preparePlane(color, side), metalness);
      scheduleUpload(texture);
    })().catch(() => undefined)),
  );
  return track(Promise.all(jobs).then(() => undefined));
}

export type GroundVariant = "color" | "relief";

/** The baked plane for a ground kind at `side`, or null; shared by both variants. */
const groundPlanes = new Map<string, Promise<{ plane: Uint8Array; scale: number } | null>>();

function groundPlane(kind: string, side: number): Promise<{ plane: Uint8Array; scale: number } | null> | null {
  const model = GROUND_FROM_MODEL[kind];
  const baked = (BAKED_GROUND_KINDS as readonly string[]).includes(kind);
  if (!model && !baked) return null;
  const key = `${kind}:${side}`;
  let promise = groundPlanes.get(key);
  if (!promise) {
    promise = track((async () => {
      const plane = await source(model ? bakedModelUrl(model) : bakedGroundUrl(kind));
      if (!usable(plane, side)) return null;
      return { plane: preparePlane(plane, side), scale: model ? -1 : 1 };
    })().catch(() => null));
    groundPlanes.set(key, promise);
  }
  return promise;
}

/**
 * Replaces a ground texture's pixels (colour or relief variant) with the
 * baked image, in place, so every clone that shares the image follows.
 * `procedural` is the pattern's own data before replacement, used for its
 * tint and roughness range.
 */
export function bakeGroundTexture(
  kind: string,
  side: number,
  variant: GroundVariant,
  texture: Uploadable & { image: unknown },
  procedural: { tint: readonly [number, number, number]; roughness: number },
): Promise<void> | null {
  const pending_ = groundPlane(kind, side);
  if (!pending_) return null;
  return track(pending_.then((result) => {
    if (!result) return;
    const target = (texture.image as { data: Uint8Array }).data;
    if (variant === "color") writeGroundColor(target, result.plane, procedural.tint);
    else {
      // Model layers store an absolute roughness; the relief slot wants a multiplier.
      const scale = result.scale < 0 ? procedural.roughness / Math.max(0.05, channelMean(result.plane, 1)) : 1;
      writeGroundRelief(target, result.plane, scale);
    }
    scheduleUpload(texture);
  }).catch(() => undefined));
}

/** Forgets every cached ground plane (tests). */
export function resetBakedSurfaces(): void {
  groundPlanes.clear();
  flushBakedUploads();
}
