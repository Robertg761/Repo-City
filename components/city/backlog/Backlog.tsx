"use client";

/**
 * The crowd: every open issue and pull request that is not a hero, drawn as
 * instanced cheap forms (PLAN.md 76.9). Reads `city.backlog`.
 *
 * COST. One `InstancedMesh` per form present -- seven issue forms, four pull
 * request forms -- plus one mesh of halos and one of smoke: at most thirteen
 * draw calls whatever the count. The pull request modifiers (worker, failing
 * checks beacon, stop board, approval flag) are baked into their form and
 * switched per instance in the shader, so they cost none.
 *
 * NOTHING PER FRAME ON THE CPU. Matrices and colours are written once per
 * city. Flames, blinkers, flags, workers, smoke and the reveal itself all run
 * in the vertex shader from two uniforms (`material.ts`); `useFrame` sets
 * those two numbers and that is all. Hover and selection rewrite the colour of
 * the one or two instances involved.
 *
 * `castShadow` is off: fifteen hundred small casters would cost a shadow pass
 * for shapes a couple of pixels wide. They still receive the city's shadows.
 *
 * PICKING. Each form mesh raycasts through `pick.ts`: a box per instance and a
 * slab test, reported as three's own `InstancedMesh` hits, so hover, click and
 * the inspector go through `useInstanceHandlers(ids)` exactly as buildings do.
 *
 * The low quality tier drops the smoke and the halos (a new `crowdEffects`
 * flag, read defensively until `quality.ts` carries it). It never drops a
 * crowd object: every open issue stays on the map (PLAN.md 76.13).
 */

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  Color,
  IcosahedronGeometry,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Object3D,
  PlaneGeometry,
  type InstancedMesh,
  type Intersection,
  type Raycaster,
} from "three";
import type { CityModel } from "@/types/city";
import { useCityStore } from "@/store/useCityStore";
import { HIGHLIGHT, SELECT_LIFT, desaturate, mix, type SceneAtmosphere } from "../palette";
import { useQuality, type QualitySettings } from "../quality";
import { useInstanceHandlers } from "../useEntity";
import { useRevealClock } from "../useReveal";
import { formGeometry } from "./forms";
import {
  CROWD_CLOCK,
  DATA_ATTRIBUTE,
  PAINT_A_ATTRIBUTE,
  PAINT_B_ATTRIBUTE,
  PHASE_ATTRIBUTE,
  crowdMaterial,
  haloMaterial,
  linearRgb,
  smokeMaterial,
} from "./material";
import { raycastTable, pickTable } from "./pick";
import { planCrowd, type CrowdGroup, type HaloSpec, type PuffSpec } from "./plan";
import { useDevBacklog } from "./useDevBacklog";

const scratch = new Object3D();
const scratchColor = new Color();

/** Where the crowd's clock stops for a viewer who asked for less motion. */
const STILL_TIME = 0.4;

/** A viewer who asked the system for less motion gets a crowd that holds still. */
const prefersStill = (): boolean =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Whether the crowd's smoke and halos draw. `crowdEffects` is proposed for
 * `quality.ts` (PLAN.md 76.9); until it exists, the low tier is the answer.
 */
export function crowdEffectsOn(quality: QualitySettings): boolean {
  const flag = (quality as QualitySettings & { crowdEffects?: boolean }).crowdEffects;
  return typeof flag === "boolean" ? flag : quality.tier !== "low";
}

/** Hover and selection, over the instance's own state and age tint. */
function litColor(tint: string, hovered: boolean, selected: boolean): Color {
  if (selected) return scratchColor.set(mix(tint, SELECT_LIFT, 0.5)).multiplyScalar(1.5);
  if (hovered) return scratchColor.set(mix(tint, HIGHLIGHT, 0.45)).multiplyScalar(1.35);
  return scratchColor.set(tint);
}

function FormInstances({
  group,
  atmosphere,
}: {
  group: CrowdGroup;
  atmosphere: SceneAtmosphere;
}) {
  const meshRef = useRef<InstancedMesh>(null);
  const handlers = useInstanceHandlers(group.ids);
  const count = group.items.length;

  const indexOf = useMemo(() => new Map(group.ids.map((id, i) => [id, i])), [group]);
  // Only re-render when the hover or selection is one of ours.
  const hovered = useCityStore((s) => (s.hoveredId !== null && indexOf.has(s.hoveredId) ? s.hoveredId : null));
  const selected = useCityStore((s) =>
    s.selectedId !== null && indexOf.has(s.selectedId) ? s.selectedId : null,
  );

  const geometry = useMemo(() => {
    const own = formGeometry(group.form, atmosphere.desaturation).clone();
    const phase = new Float32Array(count);
    const data = new Float32Array(count * 3);
    const paintA = new Float32Array(count * 3);
    const paintB = new Float32Array(count * 3);
    // Paint is toned with the city, like every colour baked into the forms.
    const toned = new Map<string, [number, number, number]>();
    const linear = (hex: string) => {
      let hit = toned.get(hex);
      if (!hit) {
        hit = linearRgb(desaturate(hex, atmosphere.desaturation));
        toned.set(hex, hit);
      }
      return hit;
    };
    group.items.forEach((item, i) => {
      phase[i] = item.phase;
      data[i * 3] = item.mask;
      data[i * 3 + 1] = item.appearAt;
      data[i * 3 + 2] = item.glow;
      paintA.set(linear(item.paint[0]), i * 3);
      paintB.set(linear(item.paint[1]), i * 3);
    });
    own.setAttribute(PHASE_ATTRIBUTE, new InstancedBufferAttribute(phase, 1));
    own.setAttribute(DATA_ATTRIBUTE, new InstancedBufferAttribute(data, 3));
    own.setAttribute(PAINT_A_ATTRIBUTE, new InstancedBufferAttribute(paintA, 3));
    own.setAttribute(PAINT_B_ATTRIBUTE, new InstancedBufferAttribute(paintB, 3));
    return own;
  }, [group, count, atmosphere.desaturation]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  const material = useMemo(() => crowdMaterial(), []);
  useEffect(() => () => material.dispose(), [material]);

  const pick = useMemo(() => pickTable(group.items), [group]);
  const raycast = useMemo(
    () => (raycaster: Raycaster, intersects: Intersection[]) => {
      const mesh = meshRef.current;
      if (mesh) raycastTable(pick, count, mesh, raycaster, intersects, CROWD_CLOCK.uReveal.value);
    },
    [pick, count],
  );

  // Poses and base colours, once per city.
  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    group.items.forEach((item, i) => {
      scratch.position.set(item.x, item.y, item.z);
      scratch.rotation.set(0, item.rotationY, 0);
      scratch.scale.set(item.scale[0], item.scale[1], item.scale[2]);
      scratch.updateMatrix();
      mesh.setMatrixAt(i, scratch.matrix);
      mesh.setColorAt(i, scratchColor.set(item.tint));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [group, geometry]);

  // Hover and selection: rewrite only the instances whose look changed.
  const lit = useRef<number[]>([]);
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh || !mesh.instanceColor) return;
    for (const i of lit.current) mesh.setColorAt(i, scratchColor.set(group.items[i].tint));
    const now: number[] = [];
    for (const id of [hovered, selected]) {
      const i = id === null ? undefined : indexOf.get(id);
      if (i === undefined || now.includes(i)) continue;
      now.push(i);
      mesh.setColorAt(i, litColor(group.items[i].tint, id === hovered, group.ids[i] === selected));
    }
    lit.current = now;
    mesh.instanceColor.needsUpdate = true;
  }, [hovered, selected, group, indexOf, geometry]);

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, count]}
      receiveShadow
      castShadow={false}
      frustumCulled={false}
      raycast={raycast}
      {...handlers}
    />
  );
}

/** Additive glows round every lamp and fire: one mesh for the whole crowd. */
function Halos({ halos }: { halos: readonly HaloSpec[] }) {
  const geometry = useMemo(() => {
    const plane = new PlaneGeometry(1, 1);
    const own = new InstancedBufferGeometry();
    own.setIndex(plane.getIndex());
    own.setAttribute("position", plane.getAttribute("position"));
    const at = new Float32Array(halos.length * 3);
    const color = new Float32Array(halos.length * 3);
    const data = new Float32Array(halos.length * 4);
    halos.forEach((halo, i) => {
      at.set(halo.position, i * 3);
      color.set(linearRgb(halo.color), i * 3);
      data.set([halo.phase, halo.rate, halo.size, halo.appearAt], i * 4);
    });
    own.setAttribute("haloAt", new InstancedBufferAttribute(at, 3));
    own.setAttribute("haloColor", new InstancedBufferAttribute(color, 3));
    own.setAttribute("haloData", new InstancedBufferAttribute(data, 4));
    own.instanceCount = halos.length;
    return own;
  }, [halos]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const material = useMemo(() => haloMaterial(), []);
  useEffect(() => () => material.dispose(), [material]);

  return <mesh geometry={geometry} material={material} frustumCulled={false} renderOrder={3} />;
}

/** Smoke over the fires: every puff in the city in one instanced mesh. */
function Smoke({ puffs }: { puffs: readonly PuffSpec[] }) {
  const meshRef = useRef<InstancedMesh>(null);
  const geometry = useMemo(() => {
    const own = new IcosahedronGeometry(0.55, 0);
    const phase = new Float32Array(puffs.length);
    const data = new Float32Array(puffs.length * 3);
    puffs.forEach((puff, i) => {
      phase[i] = puff.phase;
      data[i * 3 + 1] = puff.appearAt;
    });
    own.setAttribute(PHASE_ATTRIBUTE, new InstancedBufferAttribute(phase, 1));
    own.setAttribute(DATA_ATTRIBUTE, new InstancedBufferAttribute(data, 3));
    return own;
  }, [puffs]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const material = useMemo(() => smokeMaterial("#6d6a67"), []);
  useEffect(() => () => material.dispose(), [material]);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    puffs.forEach((puff, i) => {
      scratch.position.set(puff.position[0], puff.position[1], puff.position[2]);
      scratch.rotation.set(0, puff.phase * 6.28, 0);
      scratch.scale.setScalar(1);
      scratch.updateMatrix();
      mesh.setMatrixAt(i, scratch.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [puffs, geometry]);

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, puffs.length]}
      frustumCulled={false}
      renderOrder={2}
    />
  );
}

export default function Backlog({
  city,
  atmosphere,
}: {
  city: CityModel;
  atmosphere: SceneAtmosphere;
}) {
  useDevBacklog(city);
  const plan = useMemo(() => planCrowd(city), [city]);
  const quality = useQuality();
  const effects = crowdEffectsOn(quality);
  const clock = useRevealClock();
  const still = useMemo(() => prefersStill(), []);

  // The crowd's only per-frame work: two numbers.
  useFrame(({ clock: three }) => {
    CROWD_CLOCK.uTime.value = still ? STILL_TIME : three.elapsedTime;
    const since = performance.now() - clock.current;
    CROWD_CLOCK.uReveal.value = Number.isFinite(since) ? since : -1e6;
  });

  if (plan.count === 0) return null;

  return (
    <group>
      {plan.groups.map((group) => (
        <FormInstances key={group.form} group={group} atmosphere={atmosphere} />
      ))}
      {effects && plan.halos.length > 0 && <Halos halos={plan.halos} />}
      {effects && plan.smoke.length > 0 && <Smoke puffs={plan.smoke} />}
    </group>
  );
}
