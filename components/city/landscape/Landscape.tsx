"use client";

/**
 * The land round the city (`?land=rich`), drawn from `plan.ts`:
 *
 *   LandTerrain   the rolling ground itself, in the ground shader (`ground.tsx`),
 *                 and the "nothing here" click target the old landscape was
 *   Landscape     everything on it: water, roads and bridges, fields and
 *                 hedges, woods, houses, a skyline, and the verge along the
 *                 plot's edge
 *
 * Everything is merged or instanced and unlit-cheap: about two dozen draw
 * calls, all of it distant. The pieces mount a few frames apart (`Later`) so
 * that the city's arrival is many short tasks and not one long one.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import {
  Color,
  DoubleSide,
  type Group,
  MeshStandardMaterial,
  Object3D,
  type BufferGeometry,
  type InstancedMesh,
  type Texture,
} from "three";
import { useCityStore } from "@/store/useCityStore";
import type { CityModel } from "@/types/city";
import type { SceneAtmosphere } from "../palette";
import { useQuality } from "../quality";
import { useSkyFrame } from "../sky";
import { tiledSurface } from "../textures/surfaces";
import { SURFACE_BUMP } from "../textures/texture-data";
import { wasDrag } from "../useEntity";
import {
  barnGeometry,
  blockGeometry,
  broadleafGeometry,
  buildBridges,
  buildFields,
  buildHedges,
  buildPond,
  buildRibbon,
  buildStreets,
  buildTowers,
  canopyGeometry,
  coniferGeometry,
  houseGeometry,
  roadHeight,
  roadTexture,
  stripeTexture,
  windowTextures,
} from "./build";
import { CTL_REACH } from "./ctl";
import Grass from "./grass";
import { useLand } from "./LandProvider";
import { patchLand, useLandGround } from "./ground";
import type { LandscapePlan, TreeSpot } from "./plan";

const scratch = new Object3D();
const tint = new Color();

/**
 * Draws its children only once their shaders are compiled. A first-use compile
 * is a long task on the main thread; `compileAsync` does it in parallel with
 * the page (KHR_parallel_shader_compile), so the piece appears a moment late
 * and nothing stalls.
 */
function Precompiled({ children }: { children: ReactNode }) {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const scene = useThree((s) => s.scene);
  const ref = useRef<Group>(null);
  // Without the extension the compile would block anyway (and three warns): just draw.
  const parallel = gl.extensions.has("KHR_parallel_shader_compile");
  const [shown, setShown] = useState(!parallel);
  useEffect(() => {
    const group = ref.current;
    if (!group || !parallel) return;
    let live = true;
    gl.compileAsync(group, camera, scene).then(
      () => live && setShown(true),
      () => live && setShown(true),
    );
    return () => {
      live = false;
    };
  }, [gl, camera, scene, parallel]);
  return (
    <group ref={ref} visible={shown}>
      {children}
    </group>
  );
}

/** Mounts its children `at` frames after it did, one heavy piece a frame. */
function Later({ at, children }: { at: number; children: ReactNode }) {
  const [ready, setReady] = useState(at <= 0);
  const frames = useRef(0);
  useFrame(() => {
    if (ready) return;
    frames.current++;
    if (frames.current >= at) setReady(true);
  });
  return ready ? <Precompiled>{children}</Precompiled> : null;
}

const none = () => null;

// ---------------------------------------------------------------------------
// Terrain
// ---------------------------------------------------------------------------

export function LandTerrain() {
  const land = useLand();
  const ground = useLandGround();
  const actions = useCityStore((s) => s.actions);
  const { textureSize, anisotropy } = useQuality();
  const lawn = useMemo(() => ({
    map: tiledSurface("lawn", textureSize, 1, anisotropy),
    relief: tiledSurface("lawn", textureSize, 1, anisotropy, true),
  }), [textureSize, anisotropy]);
  useEffect(() => () => { lawn.map.dispose(); lawn.relief.dispose(); }, [lawn]);

  const material = useMemo(() => {
    if (!ground) return null;
    const m = new MeshStandardMaterial({
      color: "#ffffff",
      vertexColors: true,
      map: lawn.map,
      bumpMap: lawn.relief,
      roughnessMap: lawn.relief,
      bumpScale: SURFACE_BUMP.lawn,
      roughness: 1,
      metalness: 0,
    });
    patchLand(m, ground.uniforms, 0, 1);
    return m;
  }, [ground, lawn]);
  useEffect(() => () => material?.dispose(), [material]);

  if (!land?.terrain || !material || !ground?.control) return null;

  const clearSelection = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    if (wasDrag(event)) return;
    actions.select(null);
  };
  const clearHover = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    actions.hover(null);
  };

  return (
    <Precompiled>
      <mesh
        geometry={land.terrain.geometry}
        material={material}
        receiveShadow
        frustumCulled={false}
        onClick={clearSelection}
        onPointerMove={clearHover}
      />
    </Precompiled>
  );
}

// ---------------------------------------------------------------------------
// Instances
// ---------------------------------------------------------------------------

function Instanced<T>({
  geometry,
  material,
  items,
  place,
  colorOf,
  castShadow = false,
}: {
  geometry: BufferGeometry;
  material: MeshStandardMaterial;
  items: readonly T[];
  /** Writes the item's transform into the scratch object. */
  place: (item: T, o: Object3D) => void;
  colorOf?: (item: T, out: Color) => void;
  castShadow?: boolean;
}) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    items.forEach((item, i) => {
      scratch.position.set(0, 0, 0);
      scratch.rotation.set(0, 0, 0);
      scratch.scale.set(1, 1, 1);
      place(item, scratch);
      scratch.updateMatrix();
      mesh.setMatrixAt(i, scratch.matrix);
      if (colorOf) {
        colorOf(item, tint);
        mesh.setColorAt(i, tint);
      }
    });
    mesh.count = items.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [items, place, colorOf]);
  if (items.length === 0) return null;
  return (
    <instancedMesh
      key={items.length}
      ref={ref}
      args={[geometry, material, items.length]}
      castShadow={castShadow}
      receiveShadow
      frustumCulled={false}
      raycast={none}
    />
  );
}

/** Disposes a GPU object when it is replaced or the component goes. */
function useDispose(value: { dispose(): void }): void {
  useEffect(() => () => value.dispose(), [value]);
}

const vegetationMaterial = () =>
  new MeshStandardMaterial({ color: "#ffffff", vertexColors: true, roughness: 0.95, metalness: 0, flatShading: true });

/** Instance tint: near white with a hue and brightness drift, so no two are quite alike. */
function jitterTint(shade: number, out: Color, warm = 0.12): void {
  out.setRGB(0.88 + shade * 0.24 + warm * (shade - 0.5), 0.9 + shade * 0.16, 0.86 + shade * 0.2 - warm * (shade - 0.5));
}

// ---------------------------------------------------------------------------
// The dressing
// ---------------------------------------------------------------------------

export default function Landscape({ city, atmosphere }: { city: CityModel; atmosphere: SceneAtmosphere }) {
  const land = useLand();
  const ground = useLandGround();
  // The dressing waits for the ground: the control map is what the fields' and the houses' colours sit on.
  if (!land?.terrain || !ground?.control) return null;
  return <Dressing plan={land.plan} sample={land.terrain.sample} atmosphere={atmosphere} city={city} />;
}

function Dressing({
  plan,
  sample,
  atmosphere,
}: {
  plan: LandscapePlan;
  sample: (x: number, z: number) => number;
  atmosphere: SceneAtmosphere;
  city: CityModel;
}) {
  const { tier } = useQuality();
  const low = tier === "low";
  return (
    <group>
      <Later at={1}>
        <Waters plan={plan} />
        <Roads plan={plan} sample={sample} />
      </Later>
      <Later at={2}>
        <Fields plan={plan} sample={sample} atmosphere={atmosphere} hedges={!low} />
      </Later>
      <Later at={3}>
        <Woods plan={plan} sample={sample} low={low} />
      </Later>
      <Later at={4}>
        <Homes plan={plan} sample={sample} />
      </Later>
      {!low && (
        <Later at={6}>
          <Grass grass={atmosphere.terrainColor} limit={plan.half * CTL_REACH * 0.97} />
        </Later>
      )}
      <Later at={5}>
        <Verge plan={plan} sample={sample} />
        {plan.towers.length > 0 && <Skyline plan={plan} sample={sample} />}
      </Later>
    </group>
  );
}

const WATER = "#468aa8";

function Waters({ plan }: { plan: LandscapePlan }) {
  const material = useMemo(() => new MeshStandardMaterial({
      color: WATER,
      vertexColors: true,
      roughness: 0.22,
      metalness: 0.08,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }), []);
  useDispose(material);
  const geometries = useMemo(() => {
    const list: BufferGeometry[] = [];
    for (const river of plan.rivers) {
      list.push(buildRibbon(river.pts, river.width, () => 0.1, { along: 30, edge: "#ffffff", centre: "#ffffff" }));
    }
    for (const pond of plan.ponds) list.push(buildPond(pond.x, pond.z, pond.rx, pond.rz, pond.yaw, 0.1, "#ffffff"));
    return list;
  }, [plan]);
  useEffect(() => () => geometries.forEach((g) => g.dispose()), [geometries]);
  return (
    <group>
      {geometries.map((g, i) => (
        <mesh key={i} geometry={g} material={material} receiveShadow raycast={none} />
      ))}
    </group>
  );
}

function Roads({ plan, sample }: { plan: LandscapePlan; sample: (x: number, z: number) => number }) {
  const map = useMemo(() => roadTexture(), []);
  useDispose(map);
  const material = useMemo(() => new MeshStandardMaterial({
      color: "#ffffff",
      map,
      roughness: 0.95,
      metalness: 0,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    }), [map]);
  useDispose(material);
  const parts = useMemo(() => {
    const y = roadHeight(plan, sample);
    return {
      roads: plan.roads.map((road) => buildRibbon(road.pts, road.width * 0.94, y, { along: 5.6, from: road.drawFrom })),
      bridges: buildBridges(plan),
      streets: buildStreets(plan, sample),
    };
  }, [plan, sample]);
  useEffect(() => () => {
    parts.roads.forEach((g) => g.dispose());
    parts.bridges.dispose();
    parts.streets.dispose();
  }, [parts]);
  const concrete = useMemo(() => new MeshStandardMaterial({ color: "#ffffff", vertexColors: true, roughness: 0.95, metalness: 0 }), []);
  useDispose(concrete);
  return (
    <group>
      {parts.roads.map((g, i) => (
        <mesh key={i} geometry={g} material={material} receiveShadow raycast={none} />
      ))}
      <mesh geometry={parts.bridges} material={concrete} castShadow receiveShadow raycast={none} />
      <mesh geometry={parts.streets} material={concrete} receiveShadow raycast={none} />
    </group>
  );
}

function Fields({
  plan,
  sample,
  atmosphere,
  hedges,
}: {
  plan: LandscapePlan;
  sample: (x: number, z: number) => number;
  atmosphere: SceneAtmosphere;
  hedges: boolean;
}) {
  const stripes: Texture = useMemo(() => stripeTexture(), []);
  useDispose(stripes);
  const fieldMaterial = useMemo(() => new MeshStandardMaterial({
      color: "#ffffff",
      vertexColors: true,
      map: stripes,
      roughness: 1,
      metalness: 0,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }), [stripes]);
  useDispose(fieldMaterial);
  const hedgeMaterial = useMemo(() => vegetationMaterial(), []);
  useDispose(hedgeMaterial);
  const geometry = useMemo(() => buildFields(plan, sample, atmosphere.desaturation), [plan, sample, atmosphere.desaturation]);
  const hedge = useMemo(() => (hedges ? buildHedges(plan.hedges, sample) : null), [plan, sample, hedges]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => hedge?.dispose(), [hedge]);
  return (
    <group>
      <mesh geometry={geometry} material={fieldMaterial} receiveShadow raycast={none} />
      {hedge && <mesh geometry={hedge} material={hedgeMaterial} receiveShadow raycast={none} />}
    </group>
  );
}

interface Placed {
  x: number;
  y: number;
  z: number;
  spot: TreeSpot;
}

function useTreeSet(spots: readonly TreeSpot[], sample: (x: number, z: number) => number, kind: TreeSpot["kind"]): Placed[] {
  return useMemo(
    () => spots.filter((s) => s.kind === kind).map((spot) => ({ x: spot.x, y: sample(spot.x, spot.z) - 0.1, z: spot.z, spot })),
    [spots, sample, kind],
  );
}

const placeTree = (t: Placed, o: Object3D) => {
  o.position.set(t.x, t.y, t.z);
  const s = t.spot.scale;
  o.rotation.y = t.spot.shade * 6.283;
  o.scale.set(s, s * (0.9 + t.spot.shade * 0.25), s);
};
const colorTree = (t: Placed, out: Color) => jitterTint(t.spot.shade, out, 0.1);

function Woods({ plan, sample, low }: { plan: LandscapePlan; sample: (x: number, z: number) => number; low: boolean }) {
  const material = useMemo(() => vegetationMaterial(), []);
  useDispose(material);
  const spots = useMemo(() => (low ? plan.trees.filter((_, i) => i % 3 === 0) : plan.trees), [plan, low]);
  const broadleaf = useTreeSet(spots, sample, 0);
  const conifer = useTreeSet(spots, sample, 1);
  const canopy = useTreeSet(spots, sample, 2);
  const geos = useMemo(() => ({ b: broadleafGeometry(), c: coniferGeometry(), k: canopyGeometry() }), []);
  useEffect(() => () => Object.values(geos).forEach((g) => g.dispose()), [geos]);
  return (
    <group>
      <Instanced geometry={geos.b} material={material} items={broadleaf} place={placeTree} colorOf={colorTree} />
      <Instanced geometry={geos.c} material={material} items={conifer} place={placeTree} colorOf={colorTree} />
      <Instanced geometry={geos.k} material={material} items={canopy} place={placeTree} colorOf={colorTree} />
    </group>
  );
}

function Verge({ plan, sample }: { plan: LandscapePlan; sample: (x: number, z: number) => number }) {
  const material = useMemo(() => vegetationMaterial(), []);
  useDispose(material);
  const b = useTreeSet(plan.verge.trees, sample, 0);
  const c = useTreeSet(plan.verge.trees, sample, 1);
  const geos = useMemo(() => ({ b: broadleafGeometry(), c: coniferGeometry() }), []);
  const hedge = useMemo(() => buildHedges(plan.verge.hedges, sample), [plan, sample]);
  useEffect(() => () => { geos.b.dispose(); geos.c.dispose(); hedge.dispose(); }, [geos, hedge]);
  return (
    <group>
      <Instanced geometry={geos.b} material={material} items={b} place={placeTree} colorOf={colorTree} castShadow />
      <Instanced geometry={geos.c} material={material} items={c} place={placeTree} colorOf={colorTree} castShadow />
      <mesh geometry={hedge} material={material} castShadow receiveShadow raycast={none} />
    </group>
  );
}

function Homes({ plan, sample }: { plan: LandscapePlan; sample: (x: number, z: number) => number }) {
  const material = useMemo(() => new MeshStandardMaterial({ color: "#ffffff", vertexColors: true, roughness: 0.9, metalness: 0, flatShading: true, side: DoubleSide }), []);
  useDispose(material);
  const geos = useMemo(
    () => ({ red: houseGeometry("red"), slate: houseGeometry("slate"), tan: houseGeometry("tan"), barn: barnGeometry(), block: blockGeometry() }),
    [],
  );
  useEffect(() => () => Object.values(geos).forEach((g) => g.dispose()), [geos]);
  const sets = useMemo(() => {
    const pick = (f: (h: LandscapePlan["houses"][number]) => boolean) => plan.houses.filter(f);
    return {
      red: pick((h) => h.kind === "house" && h.tint < 0.45),
      slate: pick((h) => h.kind === "house" && h.tint >= 0.45 && h.tint < 0.75),
      tan: pick((h) => h.kind === "house" && h.tint >= 0.75),
      barn: pick((h) => h.kind === "barn"),
      block: pick((h) => h.kind === "block"),
    };
  }, [plan]);
  const place = useMemo(
    () => (h: LandscapePlan["houses"][number], o: Object3D) => {
      o.position.set(h.x, sample(h.x, h.z) - 0.05, h.z);
      o.rotation.y = h.yaw;
      o.scale.set(h.w, h.h, h.d);
    },
    [sample],
  );
  const colorOf = (h: LandscapePlan["houses"][number], out: Color) => jitterTint(h.tint * 7 % 1, out, 0.2);
  return (
    <group>
      <Instanced geometry={geos.red} material={material} items={sets.red} place={place} colorOf={colorOf} />
      <Instanced geometry={geos.slate} material={material} items={sets.slate} place={place} colorOf={colorOf} />
      <Instanced geometry={geos.tan} material={material} items={sets.tan} place={place} colorOf={colorOf} />
      <Instanced geometry={geos.barn} material={material} items={sets.barn} place={place} colorOf={colorOf} />
      <Instanced geometry={geos.block} material={material} items={sets.block} place={place} colorOf={colorOf} />
    </group>
  );
}

/** The skyline's windows glow in step with the dark. */
function lightWindows(material: MeshStandardMaterial, nightness: number): void {
  material.emissiveIntensity = nightness * 1.7;
}

function Skyline({ plan, sample }: { plan: LandscapePlan; sample: (x: number, z: number) => number }) {
  const textures = useMemo(() => windowTextures(), []);
  useEffect(() => () => { textures.color.dispose(); textures.emissive.dispose(); }, [textures]);
  const material = useMemo(() => new MeshStandardMaterial({
      color: "#ffffff",
      vertexColors: true,
      map: textures.color,
      emissiveMap: textures.emissive,
      emissive: new Color("#ffcf8a"),
      emissiveIntensity: 0,
      roughness: 0.8,
      metalness: 0.05,
    }), [textures]);
  useDispose(material);
  // The windows come on with the dark.
  useSkyFrame((sky) => lightWindows(material, sky.nightness), material);
  const geometry = useMemo(() => buildTowers(plan.towers, sample), [plan, sample]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry} material={material} raycast={none} />;
}
