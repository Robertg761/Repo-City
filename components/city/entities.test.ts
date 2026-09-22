import { describe, expect, it } from "vitest";
import {
  CLICK_SLOP,
  INSPECT_POLAR,
  MAX_DISTANCE,
  MIN_DISTANCE,
  REFERENCE_ASPECT,
  STREET_POLAR,
  aspectWiden,
  cameraBoundary,
  districtCenter,
  focusTargetFor,
  inspectionFraming,
  isDragRelease,
  maxCameraDistance,
  orbitFraming,
  overviewFraming,
  viewAngles,
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

describe("narrow viewports", () => {
  it("leaves a desktop-shaped canvas exactly where it was", () => {
    expect(aspectWiden(REFERENCE_ASPECT)).toBe(1);
    expect(aspectWiden(16 / 9)).toBe(1);
    expect(overviewFraming(128, 16 / 9)).toEqual(overviewFraming(128));
  });

  it("frames from further back on a phone held upright, inside the cap", () => {
    const phone = overviewFraming(128, 430 / 900);
    const desktop = overviewFraming(128);
    const back = distance(phone.position, phone.target);
    expect(back).toBeGreaterThan(distance(desktop.position, desktop.target));
    expect(back).toBeLessThanOrEqual(maxCameraDistance(128, 430 / 900));
    expect(aspectWiden(430 / 900)).toBeLessThanOrEqual(2.1);
  });

  it("survives a degenerate aspect rather than flying off", () => {
    expect(aspectWiden(0)).toBe(1);
    expect(aspectWiden(Number.NaN)).toBe(1);
  });
});

describe("clicks and drags", () => {
  it("treats a still or nearly still release as a click", () => {
    expect(isDragRelease(0)).toBe(false);
    expect(isDragRelease(CLICK_SLOP.mouse, "mouse")).toBe(false);
    expect(isDragRelease(CLICK_SLOP.touch, "touch")).toBe(false);
  });

  it("treats a release that travelled past the slop as a drag", () => {
    expect(isDragRelease(CLICK_SLOP.mouse + 1, "mouse")).toBe(true);
    expect(isDragRelease(40)).toBe(true);
    expect(isDragRelease(CLICK_SLOP.touch + 1, "touch")).toBe(true);
  });

  it("gives a finger more room to wobble than a mouse", () => {
    const wobble = CLICK_SLOP.mouse + 2;
    expect(isDragRelease(wobble, "mouse")).toBe(true);
    expect(isDragRelease(wobble, "touch")).toBe(false);
    expect(isDragRelease(wobble, "pen")).toBe(false);
    // Safari's click is a plain MouseEvent with no pointer type.
    expect(isDragRelease(wobble, undefined)).toBe(true);
  });
});

describe("view-preserving focus", () => {
  const building = focusTargetFor(devCity, devCity.buildings[0].id)!;
  const incident = focusTargetFor(devCity, devCity.incidents[0].id)!;

  it("round-trips orbit angles", () => {
    const angles = { azimuth: -2.1, polar: 0.9 };
    const f = orbitFraming([4, 2, -7], angles, 40);
    const back = viewAngles(f.position, f.target);
    expect(back.azimuth).toBeCloseTo(angles.azimuth, 10);
    expect(back.polar).toBeCloseTo(angles.polar, 10);
    expect(distance(f.position, f.target)).toBeCloseTo(40, 10);
  });

  it("reads the default corner as a bearing of PI / 4", () => {
    const overview = overviewFraming(128);
    expect(viewAngles(overview.position, overview.target).azimuth).toBeCloseTo(Math.PI / 4, 10);
  });

  it("keeps the compass bearing the user is looking from", () => {
    for (const azimuth of [-3, -Math.PI / 2, 0, 1, 2.9]) {
      const f = inspectionFraming(building, { azimuth, polar: 1 });
      expect(viewAngles(f.position, f.target).azimuth).toBeCloseTo(azimuth, 10);
      expect(f.target).toEqual(building.lookAt);
    }
  });

  it("keeps the user's tilt inside the band and moves it to the edge outside", () => {
    const tilt = (polar: number, focus = building) => {
      const f = inspectionFraming(focus, { azimuth: 0.3, polar });
      return viewAngles(f.position, f.target).polar;
    };
    expect(tilt(1)).toBeCloseTo(1, 10);
    // The overview's 0.75 dips to the edge of the band so facades show.
    expect(tilt(0.75)).toBeCloseTo(INSPECT_POLAR.min, 10);
    // Skimming the rooftops rises to the other edge.
    expect(tilt(1.5)).toBeCloseTo(INSPECT_POLAR.max, 10);
    // Street objects keep their steeper look down.
    expect(tilt(1, incident)).toBeCloseTo(STREET_POLAR.max, 10);
    expect(tilt(0.5, incident)).toBeCloseTo(0.5, 10);
  });

  it("stands at the same distance whichever way it approaches", () => {
    const fixed = inspectionFraming(building);
    const kept = inspectionFraming(building, { azimuth: -2, polar: 1.1 });
    expect(distance(kept.position, kept.target)).toBeCloseTo(
      distance(fixed.position, fixed.target),
      10,
    );
  });

  it("falls back to the default corner without a usable view", () => {
    const fixed = inspectionFraming(building);
    expect(inspectionFraming(building, { azimuth: Number.NaN, polar: 1 })).toEqual(fixed);
    expect(viewAngles(fixed.position, fixed.target).azimuth).toBeCloseTo(Math.PI / 4, 10);
  });

  it("never puts the camera below its target", () => {
    for (const polar of [0, 0.5, 1.2, 1.57, 3]) {
      const f = inspectionFraming(building, { azimuth: 1, polar });
      expect(f.position[1]).toBeGreaterThan(f.target[1]);
    }
  });
});

describe("cameraBoundary", () => {
  it("holds the overview target and every focus target of the dev city", () => {
    const [min, max] = cameraBoundary(devCity.bounds.size);
    const inside = (p: Vec3) => p.every((v, i) => v >= min[i] && v <= max[i]);
    expect(inside(overviewFraming(devCity.bounds.size).target)).toBe(true);
    const ids = [
      ...devCity.buildings.map((b) => b.id),
      ...devCity.districts.map((d) => d.id),
      ...devCity.landmarks.map((l) => l.id),
      ...devCity.incidents.map((i) => i.id),
      ...devCity.constructionSites.map((c) => c.id),
    ];
    for (const id of ids) expect(inside(focusTargetFor(devCity, id)!.lookAt)).toBe(true);
  });

  it("clears the aim point of the tallest possible building", () => {
    // Heights top out at 23 units (types/city.ts), aimed at 55% of that.
    expect(cameraBoundary(100)[1][1]).toBeGreaterThanOrEqual(23 * 0.55);
  });

  it("keeps the target on or above the ground", () => {
    expect(cameraBoundary(200)[0][1]).toBe(0);
  });
});
