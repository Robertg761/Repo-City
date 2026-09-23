"use client";

/**
 * Object focus and return to overview (PLAN.md sections 5 and 6).
 *
 * Selecting anything flies the camera in to a useful inspection distance along
 * the direction the user is already looking from; clearing the selection, or
 * "Return to overview", restores the default composition computed from
 * `bounds.size`. The transition belongs to drei's `<CameraControls>`
 * (`setLookAt` with `enableTransition`), never to a hand-rolled tween.
 *
 * Nothing else moves the camera. A window resize only reframes an overview the
 * user has not touched, so a pan or an orbit is never snapped back.
 */

import { useEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import { CameraControlsImpl } from "@react-three/drei";
import { Box3, Vector3 } from "three";
import { useCityStore } from "@/store/useCityStore";
import type { CityModel, Vec3 } from "@/types/city";
import {
  cameraBoundary,
  tallestPoint,
  focusTargetFor,
  inspectionFraming,
  overviewFraming,
  viewAngles,
  type Framing,
} from "./entities";

/**
 * The slice of `CameraControls` this file uses. Typing it structurally keeps
 * `camera-controls` out of our imports: it is a transitive dependency of drei,
 * not one of ours, and drei re-exports the class for the `ACTION` constants.
 */
interface RigControls {
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
  normalizeRotations(): unknown;
  setBoundary(box3?: Box3): void;
  addEventListener(type: "control", listener: () => void): void;
  removeEventListener(type: "control", listener: () => void): void;
}

const isRigControls = (value: unknown): value is RigControls =>
  typeof (value as RigControls | null)?.setLookAt === "function" &&
  typeof (value as RigControls | null)?.normalizeRotations === "function";

const { ACTION } = CameraControlsImpl;

/**
 * How the camera answers the pointer, spread onto `<CameraControls>` in
 * `CityCanvas` (PLAN.md section 5). The aim is a map viewer: the ground stays
 * under the hand.
 */
export const CONTROLS_FEEL = {
  // Left drag orbits the target, right drag pans across the ground, the wheel
  // zooms. `SCREEN_PAN` is the map pan: a vertical drag slides the target
  // along the ground instead of lifting it into the sky, so the orbit pivot
  // stays on the city however far the user pans. The distance scaling is
  // built in, `truckSpeed` 2 moves the ground at the target one to one with
  // the pointer.
  mouseButtons: { left: ACTION.ROTATE, middle: ACTION.DOLLY, right: ACTION.SCREEN_PAN, wheel: ACTION.DOLLY },
  // One finger orbits, two pinch and pan, three pan. The library handles
  // `TOUCH_DOLLY_SCREEN_PAN` for two fingers but its typings (3.1.2) leave it
  // out of the two-finger union, hence the cast.
  touches: {
    one: ACTION.TOUCH_ROTATE,
    two: ACTION.TOUCH_DOLLY_SCREEN_PAN as number as typeof ACTION.TOUCH_DOLLY_TRUCK,
    three: ACTION.TOUCH_SCREEN_PAN,
  },
  truckSpeed: 2,
  // Zoom towards whatever is under the cursor, not the middle of the screen.
  dollyToCursor: true,
  // At the distance limits the wheel just stops; it never shoves the target.
  infinityDolly: false,
  // Fly-to and return to overview: a critically damped glide that settles in
  // about 0.7 s, a little brisker than the 0.25 default.
  smoothTime: 0.2,
  // Drags and wheel turns follow the hand closely, with just enough easing to
  // take the steps out of a mouse wheel.
  draggingSmoothTime: 0.09,
  restThreshold: 0.01,
} as const;

const toVec3 = (v: Vector3): Vec3 => [v.x, v.y, v.z];

function fly(controls: RigControls, framing: Framing, transition: boolean): void {
  void controls.setLookAt(...framing.position, ...framing.target, transition);
  // `setLookAt` lands on an azimuth in (-PI, PI], but the live one keeps
  // counting whole turns as the user orbits. Without this a camera that has
  // been spun round twice unwinds both turns on its way to the next object.
  if (transition) controls.normalizeRotations();
}

export default function CameraRig({
  city,
  aspect,
}: {
  city: CityModel | null;
  /** Canvas width over height: a narrow viewport frames from further back. */
  aspect: number;
}) {
  const controls = useThree((state) => state.controls);
  const selectedId = useCityStore((s) => s.selectedId);
  const overviewNonce = useCityStore((s) => s.overviewNonce);
  const lastCity = useRef<CityModel | null>(null);
  const lastAspect = useRef(aspect);
  /** Whether the user has moved the camera since the rig last framed it. */
  const touched = useRef(false);
  const size = city?.bounds.size ?? 120;

  // Any drag, pinch or wheel turn is the user's framing, not ours.
  useEffect(() => {
    if (!isRigControls(controls)) return;
    const onControl = () => {
      touched.current = true;
    };
    controls.addEventListener("control", onControl);
    return () => controls.removeEventListener("control", onControl);
  }, [controls]);

  // Pan and zoom-to-cursor keep the orbit target over the landscape and above
  // the ground (PLAN.md section 5).
  useEffect(() => {
    if (!isRigControls(controls)) return;
    // The ceiling follows the tallest tower, so a metropolis spire can still
    // be framed from its top (76.5 scale checks).
    const [min, max] = cameraBoundary(size, city ? tallestPoint(city) : undefined);
    controls.setBoundary(new Box3(new Vector3(...min), new Vector3(...max)));
  }, [controls, size, city]);

  // A resize (a phone turned on its side, a window snapped to half the
  // screen) refits an overview nobody has moved. Anything else stays put.
  useEffect(() => {
    const changed = lastAspect.current !== aspect;
    lastAspect.current = aspect;
    if (!changed || !isRigControls(controls)) return;
    if (touched.current || useCityStore.getState().selectedId) return;
    fly(controls, overviewFraming(size, aspect), true);
  }, [controls, size, aspect]);

  useEffect(() => {
    if (!isRigControls(controls)) return;

    // A brand new model snaps into frame; everything after that glides.
    const isNewModel = lastCity.current !== city;
    lastCity.current = city;

    const focus = city && selectedId ? focusTargetFor(city, selectedId) : null;
    let framing: Framing;
    if (focus) {
      // Aim along the view the camera is heading for, not where it happens to
      // be mid-flight: two quick clicks in a row keep the same bearing.
      const from = isNewModel
        ? undefined
        : viewAngles(
            toVec3(controls.getPosition(new Vector3(), true)),
            toVec3(controls.getTarget(new Vector3(), true)),
          );
      framing = inspectionFraming(focus, from);
    } else {
      framing = overviewFraming(city?.bounds.size ?? 120, lastAspect.current);
    }
    fly(controls, framing, !isNewModel);
    touched.current = false;
    // `overviewNonce` is a trigger: "Return to overview" flies back even when
    // nothing is selected.
  }, [controls, city, selectedId, overviewNonce]);

  useCameraDebugHandle(controls);
  usePinchAsDolly();

  return null;
}

/**
 * A trackpad pinch arrives as a wheel event with `ctrlKey` set, and
 * camera-controls always turns that into a lens zoom (`camera.zoom`) that
 * nothing ever resets, instead of the dolly the wheel does. Catch it before
 * the controls see it and hand it back as a plain wheel turn, so a pinch
 * moves the camera towards the cursor like the mouse wheel does. Stopping the
 * original also keeps the browser from zooming the page.
 */
function usePinchAsDolly(): void {
  const gl = useThree((state) => state.gl);
  useEffect(() => {
    const canvas = gl.domElement;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey || !event.isTrusted || event.target !== canvas) return;
      event.preventDefault();
      event.stopPropagation();
      canvas.dispatchEvent(
        new WheelEvent("wheel", {
          deltaX: event.deltaX,
          deltaY: event.deltaY,
          deltaZ: event.deltaZ,
          deltaMode: event.deltaMode,
          clientX: event.clientX,
          clientY: event.clientY,
          screenX: event.screenX,
          screenY: event.screenY,
          bubbles: true,
          cancelable: true,
        }),
      );
    };
    window.addEventListener("wheel", onWheel, { capture: true, passive: false });
    return () => window.removeEventListener("wheel", onWheel, { capture: true });
  }, [gl]);
}

/**
 * Development-only: `__repoCity.camera.state()` reports where the camera is
 * and what it orbits, and `__repoCity.camera.project(x, y, z)` gives the page
 * coordinates of a world point, so scripted pointer tests can aim at things.
 */
function useCameraDebugHandle(controls: unknown): void {
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  useEffect(() => {
    if (process.env.NODE_ENV === "production" || !isRigControls(controls)) return;
    const handle = (window as unknown as { __repoCity?: { camera?: unknown } }).__repoCity;
    if (!handle) return;
    handle.camera = {
      state() {
        const position = toVec3(controls.getPosition(new Vector3(), false));
        const target = toVec3(controls.getTarget(new Vector3(), false));
        return { position, target, ...viewAngles(position, target) };
      },
      project(x: number, y: number, z: number) {
        const v = new Vector3(x, y, z).project(camera);
        const rect = gl.domElement.getBoundingClientRect();
        return [
          rect.left + ((v.x + 1) / 2) * rect.width,
          rect.top + ((1 - v.y) / 2) * rect.height,
        ];
      },
    };
  }, [controls, camera, gl]);
}
