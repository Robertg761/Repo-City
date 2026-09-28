/**
 * Writes the procedural wheels and lamps (on the Blender bodies) to PLYs so
 * Blender can render them beside the modelled parts under the same light.
 * Spike tooling, not a unit test, so it only runs when asked:
 * `EXPORT_PLY=1 pnpm vitest run blender/vehicles2/export-procedural`.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { Color, Euler, Float32BufferAttribute, Matrix4, Quaternion, Vector3, type BufferGeometry } from "three";
import { test } from "vitest";
import { PAINT_ATTRIBUTE, mergeParts } from "@/components/city/models/props/geometry";
import { faceGeometry, frameGeometry } from "@/components/city/Overflow";
import {
  BODY_SPECS,
  TRACTOR_SPEC,
  VEHICLE_BODIES,
  blenderBodyParts,
  blenderTractorParts,
  lightsGeometry,
  tractorLightsGeometry,
  wheelGeometry,
} from "@/components/city/models/vehicles/shapes";

const toSrgb = (c: number) => Math.round(255 * Math.min(1, c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055));
const TINT: Record<string, string> = {
  hatchback: "#c26a58", sedan: "#5f8fb0", taxi: "#e8b53a", van: "#e9e6dc", pickup: "#7f9e77", bus: "#5f8fb0", tractor: "#4f8a3e",
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

const wheelAt = (x: number, z: number, r: number, spin = 0) =>
  new Matrix4().compose(new Vector3(x, r, z), new Quaternion().setFromEuler(new Euler(spin, 0, 0)), new Vector3(r, r, r));

test.skipIf(!process.env.EXPORT_PLY)("export the procedural wheels and lamps on the Blender bodies", () => {
  mkdirSync("blender/out/vehicles2", { recursive: true });
  const white = new Color(1, 1, 1);
  for (const kind of VEHICLE_BODIES) {
    const spec = BODY_SPECS[kind];
    ply([
      { geometry: mergeParts(blenderBodyParts(kind)), tint: new Color(TINT[kind]) },
      ...spec.wheels.map(([x, z]) => ({ geometry: wheelGeometry(), matrix: wheelAt(x, z, spec.wheelRadius), tint: white })),
      { geometry: lightsGeometry(kind), tint: white },
    ], `blender/out/vehicles2/proc-${kind}.ply`);
  }
  ply([
    { geometry: mergeParts(blenderTractorParts()), tint: new Color(TINT.tractor) },
    ...TRACTOR_SPEC.wheels.map(([x, z], i) => ({ geometry: wheelGeometry(), matrix: wheelAt(x, z, TRACTOR_SPEC.wheelRadii[i]), tint: white })),
    { geometry: tractorLightsGeometry(), tint: white },
  ], "blender/out/vehicles2/proc-tractor.ply");
  // A wheel on its own at four spins, radius 1, for a close look.
  ply([0, 0.4, 0.8, 1.2].map((spin, i) => ({ geometry: wheelGeometry(), matrix: wheelAt(i * 2.4, 0, 1, spin).setPosition(i * 2.4, 1, 0), tint: white })),
    "blender/out/vehicles2/proc-wheels.ply");
});

test.skipIf(!process.env.EXPORT_PLY)("export the procedural signboard", () => {
  mkdirSync("blender/out/vehicles2", { recursive: true });
  const white = new Color(1, 1, 1);
  const faces = faceGeometry().toNonIndexed();
  const green = new Color("#1f5a46");
  faces.setAttribute("color", new Float32BufferAttribute(Array.from({ length: faces.getAttribute("position").count }, () => [green.r, green.g, green.b]).flat(), 3));
  ply([{ geometry: frameGeometry(), tint: white }, { geometry: faces, tint: white }], "blender/out/vehicles2/proc-overflow.ply");
});
