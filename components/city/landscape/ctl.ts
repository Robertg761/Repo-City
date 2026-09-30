/**
 * The ground's control map (`?land=rich`): one small RGBA image over the plot
 * and the apron round it, baked once per city from the model and the plan, and
 * read by the ground shader (`ground.ts`) and the grass (`grass.tsx`).
 *
 *   R  meadow: 0 is mown lawn, 1 is meadow. The city plot is lawn, and the
 *      lawn frays into meadow across a ragged band round the verge, so there
 *      is no slab edge; rough unmown patches and roadside verges are meadow too
 *   G  dryness: the ground is greener or drier in large soft patches, drier
 *      near roads and on the high ground
 *   B  wear: desire lines worn between buildings, dust along the road edges
 *   A  grass: 255 where grass may grow, 0 on roads, pavements, buildings,
 *      the civic square, fields, water and (in a city, town or metropolis)
 *      the paved district plates
 *
 * Everything is a function of the model and the seed: the same city bakes the
 * same map (`ctl.test.ts`).
 */

import type { CityModel } from "@/types/city";
import { plazaRect } from "../groundwork";
import { convexDistance } from "./fields";
import { fbm, hash01, smooth01 } from "./noise";
import { PLOT_MARGIN, pondEdge, type LandscapePlan } from "./plan";

export const CTL_SIZE = 512;
/** The map's side is the plot's side times this: the plot and the apron round it. */
export const CTL_REACH = 2.0;

export interface Control {
  data: Uint8Array;
  size: number;
  /** World x and z of the map's minimum corner, and its side. */
  min: number;
  span: number;
}

/** Index of a pixel's first byte. */
const at = (size: number, px: number, py: number) => (py * size + px) * 4;

/** World position of a pixel's centre. */
const world = (c: { min: number; span: number; size: number }, p: number) => c.min + ((p + 0.5) / c.size) * c.span;

interface Rasters {
  road: Float32Array;
  build: Float32Array;
  paved: Float32Array;
  water: Float32Array;
  field: Float32Array;
}

/** Fill `into` with the smaller of itself and a distance, over a box of pixels. */
function stampDistance(
  c: Control,
  into: Float32Array,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  distance: (x: number, z: number) => number,
  margin: number,
): void {
  const px = c.size / c.span;
  const ix0 = Math.max(0, Math.floor((Math.min(x0, x1) - margin - c.min) * px));
  const ix1 = Math.min(c.size - 1, Math.ceil((Math.max(x0, x1) + margin - c.min) * px));
  const iz0 = Math.max(0, Math.floor((Math.min(z0, z1) - margin - c.min) * px));
  const iz1 = Math.min(c.size - 1, Math.ceil((Math.max(z0, z1) + margin - c.min) * px));
  for (let iz = iz0; iz <= iz1; iz++) {
    for (let ix = ix0; ix <= ix1; ix++) {
      const d = distance(world(c, ix), world(c, iz));
      const k = iz * c.size + ix;
      if (d < into[k]) into[k] = d;
    }
  }
}

function segDistance(ax: number, az: number, bx: number, bz: number) {
  const vx = bx - ax;
  const vz = bz - az;
  const len2 = vx * vx + vz * vz || 1e-9;
  return (x: number, z: number) => {
    const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / len2));
    return Math.hypot(x - (ax + vx * t), z - (az + vz * t));
  };
}

/** Signed distance to a rotated rectangle: negative inside. */
function rectDistance(cx: number, cz: number, hw: number, hd: number, yaw: number) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return (x: number, z: number) => {
    const dx = x - cx;
    const dz = z - cz;
    const lx = Math.abs(dx * c - dz * s) - hw;
    const lz = Math.abs(dx * s + dz * c) - hd;
    return Math.min(Math.max(lx, lz), 0) + Math.hypot(Math.max(lx, 0), Math.max(lz, 0));
  };
}

function rasters(city: CityModel, plan: LandscapePlan, c: Control): Rasters {
  const n = c.size * c.size;
  const far = 1e6;
  const r: Rasters = {
    road: new Float32Array(n).fill(far),
    build: new Float32Array(n).fill(far),
    paved: new Float32Array(n).fill(far),
    water: new Float32Array(n).fill(far),
    field: new Float32Array(n).fill(far),
  };
  for (const road of city.roads) {
    const [ax, , az] = road.from;
    const [bx, , bz] = road.to;
    // Distance to the edge of the pavement: half the carriageway plus a slab.
    const halfW = road.width / 2 + (road.kind === "lane" ? 0.7 : 1.5);
    const f = segDistance(ax, az, bx, bz);
    stampDistance(c, r.road, ax, az, bx, bz, (x, z) => f(x, z) - halfW, 6);
  }
  for (const path of plan.roads) {
    for (let i = 0; i + 1 < path.pts.length; i++) {
      const a = path.pts[i];
      const b = path.pts[i + 1];
      const f = segDistance(a.x, a.z, b.x, b.z);
      stampDistance(c, r.road, a.x, a.z, b.x, b.z, (x, z) => f(x, z) - path.width / 2 - 0.8, 6);
    }
  }
  for (const b of city.buildings) {
    const f = rectDistance(b.position[0], b.position[2], b.size[0] / 2 + 0.5, b.size[2] / 2 + 0.5, b.rotationY);
    const reachB = Math.hypot(b.size[0], b.size[2]);
    stampDistance(c, r.build, b.position[0], b.position[2], b.position[0], b.position[2], f, reachB);
  }
  for (const l of city.landmarks) {
    const [w = 10, , d = 10] = l.size ?? [];
    const f = rectDistance(l.position[0], l.position[2], w / 2, d / 2, l.rotationY);
    stampDistance(c, r.build, l.position[0], l.position[2], l.position[0], l.position[2], f, Math.hypot(w, d));
  }
  const plaza = plazaRect(city);
  if (plaza && city.plaza?.surface !== "green") {
    const f = rectDistance(plaza.x, plaza.z, plaza.w / 2, plaza.d / 2, 0);
    stampDistance(c, r.paved, plaza.x, plaza.z, plaza.x, plaza.z, f, Math.hypot(plaza.w, plaza.d));
  }
  // The district plates of a city, a town or a metropolis are paved ground.
  if (plan.tier !== "village") {
    for (const d of city.districts) {
      const f = rectDistance(d.rect.x, d.rect.z, d.rect.w / 2, d.rect.d / 2, 0);
      stampDistance(c, r.paved, d.rect.x, d.rect.z, d.rect.x, d.rect.z, f, Math.hypot(d.rect.w, d.rect.d));
    }
  }
  for (const river of plan.rivers) {
    for (let i = 0; i + 1 < river.pts.length; i++) {
      const a = river.pts[i];
      const b = river.pts[i + 1];
      const f = segDistance(a.x, a.z, b.x, b.z);
      // The bank counts as water: no grass tufts on the mud.
      stampDistance(c, r.water, a.x, a.z, b.x, b.z, (x, z) => f(x, z) - river.width / 2 - river.spec.bank * 0.85, 6 + river.spec.bank);
    }
  }
  for (const pond of plan.ponds) {
    stampDistance(c, r.water, pond.x, pond.z, pond.x, pond.z, (x, z) => pondEdge(pond, x, z) - pond.spec.bank * 0.85, Math.max(pond.rx, pond.rz) * 1.5 + pond.spec.bank);
  }
  for (const f of plan.fields) {
    stampDistance(c, r.field, f.x, f.z, f.x, f.z, (x, z) => convexDistance(f.poly, x, z), f.radius + 2);
  }
  // The model's own fields (a village's, inside the plot), hedges and all.
  for (const f of city.props.fields ?? []) {
    const d = rectDistance(f.x, f.z, f.w / 2 + 1, f.d / 2 + 1, f.rotationY);
    stampDistance(c, r.field, f.x, f.z, f.x, f.z, d, Math.hypot(f.w, f.d));
  }
  for (const h of plan.houses) {
    const d = rectDistance(h.x, h.z, h.w / 2 + 0.5, h.d / 2 + 0.5, h.yaw);
    stampDistance(c, r.build, h.x, h.z, h.x, h.z, d, Math.hypot(h.w, h.d));
  }
  return r;
}

/** Stamp a soft round dab of wear. */
function dab(c: Control, wear: Float32Array, x: number, z: number, radius: number, amount: number): void {
  const px = c.size / c.span;
  const rp = radius * px;
  const cx = (x - c.min) * px;
  const cz = (z - c.min) * px;
  for (let iz = Math.max(0, Math.floor(cz - rp - 1)); iz <= Math.min(c.size - 1, Math.ceil(cz + rp + 1)); iz++) {
    for (let ix = Math.max(0, Math.floor(cx - rp - 1)); ix <= Math.min(c.size - 1, Math.ceil(cx + rp + 1)); ix++) {
      const d = Math.hypot(ix + 0.5 - cx, iz + 0.5 - cz) / Math.max(rp, 0.5);
      if (d >= 1) continue;
      const k = iz * c.size + ix;
      wear[k] = Math.max(wear[k], amount * (1 - d * d));
    }
  }
}

/**
 * Desire lines: for each building its nearest neighbour, a worn line between
 * the two (drawn only where grass shows, the rest is under a building or a
 * road anyway), and a few longer ones from the outermost buildings towards
 * the plot's edge and the way out.
 */
export function desireLines(city: CityModel, limit = 70): [number, number, number, number][] {
  const b = city.buildings;
  const lines: [number, number, number, number][] = [];
  for (let i = 0; i < b.length && lines.length < limit; i++) {
    let best = -1;
    let bestD = Infinity;
    for (let j = 0; j < b.length; j++) {
      if (j === i) continue;
      const d = Math.hypot(b[i].position[0] - b[j].position[0], b[i].position[2] - b[j].position[2]);
      if (d < bestD) {
        bestD = d;
        best = j;
      }
    }
    if (best < 0 || bestD < 6 || bestD > 30) continue;
    // Not every pair: about two in three, by hash.
    if (hash01(i, best, 4242) > 0.66) continue;
    lines.push([b[i].position[0], b[i].position[2], b[best].position[0], b[best].position[2]]);
  }
  return lines;
}

export interface BakeJob {
  control: Control;
  done: boolean;
  /** Work for about `ms` milliseconds; returns whether the bake has finished. */
  run(ms: number): boolean;
}

/**
 * The bake as a job that can be spread over frames: the rasters and the
 * desire lines first, then the map row by row.
 */
export function bakeJob(city: CityModel, plan: LandscapePlan, size = CTL_SIZE): BakeJob {
  const half = plan.half;
  const span = half * 2 * CTL_REACH;
  const c = { size, min: -span / 2, span } as Control;
  // Not enumerable: React's development build walks a changed prop's keys to log the change, and a megabyte of bytes is a third of a second of that.
  Object.defineProperty(c, "data", { value: new Uint8Array(size * size * 4), enumerable: false });
  const seed = plan.seed;
  let r: Rasters | null = null;
  const wear = new Float32Array(size * size);
  let row = 0;
  const job: BakeJob = {
    control: c,
    done: false,
    run(ms: number) {
      if (job.done) return true;
      const t0 = performance.now();
      if (!r) {
        r = rasters(city, plan, c);
        // Desire lines, as chains of dabs along each line.
        for (const [x0, z0, x1, z1] of desireLines(city)) {
          const len = Math.hypot(x1 - x0, z1 - z0);
          // A slight bow, so a worn line is never a ruler line.
          const bow = (hash01(Math.round(x0), Math.round(z0), seed) - 0.5) * len * 0.12;
          const nx = -(z1 - z0) / (len || 1);
          const nz = (x1 - x0) / (len || 1);
          for (let s = 0; s <= len; s += 0.4) {
            const t = s / len;
            const off = Math.sin(t * Math.PI) * bow;
            // Patchy: the line breaks where the grass is thick.
            const patch = fbm((x0 + (x1 - x0) * t) / 3.5, (z0 + (z1 - z0) * t) / 3.5, seed + 3, 2);
            if (patch < 0.36) continue;
            dab(c, wear, x0 + (x1 - x0) * t + nx * off, z0 + (z1 - z0) * t + nz * off, 0.5 + patch * 0.4, 0.55 + patch * 0.45);
          }
        }
        if (performance.now() - t0 >= ms) return false;
      }
      while (row < size) {
        bakeRow(c, plan, r, wear, row, seed);
        row++;
        if (row < size && performance.now() - t0 >= ms) return false;
      }
      job.done = true;
      return true;
    },
  };
  return job;
}

function bakeRow(c: Control, plan: LandscapePlan, r: Rasters, wear: Float32Array, iz: number, seed: number): void {
  const px = c.size;
  const half = plan.half;
  for (let ix = 0; ix < px; ix++) {
    const x = world(c, ix);
    const z = world(c, iz);
    const k = iz * px + ix;
    const o = k * 4;
    const box = Math.max(Math.abs(x), Math.abs(z)) / (half * PLOT_MARGIN);
    const ragged = box + (fbm(x / 26 + 5, z / 26 - 3, seed + 21, 3) - 0.5) * 0.24;
    // Lawn inside, fraying to meadow across the verge; the map's own border is all meadow.
    let meadow = 1 - smooth01((1.08 - ragged) / 0.3);
    // Rough unmown patches inside the plot, and verges along the roads.
    const rough = smooth01((fbm(x / 21 - 8, z / 21 + 2, seed + 22, 3) - 0.66) / 0.1);
    meadow = Math.max(meadow, rough * 0.55);
    const roadside = smooth01(1 - Math.max(0, r.road[k]) / 7) * (1 - smooth01(1 - Math.max(0, r.road[k]) / 1.2));
    meadow = Math.max(meadow, roadside * (0.35 + 0.4 * fbm(x / 9, z / 9, seed + 23, 2)));
    // Dryness: soft patches, more on the road edges.
    const dryN = fbm(x / 58 + 1, z / 58 + 9, seed + 24, 3);
    let dry = smooth01((dryN - 0.46) / 0.32) * 0.75;
    dry = Math.min(1, dry + roadside * 0.18);
    // Wear: desire lines, and dust along the road edge.
    const dust = (1 - smooth01(Math.max(0, r.road[k]) / 1.1)) * smooth01((fbm(x / 5, z / 5, seed + 25, 2) - 0.4) / 0.25) * 0.55;
    const worn = Math.min(1, Math.max(wear[k], r.road[k] < 4 ? dust : 0));
    // Grass.
    const nearRoad = smooth01(r.road[k] / 0.9);
    const nearBuild = smooth01(r.build[k] / 0.8);
    const notPaved = smooth01(r.paved[k] / 1.5 + 0.02);
    const notWater = smooth01((r.water[k] - 0.4) / 1.5);
    const notField = smooth01(r.field[k] / 1.0 + 0.02);
    const grass = nearRoad * nearBuild * notPaved * notWater * notField;
    c.data[o] = Math.round(meadow * 255);
    c.data[o + 1] = Math.round(dry * 255);
    c.data[o + 2] = Math.round(worn * 255);
    c.data[o + 3] = Math.round(grass * 255);
  }
}

/** The whole bake at once. */
export function bakeControl(city: CityModel, plan: LandscapePlan, size = CTL_SIZE): Control {
  const job = bakeJob(city, plan, size);
  job.run(Infinity);
  return job.control;
}

/** Sample the map's channel at a world point, nearest pixel: for tests and for placement. */
export function sampleControl(c: Control, x: number, z: number, channel: 0 | 1 | 2 | 3): number {
  const ix = Math.max(0, Math.min(c.size - 1, Math.floor(((x - c.min) / c.span) * c.size)));
  const iz = Math.max(0, Math.min(c.size - 1, Math.floor(((z - c.min) / c.span) * c.size)));
  return c.data[at(c.size, ix, iz) + channel] / 255;
}
