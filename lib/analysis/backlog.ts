/**
 * The compact crowd (PLAN.md 76.1 decision 4, 76.6 "Payload", 76.7 "Backlog").
 *
 * Every open issue and pull request that is not a hero becomes a small
 * `BacklogIssue` or `BacklogPull`. Up to 1,000 issues and 500 pull requests
 * in total, heroes included, are kept. They are chosen by recency of update
 * ("most active first") and then ordered by significance, which is the order
 * that decides who gets the spots nearest their code.
 *
 * Bodies are read here, on the server, only to find `relatedPath`, and are
 * then dropped. URLs are dropped too: the client derives
 * `${repo.url}/issues/${number}`. Titles, labels and touched files are
 * truncated, which is what holds the analysis under 1 MB.
 *
 * Pure: the clock is an argument. Nothing here feeds health or confidence.
 */

import type {
  BacklogIssue,
  BacklogPull,
  DistrictPlan,
  RankedIssue,
  RankedPull,
} from "@/types/analysis";
import type { IssueSummary, PullSummary, RepositorySnapshot } from "@/types/repository";
import {
  capWrecks,
  heatOf,
  issueFormFor,
  pullForm,
  pullRelatedPath,
  relatedPathFor,
} from "./forms";
import {
  RANKED_FILES_MAX,
  byRecency,
  bySignificance,
  classifyIssue,
  classifyPull,
  openPullsOf,
} from "./metrics";

/** 76.1 decision 4: open issues drawn, heroes included. */
export const ISSUE_CEILING = 1000;
/** 76.1 decision 4: open pull requests drawn, heroes included. */
export const PULL_CEILING = 500;

/** 76.6 payload limits. */
export const TITLE_MAX = 140;
export const LABELS_MAX = 4;
export const LABEL_MAX = 32;
export const FILES_MAX = RANKED_FILES_MAX;

/**
 * `text` cut to at most `max` UTF-16 units, with an ellipsis when cut. Never
 * splits a surrogate pair, so an emoji at the boundary cannot become a lone
 * half that `JSON.stringify` would escape.
 */
export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  let end = max - 1;
  const code = text.charCodeAt(end - 1);
  if (code >= 0xd800 && code <= 0xdbff) end -= 1;
  return `${text.slice(0, end).trimEnd()}…`;
}

/** At most `LABELS_MAX` labels of at most `LABEL_MAX` characters each. */
export function compactLabels(labels: readonly string[]): string[] {
  return labels.slice(0, LABELS_MAX).map((label) => truncate(label, LABEL_MAX));
}

/* ----------------------------------------------------------------- issues */

/**
 * Every open issue the survey reached, once each: the health sample first
 * (76.6 request A1), then `issueBacklog`.
 */
export function surveyedIssues(snapshot: RepositorySnapshot): IssueSummary[] {
  const seen = new Set<number>();
  const out: IssueSummary[] = [];
  for (const issue of [...snapshot.issues, ...(snapshot.issueBacklog ?? [])]) {
    if (seen.has(issue.number)) continue;
    seen.add(issue.number);
    out.push(issue);
  }
  return out;
}

export function toBacklogIssue(
  issue: IssueSummary,
  districts: readonly DistrictPlan[],
  now: Date,
): BacklogIssue {
  const { score, state } = classifyIssue(issue, now);
  const reactions = issue.reactions ?? 0;
  return {
    number: issue.number,
    title: truncate(issue.title, TITLE_MAX),
    createdAt: issue.createdAt,
    updatedAt: issue.updatedAt,
    comments: issue.comments,
    reactions,
    labels: compactLabels(issue.labels),
    author: issue.author,
    state,
    // Form and relatedPath read the full labels, title and body, before any
    // of them is cut or dropped.
    form: issueFormFor(issue, state, now),
    score,
    relatedPath: relatedPathFor(issue, districts),
    heat: heatOf(issue.comments, reactions),
  };
}

/**
 * The crowd of issues: every surveyed open issue except the heroes, the
 * `ISSUE_CEILING - heroes` most recently updated, in significance order.
 * Wrecks are then held to a quarter of the crowd: the most significant keep
 * the shape and the rest become potholes (`capWrecks`, 76.7).
 */
export function buildIssueBacklog(
  snapshot: RepositorySnapshot,
  heroes: readonly Pick<RankedIssue, "number">[],
  districts: readonly DistrictPlan[],
  now: Date,
): BacklogIssue[] {
  const heroNumbers = new Set(heroes.map((hero) => hero.number));
  const room = Math.max(0, ISSUE_CEILING - heroNumbers.size);
  const crowd = surveyedIssues(snapshot)
    .filter((issue) => !heroNumbers.has(issue.number))
    .sort(byRecency)
    .slice(0, room)
    .map((issue) => toBacklogIssue(issue, districts, now))
    .sort(bySignificance);
  return capWrecks(crowd);
}

/* ------------------------------------------------------------------ pulls */

export function toBacklogPull(
  pull: PullSummary,
  districts: readonly DistrictPlan[],
  now: Date,
): BacklogPull {
  const { score, state } = classifyPull(pull, now);
  const reactions = pull.reactions ?? 0;
  const files = pull.files ?? [];
  return {
    number: pull.number,
    title: truncate(pull.title, TITLE_MAX),
    createdAt: pull.createdAt,
    updatedAt: pull.updatedAt,
    draft: pull.draft,
    comments: pull.comments,
    reactions,
    labels: compactLabels(pull.labels),
    author: pull.author,
    // Open pull requests only, so never "completed".
    state,
    form: pullForm({ author: pull.author, labels: pull.labels, draft: pull.draft, files }),
    score,
    relatedPath: pullRelatedPath({ title: pull.title, files }, districts),
    files: files.slice(0, FILES_MAX),
    review: pull.review ?? null,
    checks: pull.checks ?? null,
    heat: heatOf(pull.comments, reactions),
  };
}

/**
 * The crowd of pull requests: every open pull request except the open heroes,
 * the `PULL_CEILING - open heroes` most recently updated, in significance
 * order. Merged heroes do not count against the ceiling: it is a count of
 * open pull requests.
 */
export function buildPullBacklog(
  snapshot: RepositorySnapshot,
  heroes: readonly Pick<RankedPull, "number" | "state">[],
  districts: readonly DistrictPlan[],
  now: Date,
): BacklogPull[] {
  const heroNumbers = new Set(
    heroes.filter((hero) => hero.state !== "completed").map((hero) => hero.number),
  );
  const room = Math.max(0, PULL_CEILING - heroNumbers.size);
  return openPullsOf(snapshot)
    .filter((pull) => !heroNumbers.has(pull.number))
    .sort(byRecency)
    .slice(0, room)
    .map((pull) => toBacklogPull(pull, districts, now))
    .sort(bySignificance);
}

/* ---------------------------------------------------------------- payload */

/**
 * 76.6: "300 KB plus the backlog, hard ceiling 1 MB". The analysis itself is
 * held a little under the ceiling so the NDJSON envelope around it fits too.
 */
export const PAYLOAD_CEILING = 1_000_000;
export const PAYLOAD_TARGET = 960_000;

/** UTF-8 byte length of a string, without allocating an encoded copy. */
export function utf8Length(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && (text.charCodeAt(i + 1) & 0xfc00) === 0xdc00) {
      bytes += 4;
      i += 1;
    } else bytes += 3;
  }
  return bytes;
}

/**
 * Trims the least significant end of the crowd until the backlog fits in
 * `budget` bytes of JSON. Realistic giants never reach it (about 290 bytes an
 * issue and 460 a pull request, so 1,000 and 500 come to about 520 KB); it
 * exists so that a repository of 140-character titles and long monorepo paths
 * cannot push the payload past the ceiling. Whatever is trimmed is simply not
 * drawn, so it joins the overflow queue with everything past the ceilings.
 *
 * Both lists are trimmed in proportion to their ceilings, so neither is
 * emptied to save the other.
 */
export function fitBacklog(
  issues: BacklogIssue[],
  pulls: BacklogPull[],
  budget: number,
): { issues: BacklogIssue[]; pulls: BacklogPull[]; trimmed: number } {
  // Each item costs its JSON plus the comma that separates it.
  const issueBytes = issues.map((item) => utf8Length(JSON.stringify(item)) + 1);
  const pullBytes = pulls.map((item) => utf8Length(JSON.stringify(item)) + 1);
  let total = issueBytes.reduce((a, b) => a + b, 0) + pullBytes.reduce((a, b) => a + b, 0);
  let i = issues.length;
  let p = pulls.length;
  while (total > budget && i + p > 0) {
    const trimIssue = p === 0 || (i > 0 && i / ISSUE_CEILING >= p / PULL_CEILING);
    if (trimIssue) total -= issueBytes[--i];
    else total -= pullBytes[--p];
  }
  return {
    issues: i === issues.length ? issues : issues.slice(0, i),
    pulls: p === pulls.length ? pulls : pulls.slice(0, p),
    trimmed: issues.length - i + (pulls.length - p),
  };
}

/* ----------------------------------------------------------------- totals */

/**
 * The real open totals for the HUD and the overflow queue, or `undefined`
 * without `openTotals`. Never below what the survey itself counted, so
 * `drawn + hidden = total` cannot go negative when GitHub's count lags a page.
 */
export function openTotalsFor(
  snapshot: RepositorySnapshot,
): { issues: number; pulls: number } | undefined {
  const totals = snapshot.openTotals;
  if (!totals) return undefined;
  return {
    issues: Math.max(totals.issues, surveyedIssues(snapshot).length),
    pulls: Math.max(totals.pulls, openPullsOf(snapshot).length),
  };
}
