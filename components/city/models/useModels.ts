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

import { useEffect, useState } from "react";
import { loadModels, modelsLoaded } from "./imported";
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
