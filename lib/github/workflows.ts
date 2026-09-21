/**
 * Requests 8 and 9 of PLAN.md section 29: Actions workflows and recent runs.
 *
 * These drive the power plant (PLAN.md section 14): workflow count sets its
 * size, the conclusions of recent runs set whether it hums, sputters or is
 * dark. Both endpoints answer 202 or 204 with no body on new or very large
 * repositories, which the client already turns into an empty list.
 */

import type { GhWorkflowRun, GhWorkflowRunsResponse, GhWorkflowsResponse } from "@/types/github";
import type { RepositorySnapshot } from "@/types/repository";
import { GitHubClient } from "./client.ts";

export type WorkflowSummary = RepositorySnapshot["workflows"][number];
export type WorkflowRunSummary = RepositorySnapshot["workflowRuns"][number];

export const RUNS_PER_PAGE = 50;

export async function fetchWorkflows(
  client: GitHubClient,
  owner: string,
  repo: string,
): Promise<WorkflowSummary[]> {
  const body = await client.get<GhWorkflowsResponse>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/workflows`,
    { resource: "workflows" },
  );
  return mapWorkflows(body);
}

/**
 * Runs are scoped to the default branch: a failing run on somebody's feature
 * branch is not a statement about the project's reliability.
 */
export async function fetchWorkflowRuns(
  client: GitHubClient,
  owner: string,
  repo: string,
  branch: string,
): Promise<WorkflowRunSummary[]> {
  const body = await client.get<GhWorkflowRunsResponse>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/runs`,
    { resource: "workflow runs", query: { per_page: RUNS_PER_PAGE, branch } },
  );
  return mapWorkflowRuns(body);
}

export function mapWorkflows(body: GhWorkflowsResponse | null): WorkflowSummary[] {
  if (!body || !Array.isArray(body.workflows)) return [];
  return body.workflows
    .filter((workflow) => workflow && typeof workflow.id === "number")
    .map((workflow) => ({
      id: workflow.id,
      name: workflow.name ?? workflow.path ?? "",
      path: workflow.path ?? "",
      state: workflow.state ?? "unknown",
    }));
}

export function mapWorkflowRuns(body: GhWorkflowRunsResponse | null): WorkflowRunSummary[] {
  if (!body || !Array.isArray(body.workflow_runs)) return [];
  return body.workflow_runs
    .filter((run): run is GhWorkflowRun => Boolean(run) && typeof run.id === "number")
    .map((run) => ({
      id: run.id,
      workflowId: run.workflow_id ?? 0,
      name: run.name ?? "",
      status: run.status ?? "unknown",
      conclusion: run.conclusion ?? null,
      createdAt: run.created_at ?? "",
      url: run.html_url ?? "",
    }));
}
