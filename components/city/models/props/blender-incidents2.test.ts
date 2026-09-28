/**
 * The construction and incident leftovers in Blender (spike:
 * `blender/incidents2/`): the site's hoarding and scaffold kits, the crew's
 * gear, the forecourt, weeds, debris, skid marks, the pothole, the scorch, the
 * flames and the beacon's mast. The flag is off in tests, so the kit modules
 * are called directly and the whole-scene checks mock it on.
 */
import { Box3, type BufferGeometry } from "three";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { ConstructionState } from "@/types/analysis";
import { desaturate } from "../../palette";
import { SURFACE_ATTRIBUTE } from "../../textures/surface-types";
import { MODEL as INCIDENT_KIT } from "./incidentKit.model";
import { MODEL as SITE_KIT } from "./siteKit.model";
import { mergeParts, triangleCount, type Part } from "./geometry";
import {
  DECAL_Y,
  SKID_TILE,
  beaconMastGeometry,
  debrisPiece,
  flameGeometry,
  patchGeometry,
  potholeParts,
  scorchParts,
  skidParts,
  spoilParts,
  weedParts,
} from "./incidentKit";
import {
  FENCE_SHEET,
  KIT_COLORS,
  SCAFFOLD_BAY,
  SCAFFOLD_REACH,
  boardingRun,
  crewGearParts,
  fallenHoarding,
  fenceParts,
  frame,
  leaningSign,
  scaffoldLifts,
  scaffoldParts,
} from "./siteKit";

const shade = (hex: string) => desaturate(hex, 0.2);
const bounds = (parts: Part[] | BufferGeometry) =>
  new Box3().setFromBufferAttribute(
    (Array.isArray(parts) ? mergeParts(parts) : parts).getAttribute("position") as never,
  );
const SHELL = { x: 11 * 0.12, z: 11 * 0.1 };
const HEIGHT: Record<string, number> = { active: 5.4, slow: 4.2, abandoned: 3.4 };

describe("the hoarding kit", () => {
  it("makes a side of five whole sheets, the sheet's own length, never stretched", () => {
    expect(FENCE_SHEET * 5).toBeCloseTo(11, 9);
    const parts = fenceParts(shade);
    // Nothing carries a scale: every sheet is the model's own 2.2 m.
    expect(parts.every((part) => part.scale === undefined)).toBe(true);
    const box = bounds(parts);
    // The procedural boards span the plot's 11 units, 0.12 thick, and stand as high as its rail.
    expect(box.min.x).toBeGreaterThan(-5.75);
    expect(box.max.x).toBeLessThan(5.75);
    expect(box.min.z).toBeGreaterThan(-5.75);
    expect(box.max.z).toBeLessThan(5.75);
    expect(box.min.y).toBeCloseTo(0, 2);
    expect(box.max.y).toBeCloseTo(1.85, 1);
  });

  it("faces every run's outside outwards, with the rail on top", () => {
    const outside = (x: number, z: number, turn: number) =>
      bounds(boardingRun([FENCE_SHEET], shade, frame([x, 0, z], [0, turn, 0])));
    // The +z run's boards sit at z = 5.5 +- 0.08 with the batten proud on both faces.
    const south = outside(0, 5.5, 0);
    expect(south.max.z - south.min.z).toBeGreaterThan(0.15);
    expect(south.max.x - south.min.x).toBeCloseTo(FENCE_SHEET, 1);
    const east = outside(5.5, 0, Math.PI / 2);
    expect(east.max.z - east.min.z).toBeCloseTo(FENCE_SHEET, 1);
  });

  it("costs what a fence of twenty sheets and four posts can afford", () => {
    expect(triangleCount(mergeParts(fenceParts(shade)))).toBeLessThan(600);
  });

  it("lays the hoarding that came down from whole sheets, 5.5 and 3.3 long", () => {
    const parts = fallenHoarding(shade);
    expect(parts.every((part) => part.scale === undefined)).toBe(true);
    const leaning = bounds(fallenHoarding(shade).slice(0, parts.length / 2));
    // The leaning run is 5.5 along, tilted 0.16 rad: a little less across x.
    expect(leaning.max.x - leaning.min.x).toBeGreaterThan(5.2);
    expect(leaning.max.x - leaning.min.x).toBeLessThan(5.7);
  });

  it("leans the sign from its foot", () => {
    const foot: [number, number, number] = [6, 0.04, -3.7];
    const box = bounds(leaningSign(foot, 0.22, shade));
    expect(box.min.y).toBeGreaterThan(-0.02);
    expect(box.max.y).toBeGreaterThan(2.9);
    // Leaning towards -x, as the procedural sign does.
    expect(box.min.x).toBeLessThan(foot[0] - 1);
  });
});

describe("the scaffold kit", () => {
  it.each(Object.entries(HEIGHT))("stands the %s site's frame on the procedural reach, to the shell's top", (_, height) => {
    const parts = scaffoldParts(height, shade);
    expect(parts.every((part) => part.scale === undefined)).toBe(true);
    const box = bounds(parts);
    const top = height + 0.7;
    expect(box.max.y).toBeCloseTo(top, 1);
    expect(box.min.y).toBeGreaterThan(-0.01);
    // Eight standards on a square of `reach`, 0.11 across.
    expect(box.min.x).toBeCloseTo(SHELL.x - SCAFFOLD_REACH - 0.13, 1);
    expect(box.max.x).toBeCloseTo(SHELL.x + SCAFFOLD_REACH + 0.13, 1);
    expect(box.min.z).toBeCloseTo(SHELL.z - SCAFFOLD_REACH - 0.13, 1);
    expect(box.max.z).toBeGreaterThan(SHELL.z + SCAFFOLD_REACH + 0.1);
  });

  it("makes two bays a face, and a ledger every 1.9 up", () => {
    expect(SCAFFOLD_BAY * 2).toBeCloseTo(SCAFFOLD_REACH * 2, 9);
    expect(scaffoldLifts(5.4)).toBe(3);
    expect(scaffoldLifts(4.2)).toBe(2);
    expect(scaffoldLifts(3.4)).toBe(2);
    // Each state's remainder is a stub the kit models.
    for (const height of Object.values(HEIGHT)) {
      const stub = Math.round((height + 0.7 - scaffoldLifts(height) * 1.9) * 100);
      expect(SITE_KIT.nodes.some((n) => n.name === `ScaffoldStub${stub}`)).toBe(true);
    }
  });

  it("puts a platform in the front bays of the top two lifts", () => {
    const decks = (height: number) => {
      const y = new Set<number>();
      for (const part of scaffoldParts(height, shade)) {
        // A deck is the only wide, flat, wood coloured part with a plank's tone.
        if (part.color === shade(KIT_COLORS.plank) && part.position && part.position[2] > SHELL.z + 3) {
          y.add(Math.round(part.position[1] * 10) / 10);
        }
      }
      return [...y].sort();
    };
    expect(decks(5.4)).toEqual([3.9, 5.8]);
    // The shorter shell's platforms are on both its lifts, as the procedural ones are.
    expect(decks(4.2)).toEqual([2, 3.9]);
  });

  it("rusts the steel and weathers the planks on an abandoned site", () => {
    const paint = (hex: string) => (hex === KIT_COLORS.steel ? "#9a7b5f" : hex);
    const steel = scaffoldParts(3.4, paint).filter((part) => part.color === "#9a7b5f");
    expect(steel.length).toBeGreaterThan(0);
    expect(scaffoldParts(3.4, shade).some((part) => part.color === "#9a7b5f")).toBe(false);
  });

  it("stays within the budget of one scaffold", () => {
    expect(triangleCount(mergeParts(scaffoldParts(5.4, shade)))).toBeLessThan(800);
  });
});

describe("the crew's gear on the Blender walker", () => {
  it("puts a hard hat over the head and bands round the chest, in the crew's colour", () => {
    const parts = crewGearParts("#f2d43c");
    expect(parts.some((part) => part.color === "#f2d43c")).toBe(true);
    expect(parts.some((part) => part.color === "#ebe4ba")).toBe(true);
    const box = bounds(parts);
    // The head's crown is at 1.09; the hat rides over it.
    expect(box.max.y).toBeGreaterThan(1.12);
    expect(box.max.y).toBeLessThan(1.22);
    // The vest's bands lie on the torso, waist to chest.
    expect(box.min.y).toBeGreaterThan(0.4);
    expect(box.max.x - box.min.x).toBeLessThan(0.55);
    expect(triangleCount(mergeParts(parts))).toBeLessThan(150);
  });
});

describe("weeds, debris and skid marks", () => {
  it("stands a tuft at each procedural weed's place, the nearest size scaled to fit", () => {
    const spots = [
      { x: 2, z: 3, height: 0.5, turn: 1 },
      { x: -3, z: 1, height: 0.8, turn: 2 },
      { x: 1, z: -4, height: 1.1, turn: 0 },
    ];
    for (const spot of spots) {
      const box = bounds(weedParts([spot], "#8fa575"));
      expect(box.min.y).toBeCloseTo(0, 2);
      expect(box.max.y).toBeGreaterThan(spot.height * 0.9);
      expect(box.max.y).toBeLessThan(spot.height * 1.05);
      expect((box.min.x + box.max.x) / 2).toBeCloseTo(spot.x, 0);
      expect((box.min.z + box.max.z) / 2).toBeCloseTo(spot.z, 0);
    }
    const parts = weedParts(spots, "#8fa575");
    expect(parts.some((part) => part.color === "#8fa575")).toBe(true);
  });

  it("scatters debris on the road at the procedural size, in the scene's colour", () => {
    for (let i = 0; i < 4; i++) {
      const parts = debrisPiece(i, 1, 2, 0.3, 0.7, "#8c8880", shade);
      const box = bounds(parts);
      // A tilted piece may dip a hair under the mark's height, never under the patch's.
      expect(box.min.y).toBeGreaterThan(DECAL_Y - 0.02);
      expect(box.max.y).toBeLessThan(DECAL_Y + 0.25);
      expect(Math.max(box.max.x - box.min.x, box.max.z - box.min.z)).toBeLessThan(0.7);
    }
    // Panels take the scene's colour, glass and rubber their own.
    expect(debrisPiece(0, 0, 0, 0.2, 0, "#111111", shade).some((part) => part.color === "#111111")).toBe(true);
  });

  it("lays a skid mark from whole tiles to about the procedural length, the tail at the far end", () => {
    for (const [length, tiles] of [[3.4, 4], [2.6, 3]] as const) {
      const parts = skidParts([-1.55, DECAL_Y, 2.5], 0, length, 0.2);
      const box = bounds(parts);
      // Whole tiles, the fading tail a little short of a full one.
      expect(box.max.z - box.min.z).toBeGreaterThan(tiles * SKID_TILE - 0.1);
      expect(box.max.z - box.min.z).toBeLessThanOrEqual(tiles * SKID_TILE + 0.001);
      expect(Math.abs(box.max.z - box.min.z - length)).toBeLessThan(0.15);
      expect(box.max.x - box.min.x).toBeCloseTo(0.16, 2);
      // Flush with the road: the procedural mark's top is at 0.145.
      expect(box.max.y).toBeGreaterThan(DECAL_Y + 0.005);
      expect(box.max.y).toBeLessThan(DECAL_Y + 0.02);
      expect(parts.every((part) => part.scale === undefined)).toBe(true);
    }
    // The fade points away from the incident's middle.
    const fades = (z: number) => {
      const box = bounds(skidParts([0, DECAL_Y, z], 0, 3.4, 0.2));
      return triangleCount(mergeParts(skidParts([0, DECAL_Y, z], 0, 3.4, 0.2))) > 0 && box;
    };
    expect(fades(2.5)).toBeTruthy();
  });
});

describe("the pothole, spoil and scorch", () => {
  it("digs the hole inside the procedural pothole's 0.78 radius", () => {
    const box = bounds(potholeParts(shade));
    expect(Math.max(-box.min.x, box.max.x, -box.min.z, box.max.z)).toBeLessThan(0.85);
    expect(Math.max(-box.min.x, box.max.x)).toBeGreaterThan(0.6);
    expect(box.min.y).toBeGreaterThan(DECAL_Y - 0.05);
  });

  it("heaps the spoil where the procedural heap lay, about half a unit high", () => {
    const box = bounds(spoilParts(1.1, -0.9, shade));
    expect((box.min.x + box.max.x) / 2).toBeCloseTo(1.1, 0);
    expect((box.min.z + box.max.z) / 2).toBeCloseTo(-0.9, 0);
    expect(box.max.y - box.min.y).toBeGreaterThan(0.25);
    expect(box.max.y - box.min.y).toBeLessThan(0.65);
  });

  it("burns a patch as wide as the procedural 2.8 radius disc", () => {
    const box = bounds(scorchParts(shade));
    const reach = Math.max(-box.min.x, box.max.x, -box.min.z, box.max.z);
    expect(reach).toBeGreaterThan(2.3);
    expect(reach).toBeLessThan(2.95);
    expect(box.max.y).toBeLessThan(DECAL_Y + 0.11);
    expect(box.min.y).toBeGreaterThan(DECAL_Y - 0.05);
  });

  it("stains the ground as wide as the round decals were", () => {
    for (const [which, radius] of [["small", 1.8], ["wide", 3.1]] as const) {
      const geometry = patchGeometry(which);
      const box = bounds(geometry);
      expect(Math.max(-box.min.x, box.max.x)).toBeLessThanOrEqual(radius + 0.01);
      expect(Math.max(-box.min.x, box.max.x)).toBeGreaterThan(radius * 0.85);
      expect(box.min.y).toBeGreaterThanOrEqual(0);
      expect(box.max.y).toBeLessThan(0.04);
      expect(geometry.hasAttribute("color")).toBe(true);
    }
  });
});

describe("the flames", () => {
  it.each([
    ["outer", 3.4, 1],
    ["inner", 2.5, 0.66],
  ] as const)("shapes the %s flame in the cone it stands in for", (which, height, radius) => {
    const geometry = flameGeometry(which);
    const box = bounds(geometry);
    // Centred on the cone's middle, so the scene's scaling and flicker act as before.
    expect(box.min.y).toBeCloseTo(-height / 2, 1);
    expect(box.max.y).toBeCloseTo(height / 2, 1);
    expect(Math.max(-box.min.x, box.max.x, -box.min.z, box.max.z)).toBeLessThan(radius * 1.15);
    expect(Math.max(-box.min.x, box.max.x)).toBeGreaterThan(radius * 0.5);
    expect(triangleCount(geometry)).toBeLessThan(250);
  });

  it("bands the outer flame from a red-orange root to a pale tip", () => {
    const geometry = flameGeometry("outer");
    const position = geometry.getAttribute("position");
    const color = geometry.getAttribute("color");
    let root = 0;
    let rootN = 0;
    let tip = 0;
    let tipN = 0;
    for (let i = 0; i < position.count; i++) {
      // Green over red is the yellowing towards the tip.
      const yellowness = color.getY(i) / Math.max(color.getX(i), 1e-6);
      if (position.getY(i) < -1.2) {
        root += yellowness;
        rootN++;
      }
      if (position.getY(i) > 0.9) {
        tip += yellowness;
        tipN++;
      }
    }
    expect(tip / tipN).toBeGreaterThan(root / rootN);
  });
});

describe("the beacon's mast", () => {
  const top = (geometry: BufferGeometry) => bounds(geometry).max.y;

  it.each([0.6, 2.1, 2.4, 4.2, 4.4])("stacks whole poles to a %s mast, the hood 0.62 over its top", (height) => {
    const geometry = beaconMastGeometry(height);
    const box = bounds(geometry);
    expect(box.min.y).toBeCloseTo(0, 2);
    // The hood is 0.12 deep: its top is at height + 0.68.
    expect(top(geometry)).toBeCloseTo(height + 0.68, 1);
    // The hood is the widest thing on it, 0.7 across and 0.42 deep.
    expect(box.max.x - box.min.x).toBeGreaterThan(0.68);
    expect(box.max.x - box.min.x).toBeLessThan(0.8);
    expect(triangleCount(geometry)).toBeLessThan(450);
    expect(geometry.hasAttribute("color")).toBe(true);
  });

  it("leaves the lamp's cage clear of the blinking lamp, 0.24 over the mast's top", () => {
    const geometry = beaconMastGeometry(4.2);
    const position = geometry.getAttribute("position");
    // Between the lamp's seat and its crown only the cage's four posts rise.
    let widest = 0;
    for (let i = 0; i < position.count; i++) {
      const y = position.getY(i) - 4.2;
      if (y > 0.11 && y < 0.42) widest = Math.max(widest, Math.hypot(position.getX(i), position.getZ(i)));
    }
    expect(widest).toBeGreaterThan(0.3);
    expect(widest).toBeLessThan(0.5);
  });
});

describe("the sites and scenes with the Blender kits", () => {
  const SITES: ConstructionState[] = ["active", "slow", "abandoned", "completed"];
  let decor: typeof import("./constructionDecor");
  let procedural: typeof import("./constructionDecor");
  let incidents: typeof import("./incidentDecor");
  let proceduralIncidents: typeof import("./incidentDecor");
  let figures: typeof import("./figures");
  let proceduralFigures: typeof import("./figures");

  beforeAll(async () => {
    procedural = await import("./constructionDecor");
    proceduralIncidents = await import("./incidentDecor");
    proceduralFigures = await import("./figures");
    vi.resetModules();
    vi.doMock("../modelSource", () => ({ BLENDER_MODELS: true }));
    decor = await import("./constructionDecor");
    incidents = await import("./incidentDecor");
    figures = await import("./figures");
  });

  it("draws the fence, scaffold and crew of a working site from kits", () => {
    for (const state of ["active", "slow"] as const) {
      const own = decor.constructionDecor(state, 0.2);
      const box = bounds(own);
      // The hoarding's corner posts and the scaffold's top, where the procedural ones stand.
      expect(box.min.x).toBeGreaterThan(-5.75);
      expect(box.max.x).toBeLessThan(5.75);
      expect(box.max.y).toBeCloseTo(bounds(procedural.constructionDecor(state, 0.2)).max.y, 0);
      expect(own.hasAttribute(SURFACE_ATTRIBUTE)).toBe(true);
    }
  });

  it("lays the completed site's forecourt out where the procedural one lies", () => {
    const box = bounds(decor.constructionDecor("completed", 0.2));
    const before = bounds(procedural.constructionDecor("completed", 0.2));
    // Paving, stanchions, the ribbon, the tree and the seat: all inside the old footprint.
    expect(box.min.x).toBeGreaterThan(before.min.x - 0.6);
    expect(box.max.x).toBeLessThan(before.max.x + 0.6);
    expect(box.min.z).toBeGreaterThan(before.min.z - 0.6);
    expect(box.max.z).toBeLessThan(before.max.z + 0.6);
    expect(box.max.y).toBeGreaterThan(2.1);
    expect(triangleCount(decor.constructionDecor("completed", 0.2))).toBeLessThan(
      triangleCount(decor.constructionDecor("slow", 0.2)),
    );
  });

  it("rusts the abandoned scaffold and weathers everything on it", () => {
    const redness = (geometry: BufferGeometry) => {
      const color = geometry.getAttribute("color");
      const position = geometry.getAttribute("position");
      let r = 0;
      let b = 0;
      let n = 0;
      // The scaffold's standard at the shell's front corner.
      for (let i = 0; i < color.count; i++) {
        if (Math.abs(position.getX(i) - (SHELL.x + SCAFFOLD_REACH)) < 0.12 && Math.abs(position.getZ(i) - (SHELL.z + SCAFFOLD_REACH)) < 0.12 && position.getY(i) > 1) {
          r += color.getX(i);
          b += color.getZ(i);
          n++;
        }
      }
      expect(n).toBeGreaterThan(0);
      return r / b;
    };
    expect(redness(decor.constructionDecor("abandoned", 0.2))).toBeGreaterThan(redness(decor.constructionDecor("slow", 0.2)));
  });

  it("builds a figure on the Blender walker with a Blender hat, no taller than the procedural one", () => {
    const own = mergeParts(figures.figureParts({ position: [2, 3, 4], color: "#e6c02f", helmet: "#f0d44a" }));
    const before = mergeParts(proceduralFigures.figureParts({ position: [2, 3, 4], color: "#e6c02f", helmet: "#f0d44a" }));
    expect(bounds(own).min.y).toBeCloseTo(3, 2);
    expect(Math.abs(bounds(own).max.y - bounds(before).max.y)).toBeLessThan(0.1);
    expect(figures.figureParts({ position: [0, 0, 0], color: "#e6c02f", helmet: "#f0d44a" }).some((p) => p.color === "#f0d44a")).toBe(true);
    // Without a helmet there is no gear at all.
    const bare = figures.figureParts({ position: [0, 0, 0], color: "#e6c02f" });
    expect(bare.some((p) => p.color === "#ebe4ba")).toBe(false);
  });

  it("keeps the scenes' contracts: layout, ordering, and the budget of twelve", () => {
    for (const state of ["minor", "collision", "stale", "major"] as const) {
      const own = incidents.incidentDecor(state, 0, 0.2);
      expect(incidents.incidentLayout(state, 1)).toEqual(proceduralIncidents.incidentLayout(state, 1));
      expect(triangleCount(own.geometry) * 12).toBeLessThan(120000);
      // Nothing sinks into the road but a tilted wreck or a knocked-over sign's foot.
      expect(bounds(own.geometry).min.y).toBeGreaterThan(Math.min(bounds(proceduralIncidents.incidentDecor(state, 0, 0.2).geometry).min.y, 0) - 0.05);
    }
    // The major scene's scorch and the minor scene's pothole are models now.
    expect(triangleCount(incidents.incidentDecor("major", 0, 0.2).geometry)).toBeGreaterThan(
      triangleCount(proceduralIncidents.incidentDecor("major", 0, 0.2).geometry),
    );
  });

  it("keeps the collision's skid marks pressed on the road by the wrecks", () => {
    const own = incidents.incidentDecor("collision", 0, 0.2).geometry;
    const position = own.getAttribute("position");
    // Something dark lies flat at the mark's height along z = 2.5.
    let flat = 0;
    for (let i = 0; i < position.count; i++) {
      if (Math.abs(position.getZ(i) - 2.5) < 0.9 && position.getY(i) > 0.14 && position.getY(i) < 0.16) flat++;
    }
    expect(flat).toBeGreaterThan(20);
  });

  it("weathers the sites' weeds and keeps them on the plot", () => {
    const box = bounds(decor.constructionDecor("abandoned", 0.2));
    expect(box.max.x).toBeLessThan(7);
    expect(box.min.x).toBeGreaterThan(-7);
    for (const state of SITES) expect(decor.constructionDecor(state, 0.2)).toBe(decor.constructionDecor(state, 0.2));
  });
});

describe("the kits' size", () => {
  it("lists every node the scenes ask for", () => {
    const names = new Set([...SITE_KIT.nodes, ...INCIDENT_KIT.nodes].map((n) => n.name));
    for (const name of [
      "FenceSheet", "FenceHalf", "FencePost", "ScaffoldFoot", "ScaffoldPole", "ScaffoldLedger", "ScaffoldBrace",
      "ScaffoldDeck", "SiteSign", "CompletedYard", "CrewGear", "Weed0", "Weed1", "Weed2", "DebrisPlate",
      "DebrisBumper", "DebrisHub", "DebrisGlass", "SkidTile", "SkidTail", "Pothole", "Spoil", "Scorch",
      "PatchSmall", "PatchWide", "FlameOuter", "FlameInner", "BeaconFoot", "BeaconHead",
    ]) {
      expect(names.has(name), name).toBe(true);
    }
  });
});
