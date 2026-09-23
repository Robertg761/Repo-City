import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_SOUND } from "@/lib/client/audioSettings";
import { useCityStore } from "./useCityStore";

describe("the sound slice", () => {
  beforeEach(() => {
    useCityStore.setState({ sound: DEFAULT_SOUND });
  });

  it("starts off", () => {
    expect(useCityStore.getState().sound).toEqual(DEFAULT_SOUND);
    expect(useCityStore.getState().sound.on).toBe(false);
  });

  it("turns on and off without touching the volume", () => {
    const { setSound } = useCityStore.getState().actions;
    setSound({ on: true });
    expect(useCityStore.getState().sound).toEqual({ on: true, volume: DEFAULT_SOUND.volume });
    setSound({ on: false });
    expect(useCityStore.getState().sound.on).toBe(false);
  });

  it("clamps the volume and keeps the switch", () => {
    const { setSound } = useCityStore.getState().actions;
    setSound({ on: true, volume: 3 });
    expect(useCityStore.getState().sound).toEqual({ on: true, volume: 1 });
    setSound({ volume: -2 });
    expect(useCityStore.getState().sound).toEqual({ on: true, volume: 0 });
  });

  it("does not notify subscribers when nothing changed", () => {
    let calls = 0;
    const stop = useCityStore.subscribe(() => calls++);
    useCityStore.getState().actions.setSound({ on: false, volume: DEFAULT_SOUND.volume });
    stop();
    expect(calls).toBe(0);
  });

  it("survives analysing another repository", async () => {
    const { setSound, analyze } = useCityStore.getState().actions;
    setSound({ on: true, volume: 0.4 });
    await analyze("fixture");
    expect(useCityStore.getState().sound).toEqual({ on: true, volume: 0.4 });
  });
});
