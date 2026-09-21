import { beforeEach, describe, expect, it } from "vitest";
import {
  RATE_LIMIT_MAX,
  RATE_LIMIT_WINDOW_MS,
  SlidingWindowLimiter,
  checkRateLimit,
  clientIdFromHeaders,
  resetRateLimit,
} from "./ratelimit";

describe("SlidingWindowLimiter", () => {
  it("allows exactly `max` attempts in a window", () => {
    const limiter = new SlidingWindowLimiter(3, 1000);

    expect(limiter.check("ip", 0).allowed).toBe(true);
    expect(limiter.check("ip", 100).allowed).toBe(true);
    expect(limiter.check("ip", 200).allowed).toBe(true);
    expect(limiter.check("ip", 300).allowed).toBe(false);
  });

  it("counts down the remaining attempts", () => {
    const limiter = new SlidingWindowLimiter(3, 1000);
    expect(limiter.check("ip", 0).remaining).toBe(2);
    expect(limiter.check("ip", 1).remaining).toBe(1);
    expect(limiter.check("ip", 2).remaining).toBe(0);
  });

  it("slides: the oldest attempt falling out frees a slot", () => {
    const limiter = new SlidingWindowLimiter(2, 1000);
    limiter.check("ip", 0);
    limiter.check("ip", 500);

    expect(limiter.check("ip", 900).allowed).toBe(false);
    // The attempt at t=0 leaves the window at t=1001.
    expect(limiter.check("ip", 1001).allowed).toBe(true);
    // ...but the one at t=500 is still in it.
    expect(limiter.check("ip", 1002).allowed).toBe(false);
  });

  it("reports how long to wait", () => {
    const limiter = new SlidingWindowLimiter(1, 1000);
    limiter.check("ip", 0);
    expect(limiter.check("ip", 400).retryAfterMs).toBe(600);
  });

  it("does not let a blocked client extend its own block", () => {
    const limiter = new SlidingWindowLimiter(1, 1000);
    limiter.check("ip", 0);
    limiter.check("ip", 100);
    limiter.check("ip", 200);

    expect(limiter.check("ip", 1001).allowed).toBe(true);
  });

  it("tracks clients independently", () => {
    const limiter = new SlidingWindowLimiter(1, 1000);
    expect(limiter.check("a", 0).allowed).toBe(true);
    expect(limiter.check("b", 0).allowed).toBe(true);
    expect(limiter.check("a", 1).allowed).toBe(false);
  });

  it("peeks without spending an attempt", () => {
    const limiter = new SlidingWindowLimiter(2, 1000);
    limiter.check("ip", 0);
    expect(limiter.peek("ip", 1).remaining).toBe(1);
    expect(limiter.peek("ip", 1).remaining).toBe(1);
  });

  it("forgets clients whose window has passed", () => {
    const limiter = new SlidingWindowLimiter(1, 1000, 2);
    limiter.check("a", 0);
    limiter.check("b", 2000);
    limiter.check("c", 4000);

    expect(limiter.check("a", 4001).allowed).toBe(true);
  });
});

describe("module-level limiter", () => {
  beforeEach(() => {
    resetRateLimit();
  });

  it("allows 10 analyses per 10 minutes (PLAN.md section 30)", () => {
    expect(RATE_LIMIT_MAX).toBe(10);
    expect(RATE_LIMIT_WINDOW_MS).toBe(10 * 60 * 1000);

    for (let i = 0; i < RATE_LIMIT_MAX; i += 1) {
      expect(checkRateLimit("203.0.113.5", i).allowed).toBe(true);
    }
    expect(checkRateLimit("203.0.113.5", RATE_LIMIT_MAX).allowed).toBe(false);
    expect(checkRateLimit("203.0.113.6", RATE_LIMIT_MAX).allowed).toBe(true);
  });
});

describe("clientIdFromHeaders", () => {
  it("takes the first entry of the proxy chain", () => {
    const headers = new Headers({ "x-forwarded-for": "203.0.113.5, 70.41.3.18" });
    expect(clientIdFromHeaders(headers)).toBe("203.0.113.5");
  });

  it("falls back to the other proxy headers, then to a constant", () => {
    expect(clientIdFromHeaders(new Headers({ "x-real-ip": "198.51.100.1" }))).toBe("198.51.100.1");
    expect(clientIdFromHeaders(new Headers({ "cf-connecting-ip": "198.51.100.2" }))).toBe(
      "198.51.100.2",
    );
    expect(clientIdFromHeaders(new Headers())).toBe("unknown");
  });
});
