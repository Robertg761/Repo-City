/**
 * The newline-delimited JSON protocol of `/api/analyze` (PLAN.md section 44).
 *
 * One JSON object per line, three kinds:
 *
 *   {"type":"stage","id":"tree","status":"done","detail":"4,218 files mapped"}
 *   {"type":"result","analysis":{...}}
 *   {"type":"error","code":"NOT_FOUND","message":"..."}
 *
 * The client renders exactly the events it receives — there is no client-side
 * timer inventing progress — so the writer must flush each line as it happens
 * rather than buffering the run.
 *
 * `JSON.stringify` escapes newlines inside strings, so a line break can never
 * appear inside an event and split it in two. The section 60 copy contains
 * one, which is exactly why that matters.
 */

import type { RepoAnalysis } from "@/types/analysis";
import type { AnalyzeErrorCode } from "./errors.ts";
import { ERROR_COPY, errorCodeOf } from "./errors.ts";
import type { StageEvent, StageStatus } from "./snapshot.ts";

export interface StageLine {
  type: "stage";
  /** Stage id; `string` rather than `StageId` so W3 can add its own. */
  id: string;
  status: StageStatus;
  detail?: string;
}

export interface ResultLine {
  type: "result";
  analysis: RepoAnalysis;
}

export interface ErrorLine {
  type: "error";
  code: AnalyzeErrorCode;
  message: string;
}

export type AnalyzeEvent = StageLine | ResultLine | ErrorLine;

export type Emit = (event: AnalyzeEvent) => void;

/** Response headers for the stream. `no-store` keeps proxies from buffering. */
export const NDJSON_HEADERS: Record<string, string> = {
  "Content-Type": "application/x-ndjson; charset=utf-8",
  "Cache-Control": "no-store, no-transform",
  "X-Accel-Buffering": "no",
};

/** One event as a protocol line, newline included. */
export function encodeEvent(event: AnalyzeEvent): string {
  return `${JSON.stringify(event)}\n`;
}

/**
 * Anything stage-shaped. Wider than `StageEvent` on purpose: W3's
 * `analyzeSnapshot` reports stage ids of its own that are not in `StageId`.
 */
export interface StageLike {
  id: string;
  status: StageStatus;
  detail?: string;
}

export function stageLine(event: StageEvent | StageLike): StageLine {
  const line: StageLine = { type: "stage", id: event.id, status: event.status };
  if (event.detail !== undefined) line.detail = event.detail;
  return line;
}

/** Error line with the section 60 copy for the code. */
export function errorLine(code: AnalyzeErrorCode, message: string = ERROR_COPY[code]): ErrorLine {
  return { type: "error", code, message };
}

/**
 * Wraps a run function in a `ReadableStream` of NDJSON bytes.
 *
 * Anything the run throws becomes a final `error` line, so the client always
 * sees a terminal event instead of a body that simply stops. Emits after the
 * client disconnects are dropped silently.
 */
export function createEventStream(
  run: (emit: Emit) => Promise<void>,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let closed = false;

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit: Emit = (event) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(encodeEvent(event)));
        } catch {
          // The consumer went away mid-analysis; stop writing.
          closed = true;
        }
      };

      try {
        await run(emit);
      } catch (error) {
        const code = errorCodeOf(error);
        emit(errorLine(code));
      } finally {
        if (!closed) {
          closed = true;
          try {
            controller.close();
          } catch {
            // Already closed by a cancelled consumer.
          }
        }
      }
    },
    cancel() {
      closed = true;
    },
  });
}

/** Test helper: reads a whole NDJSON stream back into events. */
export async function readEvents(stream: ReadableStream<Uint8Array>): Promise<AnalyzeEvent[]> {
  const text = await new Response(stream).text();
  return text
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as AnalyzeEvent);
}
