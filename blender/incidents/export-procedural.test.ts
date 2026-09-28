/**
 * Writes the procedural incident vehicles, incident scenes and construction
 * props to PLYs so Blender can render them beside the modelled ones under the
 * same light. Spike tooling, not a unit test, so it only runs when asked:
 * `EXPORT_PLY=1 pnpm vitest run blender/incidents/export-procedural`.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import type { BufferGeometry } from "three";
import { test, vi } from "vitest";
import type { ConstructionState, IncidentState } from "@/types/analysis";
import { mergeParts } from "@/components/city/models/props/geometry";
import { emergencyParts, type EmergencyKind } from "@/components/city/models/vehicles/emergency";
import { incidentDecor } from "@/components/city/models/props/incidentDecor";
import {
  constructionDecor,
  craneJibGeometry,
  craneMastGeometry,
} from "@/components/city/models/props/constructionDecor";
import { finishedDressingGeometry } from "@/components/city/models/props/finishedHouse";

const OUT = "blender/out/incidents";
const toSrgb = (c: number) =>
  Math.round(255 * Math.min(1, c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055));

function writePly(geometry: BufferGeometry, name: string, lift = 0) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  const pos = g.getAttribute("position");
  const col = g.getAttribute("color");
  const n = pos.count;
  const lines = ["ply", "format ascii 1.0", `element vertex ${n}`, "property float x", "property float y", "property float z",
    "property uchar red", "property uchar green", "property uchar blue", `element face ${n / 3}`,
    "property list uchar int vertex_indices", "end_header"];
  for (let i = 0; i < n; i++) {
    // three (x, y up, +z forward) -> Blender (x, -z, y).
    const [r, gg, b] = col ? [col.getX(i), col.getY(i), col.getZ(i)] : [0.8, 0.8, 0.8];
    lines.push(`${pos.getX(i)} ${-pos.getZ(i)} ${pos.getY(i) + lift} ${toSrgb(r)} ${toSrgb(gg)} ${toSrgb(b)}`);
  }
  for (let i = 0; i < n; i += 3) lines.push(`3 ${i} ${i + 1} ${i + 2}`);
  writeFileSync(`${OUT}/${name}.ply`, lines.join("\n"));
  console.log(name, "triangles", n / 3);
}

test.skipIf(!process.env.EXPORT_PLY)("export procedural incident models", () => {
  mkdirSync(OUT, { recursive: true });
  for (const kind of ["police", "ambulance", "tow", "works", "fire"] as EmergencyKind[]) {
    writePly(mergeParts(emergencyParts(kind, 0.2, 0)), `procedural-${kind}`);
  }
  for (const state of ["minor", "collision", "stale", "major"] as IncidentState[]) {
    writePly(incidentDecor(state, 0, 0.2).geometry, `procedural-incident-${state}`);
  }
  for (const state of ["active", "slow", "abandoned", "completed"] as ConstructionState[]) {
    writePly(constructionDecor(state, 0.2), `procedural-site-${state}`);
  }
  writePly(finishedDressingGeometry("village", 0.2), "procedural-dressing-village");
  writePly(finishedDressingGeometry("town", 0.2), "procedural-dressing-town");
  writePly(craneMastGeometry("active", 0.2), "procedural-crane-mast");
  writePly(craneJibGeometry("active", 0.2), "procedural-crane-jib", 12.6);
});

/**
 * The same sites and scenes with `?models=blender` on, merged by the app's own
 * builders, so a whole state can be rendered beside its procedural twin.
 */
test.skipIf(!process.env.EXPORT_PLY)("export blender construction sites and incidents", async () => {
  vi.resetModules();
  vi.doMock("@/components/city/models/modelSource", () => ({ BLENDER_MODELS: true }));
  const site = await import("@/components/city/models/props/constructionDecor");
  const incidents = await import("@/components/city/models/props/incidentDecor");
  for (const state of ["active", "slow", "abandoned"] as ConstructionState[]) {
    writePly(site.constructionDecor(state, 0.2), `blender-site-${state}`);
  }
  for (const state of ["minor", "stale", "major"] as IncidentState[]) {
    writePly(incidents.incidentDecor(state, 0, 0.2).geometry, `blender-incident-${state}`);
  }
});
