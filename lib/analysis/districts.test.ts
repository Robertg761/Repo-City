import { describe, expect, it } from "vitest";

import { MAX_DISTRICTS, districtForPath, planDistricts } from "./districts";
import { pruneTree } from "./tree";
import { archivedSnapshot } from "./__fixtures__/archived.snapshot";
import { treeFromPaths } from "./__fixtures__/helpers";
import { midSnapshot } from "./__fixtures__/mid.snapshot";
import { syntheticTree } from "./__fixtures__/syntheticTree";

const plan = (paths: string[]) => planDistricts(pruneTree(treeFromPaths(paths)));

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
    expect(districts[0]).toMatchObject({ sourcePath: "/", name: "Outskirts" });
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
