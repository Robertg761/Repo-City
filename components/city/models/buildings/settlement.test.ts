import { describe, expect, it } from "vitest";
import type { BuildingTier, SettlementTier } from "@/types/analysis";
import type { Building, RoadSegment } from "@/types/city";
import {
  ARCHETYPE_STAND_IN,
  ARCHETYPE_TABLES,
  CITY_ARCHETYPE_IDS,
  MODEL_KEYS,
  chooseArchetype,
  modelKeyFor,
  type ArchetypeId,
  type ModelKey,
} from "./archetypes";
import { PAINT_ACCENT, PAINT_NONE, PAINT_WALL } from "./mesh";
import { archetypeModel } from "./models";
import { linear, settlementDraft, slab } from "./kit";
import { BARN_WALLS, DISTRICT_SHARE, SHOP_ACCENTS, VILLAGE_WALLS, settlementPaint } from "./palettes";
import {
  MODEL_MAX_ASPECT,
  buildingTurn,
  doorTurn,
  drawnHeight,
  laneTurn,
  planBuildings,
  streetTurn,
} from "./placement";
import { apartmentLow, shopfront, terrace } from "./town";
import { barn, cottage, farmhouse } from "./village";
import { mix, buildingColor } from "../../palette";

const TIERS: BuildingTier[] = [1, 2, 3, 4, 5];

function building(
  id: string,
  options: Partial<{
    tier: BuildingTier;
    path: string;
    kind: "file" | "directory";
    language: string | null;
    position: [number, number, number];
    colorIndex: number;
  }> = {},
): Building {
  const tier = options.tier ?? 1;
  return {
    id,
    kind: "building",
    position: options.position ?? [10, 0, 10],
    rotationY: 0,
    title: id,
    subtitle: "",
    description: "",
    reason: "",
    sourceUrl: null,
    visualState: "normal",
    appearAt: 0,
    districtId: "d1",
    size: [4, 4.2, 4],
    tier,
    colorIndex: options.colorIndex ?? 0,
    plan: {
      id,
      path: options.path ?? `src/${id}.ts`,
      kind: options.kind ?? "file",
      districtId: "d1",
      score: 1,
      tier,
      descendantCount: 0,
      language: options.language ?? "TypeScript",
      role: null,
      landmark: null,
    },
  };
}

/** Village, town and metropolis models built by S6 (not stand-ins). */
const SETTLEMENT_MODELS: ModelKey[] = [
  "cottage",
  "cottage/tile",
  "farmhouse",
  "barn",
  "shopfront",
  "shopfront/tall",
  "terrace",
  "apartment-low",
  "apartment-low/retail",
];

const lane = (id: string, from: [number, number], to: [number, number], extra: Partial<RoadSegment> = {}): RoadSegment => ({
  id,
  from: [from[0], 0, from[1]],
  to: [to[0], 0, to[1]],
  width: 3.6,
  major: false,
  appearAt: 0,
  kind: "lane",
  ...extra,
});

/** The model's front, +z, in the world after a yaw. */
const front = (yaw: number) => [Math.sin(yaw), Math.cos(yaw)] as const;

describe("settlement archetype tables (PLAN.md 76.1 decision 7)", () => {
  it("leaves today's city exactly as it was", () => {
    for (let i = 0; i < 600; i++) {
      const b = building(`c-${i}`, {
        tier: ((i % 5) + 1) as BuildingTier,
        path: `pkg/${i}/mod.ts`,
        kind: i % 3 === 0 ? "directory" : "file",
        language: ["TypeScript", "Rust", "YAML", "Markdown", "Dockerfile"][i % 5],
      });
      expect(chooseArchetype(b, "city")).toBe(chooseArchetype(b));
      expect(CITY_ARCHETYPE_IDS).toContain(chooseArchetype(b));
      expect(modelKeyFor(chooseArchetype(b), b)).toBe(chooseArchetype(b));
    }
  });

  it("builds a village from cottages, farmhouses and barns only", () => {
    const seen = new Set<ArchetypeId>();
    for (let i = 0; i < 400; i++) {
      const b = building(`v-${i}`, { tier: TIERS[i % 5], path: `lib/${i}.js` });
      seen.add(chooseArchetype(b, "village"));
    }
    expect([...seen].sort()).toEqual(["barn", "cottage", "farmhouse"]);
  });

  it("builds a town of terraces and flats, with shops only on the high street", () => {
    for (let i = 0; i < 400; i++) {
      const tier = TIERS[i % 5];
      const plain = building(`t-${i}`, { tier, path: `src/${i}.ts` });
      const chosen = chooseArchetype(plain, "town");
      expect(ARCHETYPE_TABLES.town[tier]).toContain(chosen);
      expect(chosen).not.toBe("shopfront");

      const shop = { ...plain, frontage: "main-street" as const };
      expect(chooseArchetype(shop, "town")).toBe(tier <= 3 ? "shopfront" : "apartment-low");
      // Frontage means nothing outside a town.
      expect(chooseArchetype(shop, "city")).toBe(chooseArchetype(plain, "city"));
    }
  });

  it("names the metropolis towers S7 builds, at the top of the metropolis table", () => {
    const top = new Set([...ARCHETYPE_TABLES.metropolis[4], ...ARCHETYPE_TABLES.metropolis[5]]);
    for (const id of ["tower-glass", "tower-twin", "tower-spire"] as const) expect(top.has(id)).toBe(true);
    for (const id of ["tower-glass", "tower-twin", "tower-spire"] as const) expect(ARCHETYPE_STAND_IN[id]).toBeDefined();
  });

  it("has a candidate list for every tier of every settlement, all with models", () => {
    for (const settlement of Object.keys(ARCHETYPE_TABLES) as SettlementTier[]) {
      for (const tier of TIERS) {
        const list = ARCHETYPE_TABLES[settlement][tier];
        expect(list.length).toBeGreaterThan(0);
        for (const id of list) expect(MODEL_KEYS).toContain(id);
      }
    }
  });

  it("keeps the village's and the town's own models off the stand-in list", () => {
    for (const id of ["cottage", "farmhouse", "barn", "shopfront", "terrace", "apartment-low"] as const) {
      expect(ARCHETYPE_STAND_IN[id]).toBeUndefined();
    }
  });
});

describe("model variants", () => {
  it("thatches about three village cottages in five, and never a town's", () => {
    let thatched = 0;
    for (let i = 0; i < 500; i++) {
      const b = building(`k-${i}`, { path: `docs/${i}.md` });
      if (modelKeyFor("cottage", b, "village") === "cottage") thatched++;
      expect(modelKeyFor("cottage", b, "town")).toBe("cottage/tile");
    }
    expect(thatched / 500).toBeGreaterThan(0.5);
    expect(thatched / 500).toBeLessThan(0.7);
  });

  it("gives a shop a third storey at tier 3, and flats over shops on the high street", () => {
    expect(modelKeyFor("shopfront", building("s", { tier: 2 }), "town")).toBe("shopfront");
    expect(modelKeyFor("shopfront", building("s", { tier: 3 }), "town")).toBe("shopfront/tall");
    const flats = building("a", { tier: 4 });
    expect(modelKeyFor("apartment-low", flats, "town")).toBe("apartment-low");
    expect(modelKeyFor("apartment-low", { ...flats, frontage: "main-street" }, "town")).toBe("apartment-low/retail");
  });

  it("is deterministic", () => {
    const b = building("same", { path: "a/b/c.ts" });
    expect(modelKeyFor("cottage", b, "village")).toBe(modelKeyFor("cottage", { ...b }, "village"));
  });
});

describe("settlement models (PLAN.md sections 4 and 37)", () => {
  it("builds every model and variant inside the unit box, within budget", () => {
    for (const key of MODEL_KEYS) {
      const { draft } = archetypeModel(key);
      const triangles = draft.indices.length / 3;
      expect(triangles).toBeGreaterThan(20);
      expect(triangles).toBeLessThan(1300);
      for (let i = 0; i < draft.positions.length; i += 3) {
        expect(Math.abs(draft.positions[i])).toBeLessThanOrEqual(0.62);
        expect(draft.positions[i + 1]).toBeGreaterThanOrEqual(-0.001);
        expect(draft.positions[i + 1]).toBeLessThanOrEqual(1.12);
        expect(Math.abs(draft.positions[i + 2])).toBeLessThanOrEqual(0.62);
      }
    }
  });

  it("keeps a village of forty buildings under fifty thousand triangles", () => {
    const worst = Math.max(...(["cottage", "cottage/tile", "farmhouse", "barn"] as const).map((k) => archetypeModel(k).draft.indices.length / 3));
    expect(worst * 40).toBeLessThan(50_000);
  });

  it("paints every settlement vertex with a channel, and no city vertex at all", () => {
    for (const key of SETTLEMENT_MODELS) {
      const { draft } = archetypeModel(key);
      expect(draft.paint).toBeDefined();
      expect(draft.paint!.length).toBe(draft.positions.length / 3);
      const channels = new Set(draft.paint);
      for (const c of channels) expect([PAINT_NONE, PAINT_WALL, PAINT_ACCENT]).toContain(c);
      // Every one of them has a wall, absolute materials and an accent.
      expect(channels.has(PAINT_WALL)).toBe(true);
      expect(channels.has(PAINT_NONE)).toBe(true);
    }
    for (const key of CITY_ARCHETYPE_IDS) expect(archetypeModel(key).draft.paint).toBeUndefined();
  });

  it("has a front door and accents where the instance can colour them", () => {
    for (const key of ["cottage", "cottage/tile", "farmhouse", "shopfront", "terrace", "apartment-low"] as const) {
      expect(new Set(archetypeModel(key).draft.paint).has(PAINT_ACCENT)).toBe(true);
    }
  });

  it("builds the same arrays every time", () => {
    const pairs: [() => { draft: { positions: number[]; paint?: number[] } }, string][] = [
      [() => cottage("thatch"), "cottage"],
      [() => cottage("tile"), "cottage/tile"],
      [farmhouse, "farmhouse"],
      [barn, "barn"],
      [() => shopfront(2), "shopfront"],
      [() => shopfront(3), "shopfront/tall"],
      [terrace, "terrace"],
      [() => apartmentLow(false), "apartment-low"],
      [() => apartmentLow(true), "apartment-low/retail"],
    ];
    for (const [build, key] of pairs) {
      const a = build();
      const b = build();
      expect(a.draft.positions).toEqual(b.draft.positions);
      expect(a.draft.paint).toEqual(b.draft.paint);
      expect(archetypeModel(key as ModelKey).id).toBe(key);
    }
  });

  it("publishes lit windows that sit on the model's walls", () => {
    for (const key of SETTLEMENT_MODELS) {
      const model = archetypeModel(key);
      expect(model.windows.length).toBeGreaterThan(2);
      for (const w of model.windows) {
        expect(w.v).toBeGreaterThan(0);
        expect(w.v).toBeLessThan(1);
        expect(Math.abs((w.cx ?? 0) + w.plane)).toBeLessThanOrEqual(0.62);
      }
    }
  });
});

describe("the modelling kit", () => {
  it("converts sRGB to linear exactly at the ends and below the knee", () => {
    expect(linear("#000000")).toEqual([0, 0, 0]);
    expect(linear("#ffffff").map((v) => Number(v.toFixed(6)))).toEqual([1, 1, 1]);
    expect(linear("#808080")[0]).toBeCloseTo(0.2158, 3);
  });

  it("winds every face of a slab outward", () => {
    const draft = settlementDraft();
    slab(
      draft,
      [
        [-0.5, 0.5, 0.5],
        [0.5, 0.5, 0.5],
        [0.5, 1, 0],
        [-0.5, 1, 0],
      ],
      0.1,
      { color: [1, 1, 1], paint: 0 },
    );
    // Centre of the slab.
    const cx = 0;
    const cy = 0.7;
    const cz = 0.25;
    for (let q = 0; q < draft.positions.length / 12; q++) {
      const base = q * 12;
      let mx = 0;
      let my = 0;
      let mz = 0;
      for (let k = 0; k < 4; k++) {
        mx += draft.positions[base + k * 3] / 4;
        my += draft.positions[base + k * 3 + 1] / 4;
        mz += draft.positions[base + k * 3 + 2] / 4;
      }
      const n = [draft.normals[base], draft.normals[base + 1], draft.normals[base + 2]];
      expect(n[0] * (mx - cx) + n[1] * (my - cy) + n[2] * (mz - cz)).toBeGreaterThan(-1e-9);
    }
  });
});

describe("settlement paint", () => {
  it("draws cottage walls from the limewash palette and barns from barn paint", () => {
    const b = building("p", { path: "x/y.ts", colorIndex: 2 });
    const cottageWall = settlementPaint("cottage", b)!.wall;
    const barnWall = settlementPaint("barn", b)!.wall;
    const district = buildingColor(2);
    expect(VILLAGE_WALLS.map((c) => mix(c, district, DISTRICT_SHARE))).toContain(cottageWall);
    expect(BARN_WALLS.map((c) => mix(c, district, DISTRICT_SHARE))).toContain(barnWall);
    expect(SHOP_ACCENTS as readonly string[]).toContain(settlementPaint("shopfront", b)!.accent);
  });

  it("leaves the city's archetypes to the district colour", () => {
    for (const id of CITY_ARCHETYPE_IDS) expect(settlementPaint(id, building("c"))).toBeNull();
  });

  it("varies across a lane and repeats for the same path", () => {
    const walls = new Set<string>();
    for (let i = 0; i < 60; i++) walls.add(settlementPaint("cottage", building(`w-${i}`, { path: `lane/${i}.ts` }))!.wall);
    expect(walls.size).toBeGreaterThan(4);
    const b = building("r", { path: "same.ts" });
    expect(settlementPaint("terrace", b)).toEqual(settlementPaint("terrace", { ...b }));
  });
});

describe("turning buildings (PLAN.md 76.5)", () => {
  const eastWest = [lane("l1", [-20, 0], [20, 0])];

  it("keeps a village house on its layout yaw when the front already faces the lane", () => {
    // A house north of the lane (z < 0) faces +z, towards it: yaw 0.
    const turned = laneTurn([3, 0, -5], 0, eastWest);
    expect(turned).toEqual({ yaw: 0, swapped: false });
  });

  it("turns a village house round when its front faces away from the lane", () => {
    const turned = laneTurn([3, 0, 5], 0, eastWest);
    expect(turned.yaw).toBeCloseTo(Math.PI);
    expect(turned.swapped).toBe(false);
    const [fx, fz] = front(turned.yaw);
    expect(fx * 0 + fz * -5).toBeGreaterThan(0);
  });

  it("works on an angled lane at any yaw the layout gives", () => {
    const diagonal = [lane("d", [0, 0], [30, 30])];
    for (const yaw of [-Math.PI / 4, (3 * Math.PI) / 4]) {
      const at: [number, number, number] = [10, 0, 16];
      const turned = laneTurn(at, yaw, diagonal);
      const [fx, fz] = front(turned.yaw);
      // The nearest point on y = x to (10, 16) is (13, 13).
      expect(fx * (13 - at[0]) + fz * (13 - at[2])).toBeGreaterThan(0);
    }
  });

  it("faces a high-street shop onto the main road with a quarter turn and the footprint swap", () => {
    const roads = [
      lane("m", [-40, 0], [40, 0], { kind: "street", main: true, major: true, width: 6 }),
      lane("side", [10, -40], [10, 40], { kind: "street" }),
    ];
    const south = streetTurn([0, 0, 6], 0, roads);
    expect(south.yaw).toBeCloseTo(Math.PI);
    expect(south.swapped).toBe(false);
    // Beside the main road's end, the main road is still the one it faces.
    const east = streetTurn([46, 0, 0], 0, roads);
    expect(front(east.yaw)[0]).toBeCloseTo(-1);
    expect(east.swapped).toBe(true);
  });

  it("falls back to today's rule without lanes or a main road", () => {
    const b = building("f", { position: [12, 0, -30] });
    expect(buildingTurn(b, "village", [])).toEqual(doorTurn(b.position, 0));
    expect(buildingTurn({ ...b, frontage: "main-street" }, "town", [])).toEqual(doorTurn(b.position, 0));
    expect(buildingTurn(b, "city", eastWest)).toEqual(doorTurn(b.position, 0));
  });
});

describe("drawnHeight", () => {
  it("never holds back a city archetype", () => {
    for (const id of CITY_ARCHETYPE_IDS) expect(drawnHeight(id, [3, 23, 3])).toBe(23);
  });

  it("keeps a cottage a cottage on a narrow plot, and leaves a squat one alone", () => {
    expect(drawnHeight("cottage", [3, 3.9, 3])).toBeCloseTo(3 * MODEL_MAX_ASPECT.cottage!);
    expect(drawnHeight("cottage", [4.4, 3.4, 4.2])).toBe(3.4);
    expect(drawnHeight("farmhouse", [3, 7.6, 3])).toBeLessThan(7.6);
    expect(drawnHeight("shopfront", [3, 7.6, 3])).toBe(7.6);
  });
});

describe("planBuildings with a settlement", () => {
  const buildings: Building[] = Array.from({ length: 60 }, (_, i) =>
    building(`b-${i}`, {
      tier: TIERS[i % 5],
      path: `src/${i}.ts`,
      position: [((i % 8) - 4) * 9, 0, (Math.floor(i / 8) - 4) * 9],
    }),
  );

  it("is exactly today's plan for a city, with or without the option", () => {
    const today = planBuildings(buildings, { litShare: 0.7 });
    const city = planBuildings(buildings, { litShare: 0.7, settlement: "city", roads: [lane("x", [0, 0], [1, 1])] });
    expect(city).toEqual(today);
    for (const instance of today.instances) expect(instance.paint).toBeUndefined();
  });

  it("groups by model, so each variant is its own instanced mesh", () => {
    const plan = planBuildings(buildings, { litShare: 0.7, settlement: "village" });
    const models = plan.groups.map((g) => g.model);
    expect(new Set(models).size).toBe(models.length);
    for (const group of plan.groups) {
      for (let i = group.offset; i < group.offset + group.count; i++) {
        expect(plan.instances[i].model).toBe(group.model);
        expect(plan.instances[i].paint).toBeDefined();
      }
    }
    const ids = plan.groups.flatMap((g) => g.ids);
    expect(new Set(ids).size).toBe(buildings.length);
  });

  it("turns every village house towards its nearest lane", () => {
    const roads = [lane("ew", [-60, 2], [60, 2]), lane("ns", [3, -60], [3, 60])];
    const plan = planBuildings(buildings, { litShare: 0.7, settlement: "village", roads });
    for (const instance of plan.instances) {
      const [x, , z] = instance.building.position;
      const toEw = Math.abs(z - 2);
      const toNs = Math.abs(x - 3);
      const target = toEw < toNs ? [x, 2] : [3, z];
      const [fx, fz] = front(instance.yaw);
      if (Math.min(toEw, toNs) > 1e-6) expect(fx * (target[0] - x) + fz * (target[1] - z)).toBeGreaterThan(-1e-9);
      expect(instance.swapped).toBe(false);
    }
  });
});
