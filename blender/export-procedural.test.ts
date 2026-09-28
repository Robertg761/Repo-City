/**
 * Writes the procedural fire engine to a PLY so Blender can render it beside
 * the modelled one under the same light. Spike tooling, not a unit test, so it
 * only runs when asked: `EXPORT_PLY=1 pnpm vitest run blender/export-procedural`.
 */
import { writeFileSync } from "node:fs";
import { test } from "vitest";
import { mergeParts } from "@/components/city/models/props/geometry";
import { emergencyParts } from "@/components/city/models/vehicles/emergency";

const toSrgb = (c: number) => Math.round(255 * Math.min(1, c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055));

test.skipIf(!process.env.EXPORT_PLY)("export procedural fire engine", () => {
  const g = mergeParts(emergencyParts("fire", 0.2, 0));
  const pos = g.getAttribute("position");
  const col = g.getAttribute("color");
  const n = pos.count;
  const lines = ["ply", "format ascii 1.0", `element vertex ${n}`, "property float x", "property float y", "property float z",
    "property uchar red", "property uchar green", "property uchar blue", `element face ${n / 3}`, "property list uchar int vertex_indices", "end_header"];
  for (let i = 0; i < n; i++) {
    // three (x, y, z) with y up and +z forward -> Blender (x, -z, y), nose to -Y.
    lines.push(`${pos.getX(i)} ${-pos.getZ(i)} ${pos.getY(i)} ${toSrgb(col.getX(i))} ${toSrgb(col.getY(i))} ${toSrgb(col.getZ(i))}`);
  }
  for (let i = 0; i < n; i += 3) lines.push(`3 ${i} ${i + 1} ${i + 2}`);
  writeFileSync("blender/out/procedural-fire.ply", lines.join("\n"));
  console.log("triangles", n / 3);
});

// The fire station's slots in the colours `Landmark.tsx` gives them.
import { fireStation } from "@/components/city/models/landmarks/fire";
import { CIVIC_COLOR, CONCRETE, HAZARD_RED, WINDOW_COLOR, mix } from "@/components/city/palette";
import { Color } from "three";

const SLOT_COLORS: Record<string, string> = {
  deck: mix(CONCRETE, "#7f8683", 0.55),
  wall: mix(CIVIC_COLOR, "#ffffff", 0.45),
  red: mix(HAZARD_RED, "#e05540", 0.5),
  trim: mix(CIVIC_COLOR, "#ffffff", 0.75),
  steel: "#414950",
  glass: WINDOW_COLOR,
};

test.skipIf(!process.env.EXPORT_PLY)("export procedural fire stations", () => {
  for (const level of [1, 2, 3]) {
    const { slots } = fireStation(level);
    const verts: string[] = [];
    const faces: string[] = [];
    for (const [slot, geometry] of Object.entries(slots)) {
      if (!geometry) continue;
      const g = geometry.index ? geometry.toNonIndexed() : geometry;
      const pos = g.getAttribute("position");
      const c = new Color(SLOT_COLORS[slot] ?? "#ff00ff");
      const base = verts.length;
      for (let i = 0; i < pos.count; i++) {
        verts.push(`${pos.getX(i)} ${-pos.getZ(i)} ${pos.getY(i)} ${toSrgb(c.r)} ${toSrgb(c.g)} ${toSrgb(c.b)}`);
      }
      for (let i = 0; i < pos.count; i += 3) faces.push(`3 ${base + i} ${base + i + 1} ${base + i + 2}`);
    }
    const header = ["ply", "format ascii 1.0", `element vertex ${verts.length}`, "property float x", "property float y", "property float z",
      "property uchar red", "property uchar green", "property uchar blue", `element face ${faces.length}`, "property list uchar int vertex_indices", "end_header"];
    writeFileSync(`blender/out/procedural-station-${level}.ply`, [...header, ...verts, ...faces].join("\n"));
    console.log(`station ${level}: ${faces.length} triangles`);
  }
});
