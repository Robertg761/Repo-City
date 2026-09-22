import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { RepoAnalysis } from "@/types/analysis";
import type { RoadSegment } from "@/types/city";
import { buildingsOnRoads, generateCity, obstructedPlots, overlappingBuildings } from "./generator";
import {
  KERB,
  NATURAL_LANDMARK_SIZE,
  distanceToRoad,
  planHighways,
  planLayout,
  type CityLayout,
  type LayoutDistrictInput,
  type Slot,
} from "./layout";
import { SETTLEMENT_PARAMS } from "./settlement";
import {
  VILLAGE_CELL,
  VILLAGE_HOUSE_MAX,
  polygonSegmentDistance,
  polygonsOverlap,
  segmentDistance,
} from "./village";

type P = { x: number; z: number };

const districts = (counts: number[]): LayoutDistrictInput[] =>
  counts.map((buildingCount, index) => ({ id: `d-${index}`, buildingCount }));

const village = (counts: number[], landmarkFiles = 3): CityLayout =>
  planLayout(districts(counts), counts.reduce((a, b) => a + b, 0), { tier: "village", landmarkFiles });

/** Village-sized repositories: 1 to 40 buildings over 1 to 6 districts. */
const TYPICAL = [
  [1],
  [6],
  [9, 1],
  [3, 2, 1],
  [2, 2, 2],
  [12, 8, 6],
  [20, 5],
  [15, 10, 5],
  [10, 6, 4, 3, 2],
  [6, 6, 6, 6],
  [14, 10, 6, 4],
  [25, 15],
  [30, 10],
  [40],
];

/** A square turned to `yaw` (the renderer's convention, local +z forward). */
function square(x: number, z: number, yaw: number, side: number): P[] {
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  const rx = Math.cos(yaw);
  const rz = -Math.sin(yaw);
  const h = side / 2;
  return [
    [1, 1],
    [1, -1],
    [-1, -1],
    [-1, 1],
  ].map(([a, b]) => ({ x: x + rx * a * h + fx * b * h, z: z + rz * a * h + fz * b * h }));
}

const rect = (x: number, z: number, w: number, d: number): P[] => [
  { x: x - w / 2, z: z - d / 2 },
  { x: x + w / 2, z: z - d / 2 },
  { x: x + w / 2, z: z + d / 2 },
  { x: x - w / 2, z: z + d / 2 },
];

const ends = (road: RoadSegment): [P, P] => [
  { x: road.from[0], z: road.from[2] },
  { x: road.to[0], z: road.to[2] },
];

const houses = (layout: CityLayout): Slot[] =>
  layout.districts.flatMap((d) => d.slots.filter((s) => s.rotationY !== undefined));
const sites = (layout: CityLayout): Slot[] =>
  layout.districts.flatMap((d) => d.slots.filter((s) => s.rotationY === undefined));
const cellOf = (slot: Slot): P[] => square(slot.x, slot.z, slot.rotationY!, VILLAGE_CELL);

describe("planVillage: shape (PLAN.md 76.5 steps 1 to 3)", () => {
  it("puts the green at the origin as the civic rect and the plaza", () => {
    for (const counts of TYPICAL) {
      const layout = village(counts);
      const n = counts.reduce((a, b) => a + b, 0);
      const side = Math.min(26, Math.max(16, 16 + 0.5 * n));
      expect(layout.civic.rect).toEqual({ x: 0, z: 0, w: side, d: side });
      expect(layout.plaza).toEqual({ rect: layout.civic.rect, surface: "green" });
      expect(layout.tier).toBe("village");
      // The chapel stands on the green's north edge.
      const hall = layout.civic.hall;
      expect(hall.z).toBeLessThan(0);
      expect(hall.z - hall.d / 2).toBeGreaterThanOrEqual(-side / 2);
    }
  });

  it("loops a lane round the green and runs a bending main street through", () => {
    for (const counts of TYPICAL) {
      const layout = village(counts);
      const lanes = layout.roads.filter((r) => r.kind === "lane");
      const main = layout.roads.filter((r) => r.major);
      expect(lanes.length).toBeGreaterThanOrEqual(7);
      for (const lane of lanes) {
        expect(lane.width).toBe(SETTLEMENT_PARAMS.village.roads.minor.width);
        expect(lane.major).toBe(false);
      }
      for (const road of main) {
        expect(road.width).toBe(SETTLEMENT_PARAMS.village.roads.major.width);
        expect(road.kind ?? "street").toBe("street");
      }
      // The main street runs out east and west, each end a way out.
      expect(layout.exits).toHaveLength(2);
      const [east, west] = layout.exits!;
      expect(east.x).toBeGreaterThan(29);
      expect(west.x).toBeLessThan(-29);
      // Bends of 8 to 18 degrees between consecutive main-street segments.
      for (const a of main) {
        for (const b of main) {
          if (a === b || a.to[0] !== b.from[0] || a.to[2] !== b.from[2]) continue;
          const ha = Math.atan2(a.to[2] - a.from[2], a.to[0] - a.from[0]);
          const hb = Math.atan2(b.to[2] - b.from[2], b.to[0] - b.from[0]);
          let turn = Math.abs(hb - ha) % (2 * Math.PI);
          if (turn > Math.PI) turn = 2 * Math.PI - turn;
          const degrees = (turn * 180) / Math.PI;
          // Zero where a lane joins mid-stretch, otherwise a real bend.
          if (degrees > 0.5) {
            expect(degrees).toBeGreaterThanOrEqual(8 - 1e-6);
            expect(degrees).toBeLessThanOrEqual(18 + 1e-6);
          }
        }
      }
    }
  });
});

describe("planVillage: invariants (PLAN.md 76.14)", () => {
  it("keeps a typical village's bounds in the 80 to 125 band", () => {
    for (const counts of TYPICAL) {
      const size = village(counts).size;
      expect(size, `counts ${counts.join(",")}`).toBeGreaterThanOrEqual(80);
      expect(size, `counts ${counts.join(",")}`).toBeLessThanOrEqual(125);
    }
  });

  it("gives every building a house, plus room to grow", () => {
    for (const counts of [...TYPICAL, [8, 8, 8, 8, 8], [5, 5, 5, 5, 5, 5, 5, 5]]) {
      const layout = village(counts);
      layout.districts.forEach((district, i) => {
        const own = district.slots.filter((s) => s.rotationY !== undefined);
        expect(own.length, `district ${i} of ${counts.join(",")}`).toBeGreaterThanOrEqual(
          Math.max(1, counts[i]),
        );
      });
    }
  });

  it("sets no house cell on a road, and keeps the kerb", () => {
    for (const counts of TYPICAL) {
      const layout = village(counts);
      for (const slot of houses(layout)) {
        const cell = cellOf(slot);
        for (const road of layout.roads) {
          const [a, b] = ends(road);
          // Centres are rounded to millimetres, so allow a few of them.
          expect(polygonSegmentDistance(cell, a, b)).toBeGreaterThanOrEqual(road.width / 2 + KERB - 5e-3);
        }
      }
    }
  });

  it("never overlaps two cells, a cell and a plot, or a cell and the green", () => {
    for (const counts of TYPICAL) {
      const layout = village(counts);
      const cells = houses(layout).map(cellOf);
      const plots = [
        ...Object.values(layout.landmarkPlots).map((p) =>
          Math.abs(Math.sin(p.rotationY)) > 0.5 ? rect(p.x, p.z, p.d, p.w) : rect(p.x, p.z, p.w, p.d),
        ),
        ...sites(layout).map((s) => rect(s.x, s.z, s.cellW, s.cellD)),
        rect(0, 0, layout.civic.rect.w, layout.civic.rect.d),
      ];
      for (let i = 0; i < cells.length; i++) {
        for (let j = i + 1; j < cells.length; j++) {
          expect(polygonsOverlap(cells[i], cells[j], -1e-3)).toBe(false);
        }
        for (const plot of plots) expect(polygonsOverlap(cells[i], plot, -1e-3)).toBe(false);
      }
      for (let i = 0; i < plots.length; i++) {
        for (let j = i + 1; j < plots.length; j++) {
          expect(polygonsOverlap(plots[i], plots[j], -1e-3)).toBe(false);
        }
      }
    }
  });

  it("turns every house to face the road beside it, a lane for nearly all", () => {
    for (const counts of TYPICAL) {
      const layout = village(counts);
      let facingLane = 0;
      const all = houses(layout);
      for (const slot of all) {
        const yaw = slot.rotationY!;
        // Straight ahead, one setback away, is the centreline of some road.
        const facing = layout.roads.filter((road) => {
          const setback = road.width / 2 + KERB + VILLAGE_CELL / 2;
          const x = slot.x + Math.sin(yaw) * setback;
          const z = slot.z + Math.cos(yaw) * setback;
          return distanceToRoad(x, z, road) < 0.05;
        });
        expect(facing.length, `house at ${slot.x},${slot.z}`).toBeGreaterThan(0);
        if (facing.some((road) => road.kind === "lane")) facingLane += 1;
        // A footprint that fits the cell at any turn.
        expect(slot.cellW).toBe(VILLAGE_HOUSE_MAX);
        expect(slot.cellD).toBe(VILLAGE_HOUSE_MAX);
        expect(VILLAGE_HOUSE_MAX * Math.SQRT2).toBeLessThanOrEqual(VILLAGE_CELL);
      }
      expect(facingLane / all.length).toBeGreaterThanOrEqual(0.75);
    }
  });

  it("joins every road into one network, split at every junction, crossing none", () => {
    for (const counts of TYPICAL) {
      const layout = village(counts);
      const roads = [...layout.roads, ...planHighways(layout, 99)];
      const key = (p: P): string => `${p.x.toFixed(3)},${p.z.toFixed(3)}`;
      const parent = new Map<string, string>();
      const find = (k: string): string => {
        while (parent.get(k) !== k) k = parent.get(k)!;
        return k;
      };
      for (const road of roads) {
        for (const p of ends(road)) if (!parent.has(key(p))) parent.set(key(p), key(p));
        const [a, b] = ends(road);
        parent.set(find(key(a)), find(key(b)));
      }
      const roots = new Set([...parent.keys()].map(find));
      expect(roots.size, `counts ${counts.join(",")}`).toBe(1);

      for (const road of roads) {
        const [a, b] = ends(road);
        for (const other of roads) {
          if (other === road) continue;
          const [c, d] = ends(other);
          const shared = [a, b].some((p) => [c, d].some((q) => key(p) === key(q)));
          if (shared) continue;
          // Not touching at all: a T-junction is always a shared endpoint.
          expect(segmentDistance(a, b, c, d), `${road.id} and ${other.id}`).toBeGreaterThan(1e-3);
        }
      }
    }
  });

  it("is a pure function of the district list and the counts", () => {
    for (const counts of TYPICAL) {
      const a = village(counts);
      const b = village(counts);
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
      // The order the districts arrive in does not matter.
      const reversed = planLayout([...districts(counts)].reverse(), counts.reduce((x, y) => x + y, 0), {
        tier: "village",
        landmarkFiles: 3,
      });
      expect(JSON.stringify(reversed.roads)).toBe(JSON.stringify(a.roads));
    }
  });

  it("changes shape with the district ids, never with anything random", () => {
    const a = planLayout([{ id: "src", buildingCount: 9 }], 9, { tier: "village" });
    const b = planLayout([{ id: "lib", buildingCount: 9 }], 9, { tier: "village" });
    expect(JSON.stringify(a.roads)).not.toBe(JSON.stringify(b.roads));
  });
});

describe("planVillage: plots, fields and districts (PLAN.md 76.5 steps 6 to 8)", () => {
  it("reserves the four landmark plots along the main street, 9 to 12 units, clear of every road", () => {
    for (const counts of TYPICAL) {
      const layout = village(counts);
      for (const [type, plot] of Object.entries(layout.landmarkPlots)) {
        const natural = NATURAL_LANDMARK_SIZE[type as keyof typeof NATURAL_LANDMARK_SIZE];
        const longest = Math.max(plot.w, plot.d);
        expect(longest).toBeGreaterThanOrEqual(9 - 1e-6);
        expect(longest).toBeLessThanOrEqual(12 + 1e-6);
        expect(plot.w / natural[0]).toBeCloseTo(plot.d / natural[2], 3);
        // Quarter turns only, so the generator's box checks are exact.
        expect(Math.abs(Math.sin(plot.rotationY) * Math.cos(plot.rotationY))).toBeLessThan(1e-3);
        const box =
          Math.abs(Math.sin(plot.rotationY)) > 0.5
            ? rect(plot.x, plot.z, plot.d, plot.w)
            : rect(plot.x, plot.z, plot.w, plot.d);
        for (const road of layout.roads) {
          const [a, b] = ends(road);
          expect(polygonSegmentDistance(box, a, b)).toBeGreaterThanOrEqual(road.width / 2 + KERB - 1e-3);
        }
      }
      const { fire, info, power, station } = layout.landmarkPlots;
      expect(fire.x).toBeGreaterThan(0);
      expect(info.x).toBeLessThan(0);
      // Power by the road out to the east, the station by the road out west.
      expect(power.x).toBeGreaterThan(fire.x - 12);
      expect(station.x).toBeLessThan(info.x + 12);
      expect(power.x).toBeGreaterThan(0);
      expect(station.x).toBeLessThan(0);
    }
  });

  it("lays six to fourteen fields inside the bounds, clear of roads, houses and each other", () => {
    for (const counts of TYPICAL) {
      const layout = village(counts);
      const fields = layout.fields ?? [];
      expect(fields.length, `counts ${counts.join(",")}`).toBeGreaterThanOrEqual(6);
      expect(fields.length).toBeLessThanOrEqual(14);
      const half = layout.size / 2;
      const polys = fields.map((f) => {
        // `w` across (local x), `d` along the road (local z).
        const fx = Math.sin(f.rotationY);
        const fz = Math.cos(f.rotationY);
        const rx = Math.cos(f.rotationY);
        const rz = -Math.sin(f.rotationY);
        return [
          [1, 1],
          [1, -1],
          [-1, -1],
          [-1, 1],
        ].map(([a, b]) => ({
          x: f.x + (rx * a * f.w) / 2 + (fx * b * f.d) / 2,
          z: f.z + (rz * a * f.w) / 2 + (fz * b * f.d) / 2,
        }));
      });
      const cells = houses(layout).map(cellOf);
      fields.forEach((field, i) => {
        expect(field.w).toBeGreaterThanOrEqual(10 - 1e-6);
        expect(field.d).toBeGreaterThanOrEqual(10 - 1e-6);
        expect(Math.max(field.w, field.d)).toBeLessThanOrEqual(22 + 1e-6);
        expect([0, 1, 2, 3]).toContain(field.crop);
        for (const v of polys[i]) {
          expect(Math.abs(v.x)).toBeLessThanOrEqual(half);
          expect(Math.abs(v.z)).toBeLessThanOrEqual(half);
        }
        for (const road of layout.roads) {
          const [a, b] = ends(road);
          // A clear unit for the hedge and its gate.
          expect(polygonSegmentDistance(polys[i], a, b)).toBeGreaterThanOrEqual(road.width / 2 + 1);
        }
        for (const cell of cells) expect(polygonsOverlap(polys[i], cell)).toBe(false);
        for (let j = i + 1; j < polys.length; j++) expect(polygonsOverlap(polys[i], polys[j])).toBe(false);
      });
    }
  });

  it("gives every district a rect round its own houses", () => {
    for (const counts of TYPICAL) {
      const layout = village(counts);
      for (const district of layout.districts) {
        expect(district.rect.w).toBeGreaterThan(0);
        expect(district.rect.d).toBeGreaterThan(0);
        expect(district.blocks).toEqual([]);
        for (const slot of district.slots.filter((s) => s.rotationY !== undefined)) {
          expect(Math.abs(slot.x - district.rect.x)).toBeLessThanOrEqual(district.rect.w / 2 + 1e-6);
          expect(Math.abs(slot.z - district.rect.z)).toBeLessThanOrEqual(district.rect.d / 2 + 1e-6);
        }
      }
    }
  });

  it("carries the main street on out of the village as its highways, at most two", () => {
    const layout = village([12, 8, 6]);
    expect(planHighways(layout, 0)).toEqual([]);
    const out = planHighways(layout, 99);
    expect(out).toHaveLength(2);
    out.forEach((road, i) => {
      const exit = layout.exits![i];
      expect(road.kind).toBe("highway");
      expect(road.major).toBe(true);
      expect(road.from).toEqual([exit.x, 0, exit.z]);
      expect(Math.hypot(road.to[0], road.to[2])).toBeGreaterThan(layout.size / 2);
      expect(layout.roads.some((r) => r.id === exit.roadId && r.to[0] === exit.x && r.to[2] === exit.z)).toBe(
        true,
      );
    });
  });
});

describe("planVillage through generateCity", () => {
  const load = (name: string): RepoAnalysis =>
    JSON.parse(readFileSync(path.join(process.cwd(), "fixtures", name), "utf8")) as RepoAnalysis;

  it("builds p-limit as a village of turned houses, a green and fields", () => {
    const city = generateCity(load("sindresorhus__p-limit.analysis.json"));
    expect(city.settlement?.tier).toBe("village");
    expect(city.bounds.size).toBeGreaterThanOrEqual(80);
    expect(city.bounds.size).toBeLessThanOrEqual(125);
    expect(city.plaza?.surface).toBe("green");
    expect(city.props.fields?.length ?? 0).toBeGreaterThanOrEqual(6);
    const turned = city.buildings.filter((b) => Math.abs(b.rotationY) > 1e-3);
    expect(turned.length).toBeGreaterThan(0);
    expect(overlappingBuildings(city)).toEqual([]);
    expect(buildingsOnRoads(city)).toEqual([]);
    expect(obstructedPlots(city)).toEqual([]);
  });

  it("builds any fixture forced to a village without a building on a road", () => {
    const city = generateCity(load("sample.analysis.json"), { tier: "village" });
    expect(city.plaza?.surface).toBe("green");
    expect(overlappingBuildings(city)).toEqual([]);
    expect(buildingsOnRoads(city)).toEqual([]);
  });
});
