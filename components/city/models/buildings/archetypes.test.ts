import { describe, expect, it } from "vitest";
import type { BuildingTier, LandmarkFile } from "@/types/analysis";
import type { Building } from "@/types/city";
import {
  ARCHETYPE_IDS,
  ARCHETYPE_STAND_IN,
  CITY_ARCHETYPE_IDS,
  SETTLEMENT_ARCHETYPE_IDS,
  archetypeSeed,
  chooseArchetype,
  hash32,
  languageFamily,
  variantValue,
  type ArchetypeId,
} from "./archetypes";
import { archetypeModel } from "./models";
import { doorTurn, litWindowCount, planBuildings, propCount } from "./placement";

export function building(
  id: string,
  options: Partial<{
    tier: BuildingTier;
    path: string;
    kind: "file" | "directory";
    language: string | null;
    role: string | null;
    position: [number, number, number];
    rotationY: number;
    size: [number, number, number];
    landmark: LandmarkFile | null;
    colorIndex: number;
  }> = {},
): Building {
  const tier = options.tier ?? 1;
  const path = options.path ?? `src/${id}.ts`;
  return {
    id,
    kind: "building",
    position: options.position ?? [10, 0, 10],
    rotationY: options.rotationY ?? 0,
    title: id,
    subtitle: "",
    description: "",
    reason: "",
    sourceUrl: null,
    visualState: "normal",
    appearAt: 0,
    districtId: "d1",
    size: options.size ?? [4, 4.2, 4],
    tier,
    colorIndex: options.colorIndex ?? 0,
    plan: {
      id,
      path,
      kind: options.kind ?? "file",
      districtId: "d1",
      score: 1,
      tier,
      descendantCount: 0,
      language: options.language ?? "TypeScript",
      role: options.role ?? null,
      landmark: options.landmark ?? null,
    },
  };
}

describe("languageFamily (PLAN.md section 9)", () => {
  it("groups languages into the five families, case-insensitively", () => {
    expect(languageFamily("TypeScript")).toBe("script");
    expect(languageFamily("rust")).toBe("compiled");
    expect(languageFamily("Markdown")).toBe("markup");
    expect(languageFamily("YAML")).toBe("data");
    expect(languageFamily("Dockerfile")).toBe("config");
  });

  it("leaves an unknown or missing language plain", () => {
    expect(languageFamily(null)).toBe("unknown");
    expect(languageFamily("Brainfuck")).toBe("unknown");
  });
});

describe("chooseArchetype (PLAN.md sections 9 and 35)", () => {
  it("is deterministic: the same building always gets the same shape", () => {
    const b = building("b-1", { tier: 3, path: "src/server/router.ts" });
    const first = chooseArchetype(b);
    for (let i = 0; i < 20; i++) expect(chooseArchetype(building("b-1", { tier: 3, path: "src/server/router.ts" }))).toBe(first);
  });

  it("depends on the path, not on the position in the list", () => {
    const a = chooseArchetype(building("b-001", { tier: 2, path: "src/util.ts" }));
    const b = chooseArchetype(building("b-274", { tier: 2, path: "src/util.ts" }));
    expect(a).toBe(b);
  });

  it("keeps every tier inside its own candidate shapes", () => {
    const tiers: Record<BuildingTier, ArchetypeId[]> = { 1: [], 2: [], 3: [], 4: [], 5: [] };
    for (let i = 0; i < 400; i++) {
      for (const tier of [1, 2, 3, 4, 5] as BuildingTier[]) {
        const b = building(`b-${i}`, { tier, path: `src/mod${i}/file${i}.ts` });
        tiers[tier].push(chooseArchetype(b));
      }
    }
    // A house is never a skyline tower, and a crowned tower is never a shed.
    expect(tiers[1]).not.toContain("tower-crown");
    expect(tiers[1]).not.toContain("midrise-mech");
    expect(tiers[5]).not.toContain("house");
    expect(tiers[5]).not.toContain("lowrise-pitched");
  });

  it("gives a whole city a mix of shapes rather than one shape", () => {
    const seen = new Set<ArchetypeId>();
    for (let i = 0; i < 300; i++) {
      const tier = ((i % 5) + 1) as BuildingTier;
      seen.add(
        chooseArchetype(
          building(`b-${i}`, {
            tier,
            path: `pkg/${i % 7}/module-${i}.ts`,
            language: ["TypeScript", "Rust", "Markdown", "JSON", "Dockerfile"][i % 5],
            kind: i % 3 === 0 ? "directory" : "file",
          }),
        ),
      );
    }
    expect(seen.size).toBeGreaterThanOrEqual(7);
  });

  it("leans data and config paths towards storage shapes", () => {
    let warehouses = 0;
    for (let i = 0; i < 200; i++) {
      const b = building(`d-${i}`, { tier: 2, path: `config/${i}.yml`, language: "YAML" });
      if (chooseArchetype(b) === "warehouse-sawtooth") warehouses++;
    }
    expect(warehouses).toBeGreaterThan(60);
  });

  it("survives a tier or plan the generator never promised", () => {
    const rogue = building("b-x", { tier: 9 as BuildingTier });
    expect(ARCHETYPE_IDS).toContain(chooseArchetype(rogue));
  });
});

describe("hashing", () => {
  it("is stable and spread out", () => {
    expect(hash32("src/index.ts")).toBe(hash32("src/index.ts"));
    expect(hash32("src/index.ts")).not.toBe(hash32("src/index.js"));
    const values = new Set<number>();
    for (let i = 0; i < 200; i++) values.add(variantValue(`seed-${i}`, 3));
    expect(values.size).toBeGreaterThan(190);
  });

  it("seeds from the path when there is one", () => {
    expect(archetypeSeed(building("b-1", { path: "src/a.ts" }))).toBe("src/a.ts");
  });
});

describe("archetype models (PLAN.md sections 4 and 37)", () => {
  it("builds every archetype inside the unit box, with a sane triangle count", () => {
    for (const id of ARCHETYPE_IDS) {
      const model = archetypeModel(id);
      const triangles = model.draft.indices.length / 3;
      expect(triangles).toBeGreaterThan(20);
      // The budget is about 400k triangles for 300 buildings, so no single
      // archetype may cost more than about 1300 (PLAN.md section 37).
      expect(triangles).toBeLessThan(1300);

      for (let i = 0; i < model.draft.positions.length; i += 3) {
        const [x, y, z] = model.draft.positions.slice(i, i + 3);
        expect(Math.abs(x)).toBeLessThanOrEqual(0.62);
        expect(Math.abs(z)).toBeLessThanOrEqual(0.62);
        expect(y).toBeGreaterThanOrEqual(-0.001);
        expect(y).toBeLessThanOrEqual(1.12);
      }
    }
  });

  it("caches, so an instanced mesh never rebuilds its geometry", () => {
    expect(archetypeModel("house")).toBe(archetypeModel("house"));
  });

  it("publishes windows that sit on a wall, and roof pads on a roof", () => {
    for (const id of ARCHETYPE_IDS) {
      const model = archetypeModel(id);
      expect(model.windows.length).toBeGreaterThan(0);
      for (const panel of model.windows) {
        expect(panel.plane).toBeGreaterThan(0.2);
        expect(panel.v).toBeGreaterThan(0);
        expect(panel.v).toBeLessThan(1);
      }
      for (const pad of model.roofPads) {
        expect(pad.y).toBeGreaterThan(0.3);
        expect(pad.y).toBeLessThanOrEqual(1);
      }
    }
  });

  it("has a colour and a normal for every vertex", () => {
    for (const id of ARCHETYPE_IDS) {
      const { draft } = archetypeModel(id);
      expect(draft.colors.length).toBe(draft.positions.length);
      expect(draft.normals.length).toBe(draft.positions.length);
    }
  });
});

describe("doorTurn (PLAN.md section 9)", () => {
  it("points the model's front at the city centre", () => {
    // A building north-east of the centre should face back towards it.
    const { yaw } = doorTurn([40, 0, 40], 0);
    expect(Math.sin(yaw)).toBeCloseTo(-1, 5);
  });

  it("only ever turns by a quarter, and says when the axes swapped", () => {
    for (const [x, z] of [
      [10, 0],
      [-10, 0],
      [0, 10],
      [0, -10],
      [7, -13],
    ]) {
      const { yaw, swapped } = doorTurn([x, 0, z], 0);
      const quarters = yaw / (Math.PI / 2);
      expect(Math.abs(quarters - Math.round(quarters))).toBeLessThan(1e-9);
      expect(swapped).toBe(Math.round(quarters) % 2 !== 0);
    }
  });

  it("leaves a building on the exact centre alone", () => {
    expect(doorTurn([0, 0, 0], 0)).toEqual({ yaw: 0, swapped: false });
  });
});

describe("propCount (PLAN.md section 37)", () => {
  it("puts more on a tower than on a shed, and nothing on a pitched roof", () => {
    expect(propCount(1, 0, 0.1)).toBe(0);
    expect(propCount(5, 3, 0.1)).toBe(3);
    expect(propCount(5, 1, 0.1)).toBe(1);
    expect(propCount(1, 2, 0.9)).toBe(0);
  });
});

describe("planBuildings (PLAN.md section 38)", () => {
  const city = Array.from({ length: 120 }, (_, i) =>
    building(`b-${i}`, {
      tier: ((i % 5) + 1) as BuildingTier,
      path: `pkg/${i % 6}/file-${i}.ts`,
      language: ["TypeScript", "Go", "Markdown", "JSON", "YAML"][i % 5],
      kind: i % 4 === 0 ? "directory" : "file",
      position: [i - 60, 0, (i % 11) - 5],
      size: [4, 4 + (i % 5) * 4, 4],
    }),
  );

  it("maps every instance id back to exactly one entity", () => {
    const plan = planBuildings(city, { litShare: 0.7 });
    const seen = new Set<string>();
    let total = 0;
    for (const group of plan.groups) {
      expect(group.ids.length).toBe(group.count);
      for (let instanceId = 0; instanceId < group.ids.length; instanceId++) {
        const id = group.ids[instanceId];
        // The flat instance list is the same order as the per-group ids.
        expect(plan.instances[group.offset + instanceId].building.id).toBe(id);
        expect(seen.has(id)).toBe(false);
        seen.add(id);
        total++;
      }
    }
    expect(total).toBe(city.length);
    expect(seen.size).toBe(city.length);
  });

  it("lays the groups out back to back with no gaps", () => {
    const plan = planBuildings(city, { litShare: 0.5 });
    let offset = 0;
    for (const group of plan.groups) {
      expect(group.offset).toBe(offset);
      offset += group.count;
    }
    expect(offset).toBe(plan.instances.length);
  });

  it("is deterministic end to end", () => {
    const a = planBuildings(city, { litShare: 0.6 });
    const b = planBuildings(city, { litShare: 0.6 });
    expect(b.groups.map((g) => [g.archetype, g.count])).toEqual(
      a.groups.map((g) => [g.archetype, g.count]),
    );
    expect(b.windows.length).toBe(a.windows.length);
    expect(b.props.map((p) => [p.buildingIndex, p.kind])).toEqual(
      a.props.map((p) => [p.buildingIndex, p.kind]),
    );
  });

  it("lights fewer windows in a quiet city than in a busy one", () => {
    const quiet = planBuildings(city, { litShare: 0.2 });
    const busy = planBuildings(city, { litShare: 1 });
    expect(quiet.windows.length).toBeLessThan(busy.windows.length);
    expect(quiet.windows.length).toBeGreaterThan(0);
  });

  it("never lights a window on a building that went dark", () => {
    const plan = planBuildings(city, { litShare: 0.5 });
    for (const w of plan.windows) expect(plan.instances[w.buildingIndex].lit).toBe(true);
  });

  it("orders the windows by when their building lights up, so any hour is a prefix", () => {
    const all = planBuildings(city, { litShare: 1 });
    for (let i = 1; i < all.windows.length; i++) {
      expect(all.windows[i].rank).toBeGreaterThanOrEqual(all.windows[i - 1].rank);
    }
    for (const share of [0, 0.2, 0.45, 0.7, 1]) {
      const at = planBuildings(city, { litShare: share });
      const count = litWindowCount(all.windows, share);
      // The prefix of the full plan is exactly the plan made at that share.
      expect(count).toBe(at.windows.length);
      expect(all.windows.slice(0, count)).toEqual(at.windows);
      for (const w of all.windows.slice(0, count)) expect(w.rank).toBeLessThan(share);
      for (const w of all.windows.slice(count)) expect(w.rank).toBeGreaterThanOrEqual(share);
    }
    for (const w of all.windows) {
      expect(w.tone).toBeGreaterThanOrEqual(0);
      expect(w.tone).toBeLessThan(1);
    }
  });

  it("keeps the first buildings to light up when the pane budget runs out", () => {
    const all = planBuildings(city, { litShare: 1 });
    const capped = planBuildings(city, { litShare: 1, windowCap: 40 });
    expect(capped.windows).toEqual(all.windows.slice(0, 40));
  });

  it("respects the instance caps a metropolis could otherwise blow past", () => {
    const plan = planBuildings(city, { litShare: 1, windowCap: 40, propCap: 7 });
    expect(plan.windows.length).toBeLessThanOrEqual(40);
    expect(plan.props.length).toBeLessThanOrEqual(7);
  });

  it("stands every prop on a pad its archetype actually has", () => {
    const plan = planBuildings(city, { litShare: 1 });
    expect(plan.props.length).toBeGreaterThan(0);
    for (const prop of plan.props) {
      const instance = plan.instances[prop.buildingIndex];
      const pads = archetypeModel(instance.archetype).roofPads;
      expect(pads.length).toBeGreaterThan(0);
      expect(pads.some((pad) => Math.abs(pad.y - prop.y) < 1e-9)).toBe(true);
    }
  });

  it("handles an empty city", () => {
    const plan = planBuildings([], { litShare: 1 });
    expect(plan.groups).toEqual([]);
    expect(plan.instances).toEqual([]);
    expect(plan.windows).toEqual([]);
    expect(plan.props).toEqual([]);
  });
});

describe("settlement archetypes (PLAN.md 76.11, S0 placeholders)", () => {
  it("declares all nine ids and keeps every id unique", () => {
    expect(SETTLEMENT_ARCHETYPE_IDS).toEqual([
      "cottage",
      "farmhouse",
      "barn",
      "shopfront",
      "terrace",
      "apartment-low",
      "tower-glass",
      "tower-twin",
      "tower-spire",
    ]);
    expect(new Set(ARCHETYPE_IDS).size).toBe(ARCHETYPE_IDS.length);
  });

  it("builds a placeholder from its stand-in, under its own id", () => {
    for (const id of SETTLEMENT_ARCHETYPE_IDS) {
      const standIn = ARCHETYPE_STAND_IN[id];
      if (!standIn) continue; // the real model has landed
      const model = archetypeModel(id);
      expect(model.id).toBe(id);
      expect(model.draft.indices.length).toBe(archetypeModel(standIn).draft.indices.length);
    }
  });

  it("is never chosen by today's city", () => {
    const city = new Set<ArchetypeId>(CITY_ARCHETYPE_IDS);
    for (let i = 0; i < 500; i++) {
      const tier = ((i % 5) + 1) as BuildingTier;
      const chosen = chooseArchetype(building(`b-${i}`, { tier, path: `src/${i}.ts` }));
      expect(city.has(chosen)).toBe(true);
    }
  });
});
