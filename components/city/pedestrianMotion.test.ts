import { describe, expect, it } from "vitest";
import { generateCity } from "@/lib/city/generator";
import { prngFor } from "@/lib/city/seed";
import honoFixture from "@/fixtures/honojs__hono.analysis.json";
import type { RepoAnalysis } from "@/types/analysis";
import {
  advanceWalker,
  clearOfBlocks,
  pavementBlocks,
  spawnWalkers,
  walkerPose,
} from "./models/props/pedestrians";
import { pavementObstacles } from "./blockages";
import { roadStyle } from "./groundwork";
import { roadGraph } from "./traffic";
import {
  LANE_SPREAD,
  PERSONAL_SPACE,
  createCrowdMotion,
  followPose,
  keepApart,
  laneOffset,
} from "./pedestrianMotion";

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

describe("followPose", () => {
  it("places a figure exactly the first time, and while the reveal runs", () => {
    const motion = createCrowdMotion(1);
    followPose(motion, 0, 3, 4, 0, 0, 1, 1 / 60);
    expect([motion.x[0], motion.z[0], motion.angle[0]]).toEqual([3, 4, 0]);
    followPose(motion, 0, 9, 9, 1, 0, 1, 0);
    expect(motion.x[0]).toBeCloseTo(9, 5);
    expect(motion.angle[0]).toBeCloseTo(1, 5);
  });

  it("walks a gap at a brisk pace instead of jumping it", () => {
    const motion = createCrowdMotion(1);
    followPose(motion, 0, 0, 0, 0, 0, 1, 1 / 60);
    // The pavement across the road: seven units away.
    let frames = 0;
    let largest = 0;
    let x = 0;
    while (Math.abs(motion.x[0] - 7) > 0.05 && frames < 1000) {
      followPose(motion, 0, 7, 0, 0, 0, 1, 1 / 60);
      largest = Math.max(largest, Math.abs(motion.x[0] - x));
      x = motion.x[0];
      frames++;
    }
    expect(largest).toBeLessThan(0.05);
    expect(frames / 60).toBeGreaterThan(2);
    expect(frames / 60).toBeLessThan(4);
    // It faced across the road while it crossed.
  });

  it("turns round at a person's pace", () => {
    const motion = createCrowdMotion(1);
    followPose(motion, 0, 0, 0, 0, 0, 1, 1 / 60);
    let frames = 0;
    let largest = 0;
    let last = motion.angle[0];
    while (Math.abs(wrap(motion.angle[0] - Math.PI)) > 0.01 && frames < 200) {
      followPose(motion, 0, 0, 0, Math.PI, 0, 1, 1 / 60);
      largest = Math.max(largest, Math.abs(wrap(motion.angle[0] - last)));
      last = motion.angle[0];
      frames++;
    }
    expect(largest).toBeLessThan(0.15);
    expect(frames).toBeGreaterThan(20);
    expect(frames).toBeLessThan(40);
  });

  it("keeps its own line on the pavement", () => {
    for (let phase = 0; phase < Math.PI * 2; phase += 0.1) {
      expect(Math.abs(laneOffset(phase))).toBeLessThanOrEqual(LANE_SPREAD + 1e-9);
    }
    const motion = createCrowdMotion(1);
    // Heading +z, lane to the right: -x in this convention, as `walkerPose`'s side.
    followPose(motion, 0, 0, 0, 0, 0.3, 1, 0);
    expect(motion.x[0]).toBeCloseTo(-0.3, 5);
  });
});

describe("keepApart", () => {
  it("parts two figures standing on each other, and leaves the idle standing", () => {
    const motion = createCrowdMotion(3);
    motion.x.set([0, 0.1, 5]);
    motion.z.set([0, 0, 0]);
    keepApart(motion, 2);
    expect(motion.x[1] - motion.x[0]).toBeCloseTo(PERSONAL_SPACE, 5);
    motion.x.set([4.9, 0, 5]);
    keepApart(motion, 3, 2);
    expect(motion.x[2]).toBe(5);
    expect(5 - motion.x[0]).toBeCloseTo(PERSONAL_SPACE, 5);
  });
});

describe("a minute of the hono crowd", () => {
  it("never jumps, never snaps round, and rarely brushes shoulders", () => {
    const city = generateCity(honoFixture as unknown as RepoAnalysis)!;
    const rng = prngFor(city.seed, "pedestrians");
    const streets = city.roads.filter((road) => roadStyle(road) !== "motorway");
    const crowd = spawnWalkers(streets, 60, rng);
    const graph = roadGraph(streets);
    const blocks = pavementBlocks(graph, pavementObstacles(city));
    for (const walker of crowd) clearOfBlocks(graph, walker, blocks);
    const motion = createCrowdMotion(crowd.length);
    const dt = 1 / 60;
    let jumps = 0;
    let pivots = 0;
    let rawJumps = 0;
    let touching = 0;
    const px = new Float32Array(crowd.length);
    const pz = new Float32Array(crowd.length);
    const pa = new Float32Array(crowd.length);
    const raw = crowd.map((walker) => walkerPose(graph, walker));
    for (let frame = 0; frame < 3600; frame++) {
      crowd.forEach((walker, i) => {
        if (frame > 0) advanceWalker(graph, walker, dt, rng, blocks);
        const pose = walkerPose(graph, walker);
        if (Math.hypot(pose.x - raw[i].x, pose.z - raw[i].z) > 0.2) rawJumps++;
        raw[i] = pose;
        followPose(motion, i, pose.x, pose.z, pose.angle, laneOffset(walker.phase), walker.speed, frame > 0 ? dt : 0);
      });
      keepApart(motion, crowd.length);
      for (let i = 0; i < crowd.length; i++) {
        if (frame > 0) {
          if (Math.hypot(motion.x[i] - px[i], motion.z[i] - pz[i]) > 0.2) jumps++;
          if (Math.abs(wrap(motion.angle[i] - pa[i])) > 0.2) pivots++;
        }
        px[i] = motion.x[i];
        pz[i] = motion.z[i];
        pa[i] = motion.angle[i];
        for (let j = i + 1; j < crowd.length; j++) {
          if (Math.hypot(motion.x[i] - motion.x[j], motion.z[i] - motion.z[j]) < 0.34) touching++;
        }
      }
    }
    // The simulation itself jumps a hundred times a minute; the drawn crowd
    // never does.
    expect(rawJumps).toBeGreaterThan(20);
    expect(jumps).toBe(0);
    expect(pivots).toBe(0);
    // Bodies are 0.34 across: after the step aside, nobody stands inside
    // anybody for more than the odd frame.
    expect(touching).toBeLessThan(60);
  });
});
