"use client";

/**
 * Village fields and hedgerows (PLAN.md 76.5, "Village", step 7). Reads
 * `city.props.fields`; a model without fields draws nothing.
 *
 * `models/buildings/farmland.ts` plans the instances: the earth of each
 * field, its crop rows, a hedge round it with a gateway, round bales in the
 * hay meadows and a tree or two in the hedgerow. Everything is instanced,
 * so a village of fourteen fields is about nine draw calls: the earth, four
 * crops, the hedges, the bales, and the hedgerow trees.
 *
 * The fields come up with the district ground, rising out of the earth
 * rather than scaling in from the middle of the village.
 */

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Color, Object3D, type Group, type InstancedMesh, type BufferGeometry } from "three";
import type { CityModel } from "@/types/city";
import {
  CROP_GROUND,
  CROP_ROW,
  CROP_ROWS,
  HEDGE_HEIGHT,
  baleGeometry,
  groundGeometry,
  hedgeGeometry,
  planFarmland,
  rowGeometry,
  type Crop,
  type Placed,
} from "./models/buildings/farmland";
import { tintedMaterial } from "./models/props/material";
import { SPECIES_LEAF, treeGeometry } from "./models/props/trees";
import { desaturate, mix, type SceneAtmosphere } from "./palette";
import { revealScale } from "./reveal";
import { useRevealClock } from "./useReveal";

const scratch = new Object3D();
const scratchColor = new Color();

const HEDGE_GREEN = "#4f7a3f";

interface Instance extends Placed {
  scale: [number, number, number];
  color: string;
}

function Instances({
  geometry,
  instances,
  shadows = false,
  y = 0,
  roughness = 1,
  tinted = false,
}: {
  geometry: BufferGeometry;
  instances: readonly Instance[];
  shadows?: boolean;
  y?: number;
  roughness?: number;
  /** Paint only the masked part (a tree's crown), not the whole instance. */
  tinted?: boolean;
}) {
  const meshRef = useRef<InstancedMesh>(null);
  const material = useMemo(
    () => (tinted ? tintedMaterial({ roughness, flatShading: true }) : null),
    [tinted, roughness],
  );
  useEffect(() => () => material?.dispose(), [material]);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    instances.forEach((instance, i) => {
      scratch.position.set(instance.x, y, instance.z);
      scratch.rotation.set(0, instance.yaw, 0);
      scratch.scale.set(instance.scale[0], instance.scale[1], instance.scale[2]);
      scratch.updateMatrix();
      mesh.setMatrixAt(i, scratch.matrix);
      scratchColor.set(instance.color);
      mesh.setColorAt(i, scratchColor);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [instances, y]);

  if (instances.length === 0) return null;
  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material ?? undefined, instances.length]}
      castShadow={shadows}
      receiveShadow
      raycast={() => null}
    >
      {!material && <meshStandardMaterial vertexColors flatShading roughness={roughness} metalness={0} />}
    </instancedMesh>
  );
}

export default function Fields({
  city,
  atmosphere,
}: {
  city: CityModel;
  atmosphere: SceneAtmosphere;
}) {
  const fields = city.props.fields;
  const plan = useMemo(() => planFarmland(fields ?? []), [fields]);
  const desaturation = atmosphere.desaturation;
  const districts = city.districts;

  const layers = useMemo(() => {
    const ground: Instance[] = plan.ground.map((g) => ({
      ...g,
      scale: [g.w, 1, g.d],
      color: desaturate(CROP_GROUND[g.crop], desaturation),
    }));
    const rows = new Map<Crop, Instance[]>();
    for (const row of plan.rows) {
      const spec = CROP_ROWS[row.crop];
      const list = rows.get(row.crop) ?? [];
      list.push({
        ...row,
        scale: [row.length, spec.height, spec.width],
        color: desaturate(CROP_ROW[row.crop], desaturation),
      });
      rows.set(row.crop, list);
    }
    const hedges: Instance[] = plan.hedges.map((h) => ({
      ...h,
      scale: [h.length, 0.85 + h.shade * 0.3, 1],
      color: desaturate(mix(HEDGE_GREEN, "#6d9448", h.shade * 0.6), desaturation),
    }));
    const bales: Instance[] = plan.bales.map((b) => {
      const s = 0.9 + b.size * 0.25;
      return { ...b, scale: [s, s, s], color: "#ffffff" };
    });
    const trees: Instance[] = plan.trees.map((t) => ({
      ...t,
      scale: [t.scale, t.scale * (0.95 + t.shade * 0.15), t.scale],
      color: desaturate(mix(SPECIES_LEAF.broadleaf, "#3f6b3a", t.shade * 0.5), desaturation),
    }));
    return { ground, rows, hedges, bales, trees };
  }, [plan, desaturation]);

  // The fields come up with the first districts, rising out of the ground.
  const appearAt = useMemo(
    () => (districts.length ? Math.min(...districts.map((d) => d.appearAt)) : 300),
    [districts],
  );
  const clock = useRevealClock();
  const group = useRef<Group>(null);
  const settled = useRef(false);
  useEffect(() => {
    settled.current = false;
  }, [clock, appearAt]);
  useFrame(() => {
    const node = group.current;
    if (!node || settled.current) return;
    const s = revealScale(performance.now(), clock.current, appearAt);
    node.visible = s > 0.002;
    node.scale.set(1, Math.max(s, 0.002), 1);
    if (s >= 1) settled.current = true;
  });

  if (!fields || fields.length === 0) return null;

  return (
    <group ref={group} visible={false}>
      <Instances geometry={groundGeometry()} instances={layers.ground} y={-0.012} />
      {[...layers.rows.entries()].map(([crop, list]) => (
        <Instances key={crop} geometry={rowGeometry(crop)} instances={list} y={0.005} roughness={crop === 0 ? 0.9 : 1} />
      ))}
      <Instances geometry={hedgeGeometry()} instances={layers.hedges} shadows roughness={0.95} />
      <Instances geometry={baleGeometry()} instances={layers.bales} shadows roughness={0.9} />
      <Instances
        geometry={treeGeometry("broadleaf", atmosphere.desaturation)}
        instances={layers.trees}
        shadows
        tinted
        y={HEDGE_HEIGHT * 0.1}
      />
    </group>
  );
}
