import { describe, expect, it } from "vitest";

import { planDistricts } from "./districts";
import { MAX_BUILDINGS, MIN_PER_DISTRICT, selectBuildings, tierForRank } from "./fileSelection";
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

describe("tierForRank", () => {
  it("is a pyramid: a few towers, many low buildings", () => {
    const total = 200;
    const counts = new Map<number, number>();
    for (let rank = 0; rank < total; rank++) {
      const tier = tierForRank(rank, total);
      counts.set(tier, (counts.get(tier) ?? 0) + 1);
    }
    expect(counts.get(5)!).toBeLessThan(counts.get(1)!);
    expect(tierForRank(0, total)).toBe(5);
    expect(tierForRank(total - 1, total)).toBe(1);
  });
});
