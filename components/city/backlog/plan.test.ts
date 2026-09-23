import { describe, expect, it } from "vitest";
import { generateCity } from "@/lib/city/generator";
import { CROWD_BASE_SIZE, HOARDING_KERB_SIZE, heatScale } from "@/lib/city/backlog";
import backlogFixture from "@/fixtures/backlog.analysis.json";
import type { RepoAnalysis } from "@/types/analysis";
import type { CityModel, ConstructionSite, Incident } from "@/types/city";
import { devCity } from "@/fixtures/dev.city";
import { CROWD_MESHES, FORM_PAINT, MASK, PART, formSpec } from "./forms";
import { BLINK_RATE } from "./material";
import {
  CAR_SKEW,
  PAVEMENT_TOP,
  ROAD_TOP,
  hoardingMesh,
  instanceScale,
  phaseFor,
  pickBox,
  planCrowd,
  pullMask,
  scaffoldScale,
  STALE_WEAR,
  WEAR_STYLE,
  issueWear,
  variantFor,
} from "./plan";
import { SCAFFOLD_BAY, SCAFFOLD_REACH } from "./constants";

const analysis = backlogFixture as unknown as RepoAnalysis;
const metropolis: CityModel = generateCity(analysis, { tier: "metropolis" });

const site = (
  overrides: Omit<Partial<ConstructionSite>, "pull"> & { pull?: Partial<ConstructionSite["pull"]> },
): ConstructionSite => {
  const base = devCity.constructionSites[0];
  return {
    ...base,
    lod: "crowd",
    ...overrides,
    pull: { ...base.pull, ...overrides.pull },
  } as ConstructionSite;
};

describe("planCrowd", () => {
  it("draws nothing for a model without a backlog", () => {
    const plan = planCrowd(devCity);
    expect(plan.count).toBe(0);
    expect(plan.groups).toEqual([]);
  });

  it("puts every crowd object in exactly one instance, in id order per mesh", () => {
    const plan = planCrowd(metropolis);
    const backlog = metropolis.backlog!;
    const all = [...backlog.incidents, ...backlog.constructionSites].map((e) => e.id);
    const drawn = plan.groups.flatMap((g) => g.ids);
    expect(plan.count).toBe(all.length);
    expect(new Set(drawn)).toEqual(new Set(all));
    expect(drawn).toHaveLength(new Set(drawn).size);
    for (const group of plan.groups) {
      // `useInstanceHandlers(ids)` maps instanceId i to ids[i]: they must agree.
      group.items.forEach((item, i) => expect(group.ids[i]).toBe(item.id));
      expect(CROWD_MESHES).toContain(group.form);
    }
    // At most one mesh per model: the draw calls do not grow with the count.
    expect(plan.groups.length).toBeLessThanOrEqual(CROWD_MESHES.length);
  });

  it("draws every form of the fixture, the kerb hoarding included", () => {
    const forms = new Set(planCrowd(metropolis).groups.map((g) => g.form));
    for (const form of ["fire", "collision", "wreck", "pothole", "roadblock", "survey", "signpost", "scaffold", "trench", "van"]) {
      expect(forms.has(form as never), form).toBe(true);
    }
    expect(forms.has("hoarding") || forms.has("hoarding-kerb")).toBe(true);
  });

  it("scales each object by its size over its base size, which is its heat", () => {
    const plan = planCrowd(metropolis);
    const byId = new Map(plan.groups.flatMap((g) => g.items.map((item) => [item.id, item] as const)));
    for (const incident of metropolis.backlog!.incidents.slice(0, 200)) {
      const item = byId.get(incident.id)!;
      const s = heatScale(incident.heat ?? 0);
      expect(item.scale[0]).toBeCloseTo(s, 2);
      expect(item.scale[2]).toBeCloseTo(s, 2);
    }
  });

  it("uses the entity's size for picking, and never less than it", () => {
    const plan = planCrowd(metropolis);
    const byId = new Map(plan.groups.flatMap((g) => g.items.map((item) => [item.id, item] as const)));
    for (const entity of [...metropolis.backlog!.incidents, ...metropolis.backlog!.constructionSites]) {
      const item = byId.get(entity.id)!;
      const size = entity.size!;
      expect(item.pick.maxX, entity.id).toBeGreaterThanOrEqual(size[0] / 2 - 1e-6);
      expect(-item.pick.minX, entity.id).toBeGreaterThanOrEqual(size[0] / 2 - 1e-6);
      expect(item.pick.maxZ, entity.id).toBeGreaterThanOrEqual(size[2] / 2 - 1e-6);
      expect(-item.pick.minZ, entity.id).toBeGreaterThanOrEqual(size[2] / 2 - 1e-6);
    }
  });

  it("picks a scaffold by its slab alone, up to the storeys it covers", () => {
    const size = [6, 30, 0.9];
    const scale = scaffoldScale(size);
    const box = pickBox("scaffold", scale, size);
    expect(box.minX).toBeCloseTo(-3);
    expect(box.maxX).toBeCloseTo(3);
    expect(box.minZ).toBeCloseTo(-0.45);
    expect(box.maxZ).toBeCloseTo(0.45);
    // A thirty unit tower is scaffolded up its lower storeys, not to its roof,
    // so its upper facade and its roof still pick the building.
    expect(box.maxY).toBeLessThan(SCAFFOLD_REACH + 0.5);
    expect(scale[1] * SCAFFOLD_BAY.height).toBeCloseTo(SCAFFOLD_REACH);
  });

  it("switches the modifiers on from checks, review and state (PLAN.md 76.7)", () => {
    expect(pullMask(site({ state: "active", pull: { checks: "passing", review: null } }))).toBe(MASK.worker);
    expect(pullMask(site({ state: "abandoned", pull: { checks: null, review: null } }))).toBe(0);
    expect(pullMask(site({ state: "active", pull: { checks: "failing", review: null } }))).toBe(MASK.worker | MASK.beacon);
    expect(pullMask(site({ state: "slow", pull: { checks: null, review: "changes-requested" } }))).toBe(MASK.worker | MASK.board);
    expect(pullMask(site({ state: "active", pull: { checks: null, review: "approved" } }))).toBe(MASK.worker | MASK.flag);
  });

  it("tints abandoned work rust and slow work dim, and leaves active work alone", () => {
    const plan = planCrowd(metropolis);
    const tints = new Map<string, Set<string>>();
    const sites = new Map(metropolis.backlog!.constructionSites.map((s) => [s.id, s]));
    for (const group of plan.groups) {
      for (const item of group.items) {
        const s = sites.get(item.id);
        if (!s) continue;
        const set = tints.get(s.state) ?? new Set();
        set.add(item.tint);
        tints.set(s.state, set);
      }
    }
    const lightness = (hex: string) => parseInt(hex.slice(1, 3), 16) + parseInt(hex.slice(3, 5), 16) + parseInt(hex.slice(5, 7), 16);
    const mean = (set: Set<string> | undefined) => {
      const list = [...(set ?? [])];
      return list.reduce((sum, hex) => sum + lightness(hex), 0) / Math.max(1, list.length);
    };
    expect(mean(tints.get("abandoned"))).toBeLessThan(mean(tints.get("active")));
    expect(mean(tints.get("slow"))).toBeLessThan(mean(tints.get("active")));
  });

  it("glows only the lamps that are switched on, in step with their instance", () => {
    const plan = planCrowd(metropolis);
    let beacons = 0;
    for (const group of plan.groups) {
      for (const item of group.items) {
        if (item.mask & MASK.beacon) beacons++;
      }
    }
    const red = plan.halos.filter((h) => h.rate === BLINK_RATE[PART.beacon]);
    expect(red.length).toBe(beacons);
    for (const halo of plan.halos) expect(halo.phase).toBeGreaterThanOrEqual(0);
    // Every fire smokes, three puffs each.
    const fires = plan.groups.find((g) => g.form === "fire")?.items.length ?? 0;
    expect(plan.smoke.length).toBe(fires * 3);
    expect(formSpec("fire").smoke).not.toBeNull();
  });

  it("stands lane objects on the road and kerb objects on the pavement", () => {
    const plan = planCrowd(metropolis);
    const incidents = new Map(metropolis.backlog!.incidents.map((i) => [i.id, i] as const));
    let kerb = 0;
    for (const group of plan.groups) {
      for (const item of group.items) {
        if (item.lane) expect(item.y).toBe(ROAD_TOP);
        const incident: Incident | undefined = incidents.get(item.id);
        if (incident && !incident.lane && item.y === PAVEMENT_TOP) kerb++;
      }
    }
    expect(kerb).toBeGreaterThan(0);
  });

  it("is a pure function of the model", () => {
    expect(planCrowd(metropolis)).toEqual(planCrowd(metropolis));
  });
});

describe("crowd scale and meshes", () => {
  it("falls back to heat when the model gives no size", () => {
    expect(instanceScale("pothole", undefined, 1)).toEqual([1.25, 1.25, 1.25]);
    expect(instanceScale("pothole", undefined, 0)).toEqual([0.9, 0.9, 0.9]);
  });

  it("stretches a plot hoarding to its plot", () => {
    const base = CROWD_BASE_SIZE.hoarding;
    const scale = instanceScale("hoarding", [base[0] * 1.5, base[1], base[2] * 1.2], 0);
    expect(scale[0]).toBeCloseTo(1.5);
    expect(scale[2]).toBeCloseTo(1.2);
  });

  it("gives a hoarding with no plot the long kerb model", () => {
    const s = heatScale(0.5);
    expect(hoardingMesh(HOARDING_KERB_SIZE.map((v) => v * s))).toBe("hoarding-kerb");
    expect(hoardingMesh(CROWD_BASE_SIZE.hoarding.map((v) => v * s))).toBe("hoarding");
    expect(hoardingMesh([4, 2, 3.9])).toBe("hoarding");
    expect(hoardingMesh(undefined)).toBe("hoarding");
  });

  it("spreads phases so neighbours do not blink in step", () => {
    const phases = new Set(Array.from({ length: 200 }, (_, i) => Math.round(phaseFor(`incident-${i}`) * 20)));
    expect(phases.size).toBeGreaterThan(15);
    for (let i = 0; i < 50; i++) {
      const p = phaseFor(`x${i}`);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThan(1);
    }
  });
});

describe("weathering by age (content decides the form, age the weathering)", () => {
  it("rusts metal forms and fades the rest, more the longer an issue sits", () => {
    for (const form of ["collision", "wreck", "roadblock", "signpost", "fire"] as const) {
      expect(WEAR_STYLE[form], form).toBe("rust");
      expect(issueWear(form, "minor", 0), form).toBe(0);
      expect(issueWear(form, "minor", 300), form).toBeGreaterThan(0);
      expect(issueWear(form, "minor", 2000), form).toBe(1);
    }
    for (const form of ["pothole", "survey"] as const) {
      expect(WEAR_STYLE[form], form).toBe("fade");
      expect(issueWear(form, "minor", 300), form).toBeLessThan(0);
      expect(issueWear(form, "minor", 2000), form).toBe(-1);
    }
    expect(issueWear("collision", "minor", 200)).toBeLessThan(issueWear("collision", "minor", 400));
  });

  it("weathers a stale issue at least visibly, whatever its form", () => {
    for (const form of ["collision", "pothole", "signpost", "survey"] as const) {
      expect(Math.abs(issueWear(form, "stale", 0)), form).toBeGreaterThanOrEqual(STALE_WEAR);
    }
  });

  it("leaves pull requests to their state tint: rust when abandoned, grey when slow", () => {
    const plan = planCrowd(metropolis);
    const incidents = new Map(metropolis.backlog!.incidents.map((i) => [i.id, i]));
    let weathered = 0;
    for (const group of plan.groups) {
      for (const item of group.items) {
        const incident = incidents.get(item.id);
        if (!incident) {
          expect(item.wear, item.id).toBe(0);
          continue;
        }
        if (item.wear !== 0) weathered++;
        expect(Math.abs(item.wear)).toBeLessThanOrEqual(1);
      }
    }
    expect(weathered).toBeGreaterThan(0);
    // No draw calls: one mesh per form, as before.
    expect(plan.groups.length).toBeLessThanOrEqual(CROWD_MESHES.length);
  });
});

describe("crowd variety", () => {
  const ids = Array.from({ length: 300 }, (_, i) => `incident-${1000 + i * 7}`);

  it("paints a street of collisions in many colours, never two matching cars in one crash", () => {
    const pairs = new Set<string>();
    for (const id of ids) {
      const { paint } = variantFor("collision", id);
      expect(paint[0], id).not.toBe(paint[1]);
      expect(FORM_PAINT.collision!.a).toContain(paint[0]);
      expect(FORM_PAINT.collision!.b).toContain(paint[1]);
      pairs.add(paint.join());
    }
    expect(pairs.size).toBeGreaterThan(40);
  });

  it("turns cars end for end about half the time and only a few degrees askew otherwise", () => {
    let flipped = 0;
    for (const id of ids) {
      const { turn } = variantFor("wreck", id);
      const flip = Math.abs(turn) > Math.PI / 2;
      if (flip) flipped++;
      expect(Math.abs(flip ? turn - Math.PI : turn), id).toBeLessThanOrEqual(CAR_SKEW + 1e-9);
    }
    expect(flipped).toBeGreaterThan(ids.length * 0.3);
    expect(flipped).toBeLessThan(ids.length * 0.7);
  });

  it("leaves forms that are not cars facing as placed, and forms with no paint white", () => {
    for (const form of ["pothole", "roadblock", "scaffold", "hoarding", "trench"] as const) {
      expect(variantFor(form, "incident-1").turn).toBe(0);
    }
    expect(variantFor("pothole", "incident-1").paint).toEqual(["#ffffff", "#ffffff"]);
  });

  it("is stable per id and carried onto the instance", () => {
    expect(variantFor("collision", "incident-7")).toEqual(variantFor("collision", "incident-7"));
    const plan = planCrowd(metropolis);
    const byId = new Map(
      [...(metropolis.backlog?.incidents ?? []), ...(metropolis.backlog?.constructionSites ?? [])].map((e) => [e.id, e]),
    );
    for (const group of plan.groups) {
      for (const item of group.items) {
        const variant = variantFor(item.form, item.id);
        expect(item.paint).toEqual(variant.paint);
        expect(item.rotationY).toBeCloseTo(byId.get(item.id)!.rotationY + variant.turn);
      }
    }
  });
});
