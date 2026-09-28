/**
 * Writes the construction sites and incident scenes, procedural and with the
 * Blender models on, to PLYs so Blender can render them side by side under
 * the same light (`blender/stage.py`). Spike tooling, not a unit test, so it
 * only runs when asked:
 *
 *   EXPORT_PLY=1 pnpm vitest run blender/incidents2/export-procedural
 *
 * Then, for example:
 *
 *   blender -b --python blender/stage.py -- blender/out/incidents2/site-active \
 *     blender/out/incidents2/procedural-site-active.ply blender/out/incidents2/blender-site-active.ply
 */
import { mkdirSync, writeFileSync } from "node:fs";
import type { BufferGeometry } from "three";
import { test, vi } from "vitest";
import type { ConstructionState, IncidentState } from "@/types/analysis";

const OUT = "blender/out/incidents2";
const SITES: ConstructionState[] = ["active", "slow", "abandoned", "completed"];
const INCIDENTS: IncidentState[] = ["minor", "collision", "stale", "major"];
const toSrgb = (c: number) =>
  Math.round(255 * Math.min(1, c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055));

function writePly(geometry: BufferGeometry, name: string) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  const pos = g.getAttribute("position");
  const col = g.getAttribute("color");
  const n = pos.count;
  const lines = ["ply", "format ascii 1.0", `element vertex ${n}`, "property float x", "property float y", "property float z",
    "property uchar red", "property uchar green", "property uchar blue", `element face ${n / 3}`,
    "property list uchar int vertex_indices", "end_header"];
  for (let i = 0; i < n; i++) {
    const [r, gg, b] = col ? [col.getX(i), col.getY(i), col.getZ(i)] : [0.8, 0.8, 0.8];
    // three (x, y up, +z forward) -> Blender (x, -z, y).
    lines.push(`${pos.getX(i)} ${-pos.getZ(i)} ${pos.getY(i)} ${toSrgb(r)} ${toSrgb(gg)} ${toSrgb(b)}`);
  }
  for (let i = 0; i < n; i += 3) lines.push(`3 ${i} ${i + 1} ${i + 2}`);
  writeFileSync(`${OUT}/${name}.ply`, lines.join("\n"));
  console.log(name, "triangles", n / 3);
}

test.skipIf(!process.env.EXPORT_PLY)("export procedural and Blender sites and incidents", async () => {
  mkdirSync(OUT, { recursive: true });
  for (const flag of [false, true]) {
    vi.resetModules();
    vi.doMock("@/components/city/models/modelSource", () => ({ BLENDER_MODELS: flag }));
    vi.doMock("../modelSource", () => ({ BLENDER_MODELS: flag }));
    const prefix = flag ? "blender" : "procedural";
    const site = await import("@/components/city/models/props/constructionDecor");
    const incidents = await import("@/components/city/models/props/incidentDecor");
    for (const state of SITES) writePly(site.constructionDecor(state, 0.2), `${prefix}-site-${state}`);
    for (const state of INCIDENTS) writePly(incidents.incidentDecor(state, 0, 0.2).geometry, `${prefix}-incident-${state}`);
  }
});
