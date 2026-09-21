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
import { analyzeSnapshot } from "@/lib/analysis/analyze";
import { getCachedAnalysis, setCachedAnalysis } from "@/lib/cache";
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

/**
 * Whole-request budget. Under `maxDuration = 60`, this leaves room to still
 * write a TIMEOUT line instead of having the platform cut the connection.
 */
const SURVEY_BUDGET_MS = 45_000;

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

    const clientId = clientIdFromHeaders(request.headers);
    if (!checkRateLimit(clientId).allowed) {
      emit(errorLine("RATE_LIMITED", LOCAL_RATE_LIMIT_MESSAGE));
      return;
    }

    const requestedName = `${ref.owner}/${ref.repo}`;
    const cached = getCachedAnalysis(requestedName);
    if (cached) {
      replayStages(emit, cached, "cached survey");
      emit({ type: "result", analysis: cached });
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

      const analysis = await analyzeSnapshot(snapshot, {
        onStage: (event) => emit(stageLine(event)),
      });

      // Cache under the canonical name GitHub reported and, when the user
      // typed an old name, under that too, so a redirect costs one survey.
      setCachedAnalysis(analysis.repo.fullName, analysis);
      if (analysis.repo.fullName.toLowerCase() !== requestedName.toLowerCase()) {
        setCachedAnalysis(requestedName, analysis);
      }

      emit(stageLine({ id: "done", status: "done", detail: analysis.repo.fullName }));
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
 */
function replayStages(emit: Emit, analysis: RepoAnalysis, doneDetail: string): void {
  const { metrics } = analysis;
  const events: AnalyzeEvent[] = [
    stageLine({ id: "discover", status: "done", detail: analysis.repo.fullName }),
    stageLine({
      id: "tree",
      status: "done",
      detail: `${metrics.scale.files.toLocaleString("en-US")} files mapped`,
    }),
    stageLine({
      id: "issues",
      status: "done",
      detail: `${metrics.issues.open.toLocaleString("en-US")} issues inspected`,
    }),
    stageLine({
      id: "pulls",
      status: "done",
      detail: `${metrics.pulls.open.toLocaleString("en-US")} pull requests reviewed`,
    }),
    stageLine({ id: "ci", status: "done", detail: ciDetail(analysis) }),
    stageLine({
      id: "activity",
      status: "done",
      detail: `${metrics.activity.commitsLast30d.toLocaleString("en-US")} commits in the last 30 days`,
    }),
  ];

  if (analysis.aiStatus === "ok") {
    events.push(stageLine({ id: "ai", status: "done", detail: analysis.ai?.model ?? "interpretation" }));
  } else if (analysis.aiStatus === "failed") {
    events.push(stageLine({ id: "ai", status: "failed", detail: "interpretation unavailable" }));
  }

  events.push(stageLine({ id: "done", status: "done", detail: doneDetail }));
  for (const event of events) emit(event);
}

function ciDetail(analysis: RepoAnalysis): string {
  switch (analysis.metrics.ci.state) {
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
