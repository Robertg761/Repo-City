import { describe, expect, it } from "vitest";
import type { GhPull, GhTreeItem } from "@/types/github";
import { GitHubClient, REVALIDATE_SECONDS } from "./client";
import {
  DATA_CACHE_BODY_LIMIT,
  DATA_CACHE_ITEM_LIMIT,
  MEMO_TTL_MS,
  ResponseMemo,
  bodyBytesOver,
} from "./memo";
import { mapPull, slimPull } from "./pulls";
import { pruneTree, slimTree } from "./tree";

/** Records every URL and answers from `respond`. No network. */
function stubFetch(respond: (url: string) => Response): { fetchImpl: typeof fetch; urls: string[] } {
  const urls: string[] = [];
  const fetchImpl = (async (input: RequestInfo | URL) => {
    urls.push(String(input));
    return respond(String(input));
  }) as unknown as typeof fetch;
  return { fetchImpl, urls };
}

const json = (body: unknown, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json", ...headers } });

const user = (login: string) => ({
  login,
  id: 7,
  avatar_url: `https://avatars.example/${login}`,
  html_url: `https://github.com/${login}`,
  type: "User",
  // What the real API also sends and nothing reads.
  followers_url: `https://api.github.com/users/${login}/followers`,
  site_admin: false,
});

/** A list item as GitHub sends it: the head and base repositories in full. */
function rawPull(number: number, padding = 0): GhPull {
  const repo = { id: 1, full_name: "o/r", description: "x".repeat(padding) };
  return {
    number,
    title: `Change ${number}`,
    html_url: `https://github.com/o/r/pull/${number}`,
    state: "open",
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-20T00:00:00Z",
    closed_at: null,
    merged_at: null,
    draft: number % 2 === 0,
    review_comments: number % 5,
    labels: [{ id: 1, name: "bug", color: "d73a4a", description: null, url: "https://…" } as never, "plain"],
    user: user(`dev${number}`) as never,
    head: { ref: `feature/${number}`, sha: `h${number}`, repo } as never,
    base: { ref: "main", sha: "b", repo } as never,
    requested_reviewers: [user("rev") as never],
    body: "y".repeat(padding),
  } as GhPull;
}

describe("the data cache limit", () => {
  it("is 2 MB of stored JSON, which holds about 1.5 MB of base64 body", () => {
    expect(DATA_CACHE_ITEM_LIMIT).toBe(2 * 1024 * 1024);
    expect(DATA_CACHE_BODY_LIMIT).toBeGreaterThan(1_500_000);
    expect(Math.ceil(DATA_CACHE_BODY_LIMIT / 3) * 4).toBeLessThan(DATA_CACHE_ITEM_LIMIT);
  });

  it("lives as long as the data cache would have kept the answer", () => {
    expect(MEMO_TTL_MS).toBe(REVALIDATE_SECONDS * 1000);
  });

  it("measures UTF-8 bytes, not UTF-16 units", () => {
    expect(bodyBytesOver("a".repeat(DATA_CACHE_BODY_LIMIT))).toBe(false);
    expect(bodyBytesOver("a".repeat(DATA_CACHE_BODY_LIMIT + 1))).toBe(true);
    // 600,000 three-byte characters are 1.8 MB.
    expect(bodyBytesOver("€".repeat(600_000))).toBe(true);
    expect(bodyBytesOver("€".repeat(100_000))).toBe(false);
  });
});

describe("ResponseMemo", () => {
  it("answers until the entry expires", () => {
    const memo = new ResponseMemo(1000, 1_000_000);
    memo.set("k", [1, 2], "<link>", 0);
    expect(memo.get("k", 999)).toEqual({ body: [1, 2], link: "<link>" });
    expect(memo.get("k", 1000)).toBeNull();
    expect(memo.size(1000)).toBe(0);
  });

  it("evicts the oldest entries past its byte budget", () => {
    const memo = new ResponseMemo(60_000, 100);
    memo.set("a", "x".repeat(40), null, 0);
    memo.set("b", "x".repeat(40), null, 0);
    memo.set("c", "x".repeat(40), null, 0);
    expect(memo.get("a", 1)).toBeNull();
    expect(memo.get("b", 1)).not.toBeNull();
    expect(memo.get("c", 1)).not.toBeNull();
    expect(memo.byteSize()).toBeLessThanOrEqual(100);
    // Something bigger than the whole budget is never kept.
    memo.set("huge", "x".repeat(500), null, 0);
    expect(memo.get("huge", 1)).toBeNull();
    memo.clear();
    expect(memo.size(1)).toBe(0);
    expect(memo.byteSize()).toBe(0);
  });
});

describe("GitHubClient with a memo", () => {
  const page = (padding: number) => Array.from({ length: 100 }, (_, i) => rawPull(1000 - i, padding));
  const link = '<https://api.github.com/repos/o/r/pulls?page=2>; rel="next", <https://api.github.com/repos/o/r/pulls?page=4>; rel="last"';

  it("keeps an oversized page slimmed and answers the same URL from it", async () => {
    const body = page(8_000);
    expect(JSON.stringify(body).length).toBeGreaterThan(DATA_CACHE_BODY_LIMIT);
    const { fetchImpl, urls } = stubFetch(() => json(body, { link }));
    const memo = new ResponseMemo();
    const client = new GitHubClient({ token: "t", fetchImpl, memo });
    const query = { state: "open", per_page: 100 };

    const first = await client.getPage<GhPull>("/repos/o/r/pulls", { query, slim: slimPull });
    const second = await client.getPage<GhPull>("/repos/o/r/pulls", { query, slim: slimPull });

    expect(urls).toHaveLength(1);
    expect(client.requestCount).toBe(1);
    expect(client.memoHits).toBe(1);
    expect(second).toEqual(first);
    expect(second).toMatchObject({ hasNext: true, lastPage: 4 });
    // Slimmed: what is kept is a small fraction of what arrived.
    expect(memo.byteSize()).toBeLessThan(JSON.stringify(body).length / 10);
    // And maps exactly as the full answer does.
    expect(second.items.map(mapPull)).toEqual(body.map(mapPull));

    // Another page, another query or another caller's credentials are
    // different answers.
    await client.getPage<GhPull>("/repos/o/r/pulls", { query: { ...query, page: 2 }, slim: slimPull });
    const anonymous = new GitHubClient({ token: "", fetchImpl, memo });
    await anonymous.getPage<GhPull>("/repos/o/r/pulls", { query, slim: slimPull });
    expect(urls).toHaveLength(3);
  });

  it("leaves answers the data cache can hold to the data cache", async () => {
    const { fetchImpl, urls } = stubFetch(() => json(page(0), { link }));
    const memo = new ResponseMemo();
    const client = new GitHubClient({ token: "t", fetchImpl, memo });
    for (let i = 0; i < 2; i++) {
      await client.getPage<GhPull>("/repos/o/r/pulls", { query: { per_page: 100 }, slim: slimPull });
    }
    expect(urls).toHaveLength(2);
    expect(memo.size()).toBe(0);
  });

  it("memoizes nothing a caller did not opt in to", async () => {
    const { fetchImpl, urls } = stubFetch(() => json(page(8_000)));
    const memo = new ResponseMemo();
    const client = new GitHubClient({ token: "t", fetchImpl, memo });
    await client.getPage<GhPull>("/repos/o/r/pulls");
    await client.getPage<GhPull>("/repos/o/r/pulls");
    expect(urls).toHaveLength(2);
    expect(memo.size()).toBe(0);
  });

  it("keeps an oversized tree through get", async () => {
    const tree: GhTreeItem[] = Array.from({ length: 12_000 }, (_, i) => ({
      path: `src/module${i % 40}/deep/file${i}.ts`,
      mode: "100644",
      type: "blob",
      sha: "0123456789abcdef0123456789abcdef01234567",
      size: i,
      url: `https://api.github.com/repos/o/r/git/blobs/0123456789abcdef0123456789abcdef${i}`,
    }));
    const raw = { sha: "root", url: "https://…", truncated: false, tree };
    const { fetchImpl, urls } = stubFetch(() => json(raw));
    const client = new GitHubClient({ token: "t", fetchImpl, memo: new ResponseMemo() });
    const path = "/repos/o/r/git/trees/main";
    const first = await client.get("/repos/o/r/git/trees/main", { query: { recursive: "1" }, slim: slimTree });
    const second = await client.get(path, { query: { recursive: "1" }, slim: slimTree });
    expect(urls).toHaveLength(1);
    expect(second).toEqual(first);
    expect(pruneTree(second!.tree)).toEqual(pruneTree(tree));
  });

  it("has no memo by default when a test injects fetch", async () => {
    const { fetchImpl, urls } = stubFetch(() => json(page(8_000)));
    const client = new GitHubClient({ token: "t", fetchImpl });
    for (let i = 0; i < 2; i++) {
      await client.getPage<GhPull>("/repos/o/r/pulls", { query: { per_page: 100 }, slim: slimPull });
    }
    expect(urls).toHaveLength(2);
  });
});

describe("slimPull and slimTree", () => {
  it("keep every field mapPull reads", () => {
    for (const raw of [rawPull(1), rawPull(2, 50), { ...rawPull(3), comments: 9, user: null }]) {
      expect(mapPull(slimPull(raw as GhPull))).toEqual(mapPull(raw as GhPull));
    }
  });

  it("keep only the declared fields", () => {
    const slim = slimPull(rawPull(4, 100)) as unknown as Record<string, unknown>;
    expect(slim).not.toHaveProperty("body");
    expect(slim.head).toEqual({ ref: "feature/4", sha: "h4" });
    expect(slim.user).not.toHaveProperty("followers_url");
  });

  it("keep every tree entry pruneTree reads", () => {
    const tree: GhTreeItem[] = [
      { path: "src", mode: "040000", type: "tree", sha: "a" },
      { path: "src/a.ts", mode: "100644", type: "blob", sha: "b", size: 10 },
      { path: "a/b/c/d/e/f/g/h.ts", mode: "100644", type: "blob", sha: "c", size: 1 },
      { path: "node_modules/x.js", mode: "100644", type: "blob", sha: "d", size: 1 },
      { path: "vendor/lib", mode: "160000", type: "commit", sha: "e" },
    ];
    const slim = slimTree({ sha: "root", truncated: true, tree });
    expect(slim.tree[1]).toEqual({ path: "src/a.ts", type: "blob", size: 10 });
    expect(pruneTree(slim.tree, true)).toEqual(pruneTree(tree, true));
  });
});
