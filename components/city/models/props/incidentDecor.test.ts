import { describe, expect, it } from "vitest";
import {
  FIRE_AT,
  frames,
  glowFalloff,
  glowTexture,
  incidentDecor,
  incidentLayout,
  variantFor,
} from "./incidentDecor";
import { constructionDecor, craneJibGeometry, craneMastGeometry } from "./constructionDecor";
import { triangleCount } from "./geometry";
import {
  EMERGENCY_KINDS,
  EMERGENCY_LIGHTS,
  emergencyGeometry,
  ladderTip,
  type EmergencyKind,
} from "../vehicles/emergency";
import type { ConstructionState, IncidentState } from "@/types/analysis";

const INCIDENTS: IncidentState[] = ["minor", "collision", "stale", "major"];
const SITES: ConstructionState[] = ["active", "slow", "abandoned", "completed"];

describe("incident decor", () => {
  it("builds every state and caches it per state, variant and tone", () => {
    for (const state of INCIDENTS) {
      const decor = incidentDecor(state, 0, 0.2);
      expect(decor.geometry.getAttribute("color")).toBeDefined();
      expect(incidentDecor(state, 0, 0.2).geometry).toBe(decor.geometry);
      expect(incidentDecor(state, 1, 0.2).geometry).not.toBe(decor.geometry);
    }
  });

  it("gives the states that need blinking lights some", () => {
    // Nothing is happening at a stale wreck except the barricade blinkers, so
    // every state still has something that moves except the ground ring.
    for (const state of INCIDENTS) {
      expect(incidentDecor(state, 0, 0.2).lights.length).toBeGreaterThan(0);
    }
  });

  it("keeps the lights out of the ground and the air", () => {
    for (const state of INCIDENTS) {
      for (const light of incidentDecor(state, 0, 0.2).lights) {
        expect(light.position[1]).toBeGreaterThan(0.8);
        expect(light.position[1]).toBeLessThan(4);
      }
    }
  });

  it("stays inside a sane triangle budget for twelve incidents", () => {
    const worst = Math.max(
      ...INCIDENTS.map((state) => triangleCount(incidentDecor(state, 0, 0.2).geometry)),
    );
    expect(worst).toBeLessThan(2600);
    // Section 11 caps visible incidents at twelve.
    expect(worst * 12).toBeLessThan(32000);
  });

  it("picks a stable variant from the incident id", () => {
    expect(variantFor("incident-482")).toBe(variantFor("incident-482"));
    expect([0, 1]).toContain(variantFor("incident-9"));
  });
});

/**
 * A vehicle's footprint on the ground, in its own frame: the extent of every
 * vertex below a cab roof, so a fire engine's ladder or a tow truck's boom
 * reaching out overhead does not count as standing on something.
 */
function footprint(kind: EmergencyKind) {
  const position = emergencyGeometry(kind, 0).getAttribute("position");
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < position.count; i++) {
    if (position.getY(i) > 1.5) continue;
    minX = Math.min(minX, position.getX(i));
    maxX = Math.max(maxX, position.getX(i));
    minZ = Math.min(minZ, position.getZ(i));
    maxZ = Math.max(maxZ, position.getZ(i));
  }
  return { minX, maxX, minZ, maxZ };
}

const TRUCKS: EmergencyKind[] = ["fire", "tow", "works"];

describe("emergency vehicles", () => {
  it("merges each vehicle into one cached geometry", () => {
    for (const kind of EMERGENCY_KINDS) {
      const geometry = emergencyGeometry(kind, 0.2);
      expect(emergencyGeometry(kind, 0.2)).toBe(geometry);
      expect(triangleCount(geometry)).toBeLessThan(700);
    }
  });

  it("keeps the trucks near a bus's triangle budget", () => {
    // A bus with its lamps and wheels is about 490 triangles. A fire engine
    // carries a ladder on top of that; nothing may cost much more.
    for (const kind of TRUCKS) {
      expect(triangleCount(emergencyGeometry(kind, 0.2))).toBeLessThan(560);
    }
    expect(triangleCount(emergencyGeometry("tow", 0.2))).toBeLessThan(520);
    expect(triangleCount(emergencyGeometry("works", 0.2))).toBeLessThan(520);
  });

  it("stands every vehicle on its wheels, and keeps the trucks truck-sized", () => {
    for (const kind of EMERGENCY_KINDS) {
      const geometry = emergencyGeometry(kind, 0.2);
      geometry.computeBoundingBox();
      const box = geometry.boundingBox!;
      expect(box.min.y).toBeGreaterThanOrEqual(-0.001);
      expect(box.min.y).toBeLessThan(0.03);
      const { minX, maxX, minZ, maxZ } = footprint(kind);
      expect(maxX - minX).toBeLessThanOrEqual(1.4);
      expect(maxZ - minZ).toBeLessThan(5.3);
    }
    // The fire engine is the biggest thing that turns up; the others are
    // longer than a car.
    const length = (kind: EmergencyKind) => footprint(kind).maxZ - footprint(kind).minZ;
    expect(length("fire")).toBeGreaterThan(Math.max(length("tow"), length("works")));
    for (const kind of TRUCKS) expect(length(kind)).toBeGreaterThan(length("police"));
  });

  it("puts every light bar on its vehicle's roof", () => {
    for (const kind of EMERGENCY_KINDS) {
      const geometry = emergencyGeometry(kind, 0.2);
      const position = geometry.getAttribute("position");
      const { minX, maxX, minZ, maxZ } = footprint(kind);
      for (const light of EMERGENCY_LIGHTS[kind]) {
        const [x, y, z] = light.position;
        expect(x).toBeGreaterThan(minX);
        expect(x).toBeLessThan(maxX);
        expect(z).toBeGreaterThan(minZ);
        expect(z).toBeLessThan(maxZ);
        // Something of the vehicle stands directly under the lamp, within a
        // lamp's radius: it sits on the bar, not in the air above the cab.
        let below = -Infinity;
        for (let i = 0; i < position.count; i++) {
          if (Math.abs(position.getX(i) - x) > 0.6 || Math.abs(position.getZ(i) - z) > 0.3) continue;
          if (position.getY(i) <= y) below = Math.max(below, position.getY(i));
        }
        expect(y - below).toBeLessThan(light.radius + 0.1);
      }
    }
  });
});

describe("fire glow", () => {
  it("fades from a bright centre to nothing at the rim, with no edge", () => {
    const size = 32;
    const data = glowFalloff(size);
    expect(data).toHaveLength(size * size * 4);
    const alpha = (x: number, y: number) => data[(y * size + x) * 4 + 3];
    const mid = size / 2;
    expect(alpha(mid, mid)).toBeGreaterThan(230);
    // The corners and the middle of every edge are dark: a square quad never
    // shows its outline.
    for (const [x, y] of [
      [0, 0],
      [size - 1, 0],
      [0, size - 1],
      [size - 1, size - 1],
      [mid, 0],
      [0, mid],
    ]) {
      expect(alpha(x, y)).toBeLessThan(3);
    }
    // Monotonic along a radius.
    for (let x = mid; x < size - 1; x++) expect(alpha(x + 1, mid)).toBeLessThanOrEqual(alpha(x, mid));
    // White: the colour comes from the material.
    expect(data[(mid * size + mid) * 4]).toBe(255);
  });

  it("builds the texture once and shares it", () => {
    expect(glowTexture()).toBe(glowTexture());
  });
});

describe("incident layout", () => {
  const VARIANTS = [0, 1];

  it("parks every vehicle clear of the cones, crews, barricades and wrecks", () => {
    for (const state of INCIDENTS) {
      for (const variant of VARIANTS) {
        const { vehicles, clutter } = incidentLayout(state, variant);
        for (const vehicle of vehicles) {
          const { minX, maxX, minZ, maxZ } = footprint(vehicle.kind);
          for (const item of clutter) {
            const [x, z] = frames.toVehicle(vehicle.place, item.x, item.z);
            const dx = Math.max(minX - x, 0, x - maxX);
            const dz = Math.max(minZ - z, 0, z - maxZ);
            const gap = Math.hypot(dx, dz) - item.radius;
            expect(
              gap,
              `${state}/${variant}: ${vehicle.kind} against a ${item.what} at ${item.x.toFixed(2)}, ${item.z.toFixed(2)}`,
            ).toBeGreaterThan(0.1);
          }
        }
      }
    }
  });

  it("parks every vehicle in a lane of the narrowest road, on the ground", () => {
    // A minor road is 4.5 wide and the incident sits on its centreline.
    for (const state of INCIDENTS) {
      for (const variant of VARIANTS) {
        for (const vehicle of incidentLayout(state, variant).vehicles) {
          expect(vehicle.place.position[1]).toBe(0);
          const { minX, maxX, minZ, maxZ } = footprint(vehicle.kind);
          for (const [cx, cz] of [
            [minX, minZ],
            [minX, maxZ],
            [maxX, minZ],
            [maxX, maxZ],
          ]) {
            const [x] = frames.toIncident(vehicle.place, cx, cz);
            expect(Math.abs(x), `${state}/${variant}: ${vehicle.kind}`).toBeLessThanOrEqual(2.25);
          }
        }
      }
    }
  });

  it("raises the fire engine's ladder into the smoke over the fire", () => {
    for (const variant of VARIANTS) {
      const engine = incidentLayout("major", variant).vehicles.find((v) => v.kind === "fire");
      expect(engine).toBeDefined();
      const [tx, ty, tz] = ladderTip(engine!.ladderYaw);
      const [x, z] = frames.toIncident(engine!.place, tx, tz);
      // Over the flames (they reach about three units up) and within a couple
      // of units of the column's axis, where the smoke is.
      expect(Math.hypot(x - FIRE_AT[0], z - FIRE_AT[1])).toBeLessThan(2);
      expect(ty).toBeGreaterThan(4.5);
      // The engine itself is parked outside the cordon, well back from it.
      expect(Math.hypot(engine!.place.position[0], engine!.place.position[2])).toBeGreaterThan(5);
    }
  });
});

describe("construction decor", () => {
  it("builds every state and caches it per state and tone", () => {
    for (const state of SITES) {
      const geometry = constructionDecor(state, 0.2);
      expect(geometry.getAttribute("color")).toBeDefined();
      expect(constructionDecor(state, 0.2)).toBe(geometry);
    }
  });

  it("gives an active site more to look at than a stalled one", () => {
    expect(triangleCount(constructionDecor("active", 0.2))).toBeGreaterThan(
      triangleCount(constructionDecor("slow", 0.2)),
    );
    expect(triangleCount(constructionDecor("completed", 0.2))).toBeLessThan(
      triangleCount(constructionDecor("active", 0.2)),
    );
  });

  it("stays inside a sane triangle budget for eight sites", () => {
    const worst = Math.max(...SITES.map((state) => triangleCount(constructionDecor(state, 0.2))));
    expect(worst).toBeLessThan(3200);
    // Section 13 caps prominent sites at eight.
    expect(worst * 8).toBeLessThan(26000);
  });

  it("merges the crane into a tower and a jib", () => {
    for (const state of SITES) {
      expect(triangleCount(craneMastGeometry(state, 0.2))).toBeLessThan(160);
      expect(triangleCount(craneJibGeometry(state, 0.2))).toBeLessThan(160);
    }
  });
});
