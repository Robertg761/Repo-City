import type { CityModel, Vec3 } from "@/types/city";
import { CAMERA_CLEARANCE, framingObstacles, type Obstacle } from "./entities";

/**
 * Keeping a camera the viewer is steering out of the world.
 *
 * The orbit, the pan and the wheel know nothing of the city, so a low orbit
 * round a tower, or a zoom into a dense block, used to carry the camera
 * through a wall (and, with the near plane 2 units out, see the inside of it).
 * `pushOut` is the whole rule: a camera inside a solid (a building, landmark,
 * landscape house or tree crown), grown by its clearance, or under the ground
 * (which follows the hills), is moved out by the shortest way, sideways or up.
 * Called every frame after the controls have moved, the camera slides along a
 * wall the viewer drags it into, rather than stopping dead or snapping back.
 *
 * Solids live in a coarse grid built once per city, so a frame looks at the
 * few in the camera's cell, not every tree in the landscape.
 */

/** The wall clearance, a little under the tour's so the two never fight. */
export const COLLISION_PAD = CAMERA_CLEARANCE - 0.2;
/** Crowns are soft edged and small against a wall: they get a share of the clearance. */
export const TREE_PAD_SHARE = 0.5;
/** Passes over the solids: pushing clear of one may put the camera in the next. */
const PASSES = 4;
/** The lowest the camera may be above the ground. */
export const MIN_HEIGHT = 0.6;
/** The narrowest clearance worth keeping: the camera is at least outside. */
const MIN_PAD = 0.2;
const CELL = 16;

/** An upright box (`r` 0) or round column (`r` > 0) the camera keeps out of. */
export interface Solid {
  x: number;
  z: number;
  cos: number;
  sin: number;
  hw: number;
  hd: number;
  /** Radius of a column; 0 for a box. */
  r: number;
  /** Top of the solid in world height. */
  top: number;
  /** This solid's clearance as a share of the pad. */
  share: number;
}

export interface CameraWorld {
  cells: Map<number, Solid[]>;
  /** Ground height at a world point, or null for a flat ground at 0. */
  ground: ((x: number, z: number) => number) | null;
}

export const boxSolid = (o: Obstacle, share = 1): Solid => ({
  x: o.x, z: o.z, cos: o.cos, sin: o.sin, hw: o.hw, hd: o.hd, r: 0, top: o.top, share,
});

export const columnSolid = (x: number, z: number, r: number, top: number, share = TREE_PAD_SHARE): Solid => ({
  x, z, cos: 1, sin: 0, hw: r, hd: r, r, top, share,
});

const key = (ix: number, iz: number) => (ix + 4096) * 8192 + (iz + 4096);

export function buildWorld(solids: readonly Solid[], ground: CameraWorld["ground"] = null): CameraWorld {
  const cells = new Map<number, Solid[]>();
  for (const s of solids) {
    const reach = (s.r > 0 ? s.r : Math.hypot(s.hw, s.hd)) + COLLISION_PAD * s.share;
    const x0 = Math.floor((s.x - reach) / CELL);
    const x1 = Math.floor((s.x + reach) / CELL);
    const z0 = Math.floor((s.z - reach) / CELL);
    const z1 = Math.floor((s.z + reach) / CELL);
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const k = key(ix, iz);
        const list = cells.get(k);
        if (list) list.push(s);
        else cells.set(k, [s]);
      }
    }
  }
  return { cells, ground };
}

/** What the landscape adds to the world: its houses, towers, trees and its hills. */
export interface LandSolids {
  solids: Solid[];
  ground: (x: number, z: number) => number;
}

let land: { owner: object; solids: LandSolids } | null = null;
let built: { city: CityModel; land: object | null; world: CameraWorld } | null = null;

/** The landscape (`LandProvider`) announces itself, and withdraws when it goes. */
export function publishLand(owner: object, solids: LandSolids | null): void {
  if (solids) land = { owner, solids };
  else if (land?.owner === owner) land = null;
}

/** Column measures per tree kind, in the tree's own units: radius and height. */
const TREE_KIND: readonly (readonly [number, number])[] = [
  [1.25, 3.8], // broadleaf
  [1.15, 4.4], // conifer
  [1.6, 4.0], // far canopy mass
  [0.55, 5.4], // poplar
  [0.85, 4.3], // birch
];

export function treeColumn(x: number, z: number, scale: number, kind: number, base = 0): Solid {
  const [r, h] = TREE_KIND[kind] ?? TREE_KIND[0];
  return columnSolid(x, z, r * scale, base + h * scale);
}

/** The city's solids, plus the landscape's when it has been planned. Cached per pair. */
export function worldFor(city: CityModel): CameraWorld {
  const l = land?.solids ?? null;
  if (built && built.city === city && built.land === l) return built.world;
  const solids: Solid[] = framingObstacles(city).map((o) => boxSolid(o));
  for (const t of city.props.trees) solids.push(treeColumn(t[0], t[2], 1.05, 0, t[1]));
  if (l) for (const s of l.solids) solids.push(s);
  const world = buildWorld(solids, l?.ground ?? null);
  built = { city, land: l, world };
  return world;
}

const EMPTY: Solid[] = [];

function near(world: CameraWorld, x: number, z: number): Solid[] {
  return world.cells.get(key(Math.floor(x / CELL), Math.floor(z / CELL))) ?? EMPTY;
}

/** Whether `at` is inside a solid grown by `pad * share`. */
function inside(world: CameraWorld, at: Vec3, pad: number): boolean {
  const list = near(world, at[0], at[2]);
  for (let i = 0; i < list.length; i++) {
    const o = list[i];
    const p = pad * o.share;
    const dx = at[0] - o.x;
    const dz = at[2] - o.z;
    if (at[1] >= o.top + p) continue;
    if (o.r > 0) {
      const reach = o.r + p;
      if (dx * dx + dz * dz < reach * reach - 1e-6) return true;
      continue;
    }
    const lx = dx * o.cos - dz * o.sin;
    const lz = dx * o.sin + dz * o.cos;
    if (Math.abs(lx) < o.hw + p - 1e-6 && Math.abs(lz) < o.hd + p - 1e-6) return true;
  }
  return false;
}

function push(world: CameraWorld, out: Vec3, pad: number): void {
  for (let pass = 0; pass < PASSES; pass++) {
    const list = near(world, out[0], out[2]);
    let changed = false;
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      const p = pad * o.share;
      const ey = o.top + p - out[1];
      if (ey <= 0) continue;
      const dx = out[0] - o.x;
      const dz = out[2] - o.z;
      if (o.r > 0) {
        const reach = o.r + p;
        const d2 = dx * dx + dz * dz;
        if (d2 >= reach * reach) continue;
        const d = Math.sqrt(d2);
        const er = reach - d;
        if (ey <= er) out[1] += ey;
        else if (d < 1e-6) out[0] += reach;
        else {
          out[0] += (dx / d) * er;
          out[2] += (dz / d) * er;
        }
        changed = true;
        continue;
      }
      const lx = dx * o.cos - dz * o.sin;
      const lz = dx * o.sin + dz * o.cos;
      const ex = o.hw + p - Math.abs(lx);
      const ez = o.hd + p - Math.abs(lz);
      if (ex <= 0 || ez <= 0) continue;
      if (ey <= ex && ey <= ez) {
        out[1] += ey;
      } else if (ex <= ez) {
        const s = lx < 0 ? -ex : ex;
        out[0] += s * o.cos;
        out[2] -= s * o.sin;
      } else {
        const s = lz < 0 ? -ez : ez;
        out[0] += s * o.sin;
        out[2] += s * o.cos;
      }
      changed = true;
    }
    if (!changed) return;
  }
}

function lift(world: CameraWorld, at: Vec3): boolean {
  const floor = (world.ground ? world.ground(at[0], at[2]) : 0) + MIN_HEIGHT;
  if (at[1] >= floor) return false;
  at[1] = floor;
  return true;
}

/**
 * Moves `position` out of every solid it is inside (or within its clearance
 * of), and up off the ground, writing into `out` and returning whether it
 * moved. Allocation free.
 *
 * A gap too narrow to hold the camera at full clearance would bounce it from
 * one wall to the other, so there it settles for less room: the pad shrinks
 * until the camera fits.
 */
export function pushOut(world: CameraWorld, position: Vec3, out: Vec3, pad = COLLISION_PAD): boolean {
  out[0] = position[0];
  out[1] = position[1];
  out[2] = position[2];
  const floored = lift(world, out);
  if (!inside(world, out, pad)) return floored;
  let p = pad;
  for (;;) {
    push(world, out, p);
    lift(world, out);
    if (!inside(world, out, p)) return true;
    if (p <= MIN_PAD) return true;
    p = Math.max(MIN_PAD, p * 0.45);
    out[0] = position[0];
    out[1] = position[1];
    out[2] = position[2];
    lift(world, out);
  }
}
