/**
 * The landmarks' near level (`blender/landmarks/*_near.py`, `near.ts`): the
 * lean model with far more drawn on it. Each near model must be the lean one
 * and more, not a different one: the same footprint and frame, the same
 * colour slots (the renderer paints them from the city palette), the same
 * markers, inside the hero-piece triangle budget, and free of faces that
 * would fight in the depth buffer. The tests call the `blender...Near`
 * builders directly: `BLENDER_MODELS` is false in node.
 */
import { describe, expect, it } from "vitest";
import type { BufferGeometry } from "three";
import { NATURAL_LANDMARK_SIZE } from "@/lib/city/layout";
import { SURFACE_ATTRIBUTE } from "../../textures/surface-types";
import { coplanarOverlaps } from "../coplanar";
import { extentOf, triangleCount, type Slots } from "./assembly";
import { blenderFire } from "./fire";
import { blenderInfo } from "./info";
import {
  blenderChapelNear,
  blenderFireNear,
  blenderHaltNear,
  blenderInfoNear,
  blenderPowerNear,
  blenderStationNear,
  blenderSubstationNear,
  blenderTownHallNear,
  blenderTrainNear,
  blenderVillageFireNear,
} from "./near";
import { POWER_ANCHORS, blenderPower } from "./power";
import { CONTACT_WIRE_Y, PORTAL_X, TRACK_A, blenderStation, blenderTrain } from "./station";
import { blenderTownHall } from "./townhall";
import {
  VILLAGE_NATURAL_SIZE,
  blenderChapel,
  blenderHalt,
  blenderSubstation,
  blenderVillageFire,
} from "./village";

/** The most a hero piece may draw, and the fewest that counts as detailed (its top level). */
const MAX = 60_000;
const DETAILED = 30_000;

const geometries = (slots: Slots<string>): BufferGeometry[] => Object.values(slots).filter((g): g is BufferGeometry => !!g);

function bounds(slots: Slots<string>): { min: number[]; max: number[] } {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const g of geometries(slots)) {
    g.computeBoundingBox();
    const b = g.boundingBox!;
    [b.min.x, b.min.y, b.min.z].forEach((v, i) => (min[i] = Math.min(min[i], v)));
    [b.max.x, b.max.y, b.max.z].forEach((v, i) => (max[i] = Math.max(max[i], v)));
  }
  return { min, max };
}

/** Vertices, over every slot, within `radius` of a point. */
function near(slots: Slots<string>, at: readonly number[], radius: number): number {
  let count = 0;
  for (const g of geometries(slots)) {
    const p = g.getAttribute("position");
    for (let i = 0; i < p.count; i++) {
      if (Math.hypot(p.getX(i) - at[0], p.getY(i) - at[1], p.getZ(i) - at[2]) <= radius) count++;
    }
  }
  return count;
}

const close = (a: readonly number[], b: readonly number[], eps = 0.05) => a.every((v, i) => Math.abs(v - b[i]) < eps);

interface Landmark {
  name: string;
  slots: Slots<string>;
  lean: Slots<string>;
  /** The plot the renderer scales by: nothing may pass it. */
  natural: readonly number[];
  /** The colour slots the renderer's component for it paints. */
  allowed: readonly string[];
  /** The fewest triangles it may have: the top level of a landmark is a hero piece. */
  min: number;
}

const FIRE = ["deck", "wall", "red", "trim", "steel", "metal", "dark", "green", "blue", "glass"];
const INFO = ["deck", "wall", "roof", "green", "sign", "glass"];
const POWER = ["deck", "hull", "steel", "hazard", "glass", "cold"];
const STATION = ["deck", "wall", "roof", "steel", "accent", "dark", "glass"];
const CIVIC = ["stone", "wall", "accent", "metal", "glass"];
const CHAPEL = ["stone", "roof", "trim", "wood", "green", "metal", "glass"];
const VFIRE = ["deck", "wall", "red", "trim", "roof", "steel", "glass"];
const HALT = ["deck", "wall", "roof", "steel", "accent", "dark", "wood", "glass"];
const SUBSTATION = ["deck", "hull", "steel", "hazard", "dark", "wood", "glass"];


function landmarks(): Landmark[] {
  const out: Landmark[] = [
    { name: "town hall", slots: blenderTownHallNear().slots, lean: blenderTownHall().slots, natural: NATURAL_LANDMARK_SIZE.civic, allowed: CIVIC, min: DETAILED },
    { name: "chapel", slots: blenderChapelNear().slots, lean: blenderChapel().slots, natural: VILLAGE_NATURAL_SIZE.civic, allowed: CHAPEL, min: DETAILED },
    { name: "substation", slots: blenderSubstationNear().slots, lean: blenderSubstation().slots, natural: VILLAGE_NATURAL_SIZE.power, allowed: SUBSTATION, min: DETAILED },
  ];
  for (const level of [1, 2, 3]) {
    out.push({ name: `fire station ${level}`, slots: blenderFireNear(level).slots, lean: blenderFire(level).slots, natural: NATURAL_LANDMARK_SIZE.fire, allowed: FIRE, min: level === 3 ? DETAILED : 15_000 });
    out.push({ name: `information centre ${level}`, slots: blenderInfoNear(level).slots, lean: blenderInfo(level).slots, natural: NATURAL_LANDMARK_SIZE.info, allowed: INFO, min: level === 3 ? DETAILED : 12_000 });
    out.push({ name: `transit station ${level}`, slots: blenderStationNear(level).slots, lean: blenderStation(level).slots, natural: NATURAL_LANDMARK_SIZE.station, allowed: STATION, min: DETAILED });
  }
  for (const mode of ["full", "failing", "bare"] as const) {
    out.push({ name: `power ${mode}`, slots: blenderPowerNear(mode), lean: blenderPower(mode), natural: NATURAL_LANDMARK_SIZE.power, allowed: POWER, min: mode === "bare" ? 20_000 : DETAILED });
  }
  for (const level of [1, 2]) {
    out.push({ name: `village fire station ${level}`, slots: blenderVillageFireNear(level).slots, lean: blenderVillageFire(level).slots, natural: VILLAGE_NATURAL_SIZE.fire, allowed: VFIRE, min: level === 2 ? 25_000 : 20_000 });
    out.push({ name: `halt ${level}`, slots: blenderHaltNear(level).slots, lean: blenderHalt(level).slots, natural: VILLAGE_NATURAL_SIZE.station, allowed: HALT, min: level === 2 ? DETAILED : 20_000 });
  }
  return out;
}

describe("the near landmarks", () => {
  const all = landmarks();

  it("draw a hero piece's budget: far more than the lean model, never past 60,000", () => {
    for (const l of all) {
      const tris = triangleCount(l.slots);
      expect(tris, l.name).toBeLessThanOrEqual(MAX);
      expect(tris, l.name).toBeGreaterThanOrEqual(l.min);
      expect(tris, l.name).toBeGreaterThan(triangleCount(l.lean) * 2);
    }
  });

  it("stand in the lean model's footprint and frame, inside its natural plot", () => {
    for (const l of all) {
      const [w, h, d] = extentOf(l.slots);
      const [lw, lh, ld] = extentOf(l.lean);
      // Refined, not resized: the outline may gain a rail or a slate, not a room.
      expect(Math.abs(w - lw), l.name).toBeLessThan(0.7);
      expect(Math.abs(d - ld), l.name).toBeLessThan(0.7);
      expect(Math.abs(h - lh), l.name).toBeLessThan(1.5);
      // (Nothing may pass its plot by more than a hand: the renderer scales by the natural size.)
      expect(w, l.name).toBeLessThanOrEqual(Math.max(l.natural[0], lw) + 0.1);
      expect(d, l.name).toBeLessThanOrEqual(Math.max(l.natural[2], ld) + 0.1);
      // (The lean fire station's hose tower already stands past its natural height.)
      expect(h, l.name).toBeLessThanOrEqual(Math.max(l.natural[1], lh) + 0.2);
      const a = bounds(l.slots);
      const b = bounds(l.lean);
      for (const i of [0, 2]) expect(Math.abs((a.min[i] + a.max[i]) / 2 - (b.min[i] + b.max[i]) / 2), l.name).toBeLessThan(0.3);
      expect(Math.abs(a.min[1] - b.min[1]), l.name).toBeLessThan(0.05);
    }
  });

  it("paint through the lean model's colour slots, each carrying occlusion and a surface", () => {
    for (const l of all) {
      for (const slot of Object.keys(l.slots)) expect(l.allowed, `${l.name}: ${slot}`).toContain(slot);
      for (const g of geometries(l.slots)) {
        expect(g.hasAttribute("color"), l.name).toBe(true);
        expect(g.hasAttribute(SURFACE_ATTRIBUTE), l.name).toBe(true);
      }
    }
  });

  it("keep the lean state contract: no chimney colour but the cold one when failing, no plant without CI", () => {
    expect(blenderPowerNear("failing").cold).toBeDefined();
    expect(blenderPowerNear("full").cold).toBeUndefined();
    expect(blenderPowerNear("bare").hull).toBeUndefined();
    expect(blenderPowerNear("bare").glass).toBeUndefined();
    expect(triangleCount(blenderPowerNear("failing"))).toBe(triangleCount(blenderPowerNear("full")));
  });
});

describe("the near landmarks' markers and anchors", () => {
  it("hang the town hall's lantern where it is, open for its light", () => {
    const { lantern, slots } = blenderTownHallNear();
    blenderTownHall().lantern.forEach((v, i) => expect(lantern[i]).toBeCloseTo(v, 3));
    expect(near(slots, lantern, 0.42)).toBe(0);
    expect(near(slots, lantern, 1.0)).toBeGreaterThan(0);
  });

  it("park the detailed engines at the lean engine spots, roof lights unmoved", () => {
    for (const level of [1, 2, 3]) {
      const { beacons, slots } = blenderFireNear(level);
      const lean = blenderFire(level).beacons;
      expect(beacons).toHaveLength(lean.length);
      beacons.forEach((b, i) => expect(close(b, lean[i])).toBe(true));
      // The engine's roof light bar stands under its beacon.
      for (const b of beacons) expect(near(slots, [b[0], b[1] - 0.1, b[2]], 0.3)).toBeGreaterThan(0);
    }
    expect(blenderFireNear(2).beacons).toHaveLength(2);
    expect(blenderFireNear(3).beacons).toHaveLength(4);
  });

  it("light the garden's lamps where the lean ones stand", () => {
    for (const level of [1, 2, 3]) {
      const { lamps, slots } = blenderInfoNear(level);
      expect(lamps).toHaveLength(blenderInfo(level).lamps.length);
      lamps.forEach((l, i) => expect(close(l, blenderInfo(level).lamps[i])).toBe(true));
      for (const l of lamps) expect(near(slots, l, 0.3)).toBeGreaterThan(0);
    }
  });

  it("keep the power plant's smoke points, beacon mast and board lamp", () => {
    const slots = blenderPowerNear("full");
    for (const [tx, ty, tz] of [POWER_ANCHORS.towerA, POWER_ANCHORS.towerB]) {
      // Open: nothing over the smoke's origin in the throat.
      expect(near(slots, [tx, ty + 0.3, tz], 0.9)).toBe(0);
    }
    const lamp = POWER_ANCHORS.board;
    for (const mode of ["full", "failing", "bare"] as const) {
      expect(near(blenderPowerNear(mode), lamp, 0.12)).toBe(0);
      expect(near(blenderPowerNear(mode), [lamp[0], lamp[1], lamp[2] - 0.2], 0.6)).toBeGreaterThan(0);
      expect(near(blenderPowerNear(mode), POWER_ANCHORS.switchyard, 2.5)).toBeGreaterThan(0);
    }
    const [cx, cy, cz] = POWER_ANCHORS.chimney;
    let top = -Infinity;
    for (const g of geometries(slots)) {
      const p = g.getAttribute("position");
      for (let i = 0; i < p.count; i++) if (Math.hypot(p.getX(i) - cx, p.getZ(i) - cz) <= 0.9) top = Math.max(top, p.getY(i));
    }
    // The chimney's cap stands at the smoke's origin (a lightning rod rises above it).
    expect(top).toBeGreaterThanOrEqual(cy - 0.1);
  });

  it("keep the station's lamps, second line, rails at 0.5 and the running line clear", () => {
    for (const level of [1, 2, 3]) {
      const { lamps, tracks, slots } = blenderStationNear(level);
      const lean = blenderStation(level);
      expect(tracks).toBe(lean.tracks);
      expect(lamps).toHaveLength(lean.lamps.length);
      lamps.forEach((l, i) => expect(close(l, lean.lamps[i])).toBe(true));
      for (const l of lamps) expect(near(slots, l, 0.3)).toBeGreaterThan(0);
      // The rails the train runs on: their tops at 0.5 on the gauge.
      const p = slots.steel!.getAttribute("position");
      let top = -Infinity;
      for (let i = 0; i < p.count; i++) {
        if (Math.abs(p.getZ(i) - (TRACK_A + 0.72)) < 0.06 && p.getY(i) < 0.9) top = Math.max(top, p.getY(i));
      }
      expect(top).toBeCloseTo(0.5, 2);
    }
    // The train's envelope on track A is empty from the platform to the portal face.
    for (const g of geometries(blenderStationNear(3).slots)) {
      const p = g.getAttribute("position");
      for (let i = 0; i < p.count; i++) {
        const [x, y, z] = [p.getX(i), p.getY(i), p.getZ(i)];
        const inside = Math.abs(z - TRACK_A) < 0.95 && y > 0.56 && y < 2.9 && x > -5.9 && x < PORTAL_X - 0.05;
        expect(inside).toBe(false);
      }
    }
    expect(near(blenderStationNear(3).slots, [PORTAL_X + 0.03, 1.6, TRACK_A], 1.8)).toBeGreaterThan(0);
  });

  it("keep the village's lamps, beacons and anchors", () => {
    expect(close(blenderChapelNear().lamp, blenderChapel().lamp)).toBe(true);
    expect(near(blenderChapelNear().slots, blenderChapelNear().lamp, 0.3)).toBeGreaterThan(0);
    for (const level of [1, 2]) {
      const beacons = blenderVillageFireNear(level).beacons;
      const lean = blenderVillageFire(level).beacons;
      expect(beacons).toHaveLength(lean.length);
      beacons.forEach((b, i) => expect(close(b, lean[i])).toBe(true));
      const { lamps, slots } = blenderHaltNear(level);
      expect(lamps).toHaveLength(blenderHalt(level).lamps.length);
      lamps.forEach((l, i) => expect(close(l, blenderHalt(level).lamps[i])).toBe(true));
      for (const l of lamps) expect(near(slots, l, 0.3)).toBeGreaterThan(0);
    }
    const { anchors, slots } = blenderSubstationNear();
    expect(close(anchors.lamp, blenderSubstation().anchors.lamp)).toBe(true);
    expect(close(anchors.yard, blenderSubstation().anchors.yard)).toBe(true);
    // The lamp is a 0.16 sphere drawn by React, on a bracket; the sparks play over the transformer.
    expect(near(slots, anchors.lamp, 0.15)).toBe(0);
    expect(near(slots, [anchors.lamp[0], anchors.lamp[1] - 0.3, anchors.lamp[2]], 0.25)).toBeGreaterThan(0);
    expect(near(slots, anchors.yard, 0.8)).toBeGreaterThan(0);
  });
});

describe("the near train", () => {
  const raised = blenderTrainNear("raised");
  const lowered = blenderTrainNear("lowered");

  it("is the lean set with more drawn on it, in its three slots, inside the running envelope", () => {
    expect(Object.keys(lowered).sort()).toEqual(["body", "gear", "glass"]);
    const lean = blenderTrain("lowered");
    const [length, height, width] = extentOf(lowered);
    const [ll, , lw] = extentOf(lean);
    // The timetable hides the set behind a margin of 6.3 each way: the nose never passes it.
    const { min, max } = bounds(lowered);
    expect(max[0]).toBeLessThan(6.3);
    expect(-min[0]).toBeLessThan(6.3);
    expect(Math.abs(length - ll)).toBeLessThan(0.3);
    expect(height).toBeLessThan(3);
    // Axle boxes and door steps stand a little outside the bodywork.
    expect(width).toBeLessThan(lw + 0.25);
    expect(triangleCount(lowered)).toBeGreaterThanOrEqual(DETAILED);
    expect(triangleCount(lowered)).toBeLessThanOrEqual(MAX);
    expect(triangleCount(lowered)).toBeGreaterThan(triangleCount(blenderTrain("lowered")) * 5);
    for (const g of geometries(lowered)) expect(g.hasAttribute(SURFACE_ATTRIBUTE)).toBe(true);
  });

  it("raises its pantograph to the contact wire, and folds it when parked", () => {
    const wireUnderside = CONTACT_WIRE_Y - 0.035;
    const up = bounds(raised).max[1];
    expect(up).toBeLessThan(wireUnderside);
    expect(wireUnderside - up).toBeLessThan(0.03);
    expect(bounds(lowered).max[1]).toBeLessThan(3.3);
    expect(triangleCount(raised)).toBe(triangleCount(lowered));
  });

  it("stands on the rails: wheels down to y 0.5, centred, nose to +x, axles on the gauge", () => {
    const { min, max } = bounds(raised);
    expect(min[1]).toBeCloseTo(0.5, 2);
    expect(Math.abs(max[0] + min[0])).toBeLessThan(0.3);
    expect(Math.abs(max[2] + min[2])).toBeLessThan(0.02);
    const p = raised.gear!.getAttribute("position");
    let onRail = 0;
    for (let i = 0; i < p.count; i++) {
      if (p.getY(i) < 0.52) {
        onRail++;
        expect(Math.abs(p.getZ(i))).toBeGreaterThan(0.6);
      }
    }
    expect(onRail).toBeGreaterThan(0);
    for (const x of [3.7 - 1.2, 3.7 + 1.2, -0.05 - 1.15, -0.05 + 1.15, -3.7 - 1.15, -3.7 + 1.15]) {
      expect(near({ gear: raised.gear }, [x, 0.84, 0.8], 0.8)).toBeGreaterThan(0);
    }
  });
});

/**
 * Faces fighting in the depth buffer. A landmark is seen from ten units away
 * or more, so detail standing 3 mm or more proud of its host is fine; what
 * must not exist is a face of one colour slot within 3 mm of an overlapping,
 * same-facing face of another (a window frame sunk in its glass, a rail
 * lying in the deck) covering more than 50 square centimetres. The lean
 * models' own coincidences are not this level's to fix: a near face only
 * counts when the lean model has none within a quarter unit of it.
 */
describe("the near landmarks' faces", () => {
  const PROUD = 0.003;
  const AREA = 5e-3;

  interface Fight {
    normal: readonly number[];
    at: readonly number[];
    text: string;
  }

  function fights(slots: Slots<string>): Fight[] {
    const positions: number[] = [];
    const indices: number[] = [];
    const keys: string[] = [];
    for (const [tag, g] of Object.entries(slots) as [string, BufferGeometry | undefined][]) {
      if (!g) continue;
      const pos = g.attributes.position.array;
      const idx = g.index?.array ?? null;
      const base = positions.length / 3;
      for (let i = 0; i < pos.length; i++) positions.push(pos[i]);
      const count = idx ? idx.length : pos.length / 3;
      for (let i = 0; i < count; i++) {
        indices.push(base + (idx ? idx[i] : i));
        if (i % 3 === 0) keys.push(tag);
      }
    }
    return coplanarOverlaps(positions, indices, { within: PROUD, minOverlap: AREA, buriedWithin: 0.05 })
      .filter((p) => keys[p.a] !== keys[p.b] && p.normal[1] > -0.5)
      .map((p) => ({ normal: p.normal, at: p.at, text: `${keys[p.a]} vs ${keys[p.b]} ${p.separation.toFixed(4)} apart at ${p.at.map((x) => x.toFixed(2)).join(",")}` }));
  }

  const fresh = (near: Fight[], lean: Fight[]): string[] =>
    near
      .filter((n) => !lean.some((l) => Math.hypot(n.at[0] - l.at[0], n.at[1] - l.at[1], n.at[2] - l.at[2]) < 0.25 && l.normal.every((v, i) => Math.abs(v - n.normal[i]) < 0.05)))
      .map((n) => n.text);

  const cases: [string, () => Slots<string>, () => Slots<string>][] = [
    ["the town hall", () => blenderTownHallNear().slots, () => blenderTownHall().slots],
    ["the fire station", () => blenderFireNear(3).slots, () => blenderFire(3).slots],
    ["the information centre", () => blenderInfoNear(3).slots, () => blenderInfo(3).slots],
    ["the power plant", () => blenderPowerNear("full"), () => blenderPower("full")],
    ["the transit station", () => blenderStationNear(3).slots, () => blenderStation(3).slots],
    ["the train", () => blenderTrainNear("raised"), () => blenderTrain("raised")],
    ["the chapel", () => blenderChapelNear().slots, () => blenderChapel().slots],
    ["the village fire station", () => blenderVillageFireNear(2).slots, () => blenderVillageFire(2).slots],
    ["the halt", () => blenderHaltNear(2).slots, () => blenderHalt(2).slots],
    ["the substation", () => blenderSubstationNear().slots, () => blenderSubstation().slots],
  ];
  for (const [name, near, lean] of cases) {
    it(`leave none fighting on ${name}`, () => expect(fresh(fights(near()), fights(lean()))).toEqual([]), 60_000);
  }
});
