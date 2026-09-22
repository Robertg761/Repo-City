import { describe, expect, it } from "vitest";
import {
  PARKED_BODIES,
  SMALL_PROP_BUDGET,
  furnitureGeometry,
  placeStreetProps,
  propCount,
} from "./streetFurniture";
import { triangleCount } from "./geometry";
import { prngFor } from "@/lib/city/seed";
import type { CityModel, Vec3 } from "@/types/city";
import { devCity } from "@/fixtures/dev.city";

const props = () => placeStreetProps(devCity, prngFor(devCity.seed, "street-props"));

describe("placeStreetProps", () => {
  it("stays inside the section 37 allowance for tiny props", () => {
    expect(propCount(props())).toBeLessThanOrEqual(SMALL_PROP_BUDGET);
  });

  it("is deterministic for a seed and differs across seeds", () => {
    const a = placeStreetProps(devCity, prngFor("owner/repo@aaa", "street-props"));
    const b = placeStreetProps(devCity, prngFor("owner/repo@aaa", "street-props"));
    const c = placeStreetProps(devCity, prngFor("owner/repo@bbb", "street-props"));
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it("keeps every prop off the buildings", () => {
    const placed = props();
    const all = [
      ...placed.benches,
      ...placed.bins,
      ...placed.stops,
      ...placed.bushes,
      ...placed.beds,
      ...placed.parked,
    ];
    expect(all.length).toBeGreaterThan(0);
    for (const prop of all) {
      for (const building of devCity.buildings) {
        const distance = Math.hypot(
          prop.position[0] - building.position[0],
          prop.position[2] - building.position[2],
        );
        expect(distance).toBeGreaterThan(Math.max(building.size[0], building.size[2]) * 0.5);
      }
    }
  });

  it("parks cars outside the lane the fleet drives in", () => {
    const placed = props();
    for (const car of placed.parked) {
      let closest = Infinity;
      for (const road of devCity.roads) {
        const dx = road.to[0] - road.from[0];
        const dz = road.to[2] - road.from[2];
        const lengthSq = dx * dx + dz * dz || 1;
        const t = Math.max(
          0,
          Math.min(
            1,
            ((car.position[0] - road.from[0]) * dx + (car.position[2] - road.from[2]) * dz) /
              lengthSq,
          ),
        );
        const gap =
          Math.hypot(
            car.position[0] - (road.from[0] + dx * t),
            car.position[2] - (road.from[2] + dz * t),
          ) -
          road.width / 2;
        closest = Math.min(closest, gap);
      }
      // A moving car's lane offset plus half a body never reaches the kerb,
      // so a parked car beyond it cannot be driven through.
      expect(closest).toBeGreaterThan(0.6);
      expect(PARKED_BODIES).toContain(car.body);
    }
  });

  it("gives a small repository a village's worth of furniture", () => {
    const village: CityModel = {
      ...devCity,
      buildings: devCity.buildings.slice(0, 8),
      props: { ...devCity.props, trees: devCity.props.trees.slice(0, 6) as Vec3[] },
    };
    const placed = placeStreetProps(village, prngFor("v", "street-props"));
    expect(propCount(placed)).toBeLessThan(propCount(props()) + 1);
    expect(placed.stops.length).toBeLessThanOrEqual(6);
  });
});

describe("furniture geometry", () => {
  it("merges each kind into one cached geometry", () => {
    for (const kind of ["bench", "bin", "stop", "bush", "bed"] as const) {
      const geometry = furnitureGeometry(kind, 0.2);
      expect(geometry.getAttribute("color")).toBeDefined();
      expect(furnitureGeometry(kind, 0.2)).toBe(geometry);
      expect(triangleCount(geometry)).toBeLessThan(220);
    }
  });

  it("rebuilds for a visibly different tone and not for a rounding error", () => {
    expect(furnitureGeometry("bench", 0.2)).toBe(furnitureGeometry("bench", 0.201));
    expect(furnitureGeometry("bench", 0.2)).not.toBe(furnitureGeometry("bench", 0.6));
  });
});
