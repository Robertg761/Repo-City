import { describe, expect, it, vi } from "vitest";
import { GITHUB_API_BASE, GitHubClient } from "./client";
import { GitHubError } from "./errors";

/** Records every call and answers with a canned response. No network. */
function stubFetch(
  response: Response | ((url: string, init: RequestInit) => Response | Promise<Response>),
): { fetchImpl: typeof fetch; calls: { url: string; init: RequestInit }[] } {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    calls.push({ url, init });
    return typeof response === "function" ? response(url, init) : response.clone();
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

const json = (body: unknown, init: ResponseInit = {}): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });

describe("GitHubClient request shape", () => {
  it("sends the documented headers and the platform cache hint", async () => {
    const { fetchImpl, calls } = stubFetch(json({ ok: true }));
    const client = new GitHubClient({ token: "test-token", fetchImpl });

    await client.get("/repos/o/r");

    const [call] = calls;
    expect(call.url).toBe(`${GITHUB_API_BASE}/repos/o/r`);
    const headers = call.init.headers as Record<string, string>;
    expect(headers.Accept).toBe("application/vnd.github+json");
    expect(headers["X-GitHub-Api-Version"]).toBe("2022-11-28");
    expect(headers.Authorization).toBe("Bearer test-token");
    expect(call.init.redirect).toBe("follow");
    expect((call.init as { next?: { revalidate?: number } }).next).toEqual({ revalidate: 600 });
  });

  it("works unauthenticated: no Authorization header at all", async () => {
    const { fetchImpl, calls } = stubFetch(json({ ok: true }));
    const client = new GitHubClient({ token: "", fetchImpl });

    await client.get("/repos/o/r");

    expect(client.authenticated).toBe(false);
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it("appends query parameters and drops undefined ones", async () => {
    const { fetchImpl, calls } = stubFetch(json([]));
    const client = new GitHubClient({ token: "", fetchImpl });

    await client.getList("/repos/o/r/issues", {
      query: { state: "open", per_page: 100, sort: undefined },
    });

    expect(calls[0].url).toBe(`${GITHUB_API_BASE}/repos/o/r/issues?state=open&per_page=100`);
  });

  it("counts every request for the budget in PLAN.md section 30", async () => {
    const { fetchImpl } = stubFetch(json([]));
    const client = new GitHubClient({ token: "", fetchImpl });

    await client.getList("/a");
    await client.getList("/b");
    await client.getList("/c");

    expect(client.requestCount).toBe(3);
  });

  it("reads x-ratelimit-remaining", async () => {
    const { fetchImpl } = stubFetch(json([], { headers: { "x-ratelimit-remaining": "4993" } }));
    const client = new GitHubClient({ token: "", fetchImpl });

    await client.getList("/a");

    expect(client.rateLimitRemaining).toBe(4993);
  });
});

describe("GitHubClient empty answers", () => {
  it("treats 202 as empty (statistics still computing)", async () => {
    const { fetchImpl } = stubFetch(new Response(null, { status: 202 }));
    const client = new GitHubClient({ token: "", fetchImpl });

    expect(await client.get("/repos/o/r/contributors")).toBeNull();
    expect(await client.getList("/repos/o/r/contributors")).toEqual([]);
  });

  it("treats 204 as empty", async () => {
    const { fetchImpl } = stubFetch(new Response(null, { status: 204 }));
    const client = new GitHubClient({ token: "", fetchImpl });

    expect(await client.getList("/repos/o/r/contributors")).toEqual([]);
  });

  it("treats a blank 200 body as empty", async () => {
    const { fetchImpl } = stubFetch(new Response("", { status: 200 }));
    const client = new GitHubClient({ token: "", fetchImpl });

    expect(await client.getList("/repos/o/r/releases")).toEqual([]);
  });

  it("collapses a non-array list body to an empty list", async () => {
    const { fetchImpl } = stubFetch(json({ message: "nope" }));
    const client = new GitHubClient({ token: "", fetchImpl });

    expect(await client.getList("/repos/o/r/releases")).toEqual([]);
  });
});

describe("GitHubClient error mapping", () => {
  const expectCode = async (response: Response, code: string): Promise<void> => {
    const { fetchImpl } = stubFetch(response);
    const client = new GitHubClient({ token: "", fetchImpl });
    await expect(client.get("/repos/o/r")).rejects.toMatchObject({ code });
  };

  it("maps 404 to NOT_FOUND", async () => {
    await expectCode(json({ message: "Not Found" }, { status: 404 }), "NOT_FOUND");
  });

  it("maps 403 with a spent quota to RATE_LIMITED", async () => {
    await expectCode(
      json({ message: "API rate limit exceeded" }, {
        status: 403,
        headers: { "x-ratelimit-remaining": "0" },
      }),
      "RATE_LIMITED",
    );
  });

  it("maps 429 to RATE_LIMITED", async () => {
    await expectCode(json({ message: "Too many requests" }, { status: 429 }), "RATE_LIMITED");
  });

  it("maps a secondary-limit 403 to RATE_LIMITED even with quota left", async () => {
    await expectCode(
      json({ message: "You have exceeded a secondary rate limit" }, {
        status: 403,
        headers: { "x-ratelimit-remaining": "3812" },
      }),
      "RATE_LIMITED",
    );
  });

  it("maps a 403 that is really 'repository too large' to UPSTREAM", async () => {
    // What torvalds/linux answers for /contributors.
    await expectCode(
      json({ message: "The history or contributor list is too large to list contributors" }, {
        status: 403,
        headers: { "x-ratelimit-remaining": "4900" },
      }),
      "UPSTREAM",
    );
  });

  it("maps 451 to NOT_FOUND", async () => {
    await expectCode(json({ message: "Repository access blocked" }, { status: 451 }), "NOT_FOUND");
  });

  it("maps 500 and 502 to UPSTREAM", async () => {
    await expectCode(json({ message: "Server Error" }, { status: 500 }), "UPSTREAM");
    await expectCode(json({ message: "Bad gateway" }, { status: 502 }), "UPSTREAM");
  });

  it("maps malformed JSON to UPSTREAM", async () => {
    const { fetchImpl } = stubFetch(new Response("{not json", { status: 200 }));
    const client = new GitHubClient({ token: "", fetchImpl });
    await expect(client.get("/repos/o/r")).rejects.toMatchObject({ code: "UPSTREAM" });
  });

  it("maps a transport failure to UPSTREAM", async () => {
    const fetchImpl = (() => Promise.reject(new TypeError("fetch failed"))) as unknown as typeof fetch;
    const client = new GitHubClient({ token: "", fetchImpl });
    await expect(client.get("/repos/o/r")).rejects.toMatchObject({ code: "UPSTREAM" });
  });

  it("times out slow endpoints with TIMEOUT", async () => {
    const fetchImpl = ((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      })) as unknown as typeof fetch;
    const client = new GitHubClient({ token: "", fetchImpl, timeoutMs: 10 });

    const error = await client.get("/repos/o/r").catch((thrown: unknown) => thrown);
    expect(error).toBeInstanceOf(GitHubError);
    expect((error as GitHubError).code).toBe("TIMEOUT");
  });

  it("reports a caller-side abort as TIMEOUT", async () => {
    const controller = new AbortController();
    const fetchImpl = ((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      })) as unknown as typeof fetch;
    const client = new GitHubClient({ token: "", fetchImpl, signal: controller.signal });

    const pending = client.get("/repos/o/r").catch((thrown: unknown) => thrown);
    controller.abort();

    expect((await pending as GitHubError).code).toBe("TIMEOUT");
  });

  it("getOptional swallows a 404 and nothing else", async () => {
    const { fetchImpl } = stubFetch(json({ message: "Not Found" }, { status: 404 }));
    const notFound = new GitHubClient({ token: "", fetchImpl });
    expect(await notFound.getOptional("/repos/o/r/readme")).toBeNull();

    const broken = new GitHubClient({
      token: "",
      fetchImpl: stubFetch(json({}, { status: 500 })).fetchImpl,
    });
    await expect(broken.getOptional("/repos/o/r/readme")).rejects.toMatchObject({
      code: "UPSTREAM",
    });
  });

  it("never puts the token into an error", async () => {
    const { fetchImpl } = stubFetch(json({ message: "Bad credentials" }, { status: 401 }));
    const client = new GitHubClient({ token: "ghp_supersecrettoken", fetchImpl });

    const error = (await client.get("/repos/o/r").catch((thrown: unknown) => thrown)) as GitHubError;
    expect(JSON.stringify({ message: error.message, stack: error.stack })).not.toContain(
      "ghp_supersecrettoken",
    );
  });
});

describe("GitHubClient timers", () => {
  it("clears the timeout timer on success", async () => {
    const clear = vi.spyOn(globalThis, "clearTimeout");
    const { fetchImpl } = stubFetch(json({ ok: true }));
    await new GitHubClient({ token: "", fetchImpl }).get("/repos/o/r");
    expect(clear).toHaveBeenCalled();
    clear.mockRestore();
  });
});
