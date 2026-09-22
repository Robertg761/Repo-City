import { describe, expect, it } from "vitest";
import { MAX_CARS } from "@/components/city/traffic";
import {
  MAX_COMPLETED_CONSTRUCTION,
  MAX_INCIDENTS,
  MAX_OPEN_CONSTRUCTION,
} from "@/lib/analysis/metrics";
import { MAX_BUILDINGS, MIN_CANDIDATES, TIER_SHARES } from "@/lib/analysis/fileSelection";
import { LIMITS, MAX_FOOTPRINT, MIN_FOOTPRINT, TIER_HEIGHT } from "./generator";
import {
  LANDMARK_BAND_MAX,
  LANDMARK_BAND_MIN,
  ROAD_MAJOR_WIDTH,
  ROAD_MINOR_WIDTH,
  TARGET_BLOCK,
  TARGET_PITCH,
  districtSquareSide,
  landmarkBandDepth,
  planHighways,
  planLayout,
} from "./layout";
import { SETTLEMENT_PARAMS, settlementName } from "./settlement";

const city = SETTLEMENT_PARAMS.city;

describe("SETTLEMENT_PARAMS.city equals today's constants (PLAN.md 76.5)", () => {
  it("building budget: fileSelection's floor and cap, the generator's limit", () => {
    expect(city.buildings.min).toBe(MIN_CANDIDATES);
    expect(city.buildings.max).toBe(MAX_BUILDINGS);
    expect(city.buildings.max).toBe(LIMITS.buildings);
  });

  it("tier heights, tier shares and footprints", () => {
    expect(city.tierHeight).toEqual(TIER_HEIGHT);
    expect(city.tierShares).toEqual(TIER_SHARES);
    expect(city.footprint).toEqual({ min: MIN_FOOTPRINT, max: MAX_FOOTPRINT });
  });

  it("road widths, block side and slot pitch", () => {
    expect(city.roads.major.width).toBe(ROAD_MAJOR_WIDTH);
    expect(city.roads.minor.width).toBe(ROAD_MINOR_WIDTH);
    expect(city.roads.major.kind).toBe("street");
    expect(city.roads.minor.kind).toBe("street");
    expect(city.blockSide).toBe(TARGET_BLOCK);
    expect(city.slotPitch).toBe(TARGET_PITCH);
  });

  it("district square side follows the same clamped curve", () => {
    const side = city.districtSide!;
    for (const n of [1, 2, 10, 50, 90, 115, 200, 300, 450, 600]) {
      const expected =
        Math.round(
          Math.min(side.max, Math.max(side.min, side.base + side.perRootBuilding * Math.sqrt(n))) *
            1000,
        ) / 1000;
      expect(districtSquareSide(n)).toBe(expected);
    }
  });

  it("landmark band limits", () => {
    expect(city.landmarkBand).toEqual({ min: LANDMARK_BAND_MIN, max: LANDMARK_BAND_MAX });
    expect(landmarkBandDepth(0)).toBe(city.landmarkBand!.min);
    expect(landmarkBandDepth(10_000)).toBe(city.landmarkBand!.max);
  });

  it("ring road is a major street", () => {
    const layout = planLayout([{ id: "d", buildingCount: 30 }], 30);
    const r = layout.ringRadius;
    const ring = layout.roads.filter(
      (road) =>
        Math.abs(road.from[0]) === r &&
        Math.abs(road.to[0]) === r &&
        road.from[0] === road.to[0],
    );
    expect(ring.length).toBeGreaterThan(0);
    for (const road of ring) {
      expect(road.width).toBe(city.ring!.width);
      expect(road.kind ?? "street").toBe(city.ring!.kind);
    }
  });

  it("highways out", () => {
    const layout = planLayout([{ id: "d", buildingCount: 30 }], 30);
    expect(planHighways(layout, 99)).toHaveLength(city.highways.max);
    expect(planHighways(layout, 0)).toHaveLength(city.highways.min);
  });

  it("hero incidents and sites, vehicles, trees and lamps", () => {
    expect(city.heroes.incidents).toBe(MAX_INCIDENTS);
    expect(city.heroes.incidents).toBe(LIMITS.incidents);
    expect(city.heroes.sites).toBe(LIMITS.construction);
    expect(city.heroes.sites).toBe(MAX_OPEN_CONSTRUCTION + MAX_COMPLETED_CONSTRUCTION);
    expect(city.vehicles.max).toBe(LIMITS.vehicles);
    expect(city.vehicles.max).toBe(MAX_CARS);
    expect(city.vehicles.tractors).toBe(false);
    expect(city.trees).toBe(LIMITS.trees);
    expect(city.lamps).toBe(LIMITS.lamps);
  });
});

describe("SETTLEMENT_PARAMS: every tier", () => {
  it.each(Object.entries(SETTLEMENT_PARAMS))("%s is internally consistent", (_tier, params) => {
    const shares = Object.values(params.tierShares).reduce((sum, share) => sum + share, 0);
    expect(shares).toBeCloseTo(1, 9);
    for (let tier = 2; tier <= 5; tier++) {
      expect(params.tierHeight[tier as 2]).toBeGreaterThan(params.tierHeight[(tier - 1) as 1]);
    }
    expect(params.buildings.min).toBeLessThan(params.buildings.max);
    expect(params.footprint.min).toBeLessThan(params.footprint.max);
    expect(params.roads.major.width).toBeGreaterThan(params.roads.minor.width);
    expect(params.bounds.min).toBeLessThan(params.bounds.max);
    expect(params.highways.min).toBeLessThanOrEqual(params.highways.max);
  });

  it("grows with the tier", () => {
    const order = [
      SETTLEMENT_PARAMS.village,
      SETTLEMENT_PARAMS.town,
      SETTLEMENT_PARAMS.city,
      SETTLEMENT_PARAMS.metropolis,
    ];
    for (let i = 1; i < order.length; i++) {
      expect(order[i].buildings.max).toBeGreaterThan(order[i - 1].buildings.max);
      expect(order[i].tierHeight[5]).toBeGreaterThan(order[i - 1].tierHeight[5]);
      expect(order[i].heroes.incidents).toBeGreaterThan(order[i - 1].heroes.incidents);
      expect(order[i].vehicles.max).toBeGreaterThan(order[i - 1].vehicles.max);
      expect(order[i].bounds.min).toBeGreaterThan(order[i - 1].bounds.min);
    }
  });
});

describe("settlementName", () => {
  it("names the settlement after the repository, never the owner", () => {
    expect(settlementName("village", "p-limit")).toBe("Village of p-limit");
    expect(settlementName("town", "zustand")).toBe("Town of zustand");
    expect(settlementName("city", "hono")).toBe("City of hono");
    expect(settlementName("metropolis", "react")).toBe("Greater react");
  });
});
