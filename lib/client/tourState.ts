/**
 * The tour's state machine, kept pure so the store only has to hold it.
 *
 *   idle --play--> playing <--pause/resume--> paused
 *   playing|paused --next--> the next stop, playing (past the last: idle)
 *   playing --advance--> the next stop, as the director's clock runs out
 *   playing|paused --exit--> idle
 *
 * `exit` says where the camera goes afterwards: "overview" glides back to the
 * default composition (Escape, the close button, the end of the tour);
 * "here" leaves it where it is, because the viewer has just grabbed it with
 * a drag, a click or the wheel, and flying off would fight their hand
 * (PLAN.md section 5: letting go of a drag never flies anywhere).
 */

import type { TourStop } from "./tour";

export type TourStatus = "idle" | "playing" | "paused";
export type TourExit = "overview" | "here";

export interface TourState {
  status: TourStatus;
  stops: TourStop[];
  /** The stop on screen; meaningless while idle. */
  index: number;
  /** Counts every play, so a replay of the same stops is still a new run. */
  run: number;
  /** How the last tour ended; read by the camera rig when it takes over. */
  exit: TourExit;
}

export type TourCommand =
  | { type: "play"; stops: TourStop[] }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "toggle" }
  | { type: "next" }
  | { type: "advance"; run: number; index: number }
  | { type: "exit"; to?: TourExit };

export const IDLE_TOUR: TourState = { status: "idle", stops: [], index: 0, run: 0, exit: "overview" };

export const isTouring = (tour: Pick<TourState, "status">): boolean => tour.status !== "idle";

/** The stop on screen, or null while no tour runs. */
export function currentStop(tour: TourState): TourStop | null {
  if (!isTouring(tour)) return null;
  return tour.stops[tour.index] ?? null;
}

function finish(tour: TourState, exit: TourExit): TourState {
  return { ...tour, status: "idle", exit };
}

/**
 * The next state. Returns the same object when a command does not apply, so
 * the store can skip an update that changes nothing.
 */
export function reduceTour(tour: TourState, command: TourCommand): TourState {
  switch (command.type) {
    case "play":
      if (command.stops.length === 0) return tour;
      return { status: "playing", stops: command.stops, index: 0, run: tour.run + 1, exit: "overview" };
    case "pause":
      return tour.status === "playing" ? { ...tour, status: "paused" } : tour;
    case "resume":
      return tour.status === "paused" ? { ...tour, status: "playing" } : tour;
    case "toggle":
      return tour.status === "playing"
        ? { ...tour, status: "paused" }
        : tour.status === "paused"
          ? { ...tour, status: "playing" }
          : tour;
    case "next":
      if (!isTouring(tour)) return tour;
      if (tour.index >= tour.stops.length - 1) return finish(tour, "overview");
      return { ...tour, status: "playing", index: tour.index + 1 };
    case "advance":
      // Only the clock of this run and this stop may move it on: a late
      // frame from before a skip or a replay must not skip a second stop.
      if (tour.status !== "playing" || command.run !== tour.run || command.index !== tour.index) return tour;
      if (tour.index >= tour.stops.length - 1) return finish(tour, "overview");
      return { ...tour, index: tour.index + 1 };
    case "exit":
      return isTouring(tour) ? finish(tour, command.to ?? "overview") : tour;
  }
}
