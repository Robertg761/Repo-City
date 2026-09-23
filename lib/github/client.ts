/**
 * The only place in Repo City that talks to api.github.com (PLAN.md sections
 * 29, 30, 31 and 76.6).
 *
 * Responsibilities, all of them small:
 *
 * - headers: `Accept: application/vnd.github+json` and the pinned API version
 * - auth: `Authorization: Bearer $GITHUB_TOKEN` when the server has a token,
 *   and a working unauthenticated path (60 requests/hour) when it does not
 * - caching: `next: { revalidate: 600 }` on every request so repeated repos
 *   dedupe across serverless instances (section 30), and, for answers too
 *   large for the data cache, a slimmed copy in the per-process `memo.ts`
 * - budget: request counters, surfaced as `RepositorySnapshot.requestCount`,
 *   and the REST and GraphQL `x-ratelimit-remaining` read separately
 * - failure: raw statuses mapped onto the `GitHubError` codes the stream knows
 * - time: a 12 second per-request timeout via `AbortController`, plus an
 *   optional per-request signal so one page can be abandoned at a deadline
 *   without aborting the whole survey
 * - pagination: `getPage` reads the `Link` header; `graphql` posts a query
 *
 * Renamed or transferred repositories answer 301 to `/repositories/{id}`.
 * `fetch` follows that by default; callers must then take the canonical
 * `full_name` out of the body instead of trusting the requested path.
 *
 * The token is read from the environment here and never logged, never
 * returned, and never put into an error message.
 */

import { GitHubError } from "./errors.ts";
import { ResponseMemo, bodyBytesOver, sharedResponseMemo } from "./memo.ts";

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
  /**
   * Where answers too large for the data cache are kept (`memo.ts`). Defaults
   * to the process-wide memo, except with an injected `fetchImpl`, where it
   * defaults to none so one test's fake answers never reach another's.
   */
  memo?: ResponseMemo | null;
}

export interface RequestOptions {
  /** Human label used in warnings and stage details, e.g. `"issues"`. */
  resource?: string;
  /** Query parameters; `undefined` values are dropped. */
  query?: Record<string, string | number | undefined>;
  /**
   * Abandons this one request (a page deadline, PLAN.md section 76.6) without
   * touching the client-wide signal, so the rest of the survey carries on.
   */
  signal?: AbortSignal;
}

/**
 * Opt-in for `memo.ts`: when the answer is too large for the data cache, keep
 * `slim(body)` (for a page, `slim(item)` per item) and answer the same URL from
 * it until it expires. `slim` must keep every field the caller reads.
 */
export interface MemoOptions<T> {
  slim?: (value: T) => T;
}

/** One page of a list resource plus what its `Link` header says about the rest. */
export interface Page<T> {
  items: T[];
  /**
   * The page number of `rel="last"`, or the requested page itself when there
   * is no `rel="next"` (this is the last page). `null` when there is a next
   * page but no `last`: the issues endpoint paginates by cursor and only ever
   * sends `next`.
   */
  lastPage: number | null;
  /** True when the `Link` header names a next page. */
  hasNext: boolean;
}

/** GraphQL answers `{ data, errors }`; partial data beside errors is normal. */
export interface GraphQLResponse<T> {
  data: T | null;
  errors: { message: string; type?: string; path?: (string | number)[] }[];
}

interface SendInit {
  method: "GET" | "POST";
  body?: string;
  contentType?: string;
  graphql?: boolean;
}

export class GitHubClient {
  /**
   * Requests actually issued, data-cache hits included (PLAN.md section 30).
   * REST and GraphQL. An answer served from the memo issues no request.
   */
  requestCount = 0;
  /** Answers served from the memo without a request. */
  memoHits = 0;
  /** GraphQL queries among `requestCount` (PLAN.md section 76.6). */
  graphqlCount = 0;
  /** Last seen REST `x-ratelimit-remaining`, or null when GitHub did not say. */
  rateLimitRemaining: number | null = null;
  /** Last seen GraphQL `x-ratelimit-remaining`, in points: a separate budget from REST. */
  graphqlRemaining: number | null = null;

  private readonly token: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly signal?: AbortSignal;
  private readonly fetchImpl: typeof fetch;
  private readonly memo: ResponseMemo | null;

  constructor(options: GitHubClientOptions = {}) {
    this.token = options.token ?? process.env.GITHUB_TOKEN ?? "";
    this.baseUrl = (options.baseUrl ?? GITHUB_API_BASE).replace(/\/+$/, "");
    this.timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
    this.signal = options.signal;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.memo =
      options.memo !== undefined ? options.memo : options.fetchImpl ? null : sharedResponseMemo;
  }

  get authenticated(): boolean {
    return this.token !== "";
  }

  /** REST requests among `requestCount`. */
  get restCount(): number {
    return this.requestCount - this.graphqlCount;
  }

  /**
   * GET a JSON resource. Throws `GitHubError` for every non-2xx status.
   *
   * @returns the parsed body, or `null` for the empty 202/204 answers GitHub
   * gives for statistics-backed endpoints on new or very large repositories.
   */
  async get<T>(path: string, options: RequestOptions & MemoOptions<T> = {}): Promise<T | null> {
    const { slim } = options;
    const key = slim ? this.memoKey(path, options.query) : null;
    const hit = key ? this.recall(key) : null;
    if (hit) return hit.body as T | null;

    const resource = options.resource ?? path;
    const response = await this.fetchRaw(path, options);
    const { body, oversized } = await this.readJsonSized<T>(response, resource);
    if (key && slim && oversized && body !== null) {
      const slimmed = slim(body);
      this.memo?.set(key, slimmed, null);
      return slimmed;
    }
    return body;
  }

  /**
   * GET a list resource. Empty and non-array bodies collapse to `[]` so one
   * odd endpoint degrades a single signal instead of the whole analysis.
   */
  async getList<T>(path: string, options: RequestOptions = {}): Promise<T[]> {
    const body = await this.get<T[]>(path, options);
    return Array.isArray(body) ? body : [];
  }

  /**
   * GET one page of a list resource and read its `Link` header, so callers can
   * plan the remaining pages and fetch them in parallel by page number
   * (PLAN.md section 76.6).
   */
  async getPage<T>(path: string, options: RequestOptions & MemoOptions<T> = {}): Promise<Page<T>> {
    const { slim } = options;
    const requested = Number(options.query?.page ?? 1);
    const current = Number.isFinite(requested) && requested >= 1 ? requested : 1;
    const key = slim ? this.memoKey(path, options.query) : null;
    const hit = key ? this.recall(key) : null;
    // A copy of the list, so no caller can change what the next one is given.
    if (hit) return pageOf([...(hit.body as T[])], hit.link, current);

    const resource = options.resource ?? path;
    const response = await this.fetchRaw(path, options);
    const { body, oversized } = await this.readJsonSized<T[]>(response, resource);
    let items = Array.isArray(body) ? body : [];
    const link = response.headers?.get?.("link") ?? null;
    if (key && slim && oversized) {
      items = items.map(slim);
      this.memo?.set(key, items, link);
    }
    return pageOf(items, link, current);
  }

  /**
   * POST a query to `/graphql` (PLAN.md section 76.6). Needs a token: GitHub
   * has no anonymous GraphQL. Answers `{ data, errors }` and throws only for
   * transport, HTTP and rate-limit failures, because a batch in which one alias
   * failed still carries every other alias's data.
   */
  async graphql<T>(
    query: string,
    variables: Record<string, unknown> = {},
    options: Pick<RequestOptions, "resource" | "signal"> = {},
  ): Promise<GraphQLResponse<T>> {
    const resource = options.resource ?? "graphql";
    if (!this.authenticated) {
      throw new GitHubError("UPSTREAM", `${resource} needs a token`, { resource });
    }

    this.graphqlCount += 1;
    const response = await this.send(`${this.baseUrl}/graphql`, resource, options.signal, {
      method: "POST",
      body: JSON.stringify({ query, variables }),
      contentType: "application/json",
      graphql: true,
    });
    const body = await this.readJson<{ data?: T | null; errors?: GraphQLResponse<T>["errors"] }>(
      response,
      resource,
    );

    const errors = Array.isArray(body?.errors) ? body.errors : [];
    // A spent points budget arrives as a 200 whose error says RATE_LIMITED.
    if (errors.some((error) => error?.type === "RATE_LIMITED")) {
      throw new GitHubError("RATE_LIMITED", `${resource} rate limited`, { status: 200, resource });
    }
    return { data: body?.data ?? null, errors };
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
    return this.send(url, options.resource ?? path, options.signal, { method: "GET" });
  }

  private async send(
    url: string,
    resource: string,
    requestSignal: AbortSignal | undefined,
    init: SendInit,
  ): Promise<Response> {
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), this.timeoutMs);
    const signal = mergeSignals(timeout.signal, this.signal, requestSignal);

    const headers = this.headers();
    if (init.contentType) headers["Content-Type"] = init.contentType;

    this.requestCount += 1;
    try {
      const response = await this.fetchImpl(url, {
        method: init.method,
        headers,
        ...(init.body !== undefined ? { body: init.body } : {}),
        redirect: "follow",
        signal,
        // Next.js data cache (PLAN.md section 30). Plain Node ignores it, so
        // `scripts/snapshot.ts` works with the same client. `force-cache`
        // caches POST too, keyed on the body, so an identical GraphQL batch
        // dedupes across instances for the same ten minutes (section 76.6).
        cache: "force-cache",
        next: { revalidate: REVALIDATE_SECONDS },
      });
      this.readRateLimit(response, init.graphql === true);
      return response;
    } catch (cause) {
      if (timeout.signal.aborted) {
        throw new GitHubError("TIMEOUT", `${resource} timed out after ${this.timeoutMs} ms`, {
          resource,
          cause,
        });
      }
      if (this.signal?.aborted || requestSignal?.aborted) {
        throw new GitHubError("TIMEOUT", `${resource} cancelled`, { resource, cause });
      }
      throw new GitHubError("UPSTREAM", `${resource} request failed`, { resource, cause });
    } finally {
      clearTimeout(timer);
    }
  }

  /** Status check, then the parsed body; `null` for 202, 204 and blank bodies. */
  private async readJson<T>(response: Response, resource: string): Promise<T | null> {
    return (await this.readJsonSized<T>(response, resource)).body;
  }

  /** `readJson`, plus whether the body is too large for the data cache. */
  private async readJsonSized<T>(
    response: Response,
    resource: string,
  ): Promise<{ body: T | null; oversized: boolean }> {
    if (!response.ok) {
      throw await this.mapError(response, resource);
    }

    // 202 (computing) and 204 (no content) carry no body: PLAN.md section 29
    // says treat them as empty rather than as failures.
    if (response.status === 202 || response.status === 204) {
      return { body: null, oversized: false };
    }

    const text = await response.text();
    if (text.trim() === "") return { body: null, oversized: false };

    try {
      return { body: JSON.parse(text) as T, oversized: bodyBytesOver(text) };
    } catch (cause) {
      throw new GitHubError("UPSTREAM", `Malformed JSON from ${resource}`, {
        status: response.status,
        resource,
        cause,
      });
    }
  }

  /** Memo key: the full URL, and whether a token asked, since the answers may differ. */
  private memoKey(path: string, query: RequestOptions["query"]): string | null {
    if (!this.memo) return null;
    return `${this.authenticated ? "token" : "anonymous"} ${this.buildUrl(path, query)}`;
  }

  private recall(key: string): { body: unknown; link: string | null } | null {
    const hit = this.memo?.get(key) ?? null;
    if (hit) this.memoHits += 1;
    return hit;
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

  private readRateLimit(response: Response, graphql: boolean): void {
    const remaining = response.headers?.get?.("x-ratelimit-remaining");
    if (remaining !== null && remaining !== undefined && remaining !== "") {
      const parsed = Number(remaining);
      const value = Number.isFinite(parsed) ? parsed : null;
      if (graphql) this.graphqlRemaining = value;
      else this.rateLimitRemaining = value;
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

/** A page from its items and `Link` header; see `Page.lastPage`. */
function pageOf<T>(items: T[], link: string | null, current: number): Page<T> {
  const links = parseLinkHeader(link);
  const hasNext = links.next !== undefined;
  const last = links.last !== undefined ? pageNumberOf(links.last) : null;
  return { items, hasNext, lastPage: last ?? (hasNext ? null : current) };
}

/** Error bodies are for classification and server logs only, never for the UI. */
async function safeText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

/**
 * `Link: <url>; rel="next", <url>; rel="last"` -> `{ next: url, last: url }`.
 * Unknown shapes are skipped rather than thrown on: a missing or odd header
 * just means "no more pages".
 */
export function parseLinkHeader(header: string | null | undefined): Record<string, string> {
  const links: Record<string, string> = {};
  if (typeof header !== "string" || header.trim() === "") return links;

  // Split on the commas between entries only; a URL may contain commas.
  for (const part of header.split(/,(?=\s*<)/)) {
    const match = /<([^>]*)>\s*;\s*rel="?([^";]+)"?/i.exec(part.trim());
    if (!match) continue;
    for (const rel of match[2].trim().split(/\s+/)) links[rel.toLowerCase()] = match[1];
  }
  return links;
}

/** The `page` query parameter of a GitHub link, or `null` when it has none. */
export function pageNumberOf(url: string): number | null {
  const match = /[?&]page=(\d+)(?:&|$)/.exec(url);
  if (!match) return null;
  const page = Number(match[1]);
  return Number.isFinite(page) && page >= 1 ? page : null;
}

/** `AbortSignal.any` where available, with a listener fallback for older runtimes. */
export function mergeSignals(...candidates: (AbortSignal | undefined)[]): AbortSignal {
  const signals = candidates.filter((signal): signal is AbortSignal => signal !== undefined);
  if (signals.length === 1) return signals[0];
  if (typeof AbortSignal.any === "function") return AbortSignal.any(signals);

  const controller = new AbortController();
  const abort = (): void => controller.abort();
  for (const signal of signals) {
    if (signal.aborted) controller.abort();
    signal.addEventListener("abort", abort, { once: true });
  }
  return controller.signal;
}
