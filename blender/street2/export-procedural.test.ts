/**
 * Writes the street2 set to PLY, procedural and Blender side by side, so
 * `blender/props/compare.py` can render them under one light: the bus stop, a
 * rooftop with its equipment, and a small farm (fields, rows, hedges, bales)
 * laid out the way `Fields.tsx` and `Buildings.tsx` lay them out. Both go
 * through the same TypeScript path the city uses. Spike tooling, only when asked:
 *
 *   EXPORT_PLY=1 pnpm vitest run blender/street2/export-procedural
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { BoxGeometry, Color, Euler, Matrix4, Quaternion, Vector3, type BufferGeometry } from "three";
import { test } from "vitest";
import { triangleCount } from "@/components/city/models/props/geometry";
import { blenderFurnitureGeometry, furnitureGeometry } from "@/components/city/models/props/streetFurniture";
import { blenderPropBlockGeometry, blenderPropTankGeometry, propBlockGeometry, propTankGeometry } from "@/components/city/models/buildings/geometry";
import {
  CROP_GROUND,
  CROP_ROW,
  CROP_ROWS,
  baleGeometry,
  blenderFarmGeometry,
  groundGeometry,
  hedgeGeometry,
  planFarmland,
  rowGeometry,
  type Crop,
} from "@/components/city/models/buildings/farmland";
import { desaturate, mix } from "@/components/city/palette";

const toSrgb = (c: number) => Math.round(255 * Math.min(1, c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055));
const OUT = "blender/out/street2";

interface Instance {
  geometry: BufferGeometry;
  position: [number, number, number];
  yaw?: number;
  scale?: [number, number, number];
  /** The instance colour the material multiplies in. */
  tint?: string;
}

function writePly(path: string, instances: Instance[]) {
  const verts: string[] = [];
  const faces: string[] = [];
  const v = new Vector3();
  for (const { geometry, position, yaw = 0, scale = [1, 1, 1], tint = "#ffffff" } of instances) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    const pos = g.getAttribute("position");
    const col = g.getAttribute("color");
    const t = new Color(tint);
    const m = new Matrix4().compose(new Vector3(...position), new Quaternion().setFromEuler(new Euler(0, yaw, 0)), new Vector3(...scale));
    const base = verts.length;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m);
      const r = (col ? col.getX(i) : 1) * t.r;
      const gg = (col ? col.getY(i) : 1) * t.g;
      const b = (col ? col.getZ(i) : 1) * t.b;
      verts.push(`${v.x} ${-v.z} ${v.y} ${toSrgb(r)} ${toSrgb(gg)} ${toSrgb(b)}`);
    }
    for (let i = 0; i < pos.count; i += 3) faces.push(`3 ${base + i} ${base + i + 1} ${base + i + 2}`);
  }
  const header = ["ply", "format ascii 1.0", `element vertex ${verts.length}`, "property float x", "property float y", "property float z",
    "property uchar red", "property uchar green", "property uchar blue", `element face ${faces.length}`, "property list uchar int vertex_indices", "end_header"];
  writeFileSync(path, [...header, ...verts, ...faces].join("\n"));
}

interface Set {
  stop: () => BufferGeometry;
  block: () => BufferGeometry;
  tank: () => BufferGeometry;
  hedge: () => BufferGeometry;
  bale: () => BufferGeometry;
  row: (crop: Crop) => BufferGeometry;
}

const FIELDS = [
  { x: 0, z: 0, w: 18, d: 12, rotationY: 0.3, crop: 0 as Crop },
  { x: 22, z: 2, w: 14, d: 16, rotationY: -0.4, crop: 1 as Crop },
  { x: 0, z: -18, w: 20, d: 12, rotationY: 0, crop: 2 as Crop },
  { x: 22, z: -20, w: 16, d: 16, rotationY: 0.2, crop: 3 as Crop },
];

function exportSet(prefix: string, set: Set, tri: string[]) {
  mkdirSync(OUT, { recursive: true });
  tri.push(`${prefix} stop ${triangleCount(set.stop())} block ${triangleCount(set.block())} tank ${triangleCount(set.tank())} hedge ${triangleCount(set.hedge())} bale ${triangleCount(set.bale())} rows ${([0, 1, 2, 3] as Crop[]).map((c) => triangleCount(set.row(c))).join("/")}`);
  writePly(`${OUT}/${prefix}-stop.ply`, [{ geometry: set.stop(), position: [0, 0, 0] }]);

  // A roof with its equipment: a slab, two units, a skylight, a mast and a tank.
  const roof = new BoxGeometry(6, 0.3, 4);
  const d = 0;
  const blocks: [Instance["scale"], [number, number], number, string][] = [
    [[0.9, 0.5, 0.7], [-1.8, -0.9], 0.4, "#a7a9a8"],
    [[0.9, 0.5, 0.7], [-0.4, -1.0], -0.3, "#a7a9a8"],
    [[0.4, 0.62, 0.4], [1.0, -1.1], 0.2, "#a7a9a8"],
    [[1.0, 0.12, 0.7], [-1.6, 0.9], 0.1, mix("#9fb4bd", "#dfe6e6", 0.5)],
    [[0.09, 2.3, 0.09], [2.5, 1.2], 0, "#8d9195"],
  ];
  writePly(`${OUT}/${prefix}-roof.ply`, [
    { geometry: roof, position: [0, 0.15, 0], tint: desaturate("#8a8f92", d) },
    ...blocks.map(([scale, [x, z], yaw, tint]) => ({ geometry: set.block(), position: [x, 0.3, z] as [number, number, number], scale, yaw, tint: desaturate(tint, d) })),
    { geometry: set.tank(), position: [1.4, 0.3, 0.7], scale: [0.62, 1.05, 0.62], yaw: 0.5, tint: desaturate("#a7a9a8", d) },
  ]);

  // The farm.
  const plan = planFarmland(FIELDS);
  const items: Instance[] = [];
  for (const g of plan.ground) items.push({ geometry: groundGeometry(), position: [g.x, -0.012, g.z], yaw: g.yaw, scale: [g.w, 1, g.d], tint: CROP_GROUND[g.crop] });
  for (const r of plan.rows) {
    const spec = CROP_ROWS[r.crop];
    items.push({ geometry: set.row(r.crop), position: [r.x, 0.005, r.z], yaw: r.yaw, scale: [r.length, spec.height, spec.width], tint: CROP_ROW[r.crop] });
  }
  for (const h of plan.hedges) items.push({ geometry: set.hedge(), position: [h.x, 0, h.z], yaw: h.yaw, scale: [h.length, 0.85 + h.shade * 0.3, 1], tint: mix("#4f7a3f", "#6d9448", h.shade * 0.6) });
  for (const b of plan.bales) {
    const s = 0.9 + b.size * 0.25;
    items.push({ geometry: set.bale(), position: [b.x, 0, b.z], yaw: b.yaw, scale: [s, s, s] });
  }
  writePly(`${OUT}/${prefix}-farm.ply`, items);
  // Two fields close up.
  const near = planFarmland([FIELDS[0], FIELDS[2]]);
  const closeUp: Instance[] = [];
  for (const g of near.ground) closeUp.push({ geometry: groundGeometry(), position: [g.x, -0.012, g.z], yaw: g.yaw, scale: [g.w, 1, g.d], tint: CROP_GROUND[g.crop] });
  for (const r of near.rows) {
    const spec = CROP_ROWS[r.crop];
    closeUp.push({ geometry: set.row(r.crop), position: [r.x, 0.005, r.z], yaw: r.yaw, scale: [r.length, spec.height, spec.width], tint: CROP_ROW[r.crop] });
  }
  for (const h of near.hedges) closeUp.push({ geometry: set.hedge(), position: [h.x, 0, h.z], yaw: h.yaw, scale: [h.length, 0.85 + h.shade * 0.3, 1], tint: mix("#4f7a3f", "#6d9448", h.shade * 0.6) });
  writePly(`${OUT}/${prefix}-field.ply`, closeUp);
  // The pieces alone, for a close look: a hedge run, a bale, one row of each crop.
  writePly(`${OUT}/${prefix}-parts.ply`, [
    { geometry: set.hedge(), position: [0, 0, 0], scale: [6, 1, 1], tint: "#5f8a44" },
    { geometry: set.bale(), position: [-1.5, 0, 2], scale: [1, 1, 1] },
    { geometry: set.bale(), position: [-3.2, 0, 2.2], yaw: 0.7, scale: [1.1, 1.1, 1.1] },
    ...([0, 1, 2, 3] as Crop[]).map((c, i) => ({ geometry: set.row(c), position: [0, 0.005, 3 + i * (CROP_ROWS[c].pitch * 1.4)] as [number, number, number], scale: [6, CROP_ROWS[c].height, CROP_ROWS[c].width] as [number, number, number], tint: CROP_ROW[c] })),
  ]);
}

test.skipIf(!process.env.EXPORT_PLY)("export street2, procedural and Blender", () => {
  const log: string[] = [];
  exportSet("proc", { stop: () => furnitureGeometry("stop", 0), block: propBlockGeometry, tank: propTankGeometry, hedge: hedgeGeometry, bale: baleGeometry, row: rowGeometry }, log);
  exportSet("blend", {
    stop: () => blenderFurnitureGeometry("stop", 0),
    block: blenderPropBlockGeometry,
    tank: blenderPropTankGeometry,
    hedge: () => blenderFarmGeometry("hedge"),
    bale: () => blenderFarmGeometry("bale"),
    row: (c) => blenderFarmGeometry(`row:${c}`),
  }, log);
  writeFileSync(`${OUT}/triangles.txt`, log.join("\n"));
});
