import { describe, expect, it } from "vitest";
import type { GhIssue } from "@/types/github";
import { BODY_EXCERPT_LENGTH, excerpt, mapIssue, mapIssues, mapLabels, pullItemStats } from "./issues";

const issue = (overrides: Partial<GhIssue> = {}): GhIssue => ({
  number: 7,
  title: "Router drops trailing slashes",
  html_url: "https://github.com/o/r/issues/7",
  state: "open",
  created_at: "2026-09-01T10:00:00Z",
  updated_at: "2026-09-18T10:00:00Z",
  closed_at: null,
  comments: 12,
  labels: [{ id: 1, name: "bug", color: "red", description: null }],
  user: { login: "ann", id: 1, avatar_url: "", html_url: "", type: "User" },
  body: "Steps to reproduce",
  ...overrides,
});

describe("mapIssue", () => {
  it("maps the fields the snapshot contract names", () => {
    expect(mapIssue(issue())).toEqual({
      number: 7,
      title: "Router drops trailing slashes",
      url: "https://github.com/o/r/issues/7",
      createdAt: "2026-09-01T10:00:00Z",
      updatedAt: "2026-09-18T10:00:00Z",
      comments: 12,
      labels: ["bug"],
      author: "ann",
      bodyExcerpt: "Steps to reproduce",
    });
  });

  it("drops pull requests, which the issues endpoint also returns", () => {
    const asPull = issue({
      pull_request: { url: "https://api.github.com/repos/o/r/pulls/7", html_url: "" },
    });
    expect(mapIssue(asPull)).toBeNull();
  });

  it("survives a ghost author and a missing body", () => {
    const mapped = mapIssue(issue({ user: null, body: null }));
    expect(mapped?.author).toBeNull();
    expect(mapped?.bodyExcerpt).toBe("");
  });

  it("reads reactions, assignees and milestone when GitHub sends them", () => {
    const person = { login: "cy", id: 3, avatar_url: "", html_url: "", type: "User" };
    const mapped = mapIssue(
      issue({ reactions: { total_count: 14 }, assignees: [person, person], milestone: { title: "v5" } }),
    );
    expect(mapped?.reactions).toBe(14);
    expect(mapped?.assignees).toBe(2);
    expect(mapped?.milestone).toBe("v5");
    expect(mapIssue(issue({ milestone: null }))?.milestone).toBeNull();
  });

  it("falls back to createdAt when updatedAt is absent", () => {
    const mapped = mapIssue(issue({ updated_at: undefined as unknown as string }));
    expect(mapped?.updatedAt).toBe("2026-09-01T10:00:00Z");
  });
});

describe("mapIssues", () => {
  it("keeps issues and only issues, in order", () => {
    const mapped = mapIssues([
      issue({ number: 1 }),
      issue({ number: 2, pull_request: { url: "", html_url: "" } }),
      issue({ number: 3 }),
    ]);
    expect(mapped.map((item) => item.number)).toEqual([1, 3]);
  });
});

describe("pullItemStats", () => {
  it("keeps the issue view of pull requests, and only those", () => {
    const stats = pullItemStats([
      issue({ number: 1 }),
      issue({ number: 2, comments: 8, reactions: { total_count: 3 }, pull_request: { url: "", html_url: "" } }),
      issue({ number: 3, comments: 1, pull_request: { url: "", html_url: "" } }),
    ]);
    expect([...stats.entries()]).toEqual([
      [2, { comments: 8, reactions: 3 }],
      [3, { comments: 1, reactions: undefined }],
    ]);
  });

  it("keeps the first sighting of a number across pages", () => {
    const stats = pullItemStats([issue({ number: 2, comments: 8, pull_request: { url: "", html_url: "" } })]);
    pullItemStats([issue({ number: 2, comments: 99, pull_request: { url: "", html_url: "" } })], stats);
    expect(stats.get(2)?.comments).toBe(8);
  });
});

describe("mapLabels", () => {
  it("handles object labels, string labels and junk", () => {
    expect(
      mapLabels([
        { id: 1, name: "bug", color: "red", description: null },
        "help wanted",
        { id: 2, name: "", color: "", description: null },
      ]),
    ).toEqual(["bug", "help wanted"]);
    expect(mapLabels(undefined)).toEqual([]);
  });
});

describe("excerpt", () => {
  it("cuts to 300 characters", () => {
    const body = "x".repeat(1000);
    expect(excerpt(body)).toHaveLength(BODY_EXCERPT_LENGTH);
  });

  it("keeps short bodies whole", () => {
    expect(excerpt("short")).toBe("short");
  });

  it("collapses every run of whitespace into one space", () => {
    expect(excerpt("a     b\n\tc")).toBe("a b c");
  });

  it("ships plain text, not markdown", () => {
    const body =
      "<!-- Thanks for filing! -->\n### Describe the bug\n\nThe **router** drops [trailing slashes](https://x.y) in `app.get()`.\n\n```js\napp.get('/a/')\n```\n\n- [ ] I searched existing issues";
    expect(excerpt(body)).toBe(
      "Describe the bug: The router drops trailing slashes in app.get(). I searched existing issues",
    );
  });

  it("answers an empty string for a missing body", () => {
    expect(excerpt(null)).toBe("");
    expect(excerpt(undefined)).toBe("");
  });
});
