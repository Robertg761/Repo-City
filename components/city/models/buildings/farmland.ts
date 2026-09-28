/**
 * The village's fields and hedgerows (PLAN.md 76.5, village step 7).
 *
 * The layout hands over `city.props.fields`: rectangles, each turned to its
 * nearest lane, with a crop number 0 to 3. This module turns them into
 * instances for a handful of meshes:
 *
 *   crop 0  wheat        golden ridges on pale stubble
 *   crop 1  ploughed     dark furrows on turned earth
 *   crop 2  vegetables   rows of round green heads on brown soil
 *   crop 3  hay meadow   pale windrows on fresh grass, round bales along them
 *
 * Every field is edged with a hedgerow with one gateway in it, and the
 * hedge carries a tree or two at its corners. Rows run the long way, with a
 * headland left round the edge for the tractor to turn on.
 *
 * Deterministic: every choice is a hash of the field's own numbers, so the
 * same village always has the same gates, bales and hedge trees. Pure
 * planning plus cached geometry; the planning is unit tested.
 */

import { BoxGeometry, CylinderGeometry, Float32BufferAttribute, type BufferGeometry } from "three";
import type { FieldPatch } from "@/types/city";
import { hash32 } from "./archetypes";
import { geometryCache, mergeParts, prismGeometry, type Part } from "../props/geometry";
import { addQuad, emptyDraft } from "./mesh";
import { toGeometry } from "./geometry";
import { SURFACE, type SurfaceId } from "../../textures/surface-types";
import { importedParts } from "../imported";
import { BLENDER_MODELS } from "../modelSource";
import { MODEL as STREET2_MODEL } from "../props/street2.model";

export type Crop = FieldPatch["crop"];

/** Ground colour under each crop, and the colour of its rows. */
export const CROP_GROUND: Record<Crop, string> = {
  0: "#cdb77a",
  1: "#8a6a4d",
  2: "#8b6e50",
  3: "#9cc27f",
};

export const CROP_ROW: Record<Crop, string> = {
  0: "#dcb85a",
  1: "#6f5139",
  2: "#5f9148",
  3: "#d7c784",
};

/** Row spacing, row width and row height, in world units, per crop. */
export const CROP_ROWS: Record<Crop, { pitch: number; width: number; height: number }> = {
  0: { pitch: 0.75, width: 0.55, height: 0.42 },
  1: { pitch: 0.6, width: 0.42, height: 0.14 },
  2: { pitch: 0.95, width: 0.5, height: 0.3 },
  3: { pitch: 2.3, width: 0.7, height: 0.16 },
};

/** Border left inside the hedge: the headland. */
export const HEADLAND = 0.9;
/** Hedge thickness and height. */
export const HEDGE_WIDTH = 0.7;
export const HEDGE_HEIGHT = 1.05;
/** The gateway left in one side of every hedge. */
export const GATE_WIDTH = 2.6;
/**
 * How far the hedge's centre line sits inside the field's edge: its outer
 * face stands a little past the edge, so the side of the field's ground is
 * inside the hedge rather than in the plane of its face.
 */
export const HEDGE_INSET = HEDGE_WIDTH / 2 - 0.015;
/**
 * How far a hedge on a long side runs past its ends, over the corner: a
 * little past the outer face of the hedge it meets. The two are different
 * greens, and where the end of one lay in the plane of the other's face they
 * flickered through each other at every corner of every field.
 */
export const HEDGE_OVERRUN = HEDGE_WIDTH / 2 + 0.02;

export interface Placed {
  x: number;
  z: number;
  /** Yaw about y; the instance's local x runs along the row or hedge. */
  yaw: number;
}

export interface GroundInstance extends Placed {
  w: number;
  d: number;
  crop: Crop;
}

export interface RowInstance extends Placed {
  length: number;
  crop: Crop;
}

export interface HedgeInstance extends Placed {
  length: number;
  /** 0..1, for a little colour and height variation along the hedgerows. */
  shade: number;
}

export interface BaleInstance extends Placed {
  /** Seeded 0..1 for a small size variation. */
  size: number;
}

export interface TreeInstance extends Placed {
  scale: number;
  shade: number;
}

export interface FarmPlan {
  ground: GroundInstance[];
  rows: RowInstance[];
  hedges: HedgeInstance[];
  bales: BaleInstance[];
  trees: TreeInstance[];
}

const unit = (seed: string, channel: number): number => (hash32(`${seed}#${channel}`) % 10000) / 10000;

function finish(geometry: BufferGeometry, surface: SurfaceId): BufferGeometry {
  const count = geometry.getAttribute("position").count;
  geometry.setAttribute("surface", new Float32BufferAttribute(new Float32Array(count).fill(surface), 1));
  return geometry;
}

/** A point in the field's own frame, turned into the world. */
function toWorld(field: FieldPatch, lx: number, lz: number): { x: number; z: number } {
  const c = Math.cos(field.rotationY);
  const s = Math.sin(field.rotationY);
  // three's rotation about y: local +x goes to (cos, -sin), local +z to (sin, cos).
  return { x: field.x + lx * c + lz * s, z: field.z - lx * s + lz * c };
}

/** Upper bound on row instances, so a pathological layout cannot run away. */
export const ROW_CAP = 1600;

/**
 * Every instance the fields draw. A field too small to hold a row still gets
 * its ground and its hedge.
 */
export function planFarmland(fields: readonly FieldPatch[]): FarmPlan {
  const plan: FarmPlan = { ground: [], rows: [], hedges: [], bales: [], trees: [] };

  for (const field of fields) {
    if (!(field.w > 0 && field.d > 0)) continue;
    const crop = ([0, 1, 2, 3] as const)[((field.crop % 4) + 4) % 4];
    const seed = `${field.x.toFixed(2)},${field.z.toFixed(2)}`;
    plan.ground.push({ x: field.x, z: field.z, yaw: field.rotationY, w: field.w, d: field.d, crop });

    // Rows run along the field's long side.
    const alongX = field.w >= field.d;
    const long = alongX ? field.w : field.d;
    const short = alongX ? field.d : field.w;
    const rows = CROP_ROWS[crop];
    const length = long - HEADLAND * 2;
    const span = short - HEADLAND * 2;
    if (length > 1 && span > rows.width) {
      const count = Math.max(1, Math.floor(span / rows.pitch) + 1);
      const first = -((count - 1) * rows.pitch) / 2;
      for (let i = 0; i < count && plan.rows.length < ROW_CAP; i++) {
        const across = first + i * rows.pitch;
        const at = alongX ? toWorld(field, 0, across) : toWorld(field, across, 0);
        plan.rows.push({ ...at, yaw: field.rotationY + (alongX ? 0 : Math.PI / 2), length, crop });
        // Round bales lie along the windrows of a hay meadow.
        if (crop === 3 && i % 2 === 0) {
          const bales = 1 + Math.floor(unit(seed, 40 + i) * 3);
          for (let b = 0; b < bales; b++) {
            const t = (unit(seed, 60 + i * 7 + b) - 0.5) * (length - 1.6);
            // Beside the row on the side towards the middle of the field: on
            // the outer side of the last row, a bale ran into the hedge.
            const offset = rows.width * 0.9 * (across > 0 ? -1 : 1);
            const p = alongX ? toWorld(field, t, across + offset) : toWorld(field, across + offset, t);
            plan.bales.push({ ...p, yaw: field.rotationY + (unit(seed, 80 + i * 7 + b) - 0.5) * 0.8, size: unit(seed, 90 + i * 7 + b) });
          }
        }
      }
    }

    // The hedge: four sides, inset, with a gateway in one of them.
    const hw = field.w / 2 - HEDGE_INSET;
    const hd = field.d / 2 - HEDGE_INSET;
    const gateSide = Math.floor(unit(seed, 1) * 4);
    const sides: { from: [number, number]; to: [number, number] }[] = [
      { from: [-hw, hd], to: [hw, hd] },
      { from: [hw, -hd], to: [-hw, -hd] },
      { from: [hw, hd], to: [hw, -hd] },
      { from: [-hw, -hd], to: [-hw, hd] },
    ];
    sides.forEach((side, index) => {
      const dx = side.to[0] - side.from[0];
      const dz = side.to[1] - side.from[1];
      const full = Math.hypot(dx, dz);
      if (full < 0.5) return;
      const pieces: [number, number][] =
        index === gateSide && full > GATE_WIDTH + 2
          ? [
              [0, full / 2 - GATE_WIDTH / 2],
              [full / 2 + GATE_WIDTH / 2, full],
            ]
          : [[0, full]];
      // Hedges on the long sides overlap the corners so there is no gap.
      const extend = index < 2 ? HEDGE_OVERRUN : 0;
      for (const [a0, a1] of pieces) {
        const start = a0 === 0 ? a0 - extend : a0;
        const end = a1 === full ? a1 + extend : a1;
        const mid = (start + end) / 2;
        const local = [side.from[0] + (dx / full) * mid, side.from[1] + (dz / full) * mid] as const;
        const at = toWorld(field, local[0], local[1]);
        const yaw = field.rotationY + Math.atan2(-dz, dx);
        plan.hedges.push({ ...at, yaw, length: end - start, shade: unit(seed, 10 + index) });
      }
    });

    // A hedgerow tree at one or two corners.
    const corners: [number, number][] = [
      [hw, hd],
      [-hw, -hd],
      [hw, -hd],
      [-hw, hd],
    ];
    const treeCount = 1 + (unit(seed, 20) < 0.55 ? 1 : 0);
    for (let t = 0; t < treeCount; t++) {
      const corner = corners[(Math.floor(unit(seed, 21) * 4) + t * 2) % 4];
      const at = toWorld(field, corner[0], corner[1]);
      plan.trees.push({ ...at, yaw: unit(seed, 22 + t) * Math.PI * 2, scale: 0.85 + unit(seed, 24 + t) * 0.35, shade: unit(seed, 26 + t) });
    }
  }
  return plan;
}

/** A flat unit square at the ground, facing up: one field's earth. */
export function groundGeometry(): BufferGeometry {
  return cache("ground");
}

/** The Blender node that stands in for a cache key (`blender/street2/street2.py`). */
const blenderNode = (key: string): string | null => {
  if (key === "hedge") return "Hedge";
  if (key === "bale") return "Bale";
  if (key.startsWith("row:")) return `Row${key.slice(4)}`;
  return null;
};

/**
 * The farmland the Blender models draw: hedge, bales and crop rows come from
 * the street2 set, authored at a real run length with their occlusion baked
 * there and squeezed to the unit the instances stretch. The ground stays two
 * triangles: nothing beats that.
 */
const blenderCache = geometryCache<string>((key) => {
  const node = blenderNode(key);
  if (!node) return cache(key);
  return mergeParts(importedParts(STREET2_MODEL, node, (hex) => hex));
});

/** The Blender farmland whatever the flag says, for its tests and renders. */
export const blenderFarmGeometry = (key: "hedge" | "bale" | `row:${Crop}`): BufferGeometry => blenderCache(key);

/** A unit-long ridge along x, one wide and one high: a crop row. */
export function rowGeometry(crop: Crop): BufferGeometry {
  return (BLENDER_MODELS ? blenderCache : cache)(`row:${crop}`);
}

/** A unit-long hedge along x, `HEDGE_WIDTH` by `HEDGE_HEIGHT` in section. */
export function hedgeGeometry(): BufferGeometry {
  return (BLENDER_MODELS ? blenderCache : cache)("hedge");
}

/** A round bale lying on its side, about 1.1 across. */
export function baleGeometry(): BufferGeometry {
  return (BLENDER_MODELS ? blenderCache : cache)("bale");
}

/** A few uneven crowns along a row, with one shared mesh and no added instances. */
function brokenRow(crop: Crop): BufferGeometry {
  const draft = emptyDraft();
  const stations = [-0.5, -0.18, 0.17, 0.5];
  const heights = crop === 0 ? [0.82, 1, 0.88, 0.96] : crop === 1 ? [0.85, 1, 0.78, 0.94] : [0.72, 0.95, 1, 0.8];
  const halfTop = [0, 0, 0, 0];
  type Point = readonly [number, number, number];
  for (let s = 0; s < stations.length - 1; s++) {
    const a = stations[s];
    const b = stations[s + 1];
    const left0: Point = [a, heights[s], -halfTop[s]];
    const left1: Point = [b, heights[s + 1], -halfTop[s + 1]];
    const right0: Point = [a, heights[s], halfTop[s]];
    const right1: Point = [b, heights[s + 1], halfTop[s + 1]];
    const shade = 0.89 + (s % 2) * 0.1;
    addQuad(draft, [a, 0, 0.5], [b, 0, 0.5], right1, right0, [shade, shade, shade]);
    addQuad(draft, [b, 0, -0.5], [a, 0, -0.5], left0, left1, [shade * 0.92, shade * 0.92, shade * 0.92]);
  }
  addQuad(draft, [-0.5, 0, -0.5], [0.5, 0, -0.5], [0.5, 0, 0.5], [-0.5, 0, 0.5], [0.7, 0.7, 0.7]);
  addQuad(draft, [0.5, 0, 0.5], [0.5, 0, -0.5], [0.5, heights[3], -halfTop[3]], [0.5, heights[3], halfTop[3]], [0.9, 0.9, 0.9]);
  addQuad(draft, [-0.5, 0, -0.5], [-0.5, 0, 0.5], [-0.5, heights[0], halfTop[0]], [-0.5, heights[0], -halfTop[0]], [0.9, 0.9, 0.9]);
  return finish(mergeParts([{ geometry: toGeometry(draft), color: "#ffffff", paint: true }]), SURFACE.foliage);
}

const cache = geometryCache<string>((key) => {
  if (key === "ground") {
    const box = new BoxGeometry(1, 0.02, 1);
    return finish(mergeParts([{ geometry: box, color: "#ffffff", paint: true, position: [0, 0.01, 0] }]), SURFACE.concrete);
  }
  if (key === "hedge") {
    // A rounded section, lighter on top where the sun catches it.
    const w = HEDGE_WIDTH / 2;
    const h = HEDGE_HEIGHT;
    const body = prismGeometry(
      [
        [-w, 0],
        [w, 0],
        [w, h * 0.72],
        [w * 0.62, h * 0.94],
        [0, h],
        [-w * 0.62, h * 0.91],
        [-w, h * 0.72],
      ],
      1,
    );
    // `prismGeometry` profiles are [z, y] and extrude across x: exactly a
    // hedge running along x.
    const parts: Part[] = [{ geometry: body, color: "#ffffff", paint: true }];
    const hedge = mergeParts(parts);
    const position = hedge.getAttribute("position");
    const colors = hedge.getAttribute("color");
    for (let i = 0; i < position.count; i++) {
      const shade = 0.72 + (position.getY(i) / h) * 0.34 + (position.getX(i) > 0 ? 0.025 : 0);
      colors.setXYZ(i, shade * 0.98, shade, shade * 0.93);
    }
    return finish(hedge, SURFACE.foliage);
  }
  if (key === "bale") {
    const bale = new CylinderGeometry(0.55, 0.55, 0.9, 8);
    const position = bale.getAttribute("position");
    const normals = bale.getAttribute("normal");
    const tones = new Float32Array(position.count * 3);
    for (let i = 0; i < position.count; i++) {
      const end = Math.abs(normals.getY(i)) > 0.99;
      const radius = Math.hypot(position.getX(i), position.getZ(i)) / 0.55;
      const shade = end ? 0.73 + radius * 0.27 : 0.94 + (position.getX(i) > 0 ? 0.05 : 0);
      tones.set([shade, shade, end ? shade * 0.91 : shade], i * 3);
    }
    bale.setAttribute("color", new Float32BufferAttribute(tones, 3));
    return finish(mergeParts([
      { geometry: bale, color: "#d9bd68", position: [0, 0.55, 0], rotation: [Math.PI / 2, 0, 0] },
      ...[-0.27, 0.27].map((z): Part => ({ geometry: new CylinderGeometry(0.565, 0.565, 0.045, 8, 1, true), color: "#a48942", position: [0, 0.55, z], rotation: [Math.PI / 2, 0, 0] })),
    ]), SURFACE.thatch);
  }
  const crop = Number(key.split(":")[1]) as Crop;
  if (crop !== 2) return brokenRow(crop);
  // Two rounded vegetable crowns with a shallow valley between them.
  const profile: [number, number][] = [[-0.5, 0], [0.5, 0], [0.5, 0.45], [0.3, 1], [0, 0.88], [-0.3, 1], [-0.5, 0.45]];
  const row = prismGeometry(profile, 1);
  return finish(mergeParts([{ geometry: row, color: "#ffffff", paint: true }]), SURFACE.foliage);
});
