import { describe, expect, it } from "vitest";
import { DISTRICT_SURFACE_TILE, districtSurfaceKind, districtSurfaceUvs } from "./districtSurface";

describe("district paving", () => {
  it("keeps shared plot edges continuous and maps one tile to a fixed world distance", () => {
    const west = districtSurfaceUvs({ x: -5, z: 3, w: 10, d: 12 });
    const east = districtSurfaceUvs({ x: 7, z: 3, w: 14, d: 12 });
    expect(west[2]).toBe(east[0]);
    expect(west[6]).toBe(east[4]);
    expect(west[3]).toBe(east[1]);
    expect(west[7]).toBe(east[5]);
    expect(west[2] - west[0]).toBeCloseTo(10 / DISTRICT_SURFACE_TILE);
    expect(west[5] - west[1]).toBeCloseTo(12 / DISTRICT_SURFACE_TILE);
  });

  it("uses concrete in city plots, setts in towns, and leaves village greens as lawn", () => {
    expect(districtSurfaceKind("city")).toBe("concrete");
    expect(districtSurfaceKind("metropolis")).toBe("concrete");
    expect(districtSurfaceKind(undefined)).toBe("concrete");
    expect(districtSurfaceKind("town")).toBe("setts");
    expect(districtSurfaceKind("village")).toBe("lawn");
  });
});
