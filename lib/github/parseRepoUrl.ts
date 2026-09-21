/**
 * Input normalization for the single text field on the page (PLAN.md sections
 * 29 and 73).
 *
 * Accepts everything a person might paste — a full URL, a bare `owner/repo`, a
 * deep link to a file or an issue — and answers `{ owner, repo }` or `null`.
 * It never throws: the caller turns `null` into the section 60 copy for an
 * invalid URL.
 *
 * The result is only a *guess* at the canonical name. GitHub answers a renamed
 * repository with a 301, so the canonical `full_name` always comes from the
 * metadata response, never from here (PLAN.md section 29).
 */

export interface RepoRef {
  owner: string;
  repo: string;
}

/** Hosts that carry `/{owner}/{repo}` paths. Everything else is rejected. */
const ALLOWED_HOSTS = new Set(["github.com", "www.github.com"]);

/**
 * First path segments on github.com that are site features rather than
 * accounts. Without this, `github.com/settings/tokens` would parse as the
 * repository `settings/tokens`.
 */
const RESERVED_OWNERS = new Set([
  "about",
  "account",
  "apps",
  "codespaces",
  "collections",
  "contact",
  "dashboard",
  "enterprise",
  "events",
  "explore",
  "features",
  "gist",
  "issues",
  "join",
  "login",
  "logout",
  "marketplace",
  "new",
  "notifications",
  "organizations",
  "orgs",
  "pricing",
  "pulls",
  "search",
  "security",
  "sessions",
  "settings",
  "signup",
  "sponsors",
  "stars",
  "topics",
  "trending",
  "watching",
]);

/** GitHub logins: alphanumerics and single hyphens, 39 characters at most. */
const OWNER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
/** Repository names: alphanumerics plus `.`, `_` and `-`. */
const REPO_RE = /^[A-Za-z0-9._-]+$/;

/**
 * @param input anything the user typed or pasted.
 * @returns the owner and repository, or `null` when the input is not a GitHub
 * repository reference.
 */
export function parseRepoUrl(input: string): RepoRef | null {
  if (typeof input !== "string") return null;

  // Strip surrounding whitespace and the wrapping characters that survive a
  // copy out of markdown, a shell or a chat client.
  let text = input
    .trim()
    .replace(/^[<"'`(]+/, "")
    .replace(/[>"'`)]+$/, "");
  if (text === "") return null;

  // `git@github.com:owner/repo.git`
  const ssh = /^(?:ssh:\/\/)?git@([^:/]+)[:/](.+)$/i.exec(text);
  if (ssh) {
    if (!ALLOWED_HOSTS.has(ssh[1].toLowerCase())) return null;
    return fromSegments(ssh[2]);
  }

  // Drop the scheme. Anything other than http(s)/git is somebody else's
  // protocol and not a repository we can read over the REST API.
  const scheme = /^([a-z][a-z0-9+.-]*):\/\//i.exec(text);
  if (scheme) {
    const name = scheme[1].toLowerCase();
    if (name !== "http" && name !== "https" && name !== "git") return null;
    text = text.slice(scheme[0].length);
  }

  // Drop userinfo (`user@host`), the query string and the fragment.
  text = text.replace(/^[^/@]*@/, "");
  text = text.split(/[?#]/, 1)[0];
  text = text.replace(/^\/+/, "");
  if (text === "") return null;

  const firstSlash = text.indexOf("/");
  const head = firstSlash === -1 ? text : text.slice(0, firstSlash);

  // A first segment that looks like a host (it carries a dot or a port) must be
  // a host we support. `owner/repo` shorthand has no dot in its first segment,
  // so it falls through untouched.
  if (head.includes(".") || head.includes(":")) {
    const host = head.replace(/:\d+$/, "").toLowerCase();
    if (!ALLOWED_HOSTS.has(host)) return null;
    if (firstSlash === -1) return null;
    return fromSegments(text.slice(firstSlash + 1));
  }

  return fromSegments(text);
}

/** `owner/repo/tree/main/src` -> `{ owner, repo }`. */
function fromSegments(path: string): RepoRef | null {
  const segments = path.split("/").filter((segment) => segment !== "");
  if (segments.length < 2) return null;

  const owner = segments[0];
  const repo = segments[1].replace(/\.git$/i, "");

  if (!OWNER_RE.test(owner)) return null;
  if (RESERVED_OWNERS.has(owner.toLowerCase())) return null;
  if (!REPO_RE.test(repo)) return null;
  if (repo === "." || repo === "..") return null;

  return { owner, repo };
}

/** `owner/repo`: the form used for cache keys, seeds and log lines. */
export function formatRepoRef(ref: RepoRef): string {
  return `${ref.owner}/${ref.repo}`;
}
