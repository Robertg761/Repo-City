/**
 * A hand-built `CityModel` for developing the renderer (PLAN.md section 72,
 * W1). It is the renderer's contract made concrete: every visual state the
 * components can draw appears here exactly once, so the scene can be iterated
 * on before `lib/city/generator.ts` (W5) exists.
 *
 * Dev only. `CityCanvas` loads it when `NODE_ENV !== "production"` and the URL
 * carries `?dev=city`, and only while the store has no real city.
 *
 * World convention, which the generator must match:
 *   - `bounds.size` is the side length of the square city; it spans
 *     `[-size/2, +size/2]` on both x and z, +y is up.
 *   - a building's `position` is the centre of its base, on y = 0, and `size`
 *     is `[width, height, depth]`.
 *   - `district.rect` is min-corner plus extent: x..x+w, z..z+d.
 *   - `road.width` is the full carriageway width in world units.
 */

import { prngFor } from "@/lib/city/seed";
import type { BuildingTier, RankedIssue, RankedPull } from "@/types/analysis";
import type {
  Building,
  CityModel,
  ConstructionSite,
  District,
  Incident,
  Landmark,
  RoadSegment,
  Vec3,
} from "@/types/city";

const SEED = "sample/repo-city@fixture0001";
const SIZE = 128;

/** Grid lines carrying the roads. The 12s enclose the civic plaza. */
const LINES = [-58, -34, -12, 12, 34, 58] as const;
/** The four building bands: the plaza band (-12..12) holds no houses. */
const BANDS: [number, number][] = [
  [-58, -34],
  [-34, -12],
  [12, 34],
  [34, 58],
];

const isArterial = (line: number) => Math.abs(line) === 58 || Math.abs(line) === 12;
const mid = ([a, b]: [number, number]) => (a + b) / 2;

function buildRoads(): RoadSegment[] {
  const roads: RoadSegment[] = [];
  for (const line of LINES) {
    const width = isArterial(line) ? 7 : 4.5;
    const major = isArterial(line);
    for (let i = 0; i < LINES.length - 1; i++) {
      const a = LINES[i];
      const b = LINES[i + 1];
      roads.push({
        id: `road-v-${line}-${i}`,
        from: [line, 0, a],
        to: [line, 0, b],
        width,
        major,
      });
      roads.push({
        id: `road-h-${line}-${i}`,
        from: [a, 0, line],
        to: [b, 0, line],
        width,
        major,
      });
    }
  }
  return roads;
}

interface DistrictSpec {
  id: string;
  name: string;
  sourcePath: string;
  purpose: string;
  colorIndex: number;
  /** Which band indices the district covers on x and on z. */
  xBands: number[];
  zBands: number[];
}

const DISTRICT_SPECS: DistrictSpec[] = [
  {
    id: "district-core",
    name: "Core District",
    sourcePath: "src",
    purpose: "The runtime that everything else is built around.",
    colorIndex: 0,
    xBands: [0, 1],
    zBands: [0, 1],
  },
  {
    id: "district-packages",
    name: "Packages District",
    sourcePath: "packages",
    purpose: "Published libraries consumed by the core.",
    colorIndex: 2,
    xBands: [2, 3],
    zBands: [0, 1],
  },
  {
    id: "district-knowledge",
    name: "Knowledge District",
    sourcePath: "docs",
    purpose: "Guides, references and the documentation site.",
    colorIndex: 5,
    xBands: [0, 1],
    zBands: [2, 3],
  },
  {
    id: "district-safety",
    name: "Safety District",
    sourcePath: "tests",
    purpose: "Unit, integration and end-to-end suites.",
    colorIndex: 6,
    xBands: [2, 3],
    zBands: [2, 3],
  },
];

function districtRect(spec: DistrictSpec): District["rect"] {
  const x = BANDS[spec.xBands[0]][0];
  const z = BANDS[spec.zBands[0]][0];
  return {
    x,
    z,
    w: BANDS[spec.xBands[spec.xBands.length - 1]][1] - x,
    d: BANDS[spec.zBands[spec.zBands.length - 1]][1] - z,
  };
}

/** Blocks that hold a construction site instead of houses. */
const CONSTRUCTION_BLOCKS = new Set(["0:1", "2:0", "0:2", "3:3"]);

const FILE_NAMES = [
  "index",
  "router",
  "renderer",
  "store",
  "client",
  "schema",
  "worker",
  "parser",
  "cache",
  "queue",
  "events",
  "loader",
  "config",
  "types",
  "utils",
  "metrics",
  "session",
  "adapter",
  "resolver",
  "pipeline",
];

const LANGUAGES = ["TypeScript", "TypeScript", "TypeScript", "Rust", "Python", "Go"];

function tierFor(x: number, z: number, jitter: number): BuildingTier {
  const distance = Math.hypot(x, z);
  const raw = Math.round(5 - distance / 15 + jitter);
  return Math.max(1, Math.min(5, raw)) as BuildingTier;
}

const TIER_HEIGHT: Record<BuildingTier, [number, number]> = {
  1: [2.4, 4],
  2: [4, 6.4],
  3: [6.4, 9.4],
  4: [9.4, 13],
  5: [13, 18],
};

function buildBuildings(): Building[] {
  const prng = prngFor(SEED, "dev-buildings");
  const raw: Omit<Building, "appearAt">[] = [];
  let n = 0;

  for (const spec of DISTRICT_SPECS) {
    for (const xb of spec.xBands) {
      for (const zb of spec.zBands) {
        if (CONSTRUCTION_BLOCKS.has(`${xb}:${zb}`)) continue;
        const cx = mid(BANDS[xb]);
        const cz = mid(BANDS[zb]);
        // Four corner houses plus one taller tower in the middle of the block.
        const slots: { x: number; z: number; tower: boolean }[] = [
          { x: cx - 5.5, z: cz - 5.5, tower: false },
          { x: cx + 5.5, z: cz - 5.5, tower: false },
          { x: cx - 5.5, z: cz + 5.5, tower: false },
          { x: cx + 5.5, z: cz + 5.5, tower: false },
          { x: cx, z: cz, tower: true },
        ];
        for (const slot of slots) {
          const x = slot.x + prng.range(-0.5, 0.5);
          const z = slot.z + prng.range(-0.5, 0.5);
          const tier = tierFor(x, z, (slot.tower ? 0.8 : 0) + prng.range(-0.6, 0.6));
          const [lo, hi] = TIER_HEIGHT[tier];
          const footprint = slot.tower ? prng.range(3.6, 4.4) : prng.range(4.2, 5.4);
          const name = `${FILE_NAMES[n % FILE_NAMES.length]}${n > 19 ? n : ""}`;
          const path = `${spec.sourcePath}/${name}.ts`;
          raw.push({
            id: `building-${n}`,
            kind: "building",
            position: [x, 0, z],
            rotationY: prng.pick([0, 0, 0, Math.PI / 2]),
            title: `${name}.ts`,
            subtitle: path,
            description: `A file in ${spec.name}.`,
            reason: `Ranked in the top files of ${spec.sourcePath} by size and inbound references.`,
            sourceUrl: `https://github.com/sample/repo-city/blob/main/${path}`,
            visualState: "normal",
            districtId: spec.id,
            size: [footprint, prng.range(lo, hi), footprint * prng.range(0.85, 1.15)],
            tier,
            colorIndex: prng.int(0, 7),
            plan: {
              id: `building-${n}`,
              path,
              kind: "file",
              districtId: spec.id,
              score: prng.range(2, 9),
              tier,
              descendantCount: 0,
              language: prng.pick(LANGUAGES),
              role: null,
              landmark: null,
            },
          });
          n++;
        }
      }
    }
  }

  // Root-level landmark files live on the civic plaza (PLAN.md section 8).
  const civic: { file: "readme" | "manifest" | "contributing" | "dockerfile"; path: string; at: Vec3 }[] = [
    { file: "readme", path: "README.md", at: [-7, 0, -7] },
    { file: "manifest", path: "package.json", at: [7, 0, -7] },
    { file: "contributing", path: "CONTRIBUTING.md", at: [-7, 0, 7] },
    { file: "dockerfile", path: "Dockerfile", at: [7, 0, 7] },
  ];
  for (const entry of civic) {
    raw.push({
      id: `building-${entry.file}`,
      kind: "building",
      position: entry.at,
      rotationY: 0,
      title: entry.path,
      subtitle: `/${entry.path}`,
      description: "A landmark file at the repository root.",
      reason: `${entry.path} is one of the files a newcomer opens first.`,
      sourceUrl: `https://github.com/sample/repo-city/blob/main/${entry.path}`,
      visualState: "normal",
      districtId: DISTRICT_SPECS[0].id,
      size: [5, 6.5, 5],
      tier: 3,
      colorIndex: 0,
      plan: {
        id: `building-${entry.file}`,
        path: entry.path,
        kind: "file",
        districtId: DISTRICT_SPECS[0].id,
        score: 9,
        tier: 3,
        descendantCount: 0,
        language: null,
        role: "Repository entry point",
        landmark: entry.file,
      },
    });
  }

  // Buildings rise from the centre outwards, so the skyline reads as growing.
  const order = raw
    .map((b, index) => ({ index, d: Math.hypot(b.position[0], b.position[2]) }))
    .sort((a, b) => a.d - b.d);
  const appearAt = new Map<number, number>();
  order.forEach((entry, rank) => appearAt.set(entry.index, 420 + rank * 18));

  return raw.map((b, index) => ({ ...b, appearAt: appearAt.get(index) ?? 420 }));
}

function buildLandmarks(): Landmark[] {
  return [
    {
      id: "landmark-civic",
      kind: "landmark",
      landmarkType: "civic",
      level: 3,
      state: "healthy",
      position: [0, 0, 0],
      rotationY: 0,
      title: "Town Hall",
      subtitle: "sample/repo-city",
      description: "The civic centre of the repository.",
      reason: "Every city has one town hall: the repository itself.",
      sourceUrl: "https://github.com/sample/repo-city",
      visualState: "healthy",
      appearAt: 1760,
    },
    {
      id: "landmark-power",
      kind: "landmark",
      landmarkType: "power",
      level: 2,
      state: "recent-failure",
      position: [0, 0, -46],
      rotationY: 0,
      title: "Power Station",
      subtitle: "GitHub Actions",
      description: "Continuous integration keeps the lights on.",
      reason: "The latest run of one workflow failed, so the plant is venting smoke.",
      sourceUrl: "https://github.com/sample/repo-city/actions",
      visualState: "recent-failure",
      appearAt: 1820,
    },
    {
      id: "landmark-fire",
      kind: "landmark",
      landmarkType: "fire",
      level: 2,
      state: "strength-2",
      position: [46, 0, 0],
      rotationY: -Math.PI / 2,
      title: "Fire Station",
      subtitle: "Test infrastructure",
      description: "Unit and integration suites run on every push.",
      reason: "Test directories, a test script and a CI test job were detected.",
      sourceUrl: "https://github.com/sample/repo-city/tree/main/tests",
      visualState: "strength-2",
      appearAt: 1880,
    },
    {
      id: "landmark-info",
      kind: "landmark",
      landmarkType: "info",
      level: 3,
      state: "strength-3",
      position: [-46, 0, 0],
      rotationY: Math.PI / 2,
      title: "Visitor Center",
      subtitle: "Documentation",
      description: "README, a docs site, and a contributing guide.",
      reason: "Strong documentation signals make the city navigable.",
      sourceUrl: "https://github.com/sample/repo-city#readme",
      visualState: "strength-3",
      appearAt: 1940,
    },
    {
      id: "landmark-station",
      kind: "landmark",
      landmarkType: "station",
      level: 2,
      state: "occasional",
      position: [0, 0, 46],
      rotationY: Math.PI,
      title: "Central Station",
      subtitle: "Releases",
      description: "Eleven tagged releases, the last one 23 days ago.",
      reason: "Releases ship the repository out into the world.",
      sourceUrl: "https://github.com/sample/repo-city/releases",
      visualState: "occasional",
      appearAt: 2000,
    },
  ];
}

function issue(
  number: number,
  title: string,
  labels: string[],
  comments: number,
  ageDays: number,
  state: RankedIssue["state"],
  reason: string,
): RankedIssue {
  const created = new Date(Date.UTC(2026, 8, 21) - ageDays * 86_400_000).toISOString();
  return {
    number,
    title,
    url: `https://github.com/sample/repo-city/issues/${number}`,
    createdAt: created,
    updatedAt: created,
    comments,
    labels,
    author: "octocat",
    bodyExcerpt: `${title}. Reported against the fixture repository.`,
    score: 4 + comments / 10,
    state,
    reason,
    relatedPath: null,
  };
}

function buildIncidents(): Incident[] {
  const specs: {
    at: Vec3;
    rotationY: number;
    issue: RankedIssue;
    appearAt: number;
  }[] = [
    {
      at: [-46, 0, -34],
      rotationY: 0,
      appearAt: 2120,
      issue: issue(
        204,
        "Typo in the quickstart snippet",
        ["docs", "good first issue"],
        1,
        12,
        "minor",
        "This incident represents an ordinary open issue with little discussion.",
      ),
    },
    {
      at: [34, 0, -23],
      rotationY: Math.PI / 2,
      appearAt: 2200,
      issue: issue(
        311,
        "Renderer drops frames after a resize",
        ["bug"],
        6,
        41,
        "collision",
        "This incident represents an unresolved bug that is still being discussed.",
      ),
    },
    {
      at: [-34, 0, 23],
      rotationY: Math.PI / 2,
      appearAt: 2280,
      issue: issue(
        96,
        "Windows paths break the loader",
        ["bug", "help wanted"],
        3,
        402,
        "stale",
        "This incident represents a bug that has been open for more than six months.",
      ),
    },
    {
      at: [23, 0, 58],
      rotationY: 0,
      appearAt: 2360,
      issue: issue(
        381,
        "Authentication occasionally fails after refresh",
        ["bug", "priority-high"],
        14,
        43,
        "major",
        "This incident represents an unresolved bug with high discussion activity.",
      ),
    },
  ];

  return specs.map((spec) => ({
    id: `incident-${spec.issue.number}`,
    kind: "incident",
    position: spec.at,
    rotationY: spec.rotationY,
    title: `Issue #${spec.issue.number}`,
    subtitle: spec.issue.title,
    description: spec.issue.bodyExcerpt,
    reason: spec.issue.reason,
    sourceUrl: spec.issue.url,
    visualState: spec.issue.state,
    appearAt: spec.appearAt,
    state: spec.issue.state,
    issue: spec.issue,
  }));
}

function pull(
  number: number,
  title: string,
  state: RankedPull["state"],
  reason: string,
  mergedAt: string | null,
): RankedPull {
  return {
    number,
    title,
    url: `https://github.com/sample/repo-city/pull/${number}`,
    createdAt: "2026-08-30T10:00:00.000Z",
    updatedAt: "2026-09-19T10:00:00.000Z",
    mergedAt,
    draft: false,
    comments: 4,
    labels: [],
    author: "octocat",
    score: 3,
    state,
    reason,
  };
}

function buildConstruction(): ConstructionSite[] {
  const specs: { at: Vec3; pull: RankedPull; appearAt: number }[] = [
    {
      at: [-46, 0, -23],
      appearAt: 2460,
      pull: pull(
        742,
        "Add the streaming analyze endpoint",
        "active",
        "This pull request is open and was updated in the last two weeks.",
        null,
      ),
    },
    {
      at: [23, 0, -46],
      appearAt: 2520,
      pull: pull(
        718,
        "Refactor the tree walker",
        "slow",
        "This pull request is open but has not been updated recently.",
        null,
      ),
    },
    {
      at: [-46, 0, 23],
      appearAt: 2580,
      pull: pull(
        602,
        "Experimental WebGPU backend",
        "abandoned",
        "This pull request has been open without an update for more than sixty days.",
        null,
      ),
    },
    {
      at: [46, 0, 46],
      appearAt: 2640,
      pull: pull(
        751,
        "Ship the new palette",
        "completed",
        "This pull request was merged in the last two weeks.",
        "2026-09-17T09:00:00.000Z",
      ),
    },
  ];

  return specs.map((spec) => ({
    id: `construction-${spec.pull.number}`,
    kind: "construction",
    position: spec.at,
    rotationY: 0,
    title: `Pull #${spec.pull.number}`,
    subtitle: spec.pull.title,
    description: `Pull request by ${spec.pull.author}.`,
    reason: spec.pull.reason,
    sourceUrl: spec.pull.url,
    visualState: spec.pull.state,
    appearAt: spec.appearAt,
    state: spec.pull.state,
    pull: spec.pull,
  }));
}

function buildProps(): CityModel["props"] {
  const prng = prngFor(SEED, "dev-props");
  const trees: Vec3[] = [];
  const lamps: Vec3[] = [];

  // Four parks in the cross bands between the districts.
  const parks: [number, number][] = [
    [0, -23],
    [0, 23],
    [-23, 0],
    [23, 0],
  ];
  for (const [px, pz] of parks) {
    for (let i = 0; i < 9; i++) {
      trees.push([px + prng.range(-7, 7), 0, pz + prng.range(-7, 7)]);
    }
  }

  // A few trees tucked into the corners of the residential blocks.
  for (const spec of DISTRICT_SPECS) {
    for (const xb of spec.xBands) {
      for (const zb of spec.zBands) {
        const cx = mid(BANDS[xb]);
        const cz = mid(BANDS[zb]);
        trees.push([cx + prng.range(-9, 9), 0, cz + prng.pick([-9, 9]) + prng.range(-0.8, 0.8)]);
      }
    }
  }

  // Lamps march down the arterials.
  for (const line of [-12, 12]) {
    for (let v = -10; v <= 10; v += 6.6) {
      lamps.push([line - 1.2 * Math.sign(line), 0, v]);
      lamps.push([v, 0, line - 1.2 * Math.sign(line)]);
    }
  }
  for (let v = -50; v <= 50; v += 25) {
    lamps.push([-54.5, 0, v]);
    lamps.push([54.5, 0, v]);
    lamps.push([v, 0, -54.5]);
    lamps.push([v, 0, 54.5]);
  }

  return { trees, lamps };
}

/**
 * The fixture city. Built once at module load; the values are deterministic
 * because every random draw comes from the seeded PRNG.
 */
export const devCity: CityModel = {
  repository: {
    fullName: "sample/repo-city",
    url: "https://github.com/sample/repo-city",
    archived: false,
  },
  health: {
    score: 71,
    band: "Healthy",
    breakdown: {
      maintenance: 0.78,
      reliability: 0.62,
      documentation: 0.85,
      organization: 0.7,
      responsiveness: 0.55,
    },
  },
  confidence: {
    level: "medium",
    reasons: ["The repository tree was truncated at 5,000 entries."],
  },
  activity: {
    commitsLast30d: 42,
    commitsLast90d: 118,
    activeContributors90d: 6,
    lastPushDaysAgo: 2,
    score: 0.62,
  },
  ambience: {
    warmth: 0.58,
    saturation: 0.6,
    fog: 0.28,
    trafficDensity: 0.5,
    pedestrianDensity: 0.5,
    litWindowShare: 0.45,
  },
  bounds: { size: SIZE },
  districts: DISTRICT_SPECS.map((spec) => {
    const rect = districtRect(spec);
    return {
      id: spec.id,
      name: spec.name,
      sourcePath: spec.sourcePath,
      purpose: spec.purpose,
      rect,
      colorIndex: spec.colorIndex,
      buildingIds: [],
    } satisfies District;
  }),
  buildings: buildBuildings(),
  roads: buildRoads(),
  landmarks: buildLandmarks(),
  incidents: buildIncidents(),
  constructionSites: buildConstruction(),
  props: buildProps(),
  vehicles: { count: 12 },
  seed: SEED,
};

// `buildingIds` is part of the contract, so fill it from the buildings above
// rather than repeating the list by hand.
for (const district of devCity.districts) {
  district.buildingIds = devCity.buildings
    .filter((b) => b.districtId === district.id)
    .map((b) => b.id);
}

export default devCity;
