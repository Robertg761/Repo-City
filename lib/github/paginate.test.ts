import { describe, expect, it } from "vitest";
import { GitHubClient } from "./client";
import { GitHubError } from "./errors";
import {
  fetchPages,
  firstStop,
  pageRange,
  planIssuePages,
  planIssueSearch,
  planIssueTopUp,
  planPullPages,
  searchPagesFor,
  settlePages,
  stopReasonOf,
} from "./paginate";

describe("planIssuePages (wave A2)", () => {
  it("plans nothing when the health sample already holds everything", () => {
    expect(planIssuePages(0)).toBe(0);
    expect(planIssuePages(40)).toBe(0);
    expect(planIssuePages(100)).toBe(0);
  });

  it("plans one page per hundred open items, up to twelve", () => {
    expect(planIssuePages(101)).toBe(2);
    expect(planIssuePages(640)).toBe(7);
    expect(planIssuePages(1_200)).toBe(12);
    expect(planIssuePages(21_257)).toBe(12);
  });

  it("plans nothing for a nonsense count", () => {
    expect(planIssuePages(Number.NaN)).toBe(0);
  });
});

describe("planIssueTopUp (wave A')", () => {
  it("adds pages for a PR-heavy repository, up to fifteen in total", () => {
    // vercel/next.js on 2026-09-22: 1,016 issues and 2,462 open PRs.
    expect(planIssueTopUp(12, { issues: 1_016, pulls: 2_462 })).toBe(15);
  });

  it("adds nothing when twelve pages already reach 1,000 issues", () => {
    // microsoft/vscode on 2026-09-22: 18,605 issues and 2,651 open PRs.
    expect(planIssueTopUp(12, { issues: 18_605, pulls: 2_651 })).toBe(12);
  });

  it("never plans past the end of the listing", () => {
    // 300 issues and 1,000 PRs list on 13 pages.
    expect(planIssueTopUp(12, { issues: 300, pulls: 1_000 })).toBe(13);
  });

  it("never lowers what was planned, and does nothing when nothing was planned", () => {
    expect(planIssueTopUp(5, { issues: 450, pulls: 0 })).toBe(5);
    expect(planIssueTopUp(0, { issues: 5_000, pulls: 5_000 })).toBe(0);
    expect(planIssueTopUp(12, { issues: 0, pulls: 5_000 })).toBe(12);
  });
});

describe("planIssueSearch (wave A' by search)", () => {
  it("searches when pull requests crowd the pages: next.js as measured", () => {
    // 15 REST pages of a 29%-issue listing reach 438 of 1,000 wanted.
    expect(planIssueSearch(12, { issues: 1_012, pulls: 2_449 })).toBe(10);
    // 400 issues under 1,600 pulls: REST would reach 300; four search pages list all 400.
    expect(planIssueSearch(12, { issues: 400, pulls: 1_600 })).toBe(4);
  });

  it("stays on REST for issue-heavy repositories: vscode-shaped", () => {
    expect(planIssueSearch(12, { issues: 9_000, pulls: 600 })).toBe(0);
    expect(planIssueSearch(12, { issues: 1_800, pulls: 250 })).toBe(0);
  });

  it("switches at pull requests taking 40% of a big listing", () => {
    // 36% pull requests: 15 pages reach 960 of 1,000.
    expect(planIssueSearch(12, { issues: 10_000, pulls: 5_600 })).toBe(0);
    // 45%: 15 pages reach 820.
    expect(planIssueSearch(12, { issues: 10_000, pulls: 8_200 })).toBe(10);
  });

  it("stays on REST when 15 pages walk the whole listing, whatever the split", () => {
    expect(planIssueSearch(12, { issues: 1_000, pulls: 400 })).toBe(0);
    expect(planIssueSearch(12, { issues: 150, pulls: 1_300 })).toBe(0);
  });

  it("does nothing without bulk pages or without issues", () => {
    expect(planIssueSearch(0, { issues: 1_012, pulls: 2_449 })).toBe(0);
    expect(planIssueSearch(12, { issues: 0, pulls: 5_000 })).toBe(0);
  });

  it("never plans past search's 1,000-result end", () => {
    expect(searchPagesFor(50_000)).toBe(10);
    expect(searchPagesFor(1_012)).toBe(10);
    expect(searchPagesFor(301)).toBe(4);
    expect(searchPagesFor(0)).toBe(0);
  });
});

describe("planPullPages (wave B)", () => {
  it("plans pages 2..5 from rel=last", () => {
    expect(planPullPages({ hasNext: true, lastPage: 27 })).toEqual([2, 3, 4, 5]);
    expect(planPullPages({ hasNext: true, lastPage: 3 })).toEqual([2, 3]);
  });

  it("plans nothing when page 1 is the only page", () => {
    expect(planPullPages({ hasNext: false, lastPage: 1 })).toEqual([]);
  });

  it("plans up to the ceiling when GitHub did not say where the end is", () => {
    expect(planPullPages({ hasNext: true, lastPage: null })).toEqual([2, 3, 4, 5]);
  });
});

describe("stop reasons", () => {
  it("names the deadline when the deadline fired", () => {
    const deadline = AbortSignal.abort();
    expect(stopReasonOf(new Error("x"), deadline)).toBe("deadline");
  });

  it("maps error codes", () => {
    expect(stopReasonOf(new GitHubError("RATE_LIMITED", "x"))).toBe("rate-limit");
    expect(stopReasonOf(new GitHubError("TIMEOUT", "x"))).toBe("deadline");
    expect(stopReasonOf(new GitHubError("UPSTREAM", "x"))).toBe("error");
  });

  it("prefers a rate limit, then a deadline, then an error", () => {
    expect(firstStop(null, "error", "deadline")).toBe("deadline");
    expect(firstStop("error", "rate-limit")).toBe("rate-limit");
    expect(firstStop(null, undefined)).toBeNull();
  });

  it("builds inclusive page ranges", () => {
    expect(pageRange(2, 5)).toEqual([2, 3, 4, 5]);
    expect(pageRange(3, 2)).toEqual([]);
  });
});

describe("fetchPages", () => {
  const client = (respond: (page: number) => Response | Promise<Response>): GitHubClient =>
    new GitHubClient({
      token: "",
      fetchImpl: (async (input: RequestInfo | URL) => {
        const page = Number(new URL(String(input)).searchParams.get("page"));
        return respond(page);
      }) as unknown as typeof fetch,
    });

  const json = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), { status });

  it("fetches every page in parallel and keeps page order", async () => {
    const seen: number[] = [];
    const result = await fetchPages<{ n: number }>(
      client(async (page) => {
        // Later pages answer first.
        await new Promise((resolve) => setTimeout(resolve, (4 - page) * 5));
        return json([{ n: page * 10 }, { n: page * 10 + 1 }]);
      }),
      "/x",
      { per_page: 2 },
      [1, 2, 3],
      { onPage: (page) => seen.push(page) },
    );
    expect(result.items.map((item) => item.n)).toEqual([10, 11, 20, 21, 30, 31]);
    expect(result).toMatchObject({ received: 3, failed: 0, stoppedBy: null });
    expect(seen).toEqual([3, 2, 1]);
  });

  it("keeps what landed when a page fails, and says why", async () => {
    const result = await fetchPages(
      client((page) => (page === 2 ? json({ message: "API rate limit exceeded" }, 429) : json([page]))),
      "/x",
      {},
      [1, 2, 3],
    );
    expect(result.items).toEqual([1, 3]);
    expect(result).toMatchObject({ received: 2, failed: 1, stoppedBy: "rate-limit" });
  });

  it("abandons pages still in flight at the deadline", async () => {
    const deadline = new AbortController();
    const hanging = new GitHubClient({
      token: "",
      fetchImpl: ((input: RequestInfo | URL, init: RequestInit) => {
        const page = Number(new URL(String(input)).searchParams.get("page"));
        if (page === 1) return Promise.resolve(json(["first"]));
        return new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        });
      }) as unknown as typeof fetch,
    });
    const pending = fetchPages(hanging, "/x", {}, [1, 2, 3], { deadline: deadline.signal });
    setTimeout(() => deadline.abort(), 10);
    const result = await pending;
    expect(result).toMatchObject({ items: ["first"], received: 1, failed: 2, stoppedBy: "deadline" });
  });
});

describe("settlePages", () => {
  it("settles any page fetcher like fetchPages: order kept, losses counted", async () => {
    const seen: number[] = [];
    const result = await settlePages(
      [1, 2, 3],
      async (page) => {
        if (page === 2) throw new GitHubError("RATE_LIMITED", "search rate limited");
        return { items: [page * 10], lastPage: null };
      },
      { onPage: (page) => seen.push(page) },
    );
    expect(result).toEqual({ items: [10, 30], received: 2, failed: 1, stoppedBy: "rate-limit", lastPage: null });
    expect(seen.sort()).toEqual([1, 3]);
  });
});
