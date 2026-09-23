import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { generateCity } from "@/lib/city/generator";
import type { RepoAnalysis, SettlementTier } from "@/types/analysis";
import type { CityModel, ConstructionSite } from "@/types/city";
import {
  HOLD_MS,
  MAX_QUOTED_TITLE,
  MAX_STOPS,
  ageText,
  agoText,
  buildTour,
  constructionCaption,
  quoted,
  tourContext,
  type TourStop,
  type TourStopKind,
} from "./tour";

function load(name: string): RepoAnalysis {
  return JSON.parse(readFileSync(`fixtures/${name}.analysis.json`, "utf8")) as RepoAnalysis;
}

function tourOf(name: string, tier?: SettlementTier): { stops: TourStop[]; city: CityModel; analysis: RepoAnalysis } {
  const analysis = load(name);
  const city = generateCity(analysis, { tier });
  return { stops: buildTour(city, analysis), city, analysis };
}

const kinds = (stops: TourStop[]) => stops.map((s) => s.kind);

/** A repository with nothing going on: no issues, no pull requests, no CI, no releases. */
function emptyish(): RepoAnalysis {
  const analysis = load("sindresorhus__p-limit");
  const { metrics } = analysis;
  return {
    ...analysis,
    metrics: {
      ...metrics,
      issues: { ...metrics.issues, open: 0, ranked: [], total: 0, backlog: [] },
      pulls: { ...metrics.pulls, open: 0, ranked: [], total: 0, backlog: [] },
      ci: { state: "none", provider: "none", failureRate: 0, recentRuns: 0 },
      releases: { count: 0, lastDaysAgo: null, cadence: "none" },
    },
  };
}

describe("stop selection", () => {
  it("tours a village: its busiest lane, the new building, the grid and the station", () => {
    const { stops } = tourOf("sindresorhus__p-limit");
    expect(kinds(stops)).toEqual(["establish", "district", "construction", "power", "station", "finale"]);
    expect(stops[0].caption.title).toBe("Village of p-limit");
    expect(stops[2].caption.eyebrow).toBe("Newly built");
  });

  it("tours a town in the town's own words", () => {
    const { stops } = tourOf("honojs__hono", "town");
    expect(stops[0].caption.title).toBe("Town of hono");
    expect(stops[0].caption.eyebrow).toMatch(/town/);
    expect(stops.find((s) => s.kind === "district")?.caption.line).toMatch(/tallest building/);
    expect(stops.at(-1)?.caption.eyebrow).toBe("The whole town");
  });

  it("tours a city from the tallest tower to the oldest wreck", () => {
    const { stops } = tourOf("honojs__hono");
    expect(kinds(stops)).toEqual([
      "establish",
      "district",
      "construction",
      "power",
      "station",
      "wreck",
      "finale",
    ]);
    expect(stops[1].caption.line).toMatch(/tallest tower/);
  });

  it("tours a metropolis, collision and all", () => {
    const { stops } = tourOf("facebook__react");
    expect(stops[0].caption.title).toBe("Greater react");
    expect(stops[0].caption.eyebrow).toBe("Thriving metropolis · health 81");
    expect(kinds(stops)).toEqual([
      "establish",
      "district",
      "incident",
      "construction",
      "power",
      "station",
      "wreck",
      "finale",
    ]);
    expect(stops[1].caption.line).toMatch(/skyscraper/);
  });

  it("stops at the queue when thousands wait outside the city", () => {
    const { stops } = tourOf("microsoft__vscode");
    const queue = stops.find((s) => s.kind === "queue");
    expect(queue?.subjectId).toBe("overflow");
    expect(queue?.caption.title).toBe("17,610 more issues wait outside");
    expect(queue?.caption.line).toBe(
      "Only 1,000 of 18,610 open issues fit on the avenues. 2,151 pull requests wait with them.",
    );
    // The queue is the last stop before the pull-back.
    expect(stops.at(-2)?.kind).toBe("queue");
  });

  it("tells an archived city's story: stillness, stopped work, an old wreck, no power grid", () => {
    const { stops } = tourOf("atom__atom");
    const found = kinds(stops);
    expect(found).toContain("archive");
    expect(found).toContain("wreck");
    expect(found).not.toContain("power");
    expect(stops[0].caption.eyebrow).toMatch(/^An archived city/);
    expect(stops[0].caption.line).toMatch(/^Archived and still/);
    expect(stops.find((s) => s.kind === "construction")?.caption.eyebrow).toBe("Work stopped");
    expect(stops.find((s) => s.kind === "archive")?.caption.line).toMatch(/Nobody has pushed in 3 years/);
  });

  it("skips what an almost empty repository does not have, and fills in with its health", () => {
    const analysis = emptyish();
    const city = generateCity(analysis);
    const stops = buildTour(city, analysis);
    expect(kinds(stops)).toEqual(["establish", "district", "hall", "finale"]);
    expect(stops[2].caption.title).toBe(`Health ${analysis.metrics.health.score} of 100`);
    expect(stops[2].caption.eyebrow).toBe("Village chapel");
    expect(stops[3].caption.line).toMatch(/no open issues and no pull requests/);
  });

  it("has nothing to tour without a city or an analysis", () => {
    const { city, analysis } = tourOf("sindresorhus__p-limit");
    expect(buildTour(null, analysis)).toEqual([]);
    expect(buildTour(city, null)).toEqual([]);
  });

  it("never runs past the stop limit, and every stop's subject exists", () => {
    for (const name of ["facebook__react", "microsoft__vscode", "backlog", "atom__atom", "sample"]) {
      const { stops, city } = tourOf(name);
      expect(stops.length).toBeLessThanOrEqual(MAX_STOPS);
      expect(stops[0].kind).toBe("establish");
      expect(stops.at(-1)?.kind).toBe("finale");
      expect(new Set(stops.map((s) => s.key)).size).toBe(stops.length);
      const ids = new Set([
        ...city.buildings.map((b) => b.id),
        ...city.landmarks.map((l) => l.id),
        ...city.incidents.map((i) => i.id),
        ...city.constructionSites.map((s) => s.id),
        ...(city.backlog?.incidents ?? []).map((i) => i.id),
        ...(city.backlog?.constructionSites ?? []).map((s) => s.id),
        ...(city.overflow ? [city.overflow.id] : []),
      ]);
      for (const stop of stops) if (stop.subjectId) expect(ids.has(stop.subjectId)).toBe(true);
    }
  });

  it("lasts between forty-five and seventy-five seconds of holds and flights", () => {
    for (const name of ["sindresorhus__p-limit", "honojs__hono", "facebook__react", "atom__atom"]) {
      const { stops } = tourOf(name);
      // Flights add two to four seconds a stop; the holds alone leave room for them.
      const holds = stops.reduce((sum, s) => sum + s.holdMs, 0);
      expect(holds + stops.length * 2200).toBeGreaterThan(40_000);
      expect(holds + stops.length * 3400).toBeLessThan(80_000);
    }
  });
});

describe("determinism", () => {
  it("gives the same tour for the same city, and for a city generated again", () => {
    for (const name of ["sindresorhus__p-limit", "honojs__hono", "facebook__react", "atom__atom"]) {
      const analysis = load(name);
      const city = generateCity(analysis);
      const once = buildTour(city, analysis);
      expect(buildTour(city, analysis)).toEqual(once);
      expect(buildTour(generateCity(load(name)), load(name))).toEqual(once);
    }
  });
});

describe("captions", () => {
  const all = [
    ...tourOf("sindresorhus__p-limit").stops,
    ...tourOf("honojs__hono", "town").stops,
    ...tourOf("honojs__hono").stops,
    ...tourOf("facebook__react").stops,
    ...tourOf("atom__atom").stops,
    ...tourOf("microsoft__vscode").stops,
    ...tourOf("sample").stops,
    ...(() => {
      const analysis = emptyish();
      return buildTour(generateCity(analysis), analysis);
    })(),
  ];

  it("covers every kind of stop", () => {
    const every: TourStopKind[] = [
      "establish",
      "district",
      "incident",
      "construction",
      "power",
      "station",
      "archive",
      "hall",
      "wreck",
      "queue",
      "finale",
    ];
    expect(new Set(all.map((s) => s.kind))).toEqual(new Set(every));
  });

  it("are short, filled in and free of placeholders", () => {
    for (const { caption, holdMs } of all) {
      for (const text of [caption.eyebrow, caption.title, caption.line]) {
        expect(text.trim().length).toBeGreaterThan(0);
        expect(text).not.toMatch(/NaN|\[object/);
      }
      // A quoted issue title may say "undefined" ("c.json returning empty
      // string for undefined values"); the template's own words never do.
      for (const text of [caption.eyebrow, caption.line]) expect(text).not.toMatch(/\bundefined\b|\bnull\b/);
      expect(caption.eyebrow.length).toBeLessThanOrEqual(40);
      expect(caption.title.length).toBeLessThanOrEqual(MAX_QUOTED_TITLE + 2);
      expect(caption.line.length).toBeLessThanOrEqual(130);
      expect(holdMs).toBeGreaterThanOrEqual(HOLD_MS.default);
      expect(holdMs).toBeLessThanOrEqual(HOLD_MS.max);
    }
  });

  it("formats counts with separators but leaves issue numbers as GitHub writes them", () => {
    const { stops } = tourOf("facebook__react");
    expect(stops[0].caption.line).toMatch(/\d,\d{3} files/);
    expect(stops.find((s) => s.kind === "wreck")?.caption.line).toMatch(/^Issue #1159 /);
  });

  it("words the power grid and the station from the metrics", () => {
    const { stops } = tourOf("honojs__hono");
    expect(stops.find((s) => s.kind === "power")?.caption).toEqual({
      eyebrow: "The power grid · CI",
      title: "The lights are on",
      line: "50 recent runs across 7 workflows, 100% of them green.",
    });
    expect(stops.find((s) => s.kind === "station")?.caption).toEqual({
      eyebrow: "The transit station · releases",
      title: "Last train in: v4.13.8",
      line: "The latest release arrived 7 days ago. Trains run on a steady cadence.",
    });
    const failing = tourOf("vercel__turborepo").stops.find((s) => s.kind === "power");
    expect(failing?.caption.title).toBe("The grid is failing");
  });

  it("words every state of a building site", () => {
    const { city, analysis } = tourOf("honojs__hono");
    const ctx = tourContext(city, analysis);
    const hero = city.constructionSites[0];
    const as = (patch: Partial<ConstructionSite>): ConstructionSite => ({ ...hero, ...patch });
    expect(constructionCaption(ctx, as({ state: "active" })).eyebrow).toBe("Under construction");
    expect(constructionCaption(ctx, as({ state: "slow" })).eyebrow).toBe("Slow construction");
    expect(constructionCaption(ctx, as({ state: "abandoned" })).line).toMatch(/crane stands idle/);
    expect(constructionCaption(ctx, as({ state: "completed" })).line).toMatch(/was merged .* a new building went up/);
    const host = city.buildings[0];
    const scaffold = constructionCaption(ctx, as({ state: "active", lod: "crowd", buildingId: host.id }));
    expect(scaffold.line).toContain(`scaffolding up on ${host.plan.path.split("/").pop()}`);
  });

  it("quotes long titles at a word boundary", () => {
    expect(quoted("Short title")).toBe("“Short title”");
    const long = quoted("A very long issue title that goes on and on well past the point where anyone reads it");
    expect(long.length).toBeLessThanOrEqual(MAX_QUOTED_TITLE + 2);
    expect(long.endsWith("…”")).toBe(true);
    expect(long).not.toMatch(/ …/);
  });

  it("says ages the way a person would", () => {
    expect(ageText(0)).toBe("less than a day");
    expect(ageText(1)).toBe("1 day");
    expect(ageText(45)).toBe("45 days");
    expect(ageText(100)).toBe("3 months");
    expect(ageText(4595)).toBe("12 years");
    expect(agoText(0)).toBe("today");
    expect(agoText(1)).toBe("yesterday");
    expect(agoText(13)).toBe("13 days ago");
  });
});
