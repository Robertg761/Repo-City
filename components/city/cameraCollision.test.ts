import { describe, expect, it } from "vitest";
import type { Vec3 } from "@/types/city";
import type { Obstacle } from "./entities";
import { COLLISION_PAD, MIN_HEIGHT, boxSolid, buildWorld, columnSolid, pushOut, treeColumn, type CameraWorld } from "./cameraCollision";

const box = (x: number, z: number, hw: number, hd: number, top: number, rotationY = 0): Obstacle => ({
  id: `b${x}_${z}`,
  x,
  z,
  cos: Math.cos(rotationY),
  sin: Math.sin(rotationY),
  hw,
  hd,
  top,
});

const run = (at: Vec3, obstacles: Obstacle[], pad = COLLISION_PAD, ground: CameraWorld["ground"] = null) => {
  const out: Vec3 = [0, 0, 0];
  const moved = pushOut(buildWorld(obstacles.map((o) => boxSolid(o)), ground), at, out, pad);
  return { out, moved };
};

/** Signed clearance to the plot: negative inside. */
const clearance = (p: Vec3, o: Obstacle) => {
  const dx = p[0] - o.x;
  const dz = p[2] - o.z;
  const lx = dx * o.cos - dz * o.sin;
  const lz = dx * o.sin + dz * o.cos;
  if (p[1] >= o.top) return p[1] - o.top;
  return Math.max(Math.abs(lx) - o.hw, Math.abs(lz) - o.hd);
};

describe("pushOut", () => {
  const tower = box(0, 0, 3, 3, 20);

  it("leaves a camera in the open alone", () => {
    const { out, moved } = run([20, 5, 0], [tower]);
    expect(moved).toBe(false);
    expect(out).toEqual([20, 5, 0]);
  });

  it("moves a camera inside a tower out by the nearest wall, with clearance", () => {
    const { out, moved } = run([2, 6, 0.5], [tower]);
    expect(moved).toBe(true);
    expect(out[0]).toBeCloseTo(3 + COLLISION_PAD);
    expect(out[1]).toBe(6);
    expect(out[2]).toBe(0.5);
  });

  it("keeps the near plane off a wall it is merely close to", () => {
    const { out, moved } = run([4, 6, 0], [tower]);
    expect(moved).toBe(true);
    expect(clearance(out, tower)).toBeGreaterThanOrEqual(COLLISION_PAD - 1e-9);
  });

  it("lifts a camera near a roof over it", () => {
    const { out } = run([0.5, 19.5, 0.2], [tower]);
    expect(out[0]).toBe(0.5);
    expect(out[1]).toBeCloseTo(20 + COLLISION_PAD);
  });

  it("handles a rotated plot in its own frame", () => {
    const turned = box(10, 10, 4, 1, 15, Math.PI / 2);
    // Turned a quarter, the plot is 2 wide in x and 8 long in z.
    const { out } = run([10.5, 3, 12], [turned]);
    expect(clearance(out, turned)).toBeGreaterThanOrEqual(COLLISION_PAD - 1e-9);
    // Nearest way out is along x (short side), not z.
    expect(Math.abs(out[2] - 12)).toBeLessThan(1e-6);
  });

  it("never ends inside when two plots leave too narrow a gap", () => {
    const a = box(-3.3, 0, 3, 3, 20);
    const b = box(3.3, 0, 3, 3, 20);
    // A 0.6 wide gap: nothing fits, so it is put out of the way over the roofs or on a wall.
    const { out } = run([0, 4, 0], [a, b]);
    for (const o of [a, b]) expect(clearance(out, o)).toBeGreaterThanOrEqual(-1e-6);
  });

  it("shrinks the clearance to fit an alley rather than bouncing between walls", () => {
    const a = box(-4, 0, 3, 3, 20);
    const b = box(4.4, 0, 3, 3, 20);
    const { out } = run([0.2, 4, 0], [a, b]);
    for (const o of [a, b]) expect(clearance(out, o)).toBeGreaterThanOrEqual(0.15);
  });

  it("is stable: a pushed camera is not pushed again", () => {
    const first = run([2, 6, 0.5], [tower]);
    const again = run(first.out, [tower]);
    expect(again.moved).toBe(false);
  });

  it("keeps the camera off the ground", () => {
    const { out, moved } = run([30, -5, 30], [tower]);
    expect(moved).toBe(true);
    expect(out[1]).toBe(MIN_HEIGHT);
  });

  it("does not allocate in its result: writes the out array it is given", () => {
    const out: Vec3 = [9, 9, 9];
    pushOut(buildWorld([boxSolid(tower)]), [0, 5, 0], out);
    expect(out).not.toEqual([9, 9, 9]);
  });

  it("follows the hills: the floor rises with the ground", () => {
    const hill = (x: number) => Math.max(0, x / 4);
    const world = buildWorld([], hill);
    const out: Vec3 = [0, 0, 0];
    expect(pushOut(world, [40, 3, 0], out)).toBe(true);
    expect(out[1]).toBeCloseTo(10 + MIN_HEIGHT);
    expect(pushOut(world, [40, 12, 0], out)).toBe(false);
    expect(pushOut(world, [-40, 2, 0], out)).toBe(false);
  });

  it("keeps out of a tree crown, round, and climbs a column it is over", () => {
    const tree = columnSolid(10, 10, 1.5, 5);
    const world = buildWorld([tree]);
    const out: Vec3 = [0, 0, 0];
    expect(pushOut(world, [10.5, 3, 10], out)).toBe(true);
    const gap = Math.hypot(out[0] - 10, out[2] - 10);
    expect(gap).toBeGreaterThanOrEqual(1.5 + COLLISION_PAD * 0.5 - 1e-6);
    expect(out[1]).toBe(3);
    expect(pushOut(world, [10, 7, 10], out)).toBe(false);
  });

  it("finds solids across grid cells and uses a tree's base on a hill", () => {
    const solids = [treeColumn(100, -100, 1, 0, 6), treeColumn(-200, 50, 2, 1)];
    const world = buildWorld(solids);
    const out: Vec3 = [0, 0, 0];
    expect(pushOut(world, [100.2, 7, -100], out)).toBe(true);
    expect(pushOut(world, [100, 14, -100], out)).toBe(false);
    expect(pushOut(world, [-200, 2, 50], out)).toBe(true);
    expect(pushOut(world, [0, 2, 0], out)).toBe(false);
  });
});
