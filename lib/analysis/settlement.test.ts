import { describe, expect, it } from "vitest";
import {
  SETTLEMENT_THRESHOLDS,
  baseTierFor,
  classifySettlement,
  nextTier,
  type SettlementInput,
} from "./settlement";

const quiet = { commitsLast90d: 0, activeContributors90d: 0, lastPushDaysAgo: 400 };
const input = (over: Partial<SettlementInput>): SettlementInput => ({
  files: 0,
  dirs: 0,
  archived: false,
  ...quiet,
  ...over,
});

describe("classifySettlement: the PLAN.md 76.4 calibration rows with real fixture numbers", () => {
  // files are `surveyedFiles`, dirs are `metrics.scale.dirs`, activity is the
  // fixture's own `metrics.activity`.
  it.each([
    {
      repo: "a 20-file library",
      over: { files: 20, dirs: 2, commitsLast90d: 100, activeContributors90d: 30, lastPushDaysAgo: 0 },
      footprint: 24,
      base: "village",
      tier: "village",
    },
    {
      repo: "sindresorhus/p-limit",
      over: { files: 16, dirs: 1, commitsLast90d: 7, activeContributors90d: 3, lastPushDaysAgo: 3 },
      footprint: 18,
      base: "village",
      tier: "village",
    },
    {
      repo: "honojs/hono",
      over: { files: 470, dirs: 110, commitsLast90d: 100, activeContributors90d: 33, lastPushDaysAgo: 0 },
      footprint: 690,
      base: "city",
      tier: "city",
    },
    {
      repo: "atom/atom (archived)",
      over: { files: 1139, dirs: 295, archived: true, lastPushDaysAgo: 1358 },
      footprint: 1729,
      base: "city",
      tier: "city",
    },
    {
      repo: "vercel/turborepo",
      over: { files: 2887, dirs: 1392, commitsLast90d: 100, activeContributors90d: 9, lastPushDaysAgo: 0 },
      footprint: 5671,
      base: "city",
      tier: "city",
    },
    {
      repo: "react/react",
      over: { files: 2922, dirs: 516, commitsLast90d: 100, activeContributors90d: 32, lastPushDaysAgo: 0 },
      footprint: 3954,
      base: "city",
      tier: "metropolis",
    },
    {
      repo: "microsoft/vscode (capped, floor from the migration)",
      over: {
        files: 2500,
        dirs: 438,
        lowerBound: true,
        footprintFloor: 20_330,
        commitsLast90d: 100,
        activeContributors90d: 39,
        lastPushDaysAgo: 0,
      },
      footprint: 20_330,
      base: "metropolis",
      tier: "metropolis",
    },
    {
      repo: "torvalds/linux (GitHub truncated the tree)",
      over: { files: 3000, dirs: 1000, githubTruncated: true },
      footprint: 5000,
      base: "metropolis",
      tier: "metropolis",
    },
  ])("$repo is a $tier", ({ over, footprint, base, tier }) => {
    const plan = classifySettlement(input(over));
    expect(plan.footprint).toBe(footprint);
    expect(plan.baseTier).toBe(base);
    expect(plan.tier).toBe(tier);
    expect(plan.promoted).toBe(base !== tier);
  });
});

describe("classifySettlement: rules", () => {
  it("reads the base tier off the footprint, files plus twice the folders", () => {
    expect(baseTierFor(0)).toBe("village");
    expect(baseTierFor(119)).toBe("village");
    expect(baseTierFor(120)).toBe("town");
    expect(baseTierFor(599)).toBe("town");
    expect(baseTierFor(600)).toBe("city");
    expect(baseTierFor(9_999)).toBe("city");
    expect(baseTierFor(10_000)).toBe("metropolis");
    expect(classifySettlement(input({ files: 100, dirs: 10 })).footprint).toBe(120);
  });

  const busyFor = (tier: "village" | "town" | "city") => {
    const rule = SETTLEMENT_THRESHOLDS.promotion[tier];
    return {
      commitsLast90d: rule.commitsLast90d,
      activeContributors90d: rule.activeContributors90d,
      lastPushDaysAgo: SETTLEMENT_THRESHOLDS.maxPushAgeDays,
    };
  };

  it.each([
    ["village", "town", 40],
    ["town", "city", 200],
    ["city", "metropolis", 3_334],
  ] as const)("promotes a busy %s to a %s from footprint %i, and not one below", (from, to, edge) => {
    const at = classifySettlement(input({ files: edge, ...busyFor(from) }));
    expect(at.baseTier).toBe(from);
    expect(at.tier).toBe(to);
    expect(at.promoted).toBe(true);
    expect(at.activity.busy).toBe(true);

    const below = classifySettlement(input({ files: edge - 1, ...busyFor(from) }));
    expect(below.tier).toBe(from);
    expect(below.promoted).toBe(false);
    expect(below.activity.busy).toBe(true);
  });

  it("needs every activity condition: commits, people and a recent push", () => {
    const busy = busyFor("city");
    const files = 5_000;
    expect(classifySettlement(input({ files, ...busy })).tier).toBe("metropolis");
    expect(
      classifySettlement(input({ files, ...busy, commitsLast90d: busy.commitsLast90d - 1 })).tier,
    ).toBe("city");
    expect(
      classifySettlement(
        input({ files, ...busy, activeContributors90d: busy.activeContributors90d - 1 }),
      ).tier,
    ).toBe("city");
    expect(classifySettlement(input({ files, ...busy, lastPushDaysAgo: 31 })).tier).toBe("city");
  });

  it("promotes one step at most", () => {
    // A village in its upper third with metropolis-grade activity is a town.
    const plan = classifySettlement(
      input({ files: 100, commitsLast90d: 100, activeContributors90d: 50, lastPushDaysAgo: 0 }),
    );
    expect(plan.baseTier).toBe("village");
    expect(plan.tier).toBe("town");
  });

  it("never promotes an archived repository", () => {
    const plan = classifySettlement(input({ files: 5_000, archived: true, ...busyFor("city") }));
    expect(plan.tier).toBe("city");
    expect(plan.promoted).toBe(false);
    expect(plan.reason).toContain("archived");
  });

  it("never lowers a tier, however quiet", () => {
    expect(classifySettlement(input({ files: 20_000 })).tier).toBe("metropolis");
    expect(classifySettlement(input({ files: 700 })).tier).toBe("city");
  });

  it("makes a GitHub-truncated tree a metropolis and marks the counts a floor", () => {
    const plan = classifySettlement(input({ files: 10, dirs: 1, githubTruncated: true }));
    expect(plan.tier).toBe("metropolis");
    expect(plan.lowerBound).toBe(true);
    expect(plan.reason).toContain("too large for GitHub");
  });

  it("raises the footprint to a floor and keeps the counts it was given", () => {
    const plan = classifySettlement(input({ files: 2500, dirs: 438, footprintFloor: 12_000 }));
    expect(plan.footprint).toBe(12_000);
    expect(plan.files).toBe(2500);
    expect(plan.dirs).toBe(438);
    expect(plan.lowerBound).toBe(true);
    expect(plan.tier).toBe("metropolis");
  });

  it("walks the tiers in order", () => {
    expect(nextTier("village")).toBe("town");
    expect(nextTier("town")).toBe("city");
    expect(nextTier("city")).toBe("metropolis");
    expect(nextTier("metropolis")).toBeNull();
  });
});

describe("classifySettlement: reason", () => {
  it("says why a promoted repository moved up", () => {
    const plan = classifySettlement(
      input({ files: 2922, dirs: 516, commitsLast90d: 100, activeContributors90d: 32, lastPushDaysAgo: 0 }),
    );
    expect(plan.reason).toBe(
      "2,922 files in 516 folders make a city. 100 commits from 32 people in the last 90 days raise it to a metropolis.",
    );
  });

  it("says a busy repository below the size bar stays where it is", () => {
    const plan = classifySettlement(
      input({ files: 16, dirs: 1, commitsLast90d: 40, activeContributors90d: 5, lastPushDaysAgo: 1 }),
    );
    expect(plan.reason).toBe(
      "16 files in 1 folder make a village. It is busy, but a village stays a village until it has 40 files and folders.",
    );
  });

  it("states only the size when nothing else applies", () => {
    expect(classifySettlement(input({ files: 16, dirs: 1 })).reason).toBe(
      "16 files in 1 folder make a village.",
    );
    expect(classifySettlement(input({ files: 1 })).reason).toBe("1 file at the root makes a village.");
  });

  it("hedges counts that are a floor", () => {
    expect(classifySettlement(input({ files: 700, dirs: 10, lowerBound: true })).reason).toBe(
      "At least 700 files in 10 folders make a city.",
    );
    expect(
      classifySettlement(input({ files: 2500, dirs: 438, footprintFloor: 20_330 })).reason,
    ).toBe(
      "The survey stopped at 2,500 files in 438 folders, but the full tree holds at least 20,330 files and folders, which makes a metropolis.",
    );
  });
});
