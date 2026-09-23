import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearAnalysisCache } from "@/lib/cache";
import { ERROR_COPY, LOCAL_RATE_LIMIT_MESSAGE } from "@/lib/github/errors";
import { type AnalyzeEvent, readEvents } from "@/lib/github/stream";
import { RATE_LIMIT_MAX, resetRateLimit } from "@/lib/ratelimit";
import { GET, POST } from "./route";

/**
 * End-to-end over the route: a stubbed `globalThis.fetch` stands in for
 * api.github.com, so these exercise the real parser, client, snapshot,
 * cache, limiter and NDJSON writer without a network.
 */

const ok = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

const repoBody = {
  id: 1,
  name: "hono",
  full_name: "honojs/hono",
  html_url: "https://github.com/honojs/hono",
  description: null,
  default_branch: "main",
  stargazers_count: 1,
  forks_count: 1,
  open_issues_count: 1,
  archived: false,
  disabled: false,
  fork: false,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-09-20T00:00:00Z",
  pushed_at: "2026-09-20T00:00:00Z",
  size: 1,
  language: "TypeScript",
  topics: [],
  owner: { login: "honojs", id: 2, avatar_url: "", html_url: "", type: "Organization" },
  license: null,
};

function stubGitHub(handler?: (url: string) => Response | null): void {
  const fetchImpl = async (input: RequestInfo | URL): Promise<Response> => {
    const url = String(input);
    const custom = handler?.(url);
    if (custom) return custom;

    if (/\/repos\/[^/]+\/[^/]+$/.test(url)) return ok(repoBody);
    if (url.includes("/git/trees/")) {
      return ok({
        sha: "treesha",
        truncated: false,
        tree: [{ path: "src/index.ts", mode: "100644", type: "blob", sha: "b", size: 10 }],
      });
    }
    if (url.includes("/commits")) {
      return ok([
        {
          sha: "headsha",
          html_url: "",
          commit: { message: "fix", author: { name: "a", email: "", date: "2026-09-20T00:00:00Z" }, committer: null },
          author: null,
          committer: null,
        },
      ]);
    }
    if (url.includes("/actions/workflows")) return ok({ total_count: 0, workflows: [] });
    if (url.includes("/actions/runs")) return ok({ total_count: 0, workflow_runs: [] });
    if (url.includes("/readme")) return new Response(JSON.stringify({ message: "Not Found" }), { status: 404 });
    return ok([]);
  };
  vi.stubGlobal("fetch", fetchImpl as unknown as typeof fetch);
}

const get = (repo: string, headers: Record<string, string> = {}): NextRequest =>
  new NextRequest(`http://localhost:3000/api/analyze?repo=${encodeURIComponent(repo)}`, {
    headers,
  });

const post = (body: unknown, headers: Record<string, string> = {}): NextRequest =>
  new NextRequest("http://localhost:3000/api/analyze", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "content-type": "application/json", ...headers },
  });

const eventsOf = async (response: Response): Promise<AnalyzeEvent[]> =>
  readEvents(response.body as ReadableStream<Uint8Array>);

/** Every `done` stage line in a stream: the panel must only ever draw one. */
const doneStages = (events: AnalyzeEvent[]): AnalyzeEvent[] =>
  events.filter((event) => event.type === "stage" && event.id === "done");

/**
 * The detail of the last line for a stage. The fallback path emits `discover`
 * twice - the live attempt starts it, the replay finishes it - so the last one
 * is the one the panel ends up showing.
 */
const stageDetail = (events: AnalyzeEvent[], id: string): string | undefined => {
  const stage = events.findLast((event) => event.type === "stage" && event.id === id);
  return stage?.type === "stage" ? stage.detail : undefined;
};

beforeEach(() => {
  clearAnalysisCache();
  resetRateLimit();
  stubGitHub();
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.FIXTURE_FALLBACK;
});

describe("/api/analyze transport", () => {
  it("answers NDJSON with a 200, even for failures", async () => {
    const response = await GET(get("not a repo"));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/x-ndjson");
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("accepts GET ?repo= and POST {repo}", async () => {
    const fromGet = await eventsOf(await GET(get("honojs/hono")));
    clearAnalysisCache();
    const fromPost = await eventsOf(await POST(post({ repo: "https://github.com/honojs/hono" })));

    for (const events of [fromGet, fromPost]) {
      expect(events.at(-1)).toMatchObject({ type: "result" });
    }
  });
});

describe("/api/analyze failures", () => {
  it("reports an unparseable input as INVALID_URL", async () => {
    const events = await eventsOf(await GET(get("https://gitlab.com/o/r")));
    expect(events).toEqual([
      { type: "error", code: "INVALID_URL", message: ERROR_COPY.INVALID_URL },
    ]);
  });

  it("reports a missing repo parameter as INVALID_URL", async () => {
    const events = await eventsOf(
      await GET(new NextRequest("http://localhost:3000/api/analyze")),
    );
    expect(events[0]).toMatchObject({ type: "error", code: "INVALID_URL" });
  });

  it("reports a malformed POST body as INVALID_URL", async () => {
    const events = await eventsOf(await POST(post("{not json")));
    expect(events[0]).toMatchObject({ type: "error", code: "INVALID_URL" });
  });

  it("reports a missing repository as NOT_FOUND with the section 60 copy", async () => {
    stubGitHub((url) =>
      /\/repos\/[^/]+\/[^/]+$/.test(url)
        ? new Response(JSON.stringify({ message: "Not Found" }), { status: 404 })
        : null,
    );

    const events = await eventsOf(await GET(get("nobody/nothing")));

    expect(events.at(-1)).toEqual({
      type: "error",
      code: "NOT_FOUND",
      message: ERROR_COPY.NOT_FOUND,
    });
  });

  it("reports GitHub's rate limit with its own copy", async () => {
    stubGitHub(() =>
      new Response(JSON.stringify({ message: "API rate limit exceeded" }), {
        status: 403,
        headers: { "x-ratelimit-remaining": "0" },
      }),
    );

    const events = await eventsOf(await GET(get("honojs/hono")));

    expect(events.at(-1)).toEqual({
      type: "error",
      code: "RATE_LIMITED",
      message: ERROR_COPY.RATE_LIMITED,
    });
  });

  it("gives a rate-limited client a distinct message", async () => {
    const headers = { "x-forwarded-for": "203.0.113.9" };
    // Distinct repositories: cached hits are deliberately not rate limited.
    for (let i = 0; i < RATE_LIMIT_MAX; i += 1) {
      await eventsOf(await GET(get(`owner/repo-${i}`, headers)));
    }

    const events = await eventsOf(await GET(get("owner/one-too-many", headers)));

    expect(events).toEqual([
      { type: "error", code: "RATE_LIMITED", message: LOCAL_RATE_LIMIT_MESSAGE },
    ]);
    expect(LOCAL_RATE_LIMIT_MESSAGE).not.toBe(ERROR_COPY.RATE_LIMITED);
    // A different client is unaffected.
    const other = await eventsOf(
      await GET(get("owner/another-client", { "x-forwarded-for": "198.51.100.4" })),
    );
    expect(other.at(-1)).toMatchObject({ type: "result" });
  });

  it("still serves a cached repository to a client that is over the limit", async () => {
    const headers = { "x-forwarded-for": "203.0.113.11" };
    await eventsOf(await GET(get("honojs/hono", headers)));
    for (let i = 0; i < RATE_LIMIT_MAX; i += 1) {
      await eventsOf(await GET(get(`owner/repo-${i}`, headers)));
    }

    const events = await eventsOf(await GET(get("honojs/hono", headers)));

    expect(events.at(-1)).toMatchObject({ type: "result" });
  });
});

describe("/api/analyze success", () => {
  it("streams stages then exactly one result", async () => {
    const events = await eventsOf(await GET(get("honojs/hono")));

    const stages = events.filter((event) => event.type === "stage");
    const results = events.filter((event) => event.type === "result");

    expect(results).toHaveLength(1);
    expect(stages[0]).toMatchObject({ id: "discover", status: "running" });
    expect(events.at(-1)).toMatchObject({ type: "result" });
    expect(stages.at(-1)).toMatchObject({ id: "done", status: "done" });
    // The analysis emits `done`; the route must not add a second one.
    expect(doneStages(events)).toHaveLength(1);
    expect(results[0]).toMatchObject({
      type: "result",
      analysis: { repo: { fullName: "honojs/hono" }, source: "live" },
    });
  });

  it("serves the second request from the cache without touching GitHub", async () => {
    await eventsOf(await GET(get("honojs/hono")));

    let calls = 0;
    stubGitHub(() => {
      calls += 1;
      return null;
    });

    const events = await eventsOf(await GET(get("honojs/hono")));

    expect(calls).toBe(0);
    expect(events.filter((event) => event.type === "stage").length).toBeGreaterThanOrEqual(7);
    expect(events.at(-1)).toMatchObject({ type: "result" });
    expect(doneStages(events)).toHaveLength(1);
    // The replay says where the analysis came from on the `discover` line, so
    // its `done` line can stay identical to a live survey's.
    expect(stageDetail(events, "discover")).toBe("honojs/hono (cached survey)");
  });

  it("emits the done stage exactly once, with the same detail, fresh and cached", async () => {
    const fresh = await eventsOf(await GET(get("honojs/hono")));
    const cached = await eventsOf(await GET(get("honojs/hono")));

    const result = fresh.at(-1);
    const score = result?.type === "result" ? result.analysis.metrics.health.score : null;
    expect(typeof score).toBe("number");

    for (const events of [fresh, cached]) {
      const done = doneStages(events);
      expect(done).toHaveLength(1);
      expect(done[0]).toEqual({ type: "stage", id: "done", status: "done", detail: `${score}` });
    }
  });
});

describe("/api/analyze fixture fallback", () => {
  it("serves a fixture when GitHub is rate limited and the file exists", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "repo-city-route-"));
    mkdirSync(path.join(root, "fixtures"));
    writeFileSync(
      path.join(root, "fixtures", "honojs__hono.analysis.json"),
      JSON.stringify({
        repo: { fullName: "honojs/hono" },
        metrics: {
          scale: { files: 470 },
          issues: { open: 74 },
          pulls: { open: 80 },
          ci: { state: "healthy" },
          activity: { commitsLast30d: 42 },
        },
        aiStatus: "skipped",
        source: "live",
      }),
      "utf8",
    );

    const cwd = process.cwd();
    process.env.FIXTURE_FALLBACK = "true";
    stubGitHub(() =>
      new Response(JSON.stringify({ message: "API rate limit exceeded" }), {
        status: 403,
        headers: { "x-ratelimit-remaining": "0" },
      }),
    );

    try {
      process.chdir(root);
      const events = await eventsOf(await GET(get("honojs/hono")));

      const result = events.at(-1);
      expect(result).toMatchObject({ type: "result", analysis: { source: "fixture" } });
      expect(
        events.find((event) => event.type === "stage" && event.id === "tree"),
      ).toMatchObject({ detail: "470 files mapped" });
      expect(stageDetail(events, "discover")).toBe("honojs/hono (cached snapshot)");
      expect(doneStages(events)).toHaveLength(1);
    } finally {
      process.chdir(cwd);
    }
  });

  it("replays real open totals and the uncapped file count when the analysis has them", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "repo-city-route-"));
    mkdirSync(path.join(root, "fixtures"));
    writeFileSync(
      path.join(root, "fixtures", "honojs__hono.analysis.json"),
      JSON.stringify({
        repo: { fullName: "honojs/hono" },
        metrics: {
          scale: { files: 2_013, totalFiles: 10_432 },
          issues: { open: 100, total: 21_011 },
          pulls: { open: 50, total: 2_651 },
          ci: { state: "healthy" },
          activity: { commitsLast30d: 42 },
        },
        totalsExact: false,
        aiStatus: "skipped",
        source: "live",
      }),
      "utf8",
    );

    const cwd = process.cwd();
    process.env.FIXTURE_FALLBACK = "true";
    stubGitHub(() =>
      new Response(JSON.stringify({ message: "API rate limit exceeded" }), {
        status: 403,
        headers: { "x-ratelimit-remaining": "0" },
      }),
    );

    try {
      process.chdir(root);
      const events = await eventsOf(await GET(get("honojs/hono")));
      expect(stageDetail(events, "tree")).toBe("10,432 files mapped");
      expect(stageDetail(events, "issues")).toBe("about 21,011 open issues");
      expect(stageDetail(events, "pulls")).toBe("about 2,651 open pull requests");
    } finally {
      process.chdir(cwd);
    }
  });

  it("replays an older analysis without totals in the survey's own words", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "repo-city-route-"));
    mkdirSync(path.join(root, "fixtures"));
    writeFileSync(
      path.join(root, "fixtures", "honojs__hono.analysis.json"),
      JSON.stringify({
        repo: { fullName: "honojs/hono" },
        metrics: {
          scale: { files: 2_013 },
          issues: { open: 1_412 },
          pulls: { open: 1 },
          ci: { state: "healthy" },
          activity: { commitsLast30d: 42 },
        },
        aiStatus: "skipped",
        source: "live",
      }),
      "utf8",
    );

    const cwd = process.cwd();
    process.env.FIXTURE_FALLBACK = "true";
    stubGitHub(() =>
      new Response(JSON.stringify({ message: "API rate limit exceeded" }), {
        status: 403,
        headers: { "x-ratelimit-remaining": "0" },
      }),
    );

    try {
      process.chdir(root);
      const events = await eventsOf(await GET(get("honojs/hono")));
      expect(stageDetail(events, "issues")).toBe("1,412 open issues surveyed");
      expect(stageDetail(events, "pulls")).toBe("1 open pull request surveyed");
    } finally {
      process.chdir(cwd);
    }
  });

  it("falls through to the error when the fixture is missing", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "repo-city-route-"));
    mkdirSync(path.join(root, "fixtures"));

    const cwd = process.cwd();
    process.env.FIXTURE_FALLBACK = "true";
    stubGitHub(() =>
      new Response(JSON.stringify({ message: "API rate limit exceeded" }), {
        status: 403,
        headers: { "x-ratelimit-remaining": "0" },
      }),
    );

    try {
      process.chdir(root);
      const events = await eventsOf(await GET(get("honojs/hono")));
      expect(events.at(-1)).toMatchObject({ type: "error", code: "RATE_LIMITED" });
    } finally {
      process.chdir(cwd);
    }
  });

  it("ignores fixtures when the flag is off", async () => {
    stubGitHub(() =>
      new Response(JSON.stringify({ message: "API rate limit exceeded" }), {
        status: 403,
        headers: { "x-ratelimit-remaining": "0" },
      }),
    );

    const events = await eventsOf(await GET(get("honojs/hono")));
    expect(events.at(-1)).toMatchObject({ type: "error", code: "RATE_LIMITED" });
  });
});
