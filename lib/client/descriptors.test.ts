import { describe, expect, it } from "vitest";
import sample from "@/fixtures/sample.analysis.json";
import type { RepoAnalysis, RepoMetrics } from "@/types/analysis";
import {
  attentionChips,
  cityPopulation,
  describeRepository,
  explainPopulation,
  scoreLines,
} from "./descriptors";

const analysis = sample as unknown as RepoAnalysis;
const base = analysis.metrics;

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

describe("cityPopulation (PLAN.md section 17)", () => {
  it("gives a solo repository a small town rather than a ghost town", () => {
    const solo = withMetrics({
      scale: { ...base.scale, files: 12 },
      activity: {
        ...base.activity,
        contributors: 1,
        activeContributors90d: 1,
        commitsLast90d: 6,
      },
    });
    expect(cityPopulation(solo)).toBeGreaterThan(50);
  });

  it("grows with files, commits and contributors alike", () => {
    const more = withMetrics({ scale: { ...base.scale, files: base.scale.files + 100 } });
    expect(cityPopulation(more)).toBeGreaterThan(cityPopulation(base));
  });

  it("falls back to recent authors when the contributor list failed", () => {
    const withoutList = withMetrics({
      activity: { ...base.activity, contributors: undefined },
    });
    expect(cityPopulation(withoutList)).toBeGreaterThan(0);
  });

  it("explains itself as the city's own number", () => {
    expect(explainPopulation(base)).toContain("Repo City's own number");
  });
});

describe("attentionChips (PLAN.md sections 21 and 22)", () => {
  it("separates thousands and pluralises honestly", () => {
    expect(attentionChips({ ...analysis.repo, stars: 12_400, forks: 1 })).toEqual([
      "12,400 stars",
      "1 fork",
    ]);
  });
});

describe("scoreLines (PLAN.md section 23)", () => {
  it("lists the five weighted dimensions with their real readings", () => {
    const lines = scoreLines(analysis);
    expect(lines.map((line) => line.key)).toEqual([
      "maintenance",
      "reliability",
      "documentation",
      "organization",
      "responsiveness",
    ]);
    expect(lines.reduce((sum, line) => sum + line.weight, 0)).toBe(100);

    const maintenance = lines[0].inputs.join(" · ");
    expect(maintenance).toMatch(/pushed (today|[\d,]+ days? ago)/);
    expect(maintenance).toContain("commits in 90 days");

    expect(lines[4].inputs[0]).toMatch(/of [\d,]+ sampled issues stale|no open issues sampled/);
  });

  it("presents an absent CI as an absence rather than a failure", () => {
    const noCi = structuredClone(analysis);
    noCi.metrics.ci = { state: "none", provider: "none", failureRate: 0, recentRuns: 0 };
    const reliability = scoreLines(noCi)[1].inputs.join(" ");
    expect(reliability).toContain("no CI detected");
    expect(reliability).not.toMatch(/fail/i);
  });
});
