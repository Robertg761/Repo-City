"use client";

/**
 * The live sky: the time of day as the renderer sees it, frame by frame.
 *
 * `timeOfDay.ts` says what the sky looks like at any point on the day's loop.
 * This file moves the city along that loop. `SkyProvider` watches the
 * viewer's setting in the store and, when it changes, travels the phase to
 * the new hour over `TRANSITION_MS` (at once under `prefers-reduced-motion`,
 * or when the setting was restored rather than chosen, or when a new city
 * arrives). Every frame of the trip it writes the whole resolved
 * `SceneAtmosphere` into one mutable object and bumps its version.
 *
 * NOTHING RE-RENDERS FOR THE HOUR. The sun, the sky dome, the exposure, the
 * windows, the lamps and the headlights read the live object from their own
 * frame loop (`useSkyFrame`) and write straight into their lights, materials
 * and uniforms, so a transition costs no React work at all. The handful of
 * components with a few glowing parts each (landmarks, heroes, civic
 * buildings) follow the hour in coarse steps instead (`useSkyValue`).
 *
 * The `atmosphere` prop the city still passes down is Auto's. Its colour
 * character -- `desaturation`, `terrainColor` and the rest -- is the same at
 * every hour; only what `useSky` says changes with the time.
 */

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useFrame } from "@react-three/fiber";
import { useCityStore } from "@/store/useCityStore";
import type { CityModel } from "@/types/city";
import type { SceneAtmosphere } from "./palette";
import {
  TRANSITION_MS,
  autoSky,
  phaseAlong,
  skyAt,
  targetPhase,
  travelTo,
  wrapPhase,
  type TimeSetting,
} from "./timeOfDay";

type Ambience = CityModel["ambience"];

export interface LiveSky {
  /** The sky this frame. Replaced, never mutated, when it changes. */
  atmosphere: SceneAtmosphere;
  /** Bumped every time `atmosphere` is replaced. */
  version: number;
  /** Where on the day's loop the sky is, `[0, 4)`. */
  phase: number;
  /** True while a change of setting is playing out. */
  moving: boolean;
}

/** The empty stage's light, and the fallback outside a provider. */
export const STAGE_AMBIENCE: Ambience = {
  warmth: 0.72,
  saturation: 0.9,
  fog: 0.1,
  trafficDensity: 0,
  pedestrianDensity: 0,
  litWindowShare: 0.75,
};

const SkyContext = createContext<LiveSky | null>(null);

const fallback: LiveSky = {
  atmosphere: autoSky(STAGE_AMBIENCE, false),
  version: 0,
  phase: 1,
  moving: false,
};

/** The live sky of the nearest `SkyProvider`. */
export function useSky(): LiveSky {
  return useContext(SkyContext) ?? fallback;
}

const prefersStill = (): boolean =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** The resolved sky for a setting, settled rather than on its way. */
function settledSky(setting: TimeSetting, ambience: Ambience, archived: boolean): SceneAtmosphere {
  // Auto is resolved by its own function so it is `atmosphere()` exactly,
  // not the same thing to within floating point.
  return setting === "auto"
    ? autoSky(ambience, archived)
    : skyAt(ambience, archived, targetPhase(setting, ambience, archived));
}

interface Trip {
  from: number;
  to: number;
  start: number;
}

/**
 * The mutable sky every consumer reads. A class rather than a bare object so
 * that the one writer, `SkyProvider`'s frame loop, changes it through a
 * method.
 */
class SkyState implements LiveSky {
  version = 0;
  moving = false;
  constructor(
    public atmosphere: SceneAtmosphere,
    public phase: number,
  ) {}

  show(atmosphere: SceneAtmosphere, phase: number, moving: boolean): void {
    this.atmosphere = atmosphere;
    this.phase = phase;
    this.moving = moving;
    this.version++;
  }
}

/**
 * Drives the live sky for everything inside it. `ambience` and `archived`
 * are the city's (or the empty stage's); a new pair is a new city, and the
 * sky cuts straight to it rather than sweeping across from the last one.
 */
export function SkyProvider({
  ambience,
  archived,
  children,
}: {
  ambience: Ambience;
  archived: boolean;
  children: ReactNode;
}) {
  const [live] = useState(() => {
    const setting = useCityStore.getState().timeSetting;
    return new SkyState(
      settledSky(setting, ambience, archived),
      wrapPhase(targetPhase(setting, ambience, archived)),
    );
  });
  const seen = useRef<{ ambience: Ambience; archived: boolean; setting: TimeSetting; target: number } | null>(null);
  const trip = useRef<Trip | null>(null);

  // Before every other frame callback (negative priority never takes over
  // the render loop), so the whole city reads the same sky each frame.
  useFrame(() => {
    const { timeSetting: setting, timeChange } = useCityStore.getState();
    const last = seen.current;
    const target = wrapPhase(targetPhase(setting, ambience, archived));

    // A new city, or the first frame: straight to its hour.
    if (!last || last.ambience !== ambience || last.archived !== archived) {
      seen.current = { ambience, archived, setting, target };
      trip.current = null;
      if (last) live.show(settledSky(setting, ambience, archived), target, false);
      return;
    }

    const now = performance.now();
    if (setting !== last.setting) {
      seen.current = { ...last, setting, target };
      if (timeChange === "cut" || prefersStill()) {
        trip.current = null;
        live.show(settledSky(setting, ambience, archived), target, false);
        return;
      }
      trip.current = { from: live.phase, to: travelTo(live.phase, target), start: now };
    }

    const current = trip.current;
    if (!current) return;
    const elapsed = now - current.start;
    if (elapsed >= TRANSITION_MS) {
      trip.current = null;
      live.show(settledSky(setting, ambience, archived), target, false);
    } else {
      const phase = phaseAlong(current.from, current.to, elapsed);
      live.show(skyAt(ambience, archived, phase), wrapPhase(phase), true);
    }
  }, -2);

  return <SkyContext.Provider value={live}>{children}</SkyContext.Provider>;
}

/**
 * Calls `apply` from the frame loop with the live sky, once when mounted (or
 * when `key` changes) and then only on frames where the sky has changed.
 * For writing the hour straight into lights, materials and uniforms.
 */
export function useSkyFrame(apply: (atmosphere: SceneAtmosphere) => void, key?: unknown): void {
  const sky = useSky();
  const seen = useRef(-1);
  const applyRef = useRef(apply);
  useEffect(() => {
    applyRef.current = apply;
  });
  useEffect(() => {
    seen.current = -1;
  }, [key]);
  useFrame(() => {
    if (seen.current === sky.version) return;
    seen.current = sky.version;
    applyRef.current(sky.atmosphere);
  });
}

/**
 * One number from the live sky as React state, following the hour in steps
 * of `step` while it moves and landing exactly when it stops. For components
 * with a few glowing parts, where a dozen re-renders over a transition cost
 * less than wiring every material to the frame loop.
 */
export function useSkyValue(select: (atmosphere: SceneAtmosphere) => number, step = 0.05): number {
  const sky = useSky();
  const [value, setValue] = useState(() => select(sky.atmosphere));
  const shown = useRef(value);
  useSkyFrame((atmosphere) => {
    const next = select(atmosphere);
    if (next === shown.current) return;
    if (sky.moving && Math.abs(next - shown.current) < step) return;
    shown.current = next;
    setValue(next);
  });
  return value;
}
