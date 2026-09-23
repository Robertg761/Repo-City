import { describe, expect, it } from "vitest";
import { BOARD, POST_X, signLines } from "./Overflow";

describe("the overflow signboard", () => {
  it("stands its posts outside the board, so they never cross the lettering", () => {
    const post = 0.26;
    // The board's frame is 0.12 proud of its face on each side.
    expect(POST_X - post / 2).toBeGreaterThanOrEqual(BOARD.width / 2 + 0.12);
  });

  it("keeps the whole sign, posts included, on its six-unit plot", () => {
    expect(POST_X + 0.4 / 2).toBeLessThanOrEqual(3.1);
  });

  it("writes exact totals, or about when estimated", () => {
    const hidden = (n: number) => ({ total: n + 10, drawn: 10, hidden: n });
    expect(signLines({ issues: hidden(0), pulls: hidden(12), exact: true })).toEqual([
      "QUEUE AT THE CITY LIMITS",
      "+12 more pull requests",
    ]);
    expect(signLines({ issues: hidden(1), pulls: hidden(0), exact: false })[1]).toBe("about +1 more open issue");
  });
});
