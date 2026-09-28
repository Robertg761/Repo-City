/**
 * Writes the procedural landmarks to PLY, in the colours `Landmark.tsx` gives
 * their slots, so Blender can render each beside its scripted counterpart
 * under the same light. Spike tooling, not a unit test, so it only runs when
 * asked: `EXPORT_PLY=1 pnpm vitest run blender/landmarks/export-procedural`.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { Color, type BufferGeometry } from "three";
import { test } from "vitest";
import { powerPlant } from "@/components/city/models/landmarks/power";
import { infoCentre } from "@/components/city/models/landmarks/info";
import { trainCars, transitStation } from "@/components/city/models/landmarks/station";
import { townHall } from "@/components/city/models/landmarks/townhall";
import { chapel, halt, substation, villageFireStation } from "@/components/city/models/landmarks/village";
import { CIVIC_COLOR, CONCRETE, HAZARD_RED, TREE_LEAF, WARNING_ORANGE, WINDOW_COLOR, mix } from "@/components/city/palette";

const toSrgb = (c: number) => Math.round(255 * Math.min(1, c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055));

const PALE = mix(CIVIC_COLOR, "#ffffff", 0.45);
const TRIM = mix(CIVIC_COLOR, "#ffffff", 0.75);
const CONCRETE_GREY = mix(CONCRETE, "#7f8683", 0.55);
const SLATE = "#8c9ea3";
const STEEL = "#7d8689";
const DARK_STEEL = "#414950";
const SIGN_BLUE = "#4d8fce";
const TRANSIT_BLUE = "#4489b4";
const VERDIGRIS = "#7fb1a8";
const ENGINE_RED = mix(HAZARD_RED, "#e05540", 0.5);
const LIMESTONE = "#d8cfbd";
const VILLAGE_SLATE = "#6f7a82";
const OAK = "#6b4e39";
const YEW = "#3f5f45";
const BRICK = "#a8604a";

/** Every slot colour `Landmark.tsx` paints, per landmark. */
export const COLOURS = {
  power: { deck: CONCRETE_GREY, hull: PALE, cold: "#6f6a64", steel: STEEL, hazard: HAZARD_RED, glass: WINDOW_COLOR },
  info: { deck: CONCRETE_GREY, wall: PALE, roof: SLATE, green: TREE_LEAF, sign: SIGN_BLUE, glass: mix("#bcd9e4", WINDOW_COLOR, 0.35) },
  station: { deck: CONCRETE_GREY, wall: PALE, roof: SLATE, steel: STEEL, accent: TRANSIT_BLUE, dark: "#1f2427", glass: WINDOW_COLOR },
  civic: { stone: SLATE, wall: PALE, accent: VERDIGRIS, metal: STEEL, glass: mix("#cfe2ea", WINDOW_COLOR, 0.4) },
  chapel: { stone: LIMESTONE, roof: VILLAGE_SLATE, trim: TRIM, wood: OAK, green: YEW, metal: DARK_STEEL, glass: mix("#8fa6b4", WINDOW_COLOR, 0.3) },
  vfire: { deck: CONCRETE_GREY, wall: BRICK, roof: VILLAGE_SLATE, red: ENGINE_RED, trim: TRIM, steel: DARK_STEEL, glass: WINDOW_COLOR },
  halt: { deck: mix(CONCRETE_GREY, LIMESTONE, 0.4), wall: PALE, roof: VILLAGE_SLATE, steel: STEEL, accent: mix(TRANSIT_BLUE, "#2f6a52", 0.55), dark: "#5b554e", wood: OAK, glass: WINDOW_COLOR },
  train: { body: TRANSIT_BLUE, gear: DARK_STEEL, glass: WINDOW_COLOR },
  substation: { deck: mix(CONCRETE_GREY, "#9a9384", 0.5), hull: mix(PALE, "#b8c2bf", 0.5), steel: STEEL, hazard: WARNING_ORANGE, dark: "#4a4e52", wood: OAK, glass: "#9fb9c4" },
} as const;

function writePly(path: string, slots: Record<string, BufferGeometry | undefined>, colours: Record<string, string>) {
  const verts: string[] = [];
  const faces: string[] = [];
  for (const [slot, geometry] of Object.entries(slots)) {
    if (!geometry) continue;
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    const pos = g.getAttribute("position");
    const c = new Color(colours[slot] ?? "#ff00ff");
    const base = verts.length;
    for (let i = 0; i < pos.count; i++) {
      // three (x, y up, z forward) -> Blender (x, -z, y).
      verts.push(`${pos.getX(i)} ${-pos.getZ(i)} ${pos.getY(i)} ${toSrgb(c.r)} ${toSrgb(c.g)} ${toSrgb(c.b)}`);
    }
    for (let i = 0; i < pos.count; i += 3) faces.push(`3 ${base + i} ${base + i + 1} ${base + i + 2}`);
  }
  const header = ["ply", "format ascii 1.0", `element vertex ${verts.length}`, "property float x", "property float y", "property float z",
    "property uchar red", "property uchar green", "property uchar blue", `element face ${faces.length}`, "property list uchar int vertex_indices", "end_header"];
  writeFileSync(path, [...header, ...verts, ...faces].join("\n"));
  console.log(`${path}: ${faces.length} triangles`);
}

test.skipIf(!process.env.EXPORT_PLY)("export procedural landmarks", () => {
  const out = "blender/out/landmarks";
  mkdirSync(out, { recursive: true });
  for (const state of ["healthy", "failing", "none"]) writePly(`${out}/procedural-power-${state}.ply`, powerPlant(state), COLOURS.power);
  for (const level of [1, 2, 3]) {
    writePly(`${out}/procedural-info-${level}.ply`, infoCentre(level).slots, COLOURS.info);
    writePly(`${out}/procedural-station-${level}.ply`, transitStation(level).slots, COLOURS.station);
  }
  writePly(`${out}/procedural-civic.ply`, townHall().slots, COLOURS.civic);
  writePly(`${out}/procedural-chapel.ply`, chapel().slots, COLOURS.chapel);
  for (const level of [1, 2]) {
    writePly(`${out}/procedural-vfire-${level}.ply`, villageFireStation(level).slots, COLOURS.vfire);
    writePly(`${out}/procedural-halt-${level}.ply`, halt(level).slots, COLOURS.halt);
  }
  writePly(`${out}/procedural-train.ply`, trainCars(), COLOURS.train);
  writePly(`${out}/procedural-substation.ply`, substation().slots, COLOURS.substation);
  console.log(JSON.stringify(COLOURS, null, 1));
});
