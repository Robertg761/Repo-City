/**
 * Optional, provider-agnostic architecture interpretation (PLAN.md sections 26
 * to 28). Ships disabled: with `AI_PROVIDER=none` the adapter serves curated
 * interpretations for the reference repositories and reports `skipped` for
 * everything else, so the deterministic city is always the product.
 *
 * Server only. Nothing here may be imported from a client component.
 */
export {
  AI_TIMEOUT_MS,
  DEFAULT_MAX_PER_HOUR,
  createInterpreter,
  createModelInterpreter,
  getInterpreter,
  resetAiCallBudget,
} from "./analyze";
export {
  CURATED_DIRECTORY,
  clearCuratedCache,
  createCuratedInterpreter,
  curatedFileName,
  listCuratedRepositories,
  loadCuratedInterpretation,
} from "./curated";
export {
  buildKnownPathIndex,
  isKnownPath,
  knownPathsForInput,
  knownPathsFromOutline,
  normalizePath,
} from "./paths";
export {
  CHARS_PER_TOKEN,
  MAX_INPUT_CHARS,
  MAX_INPUT_TOKENS,
  SYSTEM_PROMPT,
  buildUserMessage,
  estimateTokens,
} from "./prompt";
export { describeModel, resolveModel, resolveProviderName } from "./providers";
export {
  LIMITS,
  aiInterpretationSchema,
  interpretationOutputSchema,
  sanitizeInterpretation,
} from "./schema";
export type { InterpretationOutput } from "./schema";
export type {
  AiEnv,
  AiProviderName,
  InterpretInput,
  InterpretResult,
  Interpreter,
} from "./types";
