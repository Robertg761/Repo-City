/**
 * Eyeball the generated city without the renderer.
 *
 *   node scripts/city-stats.ts [fixtures/sample.analysis.json]
 *
 * Prints counts, bounds, the PLAN.md section 37 limits, the two geometric
 * invariants (no two building footprints intersect; no building sits on a
 * road) and a coarse ASCII map. This is the layout's smoke test during
 * development and the evidence in the workstream report.
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

const { generateCity, LIMITS, buildingsOnRoads, obstructedPlots, overlappingBuildings } =
  await import("../lib/city/generator.ts");

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

  // Props go down first: everything else is allowed to draw over them.
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
  const lines = [
    `repository        ${city.repository.fullName}${city.repository.archived ? " (archived)" : ""}`,
    `seed              ${city.seed}`,
    `health            ${city.health.band} ${Math.round(city.health.score)}/100, activity ${city.activity.score}`,
    `bounds            ${city.bounds.size} x ${city.bounds.size} units, centred on the origin`,
    `districts         ${city.districts.length}`,
    `buildings         ${city.buildings.length} / ${LIMITS.buildings}   tiers 1-5: ${tiers.join(", ")}`,
    `roads             ${city.roads.length} (${city.roads.filter((r) => r.major).length} major)`,
    `landmarks         ${city.landmarks.map((l) => `${l.landmarkType}${l.size ? ` ${l.size[0]}x${l.size[2]}` : ""}`).join(", ") || "none"}`,
    `incidents         ${city.incidents.length} / ${LIMITS.incidents}`,
    `construction      ${city.constructionSites.length} / ${LIMITS.construction}`,
    `trees             ${city.props.trees.length} / ${LIMITS.trees}`,
    `lamps             ${city.props.lamps.length}`,
    `vehicles          ${city.vehicles.count} / ${LIMITS.vehicles}`,
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

function main(): void {
  const argument = process.argv[2] ?? "fixtures/sample.analysis.json";
  const path = resolve(process.cwd(), argument);
  const analysis = JSON.parse(readFileSync(path, "utf8")) as RepoAnalysis;
  const city = generateCity(analysis);

  console.log(report(city));
  console.log("");
  console.log(
    "# major road  + minor road  1-5 building tier  ! incident  C construction  t tree  ' lamp",
  );
  console.log("P power  F fire  I info  S station  H city hall");
  console.log("");
  console.log(asciiMap(city));
}

main();
