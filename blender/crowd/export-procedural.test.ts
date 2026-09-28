/**
 * Writes the crowd forms to PLY, procedural and Blender, with each form's
 * first paint in its painted panels and every optional part switched on, so
 * `blender/props/compare.py` can render them side by side. Spike tooling:
 *
 *   EXPORT_PLY=1 pnpm vitest run blender/crowd/export-procedural
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { Color, type BufferGeometry } from "three";
import { test } from "vitest";
import {
  BLENDER_FORM_NODE,
  CROWD_ATTRIBUTE,
  FORM_PAINT,
  PART,
  blenderFormGeometry,
  formGeometry,
  hoardingPlotGeometry,
  type CrowdMesh,
} from "@/components/city/backlog/forms";
import { triangleCount } from "@/components/city/models/props/geometry";

const toSrgb = (c: number) => Math.round(255 * Math.min(1, c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055));

function writePly(path: string, geometry: BufferGeometry, form: CrowdMesh) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  const pos = g.getAttribute("position");
  const col = g.getAttribute("color");
  const crowd = g.getAttribute(CROWD_ATTRIBUTE);
  const paints = FORM_PAINT[form];
  const a = new Color(paints?.a[0] ?? "#ffffff");
  const b = new Color(paints?.b?.[1] ?? "#ffffff");
  const lines: string[] = [];
  for (let i = 0; i < pos.count; i++) {
    let r = col.getX(i);
    let gg = col.getY(i);
    let bb = col.getZ(i);
    if (crowd.getX(i) === PART.body && crowd.getY(i) > 0.5) {
      const p = crowd.getY(i) < 1.5 ? a : b;
      r *= p.r;
      gg *= p.g;
      bb *= p.b;
    }
    lines.push(`${pos.getX(i)} ${-pos.getZ(i)} ${pos.getY(i)} ${toSrgb(r)} ${toSrgb(gg)} ${toSrgb(bb)}`);
  }
  const faces: string[] = [];
  for (let i = 0; i < pos.count; i += 3) faces.push(`3 ${i} ${i + 1} ${i + 2}`);
  const header = ["ply", "format ascii 1.0", `element vertex ${pos.count}`, "property float x", "property float y", "property float z",
    "property uchar red", "property uchar green", "property uchar blue", `element face ${faces.length}`, "property list uchar int vertex_indices", "end_header"];
  writeFileSync(path, [...header, ...lines, ...faces].join("\n"));
}

test.skipIf(!process.env.EXPORT_PLY)("export crowd forms", () => {
  mkdirSync("blender/out/crowd", { recursive: true });
  for (const form of Object.keys(BLENDER_FORM_NODE) as CrowdMesh[]) {
    const proc = formGeometry(form);
    const blend = blenderFormGeometry(form);
    writePly(`blender/out/crowd/proc-${form}.ply`, proc, form);
    writePly(`blender/out/crowd/blend-${form}.ply`, blend, form);
    console.log(`${form}: procedural ${triangleCount(proc)}, Blender ${triangleCount(blend)}`);
  }
  // A 6 x 4 plot: the procedural hoarding stretched to it, the kit built to it.
  const stretched = formGeometry("hoarding").clone();
  stretched.scale(6 / 2.8, 1, 4 / 2.8);
  const built = hoardingPlotGeometry(6, 4);
  writePly("blender/out/crowd/proc-hoarding-6x4.ply", stretched, "hoarding");
  writePly("blender/out/crowd/blend-hoarding-6x4.ply", built, "hoarding");
  console.log(`hoarding 6x4: procedural ${triangleCount(stretched)}, Blender ${triangleCount(built)}`);
});
