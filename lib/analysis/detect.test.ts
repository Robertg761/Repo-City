import { describe, expect, it } from "vitest";

import { detectCi, detectDocs, detectTests, detectTooling, toolingCategoriesOf } from "./detect";
import { archivedSnapshot } from "./__fixtures__/archived.snapshot";
import { emptySnapshot, run, treeFromPaths } from "./__fixtures__/helpers";
import { midSnapshot } from "./__fixtures__/mid.snapshot";

const tree = (paths: string[]) => {
  const entries = treeFromPaths(paths);
  return { truncated: false, totalEntries: entries.length, entries };
};

const WORKFLOW = { id: 1, name: "CI", path: ".github/workflows/ci.yml", state: "active" };
const t = (days: number) => new Date(Date.UTC(2026, 8, 21 - days)).toISOString();

describe("detectCi (PLAN.md section 14)", () => {
  it("reports none, not failure, when there is no CI at all", () => {
    const ci = detectCi(emptySnapshot({ tree: tree(["src/index.ts"]) }));
    expect(ci).toEqual({ state: "none", provider: "none", failureRate: 0, recentRuns: 0 });
  });

  it("reports provider other with state unknown for a non-Actions config", () => {
    const ci = detectCi(emptySnapshot({ tree: tree(["src/index.ts", ".travis.yml"]) }));
    expect(ci.provider).toBe("other");
    expect(ci.state).toBe("unknown");
  });

  it("detects a CircleCI directory as another provider", () => {
    const ci = detectCi(emptySnapshot({ tree: tree([".circleci/config.yml", "src/a.ts"]) }));
    expect(ci.provider).toBe("other");
  });

  it("reports unknown when workflows exist but no run has completed", () => {
    const ci = detectCi(
      emptySnapshot({
        workflows: [WORKFLOW],
        workflowRuns: [run(1, 1, null, t(1), "in_progress")],
      }),
    );
    expect(ci).toEqual({
      state: "unknown",
      provider: "github-actions",
      failureRate: 0,
      recentRuns: 0,
      // Counted even here: "one workflow, no completed runs yet" is a more
      // useful thing for the power grid to say than "unknown".
      workflows: 1,
    });
  });

  it("reports healthy when the latest run of every workflow succeeded", () => {
    const ci = detectCi(
      emptySnapshot({
        workflows: [WORKFLOW, { ...WORKFLOW, id: 2 }],
        workflowRuns: [
          run(5, 1, "success", t(1)),
          run(4, 2, "success", t(2)),
          run(3, 1, "failure", t(9)),
        ],
      }),
    );
    expect(ci.state).toBe("healthy");
    expect(ci.recentRuns).toBe(3);
  });

  it("reports recent-failure when a latest run failed but the window is mostly green", () => {
    const runs = [run(10, 1, "failure", t(1)), ...Array.from({ length: 9 }, (_, i) => run(i, 1, "success", t(i + 2)))];
    const ci = detectCi(emptySnapshot({ workflows: [WORKFLOW], workflowRuns: runs }));
    expect(ci.state).toBe("recent-failure");
    expect(ci.failureRate).toBeCloseTo(0.1, 5);
  });

  it("reports failing once the failure rate reaches 40 percent", () => {
    const runs = [
      run(10, 1, "failure", t(1)),
      run(9, 1, "failure", t(2)),
      run(8, 1, "failure", t(3)),
      run(7, 1, "failure", t(4)),
      run(6, 1, "success", t(5)),
      run(5, 1, "success", t(6)),
      run(4, 1, "success", t(7)),
      run(3, 1, "success", t(8)),
      run(2, 1, "success", t(9)),
      run(1, 1, "success", t(10)),
    ];
    const ci = detectCi(emptySnapshot({ workflows: [WORKFLOW], workflowRuns: runs }));
    expect(ci.state).toBe("failing");
    expect(ci.failureRate).toBeCloseTo(0.4, 5);
  });

  it("ignores skipped and cancelled runs", () => {
    const ci = detectCi(
      emptySnapshot({
        workflows: [WORKFLOW],
        workflowRuns: [
          run(3, 1, "skipped", t(1)),
          run(2, 1, "cancelled", t(2)),
          run(1, 1, "success", t(3)),
        ],
      }),
    );
    expect(ci.recentRuns).toBe(1);
    expect(ci.state).toBe("healthy");
  });

  it("caps the window at the last 50 runs", () => {
    const runs = Array.from({ length: 80 }, (_, i) => run(i, 1, "success", t(i + 1)));
    expect(detectCi(emptySnapshot({ workflows: [WORKFLOW], workflowRuns: runs })).recentRuns).toBe(50);
  });

  it("derives healthy for the mid fixture and none for the archived one", () => {
    expect(detectCi(midSnapshot).state).toBe("healthy");
    expect(detectCi(midSnapshot).provider).toBe("github-actions");
    expect(detectCi(archivedSnapshot)).toEqual({
      state: "none",
      provider: "none",
      failureRate: 0,
      recentRuns: 0,
    });
  });
});

describe("detectTests (PLAN.md section 15)", () => {
  it("is zero with no evidence at all", () => {
    expect(detectTests(emptySnapshot({ tree: tree(["src/index.ts"]) })).strength).toBe(0);
  });

  it("is 1 for a lone test directory", () => {
    const detected = detectTests(emptySnapshot({ tree: tree(["src/a.ts", "tests/a.js"]) }));
    expect(detected.strength).toBe(1);
    expect(detected.signals.join(" ")).toContain("test directories");
  });

  it("is 2 for a couple of independent signals", () => {
    const detected = detectTests(
      emptySnapshot({ tree: tree(["src/a.ts", "src/a.test.ts", "vitest.config.ts"]) }),
    );
    expect(detected.strength).toBe(2);
  });

  it("is 3 when directories, files, config, scripts and dependencies all agree", () => {
    const detected = detectTests(midSnapshot);
    expect(detected.strength).toBe(3);
    expect(detected.signals.some((s) => s.includes("test file"))).toBe(true);
  });

  it("counts a go test command inside a fetched workflow file", () => {
    const detected = detectTests(
      emptySnapshot({
        tree: tree(["main.go", "go.mod"]),
        files: [{ path: ".github/workflows/ci.yml", content: "jobs:\n  test:\n    run: go test ./...\n" }],
      }),
    );
    expect(detected.signals).toContain("a workflow runs tests");
  });

  it("does not count npm's placeholder test script", () => {
    const detected = detectTests(
      emptySnapshot({
        tree: tree(["index.js", "package.json"]),
        files: [
          {
            path: "package.json",
            content: JSON.stringify({ scripts: { test: 'echo "Error: no test specified" && exit 1' } }),
          },
        ],
      }),
    );
    expect(detected.strength).toBe(0);
  });
});

describe("detectDocs (PLAN.md section 16)", () => {
  it("is 3 for the fully documented mid fixture", () => {
    const docs = detectDocs(midSnapshot);
    expect(docs.strength).toBe(3);
    expect(docs.signals).toEqual(
      expect.arrayContaining(["readme", "docs-dir", "contributing", "changelog", "examples", "api-docs"]),
    );
    expect(docs.readmeLength).toBeGreaterThan(2000);
  });

  it("is 1 for a README and nothing else", () => {
    const docs = detectDocs(archivedSnapshot);
    expect(docs.strength).toBe(1);
    expect(docs.signals).toEqual(["readme"]);
    expect(docs.readmeLength).toBeGreaterThan(0);
  });

  it("does not credit a stub README as real documentation", () => {
    const docs = detectDocs(
      emptySnapshot({
        tree: tree(["README.md", "docs/a.md", "CONTRIBUTING.md"]),
        files: [{ path: "README.md", content: "# x\n" }],
      }),
    );
    expect(docs.strength).toBe(1);
  });
});

describe("detectTooling (PLAN.md section 23)", () => {
  it("finds all four categories in the mid fixture", () => {
    const categories = toolingCategoriesOf(detectTooling(midSnapshot).signals);
    expect([...categories].sort()).toEqual(["build", "format", "lint", "typecheck"]);
  });

  it("finds none in the archived fixture", () => {
    expect(toolingCategoriesOf(detectTooling(archivedSnapshot).signals).size).toBe(0);
  });

  it("reads Python tooling out of pyproject.toml", () => {
    const signals = detectTooling(
      emptySnapshot({
        tree: tree(["pyproject.toml", "pkg/__init__.py"]),
        files: [{ path: "pyproject.toml", content: "[tool.ruff]\nline-length = 100\n[tool.black]\n" }],
      }),
    ).signals;
    expect([...toolingCategoriesOf(signals)].sort()).toEqual(["build", "format", "lint"]);
  });
});
