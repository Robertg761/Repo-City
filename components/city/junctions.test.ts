import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { generateCity } from "@/lib/city/generator";
import type { RepoAnalysis, SettlementTier } from "@/types/analysis";
import type { CityModel, RoadSegment } from "@/types/city";
import { devSettlements } from "@/fixtures/dev.settlements";
import {
  CORNERING,
  RELEASE_GAP,
  bodiesOverlap,
  junctionNetwork,
  lanePoint,
  movePoint,
  movesConflict,
  spillsOnto,
  type Network,
  type PathPose,
} from "./junctions";
import { CAR_HALF_LENGTH, CAR_HALF_WIDTH, laneFinishEnd, laneOf } from "./lanes";
import { roadGraph } from "./traffic";

const road = (id: string, from: [number, number], to: [number, number], width = 6): RoadSegment => ({
  id,
  from: [from[0], 0, from[1]],
  to: [to[0], 0, to[1]],
  width,
  major: width > 5,
  appearAt: 0,
});

/** A plus-shaped junction: four twenty unit arms meeting at the origin. */
const CROSS: RoadSegment[] = [
  road("n", [0, -20], [0, 0]),
  road("s", [0, 0], [0, 20]),
  road("w", [-20, 0], [0, 0], 4.5),
  road("e", [0, 0], [20, 0], 4.5),
];

const pose = (): PathPose => ({ x: 0, z: 0, angle: 0, curvature: 0 });
const angleGap = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

/** The movement from one lane to another. */
function moveBetween(network: Network, from: number, to: number): number {
  const found = network.movesFrom[from].find((m) => network.moves[m].to === to);
  if (found === undefined) throw new Error(`no movement ${from} -> ${to}`);
  return found;
}

const load = (name: string, tier: SettlementTier): CityModel =>
  generateCity(JSON.parse(readFileSync(path.join(process.cwd(), "fixtures", `${name}.analysis.json`), "utf8")) as RepoAnalysis, {
    tier,
  });

describe("junctionNetwork on a crossroads", () => {
  const network = junctionNetwork(roadGraph(CROSS));
  // Northbound up the north arm, into the junction.
  const north = laneOf(0, true);
  const straight = moveBetween(network, north, laneOf(1, true));
  // Driving on the right: turning right from northbound heads west.
  const right = moveBetween(network, north, laneOf(2, false));
  const left = moveBetween(network, north, laneOf(3, true));

  it("makes one box with a movement from every lane in to every other lane out", () => {
    expect(network.groups).toHaveLength(1);
    expect(network.moves).toHaveLength(12);
    // The box reaches to the crossing road's kerb and a little more.
    expect(network.pieceEnd[north]).toBeLessThan(20 - 4.5 / 2);
    expect(network.pieceEnd[north]).toBeGreaterThan(20 - 5);
  });

  it("leaves along the lane it comes from and joins along the lane it goes to", () => {
    const at = pose();
    const lane = pose();
    for (let m = 0; m < network.moves.length; m++) {
      const move = network.moves[m];
      movePoint(network, m, 0, at);
      lanePoint(network, move.from, network.pieceEnd[move.from], lane);
      expect(Math.hypot(at.x - lane.x, at.z - lane.z)).toBeLessThan(1e-6);
      expect(angleGap(at.angle, lane.angle)).toBeLessThan(1e-6);
      movePoint(network, m, move.length, at);
      lanePoint(network, move.to, network.pieceStart[move.to], lane);
      expect(Math.hypot(at.x - lane.x, at.z - lane.z)).toBeLessThan(1e-6);
      expect(angleGap(at.angle, lane.angle)).toBeLessThan(1e-3);
    }
  });

  it("turns the heading smoothly, never faster than its speed allows", () => {
    const a = pose();
    const b = pose();
    for (let m = 0; m < network.moves.length; m++) {
      const move = network.moves[m];
      const steps = 200;
      for (let i = 1; i <= steps; i++) {
        movePoint(network, m, (move.length * (i - 1)) / steps, a);
        movePoint(network, m, (move.length * i) / steps, b);
        const turned = angleGap(a.angle, b.angle);
        // Taken at `vmax`, the heading turns no faster than the cornering
        // grip allows: angle per unit is curvature, and v^2 * k <= grip.
        expect(turned / (move.length / steps)).toBeLessThanOrEqual((CORNERING / (move.vmax * move.vmax)) * 1.05 + 1e-6);
      }
    }
  });

  it("takes a right turn tight and slow, a left turn wide, and straight on at speed", () => {
    const [r, l, s] = [network.moves[right], network.moves[left], network.moves[straight]];
    expect(r.turn).toBeLessThan(-1.4);
    expect(l.turn).toBeGreaterThan(1.4);
    expect(Math.abs(s.turn)).toBeLessThan(1e-6);
    expect(r.length).toBeLessThan(l.length);
    expect(r.vmax).toBeLessThan(l.vmax);
    expect(l.vmax).toBeLessThan(s.vmax);
    // The wide sweep really is wide: it passes the middle of the box.
    const mid = pose();
    movePoint(network, left, l.length / 2, mid);
    expect(Math.hypot(mid.x, mid.z)).toBeLessThan(2.5);
  });

  it("lets opposing traffic go straight on, or turn right, at once, and nothing else", () => {
    const south = laneOf(1, false);
    const oppositeStraight = moveBetween(network, south, laneOf(0, false));
    const oppositeRight = moveBetween(network, south, laneOf(3, true));
    expect(movesConflict(network, straight, oppositeStraight)).toBe(false);
    expect(movesConflict(network, right, oppositeRight)).toBe(false);
    // A left turn cuts across the oncoming straight.
    expect(movesConflict(network, left, oppositeStraight)).toBe(true);
    // Two movements out of one lane wait for each other; one movement is
    // simply a queue.
    expect(movesConflict(network, left, straight)).toBe(true);
    expect(movesConflict(network, straight, straight)).toBe(false);
    // Crossing traffic from the side conflicts with straight on.
    const westIn = laneOf(2, true);
    expect(movesConflict(network, straight, moveBetween(network, westIn, laneOf(3, true)))).toBe(true);
  });
});

describe("junction groups", () => {
  it("folds two junctions too close to wait between into one box", () => {
    // A jog in the grid: two T-junctions 1.4 apart along the avenue.
    const roads = [
      road("a", [-30, 0], [0, 0], 9.5),
      road("jog", [0, 0], [1.4, 0], 9.5),
      road("b", [1.4, 0], [30, 0], 9.5),
      road("up", [0, 0], [0, -30], 5.5),
      road("down", [1.4, 0], [1.4, 30], 5.5),
    ];
    const network = junctionNetwork(roadGraph(roads));
    expect(network.groups).toHaveLength(1);
    expect(network.inner[1]).toBe(1);
    expect(network.usable[laneOf(1, true)]).toBe(0);
    // Four lanes in, four out, no U-turns: twelve movements, as a crossroads.
    expect(network.moves).toHaveLength(12);
  });

  it("keeps junctions a block apart as separate boxes", () => {
    const roads = [
      road("a", [-30, 0], [0, 0]),
      road("link", [0, 0], [30, 0]),
      road("b", [30, 0], [60, 0]),
      road("up", [0, 0], [0, -30]),
      road("down", [30, 0], [30, 30]),
    ];
    const network = junctionNetwork(roadGraph(roads));
    expect(network.groups).toHaveLength(2);
    expect(network.usable[laneOf(1, true)]).toBe(1);
  });

  it("eases round a gentle bend without a box to speak of", () => {
    const roads = [road("in", [0, 0], [0, 30], 3.6), road("out", [0, 30], [8, 58], 3.6)];
    const network = junctionNetwork(roadGraph(roads));
    const bend = network.moves[moveBetween(network, laneOf(0, true), laneOf(1, true))];
    expect(network.pieceEnd[laneOf(0, true)]).toBeGreaterThan(27);
    expect(bend.vmax).toBeGreaterThan(3);
  });

  it("ignores slivers that start and end at one junction", () => {
    const network = junctionNetwork(roadGraph([...CROSS, road("sliver", [0, 0], [0.2, 0])]));
    expect(network.drivable[4]).toBe(0);
    expect(network.moves).toHaveLength(12);
  });
});

describe("bodiesOverlap", () => {
  it("separates side by side, nose to tail and crossed rectangles correctly", () => {
    expect(bodiesOverlap(0, 0, 0, 2, 0.6, 1.3, 0, 0, 2, 0.6)).toBe(false);
    expect(bodiesOverlap(0, 0, 0, 2, 0.6, 1.1, 0, 0, 2, 0.6)).toBe(true);
    expect(bodiesOverlap(0, 0, 0, 2, 0.6, 0, 4.1, 0, 2, 0.6)).toBe(false);
    expect(bodiesOverlap(0, 0, 0, 2, 0.6, 0, 3.9, 0, 2, 0.6)).toBe(true);
    // Crossed at right angles, corners just apart and just touching.
    expect(bodiesOverlap(0, 0, 0, 2, 0.6, 2.7, 2.7, Math.PI / 2, 2, 0.6)).toBe(false);
    expect(bodiesOverlap(0, 0, 0, 2, 0.6, 2.4, 2.4, Math.PI / 2, 2, 0.6)).toBe(true);
  });
});

/**
 * The promise the traffic's safety rests on, on every tier's real roads: a
 * movement through a box never touches a car standing where it may stand on
 * any lane into that box, behind its stop line. (Lanes out of the box are
 * kept clear when the movement is granted: see `spills`.)
 */
describe("junction boxes on every tier's layout", () => {
  const layouts: [string, CityModel][] = [
    ["village", load("sindresorhus__p-limit", "village")],
    ["village (hono)", load("honojs__hono", "village")],
    ["dev village", devSettlements.village()],
    ["town", load("honojs__hono", "town")],
    ["city", load("honojs__hono", "city")],
    ["metropolis", load("react__react", "metropolis")],
  ];

  it.each(layouts)("keeps every movement clear of cars waiting to enter (%s)", (_, city) => {
    const network = junctionNetwork(roadGraph(city.roads));
    const sweep = pose();
    const standing = pose();
    const half = CAR_HALF_LENGTH;
    const touches: string[] = [];
    for (const group of network.groups) {
      for (const move of group.moves) {
        const m = network.moves[move];
        for (const segment of group.segments) {
          for (const lane of [laneOf(segment, true), laneOf(segment, false)]) {
            if (lane === m.from || lane === m.to || !network.usable[lane]) continue;
            if (network.endGroup[laneFinishEnd(lane)] !== m.group) continue;
            const hi = network.stopLine[lane] - half;
            // Nothing sweeps further than a movement's length and a body
            // back from the box, so only the end of the queue needs checking.
            const lo = Math.max(network.pieceStart[lane] + RELEASE_GAP + half, hi - m.length - 2 * half - 1);
            for (let along = lo; along <= hi + 1e-9; along += 0.3) {
              lanePoint(network, lane, along, standing);
              for (let d = -half; d <= m.length + half; d += 0.3) {
                if (d < 0) lanePoint(network, m.from, network.pieceEnd[m.from] + d, sweep);
                else if (d > m.length) lanePoint(network, m.to, network.pieceStart[m.to] + d - m.length, sweep);
                else movePoint(network, move, d, sweep);
                const hit = bodiesOverlap(sweep.x, sweep.z, sweep.angle, half, CAR_HALF_WIDTH, standing.x, standing.z, standing.angle, half, CAR_HALF_WIDTH);
                if (hit) touches.push(`move ${move} touches lane ${lane} at ${along.toFixed(2)}`);
              }
            }
          }
        }
      }
    }
    expect(touches).toEqual([]);
  }, 30000);

  it.each(layouts)("records every spill onto a lane out of the box (%s)", (_, city) => {
    const network = junctionNetwork(roadGraph(city.roads));
    for (const group of network.groups) {
      for (const move of group.moves) {
        const m = network.moves[move];
        for (const segment of group.segments) {
          for (const lane of [laneOf(segment, true), laneOf(segment, false)]) {
            if (lane === m.from || lane === m.to || !network.usable[lane]) continue;
            const recorded = m.spills.some((value, k) => k % 3 === 0 && value === lane);
            expect(recorded).toBe(spillsOnto(network, move, lane));
          }
        }
      }
    }
  });

  it.each(layouts)("builds in well under a frame budget's worth of setup (%s)", (_, city) => {
    const started = performance.now();
    junctionNetwork(roadGraph(city.roads));
    expect(performance.now() - started).toBeLessThan(400);
  });
});
