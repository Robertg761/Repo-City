/**
 * How far through the current stop the tour is, shared between the camera
 * director (inside the canvas) and the progress bar (in the HUD) without a
 * store update on every frame. The director writes it; the overlay reads it
 * in its own animation frame and moves one bar.
 */
export const tourClock = {
  /** The run and stop the fraction belongs to. */
  run: 0,
  index: 0,
  /** 0 to 1 through the stop, flight and hold together. */
  fraction: 0,
};
