/**
 * Writes the civic buildings to PLYs, procedural and kit-built, so Blender can
 * render them side by side under the same light. The kit build is assembled
 * in TypeScript (`civic.ts`), so this is the only way to see it outside the
 * app. Spike tooling, only when asked:
 * `EXPORT_PLY=1 pnpm vitest run blender/civic/export-civic`.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { Color } from "three";
import { test } from "vitest";
import { buildCivic, type CivicPalette } from "@/components/city/models/buildings/civic";
import type { MeshDraft, Rgb3 } from "@/components/city/models/buildings/mesh";
import { CIVIC_COLOR, CIVIC_ROOF, HAZARD_RED, WINDOW_COLOR, mix } from "@/components/city/palette";

const rgb = (hex: string): Rgb3 => {
  const c = new Color(hex);
  return [c.r, c.g, c.b];
};

/** `civicPalette(0)` in `Building.tsx`. */
const PALETTE: CivicPalette = {
  wall: rgb(CIVIC_COLOR),
  stone: rgb("#f4f1e8"),
  roof: rgb(CIVIC_ROOF),
  accent: rgb("#7fa9bd"),
  trim: rgb(mix(CIVIC_COLOR, "#ffffff", 0.5)),
  door: rgb("#5a5347"),
  window: rgb("#4a5560"),
  metal: rgb("#9aa0a0"),
  flag: rgb(mix(HAZARD_RED, "#e8853c", 0.35)),
  containers: [rgb("#4a86a8"), rgb("#b4693f"), rgb("#6f8f6a")],
};

const toSrgb = (c: number) => Math.round(255 * Math.min(1, c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055));

function ply(drafts: { draft: MeshDraft; tint?: Rgb3 }[], path: string): number {
  const verts: string[] = [];
  const faces: string[] = [];
  for (const { draft, tint } of drafts) {
    const base = verts.length;
    for (let i = 0; i < draft.positions.length; i += 3) {
      const [r, g, b] = tint ?? [draft.colors[i], draft.colors[i + 1], draft.colors[i + 2]];
      // three (x, y, z) with y up and +z forward -> Blender (x, -z, y).
      verts.push(`${draft.positions[i]} ${-draft.positions[i + 2]} ${draft.positions[i + 1]} ${toSrgb(r)} ${toSrgb(g)} ${toSrgb(b)}`);
    }
    for (let i = 0; i < draft.indices.length; i += 3) {
      faces.push(`3 ${base + draft.indices[i]} ${base + draft.indices[i + 1]} ${base + draft.indices[i + 2]}`);
    }
  }
  const header = ["ply", "format ascii 1.0", `element vertex ${verts.length}`, "property float x", "property float y", "property float z",
    "property uchar red", "property uchar green", "property uchar blue", `element face ${faces.length}`, "property list uchar int vertex_indices", "end_header"];
  writeFileSync(path, [...header, ...verts, ...faces].join("\n"));
  return faces.length;
}

const KINDS = ["readme", "manifest", "changelog", "contributing", "dockerfile"] as const;
const PLOTS = { std: { w: 7, h: 9.8, d: 7 }, small: { w: 3.4, h: 4.2, d: 3.4 }, low: { w: 8, h: 6, d: 8 } };

test.skipIf(!process.env.EXPORT_PLY)("export the civic buildings", () => {
  mkdirSync("blender/out/civic", { recursive: true });
  const glass = rgb(WINDOW_COLOR);
  for (const [size, plot] of Object.entries(PLOTS)) {
    for (const kind of KINDS) {
      for (const models of ["procedural", "blender"] as const) {
        const { body, glow } = buildCivic(kind, plot, PALETTE, { models });
        const n = ply([{ draft: body }, { draft: glow, tint: glass }], `blender/out/civic/${models === "blender" ? "kit" : "proc"}-${kind}-${size}.ply`);
        console.log(`${size} ${kind} ${models}: ${body.indices.length / 3} body, ${n} with glass`);
      }
    }
  }
});
