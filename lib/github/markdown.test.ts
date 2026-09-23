import { describe, expect, it } from "vitest";
import { markdownToPlainText, plainTextExcerpt } from "./markdown";

describe("markdownToPlainText", () => {
  it("turns an issue template into sentences", () => {
    const body = [
      "### What version of Hono are you using?",
      "",
      "4.3.7",
      "",
      "### Steps to reproduce",
      "",
      "Any idea why the GET method doesn't work?",
      "```ts",
      "import { x } from './y'",
      "```",
      "It fails.",
    ].join("\r\n");
    expect(markdownToPlainText(body)).toBe(
      "What version of Hono are you using? 4.3.7 Steps to reproduce: Any idea why the GET method doesn't work? It fails.",
    );
  });

  it("drops a code fence the body cut off, and tilde fences", () => {
    expect(markdownToPlainText("Before\n~~~\nfenced\n~~~\nafter")).toBe("Before after");
    expect(markdownToPlainText("Trace:\n```\nat foo (bar.js:1)\nat baz")).toBe("Trace:");
    expect(markdownToPlainText("Empty\n```\n```\nstill here\n```\nx\n```")).toBe("Empty still here");
  });

  it("keeps inline code's words, including ones that look like markup", () => {
    expect(markdownToPlainText("Call `useState<T>()` then ``a ` b`` and `**not bold**`")).toBe(
      "Call useState<T>() then a ` b and **not bold**",
    );
    expect(markdownToPlainText("```inline fence``` stays prose")).toBe("inline fence stays prose");
  });

  it("drops emphasis markers and keeps the words", () => {
    expect(markdownToPlainText("**Bold** and __also bold__, *italic* and _italic_, ~~gone~~ ***both***")).toBe(
      "Bold and also bold, italic and italic, gone both",
    );
    expect(markdownToPlainText("Upgrading to 16.11 **Which versions")).toBe("Upgrading to 16.11 Which versions");
  });

  it("keeps snake_case, a lone asterisk and escaped characters", () => {
    expect(markdownToPlainText("files like test_function.js, 2 * 3, and \\*literal\\* stars")).toBe(
      "files like test_function.js, 2 * 3, and *literal* stars",
    );
  });

  it("keeps link text and image alt text, not their URLs", () => {
    expect(
      markdownToPlainText(
        "See [the docs](https://x.y/z \"title\") and ![a screenshot](https://img/1.png), [ref link][1], <https://auto.link/a>\n\n[1]: https://x.y/ref",
      ),
    ).toBe("See the docs and a screenshot, ref link, https://auto.link/a");
  });

  it("drops HTML comments and tags, and decodes the common entities", () => {
    const body =
      "<!-- Please fill in\nevery section -->\n<details><summary>Logs</summary>\n\nline one<br/>line two\n</details>\n<img src=\"x.png\" alt=\"shot\">\nA &amp; B &lt;3&nbsp;ok";
    expect(markdownToPlainText(body)).toBe("Logs line one line two A & B <3 ok");
  });

  it("drops a comment the body cut off", () => {
    expect(markdownToPlainText("Hello\n<!-- never closed")).toBe("Hello");
  });

  it("drops list bullets, task-list boxes, quotes and rules", () => {
    const body = "- [ ] todo one\n* [x] done two\n1. first\n2) second\n> > quoted\n\n---\n\nSetext\n===\nend";
    expect(markdownToPlainText(body)).toBe("todo one done two first second quoted Setext end");
  });

  it("reads a table as its cells", () => {
    const body = "| Browser | Version |\n| --- | :---: |\n| Chrome | 120 |\nPipes | in prose stay";
    expect(markdownToPlainText(body)).toBe("Browser Version Chrome 120 Pipes | in prose stay");
  });

  it("does not read a hashtag or an issue reference as a heading", () => {
    expect(markdownToPlainText("#123 is related\n#hashtag")).toBe("#123 is related #hashtag");
  });

  it("collapses every run of whitespace, newlines included", () => {
    expect(markdownToPlainText("a     b\n\tc\n\n\nd")).toBe("a b c d");
  });

  it("gives nothing for nothing", () => {
    expect(markdownToPlainText(null)).toBe("");
    expect(markdownToPlainText(undefined)).toBe("");
    expect(markdownToPlainText("   \n ")).toBe("");
    expect(markdownToPlainText("```\nonly code\n```")).toBe("");
    expect(markdownToPlainText("<!-- only a comment -->")).toBe("");
  });
});

describe("plainTextExcerpt", () => {
  it("keeps short text whole", () => {
    expect(plainTextExcerpt("**short**", 300)).toBe("short");
  });

  it("ends a long excerpt on a whole word, inside the limit", () => {
    const out = plainTextExcerpt("word ".repeat(100), 40);
    expect(out.length).toBeLessThanOrEqual(40);
    expect(out.endsWith("word…")).toBe(true);
  });

  it("cuts a single long word hard", () => {
    const out = plainTextExcerpt("x".repeat(1000), 300);
    expect(out).toHaveLength(300);
    expect(out.endsWith("…")).toBe(true);
  });

  it("measures the limit after the markup is gone", () => {
    const link = `[${"a".repeat(200)}](https://example.com/${"p".repeat(500)})`;
    expect(plainTextExcerpt(link, 300)).toBe("a".repeat(200));
  });
});
