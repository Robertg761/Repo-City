/**
 * Micro-benchmarks for PLAN.md 76.13, on `fixtures/stress.analysis.json`.
 *
 * Each case asserts a generous CI bound, several times the desktop target,
 * so a slow shared runner does not fail the build while an accidental
 * quadratic still does. `PERF_STRICT=1` asserts the desktop targets instead,
 * for the tuning pass on the reference machine. The measured numbers are
 * attached to each test as an annotation; see them with
 *
 *   pnpm vitest run components/city/perf --reporter=verbose
 *
 * Timings are the median of several runs after a warm-up, so the JIT and the
 * first-call caches (geometry, PRNG streams) are not what gets measured.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  BoxGeometry,
  InstancedMesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Raycaster,
  Vector2,
  type Intersection,
} from "three";
import type { RepoAnalysis } from "@/types/analysis";
import type { CityModel, ConstructionSite, Incident } from "@/types/city";
import { generateCity } from "@/lib/city/generator";
import { mulberry32 } from "@/lib/city/prng";
import { pickTable, raycastTable } from "../backlog/pick";
import { planCrowd } from "../backlog/plan";
import { blockedStretches, cityObstacles, type Obstacle } from "../blockages";
import { roadGraph } from "../traffic";
import { median } from "./stats";

const STRICT = process.env.PERF_STRICT === "1";

/** Desktop target from 76.13, and the bound CI is held to. */
const BUDGET = {
  generateCity: { target: 120, ci: 600 },
  blockedStretches: { target: 30, ci: 150 },
  raycast: { target: 1, ci: 5 },
} as const;

const bound = (name: keyof typeof BUDGET): number =>
  STRICT ? BUDGET[name].target : BUDGET[name].ci;

const stress = JSON.parse(
  readFileSync(path.join(process.cwd(), "fixtures", "stress.analysis.json"), "utf8"),
) as RepoAnalysis;

/** Median wall time of `runs` calls after `warmup` unmeasured ones, and the first call's. */
function time(fn: () => void, runs = 5, warmup = 1): { median: number; first: number } {
  const t0 = performance.now();
  fn();
  const first = performance.now() - t0;
  for (let i = 1; i < warmup; i++) fn();
  const samples: number[] = [];
  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    fn();
    samples.push(performance.now() - start);
  }
  return { median: median(samples), first };
}

const ms = (n: number): string => `${n.toFixed(2)} ms`;

/** Every crowd object as it will stand in the street. */
function crowd(city: CityModel): (Incident | ConstructionSite)[] {
  return [...(city.backlog?.incidents ?? []), ...(city.backlog?.constructionSites ?? [])];
}

/**
 * The worst case for the blockage pass: every crowd object as an obstacle,
 * footprint from its `size`, as if every one of them closed a lane. Real
 * cities close far fewer (76.8's lane budget), so this bounds the grid
 * version S5 writes from above.
 */
function everyCrowdObstacle(city: CityModel): Obstacle[] {
  return crowd(city).map((item) => {
    const [w, , d] = item.size ?? [2, 2, 2];
    return {
      id: item.id,
      x: item.position[0],
      z: item.position[2],
      rotationY: item.rotationY,
      minX: -w / 2,
      maxX: w / 2,
      minZ: -d / 2,
      maxZ: d / 2,
    };
  });
}

describe("performance micro-benchmarks (PLAN.md 76.13)", () => {
  const city = generateCity(stress);

  it("the stress fixture is the city the gate is written for", () => {
    expect(city.settlement?.tier).toBe("metropolis");
    expect(city.buildings.length).toBe(450);
    expect(crowd(city).length).toBeGreaterThan(1400);
  });

  it(`generateCity(stress) within ${bound("generateCity")} ms`, ({ annotate }) => {
    const result = time(() => generateCity(stress), 5, 1);
    void annotate(
      `generateCity: median ${ms(result.median)}, first ${ms(result.first)} ` +
        `(target ${BUDGET.generateCity.target} ms)`,
    );
    expect(result.median).toBeLessThanOrEqual(bound("generateCity"));
  });

  it(`blockedStretches(stress) on the city's own obstacles within ${bound("blockedStretches")} ms`, ({
    annotate,
  }) => {
    // Exactly what `Traffic.tsx` runs once per city. Before S5 that is the
    // heroes only; after it, the lane-closing crowd and the queue as well.
    const graph = roadGraph(city.roads);
    const obstacles = cityObstacles(city);
    const result = time(() => blockedStretches(graph, obstacles), 7, 2);
    void annotate(
      `blockedStretches: ${obstacles.length} obstacles over ${graph.segments.length} segments, ` +
        `median ${ms(result.median)} (target ${BUDGET.blockedStretches.target} ms)`,
    );
    expect(result.median).toBeLessThanOrEqual(bound("blockedStretches"));
  });

  // The worst case: every crowd object closing a lane at once. Before S5's
  // 16-unit grid in `blockages.ts` the brute-force loop (segments x
  // obstacles) took about 75 ms here on the development desktop.
  it(`blockedStretches(stress) with every crowd object in a lane within ${bound("blockedStretches")} ms`, ({
    annotate,
  }) => {
    const graph = roadGraph(city.roads);
    const obstacles = [...cityObstacles(city), ...everyCrowdObstacle(city)];
    const result = time(() => blockedStretches(graph, obstacles), 5, 1);
    void annotate(
      `blockedStretches worst case: ${obstacles.length} obstacles over ${graph.segments.length} ` +
        `segments, median ${ms(result.median)} (target ${BUDGET.blockedStretches.target} ms)`,
    );
    expect(result.median).toBeLessThanOrEqual(bound("blockedStretches"));
  });

  // The gate: one mesh per crowd form exactly as `Backlog.tsx` builds it,
  // each with S5's slab-test raycast (`backlog/pick.ts`), and rays from the
  // overview camera through random screen points. What is timed is one
  // pointer move over every crowd mesh. Before S5, three's own instanced
  // raycast against unit boxes standing in for the forms took about 0.45 ms
  // a move, and the real forms have ten times their triangles.
  it(`a pointer-move raycast over every crowd mesh within ${bound("raycast")} ms`, ({ annotate }) => {
    const plan = planCrowd(city);
    const geometry = new BoxGeometry(1, 1, 1);
    const material = new MeshBasicMaterial();
    const meshes: InstancedMesh[] = [];
    let instances = 0;
    for (const group of plan.groups) {
      const count = group.items.length;
      const mesh = new InstancedMesh(geometry, material, count);
      const table = pickTable(group.items);
      mesh.raycast = (raycaster, intersects) => raycastTable(table, count, mesh, raycaster, intersects);
      mesh.updateMatrixWorld();
      meshes.push(mesh);
      instances += count;
    }
    expect(instances).toBe(crowd(city).length);

    const size = city.bounds.size;
    const camera = new PerspectiveCamera(35, 16 / 9, 2, 2000);
    camera.position.set(size * 0.75, size * 1.1, size * 0.75);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    const raycaster = new Raycaster();
    const prng = mulberry32(76_13);
    const pointer = new Vector2();
    const hits: Intersection[] = [];
    const move = () => {
      pointer.set(prng.range(-1, 1), prng.range(-1, 1));
      raycaster.setFromCamera(pointer, camera);
      hits.length = 0;
      raycaster.intersectObjects(meshes, false, hits);
    };

    const result = time(() => {
      for (let i = 0; i < 50; i++) move();
    }, 5, 1);
    const perMove = result.median / 50;
    void annotate(
      `raycast: ${instances} crowd instances in ${meshes.length} meshes, ` +
        `${ms(perMove)} per pointer move (target ${BUDGET.raycast.target} ms)`,
    );
    expect(perMove).toBeLessThanOrEqual(bound("raycast"));
  });
});
