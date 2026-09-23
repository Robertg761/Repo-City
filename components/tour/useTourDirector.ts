"use client";

/**
 * Drives the camera through the tour, frame by frame (called from
 * `CameraRig`, which owns the camera the rest of the time).
 *
 * The camera-controls transitions ease towards one fixed end, so they cannot
 * follow a curve; the tour hands `setLookAt` a pose on its planned path every
 * frame instead, with no transition of its own. The shots are planned once
 * when a run starts (`path.ts`); each flight is planned when its stop begins,
 * from wherever the camera actually is, so a skip mid-flight simply sets off
 * again from there.
 *
 * Any press, drag or wheel turn on the canvas ends the tour on the spot and
 * leaves the camera with the viewer's hand.
 */

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Vector3 } from "three";
import { useCityStore } from "@/store/useCityStore";
import { isTouring } from "@/lib/client/tourState";
import type { CityModel, Vec3 } from "@/types/city";
import { tourClock } from "./clock";
import {
  TOUR_LOOK_UP_POLAR,
  aimBox,
  flightPose,
  planFlight,
  planShots,
  shotPose,
  trackMs,
  type Flight,
  type Pose,
  type Shot,
} from "./path";

/** The slice of `CameraControls` the director drives. */
export interface DirectedControls {
  setLookAt(
    positionX: number,
    positionY: number,
    positionZ: number,
    targetX: number,
    targetY: number,
    targetZ: number,
    enableTransition?: boolean,
  ): Promise<void>;
  getPosition(out: Vector3, receiveEndValue?: boolean): Vector3;
  getTarget(out: Vector3, receiveEndValue?: boolean): Vector3;
  setFocalOffset(x: number, y: number, z: number, enableTransition?: boolean): Promise<void>;
  maxPolarAngle: number;
}

/** Under reduced motion each stop is a cut and a shorter, still dwell. */
const REDUCED_DWELL = 0.75;
const REDUCED_MIN_MS = 3500;
/** On a phone held upright the caption covers the bottom of the frame: lift the subject. */
const PORTRAIT_LIFT = 0.1;

const prefersReducedMotion = (): boolean =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

interface Leg {
  index: number;
  flight: Flight;
  holdMs: number;
  /** Milliseconds into the leg: the flight, then the hold. */
  clock: number;
  advanced: boolean;
}

interface Run {
  run: number;
  shots: Shot[];
  reduced: boolean;
  /** The box the controls keep their aim in. */
  box: [Vec3, Vec3];
  savedMaxPolar: number;
  leg: Leg | null;
}

/** How far past the horizon the controls let the camera look. */
function setMaxPolar(controls: DirectedControls, angle: number): void {
  controls.maxPolarAngle = angle;
}

const toVec3 = (v: Vector3): Vec3 => [v.x, v.y, v.z];
const clampAim = (target: Vec3, box: [Vec3, Vec3]): Vec3 =>
  [0, 1, 2].map((k) => Math.min(box[1][k], Math.max(box[0][k], target[k]))) as Vec3;

export function useTourDirector(
  controls: DirectedControls | null,
  city: CityModel | null,
  aspect: number,
): void {
  const run = useRef<Run | null>(null);
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);

  // The viewer takes the camera back by touching the city.
  useEffect(() => {
    const canvas = gl.domElement;
    const takeOver = () => {
      if (isTouring(useCityStore.getState().tour)) {
        useCityStore.getState().actions.tour({ type: "exit", to: "here" });
      }
    };
    canvas.addEventListener("pointerdown", takeOver);
    canvas.addEventListener("wheel", takeOver, { passive: true });
    return () => {
      canvas.removeEventListener("pointerdown", takeOver);
      canvas.removeEventListener("wheel", takeOver);
    };
  }, [gl]);

  useFrame((_, delta) => {
    const tour = useCityStore.getState().tour;
    const current = run.current;

    if (!controls || !city || !isTouring(tour)) {
      if (current && controls) {
        // Hand the camera back as the tour left it.
        setMaxPolar(controls, current.savedMaxPolar);
        void controls.setFocalOffset(0, 0, 0, true);
      }
      run.current = null;
      return;
    }

    const here = (): Pose => ({
      position: toVec3(controls.getPosition(new Vector3(), false)),
      target: toVec3(controls.getTarget(new Vector3(), false)),
    });

    let active = current;
    if (!active || active.run !== tour.run) {
      active = {
        run: tour.run,
        shots: planShots(city, tour.stops, aspect, here()),
        reduced: prefersReducedMotion(),
        box: aimBox(city),
        savedMaxPolar: current?.savedMaxPolar ?? controls.maxPolarAngle,
        leg: null,
      };
      run.current = active;
    }
    // Every frame, not once: a re-render of `<CameraControls>` puts its own
    // limit back, and the track looks up past it.
    setMaxPolar(controls, TOUR_LOOK_UP_POLAR);

    const shot = active.shots[tour.index];
    const stop = tour.stops[tour.index];
    if (!shot || !stop) return;

    if (!active.leg || active.leg.index !== tour.index) {
      const hold = active.reduced
        ? Math.max(REDUCED_MIN_MS, stop.holdMs * REDUCED_DWELL)
        : trackMs(shot, stop.holdMs);
      active.leg = {
        index: tour.index,
        flight: planFlight(city, here(), shotPose(shot, active.reduced ? 1 : 0), {
          reduced: active.reduced,
          into: shot,
          intoMs: hold,
        }),
        holdMs: hold,
        clock: 0,
        advanced: false,
      };
    }
    const leg = active.leg;
    // A long frame (a tab switched away and back) must not skip a stop.
    if (tour.status === "playing") leg.clock += Math.min(delta, 0.1) * 1000;

    const { durationMs } = leg.flight;
    const pose =
      leg.clock < durationMs
        ? flightPose(leg.flight, leg.clock / durationMs)
        : active.reduced
          ? shotPose(shot, 1)
          : shotPose(shot, (leg.clock - durationMs) / leg.holdMs);
    const target = clampAim(pose.target, active.box);
    void controls.setLookAt(...pose.position, ...target, false);

    // The caption sits over the bottom of a phone held upright.
    const fov = "fov" in camera ? (camera.fov as number) : 35;
    const lift =
      aspect < 0.8
        ? 2 *
          Math.hypot(
            pose.position[0] - target[0],
            pose.position[1] - target[1],
            pose.position[2] - target[2],
          ) *
          Math.tan((fov * Math.PI) / 360) *
          PORTRAIT_LIFT
        : 0;
    void controls.setFocalOffset(0, lift, 0, false);

    const total = durationMs + leg.holdMs;
    tourClock.run = tour.run;
    tourClock.index = tour.index;
    tourClock.fraction = total > 0 ? Math.min(1, leg.clock / total) : 1;

    if (!leg.advanced && leg.clock >= total) {
      leg.advanced = true;
      useCityStore.getState().actions.tour({ type: "advance", run: tour.run, index: tour.index });
    }
  });
}
