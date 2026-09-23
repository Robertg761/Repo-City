/**
 * A per-process memo for GitHub responses too large for the Next.js data cache.
 *
 * `next: { revalidate: 600 }` (PLAN.md section 30) is the first line of
 * defence against re-spending requests, but the data cache refuses any item
 * over 2 MB, and it stores bodies in base64, so any body past about 1.5 MB.
 * Every `per_page=100` page of open pull requests is past that
 * (each item embeds two full repository objects), and so is the recursive
 * tree of a giant (vscode's is 8.4 MB). Without this memo, every analysis
 * that misses the analysis cache spends those requests again.
 *
 * Only oversized answers are kept, and only in the slimmed form the caller
 * asks for (the fields `types/github.ts` declares, or fewer), so a repository
 * small enough for the data cache never touches this and its request count is
 * unchanged. Entries live as long as the data cache would have kept them, and
 * the memo is bounded by an approximate byte budget, oldest evicted first.
 */

/**
 * The Next.js data cache's per-item ceiling, measured on the JSON of the
 * stored entry (`node_modules/next/dist/server/lib/incremental-cache`).
 */
export const DATA_CACHE_ITEM_LIMIT = 2 * 1024 * 1024;
/**
 * The largest body that fits: the entry stores it base64-encoded, 4 bytes per
 * 3, beside the headers and URL, which get 16 KB. About 1.5 MB.
 */
export const DATA_CACHE_BODY_LIMIT = Math.floor((DATA_CACHE_ITEM_LIMIT * 3) / 4) - 16 * 1024;
/**
 * As long as the data cache would have kept the answer: `REVALIDATE_SECONDS`
 * in `client.ts`, restated because the client imports this module.
 */
export const MEMO_TTL_MS = 600 * 1000;
/** About a dozen giants' trees and pull request pages at once. */
export const MEMO_MAX_BYTES = 48 * 1024 * 1024;

export interface MemoEntry {
  /** The slimmed, parsed body. */
  body: unknown;
  /** The response's `Link` header, for pages. */
  link: string | null;
}

interface Stored extends MemoEntry {
  bytes: number;
  expiresAt: number;
}

/**
 * UTF-8 size of a response body, measured only when it could be past
 * `limit`: a string of `n` UTF-16 units is at most `3n` bytes.
 */
export function bodyBytesOver(text: string, limit: number = DATA_CACHE_BODY_LIMIT): boolean {
  if (text.length > limit) return true;
  if (text.length * 3 <= limit) return false;
  return new TextEncoder().encode(text).byteLength > limit;
}

export class ResponseMemo {
  private readonly entries = new Map<string, Stored>();
  private bytes = 0;
  private readonly ttlMs: number;
  private readonly maxBytes: number;

  constructor(ttlMs: number = MEMO_TTL_MS, maxBytes: number = MEMO_MAX_BYTES) {
    this.ttlMs = ttlMs;
    this.maxBytes = maxBytes;
  }

  get(key: string, now: number = Date.now()): MemoEntry | null {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= now) {
      this.remove(key);
      return null;
    }
    return { body: entry.body, link: entry.link };
  }

  set(key: string, body: unknown, link: string | null, now: number = Date.now()): void {
    // The slimmed body's JSON length stands in for its size in memory.
    const bytes = (JSON.stringify(body) ?? "").length + (link?.length ?? 0);
    this.remove(key);
    if (bytes > this.maxBytes) return;
    this.entries.set(key, { body, link, bytes, expiresAt: now + this.ttlMs });
    this.bytes += bytes;
    for (const oldest of this.entries.keys()) {
      if (this.bytes <= this.maxBytes) break;
      this.remove(oldest);
    }
  }

  /** Live entries, expired ones dropped. */
  size(now: number = Date.now()): number {
    for (const [key, entry] of this.entries) if (entry.expiresAt <= now) this.remove(key);
    return this.entries.size;
  }

  /** Approximate bytes held. */
  byteSize(): number {
    return this.bytes;
  }

  clear(): void {
    this.entries.clear();
    this.bytes = 0;
  }

  private remove(key: string): void {
    const entry = this.entries.get(key);
    if (!entry) return;
    this.bytes -= entry.bytes;
    this.entries.delete(key);
  }
}

/**
 * One memo per process, parked on `globalThis` so `next dev`'s module reloads
 * keep it, as `lib/cache.ts` does for analyses.
 */
const globalStore = globalThis as typeof globalThis & { __repoCityResponseMemo?: ResponseMemo };
export const sharedResponseMemo: ResponseMemo =
  globalStore.__repoCityResponseMemo ?? new ResponseMemo();
globalStore.__repoCityResponseMemo = sharedResponseMemo;
