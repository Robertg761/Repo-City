import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CAR_HALF_LENGTH,
  CAR_HALF_WIDTH,
  DEAD_END,
  MAX_CARS,
  MAX_FLEET,
  REROUTE_AFTER,
  TRACTOR_SHARE,
  carCap,
  carLane,
  carPose,
  createTraffic,
  enterable,
  laneOffset,
  nextRide,
  roadGraph,
  spawnCars,
  stepTraffic,
  tractorsFor,
  type Car,
  type CarPose,
  type Traffic,
} from "./traffic";
import { INCIDENT_FOOTPRINT, blockedStretches, type Blockages, type Obstacle } from "./blockages";
import { bodiesOverlap, junctionNetwork, movesConflict } from "./junctions";
import { laneOf } from "./lanes";
import { cityFleet } from "./fleet";
import { generateCity } from "@/lib/city/generator";
import { prngFor } from "@/lib/city/seed";
import type { RepoAnalysis, SettlementTier } from "@/types/analysis";
import type { CityModel, RoadSegment } from "@/types/city";
import { devCity } from "@/fixtures/dev.city";
import { devSettlements } from "@/fixtures/dev.settlements";

const road = (id: string, from: [number, number], to: [number, number], width = 6, major = true): RoadSegment => ({
  id,
  from: [from[0], 0, from[1]],
  to: [to[0], 0, to[1]],
  width,
  major,
  appearAt: 0,
});

/** A plus-shaped junction: four long arms meeting at the origin. */
const CROSS: RoadSegment[] = [
  road("n", [0, -40], [0, 0]),
  road("s", [0, 0], [0, 40]),
  road("w", [-40, 0], [0, 0], 4.5, false),
  road("e", [0, 0], [40, 0], 4.5, false),
];

const DEAD_END_ROAD: RoadSegment[] = [road("only", [0, 0], [0, 30], 5)];

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

const newPose = (): CarPose => ({ x: 0, z: 0, angle: 0, curvature: 0, reverse: false });
const angleGap = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

/** A car placed by hand on `lane`, `along` units in, in the state `spawnCars` leaves one. */
function placed(traffic: Traffic, lane: number, along: number, fields: Partial<Car> = {}): Car {
  const segment = lane >> 1;
  return {
    segment,
    forward: (lane & 1) === 0,
    t: along / traffic.graph.lengths[segment],
    speed: 5,
    v: 5,
    lane: traffic.network.lane[lane],
    colorIndex: 0,
    half: CAR_HALF_LENGTH,
    wait: 0,
    stood: false,
    turn: null,
    move: -1,
    s: 0,
    plan: -9,
    holds: -1,
    holdMove: -1,
    queuedAt: -1,
    rerouteAt: 0,
    ...fields,
  };
}

/** A traffic of hand-placed cars: `[lane, along, fields]` each. */
function handTraffic(roads: RoadSegment[], cars: [number, number, Partial<Car>?][], blocks?: Blockages, seed = "hand"): Traffic {
  const graph = roadGraph(roads);
  const empty = createTraffic(graph, [], prngFor(seed, "traffic"), blocks);
  const fleet = cars.map(([lane, along, fields]) => placed(empty, lane, along, fields));
  return createTraffic(graph, fleet, prngFor(seed, "traffic"), blocks);
}

/**
 * The blocked stretch a car's body is in, if any. A stretch covers its
 * segment's lanes, and both it and the body are rectangles, so this is a
 * separating-axis test. Every stretch within reach is checked, whatever the
 * car is doing: on a lane, through a junction or partway round a U-turn.
 */
function trespass(traffic: Traffic, blocks: Blockages, one: Car, pose: CarPose): string | null {
  const graph = traffic.graph;
  for (const stretch of blocks.stretches) {
    const road = graph.segments[stretch.segment];
    const length = graph.lengths[stretch.segment];
    if (length <= 0.001) continue;
    const ux = (road.to[0] - road.from[0]) / length;
    const uz = (road.to[2] - road.from[2]) / length;
    const mid = (stretch.start + stretch.end) / 2;
    const cx = road.from[0] + ux * mid;
    const cz = road.from[2] + uz * mid;
    if (Math.hypot(pose.x - cx, pose.z - cz) > 30) continue;
    const band = laneOffset(road.width) + CAR_HALF_WIDTH;
    if (bodiesOverlap(pose.x, pose.z, pose.angle, one.half, CAR_HALF_WIDTH, cx, cz, Math.atan2(ux, uz), (stretch.end - stretch.start) / 2, band)) {
      return `into segment ${stretch.segment} [${stretch.start.toFixed(2)}, ${stretch.end.toFixed(2)}]`;
    }
  }
  return null;
}

/** Everything a run can go wrong in, frame by frame. */
interface RunReport {
  overlaps: string[];
  trespasses: string[];
  stalls: string[];
  /** Fastest the heading of any car turned, radians per second. */
  fastestTurn: number;
  /** Furthest any car moved in one step, over the speed it was doing. */
  jumps: string[];
  stops: number;
  turnsRound: number;
  steps: number[];
}

/**
 * Drives a traffic for `seconds` at thirty steps a second, checking every
 * step: no two bodies touch, none is in a blocked stretch, every heading and
 * position moves continuously, and every car covers real ground in every
 * `window` seconds.
 */
function drive(traffic: Traffic, seconds: number, blocks?: Blockages, window = 30): RunReport {
  const cars = traffic.cars;
  const dt = 1 / 30;
  const poses = cars.map(() => newPose());
  const last = cars.map((car) => carPose(traffic, car, newPose()));
  const moved = new Float64Array(cars.length);
  const report: RunReport = { overlaps: [], trespasses: [], stalls: [], fastestTurn: 0, jumps: [], stops: 0, turnsRound: 0, steps: [] };
  const waiting = cars.map(() => false);
  const turning = cars.map(() => false);
  for (let frame = 1; frame <= seconds * 30; frame++) {
    const started = performance.now();
    stepTraffic(traffic, dt);
    report.steps.push(performance.now() - started);
    cars.forEach((car, i) => carPose(traffic, car, poses[i]));
    for (let i = 0; i < cars.length; i++) {
      const car = cars[i];
      const p = poses[i];
      const q = last[i];
      const rate = angleGap(p.angle, q.angle) / dt;
      if (rate > report.fastestTurn) report.fastestTurn = rate;
      const step = Math.hypot(p.x - q.x, p.z - q.z);
      if (step > 8 * dt + 1e-6 && report.jumps.length < 5) report.jumps.push(`car ${i} jumped ${step.toFixed(2)} at frame ${frame}`);
      moved[i] += step;
      if (car.wait > 0 && car.stood && !waiting[i]) report.stops++;
      waiting[i] = car.wait > 0 && car.stood;
      if (car.turn !== null && !turning[i]) report.turnsRound++;
      turning[i] = car.turn !== null;
      for (let j = i + 1; j < cars.length; j++) {
        const o = poses[j];
        if (bodiesOverlap(p.x, p.z, p.angle, car.half, CAR_HALF_WIDTH, o.x, o.z, o.angle, cars[j].half, CAR_HALF_WIDTH)) {
          if (report.overlaps.length < 5) report.overlaps.push(`cars ${i} and ${j} at frame ${frame}`);
        }
      }
      if (blocks) {
        const where = trespass(traffic, blocks, car, p);
        if (where && report.trespasses.length < 5) report.trespasses.push(`car ${i} at frame ${frame}: ${where}`);
      }
      q.x = p.x;
      q.z = p.z;
      q.angle = p.angle;
    }
    if (frame % (window * 30) === 0) {
      moved.forEach((distance, i) => {
        if (distance < 5) report.stalls.push(`car ${i} moved ${distance.toFixed(2)} before frame ${frame}`);
      });
      moved.fill(0);
    }
  }
  return report;
}

describe("roadGraph", () => {
  it("joins segments that share an endpoint", () => {
    const graph = roadGraph(CROSS);
    const atOrigin = graph.byNode.get(graph.nodeKeys[0][1]) ?? [];
    expect(atOrigin.sort()).toEqual([0, 1, 2, 3]);
  });

  it("tolerates endpoints that are close but not identical", () => {
    const graph = roadGraph([CROSS[0], { ...CROSS[1], from: [0.4, 0, 0.6] }]);
    expect(graph.nodeKeys[0][1]).toBe(graph.nodeKeys[1][0]);
  });

  it("measures length in the xz plane", () => {
    expect(roadGraph(CROSS).lengths[0]).toBeCloseTo(40);
  });
});

describe("nextRide (the pavements' walk)", () => {
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

  it("turns back at a dead end instead of stalling", () => {
    const solo = roadGraph(DEAD_END_ROAD);
    expect(nextRide(solo, { segment: 0, forward: true }, prngFor("seed", "traffic"))).toEqual({ segment: 0, forward: false });
  });
});

describe("spawnCars", () => {
  const graph = roadGraph(CROSS);

  it("caps the fleet at the performance budget", () => {
    const big = roadGraph([road("long", [0, 0], [0, 900], 7)]);
    expect(spawnCars(big, 400, prngFor("s", "traffic"))).toHaveLength(MAX_FLEET);
    expect(spawnCars(graph, 12, prngFor("s", "traffic"))).toHaveLength(12);
  });

  it("takes each settlement's own vehicle cap (PLAN.md 76.5)", () => {
    expect(carCap("village")).toBe(10);
    expect(carCap("town")).toBe(24);
    expect(carCap("city")).toBe(MAX_CARS);
    expect(carCap("metropolis")).toBe(64);
    expect(MAX_FLEET).toBe(64);
    expect(carCap(undefined)).toBe(MAX_CARS);
  });

  it("places a fleet the same whatever the count asked beyond it", () => {
    const a = spawnCars(graph, 10, prngFor("s", "traffic"));
    const b = spawnCars(graph, 400, prngFor("s", "traffic")).slice(0, 10);
    expect(a).toEqual(b);
  });

  it("returns nothing when there are no drivable roads", () => {
    expect(spawnCars(roadGraph([]), 10, prngFor("s", "traffic"))).toEqual([]);
    expect(spawnCars(roadGraph([road("x", [0, 0], [1, 0], 4)]), 10, prngFor("s", "traffic"))).toEqual([]);
  });

  it("is deterministic for a given seed and differs across seeds", () => {
    const a = spawnCars(graph, 12, prngFor("owner/repo@aaa", "traffic"));
    const b = spawnCars(graph, 12, prngFor("owner/repo@aaa", "traffic"));
    const c = spawnCars(graph, 12, prngFor("owner/repo@bbb", "traffic"));
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it("starts every car on a lane between the boxes, clear of every other", () => {
    const network = junctionNetwork(graph);
    const cars = spawnCars(graph, 24, prngFor("s", "traffic"));
    const traffic = createTraffic(graph, cars, prngFor("s", "traffic"));
    const poses = cars.map((car) => carPose(traffic, car, newPose()));
    cars.forEach((car, i) => {
      const lane = carLane(car);
      const along = car.t * graph.lengths[car.segment];
      expect(car.speed).toBeGreaterThan(0);
      expect(along - car.half).toBeGreaterThanOrEqual(network.pieceStart[lane]);
      expect(along + car.half).toBeLessThanOrEqual(network.stopLine[lane] + 1e-9);
      for (let j = i + 1; j < cars.length; j++) {
        const [p, q] = [poses[i], poses[j]];
        expect(bodiesOverlap(p.x, p.z, p.angle, car.half, CAR_HALF_WIDTH, q.x, q.z, q.angle, cars[j].half, CAR_HALF_WIDTH)).toBe(false);
      }
    });
  });

  it("starts no car inside a blocked stretch, or where cones and a dead end would trap it", () => {
    const roads = [road("a", [0, 0], [0, 60], 7), road("b", [0, 60], [0, 74], 7)];
    const cul = roadGraph(roads);
    const shut = blockedStretches(cul, [incident(0, 30), incident(0, 67, "minor")]);
    const cars = spawnCars(cul, MAX_CARS, prngFor("seed", "traffic"), shut);
    // Segment a is a dead end with cones in it and b is shut: nowhere to go.
    expect(cars).toEqual([]);
  });
});

describe("carPose", () => {
  it("keeps opposing cars on opposite sides of the centre line", () => {
    const traffic = handTraffic(CROSS, [
      [laneOf(0, true), 20],
      [laneOf(0, false), 20],
    ]);
    const [north, south] = traffic.cars.map((car) => carPose(traffic, car));
    expect(Math.sign(north.x)).toBe(-Math.sign(south.x));
    expect(Math.abs(north.x)).toBeCloseTo(laneOffset(6));
  });

  it("faces along the direction of travel", () => {
    const traffic = handTraffic(CROSS, [[laneOf(3, true), 20]]);
    expect(carPose(traffic, traffic.cars[0]).angle).toBeCloseTo(Math.PI / 2);
  });
});

describe("turning at a junction", () => {
  /** One car up the north arm to the junction, each way out in turn, and how it went. */
  function through(exit: number) {
    const traffic = handTraffic(CROSS, [[laneOf(0, true), 10]]);
    const car = traffic.cars[0];
    // Send it the chosen way.
    car.plan = traffic.network.movesFrom[laneOf(0, true)].find((m) => traffic.network.moves[m].to === exit) as number;
    const pose = newPose();
    let last = carPose(traffic, car, newPose());
    let slowest = Infinity;
    let fastestTurn = 0;
    let crossed = false;
    for (let frame = 0; frame < 30 * 12 && carLane(car) !== exit; frame++) {
      stepTraffic(traffic, 1 / 30);
      carPose(traffic, car, pose);
      fastestTurn = Math.max(fastestTurn, angleGap(pose.angle, last.angle) * 30);
      if (car.move >= 0) {
        crossed = true;
        slowest = Math.min(slowest, car.v);
      }
      last = { ...pose };
    }
    return { car, slowest, fastestTurn, crossed };
  }

  it("follows a curve, never pivoting, and slows for a turn by how tight it is", () => {
    const right = through(laneOf(2, false));
    const left = through(laneOf(3, true));
    const straight = through(laneOf(1, true));
    for (const run of [right, left, straight]) {
      expect(run.crossed).toBe(true);
      // A 90 degree pivot in one step would be 47 radians a second.
      expect(run.fastestTurn).toBeLessThan(1.6);
    }
    expect(right.slowest).toBeLessThan(left.slowest);
    expect(left.slowest).toBeLessThan(straight.slowest);
    expect(straight.slowest).toBeGreaterThan(4);
  });

  it("steers the front wheels into the curve: left one way, right the other", () => {
    const traffic = handTraffic(CROSS, [[laneOf(0, true), 10]]);
    const car = traffic.cars[0];
    const network = traffic.network;
    const pose = newPose();
    const leftMove = network.movesFrom[laneOf(0, true)].find((m) => network.moves[m].turn > 1) as number;
    const rightMove = network.movesFrom[laneOf(0, true)].find((m) => network.moves[m].turn < -1) as number;
    car.move = leftMove;
    car.s = network.moves[leftMove].length / 2;
    expect(carPose(traffic, car, pose).curvature).toBeGreaterThan(0);
    car.move = rightMove;
    car.s = network.moves[rightMove].length / 2;
    expect(carPose(traffic, car, pose).curvature).toBeLessThan(0);
  });
});

describe("following", () => {
  it("keeps its distance behind a slower car, and never touches it", () => {
    const traffic = handTraffic(
      [road("long", [0, 0], [0, 400], 7)],
      [
        [0, 60, { speed: 2, v: 2 }],
        [0, 30, { speed: 6, v: 6 }],
      ],
    );
    const [lead, follower] = traffic.cars;
    let closest = Infinity;
    for (let frame = 0; frame < 30 * 40; frame++) {
      stepTraffic(traffic, 1 / 30);
      const gap = (lead.t - follower.t) * 400 - lead.half - follower.half;
      closest = Math.min(closest, gap);
    }
    expect(closest).toBeGreaterThan(0.3);
    // Settled in behind at the leader's pace, a little over a car's gap back.
    expect(follower.v).toBeCloseTo(lead.v, 1);
    const gap = (lead.t - follower.t) * 400 - lead.half - follower.half;
    expect(gap).toBeGreaterThan(1);
    expect(gap).toBeLessThan(6);
  });

  it("queues behind a stopped car and moves off again, in order", () => {
    // Three cars to a dead end: they turn round one at a time.
    const traffic = handTraffic(
      [road("close", [0, 0], [0, 60], 7)],
      [
        [0, 40],
        [0, 30],
        [0, 20],
      ],
    );
    const report = drive(traffic, 60, undefined, 60);
    expect(report.overlaps).toEqual([]);
    expect(report.turnsRound).toBeGreaterThanOrEqual(3);
  });
});

describe("junction arbitration", () => {
  it("lets cars from every arm through a crossroads without touching", () => {
    const arrivals: [number, number, Partial<Car>?][] = [];
    for (const lane of [laneOf(0, true), laneOf(1, false), laneOf(2, true), laneOf(3, false)]) {
      for (const along of [8, 18, 28]) arrivals.push([lane, along]);
    }
    const traffic = handTraffic(CROSS, arrivals);
    const report = drive(traffic, 90, undefined, 45);
    expect(report.overlaps).toEqual([]);
    expect(report.stalls).toEqual([]);
  });

  it("gives the car that has waited longest its turn against a stream of traffic", () => {
    // A long queue up the north arm, all going straight on, and one car on
    // the west arm that has to cross them.
    const queue: [number, number, Partial<Car>?][] = [];
    for (let k = 0; k < 6; k++) queue.push([laneOf(0, true), 28 - k * 5]);
    const traffic = handTraffic(CROSS, [[laneOf(2, true), 28], ...queue]);
    const network = traffic.network;
    const [crosser, ...rest] = traffic.cars;
    crosser.plan = network.movesFrom[laneOf(2, true)].find((m) => network.moves[m].to === laneOf(3, true)) as number;
    for (const car of rest) car.plan = network.movesFrom[laneOf(0, true)].find((m) => network.moves[m].to === laneOf(1, true)) as number;
    let crossedAt = -1;
    for (let frame = 0; frame < 30 * 30 && crossedAt < 0; frame++) {
      stepTraffic(traffic, 1 / 30);
      if (crosser.move >= 0) crossedAt = frame / 30;
    }
    expect(crossedAt).toBeGreaterThan(0);
    // It waits for the car already on its way, not the whole queue.
    expect(crossedAt).toBeLessThan(8);
  });

  it("never lets two conflicting movements hold one box", () => {
    const { traffic } = cityFleet(load("honojs__hono", "city"));
    const network = traffic.network;
    for (let frame = 0; frame < 30 * 60; frame++) {
      stepTraffic(traffic, 1 / 30);
      const cars = traffic.cars;
      for (let i = 0; i < cars.length; i++) {
        for (let j = i + 1; j < cars.length; j++) {
          if (cars[i].holds < 0 || cars[i].holds !== cars[j].holds) continue;
          const [a, b] = [cars[i].holdMove, cars[j].holdMove];
          if (a < 0 || b < 0) throw new Error("a car turning round shares its box");
          expect(movesConflict(network, a, b)).toBe(false);
        }
      }
    }
  });

  it("takes another way out when the one it wanted stays full", () => {
    expect(REROUTE_AFTER).toBeGreaterThan(0);
    // Two cars parked on the east arm fill it; a car wanting to turn into it
    // from the north gives up after a while and goes another way.
    const traffic = handTraffic(CROSS, [
      [laneOf(0, true), 30],
      [laneOf(3, true), 6, { speed: 0.001, v: 0 }],
      [laneOf(3, true), 12, { speed: 0.001, v: 0 }],
    ]);
    const network = traffic.network;
    const car = traffic.cars[0];
    const east = laneOf(3, true);
    car.plan = network.movesFrom[laneOf(0, true)].find((m) => network.moves[m].to === east) as number;
    // Make the east arm short of room: park cars all along it.
    const parked = traffic.cars.slice(1);
    for (const one of parked) one.plan = DEAD_END;
    let left = false;
    for (let frame = 0; frame < 30 * 20 && !left; frame++) {
      stepTraffic(traffic, 1 / 30);
      for (const one of parked) one.v = 0;
      left = car.move >= 0 && network.moves[car.move].to !== east;
    }
    expect(left).toBe(true);
  });
});

describe("turning round", () => {
  it("slows into a dead end, turns round in three points and drives back out", () => {
    const traffic = handTraffic(DEAD_END_ROAD, [[laneOf(0, true), 10]]);
    const car = traffic.cars[0];
    expect(car.plan).toBe(DEAD_END);
    let reversed = false;
    let slowest = Infinity;
    let fastestTurn = 0;
    let last = carPose(traffic, car, newPose());
    const pose = newPose();
    for (let frame = 0; frame < 30 * 20; frame++) {
      stepTraffic(traffic, 1 / 30);
      carPose(traffic, car, pose);
      if (pose.reverse) reversed = true;
      slowest = Math.min(slowest, car.v);
      fastestTurn = Math.max(fastestTurn, angleGap(pose.angle, last.angle) * 30);
      last = { ...pose };
    }
    expect(reversed).toBe(true);
    expect(slowest).toBeLessThan(0.5);
    expect(fastestTurn).toBeLessThan(1.2);
    expect(car.forward).toBe(false);
  });

  it("sweeps round in one go on a road wide enough", () => {
    const traffic = handTraffic([road("avenue", [0, 0], [0, 40], 10)], [[laneOf(0, true), 10]]);
    const car = traffic.cars[0];
    const pose = newPose();
    let reversed = false;
    for (let frame = 0; frame < 30 * 20; frame++) {
      stepTraffic(traffic, 1 / 30);
      if (carPose(traffic, car, pose).reverse) reversed = true;
    }
    expect(reversed).toBe(false);
    expect(car.forward).toBe(false);
  });

  it("waits for the other lane to clear before swinging across it", () => {
    // One car turning round at the dead end while another drives up the
    // other lane towards it.
    const traffic = handTraffic(
      [road("close", [0, 0], [0, 60], 5)],
      [
        [laneOf(0, true), 48, { v: 0 }],
        [laneOf(0, false), 2],
      ],
    );
    const report = drive(traffic, 40, undefined, 40);
    expect(report.overlaps).toEqual([]);
  });
});

describe("routing round blocked roads", () => {
  const graph = roadGraph(CROSS);
  const network = junctionNetwork(graph);
  // A collision on the east arm, far enough out that a car can pull in from
  // the junction and stop short; road works on the west arm, too close to
  // the junction for that, though not so close that they close it.
  const blocks = blockedStretches(graph, [incident(26, 0, "collision", Math.PI / 2), incident(-11.5, 0, "minor", Math.PI / 2)]);

  it("knows which lanes a car can still pull into", () => {
    // Out along the east arm: room to stop short of the collision, and the
    // junction to come back to after turning round.
    expect(enterable(network, laneOf(3, true), blocks)).toBe(true);
    // In from the far end of the east arm: straight into the cones.
    expect(enterable(network, laneOf(3, false), blocks)).toBe(false);
    // Out along the west arm: the road works are too close.
    expect(enterable(network, laneOf(2, false), blocks)).toBe(false);
    // In from the west arm's dead end: room to stop, but only the dead end
    // to go back to -- a car would be trapped turning round between the two.
    expect(enterable(network, laneOf(2, true), blocks)).toBe(false);
    // Without blockages everything is open.
    expect(enterable(network, laneOf(2, false))).toBe(true);
  });

  it("never picks a way out it cannot pull into when there is another", () => {
    const seen = new Set<number>();
    for (let seed = 0; seed < 60; seed++) {
      const traffic = handTraffic(CROSS, [[laneOf(0, true), 10]], blocks, `s${seed}`);
      const plan = traffic.cars[0].plan;
      expect(plan).toBeGreaterThanOrEqual(0);
      seen.add(network.moves[plan].to);
    }
    expect([...seen].sort()).toEqual([laneOf(1, true), laneOf(3, true)].sort());
  });

  it("brakes, stops short of the cones, waits and turns back", () => {
    const long = [road("long", [0, 0], [0, 80], 7)];
    const shut = blockedStretches(roadGraph(long), [incident(0, 50)]);
    const traffic = handTraffic(long, [[laneOf(0, true), 8]], shut);
    const car = traffic.cars[0];
    const phases: string[] = [];
    let closest = 0;
    const pose = newPose();
    for (let frame = 0; frame < 30 * 25; frame++) {
      stepTraffic(traffic, 1 / 30);
      carPose(traffic, car, pose);
      expect(trespass(traffic, shut, car, pose)).toBeNull();
      if (car.forward && car.turn === null) closest = Math.max(closest, car.t * 80);
      const phase = car.turn !== null ? "turn" : car.stood ? "wait" : car.forward ? "towards" : "away";
      if (phases[phases.length - 1] !== phase) phases.push(phase);
    }
    expect(phases.slice(0, 4)).toEqual(["towards", "wait", "turn", "away"]);
    const stretch = shut.bySegment[0][0];
    expect(closest).toBeLessThan(stretch.start - CAR_HALF_LENGTH);
    expect(closest).toBeGreaterThan(stretch.start - CAR_HALF_LENGTH - 5);
  });

  it("keeps a car moving on a dead end whose only way out is blocked", () => {
    const roads = [road("close", [0, 0], [0, 40], 4.5), road("exit", [0, 40], [0, 54], 4.5)];
    const cul = roadGraph(roads);
    const shut = blockedStretches(cul, [incident(0, 47, "minor")]);
    expect(shut.bySegment[1][0].closed).toBe(true);
    const traffic = handTraffic(roads, [[laneOf(0, true), 12]], shut);
    const report = drive(traffic, 60, shut, 30);
    expect(report.trespasses).toEqual([]);
    expect(report.stalls).toEqual([]);
    expect(report.turnsRound).toBeGreaterThan(2);
    expect(traffic.cars[0].segment).toBe(0);
  });
});

const load = (name: string, tier?: SettlementTier): CityModel =>
  generateCity(JSON.parse(readFileSync(path.join(process.cwd(), "fixtures", `${name}.analysis.json`), "utf8")) as RepoAnalysis, tier ? { tier } : {});

/**
 * The real thing: every tier's layout, with its incidents, crowd objects and
 * queue at the city limits, and a FULL fleet -- the settlement's cap, however
 * few cars its repository would give it -- driven for three minutes at thirty
 * steps a second.
 */
describe("a full fleet on every tier's roads", () => {
  const full = (city: CityModel): CityModel => ({ ...city, vehicles: { ...city.vehicles, count: 64 } });
  const layouts: [string, CityModel][] = [
    ["village", full(load("sindresorhus__p-limit", "village"))],
    ["village of hono", full(load("honojs__hono", "village"))],
    ["dev village", full(devSettlements.village())],
    ["town", full(load("honojs__hono", "town"))],
    ["town of sample", full(load("sample", "town"))],
    ["city", full(load("honojs__hono", "city"))],
    ["dev city", full(devCity)],
    ["metropolis", full(load("react__react", "metropolis"))],
    ["metropolis of vscode", full(load("microsoft__vscode", "metropolis"))],
  ];

  it.each(layouts)(
    "never puts two bodies in one place, nor one in the cones, and keeps every car moving (%s)",
    (_, city) => {
      const { traffic } = cityFleet(city);
      const blocks = traffic.blocks as Blockages;
      expect(traffic.cars.length).toBe(carCap(city.settlement?.tier));
      const report = drive(traffic, 180, blocks, 30);
      expect(report.overlaps).toEqual([]);
      expect(report.trespasses).toEqual([]);
      expect(report.stalls).toEqual([]);
      expect(report.jumps).toEqual([]);
      // Headings turn smoothly: a quarter turn in a step would be 47 rad/s.
      expect(report.fastestTurn).toBeLessThan(2);
    },
    60000,
  );

  it("has cars pull up at the cones and turn round somewhere", () => {
    let stops = 0;
    let turns = 0;
    for (const [, city] of layouts.slice(3, 6)) {
      const { traffic } = cityFleet(city);
      const report = drive(traffic, 60, traffic.blocks);
      stops += report.stops;
      turns += report.turnsRound;
    }
    expect(stops).toBeGreaterThan(0);
    expect(turns).toBeGreaterThan(0);
  }, 60000);

  it("drives the same way every time for a given seed", () => {
    const [, city] = layouts[5];
    const a = cityFleet(city).traffic;
    const b = cityFleet(city).traffic;
    for (let frame = 0; frame < 30 * 30; frame++) {
      stepTraffic(a, 1 / 30);
      stepTraffic(b, 1 / 30);
    }
    expect(a.cars).toEqual(b.cars);
  });

  it("steps 64 cars in a small fraction of a frame", () => {
    const { traffic } = cityFleet(layouts[7][1]);
    expect(traffic.cars).toHaveLength(64);
    // Warm up, then time a minute of steps.
    for (let frame = 0; frame < 300; frame++) stepTraffic(traffic, 1 / 60);
    const started = performance.now();
    const steps = 60 * 60;
    for (let frame = 0; frame < steps; frame++) stepTraffic(traffic, 1 / 60);
    const perStep = (performance.now() - started) / steps;
    // Measured at about 0.02 ms; a frame at 60 fps is 16.7 ms.
    expect(perStep).toBeLessThan(0.25);
  }, 30000);
});

describe("tractors (PLAN.md 76.5)", () => {
  it("keeps them out of any settlement that does not allow them", () => {
    expect(tractorsFor(40, false, prngFor("s", "tractors")).some(Boolean)).toBe(false);
  });

  it("puts a few into a village fleet, and at least one", () => {
    const picks = tractorsFor(10, true, prngFor("village", "tractors"));
    expect(picks).toHaveLength(10);
    expect(picks.filter(Boolean).length).toBeGreaterThanOrEqual(1);
    let total = 0;
    for (let i = 0; i < 200; i++) total += tractorsFor(10, true, prngFor(`v${i}`, "tractors")).filter(Boolean).length;
    expect(total / 2000).toBeGreaterThan(TRACTOR_SHARE * 0.7);
    expect(total / 2000).toBeLessThan(TRACTOR_SHARE * 1.6);
  });

  it("is deterministic for a seed", () => {
    expect(tractorsFor(10, true, prngFor("a", "tractors"))).toEqual(tractorsFor(10, true, prngFor("a", "tractors")));
    expect(tractorsFor(0, true, prngFor("a", "tractors"))).toEqual([]);
  });

  it("drives them at a tractor's pace in a village, with the traffic queueing behind", () => {
    const { traffic, looks } = cityFleet({ ...devSettlements.village(), vehicles: { count: 10 } });
    const tractors = looks.map((look, i) => (look.tractor ? traffic.cars[i] : null)).filter((car): car is Car => car !== null);
    expect(tractors.length).toBeGreaterThan(0);
    for (const tractor of tractors) expect(tractor.speed).toBeLessThan(4);
  });
});
