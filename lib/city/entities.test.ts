import { describe, expect, it } from "vitest";
import sampleAnalysis from "@/fixtures/sample.analysis.json";
import type { RepoAnalysis } from "@/types/analysis";
import type { RankedIssue, RankedPull } from "@/types/analysis";
import {
  CIVIC_TITLE,
  INCIDENT_FORM_LABEL,
  WORKS_FORM_LABEL,
  buildingText,
  constructionText,
  crowdConstructionText,
  crowdIncidentText,
  crowdIssueReason,
  crowdPullReason,
  districtText,
  incidentText,
  overflowText,
  placementSentence,
  planLandmarks,
  plural,
  trainsPerMinute,
  type CrowdPlacement,
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

  it("names height classes and the civic ground in the settlement's own buildings", () => {
    const plan = (tier: 1 | 2 | 3 | 4 | 5) => ({ ...fixture.buildings.find((b) => b.landmark === null)!, tier });
    const reason = (tier: 1 | 2 | 3 | 4 | 5, settlement: "village" | "town" | "city" | "metropolis") =>
      buildingText(plan(tier), undefined, repo, settlement).reason;
    expect(reason(2, "village")).toMatch(/^Its height is a two-storey cottage because/);
    expect(reason(5, "village")).toContain("farmhouse");
    expect(reason(3, "town")).toMatch(/^Its height is a three-storey block because/);
    // Nothing in a village or a town is called a tower.
    for (const tier of [1, 2, 3, 4, 5] as const) {
      expect(reason(tier, "village")).not.toMatch(/tower|rise/);
      expect(reason(tier, "town")).not.toMatch(/tower|rise/);
    }
    expect(reason(5, "city")).toMatch(/^Its height is a skyline tower because/);
    expect(reason(5, "metropolis")).toMatch(/^Its height is a skyline tower because/);
    // The city's words are the ones it always had, and they are the default.
    expect(buildingText(plan(4), undefined, repo).reason).toBe(reason(4, "city"));

    const readme = fixture.buildings.find((b) => b.landmark === "readme")!;
    expect(buildingText(readme, undefined, repo, "village").reason).toContain("It stands on the village green because");
    expect(buildingText(readme, undefined, repo, "town").reason).toContain("It stands on the town square because");
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

describe("civic landmark per settlement (PLAN.md 76.10)", () => {
  it("titles the civic landmark by tier and keeps the city's copy as it was", () => {
    const civic = (tier: keyof typeof CIVIC_TITLE) =>
      planLandmarks(fixture, tier).find((s) => s.landmarkType === "civic")!;
    expect(civic("village").title).toBe("VILLAGE CHAPEL");
    expect(civic("town").title).toBe("TOWN HALL");
    expect(civic("city").title).toBe("CITY HALL");
    expect(civic("metropolis").title).toBe("CITY HALL");
    expect(civic("village").description).toMatch(/ village, health /);
    expect(civic("town").reason).toMatch(/puts the town in/);
    expect(planLandmarks(fixture)).toEqual(planLandmarks(fixture, "city"));
  });
});

describe("crowd copy (PLAN.md 76.7 and 76.10)", () => {
  const issue: RankedIssue = {
    number: 42,
    title: "Docs page for the router is out of date",
    url: "https://github.com/o/r/issues/42",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-09-01T00:00:00Z",
    comments: 1234,
    labels: ["Type: Docs", "good first issue"],
    author: "ada",
    bodyExcerpt: "",
    reactions: 3,
    score: 2,
    state: "minor",
    reason: crowdIssueReason("signpost", "minor", ["Type: Docs", "good first issue"]),
    relatedPath: "docs/router",
    form: "signpost",
    heat: 0.4,
  };
  const placement: CrowdPlacement = {
    anchor: "building",
    near: "docs",
    path: "docs/router",
    displaced: false,
    kerbed: false,
    host: null,
    demoted: null,
    tier: "town",
  };

  it("gives every form a label", () => {
    expect(Object.keys(INCIDENT_FORM_LABEL).sort()).toEqual([
      "collision",
      "fire",
      "pothole",
      "roadblock",
      "signpost",
      "survey",
      "wreck",
    ]);
    expect(Object.keys(WORKS_FORM_LABEL).sort()).toEqual(["hoarding", "scaffold", "site", "trench", "van"]);
  });

  it("writes one rule sentence for the form, one for the state, and flags volunteers", () => {
    expect(issue.reason).toBe(
      "A signpost, because the issue is about the documentation, the website or an example. It carries no bug label. It is marked for volunteers, so anyone can fill it in.",
    );
    expect(crowdIssueReason("roadblock", "collision", [])).toMatch(
      /^A roadblock, because .* road stays closed until someone replies\. It is labelled a bug\.$/,
    );
  });

  it("says how old the issue actually is, and which branch of the rule matched", () => {
    expect(crowdIssueReason("wreck", "stale", ["bug"], { open: 412, idle: 20 })).toBe(
      "An abandoned wreck, because the bug has gone stale. It is a bug that has stayed open for 412 days.",
    );
    expect(crowdIssueReason("wreck", "minor", [], { open: 900, idle: 1_203 })).toBe(
      "An abandoned wreck: nobody has touched the issue for 1,203 days. It carries no bug label.",
    );
    expect(crowdIssueReason("fire", "minor", ["security"], { open: 3, idle: 1 })).toMatch(
      /^A fire, because the issue is about security\./,
    );
    expect(crowdIssueReason("fire", "major", ["bug", "p1"], { open: 3, idle: 1 })).toMatch(
      /^A fire, because the issue is a severe bug drawing heavy discussion\./,
    );
  });

  it("says when a pull request was actually last updated, not the rule's range", () => {
    const slow = crowdPullReason("scaffold", "slow", null, null, { open: 90, idle: 32 });
    expect(slow).toContain("It was last updated 32 days ago, so the work is slow.");
    expect(slow).not.toMatch(/15 to 59/);
    expect(crowdPullReason("van", "active", null, null, { open: 2, idle: 0 })).toContain(
      "It was last updated today, so work is going on.",
    );
    expect(crowdPullReason("trench", "abandoned", null, null, { open: 400, idle: 212 })).toContain(
      "Nobody has touched it for 212 days, so the works stand idle.",
    );
  });

  it("adds the review and CI signals to a pull request's rule, but not the state twice", () => {
    const reason = crowdPullReason("trench", "abandoned", "changes-requested", "failing");
    expect(reason).toMatch(/^A trench in the road, /);
    expect(reason).toContain("Nobody has touched it for 60 days or more");
    expect(reason).toContain("Its checks are failing.");
    expect(reason).toContain("A reviewer asked for changes.");
    expect(reason).not.toContain("Nobody is working on it.");
  });

  it("says where the object stands and why, from what placement did", () => {
    expect(placementSentence("issue", placement)).toBe(
      "It stands beside docs because the issue names docs/router.",
    );
    expect(placementSentence("issue", { ...placement, anchor: "none", near: null, path: null })).toBe(
      "The issue names no path the town knows, so it stands where the streets had room.",
    );
    expect(placementSentence("issue", { ...placement, displaced: true })).toMatch(
      /every spot near it was taken/,
    );
    expect(placementSentence("issue", { ...placement, kerbed: true })).toMatch(/waits on the kerb/);
    expect(placementSentence("pull", { ...placement, host: "docs" })).toBe(
      "It stands on docs because the pull request touches docs/router.",
    );
    expect(placementSentence("pull", { ...placement, host: "src" })).toBe(
      "It stands on src, the nearest building with a free face to docs.",
    );
    // Scaffolding with nowhere to anchor says why it stands where it does,
    // without claiming a path it never named.
    const stray = placementSentence("pull", { ...placement, anchor: "none", near: null, path: null, host: "benchmarks/run.mts" });
    expect(stray).toBe(
      "No path it names has a building in the town, so its scaffolding stands on benchmarks/run.mts only because that facade was free.",
    );
    expect(placementSentence("pull", { ...placement, demoted: "cap" })).toMatch(/capped at 35%/);
    expect(placementSentence("pull", { ...placement, demoted: "no-facade" })).toMatch(
      /No facade near docs/,
    );
  });

  it("titles and describes a crowd incident like a hero, with thousands separators", () => {
    const text = crowdIncidentText(issue, "signpost", "2026-09-22T00:00:00Z", placement);
    expect(text.title).toBe("Issue #42");
    expect(text.subtitle).toBe("Signpost");
    expect(text.description).toContain("1,234 comments");
    expect(text.description).toContain("3 reactions");
    expect(text.sourceUrl).toBe(issue.url);
    expect(text.reason.startsWith(issue.reason)).toBe(true);
    expect(text.visualState).toBe("minor");
  });

  it("titles and describes a crowd works object", () => {
    const pull: RankedPull = {
      number: 7,
      title: "Bump the router",
      url: "https://github.com/o/r/pull/7",
      createdAt: "2026-09-01T00:00:00Z",
      updatedAt: "2026-09-22T00:00:00Z",
      mergedAt: null,
      draft: false,
      comments: 0,
      labels: ["dependencies"],
      author: "dependabot[bot]",
      score: 1,
      state: "active",
      reason: crowdPullReason("van", "active", null, null),
    };
    const text = crowdConstructionText(pull, "van", "2026-09-22T00:00:00Z", placement);
    expect(text.title).toBe("Pull Request #7");
    expect(text.subtitle).toBe("Utility works");
    expect(text.description).toBe(
      "Bump the router by dependabot[bot] — opened 21 days ago, last touched today.",
    );
  });
});

describe("overflowText (PLAN.md 76.8 and 76.9)", () => {
  const base = {
    issues: { total: 21_011, drawn: 1_000, hidden: 20_011 },
    pulls: { total: 520, drawn: 500, hidden: 20 },
    surveyed: { issues: 1_000, pulls: 520 },
    tier: "metropolis" as const,
    repoUrl: "https://github.com/o/r",
  };

  it("reads as the signboard, and says about when the totals are estimates", () => {
    const text = overflowText({ ...base, exact: false });
    expect(text.title).toBe("+20,011 more open issues");
    expect(text.subtitle).toBe("Queue at the city limits");
    expect(text.description).toBe(
      "1,000 of about 21,011 open issues are drawn in the city; about 20,011 more wait in the queue. 500 of about 520 open pull requests are drawn in the city; about 20 more wait in the queue.",
    );
    expect(text.reason).toContain("The totals are estimates");
    expect(text.sourceUrl).toBe("https://github.com/o/r/issues");
  });

  it("names the limit that hid each kind: the survey's reach or the ground", () => {
    const text = overflowText({ ...base, exact: true });
    expect(text.description).not.toContain("about");
    expect(text.reason).toContain("For issues, the survey reached 1,000 of the 21,011 open issues.");
    expect(text.reason).toContain("For pull requests, the city had room for 500 of the 520 it was given.");
  });

  it("points at the pull requests when only they are queued", () => {
    const text = overflowText({
      ...base,
      issues: { total: 10, drawn: 10, hidden: 0 },
      exact: true,
      tier: "village",
    });
    expect(text.title).toBe("+20 more open pull requests");
    expect(text.subtitle).toBe("Queue at the village limits");
    expect(text.sourceUrl).toBe("https://github.com/o/r/pulls");
  });
});

describe("number formatting", () => {
  it("formats integers exactly as toLocaleString('en-US') does", () => {
    for (const n of [0, 1, 999, 1000, 12_345, 1_234_567, -4321, 2 ** 40]) {
      expect(plural(n, "file")).toBe(`${n.toLocaleString("en-US")} ${n === 1 ? "file" : "files"}`);
    }
    expect(plural(1.5, "day")).toBe(`${(1.5).toLocaleString("en-US")} days`);
  });
});
