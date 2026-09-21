import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import type { AiInterpretation } from "@/types/analysis";

import { knownPathsForInput } from "./paths";
import { aiInterpretationSchema, sanitizeInterpretation } from "./schema";
import { SKIPPED, type InterpretResult, type Interpreter } from "./types";

/**
 * Curated interpretations (PLAN.md section 28). The reference repositories in
 * section 59 were read by a development agent, which wrote one file per repo
 * here. They let the hosted demo show the interpretation feature with
 * `AI_PROVIDER=none` and no runtime spend, and they are grounded exactly like
 * a live model response: every path is re-validated against the live tree at
 * request time, so a stale file degrades instead of lying.
 */
export const CURATED_DIRECTORY = path.join("fixtures", "interpretations");

const cache = new Map<string, Promise<AiInterpretation | null>>();

/** `owner/Repo` -> `owner__repo.json`. Returns null for unusable input. */
export function curatedFileName(fullName: string): string | null {
  const parts = fullName.trim().toLowerCase().split("/");
  if (parts.length !== 2) return null;
  const [owner, repo] = parts;
  if (!owner || !repo || /[^a-z0-9._-]/.test(owner) || /[^a-z0-9._-]/.test(repo)) {
    return null;
  }
  return `${owner}__${repo}.json`;
}

function curatedDirectory(): string {
  return path.join(process.cwd(), CURATED_DIRECTORY);
}

/**
 * Reads and validates `fixtures/interpretations/<owner>__<repo>.json`. Misses,
 * unreadable files, and files that do not match the schema all resolve to
 * `null`; the result (including the miss) is cached for the lifetime of the
 * server instance.
 */
export function loadCuratedInterpretation(
  fullName: string,
): Promise<AiInterpretation | null> {
  const fileName = curatedFileName(fullName);
  if (!fileName) return Promise.resolve(null);

  const cached = cache.get(fileName);
  if (cached) return cached;

  const pending = readCuratedFile(fileName);
  cache.set(fileName, pending);
  return pending;
}

async function readCuratedFile(fileName: string): Promise<AiInterpretation | null> {
  try {
    const raw = await readFile(path.join(curatedDirectory(), fileName), "utf8");
    const parsed = aiInterpretationSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Every curated repository, as `owner/repo`. Used by tests and diagnostics. */
export async function listCuratedRepositories(): Promise<string[]> {
  try {
    const files = await readdir(curatedDirectory());
    return files
      .filter((file) => file.endsWith(".json"))
      .map((file) => file.slice(0, -".json".length).replace("__", "/"))
      .sort();
  } catch {
    return [];
  }
}

/** Test seam: the cache is process-wide and otherwise never invalidated. */
export function clearCuratedCache(): void {
  cache.clear();
}

/**
 * An `Interpreter` backed purely by the committed files. Status is `ok` when a
 * file exists for the repository and `skipped` when it does not; it never
 * reports `failed`, because a missing curated file is not a failure.
 */
export function createCuratedInterpreter(): Interpreter {
  return async (input): Promise<InterpretResult> => {
    const curated = await loadCuratedInterpretation(input.repo.fullName);
    if (!curated) return SKIPPED;
    return {
      status: "ok",
      interpretation: sanitizeInterpretation(
        curated,
        knownPathsForInput(input),
        input.districts,
      ),
    };
  };
}
