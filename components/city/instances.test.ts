import { describe, expect, it } from "vitest";
import { groupByTier, splitBuildings, windowBands } from "./instances";
import { REVEAL_MS, revealEnd, revealScale } from "./reveal";
import type { BuildingTier, LandmarkFile } from "@/types/analysis";
import type { Building } from "@/types/city";

function building(
  id: string,
  tier: BuildingTier,
  height = 8,
  landmark: LandmarkFile | null = null,
): Building {
  return {
    id,
    kind: "building",
    position: [0, 0, 0],
    rotationY: 0,
    title: id,
    subtitle: "",
    description: "",
    reason: "",
    sourceUrl: null,
    visualState: "normal",
    appearAt: 0,
    districtId: "d1",
    size: [4, height, 4],
    tier,
    colorIndex: 0,
    plan: {
      id,
      path: `src/${id}.ts`,
      kind: "file",
      districtId: "d1",
      score: 1,
      tier,
      descendantCount: 0,
      language: "TypeScript",
      role: null,
      landmark,
    },
  };
}

describe("splitBuildings", () => {
  it("routes landmark files to hand-built civic meshes", () => {
    const { instanced, civic } = splitBuildings([
      building("a", 1),
      building("readme", 3, 8, "readme"),
      building("b", 2),
      building("docker", 2, 6, "dockerfile"),
    ]);
    expect(instanced.map((b) => b.id)).toEqual(["a", "b"]);
    expect(civic.map((b) => b.id)).toEqual(["readme", "docker"]);
  });
});

describe("groupByTier", () => {
  const buildings = [
    building("a", 3),
    building("b", 1),
    building("c", 3),
    building("d", 5),
  ];

  it("produces one group per non-empty tier, in tier order", () => {
    expect(groupByTier(buildings).map((g) => g.tier)).toEqual([1, 3, 5]);
  });

  it("keeps ids aligned with instance index, which is how picking works", () => {
    for (const group of groupByTier(buildings)) {
      expect(group.ids).toHaveLength(group.buildings.length);
      group.buildings.forEach((b, instanceId) => {
        expect(group.ids[instanceId]).toBe(b.id);
      });
    }
  });

  it("covers every building exactly once", () => {
    const ids = groupByTier(buildings).flatMap((g) => g.ids);
    expect(ids.sort()).toEqual(["a", "b", "c", "d"]);
  });

  it("falls back to tier 1 for an out-of-range tier", () => {
    const rogue = { ...building("x", 1), tier: 9 as unknown as BuildingTier };
    expect(groupByTier([rogue])[0].tier).toBe(1);
  });
});

describe("windowBands", () => {
  it("gives short buildings no stripes and tall buildings at most three", () => {
    const bands = windowBands([building("short", 1, 2), building("tall", 5, 18)]);
    expect(bands.filter((b) => b.buildingIndex === 0)).toHaveLength(0);
    expect(bands.filter((b) => b.buildingIndex === 1)).toHaveLength(3);
  });

  it("spaces the stripes strictly inside the facade", () => {
    for (const band of windowBands([building("tall", 5, 18)])) {
      expect(band.fraction).toBeGreaterThan(0);
      expect(band.fraction).toBeLessThan(1);
      expect(band.thickness).toBeGreaterThan(0);
    }
  });

  it("honours the instance cap", () => {
    const many = Array.from({ length: 400 }, (_, i) => building(`b${i}`, 5, 18));
    expect(windowBands(many, 600)).toHaveLength(600);
  });
});

describe("revealScale", () => {
  it("is zero before the entity's turn and one after it finishes", () => {
    expect(revealScale(1000, 1000, 500)).toBe(0);
    expect(revealScale(1400, 1000, 500)).toBe(0);
    expect(revealScale(1000 + 500 + REVEAL_MS, 1000, 500)).toBe(1);
    expect(revealScale(9000, 1000, 500)).toBe(1);
  });

  it("rises monotonically in between", () => {
    let previous = -1;
    for (let now = 1500; now <= 1900; now += 40) {
      const s = revealScale(now, 1000, 500);
      expect(s).toBeGreaterThan(previous);
      expect(s).toBeLessThanOrEqual(1);
      previous = s;
    }
  });

  it("ends after the last appearAt plus the reveal duration", () => {
    expect(revealEnd([0, 1200, 300])).toBe(1200 + REVEAL_MS);
    expect(revealEnd([])).toBe(REVEAL_MS);
  });
});
