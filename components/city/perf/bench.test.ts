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
  Matrix4,
  MeshBasicMaterial,
  PerspectiveCamera,
  Quaternion,
  Raycaster,
  Vector2,
  Vector3,
  type Intersection,
} from "three";
import type { RepoAnalysis } from "@/types/analysis";
import type { CityModel, ConstructionSite, Incident } from "@/types/city";
import { generateCity } from "@/lib/city/generator";
import { mulberry32 } from "@/lib/city/prng";
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

  // TODO(S5): unskip once `blockages.ts` bins segments into the 16-unit grid
  // (76.9). The brute-force loop is segments x obstacles: with all 1,499
  // obstacles over the 138 segments of today's layout it measured about
  // 75 ms on the development desktop before S5, well over the 30 ms target.
  it.skip(`blockedStretches(stress) with every crowd object in a lane within ${bound("blockedStretches")} ms`, ({
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

  // TODO(S5): unskip once `components/city/backlog/pick.ts` lands. Replace
  // the marked line with S5's raycast (76.9: a slab test per instance against
  // its `size`, writing `{ distance, point, object, instanceId }`). The
  // harness around it is the gate: one InstancedMesh per crowd form, rays
  // from the overview camera through random screen points, the median cost of
  // one pointer move over every crowd mesh. Before S5, with three's own
  // instanced raycast against unit boxes standing in for the forms, it
  // measured about 0.45 ms a move; real forms have ten times the triangles,
  // which is why 76.9 replaces the triangle test with a slab test.
  it.skip(`a pointer-move raycast over every crowd mesh within ${bound("raycast")} ms`, ({
    annotate,
  }) => {
    const items = crowd(city);
    const byForm = new Map<string, (Incident | ConstructionSite)[]>();
    for (const item of items) {
      const form = item.form ?? item.kind;
      byForm.set(form, [...(byForm.get(form) ?? []), item]);
    }

    const geometry = new BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const material = new MeshBasicMaterial();
    const matrix = new Matrix4();
    const rotation = new Quaternion();
    const up = new Vector3(0, 1, 0);
    const meshes: InstancedMesh[] = [];
    for (const group of byForm.values()) {
      const mesh = new InstancedMesh(geometry, material, group.length);
      group.forEach((item, i) => {
        const [w, h, d] = item.size ?? [2, 2, 2];
        rotation.setFromAxisAngle(up, item.rotationY);
        matrix.compose(new Vector3(...item.position), rotation, new Vector3(w, h, d));
        mesh.setMatrixAt(i, matrix);
      });
      mesh.computeBoundingSphere();
      // mesh.raycast = <S5's pick.ts raycast for this mesh>;  <- TODO(S5)
      meshes.push(mesh);
    }

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
      `raycast: ${items.length} crowd instances in ${meshes.length} meshes, ` +
        `${ms(perMove)} per pointer move (target ${BUDGET.raycast.target} ms)`,
    );
    expect(perMove).toBeLessThanOrEqual(bound("raycast"));
  });
});
