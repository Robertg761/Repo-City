/**
 * A stand-in crowd for developing the backlog renderer (PLAN.md 76.11: "S5
 * uses its own `fixtures/dev.backlog.ts`, the `?dev=city` pattern").
 *
 * Population (S4, `lib/city/backlog.ts`) is built in parallel, so on its own
 * `city.backlog` is empty. This module fills it with a simple placement of its
 * own, so every crowd form, modifier, pick box and the queue at the city
 * limits can be drawn, measured and screenshotted against a real metropolis:
 *
 *   - kerb spots along both sides of every street, lane spots in the middle
 *     of one street in four, and ground spots on open land;
 *   - scaffolds on the facade of their host that faces the nearest road;
 *   - each item takes the free spot nearest the building its `relatedPath`
 *     names, the way S4 anchors them, or the next one in a stride;
 *   - whatever finds no spot is queued at the city limits.
 *
 * It is not S4's algorithm (no bridges, no hero clearance beyond a radius, no
 * spot index), and nothing outside development imports it. Deterministic:
 * no random draws, only hashes of ids.
 *
 * Dev only. `?dev=backlog` with the `backlog` fixture loaded (type `backlog`
 * in the repository box) swaps this placement in (`backlog/useDevBacklog.ts`).
 * `devBacklogCity()` builds the whole metropolis from the fixture directly.
 */

import { generateCity } from "@/lib/city/generator";
import { constructionText, incidentText } from "@/lib/city/entities";
import type { BacklogIssue, BacklogPull, RankedIssue, RankedPull, RepoAnalysis, SettlementTier } from "@/types/analysis";
import type { Building, CityModel, ConstructionSite, Incident, Overflow, RoadSegment, Vec3 } from "@/types/city";
import { crowdAppearAt } from "@/components/city/reveal";
import { laneOffset } from "@/components/city/traffic";
import { SIDEWALK_WIDTH } from "@/components/city/groundwork";
import { VEHICLE_BODIES } from "@/components/city/models/vehicles/shapes";
import { CROWD_FOOTPRINT } from "@/components/city/blockages";
import { crowdScale } from "@/components/city/backlog/plan";
import type { CrowdForm } from "@/components/city/backlog/forms";

type SpotClass = "kerb" | "lane" | "ground" | "facade";

interface Spot {
  cls: SpotClass;
  x: number;
  z: number;
  heading: number;
  taken: boolean;
  /** Facades: the host and the plot. */
  buildingId?: string;
  size?: Vec3;
}

export interface DevBacklogOptions {
  /**
   * Pack the ground tight and let objects touch, so the whole fixture (about
   * 1,500 objects) fits a city today's layout makes: for measuring draw calls,
   * triangles and frame time at full load, not for looking at (`&crowd=dense`).
   */
  dense?: boolean;
}

/** Kerb pitch, as S4's spot index uses (PLAN.md 76.8). */
const KERB_PITCH = 3.2;
const END_SKIP = 3.5;
const GROUND_PITCH = 3.8;
const DENSE_GROUND_PITCH = 2.4;
const ANCHOR_REACH = 40;
const HERO_CLEAR = 7;
const LANE_SHARE = 0.25;
const SCAFFOLD_SHARE = 0.35;

const hash = (text: string): number => {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
};

const headingOf = (road: RoadSegment) => Math.atan2(road.to[0] - road.from[0], road.to[2] - road.from[2]);

function distanceToRoad(x: number, z: number, road: RoadSegment): number {
  const dx = road.to[0] - road.from[0];
  const dz = road.to[2] - road.from[2];
  const lengthSq = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((x - road.from[0]) * dx + (z - road.from[2]) * dz) / lengthSq));
  return Math.hypot(x - (road.from[0] + dx * t), z - (road.from[2] + dz * t));
}

function insideBuilding(x: number, z: number, b: Building, margin: number): boolean {
  const cos = Math.cos(b.rotationY);
  const sin = Math.sin(b.rotationY);
  const dx = x - b.position[0];
  const dz = z - b.position[2];
  const lx = dx * cos - dz * sin;
  const lz = dx * sin + dz * cos;
  return Math.abs(lx) <= b.size[0] / 2 + margin && Math.abs(lz) <= b.size[2] / 2 + margin;
}

function spotsFor(city: CityModel, groundPitch: number): Spot[] {
  const spots: Spot[] = [];
  const heroes = [...city.incidents, ...city.constructionSites].map((e) => e.position);
  const plots = city.landmarks.map((l) => ({ x: l.position[0], z: l.position[2], r: Math.max(l.size?.[0] ?? 14, l.size?.[2] ?? 12) / 2 + 1.5 }));
  const clear = (x: number, z: number, margin: number) =>
    heroes.every((p) => Math.hypot(p[0] - x, p[2] - z) >= HERO_CLEAR) &&
    plots.every((p) => Math.hypot(p.x - x, p.z - z) >= p.r) &&
    city.buildings.every((b) => !insideBuilding(x, z, b, margin)) &&
    city.props.lamps.every((l) => Math.hypot(l[0] - x, l[2] - z) >= 1.4);

  const streets = city.roads.filter((road) => road.kind !== "highway");
  streets.forEach((road, index) => {
    const length = Math.hypot(road.to[0] - road.from[0], road.to[2] - road.from[2]);
    if (length < END_SKIP * 2 + 1) return;
    const ux = (road.to[0] - road.from[0]) / length;
    const uz = (road.to[2] - road.from[2]) / length;
    const nx = -uz;
    const nz = ux;
    const heading = headingOf(road);
    const lateral = road.kind === "lane" ? road.width / 2 + 0.9 : road.width / 2 + SIDEWALK_WIDTH / 2;
    for (let s = END_SKIP; s <= length - END_SKIP; s += KERB_PITCH) {
      for (const side of [1, -1]) {
        const x = road.from[0] + ux * s + nx * lateral * side;
        const z = road.from[2] + uz * s + nz * lateral * side;
        if (clear(x, z, 0.4)) spots.push({ cls: "kerb", x, z, heading, taken: false });
      }
    }
    // One lane spot in the middle of every fourth street.
    if (index % Math.round(1 / LANE_SHARE) === 1 && length > 16) {
      const off = laneOffset(road.width);
      const x = road.from[0] + ux * length * 0.5 + nx * off;
      const z = road.from[2] + uz * length * 0.5 + nz * off;
      if (clear(x, z, 0)) spots.push({ cls: "lane", x, z, heading, taken: false });
    }
  });

  // Open ground: inside the city, off every road, clear of buildings.
  const half = city.bounds.size / 2 - 4;
  for (let gx = -half; gx <= half; gx += groundPitch) {
    for (let gz = -half; gz <= half; gz += groundPitch) {
      // A hashed nudge, so open ground does not fill in ruled rows.
      const h = hash(`${gx.toFixed(1)}:${gz.toFixed(1)}`);
      const x = gx + ((h % 97) / 97 - 0.5) * 1.2;
      const z = gz + (((h >>> 8) % 89) / 89 - 0.5) * 1.2;
      if (city.roads.some((road) => distanceToRoad(x, z, road) < road.width / 2 + SIDEWALK_WIDTH + 2)) continue;
      if (!clear(x, z, 2)) continue;
      spots.push({ cls: "ground", x, z, heading: (h % 628) / 100, taken: false });
    }
  }

  // Facades: the face of each building nearest a road.
  for (const b of city.buildings) {
    let best: RoadSegment | null = null;
    let bestDistance = Infinity;
    for (const road of streets) {
      const d = distanceToRoad(b.position[0], b.position[2], road);
      if (d < bestDistance) {
        bestDistance = d;
        best = road;
      }
    }
    if (!best) continue;
    // The building's own axes; the one whose outward normal points at the road.
    const cos = Math.cos(b.rotationY);
    const sin = Math.sin(b.rotationY);
    const faces: [number, number, number, number][] = [
      [sin, cos, b.size[2] / 2, b.size[0]],
      [-sin, -cos, b.size[2] / 2, b.size[0]],
      [cos, -sin, b.size[0] / 2, b.size[2]],
      [-cos, sin, b.size[0] / 2, b.size[2]],
    ];
    // Towards the nearest point of that road.
    const px = b.position[0];
    const pz = b.position[2];
    const road = best;
    const rdx = road.to[0] - road.from[0];
    const rdz = road.to[2] - road.from[2];
    const t = Math.max(0, Math.min(1, ((px - road.from[0]) * rdx + (pz - road.from[2]) * rdz) / (rdx * rdx + rdz * rdz || 1)));
    const tx = road.from[0] + rdx * t - px;
    const tz = road.from[2] + rdz * t - pz;
    let face = faces[0];
    let score = -Infinity;
    for (const f of faces) {
      const dot = f[0] * tx + f[1] * tz;
      if (dot > score) {
        score = dot;
        face = f;
      }
    }
    const [fx, fz, depth, width] = face;
    spots.push({
      cls: "facade",
      x: b.position[0] + fx * depth,
      z: b.position[2] + fz * depth,
      heading: Math.atan2(fx, fz),
      taken: false,
      buildingId: b.id,
      size: [width, b.size[1], 0.9],
    });
  }
  return spots;
}

function anchorFor(path: string | null, city: CityModel): [number, number] | null {
  if (!path) return null;
  const lower = path.toLowerCase();
  let best: Building | null = null;
  let bestLength = 0;
  for (const b of city.buildings) {
    const p = b.plan.path.toLowerCase();
    if ((lower.startsWith(p) || p.startsWith(lower)) && p.length > bestLength) {
      best = b;
      bestLength = p.length;
    }
  }
  if (best) return [best.position[0], best.position[2]];
  const top = lower.split("/")[0];
  const district = city.districts.find((d) => d.sourcePath.toLowerCase() === top);
  return district ? [district.rect.x, district.rect.z] : null;
}

/** The circle round a form's footprint at its heat. */
function reachOf(form: CrowdForm, heat: number): number {
  const rect = CROWD_FOOTPRINT[form];
  return Math.hypot(Math.max(-rect.minX, rect.maxX), Math.max(-rect.minZ, rect.maxZ)) * crowdScale(heat);
}

/** Room a neighbour needs, on average, beyond its own centre. */
const NEIGHBOUR = 1.1;

/** Everything on the ground within reach of a claimed spot is no longer free. */
function occupy(spots: Spot[], taken: Spot, reach: number): void {
  if (taken.cls === "facade") return;
  for (const spot of spots) {
    if (spot.taken || spot.cls === "facade") continue;
    if (Math.hypot(spot.x - taken.x, spot.z - taken.z) < reach + NEIGHBOUR) spot.taken = true;
  }
}

function claim(
  spots: Spot[],
  classes: readonly SpotClass[],
  anchor: [number, number] | null,
  stride: number,
  reach: number,
): Spot | null {
  if (anchor) {
    let best: Spot | null = null;
    let bestDistance = ANCHOR_REACH;
    for (const spot of spots) {
      if (spot.taken || !classes.includes(spot.cls)) continue;
      const d = Math.hypot(spot.x - anchor[0], spot.z - anchor[1]);
      if (d < bestDistance) {
        bestDistance = d;
        best = spot;
      }
    }
    if (best) {
      best.taken = true;
      occupy(spots, best, reach);
      return best;
    }
  }
  const free = spots.filter((spot) => !spot.taken && classes.includes(spot.cls));
  if (free.length === 0) return null;
  const spot = free[stride % free.length];
  spot.taken = true;
  occupy(spots, spot, reach);
  return spot;
}

const LANE_FORMS = new Set(["collision", "roadblock", "pothole", "fire"]);

function rankedIssue(item: BacklogIssue, analysis: RepoAnalysis): RankedIssue {
  return {
    number: item.number,
    title: item.title,
    url: `${analysis.repo.url}/issues/${item.number}`,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    comments: item.comments,
    labels: item.labels,
    author: item.author,
    bodyExcerpt: "",
    reactions: item.reactions,
    score: item.score,
    state: item.state,
    reason: `An open issue, drawn as a ${item.form} (development placement).`,
    relatedPath: item.relatedPath,
    form: item.form,
    heat: item.heat,
  };
}

function rankedPull(item: BacklogPull, analysis: RepoAnalysis): RankedPull {
  return {
    number: item.number,
    title: item.title,
    url: `${analysis.repo.url}/pull/${item.number}`,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    mergedAt: null,
    draft: item.draft,
    comments: item.comments,
    labels: item.labels,
    author: item.author,
    reactions: item.reactions,
    review: item.review,
    checks: item.checks,
    files: item.files,
    score: item.score,
    state: item.state,
    reason: `An open pull request, drawn as a ${item.form} (development placement).`,
    form: item.form,
    relatedPath: item.relatedPath,
    heat: item.heat,
  };
}

/** Where the queue stands, and the sign beside it (PLAN.md 76.8, simplified). */
function overflowFor(
  city: CityModel,
  analysis: RepoAnalysis,
  drawnIssues: number,
  drawnPulls: number,
): Overflow | null {
  const totalIssues = analysis.metrics.issues.total ?? analysis.repo.openIssuesCount;
  const totalPulls = analysis.metrics.pulls.total ?? 0;
  const heroesIssues = city.incidents.length;
  const heroesPulls = city.constructionSites.filter((s) => s.state !== "completed").length;
  const issues = {
    total: totalIssues,
    drawn: drawnIssues + heroesIssues,
    hidden: Math.max(0, totalIssues - drawnIssues - heroesIssues),
  };
  const pulls = {
    total: totalPulls,
    drawn: drawnPulls + heroesPulls,
    hidden: Math.max(0, totalPulls - drawnPulls - heroesPulls),
  };
  const hidden = issues.hidden + pulls.hidden;
  if (hidden === 0) return null;

  const cars = Math.min(60, Math.max(4, Math.round(8 * Math.log10(hidden + 1))));
  const highways = city.roads.filter((road) => road.kind === "highway");
  const approaches = highways.length > 0 ? highways : city.roads.slice(0, 1);
  const queue: Overflow["queue"] = [];
  let sign: { position: Vec3; rotationY: number } | null = null;
  approaches.forEach((road, r) => {
    // Inbound: from the far end towards the city. Highways start on the ring.
    const length = Math.hypot(road.to[0] - road.from[0], road.to[2] - road.from[2]);
    const ux = (road.from[0] - road.to[0]) / length;
    const uz = (road.from[2] - road.to[2]) / length;
    const nx = -uz;
    const nz = ux;
    const lane = laneOffset(road.width);
    const heading = Math.atan2(ux, uz);
    const share = Math.ceil(cars / approaches.length);
    for (let k = 0; k < share && queue.length < cars; k++) {
      const back = 7 + k * 5.2;
      if (back > length - 3) break;
      const x = road.from[0] - ux * back + nx * lane;
      const z = road.from[2] - uz * back + nz * lane;
      queue.push({
        position: [x, 0, z],
        rotationY: heading,
        body: hash(`${road.id}:${k}`) % (VEHICLE_BODIES.length - 1),
        roadId: road.id,
      });
    }
    if (r === 0) {
      const out = road.width / 2 + 4.5;
      sign = {
        position: [road.from[0] - ux * 14 + nx * out, 0, road.from[2] - uz * 14 + nz * out],
        // Facing the city, so it reads from the overview as well as the road.
        rotationY: Math.atan2(ux, uz),
      };
    }
  });
  const place = sign ?? { position: [city.bounds.size / 2, 0, 0] as Vec3, rotationY: 0 };
  const count = (n: number) => n.toLocaleString("en-US");
  return {
    id: "overflow",
    kind: "overflow",
    position: place.position,
    rotationY: place.rotationY,
    title: "Queue at the city limits",
    subtitle: `${count(issues.hidden)} more open issues, ${count(pulls.hidden)} more pull requests`,
    description: `${count(issues.total)} open issues and ${count(pulls.total)} open pull requests; ${count(issues.drawn + pulls.drawn)} are on the streets.`,
    reason: "Everything open that the city has no room for waits at the city limits.",
    sourceUrl: `${analysis.repo.url}/issues`,
    visualState: "queued",
    appearAt: crowdAppearAt(place.position[0], place.position[2], city.bounds.size),
    issues,
    pulls,
    exact: analysis.totalsExact ?? false,
    size: [6, 5, 1],
    queue,
  };
}

/**
 * `city` with its backlog placed and its overflow queued, from the analysis
 * the city was generated from. A city that already carries a backlog (S4 has
 * landed) comes back unchanged.
 */
export function placeDevBacklog(
  city: CityModel,
  analysis: RepoAnalysis,
  options: DevBacklogOptions = {},
): CityModel {
  if ((city.backlog?.incidents.length ?? 0) + (city.backlog?.constructionSites.length ?? 0) > 0) {
    return city;
  }
  const dense = options.dense === true;
  const spots = spotsFor(city, dense ? DENSE_GROUND_PITCH : GROUND_PITCH);
  // Dense packing lets objects touch, to put the whole fixture on the map.
  const reachFor = (form: CrowdForm, heat: number) => (dense ? -NEIGHBOUR : reachOf(form, heat));
  const scaffoldCap = Math.floor(city.buildings.length * SCAFFOLD_SHARE);
  let scaffolds = 0;
  let lanes = 0;
  const laneCap = Math.floor(city.roads.length * LANE_SHARE);
  const size = city.bounds.size;

  const incidents: Incident[] = [];
  const issues = analysis.metrics.issues.backlog ?? [];
  const placeIssue = (item: BacklogIssue, i: number) => {
    const anchor = anchorFor(item.relatedPath, city);
    const wantsLane = LANE_FORMS.has(item.form) && lanes < laneCap && hash(`lane:${item.number}`) % 3 === 0;
    const classes: SpotClass[] =
      item.form === "wreck" || item.form === "survey"
        ? ["ground", "kerb"]
        : wantsLane
          ? ["lane", "kerb", "ground"]
          : ["kerb", "ground"];
    const spot = claim(spots, classes, anchor, hash(`issue:${item.number}`) + i, reachFor(item.form, item.heat));
    if (!spot) return;
    const lane = spot.cls === "lane";
    if (lane) lanes++;
    const issue = rankedIssue(item, analysis);
    incidents.push({
      id: `backlog-issue-${item.number}`,
      kind: "incident",
      position: [spot.x, 0, spot.z],
      rotationY: spot.heading,
      ...incidentText(issue, analysis.generatedAt),
      appearAt: crowdAppearAt(spot.x, spot.z, size),
      state: item.state,
      issue,
      form: item.form,
      lod: "crowd",
      lane,
      heat: item.heat,
    });
  };

  const sites: ConstructionSite[] = [];
  const pulls = analysis.metrics.pulls.backlog ?? [];
  const placePull = (item: BacklogPull, i: number) => {
    const anchor = anchorFor(item.relatedPath, city);
    let form = item.form === "site" ? "scaffold" : item.form;
    let classes: SpotClass[];
    if (form === "scaffold") {
      if (scaffolds < scaffoldCap) classes = ["facade"];
      else {
        // Past the cap a scaffold becomes a trench beside its host (PLAN.md 76.8).
        form = "trench";
        classes = ["kerb"];
      }
    } else if (form === "hoarding") classes = ["ground", "kerb"];
    else classes = lanes < laneCap && hash(`lane:${item.number}`) % 4 === 0 ? ["lane", "kerb"] : ["kerb", "ground"];
    let spot = claim(spots, classes, anchor, hash(`pull:${item.number}`) + i, reachFor(form, item.heat));
    if (!spot && form === "scaffold") {
      form = "trench";
      spot = claim(spots, ["kerb", "ground"], anchor, hash(`pull:${item.number}`) + i, reachFor(form, item.heat));
    }
    if (!spot) return;
    if (spot.cls === "facade") scaffolds++;
    const lane = spot.cls === "lane";
    if (lane) lanes++;
    const pull = rankedPull({ ...item, form }, analysis);
    sites.push({
      id: `backlog-pull-${item.number}`,
      kind: "construction",
      position: [spot.x, 0, spot.z],
      rotationY: spot.heading,
      ...constructionText(pull, analysis.generatedAt),
      appearAt: crowdAppearAt(spot.x, spot.z, size),
      state: item.state,
      pull,
      size: spot.size,
      form,
      lod: "crowd",
      lane,
      buildingId: spot.buildingId ?? null,
      heat: item.heat,
    });
  };

  // Issues and pull requests take turns, in proportion, so neither side
  // claims all the kerbs before the other has placed anything.
  const order = [
    ...issues.map((_, i) => ({ kind: "issue" as const, i, at: (i + 0.5) / issues.length })),
    ...pulls.map((_, i) => ({ kind: "pull" as const, i, at: (i + 0.5) / pulls.length })),
  ].sort((a, b) => a.at - b.at || (a.kind === "issue" ? -1 : 1));
  for (const next of order) {
    if (next.kind === "issue") placeIssue(issues[next.i], next.i);
    else placePull(pulls[next.i], next.i);
  }

  return {
    ...city,
    backlog: { incidents, constructionSites: sites },
    overflow: overflowFor(city, analysis, incidents.length, sites.length),
  };
}

/**
 * The backlog fixture as a whole metropolis, generated and placed. For a
 * loader that wants a finished model without the store, and for tests.
 */
export async function devBacklogCity(
  tier: SettlementTier = "metropolis",
  options: DevBacklogOptions = {},
): Promise<CityModel> {
  const analysis = (await import("@/fixtures/backlog.analysis.json")).default as unknown as RepoAnalysis;
  return placeDevBacklog(generateCity(analysis, { tier }), analysis, options);
}
