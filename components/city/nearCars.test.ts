import { describe, expect, it } from "vitest";
import { publishNearCars, sameList, selectNearCars, type NearSelection } from "./nearCars";

const at = [0, 10, 3, 4, 100, 0, 6, 8];

describe("selectNearCars", () => {
  it("picks the cars that look biggest, nearest first, up to the cap", () => {
    const radius = [1.5, 1.5, 1.5, 1.5];
    // Camera at the origin, 1 up: distances 10, 5, 100, 10.
    expect(selectNearCars(at, radius, 4, { x: 0, y: 1, z: 0 }, 0.6, 0.05, 8)).toEqual([1, 0, 3]);
    expect(selectNearCars(at, radius, 4, { x: 0, y: 1, z: 0 }, 0.6, 0.05, 2)).toEqual([1, 0]);
  });

  it("weighs a big car's radius, and takes none at the overview or when the cap is zero", () => {
    expect(selectNearCars(at, [1.5, 1.5, 1.5, 6], 4, { x: 0, y: 1, z: 0 }, 0.6, 0.05, 8)[0]).toBe(3);
    expect(selectNearCars(at, [1.5, 1.5, 1.5, 1.5], 4, { x: 0, y: 300, z: 0 }, 0.6, 0.05, 8)).toEqual([]);
    expect(selectNearCars(at, [1.5, 1.5, 1.5, 1.5], 4, { x: 0, y: 1, z: 0 }, 0.6, 0.05, 0)).toEqual([]);
  });
});

describe("publishNearCars", () => {
  it("gives each group its cars' slots and the wheel mesh their four wheels", () => {
    // Cars 0 and 2 are sedans (slots 0, 1), cars 1 and 3 vans (slots 0, 1).
    const groupOf = [0, 1, 0, 1];
    const slotOf = [0, 0, 1, 1];
    const bodies: NearSelection[] = [{ current: [] }, { current: [] }];
    const wheels: NearSelection = { current: [] };
    publishNearCars([2, 1], groupOf, slotOf, bodies, wheels);
    expect(bodies[0].current).toEqual([1]);
    expect(bodies[1].current).toEqual([0]);
    expect(wheels.current).toEqual([4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it("keeps an array whose set has not changed, so followers do not swap again", () => {
    const groupOf = [0, 0];
    const slotOf = [0, 1];
    const bodies: NearSelection[] = [{ current: [] }];
    const wheels: NearSelection = { current: [] };
    publishNearCars([1, 0], groupOf, slotOf, bodies, wheels);
    const first = [bodies[0].current, wheels.current];
    publishNearCars([0, 1], groupOf, slotOf, bodies, wheels);
    expect(bodies[0].current).toBe(first[0]);
    expect(wheels.current).toBe(first[1]);
    publishNearCars([0], groupOf, slotOf, bodies, wheels);
    expect(bodies[0].current).toEqual([0]);
    expect(sameList([1, 2], [1, 2])).toBe(true);
    expect(sameList([1, 2], [2, 1])).toBe(false);
  });
});
