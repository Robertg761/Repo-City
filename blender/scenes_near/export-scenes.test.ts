/**
 * Writes the whole construction sites, incident scenes, finished houses and
 * emergency vehicles, lean and near, as the app's own builders merge them, to
 * PLYs so Blender can render each beside its other level under one light.
 * Tooling, not a unit test, so it only runs when asked:
 *
 *   EXPORT_PLY=1 pnpm vitest run blender/scenes_near/export-scenes
 *   blender -b -t 2 --python <a stage script> -- blender/out/scenes/x blender/out/scenes/lean-site-active.ply blender/out/scenes/near-site-active.ply
 *
 * (`blender/stage.py` takes PLYs as sources and lays them out left to right.)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { BoxGeometry, Matrix4, Vector3, type BufferGeometry } from "three";
import { test, vi } from "vitest";
import type { ConstructionState, IncidentState } from "@/types/analysis";

const OUT = "blender/out/scenes";
const toSrgb = (c: number) =>
  Math.round(255 * Math.min(1, c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055));

/** One PLY of several geometries, each placed by its matrix. */
function writePly(pieces: [BufferGeometry, Matrix4?][] | BufferGeometry, name: string) {
  const list = Array.isArray(pieces) ? pieces : ([[pieces]] as [BufferGeometry, Matrix4?][]);
  const verts: string[] = [];
  const at = new Vector3();
  for (const [geometry, matrix] of list) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    const pos = g.getAttribute("position");
    const col = g.getAttribute("color");
    for (let i = 0; i < pos.count; i++) {
      at.set(pos.getX(i), pos.getY(i), pos.getZ(i));
      if (matrix) at.applyMatrix4(matrix);
      // three (x, y up, +z forward) -> Blender (x, -z, y).
      const [r, gg, b] = col ? [col.getX(i), col.getY(i), col.getZ(i)] : [0.8, 0.8, 0.8];
      verts.push(`${at.x} ${-at.z} ${at.y} ${toSrgb(r)} ${toSrgb(gg)} ${toSrgb(b)}`);
    }
  }
  const n = verts.length;
  const lines = ["ply", "format ascii 1.0", `element vertex ${n}`, "property float x", "property float y", "property float z",
    "property uchar red", "property uchar green", "property uchar blue", `element face ${n / 3}`,
    "property list uchar int vertex_indices", "end_header", ...verts];
  for (let i = 0; i < n; i += 3) lines.push(`3 ${i} ${i + 1} ${i + 2}`);
  writeFileSync(`${OUT}/${name}.ply`, lines.join("\n"));
  console.log(name, "triangles", n / 3);
}

test.skipIf(!process.env.EXPORT_PLY)("export the scenes at both levels", async () => {
  mkdirSync(OUT, { recursive: true });
  vi.resetModules();
  vi.doMock("@/components/city/models/modelSource", () => ({ BLENDER_MODELS: true }));
  const { mergeParts } = await import("@/components/city/models/props/geometry");
  const site = await import("@/components/city/models/props/constructionDecor");
  const incidents = await import("@/components/city/models/props/incidentDecor");
  const finished = await import("@/components/city/models/props/finishedHouse");
  const emergency = await import("@/components/city/models/vehicles/emergency");
  const levels = ["lean", "near"] as const;

  for (const level of levels) {
    for (const state of ["active", "slow", "abandoned", "completed"] as ConstructionState[]) {
      const pieces: [BufferGeometry, Matrix4?][] = [[site.constructionDecor(state, 0.2, level)]];
      if (state !== "completed") {
        const lean = state === "abandoned" ? 0.09 : 0;
        const at = new Vector3(-site.SITE * 0.32, 0, -site.SITE * 0.3);
        const base = new Matrix4().makeTranslation(at.x, at.y, at.z).multiply(new Matrix4().makeRotationZ(lean));
        pieces.push([site.craneMastGeometry(state, 0.2, level), base]);
        pieces.push([site.craneJibGeometry(state, 0.2, level), base.clone().multiply(new Matrix4().makeTranslation(0, 12.6, 0)).multiply(new Matrix4().makeRotationY(0.9))]);
      }
      // The shell the site builds, as its unit box scaled to the state's height.
      const shell = new BoxGeometry(1, 1, 1);
      pieces.push([shell, new Matrix4().makeTranslation(site.SITE * 0.12, site.SHELL_HEIGHT[state] / 2, site.SITE * 0.1).multiply(new Matrix4().makeScale(5.4, site.SHELL_HEIGHT[state], 5.4))]);
      writePly(pieces, `${level}-site-${state}`);
    }
    for (const state of ["minor", "collision", "stale", "major"] as IncidentState[]) {
      writePly(incidents.incidentDecor(state, 0, 0.2, level).geometry, `${level}-incident-${state}`);
    }
    for (const tier of ["village", "town"] as const) {
      const spec = finished.FINISHED[tier];
      writePly([
        [finished.finishedDressingGeometry(tier, 0.2, level)],
        [finished.finishedHouseGeometry(tier, 0.2, level), new Matrix4().makeTranslation(0, 0.04, -spec.setBack).multiply(new Matrix4().makeScale(spec.footprint[0], spec.height, spec.footprint[1]))],
      ], `${level}-finished-${tier}`);
    }
    const { atLevel } = await import("@/components/city/models/detailLevel");
    for (const kind of ["police", "ambulance", "tow", "works", "fire"] as const) {
      writePly(atLevel(level, () => mergeParts(emergency.emergencyParts(kind, 0.2, 0.6))), `${level}-vehicle-${kind}`);
    }
  }
});
