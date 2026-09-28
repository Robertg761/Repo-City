/**
 * Writes the settlement buildings to PLYs, stretched to a building's size and
 * painted the way `Buildings.tsx` paints them, so Blender can render the
 * procedural model beside the Blender one under the same light. Spike tooling,
 * not a unit test, so it only runs when asked:
 * `EXPORT_PLY=1 pnpm vitest run blender/settlement/export-procedural`.
 *
 *   blender/out/settlement/proc-<key>.ply    the procedural model
 *   blender/out/settlement/blend-<key>.ply   the Blender model, once it has one
 *   blender/out/settlement/{proc,blend}-village.ply, -town.ply   small clusters
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { test } from "vitest";
import type { ArchetypeModel } from "@/components/city/models/buildings/models";
import * as village from "@/components/city/models/buildings/village";
import * as town from "@/components/city/models/buildings/town";
import { PAINT_ACCENT, PAINT_WALL } from "@/components/city/models/buildings/mesh";
import { linear } from "@/components/city/models/buildings/kit";

const toSrgb = (c: number) => Math.round(255 * Math.min(1, c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055));

type Builder = () => ArchetypeModel;
type Maybe = Record<string, unknown>;
const fn = (mod: Maybe, name: string): ((...a: never[]) => ArchetypeModel) | undefined =>
  typeof mod[name] === "function" ? (mod[name] as (...a: never[]) => ArchetypeModel) : undefined;

/** key -> [procedural, blender?, size [w, h, d], wall, accent]. */
function catalogue(): Record<string, [Builder, Builder | undefined, [number, number, number], string, string]> {
  const v = village as unknown as Maybe;
  const t = town as unknown as Maybe;
  const call = (name: string, mod: Maybe, ...args: unknown[]): Builder | undefined => {
    const f = fn(mod, name);
    return f ? () => (f as (...a: unknown[]) => ArchetypeModel)(...args) : undefined;
  };
  return {
    cottage: [() => village.cottage("thatch"), call("blenderCottage", v, "thatch"), [4.2, 3.6, 4.0], "#efe3c6", "#2f6a52"],
    "cottage-tile": [() => village.cottage("tile"), call("blenderCottage", v, "tile"), [4.0, 4.2, 3.8], "#ecd5c9", "#3f6f8f"],
    farmhouse: [village.farmhouse, call("blenderFarmhouse", v), [4.6, 5.8, 4.4], "#e9d3a2", "#9b3b36"],
    barn: [village.barn, call("blenderBarn", v), [4.4, 6.0, 4.8], "#9c4a3b", "#2f3d4c"],
    shopfront: [() => town.shopfront(2), call("blenderShopfront", t, 2), [5.5, 5.4, 5.0], "#c6d5cf", "#8e2f35"],
    "shopfront-tall": [() => town.shopfront(3), call("blenderShopfront", t, 3), [5.5, 7.6, 5.0], "#efe0ae", "#2e6049"],
    terrace: [town.terrace, call("blenderTerrace", t), [6.0, 5.4, 5.0], "#e6c8b5", "#5d4a6e"],
    "apartment-low": [() => town.apartmentLow(false), call("blenderApartmentLow", t, false), [6.5, 10.5, 6.2], "#d9ccb4", "#3f6f8f"],
    "apartment-low-retail": [() => town.apartmentLow(true), call("blenderApartmentLow", t, true), [6.5, 12, 6.2], "#b87157", "#c08a2e"],
  };
}

interface Placed {
  model: ArchetypeModel;
  size: [number, number, number];
  at: [number, number];
  yaw: number;
  wall: string;
  accent: string;
}

function ply(items: Placed[], path: string): number {
  const verts: string[] = [];
  const faces: string[] = [];
  for (const { model, size, at, yaw, wall, accent } of items) {
    const d = model.draft;
    const W = linear(wall);
    const A = linear(accent);
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const base = verts.length;
    const n = d.positions.length / 3;
    for (let i = 0; i < n; i++) {
      const x = d.positions[i * 3] * size[0];
      const y = d.positions[i * 3 + 1] * size[1];
      const z = d.positions[i * 3 + 2] * size[2];
      // three's yaw about y: local +z to (sin, cos).
      const wx = at[0] + x * c + z * s;
      const wz = at[1] - x * s + z * c;
      const p = d.paint?.[i] ?? 0;
      const k = p === PAINT_WALL ? W : p === PAINT_ACCENT ? A : [1, 1, 1];
      const rgb = [0, 1, 2].map((j) => toSrgb(d.colors[i * 3 + j] * k[j]));
      verts.push(`${wx} ${-wz} ${y} ${rgb.join(" ")}`);
    }
    for (let t = 0; t < d.indices.length; t += 3) {
      faces.push(`3 ${base + d.indices[t]} ${base + d.indices[t + 1]} ${base + d.indices[t + 2]}`);
    }
  }
  const header = ["ply", "format ascii 1.0", `element vertex ${verts.length}`, "property float x", "property float y", "property float z",
    "property uchar red", "property uchar green", "property uchar blue", `element face ${faces.length}`, "property list uchar int vertex_indices", "end_header"];
  writeFileSync(path, [...header, ...verts, ...faces].join("\n"));
  return faces.length;
}

const OUT = "blender/out/settlement";

test.skipIf(!process.env.EXPORT_PLY)("export the settlement buildings", () => {
  mkdirSync(OUT, { recursive: true });
  for (const [key, [proc, blend, size, wall, accent]] of Object.entries(catalogue())) {
    const one = (m: ArchetypeModel): Placed[] => [{ model: m, size, at: [0, 0], yaw: 0, wall, accent }];
    const p = ply(one(proc()), `${OUT}/proc-${key}.ply`);
    const b = blend ? ply(one(blend()), `${OUT}/blend-${key}.ply`) : 0;
    console.log(`${key}: procedural ${p}${blend ? `, blender ${b}` : ""}`);
  }

  // A village lane and a town street, the same plots and paint both ways.
  const cat = catalogue();
  const lane: [string, [number, number], number, number][] = [
    ["cottage", [-9, -5], 0, 0],
    ["cottage-tile", [-3.5, -5.3], 0, 1],
    ["farmhouse", [2.5, -5.5], 0.05, 2],
    ["cottage", [8.5, -5], -0.08, 3],
    ["barn", [-8, 6], Math.PI + 0.1, 4],
    ["cottage", [-2.5, 5.2], Math.PI, 5],
    ["farmhouse", [3.5, 5.6], Math.PI - 0.06, 6],
    ["cottage-tile", [9.5, 5], Math.PI, 0],
  ];
  const street: [string, [number, number], number, number][] = [
    ["shopfront", [-12, -5], 0, 0],
    ["shopfront-tall", [-6.3, -5], 0, 1],
    ["shopfront", [-0.6, -5], 0, 2],
    ["apartment-low-retail", [6.4, -5.2], 0, 3],
    ["terrace", [-10, 6], Math.PI, 4],
    ["terrace", [-3.6, 6], Math.PI, 5],
    ["apartment-low", [4, 6.2], Math.PI, 6],
  ];
  const walls = ["#f2ede1", "#efe3c6", "#e9d3a2", "#ecd5c9", "#dcd0b8", "#e4e1cd", "#d8c19a"];
  const accents = ["#3f6f8f", "#2f6a52", "#9b3b36", "#c59a3a", "#5d4a6e", "#2f3d4c", "#6f8a5a"];
  for (const [name, plan] of [["village", lane], ["town", street]] as const) {
    for (const which of ["proc", "blend"] as const) {
      const items: Placed[] = [];
      let complete = true;
      for (const [key, at, yaw, k] of plan) {
        const [proc, blend, size, wall, accent] = cat[key];
        const build = which === "proc" ? proc : blend;
        if (!build) {
          complete = false;
          continue;
        }
        const w = key === "barn" || name === "town" ? wall : walls[k];
        items.push({ model: build(), size, at, yaw, wall: w, accent: name === "town" ? accent : accents[k] });
      }
      if (which === "blend" && !complete) continue;
      console.log(`${which}-${name}: ${ply(items, `${OUT}/${which}-${name}.ply`)}`);
    }
  }
});
