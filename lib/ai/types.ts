import type {
  AiInterpretation,
  AiStatus,
  BuildingPlan,
  DistrictPlan,
} from "@/types/analysis";
import type { RepositorySnapshot } from "@/types/repository";

/**
 * Everything the interpretation layer is allowed to see (PLAN.md section 28).
 * Deliberately narrow: no issue bodies and no source file contents, so the
 * model cannot quote repository text it was never meant to read.
 *
 * `treeOutline` is a newline separated path list produced by the analysis
 * layer. Two shapes are accepted by `knownPathsFromOutline`: full paths on
 * every line (`src/router/router.ts`, preferred because it survives trimming)
 * and an indented tree where each line holds only one segment name.
 */
export interface InterpretInput {
  repo: RepositorySnapshot["repo"];
  treeOutline: string;
  readme: string;
  manifests: { path: string; content: string }[];
  workflows: { name: string; path: string }[];
  metricsSummary: string;
  districts: DistrictPlan[];
  buildings: BuildingPlan[];
}

/** Mirrors the `ai` / `aiStatus` pair on `RepoAnalysis`. */
export interface InterpretResult {
  status: AiStatus;
  interpretation: AiInterpretation | null;
}

/**
 * The single seam between `lib/ai` and `lib/analysis`. An interpreter never
 * throws: a provider error, a timeout, or malformed model output all surface
 * as `{ status: "failed", interpretation: null }` so the deterministic city
 * still renders (PLAN.md section 27).
 */
export type Interpreter = (input: InterpretInput) => Promise<InterpretResult>;

/** Environment slice the adapter reads. `process.env` satisfies this. */
export type AiEnv = Record<string, string | undefined>;

export type AiProviderName =
  | "none"
  | "anthropic"
  | "openai"
  | "google"
  | "openai-compatible";

export const SKIPPED: InterpretResult = {
  status: "skipped",
  interpretation: null,
};
export const FAILED: InterpretResult = {
  status: "failed",
  interpretation: null,
};
