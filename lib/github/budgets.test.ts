import { describe, expect, it } from "vitest";
import {
  BULK_ISSUE_PAGES,
  ENRICHMENT_DEADLINE_MS,
  ENRICH_BATCH_SIZE,
  ENRICH_MAX_PULLS,
  MAX_ISSUE_PAGES,
  MAX_OPEN_PULLS,
  MAX_PULL_PAGES,
  PAGE_DEADLINE_MS,
  PER_PAGE,
  SURVEY_BUDGET_MS,
} from "./budgets";
import { REQUEST_TIMEOUT_MS } from "./client";

describe("survey budgets (PLAN.md section 76.6)", () => {
  it("nests the page and enrichment deadlines inside the route's budget", () => {
    expect(PAGE_DEADLINE_MS).toBeLessThan(ENRICHMENT_DEADLINE_MS);
    expect(ENRICHMENT_DEADLINE_MS).toBeLessThan(SURVEY_BUDGET_MS);
    // A request started just before the enrichment deadline still ends
    // (by its own timeout) inside the survey budget.
    expect(ENRICHMENT_DEADLINE_MS + REQUEST_TIMEOUT_MS).toBeLessThanOrEqual(SURVEY_BUDGET_MS);
    // And the route answers inside `maxDuration = 60`.
    expect(SURVEY_BUDGET_MS).toBeLessThan(60_000);
  });

  it("keeps the request ceiling of section 76.13", () => {
    // Today's 15 REST, plus 15 issue pages, 4 pull pages and the Link fallback.
    expect(15 + MAX_ISSUE_PAGES + (MAX_PULL_PAGES - 1) + 1).toBeLessThanOrEqual(35);
    // The totals query plus the enrichment batches.
    expect(1 + Math.ceil(ENRICH_MAX_PULLS / ENRICH_BATCH_SIZE)).toBeLessThanOrEqual(7);
    expect(BULK_ISSUE_PAGES).toBeLessThanOrEqual(MAX_ISSUE_PAGES);
    expect(MAX_PULL_PAGES * PER_PAGE).toBe(MAX_OPEN_PULLS);
  });
});
