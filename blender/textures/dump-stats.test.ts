/**
 * Writes the procedural surface statistics the Blender bake matches (mean tone,
 * roughness, tint) so the baked library keeps the palette. Tooling, not a unit
 * test: `DUMP_TEXTURE_STATS=1 pnpm vitest run blender/textures/dump-stats`.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { test } from "vitest";
import { surfaceModelTexture, surfaceReliefTexture, surfaceTexture, type SurfaceKind } from "@/components/city/textures/texture-data";
import { MODEL_SURFACE_KINDS } from "@/components/city/textures/surface-types";

function stats(data: Uint8Array) {
  const n = data.length / 4;
  const mean = [0, 0, 0, 0];
  for (let i = 0; i < data.length; i += 4) for (let c = 0; c < 4; c++) mean[c] += data[i + c] / 255 / n;
  const std = [0, 0, 0, 0];
  for (let i = 0; i < data.length; i += 4) for (let c = 0; c < 4; c++) std[c] += (data[i + c] / 255 - mean[c]) ** 2 / n;
  return { mean, std: std.map(Math.sqrt) };
}

const GROUND: SurfaceKind[] = ["lawn", "turf", "meadow", "asphalt", "pavers", "gravel", "ground", "setts", "concrete", "soil"];

test.skipIf(!process.env.DUMP_TEXTURE_STATS)("dump procedural texture statistics", () => {
  const out: Record<string, unknown> = { model: {}, ground: {} };
  for (const kind of MODEL_SURFACE_KINDS) (out.model as Record<string, unknown>)[kind] = stats(surfaceModelTexture(kind as SurfaceKind, 256).image.data as Uint8Array);
  for (const kind of GROUND) {
    (out.ground as Record<string, unknown>)[kind] = {
      color: stats(surfaceTexture(kind, 256).image.data as Uint8Array),
      relief: stats(surfaceReliefTexture(kind, 256).image.data as Uint8Array),
    };
  }
  writeFileSync("blender/textures/procedural-stats.json", JSON.stringify(out, (k, v) => (typeof v === "number" ? Math.round(v * 10000) / 10000 : v), 1));
});

/**
 * The procedural layers as raw 512 px RGBA, for the comparison renders:
 * `DUMP_PROCEDURAL=1 pnpm vitest run blender/textures/dump-stats`.
 */
test.skipIf(!process.env.DUMP_PROCEDURAL)("dump procedural layers", () => {
  mkdirSync("blender/out/textures/procedural", { recursive: true });
  for (const kind of MODEL_SURFACE_KINDS) {
    writeFileSync(`blender/out/textures/procedural/${kind}.raw`, surfaceModelTexture(kind as SurfaceKind, 512).image.data as Uint8Array);
  }
  for (const kind of GROUND) {
    // Packed like the baked ground layers: tone, roughness multiplier, height.
    const color = surfaceTexture(kind, 512).image.data as Uint8Array;
    const relief = surfaceReliefTexture(kind, 512).image.data as Uint8Array;
    const out = new Uint8Array(color.length);
    for (let i = 0; i < out.length; i += 4) {
      out[i] = Math.round((color[i] + color[i + 1] + color[i + 2]) / 3);
      out[i + 1] = relief[i + 1];
      out[i + 2] = relief[i];
      out[i + 3] = 255;
    }
    writeFileSync(`blender/out/textures/procedural/g-${kind}.raw`, out);
  }
});
