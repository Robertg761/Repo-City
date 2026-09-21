import { MockLanguageModelV4 } from "ai/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AI_TIMEOUT_MS,
  createInterpreter,
  createModelInterpreter,
  getInterpreter,
  resetAiCallBudget,
} from "./analyze";
import { clearCuratedCache } from "./curated";
import { TEST_OUTLINE, makeInput } from "./testInput";

const USAGE = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 20, text: 20, reasoning: 0 },
};

const GOOD_OUTPUT = {
  summary: "A small router with the matching core in src and a docs folder beside it.",
  districts: [
    {
      sourcePath: "/src",
      name: "The Foundry",
      purpose: "Request routing and middleware.",
      evidence: ["src/index.ts", "src/router/router.ts", "src/invented/ghost.ts"],
    },
    {
      sourcePath: "/packages",
      name: "Ghost Town",
      purpose: "A district the planner never created.",
      evidence: [],
    },
  ],
  importantModules: [
    { path: "src/router/router.ts", role: "Matches requests to handlers.", evidence: [] },
  ],
  strengths: ["Routing is isolated from middleware."],
  concerns: [],
  organizationClarity: 0.8,
};

function textModel(text: string): MockLanguageModelV4 {
  return new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: "text" as const, text }],
      finishReason: { unified: "stop" as const, raw: "stop" },
      usage: USAGE,
      warnings: [],
    }),
  });
}

const LIVE_ENV = {
  AI_PROVIDER: "anthropic",
  AI_MODEL: "claude-opus-5",
  AI_API_KEY: "test-key",
};

beforeEach(() => {
  resetAiCallBudget();
  clearCuratedCache();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createModelInterpreter", () => {
  it("returns ok, labels the model, and grounds the output", async () => {
    const interpreter = createModelInterpreter(textModel(JSON.stringify(GOOD_OUTPUT)), LIVE_ENV);
    const result = await interpreter(makeInput());

    expect(result.status).toBe("ok");
    expect(result.interpretation?.model).toBe("anthropic:claude-opus-5");
    expect(result.interpretation?.districts.map((d) => d.sourcePath)).toEqual(["/src"]);
    expect(result.interpretation?.districts[0]?.evidence).toEqual([
      "src/index.ts",
      "src/router/router.ts",
    ]);
  });

  it("sends the system prompt and one user message", async () => {
    const model = textModel(JSON.stringify(GOOD_OUTPUT));
    await createModelInterpreter(model, LIVE_ENV)(makeInput());

    const call = model.doGenerateCalls[0];
    expect(call.prompt[0]?.role).toBe("system");
    expect(JSON.stringify(call.prompt)).toContain("src/router/router.ts");
  });

  it("fails on output that does not match the schema", async () => {
    const interpreter = createModelInterpreter(
      textModel(JSON.stringify({ summary: "nope", districts: "everywhere" })),
      LIVE_ENV,
    );
    expect(await interpreter(makeInput())).toEqual({ status: "failed", interpretation: null });
  });

  it("fails on text that is not JSON at all", async () => {
    const interpreter = createModelInterpreter(textModel("I am a helpful assistant!"), LIVE_ENV);
    expect(await interpreter(makeInput())).toEqual({ status: "failed", interpretation: null });
  });

  it("fails when the provider throws", async () => {
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        throw new Error("401 from provider");
      },
    });
    const interpreter = createModelInterpreter(model, { ...LIVE_ENV, AI_MAX_PER_HOUR: "5" });
    expect(await interpreter(makeInput())).toEqual({ status: "failed", interpretation: null });
  });

  it("fails after the 25 second timeout and aborts the request", async () => {
    vi.useFakeTimers();
    let aborted = false;
    const model = new MockLanguageModelV4({
      doGenerate: ({ abortSignal }) =>
        new Promise(() => {
          abortSignal?.addEventListener("abort", () => {
            aborted = true;
          });
        }),
    });

    const pending = createModelInterpreter(model, LIVE_ENV)(makeInput());
    await vi.advanceTimersByTimeAsync(AI_TIMEOUT_MS + 10);

    expect(await pending).toEqual({ status: "failed", interpretation: null });
    expect(aborted).toBe(true);
  });

  it("skips once the hourly cap is used up", async () => {
    const model = textModel(JSON.stringify(GOOD_OUTPUT));
    const interpreter = createModelInterpreter(model, { ...LIVE_ENV, AI_MAX_PER_HOUR: "1" });

    expect((await interpreter(makeInput())).status).toBe("ok");
    expect(await interpreter(makeInput())).toEqual({ status: "skipped", interpretation: null });
    expect(model.doGenerateCalls).toHaveLength(1);
  });

  it("treats AI_MAX_PER_HOUR=0 as a hard stop", async () => {
    const model = textModel(JSON.stringify(GOOD_OUTPUT));
    const interpreter = createModelInterpreter(model, { ...LIVE_ENV, AI_MAX_PER_HOUR: "0" });
    expect((await interpreter(makeInput())).status).toBe("skipped");
    expect(model.doGenerateCalls).toHaveLength(0);
  });
});

describe("createInterpreter", () => {
  it("skips a repository with no curated file when no provider is configured", async () => {
    const interpreter = createInterpreter({ AI_PROVIDER: "none" });
    expect(interpreter).not.toBeNull();
    expect(await interpreter!(makeInput())).toEqual({ status: "skipped", interpretation: null });
  });

  it("prefers the curated file over the configured provider", async () => {
    // The provider here is a real Anthropic client with a fake key: if the
    // curated file did not win, the call would fail instead of returning ok.
    const interpreter = createInterpreter(LIVE_ENV);
    const input = makeInput();
    input.repo.fullName = "honojs/hono";

    const result = await interpreter!(input);
    expect(result.status).toBe("ok");
    expect(result.interpretation?.model).toContain("curated");
  });
});

describe("getInterpreter", () => {
  it("returns null when AI is off and the repository has no curated file", async () => {
    expect(await getInterpreter("acme/widget", { AI_PROVIDER: "none" })).toBeNull();
  });

  it("returns a curated interpreter for a reference repository", async () => {
    const interpreter = await getInterpreter("honojs/hono", { AI_PROVIDER: "none" });
    expect(interpreter).not.toBeNull();

    const input = makeInput();
    input.repo.fullName = "honojs/hono";
    const result = await interpreter!(input);

    expect(result.status).toBe("ok");
    // The curated paths are not in this synthetic tree, so grounding removes
    // them rather than showing the user a path they cannot click. Only the
    // curated district that the planner also created survives, stripped of its
    // evidence.
    expect(result.interpretation?.districts.map((d) => d.sourcePath)).toEqual(["/src", "/docs"]);
    for (const district of result.interpretation?.districts ?? []) {
      expect(district.evidence).toEqual([]);
    }
    for (const entry of result.interpretation?.importantModules ?? []) {
      expect(TEST_OUTLINE).toContain(entry.path);
      expect(entry.evidence).toEqual([]);
    }
    expect(result.interpretation?.summary.length).toBeGreaterThan(0);
  });

  it("returns a live interpreter when a provider is configured", async () => {
    expect(await getInterpreter("acme/widget", LIVE_ENV)).not.toBeNull();
  });
});
