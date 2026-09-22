import { describe, expect, it } from "vitest";
import {
  MAX_WALKERS,
  PAVEMENT_MARGIN,
  advanceWalker,
  idleGroups,
  spawnWalkers,
  walkerCount,
  walkerPose,
} from "./pedestrians";
import { roadGraph } from "../../traffic";
import { prngFor } from "@/lib/city/seed";
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
    const base = { t: 0.5, speed: 1, phase: 0, colorIndex: 0, segment: 0, forward: true };
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
});
