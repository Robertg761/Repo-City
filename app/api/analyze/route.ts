/**
 * `/api/analyze` — the only server entry point (PLAN.md sections 29, 30, 44).
 *
 * `POST {"repo":"owner/repo"}` for the app, `GET ?repo=owner/repo` for curl.
 * Both answer the same newline-delimited JSON stream: stage events as the
 * survey happens, then exactly one terminal `result` or `error` line.
 *
 * Transport note for W7: the HTTP status is always 200 and failures arrive as
 * an in-band `{"type":"error"}` line. A streamed body cannot change its status
 * after the first byte, so putting every failure in the body is the only way
 * to report the ones that happen mid-survey consistently. Read the stream, not
 * `response.ok`.
 *
 * Order of business per request:
 *   1. parse the input            -> INVALID_URL
 *   2. per-IP rate limit          -> RATE_LIMITED (Repo City's own copy)
 *   3. in-memory cache hit        -> stages done instantly, then the result
 *   4. survey + analysis          -> live stages, then the result
 *   5. rate limited by GitHub     -> fixture fallback if enabled, else error
 */

import type { NextRequest } from "next/server";
import { getInterpreter } from "@/lib/ai";
import { analyzeSnapshot } from "@/lib/analysis/analyze";
import { getCachedAnalysis, setCachedAnalysis } from "@/lib/cache";
// Whole-request budget (45 s under `maxDuration = 60`, leaving room to still
// write a TIMEOUT line). The survey's page (22 s) and enrichment (30 s)
// deadlines sit inside it; `lib/github/budgets.ts` holds all three.
import { SURVEY_BUDGET_MS } from "@/lib/github/budgets";
import { ERROR_COPY, LOCAL_RATE_LIMIT_MESSAGE, errorCodeOf } from "@/lib/github/errors";
import { isFixtureFallbackEnabled, loadFixtureAnalysis } from "@/lib/github/fixtures";
import { parseRepoUrl } from "@/lib/github/parseRepoUrl";
import { fetchSnapshot } from "@/lib/github/snapshot";
import {
  type AnalyzeEvent,
  type Emit,
  NDJSON_HEADERS,
  createEventStream,
  errorLine,
  stageLine,
} from "@/lib/github/stream";
import { checkRateLimit, clientIdFromHeaders } from "@/lib/ratelimit";
import type { RepoAnalysis } from "@/types/analysis";

export const runtime = "nodejs";
export const maxDuration = 60;
/** The route is a live survey; it must never be prerendered or cached. */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<Response> {
  return handle(request, request.nextUrl.searchParams.get("repo") ?? "");
}

export async function POST(request: NextRequest): Promise<Response> {
  let input = "";
  try {
    const body: unknown = await request.json();
    if (body && typeof body === "object" && typeof (body as { repo?: unknown }).repo === "string") {
      input = (body as { repo: string }).repo;
    }
  } catch {
    // A malformed body is just an invalid repository reference.
  }
  return handle(request, input);
}

function handle(request: NextRequest, input: string): Response {
  const stream = createEventStream(async (emit) => {
    const ref = parseRepoUrl(input);
    if (!ref) {
      emit(errorLine("INVALID_URL"));
      return;
    }

    // The cache is checked before the limiter on purpose: a cached analysis
    // costs GitHub nothing, and during voting a lot of people will open the
    // same two demo repositories in a row. The limit exists to protect the
    // token, so it only guards surveys that actually spend it.
    const requestedName = `${ref.owner}/${ref.repo}`;
    const cached = getCachedAnalysis(requestedName);
    if (cached) {
      replayStages(emit, cached, "cached survey");
      emit({ type: "result", analysis: cached });
      return;
    }

    const clientId = clientIdFromHeaders(request.headers);
    if (!checkRateLimit(clientId).allowed) {
      emit(errorLine("RATE_LIMITED", LOCAL_RATE_LIMIT_MESSAGE));
      return;
    }

    const deadline = AbortSignal.timeout(SURVEY_BUDGET_MS);
    const signal =
      typeof AbortSignal.any === "function"
        ? AbortSignal.any([deadline, request.signal])
        : deadline;

    try {
      const snapshot = await fetchSnapshot(ref.owner, ref.repo, {
        signal,
        onStage: (event) => emit(stageLine(event)),
      });

      const interpreter = await getInterpreter(snapshot.repo.fullName, process.env);
      const analysis = await analyzeSnapshot(snapshot, {
        interpreter: interpreter ?? undefined,
        onStage: (event) => emit(stageLine(event)),
      });

      // Cache under the canonical name GitHub reported and, when the user
      // typed an old name, under that too, so a redirect costs one survey.
      setCachedAnalysis(analysis.repo.fullName, analysis);
      if (analysis.repo.fullName.toLowerCase() !== requestedName.toLowerCase()) {
        setCachedAnalysis(requestedName, analysis);
      }

      // `analyzeSnapshot` already emitted the single `done` stage for this
      // request (PLAN.md section 44); a second one here would draw a duplicate
      // row in the progress panel.
      emit({ type: "result", analysis });
    } catch (error) {
      const code = errorCodeOf(error);

      if (code === "RATE_LIMITED" && isFixtureFallbackEnabled()) {
        const fixture = await loadFixtureAnalysis(ref.owner, ref.repo);
        if (fixture) {
          replayStages(emit, fixture, "cached snapshot");
          emit({ type: "result", analysis: fixture });
          return;
        }
      }

      emit(errorLine(code, ERROR_COPY[code]));
    }
  });

  return new Response(stream, { status: 200, headers: NDJSON_HEADERS });
}

/**
 * Cache and fixture hits still walk the HUD through the same stages, filled
 * from the stored analysis so every line stays factual (PLAN.md section 44).
 * `note` says where the analysis came from and rides on the `discover` line,
 * so the `done` line stays identical to the one a live survey writes.
 */
function replayStages(emit: Emit, analysis: RepoAnalysis, note: string): void {
  // Counts are read defensively: a hand-written fixture is allowed to be
  // sparse, and a missing number must not turn a working fallback into a
  // crash halfway through the stream.
  const metrics = analysis.metrics ?? ({} as RepoAnalysis["metrics"]);
  const count = (value: number | undefined): string => (value ?? 0).toLocaleString("en-US");

  const events: AnalyzeEvent[] = [
    stageLine({
      id: "discover",
      status: "done",
      detail: `${analysis.repo?.fullName ?? ""} (${note})`,
    }),
    stageLine({
      id: "tree",
      status: "done",
      detail: `${count(metrics.scale?.totalFiles ?? metrics.scale?.files)} files mapped`,
    }),
    stageLine({ id: "issues", status: "done", detail: issuesReplayDetail(analysis) }),
    stageLine({ id: "pulls", status: "done", detail: pullsReplayDetail(analysis) }),
    stageLine({ id: "ci", status: "done", detail: ciDetail(analysis) }),
    stageLine({
      id: "activity",
      status: "done",
      detail: `${count(metrics.activity?.commitsLast30d)} commits in the last 30 days`,
    }),
  ];

  if (analysis.aiStatus === "ok") {
    events.push(stageLine({ id: "ai", status: "done", detail: analysis.ai?.model ?? "interpretation" }));
  } else if (analysis.aiStatus === "failed") {
    events.push(stageLine({ id: "ai", status: "failed", detail: "interpretation unavailable" }));
  }

  // The same terminal line a live survey ends on: `analyzeSnapshot` reports
  // the health score there, and a replay must not look different.
  events.push(stageLine({ id: "done", status: "done", detail: doneDetail(analysis) }));
  for (const event of events) emit(event);
}

/**
 * Replayed issue and pull lines. An analysis that carries real open totals
 * (PLAN.md section 76.6) says those; an older one keeps today's sample line.
 */
function issuesReplayDetail(analysis: RepoAnalysis): string {
  const issues = analysis.metrics?.issues;
  if (typeof issues?.total === "number") {
    return `${totalText(issues.total, analysis.totalsExact)} open issues`;
  }
  return `${(issues?.open ?? 0).toLocaleString("en-US")} issues inspected`;
}

function pullsReplayDetail(analysis: RepoAnalysis): string {
  const pulls = analysis.metrics?.pulls;
  if (typeof pulls?.total === "number") {
    return `${totalText(pulls.total, analysis.totalsExact)} open pull requests`;
  }
  return `${(pulls?.open ?? 0).toLocaleString("en-US")} pull requests reviewed`;
}

function totalText(total: number, exact: boolean | undefined): string {
  const text = total.toLocaleString("en-US");
  return exact === false ? `about ${text}` : text;
}

/** The `done` detail, always the health score, on every path. */
function doneDetail(analysis: RepoAnalysis): string | undefined {
  const score = analysis.metrics?.health?.score;
  return typeof score === "number" ? `${score}` : undefined;
}

function ciDetail(analysis: RepoAnalysis): string {
  switch (analysis.metrics?.ci?.state) {
    case "healthy":
      return "CI healthy";
    case "recent-failure":
      return "recent CI failure";
    case "failing":
      return "CI failing";
    case "none":
      return "no GitHub CI detected";
    default:
      return "CI status unknown";
  }
}
