import { describe, expect, it } from "vitest";
import sample from "@/fixtures/sample.analysis.json";
import type { RepoAnalysis } from "@/types/analysis";
import type { RoadSegment } from "@/types/city";
import { distanceToRoad } from "./layout";
import {
  OVERFLOW_APPEAR,
  OVERVIEW_BEARING,
  QUEUE_BODIES,
  QUEUE_MAX,
  QUEUE_SPACING,
  SIGN_SIZE,
  buildOverflow,
  fillQueue,
  overflowTotals,
  planOverflowSite,
  queueLength,
  signposted,
  trivialOverflow,
} from "./overflow";
import { mulberry32 } from "./prng";
import { SIDEWALK_WIDTH, boxesOverlap, laneOffset, roadBox } from "./spots";

const fixture = sample as unknown as RepoAnalysis;

const road = (
  id: string,
  from: [number, number],
  to: [number, number],
  width = 7,
  kind?: RoadSegment["kind"],
): RoadSegment => ({
  id,
  from: [from[0], 0, from[1]],
  to: [to[0], 0, to[1]],
  width,
  major: true,
  appearAt: 0,
  ...(kind ? { kind } : {}),
});

const ring: RoadSegment[] = [
  road("n", [-50, -50], [50, -50]),
  road("e", [50, -50], [50, 50]),
  road("s", [50, 50], [-50, 50]),
  road("w", [-50, 50], [-50, -50]),
];
const highways = [
  road("hwy-0", [0, -50], [0, -200], 8.4, "highway"),
  road("hwy-1", [50, 0], [200, 0], 8.4, "highway"),
];
const shortHighway = road("hwy-0", [0, -50], [0, -80], 8.4, "highway");
const nothing = () => false;

describe("queueLength (PLAN.md 76.8)", () => {
  it("is clamp(round(8 log10(hidden + 1)), 4, 60), and none when nothing is hidden", () => {
    expect(queueLength(0)).toBe(0);
    expect(queueLength(1)).toBe(4);
    expect(queueLength(99)).toBe(16);
    expect(queueLength(20_112)).toBe(34);
    expect(queueLength(1e12)).toBe(QUEUE_MAX);
  });
});

describe("overflowTotals", () => {
  it("uses the real totals when the server had them, and adds up", () => {
    const analysis = structuredClone(fixture);
    analysis.metrics.issues.total = 21_011;
    analysis.metrics.pulls.total = 700;
    analysis.totalsExact = true;
    const totals = overflowTotals(analysis, { issues: 1000, pulls: 500 }, { issues: 1000, pulls: 500 });
    expect(totals.issues).toEqual({ total: 21_011, drawn: 1000, hidden: 20_011 });
    expect(totals.pulls).toEqual({ total: 700, drawn: 500, hidden: 200 });
    expect(totals.exact).toBe(true);
  });

  it("estimates from open_issues_count, which counts pull requests too", () => {
    const analysis = structuredClone(fixture);
    delete analysis.metrics.issues.total;
    delete analysis.metrics.pulls.total;
    analysis.repo.openIssuesCount = 400;
    analysis.metrics.pulls.open = 30;
    const totals = overflowTotals(analysis, { issues: 5, pulls: 3 }, { issues: 5, pulls: 3 });
    expect(totals.pulls.total).toBe(30);
    expect(totals.issues.total).toBe(370);
    expect(totals.exact).toBe(false);
    for (const count of [totals.issues, totals.pulls]) {
      expect(count.drawn + count.hidden).toBe(count.total);
    }
  });

  it("never reports a negative queue when a total is stale", () => {
    const analysis = structuredClone(fixture);
    analysis.metrics.issues.total = 3;
    analysis.metrics.pulls.total = 1;
    const totals = overflowTotals(analysis, { issues: 9, pulls: 4 }, { issues: 9, pulls: 4 });
    expect(totals.issues).toEqual({ total: 9, drawn: 9, hidden: 0 });
    expect(totals.pulls).toEqual({ total: 4, drawn: 4, hidden: 0 });
  });

  it("is inexact when the server says so, even with totals", () => {
    const analysis = structuredClone(fixture);
    analysis.metrics.issues.total = 10;
    analysis.metrics.pulls.total = 10;
    analysis.totalsExact = false;
    expect(overflowTotals(analysis, { issues: 1, pulls: 1 }, { issues: 1, pulls: 1 }).exact).toBe(false);
  });
});

describe("planOverflowSite and fillQueue", () => {
  const roads = [...ring, ...highways];
  const site = planOverflowSite(roads, highways, nothing)!;

  it("queues on every highway and reserves nothing when there are highways", () => {
    expect(site.routes.map((r) => r.road.id)).toEqual(["hwy-0", "hwy-1"]);
    expect(site.reserved.size).toBe(0);
  });

  it("never queues on a metropolis ring, though its segments are highways too", () => {
    const metroRing = ring.map((r) => ({ ...r, width: 10, kind: "highway" as const }));
    const plan = planOverflowSite([...metroRing, ...highways], highways, nothing)!;
    expect(plan.routes.map((r) => r.road.id)).toEqual(["hwy-0", "hwy-1"]);
    // Clear of the ten-wide ring and its pavement.
    expect(plan.routes[0].head).toBeCloseTo(5 + SIDEWALK_WIDTH + 2.3 + 0.5, 6);
  });

  it("stands the cars in the inbound lane, facing the city, from just outside the ring", () => {
    const queue = fillQueue(site.routes, 21, mulberry32(1));
    expect(queue).toHaveLength(21);
    const onFirst = queue.filter((car) => car.roadId === "hwy-0");
    expect(onFirst.length).toBe(11);
    for (const [k, car] of onFirst.entries()) {
      const [x, , z] = car.position;
      // Inbound on hwy-0 travels +z (towards the ring); its right-hand lane is at -x.
      expect(x).toBeCloseTo(-laneOffset(8.4), 3);
      expect(car.rotationY).toBeCloseTo(0, 3);
      // Head clear of the ring and its pavement, then one car every 5.2.
      expect(z).toBeCloseTo(-50 - (7 / 2 + SIDEWALK_WIDTH + 2.3 + 0.5) - k * QUEUE_SPACING, 3);
      expect(car.body).toBeGreaterThanOrEqual(0);
      expect(car.body).toBeLessThan(QUEUE_BODIES);
    }
  });

  it("deals cars round the routes and stops when the roads are full", () => {
    const short = planOverflowSite([...ring, shortHighway], [shortHighway], nothing)!;
    const queue = fillQueue(short.routes, 60, mulberry32(2));
    // 30 units of highway: the head at 7.3, then as many 5.2 steps as fit.
    expect(queue.length).toBe(Math.floor((30 - 7.3 - 2.3) / QUEUE_SPACING) + 1);
  });

  it("stands the sign on the verge beside the head of the first queue, facing the overview camera", () => {
    const sign = site.sign;
    const hwy = highways[0];
    // Its face (local +z) points at the default overview camera, which looks
    // from +x, +z (`OVERVIEW_DIR` in components/city/entities.ts).
    expect(sign.rot).toBeCloseTo(OVERVIEW_BEARING, 3);
    expect(Math.sin(sign.rot)).toBeGreaterThan(0.7);
    expect(Math.cos(sign.rot)).toBeGreaterThan(0.7);
    // Beside its road: the turned board clears the kerb and the pavement by
    // half a unit, and comes no further out than that.
    const [nx, nz] = [Math.sign(sign.x), 0];
    const reach =
      (SIGN_SIZE[0] / 2) * Math.abs(nx * Math.cos(sign.rot) - nz * Math.sin(sign.rot)) +
      (SIGN_SIZE[2] / 2) * Math.abs(nx * Math.sin(sign.rot) + nz * Math.cos(sign.rot));
    expect(distanceToRoad(sign.x, sign.z, hwy)).toBeCloseTo(8.4 / 2 + SIDEWALK_WIDTH + 0.5 + reach, 3);
    expect(sign.hw).toBe(SIGN_SIZE[0] / 2);
    expect(sign.hd).toBe(SIGN_SIZE[2] / 2);
    for (const r of roads) expect(boxesOverlap(sign, roadBox(r))).toBe(false);
  });

  it("faces the overview camera on a road running any way", () => {
    for (const [dx, dz] of [
      [1, 0],
      [0, 1],
      [-1, 0],
      [0, -1],
      [0.6, 0.8],
    ]) {
      const out = road("out", [dx * 60, dz * 60], [dx * 120, dz * 120], 8.4, "highway");
      const sign = planOverflowSite([out], [out], nothing)!.sign;
      expect(sign.rot).toBeCloseTo(OVERVIEW_BEARING, 3);
      expect(boxesOverlap(sign, roadBox(out))).toBe(false);
      expect(distanceToRoad(sign.x, sign.z, out)).toBeLessThan(8.4 / 2 + SIDEWALK_WIDTH + 0.5 + 3.6);
    }
  });

  it("moves the sign along until it is clear of what stands there", () => {
    const blockedFirst = planOverflowSite(roads, highways, (box) => box.z > -60)!;
    expect(blockedFirst.sign.z).toBeLessThanOrEqual(-60);
  });

  it("uses the road out that reaches furthest, and reserves it, when nothing is forked", () => {
    const village = [road("main-e", [0, 0], [40, 5], 5), road("main-w", [0, 0], [-55, -4], 5), road("lane", [0, 0], [0, 20], 3.6, "lane")];
    village[2].major = false;
    const plan = planOverflowSite(village, [], nothing)!;
    expect(plan.routes.map((r) => r.road.id)).toEqual(["main-w"]);
    expect([...plan.reserved]).toEqual(["main-w"]);
    // The queue runs outwards from the village, travelling back in.
    const queue = fillQueue(plan.routes, 4, mulberry32(3));
    expect(queue[1].position[0]).toBeLessThan(queue[0].position[0]);
  });
});

describe("buildOverflow", () => {
  const site = planOverflowSite([...ring, ...highways], highways, nothing);

  it("is null when nothing is hidden", () => {
    const totals = {
      issues: { total: 5, drawn: 5, hidden: 0 },
      pulls: { total: 2, drawn: 2, hidden: 0 },
      exact: true,
    };
    expect(
      buildOverflow({ site, totals, surveyed: { issues: 5, pulls: 2 }, tier: "city", repoUrl: "https://github.com/o/r", prng: mulberry32(1) }),
    ).toBeNull();
  });

  it("counts a trivial remainder but stands no sign and queues no cars", () => {
    // atom/atom: 961 of 962 open issues reached the streets, the survey
    // drifting by one between its pages.
    const totals = {
      issues: { total: 962, drawn: 961, hidden: 1 },
      pulls: { total: 31, drawn: 31, hidden: 0 },
      exact: true,
    };
    const overflow = buildOverflow({
      site,
      totals,
      surveyed: { issues: 961, pulls: 31 },
      tier: "city",
      repoUrl: "https://github.com/o/r",
      prng: mulberry32(1),
    })!;
    expect(overflow).not.toBeNull();
    expect(overflow.issues).toEqual(totals.issues);
    expect(overflow.issues.drawn + overflow.issues.hidden).toBe(overflow.issues.total);
    expect(overflow.queue).toEqual([]);
    expect(overflow.size).toEqual([0, 0, 0]);
    expect(signposted(overflow)).toBe(false);
    expect(overflow.description).toContain("1 more is counted but not drawn");
    expect(overflow.reason).toContain("no queue forms at the city limits");
    expect(overflow.reason).toContain("the survey reached 961 of the 962 open issues");
  });

  it("calls a remainder trivial at two or fewer, or under half a percent of exact totals", () => {
    const totals = (issues: [number, number], pulls: [number, number], exact: boolean) => ({
      issues: { total: issues[0], drawn: issues[0] - issues[1], hidden: issues[1] },
      pulls: { total: pulls[0], drawn: pulls[0] - pulls[1], hidden: pulls[1] },
      exact,
    });
    expect(trivialOverflow(totals([10, 1], [0, 0], true))).toBe(true);
    expect(trivialOverflow(totals([10, 1], [5, 1], false))).toBe(true);
    expect(trivialOverflow(totals([10, 3], [0, 0], true))).toBe(false);
    expect(trivialOverflow(totals([2000, 9], [500, 3], true))).toBe(true);
    // An estimate is never trusted to be that close.
    expect(trivialOverflow(totals([2000, 9], [500, 3], false))).toBe(false);
    // react: 12 of 512 pull requests queued, 859 of 859 issues drawn.
    expect(trivialOverflow(totals([859, 0], [512, 12], true))).toBe(false);
  });

  it("builds the signboard entity with its counts and a queue sized by the hidden total", () => {
    const totals = {
      issues: { total: 21_011, drawn: 1000, hidden: 20_011 },
      pulls: { total: 520, drawn: 500, hidden: 20 },
      exact: false,
    };
    const overflow = buildOverflow({
      site,
      totals,
      surveyed: { issues: 1000, pulls: 500 },
      tier: "metropolis",
      repoUrl: "https://github.com/o/r",
      prng: mulberry32(1),
    })!;
    expect(overflow.id).toBe("overflow");
    expect(overflow.kind).toBe("overflow");
    expect(overflow.size).toEqual(SIGN_SIZE);
    expect(signposted(overflow)).toBe(true);
    expect(overflow.issues).toEqual(totals.issues);
    expect(overflow.pulls).toEqual(totals.pulls);
    expect(overflow.exact).toBe(false);
    expect(overflow.queue).toHaveLength(queueLength(20_031));
    expect(overflow.appearAt).toBe(OVERFLOW_APPEAR);
    expect(overflow.title).toBe("+20,011 more open issues");
    expect(overflow.description).toContain("about 21,011");
    expect(overflow.sourceUrl).toBe("https://github.com/o/r/issues");
  });
});
