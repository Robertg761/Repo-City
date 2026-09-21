/**
 * In-memory cache of completed analyses (PLAN.md section 30).
 *
 * Scope is deliberately small: one process, 15 minutes, keyed by the canonical
 * lower-case `full_name`. Serverless instances do not share memory, so this is
 * the second line of defence only — the first is `next: { revalidate: 600 }`
 * on every GitHub request, which dedupes across instances.
 *
 * The key must come from `RepositorySnapshot.repo.fullName`, never from the
 * user's input, or `Facebook/React`, `facebook/react` and the redirect target
 * `react/react` would occupy three entries and cost three surveys.
 */

import type { RepoAnalysis } from "@/types/analysis";

/** PLAN.md section 30. */
export const ANALYSIS_TTL_MS = 15 * 60 * 1000;
/** Bounds memory on a long-lived instance; oldest entries are evicted first. */
export const MAX_ENTRIES = 50;

export interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

/** Map with a TTL and an insertion-order cap. Not thread safe; nothing here is. */
export class TtlCache<T> {
  private readonly entries = new Map<string, CacheEntry<T>>();
  private readonly ttlMs: number;
  private readonly maxEntries: number;

  constructor(ttlMs: number = ANALYSIS_TTL_MS, maxEntries: number = MAX_ENTRIES) {
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
  }

  get(key: string, now: number = Date.now()): T | null {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= now) {
      this.entries.delete(key);
      return null;
    }
    return entry.value;
  }

  set(key: string, value: T, now: number = Date.now()): void {
    // Re-insert so the key moves to the end of the eviction order.
    this.entries.delete(key);
    this.entries.set(key, { value, expiresAt: now + this.ttlMs });

    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next();
      if (oldest.done) break;
      this.entries.delete(oldest.value);
    }
  }

  has(key: string, now: number = Date.now()): boolean {
    return this.get(key, now) !== null;
  }

  delete(key: string): void {
    this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
  }

  /** Live entry count, expired entries excluded. */
  size(now: number = Date.now()): number {
    let size = 0;
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(key);
      else size += 1;
    }
    return size;
  }
}

/**
 * One cache per process, parked on `globalThis` so `next dev`'s module reloads
 * do not quietly hand out a fresh empty cache on every edit.
 */
const globalStore = globalThis as typeof globalThis & {
  __repoCityAnalysisCache?: TtlCache<RepoAnalysis>;
};

const analysisCache: TtlCache<RepoAnalysis> =
  globalStore.__repoCityAnalysisCache ?? new TtlCache<RepoAnalysis>();
globalStore.__repoCityAnalysisCache = analysisCache;

/** Canonical cache key: the lower-case `owner/repo` GitHub reported. */
export function cacheKey(fullName: string): string {
  return fullName.trim().toLowerCase();
}

export function getCachedAnalysis(fullName: string, now: number = Date.now()): RepoAnalysis | null {
  return analysisCache.get(cacheKey(fullName), now);
}

export function setCachedAnalysis(
  fullName: string,
  analysis: RepoAnalysis,
  now: number = Date.now(),
): void {
  analysisCache.set(cacheKey(fullName), analysis, now);
}

/** Tests only. */
export function clearAnalysisCache(): void {
  analysisCache.clear();
}
