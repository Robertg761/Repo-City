import { describe, expect, it } from "vitest";
import type { RoadSegment } from "@/types/city";
import { PAVEMENT_TOP, ROAD_TOP, footprintSurface, indexRoads, surfaceAt, type LocalBox } from "./plan";

// One street along x, 6 wide: carriageway |z| <= 3, pavement beyond.
const street: RoadSegment = { id: "r", from: [-50, 0, 0], to: [50, 0, 0], width: 6, major: false, appearAt: 0 };
const index = indexRoads([street]);
const car: LocalBox = { minX: -0.3, maxX: 0.3, minZ: -0.6, maxZ: 0.6, maxY: 1 };

describe("footprintSurface", () => {
  it("rests on the carriageway, the carriageway being at its true height", () => {
    expect(ROAD_TOP).toBeCloseTo(0.08, 5);
    expect(footprintSurface(0, 0, 0, car, index)).toBe(ROAD_TOP);
  });

  it("stands on the pavement when wholly on it", () => {
    const post: LocalBox = { minX: -0.2, maxX: 0.2, minZ: -0.2, maxZ: 0.2, maxY: 1 };
    expect(footprintSurface(0, 3.6, 0, post, index)).toBe(PAVEMENT_TOP);
  });

  it("takes the lowest surface when straddling the kerb, so nothing hovers", () => {
    // Centre on the pavement, one end over the carriageway: it rests on the road.
    expect(surfaceAt(0, 3.6, index)).toBe(PAVEMENT_TOP);
    expect(footprintSurface(0, 3.3, 0, car, index)).toBe(ROAD_TOP);
    // Centre on the carriageway, an end over the pavement: still the road.
    expect(footprintSurface(0, 2.6, 0, car, index)).toBe(ROAD_TOP);
    // On the pavement's far edge with an end on bare ground: the ground.
    expect(footprintSurface(0, 4.0, 0, car, index)).toBe(0);
  });

  it("turns the footprint with the object", () => {
    // Long axis across the kerb reaches the road; turned along it, it does not.
    const across = footprintSurface(0, 3.3, 0, car, index);
    const along = footprintSurface(0, 3.3, Math.PI / 2, car, index);
    expect(across).toBeLessThan(along);
    expect(along).toBe(PAVEMENT_TOP);
  });
});
