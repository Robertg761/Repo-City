/**
 * Orchestrates the ~15 requests of PLAN.md section 29 into one
 * `RepositorySnapshot`.
 *
 * Shape of the run:
 *
 * 1. repository metadata, alone, because it settles the canonical name and the
 *    default branch every other request needs (and a rename redirect must be
 *    resolved before anything else is built from the user's input)
 * 2. everything else in parallel through `Promise.allSettled`
 *
 * Only metadata and the tree are fatal. Every other failure degrades exactly
 * one signal: the value becomes empty, a line goes into `warnings`, the stage
 * reports `failed`, and the city is still built (PLAN.md section 29).
 *
 * Progress is reported through `onStage` as it happens. The events are factual
 * — they describe what was actually fetched — because PLAN.md section 44 says
 * never to fabricate a completed stage.
 */

import type { RepositorySnapshot } from "@/types/repository";
import {
  COMMITS_PER_PAGE,
  CONTRIBUTORS_PER_PAGE,
  fetchCommits,
  fetchContributors,
  fetchReleases,
} from "./activity.ts";
import { GitHubClient } from "./client.ts";
import { ERROR_COPY, GitHubError, errorCodeOf, warningFor } from "./errors.ts";
import { fetchFile, fetchReadme, selectManifests, type SnapshotFile } from "./files.ts";
import { ENRICHMENT_DEADLINE_MS, PAGE_DEADLINE_MS } from "./budgets.ts";
import { fetchRepository } from "./repository.ts";
import { surveyOpenWork } from "./survey.ts";
import { fetchTree } from "./tree.ts";
import { fetchWorkflowRuns, fetchWorkflows } from "./workflows.ts";

/** Stage ids from PLAN.md section 44. `ai` and `done` belong to the route. */
export type StageId = "discover" | "tree" | "issues" | "pulls" | "ci" | "activity" | "ai" | "done";

export type StageStatus = "running" | "done" | "failed";

/**
 * One progress event. Serialized verbatim into the NDJSON stream as
 * `{"type":"stage", ...}` (PLAN.md section 44).
 */
export interface StageEvent {
  id: StageId;
  status: StageStatus;
  /** Factual detail, e.g. `"4,218 files mapped"`. Never invented. */
  detail?: string;
}

export type StageListener = (event: StageEvent) => void;

export interface SnapshotOptions {
  onStage?: StageListener;
  /** Cancels every in-flight request (client disconnect, overall deadline). */
  signal?: AbortSignal;
  /** Defaults to `process.env.GITHUB_TOKEN`. */
  token?: string;
  /** Test seam. */
  fetchImpl?: typeof fetch;
  /** Test seam; overrides `token`/`signal`/`fetchImpl`. */
  client?: GitHubClient;
  /** Test seam: the page and enrichment deadlines, in ms from T0 (PLAN.md section 76.6). */
  budgets?: Partial<SurveyBudgets>;
}

export interface SurveyBudgets {
  pageDeadlineMs: number;
  enrichmentDeadlineMs: number;
}

/** An `AbortSignal` that fires after `ms` (at once when `ms <= 0`). */
function timeoutSignal(ms: number): AbortSignal {
  return AbortSignal.timeout(Math.max(0, Math.floor(ms)));
}

const count = (n: number): string => n.toLocaleString("en-US");
const plural = (n: number, one: string, many = `${one}s`): string =>
  `${count(n)} ${n === 1 ? one : many}`;

/**
 * The activity stage's detail. Commits and contributors are one page each, so
 * a full page is a floor, not a total: 100 commits are the 100 most recent,
 * and 100 contributors means at least 100. A short page is the whole list. A
 * request that failed says nothing rather than claiming zero.
 */
export function activityDetail(commits: number | null, contributors: number | null): string {
  const parts: string[] = [];
  if (commits !== null) {
    parts.push(commits >= COMMITS_PER_PAGE ? plural(commits, "recent commit") : plural(commits, "commit"));
  }
  if (contributors !== null) {
    const people = plural(contributors, "contributor");
    parts.push(contributors >= CONTRIBUTORS_PER_PAGE ? `at least ${people}` : people);
  }
  return parts.length > 0 ? parts.join(", ") : "commits and contributors unavailable";
}

/**
 * @param owner owner as typed by the user; the canonical one comes from the
 * metadata response.
 * @param repo repository as typed by the user.
 */
export async function fetchSnapshot(
  owner: string,
  repo: string,
  options: SnapshotOptions = {},
): Promise<RepositorySnapshot> {
  // T0: every survey deadline counts from here.
  const t0 = Date.now();
  const budgets: SurveyBudgets = {
    pageDeadlineMs: options.budgets?.pageDeadlineMs ?? PAGE_DEADLINE_MS,
    enrichmentDeadlineMs: options.budgets?.enrichmentDeadlineMs ?? ENRICHMENT_DEADLINE_MS,
  };
  const client =
    options.client ??
    new GitHubClient({
      token: options.token,
      signal: options.signal,
      fetchImpl: options.fetchImpl,
    });

  const warnings: string[] = [];
  const emit = (event: StageEvent): void => {
    try {
      options.onStage?.(event);
    } catch {
      // A broken listener must never take the analysis down with it.
    }
  };

  /** Runs one optional request: failure costs a warning, not the analysis. */
  const soft = async <T>(
    label: string,
    run: () => Promise<T>,
    fallback: T,
  ): Promise<{ ok: boolean; value: T }> => {
    try {
      return { ok: true, value: await run() };
    } catch (error) {
      warnings.push(warningFor(label, error));
      return { ok: false, value: fallback };
    }
  };

  // ---- 1. metadata (fatal) -------------------------------------------------
  emit({ id: "discover", status: "running" });
  let discovered;
  try {
    discovered = await fetchRepository(client, owner, repo);
  } catch (error) {
    emit({ id: "discover", status: "failed", detail: `${owner}/${repo}` });
    throw asGitHubError(error, "repository");
  }

  const { meta } = discovered;
  const canonicalOwner = discovered.owner;
  const canonicalRepo = discovered.repo;
  const branch = meta.defaultBranch;

  if (discovered.renamedFrom) {
    warnings.push(`${discovered.renamedFrom} now redirects to ${meta.fullName}.`);
  }
  emit({
    id: "discover",
    status: "done",
    detail: meta.archived ? `${meta.fullName} (archived)` : meta.fullName,
  });

  // ---- 2. everything else, in parallel ------------------------------------
  emit({ id: "tree", status: "running" });
  emit({ id: "issues", status: "running" });
  emit({ id: "pulls", status: "running" });
  emit({ id: "ci", status: "running" });
  emit({ id: "activity", status: "running" });

  const treeTask = fetchTree(client, canonicalOwner, canonicalRepo, branch);
  const treeStage = treeTask.then(
    (pruned) => {
      emit({
        id: "tree",
        status: "done",
        // The uncapped count (section 76.4): what the settlement is sized by.
        detail: `${plural(pruned.tree.totalFiles ?? pruned.stats.files, "file")} mapped${
          pruned.tree.truncated ? " (partial survey)" : ""
        }`,
      });
      return pruned;
    },
    (error) => {
      emit({ id: "tree", status: "failed", detail: "file tree unavailable" });
      throw asGitHubError(error, "tree");
    },
  );

  // README starts immediately; manifests wait for the tree that names them.
  const filesTask = collectFiles(
    client,
    canonicalOwner,
    canonicalRepo,
    branch,
    treeTask,
    soft,
  );

  // Issues and pull requests share one survey (PLAN.md section 76.6): the
  // pages of one list feed the other's comment counts, and the totals decide
  // the top-up. Its deadlines run from T0 and never hold up the tree.
  const surveyTask = surveyOpenWork(client, canonicalOwner, canonicalRepo, {
    openIssuesCount: meta.openIssuesCount,
    pageDeadline: timeoutSignal(budgets.pageDeadlineMs - (Date.now() - t0)),
    enrichmentDeadline: timeoutSignal(budgets.enrichmentDeadlineMs - (Date.now() - t0)),
    onIssues: (progress) => emit({ id: "issues", ...progress }),
    onPulls: (progress) => emit({ id: "pulls", ...progress }),
  });

  const ciStage = Promise.all([
    soft("workflows", () => fetchWorkflows(client, canonicalOwner, canonicalRepo), []),
    soft("workflow runs", () => fetchWorkflowRuns(client, canonicalOwner, canonicalRepo, branch), []),
  ]).then(([workflows, runs]) => {
    const ok = workflows.ok || runs.ok;
    emit({
      id: "ci",
      status: ok ? "done" : "failed",
      detail: !ok
        ? "CI status unavailable"
        : workflows.value.length === 0
          ? "no GitHub Actions workflows"
          : `${plural(workflows.value.length, "workflow")} detected`,
    });
    return { workflows: workflows.value, runs: runs.value };
  });

  const activityStage = Promise.all([
    soft("commits", () => fetchCommits(client, canonicalOwner, canonicalRepo), []),
    soft("contributors", () => fetchContributors(client, canonicalOwner, canonicalRepo), []),
    soft("releases", () => fetchReleases(client, canonicalOwner, canonicalRepo), []),
  ]).then(([commits, contributors, releases]) => {
    const ok = commits.ok || contributors.ok || releases.ok;
    emit({
      id: "activity",
      status: ok ? "done" : "failed",
      detail: ok
        ? activityDetail(
            commits.ok ? commits.value.length : null,
            contributors.ok ? contributors.value.length : null,
          )
        : "activity unavailable",
    });
    return {
      commits: commits.value,
      contributors: contributors.value,
      releases: releases.value,
    };
  });

  const settled = await Promise.allSettled([
    treeStage,
    filesTask,
    surveyTask,
    ciStage,
    activityStage,
  ]);

  const treeResult = settled[0];
  if (treeResult.status === "rejected") {
    throw asGitHubError(treeResult.reason, "tree");
  }
  const tree = treeResult.value;

  const files = valueOf(settled[1], [] as SnapshotFile[]);
  const survey = valueOf(settled[2], null);
  const ci = valueOf(settled[3], { workflows: [], runs: [] });
  const activity = valueOf(settled[4], { commits: [], contributors: [], releases: [] });

  warnings.push(...tree.warnings);
  if (tree.tree.truncated) warnings.push(ERROR_COPY.TOO_LARGE);
  // The survey settles every request itself; a rejection here is a bug, and
  // still only costs the issue and pull request signals.
  if (survey) warnings.push(...survey.warnings);
  else warnings.push(warningFor("issues", settled[2].status === "rejected" ? settled[2].reason : null));

  // The head SHA seeds the whole city (PLAN.md section 35). The newest commit
  // is the source of truth; the tree object SHA keeps the seed stable when the
  // commits request degraded.
  const headSha = activity.commits[0]?.sha ?? tree.sha ?? "";

  return {
    repo: { ...meta, headSha },
    tree: tree.tree,
    commits: activity.commits,
    issues: survey?.issues ?? [],
    pulls: survey?.pulls ?? [],
    contributors: activity.contributors,
    workflows: ci.workflows,
    workflowRuns: ci.runs,
    releases: activity.releases,
    files,
    fetchedAt: new Date().toISOString(),
    requestCount: client.requestCount,
    warnings,
    issueBacklog: survey?.issueBacklog ?? [],
    ...(survey?.openTotals ? { openTotals: survey.openTotals } : {}),
    ...(survey ? { coverage: survey.coverage } : {}),
  };
}

/** README first, then the manifests the tree turned out to contain. */
async function collectFiles(
  client: GitHubClient,
  owner: string,
  repo: string,
  branch: string,
  treeTask: Promise<{ tree: RepositorySnapshot["tree"] }>,
  soft: <T>(label: string, run: () => Promise<T>, fallback: T) => Promise<{ ok: boolean; value: T }>,
): Promise<SnapshotFile[]> {
  const readmeTask = soft("readme", () => fetchReadme(client, owner, repo), null);

  const manifestTask = (async (): Promise<SnapshotFile[]> => {
    let paths: string[] = [];
    try {
      paths = selectManifests((await treeTask).tree.entries);
    } catch {
      // The tree is fatal and reported elsewhere; here it just means no
      // manifests to look for.
      return [];
    }
    const fetched = await Promise.all(
      paths.map((path) => soft(`manifest ${path}`, () => fetchFile(client, owner, repo, path, branch), null)),
    );
    return fetched.map((result) => result.value).filter((file): file is SnapshotFile => file !== null);
  })();

  const [readme, manifests] = await Promise.all([readmeTask, manifestTask]);
  return [...(readme.value ? [readme.value] : []), ...manifests];
}

function valueOf<T>(result: PromiseSettledResult<T>, fallback: T): T {
  return result.status === "fulfilled" ? result.value : fallback;
}

/** Keeps the error vocabulary closed: anything unknown becomes UPSTREAM. */
function asGitHubError(error: unknown, resource: string): GitHubError {
  if (error instanceof GitHubError) return error;
  return new GitHubError(errorCodeOf(error), `${resource} failed`, { resource, cause: error });
}
