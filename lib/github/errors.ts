/**
 * The error vocabulary shared by the GitHub client, the snapshot orchestrator
 * and the `/api/analyze` stream (PLAN.md sections 44 and 60).
 *
 * Every failure that reaches the browser is one of these codes plus the exact
 * user-facing copy from section 60. Nothing else is ever shown; raw GitHub
 * messages stay server-side so a token or an internal URL cannot leak into the
 * HUD.
 */

export type AnalyzeErrorCode =
  | "INVALID_URL"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "TIMEOUT"
  | "UPSTREAM"
  | "TOO_LARGE";

/** Verbatim copy from PLAN.md section 60. Do not reword without the plan. */
export const ERROR_COPY: Record<AnalyzeErrorCode, string> = {
  INVALID_URL: "That doesn't look like a GitHub repository.",
  NOT_FOUND: "Repository not found. Repo City only supports public repositories.",
  RATE_LIMITED: "GitHub is temporarily limiting analysis.\nPlease try again shortly.",
  TIMEOUT: "Survey took too long. Please try again.",
  UPSTREAM: "GitHub is temporarily limiting analysis.\nPlease try again shortly.",
  TOO_LARGE: "This repository is very large. The city is built from a partial survey.",
};

/**
 * Distinct from `ERROR_COPY.RATE_LIMITED`: this one is Repo City's own per-IP
 * limit (PLAN.md section 30), not GitHub's, and waiting is the fix.
 */
export const LOCAL_RATE_LIMIT_MESSAGE =
  "You have surveyed a lot of repositories just now.\nPlease wait a few minutes and try again.";

/** Thrown by `lib/github/*`; carries the code the stream will report. */
export class GitHubError extends Error {
  readonly code: AnalyzeErrorCode;
  /** HTTP status, when the failure came from a response. */
  readonly status?: number;
  /** Where the failure happened, for server logs only. */
  readonly resource?: string;

  constructor(
    code: AnalyzeErrorCode,
    message: string,
    options: { status?: number; resource?: string; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "GitHubError";
    this.code = code;
    this.status = options.status;
    this.resource = options.resource;
  }
}

export function isGitHubError(error: unknown): error is GitHubError {
  return error instanceof GitHubError;
}

/** Maps any thrown value onto a code the stream can carry. */
export function errorCodeOf(error: unknown): AnalyzeErrorCode {
  if (isGitHubError(error)) return error.code;
  if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) {
    return "TIMEOUT";
  }
  return "UPSTREAM";
}

/** The copy a given failure should show. */
export function errorMessageOf(error: unknown): string {
  return ERROR_COPY[errorCodeOf(error)];
}

/** Plain-language reason per code, for warnings a visitor may end up reading. */
const WARNING_REASON: Record<AnalyzeErrorCode, string> = {
  INVALID_URL: "not a repository",
  NOT_FOUND: "not available for this repository",
  RATE_LIMITED: "GitHub rate limit",
  TIMEOUT: "timed out",
  UPSTREAM: "GitHub error",
  TOO_LARGE: "too large to survey",
};

/**
 * A short, secret-free description of a degraded signal for `warnings[]`.
 *
 * Nothing from the upstream body is used: GitHub error payloads never carry
 * the token, but they do carry the full request URL, and these strings travel
 * to the browser inside `RepoAnalysis`.
 */
export function warningFor(resource: string, error: unknown): string {
  return `Could not load ${resource} (${WARNING_REASON[errorCodeOf(error)]}).`;
}
