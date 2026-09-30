/**
 * The small things round the land's buildings and woods, planned without
 * three.js: the dressing of a yard (beds, bushes, low hedges, bales, a parked
 * tractor) in each house's own frame, and the shrubs along a copse's edge.
 * Every choice is seeded by the house's key or the tree's place, so a city
 * looks the same each visit. Heights come from the terrain when they are drawn
 * (`Small.tsx`).
 */

import { hash32 } from "../models/buildings/archetypes";
import { footprintPoint } from "./homes";
import type { HouseSpot, TreeSpot } from "./plan";

export type YardKind = "bed" | "bush" | "bale" | "tractor" | "hedge";

export interface YardItem {
  kind: YardKind;
  x: number;
  z: number;
  yaw: number;
  scale: number;
  /** A hedge's length along its own x. */
  length: number;
  /** 0..1, for tint and variety. */
  tint: number;
}

const unit = (key: string): number => (hash32(key) % 100000) / 100000;

/** Which models have a garden, a farmyard, or only a bush at the corner. */
const GARDEN: ReadonlySet<string> = new Set(["cottage", "cottage/tile", "farmhouse", "terrace"]);
const CORNER: ReadonlySet<string> = new Set(["house", "lowrise-pitched"]);

/**
 * The yard of every house that has one. A house's front is its +z; a barn's
 * yard is its front and its +x flank.
 */
export function planYards(houses: readonly HouseSpot[]): YardItem[] {
  const out: YardItem[] = [];
  for (const h of houses) {
    const r = (n: number) => unit(`${h.key}/y${n}`);
    const put = (kind: YardKind, lx: number, lz: number, yaw: number, scale: number, length = 1) => {
      const [x, z] = footprintPoint(h, lx, lz);
      out.push({ kind, x, z, yaw: h.yaw + yaw, scale, length, tint: r(out.length + 50) });
    };
    const hw = h.w / 2;
    const hd = h.d / 2;

    if (h.model === "barn") {
      // Bales stacked along the flank, a tractor before the doors.
      const bales = 1 + Math.floor(r(1) * 4);
      for (let i = 0; i < bales; i++) {
        const row = i % 2;
        put("bale", hw + 1.3 + row * 1.25, -hd * 0.6 + Math.floor(i / 2) * 1.35 + r(2 + i) * 0.3, r(10 + i) * 3.14, 0.9 + r(20 + i) * 0.25);
      }
      if (r(3) < 0.6) put("tractor", (r(4) - 0.5) * hw, hd + 3.3, (r(5) < 0.5 ? 0 : Math.PI) + (r(6) - 0.5) * 0.7, 1.15);
      if (r(7) < 0.7) put("bush", -hw - 0.9, hd * (r(8) - 0.3), 0, 1.1 + r(9) * 0.6);
      continue;
    }

    if (GARDEN.has(h.model)) {
      const farm = h.model === "farmhouse";
      // A bed either side of the path, a bush at a corner or two.
      put("bed", -hw * 0.45, hd + 1.35, 0, 0.9 + r(1) * 0.3);
      if (r(2) < 0.75) put("bed", hw * 0.45, hd + 1.35, 0, 0.9 + r(3) * 0.3);
      for (const side of [-1, 1]) if (r(4 + side) < 0.65) put("bush", side * (hw + 0.55), hd + 0.1 + r(6) * 0.4, 0, 1 + r(7) * 0.5);
      // The front hedge, with a gap for the path, on most of the houses that stand on their own.
      if (h.model !== "terrace" && r(8) < 0.7) {
        const y = hd + 3.1;
        const len = hw + 0.4;
        // Two runs either side of a one-metre-and-a-bit path, and a short return down each side.
        put("hedge", -0.8 - len / 2, y, 0, 1, len);
        put("hedge", 0.8 + len / 2, y, 0, 1, len);
        put("hedge", -hw - 1.2, y - 2.0, Math.PI / 2, 1, 4);
        put("hedge", hw + 1.2, y - 2.0, Math.PI / 2, 1, 4);
      }
      if (farm) {
        if (r(11) < 0.4) put("tractor", hw + 3.4, hd * 0.6, Math.PI / 2 + (r(12) - 0.5) * 0.6, 1.15);
        const bales = Math.floor(r(13) * 3);
        for (let i = 0; i < bales; i++) put("bale", -hw - 1.6, hd * 0.2 - i * 1.3, r(14 + i) * 3.14, 0.95);
      }
      continue;
    }

    if (CORNER.has(h.model)) {
      if (r(1) < 0.55) put("bush", (r(2) < 0.5 ? -1 : 1) * (hw + 0.6), hd * (r(3) - 0.2), 0, 0.9 + r(4) * 0.5);
      if (r(5) < 0.3) put("bed", (r(6) - 0.5) * hw, hd + 1.2, 0, 0.9 + r(7) * 0.3);
    }
  }
  return out;
}

export interface Shrub {
  x: number;
  z: number;
  yaw: number;
  scale: number;
  tint: number;
}

/**
 * The shrubs at the foot of the land's woods. A tree on a copse's edge (few
 * neighbours, or all of them on one side) gets shrubs on its open side, where
 * a wood thins into bramble and hazel; a lone tree or one in a hedgerow gets a
 * bush at its foot, and now and then one stands in a clearing inside. Shrubs
 * stand near a tree that was itself kept off the roads and water, so they need
 * no check of their own. At most `budget`, from the first trees on (the
 * plan's list runs nearest the city first).
 */
export function planUndergrowth(trees: readonly TreeSpot[], budget: number): Shrub[] {
  if (budget <= 0) return [];
  const RADIUS = 8;
  const cell = RADIUS;
  const grid = new Map<string, number[]>();
  const key = (i: number, j: number) => `${i},${j}`;
  const wood = trees.filter((t) => t.kind !== 2);
  wood.forEach((t, n) => {
    const k = key(Math.floor(t.x / cell), Math.floor(t.z / cell));
    const list = grid.get(k);
    if (list) list.push(n);
    else grid.set(k, [n]);
  });
  const out: Shrub[] = [];
  for (let n = 0; n < wood.length && out.length < budget; n++) {
    const t = wood[n];
    const seed = `${Math.round(t.x * 4)}:${Math.round(t.z * 4)}`;
    const r = (c: number) => unit(`${seed}/u${c}`);
    let cx = 0;
    let cz = 0;
    let near = 0;
    const gi = Math.floor(t.x / cell);
    const gj = Math.floor(t.z / cell);
    for (let i = gi - 1; i <= gi + 1; i++) {
      for (let j = gj - 1; j <= gj + 1; j++) {
        for (const m of grid.get(key(i, j)) ?? []) {
          if (m === n) continue;
          const o = wood[m];
          if (Math.hypot(o.x - t.x, o.z - t.z) > RADIUS) continue;
          cx += o.x;
          cz += o.z;
          near++;
        }
      }
    }
    // Away from the trees about it; a lone tree has no side, so any.
    const away = near > 0 ? Math.atan2(t.x - cx / near, t.z - cz / near) : r(1) * Math.PI * 2;
    const edge = near <= 5;
    const count = near === 0 ? (r(2) < 0.7 ? 1 : 0) : edge ? 1 + Math.floor(r(3) * 2.4) : r(4) < 0.1 ? 1 : 0;
    for (let k = 0; k < count && out.length < budget; k++) {
      const a = away + (r(5 + k) - 0.5) * 1.9;
      const d = (1.3 + r(8 + k) * 1.9) * Math.min(1.4, t.scale);
      out.push({
        x: t.x + Math.sin(a) * d,
        z: t.z + Math.cos(a) * d,
        yaw: r(11 + k) * Math.PI * 2,
        scale: 1.25 + r(14 + k) * 1.3,
        tint: r(17 + k),
      });
    }
  }
  return out;
}
