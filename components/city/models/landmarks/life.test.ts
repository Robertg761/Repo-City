/**
 * The landmarks' moving parts (`blender/animkit.py`, `life.ts`): every clock's
 * hands and every flag's cloth is a node of its own, with a pivot marker, and
 * is gone from the merged mesh. The hands are modelled at twelve about the
 * clock's centre; the cloth is hoisted at its pole and carries the wave's
 * attributes. Both levels of every landmark have them, in the same places.
 */
import { describe, expect, it } from "vitest";
import type { BufferGeometry } from "three";
import { FLAP_DATA, FLAP_FLY, FLAP_NORMAL } from "../../flagWave";
import { importedMarker, importedOrigin, type ImportedModel } from "../imported";
import { blenderFire } from "./fire";
import { blenderTownHall } from "./townhall";
import { blenderChapel, blenderVillageFire } from "./village";
import { blenderStation } from "./station";
import { blenderChapelNear, blenderFireNear, blenderStationNear, blenderTownHallNear, blenderVillageFireNear } from "./near";
import { landmarkLife, type FlagLife, type LandmarkLife } from "./life";
import { MODEL as FIRE_STATION } from "./fireStation.model";
import { MODEL as FIRE_STATION_NEAR } from "./fireStationNear.model";
import { MODEL as TOWN_HALL } from "./townHall.model";
import { MODEL as TOWN_HALL_NEAR } from "./townHallNear.model";
import { MODEL as TRANSIT_STATION } from "./transitStation.model";
import { MODEL as TRANSIT_STATION_NEAR } from "./transitStationNear.model";
import { MODEL as VILLAGE_CHAPEL } from "./villageChapel.model";
import { MODEL as VILLAGE_CHAPEL_NEAR } from "./villageChapelNear.model";
import { MODEL as VILLAGE_FIRE } from "./villageFire.model";
import { MODEL as VILLAGE_FIRE_NEAR } from "./villageFireNear.model";

const geometries = (slots: Record<string, BufferGeometry | undefined>): BufferGeometry[] =>
  Object.values(slots).filter((g): g is BufferGeometry => g !== undefined);

function bounds(list: BufferGeometry[]) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const g of list) {
    const p = g.getAttribute("position");
    for (let i = 0; i < p.count; i++) {
      const v = [p.getX(i), p.getY(i), p.getZ(i)];
      for (let a = 0; a < 3; a++) {
        min[a] = Math.min(min[a], v[a]);
        max[a] = Math.max(max[a], v[a]);
      }
    }
  }
  return { min, max };
}

interface Host {
  name: string;
  model: ImportedModel;
  scope: string;
  clocks: number;
  flags: number;
  /** Near levels carry a second hand: the dial is big enough to see one. */
  second: boolean;
  life: () => LandmarkLife | undefined;
}

const HOSTS: Host[] = [
  { name: "town hall", model: TOWN_HALL, scope: "TownHall", clocks: 1, flags: 2, second: false, life: () => blenderTownHall().life },
  { name: "town hall (near)", model: TOWN_HALL_NEAR, scope: "TownHallNear", clocks: 1, flags: 2, second: true, life: () => blenderTownHallNear().life },
  { name: "chapel", model: VILLAGE_CHAPEL, scope: "Chapel", clocks: 1, flags: 0, second: false, life: () => blenderChapel().life },
  { name: "chapel (near)", model: VILLAGE_CHAPEL_NEAR, scope: "ChapelNear", clocks: 1, flags: 0, second: true, life: () => blenderChapelNear().life },
  { name: "station", model: TRANSIT_STATION, scope: "Station", clocks: 1, flags: 0, second: false, life: () => blenderStation(2).life },
  { name: "station (near)", model: TRANSIT_STATION_NEAR, scope: "StationNear", clocks: 1, flags: 0, second: true, life: () => blenderStationNear(2).life },
  ...[1, 2, 3].flatMap((level): Host[] => [
    { name: `fire station ${level}`, model: FIRE_STATION, scope: `Station${level}`, clocks: 0, flags: 1, second: false, life: () => blenderFire(level).life },
    { name: `fire station ${level} (near)`, model: FIRE_STATION_NEAR, scope: `Station${level}Near`, clocks: 0, flags: 1, second: false, life: () => blenderFireNear(level).life },
  ]),
  ...[1, 2].flatMap((level): Host[] => [
    { name: `village fire ${level}`, model: VILLAGE_FIRE, scope: `VFire${level}`, clocks: 0, flags: 1, second: false, life: () => blenderVillageFire(level).life },
    { name: `village fire ${level} (near)`, model: VILLAGE_FIRE_NEAR, scope: `VFire${level}Near`, clocks: 0, flags: 1, second: false, life: () => blenderVillageFireNear(level).life },
  ]),
];

describe.each(HOSTS)("$name", ({ model, scope, clocks, flags, second, life }) => {
  it("carries its clocks and flags as parts of their own", () => {
    const found = landmarkLife(model, scope);
    expect(found.clocks).toHaveLength(clocks);
    expect(found.flags).toHaveLength(flags);
    // The layout the renderer reads is the same set.
    const layout = life();
    expect(layout?.clocks).toHaveLength(clocks);
    expect(layout?.flags).toHaveLength(flags);
  });

  it("gives each clock its hands, pivoting on the clock's centre about the face normal", () => {
    for (const [k, clock] of landmarkLife(model, scope).clocks.entries()) {
      const prefix = `${scope}.Clock.${k}`;
      expect(clock.hands.map((h) => h.kind)).toEqual(second ? ["hour", "minute", "second"] : ["hour", "minute"]);
      // The hands' node origin IS the pivot marker, and the normal is a unit vector along the face.
      const pivot = importedMarker(model, `${prefix}.pivot`);
      expect(clock.pivot).toEqual(pivot);
      for (const suffix of ["Hour", "Minute", "Second"]) {
        if (model.nodes.some((n) => n.name === `${prefix}.${suffix}`)) {
          for (let a = 0; a < 3; a++) expect(importedOrigin(model, `${prefix}.${suffix}`)[a]).toBeCloseTo(pivot[a], 3);
        }
      }
      expect(Math.hypot(...clock.normal)).toBeCloseTo(1, 6);
      expect(Math.abs(clock.normal[1])).toBeLessThan(1e-6); // a face on a wall
      // Modelled at twelve: the hand reaches up from the pivot, centred across it, and is flat to the face.
      for (const hand of clock.hands) {
        const { min, max } = bounds(geometries(hand.slots));
        expect(max[1]).toBeGreaterThan(0.1);
        expect(min[1]).toBeLessThan(0.0);
        expect(Math.abs(min[0] + max[0])).toBeLessThan(max[1] * 0.15);
        const along = clock.normal[0] * (max[0] - min[0]) + clock.normal[2] * (max[2] - min[2]);
        expect(Math.abs(along)).toBeLessThan(0.1); // thin along the normal
      }
      // The minute hand reaches further than the hour hand, and a second hand further than either.
      const reach = Object.fromEntries(clock.hands.map((h) => [h.kind, bounds(geometries(h.slots)).max[1]]));
      expect(reach.minute).toBeGreaterThan(reach.hour);
      if (second) expect(reach.second).toBeGreaterThan(reach.minute);
    }
  });

  it("hoists each flag's cloth at its pole, with the wave's attributes", () => {
    for (const [k, flag] of landmarkLife(model, scope).flags.entries()) {
      const prefix = `${scope}.Flag.${k}`;
      expect(flag.pivot).toEqual(importedMarker(model, `${prefix}.pivot`));
      for (let a = 0; a < 3; a++) expect(importedOrigin(model, prefix)[a]).toBeCloseTo(flag.pivot[a], 3);
      expect(flag.tip[1]).toBeCloseTo(flag.pivot[1], 6); // it flies level
      expect(Math.hypot(flag.tip[0] - flag.pivot[0], flag.tip[2] - flag.pivot[2])).toBeGreaterThan(0.5);
      assertCloth(flag);
    }
  });
});

function assertCloth(flag: FlagLife): void {
  const list = geometries(flag.slots);
  expect(list.length).toBeGreaterThan(0);
  const fly = [flag.tip[0] - flag.pivot[0], flag.tip[2] - flag.pivot[2]];
  const length = Math.hypot(...fly);
  let hoisted = 0;
  let free = 0;
  for (const g of list) {
    const p = g.getAttribute("position");
    const data = g.getAttribute(FLAP_DATA);
    expect(data.count).toBe(p.count);
    expect(g.getAttribute(FLAP_NORMAL).count).toBe(p.count);
    expect(g.getAttribute(FLAP_FLY).count).toBe(p.count);
    for (let i = 0; i < p.count; i++) {
      const s = data.getX(i);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(1);
      const along = ((p.getX(i) - flag.pivot[0]) * fly[0] + (p.getZ(i) - flag.pivot[2]) * fly[1]) / length ** 2;
      // Where the cloth is, measured from the pole, is what the wave is weighted by.
      expect(s).toBeCloseTo(Math.min(1, Math.max(0, along)), 2);
      if (s === 0) hoisted++;
      if (s > 0.99) free++;
    }
  }
  // The pole end is held, and there is a free edge to wave.
  expect(hoisted).toBeGreaterThan(0);
  expect(free).toBeGreaterThan(0);
  // The cloth hangs from the pole: its hoist edge is on the pole's axis (within the cloth's own thickness).
  const { min, max } = bounds(list);
  const alongMin = Math.min((min[0] - flag.pivot[0]) * fly[0] / length, (max[0] - flag.pivot[0]) * fly[0] / length);
  expect(Math.abs(alongMin)).toBeLessThan(0.1);
  expect(max[1] - min[1]).toBeGreaterThan(0.3);
}

describe("the merged models no longer carry what moves", () => {
  const near = (a: number[], b: readonly number[], r: number) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) <= r;

  /** Triangles of the merged slots within `radius` of `at` and in front of the clock face. */
  function inFrontOfDial(slots: Record<string, BufferGeometry | undefined>, centre: readonly number[], radius: number, ahead: number): number {
    let count = 0;
    for (const g of geometries(slots)) {
      const p = g.getAttribute("position");
      for (let i = 0; i < p.count; i++) {
        const v = [p.getX(i), p.getY(i), p.getZ(i)];
        if (near([v[0], v[1], centre[2]], [centre[0], centre[1], centre[2]], radius) && v[2] > centre[2] + ahead) count++;
      }
    }
    return count;
  }

  it("has no hand standing off the town hall's dial", () => {
    // The lean dial's face is at z = 4.71; the hands stood at 4.72 to 4.77.
    expect(inFrontOfDial(blenderTownHall().slots, [0, 7.07, 4.71], 0.5, 0.005)).toBe(0);
  });

  it("has no hand off the chapel's or the station's dial", () => {
    const chapel = importedMarker(VILLAGE_CHAPEL, "Chapel.Clock.0.pivot");
    expect(inFrontOfDial(blenderChapel().slots, chapel, 0.45, 0.005)).toBe(0);
    const station = importedMarker(TRANSIT_STATION, "Station.Clock.0.pivot");
    expect(inFrontOfDial(blenderStation(1).slots, station, 0.5, 0.005)).toBe(0);
  });

  it("has no flag cloth left on the town hall's poles", () => {
    // The cloth hung out from each pole at y = 3.9 to 4.7; only the pole and its ball are there now.
    for (const s of [-1, 1]) {
      let cloth = 0;
      for (const g of geometries(blenderTownHall().slots)) {
        const p = g.getAttribute("position");
        for (let i = 0; i < p.count; i++) {
          if (Math.abs(p.getX(i) - s * 3.4) > 0.3 && Math.abs(p.getX(i) - s * 3.4) < 1.5 && p.getY(i) > 3.95 && p.getY(i) < 4.65 && Math.abs(p.getZ(i) - 4.75) < 0.3) cloth++;
        }
      }
      expect(cloth).toBe(0);
    }
  });
});
