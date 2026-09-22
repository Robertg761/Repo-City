import { describe, expect, it } from "vitest";
import type { GhTreeItem } from "@/types/github";
import { MAX_DEPTH, MAX_ENTRIES, isExcluded, pruneTree } from "./tree";

const blob = (path: string, size = 100): GhTreeItem => ({
  path,
  mode: "100644",
  type: "blob",
  sha: "x",
  size,
});

const tree = (path: string): GhTreeItem => ({ path, mode: "040000", type: "tree", sha: "x" });

const paths = (items: GhTreeItem[]): string[] =>
  pruneTree(items).tree.entries.map((entry) => entry.path);

describe("pruneTree exclusions (PLAN.md section 8)", () => {
  it("drops dependency and build output directories anywhere in the path", () => {
    const kept = paths([
      blob("src/index.ts"),
      blob("node_modules/react/index.js"),
      tree("node_modules"),
      blob("packages/core/node_modules/dep/a.js"),
      blob("vendor/github.com/pkg/errors/errors.go"),
      blob("dist/bundle.js"),
      blob("build/output.o"),
      blob("target/debug/app"),
      blob("coverage/lcov-report/index.html"),
      blob(".git/config"),
      blob("__pycache__/mod.pyc"),
    ]);
    expect(kept).toEqual(["src/index.ts"]);
  });

  it("drops lockfiles but keeps the manifests beside them", () => {
    const kept = paths([
      blob("package.json"),
      blob("package-lock.json"),
      blob("pnpm-lock.yaml"),
      blob("yarn.lock"),
      blob("Cargo.toml"),
      blob("Cargo.lock"),
      blob("go.mod"),
      blob("go.sum"),
      blob("Gemfile"),
      blob("Gemfile.lock"),
    ]);
    expect(kept).toEqual(["package.json", "Cargo.toml", "go.mod", "Gemfile"]);
  });

  it("drops binaries, media and minified bundles by extension", () => {
    const kept = paths([
      blob("src/app.ts"),
      blob("docs/logo.png"),
      blob("docs/demo.mp4"),
      blob("assets/font.woff2"),
      blob("public/vendor.min.js"),
      blob("public/site.min.css"),
      blob("bin/tool.exe"),
      blob("lib/native.so"),
      blob("archive.tar.gz"),
      blob("report.pdf"),
      blob("README.md"),
    ]);
    expect(kept).toEqual(["src/app.ts", "README.md"]);
  });

  it("keeps a directory whose name only looks like an excluded extension", () => {
    expect(isExcluded("packages/core.db", "tree")).toBe(false);
    expect(isExcluded("packages/core.db", "blob")).toBe(true);
  });

  it("drops submodule pointers and malformed rows", () => {
    const kept = paths([
      blob("src/index.ts"),
      { path: "deps/sub", mode: "160000", type: "commit" as GhTreeItem["type"], sha: "x" },
      { path: "", mode: "100644", type: "blob", sha: "x" },
    ]);
    expect(kept).toEqual(["src/index.ts"]);
  });
});

describe("pruneTree depth cap", () => {
  it(`drops paths deeper than ${MAX_DEPTH} segments and says so`, () => {
    const deep = "a/b/c/d/e/f/g/too-deep.ts";
    const result = pruneTree([blob("a/b/c/d/e/f.ts"), blob(deep)]);

    expect(result.tree.entries.map((entry) => entry.path)).toEqual(["a/b/c/d/e/f.ts"]);
    expect(result.warnings.join(" ")).toContain("deeper than 6 levels");
    // A collapsed subtree is not a partial survey: the parent still stands.
    expect(result.tree.truncated).toBe(false);
  });
});

describe("pruneTree entry cap", () => {
  const synthetic = (count: number): GhTreeItem[] => {
    const items: GhTreeItem[] = [];
    for (let i = 0; i < count; i += 1) {
      const dir = `pkg${i % 40}`;
      if (i % 40 === 0) items.push(tree(dir));
      items.push(blob(`${dir}/file${i}.ts`, 200));
    }
    return items;
  };

  it("keeps everything below the cap and reports truncated: false", () => {
    const result = pruneTree(synthetic(1000));
    expect(result.tree.truncated).toBe(false);
    expect(result.tree.entries.length).toBe(result.tree.totalEntries);
  });

  it(`caps at ${MAX_ENTRIES} entries, marks truncated and warns`, () => {
    const result = pruneTree(synthetic(9000));

    expect(result.tree.entries.length).toBe(MAX_ENTRIES);
    expect(result.tree.totalEntries).toBeGreaterThan(MAX_ENTRIES);
    expect(result.tree.truncated).toBe(true);
    expect(result.warnings.join(" ")).toContain("capped at 5,000 entries");
  });

  it("keeps directories and high-value files first, and reserves room for files", () => {
    const items: GhTreeItem[] = [];
    for (let i = 0; i < 4000; i += 1) items.push(tree(`dir${i}`));
    for (let i = 0; i < 4000; i += 1) items.push(blob(`dir${i}/noise${i}.ts`, 10));
    items.push(blob("package.json", 800));
    items.push(blob("README.md", 4000));
    items.push(blob("src/index.ts", 2000));

    const result = pruneTree(items);
    const kept = new Set(result.tree.entries.map((entry) => entry.path));
    const directories = result.tree.entries.filter((entry) => entry.type === "tree").length;

    expect(kept.has("package.json")).toBe(true);
    expect(kept.has("README.md")).toBe(true);
    expect(kept.has("src/index.ts")).toBe(true);
    // Directories may not eat the whole budget; half is reserved for files.
    expect(directories).toBeLessThanOrEqual(MAX_ENTRIES / 2);
  });

  it("returns entries in source order, identically across runs", () => {
    const items = synthetic(9000);
    const first = pruneTree(items).tree.entries.map((entry) => entry.path);
    const second = pruneTree(items).tree.entries.map((entry) => entry.path);

    expect(first).toEqual(second);

    // Selection re-orders by value; the output must put it back, so the kept
    // paths follow the order GitHub listed them in.
    const sourceOrder = items.map((item) => item.path);
    const expectedOrder = sourceOrder.filter((path) => first.includes(path));
    expect(first).toEqual(expectedOrder);
  });
});

describe("pruneTree uncapped counts (PLAN.md section 76.4)", () => {
  it("counts files and directories that pass the exclusions", () => {
    const result = pruneTree([
      tree("src"),
      blob("src/a.ts"),
      blob("src/logo.png"),
      tree("node_modules"),
      blob("node_modules/x/index.js"),
      { path: "sub", mode: "160000", type: "commit", sha: "x" },
    ]);
    expect(result.tree.totalFiles).toBe(1);
    expect(result.tree.totalDirs).toBe(1);
  });

  it("counts before the depth cap, so deep trees are not undercounted", () => {
    const deep = "a/b/c/d/e/f/g/h";
    const result = pruneTree([tree("a"), tree(deep), blob(`${deep}/Main.java`), blob("a/top.ts")]);
    expect(result.tree.entries.map((entry) => entry.path)).toEqual(["a", "a/top.ts"]);
    expect(result.tree.totalFiles).toBe(2);
    expect(result.tree.totalDirs).toBe(2);
  });

  it(`counts before the ${MAX_ENTRIES}-entry cap`, () => {
    const items = Array.from({ length: MAX_ENTRIES + 700 }, (_, i) => blob(`src/f${i}.ts`));
    const result = pruneTree([tree("src"), ...items]);
    expect(result.tree.entries).toHaveLength(MAX_ENTRIES);
    expect(result.tree.totalFiles).toBe(MAX_ENTRIES + 700);
    expect(result.tree.totalDirs).toBe(1);
  });
});

describe("pruneTree truncation flag", () => {
  it("carries GitHub's own truncation through with a warning", () => {
    const result = pruneTree([blob("src/index.ts")], true);
    expect(result.tree.truncated).toBe(true);
    expect(result.warnings.join(" ")).toContain("GitHub truncated");
  });

  it("counts files and directories for the stage detail line", () => {
    const result = pruneTree([tree("src"), blob("src/a.ts"), blob("src/b.ts")]);
    expect(result.stats).toMatchObject({ rawEntries: 3, kept: 3, files: 2, directories: 1 });
  });

  it("records GitHub's own truncation separately from the entry cap", () => {
    expect(pruneTree([blob("a.ts")], true).tree.githubTruncated).toBe(true);
    expect(pruneTree([blob("a.ts")], false).tree.githubTruncated).toBe(false);
  });

  it("sizes blobs only when GitHub reported a size", () => {
    const result = pruneTree([
      { path: "a.ts", mode: "100644", type: "blob", sha: "x" },
      blob("b.ts", 42),
    ]);
    expect(result.tree.entries).toEqual([
      { path: "a.ts", type: "blob" },
      { path: "b.ts", type: "blob", size: 42 },
    ]);
  });
});
