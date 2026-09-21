import { describe, expect, it } from "vitest";

import { describeModel, resolveModel, resolveProviderName } from "./providers";

describe("resolveProviderName", () => {
  it("defaults to none and rejects unknown providers", () => {
    expect(resolveProviderName({})).toBe("none");
    expect(resolveProviderName({ AI_PROVIDER: "" })).toBe("none");
    expect(resolveProviderName({ AI_PROVIDER: "Anthropic" })).toBe("anthropic");
    expect(resolveProviderName({ AI_PROVIDER: "skynet" })).toBe("none");
  });
});

describe("resolveModel", () => {
  it("returns null when AI is disabled or half configured", () => {
    expect(resolveModel({})).toBeNull();
    expect(resolveModel({ AI_PROVIDER: "none", AI_MODEL: "x", AI_API_KEY: "y" })).toBeNull();
    expect(resolveModel({ AI_PROVIDER: "anthropic", AI_API_KEY: "y" })).toBeNull();
    expect(resolveModel({ AI_PROVIDER: "anthropic", AI_MODEL: "x" })).toBeNull();
    expect(resolveModel({ AI_PROVIDER: "openai", AI_MODEL: "x" })).toBeNull();
    expect(resolveModel({ AI_PROVIDER: "google", AI_MODEL: "x" })).toBeNull();
    expect(resolveModel({ AI_PROVIDER: "openai-compatible", AI_MODEL: "x" })).toBeNull();
  });

  it("builds a model for each wired provider", () => {
    const hosted = [
      ["anthropic", "claude-opus-5"],
      ["openai", "gpt-5"],
      ["google", "gemini-3-pro"],
    ] as const;

    for (const [provider, model] of hosted) {
      const resolved = resolveModel({
        AI_PROVIDER: provider,
        AI_MODEL: model,
        AI_API_KEY: "test-key",
      });
      expect(resolved, provider).not.toBeNull();
      expect(typeof resolved).not.toBe("string");
      expect((resolved as { modelId: string }).modelId).toBe(model);
    }
  });

  it("builds a keyless local model when a base URL is given", () => {
    const resolved = resolveModel({
      AI_PROVIDER: "openai-compatible",
      AI_MODEL: "llama3.1",
      AI_BASE_URL: "http://localhost:11434/v1",
    });
    expect(resolved).not.toBeNull();
    expect((resolved as { modelId: string }).modelId).toBe("llama3.1");
  });
});

describe("describeModel", () => {
  it("labels the configured model without leaking the key", () => {
    expect(describeModel({})).toBe("none");
    expect(
      describeModel({ AI_PROVIDER: "anthropic", AI_MODEL: "claude-opus-5", AI_API_KEY: "secret" }),
    ).toBe("anthropic:claude-opus-5");
  });
});
