import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";

import type { AiEnv, AiProviderName } from "./types";

const PROVIDERS: AiProviderName[] = [
  "none",
  "anthropic",
  "openai",
  "google",
  "openai-compatible",
];

/** `AI_PROVIDER`, defaulting to `none` (PLAN.md sections 28 and 31). */
export function resolveProviderName(env: AiEnv): AiProviderName {
  const raw = (env.AI_PROVIDER ?? "").trim().toLowerCase();
  if (!raw) return "none";
  return (PROVIDERS as string[]).includes(raw) ? (raw as AiProviderName) : "none";
}

/** A human readable label for `AiInterpretation.model`. */
export function describeModel(env: AiEnv): string {
  const provider = resolveProviderName(env);
  const model = (env.AI_MODEL ?? "").trim();
  return provider === "none" || !model ? "none" : `${provider}:${model}`;
}

/**
 * Builds the configured language model, or returns `null` when the deployment
 * has no AI configured. Never throws and never logs the key: a half-configured
 * environment degrades to the deterministic city rather than to a 500.
 *
 * `AI_API_KEY` is required for the hosted providers and optional for
 * `openai-compatible`, where a local Ollama or LM Studio server usually needs
 * no credential but does need `AI_BASE_URL`.
 */
export function resolveModel(env: AiEnv = process.env): LanguageModel | null {
  const provider = resolveProviderName(env);
  if (provider === "none") return null;

  const modelId = (env.AI_MODEL ?? "").trim();
  const apiKey = (env.AI_API_KEY ?? "").trim();
  const baseURL = (env.AI_BASE_URL ?? "").trim();
  if (!modelId) return null;

  try {
    switch (provider) {
      case "anthropic":
        return apiKey ? createAnthropic({ apiKey })(modelId) : null;
      case "openai":
        return apiKey ? createOpenAI({ apiKey })(modelId) : null;
      case "google":
        return apiKey ? createGoogleGenerativeAI({ apiKey })(modelId) : null;
      case "openai-compatible":
        return baseURL
          ? createOpenAICompatible({
              name: "repo-city-openai-compatible",
              baseURL,
              ...(apiKey ? { apiKey } : {}),
            }).chatModel(modelId)
          : null;
    }
  } catch {
    // A malformed base URL or an SDK constructor change must not take the
    // analysis down with it.
    return null;
  }
}
