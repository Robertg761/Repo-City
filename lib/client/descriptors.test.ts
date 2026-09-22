import { describe, expect, it } from "vitest";
import sample from "@/fixtures/sample.analysis.json";
import type { RepoAnalysis, RepoMetrics } from "@/types/analysis";
import type { Overflow } from "@/types/city";
import {
  attentionChips,
  cityPopulation,
  constructedLine,
  describeRepository,
  explainPopulation,
  queueChip,
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

  it("adds the real open totals beside the sample without changing its numbers", () => {
    const big = structuredClone(analysis);
    big.metrics.issues = { ...big.metrics.issues, open: 100, staleShare: 0.25, total: 18604 };
    big.metrics.pulls = { ...big.metrics.pulls, open: 50, staleShare: 0.1, total: 2651 };
    const [issues, pulls] = scoreLines(big)[4].inputs;
    expect(issues).toBe("25 of 100 sampled issues stale (18,604 open in all)");
    expect(pulls).toBe("5 of 50 sampled pull requests stale (2,651 open in all)");
    // The score line's value is the health breakdown, untouched.
    expect(scoreLines(big)[4].value).toBe(analysis.metrics.health.breakdown.responsiveness);

    big.totalsExact = false;
    expect(scoreLines(big)[4].inputs[0]).toBe(
      "25 of 100 sampled issues stale (about 18,604 open in all)",
    );
  });

  it("says nothing extra when the sample is the whole repository", () => {
    const small = structuredClone(analysis);
    small.metrics.issues = { ...small.metrics.issues, total: small.metrics.issues.open };
    expect(scoreLines(small)[4].inputs[0]).not.toContain("in all");
  });
});

describe("constructedLine (PLAN.md 76.10)", () => {
  it.each([
    ["village", "Village constructed"],
    ["town", "Town constructed"],
    ["city", "City constructed"],
    ["metropolis", "Metropolis constructed"],
  ] as const)("names the %s", (tier, line) => {
    expect(constructedLine({ tier, name: "", reason: "" })).toBe(line);
  });

  it("calls a model without a settlement a city", () => {
    expect(constructedLine(undefined)).toBe("City constructed");
  });
});

describe("queueChip (PLAN.md 76.10)", () => {
  const queue = (
    issues: [number, number],
    pulls: [number, number],
    exact = true,
  ): Overflow =>
    ({
      issues: { drawn: issues[0], total: issues[1], hidden: issues[1] - issues[0] },
      pulls: { drawn: pulls[0], total: pulls[1], hidden: pulls[1] - pulls[0] },
      exact,
    }) as Overflow;

  it("counts the issues on the streets against the real total", () => {
    expect(queueChip(queue([1000, 21011], [40, 40]))).toBe(
      "1,000 of 21,011 issues on the streets",
    );
  });

  it("says about when the total is an estimate", () => {
    expect(queueChip(queue([1000, 21011], [40, 40], false))).toBe(
      "1,000 of about 21,011 issues on the streets",
    );
  });

  it("names pull requests too when some of them wait", () => {
    expect(queueChip(queue([1000, 21011], [500, 2651]))).toBe(
      "1,000 of 21,011 issues and 500 of 2,651 pull requests on the streets",
    );
    expect(queueChip(queue([12, 12], [500, 2651]))).toBe(
      "500 of 2,651 pull requests on the streets",
    );
  });

  it("is absent when nothing waits", () => {
    expect(queueChip(null)).toBeNull();
    expect(queueChip(undefined)).toBeNull();
    expect(queueChip(queue([12, 12], [3, 3]))).toBeNull();
  });
});
