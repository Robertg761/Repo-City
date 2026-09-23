import { describe, expect, it } from "vitest";
import type { TourStop } from "./tour";
import { IDLE_TOUR, currentStop, isTouring, reduceTour, type TourState } from "./tourState";

const stop = (kind: TourStop["kind"], subjectId: string | null = null): TourStop => ({
  key: subjectId ? `${kind}:${subjectId}` : kind,
  kind,
  subjectId,
  caption: { eyebrow: kind, title: kind, line: kind },
  holdMs: 5000,
});

const STOPS = [stop("establish"), stop("district", "b-1"), stop("power", "landmark-power"), stop("finale")];
const playing = (): TourState => reduceTour(IDLE_TOUR, { type: "play", stops: STOPS });

describe("the tour state machine", () => {
  it("plays from the first stop, counting runs", () => {
    const tour = playing();
    expect(tour).toMatchObject({ status: "playing", index: 0, run: 1, exit: "overview" });
    expect(currentStop(tour)).toBe(STOPS[0]);
    expect(reduceTour(tour, { type: "play", stops: STOPS }).run).toBe(2);
  });

  it("will not play an empty tour", () => {
    expect(reduceTour(IDLE_TOUR, { type: "play", stops: [] })).toBe(IDLE_TOUR);
    expect(isTouring(IDLE_TOUR)).toBe(false);
    expect(currentStop(IDLE_TOUR)).toBeNull();
  });

  it("pauses and resumes, and toggles between the two", () => {
    const paused = reduceTour(playing(), { type: "pause" });
    expect(paused.status).toBe("paused");
    expect(reduceTour(paused, { type: "pause" })).toBe(paused);
    expect(reduceTour(paused, { type: "resume" }).status).toBe("playing");
    expect(reduceTour(paused, { type: "toggle" }).status).toBe("playing");
    expect(reduceTour(playing(), { type: "toggle" }).status).toBe("paused");
    expect(reduceTour(IDLE_TOUR, { type: "toggle" })).toBe(IDLE_TOUR);
    expect(reduceTour(IDLE_TOUR, { type: "resume" })).toBe(IDLE_TOUR);
  });

  it("skips to the next stop, playing again if it was paused", () => {
    const paused = reduceTour(playing(), { type: "pause" });
    const next = reduceTour(paused, { type: "next" });
    expect(next).toMatchObject({ status: "playing", index: 1 });
    expect(currentStop(next)?.subjectId).toBe("b-1");
  });

  it("finishes after the last stop and returns to the overview", () => {
    let tour = playing();
    for (let i = 0; i < STOPS.length - 1; i++) tour = reduceTour(tour, { type: "next" });
    expect(tour.index).toBe(STOPS.length - 1);
    tour = reduceTour(tour, { type: "next" });
    expect(tour).toMatchObject({ status: "idle", exit: "overview" });
  });

  it("advances only on the clock of the current run and stop", () => {
    const tour = playing();
    const advanced = reduceTour(tour, { type: "advance", run: tour.run, index: 0 });
    expect(advanced.index).toBe(1);
    // A late tick from the stop before, or from an earlier run, changes nothing.
    expect(reduceTour(advanced, { type: "advance", run: tour.run, index: 0 })).toBe(advanced);
    expect(reduceTour(advanced, { type: "advance", run: tour.run - 1, index: 1 })).toBe(advanced);
    // Paused, the clock stands still.
    const paused = reduceTour(advanced, { type: "pause" });
    expect(reduceTour(paused, { type: "advance", run: tour.run, index: 1 })).toBe(paused);
  });

  it("advancing past the last stop ends the tour", () => {
    let tour = playing();
    for (let i = 0; i < STOPS.length; i++) tour = reduceTour(tour, { type: "advance", run: tour.run, index: tour.index });
    expect(tour.status).toBe("idle");
    expect(tour.exit).toBe("overview");
  });

  it("exits to the overview, or leaves the camera where the viewer grabbed it", () => {
    expect(reduceTour(playing(), { type: "exit" })).toMatchObject({ status: "idle", exit: "overview" });
    expect(reduceTour(playing(), { type: "exit", to: "here" })).toMatchObject({ status: "idle", exit: "here" });
    const paused = reduceTour(playing(), { type: "pause" });
    expect(reduceTour(paused, { type: "exit", to: "here" }).status).toBe("idle");
    expect(reduceTour(IDLE_TOUR, { type: "exit" })).toBe(IDLE_TOUR);
  });
});
