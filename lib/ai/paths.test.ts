import { describe, expect, it } from "vitest";

import {
  buildKnownPathIndex,
  isKnownPath,
  knownPathsForInput,
  knownPathsFromOutline,
  normalizePath,
} from "./paths";
import { makeInput } from "./testInput";

describe("normalizePath", () => {
  it("strips decoration so model output and tree entries compare equal", () => {
    expect(normalizePath("  `src/index.ts`  ")).toBe("src/index.ts");
    expect(normalizePath("./src/index.ts")).toBe("src/index.ts");
    expect(normalizePath("/src/")).toBe("src");
    expect(normalizePath("src\\router\\trie.ts")).toBe("src/router/trie.ts");
    expect(normalizePath("/")).toBe("");
  });
});

describe("buildKnownPathIndex", () => {
  it("derives ancestor directories from file paths", () => {
    const index = buildKnownPathIndex(["src/router/router.ts"]);
    expect(isKnownPath(index, "src")).toBe(true);
    expect(isKnownPath(index, "src/router")).toBe(true);
    expect(isKnownPath(index, "src/router/router.ts")).toBe(true);
    expect(isKnownPath(index, "src/router/missing.ts")).toBe(false);
    expect(isKnownPath(index, "/")).toBe(false);
  });
});

describe("knownPathsFromOutline", () => {
  it("reads a flat list of full paths", () => {
    const index = knownPathsFromOutline("src/index.ts\nREADME.md\n");
    expect(isKnownPath(index, "src/index.ts")).toBe(true);
    expect(isKnownPath(index, "README.md")).toBe(true);
  });

  it("reassembles an indented tree", () => {
    const index = knownPathsFromOutline(
      ["src/", "  router/", "    trie.ts", "  index.ts", "docs/", "  guide.md"].join("\n"),
    );
    expect(isKnownPath(index, "src/router/trie.ts")).toBe(true);
    expect(isKnownPath(index, "src/index.ts")).toBe(true);
    expect(isKnownPath(index, "docs/guide.md")).toBe(true);
    expect(isKnownPath(index, "src/guide.md")).toBe(false);
  });

  it("ignores tree drawing characters and trailing annotations", () => {
    const index = knownPathsFromOutline(
      ["src", "├── index.ts  (2 KB)", "└── router.ts"].join("\n"),
    );
    expect(isKnownPath(index, "src/index.ts")).toBe(true);
    expect(isKnownPath(index, "src/router.ts")).toBe(true);
  });
});

describe("knownPathsForInput", () => {
  it("includes planner paths that outline trimming may have dropped", () => {
    const index = knownPathsForInput(makeInput({ treeOutline: "README.md" }));
    expect(isKnownPath(index, "src/router/router.ts")).toBe(true);
    expect(isKnownPath(index, "docs")).toBe(true);
    expect(isKnownPath(index, "nope/at/all.ts")).toBe(false);
  });
});
