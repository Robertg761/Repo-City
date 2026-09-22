import { describe, expect, it } from "vitest";
import type { GhPull } from "@/types/github";
import { healthSamplePulls, mapPull, mapPulls, pullState } from "./pulls";

const pull = (overrides: Partial<GhPull> = {}): GhPull => ({
  number: 42,
  title: "Add streaming responses",
  html_url: "https://github.com/o/r/pull/42",
  state: "open",
  created_at: "2026-09-10T10:00:00Z",
  updated_at: "2026-09-19T10:00:00Z",
  closed_at: null,
  merged_at: null,
  draft: false,
  comments: 3,
  labels: ["enhancement"],
  user: { login: "bo", id: 2, avatar_url: "", html_url: "", type: "User" },
  head: { ref: "feature", sha: "aaa" },
  base: { ref: "main", sha: "bbb" },
  ...overrides,
});

describe("pullState (PLAN.md section 13)", () => {
  it("is merged whenever merged_at is set", () => {
    expect(pullState({ state: "closed", merged_at: "2026-09-19T10:00:00Z" })).toBe("merged");
  });

  it("is closed for a closed pull that was never merged", () => {
    expect(pullState({ state: "closed", merged_at: null })).toBe("closed");
  });

  it("is open otherwise", () => {
    expect(pullState({ state: "open", merged_at: null })).toBe("open");
  });

  it("trusts merged_at over a state GitHub still reports as open", () => {
    expect(pullState({ state: "open", merged_at: "2026-09-19T10:00:00Z" })).toBe("merged");
  });
});

describe("mapPull", () => {
  it("maps the fields the snapshot contract names", () => {
    expect(mapPull(pull())).toEqual({
      number: 42,
      title: "Add streaming responses",
      url: "https://github.com/o/r/pull/42",
      createdAt: "2026-09-10T10:00:00Z",
      updatedAt: "2026-09-19T10:00:00Z",
      mergedAt: null,
      draft: false,
      comments: 3,
      labels: ["enhancement"],
      author: "bo",
      state: "open",
      headSha: "aaa",
    });
  });

  it("counts requested reviewers when GitHub lists them", () => {
    const reviewer = { login: "cy", id: 3, avatar_url: "", html_url: "", type: "User" };
    expect(mapPull(pull({ requested_reviewers: [reviewer, reviewer] }))?.requestedReviewers).toBe(2);
    expect(mapPull(pull())?.requestedReviewers).toBeUndefined();
  });

  it("falls back to review comments when the list endpoint omits comments", () => {
    const mapped = mapPull(pull({ comments: undefined, review_comments: 9 }));
    expect(mapped?.comments).toBe(9);
  });

  it("defaults a missing comment count to zero", () => {
    const mapped = mapPull(pull({ comments: undefined, review_comments: undefined }));
    expect(mapped?.comments).toBe(0);
  });

  it("marks drafts", () => {
    expect(mapPull(pull({ draft: true }))?.draft).toBe(true);
  });
});

describe("mapPulls", () => {
  it("merges the open and closed pages without duplicates", () => {
    const merged = mapPulls([
      pull({ number: 1 }),
      pull({ number: 2, state: "closed", merged_at: "2026-09-18T10:00:00Z" }),
      pull({ number: 1 }),
    ]);

    expect(merged.map((item) => [item.number, item.state])).toEqual([
      [1, "open"],
      [2, "merged"],
    ]);
  });

  it("skips malformed rows", () => {
    expect(mapPulls([{} as GhPull, pull({ number: 5 })]).map((item) => item.number)).toEqual([5]);
  });
});

describe("healthSamplePulls (PLAN.md section 76.1, decision 6)", () => {
  // 100 open pulls in the order `sort=updated&direction=desc` lists them.
  const listed = Array.from({ length: 100 }, (_, i) =>
    pull({
      number: 1000 - i,
      updated_at: new Date(Date.UTC(2026, 8, 20) - i * 3_600_000).toISOString(),
    }),
  );

  it("is exactly what today's per_page=50 request returned", () => {
    const today = mapPulls(listed.slice(0, 50));
    const merged = pull({
      number: 5,
      state: "closed",
      merged_at: "2026-09-21T00:00:00Z",
      updated_at: "2026-09-21T00:00:00Z",
    });
    expect(healthSamplePulls(mapPulls([...listed, merged]))).toEqual(today);
  });

  it("orders by update time even when pages arrive shuffled", () => {
    const shuffled = [...listed.slice(50), ...listed.slice(0, 50)];
    expect(healthSamplePulls(mapPulls(shuffled)).map((p) => p.number)).toEqual(
      listed.slice(0, 50).map((p) => p.number),
    );
  });

  it("keeps fewer than 50 whole", () => {
    expect(healthSamplePulls(mapPulls(listed.slice(0, 7)))).toHaveLength(7);
  });
});
