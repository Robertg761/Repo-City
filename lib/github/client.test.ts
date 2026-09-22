import { describe, expect, it, vi } from "vitest";
import { GITHUB_API_BASE, GitHubClient, pageNumberOf, parseLinkHeader } from "./client";
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
    // Assembled rather than written out so the Friday secret scan in PLAN.md
    // section 31 does not trip over a test fixture shaped like a real token.
    const fakeToken = ["gh", "p", "_", "supersecrettoken"].join("");
    const { fetchImpl } = stubFetch(json({ message: "Bad credentials" }, { status: 401 }));
    const client = new GitHubClient({ token: fakeToken, fetchImpl });

    const error = (await client.get("/repos/o/r").catch((thrown: unknown) => thrown)) as GitHubError;
    expect(JSON.stringify({ message: error.message, stack: error.stack })).not.toContain(fakeToken);
  });
});

describe("parseLinkHeader and pageNumberOf (PLAN.md section 76.6)", () => {
  it("reads next and last from a page-numbered header (the pulls endpoint)", () => {
    // Verbatim shape of vercel/next.js `/pulls?state=open&per_page=1`, 2026-09-22.
    const header =
      '<https://api.github.com/repositories/70107786/pulls?state=open&per_page=1&page=2>; rel="next", ' +
      '<https://api.github.com/repositories/70107786/pulls?state=open&per_page=1&page=2462>; rel="last"';
    const links = parseLinkHeader(header);
    expect(pageNumberOf(links.next)).toBe(2);
    expect(pageNumberOf(links.last)).toBe(2462);
  });

  it("reads a cursor header that has next and no last (the issues endpoint)", () => {
    const header =
      "<https://api.github.com/repositories/180328715/issues?state=open&sort=updated&direction=desc" +
      '&per_page=100&page=2&after=Y3Vyc29yOnYyOpLPAAABoCNT1iDPAAAAATVjCjw%3D>; rel="next"';
    const links = parseLinkHeader(header);
    expect(Object.keys(links)).toEqual(["next"]);
    expect(pageNumberOf(links.next)).toBe(2);
  });

  it("reads prev and first too, and does not confuse per_page with page", () => {
    const links = parseLinkHeader(
      '<https://x/?per_page=100&page=1>; rel="first", <https://x/?page=3&per_page=100>; rel="prev"',
    );
    expect(pageNumberOf(links.first)).toBe(1);
    expect(pageNumberOf(links.prev)).toBe(3);
    expect(pageNumberOf("https://x/?per_page=100")).toBeNull();
  });

  it("answers nothing for a missing or malformed header", () => {
    expect(parseLinkHeader(null)).toEqual({});
    expect(parseLinkHeader("")).toEqual({});
    expect(parseLinkHeader("garbage, <also garbage")).toEqual({});
  });
});

describe("GitHubClient.getPage", () => {
  it("returns the items and the last page from Link", async () => {
    const { fetchImpl, calls } = stubFetch(
      json([{ n: 1 }], { headers: { link: '<https://x/?page=2>; rel="next", <https://x/?page=7>; rel="last"' } }),
    );
    const client = new GitHubClient({ token: "", fetchImpl });
    const page = await client.getPage("/repos/o/r/pulls", { query: { per_page: 100 } });
    expect(page).toEqual({ items: [{ n: 1 }], hasNext: true, lastPage: 7 });
    expect(calls[0].url).toBe(`${GITHUB_API_BASE}/repos/o/r/pulls?per_page=100`);
  });

  it("treats the requested page as last when there is no next", async () => {
    const { fetchImpl } = stubFetch(json([{ n: 1 }]));
    const page = await new GitHubClient({ token: "", fetchImpl }).getPage("/a", { query: { page: 4 } });
    expect(page).toEqual({ items: [{ n: 1 }], hasNext: false, lastPage: 4 });
  });

  it("answers lastPage null for a cursor header with only next", async () => {
    const { fetchImpl } = stubFetch(json([], { headers: { link: '<https://x/?page=2&after=abc>; rel="next"' } }));
    const page = await new GitHubClient({ token: "", fetchImpl }).getPage("/a");
    expect(page).toEqual({ items: [], hasNext: true, lastPage: null });
  });

  it("throws the mapped error for a failed page", async () => {
    const { fetchImpl } = stubFetch(json({ message: "x" }, { status: 502 }));
    await expect(new GitHubClient({ token: "", fetchImpl }).getPage("/a")).rejects.toMatchObject({
      code: "UPSTREAM",
    });
  });

  it("abandons one request on its own signal and leaves the client usable", async () => {
    const controller = new AbortController();
    const fetchImpl = ((_url: string, init: RequestInit) =>
      new Promise((resolve, reject) => {
        if (String(_url).includes("/slow")) {
          init.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        } else {
          resolve(json([{ ok: true }]));
        }
      })) as unknown as typeof fetch;
    const client = new GitHubClient({ token: "", fetchImpl });

    const pending = client.getPage("/slow", { signal: controller.signal }).catch((e: unknown) => e);
    controller.abort();
    expect(((await pending) as GitHubError).code).toBe("TIMEOUT");
    expect((await client.getPage("/fast")).items).toEqual([{ ok: true }]);
  });
});

describe("GitHubClient.graphql", () => {
  it("posts the query with the token and reads the points budget separately", async () => {
    const { fetchImpl, calls } = stubFetch(
      json({ data: { viewer: { login: "x" } } }, { headers: { "x-ratelimit-remaining": "4990" } }),
    );
    const client = new GitHubClient({ token: "t", fetchImpl });

    const result = await client.graphql<{ viewer: { login: string } }>("query { viewer { login } }", { a: 1 });

    expect(result).toEqual({ data: { viewer: { login: "x" } }, errors: [] });
    expect(calls[0].url).toBe(`${GITHUB_API_BASE}/graphql`);
    expect(calls[0].init.method).toBe("POST");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ query: "query { viewer { login } }", variables: { a: 1 } });
    expect((calls[0].init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect(calls[0].init.cache).toBe("force-cache");
    expect(client.graphqlRemaining).toBe(4990);
    expect(client.rateLimitRemaining).toBeNull();
    expect(client.graphqlCount).toBe(1);
    expect(client.requestCount).toBe(1);
    expect(client.restCount).toBe(0);
  });

  it("keeps partial data beside errors", async () => {
    const { fetchImpl } = stubFetch(
      json({ data: { repository: { p1: { number: 1 }, p2: null } }, errors: [{ message: "Could not resolve", type: "NOT_FOUND" }] }),
    );
    const result = await new GitHubClient({ token: "t", fetchImpl }).graphql("query {}");
    expect(result.data).toEqual({ repository: { p1: { number: 1 }, p2: null } });
    expect(result.errors).toHaveLength(1);
  });

  it("maps a RATE_LIMITED error body and a secondary-limit 403 to RATE_LIMITED", async () => {
    const spent = stubFetch(json({ data: null, errors: [{ message: "API rate limit exceeded", type: "RATE_LIMITED" }] }));
    await expect(new GitHubClient({ token: "t", fetchImpl: spent.fetchImpl }).graphql("q")).rejects.toMatchObject({
      code: "RATE_LIMITED",
    });

    const secondary = stubFetch(json({ message: "You have exceeded a secondary rate limit." }, { status: 403 }));
    await expect(new GitHubClient({ token: "t", fetchImpl: secondary.fetchImpl }).graphql("q")).rejects.toMatchObject({
      code: "RATE_LIMITED",
    });
  });

  it("refuses to run without a token and sends nothing", async () => {
    const { fetchImpl, calls } = stubFetch(json({}));
    await expect(new GitHubClient({ token: "", fetchImpl }).graphql("q")).rejects.toBeInstanceOf(GitHubError);
    expect(calls).toHaveLength(0);
  });

  it("maps an HTML gateway page to UPSTREAM", async () => {
    const { fetchImpl } = stubFetch(new Response("<html>502</html>", { status: 502 }));
    await expect(new GitHubClient({ token: "t", fetchImpl }).graphql("q")).rejects.toMatchObject({
      code: "UPSTREAM",
    });
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
