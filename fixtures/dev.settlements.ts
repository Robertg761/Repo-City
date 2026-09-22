/**
 * Hand-built settlements for developing the renderer at both ends of the
 * scale (PLAN.md 76.5), before the village and metropolis layouts (S3) and
 * the population pass (S4) land. Like `dev.city.ts`, it is the renderer's
 * contract made concrete, nothing more: the numbers come from
 * `SETTLEMENT_PARAMS`, the shapes are simple.
 *
 *   ?dev=metropolis   a 316-unit metropolis: a motorway ring, avenues with
 *                     medians, side streets, highways out, towers to 34 units
 *   ?dev=village      a 100-unit village: a green, a lane round it, a bending
 *                     main street, and lanes out to cottages at every angle
 *   ?dev=town         the dev city laid out as a town, on setts
 *
 * Dev only: `CityCanvas` loads it when `NODE_ENV !== "production"`, and only
 * while the store has no real city.
 */

import { SETTLEMENT_PARAMS } from "@/lib/city/settlement";
import { prngFor } from "@/lib/city/seed";
import type { BuildingTier } from "@/types/analysis";
import type {
  Building,
  CityModel,
  District,
  Landmark,
  RoadKind,
  RoadSegment,
  Vec3,
} from "@/types/city";
import { devCity } from "./dev.city";

type Point = [number, number];

const LANGUAGES = ["TypeScript", "TypeScript", "Rust", "Go", "Python", "C++"];

function base(seed: string, fullName: string): Omit<
  CityModel,
  "bounds" | "districts" | "buildings" | "roads" | "landmarks" | "props" | "vehicles"
> {
  return {
    repository: { fullName, url: `https://github.com/${fullName}`, archived: false },
    health: devCity.health,
    confidence: devCity.confidence,
    activity: devCity.activity,
    ambience: { ...devCity.ambience, pedestrianDensity: 0.9, trafficDensity: 0.8 },
    incidents: [],
    constructionSites: [],
    seed,
  };
}

function segment(
  id: string,
  [x0, z0]: Point,
  [x1, z1]: Point,
  width: number,
  options: { kind?: RoadKind; major?: boolean; appearAt?: number } = {},
): RoadSegment {
  return {
    id,
    from: [x0, 0, z0],
    to: [x1, 0, z1],
    width,
    major: options.major ?? false,
    appearAt: options.appearAt ?? 200,
    ...(options.kind ? { kind: options.kind } : {}),
  };
}

/** A polyline, one segment per leg. */
function polyline(
  id: string,
  points: Point[],
  width: number,
  options: { kind?: RoadKind; major?: boolean; appearAt?: number } = {},
): RoadSegment[] {
  return points.slice(1).map((to, i) => segment(`${id}-${i}`, points[i], to, width, options));
}

function district(id: string, name: string, rect: District["rect"], colorIndex: number): District {
  return {
    id,
    name,
    sourcePath: id,
    purpose: null,
    rect,
    colorIndex,
    buildingIds: [],
    description: `The ${name}.`,
    reason: "A dev fixture district.",
    sourceUrl: null,
    appearAt: 400,
  };
}

function building(
  n: number,
  districtId: string,
  position: Vec3,
  size: Vec3,
  tier: BuildingTier,
  rotationY: number,
  language: string,
): Building {
  const path = `${districtId}/file-${n}.ts`;
  return {
    id: `b-${n}`,
    kind: "building",
    position,
    rotationY,
    title: `file-${n}.ts`,
    subtitle: path,
    description: "A dev fixture building.",
    reason: "Placed by the dev settlements fixture.",
    sourceUrl: null,
    visualState: "normal",
    appearAt: 450 + n * 4,
    districtId,
    size,
    tier,
    colorIndex: n % 8,
    plan: {
      id: `b-${n}`,
      path,
      kind: n % 5 === 0 ? "directory" : "file",
      districtId,
      score: 5,
      tier,
      descendantCount: 0,
      language,
      role: null,
      landmark: null,
    },
  };
}

function civic(position: Vec3, size: Vec3, title: string): Landmark {
  return {
    id: "landmark-civic",
    kind: "landmark",
    landmarkType: "civic",
    level: 2,
    state: "healthy",
    position,
    rotationY: 0,
    title,
    subtitle: "",
    description: "The civic centre.",
    reason: "Every settlement has one.",
    sourceUrl: null,
    visualState: "healthy",
    appearAt: 300,
    size,
  };
}

// ---------------------------------------------------------------------------
// Metropolis
// ---------------------------------------------------------------------------

function buildMetropolis(): CityModel {
  const params = SETTLEMENT_PARAMS.metropolis;
  const prng = prngFor("dev/metropolis", "layout");
  const ring = 150;
  const avenueAt = [-37.5, 37.5];
  const lines = [-150, -112.5, -75, -37.5, 0, 37.5, 75, 112.5, 150];
  const avenue = params.roads.major.width;
  const minor = params.roads.minor.width;
  const roads: RoadSegment[] = [];

  // Grid lines, split at every crossing. The line through the middle stops at
  // the civic square.
  for (const at of lines.slice(1, -1)) {
    const isAvenue = avenueAt.includes(at);
    for (let i = 0; i < lines.length - 1; i++) {
      const a = lines[i];
      const b = lines[i + 1];
      if (at === 0 && Math.abs(a + b) / 2 < 37.5) continue;
      const options = isAvenue
        ? { kind: "avenue" as const, major: true, appearAt: 150 + i * 20 }
        : { appearAt: 260 + i * 20 };
      const width = isAvenue ? avenue : minor;
      roads.push(segment(`v${at}-${i}`, [at, a], [at, b], width, options));
      roads.push(segment(`h${at}-${i}`, [a, at], [b, at], width, options));
    }
  }
  // The motorway ring, split where every grid line meets it.
  const ringWidth = params.ring!.width;
  for (let i = 0; i < lines.length - 1; i++) {
    const a = lines[i];
    const b = lines[i + 1];
    const options = { kind: "highway" as const, major: true, appearAt: 100 + i * 12 };
    roads.push(segment(`rn-${i}`, [a, -ring], [b, -ring], ringWidth, options));
    roads.push(segment(`rs-${i}`, [a, ring], [b, ring], ringWidth, options));
    roads.push(segment(`rw-${i}`, [-ring, a], [-ring, b], ringWidth, options));
    roads.push(segment(`re-${i}`, [ring, a], [ring, b], ringWidth, options));
  }
  // Highways out to the horizon from four points on the ring.
  const out = 460;
  for (const [id, from, to] of [
    ["hw-n", [75, -ring], [75, -out]],
    ["hw-s", [-75, ring], [-75, out]],
    ["hw-e", [ring, -75], [out, -75]],
    ["hw-w", [-ring, 75], [-out, 75]],
  ] as [string, Point, Point][]) {
    roads.push(segment(id, from, to, ringWidth, { kind: "highway", major: true, appearAt: 80 }));
  }

  // Districts: the four quadrants round the civic square.
  const districts = [
    district("core", "Core District", { x: -75, z: -75, w: 150, d: 150 }, 0),
    district("packages", "Packages District", { x: 75, z: -75, w: 150, d: 150 }, 2),
    district("docs", "Knowledge District", { x: -75, z: 75, w: 150, d: 150 }, 5),
    district("tests", "Safety District", { x: 75, z: 75, w: 150, d: 150 }, 6),
  ];
  const districtAt = (x: number, z: number) => (z < 0 ? (x < 0 ? "core" : "packages") : x < 0 ? "docs" : "tests");

  // Blocks: three by three slots at the metropolis pitch, taller towards the
  // middle; a handful of blocks are parks instead.
  const parks = new Set(["-93.75:56.25", "93.75:-93.75", "56.25:93.75", "-131.25:-18.75"]);
  const buildings: Building[] = [];
  const trees: Vec3[] = [];
  const pitch = params.slotPitch;
  const heights = params.tierHeight;
  const slots: { x: number; z: number; rank: number }[] = [];
  for (let i = 0; i < lines.length - 1; i++) {
    for (let j = 0; j < lines.length - 1; j++) {
      const cx = (lines[i] + lines[i + 1]) / 2;
      const cz = (lines[j] + lines[j + 1]) / 2;
      if (Math.abs(cx) < 37.5 && Math.abs(cz) < 37.5) continue;
      if (parks.has(`${cx}:${cz}`)) {
        for (let k = 0; k < 9; k++) trees.push([cx + prng.range(-12, 12), 0, cz + prng.range(-12, 12)]);
        continue;
      }
      for (let a = -1; a <= 1; a++) {
        for (let b = -1; b <= 1; b++) {
          if (prng.next() < 0.28) continue;
          const x = cx + a * pitch + prng.range(-0.6, 0.6);
          const z = cz + b * pitch + prng.range(-0.6, 0.6);
          // Taller towards the middle, with plenty of noise.
          slots.push({ x, z, rank: prng.next() * 0.6 + (1 - Math.hypot(x, z) / 200) * 0.7 });
        }
      }
    }
  }
  // Tiers by rank, in the metropolis's own shares, as the server assigns them.
  const order = [...slots].sort((p, q) => q.rank - p.rank);
  const tierAt = new Map<(typeof slots)[number], BuildingTier>();
  let cursor = 0;
  for (const tier of [5, 4, 3, 2, 1] as BuildingTier[]) {
    const count = Math.round(params.tierShares[tier] * order.length);
    for (const slot of order.slice(cursor, cursor + count)) tierAt.set(slot, tier);
    cursor += count;
  }
  for (const slot of slots) {
    const tier = tierAt.get(slot) ?? 1;
    const footprint = Math.min(pitch - 1.2, params.footprint.min + (tier - 1) * 0.6 + prng.range(0, 1.2));
    const height = heights[tier] * prng.range(0.9, 1.12);
    buildings.push(
      building(
        buildings.length,
        districtAt(slot.x, slot.z),
        [slot.x, 0, slot.z],
        [footprint, height, footprint * prng.range(0.85, 1)],
        tier,
        0,
        prng.pick(LANGUAGES),
      ),
    );
  }

  // Trees on the verges beyond the ring, and lamps along the avenues.
  while (trees.length < params.trees) {
    const side = prng.int(0, 3);
    const along = prng.range(-170, 170);
    const off = prng.range(160, 172);
    trees.push(side === 0 ? [along, 0, -off] : side === 1 ? [along, 0, off] : side === 2 ? [-off, 0, along] : [off, 0, along]);
  }
  const lamps: Vec3[] = [];
  for (const at of avenueAt) {
    for (let s = -145; s <= 145 && lamps.length < params.lamps; s += 7.5) {
      if (Math.abs(s - at) < 8 || Math.abs(s + at) < 8) continue;
      lamps.push([at + avenue / 2 + 1.6, 0, s], [s, 0, at + avenue / 2 + 1.6]);
    }
  }

  return {
    ...base("dev/metropolis@0001", "dev/metropolis"),
    bounds: { size: 316 },
    districts,
    buildings,
    roads,
    landmarks: [civic([0, 0, 0], [26, 18, 26], "City Hall")],
    props: { trees, lamps: lamps.slice(0, params.lamps) },
    vehicles: { count: params.vehicles.max },
    settlement: { tier: "metropolis", name: "Greater metropolis", reason: "A dev fixture metropolis." },
    plaza: { rect: { x: 0, z: 0, w: 75 - avenue - 4, d: 75 - avenue - 4 }, surface: "paved" },
  };
}

// ---------------------------------------------------------------------------
// Village
// ---------------------------------------------------------------------------

function buildVillage(): CityModel {
  const params = SETTLEMENT_PARAMS.village;
  const prng = prngFor("dev/village", "layout");
  const lane = params.roads.minor.width;
  const main = params.roads.major.width;
  const roads: RoadSegment[] = [];

  // The lane round the green: an octagon.
  const loop: Point[] = [];
  for (let k = 0; k <= 8; k++) {
    const a = ((k % 8) / 8) * Math.PI * 2 + Math.PI / 8;
    loop.push([Math.cos(a) * 17, Math.sin(a) * 17]);
  }
  roads.push(...polyline("loop", loop, lane, { kind: "lane", appearAt: 150 }));

  // The main street along the south, bending as it leaves the village.
  const mainStreet: Point[] = [
    [-58, 31],
    [-38, 27],
    [-20, 24.5],
    [0, 24.5],
    [20, 24.5],
    [37, 27.8],
    [58, 33],
  ];
  roads.push(...polyline("main", mainStreet, main, { major: true, appearAt: 100 }));
  // The loop's southern vertex is at (cos(90+22.5)...), so the link lane runs
  // from the nearest loop vertex down to the middle of the main street.
  roads.push(segment("link", loop[2], [0, 24.5], lane, { kind: "lane", appearAt: 170 }));

  // District lanes out from the loop at every compass point, each bending.
  const outs: { from: number; heading: number; bends: number[]; lengths: number[] }[] = [
    { from: 0, heading: 20, bends: [14, -10], lengths: [12, 12, 10] },
    { from: 7, heading: -45, bends: [-12, 16], lengths: [10, 12, 9] },
    { from: 6, heading: -100, bends: [10], lengths: [13, 12] },
    { from: 5, heading: -150, bends: [-15, 8], lengths: [11, 10, 10] },
    { from: 4, heading: 170, bends: [12], lengths: [14, 12] },
  ];
  const houses: Building[] = [];
  const cell = 6;
  outs.forEach((spec, n) => {
    let heading = (spec.heading * Math.PI) / 180;
    const points: Point[] = [loop[spec.from]];
    spec.lengths.forEach((length, i) => {
      const [x, z] = points[points.length - 1];
      points.push([x + Math.cos(heading) * length, z + Math.sin(heading) * length]);
      heading += ((spec.bends[i] ?? 0) * Math.PI) / 180;
    });
    roads.push(...polyline(`lane${n}`, points, lane, { kind: "lane", appearAt: 200 + n * 30 }));

    // Houses both sides, facing the lane.
    for (let i = 0; i < points.length - 1; i++) {
      const [x0, z0] = points[i];
      const [x1, z1] = points[i + 1];
      const length = Math.hypot(x1 - x0, z1 - z0);
      const dx = (x1 - x0) / length;
      const dz = (z1 - z0) / length;
      for (let s = 4; s < length - 2; s += params.slotPitch) {
        for (const side of [1, -1]) {
          if (prng.next() < 0.3) continue;
          const off = lane / 2 + 0.3 + cell / 2;
          const x = x0 + dx * s + dz * off * side;
          const z = z0 + dz * s - dx * off * side;
          const tier = (prng.next() < 0.7 ? 1 : 2) as BuildingTier;
          const size = prng.range(params.footprint.min, Math.min(params.footprint.max, cell / Math.SQRT2));
          houses.push(
            building(
              houses.length,
              `lane${n}`,
              [x, 0, z],
              [size, params.tierHeight[tier] * prng.range(0.9, 1.1), size * prng.range(0.8, 1)],
              tier,
              Math.atan2(dx, dz) + (side > 0 ? -Math.PI / 2 : Math.PI / 2),
              prng.pick(LANGUAGES),
            ),
          );
        }
      }
    }
  });

  const districts = outs.map((_, n) => {
    const own = houses.filter((house) => house.districtId === `lane${n}`);
    const xs = own.map((house) => house.position[0]);
    const zs = own.map((house) => house.position[2]);
    const x0 = Math.min(...xs) - 4;
    const x1 = Math.max(...xs) + 4;
    const z0 = Math.min(...zs) - 4;
    const z1 = Math.max(...zs) + 4;
    return district(`lane${n}`, `Lane ${n + 1}`, { x: (x0 + x1) / 2, z: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0 }, n);
  });

  const trees: Vec3[] = [];
  while (trees.length < params.trees) {
    const a = prng.range(0, Math.PI * 2);
    const r = prng.range(26, 48);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    // Clear of the houses.
    if (houses.some((house) => Math.hypot(house.position[0] - x, house.position[2] - z) < 4.5)) continue;
    trees.push([x, 0, z]);
  }
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    trees.push([Math.cos(a) * 8.5, 0, Math.sin(a) * 8.5]);
  }
  const lamps: Vec3[] = mainStreet.slice(1, -1).map(([x, z]) => [x, 0, z - main / 2 - 1.4]);

  return {
    ...base("dev/village@0001", "dev/village"),
    bounds: { size: 110 },
    districts,
    buildings: houses,
    roads,
    landmarks: [civic([0, 0, -5], [8, 7, 8], "Village Chapel")],
    props: { trees, lamps },
    vehicles: { count: params.vehicles.max },
    settlement: { tier: "village", name: "Village of village", reason: "A dev fixture village." },
    plaza: { rect: { x: 0, z: 0, w: 22, d: 22 }, surface: "green" },
  };
}

// ---------------------------------------------------------------------------
// Town
// ---------------------------------------------------------------------------

function buildTown(): CityModel {
  return {
    ...devCity,
    seed: "dev/town@0001",
    settlement: { tier: "town", name: "Town of town", reason: "A dev fixture town." },
    plaza: { rect: { x: 0, z: 0, w: 17, d: 17 }, surface: "setts" },
  };
}

export const devSettlements: Record<"metropolis" | "village" | "town", () => CityModel> = {
  metropolis: buildMetropolis,
  village: buildVillage,
  town: buildTown,
};
