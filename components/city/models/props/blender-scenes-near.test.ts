/**
 * The near level of the construction sites, incident scenes, finished houses
 * and emergency vehicles (`blender/scenes_near/`): each is the lean model with
 * more detail, not a different one. Same node names, frames and outlines, the
 * same animated points (the crane's hook, the vehicles' lamps, the tow boom),
 * inside the scene budget of 60,000 triangles and the hero vehicle's 20,000.
 * The flag is off in tests, so the whole-scene checks mock it on and load the
 * builders afresh.
 */
import { Box3, type BufferGeometry } from "three";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { ConstructionState, IncidentState } from "@/types/analysis";
import { SURFACE_ATTRIBUTE } from "../../textures/surface-types";
import { importedMarker, importedParts, type ImportedModel } from "../imported";
import { mergeParts, triangleCount } from "./geometry";
import { MODEL as CRANE } from "./crane.model";
import { MODEL as CRANE_NEAR } from "./craneNear.model";
import { MODEL as SITE_PROPS } from "./constructionProps.model";
import { MODEL as SITE_PROPS_NEAR } from "./constructionPropsNear.model";
import { MODEL as SITE_KIT } from "./siteKit.model";
import { MODEL as SITE_KIT_NEAR } from "./siteKitNear.model";
import { MODEL as INCIDENT_PROPS } from "./incidentProps.model";
import { MODEL as INCIDENT_PROPS_NEAR } from "./incidentPropsNear.model";
import { MODEL as INCIDENT_KIT } from "./incidentKit.model";
import { MODEL as INCIDENT_KIT_NEAR } from "./incidentKitNear.model";
import { MODEL as DRESSING } from "./finishedDressing.model";
import { MODEL as DRESSING_NEAR } from "./finishedDressingNear.model";
import { MODEL as AMBULANCE } from "../vehicles/ambulance.model";
import { MODEL as AMBULANCE_NEAR } from "../vehicles/ambulanceNear.model";
import { MODEL as FIRE_ENGINE } from "../vehicles/fireEngine.model";
import { MODEL as FIRE_ENGINE_NEAR } from "../vehicles/fireEngineNear.model";
import { MODEL as POLICE_CAR } from "../vehicles/policeCar.model";
import { MODEL as POLICE_CAR_NEAR } from "../vehicles/policeCarNear.model";
import { MODEL as TOW_TRUCK } from "../vehicles/towTruck.model";
import { MODEL as TOW_TRUCK_NEAR } from "../vehicles/towTruckNear.model";
import { MODEL as WORKS_TRUCK } from "../vehicles/worksTruck.model";
import { MODEL as WORKS_TRUCK_NEAR } from "../vehicles/worksTruckNear.model";

const SCENE_BUDGET = 60000;
const VEHICLE_BUDGET = 20000;
const shade = (hex: string) => hex;
const bounds = (geometry: BufferGeometry) => new Box3().setFromBufferAttribute(geometry.getAttribute("position") as never);
const node = (model: ImportedModel, name: string) => mergeParts(importedParts(model, name, shade));
const tris = (model: ImportedModel, name: string) => model.nodes.find((n) => n.name === name)!.triangles;

/** [lean, near, the nodes they share] for every pair of models. */
const PAIRS: [string, ImportedModel, ImportedModel][] = [
  ["crane", CRANE, CRANE_NEAR],
  ["construction props", SITE_PROPS, SITE_PROPS_NEAR],
  ["site kit", SITE_KIT, SITE_KIT_NEAR],
  ["incident props", INCIDENT_PROPS, INCIDENT_PROPS_NEAR],
  ["finished dressing", DRESSING, DRESSING_NEAR],
  ["ambulance", AMBULANCE, AMBULANCE_NEAR],
  ["fire engine", FIRE_ENGINE, FIRE_ENGINE_NEAR],
  ["police car", POLICE_CAR, POLICE_CAR_NEAR],
  ["tow truck", TOW_TRUCK, TOW_TRUCK_NEAR],
  ["works truck", WORKS_TRUCK, WORKS_TRUCK_NEAR],
];

/** Nodes the near incident kit refines: the beacon, patches and flames stay lean. */
const KIT_REFINED = ["Weed0", "Weed1", "Weed2", "DebrisPlate", "DebrisBumper", "DebrisHub", "DebrisGlass", "SkidTile", "SkidTail", "Pothole", "Spoil", "Scorch"];

describe("the near models beside the lean ones", () => {
  it("has every lean node, in the lean node's frame", () => {
    for (const [name, lean, near] of PAIRS) {
      for (const { name: id, origin } of lean.nodes) {
        const twin = near.nodes.find((n) => n.name === id);
        expect(twin, `${name}: ${id}`).toBeDefined();
        expect(twin!.origin, `${name}: ${id} origin`).toEqual(origin);
      }
    }
    for (const id of KIT_REFINED) expect(INCIDENT_KIT_NEAR.nodes.some((n) => n.name === id), id).toBe(true);
  });

  it("adds detail: more triangles than the lean node, never wildly more", () => {
    for (const [name, lean, near] of PAIRS) {
      for (const { name: id } of lean.nodes) {
        expect(tris(near, id), `${name}: ${id}`).toBeGreaterThanOrEqual(tris(lean, id));
        expect(tris(near, id), `${name}: ${id}`).toBeLessThanOrEqual(15000);
      }
    }
  });

  it("stands inside the lean node's outline, a fitting's depth over it at most", () => {
    // Refined corners take a few centimetres off the extremes; bolts, rails,
    // ladders and sheeting add a few. Nothing grows by more than 0.6, but the
    // scaffold deck's guard rails, which stand a metre over its boards.
    for (const [name, lean, near] of PAIRS) {
      for (const { name: id } of lean.nodes) {
        const a = bounds(node(lean, id));
        const b = bounds(node(near, id));
        const margin = id === "ScaffoldDeck" ? 1 : 0.6;
        expect(b.min.x, `${name}: ${id} min x`).toBeGreaterThan(a.min.x - margin);
        expect(b.max.x, `${name}: ${id} max x`).toBeLessThan(a.max.x + margin);
        expect(b.min.y, `${name}: ${id} min y`).toBeGreaterThan(a.min.y - margin);
        expect(b.max.y, `${name}: ${id} max y`).toBeLessThan(a.max.y + margin);
        expect(b.min.z, `${name}: ${id} min z`).toBeGreaterThan(a.min.z - margin);
        expect(b.max.z, `${name}: ${id} max z`).toBeLessThan(a.max.z + margin);
      }
    }
  });

  it("keeps the near vehicles' lamps, boom and hook where the lean ones have them", () => {
    for (const [lean, near] of [
      [AMBULANCE, AMBULANCE_NEAR],
      [POLICE_CAR, POLICE_CAR_NEAR],
      [TOW_TRUCK, TOW_TRUCK_NEAR],
      [WORKS_TRUCK, WORKS_TRUCK_NEAR],
      [CRANE, CRANE_NEAR],
    ] as const) {
      expect(near.markers.length).toBe(lean.markers.length);
      for (const marker of lean.markers) {
        const a = importedMarker(lean, marker.name);
        const b = importedMarker(near, marker.name);
        for (let i = 0; i < 3; i++) expect(b[i], marker.name).toBeCloseTo(a[i], 2);
      }
    }
  });

  it("keeps the fire engine's ladder on the same pivot", () => {
    const a = FIRE_ENGINE.nodes.find((n) => n.name === "Ladder")!;
    const b = FIRE_ENGINE_NEAR.nodes.find((n) => n.name === "Ladder")!;
    expect(b.origin).toEqual(a.origin);
  });

  it("gives every vehicle a hero budget", () => {
    const vehicles: [string, ImportedModel, string[]][] = [
      ["ambulance", AMBULANCE_NEAR, ["Ambulance"]],
      ["police", POLICE_CAR_NEAR, ["PoliceCar"]],
      ["fire engine", FIRE_ENGINE_NEAR, ["FireEngine", "Ladder"]],
      ["tow truck", TOW_TRUCK_NEAR, ["TowTruck"]],
      ["works truck", WORKS_TRUCK_NEAR, ["WorksTruck"]],
    ];
    for (const [name, model, nodes] of vehicles) {
      const total = nodes.reduce((sum, id) => sum + tris(model, id), 0);
      expect(total, name).toBeLessThanOrEqual(VEHICLE_BUDGET);
      expect(total, name).toBeGreaterThan(8000);
    }
  });
});

describe("the near scenes", () => {
  let site: typeof import("./constructionDecor");
  let incidents: typeof import("./incidentDecor");
  let finished: typeof import("./finishedHouse");
  let emergency: typeof import("../vehicles/emergency");
  let level: typeof import("../detailLevel");

  beforeAll(async () => {
    vi.resetModules();
    vi.doMock("../modelSource", () => ({ BLENDER_MODELS: true }));
    site = await import("./constructionDecor");
    incidents = await import("./incidentDecor");
    finished = await import("./finishedHouse");
    emergency = await import("../vehicles/emergency");
    // The same module instance the builders were loaded against.
    level = await import("../detailLevel");
  });

  /** A site's decor with its crane, at a level: what the city draws for it. */
  const siteTriangles = (state: ConstructionState, level: "lean" | "near") =>
    triangleCount(site.constructionDecor(state, 0.2, level)) +
    (state === "completed" ? 0 : triangleCount(site.craneMastGeometry(state, 0.2, level)) + triangleCount(site.craneJibGeometry(state, 0.2, level)));

  it("keeps every construction site inside the scene budget, well over the lean one", () => {
    const counts: Record<string, number[]> = {};
    for (const state of ["active", "slow", "abandoned", "completed"] as ConstructionState[]) {
      const lean = siteTriangles(state, "lean");
      const near = siteTriangles(state, "near");
      counts[state] = [lean, near];
      expect(near, state).toBeLessThanOrEqual(SCENE_BUDGET);
      expect(near, state).toBeGreaterThan(lean * 5);
    }
    // The working sites and the abandoned one fill the budget.
    expect(counts.active[1]).toBeGreaterThan(50000);
    expect(counts.slow[1]).toBeGreaterThan(40000);
    expect(counts.abandoned[1]).toBeGreaterThan(30000);
    console.log("construction triangles, lean -> near:", JSON.stringify(counts));
  });

  it("keeps every incident inside the scene budget, well over the lean one", () => {
    const counts: Record<string, number[]> = {};
    for (const state of ["minor", "collision", "stale", "major"] as IncidentState[]) {
      const lean = triangleCount(incidents.incidentDecor(state, 0, 0.2).geometry);
      const near = triangleCount(incidents.incidentDecor(state, 0, 0.2, "near").geometry);
      counts[state] = [lean, near];
      expect(near, state).toBeLessThanOrEqual(SCENE_BUDGET);
      expect(near, state).toBeGreaterThan(lean * 3.5);
      expect(near, state).toBeGreaterThan(25000);
    }
    console.log("incident triangles, lean -> near:", JSON.stringify(counts));
  });

  it("draws the finished houses' dressing at more than the lean triangles", () => {
    for (const tier of ["village", "town"] as const) {
      const lean = triangleCount(finished.finishedDressingGeometry(tier, 0.2));
      const near = triangleCount(finished.finishedDressingGeometry(tier, 0.2, "near"));
      expect(near, tier).toBeGreaterThan(lean * 3);
      expect(near, tier).toBeLessThan(SCENE_BUDGET);
      console.log(`finished ${tier} dressing, lean -> near:`, lean, near);
    }
  });

  it("keeps the near site on its plot, standing on the ground", () => {
    for (const state of ["active", "slow", "abandoned", "completed"] as ConstructionState[]) {
      const lean = bounds(site.constructionDecor(state, 0.2));
      const near = bounds(site.constructionDecor(state, 0.2, "near"));
      // Nothing beyond the hoarding, or the fallen boards' reach.
      for (const [a, b] of [[lean.min.x, near.min.x], [lean.max.x, near.max.x], [lean.min.z, near.min.z], [lean.max.z, near.max.z]]) {
        expect(Math.abs(b) - Math.abs(a), state).toBeLessThan(0.7);
      }
      expect(near.min.y, state).toBeGreaterThan(Math.min(lean.min.y, 0) - 0.12);
      // The scaffold's guard rails stand a metre over its top platform.
      expect(near.max.y, state).toBeLessThan(lean.max.y + 1);
    }
  });

  it("keeps the near finished houses on their plots", () => {
    for (const tier of ["village", "town"] as const) {
      const half = finished.FINISHED[tier].plot / 2;
      const box = bounds(finished.finishedDressingGeometry(tier, 0, "near"));
      for (const v of [box.min.x, box.max.x, box.min.z, box.max.z]) expect(Math.abs(v), tier).toBeLessThanOrEqual(half + 0.1);
      expect(box.min.y, tier).toBeGreaterThanOrEqual(-0.03);
    }
  });

  it("keeps the incidents' vehicles, lamps and layout as the lean scenes have them", () => {
    for (const state of ["minor", "collision", "stale", "major"] as IncidentState[]) {
      const lean = incidents.incidentLayout(state, 0);
      const near = incidents.incidentLayout(state, 0, "near");
      expect(near.vehicles).toEqual(lean.vehicles);
      const a = incidents.incidentDecor(state, 0, 0.2);
      const b = incidents.incidentDecor(state, 0, 0.2, "near");
      expect(b.lights).toEqual(a.lights);
      // What is drawn stays inside the lane and the scene's ring.
      const box = bounds(b.geometry);
      const lean_box = bounds(a.geometry);
      // A barrier behind the pothole, the hose to the fire and the tape reach
      // a little past what the lean scene draws, never out of the lane.
      expect(box.max.z).toBeLessThan(lean_box.max.z + 0.9);
      expect(box.min.z).toBeGreaterThan(lean_box.min.z - 1.8);
      expect(Math.abs(box.max.x)).toBeLessThan(Math.abs(lean_box.max.x) + 1.2);
    }
  });

  it("keeps the two levels' caches apart and puts the level back", () => {
    const lean = incidents.incidentDecor("major", 0, 0.2).geometry;
    const near = incidents.incidentDecor("major", 0, 0.2, "near").geometry;
    expect(near).not.toBe(lean);
    expect(incidents.incidentDecor("major", 0, 0.2).geometry).toBe(lean);
    expect(incidents.incidentDecor("major", 0, 0.2, "near").geometry).toBe(near);
    expect(level.detailLevel()).toBe("lean");
    expect(() =>
      level.atLevel("near", () => {
        expect(level.detailLevel()).toBe("near");
        throw new Error("boom");
      }),
    ).toThrow("boom");
    expect(level.detailLevel()).toBe("lean");
    // The emergency vehicles too, one cached geometry per level.
    const engine = level.atLevel("near", () => emergency.emergencyGeometry("fire", 0.2));
    expect(engine).not.toBe(emergency.emergencyGeometry("fire", 0.2));
    expect(triangleCount(engine)).toBeGreaterThan(triangleCount(emergency.emergencyGeometry("fire", 0.2)) * 3);
  });

  it("keeps the surfaces on every near scene", () => {
    expect(site.constructionDecor("active", 0.2, "near").hasAttribute(SURFACE_ATTRIBUTE)).toBe(true);
    expect(incidents.incidentDecor("collision", 0, 0.2, "near").geometry.hasAttribute(SURFACE_ATTRIBUTE)).toBe(true);
    expect(finished.finishedDressingGeometry("town", 0.2, "near").hasAttribute(SURFACE_ATTRIBUTE)).toBe(true);
  });

  it("lays the near-only dressing where the lean scene has none", () => {
    // A pallet of bricks is brick surface; the lean active site carries none.
    const brick = (geometry: BufferGeometry) => {
      const surface = geometry.getAttribute(SURFACE_ATTRIBUTE);
      let n = 0;
      for (let i = 0; i < surface.count; i++) if (surface.getX(i) === 1) n++;
      return n;
    };
    expect(brick(site.constructionDecor("active", 0.2, "near"))).toBeGreaterThan(brick(site.constructionDecor("active", 0.2)));
    expect(tris(SITE_PROPS_NEAR, "Portaloo")).toBeGreaterThan(0);
    expect(tris(SITE_PROPS_NEAR, "Skip")).toBeGreaterThan(0);
    expect(tris(INCIDENT_KIT_NEAR, "HoseLine")).toBeGreaterThan(0);
    expect(tris(INCIDENT_KIT_NEAR, "TapeSpan")).toBeGreaterThan(0);
    expect(INCIDENT_KIT.nodes.some((n) => n.name === "HoseLine")).toBe(false);
  });
});
