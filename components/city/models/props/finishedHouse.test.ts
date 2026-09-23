import { describe, expect, it } from "vitest";
import { COMPLETED_SITE } from "@/lib/city/generator";
import { SETTLEMENT_PARAMS } from "@/lib/city/settlement";
import {
  FINISHED,
  finishedDressingGeometry,
  finishedHouseGeometry,
  finishedTier,
  type FinishedTier,
} from "./finishedHouse";

const TIERS: FinishedTier[] = ["village", "town"];

describe("the finished house of a merged pull request (PLAN.md 76.5)", () => {
  it("is drawn in villages and towns only; a city keeps its crane-sized site", () => {
    expect(finishedTier("village")).toBe("village");
    expect(finishedTier("town")).toBe("town");
    expect(finishedTier("city")).toBeNull();
    expect(finishedTier("metropolis")).toBeNull();
    expect(finishedTier(undefined)).toBeNull();
  });

  it("is modelled at the plot and height the generator sizes it to", () => {
    for (const tier of TIERS) {
      expect(FINISHED[tier].plot).toBe(COMPLETED_SITE[tier]!.plot);
      expect(FINISHED[tier].height).toBe(COMPLETED_SITE[tier]!.height);
    }
    // Two storeys in the village, three in the town.
    expect(FINISHED.village.height).toBe(SETTLEMENT_PARAMS.village.tierHeight[2]);
    expect(FINISHED.town.height).toBe(SETTLEMENT_PARAMS.town.tierHeight[3]);
  });

  it("keeps the house and everything round it on the plot", () => {
    for (const tier of TIERS) {
      const spec = FINISHED[tier];
      const half = spec.plot / 2;
      expect(spec.footprint[0] / 2, tier).toBeLessThan(half);
      expect(spec.setBack + spec.footprint[1] / 2, tier).toBeLessThan(half);
      const dressing = finishedDressingGeometry(tier, 0);
      dressing.computeBoundingBox();
      const box = dressing.boundingBox!;
      for (const v of [box.min.x, box.max.x, box.min.z, box.max.z]) expect(Math.abs(v), tier).toBeLessThanOrEqual(half + 0.02);
      expect(box.min.y, tier).toBeGreaterThanOrEqual(-0.01);
    }
  });

  it("bakes the fresh paint into the settlement's own house, for a plain pooled material", () => {
    for (const tier of TIERS) {
      const house = finishedHouseGeometry(tier, 0);
      expect(house.getAttribute("paint"), tier).toBeUndefined();
      expect(house.getAttribute("color").count, tier).toBe(house.getAttribute("position").count);
      house.computeBoundingBox();
      // Unit space: the site scales it to its footprint and height.
      // Chimney pots may stand a touch above the unit height.
      expect(house.boundingBox!.max.y, tier).toBeLessThanOrEqual(1.1);
      expect(house.boundingBox!.min.x, tier).toBeGreaterThanOrEqual(-0.51);
      // Built once per tone and shared.
      expect(finishedHouseGeometry(tier, 0)).toBe(house);
    }
  });
});
