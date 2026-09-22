import { describe, expect, it } from "vitest";

import type { AiInterpretation } from "@/types/analysis";

import { knownPathsForInput } from "./paths";
import {
  LIMITS,
  aiInterpretationSchema,
  interpretationOutputSchema,
  sanitizeInterpretation,
} from "./schema";
import { TEST_DISTRICTS, makeInput } from "./testInput";

const valid: AiInterpretation = {
  summary: "A small HTTP router split into a routing core and middleware.",
  districts: [
    {
      sourcePath: "/src",
      name: "The Foundry",
      purpose: "Routing core and middleware live here.",
      evidence: ["src/index.ts", "src/router/router.ts"],
    },
  ],
  importantModules: [
    { path: "src/router/router.ts", role: "Matches requests to handlers.", evidence: ["src/router/trie.ts"] },
  ],
  strengths: ["Routing is isolated from middleware."],
  concerns: [],
  organizationClarity: 0.8,
  model: "test",
};

describe("aiInterpretationSchema", () => {
  it("accepts a well formed interpretation", () => {
    expect(aiInterpretationSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects a summary over 400 characters", () => {
    const result = aiInterpretationSchema.safeParse({ ...valid, summary: "x".repeat(401) });
    expect(result.success).toBe(false);
  });

  it("rejects an out of range organizationClarity", () => {
    expect(aiInterpretationSchema.safeParse({ ...valid, organizationClarity: 1.4 }).success).toBe(false);
  });

  it("rejects zero districts and more than eight", () => {
    expect(aiInterpretationSchema.safeParse({ ...valid, districts: [] }).success).toBe(false);
    expect(
      aiInterpretationSchema.safeParse({
        ...valid,
        districts: Array.from({ length: 9 }, () => valid.districts[0]),
      }).success,
    ).toBe(false);
  });

  it("rejects more important modules than the cap allows", () => {
    expect(
      aiInterpretationSchema.safeParse({
        ...valid,
        importantModules: Array.from({ length: LIMITS.modules }, () => valid.importantModules[0]),
      }).success,
    ).toBe(true);
    expect(
      aiInterpretationSchema.safeParse({
        ...valid,
        importantModules: Array.from(
          { length: LIMITS.modules + 1 },
          () => valid.importantModules[0],
        ),
      }).success,
    ).toBe(false);
  });

  it("does not ask the model for the model name", () => {
    expect(Object.keys(interpretationOutputSchema.shape)).not.toContain("model");
  });
});

describe("sanitizeInterpretation", () => {
  const knownPaths = knownPathsForInput(makeInput());

  it("drops evidence paths that are not in the tree", () => {
    const sanitized = sanitizeInterpretation(
      {
        ...valid,
        districts: [
          {
            ...valid.districts[0],
            evidence: ["src/index.ts", "src/invented/ghost.ts", "  `src/router/trie.ts` "],
          },
        ],
        importantModules: [
          { path: "src/index.ts", role: "Entry point.", evidence: ["nope.ts"] },
        ],
      },
      knownPaths,
      TEST_DISTRICTS,
    );

    expect(sanitized.districts[0].evidence).toEqual(["src/index.ts", "src/router/trie.ts"]);
    expect(sanitized.importantModules[0].evidence).toEqual([]);
  });

  it("drops modules whose own path does not exist", () => {
    const sanitized = sanitizeInterpretation(
      {
        ...valid,
        importantModules: [
          { path: "src/ghost.ts", role: "Invented.", evidence: [] },
          { path: "src/router", role: "Routing directory.", evidence: [] },
        ],
      },
      knownPaths,
      TEST_DISTRICTS,
    );

    expect(sanitized.importantModules.map((module) => module.path)).toEqual(["src/router"]);
  });

  it("drops districts that the planner did not create and keeps the planner spelling", () => {
    const sanitized = sanitizeInterpretation(
      {
        ...valid,
        districts: [
          { sourcePath: "src", name: "The Foundry", purpose: "Routing core.", evidence: [] },
          { sourcePath: "/packages", name: "Ghost Town", purpose: "Invented.", evidence: [] },
        ],
      },
      knownPaths,
      TEST_DISTRICTS,
    );

    expect(sanitized.districts).toHaveLength(1);
    expect(sanitized.districts[0].sourcePath).toBe("/src");
    expect(sanitized.districts[0].name).toBe("The Foundry");
  });

  it("drops duplicate districts and duplicate bullets", () => {
    const sanitized = sanitizeInterpretation(
      {
        ...valid,
        districts: [valid.districts[0], { ...valid.districts[0], name: "Second Pass" }],
        strengths: ["Clear layout.", "clear layout.", "Good tests."],
      },
      knownPaths,
      TEST_DISTRICTS,
    );

    expect(sanitized.districts).toHaveLength(1);
    expect(sanitized.strengths).toEqual(["Clear layout.", "Good tests."]);
  });

  it("clamps every length and the clarity score", () => {
    const sanitized = sanitizeInterpretation(
      {
        ...valid,
        summary: "x".repeat(900),
        districts: [{ ...valid.districts[0], name: "y".repeat(80), purpose: "z".repeat(400) }],
        strengths: Array.from({ length: 9 }, (_, index) => `strength ${index}`),
        concerns: Array.from({ length: 9 }, (_, index) => `concern ${index}`),
        organizationClarity: 4,
      },
      knownPaths,
      TEST_DISTRICTS,
    );

    expect(sanitized.summary.length).toBe(LIMITS.summary);
    expect(sanitized.districts[0].name.length).toBe(LIMITS.districtName);
    expect(sanitized.districts[0].purpose.length).toBe(LIMITS.districtPurpose);
    expect(sanitized.strengths).toHaveLength(LIMITS.strengths);
    expect(sanitized.concerns).toHaveLength(LIMITS.concerns);
    expect(sanitized.organizationClarity).toBe(1);
  });

  it("falls back to a neutral clarity when the number is unusable", () => {
    const sanitized = sanitizeInterpretation(
      { ...valid, organizationClarity: Number.NaN },
      knownPaths,
      TEST_DISTRICTS,
    );
    expect(sanitized.organizationClarity).toBe(0.5);
  });
});
