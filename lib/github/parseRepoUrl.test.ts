import { describe, expect, it } from "vitest";
import { formatRepoRef, parseRepoUrl } from "./parseRepoUrl";

const hono = { owner: "honojs", repo: "hono" };

describe("parseRepoUrl: accepted forms", () => {
  const accepted: [string, { owner: string; repo: string }][] = [
    ["https://github.com/honojs/hono", hono],
    ["http://github.com/honojs/hono", hono],
    ["https://www.github.com/honojs/hono", hono],
    ["www.github.com/honojs/hono", hono],
    ["github.com/honojs/hono", hono],
    ["honojs/hono", hono],
    ["  honojs/hono  ", hono],
    ["\thonojs/hono\n", hono],
    ["https://github.com/honojs/hono/", hono],
    ["https://github.com/honojs/hono///", hono],
    ["https://github.com/honojs/hono.git", hono],
    ["https://github.com/honojs/hono.GIT", hono],
    ["git://github.com/honojs/hono.git", hono],
    ["git@github.com:honojs/hono.git", hono],
    ["https://github.com/honojs/hono/tree/main", hono],
    ["https://github.com/honojs/hono/tree/main/src/router", hono],
    ["https://github.com/honojs/hono/blob/main/package.json", hono],
    ["https://github.com/honojs/hono/issues", hono],
    ["https://github.com/honojs/hono/issues/1234", hono],
    ["https://github.com/honojs/hono/pulls?q=is%3Aopen", hono],
    ["https://github.com/honojs/hono?tab=readme-ov-file", hono],
    ["https://github.com/honojs/hono#readme", hono],
    ["https://github.com/honojs/hono/actions/workflows/ci.yml", hono],
    ["<https://github.com/honojs/hono>", hono],
    ['"github.com/honojs/hono"', hono],
    ["https://github.com:443/honojs/hono", hono],
    // Names with the punctuation GitHub actually allows.
    ["https://github.com/vercel/next.js", { owner: "vercel", repo: "next.js" }],
    ["microsoft/TypeScript-Website", { owner: "microsoft", repo: "TypeScript-Website" }],
    ["some-user/my_repo.v2", { owner: "some-user", repo: "my_repo.v2" }],
  ];

  it.each(accepted)("accepts %s", (input, expected) => {
    expect(parseRepoUrl(input)).toEqual(expected);
  });

  it("keeps the case the user typed; GitHub settles canonical case", () => {
    expect(parseRepoUrl("https://github.com/Facebook/React")).toEqual({
      owner: "Facebook",
      repo: "React",
    });
  });
});

describe("parseRepoUrl: rejected forms", () => {
  const rejected = [
    "",
    "   ",
    "honojs",
    "/honojs",
    "github.com",
    "https://github.com",
    "https://github.com/honojs",
    "https://github.com/honojs/",
    // Gists are not repositories.
    "https://gist.github.com/someone/2c1a0f8f",
    "https://github.com/gist/2c1a0f8f",
    // Other hosts.
    "https://gitlab.com/honojs/hono",
    "https://bitbucket.org/honojs/hono",
    "https://raw.githubusercontent.com/honojs/hono/main/README.md",
    "https://github.evil.com/honojs/hono",
    "https://notgithub.com/honojs/hono",
    "git@gitlab.com:honojs/hono.git",
    // Site features, not accounts.
    "https://github.com/settings/tokens",
    "https://github.com/orgs/honojs/repositories",
    "https://github.com/topics/typescript",
    // Not a URL at all.
    "just some words",
    "https://github.com/honojs/hono hono/hono",
    "javascript:alert(1)//github.com/a/b",
    "file:///etc/passwd",
  ];

  it.each(rejected)("rejects %j", (input) => {
    expect(parseRepoUrl(input)).toBeNull();
  });

  it("rejects non-string input", () => {
    expect(parseRepoUrl(undefined as unknown as string)).toBeNull();
    expect(parseRepoUrl(null as unknown as string)).toBeNull();
  });
});

describe("formatRepoRef", () => {
  it("renders owner/repo", () => {
    expect(formatRepoRef(hono)).toBe("honojs/hono");
  });
});
