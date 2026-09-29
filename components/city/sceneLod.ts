"use client";

/**
 * Levels of detail for the hero scenes: the construction sites, the street
 * incidents and the finished houses.
 *
 * Each is drawn a handful of times, from the city's shared pools (`Batch.tsx`),
 * as a lean scene for the whole city and a near one (30,000 to 60,000
 * triangles, `blender/scenes_near/`) for the few the camera is close to. The
 * near scenes are too heavy to draw for all of them at once (eight sites at
 * 60,000 is half a million triangles, twice over with shadows), so `useSceneNear`
 * picks: a scene goes near when the camera is within its distance, at most
 * `cap` of them at a time, the nearest first, and leaves it a little further
 * out than it entered so a camera hovering at the edge does not flicker.
 *
 * It is not drei's `<Detailed>`: the parts are pooled placeholders, not meshes,
 * so there is no object to swap. The scenes render the lean or the near parts
 * from the boolean this returns; the swap re-registers a handful of pool
 * entries and costs nothing per frame.
 *
 * The quality tier scales it as it scales the instanced layers (`lod.tsx`):
 * high keeps the distance and the cap, medium draws near scenes from two thirds
 * of the distance and halves the cap, low turns detail off. Every near model
 * downloads after the city is drawn (`loadNearModels`); a scene stays lean
 * until they are all in.
 */

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { Vector3, type Object3D } from "three";
import { nearModelsLoaded } from "./models/imported";
import { useNearModels } from "./models/useModels";
import { useQuality, type QualityTier } from "./quality";

/** Share of a scene's near distance, and of its cap, each tier draws. */
export const SCENE_NEAR_SHARE: Record<QualityTier, { distance: number; cap: number }> = {
  high: { distance: 1, cap: 1 },
  medium: { distance: 0.66, cap: 0.5 },
  low: { distance: 0, cap: 0 },
};

/** Frames between decisions for one scene. */
const DECIDE_EVERY = 6;

/** How much further out than `enter` a near scene stays near. */
export const LEAVE_FACTOR = 1.2;

export interface SceneDistance {
  id: symbol | string;
  /** From the camera, world units. */
  distance: number;
  /** Whether it is near now, so it keeps its place a little longer. */
  near: boolean;
}

/**
 * The scenes to draw near: those within `enter` of the camera (`enter` times
 * `LEAVE_FACTOR` for one that already is), nearest first, at most `cap`. Pure,
 * for the tests.
 */
export function chooseNear(scenes: readonly SceneDistance[], enter: number, cap: number): Set<SceneDistance["id"]> {
  return new Set(
    scenes
      .filter((scene) => scene.distance < (scene.near ? enter * LEAVE_FACTOR : enter))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, Math.max(0, Math.floor(cap)))
      .map((scene) => scene.id),
  );
}

interface Entry extends SceneDistance {
  enter: number;
  cap: number;
}

/** Every mounted scene, by id: what each one's decision ranks itself against. */
const REGISTRY = new Map<symbol, Entry>();

/**
 * Whether the scene at `target` should be drawn near. `distance` is the
 * camera distance (world units) inside which it goes near; `cap` is how many
 * scenes of its kind may be near at once.
 */
export function useSceneNear(target: RefObject<Object3D | null>, distance: number, cap: number): boolean {
  const { tier } = useQuality();
  // A scene's near level reads many near models at once (the crane, the site
  // kit, the vehicles, the walkers...): it waits until every one is in, and
  // draws the lean scene until then. The hook re-renders it as they land.
  useNearModels();
  const loaded = nearModelsLoaded();
  const share = SCENE_NEAR_SHARE[tier];
  const id = useMemo(() => Symbol("scene"), []);
  const [near, setNear] = useState(false);
  const frame = useRef(0);
  const at = useMemo(() => new Vector3(), []);
  const enter = distance * share.distance;
  const most = Math.floor(cap * share.cap);

  useEffect(() => {
    return () => {
      REGISTRY.delete(id);
    };
  }, [id]);

  useFrame(({ camera }) => {
    if (most === 0) return;
    if (frame.current++ % DECIDE_EVERY !== 0) return;
    const object = target.current;
    if (!object) return;
    object.getWorldPosition(at);
    const entry = REGISTRY.get(id) ?? { id, distance: Infinity, near: false, enter, cap: most };
    entry.distance = camera.position.distanceTo(at);
    entry.enter = enter;
    entry.cap = most;
    REGISTRY.set(id, entry);
    // Rank against the scenes of the same reach and cap (a site against
    // sites, an incident against incidents).
    const peers = [...REGISTRY.values()].filter((other) => other.enter === enter && other.cap === most);
    const chosen = chooseNear(peers, enter, most).has(id);
    entry.near = chosen;
    setNear(chosen);
  });

  // The tier turning detail off drops it at once, not at the next decision.
  return most > 0 && near && loaded;
}
