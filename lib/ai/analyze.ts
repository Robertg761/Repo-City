import { readdirSync } from "node:fs";
import path from "node:path";

import { generateObject, type LanguageModel } from "ai";

import { createCuratedInterpreter, loadCuratedInterpretation } from "./curated";
import { knownPathsForInput } from "./paths";
import { SYSTEM_PROMPT, buildUserMessage } from "./prompt";
import { interpretationOutputSchema, sanitizeInterpretation } from "./schema";
import { describeModel, resolveModel } from "./providers";
import { FAILED, SKIPPED, type AiEnv, type InterpretResult, type Interpreter } from "./types";

/** PLAN.md section 28: 25 seconds, then the deterministic city ships anyway. */
export const AI_TIMEOUT_MS = 25_000;
export const DEFAULT_MAX_PER_HOUR = 60;

const TIMED_OUT = Symbol("timed-out");

/**
 * Per-instance hourly cap (PLAN.md section 30). Serverless instances do not
 * share memory, so this is a best-effort brake on runaway spend rather than a
 * global quota; the hosted demo runs with no provider at all.
 */
const budget = { windowStart: 0, count: 0 };

function parseMaxPerHour(env: AiEnv): number {
  const parsed = Number.parseInt((env.AI_MAX_PER_HOUR ?? "").trim(), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_MAX_PER_HOUR;
}

/** Returns false when the call must be skipped; counts the call when true. */
function claimCallSlot(max: number, now = Date.now()): boolean {
  if (now - budget.windowStart >= 3_600_000) {
    budget.windowStart = now;
    budget.count = 0;
  }
  if (budget.count >= max) return false;
  budget.count += 1;
  return true;
}

/** Test seam. */
export function resetAiCallBudget(): void {
  budget.windowStart = 0;
  budget.count = 0;
}

/**
 * Wraps one language model as an `Interpreter`. Timeout, provider errors, and
 * schema failures all return `failed`; nothing propagates to the caller.
 */
export function createModelInterpreter(
  model: LanguageModel,
  env: AiEnv = process.env,
): Interpreter {
  const modelLabel = describeModel(env);

  return async (input): Promise<InterpretResult> => {
    if (!claimCallSlot(parseMaxPerHour(env))) return SKIPPED;

    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;

    try {
      const call = generateObject({
        model,
        schema: interpretationOutputSchema,
        schemaName: "RepoCityInterpretation",
        schemaDescription:
          "Architecture interpretation of one GitHub repository, grounded in the supplied survey.",
        system: SYSTEM_PROMPT,
        prompt: buildUserMessage(input),
        abortSignal: controller.signal,
        maxRetries: 1,
        temperature: 0.3,
      });
      // Keeps a late provider rejection from surfacing as an unhandled
      // rejection once the timeout has already won the race.
      call.catch(() => {});

      const timeout = new Promise<typeof TIMED_OUT>((resolve) => {
        timer = setTimeout(() => {
          controller.abort();
          resolve(TIMED_OUT);
        }, AI_TIMEOUT_MS);
      });

      const result = await Promise.race([call, timeout]);
      if (result === TIMED_OUT) return FAILED;

      const interpretation = sanitizeInterpretation(
        { ...result.object, model: modelLabel },
        knownPathsForInput(input),
        input.districts,
      );
      if (!interpretation.summary) return FAILED;
      return { status: "ok", interpretation: { ...interpretation, source: "model" } };
    } catch {
      return FAILED;
    } finally {
      if (timer) clearTimeout(timer);
    }
  };
}

let curatedFilesPresent: boolean | undefined;

function hasCuratedFiles(): boolean {
  if (curatedFilesPresent === undefined) {
    try {
      // Literal subfolder: see the note in `curated.ts`.
      curatedFilesPresent = readdirSync(
        path.join(process.cwd(), "fixtures", "interpretations"),
      ).some((file) => file.endsWith(".json"));
    } catch {
      curatedFilesPresent = false;
    }
  }
  return curatedFilesPresent;
}

/**
 * The composed interpreter: a curated file wins when one exists for the
 * repository, a configured provider is used otherwise, and everything else is
 * `skipped`. Returns `null` when there is nothing to do at all (no provider
 * and no curated fixtures on disk), which lets the route skip the stage.
 */
export function createInterpreter(env: AiEnv = process.env): Interpreter | null {
  const model = resolveModel(env);
  const curatedAvailable = hasCuratedFiles();
  if (!model && !curatedAvailable) return null;

  const curated = curatedAvailable ? createCuratedInterpreter() : null;
  const live = model ? createModelInterpreter(model, env) : null;

  return async (input): Promise<InterpretResult> => {
    if (curated) {
      const result = await curated(input);
      if (result.status === "ok") return result;
    }
    return live ? live(input) : SKIPPED;
  };
}

/**
 * Route-level convenience: resolve the interpreter for one repository before
 * the analysis starts. `null` means the caller should record `aiStatus:
 * "skipped"` without calling anything.
 */
export async function getInterpreter(
  fullName: string,
  env: AiEnv = process.env,
): Promise<Interpreter | null> {
  const curated = await loadCuratedInterpretation(fullName);
  if (curated) return createCuratedInterpreter();

  const model = resolveModel(env);
  return model ? createModelInterpreter(model, env) : null;
}
