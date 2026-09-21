/**
 * A client-side sanity check on what the user typed, so an obvious typo never
 * costs an API round trip (PLAN.md section 60, "Invalid GitHub URL").
 *
 * This is deliberately NOT the authoritative parser: `lib/github` (W2) owns
 * `parseRepoUrl` and the server re-validates every request. Keep this one
 * permissive enough that anything the server accepts passes here too.
 */

export interface ParsedRepoInput {
  owner: string;
  name: string;
  /** `owner/name`, which is what the HUD shows while the survey runs. */
  fullName: string;
}

/** GitHub's own rules, loosely: no leading dot, no spaces, no path separators. */
const SEGMENT = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9_-])?$/;

/** Paths that follow `owner/repo` on github.com and are safe to ignore. */
const TRAILING_PATHS = new Set([
  "tree",
  "blob",
  "issues",
  "pulls",
  "pull",
  "commits",
  "actions",
  "releases",
  "wiki",
  "discussions",
  "settings",
]);

/**
 * Accepts `owner/repo`, `github.com/owner/repo`, `https://github.com/owner/repo`,
 * `git@github.com:owner/repo.git`, tree/blob deep links and trailing slashes.
 * Returns null for anything that is not recognisably a GitHub repository.
 */
export function parseRepoInput(raw: string): ParsedRepoInput | null {
  let value = raw.trim();
  if (value.length === 0 || /\s/.test(value)) return null;

  value = value.replace(/^git\+/, "");

  const scheme = value.match(/^([A-Za-z][A-Za-z0-9+.-]*):\/\//);
  if (scheme) {
    if (!/^https?$/i.test(scheme[1])) return null; // ftp://, file://, ...
    value = value.slice(scheme[0].length);
  }

  value = value.replace(/^git@github\.com:/i, "github.com/");
  value = value.replace(/^www\./i, "");

  // A host is only acceptable when it is GitHub itself.
  const hostMatch = value.match(/^([^/]+\.[^/]+)\//);
  if (hostMatch && hostMatch[1].toLowerCase() !== "github.com") return null;
  if (hostMatch) value = value.slice(hostMatch[0].length);

  value = value.replace(/[?#].*$/, "");
  value = value.replace(/\/+$/, "");

  const segments = value.split("/").filter((segment) => segment.length > 0);
  if (segments.length < 2) return null;
  if (segments.length > 2 && !TRAILING_PATHS.has(segments[2].toLowerCase())) return null;

  const owner = segments[0];
  const name = segments[1].replace(/\.git$/i, "");
  if (!SEGMENT.test(owner) || !SEGMENT.test(name)) return null;

  return { owner, name, fullName: `${owner}/${name}` };
}
