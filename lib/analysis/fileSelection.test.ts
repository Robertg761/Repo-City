import { describe, expect, it } from "vitest";

import { planDistricts } from "./districts";
import { SETTLEMENT_PARAMS } from "@/lib/city/settlement";
import type { SettlementTier } from "@/types/analysis";
import {
  BUILDING_CAP,
  LANDMARK_TIER,
  MAX_BUILDINGS,
  MIN_PER_DISTRICT,
  TIER_SHARES,
  selectBuildings,
  tierCuts,
  tierForRank,
} from "./fileSelection";
import { pruneTree } from "./tree";
import { archivedSnapshot } from "./__fixtures__/archived.snapshot";
import { treeFromPaths } from "./__fixtures__/helpers";
import { midSnapshot } from "./__fixtures__/mid.snapshot";
import { syntheticTree } from "./__fixtures__/syntheticTree";

function selectFor(entries: ReturnType<typeof treeFromPaths>, readme?: string) {
  const pruned = pruneTree(entries);
  const districts = planDistricts(pruned);
  return { districts, buildings: selectBuildings(pruned, districts, { readme }) };
}

describe("selectBuildings (PLAN.md section 9)", () => {
  it("yields 75 to 300 buildings with no empty district for a 5,000 entry tree", () => {
    const { districts, buildings } = selectFor(syntheticTree(5000));

    expect(buildings.length).toBeGreaterThanOrEqual(75);
    expect(buildings.length).toBeLessThanOrEqual(MAX_BUILDINGS);

    for (const district of districts) {
      const count = buildings.filter((b) => b.districtId === district.id).length;
      expect(count, `district ${district.id} is empty`).toBeGreaterThan(0);
      expect(count).toBeGreaterThanOrEqual(Math.min(MIN_PER_DISTRICT, district.fileCount));
    }
  });

  it("never exceeds 300 buildings even for a 40,000 entry tree", () => {
    const { buildings } = selectFor(syntheticTree(40_000));
    expect(buildings.length).toBeLessThanOrEqual(MAX_BUILDINGS);
    expect(buildings.length).toBeGreaterThanOrEqual(75);
  });

  it("coarsens granularity from files to folders as the tree grows", () => {
    // 136 files, none deeper than the section 9 depth limit: every building is
    // a file, and the count matches the tree exactly.
    const small = selectFor(midSnapshot.tree.entries);
    expect(small.buildings.every((b) => b.kind === "file")).toBe(true);
    expect(small.buildings).toHaveLength(136);

    const large = selectFor(syntheticTree(5000));
    expect(large.buildings.some((b) => b.kind === "directory")).toBe(true);
  });

  it("gives every building a zero-padded id, a district and a tier of 1 to 5", () => {
    const { districts, buildings } = selectFor(midSnapshot.tree.entries);
    const districtIds = new Set(districts.map((d) => d.id));
    buildings.forEach((building, index) => {
      expect(building.id).toBe(`b-${String(index + 1).padStart(3, "0")}`);
      expect(districtIds.has(building.districtId)).toBe(true);
      expect(building.tier).toBeGreaterThanOrEqual(1);
      expect(building.tier).toBeLessThanOrEqual(5);
      expect(building.role).toBeNull();
    });
    expect(new Set(buildings.map((b) => b.id)).size).toBe(buildings.length);
  });

  it("is sorted by score, so ids run tallest first", () => {
    const { buildings } = selectFor(midSnapshot.tree.entries);
    for (let i = 1; i < buildings.length; i++) {
      expect(buildings[i - 1].score).toBeGreaterThanOrEqual(buildings[i].score);
    }
  });

  it("tags the five landmark files and attributes root landmarks to the first district", () => {
    const { districts, buildings } = selectFor(midSnapshot.tree.entries);
    const landmarks = buildings.filter((b) => b.landmark !== null);
    const kinds = landmarks.map((b) => b.landmark).sort();
    expect(kinds).toEqual(["changelog", "contributing", "dockerfile", "manifest", "readme"]);
    for (const landmark of landmarks) {
      expect(landmark.districtId).toBe(districts[0].id);
      expect(landmark.kind).toBe("file");
    }
  });

  it("does not turn a nested package.json into a landmark", () => {
    const { buildings } = selectFor(midSnapshot.tree.entries);
    const nested = buildings.find((b) => b.path === "examples/basic/package.json");
    expect(nested?.landmark ?? null).toBeNull();
  });

  it("rewards paths the README mentions", () => {
    const paths = ["src/alpha.ts", "src/beta.ts"];
    const entries = treeFromPaths(paths);
    const without = selectFor(entries).buildings.find((b) => b.path === "src/alpha.ts");
    const withMention = selectFor(entries, "See `src/alpha.ts` for details.").buildings.find(
      (b) => b.path === "src/alpha.ts",
    );
    expect(withMention!.score).toBeCloseTo(without!.score + 2, 5);
  });

  it("penalises test and fixture paths", () => {
    const { buildings } = selectFor(
      treeFromPaths(["src/thing.ts", "tests/unit/thing.test.ts", "docs/a.md"]),
    );
    const source = buildings.find((b) => b.path === "src/thing.ts");
    const test = buildings.find((b) => b.path === "tests/unit/thing.test.ts");
    expect(source!.score).toBeGreaterThan(test!.score);
  });

  it("records a language for source buildings", () => {
    const { buildings } = selectFor(midSnapshot.tree.entries);
    expect(buildings.find((b) => b.path === "src/router/dispatch.ts")?.language).toBe("TypeScript");
    expect(buildings.find((b) => b.path === "docs/faq.md")?.language).toBe("Markdown");
  });

  it("spreads a p-limit sized repository over more than one district", () => {
    // Nine files, two thin directories: without a `/` district every building
    // would pile into the one-file /scripts district.
    const { districts, buildings } = selectFor(
      treeFromPaths([
        "index.js",
        "index.d.ts",
        "index.test-d.ts",
        "package.json",
        "readme.md",
        "license",
        "test/test.js",
        "test/test.d.ts",
        "scripts/release.js",
      ]),
    );

    expect(districts.length).toBeGreaterThanOrEqual(2);
    const root = districts.filter((d) => d.sourcePath === "/");
    expect(root).toHaveLength(1);

    expect(buildings).toHaveLength(9);
    for (const district of districts) {
      const count = buildings.filter((b) => b.districtId === district.id).length;
      expect(count, `district ${district.id} is empty`).toBeGreaterThan(0);
      expect(count).toBeGreaterThanOrEqual(Math.min(MIN_PER_DISTRICT, district.fileCount));
    }

    // The six root files, landmarks included, live in the `/` district.
    const rootBuildings = buildings.filter((b) => b.districtId === root[0].id);
    expect(rootBuildings.map((b) => b.path).sort()).toEqual([
      "index.d.ts",
      "index.js",
      "index.test-d.ts",
      "license",
      "package.json",
      "readme.md",
    ]);
    expect(
      buildings
        .filter((b) => b.landmark !== null)
        .map((b) => b.landmark)
        .sort(),
    ).toEqual(["manifest", "readme"]);
    // No district ends up holding the whole city.
    for (const district of districts) {
      const count = buildings.filter((b) => b.districtId === district.id).length;
      expect(count).toBeLessThan(buildings.length);
    }
  });

  it("builds a whole tiny repository as files", () => {
    const { buildings } = selectFor(archivedSnapshot.tree.entries);
    expect(buildings).toHaveLength(13); // 14 paths minus the excluded .gitignore
    expect(buildings.every((b) => b.kind === "file")).toBe(true);
  });

  it("is deterministic", () => {
    const a = selectFor(syntheticTree(5000)).buildings;
    const b = selectFor(syntheticTree(5000)).buildings;
    expect(a).toEqual(b);
  });

  it("returns nothing for an empty tree", () => {
    expect(selectBuildings([], [], {})).toEqual([]);
  });
});

/** How many buildings `tierForRank` puts in each tier, tier 1 first. */
function histogram(total: number): number[] {
  const counts = [0, 0, 0, 0, 0];
  for (let rank = 0; rank < total; rank++) counts[tierForRank(rank, total) - 1] += 1;
  return counts;
}

describe("tierForRank", () => {
  it("is a pyramid: a few towers, many low buildings", () => {
    const total = 200;
    const counts = histogram(total);
    expect(counts[4]).toBeLessThan(counts[0]);
    expect(tierForRank(0, total)).toBe(5);
    expect(tierForRank(total - 1, total)).toBe(1);
  });

  it("follows the rank quantiles for a city of any size", () => {
    for (const total of [40, 90, 150, 231, 300]) {
      const counts = histogram(total);
      expect(counts.reduce((a, b) => a + b, 0)).toBe(total);
      [1, 2, 3, 4, 5].forEach((tier) => {
        const share = counts[tier - 1] / total;
        expect(
          Math.abs(share - TIER_SHARES[tier as keyof typeof TIER_SHARES]),
          `tier ${tier} of ${total} is ${(share * 100).toFixed(1)}%`,
        ).toBeLessThan(0.04);
      });
    }
  });

  it("never turns the skyline upside down", () => {
    for (let total = 1; total <= 320; total++) {
      const counts = histogram(total);
      expect(counts.reduce((a, b) => a + b, 0)).toBe(total);
      // Under five buildings there is no pyramid to speak of: a one-file
      // repository is a single tower and a two-file one is a tower and a shed.
      if (total < 5) continue;
      for (let tier = 5; tier > 1; tier--) {
        expect(counts[tier - 1], `total ${total}, tier ${tier}`).toBeLessThanOrEqual(
          counts[tier - 2],
        );
      }
    }
  });

  it("gives a city of twenty or more buildings at least two towers", () => {
    for (let total = 20; total <= 320; total += 7) {
      expect(histogram(total)[4], `total ${total}`).toBeGreaterThanOrEqual(2);
    }
    // Below that one tower is enough, but there is always one.
    for (let total = 1; total < 20; total++) {
      expect(histogram(total)[4], `total ${total}`).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("tiers on a real selection", () => {
  it("keeps the 5,000 entry tree on the quantiles, landmarks aside", () => {
    const { buildings } = selectFor(syntheticTree(5000));
    const ranked = buildings.filter((b) => !b.landmark);
    expect(ranked.length).toBeGreaterThan(75);

    const counts = [0, 0, 0, 0, 0];
    for (const building of ranked) counts[building.tier - 1] += 1;
    [1, 2, 3, 4, 5].forEach((tier) => {
      const share = counts[tier - 1] / ranked.length;
      expect(
        Math.abs(share - TIER_SHARES[tier as keyof typeof TIER_SHARES]),
        `tier ${tier} is ${(share * 100).toFixed(1)}%`,
      ).toBeLessThan(0.04);
    });
  });

  it("keeps the root landmark files off the skyline and under the town hall", () => {
    const { buildings } = selectFor(
      treeFromPaths([
        "README.md",
        "package.json",
        "CONTRIBUTING.md",
        "src/index.ts",
        "src/router.ts",
        "docs/guide.md",
      ]),
    );
    const landmarks = buildings.filter((b) => b.landmark);
    expect(landmarks.length).toBeGreaterThan(0);
    for (const landmark of landmarks) {
      expect(landmark.tier).toBe(LANDMARK_TIER[landmark.landmark!]);
      // The town hall is the tallest thing on the plaza.
      expect(landmark.tier).toBeLessThanOrEqual(3);
    }
    // A landmark file no longer eats the tallest tier from the real code.
    expect(buildings.some((b) => !b.landmark && b.tier === 5)).toBe(true);
  });
});

/* ------------------------------------------------ settlement budgets (76.5) */

function selectTier(entries: ReturnType<typeof treeFromPaths>, tier: SettlementTier) {
  const pruned = pruneTree(entries);
  const districts = planDistricts(pruned);
  const params = SETTLEMENT_PARAMS[tier];
  return {
    districts,
    buildings: selectBuildings(pruned, districts, {
      min: params.buildings.min,
      max: params.buildings.max,
      shares: params.tierShares,
    }),
  };
}

describe("selectBuildings with a settlement budget (PLAN.md 76.5)", () => {
  const TIERS: SettlementTier[] = ["village", "town", "city", "metropolis"];

  it.each(TIERS)("keeps a large %s inside its budget", (tier) => {
    const { max } = SETTLEMENT_PARAMS[tier].buildings;
    for (const size of [5_000, 40_000]) {
      const { buildings } = selectTier(syntheticTree(size), tier);
      expect(buildings.length).toBeLessThanOrEqual(max);
    }
  });

  it("fills a metropolis past its 300-building floor", () => {
    // Without the floor, a tree like react's falls through to depth 2 and
    // leaves a big plate with a hundred buildings on it (76.2).
    for (const size of [5_000, 40_000]) {
      const { buildings } = selectTier(syntheticTree(size), "metropolis");
      expect(buildings.length).toBeGreaterThanOrEqual(SETTLEMENT_PARAMS.metropolis.buildings.min);
      expect(buildings.length).toBeLessThanOrEqual(BUILDING_CAP);
    }
  });

  it("builds a small village and a town of folders from the same 136 files", () => {
    const village = selectTier(midSnapshot.tree.entries, "village").buildings;
    const town = selectTier(midSnapshot.tree.entries, "town").buildings;
    expect(village.length).toBeLessThanOrEqual(40);
    expect(town.length).toBeGreaterThanOrEqual(30);
    expect(town.length).toBeLessThanOrEqual(120);
    expect(town.some((b) => b.kind === "directory")).toBe(true);
  });

  it("gives the city tier exactly today's selection", () => {
    for (const entries of [midSnapshot.tree.entries, syntheticTree(5000), archivedSnapshot.tree.entries]) {
      expect(selectTier(entries, "city").buildings).toEqual(selectFor(entries).buildings);
    }
  });

  it("never exceeds the absolute cap of 450, whatever the budget asks", () => {
    const pruned = pruneTree(syntheticTree(40_000));
    const districts = planDistricts(pruned);
    const buildings = selectBuildings(pruned, districts, { min: 900, max: 900 });
    expect(buildings.length).toBe(BUILDING_CAP);
  });

  it("clamps a floor above the cap down to the cap", () => {
    const pruned = pruneTree(midSnapshot.tree.entries);
    const districts = planDistricts(pruned);
    expect(selectBuildings(pruned, districts, { min: 500, max: 40 }).length).toBeLessThanOrEqual(40);
  });

  it.each(TIERS)("follows the %s tier shares on a large repository", (tier) => {
    const shares = SETTLEMENT_PARAMS[tier].tierShares;
    const total = SETTLEMENT_PARAMS[tier].buildings.max;
    const counts = [0, 0, 0, 0, 0];
    for (let rank = 0; rank < total; rank++) counts[tierForRank(rank, total, shares) - 1] += 1;
    ([1, 2, 3, 4, 5] as const).forEach((level) => {
      expect(Math.abs(counts[level - 1] / total - shares[level])).toBeLessThan(0.04);
    });
  });

  it("gives the metropolis more towers than the city, and the city more than the village", () => {
    const towers = (tier: SettlementTier) => tierCuts(200, SETTLEMENT_PARAMS[tier].tierShares)[0];
    expect(towers("metropolis")).toBeGreaterThan(towers("city"));
    expect(towers("city")).toBeGreaterThan(towers("village"));
  });
});
