/**
 * Models authored in Blender (spike: Blender assets vs procedural).
 *
 * `scripts/import-model.ts` turns a GLB into a generated module holding an
 * `ImportedModel`; this file turns that back into the `Part`s every assembly in
 * the city is built from, so an imported model merges, instances, takes the
 * city's desaturation and carries its surface ids exactly like a procedural
 * one. Colours come from the model's materials, shaded by the caller; the
 * baked ambient occlusion rides in the vertex colour, which `mergeParts`
 * multiplies by the part colour.
 */

import { BufferGeometry, Float32BufferAttribute } from "three";
import { SURFACE, SURFACE_ATTRIBUTE, type SurfaceId } from "../textures/surface-types";
import type { Part, Triple } from "./props/geometry";

export interface ImportedMaterial {
  role: string;
  /** A key of `SURFACE`. */
  surface: string;
  /** sRGB, the role's own colour: `tone` is not applied to it. */
  hex: string;
  /** A shade of the role, 1 for the colour itself. */
  tone: number;
}

export interface ImportedMarker {
  name: string;
  position: number[];
}

export interface ImportedNode {
  name: string;
  /** Where the node's own origin sits in the model's frame. */
  origin: number[];
  lo: number[];
  scale: number[];
  triangles: number;
  vertices: number;
  /**
   * base64 zigzag varints: per axis, the difference from the previous
   * vertex's 16-bit coordinate, quantised over `lo` + `scale`.
   */
  positions: string;
  /** base64 zigzag varints: each corner's vertex, as a difference from the last. */
  index: string;
  /** base64 Uint8, one per triangle corner, in `aoLevels` steps. */
  ao: string;
  aoLevels: number;
  /** base64 Uint8, one material index per triangle. */
  material: string;
}

export interface ImportedModel {
  materials: ImportedMaterial[];
  nodes: ImportedNode[];
  markers: ImportedMarker[];
  /** Whatever the Blender script wrote to `<name>.meta.json`. */
  meta?: unknown;
}

/** Undoes `deltaVarints` in scripts/import-model.ts. */
function undelta(data: Uint8Array, count: number, stride = 1): Uint32Array {
  const out = new Uint32Array(count);
  const last = new Array<number>(stride).fill(0);
  let at = 0;
  for (let i = 0; i < count; i++) {
    let z = 0;
    let mul = 1;
    let byte: number;
    do {
      byte = data[at++];
      z += (byte & 0x7f) * mul;
      mul *= 128;
    } while (byte & 0x80);
    const d = z % 2 === 0 ? z / 2 : -(z + 1) / 2;
    last[i % stride] += d;
    out[i] = last[i % stride];
  }
  return out;
}

// ---------------------------------------------------------------------------
// Loading. Each generated `<name>.model.ts` is a small stub whose `MODEL` is a
// handle registered here; its data lives in `<name>.data.ts`, which only
// `loadModels()` and `loadNearModels()` import, so the bundler splits it into
// its own chunk and the city's main bundle carries none of it. The app starts
// `loadModels()` when it opens (`useModels`), so the chunks arrive while the
// repository is surveyed. A near level is `deferred`: it loads after the city
// is drawn, one model at a time (`loadNearModels`).
// ---------------------------------------------------------------------------

interface ModelEntry {
  key: string;
  load: () => Promise<{ DATA: ImportedModel }>;
  data: ImportedModel | null;
  /** A near level: fetched after the city is on screen (`loadNearModels`), not before. */
  deferred: boolean;
  /** The handle `lazyModel` returned. */
  handle: ImportedModel;
}

// Kept on `globalThis` so a module reset (tests re-import model code with the
// flag mocked on) finds the data already loaded or handed over.
interface ModelState {
  registry: Map<string, ModelEntry>;
  preloaded: Map<string, ImportedModel>;
  handles: WeakMap<object, ModelEntry>;
  version: number;
  listeners: Set<() => void>;
}
const STATE: ModelState = (() => {
  const holder = globalThis as { __repoCityModels?: Partial<ModelState> };
  const state = (holder.__repoCityModels ??= {});
  state.registry ??= new Map();
  state.preloaded ??= new Map();
  state.handles ??= new WeakMap();
  state.version ??= 0;
  state.listeners ??= new Set();
  return state as ModelState;
})();
const REGISTRY = STATE.registry;

/** Model data handed over up front (the test setup), by key. */
const PRELOADED = STATE.preloaded;

export interface LazyModelOptions {
  /**
   * A near (detailed) level. `loadModels()` leaves it out, so the city is not
   * held back for it; `loadNearModels()` fetches it once the city is drawn.
   * Until then `isModelLoaded(model)` is false and reading it throws, so a
   * near accessor checks first and returns null.
   */
  deferred?: boolean;
}

/** A generated stub's handle: reads throw until its data has loaded. */
export function lazyModel(key: string, load: () => Promise<{ DATA: ImportedModel }>, options: LazyModelOptions = {}): ImportedModel {
  const entry: ModelEntry =
    REGISTRY.get(key) ?? ({ key, load, data: null, deferred: options.deferred === true, handle: null as unknown as ImportedModel } satisfies ModelEntry);
  entry.data ??= PRELOADED.get(key) ?? null;
  const data = (): ImportedModel => {
    if (!entry.data) throw new Error(`model "${key}" was used before it loaded`);
    return entry.data;
  };
  const handle: ImportedModel = {
    get materials() {
      return data().materials;
    },
    get nodes() {
      return data().nodes;
    },
    get markers() {
      return data().markers;
    },
    get meta() {
      return data().meta;
    },
  };
  entry.handle = handle;
  STATE.handles.set(handle, entry);
  REGISTRY.set(key, entry);
  return handle;
}

/** Whether a model's data is in memory: always true once `loadModels()` has resolved, and for a near model once its own chunk landed. */
export function isModelLoaded(...models: readonly ImportedModel[]): boolean {
  return models.every((model) => {
    const entry = STATE.handles.get(model);
    return entry ? entry.data !== null : true;
  });
}

let loading: Promise<void> | null = null;

/**
 * Fetches every registered model's data except the deferred near levels. Safe
 * to call more than once; after a failure the next call tries again (what
 * already arrived is kept).
 */
export function loadModels(): Promise<void> {
  loading ??= Promise.all(
    [...REGISTRY.values()]
      .filter((entry) => !entry.deferred)
      .map(async (entry) => {
        entry.data ??= (await entry.load()).DATA;
      }),
  ).then(
    () => undefined,
    (error: unknown) => {
      loading = null;
      throw error;
    },
  );
  return loading;
}

export function modelsLoaded(): boolean {
  return [...REGISTRY.values()].every((entry) => entry.deferred || entry.data !== null);
}

/** Whether every deferred (near) model is in. */
export function nearModelsLoaded(): boolean {
  return [...REGISTRY.values()].every((entry) => !entry.deferred || entry.data !== null);
}

/** Bumps each time a near model lands; what `useNearModels()` reads. */
export function nearModelsVersion(): number {
  return STATE.version;
}

export function subscribeNearModels(listener: () => void): () => void {
  STATE.listeners.add(listener);
  return () => {
    STATE.listeners.delete(listener);
  };
}

function landed(): void {
  STATE.version++;
  for (const listener of [...STATE.listeners]) listener();
}

/** Lets the browser run whatever is waiting (input, a frame) before the next step. */
export function yieldToMain(): Promise<void> {
  const scheduler = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
  if (scheduler?.yield) return scheduler.yield();
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** How long the next near model waits after the last landed, so the consumers' rebuilds are separate tasks with frames between. */
const NEAR_GAP_MS = 60;

let nearLoading: Promise<void> | null = null;

/**
 * Fetches the deferred near models one at a time, in registration order, and
 * bumps `nearModelsVersion()` as each lands, so the layers that use it build
 * its geometry in a task of its own (a single bump would have every consumer
 * decode everything in one render). A module that cannot be fetched is tried
 * once more at the end and then left out: the lean models keep drawing it.
 * Safe to call more than once.
 */
export function loadNearModels(): Promise<void> {
  nearLoading ??= (async () => {
    const pending = [...REGISTRY.values()].filter((entry) => entry.deferred && entry.data === null);
    const failed: ModelEntry[] = [];
    const fetchOne = async (entry: ModelEntry, retry: boolean) => {
      try {
        entry.data ??= (await entry.load()).DATA;
      } catch (error) {
        if (retry) console.warn(`Repo City: the near model "${entry.key}" could not be loaded.`, error);
        else failed.push(entry);
        return;
      }
      landed();
      await new Promise((resolve) => setTimeout(resolve, NEAR_GAP_MS));
      await yieldToMain();
    };
    for (const entry of pending) await fetchOne(entry, false);
    for (const entry of failed) await fetchOne(entry, true);
  })();
  return nearLoading;
}

/** Hands over data modules already in memory (`{ KEY, DATA }`), for tests. */
export function preloadModels(modules: readonly { KEY: string; DATA: ImportedModel }[]): void {
  for (const { KEY, DATA } of modules) {
    PRELOADED.set(KEY, DATA);
    const entry = REGISTRY.get(KEY);
    if (entry) entry.data ??= DATA;
  }
}

function bytes(base64: string): Uint8Array {
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

interface Decoded {
  /** Non-indexed, one geometry per material. */
  byMaterial: Map<number, BufferGeometry>;
}

const decoded = new WeakMap<ImportedNode, Decoded>();

function decode(node: ImportedNode, model: ImportedModel): Decoded {
  const hit = decoded.get(node);
  if (hit) return hit;
  const q = undelta(bytes(node.positions), node.vertices * 3, 3);
  const index = undelta(bytes(node.index), node.triangles * 3);
  const ao = bytes(node.ao);
  const material = bytes(node.material);

  const buckets = new Map<number, { pos: number[]; col: number[] }>();
  for (let t = 0; t < node.triangles; t++) {
    const m = material[t];
    let bucket = buckets.get(m);
    if (!bucket) buckets.set(m, (bucket = { pos: [], col: [] }));
    for (let k = 0; k < 3; k++) {
      const v = index[t * 3 + k];
      // glTF stores mesh data in the node's own frame already: `origin` is
      // where that frame sits in the model, not an offset to take off again.
      for (let a = 0; a < 3; a++) bucket.pos.push(node.lo[a] + q[v * 3 + a] * node.scale[a]);
      // The material's tone is a linear multiplier, like the occlusion.
      const o = (ao[t * 3 + k] / (node.aoLevels - 1)) * model.materials[m].tone;
      bucket.col.push(o, o, o);
    }
  }
  const byMaterial = new Map<number, BufferGeometry>();
  for (const [m, { pos, col }] of buckets) {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(pos, 3));
    geometry.setAttribute("color", new Float32BufferAttribute(col, 3));
    // No material reads UVs (surfaces are projected in world space), but the
    // three.js primitives an imported model is merged with all carry them,
    // and a merge needs every geometry to have the same attributes.
    geometry.setAttribute("uv", new Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
    // Flat shaded: non-indexed, so every triangle gets its own face normal.
    geometry.computeVertexNormals();
    byMaterial.set(m, geometry);
  }
  const made = { byMaterial };
  decoded.set(node, made);
  return made;
}

/**
 * One node of an imported model as parts in the node's own frame (its origin
 * at 0), one part per material, coloured through `shade`.
 */
export function importedParts(model: ImportedModel, nodeName: string, shade: (hex: string) => string): Part[] {
  const node = model.nodes.find((n) => n.name === nodeName);
  if (!node) throw new Error(`importedParts: no node ${nodeName}`);
  const parts: Part[] = [];
  for (const [m, geometry] of decode(node, model).byMaterial) {
    const mat = model.materials[m];
    parts.push({
      geometry,
      color: shade(mat.hex),
      surface: (SURFACE as Record<string, SurfaceId>)[mat.surface] ?? SURFACE.metal,
      // A role named `paint...` is paintwork: under a `tintedMaterial` the
      // instance colour paints it (a car's body), and everything else keeps
      // its own colour (glass, tyres).
      paint: mat.role.startsWith("paint"),
    });
  }
  return parts;
}

/** Where a node's origin sits in the model's frame. */
export function importedOrigin(model: ImportedModel, nodeName: string): Triple {
  const node = model.nodes.find((n) => n.name === nodeName);
  if (!node) throw new Error(`importedOrigin: no node ${nodeName}`);
  return [node.origin[0], node.origin[1], node.origin[2]];
}

/** A marker's position in the model's frame. */
export function importedMarker(model: ImportedModel, name: string): Triple {
  const marker = model.markers.find((m) => m.name === name);
  if (!marker) throw new Error(`importedMarker: no marker ${name}`);
  return [marker.position[0], marker.position[1], marker.position[2]];
}

/** Every marker whose name starts with `prefix`, in name order. */
export function importedMarkers(model: ImportedModel, prefix: string): Triple[] {
  return model.markers
    .filter((m) => m.name.startsWith(prefix))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((m) => [m.position[0], m.position[1], m.position[2]]);
}

/**
 * One node of an imported model as landmark SLOTS: a geometry per material
 * role, for a renderer that colours each slot from the city palette. The
 * vertex colour carries the baked occlusion times the material's tone, so a
 * slot's material must draw with `vertexColors` on. `offsets` places extra
 * copies of the node (an engine at each of its parking spots).
 */
export function importedSlots(
  model: ImportedModel,
  nodeName: string,
  offsets: readonly Triple[] = [[0, 0, 0]],
): Record<string, BufferGeometry[]> {
  const node = model.nodes.find((n) => n.name === nodeName);
  if (!node) throw new Error(`importedSlots: no node ${nodeName}`);
  const slots: Record<string, BufferGeometry[]> = {};
  for (const [m, geometry] of decode(node, model).byMaterial) {
    const role = model.materials[m].role;
    const surface = (SURFACE as Record<string, SurfaceId>)[model.materials[m].surface] ?? SURFACE.metal;
    for (const [x, y, z] of offsets) {
      const copy = geometry.clone();
      copy.translate(x, y, z);
      copy.setAttribute(
        SURFACE_ATTRIBUTE,
        new Float32BufferAttribute(new Float32Array(copy.getAttribute("position").count).fill(surface), 1),
      );
      (slots[role] ??= []).push(copy);
    }
  }
  return slots;
}

/** How a building material maps onto the `MeshDraft` a building renders. */
export interface DraftMaterial {
  /** Vertex colour: a multiplier on the instance colour (may exceed 1). */
  color: readonly [number, number, number];
  /** `PAINT_NONE`, `PAINT_WALL` or `PAINT_ACCENT`, for settlement models. */
  paint?: number;
}

/**
 * One node as a building `MeshDraft` (`buildings/mesh.ts`): flat shaded, one
 * vertex per triangle corner, the vertex colour `material(...).color` times
 * the baked occlusion and the material's tone. With `paint` given for any
 * material, the draft carries the settlement paint channel.
 */
export function importedDraft(
  model: ImportedModel,
  nodeName: string,
  material: (mat: ImportedMaterial) => DraftMaterial,
): { positions: number[]; normals: number[]; colors: number[]; indices: number[]; surface: number[]; paint?: number[] } {
  const node = model.nodes.find((n) => n.name === nodeName);
  if (!node) throw new Error(`importedDraft: no node ${nodeName}`);
  const mapped = model.materials.map(material);
  const withPaint = mapped.some((m) => m.paint !== undefined);
  const draft = {
    positions: [] as number[],
    normals: [] as number[],
    colors: [] as number[],
    indices: [] as number[],
    surface: [] as number[],
    ...(withPaint ? { paint: [] as number[] } : {}),
  };
  for (const [m, geometry] of decode(node, model).byMaterial) {
    const mat = model.materials[m];
    const { color, paint } = mapped[m];
    const surface = (SURFACE as Record<string, SurfaceId>)[mat.surface] ?? SURFACE.plaster;
    const pos = geometry.getAttribute("position");
    const nor = geometry.getAttribute("normal");
    const ao = geometry.getAttribute("color");
    for (let i = 0; i < pos.count; i++) {
      draft.indices.push(draft.positions.length / 3);
      draft.positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      draft.normals.push(nor.getX(i), nor.getY(i), nor.getZ(i));
      // `ao` already holds occlusion x tone.
      const o = ao.getX(i);
      draft.colors.push(color[0] * o, color[1] * o, color[2] * o);
      draft.surface.push(surface);
      draft.paint?.push(paint ?? 0);
    }
  }
  return draft;
}
