import { describe, expect, it } from "vitest";
import type { GhIssue, GhPull } from "@/types/github";
import { ENRICH_BATCH_SIZE, ENRICH_CONCURRENCY, ENRICH_MAX_PULLS, ENRICH_SMALL_REPOS } from "./budgets";
import { GitHubClient } from "./client";
import { type StageEvent, fetchSnapshot } from "./snapshot";
import {
  LIMITED_ENRICHMENT_WARNING,
  LOW_BUDGET_ENRICHMENT_WARNING,
  LOW_BUDGET_ISSUES_WARNING,
  buildIssueBacklog,
  enrichPulls,
} from "./survey";

/**
 * A fake api.github.com with a whole open listing behind it (PLAN.md section
 * 76.6). Item `n` is updated `n` minutes after a base time, so the listing in
 * "most recently updated first" order is simply descending numbers. Pull
 * requests are spread evenly through it, as they are on GitHub. No network.
 */
interface FakeConfig {
  issues: number;
  pulls: number;
  /** REST `x-ratelimit-remaining`; GitHub's anonymous 60 trips the guard. */
  restRemaining?: number;
  graphqlRemaining?: number;
  token?: string;
  /** Checked first; answer `undefined` to fall through to the fake. */
  override?: (url: URL, init: RequestInit) => Response | Promise<Response> | undefined;
}

const BASE = Date.UTC(2026, 8, 1);
const iso = (n: number): string => new Date(BASE + n * 60_000).toISOString();

function listing(config: FakeConfig): { all: number[]; isPull: (n: number) => boolean } {
  const total = config.issues + config.pulls;
  const pulls = new Set<number>();
  for (let n = 1; n <= total; n += 1) {
    if (Math.floor((n * config.pulls) / total) !== Math.floor(((n - 1) * config.pulls) / total)) pulls.add(n);
  }
  const all = Array.from({ length: total }, (_, i) => total - i);
  return { all, isPull: (n) => pulls.has(n) };
}

const ghIssue = (n: number, pull: boolean): GhIssue => ({
  number: n,
  title: `Item ${n}`,
  html_url: `https://github.com/o/r/${pull ? "pull" : "issues"}/${n}`,
  state: "open",
  created_at: iso(0),
  updated_at: iso(n),
  closed_at: null,
  comments: n % 7,
  labels: [],
  user: { login: "ann", id: 1, avatar_url: "", html_url: "", type: "User" },
  body: `body ${n}`,
  reactions: { total_count: n % 5 },
  ...(pull ? { pull_request: { url: "", html_url: "" } } : {}),
});

const ghPull = (n: number): GhPull => ({
  number: n,
  title: `Item ${n}`,
  html_url: `https://github.com/o/r/pull/${n}`,
  state: "open",
  created_at: iso(0),
  updated_at: iso(n),
  closed_at: null,
  merged_at: null,
  draft: false,
  review_comments: 99,
  labels: [],
  user: null,
  head: { ref: "f", sha: `sha${n}` },
  base: { ref: "main", sha: "" },
  requested_reviewers: [],
});

function reply(body: unknown, headers: Record<string, string> = {}, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function fakeGitHub(config: FakeConfig): {
  client: GitHubClient;
  urls: string[];
  graphqlBodies: string[];
} {
  const { all, isPull } = listing(config);
  const openPulls = all.filter(isPull);
  const urls: string[] = [];
  const graphqlBodies: string[] = [];
  const rest = { "x-ratelimit-remaining": String(config.restRemaining ?? 4_000) };
  const graph = { "x-ratelimit-remaining": String(config.graphqlRemaining ?? 4_000) };

  const pageOf = <T>(items: T[], page: number, perPage: number): T[] =>
    items.slice((page - 1) * perPage, page * perPage);

  const fetchImpl = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input));
    const q = url.searchParams;
    urls.push(`${url.pathname}${url.search}`);

    const overridden = config.override?.(url, init);
    if (overridden) return overridden;

    const path = url.pathname.replace("/repos/o/r", "");
    if (url.pathname === "/graphql") {
      const body = String(init.body);
      graphqlBodies.push(body);
      const { query } = JSON.parse(body) as { query: string };
      if (query.includes("RepoCityTotals")) {
        return reply(
          { data: { repository: { issues: { totalCount: config.issues }, pullRequests: { totalCount: config.pulls } } } },
          graph,
        );
      }
      const numbers = [...query.matchAll(/p(\d+): pullRequest/g)].map((m) => Number(m[1]));
      const repository = Object.fromEntries(
        numbers.map((n) => [
          `p${n}`,
          {
            number: n,
            reviewDecision: n % 2 === 0 ? "APPROVED" : "CHANGES_REQUESTED",
            comments: { totalCount: 1000 + n },
            reactions: { totalCount: 2000 + n },
            changedFiles: 3,
            files: { nodes: [{ path: `src/pkg${n % 3}/a.ts` }, { path: `src/pkg${n % 3}/b.ts` }] },
            commits: { nodes: [{ commit: { statusCheckRollup: { state: n % 3 === 0 ? "FAILURE" : "SUCCESS" } } }] },
          },
        ]),
      );
      return reply({ data: { repository } }, graph);
    }

    if (path === "") {
      return reply(
        {
          id: 1, name: "r", full_name: "o/r", html_url: "https://github.com/o/r", description: null,
          default_branch: "main", stargazers_count: 1, forks_count: 1,
          open_issues_count: config.issues + config.pulls, archived: false, disabled: false, fork: false,
          created_at: iso(0), updated_at: iso(0), pushed_at: iso(0), size: 1, language: "TypeScript",
          topics: [], owner: { login: "o", id: 1, avatar_url: "", html_url: "", type: "User" }, license: null,
        },
        rest,
      );
    }
    if (path.startsWith("/git/trees/")) {
      return reply({ sha: "tree", url: "", truncated: false, tree: [{ path: "a.ts", mode: "100644", type: "blob", sha: "x", size: 1 }] }, rest);
    }
    if (path === "/issues") {
      const page = Number(q.get("page") ?? 1);
      const perPage = Number(q.get("per_page"));
      // A1 lists the most discussed first: comments are n % 7, ties newest first.
      const ordered =
        q.get("sort") === "comments" ? [...all].sort((a, b) => (b % 7) - (a % 7) || b - a) : all;
      const items = pageOf(ordered, page, perPage).map((n) => ghIssue(n, isPull(n)));
      const more = page * perPage < ordered.length;
      return reply(items, {
        ...rest,
        ...(more ? { link: `<https://api.github.com/repositories/1/issues?page=${page + 1}&after=abc>; rel="next"` } : {}),
      });
    }
    if (path === "/pulls" && q.get("state") === "open") {
      const page = Number(q.get("page") ?? 1);
      const perPage = Number(q.get("per_page"));
      const last = Math.max(1, Math.ceil(openPulls.length / perPage));
      const link =
        page < last
          ? `<https://api.github.com/repositories/1/pulls?per_page=${perPage}&page=${page + 1}>; rel="next", ` +
            `<https://api.github.com/repositories/1/pulls?per_page=${perPage}&page=${last}>; rel="last"`
          : undefined;
      return reply(pageOf(openPulls, page, perPage).map(ghPull), { ...rest, ...(link ? { link } : {}) });
    }
    if (path === "/pulls") return reply([], rest);
    if (path === "/actions/workflows") return reply({ total_count: 0, workflows: [] }, rest);
    if (path === "/actions/runs") return reply({ total_count: 0, workflow_runs: [] }, rest);
    if (path === "/readme") return reply({ message: "Not Found" }, rest, 404);
    return reply([], rest);
  }) as unknown as typeof fetch;

  return {
    client: new GitHubClient({ token: config.token ?? "t", fetchImpl }),
    urls,
    graphqlBodies,
  };
}

const stage = (events: StageEvent[], id: StageEvent["id"]): StageEvent[] =>
  events.filter((event) => event.id === id);

/** A fetch that never answers until its signal aborts. */
const hang = (init: RequestInit): Promise<Response> =>
  new Promise((_resolve, reject) => {
    init.signal?.addEventListener("abort", () => reject(new Error("aborted")));
  });

describe("small repositories (PLAN.md section 76.6)", () => {
  it("make exactly today's REST requests, plus one enrichment query with a token", async () => {
    // What `main` sent before the settlements work, for a repository with
    // 40 open issues and pull requests. The only REST change is the width of
    // the open pulls request (A3): 50 -> 100 items on the same single page.
    // With a token, `ENRICH_SMALL_REPOS` adds one GraphQL query for reviews,
    // CI and touched files; without one, GraphQL is never called.
    const today = [
      "/repos/o/r",
      "/repos/o/r/git/trees/main?recursive=1",
      "/repos/o/r/readme",
      "/repos/o/r/issues?state=open&sort=comments&direction=desc&per_page=100",
      "/repos/o/r/pulls?state=open&sort=updated&direction=desc&per_page=50",
      "/repos/o/r/pulls?state=closed&sort=updated&direction=desc&per_page=30",
      "/repos/o/r/actions/workflows",
      "/repos/o/r/actions/runs?per_page=50&branch=main",
      "/repos/o/r/commits?per_page=100",
      "/repos/o/r/contributors?per_page=100",
      "/repos/o/r/releases?per_page=20",
    ].sort();

    for (const token of ["t", ""]) {
      const { client, urls } = fakeGitHub({ issues: 30, pulls: 10, token });
      await fetchSnapshot("o", "r", { client });
      const asToday = urls
        .filter((url) => url !== "/graphql")
        .map((url) => url.replace("state=open&sort=updated&direction=desc&per_page=100", "state=open&sort=updated&direction=desc&per_page=50"))
        .sort();
      expect(asToday).toEqual(today);
      expect(client.graphqlCount).toBe(ENRICH_SMALL_REPOS && token ? 1 : 0);
    }
  });

  it("count their totals straight off the pages they already have", async () => {
    const { client } = fakeGitHub({ issues: 30, pulls: 10 });
    const snapshot = await fetchSnapshot("o", "r", { client });

    expect(snapshot.openTotals).toEqual({ issues: 30, pulls: 10, exact: true, source: "rest-link" });
    expect(snapshot.issueBacklog).toEqual([]);
    expect(snapshot.coverage).toEqual({
      issuePages: { planned: 0, received: 0 },
      pullPages: { planned: 1, received: 1 },
      enrichment: ENRICH_SMALL_REPOS ? "complete" : "skipped",
      stoppedBy: null,
    });
  });

  it("keep today's progress lines", async () => {
    const events: StageEvent[] = [];
    const { client } = fakeGitHub({ issues: 30, pulls: 10 });
    await fetchSnapshot("o", "r", { client, onStage: (event) => events.push(event) });

    expect(stage(events, "issues").map((e) => e.status)).toEqual(["running", "done"]);
    // Enrichment adds one "checking reviews and CI" line before the result.
    expect(stage(events, "pulls").map((e) => e.status)).toEqual(
      ENRICH_SMALL_REPOS ? ["running", "running", "done"] : ["running", "done"],
    );
    expect(stage(events, "pulls").at(-1)?.detail).toBe("10 pull requests reviewed");
  });
});

describe("large repositories (PLAN.md section 76.6)", () => {
  it("survey every wave and report exact totals and full coverage", async () => {
    // Issue-heavy, vscode-shaped: 2,050 open items, 250 of them pull requests.
    const events: StageEvent[] = [];
    const { client, urls } = fakeGitHub({ issues: 1_800, pulls: 250 });
    const snapshot = await fetchSnapshot("o", "r", { client, onStage: (event) => events.push(event) });

    expect(snapshot.openTotals).toEqual({ issues: 1_800, pulls: 250, exact: true, source: "graphql" });
    expect(snapshot.coverage).toEqual({
      issuePages: { planned: 12, received: 12 },
      pullPages: { planned: 3, received: 3 },
      enrichment: "partial",
      stoppedBy: null,
    });

    // Twelve bulk issue pages and pull pages 2..3 on top of today's eleven
    // (this fake has no manifests to fetch).
    const bulk = urls.filter((url) => url.includes("/issues?") && url.includes("sort=updated"));
    expect(bulk).toHaveLength(12);
    expect(urls.filter((url) => url.includes("/pulls?state=open") && url.includes("&page="))).toHaveLength(2);
    expect(client.restCount).toBe(11 + 12 + 2);
    // One totals query, then the newest open PRs in aliased batches.
    expect(client.graphqlCount).toBe(1 + ENRICH_MAX_PULLS / ENRICH_BATCH_SIZE);

    // Every open pull request is listed, newest first, ahead of closed ones.
    const open = snapshot.pulls.filter((pull) => pull.state === "open");
    expect(open).toHaveLength(250);
    expect(open.map((pull) => pull.number)).toEqual([...open.map((pull) => pull.number)].sort((a, b) => b - a));

    // Rising counts on the progress rows, then a factual final line.
    const issueRunning = stage(events, "issues").filter((e) => e.status === "running" && e.detail);
    const counts = issueRunning.map((e) => Number(e.detail?.split(" ")[0].replace(/,/g, "")));
    expect(counts.length).toBeGreaterThan(5);
    expect(counts).toEqual([...counts].sort((a, b) => a - b));
    expect(stage(events, "issues").at(-1)).toEqual({
      id: "issues",
      status: "done",
      detail: `${(snapshot.issues.length + snapshot.issueBacklog!.length).toLocaleString("en-US")} of 1,800 open issues surveyed`,
    });
    expect(stage(events, "pulls").at(-1)?.detail).toBe(
      `250 of 250 open pull requests surveyed, ${ENRICH_MAX_PULLS} with reviews and CI`,
    );
  });

  it("keeps the health sample exactly A1, and never repeats it in the backlog", async () => {
    const { client } = fakeGitHub({ issues: 1_800, pulls: 250 });
    const snapshot = await fetchSnapshot("o", "r", { client });

    // A1 = the first 100 items with n % 7 == 6, pull requests dropped.
    expect(snapshot.issues.every((issue) => issue.number % 7 === 6)).toBe(true);
    expect(snapshot.issues.length).toBeGreaterThan(80);

    const sample = new Set(snapshot.issues.map((issue) => issue.number));
    const backlog = snapshot.issueBacklog ?? [];
    expect(backlog.length).toBeGreaterThan(900);
    expect(backlog.some((issue) => sample.has(issue.number))).toBe(false);
    expect(new Set(backlog.map((issue) => issue.number)).size).toBe(backlog.length);
    // Most recently updated first.
    const times = backlog.map((issue) => Date.parse(issue.updatedAt));
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  it("drops PR items from the issue list but uses them for PR comments and reactions", async () => {
    // Anonymous: no GraphQL, so the issue view is the only source of comments.
    const { client, urls } = fakeGitHub({ issues: 900, pulls: 300, token: "" });
    const snapshot = await fetchSnapshot("o", "r", { client });

    const backlog = snapshot.issueBacklog ?? [];
    expect(backlog.every((issue) => !issue.url.includes("/pull/"))).toBe(true);

    const open = snapshot.pulls.filter((pull) => pull.state === "open");
    const fromIssuePages = open.filter((pull) => pull.comments !== 99);
    expect(fromIssuePages.length).toBeGreaterThan(200);
    for (const pull of fromIssuePages) {
      expect(pull.comments).toBe(pull.number % 7);
      expect(pull.reactions).toBe(pull.number % 5);
      // Enrichment did not run, and says so.
      expect(pull.review).toBeNull();
      expect(pull.checks).toBeNull();
      expect(pull.files).toBeUndefined();
    }

    // Totals from the REST Link fallback: the PR count from rel="last".
    expect(urls).toContain("/repos/o/r/pulls?state=open&per_page=1");
    expect(snapshot.openTotals).toEqual({ issues: 900, pulls: 300, exact: true, source: "rest-link" });
    expect(snapshot.coverage?.enrichment).toBe("skipped");
    expect(client.graphqlCount).toBe(0);
  });

  it("fills review, CI, touched files and discussion from GraphQL", async () => {
    const { client, graphqlBodies } = fakeGitHub({ issues: 1_800, pulls: 250 });
    const snapshot = await fetchSnapshot("o", "r", { client });

    const open = snapshot.pulls.filter((pull) => pull.state === "open");
    const enriched = open.slice(0, ENRICH_MAX_PULLS);
    for (const pull of enriched) {
      expect(pull.comments).toBe(1000 + pull.number);
      expect(pull.reactions).toBe(2000 + pull.number);
      expect(pull.review).toBe(pull.number % 2 === 0 ? "approved" : "changes-requested");
      expect(pull.checks).toBe(pull.number % 3 === 0 ? "failing" : "passing");
      expect(pull.files).toEqual([`src/pkg${pull.number % 3}/a.ts`, `src/pkg${pull.number % 3}/b.ts`]);
      expect(pull.changedFiles).toBe(3);
      expect(pull.headSha).toBe(`sha${pull.number}`);
    }
    // The rest are marked unknown rather than guessed.
    expect(open.slice(ENRICH_MAX_PULLS).every((pull) => pull.review === null && pull.checks === null)).toBe(true);
    // Owner and name travel as variables, never spliced into the query.
    expect(graphqlBodies.every((body) => JSON.parse(body).variables.owner === "o")).toBe(true);
  });

  it("tops up issue pages once totals show a PR-heavy repository", async () => {
    // next.js-shaped: 400 issues under 1,600 open pull requests.
    const { client, urls } = fakeGitHub({ issues: 400, pulls: 1_600 });
    const snapshot = await fetchSnapshot("o", "r", { client });

    const pages = urls
      .filter((url) => url.includes("/issues?") && url.includes("sort=updated"))
      .map((url) => Number(new URL(`https://x${url}`).searchParams.get("page")))
      .sort((a, b) => a - b);
    expect(pages).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
    expect(snapshot.coverage?.issuePages).toEqual({ planned: 15, received: 15 });
    // 15 pages of a 20%-issue listing reach 300 issues.
    expect(snapshot.issues.length + (snapshot.issueBacklog?.length ?? 0)).toBe(300);
  });

  it("stops at the page deadline with a partial snapshot and honest coverage", async () => {
    const events: StageEvent[] = [];
    const { client } = fakeGitHub({
      issues: 1_800,
      pulls: 250,
      override: (url, init) =>
        url.pathname.endsWith("/issues") && Number(url.searchParams.get("page") ?? 0) >= 6
          ? hang(init)
          : undefined,
    });

    const snapshot = await fetchSnapshot("o", "r", {
      client,
      budgets: { pageDeadlineMs: 50 },
      onStage: (event) => events.push(event),
    });

    expect(snapshot.coverage).toMatchObject({
      issuePages: { planned: 12, received: 5 },
      pullPages: { planned: 3, received: 3 },
      stoppedBy: "deadline",
    });
    expect(snapshot.issueBacklog?.length).toBeGreaterThan(300);
    expect(snapshot.tree.entries).toHaveLength(1);
    expect(stage(events, "issues").at(-1)?.status).toBe("done");
    expect(stage(events, "issues").at(-1)?.detail).toMatch(/ of 1,800 open issues surveyed \(time limit\)$/);
  });

  it("stops enrichment at its own deadline without failing the survey", async () => {
    const { client } = fakeGitHub({
      issues: 1_800,
      pulls: 250,
      override: (url, init) =>
        url.pathname === "/graphql" && !String(init.body).includes("RepoCityTotals") ? hang(init) : undefined,
    });
    const events: StageEvent[] = [];
    const snapshot = await fetchSnapshot("o", "r", {
      client,
      budgets: { enrichmentDeadlineMs: 50 },
      onStage: (event) => events.push(event),
    });

    expect(snapshot.coverage).toMatchObject({ enrichment: "skipped", stoppedBy: "deadline" });
    expect(snapshot.pulls.filter((pull) => pull.state === "open")).toHaveLength(250);
    // The issues row finished without waiting on pull request enrichment.
    const done = (id: StageEvent["id"]): number =>
      events.findIndex((event) => event.id === id && event.status === "done");
    expect(done("issues")).toBeLessThan(done("pulls"));
  });

  it("rate guard: a low REST budget trims to the health sample and PR page 1", async () => {
    const { client, urls } = fakeGitHub({ issues: 1_800, pulls: 250, restRemaining: 350 });
    const snapshot = await fetchSnapshot("o", "r", { client });

    expect(urls.some((url) => url.includes("/issues?") && url.includes("sort=updated"))).toBe(false);
    expect(urls.some((url) => url.includes("/pulls?state=open") && url.includes("&page="))).toBe(false);
    expect(snapshot.coverage).toMatchObject({
      issuePages: { planned: 12, received: 0 },
      pullPages: { planned: 3, received: 1 },
      stoppedBy: "rate-limit",
    });
    expect(snapshot.issueBacklog).toEqual([]);
    expect(snapshot.warnings).toContain(LOW_BUDGET_ISSUES_WARNING);
    // Totals still come through: GraphQL has its own budget.
    expect(snapshot.openTotals?.source).toBe("graphql");
  });

  it("rate guard: a low GraphQL budget skips enrichment with a warning", async () => {
    const { client } = fakeGitHub({ issues: 1_800, pulls: 250, graphqlRemaining: 200 });
    const snapshot = await fetchSnapshot("o", "r", { client });

    expect(client.graphqlCount).toBe(1);
    expect(snapshot.coverage).toMatchObject({ enrichment: "skipped", stoppedBy: "rate-limit" });
    expect(snapshot.warnings).toContain(LOW_BUDGET_ENRICHMENT_WARNING);
  });

  it("a GraphQL failure leaves review, checks and files empty without failing the survey", async () => {
    const { client } = fakeGitHub({
      issues: 1_800,
      pulls: 250,
      override: (url) => (url.pathname === "/graphql" ? new Response("<html>502</html>", { status: 502 }) : undefined),
    });
    const snapshot = await fetchSnapshot("o", "r", { client });

    const open = snapshot.pulls.filter((pull) => pull.state === "open");
    expect(open).toHaveLength(250);
    expect(open.every((pull) => pull.review === null && pull.checks === null && pull.files === undefined)).toBe(true);
    expect(snapshot.coverage).toMatchObject({ enrichment: "skipped", stoppedBy: "error" });
    // Totals fell back to the REST Link trick.
    expect(snapshot.openTotals).toEqual({ issues: 1_800, pulls: 250, exact: true, source: "rest-link" });
  });

  it("a secondary rate limit stops new enrichment batches at once", async () => {
    const { client } = fakeGitHub({
      issues: 1_800,
      pulls: 250,
      override: (url, init) =>
        url.pathname === "/graphql" && !String(init.body).includes("RepoCityTotals")
          ? reply({ message: "You have exceeded a secondary rate limit." }, {}, 403)
          : undefined,
    });
    const snapshot = await fetchSnapshot("o", "r", { client });

    // The totals query plus at most the batches already in flight.
    expect(client.graphqlCount).toBeLessThanOrEqual(1 + ENRICH_CONCURRENCY);
    expect(snapshot.coverage).toMatchObject({ stoppedBy: "rate-limit" });
    expect(snapshot.warnings).toContain(LIMITED_ENRICHMENT_WARNING);
  });

  it("enrichPulls launches no new batch after a rate limit", async () => {
    const { client } = fakeGitHub({
      issues: 0,
      pulls: 0,
      override: (url) =>
        url.pathname === "/graphql" ? reply({ message: "You have exceeded a secondary rate limit." }, {}, 403) : undefined,
    });
    const numbers = Array.from({ length: 100 }, (_, i) => 100 - i);
    const outcome = await enrichPulls(client, "o", "r", numbers, undefined, {
      batchSize: 25,
      concurrency: 1,
      maxPulls: 100,
    });
    expect(client.graphqlCount).toBe(1);
    expect(outcome).toMatchObject({ stoppedBy: "rate-limit", state: "skipped", attempted: 25 });
  });

  it("enrichPulls runs every batch and reports partial when capped", async () => {
    const { client } = fakeGitHub({ issues: 0, pulls: 0 });
    const numbers = Array.from({ length: 60 }, (_, i) => 60 - i);
    const outcome = await enrichPulls(client, "o", "r", numbers, undefined, {
      batchSize: 10,
      concurrency: 2,
      maxPulls: 40,
    });
    expect(client.graphqlCount).toBe(4);
    expect(outcome.byNumber.size).toBe(40);
    expect(outcome).toMatchObject({ stoppedBy: null, state: "partial" });
  });

  it("estimates totals when neither GraphQL nor the Link trick answers", async () => {
    const { client } = fakeGitHub({
      issues: 1_800,
      pulls: 250,
      override: (url) =>
        url.pathname === "/graphql" || url.searchParams.get("per_page") === "1"
          ? reply({ message: "boom" }, {}, 500)
          : undefined,
    });
    const snapshot = await fetchSnapshot("o", "r", { client });

    // Page 1 of open pulls said three pages: 201 to 300, so at least 201.
    expect(snapshot.openTotals).toEqual({ issues: 2_050 - 201, pulls: 201, exact: false, source: "estimate" });
  });
});

describe("buildIssueBacklog", () => {
  it("drops pull requests, A1 repeats and duplicates across shifted pages", () => {
    const sample = [{ number: 5 }] as { number: number }[];
    const backlog = buildIssueBacklog(
      [ghIssue(9, false), ghIssue(8, true), ghIssue(7, false), ghIssue(5, false), ghIssue(7, false), ghIssue(10, false)],
      sample as never,
    );
    // Update order restored: 10 was bumped while the pages were being read.
    expect(backlog.map((issue) => issue.number)).toEqual([10, 9, 7]);
  });
});
