/**
 * The open-work survey: every open issue and pull request the budgets allow
 * (PLAN.md section 76.6).
 *
 *   A1  health sample, comment order, 100 items        (today's request 4)
 *   A2  bulk issue pages 1..K by update time           (large repos only)
 *   A3  open pulls page 1, per_page=100                 (today's request 5, wider)
 *   A4  closed pulls                                    (today's request 6)
 *   A5  open totals: GraphQL, else REST `Link`, else an estimate
 *   A'  top-up issue pages once A5 gives the real split (up to 15 in total)
 *   B   open pull pages 2..5 once A3 gives the page count
 *   C   GraphQL enrichment of open pulls, in aliased batches (token only)
 *
 * A repository with `open_issues_count <= 100` is small: A1 already lists
 * every open issue and pull request, so it makes exactly today's requests and
 * its totals are counted straight off that page.
 *
 * Nothing here is fatal. A lost page, batch or total is recorded in
 * `coverage` and the survey carries on with what landed.
 */

import type { GhIssue, GhPull } from "@/types/github";
import type {
  IssueSummary,
  OpenTotals,
  PullSummary,
  SurveyCoverage,
} from "@/types/repository";
import {
  ENRICH_BATCH_SIZE,
  ENRICH_CONCURRENCY,
  ENRICH_MAX_PULLS,
  ENRICH_SMALL_REPOS,
  GRAPHQL_GUARD_REMAINING,
  MAX_OPEN_ISSUES,
  MAX_OPEN_PULLS,
  PER_PAGE,
  REST_GUARD_REMAINING,
} from "./budgets.ts";
import { GitHubClient, type Page } from "./client.ts";
import { warningFor } from "./errors.ts";
import { type PullEnrichment, fetchGraphTotals, fetchPullBatch } from "./graphql.ts";
import {
  BULK_ISSUES_QUERY,
  type IssueSample,
  type PullItemStats,
  fetchIssueSample,
  issuesPath,
  mapIssue,
  pullItemStats,
} from "./issues.ts";
import {
  type PagesResult,
  type StopReason,
  fetchPages,
  firstStop,
  pageRange,
  planIssuePages,
  planIssueTopUp,
  planPullPages,
  stopReasonOf,
} from "./paginate.ts";
import {
  OPEN_PULLS_QUERY,
  fetchClosedPulls,
  fetchOpenPullsPage,
  mapPulls,
  pullsPath,
} from "./pulls.ts";

/** Warning copy for the rate guard (PLAN.md section 76.6). */
export const LOW_BUDGET_ISSUES_WARNING =
  "GitHub's request budget is low right now, so only the first 100 issues are drawn.";
export const LOW_BUDGET_ENRICHMENT_WARNING =
  "GitHub's request budget is low right now, so pull request reviews and checks are not shown.";
export const LIMITED_ENRICHMENT_WARNING =
  "GitHub is limiting requests right now, so reviews and checks are shown for only some pull requests.";

/** A progress line for the `issues` or `pulls` stage. */
export interface SurveyProgress {
  status: "running" | "done" | "failed";
  detail?: string;
}

export interface SurveyOptions {
  /** `open_issues_count` from metadata: open issues plus open pull requests. */
  openIssuesCount: number;
  /** Abandons bulk pages still in flight (T0 + 22 s). */
  pageDeadline?: AbortSignal;
  /** Abandons enrichment batches still in flight (T0 + 30 s). */
  enrichmentDeadline?: AbortSignal;
  onIssues?: (progress: SurveyProgress) => void;
  onPulls?: (progress: SurveyProgress) => void;
}

export interface SurveyResult {
  /** A1, the health sample. */
  issues: IssueSummary[];
  /** Every other open issue surveyed, most recently updated first. */
  issueBacklog: IssueSummary[];
  /** Open pulls (update order) then recently closed ones. */
  pulls: PullSummary[];
  openTotals: OpenTotals | null;
  coverage: SurveyCoverage;
  warnings: string[];
  /** A1 landed (the `issues` stage succeeded). */
  issuesOk: boolean;
  /** A3 landed (the `pulls` stage succeeded). */
  pullsOk: boolean;
}

const count = (n: number): string => n.toLocaleString("en-US");
const plural = (n: number, one: string, many = `${one}s`): string =>
  `${count(n)} ${n === 1 ? one : many}`;

type Settled<T> = { ok: true; value: T } | { ok: false; error: unknown };

async function settle<T>(promise: Promise<T>): Promise<Settled<T>> {
  try {
    return { ok: true, value: await promise };
  } catch (error) {
    return { ok: false, error };
  }
}

const noPages = <T>(): PagesResult<T> => ({
  items: [],
  received: 0,
  failed: 0,
  stoppedBy: null,
  lastPage: null,
});

export async function surveyOpenWork(
  client: GitHubClient,
  owner: string,
  repo: string,
  options: SurveyOptions,
): Promise<SurveyResult> {
  const { openIssuesCount, pageDeadline, enrichmentDeadline } = options;
  const warnings: string[] = [];
  const report = (
    listener: SurveyOptions["onIssues"],
    progress: SurveyProgress,
  ): void => {
    try {
      listener?.(progress);
    } catch {
      // A broken listener must never take the survey down with it.
    }
  };

  const small = !(openIssuesCount > PER_PAGE);
  const planned = planIssuePages(openIssuesCount);
  // Rate guard: read after metadata, before any bulk request is planned.
  const restLow =
    client.rateLimitRemaining !== null && client.rateLimitRemaining < REST_GUARD_REMAINING;
  const bulkAllowed = !small && !restLow;

  // ---- rising counts for the progress rows -----------------------------------
  const seenIssues = new Set<number>();
  const seenPulls = new Set<number>();
  const noteIssues = (numbers: number[]): void => {
    for (const number of numbers) seenIssues.add(number);
    if (!small) {
      report(options.onIssues, {
        status: "running",
        detail: `${count(seenIssues.size)} open issues surveyed`,
      });
    }
  };
  const notePulls = (items: GhPull[]): void => {
    for (const item of items) if (item && typeof item.number === "number") seenPulls.add(item.number);
    if (!small) {
      report(options.onPulls, {
        status: "running",
        detail: `${count(seenPulls.size)} open pull requests surveyed`,
      });
    }
  };

  // ---- wave A ----------------------------------------------------------------
  const sampleTask = settle(fetchIssueSample(client, owner, repo)).then((result) => {
    if (result.ok) noteIssues(result.value.issues.map((issue) => issue.number));
    return result;
  });
  const firstPullsTask = settle(fetchOpenPullsPage(client, owner, repo)).then((result) => {
    if (result.ok) notePulls(result.value.items);
    return result;
  });
  const closedTask = settle(fetchClosedPulls(client, owner, repo));

  const bulkIssuesTask: Promise<PagesResult<GhIssue>> =
    bulkAllowed && planned > 0
      ? fetchPages<GhIssue>(client, issuesPath(owner, repo), { ...BULK_ISSUES_QUERY }, pageRange(1, planned), {
          resource: "issues",
          deadline: pageDeadline,
          onPage: (_page, items) => noteIssues(issueNumbers(items)),
        })
      : Promise.resolve(noPages<GhIssue>());

  // A5 only for large repositories: a small one's totals are counted off A1.
  const totalsTask: Promise<OpenTotals | null> = small
    ? Promise.resolve(null)
    : resolveTotals(client, owner, repo, openIssuesCount, firstPullsTask, pageDeadline);

  // ---- wave A': top-up issue pages once the real split is known -------------
  const topUpTask: Promise<{ pages: number; result: PagesResult<GhIssue> }> = totalsTask.then(
    async (totals) => {
      if (!bulkAllowed || !totals || planned === 0) return { pages: 0, result: noPages<GhIssue>() };
      const wanted = planIssueTopUp(planned, totals);
      if (wanted <= planned || pageDeadline?.aborted) {
        return { pages: 0, result: noPages<GhIssue>() };
      }
      const pages = pageRange(planned + 1, wanted);
      const result = await fetchPages<GhIssue>(
        client,
        issuesPath(owner, repo),
        { ...BULK_ISSUES_QUERY },
        pages,
        {
          resource: "issues",
          deadline: pageDeadline,
          onPage: (_page, items) => noteIssues(issueNumbers(items)),
        },
      );
      return { pages: pages.length, result };
    },
  );

  // ---- wave B: open pull pages 2..5 -------------------------------------------
  const morePullsTask: Promise<{ pages: number[]; result: PagesResult<GhPull> }> =
    firstPullsTask.then(async (first) => {
      if (!first.ok) return { pages: [], result: noPages<GhPull>() };
      const pages = planPullPages(first.value);
      if (!bulkAllowed || pages.length === 0) return { pages, result: noPages<GhPull>() };
      const result = await fetchPages<GhPull>(client, pullsPath(owner, repo), { ...OPEN_PULLS_QUERY }, pages, {
        resource: "pulls (open)",
        deadline: pageDeadline,
        onPage: (_page, items) => notePulls(items),
      });
      return { pages, result };
    });

  const guardStop: StopReason | null = restLow && !small ? "rate-limit" : null;

  // ---- issues: settle and report as soon as their pages are in ---------------
  // The issues row must not wait for pull request enrichment.
  const issuesPart = Promise.all([sampleTask, bulkIssuesTask, topUpTask, totalsTask, firstPullsTask]).then(
    ([sample, bulk, topUp, totalsResolved, firstPulls]) => {
      const healthSample = sample.ok ? sample.value.issues : [];
      const stats: Map<number, PullItemStats> = sample.ok ? new Map(sample.value.pullItems) : new Map();
      pullItemStats(bulk.items, stats);
      pullItemStats(topUp.result.items, stats);

      const issueBacklog = buildIssueBacklog([...bulk.items, ...topUp.result.items], healthSample);
      const openTotals: OpenTotals | null = small
        ? smallTotals(sample, firstPulls, openIssuesCount)
        : totalsResolved;
      const coverage = {
        planned: planned + topUp.pages,
        received: bulk.received + topUp.result.received,
      };
      const reasons = [guardStop && planned > 0 ? guardStop : null, bulk.stoppedBy, topUp.result.stoppedBy];

      report(
        options.onIssues,
        issuesDone(small, sample.ok, healthSample.length + issueBacklog.length, openTotals, reasons),
      );
      return { sample, healthSample, issueBacklog, stats, openTotals, coverage, stoppedBy: firstStop(...reasons) };
    },
  );

  // ---- open pulls known: wave C ------------------------------------------------
  const [first, more, closed] = await Promise.all([firstPullsTask, morePullsTask, closedTask]);
  const openRaw = [...(first.ok ? first.value.items : []), ...more.result.items];
  const openPulls = mapPulls(openRaw)
    .filter((pull) => pull.state === "open")
    .slice(0, MAX_OPEN_PULLS);

  const enrichmentWanted = !small || ENRICH_SMALL_REPOS;
  let enrichment: EnrichmentOutcome = { byNumber: new Map(), attempted: 0, stoppedBy: null, state: "skipped" };
  if (openPulls.length === 0) {
    enrichment = { ...enrichment, state: small ? "skipped" : "complete" };
  } else if (!enrichmentWanted || !client.authenticated) {
    enrichment = { ...enrichment, state: "skipped" };
  } else {
    // A5 read the GraphQL points budget; nothing to go on without it.
    await totalsTask;
    const graphLow =
      client.graphqlRemaining !== null && client.graphqlRemaining < GRAPHQL_GUARD_REMAINING;
    if (graphLow) {
      warnings.push(LOW_BUDGET_ENRICHMENT_WARNING);
      enrichment = { ...enrichment, stoppedBy: "rate-limit" };
    } else {
      report(options.onPulls, {
        status: "running",
        detail: `checking reviews and CI on ${plural(Math.min(openPulls.length, ENRICH_MAX_PULLS), "pull request")}`,
      });
      enrichment = await enrichPulls(
        client,
        owner,
        repo,
        openPulls.map((pull) => pull.number),
        enrichmentDeadline,
      );
      if (enrichment.stoppedBy === "rate-limit") warnings.push(LIMITED_ENRICHMENT_WARNING);
    }
  }

  const issues = await issuesPart;

  // ---- pulls ----------------------------------------------------------------------
  // Discussion counts from issue pages are only complete once those pages are
  // in, which the page deadline bounds; enrichment has its own later one.
  const closedPulls = closed.ok ? mapPulls(closed.value) : [];
  const openNumbers = new Set(openPulls.map((pull) => pull.number));
  const enrichedOpen = openPulls.map((pull) =>
    applyPullDetail(pull, issues.stats.get(pull.number), enrichment.byNumber.get(pull.number), !small),
  );
  const pulls = [...enrichedOpen, ...closedPulls.filter((pull) => !openNumbers.has(pull.number))];

  // ---- coverage -------------------------------------------------------------------
  const guardTrimmed = guardStop !== null && (planned > 0 || more.pages.length > 0);
  if (guardTrimmed) warnings.push(LOW_BUDGET_ISSUES_WARNING);
  const pullReasons = [guardStop && more.pages.length > 0 ? guardStop : null, more.result.stoppedBy];

  const coverage: SurveyCoverage = {
    issuePages: issues.coverage,
    pullPages: {
      planned: first.ok ? 1 + more.pages.length : 1,
      received: (first.ok ? 1 : 0) + more.result.received,
    },
    enrichment: enrichment.state,
    stoppedBy: firstStop(issues.stoppedBy, ...pullReasons, enrichment.stoppedBy),
  };

  // ---- warnings for the health-sample requests, as today ----------------------
  if (!issues.sample.ok) warnings.push(warningFor("issues", issues.sample.error));
  if (!first.ok) warnings.push(warningFor("pull requests", first.error));
  else if (!closed.ok) warnings.push(warningFor("pull requests", closed.error));

  report(
    options.onPulls,
    pullsDone(small, first.ok, openPulls.length, issues.openTotals, enrichment, pullReasons),
  );

  return {
    issues: issues.healthSample,
    issueBacklog: issues.issueBacklog,
    pulls,
    openTotals: issues.openTotals,
    coverage,
    warnings,
    issuesOk: issues.sample.ok,
    pullsOk: first.ok,
  };
}

/* ------------------------------------------------------------------ totals */

/**
 * A5, with its fallbacks: GraphQL (exact, one point), then the REST `Link`
 * trick on `/pulls?per_page=1` (exact PR count; issues by subtraction), then
 * an estimate from the first page of open pulls.
 */
async function resolveTotals(
  client: GitHubClient,
  owner: string,
  repo: string,
  openIssuesCount: number,
  firstPulls: Promise<Settled<Page<GhPull>>>,
  deadline?: AbortSignal,
): Promise<OpenTotals | null> {
  if (client.authenticated) {
    try {
      const totals = await fetchGraphTotals(client, owner, repo, deadline);
      return { ...totals, exact: true, source: "graphql" };
    } catch {
      // Fall through to REST.
    }
  }

  try {
    const page = await client.getPage<GhPull>(pullsPath(owner, repo), {
      resource: "open pull total",
      query: { state: "open", per_page: 1 },
      signal: deadline,
    });
    const pulls = page.lastPage ?? page.items.length;
    return {
      issues: Math.max(0, openIssuesCount - pulls),
      pulls,
      exact: true,
      source: "rest-link",
    };
  } catch {
    // Fall through to the estimate.
  }

  const first = await firstPulls;
  if (!first.ok) return null;
  const page = first.value;
  const pulls = page.hasNext
    ? Math.max(page.items.length, ((page.lastPage ?? 1) - 1) * PER_PAGE + 1)
    : page.items.length;
  return {
    issues: Math.max(0, openIssuesCount - pulls),
    pulls,
    exact: false,
    source: "estimate",
  };
}

/**
 * A small repository's totals, counted off pages that hold everything: A1 has
 * every open issue when `Link` names no next page, and A3 every open pull.
 */
function smallTotals(
  sample: Settled<IssueSample>,
  first: Settled<Page<GhPull>>,
  openIssuesCount: number,
): OpenTotals | null {
  const pullsComplete = first.ok && !first.value.hasNext;
  const openPulls = first.ok ? mapPulls(first.value.items).filter((pull) => pull.state === "open").length : 0;
  const issuesComplete = sample.ok && sample.value.complete;

  if (issuesComplete && pullsComplete) {
    return { issues: sample.value.issues.length, pulls: openPulls, exact: true, source: "rest-link" };
  }
  if (pullsComplete) {
    return {
      issues: Math.max(0, openIssuesCount - openPulls),
      pulls: openPulls,
      exact: false,
      source: "estimate",
    };
  }
  if (issuesComplete) {
    const issues = sample.value.issues.length;
    return {
      issues,
      pulls: Math.max(0, openIssuesCount - issues),
      exact: false,
      source: "estimate",
    };
  }
  return null;
}

/* --------------------------------------------------------------- the lists */

/** Issues from bulk pages: PRs dropped, deduped, never repeating A1, capped. */
export function buildIssueBacklog(raw: GhIssue[], healthSample: IssueSummary[]): IssueSummary[] {
  const seen = new Set(healthSample.map((issue) => issue.number));
  const backlog: IssueSummary[] = [];
  for (const item of raw) {
    const issue = mapIssue(item);
    if (!issue || seen.has(issue.number)) continue;
    seen.add(issue.number);
    backlog.push(issue);
  }
  // A page can shift while it is fetched (an item updated between two page
  // requests); restore update order so "most recently active first" holds.
  const ordered = backlog
    .map((issue, index) => ({ issue, index }))
    .sort((a, b) => updatedDesc(a.issue.updatedAt, b.issue.updatedAt) || a.index - b.index)
    .map(({ issue }) => issue);
  return ordered.slice(0, MAX_OPEN_ISSUES);
}

function updatedDesc(a: string, b: string): number {
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
}

/**
 * Fills in what the pulls list endpoint does not carry. GraphQL wins, then
 * the issue view of the same PR, then the list's own `review_comments`.
 *
 * @param markMissing write `review: null, checks: null` when enrichment did
 * not reach this pull, so "not known" is explicit rather than absent.
 */
export function applyPullDetail(
  pull: PullSummary,
  stats: PullItemStats | undefined,
  enriched: PullEnrichment | undefined,
  markMissing: boolean,
): PullSummary {
  const out: PullSummary = { ...pull };
  if (stats) {
    out.comments = stats.comments;
    if (stats.reactions !== undefined) out.reactions = stats.reactions;
  }
  if (enriched) {
    out.comments = enriched.comments;
    out.reactions = enriched.reactions;
    out.review = enriched.review;
    out.checks = enriched.checks;
    out.files = enriched.files;
    out.changedFiles = enriched.changedFiles;
  } else if (markMissing) {
    out.review = null;
    out.checks = null;
  }
  return out;
}

/** Numbers of the real issues on a page, pull request items skipped. */
function issueNumbers(items: GhIssue[]): number[] {
  return items
    .filter((item) => item && typeof item.number === "number" && !item.pull_request)
    .map((item) => item.number);
}

/* --------------------------------------------------------------- wave C */

interface EnrichmentOutcome {
  byNumber: Map<number, PullEnrichment>;
  attempted: number;
  stoppedBy: StopReason | null;
  state: SurveyCoverage["enrichment"];
}

/**
 * Batches of `ENRICH_BATCH_SIZE`, at most `ENRICH_CONCURRENCY` in flight, the
 * newest `ENRICH_MAX_PULLS` pulls only. A rate limit stops new batches at
 * once: GitHub's secondary limit punishes a token that keeps knocking.
 */
export async function enrichPulls(
  client: GitHubClient,
  owner: string,
  repo: string,
  numbers: number[],
  deadline?: AbortSignal,
  limits: { batchSize: number; concurrency: number; maxPulls: number } = {
    batchSize: ENRICH_BATCH_SIZE,
    concurrency: ENRICH_CONCURRENCY,
    maxPulls: ENRICH_MAX_PULLS,
  },
): Promise<EnrichmentOutcome> {
  const wanted = numbers.slice(0, limits.maxPulls);
  const batches: number[][] = [];
  for (let i = 0; i < wanted.length; i += limits.batchSize) {
    batches.push(wanted.slice(i, i + limits.batchSize));
  }

  const byNumber = new Map<number, PullEnrichment>();
  let stoppedBy: StopReason | null = null;
  let attempted = 0;
  let next = 0;

  const worker = async (): Promise<void> => {
    while (next < batches.length) {
      if (deadline?.aborted) {
        stoppedBy ??= "deadline";
        return;
      }
      if (stoppedBy === "rate-limit") return;
      const batch = batches[next];
      next += 1;
      attempted += batch.length;
      try {
        const result = await fetchPullBatch(client, owner, repo, batch, deadline);
        for (const [number, value] of result) byNumber.set(number, value);
      } catch (error) {
        stoppedBy = firstStop(stoppedBy, stopReasonOf(error, deadline));
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(limits.concurrency, batches.length) }, worker));

  const state: SurveyCoverage["enrichment"] =
    byNumber.size === 0 ? (numbers.length === 0 ? "complete" : "skipped") : byNumber.size >= numbers.length ? "complete" : "partial";
  return { byNumber, attempted, stoppedBy, state };
}

/* --------------------------------------------------------------- stage copy */

const STOP_SUFFIX: Record<StopReason, string> = {
  deadline: " (time limit)",
  "rate-limit": " (rate limit)",
  error: " (some pages failed)",
};

function suffixFor(reasons: (StopReason | null)[]): string {
  const reason = firstStop(...reasons);
  return reason ? STOP_SUFFIX[reason] : "";
}

function totalText(total: number, exact: boolean): string {
  return exact ? count(total) : `about ${count(total)}`;
}

function issuesDone(
  small: boolean,
  ok: boolean,
  surveyed: number,
  totals: OpenTotals | null,
  reasons: (StopReason | null)[],
): SurveyProgress {
  if (!ok && surveyed === 0) return { status: "failed", detail: "issues unavailable" };
  const suffix = suffixFor(reasons);
  if (small || !totals) {
    if (!ok) return { status: "failed", detail: "issues unavailable" };
    // Request A1 held every open issue, so the count is the whole story and
    // "N of N" would only repeat it. Same verb as the large-repository line.
    const detail = surveyed === 0 ? "no open issues" : `${plural(surveyed, "open issue")} surveyed`;
    return { status: "done", detail: `${detail}${suffix}` };
  }
  const detail = `${count(surveyed)} of ${totalText(totals.issues, totals.exact)} open issues surveyed${suffix}`;
  return { status: ok ? "done" : "failed", detail };
}

function pullsDone(
  small: boolean,
  ok: boolean,
  open: number,
  totals: OpenTotals | null,
  enrichment: EnrichmentOutcome,
  reasons: (StopReason | null)[],
): SurveyProgress {
  if (!ok) return { status: "failed", detail: "pull requests unavailable" };
  // Open pull requests only: the merged sample (request A4) feeds the
  // completed sites and the review measures, and is not part of the count.
  let detail =
    small || !totals
      ? open === 0
        ? "no open pull requests"
        : `${plural(open, "open pull request")} surveyed`
      : `${count(open)} of ${totalText(totals.pulls, totals.exact)} open pull requests surveyed`;
  if (enrichment.byNumber.size > 0) {
    detail += `, ${count(enrichment.byNumber.size)} with reviews and CI`;
  }
  detail += suffixFor([...reasons, enrichment.stoppedBy]);
  return { status: "done", detail };
}
