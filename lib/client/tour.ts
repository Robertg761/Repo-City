/**
 * The cinematic tour's story (the "Tour" button in the HUD).
 *
 * A tour is six to ten stops chosen from the city's own data: the whole
 * settlement, its busiest district, the worst incident, the building work,
 * the power grid, the station, whatever else stands out, and a last look at
 * the whole thing. A stop that has nothing to show is left out, so a quiet
 * village gets a short tour and a metropolis with a queue at its limits gets
 * a long one.
 *
 * Captions are rule templates filled with repository facts, the same facts
 * the inspector lists (PLAN.md section 12: generated, never free-form). Every
 * number goes through `toLocaleString`, and ages are measured against the
 * survey's own clock, `analysis.generatedAt`, as the inspector's are.
 *
 * Pure and deterministic: the same city and analysis always give the same
 * tour. The camera work for each stop lives in `components/tour/path.ts`.
 */

import { cityPopulation } from "./descriptors";
import { daysBetween } from "./entities";
import { CIVIC_TITLE, SETTLEMENT_WORD } from "@/lib/city/entities";
import { signposted } from "@/lib/city/overflow";
import type { RepoAnalysis, SettlementTier } from "@/types/analysis";
import type {
  Building,
  CityModel,
  ConstructionSite,
  District,
  Incident,
  Landmark,
} from "@/types/city";

export type TourStopKind =
  | "establish"
  | "district"
  | "incident"
  | "construction"
  | "power"
  | "station"
  | "archive"
  | "hall"
  | "wreck"
  | "queue"
  | "finale";

export interface TourCaption {
  /** A few words above the title, set in small capitals. */
  eyebrow: string;
  title: string;
  /** One or two short lines of plain facts. */
  line: string;
}

export interface TourStop {
  /** Unique within its tour: the kind, and the subject when there is one. */
  key: string;
  kind: TourStopKind;
  /**
   * The entity the camera frames and the selection ring marks. Null for the
   * two wide shots, which frame the whole settlement.
   */
  subjectId: string | null;
  caption: TourCaption;
  /** How long the camera stays with the subject once it arrives, ms. */
  holdMs: number;
}

/** Never more stops than this, the two wide shots included. */
export const MAX_STOPS = 10;
/**
 * A tour shorter than this borrows the civic landmark for a stop about the
 * settlement's health, so even an empty village has something to say.
 */
export const MIN_STOPS = 6;

/** How long each stop holds, before the caption's length adds to it. */
export const HOLD_MS = { establish: 6500, finale: 6000, default: 4800, max: 7000 } as const;
/** Extra hold per caption character beyond a comfortable read. */
const READ_MS_PER_CHAR = 24;
const COMFORTABLE_CHARS = 90;

/** Longest issue or pull request title a caption quotes whole. */
export const MAX_QUOTED_TITLE = 64;

/**
 * The words a settlement uses for itself. `word` matches the rest of the
 * interface ("Queue at the city limits"): a metropolis reads as a city in a
 * sentence, and calls itself a metropolis only when it is introduced.
 */
export interface TierWords {
  word: string;
  noun: string;
  building: string;
  streets: string;
}

const TIER_WORDS: Record<SettlementTier, TierWords> = {
  village: { word: "village", noun: "village", building: "house", streets: "lanes" },
  town: { word: "town", noun: "town", building: "building", streets: "streets" },
  city: { word: "city", noun: "city", building: "tower", streets: "streets" },
  metropolis: { word: "city", noun: "metropolis", building: "skyscraper", streets: "avenues" },
};

export function tierWords(tier: SettlementTier | undefined): TierWords {
  const words = TIER_WORDS[tier ?? "city"];
  return { ...words, word: SETTLEMENT_WORD[tier ?? "city"] ?? words.word };
}

const count = (value: number): string => value.toLocaleString("en-US");

function plural(n: number, one: string, many = `${one}s`): string {
  return `${count(n)} ${n === 1 ? one : many}`;
}

/** "3 days", "5 months", "12 years": an age a listener takes in at once. */
export function ageText(days: number): string {
  if (days < 1) return "less than a day";
  if (days < 60) return plural(days, "day");
  if (days < 730) return plural(Math.floor(days / 30.44), "month");
  return plural(Math.floor(days / 365.25), "year");
}

/** "today", "yesterday", "12 days ago", "4 months ago". */
export function agoText(days: number): string {
  if (days < 1) return "today";
  if (days < 2) return "yesterday";
  return `${ageText(days)} ago`;
}

/** A title short enough to sit on one caption line, in quotes. */
export function quoted(title: string): string {
  const clean = title.replace(/\s+/g, " ").trim();
  if (clean.length <= MAX_QUOTED_TITLE) return `“${clean}”`;
  const cut = clean.slice(0, MAX_QUOTED_TITLE - 1);
  const space = cut.lastIndexOf(" ");
  return `“${(space > MAX_QUOTED_TITLE * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:–-]+$/, "")}…”`;
}

const capitalise = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/** The last segment of a path: what a building is called on its sign. */
const pathTail = (path: string): string => path.replace(/\/+$/, "").split("/").pop() || path;

function holdFor(kind: TourStopKind, caption: TourCaption): number {
  const base =
    kind === "establish" ? HOLD_MS.establish : kind === "finale" ? HOLD_MS.finale : HOLD_MS.default;
  const chars = caption.title.length + caption.line.length;
  const extra = Math.max(0, chars - COMFORTABLE_CHARS) * READ_MS_PER_CHAR;
  return Math.round(Math.min(Math.max(base, HOLD_MS.max), base + extra));
}

function stop(kind: TourStopKind, subjectId: string | null, caption: TourCaption): TourStop {
  return {
    key: subjectId ? `${kind}:${subjectId}` : kind,
    kind,
    subjectId,
    caption,
    holdMs: holdFor(kind, caption),
  };
}

/** What every template reads: the model, the analysis and one clock. */
export interface TourContext {
  city: CityModel;
  analysis: RepoAnalysis;
  words: TierWords;
  name: string;
  now: number;
}

// ---------------------------------------------------------------------------
// Choosing the subjects
// ---------------------------------------------------------------------------

/** Ties are always broken by id, so the choice never depends on array order alone. */
const byId = (a: { id: string }, b: { id: string }): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * The busiest district: the most building, weighted by how tall it stands,
 * and the tallest building in it.
 */
export function busiestDistrict(city: CityModel): { district: District; tower: Building } | null {
  const byDistrict = new Map<string, Building[]>();
  for (const b of city.buildings) {
    const list = byDistrict.get(b.districtId) ?? [];
    list.push(b);
    byDistrict.set(b.districtId, list);
  }
  let best: { district: District; tower: Building; mass: number } | null = null;
  for (const district of city.districts) {
    const members = byDistrict.get(district.id);
    if (!members || members.length === 0) continue;
    const mass = members.reduce((sum, b) => sum + b.size[1], 0);
    const tower = [...members].sort((a, b) => b.size[1] - a.size[1] || byId(a, b))[0];
    if (!best || mass > best.mass || (mass === best.mass && district.id < best.district.id)) {
      best = { district, tower, mass };
    }
  }
  return best ? { district: best.district, tower: best.tower } : null;
}

/** Every incident in the city, heroes first. */
function allIncidents(city: CityModel): Incident[] {
  return [...city.incidents, ...(city.backlog?.incidents ?? [])];
}

function allSites(city: CityModel): ConstructionSite[] {
  return [...city.constructionSites, ...(city.backlog?.constructionSites ?? [])];
}

/** 2 for a fire, 1 for a collision, 0 for anything calmer. */
function severity(incident: Incident): number {
  const form = incident.form ?? (incident.lod === "crowd" ? incident.issue.form : undefined);
  if (incident.state === "major" || form === "fire") return 2;
  if (incident.state === "collision") return 1;
  return 0;
}

/**
 * The hottest incident: a fire before a collision, then the most heated
 * discussion. Potholes and wrecks never qualify; a city with neither fire
 * nor collision skips this stop.
 */
export function hottestIncident(city: CityModel): Incident | null {
  const candidates = allIncidents(city).filter((i) => severity(i) > 0);
  if (candidates.length === 0) return null;
  const heat = (i: Incident) => i.heat ?? i.issue.heat ?? 0;
  const talk = (i: Incident) => i.issue.comments + (i.issue.reactions ?? 0);
  const hero = (i: Incident) => (i.lod === "crowd" ? 0 : 1);
  return [...candidates].sort(
    (a, b) =>
      severity(b) - severity(a) ||
      hero(b) - hero(a) ||
      heat(b) - heat(a) ||
      talk(b) - talk(a) ||
      byId(a, b),
  )[0];
}

/** The longest-open wreck, when it has been there at least a year. */
export function oldestWreck(city: CityModel, now: number, exclude: ReadonlySet<string>): Incident | null {
  let best: { incident: Incident; bug: boolean; days: number } | null = null;
  for (const incident of allIncidents(city)) {
    if (exclude.has(incident.id)) continue;
    // A stale incident is an old bug; a wreck without that state is any
    // issue left idle for a year. The old bug makes the better story.
    const bug = incident.state === "stale";
    if (!bug && incident.form !== "wreck") continue;
    const days = daysBetween(incident.issue.createdAt, now);
    if (days < 365) continue;
    const better =
      !best ||
      (bug && !best.bug) ||
      (bug === best.bug && (days > best.days || (days === best.days && incident.id < best.incident.id)));
    if (better) best = { incident, bug, days };
  }
  return best?.incident ?? null;
}

/** Hero sites before crowd works; within each, the story order below. */
const SITE_RANK: Record<string, number> = { active: 0, slow: 2, completed: 3, abandoned: 4 };

/**
 * The building work worth flying to: a working crane first, then scaffolding
 * on the building a pull request changes, then slower sites, a newly finished
 * building, and last a site where work has stopped.
 */
export function featuredConstruction(city: CityModel): ConstructionSite | null {
  const rank = (site: ConstructionSite): number => {
    if (site.lod !== "crowd") return SITE_RANK[site.state] ?? 5;
    // Crowd scaffolds on their host facade tell the story as well as a crane.
    if (site.state === "active" && site.buildingId) return 1;
    return 6 + (SITE_RANK[site.state] ?? 5);
  };
  const recent = (site: ConstructionSite) => Date.parse(site.pull.updatedAt) || 0;
  const sites = allSites(city);
  if (sites.length === 0) return null;
  return [...sites].sort(
    (a, b) => rank(a) - rank(b) || (b.heat ?? 0) - (a.heat ?? 0) || recent(b) - recent(a) || byId(a, b),
  )[0];
}

const landmarkOf = (city: CityModel, type: Landmark["landmarkType"]): Landmark | null =>
  city.landmarks.find((l) => l.landmarkType === type) ?? null;

/** Enough is waiting outside to be worth a stop of its own. */
export const QUEUE_WORTH_A_STOP = 25;

// ---------------------------------------------------------------------------
// Caption templates, one per kind of stop
// ---------------------------------------------------------------------------

/**
 * The repository's own file count, before any survey cap: the number the
 * settlement was sized by, then the uncapped tree count, then what was mapped.
 */
function files(analysis: RepoAnalysis): number {
  const { scale } = analysis.metrics;
  return analysis.settlement?.files ?? scale.totalFiles ?? scale.surveyedFiles ?? scale.files;
}

export function establishCaption(ctx: TourContext): TourCaption {
  const { analysis, city, words, name } = ctx;
  const { health } = analysis.metrics;
  const population = count(cityPopulation(analysis.metrics));
  const districts = plural(city.districts.length, "district");
  const built = `${plural(files(analysis), "file")} in ${districts}`;
  return {
    eyebrow: city.repository.archived
      ? `An archived ${words.noun} · health ${health.score}`
      : `${health.band} ${words.noun} · health ${health.score}`,
    title: name,
    line: city.repository.archived
      ? `Archived and still: ${population} people at the last census, ${built}.`
      : `Home to ${population} people, built from ${built}.`,
  };
}

export function districtCaption(ctx: TourContext, district: District, tower: Building): TourCaption {
  const plan = tower.plan;
  const tall = `Its tallest ${ctx.words.building}`;
  const what =
    plan.kind === "directory"
      ? `${tall}, ${pathTail(plan.path)}, holds ${plural(plan.descendantCount, "file")}.`
      : `${tall} is ${pathTail(plan.path)}, a single file.`;
  return {
    eyebrow: "The busiest district",
    title: district.name,
    line: `${what} Height means importance here.`,
  };
}

export function incidentCaption(ctx: TourContext, incident: Incident): TourCaption {
  const issue = incident.issue;
  const days = daysBetween(issue.createdAt, ctx.now);
  const reactions = issue.reactions ?? 0;
  const talk =
    reactions > issue.comments
      ? `${plural(issue.comments, "comment")} and ${plural(reactions, "reaction")}`
      : plural(issue.comments, "comment");
  const fire = severity(incident) === 2;
  return {
    eyebrow: fire ? "The hottest incident · fire" : "The hottest incident · collision",
    title: quoted(issue.title),
    line: fire
      ? `Issue #${issue.number} is on fire: ${talk}, open ${ageText(days)}. Fires are the severe bugs.`
      : `Issue #${issue.number} is a collision: a bug report with ${talk}, open ${ageText(days)}.`,
  };
}

export function wreckCaption(ctx: TourContext, incident: Incident): TourCaption {
  const issue = incident.issue;
  const days = daysBetween(issue.createdAt, ctx.now);
  return {
    eyebrow: "The oldest wreck",
    title: quoted(issue.title),
    line:
      incident.state === "stale"
        ? `Issue #${issue.number} has been open for ${ageText(days)}. Old bugs rust where they stand.`
        : `Issue #${issue.number} has been open for ${ageText(days)}. Issues left this long rust where they stand.`,
  };
}

export function constructionCaption(ctx: TourContext, site: ConstructionSite): TourCaption {
  const pull = site.pull;
  const number = `Pull request #${pull.number}`;
  const updated = daysBetween(pull.updatedAt, ctx.now);
  const title = quoted(pull.title);
  if (site.state === "completed") {
    const merged = pull.mergedAt ? daysBetween(pull.mergedAt, ctx.now) : updated;
    return {
      eyebrow: "Newly built",
      title,
      line: `${number} was merged ${agoText(merged)}, and a new building went up.`,
    };
  }
  if (site.state === "abandoned") {
    return {
      eyebrow: "Work stopped",
      title,
      line: `${number} has not moved in ${ageText(updated)}. The crane stands idle.`,
    };
  }
  if (site.lod === "crowd" && site.buildingId) {
    const host = ctx.city.buildings.find((b) => b.id === site.buildingId);
    const on = host ? ` on ${pathTail(host.plan.path)}` : "";
    return {
      eyebrow: site.state === "active" ? "Under construction" : "Slow construction",
      title,
      line: `${number} has scaffolding up${on}, where its change lands. Updated ${agoText(updated)}.`,
    };
  }
  if (site.state === "slow") {
    return {
      eyebrow: "Slow construction",
      title,
      line: `${number} was last touched ${agoText(updated)}. Every open pull request is a building site.`,
    };
  }
  return {
    eyebrow: "Under construction",
    title,
    line: `${number}, updated ${agoText(updated)}. Every open pull request is a building site.`,
  };
}

const POWER_TITLES: Record<string, string> = {
  healthy: "The lights are on",
  "recent-failure": "A flicker on the grid",
  failing: "The grid is failing",
  unknown: "The grid is quiet",
};

export function powerCaption(ctx: TourContext): TourCaption {
  const { ci } = ctx.analysis.metrics;
  const green = Math.round((1 - ci.failureRate) * 100);
  const across = ci.workflows ? ` across ${plural(ci.workflows, "workflow")}` : "";
  return {
    eyebrow: "The power grid · CI",
    title: POWER_TITLES[ci.state] ?? POWER_TITLES.unknown,
    line:
      ci.recentRuns > 0
        ? `${plural(ci.recentRuns, "recent run")}${across}, ${green}% of them green.`
        : "CI is set up, but no recent runs could be read.",
  };
}

export function stationCaption(ctx: TourContext): TourCaption {
  const { releases } = ctx.analysis.metrics;
  const tag = releases.lastTag;
  const when = releases.lastDaysAgo === null ? null : agoText(releases.lastDaysAgo);
  const pace =
    releases.cadence === "active" ? "Trains run on a steady cadence." : "Trains come, but not often.";
  return {
    eyebrow: "The transit station · releases",
    title: tag ? `Last train in: ${tag}` : "Every release is a train",
    line: when ? `The latest release arrived ${when}. ${pace}` : pace,
  };
}

const DIMENSIONS: Record<keyof RepoAnalysis["metrics"]["health"]["breakdown"], string> = {
  maintenance: "maintenance",
  reliability: "reliability",
  documentation: "documentation",
  organization: "organization",
  responsiveness: "responsiveness",
};

export function hallCaption(ctx: TourContext, civic: Landmark): TourCaption {
  const { health } = ctx.analysis.metrics;
  const ranked = (Object.keys(DIMENSIONS) as (keyof typeof DIMENSIONS)[])
    .map((key) => ({ key, value: health.breakdown[key] }))
    .sort((a, b) => b.value - a.value || (a.key < b.key ? -1 : 1));
  const strongest = DIMENSIONS[ranked[0].key];
  const weakest = DIMENSIONS[ranked[ranked.length - 1].key];
  const label = (civic.title || CIVIC_TITLE[ctx.city.settlement?.tier ?? "city"]).toLowerCase();
  return {
    eyebrow: capitalise(label),
    title: `Health ${health.score} of 100`,
    line:
      strongest === weakest
        ? `${health.band}, and even across the board.`
        : `${health.band}. Strongest on ${strongest}, weakest on ${weakest}.`,
  };
}

export function archiveCaption(ctx: TourContext): TourCaption {
  const pushed = ctx.analysis.metrics.activity.lastPushDaysAgo;
  return {
    eyebrow: "Archived",
    title: `${ctx.name} stands still`,
    line: `The repository is archived. Nobody has pushed in ${ageText(pushed)}, and the work sites are frozen.`,
  };
}

export function queueCaption(ctx: TourContext, overflow: NonNullable<CityModel["overflow"]>): TourCaption {
  const about = overflow.exact ? "" : "about ";
  const issues = overflow.issues.hidden > 0;
  const c = issues ? overflow.issues : overflow.pulls;
  const noun = issues ? "issues" : "pull requests";
  const also =
    issues && overflow.pulls.hidden > 0
      ? ` ${capitalise(about)}${plural(overflow.pulls.hidden, "pull request")} wait with them.`
      : "";
  return {
    eyebrow: `At the ${ctx.words.word} limits`,
    title: `${capitalise(about)}${count(c.hidden)} more ${noun} wait outside`,
    line: `Only ${count(c.drawn)} of ${about}${count(c.total)} open ${noun} fit on the ${ctx.words.streets}.${also}`,
  };
}

export function finaleCaption(ctx: TourContext): TourCaption {
  const { metrics } = ctx.analysis;
  const issues = metrics.issues.total ?? metrics.issues.open;
  const pulls = metrics.pulls.total ?? metrics.pulls.open;
  const exact = ctx.analysis.totalsExact !== false;
  const about = exact ? "" : "about ";
  const parts = [
    plural(ctx.city.buildings.length, ctx.words.noun === "village" ? "house" : "building"),
    issues > 0 ? `${about}${plural(issues, "open issue")}` : "no open issues",
    pulls > 0 ? `${about}${plural(pulls, "pull request")}` : "no pull requests",
  ];
  return {
    eyebrow: `The whole ${ctx.words.noun}`,
    title: ctx.name,
    line: `${capitalise(parts[0])}, ${parts[1]} and ${parts[2]}, on one screen. Click anything to look closer.`,
  };
}

// ---------------------------------------------------------------------------
// The tour
// ---------------------------------------------------------------------------

/** The facts every caption template reads, measured on the survey's own clock. */
export function tourContext(city: CityModel, analysis: RepoAnalysis): TourContext {
  const tier = city.settlement?.tier ?? analysis.settlement?.tier ?? "city";
  const stamped = Date.parse(analysis.generatedAt);
  return {
    city,
    analysis,
    words: tierWords(tier),
    name: city.settlement?.name ?? city.repository.fullName,
    now: Number.isFinite(stamped) ? stamped : 0,
  };
}

/**
 * The stops for one city, in story order. Pure: the same model and analysis
 * always give the same tour. An empty list means there is nothing to tour.
 */
export function buildTour(city: CityModel | null, analysis: RepoAnalysis | null): TourStop[] {
  if (!city || !analysis) return [];
  const ctx = tourContext(city, analysis);
  const archived = city.repository.archived;
  const used = new Set<string>();

  const middle: TourStop[] = [];
  const add = (made: TourStop | null) => {
    if (!made) return;
    if (made.subjectId) used.add(made.subjectId);
    middle.push(made);
  };

  const busiest = busiestDistrict(city);
  if (busiest) add(stop("district", busiest.tower.id, districtCaption(ctx, busiest.district, busiest.tower)));

  const hottest = hottestIncident(city);
  if (hottest) add(stop("incident", hottest.id, incidentCaption(ctx, hottest)));

  const site = featuredConstruction(city);
  if (site) add(stop("construction", site.id, constructionCaption(ctx, site)));

  const power = landmarkOf(city, "power");
  if (power && analysis.metrics.ci.provider !== "none" && analysis.metrics.ci.state !== "none") {
    add(stop("power", power.id, powerCaption(ctx)));
  }

  const station = landmarkOf(city, "station");
  if (station && analysis.metrics.releases.count > 0) {
    add(stop("station", station.id, stationCaption(ctx)));
  }

  const civic = landmarkOf(city, "civic");
  if (archived && civic) add(stop("archive", civic.id, archiveCaption(ctx)));

  const wreck = oldestWreck(city, ctx.now, used);
  if (wreck) add(stop("wreck", wreck.id, wreckCaption(ctx, wreck)));

  const overflow = city.overflow;
  if (
    overflow &&
    signposted(overflow) &&
    overflow.issues.hidden + overflow.pulls.hidden >= QUEUE_WORTH_A_STOP
  ) {
    add(stop("queue", overflow.id, queueCaption(ctx, overflow)));
  }

  // A short tour stops at the civic landmark, which stands for health. It
  // goes before the queue and the wreck so the tour still ends on the edge.
  if (!archived && civic && middle.length + 2 < MIN_STOPS) {
    const at = middle.findIndex((s) => s.kind === "wreck" || s.kind === "queue");
    const hall = stop("hall", civic.id, hallCaption(ctx, civic));
    if (at < 0) middle.push(hall);
    else middle.splice(at, 0, hall);
  }

  return [
    stop("establish", null, establishCaption(ctx)),
    ...middle.slice(0, MAX_STOPS - 2),
    stop("finale", null, finaleCaption(ctx)),
  ];
}

/** The whole tour's length at full motion, flights excluded, ms. */
export function tourHoldMs(stops: readonly TourStop[]): number {
  return stops.reduce((sum, s) => sum + s.holdMs, 0);
}
