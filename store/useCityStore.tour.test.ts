import { beforeEach, describe, expect, it } from "vitest";
import { buildTour } from "@/lib/client/tour";
import { IDLE_TOUR } from "@/lib/client/tourState";
import { useCityStore } from "./useCityStore";

describe("the tour in the store", () => {
  beforeEach(async () => {
    useCityStore.setState({ tour: IDLE_TOUR, selectedId: null });
    await useCityStore.getState().actions.analyze("fixture");
  });

  const play = () => {
    const { city, analysis, actions } = useCityStore.getState();
    const stops = buildTour(city, analysis);
    actions.tour({ type: "play", stops });
    return stops;
  };

  it("plays, marking each stop's subject with the selection ring", () => {
    const stops = play();
    let state = useCityStore.getState();
    expect(state.tour.status).toBe("playing");
    expect(state.selectedId).toBeNull(); // the establishing shot is the whole city
    state.actions.tour({ type: "next" });
    state = useCityStore.getState();
    expect(state.tour.index).toBe(1);
    expect(state.selectedId).toBe(stops[1].subjectId);
  });

  it("pauses and resumes without moving the selection", () => {
    play();
    const { actions } = useCityStore.getState();
    actions.tour({ type: "next" });
    const subject = useCityStore.getState().selectedId;
    actions.tour({ type: "pause" });
    expect(useCityStore.getState().tour.status).toBe("paused");
    expect(useCityStore.getState().selectedId).toBe(subject);
    actions.tour({ type: "resume" });
    expect(useCityStore.getState().tour.status).toBe("playing");
  });

  it("skips to the end and clears the selection when it finishes", () => {
    const stops = play();
    const { actions } = useCityStore.getState();
    for (let i = 0; i < stops.length; i++) actions.tour({ type: "next" });
    const state = useCityStore.getState();
    expect(state.tour.status).toBe("idle");
    expect(state.tour.exit).toBe("overview");
    expect(state.selectedId).toBeNull();
  });

  it("exits on the spot when the viewer takes the camera", () => {
    play();
    const { actions } = useCityStore.getState();
    actions.tour({ type: "next" });
    actions.tour({ type: "exit", to: "here" });
    const state = useCityStore.getState();
    expect(state.tour).toMatchObject({ status: "idle", exit: "here" });
    expect(state.selectedId).toBeNull();
  });

  it("stops when another repository is surveyed", async () => {
    play();
    const surveying = useCityStore.getState().actions.analyze("fixture");
    expect(useCityStore.getState().tour.status).toBe("idle");
    await surveying;
  });
});
