/**
 * Eyeball the generated city without the renderer.
 *
 *   node scripts/city-stats.ts [fixtures/sample.analysis.json] [--tier=village|town|city|metropolis]
 *   node scripts/city-stats.ts [fixtures/sample.analysis.json] --tiers
 *
 * Prints counts, bounds, the settlement's limits (PLAN.md 76.5), the
 * geometric invariants (no two building footprints intersect; no building
 * sits on a road) and a coarse ASCII map. `--tier` forces the settlement the
 * way the dev `?tier=` override does. `--tiers` prints one line per tier
 * instead: bounds, buildings, roads by kind, fields and a rough count of the
 * kerb spots the crowd can stand on (PLAN.md 76.8). This is the layout's smoke
 * test during development and the evidence in the workstream report.
 */

import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { resolve } from "node:path";
import type { RepoAnalysis } from "../types/analysis.ts";
import type { CityModel } from "../types/city.ts";

/**
 * `lib/city/seed.ts` (owned by W0) imports `./prng` without a file extension,
 * which the bundler resolves but bare `node` does not. Rather than edit a file
 * this workstream does not own, teach this process to retry an extensionless
 * relative specifier as `.ts`. Only this script needs it.
 */
registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (specifier.startsWith(".") && !/\.[cm]?[jt]s$/.test(specifier)) {
        return nextResolve(`${specifier}.ts`, context);
      }
      throw error;
    }
  },
});

const { generateCity, buildingsOnRoads, obstructedPlots, overlappingBuildings } =
  await import("../lib/city/generator.ts");
const { SETTLEMENT_PARAMS } = await import("../lib/city/settlement.ts");

type Tier = "village" | "town" | "city" | "metropolis";
const TIERS: Tier[] = ["village", "town", "city", "metropolis"];

const COLS = 96;
const ROWS = 48;

const LANDMARK_GLYPH: Record<string, string> = {
  power: "P",
  fire: "F",
  info: "I",
  station: "S",
  civic: "H",
};

export function asciiMap(city: CityModel): string {
  const size = city.bounds.size;
  const grid: string[][] = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => " "));

  const col = (x: number): number =>
    Math.min(COLS - 1, Math.max(0, Math.floor(((x + size / 2) / size) * COLS)));
  const row = (z: number): number =>
    Math.min(ROWS - 1, Math.max(0, Math.floor(((z + size / 2) / size) * ROWS)));

  const put = (x: number, z: number, glyph: string): void => {
    grid[row(z)][col(x)] = glyph;
  };

  // Fields first, then props: everything else is allowed to draw over them.
  for (const field of city.props.fields ?? []) {
    const fx = Math.sin(field.rotationY);
    const fz = Math.cos(field.rotationY);
    for (let a = -field.w / 2; a <= field.w / 2; a += 1) {
      for (let b = -field.d / 2; b <= field.d / 2; b += 1) {
        put(field.x + fz * a + fx * b, field.z - fx * a + fz * b, ":");
      }
    }
  }
  for (const lamp of city.props.lamps) put(lamp[0], lamp[2], "'");
  for (const tree of city.props.trees) put(tree[0], tree[2], "t");

  for (const road of city.roads) {
    const length = Math.hypot(road.to[0] - road.from[0], road.to[2] - road.from[2]);
    const steps = Math.max(2, Math.ceil(length * 3));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      put(
        road.from[0] + (road.to[0] - road.from[0]) * t,
        road.from[2] + (road.to[2] - road.from[2]) * t,
        road.major ? "#" : "+",
      );
    }
  }

  // Sample cell centres so the gaps between footprints survive the rounding.
  const cellX = (cx: number): number => -size / 2 + ((cx + 0.5) * size) / COLS;
  const cellZ = (cz: number): number => -size / 2 + ((cz + 0.5) * size) / ROWS;
  for (const building of city.buildings) {
    const [x, , z] = building.position;
    const [w, , d] = building.size;
    for (let cx = col(x - w / 2); cx <= col(x + w / 2); cx++) {
      for (let cz = row(z - d / 2); cz <= row(z + d / 2); cz++) {
        if (Math.abs(cellX(cx) - x) > w / 2 || Math.abs(cellZ(cz) - z) > d / 2) continue;
        grid[cz][cx] = String(building.tier);
      }
    }
  }

  for (const site of city.constructionSites) put(site.position[0], site.position[2], "C");
  for (const incident of city.incidents) put(incident.position[0], incident.position[2], "!");
  for (const landmark of city.landmarks) {
    put(landmark.position[0], landmark.position[2], LANDMARK_GLYPH[landmark.landmarkType] ?? "L");
  }

  return grid.map((line) => line.join("")).join("\n");
}

function report(city: CityModel): string {
  const pairs = overlappingBuildings(city);
  const onRoads = buildingsOnRoads(city);
  const blocked = obstructedPlots(city);
  const tiers = [1, 2, 3, 4, 5].map((t) => city.buildings.filter((b) => b.tier === t).length);
  const tier = (city.settlement?.tier ?? "city") as Tier;
  const limits = SETTLEMENT_PARAMS[tier];
  const lines = [
    `repository        ${city.repository.fullName}${city.repository.archived ? " (archived)" : ""}`,
    `settlement        ${city.settlement?.name ?? "(none)"}: ${city.settlement?.reason ?? ""}`,
    `seed              ${city.seed}`,
    `health            ${city.health.band} ${Math.round(city.health.score)}/100, activity ${city.activity.score}`,
    `bounds            ${city.bounds.size} x ${city.bounds.size} units, centred on the origin (band ${limits.bounds.min} to ${limits.bounds.max})`,
    `districts         ${city.districts.length}`,
    `buildings         ${city.buildings.length} / ${limits.buildings.max}   tiers 1-5: ${tiers.join(", ")}`,
    `roads             ${roadSummary(city)}`,
    `plaza             ${city.plaza ? `${city.plaza.surface} ${Math.round(city.plaza.rect.w)}x${Math.round(city.plaza.rect.d)}` : "none"}, fields ${city.props.fields?.length ?? 0}`,
    `landmarks         ${city.landmarks.map((l) => `${l.landmarkType}${l.size ? ` ${l.size[0]}x${l.size[2]}` : ""}`).join(", ") || "none"}`,
    `incidents         ${city.incidents.length} / ${limits.heroes.incidents} heroes, ${city.backlog?.incidents.length ?? 0} crowd`,
    `construction      ${city.constructionSites.length} / ${limits.heroes.sites} heroes, ${city.backlog?.constructionSites.length ?? 0} crowd`,
    `kerb spots        about ${kerbSpots(city)}`,
    `trees             ${city.props.trees.length} / ${limits.trees}`,
    `lamps             ${city.props.lamps.length} / ${limits.lamps}`,
    `vehicles          ${city.vehicles.count} / ${limits.vehicles.max}, visitor share ${city.vehicles.visitorShare ?? "n/a"}`,
    `landmark detail   ${
      city.landmarks
        .filter((l) => l.detail)
        .map((l) => `${l.landmarkType} ${JSON.stringify(l.detail)}`)
        .join(", ") || "none"
    }`,
    `ambience          ${JSON.stringify(city.ambience)}`,
    `reveal ends at    ${Math.max(
      0,
      ...city.buildings.map((b) => b.appearAt),
      ...city.landmarks.map((l) => l.appearAt),
      ...city.incidents.map((i) => i.appearAt),
      ...city.constructionSites.map((c) => c.appearAt),
    )} ms`,
    "",
    `overlapping buildings   ${pairs.length === 0 ? "none" : `${pairs.length}: ${pairs.slice(0, 5).map((p) => p.join("/")).join(" ")}`}`,
    `buildings on a road     ${onRoads.length === 0 ? "none" : `${onRoads.length}: ${onRoads.slice(0, 5).map((h) => `${h.id}(${h.clearance})`).join(" ")}`}`,
    `obstructed plots        ${blocked.length === 0 ? "none" : `${blocked.length}: ${blocked.slice(0, 5).map((h) => `${h.id}/${h.against}`).join(" ")}`}`,
    "",
    districtTable(city),
  ];
  return lines.join("\n");
}

/**
 * Per district: how much ground it holds, how much of it is built on, and how
 * much greenery landed there. A district whose built share is near zero and
 * whose tree count is near zero is the "empty rectangle" failure mode.
 */
function districtTable(city: CityModel): string {
  const rows = [
    "district                 buildings   region    built%   trees",
  ];
  for (const district of city.districts) {
    const inside = city.buildings.filter((b) => b.districtId === district.id);
    const area = district.rect.w * district.rect.d;
    const footprint = inside.reduce((sum, b) => sum + b.size[0] * b.size[2], 0);
    const trees = city.props.trees.filter(
      (t) =>
        Math.abs(t[0] - district.rect.x) <= district.rect.w / 2 &&
        Math.abs(t[2] - district.rect.z) <= district.rect.d / 2,
    ).length;
    rows.push(
      [
        district.sourcePath.padEnd(24),
        String(inside.length).padStart(9),
        `${Math.round(district.rect.w)}x${Math.round(district.rect.d)}`.padStart(9),
        `${((100 * footprint) / Math.max(1, area)).toFixed(1)}%`.padStart(9),
        String(trees).padStart(7),
      ].join(""),
    );
  }
  return rows.join("\n");
}

/** Road counts by kind; highways split into the ring and the roads out. */
function roadSummary(city: CityModel): string {
  const count = (test: (road: CityModel["roads"][number]) => boolean): number => city.roads.filter(test).length;
  const out = count((r) => r.id.startsWith("road-hwy-"));
  const ring = count((r) => r.kind === "highway") - out;
  return [
    `${city.roads.length} segments`,
    `${count((r) => r.major)} major`,
    `${count((r) => (r.kind ?? "street") === "street")} street`,
    `${count((r) => r.kind === "lane")} lane`,
    `${count((r) => r.kind === "avenue")} avenue`,
    `${ring} highway ring`,
    `${out} highways out`,
    `${count((r) => r.main === true)} high street`,
  ].join(", ");
}

/**
 * A rough count of the kerb spots the crowd can stand on (PLAN.md 76.8):
 * both sides of every road that is not a highway, every 3.2 units, skipping
 * the first and last 3.5 of each segment. The real index also skips lamps and
 * heroes, so this is an upper bound.
 */
function kerbSpots(city: CityModel): number {
  let spots = 0;
  for (const road of city.roads) {
    if (road.kind === "highway") continue;
    const length = Math.hypot(road.to[0] - road.from[0], road.to[2] - road.from[2]);
    if (length <= 7) continue;
    spots += 2 * (Math.floor((length - 7) / 3.2) + 1);
  }
  return spots;
}

function tierLine(tier: Tier, city: CityModel): string {
  const band = SETTLEMENT_PARAMS[tier].bounds;
  const inBand = city.bounds.size >= band.min && city.bounds.size <= band.max ? "in band" : "OUT OF BAND";
  const bad =
    overlappingBuildings(city).length + buildingsOnRoads(city).length + obstructedPlots(city).length;
  return [
    tier.padEnd(11),
    `${city.bounds.size.toFixed(1)}`.padStart(7),
    ` (${band.min}-${band.max} ${inBand})`.padEnd(22),
    `${city.buildings.length} buildings`.padEnd(15),
    `${city.districts.length} districts`.padEnd(13),
    roadSummary(city).padEnd(112),
    `fields ${city.props.fields?.length ?? 0}`.padEnd(10),
    `kerb spots ~${kerbSpots(city)}`.padEnd(17),
    `plaza ${city.plaza?.surface ?? "none"}`.padEnd(13),
    `clashes ${bad}`,
  ].join(" ");
}

function main(): void {
  const args = process.argv.slice(2);
  const argument = args.find((a) => !a.startsWith("--")) ?? "fixtures/sample.analysis.json";
  const forced = args.find((a) => a.startsWith("--tier="))?.slice("--tier=".length) as Tier | undefined;
  if (forced && !TIERS.includes(forced)) throw new Error(`unknown tier ${forced}`);
  const path = resolve(process.cwd(), argument);
  const analysis = JSON.parse(readFileSync(path, "utf8")) as RepoAnalysis;

  if (args.includes("--tiers")) {
    console.log(`${analysis.repo.fullName}, ${analysis.buildings.length} buildings planned`);
    for (const tier of TIERS) console.log(tierLine(tier, generateCity(analysis, { tier })));
    return;
  }

  const city = generateCity(analysis, forced ? { tier: forced } : {});
  console.log(report(city));
  console.log("");
  console.log(
    "# major road  + minor road  1-5 building tier  ! incident  C construction  t tree  ' lamp  : field",
  );
  console.log("P power  F fire  I info  S station  H city hall");
  console.log("");
  console.log(asciiMap(city));
}

main();
