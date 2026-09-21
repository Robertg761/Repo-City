import { describe, expect, it } from "vitest";
import { MAX_CARS, advanceCar, carPose, nextRide, roadGraph, spawnCars } from "./traffic";
import { prngFor } from "@/lib/city/seed";
import type { RoadSegment } from "@/types/city";

/** A plus-shaped junction: four arms meeting at the origin. */
const CROSS: RoadSegment[] = [
  { id: "n", from: [0, 0, -20], to: [0, 0, 0], width: 6, major: true },
  { id: "s", from: [0, 0, 0], to: [0, 0, 20], width: 6, major: true },
  { id: "w", from: [-20, 0, 0], to: [0, 0, 0], width: 4, major: false },
  { id: "e", from: [0, 0, 0], to: [20, 0, 0], width: 4, major: false },
];

const DEAD_END: RoadSegment[] = [{ id: "only", from: [0, 0, 0], to: [0, 0, 30], width: 5, major: true }];

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
    expect(spawnCars(CROSS, 400, prngFor("s", "traffic"))).toHaveLength(MAX_CARS);
    expect(spawnCars(CROSS, 12, prngFor("s", "traffic"))).toHaveLength(12);
  });

  it("returns nothing when there are no drivable roads", () => {
    expect(spawnCars([], 10, prngFor("s", "traffic"))).toEqual([]);
    const stub: RoadSegment[] = [{ id: "x", from: [0, 0, 0], to: [1, 0, 0], width: 4, major: false }];
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
    for (const car of spawnCars(CROSS, 40, prngFor("s", "traffic"))) {
      expect(CROSS[car.segment]).toBeDefined();
      expect(car.speed).toBeGreaterThan(0);
      expect(car.t).toBeGreaterThanOrEqual(0);
      expect(car.t).toBeLessThan(1);
    }
  });
});

describe("carPose", () => {
  const graph = roadGraph(CROSS);

  it("keeps opposing cars on opposite sides of the centre line", () => {
    const base = { t: 0.5, speed: 6, lane: 1.5, colorIndex: 0 };
    const north = carPose(graph, { ...base, segment: 0, forward: true });
    const south = carPose(graph, { ...base, segment: 0, forward: false });
    expect(Math.sign(north.x)).toBe(-Math.sign(south.x));
    expect(Math.abs(north.x)).toBeCloseTo(1.5);
  });

  it("faces along the direction of travel", () => {
    const east = carPose(graph, { segment: 3, forward: true, t: 0.2, speed: 6, lane: 0, colorIndex: 0 });
    expect(east.angle).toBeCloseTo(Math.PI / 2);
  });
});

describe("advanceCar", () => {
  const graph = roadGraph(CROSS);

  it("moves along the segment without leaving it when there is room", () => {
    const prng = prngFor("s", "traffic");
    const car = { segment: 0, forward: true, t: 0, speed: 10, lane: 1, colorIndex: 0 };
    advanceCar(graph, car, 1, prng);
    expect(car.segment).toBe(0);
    expect(car.t).toBeCloseTo(0.5);
  });

  it("hops to a connected segment at the junction", () => {
    const prng = prngFor("s", "traffic");
    const car = { segment: 0, forward: true, t: 0.9, speed: 10, lane: 1, colorIndex: 0 };
    advanceCar(graph, car, 1, prng);
    expect(car.t).toBeLessThan(1);
    const [from, to] = graph.nodeKeys[car.segment];
    expect(car.forward ? from : to).toBe("0:0");
  });

  it("never runs past the end of a segment even at absurd speed", () => {
    const prng = prngFor("s", "traffic");
    const car = { segment: 0, forward: true, t: 0, speed: 100000, lane: 1, colorIndex: 0 };
    advanceCar(graph, car, 1, prng);
    expect(car.t).toBeLessThan(1);
    expect(car.t).toBeGreaterThanOrEqual(0);
  });
});
