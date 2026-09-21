import { describe, expect, it } from "vitest";
import { parseRepoInput } from "./repoInput";

describe("parseRepoInput", () => {
  it.each([
    "facebook/react",
    "github.com/facebook/react",
    "https://github.com/facebook/react",
    "https://www.github.com/facebook/react",
    "https://github.com/facebook/react/",
    "https://github.com/facebook/react.git",
    "git@github.com:facebook/react.git",
    "https://github.com/facebook/react/tree/main/packages",
    "https://github.com/facebook/react/blob/main/README.md",
    "https://github.com/facebook/react/issues/1234",
    "  facebook/react  ",
  ])("accepts %s", (input) => {
    expect(parseRepoInput(input)?.fullName).toBe("facebook/react");
  });

  it("keeps dots inside repository names", () => {
    expect(parseRepoInput("vercel/next.js")?.fullName).toBe("vercel/next.js");
  });

  it.each([
    "",
    "   ",
    "react",
    "https://github.com/facebook",
    "https://gitlab.com/owner/repo",
    "ftp://github.com/facebook/react",
    "facebook / react",
    "https://github.com/facebook/react/tree/main extra",
    "https://example.com/facebook/react",
    "-bad/repo",
    "owner/.hidden",
  ])("rejects %s", (input) => {
    expect(parseRepoInput(input)).toBeNull();
  });
});
