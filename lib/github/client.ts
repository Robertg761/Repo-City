/**
 * The only place in Repo City that talks to api.github.com (PLAN.md sections
 * 29, 30 and 31).
 *
 * Responsibilities, all of them small:
 *
 * - headers: `Accept: application/vnd.github+json` and the pinned API version
 * - auth: `Authorization: Bearer $GITHUB_TOKEN` when the server has a token,
 *   and a working unauthenticated path (60 requests/hour) when it does not
 * - caching: `next: { revalidate: 600 }` on every request so repeated repos
 *   dedupe across serverless instances (section 30)
 * - budget: a request counter, surfaced as `RepositorySnapshot.requestCount`
 * - failure: raw statuses mapped onto the `GitHubError` codes the stream knows
 * - time: a 12 second per-request timeout via `AbortController`
 *
 * Renamed or transferred repositories answer 301 to `/repositories/{id}`.
 * `fetch` follows that by default; callers must then take the canonical
 * `full_name` out of the body instead of trusting the requested path.
 *
 * The token is read from the environment here and never logged, never
 * returned, and never put into an error message.
 */

import { GitHubError } from "./errors.ts";

export const GITHUB_API_BASE = "https://api.github.com";
/** PLAN.md section 30: platform-level dedupe window, in seconds. */
export const REVALIDATE_SECONDS = 600;
/** PLAN.md section 29: one slow endpoint must not eat the 60 s budget. */
export const REQUEST_TIMEOUT_MS = 12_000;

export interface GitHubClientOptions {
  /** Defaults to `process.env.GITHUB_TOKEN`. Pass `""` to force anonymous. */
  token?: string;
  /** Caller-level abort (request cancelled, overall deadline reached). */
  signal?: AbortSignal;
  /** Injection seam for tests; never set in production code. */
  fetchImpl?: typeof fetch;
  baseUrl?: string;
  timeoutMs?: number;
}

export interface RequestOptions {
  /** Human label used in warnings and stage details, e.g. `"issues"`. */
  resource?: string;
  /** Query parameters; `undefined` values are dropped. */
  query?: Record<string, string | number | undefined>;
}

export class GitHubClient {
  /** Requests actually issued, cache hits included (PLAN.md section 30). */
  requestCount = 0;
  /** Last seen `x-ratelimit-remaining`, or null when GitHub did not say. */
  rateLimitRemaining: number | null = null;

  private readonly token: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly signal?: AbortSignal;
  private readonly fetchImpl: typeof fetch;

  constructor(options: GitHubClientOptions = {}) {
    this.token = options.token ?? process.env.GITHUB_TOKEN ?? "";
    this.baseUrl = (options.baseUrl ?? GITHUB_API_BASE).replace(/\/+$/, "");
    this.timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
    this.signal = options.signal;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
  }

  get authenticated(): boolean {
    return this.token !== "";
  }

  /**
   * GET a JSON resource. Throws `GitHubError` for every non-2xx status.
   *
   * @returns the parsed body, or `null` for the empty 202/204 answers GitHub
   * gives for statistics-backed endpoints on new or very large repositories.
   */
  async get<T>(path: string, options: RequestOptions = {}): Promise<T | null> {
    const resource = options.resource ?? path;
    const response = await this.fetchRaw(path, options);

    if (!response.ok) {
      throw await this.mapError(response, resource);
    }

    // 202 (computing) and 204 (no content) carry no body: PLAN.md section 29
    // says treat them as empty rather than as failures.
    if (response.status === 202 || response.status === 204) {
      return null;
    }

    const text = await response.text();
    if (text.trim() === "") return null;

    try {
      return JSON.parse(text) as T;
    } catch (cause) {
      throw new GitHubError("UPSTREAM", `Malformed JSON from ${resource}`, {
        status: response.status,
        resource,
        cause,
      });
    }
  }

  /**
   * GET a list resource. Empty and non-array bodies collapse to `[]` so one
   * odd endpoint degrades a single signal instead of the whole analysis.
   */
  async getList<T>(path: string, options: RequestOptions = {}): Promise<T[]> {
    const body = await this.get<T[]>(path, options);
    return Array.isArray(body) ? body : [];
  }

  /** As `get`, but a 404 answers `null` instead of throwing (optional data). */
  async getOptional<T>(path: string, options: RequestOptions = {}): Promise<T | null> {
    try {
      return await this.get<T>(path, options);
    } catch (error) {
      if (error instanceof GitHubError && error.code === "NOT_FOUND") return null;
      throw error;
    }
  }

  /** The raw response, for callers that need `response.url` or headers. */
  async fetchRaw(path: string, options: RequestOptions = {}): Promise<Response> {
    const url = this.buildUrl(path, options.query);
    const resource = options.resource ?? path;

    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), this.timeoutMs);
    const signal = mergeSignals(timeout.signal, this.signal);

    this.requestCount += 1;
    try {
      const response = await this.fetchImpl(url, {
        method: "GET",
        headers: this.headers(),
        redirect: "follow",
        signal,
        // Next.js data cache (PLAN.md section 30). Plain Node ignores it, so
        // `scripts/snapshot.ts` works with the same client.
        cache: "force-cache",
        next: { revalidate: REVALIDATE_SECONDS },
      });
      this.readRateLimit(response);
      return response;
    } catch (cause) {
      if (timeout.signal.aborted) {
        throw new GitHubError("TIMEOUT", `${resource} timed out after ${this.timeoutMs} ms`, {
          resource,
          cause,
        });
      }
      if (this.signal?.aborted) {
        throw new GitHubError("TIMEOUT", `${resource} cancelled`, { resource, cause });
      }
      throw new GitHubError("UPSTREAM", `${resource} request failed`, { resource, cause });
    } finally {
      clearTimeout(timer);
    }
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "repo-city",
    };
    if (this.token !== "") {
      headers.Authorization = `Bearer ${this.token}`;
    }
    return headers;
  }

  private buildUrl(path: string, query?: RequestOptions["query"]): string {
    const url = /^https?:\/\//i.test(path) ? path : `${this.baseUrl}${path}`;
    if (!query) return url;

    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) params.set(key, String(value));
    }
    const qs = params.toString();
    if (qs === "") return url;
    return url.includes("?") ? `${url}&${qs}` : `${url}?${qs}`;
  }

  private readRateLimit(response: Response): void {
    const remaining = response.headers?.get?.("x-ratelimit-remaining");
    if (remaining !== null && remaining !== undefined && remaining !== "") {
      const parsed = Number(remaining);
      this.rateLimitRemaining = Number.isFinite(parsed) ? parsed : null;
    }
  }

  /** Status -> `GitHubError`, per the gotchas in PLAN.md section 29. */
  private async mapError(response: Response, resource: string): Promise<GitHubError> {
    const status = response.status;
    const remaining = response.headers?.get?.("x-ratelimit-remaining");

    if (status === 404) {
      return new GitHubError("NOT_FOUND", `${resource} not found`, { status, resource });
    }

    if (status === 403 || status === 429) {
      // A 403 means three different things: a spent quota, a secondary limit,
      // or "this repository is too big for this endpoint" — which is what
      // `torvalds/linux` answers for contributors. Only the first two are
      // worth telling the user to wait; the third degrades one signal.
      const body = await safeText(response);
      const looksRateLimited =
        remaining === "0" || status === 429 || /rate limit|secondary|abuse/i.test(body);
      if (looksRateLimited) {
        return new GitHubError("RATE_LIMITED", `${resource} rate limited`, { status, resource });
      }
      return new GitHubError("UPSTREAM", `${resource} refused (403)`, { status, resource });
    }

    if (status === 451) {
      return new GitHubError("NOT_FOUND", `${resource} unavailable for legal reasons`, {
        status,
        resource,
      });
    }

    return new GitHubError("UPSTREAM", `${resource} failed with ${status}`, { status, resource });
  }
}

/** Error bodies are for classification and server logs only, never for the UI. */
async function safeText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

/** `AbortSignal.any` where available, with a listener fallback for older runtimes. */
function mergeSignals(primary: AbortSignal, secondary?: AbortSignal): AbortSignal {
  if (!secondary) return primary;
  if (typeof AbortSignal.any === "function") return AbortSignal.any([primary, secondary]);

  const controller = new AbortController();
  const abort = (): void => controller.abort();
  if (primary.aborted || secondary.aborted) controller.abort();
  primary.addEventListener("abort", abort, { once: true });
  secondary.addEventListener("abort", abort, { once: true });
  return controller.signal;
}
