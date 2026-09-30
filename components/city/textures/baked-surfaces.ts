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
  /** Row 0 is already the bottom of the picture (decoded upside down on purpose). */
  flipped?: boolean;
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
export function flipRows(data: ArrayLike<number> & { subarray(a: number, b: number): ArrayLike<number> }, size: number): Uint8Array {
  const stride = size * 4;
  const out = new Uint8Array(data.length);
  for (let y = 0; y < size; y++) out.set(data.subarray(y * stride, (y + 1) * stride), (size - 1 - y) * stride);
  return out;
}

/**
 * A baked plane at exactly `side` pixels, upright, ready to be read. A plane
 * that is already the right size and already flipped by the decoder is
 * returned as it is, not copied.
 */
export function preparePlane(plane: Plane, side: number): Uint8Array | Uint8ClampedArray {
  if (plane.size === side) return plane.flipped ? plane.data : flipRows(plane.data as Uint8Array, side);
  const small = boxDownsample(plane.data, plane.size, side);
  return plane.flipped ? small : flipRows(small, side);
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
  baked: ArrayLike<number>,
  metalness: ArrayLike<number> | null,
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

/** A featureless layer: full albedo, one roughness, flat height, one metalness. */
export function writeFlatModelLayer(target: Uint8Array, layer: number, side: number, roughness: number, metalness: number): void {
  const stride = side * side * 4;
  const base = layer * stride;
  const rough = Math.round(roughness * 255);
  const metal = Math.round(metalness * 255);
  for (let i = 0; i < stride; i += 4) {
    target[base + i] = 255;
    target[base + i + 1] = rough;
    target[base + i + 2] = 128;
    target[base + i + 3] = metal;
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
export function writeGroundColor(target: Uint8Array, baked: ArrayLike<number>, tint: readonly [number, number, number]): void {
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
export function writeGroundRelief(target: Uint8Array, baked: ArrayLike<number>, roughnessScale = 1): void {
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

let scratch: { size: number; canvas: OffscreenCanvas | HTMLCanvasElement; context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D } | null = null;

function scratchContext(size: number) {
  if (scratch?.size === size) return scratch.context;
  const canvas: OffscreenCanvas | HTMLCanvasElement =
    typeof OffscreenCanvas === "function" ? new OffscreenCanvas(size, size) : Object.assign(document.createElement("canvas"), { width: size, height: size });
  const context = canvas.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!context) return null;
  context.imageSmoothingEnabled = false;
  scratch = { size, canvas, context };
  return context;
}

/**
 * Decodes an image to opaque RGBA without colour conversion, in a browser,
 * already flipped: the canvas draws it upside down, which is exact at this
 * size and costs no JavaScript row copy.
 */
async function browserSource(url: string): Promise<Plane | null> {
  if (typeof fetch !== "function" || typeof createImageBitmap !== "function") return null;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const bitmap = await createImageBitmap(await response.blob(), { premultiplyAlpha: "none", colorSpaceConversion: "none" });
    const size = bitmap.width;
    if (bitmap.height !== size) return null;
    const context = scratchContext(size);
    if (!context) return null;
    context.setTransform(1, 0, 0, -1, 0, size);
    context.drawImage(bitmap, 0, 0);
    context.setTransform(1, 0, 0, 1, 0, 0);
    bitmap.close?.();
    return { size, data: context.getImageData(0, 0, size, size).data, flipped: true };
  } catch {
    return null;
  }
}

let source: BakedImageSource = browserSource;
const pending = new Set<Promise<unknown>>();

/**
 * True when baked images will replace the procedural layers in this
 * environment (a browser, the real image source): callers may then skip
 * building patterns that would be thrown away at once.
 */
export function deferProcedural(): boolean {
  return source === browserSource && typeof window !== "undefined" && typeof createImageBitmap === "function";
}

/** Each image is fetched and decoded once, whoever asks first. */
const images = new Map<string, Promise<Plane | null>>();
/** Images that have arrived, readable without waiting. */
const arrived = new Map<string, Plane>();

function image(url: string): Promise<Plane | null> {
  let promise = images.get(url);
  if (!promise) {
    promise = source(url).then((plane) => {
      if (plane) arrived.set(url, plane);
      return plane;
    });
    images.set(url, promise);
  }
  return promise;
}

/** Whether a model layer's image (and its metalness plane) is already decoded and in hand. */
export function bakedModelLayerArrived(kind: string): boolean {
  return arrived.has(bakedModelUrl(kind)) && (!METALNESS_LAYERS.includes(kind) || arrived.has(bakedMetalnessUrl(kind)));
}

/** Starts every fetch now, one after another so decoding never piles into one task. */
export function prefetchBakedSurfaces(): void {
  if (!deferProcedural()) return;
  const urls = [
    ...MODEL_SURFACE_KINDS.map(bakedModelUrl),
    ...METALNESS_LAYERS.map(bakedMetalnessUrl),
    ...BAKED_GROUND_KINDS.map(bakedGroundUrl),
  ];
  for (const url of urls) track(image(url).catch(() => null));
}

/** Swaps the image source (tests); pass nothing to restore the browser's. */
export function setBakedImageSource(next?: BakedImageSource): void {
  source = next ?? browserSource;
  images.clear();
  arrived.clear();
  groundPlanes.clear();
  groundReady.clear();
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

/**
 * Uploads wait for the burst of arrivals to end (60 ms of quiet, 400 ms at
 * most), then every texture that changed goes up together: each upload
 * regenerates the mipmaps, so one per burst is the cheapest.
 */
const QUIET_MS = 60;
const LONGEST_WAIT_MS = 400;
const waiting = new Set<Uploadable>();
let quietTimer: ReturnType<typeof setTimeout> | undefined;
let firstWaitAt = 0;
function scheduleUpload(texture: Uploadable): void {
  waiting.add(texture);
  const now = Date.now();
  if (!quietTimer) firstWaitAt = now;
  else clearTimeout(quietTimer);
  quietTimer = setTimeout(flushBakedUploads, Math.max(0, Math.min(QUIET_MS, firstWaitAt + LONGEST_WAIT_MS - now)));
}

/** Uploads anything still waiting, now. */
export function flushBakedUploads(): void {
  clearTimeout(quietTimer);
  quietTimer = undefined;
  for (const texture of waiting) texture.needsUpdate = true;
  waiting.clear();
}

/**
 * Replaces every model layer of `texture` (`side` pixels a side, layers in
 * `MODEL_SURFACE_KINDS` order) with its baked image as the images arrive.
 */
export function bakeModelArray(
  texture: Uploadable & { image: unknown },
  side: number,
  /** Fills a layer procedurally when its image cannot be had; absent when the layers already are. */
  fallback?: (layer: number) => void,
): Promise<void> {
  const data = (texture.image as { data: Uint8Array }).data;
  const apply = (kind: string, layer: number, color: Plane | null, metal: Plane | null): boolean => {
    if (!usable(color, side)) return false;
    const hasMetalness = METALNESS_LAYERS.includes(kind);
    const metalness = hasMetalness ? (usable(metal, side) ? preparePlane(metal, side) : null) : null;
    // A layer that should carry metalness but lost its plane keeps the procedural layer whole.
    if (hasMetalness && !metalness) return false;
    writeModelLayer(data, layer, side, preparePlane(color, side), metalness);
    return true;
  };
  const jobs = MODEL_SURFACE_KINDS.map((kind, layer) => {
    const colorUrl = bakedModelUrl(kind);
    const metalUrl = METALNESS_LAYERS.includes(kind) ? bakedMetalnessUrl(kind) : null;
    // Already decoded (prefetched): written before the first upload, no swap needed.
    const color = arrived.get(colorUrl) ?? null;
    if (color && (!metalUrl || arrived.has(metalUrl)) && apply(kind, layer, color, metalUrl ? arrived.get(metalUrl)! : null)) return null;
    return track((async () => {
      const [baked, metal] = await Promise.all([image(colorUrl), metalUrl ? image(metalUrl) : Promise.resolve(null)]);
      if (apply(kind, layer, baked, metal)) scheduleUpload(texture);
      else if (fallback) {
        fallback(layer);
        scheduleUpload(texture);
      }
    })().catch(() => {
      if (fallback) {
        fallback(layer);
        scheduleUpload(texture);
      }
    }));
  }).filter((job): job is Promise<void> => job !== null);
  return track(Promise.all(jobs).then(() => undefined));
}

export type GroundVariant = "color" | "relief";

interface GroundPlane {
  plane: ArrayLike<number>;
  scale: number;
}

/** The baked plane for a ground kind at `side`, or null; shared by both variants. */
const groundPlanes = new Map<string, Promise<GroundPlane | null>>();
const groundReady = new Map<string, GroundPlane>();

export function bakedGroundKind(kind: string): boolean {
  return kind in GROUND_FROM_MODEL || (BAKED_GROUND_KINDS as readonly string[]).includes(kind);
}

function groundPlane(kind: string, side: number): Promise<GroundPlane | null> | null {
  if (!bakedGroundKind(kind)) return null;
  const model = GROUND_FROM_MODEL[kind];
  const key = `${kind}:${side}`;
  let promise = groundPlanes.get(key);
  if (!promise) {
    const url = model ? bakedModelUrl(model) : bakedGroundUrl(kind);
    const build = (plane: Plane | null): GroundPlane | null => {
      if (!usable(plane, side)) return null;
      const ready = { plane: preparePlane(plane, side), scale: model ? -1 : 1 };
      groundReady.set(key, ready);
      return ready;
    };
    const early = arrived.get(url);
    promise = early ? Promise.resolve(build(early)) : track(image(url).then(build).catch(() => null));
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
  const write = (result: GroundPlane) => {
    const target = (texture.image as { data: Uint8Array }).data;
    if (variant === "color") writeGroundColor(target, result.plane, procedural.tint);
    else {
      // Model layers store an absolute roughness; the relief slot wants a multiplier.
      const scale = result.scale < 0 ? procedural.roughness / Math.max(0.05, channelMean(result.plane, 1)) : 1;
      writeGroundRelief(target, result.plane, scale);
    }
  };
  // Decoded already (prefetched): written before the texture's first upload.
  const ready = groundReady.get(`${kind}:${side}`);
  if (ready) {
    write(ready);
    return null;
  }
  return track(pending_.then((result) => {
    if (!result) return;
    write(result);
    scheduleUpload(texture);
  }).catch(() => undefined));
}

/** Forgets every cached ground plane (tests). */
export function resetBakedSurfaces(): void {
  groundPlanes.clear();
  groundReady.clear();
  flushBakedUploads();
}
