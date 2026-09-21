import { describe, expect, it } from "vitest";

import { MAX_INPUT_CHARS, MAX_INPUT_TOKENS, SYSTEM_PROMPT, buildUserMessage, estimateTokens } from "./prompt";
import { makeInput } from "./testInput";

describe("SYSTEM_PROMPT", () => {
  it("forbids invention and pins evidence to the outline", () => {
    expect(SYSTEM_PROMPT).toContain("Never invent repository facts");
    expect(SYSTEM_PROMPT).toContain("TREE OUTLINE");
    expect(SYSTEM_PROMPT).toContain("Knowledge District");
  });
});

describe("buildUserMessage", () => {
  it("includes the survey the model is allowed to use", () => {
    const message = buildUserMessage(makeInput());
    expect(message).toContain("acme/widget");
    expect(message).toContain("src/router/router.ts");
    expect(message).toContain("health 0.72");
    expect(message).toContain("sourcePath: /src");
    expect(message).toContain(".github/workflows/ci.yml");
  });

  it("never sends issue bodies or source files", () => {
    const message = buildUserMessage(makeInput());
    expect(message).not.toContain("ISSUE");
    expect(message.toLowerCase()).not.toContain("source file");
  });

  it("notes the absence of workflows instead of implying CI failure", () => {
    const message = buildUserMessage(makeInput({ workflows: [] }));
    expect(message).toContain("another CI provider");
  });

  it("stays inside the input budget for a huge repository", () => {
    const outline = Array.from({ length: 40_000 }, (_, index) =>
      `packages/pkg-${index % 90}/src/module-${index}/implementation-file-${index}.ts`,
    ).join("\n");
    const message = buildUserMessage(
      makeInput({ treeOutline: outline, readme: "r".repeat(200_000) }),
    );

    expect(message.length).toBeLessThanOrEqual(MAX_INPUT_CHARS);
    expect(estimateTokens(message)).toBeLessThanOrEqual(MAX_INPUT_TOKENS);
    expect(message).toContain("more paths omitted");
  });
});
