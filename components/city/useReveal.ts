"use client";

/**
 * React glue for the generation animation (PLAN.md section 43). The maths is
 * in `reveal.ts`; this file only carries the clock and drives object scales
 * from `useFrame`, so the reveal never triggers a React re-render.
 *
 * The clock is a ref object rather than a rendered value: reading a wall clock
 * during render is impure, so the first rendered frame stamps it instead.
 * Until that happens the start time is `Infinity`, which keeps every entity at
 * scale zero rather than flashing the finished city.
 */

import { createContext, useContext, useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group } from "three";
import { revealScale } from "./reveal";

/** `current` is `performance.now()` at the moment the model reached the scene. */
export type RevealClock = { current: number };

export const RevealContext = createContext<RevealClock>({ current: 0 });

export const useRevealClock = (): RevealClock => useContext(RevealContext);

/** Stamps the shared clock on the first rendered frame. */
export function useRevealTicker(clockRef: RevealClock): void {
  useFrame(() => {
    if (!Number.isFinite(clockRef.current)) clockRef.current = performance.now();
  });
}

/**
 * Attach the returned ref to a `<group>` placed at the entity's position: the
 * group scales from 0 to 1 starting at `appearAt`, so the entity grows out of
 * the ground rather than popping in.
 */
export function useRevealGroup(appearAt: number) {
  const clock = useRevealClock();
  const ref = useRef<Group>(null);
  const settled = useRef(false);

  useEffect(() => {
    settled.current = false;
  }, [clock, appearAt]);

  useFrame(() => {
    const group = ref.current;
    if (!group || settled.current) return;
    const scale = revealScale(performance.now(), clock.current, appearAt);
    group.visible = scale > 0.002;
    group.scale.setScalar(Math.max(scale, 0.002));
    if (scale >= 1) settled.current = true;
  });

  return ref;
}
