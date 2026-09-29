import { describe, expect, it } from "vitest";
import { LEAVE_FACTOR, SCENE_NEAR_SHARE, chooseNear, type SceneDistance } from "./sceneLod";

const scene = (id: string, distance: number, near = false): SceneDistance => ({ id, distance, near });

describe("choosing which scenes are drawn near", () => {
  it("takes the scenes within reach, nearest first, up to the cap", () => {
    const scenes = [scene("a", 40), scene("b", 10), scene("c", 25), scene("d", 80), scene("e", 30)];
    expect([...chooseNear(scenes, 50, 3)]).toEqual(["b", "c", "e"]);
    expect([...chooseNear(scenes, 50, 10)]).toEqual(["b", "c", "e", "a"]);
  });

  it("draws nothing near when the cap is zero or nothing is in reach", () => {
    expect(chooseNear([scene("a", 5)], 50, 0).size).toBe(0);
    expect(chooseNear([scene("a", 60), scene("b", 90)], 50, 3).size).toBe(0);
    expect(chooseNear([], 50, 3).size).toBe(0);
  });

  it("keeps a near scene a little past where it entered, so the edge does not flicker", () => {
    const at = 50 * (1 + (LEAVE_FACTOR - 1) / 2);
    expect(chooseNear([scene("a", at, false)], 50, 3).size).toBe(0);
    expect(chooseNear([scene("a", at, true)], 50, 3).has("a")).toBe(true);
    expect(chooseNear([scene("a", 50 * LEAVE_FACTOR + 0.1, true)], 50, 3).size).toBe(0);
  });

  it("lets a scene that is already near keep its place ahead of a farther newcomer only by distance", () => {
    // Both in reach; the cap of one goes to the nearer, whichever was near before.
    const scenes = [scene("old", 55, true), scene("new", 30, false)];
    expect([...chooseNear(scenes, 50, 1)]).toEqual(["new"]);
  });

  it("scales with the quality tier: medium halves the cap and shortens the reach, low turns it off", () => {
    expect(SCENE_NEAR_SHARE.high).toEqual({ distance: 1, cap: 1 });
    expect(SCENE_NEAR_SHARE.medium.cap).toBe(0.5);
    expect(SCENE_NEAR_SHARE.medium.distance).toBeLessThan(1);
    expect(SCENE_NEAR_SHARE.low).toEqual({ distance: 0, cap: 0 });
  });
});
