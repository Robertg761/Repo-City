import { describe, expect, it } from "vitest";
import type { GhGraphPull } from "@/types/github";
import { GitHubClient } from "./client";
import {
  PULL_FIELDS,
  checksOf,
  enrichmentQuery,
  fetchGraphTotals,
  fetchPullBatch,
  mapGraphPull,
  reviewOf,
} from "./graphql";

const node = (overrides: Partial<GhGraphPull> = {}): GhGraphPull => ({
  number: 12,
  reviewDecision: "APPROVED",
  comments: { totalCount: 4 },
  reactions: { totalCount: 9 },
  changedFiles: 30,
  files: { nodes: Array.from({ length: 8 }, (_, i) => ({ path: `src/f${i}.ts` })) },
  commits: { nodes: [{ commit: { statusCheckRollup: { state: "FAILURE" } } }] },
  ...overrides,
});

const clientAnswering = (body: unknown, status = 200): { client: GitHubClient; bodies: string[] } => {
  const bodies: string[] = [];
  const fetchImpl = (async (_input: RequestInfo | URL, init: RequestInit = {}) => {
    bodies.push(String(init.body));
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return { client: new GitHubClient({ token: "t", fetchImpl }), bodies };
};

describe("enrichmentQuery", () => {
  it("aliases one pullRequest per number with the section 76.6 fields", () => {
    const query = enrichmentQuery([123, 45]);
    expect(query).toContain(`p123: pullRequest(number: 123) { ${PULL_FIELDS} }`);
    expect(query).toContain(`p45: pullRequest(number: 45) { ${PULL_FIELDS} }`);
    expect(query).toContain("repository(owner: $owner, name: $name)");
    expect(PULL_FIELDS).toContain("files(first: 8)");
    expect(PULL_FIELDS).toContain("commits(last: 1)");
  });

  it("never splices anything but positive integers into the query", () => {
    const query = enrichmentQuery([1, -2, 3.5, Number.NaN, 7]);
    expect([...query.matchAll(/p(\d+):/g)].map((m) => Number(m[1]))).toEqual([1, 7]);
  });
});

describe("mapGraphPull", () => {
  it("maps review, CI, discussion and touched paths", () => {
    expect(mapGraphPull(node())).toEqual({
      number: 12,
      enrichment: {
        review: "approved",
        checks: "failing",
        comments: 4,
        reactions: 9,
        files: Array.from({ length: 8 }, (_, i) => `src/f${i}.ts`),
        changedFiles: 30,
      },
    });
  });

  it("answers null for no rollup, no decision and no files", () => {
    const mapped = mapGraphPull(
      node({ reviewDecision: null, files: null, commits: { nodes: [] }, changedFiles: 0 }),
    );
    expect(mapped?.enrichment).toMatchObject({ review: null, checks: null, files: [], changedFiles: 0 });
  });

  it("skips a malformed node", () => {
    expect(mapGraphPull({} as GhGraphPull)).toBeNull();
  });
});

describe("reviewOf and checksOf", () => {
  it("maps every review decision", () => {
    expect(reviewOf("APPROVED")).toBe("approved");
    expect(reviewOf("CHANGES_REQUESTED")).toBe("changes-requested");
    expect(reviewOf("REVIEW_REQUIRED")).toBe("review-required");
    expect(reviewOf(null)).toBeNull();
  });

  it("maps every StatusState", () => {
    expect(checksOf("SUCCESS")).toBe("passing");
    expect(checksOf("FAILURE")).toBe("failing");
    expect(checksOf("ERROR")).toBe("failing");
    expect(checksOf("PENDING")).toBe("pending");
    expect(checksOf("EXPECTED")).toBe("pending");
    expect(checksOf(null)).toBeNull();
    expect(checksOf("SOMETHING_NEW")).toBeNull();
  });
});

describe("fetchGraphTotals", () => {
  it("reads both totals and passes owner and name as variables", async () => {
    const { client, bodies } = clientAnswering({
      data: { repository: { issues: { totalCount: 18_605 }, pullRequests: { totalCount: 2_651 } } },
    });
    expect(await fetchGraphTotals(client, "microsoft", "vscode")).toEqual({ issues: 18_605, pulls: 2_651 });
    expect(JSON.parse(bodies[0]).variables).toEqual({ owner: "microsoft", name: "vscode" });
  });

  it("throws when the repository is missing from the answer", async () => {
    const { client } = clientAnswering({ data: { repository: null }, errors: [{ message: "Could not resolve" }] });
    await expect(fetchGraphTotals(client, "o", "r")).rejects.toThrow();
  });
});

describe("fetchPullBatch", () => {
  it("keeps every alias that resolved and drops the ones that did not", async () => {
    const { client } = clientAnswering({
      data: { repository: { p12: node(), p13: null } },
      errors: [{ message: "Could not resolve to a PullRequest with the number of 13.", type: "NOT_FOUND" }],
    });
    const result = await fetchPullBatch(client, "o", "r", [12, 13]);
    expect([...result.keys()]).toEqual([12]);
  });
});
