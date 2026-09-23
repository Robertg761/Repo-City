"use client";

/**
 * The React side of `batching.ts`: the pools, and the parts heroes place into
 * them (PLAN.md 76.13, S9 tuning pass).
 *
 *   <BatchProvider>      once, round the city. Renders one instanced mesh
 *                        per pool after everything else.
 *   <BatchEntity id>     round a hero or landmark: the entity its parts
 *                        hover and select.
 *   <BatchPart kind>     an empty object placed exactly where the mesh used
 *                        to be. Animate it as the mesh was animated: its
 *                        transform through the ref, its opacity and glow
 *                        through `handle`.
 *
 * Picking is the building layer's: `event.instanceId` indexes the ids the
 * pool refreshes each frame, so a pointer on a pooled ring or lamp hovers
 * and selects the incident it belongs to, as it did when the ring was a
 * child of the incident's group.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
  type Ref,
  type RefObject,
} from "react";
import { useFrame, type ThreeElements } from "@react-three/fiber";
import {
  BufferGeometry,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  type Group,
  type Object3D,
} from "three";
import {
  BatchRegistry,
  GLOW_ATTRIBUTE,
  OPACITY_ATTRIBUTE,
  createHandle,
  type BatchHandle,
  type BatchKind,
  type Pool,
  writeColor,
  writeMatrix,
  writeScalar,
} from "./batching";
import { useInstanceHandlers } from "./useEntity";

const RegistryContext = createContext<BatchRegistry | null>(null);
const EntityContext = createContext<string | undefined>(undefined);

/** The entity every `BatchPart` inside picks as. */
export function BatchEntity({ id, children }: { id: string; children: ReactNode }) {
  return <EntityContext.Provider value={id}>{children}</EntityContext.Provider>;
}

type GroupProps = Omit<ThreeElements["group"], "ref" | "children">;

function assign<T>(ref: Ref<T> | undefined, value: T | null): void {
  if (typeof ref === "function") ref(value);
  else if (ref) (ref as RefObject<T | null>).current = value;
}

/**
 * One pooled mesh. `color` is the per-instance tint (the material's colour is
 * white, or the vertex colours, and this multiplies it); `opacity` and `glow`
 * are starting values for materials patched to read them. `handle` gives the
 * caller the live record to animate from its own frame loop.
 */
export function BatchPart({
  kind,
  color,
  opacity = 1,
  glow = 1,
  visible = true,
  handle: handleRef,
  ...props
}: GroupProps & {
  kind: BatchKind;
  color?: string;
  opacity?: number;
  glow?: number;
  visible?: boolean;
  /** The live record, `object` included, for the caller's frame loop. */
  handle?: Ref<BatchHandle>;
}) {
  const registry = useContext(RegistryContext);
  const id = useContext(EntityContext);
  const object = useRef<Group>(null);
  // A ref, not a memo: the record is mutable by design, written here and by
  // the caller's frame loop, and read by the pool's.
  const record = useRef<BatchHandle | null>(null);
  const handleOf = (): BatchHandle => (record.current ??= createHandle());

  // Values from props; the caller's frame loop may overwrite them afterwards.
  useLayoutEffect(() => {
    const handle = handleOf();
    handle.id = id;
    if (color) handle.color.set(color);
    else handle.color.setRGB(1, 1, 1);
  }, [id, color]);
  useLayoutEffect(() => {
    const handle = handleOf();
    handle.opacity = opacity;
    handle.glow = glow;
    handle.visible = visible;
  }, [opacity, glow, visible]);

  useLayoutEffect(() => {
    if (!registry) return;
    const handle = handleOf();
    handle.object = object.current;
    registry.add(kind, handle);
    return () => {
      registry.remove(kind, handle);
      handle.object = null;
    };
  }, [registry, kind]);

  // Apart from the registration: an inline callback is a new ref each render.
  useLayoutEffect(() => {
    assign(handleRef, handleOf());
    return () => assign(handleRef, null);
  }, [handleRef]);

  return <group ref={object} {...props} />;
}

const scratch = new Matrix4();
/** A hidden instance is shrunk to nothing where it stands, never NaN. */
const HIDDEN = new Matrix4().makeScale(1e-6, 1e-6, 1e-6);

/** Whether the object and every ancestor is visible (the reveal hides a hero until it grows). */
function shown(object: Object3D): boolean {
  for (let o: Object3D | null = object; o; o = o.parent) if (!o.visible) return false;
  return true;
}

/**
 * A view of the source geometry that shares its buffers (so nothing is
 * uploaded twice) with the pool's own per-instance attributes added: two
 * pools drawing the same shape must not share instance data.
 */
function poolGeometry(source: BufferGeometry, capacity: number): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setIndex(source.index);
  for (const [name, attribute] of Object.entries(source.attributes)) geometry.setAttribute(name, attribute);
  for (const group of source.groups) geometry.addGroup(group.start, group.count, group.materialIndex);
  geometry.boundingBox = source.boundingBox;
  geometry.boundingSphere = source.boundingSphere;
  geometry.setAttribute(OPACITY_ATTRIBUTE, new InstancedBufferAttribute(new Float32Array(capacity).fill(1), 1));
  geometry.setAttribute(GLOW_ATTRIBUTE, new InstancedBufferAttribute(new Float32Array(capacity).fill(1), 1));
  return geometry;
}

function PoolMesh({ pool }: { pool: Pool }) {
  const { kind, capacity } = pool;
  const meshRef = useRef<InstancedMesh>(null);
  // Refreshed every frame with the parts; the pointer reads it when it lands.
  const ids = useRef<string[]>([]);
  const idOf = useCallback((instanceId: number) => ids.current[instanceId] || undefined, []);
  const handlers = useInstanceHandlers(idOf);

  const mesh = useMemo(() => {
    const source = kind.geometry();
    if (!source.boundingSphere) source.computeBoundingSphere();
    const instanced = new InstancedMesh(poolGeometry(source, capacity), kind.material(), capacity);
    instanced.count = 0;
    instanced.instanceMatrix.setUsage(DynamicDrawUsage);
    for (const name of [OPACITY_ATTRIBUTE, GLOW_ATTRIBUTE]) {
      (instanced.geometry.getAttribute(name) as InstancedBufferAttribute).setUsage(DynamicDrawUsage);
    }
    instanced.frustumCulled = false;
    instanced.castShadow = kind.castShadow ?? false;
    instanced.receiveShadow = kind.receiveShadow ?? false;
    instanced.renderOrder = kind.renderOrder ?? 0;
    // `instanceColor` has to exist before the first compile, or the program
    // is built without it.
    for (let i = 0; i < capacity; i++) instanced.setColorAt(i, pool.parts[i]?.color ?? WHITE);
    instanced.instanceColor?.setUsage(DynamicDrawUsage);
    if (kind.pickable === false) instanced.raycast = () => {};
    return instanced;
  }, [kind, capacity, pool]);

  useEffect(
    () => () => {
      // Only the pool's own view and material: the source geometry is cached
      // by whoever built it.
      mesh.geometry.dispose();
      const material = mesh.material;
      if (Array.isArray(material)) material.forEach((m) => m.dispose());
      else material.dispose();
      mesh.dispose();
    },
    [mesh],
  );

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const parts = pool.parts;
    const count = Math.min(parts.length, capacity);
    const opacity = mesh.geometry.getAttribute(OPACITY_ATTRIBUTE) as InstancedBufferAttribute;
    const glow = mesh.geometry.getAttribute(GLOW_ATTRIBUTE) as InstancedBufferAttribute;
    const matrices = mesh.instanceMatrix.array as Float32Array;
    const colors = mesh.instanceColor?.array as Float32Array;
    // Only what changed goes back to the GPU: once the reveal has settled
    // most pools -- the scenes, the patches, the shells -- stand still, and a
    // re-upload of every instance buffer every frame is a stall for nothing.
    let moved = false;
    let painted = false;
    let faded = false;
    let glowed = false;
    ids.current.length = count;
    for (let i = 0; i < count; i++) {
      const part = parts[i];
      const object = part.object;
      let matrix = HIDDEN;
      if (object) {
        object.updateWorldMatrix(true, false);
        matrix =
          part.visible && shown(object)
            ? object.matrixWorld
            : scratch.multiplyMatrices(object.matrixWorld, HIDDEN);
      }
      if (writeMatrix(matrices, i, matrix.elements)) moved = true;
      if (colors && writeColor(colors, i, part.color)) painted = true;
      if (writeScalar(opacity.array as Float32Array, i, part.opacity)) faded = true;
      if (writeScalar(glow.array as Float32Array, i, part.glow)) glowed = true;
      ids.current[i] = part.id ?? "";
    }
    mesh.count = count;
    if (moved) {
      mesh.instanceMatrix.needsUpdate = true;
      // Recomputed lazily, on the next raycast.
      mesh.boundingSphere = null;
    }
    if (painted && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    if (faded) opacity.needsUpdate = true;
    if (glowed) glow.needsUpdate = true;
  });

  return kind.pickable === false ? (
    <primitive ref={meshRef} object={mesh} />
  ) : (
    <primitive ref={meshRef} object={mesh} {...handlers} />
  );
}

const WHITE = createHandle().color;

/**
 * Round the city. The pools render after the children, so every part has
 * registered, and every hero's frame loop has moved its parts, before the
 * pool reads them.
 */
export function BatchProvider({ children }: { children: ReactNode }) {
  const registry = useMemo(() => new BatchRegistry(), []);
  useSyncExternalStore(registry.subscribe, registry.snapshot, registry.snapshot);
  const pools = [...registry.pools.values()];
  return (
    <RegistryContext.Provider value={registry}>
      {children}
      {pools.map((pool) => (
        <PoolMesh key={`${pool.kind.key}:${pool.capacity}`} pool={pool} />
      ))}
    </RegistryContext.Provider>
  );
}
