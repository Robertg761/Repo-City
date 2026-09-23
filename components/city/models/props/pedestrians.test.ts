import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  MAX_WALKERS,
  PAVEMENT_MARGIN,
  PERSON_COLORS,
  SKIN_TONES,
  WALKER_CLEARANCE,
  advanceWalker,
  clearOfBlocks,
  idleGroups,
  pavementBlocks,
  spawnWalkers,
  walkerCount,
  walkerPose,
} from "./pedestrians";
import { pavementObstacles, type Obstacle } from "../../blockages";
import { roadStyle } from "../../groundwork";
import { roadGraph } from "../../traffic";
import { generateCity } from "@/lib/city/generator";
import { prngFor } from "@/lib/city/seed";
import type { RepoAnalysis } from "@/types/analysis";
import type { Landmark, RoadSegment } from "@/types/city";
import { devCity } from "@/fixtures/dev.city";

const CROSS: RoadSegment[] = [
  { id: "n", from: [0, 0, -20], to: [0, 0, 0], width: 7, major: true, appearAt: 200 },
  { id: "s", from: [0, 0, 0], to: [0, 0, 20], width: 7, major: true, appearAt: 200 },
  { id: "w", from: [-20, 0, 0], to: [0, 0, 0], width: 4.5, major: false, appearAt: 200 },
  { id: "e", from: [0, 0, 0], to: [20, 0, 0], width: 4.5, major: false, appearAt: 200 },
];

function landmark(landmarkType: Landmark["landmarkType"], x: number, z: number): Landmark {
  return {
    id: `landmark-${landmarkType}`,
    kind: "landmark",
    position: [x, 0, z],
    rotationY: 0,
    title: landmarkType,
    subtitle: "",
    description: "",
    reason: "",
    sourceUrl: null,
    visualState: "normal",
    appearAt: 0,
    landmarkType,
    level: 2,
    state: "healthy",
    size: [14, 8, 14],
  };
}

describe("walkerCount", () => {
  it("follows the density up to the cap", () => {
    expect(walkerCount(0, false)).toBe(0);
    expect(walkerCount(0.5, false)).toBe(30);
    expect(walkerCount(1, false)).toBe(60);
    expect(walkerCount(5, false)).toBe(60);
    expect(walkerCount(1, false)).toBeLessThanOrEqual(MAX_WALKERS);
  });

  it("empties the pavements of an archived city without clearing them", () => {
    expect(walkerCount(1, true)).toBeLessThanOrEqual(3);
    expect(walkerCount(0, true)).toBe(0);
  });
});

describe("spawnWalkers", () => {
  it("is deterministic for a seed and differs across seeds", () => {
    const a = spawnWalkers(CROSS, 20, prngFor("owner/repo@aaa", "pedestrians"));
    const b = spawnWalkers(CROSS, 20, prngFor("owner/repo@aaa", "pedestrians"));
    const c = spawnWalkers(CROSS, 20, prngFor("owner/repo@bbb", "pedestrians"));
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it("caps the crowd and needs a road worth walking down", () => {
    expect(spawnWalkers(CROSS, 500, prngFor("s", "pedestrians"))).toHaveLength(MAX_WALKERS);
    const stub: RoadSegment[] = [
      { id: "x", from: [0, 0, 0], to: [2, 0, 0], width: 4, major: false, appearAt: 0 },
    ];
    expect(spawnWalkers(stub, 10, prngFor("s", "pedestrians"))).toEqual([]);
  });
});

describe("walkerPose", () => {
  const graph = roadGraph(CROSS);

  it("stands clear of the carriageway on either pavement", () => {
    const base = { t: 0.5, speed: 1, phase: 0, colorIndex: 0, height: 1, skinIndex: 0, segment: 0, forward: true };
    const right = walkerPose(graph, { ...base, side: 1 });
    const left = walkerPose(graph, { ...base, side: -1 });
    const halfRoad = CROSS[0].width / 2;
    expect(Math.abs(right.x)).toBeCloseTo(halfRoad + PAVEMENT_MARGIN);
    expect(Math.sign(right.x)).toBe(-Math.sign(left.x));
    expect(Math.abs(right.x)).toBeGreaterThan(halfRoad);
  });

  it("faces along the direction of travel", () => {
    const east = walkerPose(graph, {
      segment: 3,
      forward: true,
      t: 0.2,
      speed: 1,
      side: 1,
      phase: 0,
      colorIndex: 0,
      height: 1,
      skinIndex: 0,
    });
    expect(east.angle).toBeCloseTo(Math.PI / 2);
  });
});

describe("a crowd walking the fixture network", () => {
  it("stays on the pavement and keeps turning corners", () => {
    const graph = roadGraph(devCity.roads);
    const prng = prngFor(devCity.seed, "pedestrians");
    const walkers = spawnWalkers(devCity.roads, MAX_WALKERS, prng);
    expect(walkers.length).toBeGreaterThan(0);
    const visited = walkers.map((walker) => new Set<number>([walker.segment]));

    // Two minutes: a person does about a hundred units in that time, which is
    // longer than the longest street in the fixture city.
    for (let frame = 0; frame < 60 * 120; frame++) {
      walkers.forEach((walker, i) => {
        advanceWalker(graph, walker, 1 / 60, prng);
        visited[i].add(walker.segment);
      });
    }

    walkers.forEach((walker, i) => {
      const segment = graph.segments[walker.segment];
      expect(segment).toBeDefined();
      expect(walker.t).toBeGreaterThanOrEqual(0);
      expect(walker.t).toBeLessThan(1);
      const pose = walkerPose(graph, walker);
      expect(Number.isFinite(pose.x)).toBe(true);
      expect(Number.isFinite(pose.z)).toBe(true);
      // A person is never inside the carriageway the cars are using: the
      // perpendicular distance to the centreline clears half the road.
      const dx = segment.to[0] - segment.from[0];
      const dz = segment.to[2] - segment.from[2];
      const length = Math.hypot(dx, dz) || 1;
      const offset = Math.abs(
        ((pose.x - segment.from[0]) * dz - (pose.z - segment.from[2]) * dx) / length,
      );
      expect(offset).toBeCloseTo(segment.width / 2 + PAVEMENT_MARGIN, 5);
      expect(visited[i].size).toBeGreaterThan(1);
    });
  });
});

describe("idleGroups", () => {
  it("gathers people outside the town hall and the information centre only", () => {
    const prng = prngFor("seed", "idle");
    const figures = idleGroups(
      [landmark("civic", 10, 10), landmark("info", -30, 4), landmark("power", 60, 60)],
      prng,
    );
    expect(figures).toHaveLength(8);
    const nearPower = figures.filter((f) => Math.hypot(f.position[0] - 60, f.position[2] - 60) < 20);
    expect(nearPower).toHaveLength(0);
  });

  it("keeps the group off the building's own plot", () => {
    const hall = landmark("civic", 0, 0);
    for (const figure of idleGroups([hall], prngFor("seed", "idle"))) {
      const distance = Math.hypot(figure.position[0], figure.position[2]);
      expect(distance).toBeGreaterThanOrEqual(5.8);
      expect(distance).toBeLessThan(12);
    }
  });

  it("gives every figure a seeded height and skin tone", () => {
    const figures = idleGroups([landmark("civic", 0, 0)], prngFor("seed", "idle"));
    for (const figure of figures) {
      expect(figure.height).toBeGreaterThanOrEqual(0.88);
      expect(figure.height).toBeLessThan(1.1);
      expect(SKIN_TONES[figure.skinIndex]).toBeDefined();
    }
  });
});

describe("spawnWalkers looks", () => {
  it("varies height, clothes and skin across a crowd", () => {
    const crowd = spawnWalkers(devCity.roads, 60, prngFor("seed", "pedestrians"));
    expect(new Set(crowd.map((w) => w.height.toFixed(2))).size).toBeGreaterThan(20);
    expect(new Set(crowd.map((w) => w.skinIndex)).size).toBe(SKIN_TONES.length);
    for (const walker of crowd) expect(PERSON_COLORS[walker.colorIndex]).toBeDefined();
  });
});

describe("walkers and what stands on the pavement (PLAN.md 76.15)", () => {
  // Road "s" runs north to south along x = 0, 7 wide: its pavements are the
  // lines x = +4.5 (index 0, left of from -> to) and x = -4.5 (index 1).
  const hoarding: Obstacle = {
    id: "hoarding",
    x: 4.5,
    z: 10,
    rotationY: 0,
    minX: -1,
    maxX: 1,
    minZ: -1,
    maxZ: 1,
  };
  const s = CROSS.findIndex((road) => road.id === "s");
  const southbound = (t: number) => ({
    segment: s,
    forward: true,
    t,
    speed: 1,
    side: -1 as const,
    phase: 0,
    colorIndex: 0,
    height: 1,
    skinIndex: 0,
  });

  it("finds the stretch of pavement an obstacle stands on, and only that one", () => {
    const blocks = pavementBlocks(roadGraph(CROSS), [hoarding]);
    const [left, right] = blocks[s];
    expect(left).toHaveLength(2);
    expect(left[0]).toBeCloseTo(10 - 1 - WALKER_CLEARANCE, 5);
    expect(left[1]).toBeCloseTo(10 + 1 + WALKER_CLEARANCE, 5);
    expect(right).toEqual([]);
    blocks.forEach(([l, r], i) => {
      if (i !== s) expect([...l, ...r]).toEqual([]);
    });
  });

  it("follows the obstacle's rotation", () => {
    const graph = roadGraph(CROSS);
    // Long and thin: along the kerb it blocks 6 units, turned across it only 2.
    const long = { ...hoarding, minZ: -3, maxZ: 3 };
    const [along] = pavementBlocks(graph, [long])[s];
    const [across] = pavementBlocks(graph, [{ ...long, rotationY: Math.PI / 2 }])[s];
    expect(along[1] - along[0]).toBeCloseTo(6 + 2 * WALKER_CLEARANCE, 5);
    expect(across[1] - across[0]).toBeCloseTo(2 + 2 * WALKER_CLEARANCE, 5);
  });

  it("turns a walker back short of it, on the same pavement", () => {
    const graph = roadGraph(CROSS);
    const blocks = pavementBlocks(graph, [hoarding]);
    const walker = southbound(0.1);
    expect(walkerPose(graph, walker).x).toBeCloseTo(4.5, 5);
    const prng = prngFor("seed", "pedestrians");
    let turned = false;
    for (let frame = 0; frame < 60 * 10 && !turned; frame++) {
      advanceWalker(graph, walker, 1 / 60, prng, blocks);
      expect(walkerPose(graph, walker).z).toBeLessThan(10 - 1 - WALKER_CLEARANCE);
      turned = !walker.forward;
    }
    expect(turned).toBe(true);
    // Still on the same side of the street, now walking north.
    const pose = walkerPose(graph, walker);
    expect(pose.x).toBeCloseTo(4.5, 5);
    expect(Math.abs(pose.angle)).toBeCloseTo(Math.PI, 5);
  });

  it("moves a walker who starts inside a blocked stretch out of it", () => {
    const graph = roadGraph(CROSS);
    const walker = southbound(0.49);
    clearOfBlocks(graph, walker, pavementBlocks(graph, [hoarding]));
    const z = walkerPose(graph, walker).z;
    expect(z < 10 - 1 - WALKER_CLEARANCE || z > 10 + 1 + WALKER_CLEARANCE).toBe(true);
  });

  it("keeps the stress city's crowd out of its hoardings, scaffolds and scenes", () => {
    const stress = JSON.parse(
      readFileSync(path.join(process.cwd(), "fixtures", "stress.analysis.json"), "utf8"),
    ) as RepoAnalysis;
    const city = generateCity(stress);
    const streets = city.roads.filter((road) => roadStyle(road) !== "motorway");
    const graph = roadGraph(streets);
    const obstacles = pavementObstacles(city);
    const blocks = pavementBlocks(graph, obstacles);

    // Obstacles binned by 8-unit cell, so each pose tests only its neighbours.
    const CELL = 8;
    const cellKey = (cx: number, cz: number) => `${cx}:${cz}`;
    const grid = new Map<string, Obstacle[]>();
    for (const o of obstacles) {
      const reach = Math.hypot(Math.max(-o.minX, o.maxX), Math.max(-o.minZ, o.maxZ));
      for (let cx = Math.floor((o.x - reach) / CELL); cx <= Math.floor((o.x + reach) / CELL); cx++) {
        for (let cz = Math.floor((o.z - reach) / CELL); cz <= Math.floor((o.z + reach) / CELL); cz++) {
          const list = grid.get(cellKey(cx, cz)) ?? [];
          list.push(o);
          grid.set(cellKey(cx, cz), list);
        }
      }
    }
    const inside = (x: number, z: number) =>
      (grid.get(cellKey(Math.floor(x / CELL), Math.floor(z / CELL))) ?? []).some((o) => {
        const px = x - o.x;
        const pz = z - o.z;
        const cos = Math.cos(o.rotationY);
        const sin = Math.sin(o.rotationY);
        // World to the obstacle's frame: undo `rotation.y`.
        const lx = px * cos - pz * sin;
        const lz = px * sin + pz * cos;
        return lx > o.minX && lx < o.maxX && lz > o.minZ && lz < o.maxZ;
      });

    const walk = (withBlocks: boolean) => {
      const prng = prngFor(city.seed, "pedestrians");
      const walkers = spawnWalkers(streets, MAX_WALKERS, prng);
      if (withBlocks) for (const walker of walkers) clearOfBlocks(graph, walker, blocks);
      let hits = 0;
      for (let frame = 0; frame < 60 * 60; frame += 4) {
        for (const walker of walkers) {
          advanceWalker(graph, walker, 4 / 60, prng, withBlocks ? blocks : undefined);
          const pose = walkerPose(graph, walker);
          if (inside(pose.x, pose.z)) hits++;
        }
      }
      return hits;
    };

    // Without the blocks the crowd walks through something all the time.
    expect(walk(false)).toBeGreaterThan(100);
    expect(walk(true)).toBe(0);
  });
});
