/**
 * Blender GLB -> a generated TypeScript model module (spike: Blender assets).
 *
 *   node scripts/import-model.ts assets/models/fire-engine.glb \
 *     components/city/models/vehicles/fireEngine.model.ts
 *
 * The models are flat shaded, so normals are not stored: the runtime takes
 * them from the triangles. What is stored per node is what cannot be derived:
 * quantised positions, the triangle list, each triangle's material, and each
 * corner's baked ambient occlusion. The module is synchronous to import, which
 * keeps `emergencyParts` synchronous and the model tests running in node.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, relative, resolve } from "node:path";

interface Accessor {
  bufferView: number;
  byteOffset?: number;
  componentType: number;
  count: number;
  type: "SCALAR" | "VEC2" | "VEC3" | "VEC4";
  normalized?: boolean;
}

const WIDTH = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 } as const;
const COMPONENT: Record<number, [number, (v: DataView, o: number) => number, number]> = {
  5120: [1, (v, o) => v.getInt8(o), 127],
  5121: [1, (v, o) => v.getUint8(o), 255],
  5122: [2, (v, o) => v.getInt16(o, true), 32767],
  5123: [2, (v, o) => v.getUint16(o, true), 65535],
  5125: [4, (v, o) => v.getUint32(o, true), 1],
  5126: [4, (v, o) => v.getFloat32(o, true), 1],
};

function parseGlb(file: Buffer) {
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
  if (view.getUint32(0, true) !== 0x46546c67) throw new Error("not a GLB");
  const jsonLength = view.getUint32(12, true);
  const json = JSON.parse(file.subarray(20, 20 + jsonLength).toString("utf8"));
  const binStart = 20 + jsonLength + 8;
  const bin = new DataView(file.buffer, file.byteOffset + binStart, view.getUint32(20 + jsonLength, true));

  const read = (index: number): number[][] => {
    const acc: Accessor = json.accessors[index];
    const bv = json.bufferViews[acc.bufferView];
    const [size, get, max] = COMPONENT[acc.componentType];
    const width = WIDTH[acc.type];
    const stride = bv.byteStride ?? size * width;
    const base = (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0);
    const out: number[][] = [];
    for (let i = 0; i < acc.count; i++) {
      const item: number[] = [];
      for (let c = 0; c < width; c++) {
        const raw = get(bin, base + i * stride + c * size);
        item.push(acc.normalized ? raw / max : raw);
      }
      out.push(item);
    }
    return out;
  };
  return { json, read };
}

const toSrgbHex = (linear: number[]) =>
  "#" +
  linear
    .slice(0, 3)
    .map((c) => {
      const s = c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
      return Math.round(Math.min(1, Math.max(0, s)) * 255).toString(16).padStart(2, "0");
    })
    .join("");

const b64 = (bytes: ArrayBufferView) =>
  Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("base64");

/**
 * Zigzag varints of the differences between successive values. Vertices are
 * numbered in first-use order and neighbouring triangles share them, so the
 * differences are small and repetitive, which is what the transport
 * compression (brotli) is good at; raw 16-bit values it barely touches.
 */
function deltaVarints(values: readonly number[], stride = 1): Uint8Array {
  const out: number[] = [];
  const last = new Array(stride).fill(0);
  values.forEach((v, i) => {
    const d = v - last[i % stride];
    last[i % stride] = v;
    let z = d >= 0 ? d * 2 : -d * 2 - 1;
    while (z >= 0x80) {
      out.push((z & 0x7f) | 0x80);
      z = Math.floor(z / 128);
    }
    out.push(z);
  });
  return new Uint8Array(out);
}

/** Occlusion levels kept: finer than this is invisible at city scale. */
const AO_LEVELS = 32;

/** The path from the generated module to `components/city/models/imported`. */
function importPath(output: string): string {
  const target = resolve("components/city/models/imported");
  const path = relative(dirname(resolve(output)), target);
  return path.startsWith(".") ? path : `./${path}`;
}

function main() {
  const [input, output] = process.argv.slice(2);
  const { json, read } = parseGlb(readFileSync(input));

  const materials = (json.materials as { name: string; pbrMetallicRoughness?: { baseColorFactor?: number[] } }[]).map(
    (m) => {
      // `<role>.<surface>[.tNN]`: a tone is a darker shade of the role's colour.
      const [role, surface, toneTag] = m.name.split(".");
      const tone = toneTag?.startsWith("t") ? Number(toneTag.slice(1)) / 100 : 1;
      const base = m.pbrMetallicRoughness?.baseColorFactor ?? [1, 1, 1];
      return { role, surface, tone, hex: toSrgbHex(base.map((c) => c / tone)) };
    },
  );

  const nodes = (json.nodes as { name: string; mesh?: number; translation?: number[] }[])
    .filter((n) => n.mesh !== undefined)
    .map((node) => {
      const corners: number[][] = [];
      const ao: number[] = [];
      const material: number[] = [];
      for (const prim of json.meshes[node.mesh!].primitives) {
        const pos = read(prim.attributes.POSITION);
        const col = prim.attributes.COLOR_0 !== undefined ? read(prim.attributes.COLOR_0) : null;
        const idx = prim.indices !== undefined ? read(prim.indices).map((v) => v[0]) : pos.map((_, i) => i);
        for (let t = 0; t < idx.length; t += 3) {
          for (let k = 0; k < 3; k++) {
            corners.push(pos[idx[t + k]]);
            ao.push(col ? col[idx[t + k]][0] : 1);
          }
          material.push(prim.material ?? 0);
        }
      }
      // Quantise to 16 bits over the node's bounds and share equal corners.
      const lo = [0, 1, 2].map((a) => Math.min(...corners.map((p) => p[a])));
      const hi = [0, 1, 2].map((a) => Math.max(...corners.map((p) => p[a])));
      const scale = hi.map((h, a) => (h - lo[a]) / 65535 || 1);
      const unique = new Map<string, number>();
      const qpos: number[] = [];
      const index: number[] = [];
      for (const p of corners) {
        const q = p.map((v, a) => Math.round((v - lo[a]) / scale[a]));
        const key = q.join(",");
        let at = unique.get(key);
        if (at === undefined) {
          at = unique.size;
          unique.set(key, at);
          qpos.push(...q);
        }
        index.push(at);
      }
      return {
        name: node.name,
        origin: node.translation ?? [0, 0, 0],
        lo,
        scale,
        triangles: material.length,
        vertices: unique.size,
        positions: b64(deltaVarints(qpos, 3)),
        index: b64(deltaVarints(index)),
        ao: b64(new Uint8Array(ao.map((v) => Math.round(Math.min(1, v) * (AO_LEVELS - 1))))),
        aoLevels: AO_LEVELS,
        material: b64(new Uint8Array(material)),
      };
    });

  // Mesh-less nodes are markers: points the model publishes to the runtime.
  const markers = (json.nodes as { name: string; mesh?: number; translation?: number[] }[])
    .filter((n) => n.mesh === undefined)
    .map((n) => ({ name: n.name, position: (n.translation ?? [0, 0, 0]).map((v) => Math.round(v * 1e4) / 1e4) }));

  // A model can publish data the GLB has no place for (a building's window
  // rectangles and roof pads) as `<name>.meta.json` beside the GLB.
  const metaPath = input.replace(/\.glb$/, ".meta.json");
  const meta = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, "utf8")) : undefined;

  // Two files: `<name>.data.ts` holds the model, `<name>.model.ts` is the stub
  // the code imports. Only `loadModels()` imports the data, so it ships in a
  // chunk of its own (see `imported.ts`).
  const key = basename(output).replace(/\.model\.ts$/, "");
  const dataPath = output.replace(/\.model\.ts$/, ".data.ts");
  const header = `/**
 * GENERATED by scripts/import-model.ts from ${basename(input)} -- do not edit.
 * The model's source is the Blender script beside it in \`blender/\`.
 */
`;
  const data = `${header}
import type { ImportedModel } from "${importPath(output)}";

export const KEY = ${JSON.stringify(key)};

export const DATA: ImportedModel = ${JSON.stringify({ materials, nodes, markers, ...(meta ? { meta } : {}) }, null, 2)};
`;
  const source = `${header}
import { lazyModel } from "${importPath(output)}";

export const MODEL = lazyModel(${JSON.stringify(key)}, () => import("./${key}.data"));
`;
  writeFileSync(dataPath, data);
  writeFileSync(output, source);
  const bytes = Buffer.byteLength(data);
  console.log(
    `${output}: ${nodes.map((n) => `${n.name} ${n.triangles} tris`).join(", ")}; ${(bytes / 1024).toFixed(1)} KiB source`,
  );
}

main();
