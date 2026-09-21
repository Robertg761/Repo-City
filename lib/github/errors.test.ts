import { describe, expect, it } from "vitest";
import {
  ERROR_COPY,
  GitHubError,
  LOCAL_RATE_LIMIT_MESSAGE,
  errorCodeOf,
  errorMessageOf,
  isGitHubError,
  warningFor,
} from "./errors";

describe("ERROR_COPY", () => {
  it("is the copy from PLAN.md section 60, verbatim", () => {
    expect(ERROR_COPY.INVALID_URL).toBe("That doesn't look like a GitHub repository.");
    expect(ERROR_COPY.NOT_FOUND).toBe(
      "Repository not found. Repo City only supports public repositories.",
    );
    expect(ERROR_COPY.TOO_LARGE).toBe(
      "This repository is very large. The city is built from a partial survey.",
    );
    expect(ERROR_COPY.TIMEOUT).toBe("Survey took too long. Please try again.");
    expect(ERROR_COPY.RATE_LIMITED).toBe(
      "GitHub is temporarily limiting analysis.\nPlease try again shortly.",
    );
  });

  it("keeps Repo City's own limit message distinct from GitHub's", () => {
    expect(LOCAL_RATE_LIMIT_MESSAGE).not.toBe(ERROR_COPY.RATE_LIMITED);
  });
});

describe("errorCodeOf", () => {
  it("passes a GitHubError code through", () => {
    expect(errorCodeOf(new GitHubError("NOT_FOUND", "x"))).toBe("NOT_FOUND");
  });

  it("reads an abort as a timeout", () => {
    const aborted = new Error("aborted");
    aborted.name = "AbortError";
    expect(errorCodeOf(aborted)).toBe("TIMEOUT");

    const timedOut = new Error("timed out");
    timedOut.name = "TimeoutError";
    expect(errorCodeOf(timedOut)).toBe("TIMEOUT");
  });

  it("closes over everything else as UPSTREAM", () => {
    expect(errorCodeOf(new Error("who knows"))).toBe("UPSTREAM");
    expect(errorCodeOf("a string")).toBe("UPSTREAM");
    expect(errorCodeOf(undefined)).toBe("UPSTREAM");
  });
});

describe("errorMessageOf", () => {
  it("always answers user-facing copy, never the internal message", () => {
    const error = new GitHubError("NOT_FOUND", "repos/o/r 404 with token abc");
    expect(errorMessageOf(error)).toBe(ERROR_COPY.NOT_FOUND);
  });
});

describe("isGitHubError", () => {
  it("recognizes its own errors only", () => {
    expect(isGitHubError(new GitHubError("UPSTREAM", "x"))).toBe(true);
    expect(isGitHubError(new Error("x"))).toBe(false);
  });

  it("keeps the status and resource for server-side debugging", () => {
    const error = new GitHubError("UPSTREAM", "x", { status: 502, resource: "issues" });
    expect(error.status).toBe(502);
    expect(error.resource).toBe("issues");
  });
});

describe("warningFor", () => {
  it("names the signal and the reason in plain language", () => {
    expect(warningFor("contributors", new GitHubError("UPSTREAM", "boom"))).toBe(
      "Could not load contributors (GitHub error).",
    );
    expect(warningFor("pull requests", new GitHubError("NOT_FOUND", "boom"))).toBe(
      "Could not load pull requests (not available for this repository).",
    );
    expect(warningFor("issues", new GitHubError("RATE_LIMITED", "boom"))).toBe(
      "Could not load issues (GitHub rate limit).",
    );
  });

  it("never leaks the upstream message, which can hold a request URL", () => {
    const leaky = new GitHubError("UPSTREAM", "https://api.github.com/repos/o/r?token=secret");
    expect(warningFor("releases", leaky)).not.toContain("api.github.com");
  });
});
