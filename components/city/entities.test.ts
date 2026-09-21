import { describe, expect, it } from "vitest";
import {
  MAX_DISTANCE,
  MIN_DISTANCE,
  districtCenter,
  focusTargetFor,
  inspectionFraming,
  maxCameraDistance,
  overviewFraming,
} from "./entities";
import { splitBuildings } from "./instances";
import { roadGraph } from "./traffic";
import { devCity } from "@/fixtures/dev.city";
import type { ConstructionState, IncidentState } from "@/types/analysis";
import type { Vec3 } from "@/types/city";

const distance = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

describe("districtCenter", () => {
  it("treats rect as centre plus extent", () => {
    expect(districtCenter({ x: -35, z: -35, w: 46, d: 46 })).toEqual([-35, 0, -35]);
  });
});

describe("focusTargetFor", () => {
  it("finds every kind of selectable entity in the model", () => {
    const ids = [
      devCity.buildings[0].id,
      devCity.districts[0].id,
      devCity.landmarks[0].id,
      devCity.incidents[0].id,
      devCity.constructionSites[0].id,
    ];
    const kinds = ids.map((id) => focusTargetFor(devCity, id)?.kind);
    expect(kinds).toEqual(["building", "district", "landmark", "incident", "construction"]);
  });

  it("aims above the base of a building, not at its feet", () => {
    const building = devCity.buildings[0];
    const focus = focusTargetFor(devCity, building.id);
    expect(focus?.lookAt[1]).toBeGreaterThan(building.position[1]);
    expect(focus?.lookAt[1]).toBeLessThan(building.position[1] + building.size[1]);
  });

  it("returns null for an unknown id", () => {
    expect(focusTargetFor(devCity, "nope")).toBeNull();
  });
});

describe("framing", () => {
  it("keeps the overview inside the camera distance limits", () => {
    for (const size of [20, 128, 400]) {
      const f = overviewFraming(size);
      const d = distance(f.position, f.target);
      expect(d).toBeGreaterThanOrEqual(MIN_DISTANCE);
      expect(d).toBeLessThanOrEqual(maxCameraDistance(size));
      expect(f.position[1]).toBeGreaterThan(f.target[1]);
    }
  });

  it("never lets the zoom-out cap fall below the placeholder's 160 units", () => {
    expect(maxCameraDistance(10)).toBe(MAX_DISTANCE);
    expect(maxCameraDistance(128)).toBeGreaterThan(MAX_DISTANCE);
    expect(maxCameraDistance(400)).toBeGreaterThan(maxCameraDistance(128));
  });

  it("looks down at roughly 45 to 55 degrees by default", () => {
    const f = overviewFraming(128);
    const horizontal = Math.hypot(f.position[0] - f.target[0], f.position[2] - f.target[2]);
    const degrees = (Math.atan2(f.position[1] - f.target[1], horizontal) * 180) / Math.PI;
    expect(degrees).toBeGreaterThan(43);
    expect(degrees).toBeLessThan(56);
  });

  it("frames bigger cities from further away", () => {
    const small = overviewFraming(60);
    const big = overviewFraming(200);
    expect(distance(big.position, big.target)).toBeGreaterThan(distance(small.position, small.target));
  });

  it("keeps every inspection shot inside the camera limits", () => {
    const ids = [
      ...devCity.buildings.map((b) => b.id),
      ...devCity.districts.map((d) => d.id),
      ...devCity.landmarks.map((l) => l.id),
      ...devCity.incidents.map((i) => i.id),
      ...devCity.constructionSites.map((c) => c.id),
    ];
    for (const id of ids) {
      const focus = focusTargetFor(devCity, id);
      expect(focus).not.toBeNull();
      const f = inspectionFraming(focus!);
      const d = distance(f.position, f.target);
      expect(d).toBeGreaterThanOrEqual(MIN_DISTANCE);
      expect(d).toBeLessThanOrEqual(MAX_DISTANCE);
    }
  });

  it("stands closer to an incident than to a whole district", () => {
    const incident = inspectionFraming(focusTargetFor(devCity, devCity.incidents[0].id)!);
    const district = inspectionFraming(focusTargetFor(devCity, devCity.districts[0].id)!);
    expect(distance(incident.position, incident.target)).toBeLessThan(
      distance(district.position, district.target),
    );
  });
});

describe("the dev fixture", () => {
  it("covers the ranges the renderer is built for", () => {
    expect(devCity.districts).toHaveLength(4);
    expect(devCity.buildings.length).toBeGreaterThanOrEqual(55);
    expect(devCity.buildings.length).toBeLessThanOrEqual(70);
    // Five landmark types, plus the row of power stations that carries the
    // CI states the main plant does not show.
    expect(devCity.landmarks).toHaveLength(9);
    expect(devCity.vehicles.count).toBe(12);
  });

  it("covers every incident and construction state", () => {
    const incidents = new Set<IncidentState>(devCity.incidents.map((i) => i.state));
    expect([...incidents].sort()).toEqual(["collision", "major", "minor", "stale"]);
    const sites = new Set<ConstructionState>(devCity.constructionSites.map((c) => c.state));
    expect([...sites].sort()).toEqual(["abandoned", "active", "completed", "slow"]);
  });

  it("covers every landmark type", () => {
    expect([...new Set(devCity.landmarks.map((l) => l.landmarkType))].sort()).toEqual([
      "civic",
      "fire",
      "info",
      "power",
      "station",
    ]);
  });

  it("covers every CI state the power station can be in", () => {
    const states = devCity.landmarks
      .filter((l) => l.landmarkType === "power")
      .map((l) => l.state)
      .sort();
    expect(states).toEqual(["failing", "healthy", "none", "recent-failure", "unknown"]);
  });

  it("has landmark-file buildings for the civic look", () => {
    const { civic } = splitBuildings(devCity.buildings);
    expect(civic.map((b) => b.plan.landmark).sort()).toEqual([
      "contributing",
      "dockerfile",
      "manifest",
      "readme",
    ]);
  });

  it("keeps everything inside the city bounds", () => {
    const half = devCity.bounds.size / 2;
    const points: Vec3[] = [
      ...devCity.buildings.map((b) => b.position),
      ...devCity.incidents.map((i) => i.position),
      ...devCity.constructionSites.map((c) => c.position),
      ...devCity.landmarks.map((l) => l.position),
      ...devCity.props.trees,
      ...devCity.props.lamps,
    ];
    for (const [x, , z] of points) {
      expect(Math.abs(x)).toBeLessThanOrEqual(half);
      expect(Math.abs(z)).toBeLessThanOrEqual(half);
    }
  });

  it("sits every building on the ground plane", () => {
    for (const b of devCity.buildings) {
      expect(b.position[1]).toBe(0);
      expect(b.size[1]).toBeGreaterThan(2);
      expect(b.size[1]).toBeLessThan(20);
    }
  });

  it("assigns every building to a district that claims it back", () => {
    for (const district of devCity.districts) {
      expect(district.buildingIds.length).toBeGreaterThan(0);
      for (const id of district.buildingIds) {
        expect(devCity.buildings.find((b) => b.id === id)?.districtId).toBe(district.id);
      }
    }
  });

  it("builds a fully connected road network for traffic", () => {
    const graph = roadGraph(devCity.roads);
    expect(devCity.roads.length).toBeGreaterThan(20);
    graph.nodeKeys.forEach(([from, to], i) => {
      expect((graph.byNode.get(from) ?? []).some((j) => j !== i)).toBe(true);
      expect((graph.byNode.get(to) ?? []).some((j) => j !== i)).toBe(true);
    });
  });

  it("reveals in the order of PLAN.md section 43", () => {
    const maxBuilding = Math.max(...devCity.buildings.map((b) => b.appearAt));
    const minLandmark = Math.min(...devCity.landmarks.map((l) => l.appearAt));
    const minIncident = Math.min(...devCity.incidents.map((i) => i.appearAt));
    const minSite = Math.min(...devCity.constructionSites.map((c) => c.appearAt));
    expect(maxBuilding).toBeLessThan(minLandmark);
    expect(Math.max(...devCity.landmarks.map((l) => l.appearAt))).toBeLessThan(minIncident);
    expect(Math.max(...devCity.incidents.map((i) => i.appearAt))).toBeLessThan(minSite);
    // Section 43: the whole reveal lands in two to four seconds.
    expect(Math.max(...devCity.constructionSites.map((c) => c.appearAt))).toBeLessThan(3400);
  });
});
