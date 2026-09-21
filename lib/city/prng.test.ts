import { describe, expect, it } from "vitest";
import { hashString, mulberry32, prngFromString } from "./prng";
import { prngFor, seedFor } from "./seed";
import type { RepoAnalysis } from "@/types/analysis";

const draw = (seed: string, salt?: string, n = 12): number[] => {
  const prng = prngFor(seed, salt);
  return Array.from({ length: n }, () => prng.next());
};

describe("hashString", () => {
  it("is stable for the same input", () => {
    expect(hashString("sample/repo-city@fixture0001")).toBe(
      hashString("sample/repo-city@fixture0001"),
    );
  });

  it("differs for different inputs", () => {
    expect(hashString("a")).not.toBe(hashString("b"));
    expect(hashString("src/index.ts")).not.toBe(hashString("src/index.tsx"));
  });

  it("returns a non-negative safe integer", () => {
    for (const s of ["", "a", "facebook/react@abc123", "🏙️"]) {
      const h = hashString(s);
      expect(Number.isSafeInteger(h)).toBe(true);
      expect(h).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("mulberry32", () => {
  it("produces values in [0, 1)", () => {
    const prng = mulberry32(12345);
    for (let i = 0; i < 1000; i++) {
      const v = prng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("range stays within bounds", () => {
    const prng = mulberry32(7);
    for (let i = 0; i < 500; i++) {
      const v = prng.range(-3, 9);
      expect(v).toBeGreaterThanOrEqual(-3);
      expect(v).toBeLessThan(9);
    }
  });

  it("int is inclusive on both ends and never out of range", () => {
    const prng = mulberry32(99);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const v = prng.int(1, 5);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(5);
      seen.add(v);
    }
    expect([...seen].sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it("pick only returns elements of the array and throws on empty", () => {
    const prng = mulberry32(4);
    const arr = ["a", "b", "c"] as const;
    for (let i = 0; i < 200; i++) expect(arr).toContain(prng.pick(arr));
    expect(() => prng.pick([])).toThrow();
  });
});

describe("prngFromString", () => {
  it("gives identical sequences for the same seed", () => {
    const a = prngFromString("sample/repo-city@fixture0001");
    const b = prngFromString("sample/repo-city@fixture0001");
    for (let i = 0; i < 50; i++) expect(a.next()).toBe(b.next());
  });
});

describe("seedFor", () => {
  it("formats owner/name@headSha", () => {
    const analysis = {
      repo: { owner: "sample", name: "repo-city", headSha: "fixture0001" },
    } as RepoAnalysis;
    expect(seedFor(analysis)).toBe("sample/repo-city@fixture0001");
  });
});

describe("prngFor", () => {
  const seed = "sample/repo-city@fixture0001";

  it("same seed and salt gives an identical sequence", () => {
    expect(draw(seed, "buildings")).toEqual(draw(seed, "buildings"));
    expect(draw(seed)).toEqual(draw(seed));
  });

  it("different salts diverge", () => {
    expect(draw(seed, "buildings")).not.toEqual(draw(seed, "trees"));
    expect(draw(seed, "buildings")).not.toEqual(draw(seed));
  });

  it("different seeds diverge", () => {
    expect(draw(seed, "trees")).not.toEqual(draw("facebook/react@deadbeef", "trees"));
  });

  it("int and pick are reproducible across runs", () => {
    const one = prngFor(seed, "props");
    const two = prngFor(seed, "props");
    const palette = ["oak", "pine", "birch", "maple"] as const;
    for (let i = 0; i < 40; i++) {
      expect(one.int(0, 100)).toBe(two.int(0, 100));
      expect(one.pick(palette)).toBe(two.pick(palette));
    }
  });
});
