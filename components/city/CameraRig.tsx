"use client";

/**
 * Object focus and return to overview (PLAN.md sections 5 and 6).
 *
 * Selecting anything flies the camera to a useful inspection distance;
 * clearing the selection restores the default composition computed from
 * `bounds.size`. The transition belongs to drei's `<CameraControls>`
 * (`setLookAt` with `enableTransition`), never to a hand-rolled tween.
 */

import { useEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import { useCityStore } from "@/store/useCityStore";
import type { CityModel } from "@/types/city";
import { focusTargetFor, inspectionFraming, overviewFraming } from "./entities";

/**
 * The slice of `CameraControls` this file uses. Typing it structurally keeps
 * `camera-controls` out of the import graph: it is a transitive dependency of
 * drei, not one of ours.
 */
interface FocusControls {
  setLookAt(
    positionX: number,
    positionY: number,
    positionZ: number,
    targetX: number,
    targetY: number,
    targetZ: number,
    enableTransition?: boolean,
  ): Promise<void>;
}

const isFocusControls = (value: unknown): value is FocusControls =>
  typeof (value as FocusControls | null)?.setLookAt === "function";

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
  const lastCity = useRef<CityModel | null>(null);

  useEffect(() => {
    if (!isFocusControls(controls)) return;

    const size = city?.bounds.size ?? 120;
    const focus = city && selectedId ? focusTargetFor(city, selectedId) : null;
    const framing = focus ? inspectionFraming(focus) : overviewFraming(size, aspect);

    // A brand new model snaps into frame; everything after that glides.
    const isNewModel = lastCity.current !== city;
    lastCity.current = city;

    void controls.setLookAt(
      framing.position[0],
      framing.position[1],
      framing.position[2],
      framing.target[0],
      framing.target[1],
      framing.target[2],
      !isNewModel,
    );
  }, [controls, city, selectedId, aspect]);

  return null;
}
