/**
 * Writes the procedural fleet to PLYs so Blender can render each body beside
 * its modelled counterpart under the same light. Spike tooling, not a unit
 * test, so it only runs when asked:
 * `EXPORT_PLY=1 pnpm vitest run blender/fleet/export-procedural`.
 *
 * Each PLY is a car as the street draws it: the body, four wheels at the
 * spec's positions and radii, and the lamps, with the paintwork tinted in one
 * of the fleet's colours the way `tintedMaterial` would.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { Color, type BufferGeometry, Matrix4, Euler, Vector3, Quaternion } from "three";
import { test } from "vitest";
import { PAINT_ATTRIBUTE, triangleCount } from "@/components/city/models/props/geometry";
import {
  BODY_SPECS,
  VEHICLE_BODIES,
  TRACTOR_SPEC,
  bodyGeometry,
  lightsGeometry,
  parkedGeometry,
  tractorGeometry,
  tractorLightsGeometry,
  tractorParkedGeometry,
  wheelGeometry,
} from "@/components/city/models/vehicles/shapes";

const toSrgb = (c: number) => Math.round(255 * Math.min(1, c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055));

/** The tint each body is shown in, from `CAR_COLORS` / `TRACTOR_COLORS`. */
export const PREVIEW_TINT: Record<string, string> = {
  hatchback: "#c26a58",
  sedan: "#5f8fb0",
  taxi: "#e8b53a",
  van: "#e9e6dc",
  pickup: "#7f9e77",
  bus: "#5f8fb0",
  tractor: "#4f8a3e",
};

function ply(pieces: { geometry: BufferGeometry; matrix?: Matrix4; tint: Color }[], path: string): number {
  const verts: string[] = [];
  const faces: string[] = [];
  const p = new Vector3();
  for (const { geometry, matrix, tint } of pieces) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    const pos = g.getAttribute("position");
    const col = g.getAttribute("color");
    const paint = g.getAttribute(PAINT_ATTRIBUTE);
    const base = verts.length;
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i);
      if (matrix) p.applyMatrix4(matrix);
      const k = paint && paint.getX(i) > 0.5 ? tint : new Color(1, 1, 1);
      verts.push(`${p.x} ${-p.z} ${p.y} ${toSrgb(col.getX(i) * k.r)} ${toSrgb(col.getY(i) * k.g)} ${toSrgb(col.getZ(i) * k.b)}`);
    }
    for (let i = 0; i < pos.count; i += 3) faces.push(`3 ${base + i} ${base + i + 1} ${base + i + 2}`);
  }
  const header = ["ply", "format ascii 1.0", `element vertex ${verts.length}`, "property float x", "property float y", "property float z",
    "property uchar red", "property uchar green", "property uchar blue", `element face ${faces.length}`, "property list uchar int vertex_indices", "end_header"];
  writeFileSync(path, [...header, ...verts, ...faces].join("\n"));
  return faces.length;
}

const wheelAt = (x: number, z: number, r: number) =>
  new Matrix4().compose(new Vector3(x, r, z), new Quaternion().setFromEuler(new Euler(0, 0, 0)), new Vector3(r, r, r));

test.skipIf(!process.env.EXPORT_PLY)("export the procedural fleet", () => {
  mkdirSync("blender/out/fleet", { recursive: true });
  const white = new Color(1, 1, 1);
  for (const kind of VEHICLE_BODIES) {
    const spec = BODY_SPECS[kind];
    const tint = new Color(PREVIEW_TINT[kind]);
    const n = ply([
      { geometry: bodyGeometry(kind), tint },
      ...spec.wheels.map(([x, z]) => ({ geometry: wheelGeometry(), matrix: wheelAt(x, z, spec.wheelRadius), tint: white })),
      { geometry: lightsGeometry(kind), tint: white },
    ], `blender/out/fleet/proc-${kind}.ply`);
    console.log(`${kind}: body ${triangleCount(bodyGeometry(kind))} lights ${triangleCount(lightsGeometry(kind))} parked ${triangleCount(parkedGeometry(kind))} ply ${n}`);
  }
  const tint = new Color(PREVIEW_TINT.tractor);
  ply([
    { geometry: tractorGeometry(), tint },
    ...TRACTOR_SPEC.wheels.map(([x, z], i) => ({ geometry: wheelGeometry(), matrix: wheelAt(x, z, TRACTOR_SPEC.wheelRadii[i]), tint: white })),
    { geometry: tractorLightsGeometry(), tint: white },
  ], "blender/out/fleet/proc-tractor.ply");
  console.log(`tractor: body ${triangleCount(tractorGeometry())} lights ${triangleCount(tractorLightsGeometry())} parked ${triangleCount(tractorParkedGeometry())}`);
  console.log(`wheel ${triangleCount(wheelGeometry())}`);
});
