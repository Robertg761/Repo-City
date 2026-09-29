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

import { useEffect, useState, useSyncExternalStore } from "react";
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

/** How long after the city is on screen the first near model is fetched. */
const NEAR_START_DELAY_MS = 1500;

/**
 * Starts fetching the near levels once the city has been drawn (`shown`), in
 * the background, one model at a time. Never on the low tier or the procedural
 * models, which have none (`enabled` false).
 */
export function useLoadNearModels(shown: boolean, enabled: boolean): void {
  useEffect(() => {
    if (!shown || !enabled || !BLENDER_MODELS) return;
    // Two frames so the first draw is out, then a pause for the frame-rate
    // governor and the reveal to settle before any decoding competes with them.
    let timer = 0;
    const frame = requestAnimationFrame(() => {
      timer = window.setTimeout(() => void loadNearModels(), NEAR_START_DELAY_MS);
    });
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [shown, enabled]);
}
