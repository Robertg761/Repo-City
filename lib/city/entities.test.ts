import { describe, expect, it } from "vitest";
import sampleAnalysis from "@/fixtures/sample.analysis.json";
import type { RepoAnalysis } from "@/types/analysis";
import {
  buildingText,
  constructionText,
  districtText,
  incidentText,
  planLandmarks,
  trainsPerMinute,
} from "./entities";

const fixture = sampleAnalysis as unknown as RepoAnalysis;
const clone = (): RepoAnalysis => structuredClone(fixture);
const repo = fixture.repo;

describe("buildingText (PLAN.md sections 9, 10 and 41)", () => {
  it("titles a building with the basename and subtitles it with district and kind", () => {
    const plan = fixture.buildings.find((b) => b.kind === "file" && b.landmark === null)!;
    const district = fixture.districts.find((d) => d.id === plan.districtId);
    const text = buildingText(plan, district, repo);

    expect(text.title).toBe(plan.path.split("/").pop());
    expect(text.subtitle).toBe(`${district!.name} · File`);
    expect(text.reason).toContain(`tier ${plan.tier} of 5`);
    // Pinned to the surveyed commit, not to the branch tip, so the link shows
    // the file the city actually measured.
    expect(text.sourceUrl).toBe(`${repo.url}/blob/${repo.headSha}/${plan.path}`);
    expect(text.visualState).toBe("normal");
  });

  it("describes a directory by its descendant count and links to the tree", () => {
    const plan = fixture.buildings.find((b) => b.kind === "directory")!;
    const text = buildingText(plan, undefined, repo);
    expect(text.subtitle).toContain("Directory");
    expect(text.sourceUrl).toContain(`/tree/${repo.headSha}/`);
    if (plan.role === null) {
      expect(text.description).toContain(`Directory with ${plan.descendantCount} files`);
    }
    expect(text.reason).toContain("footprint");
  });

  it("explains why a root landmark file stands in the civic centre", () => {
    const plan = fixture.buildings.find((b) => b.landmark === "readme")!;
    const text = buildingText(plan, undefined, repo);
    expect(text.visualState).toBe("landmark");
    expect(text.reason).toContain("civic centre");
  });
});

describe("incidentText (PLAN.md section 12)", () => {
  it("labels each visual state and reuses the ranking reason", () => {
    const issue = fixture.metrics.issues.ranked[0];
    const text = incidentText(issue, fixture.generatedAt);
    expect(text.title).toBe(`Issue #${issue.number}`);
    expect(text.subtitle).toBe("Major incident");
    expect(text.description).toContain(issue.title);
    expect(text.description).toContain("comments");
    expect(text.reason).toContain(issue.reason);
    expect(text.sourceUrl).toBe(issue.url);
    expect(text.visualState).toBe(issue.state);
  });

  it("uses the analysis timestamp, not the clock", () => {
    const issue = fixture.metrics.issues.ranked[0];
    expect(incidentText(issue, fixture.generatedAt)).toEqual(
      incidentText(issue, fixture.generatedAt),
    );
    expect(incidentText(issue, "2027-01-01T00:00:00.000Z").description).not.toBe(
      incidentText(issue, fixture.generatedAt).description,
    );
  });
});

describe("constructionText (PLAN.md section 13)", () => {
  it("titles a site with its pull request number and state label", () => {
    const pull = fixture.metrics.pulls.ranked.find((p) => p.state === "abandoned")!;
    const text = constructionText(pull, fixture.generatedAt);
    expect(text.title).toBe(`Pull Request #${pull.number}`);
    expect(text.subtitle).toBe("Abandoned construction");
    expect(text.reason).toBe(pull.reason);
    expect(text.sourceUrl).toBe(pull.url);
  });
});

describe("planLandmarks (PLAN.md sections 14, 15, 16, 20 and 62)", () => {
  it("names each landmark the way the inspector shows it", () => {
    const specs = planLandmarks(fixture);
    const byType = new Map(specs.map((s) => [s.landmarkType, s]));

    expect(byType.get("power")!.title).toBe("POWER GRID");
    expect(byType.get("power")!.subtitle).toBe("GitHub Actions");
    expect(byType.get("fire")!.title).toBe("FIRE STATION");
    expect(byType.get("fire")!.subtitle).toBe("Test Infrastructure");
    // One spelling everywhere (QA-2026-09-21 bug 5).
    expect(byType.get("info")!.title).toBe("INFORMATION CENTRE");
    expect(byType.get("station")!.title).toBe("TRANSIT STATION");
    expect(byType.get("civic")!.title).toBe("CITY HALL");
    expect(byType.get("civic")!.subtitle).toBe(repo.fullName);
  });

  it("never claims test coverage, only test infrastructure (PLAN.md section 15)", () => {
    const fire = planLandmarks(fixture).find((s) => s.landmarkType === "fire")!;
    expect(fire.reason.toLowerCase()).not.toContain("coverage measured");
    expect(fire.reason).toContain("not measured coverage");
    expect(fire.level).toBe(fixture.metrics.tests.strength);
  });

  it("drops the power grid rather than implying a failure when CI is absent", () => {
    const noCi = clone();
    noCi.metrics.ci = { state: "none", provider: "none", failureRate: 0, recentRuns: 0 };
    const specs = planLandmarks(noCi);
    expect(specs.some((s) => s.landmarkType === "power")).toBe(false);
    expect(specs.some((s) => s.landmarkType === "civic")).toBe(true);
  });

  it("keeps a power grid without a status claim for a non-Actions provider", () => {
    const other = clone();
    other.metrics.ci = { state: "unknown", provider: "other", failureRate: 0, recentRuns: 0 };
    const power = planLandmarks(other).find((s) => s.landmarkType === "power")!;
    expect(power.subtitle).toBe("External CI");
    expect(power.description).toContain("no completed runs");
    expect(power.level).toBe(1);
  });

  it("scales the city hall with the health band", () => {
    const struggling = clone();
    struggling.metrics.health.band = "Critical";
    struggling.metrics.health.score = 12;
    const hall = planLandmarks(struggling).find((s) => s.landmarkType === "civic")!;
    expect(hall.level).toBe(1);
    expect(hall.state).toBe("critical");
    expect(hall.description).toContain("Critical city");
  });
});

describe("districtText (PLAN.md sections 8 and 42)", () => {
  it("keeps the source path and links to the tree", () => {
    const plan = fixture.districts[0];
    const text = districtText(plan, repo);
    expect(text.title).toBe(plan.name);
    expect(text.subtitle).toBe(plan.sourcePath);
    expect(text.sourceUrl).toBe(
      `${repo.url}/tree/${repo.headSha}/${plan.sourcePath.replace(/^\//, "")}`,
    );
  });

  it("states the district's share of the repository when a total is given", () => {
    const plan = { ...fixture.districts[0], purpose: null, fileCount: 25 };
    const text = districtText(plan, repo, 100);
    expect(text.description).toContain("25% of the repository");
    expect(text.reason).toContain("25% of the repository");
  });
});

describe("trainsPerMinute (PLAN.md section 20)", () => {
  it("runs freight for an active cadence and a slow service for an occasional one", () => {
    const active = trainsPerMinute(
      { count: 40, lastDaysAgo: 3, cadence: "active" },
      false,
    );
    const occasional = trainsPerMinute(
      { count: 4, lastDaysAgo: 400, cadence: "occasional" },
      false,
    );
    expect(active).toBeGreaterThan(occasional);
    expect(active).toBeLessThanOrEqual(6);
    expect(occasional).toBeGreaterThanOrEqual(0.25);
  });

  it("gives an unreleased repository no station and an archived one a quiet one", () => {
    expect(trainsPerMinute({ count: 0, lastDaysAgo: null, cadence: "none" }, false)).toBe(0);
    const live = trainsPerMinute({ count: 9, lastDaysAgo: 30, cadence: "active" }, false);
    const frozen = trainsPerMinute({ count: 9, lastDaysAgo: 30, cadence: "active" }, true);
    expect(frozen).toBeLessThan(live);
    expect(frozen).toBeGreaterThan(0);
  });
});
