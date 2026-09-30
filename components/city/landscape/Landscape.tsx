"use client";

/**
 * The land round the city (the default; `?land=classic` is the flat field),
 * drawn from `plan.ts`:
 *
 *   LandTerrain   the rolling ground itself, in the ground shader (`ground.tsx`),
 *                 and the "nothing here" click target the old landscape was
 *   Landscape     everything on it: banked water that reflects the sky, roads
 *                 (a motorway keeps its barrier) and bridges that rest on the
 *                 banks, irregular fields with hedgerows, woods of the city's
 *                 own tree models, houses and barns of the city's own models
 *                 with windows that light at night, a skyline, and the verge
 *                 along the plot's edge
 *
 * Everything is merged or instanced, lean levels only: a few dozen draw
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
} from "three";
import { useCityStore } from "@/store/useCityStore";
import type { CityModel } from "@/types/city";
import type { SceneAtmosphere } from "../palette";
import { useQuality } from "../quality";
import { useSkyFrame } from "../sky";
import { treeGeometry, SPECIES_LEAF, type TreeSpecies } from "../models/props/trees";
import { tintedMaterial } from "../models/props/material";
import { tiledSurface } from "../textures/surfaces";
import { wasDrag } from "../useEntity";
import {
  buildBanks,
  buildBarrier,
  mergeAll,
  buildBridges,
  buildFields,
  buildHedgeTubes,
  buildRibbon,
  buildStreets,
  buildTowers,
  buildWater,
  roadHeight,
  roadTexture,
  terrainPainter,
  windowTextures,
} from "./build";
import { CTL_REACH } from "./ctl";
import Grass from "./grass";
import Homes from "./Homes";
import { useLand } from "./LandProvider";
import { patchLand, useLandGround } from "./ground";
import { hedgeMaterial, patchCrops, tuneWater, waterMaterial } from "./materials";
import { landDistance, type HedgeRun, type LandscapePlan, type TreeSpot } from "./plan";

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

/** The terrain's material, patched with the ground shader: the banks use the same, so they join the land seamlessly. */
function useGroundMaterial(): MeshStandardMaterial | null {
  const ground = useLandGround();
  const { textureSize, anisotropy, tier } = useQuality();
  const lawn = useMemo(() => tiledSurface("lawn", textureSize, 1, anisotropy), [textureSize, anisotropy]);
  useEffect(() => () => lawn.dispose(), [lawn]);
  const material = useMemo(() => {
    if (!ground) return null;
    // Roughness is flat: the height the shader reads (`ground.tsx`) is what gives the ground its grain.
    const m = new MeshStandardMaterial({ color: "#ffffff", vertexColors: true, map: lawn, roughness: 1, metalness: 0 });
    patchLand(m, ground.uniforms, 0, 1, tier === "low" ? 1 : 2);
    return m;
  }, [ground, lawn, tier]);
  useEffect(() => () => material?.dispose(), [material]);
  return material;
}

export function LandTerrain() {
  const land = useLand();
  const ground = useLandGround();
  const actions = useCityStore((s) => s.actions);

  const material = useGroundMaterial();

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
function useDispose(value: { dispose(): void } | null): void {
  useEffect(() => () => value?.dispose(), [value]);
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
        <Waters plan={plan} terrainColor={atmosphere.terrainColor} />
        <Roads plan={plan} sample={sample} />
      </Later>
      <Later at={2}>
        <Fields plan={plan} sample={sample} atmosphere={atmosphere} tier={tier} />
      </Later>
      <Later at={3}>
        <Woods plan={plan} sample={sample} low={low} atmosphere={atmosphere} />
      </Later>
      <Later at={4}>
        <Homes plan={plan} sample={sample} atmosphere={atmosphere} maxHouses={low ? 90 : undefined} />
      </Later>
      {!low && (
        <Later at={6}>
          <Grass grass={atmosphere.terrainColor} limit={plan.half * CTL_REACH * 0.97} />
        </Later>
      )}
      <Later at={5}>
        {plan.towers.length > 0 && <Skyline plan={plan} sample={sample} />}
      </Later>
    </group>
  );
}

function Waters({ plan, terrainColor }: { plan: LandscapePlan; terrainColor: string }) {
  const water = useMemo(() => waterMaterial(), []);
  useDispose(water.material);
  const ground = useGroundMaterial();
  const geometries = useMemo(() => {
    const paint = terrainPainter(plan, terrainColor);
    return { banks: buildBanks(plan, paint), surface: buildWater(plan) };
  }, [plan, terrainColor]);
  useEffect(() => () => { geometries.banks.dispose(); geometries.surface.dispose(); }, [geometries]);
  // The sky it reflects and the colour of its body follow the hour; the ripples follow the clock.
  useSkyFrame((sky) => tuneWater(water.uniforms, sky), water);
  useFrame(({ clock }) => {
    water.tick(clock.elapsedTime);
  });
  if (!ground) return null;
  return (
    <group>
      <mesh geometry={geometries.banks} material={ground} receiveShadow frustumCulled={false} raycast={none} />
      <mesh geometry={geometries.surface} material={water.material} frustumCulled={false} raycast={none} renderOrder={2} />
    </group>
  );
}

function Roads({ plan, sample }: { plan: LandscapePlan; sample: (x: number, z: number) => number }) {
  const maps = useMemo(() => ({ street: roadTexture("street"), motorway: roadTexture("motorway") }), []);
  useEffect(() => () => { maps.street.dispose(); maps.motorway.dispose(); }, [maps]);
  const materials = useMemo(() => {
    const make = (map: (typeof maps)["street"]) =>
      new MeshStandardMaterial({
        color: "#ffffff",
        map,
        roughness: 0.95,
        metalness: 0,
        polygonOffset: true,
        polygonOffsetFactor: -3,
        polygonOffsetUnits: -3,
      });
    return { street: make(maps.street), motorway: make(maps.motorway) };
  }, [maps]);
  useEffect(() => () => { materials.street.dispose(); materials.motorway.dispose(); }, [materials]);
  // Every road of a kind is one mesh, and the barriers, bridges and sprawl streets are one more: a handful of draws however many roads run out.
  const parts = useMemo(() => {
    const y = roadHeight(plan, sample);
    const surface = (motorway: boolean) =>
      mergeAll(
        plan.roads
          .filter((road) => (road.style === "motorway") === motorway)
          .map((road) => buildRibbon(road.pts, road.width * 0.94, y, { along: motorway ? 14 : 5.6, from: road.drawFrom })),
      );
    // The verge the tarmac is laid on: pale gravel a stride wider than the road each side.
    const shoulder = mergeAll(plan.roads.map((road) => buildRibbon(road.pts, road.width * 0.94 + 1.6, (x, z) => y(x, z) - 0.03, { edge: "#8f8876", from: road.drawFrom })));
    const solid = mergeAll([
      buildBridges(plan),
      buildStreets(plan, sample),
      ...plan.roads.filter((road) => road.style === "motorway").map((road) => buildBarrier(road.pts, y, road.drawFrom)),
    ]);
    return { street: surface(false), motorway: surface(true), shoulder, solid };
  }, [plan, sample]);
  useEffect(() => () => Object.values(parts).forEach((g) => g.dispose()), [parts]);
  const concrete = useMemo(() => new MeshStandardMaterial({ color: "#ffffff", vertexColors: true, roughness: 0.95, metalness: 0, side: DoubleSide }), []);
  useDispose(concrete);
  const gravel = useMemo(
    () => new MeshStandardMaterial({ color: "#ffffff", vertexColors: true, roughness: 1, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    [],
  );
  useDispose(gravel);
  return (
    <group>
      <mesh geometry={parts.shoulder} material={gravel} receiveShadow raycast={none} />
      {parts.street.getAttribute("position") && <mesh geometry={parts.street} material={materials.street} receiveShadow raycast={none} />}
      {parts.motorway.getAttribute("position") && <mesh geometry={parts.motorway} material={materials.motorway} receiveShadow raycast={none} />}
      <mesh geometry={parts.solid} material={concrete} receiveShadow raycast={none} />
    </group>
  );
}

/** Hedge runs nearest the city first, so a budget that runs out costs the distance. */
const nearestFirst = (runs: readonly HedgeRun[]): HedgeRun[] =>
  [...runs].sort((a, b) => landDistance((a.x0 + a.x1) / 2, (a.z0 + a.z1) / 2) - landDistance((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2));

function Fields({
  plan,
  sample,
  atmosphere,
  tier,
}: {
  plan: LandscapePlan;
  sample: (x: number, z: number) => number;
  atmosphere: SceneAtmosphere;
  tier: "high" | "medium" | "low";
}) {
  const ground = useLandGround();
  const cropTextures = ground?.textures ?? null;
  const fieldMaterial = useMemo(() => {
    if (!cropTextures) return null;
    const m = new MeshStandardMaterial({
      color: "#ffffff",
      vertexColors: true,
      roughness: 1,
      metalness: 0,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    patchCrops(m, cropTextures);
    return m;
  }, [cropTextures]);
  useDispose(fieldMaterial);
  const { textureSize, anisotropy } = useQuality();
  const hedgeSet = useMemo(() => {
    const material = hedgeMaterial(textureSize, anisotropy);
    // The hedge's own green fades with the light.
    return {
      material,
      // By day the sun's bounce; at night a little moon and sky fill, so a near hedge is dark, not solid black.
      tune: (night: number) => {
        material.emissiveIntensity = 0.55 * (1 - night) + 0.8 * night;
      },
    };
  }, [textureSize, anisotropy]);
  const hedgeMat = hedgeSet.material;
  useDispose(hedgeMat);
  useSkyFrame((sky) => hedgeSet.tune(sky.nightness), hedgeSet);
  const geometry = useMemo(() => buildFields(plan, sample, atmosphere.desaturation), [plan, sample, atmosphere.desaturation]);
  const budget = tier === "high" ? 4200 : tier === "medium" ? 2600 : 0;
  const hedge = useMemo(
    () => (budget > 0 ? buildHedgeTubes([...plan.verge.hedges, ...nearestFirst(plan.hedges)], sample, { budget: budget + 600 }) : null),
    [plan, sample, budget],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  useDispose(hedge);
  return (
    <group>
      {fieldMaterial && <mesh geometry={geometry} material={fieldMaterial} receiveShadow raycast={none} />}
      {hedge && <mesh geometry={hedge} material={hedgeMat} receiveShadow raycast={none} />}
    </group>
  );
}

// ---------------------------------------------------------------------------
// Trees: the city's own models, one instanced draw a species
// ---------------------------------------------------------------------------

interface Placed {
  x: number;
  y: number;
  z: number;
  spot: TreeSpot;
}

const SPECIES_OF: Record<TreeSpot["kind"], TreeSpecies> = { 0: "broadleaf", 1: "conifer", 2: "broadleaf", 3: "poplar", 4: "birch" };

/** The species a spot is: a far canopy is a conifer one time in three, a broadleaf otherwise. */
function speciesOf(s: TreeSpot): TreeSpecies {
  if (s.kind === 2) return s.shade < 0.3 ? "conifer" : "broadleaf";
  return SPECIES_OF[s.kind];
}

const hsl = { h: 0, s: 0, l: 0 };
const grey = new Color(0.5, 0.5, 0.5);

/** A leaf colour a little off the species' green, by the spot's shade, drained by the city's health. */
function leafTint(species: TreeSpecies, shade: number, desaturation: number, out: Color): void {
  out.set(SPECIES_LEAF[species]).getHSL(hsl);
  const s2 = (shade * 7.31) % 1;
  const l2 = (shade * 13.7) % 1;
  out.setHSL((hsl.h + (shade - 0.5) * 0.07 + 1) % 1, Math.min(1, Math.max(0, hsl.s + (s2 - 0.5) * 0.16)), Math.min(0.8, Math.max(0.1, hsl.l + (l2 - 0.5) * 0.12)));
  if (desaturation > 0) out.lerp(grey, desaturation * 0.5);
}

function useTreeSet(spots: readonly TreeSpot[], sample: (x: number, z: number) => number, species: TreeSpecies): Placed[] {
  return useMemo(
    () => spots.filter((s) => speciesOf(s) === species).map((spot) => ({ x: spot.x, y: sample(spot.x, spot.z) - 0.1, z: spot.z, spot })),
    [spots, sample, species],
  );
}

const placeTree = (t: Placed, o: Object3D) => {
  o.position.set(t.x, t.y, t.z);
  const s = t.spot.scale;
  o.rotation.y = t.spot.shade * 6.283;
  o.scale.set(s, s * (0.9 + t.spot.shade * 0.25), s);
};

/** The city's tree material with the wind's clock but no sway: out here the trees stand still, and share the city's program. */
function useTreeMaterial(): MeshStandardMaterial {
  const { textureSize, anisotropy } = useQuality();
  const material = useMemo(
    () => tintedMaterial({ roughness: 1, flatShading: true }, { time: { value: 0 }, amount: 0, base: 1.2 }, { textureSize, anisotropy }),
    [textureSize, anisotropy],
  );
  useDispose(material);
  return material;
}

function TreeSets({ spots, sample, atmosphere }: { spots: readonly TreeSpot[]; sample: (x: number, z: number) => number; atmosphere: SceneAtmosphere }) {
  const material = useTreeMaterial();
  const b = useTreeSet(spots, sample, "broadleaf");
  const c = useTreeSet(spots, sample, "conifer");
  const p = useTreeSet(spots, sample, "poplar");
  const r = useTreeSet(spots, sample, "birch");
  const geos = useMemo(
    () => ({
      broadleaf: treeGeometry("broadleaf", atmosphere.desaturation),
      conifer: treeGeometry("conifer", atmosphere.desaturation),
      poplar: treeGeometry("poplar", atmosphere.desaturation),
      birch: treeGeometry("birch", atmosphere.desaturation),
    }),
    [atmosphere.desaturation],
  );
  const desat = atmosphere.desaturation;
  const colorB = useMemo(() => (t: Placed, out: Color) => leafTint(speciesOf(t.spot), t.spot.shade, desat, out), [desat]);
  return (
    <group>
      <Instanced geometry={geos.broadleaf} material={material} items={b} place={placeTree} colorOf={colorB} />
      <Instanced geometry={geos.conifer} material={material} items={c} place={placeTree} colorOf={colorB} />
      <Instanced geometry={geos.poplar} material={material} items={p} place={placeTree} colorOf={colorB} />
      <Instanced geometry={geos.birch} material={material} items={r} place={placeTree} colorOf={colorB} />
    </group>
  );
}

function Woods({ plan, sample, low, atmosphere }: { plan: LandscapePlan; sample: (x: number, z: number) => number; low: boolean; atmosphere: SceneAtmosphere }) {
  // The tree line along the plot's verge is drawn with the woods: one draw a species, none of them casting shadows out here.
  const spots = useMemo(() => [...(low ? plan.trees.filter((_, i) => i % 3 === 0) : plan.trees), ...plan.verge.trees], [plan, low]);
  return <TreeSets spots={spots} sample={sample} atmosphere={atmosphere} />;
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
