/**
 * Per-IP abuse control for `/api/analyze` (PLAN.md section 30).
 *
 * Ten analyses per ten minutes, sliding window, in memory. Best effort is
 * explicitly acceptable: the hosted demo runs on Robert's token during voting,
 * and the job here is to stop one impatient tab from spending the whole hourly
 * GitHub quota, not to defeat a determined attacker.
 *
 * Serverless instances do not share this map, so the real-world limit is
 * `10 x instances`. That is fine; the GitHub data cache absorbs the rest.
 */

/** PLAN.md section 30. */
export const RATE_LIMIT_MAX = 10;
export const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
/** Bounds memory: distinct clients tracked at once. */
export const MAX_TRACKED_CLIENTS = 5000;

export interface RateLimitResult {
  allowed: boolean;
  /** Analyses left in the current window after this check. */
  remaining: number;
  /** Milliseconds until the oldest hit expires; 0 when allowed. */
  retryAfterMs: number;
}

export class SlidingWindowLimiter {
  private readonly hits = new Map<string, number[]>();
  private readonly max: number;
  private readonly windowMs: number;
  private readonly maxClients: number;

  constructor(
    max: number = RATE_LIMIT_MAX,
    windowMs: number = RATE_LIMIT_WINDOW_MS,
    maxClients: number = MAX_TRACKED_CLIENTS,
  ) {
    this.max = max;
    this.windowMs = windowMs;
    this.maxClients = maxClients;
  }

  /** Records an attempt and says whether it is allowed. */
  check(key: string, now: number = Date.now()): RateLimitResult {
    const cutoff = now - this.windowMs;
    const recent = (this.hits.get(key) ?? []).filter((time) => time > cutoff);

    if (recent.length >= this.max) {
      this.hits.set(key, recent);
      const retryAfterMs = Math.max(0, recent[0] + this.windowMs - now);
      return { allowed: false, remaining: 0, retryAfterMs };
    }

    recent.push(now);
    // Re-insert to keep the eviction order by last use.
    this.hits.delete(key);
    this.hits.set(key, recent);
    this.evict(cutoff);

    return { allowed: true, remaining: this.max - recent.length, retryAfterMs: 0 };
  }

  /** Reads the window without recording an attempt. */
  peek(key: string, now: number = Date.now()): RateLimitResult {
    const cutoff = now - this.windowMs;
    const recent = (this.hits.get(key) ?? []).filter((time) => time > cutoff);
    if (recent.length >= this.max) {
      return { allowed: false, remaining: 0, retryAfterMs: Math.max(0, recent[0] + this.windowMs - now) };
    }
    return { allowed: true, remaining: this.max - recent.length, retryAfterMs: 0 };
  }

  reset(): void {
    this.hits.clear();
  }

  private evict(cutoff: number): void {
    for (const [key, times] of this.hits) {
      if (times.length === 0 || times[times.length - 1] <= cutoff) this.hits.delete(key);
    }
    while (this.hits.size > this.maxClients) {
      const oldest = this.hits.keys().next();
      if (oldest.done) break;
      this.hits.delete(oldest.value);
    }
  }
}

const globalStore = globalThis as typeof globalThis & {
  __repoCityRateLimiter?: SlidingWindowLimiter;
};

const limiter: SlidingWindowLimiter = globalStore.__repoCityRateLimiter ?? new SlidingWindowLimiter();
globalStore.__repoCityRateLimiter = limiter;

export function checkRateLimit(clientId: string, now: number = Date.now()): RateLimitResult {
  return limiter.check(clientId, now);
}

/** Tests only. */
export function resetRateLimit(): void {
  limiter.reset();
}

/**
 * Best-effort client identity. `x-forwarded-for` is the proxy chain; the first
 * entry is the client as seen by the edge. Everything is spoofable, which is
 * why this is a courtesy limit and not a security control.
 */
export function clientIdFromHeaders(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip") ?? headers.get("cf-connecting-ip") ?? "unknown";
}
