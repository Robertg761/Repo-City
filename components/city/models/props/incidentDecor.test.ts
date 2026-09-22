import { describe, expect, it } from "vitest";
import { incidentDecor, variantFor } from "./incidentDecor";
import { constructionDecor, craneJibGeometry, craneMastGeometry } from "./constructionDecor";
import { triangleCount } from "./geometry";
import { emergencyGeometry } from "../vehicles/emergency";
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

describe("emergency vehicles", () => {
  it("merges each vehicle into one cached geometry", () => {
    for (const kind of ["police", "ambulance", "fire", "tow", "works"] as const) {
      const geometry = emergencyGeometry(kind, 0.2);
      expect(emergencyGeometry(kind, 0.2)).toBe(geometry);
      expect(triangleCount(geometry)).toBeLessThan(700);
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
