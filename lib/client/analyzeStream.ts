/**
 * The browser half of the streaming analysis protocol (PLAN.md section 44).
 *
 * `/api/analyze` answers a POST with a newline-delimited JSON body. Every line
 * is one event: a `stage` progress update, the final `result`, or an `error`.
 * The client renders exactly the events it receives - there is no timer that
 * ticks stages forward, and no stage is ever marked done speculatively.
 */

import type { RepoAnalysis } from "@/types/analysis";
import { canonicalErrorCode, errorCopyFor } from "./errorCopy";

export type StageStatus = "pending" | "running" | "done" | "failed";

export interface StageEvent {
  type: "stage";
  id: string;
  status: StageStatus;
  detail?: string;
}

export interface ResultEvent {
  type: "result";
  analysis: RepoAnalysis;
}

export interface ErrorEvent {
  type: "error";
  code: string;
  message: string;
}

export type AnalyzeEvent = StageEvent | ResultEvent | ErrorEvent;

export interface AnalyzeHandlers {
  /** Called once per `stage` line, in arrival order. */
  onStage(event: StageEvent): void;
  signal?: AbortSignal;
}

/** Rejection value of `analyzeRepository`; `{ code, message }` shaped for the store. */
export class AnalyzeError extends Error {
  readonly code: string;

  constructor(code: string, message?: string) {
    const canonical = canonicalErrorCode(code);
    super(errorCopyFor(canonical, message));
    this.name = "AnalyzeError";
    this.code = canonical;
  }
}

export const ANALYZE_ENDPOINT = "/api/analyze";

const STAGE_STATUSES: readonly StageStatus[] = ["pending", "running", "done", "failed"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Parses one NDJSON line, throwing `AnalyzeError` when it is not a valid event. */
export function parseEventLine(line: string): AnalyzeEvent {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    throw new AnalyzeError("STREAM_FAILED", "The survey response could not be read.");
  }

  if (!isRecord(parsed)) {
    throw new AnalyzeError("STREAM_FAILED", "The survey response could not be read.");
  }

  if (parsed.type === "stage") {
    const { id, status, detail } = parsed;
    if (typeof id !== "string" || typeof status !== "string") {
      throw new AnalyzeError("STREAM_FAILED", "The survey response could not be read.");
    }
    if (!STAGE_STATUSES.includes(status as StageStatus)) {
      throw new AnalyzeError("STREAM_FAILED", "The survey response could not be read.");
    }
    return {
      type: "stage",
      id,
      status: status as StageStatus,
      detail: typeof detail === "string" ? detail : undefined,
    };
  }

  if (parsed.type === "result") {
    if (!isRecord(parsed.analysis)) {
      throw new AnalyzeError("STREAM_FAILED", "The survey finished without a city.");
    }
    return { type: "result", analysis: parsed.analysis as unknown as RepoAnalysis };
  }

  if (parsed.type === "error") {
    const code = typeof parsed.code === "string" ? parsed.code : "ANALYSIS_FAILED";
    const message = typeof parsed.message === "string" ? parsed.message : undefined;
    return { type: "error", code, message: errorCopyFor(code, message) };
  }

  throw new AnalyzeError("STREAM_FAILED", "The survey response could not be read.");
}

function isAbort(cause: unknown): boolean {
  return (
    isRecord(cause) &&
    (cause.name === "AbortError" || (cause as { code?: unknown }).code === "ABORTED")
  );
}

/** HTTP status -> plan error code, for failures that never reach the stream. */
function codeForStatus(status: number): string {
  if (status === 400 || status === 422) return "INVALID_URL";
  if (status === 404) return "NOT_FOUND";
  if (status === 408 || status === 504) return "TIMEOUT";
  if (status === 403 || status === 429) return "RATE_LIMITED";
  return "ANALYSIS_FAILED";
}

async function errorFromResponse(response: Response): Promise<AnalyzeError> {
  let code = codeForStatus(response.status);
  let message: string | undefined;
  try {
    const body = await response.text();
    const parsed: unknown = body ? JSON.parse(body) : null;
    if (isRecord(parsed)) {
      if (typeof parsed.code === "string") code = parsed.code;
      if (typeof parsed.message === "string") message = parsed.message;
    }
  } catch {
    // A non-JSON error body tells us nothing useful; the status already did.
  }
  return new AnalyzeError(code, message);
}

/**
 * POSTs `{ repo }` to `/api/analyze` and drains the NDJSON body, forwarding
 * every stage event to `handlers.onStage`.
 *
 * Resolves with the `RepoAnalysis` from the `result` event. Rejects with an
 * `AnalyzeError` (`{ code, message }`) on an `error` event, a network failure,
 * a malformed line, or a stream that ends without a result. An aborted request
 * rejects with code `ABORTED`, which callers are expected to ignore.
 */
export async function analyzeRepository(
  input: string,
  handlers: AnalyzeHandlers,
): Promise<RepoAnalysis> {
  const { onStage, signal } = handlers;

  let response: Response;
  try {
    response = await fetch(ANALYZE_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/x-ndjson" },
      body: JSON.stringify({ repo: input }),
      cache: "no-store",
      signal,
    });
  } catch (cause) {
    if (isAbort(cause)) throw new AnalyzeError("ABORTED", "Survey cancelled.");
    throw new AnalyzeError("NETWORK", "Repo City could not reach the survey service.");
  }

  if (!response.ok) throw await errorFromResponse(response);
  if (!response.body) {
    throw new AnalyzeError("STREAM_FAILED", "The survey response could not be read.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let analysis: RepoAnalysis | null = null;

  /** Returns the final analysis when this line was the `result` event. */
  const consume = (line: string): RepoAnalysis | null => {
    const trimmed = line.trim();
    if (trimmed.length === 0) return null;
    const event = parseEventLine(trimmed);
    if (event.type === "stage") {
      onStage(event);
      return null;
    }
    if (event.type === "error") throw new AnalyzeError(event.code, event.message);
    return event.analysis;
  };

  try {
    while (!analysis) {
      const chunk = await reader.read();
      if (chunk.done) {
        buffer += decoder.decode();
        break;
      }
      buffer += decoder.decode(chunk.value, { stream: true });

      let newline = buffer.indexOf("\n");
      while (newline !== -1) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        analysis = consume(line);
        if (analysis) break;
        newline = buffer.indexOf("\n");
      }
    }
    if (!analysis && buffer.length > 0) analysis = consume(buffer);
  } catch (cause) {
    if (isAbort(cause)) throw new AnalyzeError("ABORTED", "Survey cancelled.");
    if (cause instanceof AnalyzeError) throw cause;
    throw new AnalyzeError("STREAM_FAILED", "The survey response could not be read.");
  } finally {
    await reader.cancel().catch(() => {});
  }

  if (!analysis) {
    throw new AnalyzeError("STREAM_FAILED", "The survey ended before the city was built.");
  }
  return analysis;
}
