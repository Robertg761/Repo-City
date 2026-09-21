import { describe, expect, it } from "vitest";
import { GitHubClient } from "./client";
import { type StageEvent, fetchSnapshot } from "./snapshot";

/**
 * A fake api.github.com. Routes are matched by substring in registration
 * order, so a test can override one endpoint and leave the rest healthy. No
 * network is ever touched.
 */
type Route = [match: string | RegExp, respond: () => Response];

const ok = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

const fail = (status: number, message = "boom"): Response =>
  new Response(JSON.stringify({ message }), { status });

const base64 = (text: string): string => Buffer.from(text, "utf8").toString("base64");

const repoBody = (fullName = "honojs/hono"): unknown => ({
  id: 1,
  name: fullName.split("/")[1],
  full_name: fullName,
  html_url: `https://github.com/${fullName}`,
  description: "Web framework",
  default_branch: "main",
  stargazers_count: 25000,
  forks_count: 600,
  open_issues_count: 40,
  archived: false,
  disabled: false,
  fork: false,
  created_at: "2021-12-01T00:00:00Z",
  updated_at: "2026-09-20T00:00:00Z",
  pushed_at: "2026-09-20T00:00:00Z",
  size: 900,
  language: "TypeScript",
  topics: ["http"],
  owner: { login: fullName.split("/")[0], id: 2, avatar_url: "", html_url: "", type: "Organization" },
  license: { key: "mit", name: "MIT License", spdx_id: "MIT" },
});

const defaultRoutes = (): Route[] => [
  ["/git/trees/", () => ok({
    sha: "treesha",
    url: "",
    truncated: false,
    tree: [
      { path: "src", mode: "040000", type: "tree", sha: "a" },
      { path: "src/index.ts", mode: "100644", type: "blob", sha: "b", size: 400 },
      { path: "package.json", mode: "100644", type: "blob", sha: "c", size: 300 },
      { path: "node_modules/dep/index.js", mode: "100644", type: "blob", sha: "d", size: 10 },
    ],
  })],
  ["/commits", () => ok([
    {
      sha: "headsha",
      html_url: "",
      commit: { message: "fix: router\n\nbody", author: { name: "Ann", email: "", date: "2026-09-20T00:00:00Z" }, committer: null },
      author: { login: "ann", id: 1, avatar_url: "", html_url: "", type: "User" },
      committer: null,
    },
  ])],
  ["/issues", () => ok([
    { number: 1, title: "Bug", html_url: "", state: "open", created_at: "", updated_at: "", closed_at: null, comments: 4, labels: [], user: null, body: "b" },
    { number: 2, title: "Actually a PR", html_url: "", state: "open", created_at: "", updated_at: "", closed_at: null, comments: 0, labels: [], user: null, body: null, pull_request: { url: "", html_url: "" } },
  ])],
  ["/pulls?state=open", () => ok([
    { number: 10, title: "Feature", html_url: "", state: "open", created_at: "", updated_at: "", closed_at: null, merged_at: null, draft: false, labels: [], user: null, head: { ref: "f", sha: "" }, base: { ref: "main", sha: "" } },
  ])],
  ["/pulls?state=closed", () => ok([
    { number: 9, title: "Merged", html_url: "", state: "closed", created_at: "", updated_at: "", closed_at: "", merged_at: "2026-09-19T00:00:00Z", draft: false, labels: [], user: null, head: { ref: "g", sha: "" }, base: { ref: "main", sha: "" } },
  ])],
  ["/contributors", () => ok([{ login: "ann", id: 1, type: "User", contributions: 300 }])],
  ["/actions/workflows", () => ok({ total_count: 1, workflows: [{ id: 5, name: "CI", path: ".github/workflows/ci.yml", state: "active", html_url: "" }] })],
  ["/actions/runs", () => ok({ total_count: 1, workflow_runs: [{ id: 99, name: "CI", workflow_id: 5, head_branch: "main", head_sha: "", status: "completed", conclusion: "success", created_at: "2026-09-20T00:00:00Z", updated_at: "", html_url: "", event: "push" }] })],
  ["/releases", () => ok([{ id: 1, tag_name: "v4.0.0", name: "v4", draft: false, prerelease: false, created_at: "", published_at: "2026-09-01T00:00:00Z", html_url: "" }])],
  ["/readme", () => ok({ type: "file", name: "README.md", path: "README.md", sha: "", size: 20, html_url: "", download_url: null, content: base64("# Hono\n"), encoding: "base64" })],
  ["/contents/package.json", () => ok({ type: "file", name: "package.json", path: "package.json", sha: "", size: 20, html_url: "", download_url: null, content: base64('{"name":"hono"}'), encoding: "base64" })],
  // Least specific last: bare metadata.
  ["/repos/", () => ok(repoBody())],
];

function fakeGitHub(overrides: Route[] = []): {
  client: GitHubClient;
  urls: string[];
  events: StageEvent[];
} {
  const routes = [...overrides, ...defaultRoutes()];
  const urls: string[] = [];

  const fetchImpl = (async (input: RequestInfo | URL) => {
    const url = String(input);
    urls.push(url);
    const route = routes.find(([match]) =>
      typeof match === "string" ? url.includes(match) : match.test(url),
    );
    return route ? route[1]() : fail(404, "no route");
  }) as unknown as typeof fetch;

  return { client: new GitHubClient({ token: "", fetchImpl }), urls, events: [] };
}

describe("fetchSnapshot", () => {
  it("maps every signal and stays inside the request budget", async () => {
    const { client, urls, events } = fakeGitHub();

    const snapshot = await fetchSnapshot("honojs", "hono", {
      client,
      onStage: (event) => events.push(event),
    });

    expect(snapshot.repo.fullName).toBe("honojs/hono");
    expect(snapshot.repo.defaultBranch).toBe("main");
    expect(snapshot.repo.license).toBe("MIT");
    expect(snapshot.repo.headSha).toBe("headsha");
    // Pruned: node_modules is gone.
    expect(snapshot.tree.entries.map((entry) => entry.path)).toEqual([
      "src",
      "src/index.ts",
      "package.json",
    ]);
    expect(snapshot.issues.map((issue) => issue.number)).toEqual([1]);
    expect(snapshot.pulls.map((pull) => [pull.number, pull.state])).toEqual([
      [10, "open"],
      [9, "merged"],
    ]);
    expect(snapshot.contributors).toEqual([{ login: "ann", contributions: 300 }]);
    expect(snapshot.workflows).toHaveLength(1);
    expect(snapshot.workflowRuns).toHaveLength(1);
    expect(snapshot.releases[0].tag).toBe("v4.0.0");
    expect(snapshot.files.map((file) => file.path)).toEqual(["README.md", "package.json"]);
    expect(snapshot.warnings).toEqual([]);

    // PLAN.md section 30: 10 to 20 requests per uncached analysis.
    expect(snapshot.requestCount).toBe(urls.length);
    expect(snapshot.requestCount).toBeLessThanOrEqual(15);
    expect(snapshot.requestCount).toBeGreaterThanOrEqual(10);
  });

  it("fetches metadata first, then everything else in parallel", async () => {
    const { client, urls } = fakeGitHub();
    await fetchSnapshot("honojs", "hono", { client });

    expect(urls[0]).toBe("https://api.github.com/repos/honojs/hono");
  });

  it("emits a running and a terminal event for every stage", async () => {
    const { client, events } = fakeGitHub();
    await fetchSnapshot("honojs", "hono", { client, onStage: (event) => events.push(event) });

    for (const id of ["discover", "tree", "issues", "pulls", "ci", "activity"] as const) {
      const forStage = events.filter((event) => event.id === id);
      expect(forStage.map((event) => event.status)).toEqual(["running", "done"]);
    }

    const treeDone = events.find((event) => event.id === "tree" && event.status === "done");
    expect(treeDone?.detail).toBe("2 files mapped");
    const issuesDone = events.find((event) => event.id === "issues" && event.status === "done");
    expect(issuesDone?.detail).toBe("1 issue inspected");
  });

  it("uses the canonical name from a redirected repository, and says so", async () => {
    const { client } = fakeGitHub([[/\/repos\/facebook\/react$/, () => ok(repoBody("react/react"))]]);

    const snapshot = await fetchSnapshot("facebook", "react", { client });

    expect(snapshot.repo.fullName).toBe("react/react");
    expect(snapshot.repo.owner).toBe("react");
    expect(snapshot.warnings.join(" ")).toContain("facebook/react now redirects to react/react");
  });

  it("degrades a failed signal into a warning and a failed stage", async () => {
    const { client, events } = fakeGitHub([["/issues", () => fail(500)]]);

    const snapshot = await fetchSnapshot("honojs", "hono", {
      client,
      onStage: (event) => events.push(event),
    });

    expect(snapshot.issues).toEqual([]);
    expect(snapshot.warnings.join(" ")).toContain("issues unavailable (UPSTREAM)");
    expect(events.find((event) => event.id === "issues" && event.status === "failed")).toBeTruthy();
    // The rest of the city is untouched.
    expect(snapshot.pulls).toHaveLength(2);
    expect(snapshot.commits).toHaveLength(1);
  });

  it("survives losing every optional signal at once", async () => {
    const { client } = fakeGitHub([
      ["/issues", () => fail(500)],
      ["/pulls", () => fail(500)],
      ["/contributors", () => fail(403, "too large")],
      ["/actions/", () => fail(500)],
      ["/releases", () => fail(500)],
      ["/commits", () => fail(500)],
      ["/readme", () => fail(404)],
      ["/contents/", () => fail(404)],
    ]);

    const snapshot = await fetchSnapshot("honojs", "hono", { client });

    expect(snapshot.tree.entries.length).toBe(3);
    expect(snapshot.issues).toEqual([]);
    expect(snapshot.files).toEqual([]);
    // With no commits, the seed falls back to the tree SHA rather than empty.
    expect(snapshot.repo.headSha).toBe("treesha");
    expect(snapshot.warnings.length).toBeGreaterThanOrEqual(6);
  });

  it("treats 202 and 204 from contributors and Actions as empty", async () => {
    const { client } = fakeGitHub([
      ["/contributors", () => new Response(null, { status: 202 })],
      ["/actions/workflows", () => new Response(null, { status: 204 })],
    ]);

    const snapshot = await fetchSnapshot("honojs", "hono", { client });

    expect(snapshot.contributors).toEqual([]);
    expect(snapshot.workflows).toEqual([]);
    expect(snapshot.warnings).toEqual([]);
  });

  it("is fatal when metadata fails", async () => {
    const { client, events } = fakeGitHub([[/\/repos\/nope\/nope$/, () => fail(404, "Not Found")]]);

    await expect(
      fetchSnapshot("nope", "nope", { client, onStage: (event) => events.push(event) }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(events.at(-1)).toMatchObject({ id: "discover", status: "failed" });
  });

  it("is fatal when the tree fails", async () => {
    const { client, events } = fakeGitHub([["/git/trees/", () => fail(500)]]);

    await expect(
      fetchSnapshot("honojs", "hono", { client, onStage: (event) => events.push(event) }),
    ).rejects.toMatchObject({ code: "UPSTREAM" });
    expect(events.find((event) => event.id === "tree" && event.status === "failed")).toBeTruthy();
  });

  it("warns with the section 60 copy when the tree is truncated", async () => {
    const { client } = fakeGitHub([
      ["/git/trees/", () => ok({
        sha: "treesha",
        url: "",
        truncated: true,
        tree: [{ path: "src/index.ts", mode: "100644", type: "blob", sha: "b", size: 10 }],
      })],
    ]);

    const snapshot = await fetchSnapshot("torvalds", "linux", { client });

    expect(snapshot.tree.truncated).toBe(true);
    expect(snapshot.warnings).toContain(
      "This repository is very large. The city is built from a partial survey.",
    );
  });

  it("marks an archived repository in the discover detail", async () => {
    const { client, events } = fakeGitHub([
      [/\/repos\/atom\/atom$/, () => ok({ ...(repoBody("atom/atom") as object), archived: true })],
    ]);

    const snapshot = await fetchSnapshot("atom", "atom", {
      client,
      onStage: (event) => events.push(event),
    });

    expect(snapshot.repo.archived).toBe(true);
    expect(events.find((event) => event.id === "discover" && event.status === "done")?.detail).toBe(
      "atom/atom (archived)",
    );
  });

  it("does not let a throwing stage listener break the survey", async () => {
    const { client } = fakeGitHub();
    const snapshot = await fetchSnapshot("honojs", "hono", {
      client,
      onStage: () => {
        throw new Error("listener exploded");
      },
    });
    expect(snapshot.repo.fullName).toBe("honojs/hono");
  });
});
