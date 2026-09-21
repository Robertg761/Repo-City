import { describe, expect, it } from "vitest";
import type { GhIssue } from "@/types/github";
import { BODY_EXCERPT_LENGTH, excerpt, mapIssue, mapIssues, mapLabels } from "./issues";

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

  it("collapses runs of spaces and tabs but keeps line structure", () => {
    expect(excerpt("a     b\n\tc")).toBe("a b\n c");
  });

  it("answers an empty string for a missing body", () => {
    expect(excerpt(null)).toBe("");
    expect(excerpt(undefined)).toBe("");
  });
});
