/**
 * The incident scene's Blender models (spike: `blender/incidents/*.py`),
 * checked against the procedural contracts they stand in for. The flag is
 * off in tests, so these call the Blender builders directly.
 */
import { Box3, type BufferGeometry } from "three";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { desaturate } from "../../palette";
import { SURFACE_ATTRIBUTE } from "../../textures/surface-types";
import { importedMarker } from "../imported";
import {
  EMERGENCY_LIGHTS,
  TOW_BOOM_FOOT,
  TOW_BOOM_HEAD,
  blenderVehicleLights,
  blenderVehicleParts,
  emergencyGeometry,
} from "../vehicles/emergency";
import { BODY_SPECS, TRUCK_SPECS } from "../vehicles/shapes";
import { MODEL as TOW_TRUCK } from "../vehicles/towTruck.model";
import { MODEL as CRANE } from "./crane.model";
import { MODEL as INCIDENT_PROPS } from "./incidentProps.model";
import { mergeParts, triangleCount } from "./geometry";

const shade = (hex: string) => desaturate(hex, 0.2);
const VEHICLES = ["police", "ambulance", "tow", "works"] as const;
type Vehicle = (typeof VEHICLES)[number];

const blender = (kind: Vehicle) => mergeParts(blenderVehicleParts(kind, shade));

/** The procedural spec each Blender vehicle is built on. */
const SPEC = {
  police: BODY_SPECS.sedan,
  ambulance: BODY_SPECS.van,
  tow: TRUCK_SPECS.wrecker,
  works: TRUCK_SPECS.dropside,
};

/** What stands on the ground: every vertex under a cab roof. */
function footprint(geometry: BufferGeometry) {
  const position = geometry.getAttribute("position");
  const box = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (let i = 0; i < position.count; i++) {
    if (position.getY(i) > 1.5) continue;
    box.minX = Math.min(box.minX, position.getX(i));
    box.maxX = Math.max(box.maxX, position.getX(i));
    box.minZ = Math.min(box.minZ, position.getZ(i));
    box.maxZ = Math.max(box.maxZ, position.getZ(i));
  }
  return box;
}

describe("the Blender incident vehicles (spike)", () => {
  it.each(VEHICLES)("%s stands on its wheels on the procedural footprint", (kind) => {
    const geometry = blender(kind);
    const bounds = new Box3().setFromBufferAttribute(geometry.getAttribute("position") as never);
    expect(Math.abs(bounds.min.y)).toBeLessThan(0.02);
    const spec = SPEC[kind];
    const own = footprint(geometry);
    const procedural = footprint(emergencyGeometry(kind, 0.2));
    // As wide as the body plus mirrors, and inside the incident tests' limit.
    expect(own.maxX - own.minX).toBeLessThanOrEqual(1.4);
    expect(own.maxX - own.minX).toBeGreaterThan(spec.width);
    // Nose and tail where the procedural vehicle's are: bumpers, a push bar
    // or a wheel-lift may stand a little proud.
    expect(Math.abs(own.maxZ - procedural.maxZ)).toBeLessThan(0.2);
    expect(Math.abs(own.minZ - procedural.minZ)).toBeLessThan(0.2);
    expect(own.maxZ - own.minZ).toBeLessThan(5.3);
  });

  it.each(VEHICLES)("%s puts its wheels where the spec does", (kind) => {
    const geometry = blender(kind);
    const position = geometry.getAttribute("position");
    const spec = SPEC[kind];
    for (const [x, z] of spec.wheels) {
      // The tyre's lowest point touches the ground under the wheel centre.
      let low = Infinity;
      for (let i = 0; i < position.count; i++) {
        if (Math.abs(position.getX(i) - x) > 0.15 || Math.abs(position.getZ(i) - z) > 0.08) continue;
        low = Math.min(low, position.getY(i));
      }
      expect(low).toBeLessThan(0.03);
    }
  });

  it.each(VEHICLES)("%s puts a lamp on its light bar for every marker", (kind) => {
    const geometry = blender(kind);
    const position = geometry.getAttribute("position");
    const lights = blenderVehicleLights(kind);
    expect(lights.length).toBeGreaterThanOrEqual(EMERGENCY_LIGHTS[kind].length);
    for (const light of lights) {
      const [x, y, z] = light.position;
      let below = -Infinity;
      let above = Infinity;
      for (let i = 0; i < position.count; i++) {
        // A lens is about a quarter wide: its corners are this far out.
        if (Math.abs(position.getX(i) - x) > 0.2 || Math.abs(position.getZ(i) - z) > 0.15) continue;
        const vy = position.getY(i);
        if (vy <= y) below = Math.max(below, vy);
        else above = Math.min(above, vy);
      }
      // Inside the lens: the bar under it, the lens's top just over it.
      expect(y - below).toBeLessThan(light.radius + 0.1);
      expect(above - y).toBeLessThan(0.1);
      // Near where the procedural vehicle blinks, in its colours.
      const nearest = Math.min(
        ...EMERGENCY_LIGHTS[kind].map((p) => Math.hypot(p.position[0] - x, p.position[1] - y, p.position[2] - z)),
      );
      expect(nearest).toBeLessThan(0.35);
      expect(EMERGENCY_LIGHTS[kind].map((p) => p.color)).toContain(light.color);
    }
  });

  it("hangs the tow truck's boom from the procedural boom's foot and head", () => {
    importedMarker(TOW_TRUCK, "tow.boom.foot").forEach((v, i) => expect(v).toBeCloseTo(TOW_BOOM_FOOT[i], 3));
    importedMarker(TOW_TRUCK, "tow.boom.head").forEach((v, i) => expect(v).toBeCloseTo(TOW_BOOM_HEAD[i], 3));
    const hook = importedMarker(TOW_TRUCK, "tow.hook");
    expect(hook[2]).toBeCloseTo(TOW_BOOM_HEAD[2], 3);
    expect(hook[1]).toBeLessThan(TOW_BOOM_HEAD[1] - 0.5);
  });

  it.each(VEHICLES)("%s merges with colours, occlusion and surfaces in a one-off budget", (kind) => {
    const geometry = blender(kind);
    // One-offs like the fire engine: a dozen incidents at most.
    expect(triangleCount(geometry)).toBeGreaterThan(1500);
    expect(triangleCount(geometry)).toBeLessThan(3500);
    expect(geometry.hasAttribute(SURFACE_ATTRIBUTE)).toBe(true);
    // The paintwork (the part with the most triangles) keeps its colour: the
    // baked occlusion darkens its creases, not the whole panel.
    const paint = blenderVehicleParts(kind, shade).reduce((a, b) =>
      b.geometry.getAttribute("position").count > a.geometry.getAttribute("position").count ? b : a,
    );
    const ao = paint.geometry.getAttribute("color");
    let sum = 0;
    for (let i = 0; i < ao.count; i++) sum += ao.getX(i);
    expect(sum / ao.count).toBeGreaterThan(0.7);
  });
});

describe("the incident scenes with the Blender models", () => {
  const STATES = ["minor", "collision", "stale", "major"] as const;
  let decor: typeof import("./incidentDecor");
  let procedural: typeof import("./incidentDecor");

  beforeAll(async () => {
    procedural = await import("./incidentDecor");
    vi.resetModules();
    vi.doMock("../modelSource", () => ({ BLENDER_MODELS: true }));
    decor = await import("./incidentDecor");
  });

  it("builds every state with the Blender vehicles and props, within a dozen incidents' budget", () => {
    const totals: Record<string, [number, number]> = {};
    for (const state of STATES) {
      const own = triangleCount(decor.incidentDecor(state, 0, 0.2).geometry);
      totals[state] = [triangleCount(procedural.incidentDecor(state, 0, 0.2).geometry), own];
      expect(own).toBeGreaterThan(totals[state][0]);
      // Twelve incidents in the worst state: well under what one Blender
      // district's buildings cost.
      expect(own * 12).toBeLessThan(120000);
    }
    console.log("incident triangles, procedural -> blender:", JSON.stringify(totals));
  });

  it("keeps every lamp where the Blender vehicles' markers put it", async () => {
    const emergency = await import("../vehicles/emergency");
    for (const kind of VEHICLES) {
      expect(emergency.EMERGENCY_LIGHTS[kind]).toEqual(blenderVehicleLights(kind));
    }
    for (const state of STATES) {
      for (const light of decor.incidentDecor(state, 1, 0.2).lights) {
        expect(light.position[1]).toBeGreaterThan(0.8);
        expect(light.position[1]).toBeLessThan(4);
      }
    }
  });

  it("stands the road crew's sign lamp on the sign's lamp", () => {
    importedMarker(INCIDENT_PROPS, "sign.lamp").forEach((v, i) => expect(v).toBeCloseTo([0, 3.3, 0][i], 2));
    expect(decor.SIGN_LAMP_Y - importedMarker(INCIDENT_PROPS, "sign.lamp")[1]).toBeLessThan(0.05);
  });

  it("parks the vehicles and lays the clutter out exactly as the procedural scene does", () => {
    for (const state of STATES) {
      for (const variant of [0, 1]) {
        expect(decor.incidentLayout(state, variant)).toEqual(procedural.incidentLayout(state, variant));
      }
    }
  });
});

describe("the Blender tower crane (spike)", () => {
  const bounds = (geometry: BufferGeometry) =>
    new Box3().setFromBufferAttribute(geometry.getAttribute("position") as never);

  it("stands its mast on the procedural base, up to the jib's ring", async () => {
    const { blenderCraneGeometry, craneMastGeometry } = await import("./constructionDecor");
    const own = bounds(blenderCraneGeometry("CraneMast", "active", 0.2));
    const procedural = bounds(craneMastGeometry("active", 0.2));
    expect(Math.abs(own.min.y)).toBeLessThan(0.02);
    // The ring's seat meets the jib, which `ConstructionSite.tsx` lifts to 12.6.
    expect(own.max.y).toBeCloseTo(12.6, 1);
    expect(Math.abs(own.max.x - procedural.max.x)).toBeLessThan(0.05);
    expect(Math.abs(own.min.z - procedural.min.z)).toBeLessThan(0.05);
  });

  it("turns its jib about the ring and hangs the hook where the procedural one hangs", async () => {
    const { blenderCraneGeometry, craneJibGeometry } = await import("./constructionDecor");
    const own = bounds(blenderCraneGeometry("CraneJib", "active", 0.2));
    const procedural = bounds(craneJibGeometry("active", 0.2));
    importedMarker(CRANE, "crane.hook").forEach((v, i) => expect(v).toBeCloseTo([5.4, -3, 0][i], 3));
    // Reach and counter-jib within a few tenths of the procedural jib's.
    expect(Math.abs(own.max.x - procedural.max.x)).toBeLessThan(0.4);
    expect(Math.abs(own.min.x - procedural.min.x)).toBeLessThan(0.5);
    expect(own.min.y).toBeLessThan(-3.2);
  });

  it("paints the steel rust on an abandoned site", async () => {
    const { blenderCraneGeometry } = await import("./constructionDecor");
    const mean = (geometry: BufferGeometry) => {
      const color = geometry.getAttribute("color");
      let r = 0;
      let b = 0;
      for (let i = 0; i < color.count; i++) {
        r += color.getX(i);
        b += color.getZ(i);
      }
      return [r / color.count, b / color.count];
    };
    const [activeR, activeB] = mean(blenderCraneGeometry("CraneMast", "active", 0.2));
    const [rustR, rustB] = mean(blenderCraneGeometry("CraneMast", "abandoned", 0.2));
    expect(activeR / activeB).not.toBeCloseTo(rustR / rustB, 1);
  });

  it("costs what a crane on each of eight sites can afford", async () => {
    const { blenderCraneGeometry } = await import("./constructionDecor");
    const mast = triangleCount(blenderCraneGeometry("CraneMast", "active", 0.2));
    const jib = triangleCount(blenderCraneGeometry("CraneJib", "active", 0.2));
    // Past the procedural 160 each (a lattice is struts), but eight whole
    // cranes stay under 15k triangles.
    expect(mast).toBeLessThan(800);
    expect(jib).toBeLessThan(1200);
    expect((mast + jib) * 8).toBeLessThan(15000);
  });
});
