/**
 * Parallel page fetching and page planning (PLAN.md section 76.6).
 *
 * REST list endpoints accept `page=n`, so every page of a planned range can be
 * requested at once instead of walking `rel="next"` one round trip at a time.
 * Pages are independent: one lost to the deadline, a rate limit or an error is
 * counted and the rest are kept. Nothing here is ever fatal.
 */

import type { SurveyCoverage } from "@/types/repository";
import { GitHubClient, type MemoOptions, type RequestOptions } from "./client.ts";
import { errorCodeOf } from "./errors.ts";
import {
  BULK_ISSUE_PAGES,
  MAX_ISSUE_PAGES,
  MAX_OPEN_ISSUES,
  MAX_PULL_PAGES,
  PER_PAGE,
  SEARCH_MAX_PAGES,
  SEARCH_SWITCH_REACH,
} from "./budgets.ts";

export type StopReason = NonNullable<SurveyCoverage["stoppedBy"]>;

export interface PagesResult<T> {
  /** Items of every page that landed, in page order. */
  items: T[];
  /** Pages that landed. */
  received: number;
  /** Pages lost. */
  failed: number;
  /** Why the first lost page was lost, or null when none was. */
  stoppedBy: StopReason | null;
  /** Largest `lastPage` any landed page reported, or null. */
  lastPage: number | null;
}

export interface FetchPagesOptions<T> {
  resource?: string;
  /** Abandons every page still in flight (the page deadline). */
  deadline?: AbortSignal;
  /** Called as each page lands, in arrival order; for rising progress counts. */
  onPage?: (page: number, items: T[]) => void;
  /** Passed to `getPage`: keep oversized pages in the response memo (`memo.ts`). */
  slim?: MemoOptions<T>["slim"];
}

/**
 * Fetches `pages` of `path` in parallel.
 *
 * @param query the shared query; `page` is set per request.
 */
export async function fetchPages<T>(
  client: GitHubClient,
  path: string,
  query: NonNullable<RequestOptions["query"]>,
  pages: number[],
  options: FetchPagesOptions<T> = {},
): Promise<PagesResult<T>> {
  return settlePages(
    pages,
    (page) =>
      client.getPage<T>(path, {
        resource: `${options.resource ?? path} page ${page}`,
        query: { ...query, page },
        signal: options.deadline,
        ...(options.slim ? { slim: options.slim } : {}),
      }),
    options,
  );
}

/**
 * Runs `fetchOne` for every page at once and settles them into one result,
 * for list endpoints whose pages are not bare arrays (search).
 */
export async function settlePages<T>(
  pages: number[],
  fetchOne: (page: number) => Promise<{ items: T[]; lastPage: number | null }>,
  options: Pick<FetchPagesOptions<T>, "deadline" | "onPage"> = {},
): Promise<PagesResult<T>> {
  const settled = await Promise.allSettled(
    pages.map(async (page) => {
      const result = await fetchOne(page);
      try {
        options.onPage?.(page, result.items);
      } catch {
        // Progress is a courtesy; a broken listener never loses a page.
      }
      return result;
    }),
  );

  const items: T[] = [];
  let received = 0;
  let failed = 0;
  let stoppedBy: StopReason | null = null;
  let lastPage: number | null = null;

  for (const outcome of settled) {
    if (outcome.status === "fulfilled") {
      received += 1;
      items.push(...outcome.value.items);
      if (outcome.value.lastPage !== null) {
        lastPage = Math.max(lastPage ?? 0, outcome.value.lastPage);
      }
    } else {
      failed += 1;
      stoppedBy ??= stopReasonOf(outcome.reason, options.deadline);
    }
  }

  return { items, received, failed, stoppedBy, lastPage };
}

/** Maps a lost page onto the coverage vocabulary. */
export function stopReasonOf(error: unknown, deadline?: AbortSignal): StopReason {
  if (deadline?.aborted) return "deadline";
  const code = errorCodeOf(error);
  if (code === "RATE_LIMITED") return "rate-limit";
  if (code === "TIMEOUT") return "deadline";
  return "error";
}

/** First stop reason in priority order: a rate limit explains more than a deadline. */
export function firstStop(...reasons: (StopReason | null | undefined)[]): StopReason | null {
  for (const wanted of ["rate-limit", "deadline", "error"] as const) {
    if (reasons.includes(wanted)) return wanted;
  }
  return null;
}

/** `[from, from + 1, ..., to]`, empty when `to < from`. */
export function pageRange(from: number, to: number): number[] {
  const pages: number[] = [];
  for (let page = from; page <= to; page += 1) pages.push(page);
  return pages;
}

/**
 * Wave A2: bulk issue pages from `open_issues_count` alone, which counts open
 * issues and open pull requests together. Twelve pages rather than ten,
 * because pull request items share these pages. None at all when the health
 * sample (A1, 100 items) already holds everything.
 */
export function planIssuePages(openIssuesCount: number): number {
  if (!Number.isFinite(openIssuesCount) || openIssuesCount <= PER_PAGE) return 0;
  return Math.min(BULK_ISSUE_PAGES, Math.ceil(openIssuesCount / PER_PAGE));
}

/**
 * Wave A': once the real split is known, how many issue pages in total it
 * takes to reach `MAX_OPEN_ISSUES` issues, given that pull requests take
 * their share of every page. Never fewer than already planned, never more
 * than `MAX_ISSUE_PAGES`, never past the end of the listing.
 */
export function planIssueTopUp(
  planned: number,
  totals: { issues: number; pulls: number },
): number {
  if (planned <= 0) return planned;
  const { issues, pulls } = totals;
  if (!(issues > 0)) return planned;

  const listed = issues + Math.max(0, pulls);
  const lastListedPage = Math.ceil(listed / PER_PAGE);
  const issuesPerPage = (PER_PAGE * issues) / listed;
  const wanted = Math.ceil(Math.min(MAX_OPEN_ISSUES, issues) / issuesPerPage);

  return Math.max(planned, Math.min(MAX_ISSUE_PAGES, wanted, lastListedPage));
}

/**
 * Wave A' by search: how many `/search/issues` pages to fetch instead of REST
 * top-up pages, or 0 to stay on REST. Search is chosen only when the REST
 * ceiling of `MAX_ISSUE_PAGES` pages would reach less than
 * `SEARCH_SWITCH_REACH` of the issues wanted, because pull requests take
 * most of every `/issues` page. A listing REST can walk to its end within
 * that ceiling never needs search, whatever its split.
 */
export function planIssueSearch(
  planned: number,
  totals: { issues: number; pulls: number },
): number {
  if (planned <= 0) return 0;
  const { issues, pulls } = totals;
  if (!(issues > 0)) return 0;

  const listed = issues + Math.max(0, pulls);
  if (Math.ceil(listed / PER_PAGE) <= MAX_ISSUE_PAGES) return 0;

  const wanted = Math.min(MAX_OPEN_ISSUES, issues);
  const restReach = (MAX_ISSUE_PAGES * PER_PAGE * issues) / listed;
  if (restReach >= SEARCH_SWITCH_REACH * wanted) return 0;
  return searchPagesFor(wanted);
}

/** Search pages that list `issues` issues, never past search's 1,000-result end. */
export function searchPagesFor(issues: number): number {
  if (!(issues > 0)) return 0;
  return Math.min(SEARCH_MAX_PAGES, Math.ceil(Math.min(MAX_OPEN_ISSUES, issues) / PER_PAGE));
}

/** Wave B: open pull pages 2..min(5, lastPage) after page 1 said how many there are. */
export function planPullPages(firstPage: { lastPage: number | null; hasNext: boolean }): number[] {
  if (!firstPage.hasNext) return [];
  const last = firstPage.lastPage ?? MAX_PULL_PAGES;
  return pageRange(2, Math.min(MAX_PULL_PAGES, last));
}
