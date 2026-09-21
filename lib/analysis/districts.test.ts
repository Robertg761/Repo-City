import { describe, expect, it } from "vitest";

import { MAX_DISTRICTS, MIN_DISTRICTS, districtForPath, planDistricts } from "./districts";
import { pruneTree } from "./tree";
import { archivedSnapshot } from "./__fixtures__/archived.snapshot";
import { treeFromPaths } from "./__fixtures__/helpers";
import { midSnapshot } from "./__fixtures__/mid.snapshot";
import { syntheticTree } from "./__fixtures__/syntheticTree";

const plan = (paths: string[]) => planDistricts(pruneTree(treeFromPaths(paths)));

/**
 * `sindresorhus/p-limit` in miniature: a handful of root files, one test
 * directory and a one-file `scripts` directory. The shape that used to collapse
 * into a single district holding every building.
 */
const P_LIMIT = [
  "index.js",
  "index.d.ts",
  "index.test-d.ts",
  "package.json",
  "readme.md",
  "license",
  "test/test.js",
  "test/test.d.ts",
  "scripts/release.js",
];

describe("planDistricts (PLAN.md section 8)", () => {
  it("ranks top-level directories by file count, biggest first", () => {
    const districts = planDistricts(pruneTree(midSnapshot.tree.entries));
    expect(districts.map((d) => d.sourcePath)).toEqual([
      "/src",
      "/tests",
      "/docs",
      "/examples",
      "/scripts",
    ]);
    expect(districts[0]).toMatchObject({ id: "d-src", name: "Core District", weight: 1 });
    expect(districts[1].fileCount).toBe(25);
  });

  it("gives every district a d-<slug> id and a source path", () => {
    const districts = planDistricts(pruneTree(midSnapshot.tree.entries));
    for (const district of districts) {
      expect(district.id).toMatch(/^d-[a-z0-9-]+$/);
      expect(district.sourcePath.startsWith("/")).toBe(true);
      expect(district.purpose).toBeNull();
    }
    expect(new Set(districts.map((d) => d.id)).size).toBe(districts.length);
  });

  it("excludes node_modules, build output, lockfiles and binary assets", () => {
    const districts = plan([
      "src/a.ts",
      "src/b.ts",
      "node_modules/left-pad/index.js",
      "dist/bundle.js",
      "vendor/jquery.js",
      "assets/logo.png",
      "pnpm-lock.yaml",
      "docs/a.md",
      "tests/a.test.ts",
    ]);
    expect(districts.map((d) => d.sourcePath)).toEqual(["/src", "/docs", "/tests"]);
  });

  it("promotes the children of a single top-level source directory", () => {
    const districts = plan([
      "README.md",
      "src/core/a.ts",
      "src/core/b.ts",
      "src/core/c.ts",
      "src/ui/a.ts",
      "src/ui/b.ts",
      "src/util/a.ts",
    ]);
    expect(districts.map((d) => d.sourcePath)).toEqual(["/src/core", "/src/ui", "/src/util"]);
    expect(districts[0].id).toBe("d-src-core");
  });

  it("caps at 8 districts and collapses the rest into Outskirts", () => {
    const paths: string[] = [];
    for (let i = 0; i < 12; i++) {
      for (let f = 0; f <= i; f++) paths.push(`area${String(i).padStart(2, "0")}/file${f}.ts`);
    }
    const districts = plan(paths);
    expect(districts).toHaveLength(MAX_DISTRICTS + 1);
    const outskirts = districts.at(-1);
    expect(outskirts).toMatchObject({ sourcePath: "/", name: "Outskirts", id: "d-outskirts" });
    // area00..area03 are the four smallest and fall outside the cap: 1+2+3+4.
    expect(outskirts?.fileCount).toBe(10);
  });

  it("never returns zero districts, even for a root-only repository", () => {
    const districts = plan(["README.md", "index.js", "package.json"]);
    expect(districts).toHaveLength(1);
    // Nothing nested is left over, so the one district is the root files' own.
    expect(districts[0]).toMatchObject({ sourcePath: "/", name: "Root", fileCount: 3 });
  });

  it("gives the root files their own district in a p-limit sized repository", () => {
    const districts = plan(P_LIMIT);
    expect(districts.length).toBeGreaterThanOrEqual(2);
    const root = districts.filter((d) => d.sourcePath === "/");
    expect(root).toHaveLength(1);
    expect(root[0]).toMatchObject({ id: "d-root", name: "Root", fileCount: 6 });
    expect(districts.map((d) => d.sourcePath)).toEqual(["/test", "/scripts", "/"]);
    // The one-file /scripts district keeps its one file and nothing else.
    expect(districts.find((d) => d.sourcePath === "/scripts")?.fileCount).toBe(1);
  });

  it("never plans two districts with the same source path", () => {
    // A single top-level directory whose children are promoted leaves the files
    // sitting directly in `src` uncovered: Outskirts and the root files both
    // want `/`, and they have to share it.
    const districts = plan([
      "README.md",
      "package.json",
      "src/index.ts",
      "src/a/one.ts",
      "src/a/two.ts",
      "src/b/three.ts",
    ]);
    expect(districts.map((d) => d.sourcePath)).toEqual(["/src/a", "/src/b", "/"]);
    const shared = districts.at(-1);
    // 1 uncovered nested file (src/index.ts) plus the 2 root files.
    expect(shared).toMatchObject({ sourcePath: "/", name: "Outskirts", fileCount: 3 });
    expect(districts.filter((d) => d.sourcePath === "/")).toHaveLength(1);
  });

  it("leaves repositories with enough directories alone", () => {
    const districts = plan([
      "README.md",
      "package.json",
      "src/index.ts",
      "docs/guide.md",
      "tests/index.test.ts",
    ]);
    expect(districts).toHaveLength(MIN_DISTRICTS);
    expect(districts.every((d) => d.sourcePath !== "/")).toBe(true);
  });

  it("keeps the archived fixture down to three small districts", () => {
    const districts = planDistricts(pruneTree(archivedSnapshot.tree.entries));
    expect(districts.map((d) => d.sourcePath)).toEqual(["/lib", "/test", "/bench"]);
  });

  it("stays within 8 districts plus Outskirts on a 5,000 entry tree", () => {
    const districts = planDistricts(pruneTree(syntheticTree(5000)));
    expect(districts.length).toBeLessThanOrEqual(MAX_DISTRICTS + 1);
    expect(districts.filter((d) => d.sourcePath === "/")).toHaveLength(1);
  });

  it("is deterministic", () => {
    const a = planDistricts(pruneTree(midSnapshot.tree.entries));
    const b = planDistricts(pruneTree(midSnapshot.tree.entries));
    expect(a).toEqual(b);
  });
});

describe("districtForPath", () => {
  const districts = planDistricts(pruneTree(midSnapshot.tree.entries));

  it("matches the longest source path", () => {
    expect(districtForPath("src/router/match.ts", districts).id).toBe("d-src");
    expect(districtForPath("docs/api/index.md", districts).id).toBe("d-docs");
  });

  it("puts root-level files in the first district, the civic center", () => {
    expect(districtForPath("README.md", districts).id).toBe(districts[0].id);
  });

  it("puts root-level files in the / district when the repository is tiny", () => {
    const tiny = plan(P_LIMIT);
    const root = tiny.find((d) => d.sourcePath === "/")!;
    expect(root.id).not.toBe(tiny[0].id);
    for (const path of ["index.js", "package.json", "readme.md", "license"]) {
      expect(districtForPath(path, tiny).id).toBe(root.id);
    }
    expect(districtForPath("test/test.js", tiny).id).toBe("d-test");
    expect(districtForPath("scripts/release.js", tiny).id).toBe("d-scripts");
  });

  it("keeps root-level files in the civic center once three directories exist", () => {
    const archived = planDistricts(pruneTree(archivedSnapshot.tree.entries));
    expect(archived).toHaveLength(MIN_DISTRICTS);
    expect(districtForPath("README.md", archived).id).toBe(archived[0].id);
  });

  it("puts uncovered nested paths in Outskirts when one exists", () => {
    const withOutskirts = plan([
      ...Array.from({ length: 10 }, (_, i) =>
        Array.from({ length: i + 1 }, (_, f) => `a${String(i).padStart(2, "0")}/f${f}.ts`),
      ).flat(),
    ]);
    const outskirts = withOutskirts.find((d) => d.sourcePath === "/");
    expect(districtForPath("a00/f0.ts", withOutskirts).id).toBe(outskirts?.id);
  });
});
