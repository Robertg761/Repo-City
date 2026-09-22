import { beforeEach, describe, expect, it } from "vitest";
import type { RepoAnalysis } from "@/types/analysis";
import {
  ANALYSIS_TTL_MS,
  MAX_ENTRIES,
  TtlCache,
  cacheKey,
  clearAnalysisCache,
  getCachedAnalysis,
  setCachedAnalysis,
} from "./cache";

const analysis = (fullName: string): RepoAnalysis =>
  ({ repo: { fullName }, seed: fullName } as unknown as RepoAnalysis);

describe("TtlCache", () => {
  it("returns a value inside the TTL", () => {
    const cache = new TtlCache<number>(1000);
    cache.set("a", 1, 0);
    expect(cache.get("a", 999)).toBe(1);
  });

  it("expires a value exactly at the TTL", () => {
    const cache = new TtlCache<number>(1000);
    cache.set("a", 1, 0);
    expect(cache.get("a", 1000)).toBeNull();
    expect(cache.get("a", 5000)).toBeNull();
  });

  it("drops the expired entry rather than keeping it around", () => {
    const cache = new TtlCache<number>(1000);
    cache.set("a", 1, 0);
    cache.get("a", 2000);
    expect(cache.size(2000)).toBe(0);
  });

  it("refreshes the TTL when a key is written again", () => {
    const cache = new TtlCache<number>(1000);
    cache.set("a", 1, 0);
    cache.set("a", 2, 900);
    expect(cache.get("a", 1500)).toBe(2);
  });

  it("evicts the oldest entry past the cap", () => {
    const cache = new TtlCache<number>(1000, 2);
    cache.set("a", 1, 0);
    cache.set("b", 2, 1);
    cache.set("c", 3, 2);

    expect(cache.get("a", 3)).toBeNull();
    expect(cache.get("b", 3)).toBe(2);
    expect(cache.get("c", 3)).toBe(3);
  });

  it("supports has, delete and clear", () => {
    const cache = new TtlCache<number>(1000);
    cache.set("a", 1, 0);
    expect(cache.has("a", 10)).toBe(true);
    cache.delete("a");
    expect(cache.has("a", 10)).toBe(false);

    cache.set("b", 2, 0);
    cache.clear();
    expect(cache.size(0)).toBe(0);
  });
});

describe("analysis cache", () => {
  beforeEach(() => {
    clearAnalysisCache();
  });

  it("is keyed by the canonical lower-case full name", () => {
    expect(cacheKey(" Facebook/React ")).toBe("facebook/react");

    setCachedAnalysis("React/React", analysis("react/react"), 0);
    expect(getCachedAnalysis("react/react", 0)?.seed).toBe("react/react");
    expect(getCachedAnalysis("REACT/REACT", 0)?.seed).toBe("react/react");
  });

  it("misses for an unknown repository", () => {
    expect(getCachedAnalysis("nobody/nothing")).toBeNull();
  });

  it("holds an analysis for 15 minutes", () => {
    setCachedAnalysis("honojs/hono", analysis("honojs/hono"), 0);

    expect(getCachedAnalysis("honojs/hono", ANALYSIS_TTL_MS - 1)).not.toBeNull();
    expect(getCachedAnalysis("honojs/hono", ANALYSIS_TTL_MS)).toBeNull();
  });

  it("holds at most 30 analyses, since a giant's backlog makes each up to 1 MB", () => {
    expect(MAX_ENTRIES).toBe(30);
    for (let i = 0; i <= MAX_ENTRIES; i += 1) setCachedAnalysis(`o/r${i}`, analysis(`o/r${i}`), 0);
    expect(getCachedAnalysis("o/r0", 0)).toBeNull();
    expect(getCachedAnalysis(`o/r${MAX_ENTRIES}`, 0)).not.toBeNull();
  });
});
