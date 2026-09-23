/**
 * Time and request budgets for one survey (PLAN.md sections 29, 30 and 76.6).
 *
 * Everything is measured from T0, the moment `fetchSnapshot` starts. The route
 * owns the outer budget; the page and enrichment deadlines sit inside it so a
 * giant repository's backlog can run late without ever costing the city.
 */

/** Whole-request budget in the route, under `maxDuration = 60`. */
export const SURVEY_BUDGET_MS = 45_000;
/** Bulk issue and pull pages still in flight at T0 + 22 s are abandoned. */
export const PAGE_DEADLINE_MS = 22_000;
/** GraphQL enrichment batches still in flight at T0 + 30 s are abandoned. */
export const ENRICHMENT_DEADLINE_MS = 30_000;

/** Rate guard: below this REST remainder after metadata, no bulk pages. */
export const REST_GUARD_REMAINING = 400;
/** Rate guard: below this many GraphQL points, no enrichment. */
export const GRAPHQL_GUARD_REMAINING = 300;

/** At most this many open issues are surveyed (section 76.1, decision 4). */
export const MAX_OPEN_ISSUES = 1_000;
/** At most this many open pull requests are surveyed. */
export const MAX_OPEN_PULLS = 500;

/** Wave A2: bulk issue pages planned from `open_issues_count` alone. */
export const BULK_ISSUE_PAGES = 12;
/** Wave A': top-up ceiling once the real issue/PR split is known. */
export const MAX_ISSUE_PAGES = 15;
/**
 * Wave A' by search, for repositories where pull requests crowd the issue
 * pages: `/search/issues?q=repo:o/r is:issue is:open` lists issues only, so
 * 10 pages reach the 1,000-issue ceiling however many pull requests there
 * are. Search stops at 1,000 results, which is exactly that ceiling.
 *
 * Measured live on 2026-09-23 (vercel/next.js, 1,012 open issues under 2,449
 * open pull requests, so 70% of the `/issues` listing is pull requests; page 1
 * of it held 95 pull requests and 5 issues): 15 REST pages reached 407 issues.
 * A search page of 100 took 1.3 to 1.4 s; pages are independent, so 10 of
 * them take about two page times. The GraphQL alternative,
 * `repository.issues(orderBy: UPDATED_AT)`, lists issues only too and costs
 * 1 point a page, but took 2.5 s a page and can only walk its cursor one page
 * at a time: 25 s for 1,000 issues, past the page deadline, all of it GraphQL
 * time that the secondary limit meters on the shared token.
 *
 * Search has its own budget of 30 requests a minute with a token, so page 1
 * goes first and the rest are trimmed to what its `x-ratelimit-remaining`
 * allows.
 */
export const SEARCH_MAX_PAGES = 10;
/**
 * Search replaces REST top-up pages when `MAX_ISSUE_PAGES` REST pages would
 * reach less than this share of the issues wanted. For a repository with
 * 1,000 open issues or more, that is pull requests at 40% of the listing or
 * more; issue-heavy repositories such as vscode never get near it.
 */
export const SEARCH_SWITCH_REACH = 0.9;
/** Wave B: open pull pages in total, page 1 included. */
export const MAX_PULL_PAGES = 5;
/** Items per page for every bulk list request. */
export const PER_PAGE = 100;

/**
 * Wave C: pull requests per aliased GraphQL batch, batches in flight at once,
 * and the most pull requests enriched per survey.
 *
 * Measured live on 2026-09-22 (microsoft/vscode): a 50-PR batch costs 1 point
 * but takes 5 to 9 s of GitHub's time, about 150 ms per PR, and ten such
 * batches in parallel trip GraphQL's secondary limit (which then locks the
 * shared token out for minutes). Batches of 25 at 4 in flight finished 200
 * PRs in 7.3 s without tripping it.
 *
 * So a survey enriches the newest 100 open PRs in one round of four batches:
 * about 4 s of wall time (next.js 3.6 s, vscode 3.8 s) and about 15 s of
 * GitHub's time, which leaves room under the secondary limit's 60 s per
 * minute for a few surveys at once on the shared token. Five GraphQL queries
 * with the totals query, inside section 76.13's seven. The rest of the open
 * PRs keep REST data plus the issue view's comment and reaction counts.
 */
export const ENRICH_BATCH_SIZE = 25;
export const ENRICH_CONCURRENCY = 4;
export const ENRICH_MAX_PULLS = 100;

/**
 * A repository with `open_issues_count <= 100` is "small": A1 already lists
 * every open issue and pull request, so it makes exactly today's REST
 * requests — no bulk pages and no totals query. It does spend one GraphQL
 * query (with a token) on review, CI and touched files for its pull requests:
 * most repositories are villages and towns, and that query is what puts a
 * scaffold on the building a pull request actually changes.
 */
export const ENRICH_SMALL_REPOS = true;
