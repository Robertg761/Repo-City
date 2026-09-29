"use client";

/**
 * Starts loading the Blender models the moment the app opens and reports
 * when they are in. The model data ships in chunks of its own (`imported.ts`),
 * so it downloads while the repository is being surveyed; the city waits for
 * it only if it arrives first.
 *
 * If the chunks cannot be fetched (a deploy replaced them under an open tab,
 * a flaky connection), one more attempt is made, and then the page reloads on
 * the procedural models rather than leaving an empty stage.
 */

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useFrame } from "@react-three/fiber";
import { loadModels, loadNearModels, modelsLoaded, nearModelsVersion, subscribeNearModels } from "./imported";
import { BLENDER_MODELS, PROCEDURAL_PARAM } from "./modelSource";

async function loadWithRetry(): Promise<void> {
  try {
    await loadModels();
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await loadModels();
  }
}

function fallBackToProcedural(error: unknown): void {
  console.error("Repo City: the Blender models could not be loaded; using the procedural ones.", error);
  const url = new URL(window.location.href);
  url.searchParams.set("models", PROCEDURAL_PARAM);
  window.location.replace(url);
}

export function useModelsReady(): boolean {
  const [ready, setReady] = useState(() => !BLENDER_MODELS || modelsLoaded());
  useEffect(() => {
    if (ready) return;
    let live = true;
    loadWithRetry().then(
      () => {
        if (live) setReady(true);
      },
      (error: unknown) => {
        if (live) fallBackToProcedural(error);
      },
    );
    return () => {
      live = false;
    };
  }, [ready]);
  return ready;
}

const serverVersion = () => 0;

/**
 * A number that changes each time a near model lands (`loadNearModels`).
 * Read it in a component that draws a near level, and put it in the deps of
 * any memo that builds one: the near accessors return null until their model
 * is in, and this is what makes the component ask again.
 */
export function useNearModels(): number {
  return useSyncExternalStore(subscribeNearModels, nearModelsVersion, serverVersion);
}

/**
 * How long after the city is on screen the near models are fetched at the
 * latest, if the camera has still not come close: long enough that the reveal,
 * the quality probe and the baked surface swaps are all over, soon enough that
 * they are in before a visitor has zoomed in.
 */
const NEAR_IDLE_DELAY_MS = 10_000;
/** The camera this low (world units above the ground) is close enough for a near level to matter. */
export const NEAR_APPROACH_HEIGHT = 110;

/**
 * Starts fetching the near levels once the city has been drawn (`shown`), in
 * the background, one model at a time, and only when they can matter: the
 * moment the camera comes down towards the city (`NearModelsOnApproach`), or
 * when the browser has been idle for a while after the reveal. Never on the
 * low tier or the procedural models, which have none (`enabled` false).
 */
export function useLoadNearModels(shown: boolean, enabled: boolean): void {
  useEffect(() => {
    if (!shown || !enabled || !BLENDER_MODELS) return;
    let timer = 0;
    let idle = 0;
    const start = () => {
      // Waits for the browser to have nothing else to do, but not for ever.
      if (typeof requestIdleCallback === "function") idle = requestIdleCallback(() => void loadNearModels(), { timeout: 5000 });
      else void loadNearModels();
    };
    timer = window.setTimeout(start, NEAR_IDLE_DELAY_MS);
    return () => {
      window.clearTimeout(timer);
      if (idle && typeof cancelIdleCallback === "function") cancelIdleCallback(idle);
    };
  }, [shown, enabled]);
}

/**
 * Inside the canvas: fetches the near levels as soon as the camera has come
 * down close enough to draw one, instead of waiting out the idle delay.
 */
export function useLoadNearModelsOnApproach(enabled: boolean): void {
  const started = useRef(false);
  useFrame(({ camera }) => {
    if (started.current || !enabled || !BLENDER_MODELS) return;
    if (camera.position.y > NEAR_APPROACH_HEIGHT) return;
    started.current = true;
    void loadNearModels();
  });
}
