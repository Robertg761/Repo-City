/**
 * Where the city's models come from. By default they are the ones modelled in
 * Blender (`blender/*.py`, loaded by `imported.ts`); `?models=procedural`
 * switches back to the procedural TypeScript builders they replaced, for
 * comparison, and the app falls back to them by itself if the model data
 * cannot be loaded (`useModels.ts`).
 *
 * Read once, in the browser only. Tests run in node and so see the
 * procedural builders unless they mock this; the Blender variants have tests
 * of their own that call them directly.
 */
export const PROCEDURAL_PARAM = "procedural";

export const BLENDER_MODELS =
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).get("models") !== PROCEDURAL_PARAM;
