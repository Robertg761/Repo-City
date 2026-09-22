import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CAR_HALF_LENGTH,
  CAR_HALF_WIDTH,
  MAX_CARS,
  MAX_FLEET,
  advanceCar,
  carCap,
  carPose,
  enterable,
  laneOffset,
  nextRide,
  roadGraph,
  spawnCars,
  type Car,
  type RoadGraph,
} from "./traffic";
import { INCIDENT_FOOTPRINT, blockedStretches, cityObstacles, type Blockages, type Obstacle } from "./blockages";
import { generateCity } from "@/lib/city/generator";
import { prngFor } from "@/lib/city/seed";
import type { RepoAnalysis } from "@/types/analysis";
import type { CityModel, RoadSegment } from "@/types/city";
import { devCity } from "@/fixtures/dev.city";

/** A plus-shaped junction: four arms meeting at the origin. */
const CROSS: RoadSegment[] = [
  { id: "n", from: [0, 0, -20], to: [0, 0, 0], width: 6, major: true, appearAt: 200 },
  { id: "s", from: [0, 0, 0], to: [0, 0, 20], width: 6, major: true, appearAt: 200 },
  { id: "w", from: [-20, 0, 0], to: [0, 0, 0], width: 4, major: false, appearAt: 200 },
  { id: "e", from: [0, 0, 0], to: [20, 0, 0], width: 4, major: false, appearAt: 200 },
];

const DEAD_END: RoadSegment[] = [{ id: "only", from: [0, 0, 0], to: [0, 0, 30], width: 5, major: true, appearAt: 200 }];

/** A car in the state `spawnCars` leaves it in, with any fields overridden. */
const car = (fields: Partial<Car> & Pick<Car, "segment" | "forward">): Car => ({
  t: 0,
  speed: 6,
  v: fields.speed ?? 6,
  lane: 1,
  colorIndex: 0,
  wait: 0,
  turn: null,
  next: null,
  ...fields,
});

/**
 * An incident obstacle as `cityObstacles` builds one: lying along +z, or
 * along +x for a heading of a quarter turn.
 */
const incident = (
  x: number,
  z: number,
  state: keyof typeof INCIDENT_FOOTPRINT = "collision",
  rotationY = 0,
): Obstacle => ({
  id: `incident-${x}-${z}`,
  x,
  z,
  rotationY,
  ...INCIDENT_FOOTPRINT[state],
});

/**
 * The blocked stretch a car's body is in, if any. The body is the longest in
 * the fleet, at the car's pose, so a car swung across the road halfway round
 * a U-turn counts as well as one driving straight. The stretches checked are
 * its own segment's and those of every segment meeting it at either end: a
 * car crossing a junction has its nose over the next road before it gets
 * there. A stretch covers its segment's lanes, and both it and the body are
 * rectangles, so this is a separating-axis test on their four axes.
 */
function trespass(graph: RoadGraph, blocks: Blockages, one: Car): string | null {
  const pose = carPose(graph, one);
  const hx = Math.sin(pose.angle);
  const hz = Math.cos(pose.angle);
  const [fromKey, toKey] = graph.nodeKeys[one.segment];
  const nearby = new Set([
    one.segment,
    ...(graph.byNode.get(fromKey) ?? []),
    ...(graph.byNode.get(toKey) ?? []),
  ]);
  for (const segment of nearby) {
    const road = graph.segments[segment];
    const length = graph.lengths[segment];
    if (length <= 0.001) continue;
    const ux = (road.to[0] - road.from[0]) / length;
    const uz = (road.to[2] - road.from[2]) / length;
    const band = laneOffset(road.width) + CAR_HALF_WIDTH;
    for (const stretch of blocks.bySegment[segment]) {
      const mid = (stretch.start + stretch.end) / 2;
      const half = (stretch.end - stretch.start) / 2;
      const dx = pose.x - (road.from[0] + ux * mid);
      const dz = pose.z - (road.from[2] + uz * mid);
      const axes: [number, number][] = [
        [ux, uz],
        [-uz, ux],
        [hx, hz],
        [-hz, hx],
      ];
      const apart = axes.some(([ax, az]) => {
        const gap = Math.abs(dx * ax + dz * az);
        const stretchReach = half * Math.abs(ux * ax + uz * az) + band * Math.abs(-uz * ax + ux * az);
        const bodyReach =
          CAR_HALF_LENGTH * Math.abs(hx * ax + hz * az) + CAR_HALF_WIDTH * Math.abs(-hz * ax + hx * az);
        return gap >= stretchReach + bodyReach - 1e-6;
      });
      if (!apart) {
        return `on segment ${one.segment} at t ${one.t.toFixed(3)}, into segment ${segment} [${stretch.start.toFixed(2)}, ${stretch.end.toFixed(2)}]`;
      }
    }
  }
  return null;
}

describe("roadGraph", () => {
  it("joins segments that share an endpoint", () => {
    const graph = roadGraph(CROSS);
    const atOrigin = graph.byNode.get(graph.nodeKeys[0][1]) ?? [];
    expect(atOrigin.sort()).toEqual([0, 1, 2, 3]);
  });

  it("tolerates endpoints that are close but not identical", () => {
    const graph = roadGraph([
      CROSS[0],
      { ...CROSS[1], from: [0.4, 0, 0.6] },
    ]);
    expect(graph.nodeKeys[0][1]).toBe(graph.nodeKeys[1][0]);
  });

  it("measures length in the xz plane", () => {
    expect(roadGraph(CROSS).lengths[0]).toBeCloseTo(20);
  });
});

describe("nextRide", () => {
  const graph = roadGraph(CROSS);

  it("continues onto a segment that touches the junction just reached", () => {
    const prng = prngFor("seed", "traffic");
    for (let i = 0; i < 50; i++) {
      const ride = nextRide(graph, { segment: 0, forward: true }, prng);
      expect(ride.segment).not.toBe(0);
      const [from, to] = graph.nodeKeys[ride.segment];
      expect(ride.forward ? from : to).toBe(graph.nodeKeys[0][1]);
    }
  });

  it("u-turns at a dead end instead of stalling", () => {
    const solo = roadGraph(DEAD_END);
    const prng = prngFor("seed", "traffic");
    expect(nextRide(solo, { segment: 0, forward: true }, prng)).toEqual({
      segment: 0,
      forward: false,
    });
  });

  it("is deterministic for a given seed", () => {
    const a = prngFor("owner/repo@sha", "traffic");
    const b = prngFor("owner/repo@sha", "traffic");
    for (let i = 0; i < 20; i++) {
      expect(nextRide(graph, { segment: 2, forward: true }, a)).toEqual(
        nextRide(graph, { segment: 2, forward: true }, b),
      );
    }
  });
});

describe("spawnCars", () => {
  it("caps the fleet at the performance budget", () => {
    expect(spawnCars(CROSS, 400, prngFor("s", "traffic"))).toHaveLength(MAX_FLEET);
    expect(spawnCars(CROSS, 12, prngFor("s", "traffic"))).toHaveLength(12);
  });

  it("takes each settlement's own vehicle cap (PLAN.md 76.5)", () => {
    expect(carCap("village")).toBe(10);
    expect(carCap("town")).toBe(24);
    expect(carCap("city")).toBe(MAX_CARS);
    expect(carCap("metropolis")).toBe(64);
    expect(MAX_FLEET).toBe(64);
    // A model from before settlements is a city, exactly as it was.
    expect(carCap(undefined)).toBe(MAX_CARS);
  });

  it("spawns a city's fleet exactly as before for any count up to its cap", () => {
    const a = spawnCars(CROSS, MAX_CARS, prngFor("s", "traffic"));
    const b = spawnCars(CROSS, 400, prngFor("s", "traffic")).slice(0, MAX_CARS);
    expect(a).toEqual(b);
  });

  it("returns nothing when there are no drivable roads", () => {
    expect(spawnCars([], 10, prngFor("s", "traffic"))).toEqual([]);
    const stub: RoadSegment[] = [{ id: "x", from: [0, 0, 0], to: [1, 0, 0], width: 4, major: false, appearAt: 200 }];
    expect(spawnCars(stub, 10, prngFor("s", "traffic"))).toEqual([]);
  });

  it("is deterministic for a given seed and differs across seeds", () => {
    const a = spawnCars(CROSS, 12, prngFor("owner/repo@aaa", "traffic"));
    const b = spawnCars(CROSS, 12, prngFor("owner/repo@aaa", "traffic"));
    const c = spawnCars(CROSS, 12, prngFor("owner/repo@bbb", "traffic"));
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it("puts every car on a real segment at a sane speed", () => {
    for (const one of spawnCars(CROSS, 40, prngFor("s", "traffic"))) {
      expect(CROSS[one.segment]).toBeDefined();
      expect(one.speed).toBeGreaterThan(0);
      expect(one.v).toBe(one.speed);
      expect(one.t).toBeGreaterThanOrEqual(0);
      expect(one.t).toBeLessThan(1);
    }
  });
});

describe("carPose", () => {
  const graph = roadGraph(CROSS);

  it("keeps opposing cars on opposite sides of the centre line", () => {
    const base = { t: 0.5, speed: 6, lane: 1.5 };
    const north = carPose(graph, car({ ...base, segment: 0, forward: true }));
    const south = carPose(graph, car({ ...base, segment: 0, forward: false }));
    expect(Math.sign(north.x)).toBe(-Math.sign(south.x));
    expect(Math.abs(north.x)).toBeCloseTo(1.5);
  });

  it("faces along the direction of travel", () => {
    const east = carPose(graph, car({ segment: 3, forward: true, t: 0.2, lane: 0 }));
    expect(east.angle).toBeCloseTo(Math.PI / 2);
  });

  it("swings a U-turn round a half circle from one lane into the other", () => {
    const base = { segment: 1, forward: true, t: 0.5, lane: 1.5 };
    const before = carPose(graph, car({ ...base, turn: 0 }));
    const halfway = carPose(graph, car({ ...base, turn: 0.5 }));
    const after = carPose(graph, car({ ...base, turn: 1 }));
    const reversed = carPose(graph, car({ ...base, forward: false, t: 0.5 }));
    const straight = carPose(graph, car(base));
    expect(before.x).toBeCloseTo(straight.x);
    expect(before.z).toBeCloseTo(straight.z);
    expect(before.angle).toBeCloseTo(straight.angle);
    // Halfway round: on the centre line, a lane ahead, facing across the road.
    expect(halfway.x).toBeCloseTo(0);
    expect(halfway.z).toBeCloseTo(11.5);
    expect(Math.abs(Math.sin(halfway.angle))).toBeCloseTo(1);
    // All the way round: exactly where the reversed ride puts the car.
    expect(after.x).toBeCloseTo(reversed.x);
    expect(after.z).toBeCloseTo(reversed.z);
    expect(Math.cos(after.angle - reversed.angle)).toBeCloseTo(1);
  });
});

describe("advanceCar", () => {
  const graph = roadGraph(CROSS);

  it("moves along the segment without leaving it when there is room", () => {
    const prng = prngFor("s", "traffic");
    const one = car({ segment: 0, forward: true, speed: 10 });
    advanceCar(graph, one, 1, prng);
    expect(one.segment).toBe(0);
    expect(one.t).toBeCloseTo(0.5);
  });

  it("hops to a connected segment at the junction", () => {
    const prng = prngFor("s", "traffic");
    const one = car({ segment: 0, forward: true, t: 0.9, speed: 10 });
    advanceCar(graph, one, 1, prng);
    expect(one.t).toBeLessThan(1);
    const [from, to] = graph.nodeKeys[one.segment];
    expect(one.forward ? from : to).toBe("0:0");
  });

  it("never runs past the end of a segment even at absurd speed", () => {
    const prng = prngFor("s", "traffic");
    const one = car({ segment: 0, forward: true, speed: 100000 });
    advanceCar(graph, one, 1, prng);
    expect(one.t).toBeLessThan(1);
    expect(one.t).toBeGreaterThanOrEqual(0);
  });

  it("slows into a dead end, turns round and drives back out", () => {
    const solo = roadGraph(DEAD_END);
    const prng = prngFor("s", "traffic");
    const one = car({ segment: 0, forward: true, t: 0.5, lane: laneOffset(5) });
    let turned = false;
    let slowest = Infinity;
    for (let frame = 0; frame < 60 * 6; frame++) {
      advanceCar(solo, one, 1 / 60, prng);
      if (one.turn !== null) turned = true;
      slowest = Math.min(slowest, one.v);
    }
    expect(turned).toBe(true);
    expect(slowest).toBeLessThan(one.speed / 2);
    expect(one.forward).toBe(false);
  });
});

describe("routing round blocked roads", () => {
  // A collision on the east arm, far enough out that a car can pull in from
  // the junction and stop short; road works on the west arm, too close to
  // the junction for that, though not so close that they close it.
  const graph = roadGraph(CROSS);
  const blocks = blockedStretches(graph, [
    incident(14, 0, "collision", Math.PI / 2),
    incident(-10.7, 0, "minor", Math.PI / 2),
  ]);

  it("knows which ends of a segment a car can still pull into", () => {
    // East arm, 20 long, scene from x = 7.2: room from the junction, none from the far end.
    expect(enterable(graph, 3, true, blocks)).toBe(true);
    expect(enterable(graph, 3, false, blocks)).toBe(false);
    // West arm, scene from x = -12.3 to -4.5: the other way round, and the
    // scene far enough from the junction to leave it open.
    expect(enterable(graph, 2, false, blocks)).toBe(false);
    expect(enterable(graph, 2, true, blocks)).toBe(true);
    // Without blockages everything is open.
    expect(enterable(graph, 2, false)).toBe(true);
  });

  it("never turns into a segment it cannot pull into when there is another way", () => {
    const prng = prngFor("seed", "traffic");
    const seen = new Set<number>();
    for (let i = 0; i < 200; i++) {
      const ride = nextRide(graph, { segment: 0, forward: true }, prng, blocks);
      expect(ride.segment).not.toBe(2);
      seen.add(ride.segment);
    }
    // The partly blocked east arm is still a choice: cars drive up to the cones.
    expect([...seen].sort()).toEqual([1, 3]);
  });

  it("turns round at a junction whose every exit is blocked", () => {
    // A collision in the middle of the junction reaches all four arms.
    const shut = blockedStretches(graph, [incident(0, 4)]);
    const prng = prngFor("seed", "traffic");
    expect(nextRide(graph, { segment: 0, forward: true }, prng, shut)).toEqual({
      segment: 0,
      forward: false,
    });
  });

  it("brakes, stops short of the cones, waits and turns back", () => {
    const road = roadGraph([{ id: "long", from: [0, 0, 0], to: [0, 0, 80], width: 7, major: true, appearAt: 0 }]);
    const shut = blockedStretches(road, [incident(0, 50)]);
    const prng = prngFor("seed", "traffic");
    const one = car({ segment: 0, forward: true, t: 0.1, lane: laneOffset(7) });
    const phases: string[] = [];
    let closest = 0;
    for (let frame = 0; frame < 60 * 20; frame++) {
      advanceCar(road, one, 1 / 60, prng, shut);
      expect(trespass(road, shut, one)).toBeNull();
      if (one.forward && one.turn === null) closest = Math.max(closest, one.t * 80);
      const phase = one.turn !== null ? "turn" : one.wait > 0 ? "wait" : one.forward ? "towards" : "away";
      if (phases[phases.length - 1] !== phase) phases.push(phase);
    }
    expect(phases.slice(0, 4)).toEqual(["towards", "wait", "turn", "away"]);
    // Pulled up short of the scene, not a car's length back down the road.
    const stretch = shut.bySegment[0][0];
    expect(closest).toBeLessThan(stretch.start - CAR_HALF_LENGTH);
    expect(closest).toBeGreaterThan(stretch.start - CAR_HALF_LENGTH - 4);
  });

  it("keeps a car moving on a dead end whose only way out is blocked", () => {
    // A thirty unit cul-de-sac off a junction, and the only road on from that
    // junction closed by a collision.
    const roads: RoadSegment[] = [
      { id: "close", from: [0, 0, 0], to: [0, 0, 30], width: 4.5, major: false, appearAt: 0 },
      { id: "exit", from: [0, 0, 30], to: [0, 0, 44], width: 4.5, major: false, appearAt: 0 },
    ];
    const cul = roadGraph(roads);
    const shut = blockedStretches(cul, [incident(0, 37, "minor")]);
    expect(shut.bySegment[1][0].closed).toBe(true);
    const prng = prngFor("seed", "traffic");
    const one = car({ segment: 0, forward: true, t: 0.2, lane: laneOffset(4.5) });
    let turns = 0;
    let travelled = 0;
    let last = carPose(cul, one);
    for (let frame = 0; frame < 60 * 60; frame++) {
      const wasTurning = one.turn !== null;
      advanceCar(cul, one, 1 / 60, prng, shut);
      if (!wasTurning && one.turn !== null) turns++;
      expect(one.segment).toBe(0);
      const pose = carPose(cul, one);
      travelled += Math.hypot(pose.x - last.x, pose.z - last.z);
      last = pose;
    }
    expect(turns).toBeGreaterThan(4);
    expect(travelled).toBeGreaterThan(150);
  });

  it("starts no car inside a blocked stretch or on a closed segment", () => {
    const cul = roadGraph([
      { id: "a", from: [0, 0, 0], to: [0, 0, 60], width: 7, major: true, appearAt: 0 },
      { id: "b", from: [0, 0, 60], to: [0, 0, 74], width: 7, major: true, appearAt: 0 },
    ]);
    const shut = blockedStretches(cul, [incident(0, 30), incident(0, 67, "minor")]);
    const cars = spawnCars(cul.segments, MAX_CARS, prngFor("seed", "traffic"), shut);
    expect(cars).toHaveLength(MAX_CARS);
    for (const one of cars) {
      expect(one.segment).toBe(0);
      expect(trespass(cul, shut, one)).toBeNull();
    }
  });

  it("spawns exactly as before when nothing is blocked", () => {
    const empty = blockedStretches(roadGraph(CROSS), []);
    expect(spawnCars(CROSS, 20, prngFor("s", "traffic"), empty)).toEqual(
      spawnCars(CROSS, 20, prngFor("s", "traffic")),
    );
  });
});

/**
 * The generator splits its roads at every junction, so a car's whole journey
 * is a chain of short segments. Half a minute of a full fleet on the fixture
 * network is the cheapest way to be sure they hand off cleanly rather than
 * drifting onto the pavement.
 */
describe("a fleet driving the fixture network", () => {
  it("keeps every car on a road, inside its carriageway, and turning", () => {
    const graph = roadGraph(devCity.roads);
    const blocks = blockedStretches(graph, cityObstacles(devCity));
    const prng = prngFor(devCity.seed, "traffic");
    const cars = spawnCars(devCity.roads, MAX_CARS, prng, blocks);
    const visited = cars.map((one) => new Set<number>([one.segment]));

    for (let frame = 0; frame < 60 * 30; frame++) {
      cars.forEach((one, i) => {
        advanceCar(graph, one, 1 / 60, prng, blocks);
        visited[i].add(one.segment);
      });
    }

    cars.forEach((one, i) => {
      const segment = graph.segments[one.segment];
      expect(segment).toBeDefined();
      expect(one.t).toBeGreaterThanOrEqual(0);
      expect(one.t).toBeLessThan(1);
      // The lane offset plus half a car body has to fit in half a carriageway.
      expect(one.lane + CAR_HALF_WIDTH).toBeLessThanOrEqual(segment.width / 2);
      const pose = carPose(graph, one);
      expect(Number.isFinite(pose.x)).toBe(true);
      expect(Number.isFinite(pose.z)).toBe(true);
      // Half a minute at the fixture's block size is several junctions.
      expect(visited[i].size).toBeGreaterThan(1);
    });
  });
});

/**
 * The real thing: generated cities with a full complement of incidents, a
 * full fleet, and three simulated minutes at thirty frames a second. No car
 * may ever have its body in a blocked stretch, and none may stall.
 */
describe("a fleet driving past the fixture incidents", () => {
  const load = (name: string): CityModel =>
    generateCity(
      JSON.parse(readFileSync(path.join(process.cwd(), "fixtures", name), "utf8")) as RepoAnalysis,
    );
  const cities: [string, CityModel][] = [
    ["dev", devCity],
    ...["react__react", "honojs__hono", "sample"].map(
      (name) => [name, load(`${name}.analysis.json`)] as [string, CityModel],
    ),
  ];

  /** Runs the fleet, checking every frame; returns the final state and what was seen. */
  function drive(city: CityModel, seconds: number) {
    const graph = roadGraph(city.roads);
    const blocks = blockedStretches(graph, cityObstacles(city));
    const prng = prngFor(city.seed, "traffic");
    const cars = spawnCars(city.roads, MAX_CARS, prng, blocks);
    const dt = 1 / 30;
    const window = 10 / dt;
    const moved = new Float64Array(cars.length);
    const last = cars.map((one) => carPose(graph, one));
    let stops = 0;
    const faults: string[] = [];

    for (let frame = 1; frame <= seconds / dt; frame++) {
      cars.forEach((one, i) => {
        const waiting = one.wait > 0;
        advanceCar(graph, one, dt, prng, blocks);
        if (!waiting && one.wait > 0) stops++;
        const where = trespass(graph, blocks, one);
        if (where) faults.push(`car ${i} at frame ${frame}: ${where}`);
        const pose = carPose(graph, one);
        moved[i] += Math.hypot(pose.x - last[i].x, pose.z - last[i].z);
        last[i] = pose;
      });
      if (frame % window === 0) {
        // Every car covers real ground in every ten seconds: standing at the
        // cones takes one or two of them at most.
        moved.forEach((distance, i) => {
          if (distance < 8) faults.push(`car ${i} stalled before frame ${frame}: ${distance.toFixed(2)}`);
        });
        moved.fill(0);
      }
    }
    return { cars, stops, faults, stretches: blocks.stretches.length };
  }

  it.each(cities)("keeps %s's traffic out of every blocked stretch, and moving", (_, city) => {
    const { cars, faults, stretches } = drive(city, 180);
    expect(stretches).toBeGreaterThan(0);
    expect(cars.length).toBeLessThanOrEqual(MAX_CARS);
    expect(faults).toEqual([]);
  });

  it("has cars actually pull up at the cones somewhere", () => {
    const stops = cities.reduce((sum, [, city]) => sum + drive(city, 60).stops, 0);
    expect(stops).toBeGreaterThan(0);
  });

  it("drives the same way every time for a given seed", () => {
    const [, city] = cities[1];
    expect(drive(city, 30).cars).toEqual(drive(city, 30).cars);
  });
});
