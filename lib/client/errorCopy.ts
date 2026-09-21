/**
 * The user-facing error copy from PLAN.md section 60. The wording is binding:
 * every message the HUD shows for a known code comes from this table, so the
 * server can send a terse technical `message` and the UI still speaks plainly.
 *
 * Unknown codes fall back to the server's own message, and finally to a
 * neutral sentence. Repo City never blames the repository (sections 19, 24).
 */

/** Canonical codes. Server codes are normalised onto these by `errorCopyFor`. */
export const ERROR_COPY: Record<string, string> = {
  INVALID_URL: "That doesn't look like a GitHub repository.",
  NOT_FOUND: "Repository not found. Repo City only supports public repositories.",
  TOO_LARGE: "This repository is very large. The city is built from a partial survey.",
  TIMEOUT: "Survey took too long. Please try again.",
  RATE_LIMITED: "GitHub is temporarily limiting analysis. Please try again shortly.",
  AI_UNAVAILABLE:
    "Architecture interpretation unavailable. The city was generated from repository metadata.",
};

/** Codes other workstreams may plausibly emit, mapped onto the canonical ones. */
const ALIASES: Record<string, string> = {
  BAD_INPUT: "INVALID_URL",
  BAD_URL: "INVALID_URL",
  INVALID_REPO: "INVALID_URL",
  REPO_NOT_FOUND: "NOT_FOUND",
  PRIVATE: "NOT_FOUND",
  PRIVATE_REPOSITORY: "NOT_FOUND",
  REPO_TOO_LARGE: "TOO_LARGE",
  ANALYSIS_TIMEOUT: "TIMEOUT",
  RATE_LIMIT: "RATE_LIMITED",
  API_LIMIT: "RATE_LIMITED",
  SECONDARY_RATE_LIMIT: "RATE_LIMITED",
  AI_FAILED: "AI_UNAVAILABLE",
};

const FALLBACK = "The survey could not be completed. Please try again.";

export function canonicalErrorCode(code: string): string {
  const upper = code.trim().toUpperCase();
  return ALIASES[upper] ?? upper;
}

/** Plan copy for a known code, else the server's message, else the fallback. */
export function errorCopyFor(code: string, message?: string): string {
  const known = ERROR_COPY[canonicalErrorCode(code)];
  if (known) return known;
  const trimmed = message?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : FALLBACK;
}
