/**
 * Writes the city archetypes and the metropolis towers to PLY, procedural and
 * Blender variants both, stretched to a representative instance size and
 * painted in one building colour the way the instanced mesh paints them, so
 * `bstage.py` can render them side by side under the same light. Spike
 * tooling, not a unit test, so it only runs when asked:
 * `EXPORT_PLY=1 pnpm vitest run blender/buildings/export-procedural`.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { Color } from "three";
import { test } from "vitest";
import type { MeshDraft } from "@/components/city/models/buildings/mesh";
import { archetypeModel, blenderArchetypeModel, BLENDER_ARCHETYPES } from "@/components/city/models/buildings/models";
import type { ModelKey } from "@/components/city/models/buildings/archetypes";
import { BUILDING_COLORS } from "@/components/city/palette";

const toSrgb = (c: number) => Math.round(255 * Math.min(1, c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055));

/** A typical instance of each shape: its tier's footprint and height (lib/city/generator.ts). */
export const SIZES: Record<string, [number, number, number]> = {
  house: [4.4, 4.2, 4.4],
  "lowrise-parapet": [5.2, 5.6, 5.2],
  "lowrise-pitched": [5, 7, 5],
  "warehouse-sawtooth": [6.5, 5, 6.5],
  "midrise-setback": [5.5, 12, 5.5],
  "midrise-mech": [5.5, 14, 5.5],
  "tower-stepped": [6, 19, 6],
  "tower-crown": [6, 23, 6],
  "tower-glass": [6.5, 20, 6.5],
  "tower-twin": [7.5, 28, 7.5],
  "tower-spire": [7.5, 34, 7.5],
};

function ply(draft: MeshDraft, size: readonly number[], hex: string, path: string): number {
  const tint = new Color(hex);
  const verts: string[] = [];
  const faces: string[] = [];
  const p = draft.positions;
  const c = draft.colors;
  for (let t = 0; t < draft.indices.length; t += 3) {
    const base = verts.length;
    for (let k = 0; k < 3; k++) {
      const i = draft.indices[t + k];
      const x = p[i * 3] * size[0];
      const y = p[i * 3 + 1] * size[1];
      const z = p[i * 3 + 2] * size[2];
      verts.push(`${x} ${-z} ${y} ${toSrgb(c[i * 3] * tint.r)} ${toSrgb(c[i * 3 + 1] * tint.g)} ${toSrgb(c[i * 3 + 2] * tint.b)}`);
    }
    faces.push(`3 ${base} ${base + 1} ${base + 2}`);
  }
  const header = ["ply", "format ascii 1.0", `element vertex ${verts.length}`, "property float x", "property float y", "property float z",
    "property uchar red", "property uchar green", "property uchar blue", `element face ${faces.length}`, "property list uchar int vertex_indices", "end_header"];
  writeFileSync(path, [...header, ...verts, ...faces].join("\n"));
  return faces.length;
}

test.skipIf(!process.env.EXPORT_PLY)("export the city archetypes, procedural and Blender", () => {
  mkdirSync("blender/out/buildings", { recursive: true });
  const colour = process.env.TINT ?? BUILDING_COLORS[0];
  for (const [id, size] of Object.entries(SIZES)) {
    const key = id as ModelKey;
    const proc = ply(archetypeModel(key).draft, size, colour, `blender/out/buildings/proc-${id}.ply`);
    let line = `${id}: procedural ${proc}`;
    if (key in BLENDER_ARCHETYPES) {
      const model = blenderArchetypeModel(key);
      const n = ply(model.draft, size, colour, `blender/out/buildings/bl-${id}.ply`);
      line += ` blender ${n} windows ${archetypeModel(key).windows.length}/${model.windows.length}`;
    }
    console.log(line);
  }
});
