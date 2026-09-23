import { describe, expect, it } from "vitest";
import { plainExcerpt } from "./plainText";

describe("plainExcerpt", () => {
  it("turns an issue template into sentences", () => {
    const body =
      "### What version of Hono are you using?\n\n4.3.7\n\n### What runtime/platform is your app running on?\n\nLambda\n\n### What steps can reproduce the bug?\n\nAny idea why the GET method doesn't work?\n```ts\nimport { x } from './y'\n```";
    expect(plainExcerpt(body)).toBe(
      "What version of Hono are you using? 4.3.7 What runtime/platform is your app running on? Lambda What steps can reproduce the bug? Any idea why the GET method doesn't work?",
    );
  });

  it("drops comments, tags, code and markers but keeps the words", () => {
    const body =
      "<!-- Please fill in -->\n**Do you want to request a *feature* or report a *bug*?**\nBug\n\n> quoted [read this page](https://x.y/z)\n- item `code` here\n<sup>Originally posted by **someone**</sup>";
    expect(plainExcerpt(body)).toBe(
      "Do you want to request a feature or report a bug? Bug quoted read this page item code here Originally posted by someone",
    );
  });

  it("keeps snake_case and a lone asterisk", () => {
    expect(plainExcerpt("files like test_function.js are greyed out, 2 * 3")).toBe(
      "files like test_function.js are greyed out, 2 * 3",
    );
  });

  it("ends a long excerpt on a whole word", () => {
    const out = plainExcerpt("word ".repeat(100), 40);
    expect(out.length).toBeLessThanOrEqual(41);
    expect(out.endsWith("word…")).toBe(true);
  });

  it("gives nothing for nothing", () => {
    expect(plainExcerpt("")).toBe("");
    expect(plainExcerpt(undefined)).toBe("");
    expect(plainExcerpt("```\nonly code\n```")).toBe("");
  });
});
