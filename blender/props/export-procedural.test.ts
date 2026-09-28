/**
 * Writes the street props and the walker to PLY, procedural and Blender side
 * by side, so `blender/props/compare.py` can render them under one light.
 * Both go through the same TypeScript path the city uses (merged parts, the
 * instance tint applied to painted vertices), so what is rendered is what the
 * city draws. Spike tooling, only when asked:
 *
 *   EXPORT_PLY=1 pnpm vitest run blender/props/export-procedural
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { BoxGeometry, Color, CylinderGeometry, type BufferGeometry } from "three";
import { test } from "vitest";
import { LAMP_POST, TREE_LEAF, WINDOW_COLOR, mix } from "@/components/city/palette";
import { PAINT_ATTRIBUTE, mergeParts, triangleCount } from "@/components/city/models/props/geometry";
import { SPECIES_LEAF, TREE_SPECIES, treeGeometry } from "@/components/city/models/props/trees";
import { furnitureGeometry, type FurnitureKind } from "@/components/city/models/props/streetFurniture";
import { walkerBodyGeometry, walkerHeadGeometry } from "@/components/city/models/props/walkerModel";

const toSrgb = (c: number) => Math.round(255 * Math.min(1, c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055));

interface Placed {
  geometry: BufferGeometry;
  /** Instance colour for painted vertices. */
  tint?: string;
  /** Plain colour for a geometry with no colour attribute. */
  color?: string;
  offset?: [number, number, number];
  /** Draw with `color` alone, as a material without vertex colours does. */
  plain?: boolean;
}

function writePly(path: string, items: Placed[]) {
  const verts: string[] = [];
  const faces: string[] = [];
  for (const { geometry, tint, color, offset = [0, 0, 0], plain: flat } of items) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    const pos = g.getAttribute("position");
    const col = flat ? undefined : g.getAttribute("color");
    const paint = g.getAttribute(PAINT_ATTRIBUTE);
    const t = new Color(tint ?? "#ffffff");
    const plain = new Color(color ?? "#ffffff");
    const base = verts.length;
    for (let i = 0; i < pos.count; i++) {
      const p = paint && paint.getX(i) > 0.5;
      const r = (col ? col.getX(i) : 1) * plain.r * (p ? t.r : 1);
      const gg = (col ? col.getY(i) : 1) * plain.g * (p ? t.g : 1);
      const b = (col ? col.getZ(i) : 1) * plain.b * (p ? t.b : 1);
      const x = pos.getX(i) + offset[0];
      const y = pos.getY(i) + offset[1];
      const z = pos.getZ(i) + offset[2];
      verts.push(`${x} ${-z} ${y} ${toSrgb(r)} ${toSrgb(gg)} ${toSrgb(b)}`);
    }
    for (let i = 0; i < pos.count; i += 3) faces.push(`3 ${base + i} ${base + i + 1} ${base + i + 2}`);
  }
  const header = ["ply", "format ascii 1.0", `element vertex ${verts.length}`, "property float x", "property float y", "property float z",
    "property uchar red", "property uchar green", "property uchar blue", `element face ${faces.length}`, "property list uchar int vertex_indices", "end_header"];
  writeFileSync(path, [...header, ...verts, ...faces].join("\n"));
}

const OUT = "blender/out/props";
const FURNITURE: FurnitureKind[] = ["bench", "bin", "stop", "bush", "bed"];

export interface PropSet {
  trees: (kind: (typeof TREE_SPECIES)[number]) => BufferGeometry;
  furniture: (kind: FurnitureKind) => BufferGeometry;
  lamp: () => { pole: BufferGeometry; head: BufferGeometry };
  walker: () => { body: BufferGeometry; head: BufferGeometry };
}

export function exportSet(prefix: string, set: PropSet) {
  mkdirSync(OUT, { recursive: true });
  const counts: string[] = [];
  for (const kind of TREE_SPECIES) {
    const g = set.trees(kind);
    counts.push(`tree ${kind} ${triangleCount(g)}`);
    writePly(`${OUT}/${prefix}-tree-${kind}.ply`, [{ geometry: g, tint: SPECIES_LEAF[kind] }]);
  }
  for (const kind of FURNITURE) {
    const g = set.furniture(kind);
    counts.push(`furniture ${kind} ${triangleCount(g)}`);
    writePly(`${OUT}/${prefix}-${kind}.ply`, [{ geometry: g }]);
  }
  const lamp = set.lamp();
  counts.push(`lamp pole ${triangleCount(lamp.pole)} head ${triangleCount(lamp.head)}`);
  writePly(`${OUT}/${prefix}-lamp.ply`, [
    { geometry: lamp.pole, color: LAMP_POST, offset: [0, 1.35, 0] },
    { geometry: lamp.head, color: mix(WINDOW_COLOR, "#ffffff", 0.3), offset: [0, 2.79, 0], plain: true },
  ]);
  const walker = set.walker();
  counts.push(`walker body ${triangleCount(walker.body)} head ${triangleCount(walker.head)}`);
  // Three people in a row, in the crowd's colours.
  const people: Placed[] = [];
  const looks: [string, string][] = [["#4d5a6b", "#e3c3a4"], ["#8c5f4d", "#a8795a"], ["#6b7f6a", "#5c4033"]];
  looks.forEach(([clothes, skin], i) => {
    people.push({ geometry: walker.body, tint: clothes, offset: [i * 0.6, 0.44, 0] });
    people.push({ geometry: walker.head, tint: skin, offset: [i * 0.6, 0.94, 0] });
  });
  writePly(`${OUT}/${prefix}-walkers.ply`, people);
  console.log(`${prefix}:\n  ${counts.join("\n  ")}`);
}

test.skipIf(!process.env.EXPORT_PLY)("export procedural props", () => {
  exportSet("proc", {
    trees: (kind) => treeGeometry(kind, 0),
    furniture: (kind) => furnitureGeometry(kind, 0),
    lamp: () => ({
      pole: new CylinderGeometry(0.07, 0.095, 2.7, 5),
      head: new BoxGeometry(0.32, 0.16, 0.32),
    }),
    walker: () => ({ body: walkerBodyGeometry(), head: walkerHeadGeometry() }),
  });
  void TREE_LEAF;
  void mergeParts;
});

import { blenderTreeGeometry } from "@/components/city/models/props/trees";
import { blenderFurnitureGeometry, blenderLampGeometry } from "@/components/city/models/props/streetFurniture";
import { blenderWalkerBodyParts, blenderWalkerHeadParts } from "@/components/city/models/props/walkerModel";

test.skipIf(!process.env.EXPORT_PLY)("export Blender props", () => {
  exportSet("blend", {
    trees: (kind) => blenderTreeGeometry(kind, 0),
    furniture: (kind) => blenderFurnitureGeometry(kind, 0),
    lamp: () => blenderLampGeometry(),
    walker: () => ({ body: mergeParts(blenderWalkerBodyParts()), head: mergeParts(blenderWalkerHeadParts()) }),
  });
});
