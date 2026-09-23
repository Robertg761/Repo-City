import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { generateCity } from "@/lib/city/generator";
import { buildTour } from "@/lib/client/tour";
import type { RepoAnalysis, SettlementTier } from "@/types/analysis";
import type { Vec3 } from "@/types/city";
import {
  CAMERA_CLEARANCE,
  cameraInside,
  focusTargetFor,
  framingBlocked,
  framingObstacles,
  overviewFraming,
  viewAngles,
} from "@/components/city/entities";
import {
  TOUR_LOOK_UP_POLAR,
  TOUR_MAX_POLAR,
  TOUR_MIN_DISTANCE,
  TOUR_MIN_HEIGHT,
  aimBox,
  ease,
  flightObstacles,
  flightPose,
  planFlight,
  planShots,
  safePose,
  shotPose,
  trackMs,
  type Pose,
} from "./path";

const SCENES: [string, SettlementTier | undefined][] = [
  ["sindresorhus__p-limit", undefined],
  ["honojs__hono", "town"],
  ["honojs__hono", undefined],
  ["facebook__react", undefined],
  ["atom__atom", undefined],
  ["microsoft__vscode", undefined],
  ["backlog", undefined],
];
const ASPECTS = [1.6, 390 / 844];

function scene(name: string, tier?: SettlementTier) {
  const analysis = JSON.parse(readFileSync(`fixtures/${name}.analysis.json`, "utf8")) as RepoAnalysis;
  const city = generateCity(analysis, { tier });
  return { city, stops: buildTour(city, analysis) };
}

const distance = (p: Pose) =>
  Math.hypot(p.position[0] - p.target[0], p.position[1] - p.target[1], p.position[2] - p.target[2]);

function within(point: Vec3, [min, max]: [Vec3, Vec3]): boolean {
  return point.every((v, k) => v >= min[k] - 1e-6 && v <= max[k] + 1e-6);
}

/** What `<CameraControls>` would accept without correcting it. */
function expectInsideLimits(pose: Pose, maxPolar: number) {
  expect(pose.position[1]).toBeGreaterThanOrEqual(TOUR_MIN_HEIGHT - 1e-6);
  expect(distance(pose)).toBeGreaterThanOrEqual(TOUR_MIN_DISTANCE - 1e-6);
  const { polar } = viewAngles(pose.position, pose.target);
  expect(polar).toBeGreaterThanOrEqual(0.15);
  expect(polar).toBeLessThanOrEqual(maxPolar + 1e-6);
}

describe.each(SCENES)("the tour's camera over %s %s", (name, tier) => {
  const { city, stops } = scene(name, tier);
  const obstacles = framingObstacles(city);
  const flying = flightObstacles(city);

  it.each(ASPECTS)("holds every shot clear of the buildings, seeing its subject (aspect %f)", (aspect) => {
    const shots = planShots(city, stops, aspect);
    expect(shots).toHaveLength(stops.length);
    shots.forEach((shot, i) => {
      const focus = stops[i].subjectId ? focusTargetFor(city, stops[i].subjectId!) : null;
      const others = obstacles.filter((o) => o.id !== focus?.id && o.id !== focus?.host);
      for (let u = 0; u <= 1.0001; u += 0.05) {
        const pose = shotPose(shot, u);
        expectInsideLimits(pose, shot.kind === "track" ? TOUR_LOOK_UP_POLAR : TOUR_MAX_POLAR);
        if (shot.kind === "track" || !focus) {
          // A track runs low along a road: it is a flight, and kept out of
          // every box. A wide shot looks at the whole city, so only the
          // camera itself has to be clear.
          expect(cameraInside(pose.position, flying, CAMERA_CLEARANCE)).toBe(false);
        } else {
          expect(framingBlocked(pose.target, pose.position, others)).toBe(false);
        }
        expect(within(pose.target, aimBox(city))).toBe(true);
      }
    });
  });

  it.each(ASPECTS)("flies between the shots above the ground and outside every box (aspect %f)", (aspect) => {
    const overview = overviewFraming(city.bounds.size, aspect);
    const shots = planShots(city, stops, aspect, overview);
    let from: Pose = overview;
    shots.forEach((shot, i) => {
      const hold = trackMs(shot, stops[i].holdMs);
      const flight = planFlight(city, from, shotPose(shot, 0), { into: shot, intoMs: hold });
      expect(flight.durationMs).toBeGreaterThan(0);
      for (const pose of flight.poses) {
        expectInsideLimits(pose, TOUR_MAX_POLAR);
        expect(cameraInside(pose.position, flying, CAMERA_CLEARANCE)).toBe(false);
      }
      // It lands exactly where the shot begins.
      const landed = flightPose(flight, 1);
      const start = shotPose(shot, 0);
      expect(Math.hypot(...landed.position.map((v, k) => v - start.position[k]))).toBeLessThan(1e-6);
      from = shotPose(shot, 1);
    });
  });

  it("swoops down a road to the busiest district's tallest tower", () => {
    const shots = planShots(city, stops, 1.6);
    const district = stops.findIndex((s) => s.kind === "district");
    expect(shots[district].kind).toBe("track");
    const track = shots[district];
    // Low over the road at the start, well above it at the end.
    expect(shotPose(track, 0).position[1]).toBeLessThan(12);
    expect(shotPose(track, 1).position[1]).toBeGreaterThan(shotPose(track, 0).position[1]);
  });

  it("ends on the overview, so handing the camera back moves nothing", () => {
    const aspect = 1.6;
    const shots = planShots(city, stops, aspect);
    const end = shotPose(shots.at(-1)!, 1);
    const overview = overviewFraming(city.bounds.size, aspect);
    expect(Math.hypot(...end.position.map((v, k) => v - overview.position[k]))).toBeLessThan(1e-6);
    expect(Math.hypot(...end.target.map((v, k) => v - overview.target[k]))).toBeLessThan(1e-6);
  });

  it("plans the same shots every time", () => {
    expect(planShots(city, stops, 1.6)).toEqual(planShots(city, stops, 1.6));
  });
});

describe("reduced motion", () => {
  it("cuts straight to the next shot", () => {
    const { city, stops } = scene("honojs__hono");
    const shots = planShots(city, stops, 1.6);
    const flight = planFlight(city, shotPose(shots[0], 1), shotPose(shots[1], 1), { reduced: true });
    expect(flight.kind).toBe("cut");
    expect(flight.durationMs).toBe(0);
    expect(flightPose(flight, 0)).toEqual(safePose(shotPose(shots[1], 1)));
  });
});

describe("ease", () => {
  it("runs from 0 to 1, monotone, with the asked-for end speeds", () => {
    for (const [s0, s1] of [
      [0, 0],
      [1, 0],
      [0, 0.4],
      [1.6, 0],
    ]) {
      expect(ease(0, s0, s1)).toBe(0);
      expect(ease(1, s0, s1)).toBeCloseTo(1, 12);
      let last = 0;
      for (let u = 0.01; u <= 1; u += 0.01) {
        const v = ease(u, s0, s1);
        expect(v).toBeGreaterThanOrEqual(last - 1e-12);
        last = v;
      }
      const h = 1e-5;
      expect((ease(h, s0, s1) - ease(0, s0, s1)) / h).toBeCloseTo(s0, 3);
      expect((ease(1, s0, s1) - ease(1 - h, s0, s1)) / h).toBeCloseTo(s1, 3);
    }
  });
});

describe("safePose", () => {
  it("keeps the camera above the ground, far enough out and never too flat", () => {
    const tooLow = safePose({ position: [0, 1, 0], target: [0, 0, 30] });
    expect(tooLow.position[1]).toBe(TOUR_MIN_HEIGHT);
    expect(viewAngles(tooLow.position, tooLow.target).polar).toBeLessThanOrEqual(TOUR_MAX_POLAR + 1e-9);
    const tooClose = safePose({ position: [0, 20, 0], target: [0, 16, 2] });
    expect(distance(tooClose)).toBeCloseTo(TOUR_MIN_DISTANCE, 9);
    const fine: Pose = { position: [30, 40, 30], target: [0, 0, 0] };
    expect(safePose(fine)).toEqual(fine);
  });

  it("lets a track look up at a tower, no further than the tour allows", () => {
    const up = safePose({ position: [0, 8, 0], target: [0, 60, 20] }, TOUR_LOOK_UP_POLAR);
    const { polar } = viewAngles(up.position, up.target);
    expect(polar).toBeGreaterThan(Math.PI / 2);
    expect(polar).toBeLessThanOrEqual(TOUR_LOOK_UP_POLAR + 1e-9);
  });
});
