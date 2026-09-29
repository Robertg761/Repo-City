import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import {
  BAKED_GROUND_KINDS,
  BAKED_SIZE,
  METALNESS_LAYERS,
  bakedGroundUrl,
  bakedMetalnessUrl,
  bakedModelUrl,
  bakedSurfacesSettled,
  boxDownsample,
  channelMean,
  flipRows,
  preparePlane,
  setBakedImageSource,
  tintOf,
  writeGroundColor,
  writeGroundRelief,
  writeModelLayer,
  type Plane,
} from "./baked-surfaces";
import { MODEL_SURFACE_KINDS } from "./surface-types";
import { modelSurfaceTextureArray, surfaceReliefTexture, surfaceTexture } from "./texture-data";

const px = (data: number[]) => Uint8Array.from(data);

function solid(size: number, rgba: [number, number, number, number]): Plane {
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < data.length; i += 4) data.set(rgba, i);
  return { size, data };
}

afterEach(() => setBakedImageSource());

describe("baked pixel logic", () => {
  it("keeps the model layer order the shaders index into", () => {
    expect([...MODEL_SURFACE_KINDS]).toEqual([
      "plaster", "brick", "stone", "wood", "roof", "slate", "thatch", "metal",
      "glass", "foliage", "fabric", "concrete", "bark",
    ]);
  });

  it("averages blocks when downsampling and rejects upsampling", () => {
    // 2x2 -> 1x1
    const out = boxDownsample(px([0, 10, 20, 255, 100, 110, 120, 255, 200, 210, 220, 255, 50, 60, 70, 255]), 2, 1);
    expect([...out]).toEqual([88, 98, 108, 255]);
    expect([...boxDownsample(px([1, 2, 3, 4]), 1, 1)]).toEqual([1, 2, 3, 4]);
    expect(() => boxDownsample(new Uint8Array(4 * 4), 1, 2)).toThrow(RangeError);
    expect(() => boxDownsample(new Uint8Array(6 * 6 * 4), 6, 4)).toThrow(RangeError);
  });

  it("downsamples 4 -> 2 block by block", () => {
    const src = new Uint8Array(4 * 4 * 4);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) src[(y * 4 + x) * 4] = (x < 2 ? 0 : 200) + (y < 2 ? 0 : 40);
    const out = boxDownsample(src, 4, 2);
    expect([out[0], out[4], out[8], out[12]]).toEqual([0, 200, 40, 240]);
  });

  it("flips rows so the picture stands upright in texture space", () => {
    const data = px([1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4]);
    expect([...flipRows(data, 2)]).toEqual([3, 3, 3, 3, 4, 4, 4, 4, 1, 1, 1, 1, 2, 2, 2, 2]);
    const plane: Plane = { size: 4, data: new Uint8Array(4 * 4 * 4).fill(9) };
    expect(preparePlane(plane, 2)).toHaveLength(2 * 2 * 4);
  });

  it("writes R, G, B from the image and A from the metalness plane, one layer only", () => {
    const side = 2;
    const target = new Uint8Array(side * side * 4 * 3).fill(7);
    const baked = solid(side, [200, 100, 50, 255]).data as Uint8Array;
    const metal = solid(side, [77, 77, 77, 255]).data as Uint8Array;
    writeModelLayer(target, 1, side, baked, metal);
    const stride = side * side * 4;
    expect([...target.slice(0, 4)]).toEqual([7, 7, 7, 7]);
    expect([...target.slice(stride, stride + 4)]).toEqual([200, 100, 50, 77]);
    expect([...target.slice(stride * 2, stride * 2 + 4)]).toEqual([7, 7, 7, 7]);
    writeModelLayer(target, 1, side, baked, null);
    expect(target[stride + 3]).toBe(0);
  });

  it("measures tint and channel means", () => {
    const data = px([100, 200, 100, 255, 100, 200, 100, 255]);
    const tint = tintOf(data);
    expect(tint[0]).toBeCloseTo(0.75, 5);
    expect(tint[1]).toBeCloseTo(1.5, 5);
    expect(channelMean(data, 1)).toBeCloseTo(200 / 255, 5);
  });

  it("colours the ground from the tone and leaves the wear mask alone", () => {
    const target = px([0, 0, 0, 90, 0, 0, 0, 200]);
    writeGroundColor(target, px([100, 0, 0, 255, 250, 0, 0, 255]), [1, 0.5, 2]);
    expect([...target]).toEqual([100, 50, 200, 90, 250, 125, 255, 200]);
  });

  it("packs relief as height in R and B, roughness multiplier in G, opaque", () => {
    const target = new Uint8Array(8);
    writeGroundRelief(target, px([10, 200, 30, 255, 40, 100, 60, 255]), 0.5);
    expect([...target]).toEqual([30, 100, 30, 255, 60, 50, 60, 255]);
  });
});

describe("baked file names", () => {
  it("names one shipped JPEG per layer, kind and metalness plane", () => {
    expect(bakedModelUrl("brick")).toBe("/textures/surfaces/brick.jpg");
    expect(bakedMetalnessUrl("metal")).toBe("/textures/surfaces/metal.metalness.jpg");
    expect(bakedGroundUrl("asphalt")).toBe("/textures/ground/asphalt.jpg");
  });
});

/** Width, height and component count from a baseline or progressive JPEG's frame header. */
function sof(path: string) {
  const b = readFileSync(path);
  expect(b.readUInt16BE(0)).toBe(0xffd8);
  for (let at = 2; at < b.length; at += 2 + b.readUInt16BE(at + 2)) {
    const marker = b.readUInt16BE(at);
    if (marker === 0xffc0 || marker === 0xffc2) {
      const components = b[at + 9];
      // Every component at full resolution: chroma subsampling would bleed
      // the albedo, roughness and height channels into each other.
      const sampling = Array.from({ length: components }, (_, c) => b[at + 11 + c * 3]);
      return { width: b.readUInt16BE(at + 7), height: b.readUInt16BE(at + 5), components, sampling: new Set(sampling).size };
    }
  }
  throw new Error(`no frame header in ${path}`);
}

describe("shipped images", () => {
  const publicPath = (url: string) => `public${url}`;
  const rgb = { width: BAKED_SIZE, height: BAKED_SIZE, components: 3, sampling: 1 };
  it("has every model layer as full-chroma RGB, and the metalness plane", () => {
    for (const kind of MODEL_SURFACE_KINDS) expect(sof(publicPath(bakedModelUrl(kind)))).toEqual(rgb);
    for (const kind of METALNESS_LAYERS) {
      expect(sof(publicPath(bakedMetalnessUrl(kind)))).toEqual({ ...rgb, components: 1 });
    }
  });

  it("has every baked ground kind", () => {
    for (const kind of BAKED_GROUND_KINDS) expect(sof(publicPath(bakedGroundUrl(kind)))).toEqual(rgb);
  });
});

describe("non-blocking replacement", () => {
  it("builds procedurally first, swaps each layer as its image arrives, and keeps layers whose image fails", async () => {
    // A side no other test uses, so the array is built fresh here.
    const requested: string[] = [];
    setBakedImageSource(async (url) => {
      requested.push(url);
      if (url.includes("/brick")) return null;
      if (url.includes("/stone")) throw new Error("network");
      if (url.includes("metalness")) return solid(512, [90, 90, 90, 255]);
      return solid(512, [200, 120, 60, 255]);
    });
    const texture = modelSurfaceTextureArray(32);
    const stride = 32 * 32 * 4;
    const before = (texture.image.data as Uint8Array).slice();
    const version = texture.version;
    // Nothing waited: the procedural data is in place already.
    expect(before.length).toBe(stride * MODEL_SURFACE_KINDS.length);
    await bakedSurfacesSettled();
    const after = texture.image.data as Uint8Array;
    const layer = (kind: string) => MODEL_SURFACE_KINDS.indexOf(kind as (typeof MODEL_SURFACE_KINDS)[number]);
    const at = (kind: string, i = 0) => [...after.slice(layer(kind) * stride + i, layer(kind) * stride + i + 4)];
    expect(at("plaster")).toEqual([200, 120, 60, 0]);
    expect(at("metal")).toEqual([200, 120, 60, 90]);
    expect(at("bark")).toEqual([200, 120, 60, 0]);
    // The two failures are byte-identical to the procedural layers.
    for (const kind of ["brick", "stone"]) {
      const a = after.slice(layer(kind) * stride, (layer(kind) + 1) * stride);
      const b = before.slice(layer(kind) * stride, (layer(kind) + 1) * stride);
      expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
    }
    expect(texture.version).toBeGreaterThan(version);
    expect(texture.image.data).toBe(after);
    expect(requested).toContain("/textures/surfaces/plaster.jpg");
  });

  it("keeps the whole metal layer when its metalness plane is missing", async () => {
    setBakedImageSource(async (url) => (url.includes("metalness") ? null : solid(512, [200, 120, 60, 255])));
    const texture = modelSurfaceTextureArray(16);
    const stride = 16 * 16 * 4;
    const before = (texture.image.data as Uint8Array).slice(7 * stride, 8 * stride);
    await bakedSurfacesSettled();
    const after = (texture.image.data as Uint8Array).slice(7 * stride, 8 * stride);
    expect(Buffer.from(after).equals(Buffer.from(before))).toBe(true);
  });

  it("replaces ground colour and relief in place, keeping asphalt's wear mask", async () => {
    // Asphalt's baked tone is a flat 128, height 200, roughness 180.
    setBakedImageSource(async (url) => (url.includes("/asphalt") ? solid(512, [128, 180, 200, 255]) : null));
    const color = surfaceTexture("asphalt", 64);
    const relief = surfaceReliefTexture("asphalt", 64);
    const colorData = color.image.data as Uint8Array;
    const alphaBefore = colorData.filter((_, i) => i % 4 === 3);
    const image = color.image;
    await bakedSurfacesSettled();
    expect(color.image).toBe(image);
    expect([colorData[0], colorData[1], colorData[2]].every((v) => Math.abs(v - 128) <= 1)).toBe(true);
    expect(Buffer.from(colorData.filter((_, i) => i % 4 === 3)).equals(Buffer.from(alphaBefore))).toBe(true);
    const r = relief.image.data as Uint8Array;
    expect([...r.slice(0, 4)]).toEqual([200, 180, 200, 255]);
  });

  it("leaves an unbaked kind alone", async () => {
    setBakedImageSource(async () => solid(512, [1, 2, 3, 255]));
    const t = surfaceTexture("facade", 32);
    const before = (t.image.data as Uint8Array).slice();
    await bakedSurfacesSettled();
    expect(Buffer.from(t.image.data as Uint8Array).equals(Buffer.from(before))).toBe(true);
  });
});
