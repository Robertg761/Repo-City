import { describe, expect, it } from "vitest";
import sample from "@/fixtures/sample.analysis.json";
import type { RepoAnalysis, RepoMetrics } from "@/types/analysis";
import { describeRepository } from "./descriptors";

const base = (sample as unknown as RepoAnalysis).metrics;

function withMetrics(patch: Partial<RepoMetrics>): RepoMetrics {
  return { ...base, ...patch };
}

describe("describeRepository", () => {
  it("describes the fixture repository", () => {
    expect(describeRepository(base)).toEqual([
      "Active development",
      "Strong infrastructure",
      "Mid-size project",
    ]);
  });

  it("leads with the archived state instead of the pace", () => {
    const chips = describeRepository(
      withMetrics({ archived: true, activity: { ...base.activity, score: 0.9 } }),
    );

    expect(chips[0]).toBe("Archived repository");
    expect(chips.join(" ")).not.toMatch(/bad|poor|unmaintained/i);
  });

  it("never claims infrastructure a repository does not have", () => {
    const chips = describeRepository(
      withMetrics({
        tests: { strength: 0, signals: [] },
        ci: { state: "none", provider: "none", failureRate: 0, recentRuns: 0 },
        scale: { ...base.scale, tier: "tiny" },
        activity: { ...base.activity, score: 0.1 },
      }),
    );

    expect(chips).toEqual(["Quiet lately", "Light infrastructure", "Small project"]);
  });
});
