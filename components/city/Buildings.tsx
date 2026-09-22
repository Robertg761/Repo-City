"use client";

/**
 * The building layer (PLAN.md sections 9, 37, 38).
 *
 * Eight procedural archetypes -- house, parapet low-rise, pitched low-rise,
 * sawtooth warehouse, setback mid-rise, mechanical mid-rise, stepped tower,
 * crowned tower -- one `InstancedMesh` each, plus one mesh of lit windows and
 * two of rooftop props. Three hundred buildings therefore cost about eleven
 * draw calls, and every one of them has a roof, a cornice, windows and a door
 * instead of being a stretched box.
 *
 * Which archetype a building wears is decided in `models/buildings`,
 * deterministically, from its tier, kind, language family, role and a hash of
 * its path. Height and footprint still come from the generator's `size`; the
 * archetype only says what shape that volume takes. The language never
 * changes the art style (section 9).
 *
 * Picking still goes through `event.instanceId`, now into the per-archetype
 * `ids` array from `planBuildings`. Hover tints the instance, selection tints
 * it harder, and the ground ring does the rest; neither spawns a mesh.
 */

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Color, Object3D, type InstancedMesh } from "three";
import type { Building } from "@/types/city";
import { useCityStore } from "@/store/useCityStore";
import {
  PROP_MESH,
  archetypeGeometry,
  propBlockGeometry,
  propTankGeometry,
  windowPanelGeometry,
} from "./models/buildings/geometry";
import {
  planBuildings,
  type ArchetypeGroup,
  type CityBuildingPlan,
  type PropInstance,
} from "./models/buildings/placement";
import {
  WINDOW_COLOR,
  buildingColor,
  desaturate,
  mix,
  stateTint,
  type SceneAtmosphere,
} from "./palette";
import { revealSettle } from "./reveal";
import { useInstanceHandlers } from "./useEntity";
import { useRevealClock } from "./useReveal";

const scratch = new Object3D();
const scratchColor = new Color();

/** Below this the instance is scaled to nothing rather than drawn as a speck. */
const VISIBLE = 0.002;

function ArchetypeInstances({
  plan,
  group,
  atmosphere,
}: {
  plan: CityBuildingPlan;
  group: ArchetypeGroup;
  atmosphere: SceneAtmosphere;
}) {
  const meshRef = useRef<InstancedMesh>(null);
  const clock = useRevealClock();
  const settled = useRef(false);
  const handlers = useInstanceHandlers(group.ids);
  const hoveredId = useCityStore((s) => s.hoveredId);
  const selectedId = useCityStore((s) => s.selectedId);

  const geometry = useMemo(() => archetypeGeometry(group.archetype), [group.archetype]);
  const instances = useMemo(
    () => plan.instances.slice(group.offset, group.offset + group.count),
    [plan, group],
  );
  const baseColors = useMemo(
    () =>
      instances.map((instance) =>
        desaturate(buildingColor(instance.building.colorIndex), atmosphere.desaturation),
      ),
    [instances, atmosphere.desaturation],
  );

  useEffect(() => {
    settled.current = false;
  }, [clock, plan, group]);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh || settled.current) return;
    const now = performance.now();
    let done = true;

    for (let i = 0; i < instances.length; i++) {
      const instance = instances[i];
      const b = instance.building;
      // A settle rather than a plain ease-out: the building rises a few
      // percent past its height and drops onto it, which reads as
      // construction rather than inflation (PLAN.md section 43).
      const grow = revealSettle(now, clock.current, b.appearAt);
      if (grow < 1) done = false;
      const height = Math.max(b.size[1] * grow, 0.0001);
      const visible = grow > VISIBLE;
      // The door's quarter turn may have swapped the model's axes; the plot
      // the generator reserved is unchanged either way.
      const sx = instance.swapped ? b.size[2] : b.size[0];
      const sz = instance.swapped ? b.size[0] : b.size[2];
      scratch.position.set(b.position[0], b.position[1], b.position[2]);
      scratch.rotation.set(0, instance.yaw, 0);
      scratch.scale.set(visible ? sx : 0, height, visible ? sz : 0);
      scratch.updateMatrix();
      mesh.setMatrixAt(i, scratch.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (done) settled.current = true;
  });

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    for (let i = 0; i < instances.length; i++) {
      const instance = instances[i];
      const b = instance.building;
      scratchColor.set(stateTint(baseColors[i], b.id === hoveredId, b.id === selectedId));
      // A little hue and value drift inside the district's own colour: a block
      // of twelve buildings should not be twelve copies (PLAN.md section 4).
      scratchColor.offsetHSL(instance.hueShift, instance.satShift, instance.lightShift);
      mesh.setColorAt(i, scratchColor);
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [instances, baseColors, hoveredId, selectedId]);

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, undefined, instances.length]}
      castShadow
      receiveShadow
      frustumCulled={false}
      {...handlers}
    >
      {/* Vertex colours carry the roof, cornice, door and window shading; the
          instance colour carries the district. One material, one draw call. */}
      <meshStandardMaterial vertexColors flatShading roughness={0.82} metalness={0} />
    </instancedMesh>
  );
}

/**
 * The lit windows, as one mesh of quads sitting just proud of the dark panes
 * baked into every archetype. `litWindowShare` decides which buildings are
 * awake; the dark panes keep the facades readable in daylight either way
 * (PLAN.md section 19).
 */
function LitWindows({
  plan,
  atmosphere,
}: {
  plan: CityBuildingPlan;
  atmosphere: SceneAtmosphere;
}) {
  const meshRef = useRef<InstancedMesh>(null);
  const clock = useRevealClock();
  const settled = useRef(false);
  const geometry = useMemo(() => windowPanelGeometry(), []);
  const windows = plan.windows;

  useEffect(() => {
    settled.current = false;
  }, [clock, plan]);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh || settled.current) return;
    const now = performance.now();
    let done = true;

    for (let i = 0; i < windows.length; i++) {
      const w = windows[i];
      const instance = plan.instances[w.buildingIndex];
      const b = instance.building;
      const grow = revealSettle(now, clock.current, b.appearAt);
      if (grow < 1) done = false;
      const height = b.size[1] * grow;
      const visible = grow > VISIBLE;
      const sx = instance.swapped ? b.size[2] : b.size[0];
      const sz = instance.swapped ? b.size[0] : b.size[2];
      const cos = Math.cos(instance.yaw);
      const sin = Math.sin(instance.yaw);
      const lx = w.ox * sx;
      const lz = w.oz * sz;
      scratch.position.set(
        b.position[0] + lx * cos + lz * sin,
        b.position[1] + w.oy * height,
        b.position[2] - lx * sin + lz * cos,
      );
      scratch.rotation.set(0, instance.yaw + w.panelYaw, 0);
      const width = w.uw * (w.alongX ? sx : sz);
      scratch.scale.set(visible ? width : 0, visible ? w.uh * height : 0, 1);
      scratch.updateMatrix();
      mesh.setMatrixAt(i, scratch.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (done) settled.current = true;
  });

  if (windows.length === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, undefined, windows.length]}
      frustumCulled={false}
    >
      <meshStandardMaterial
        color={WINDOW_COLOR}
        emissive={WINDOW_COLOR}
        emissiveIntensity={0.15 + atmosphere.windowGlow * 1.1}
        roughness={0.4}
        metalness={0}
        toneMapped={false}
      />
    </instancedMesh>
  );
}

/** Air-conditioning units, vents, skylights, masts and water tanks. */
function RoofProps({
  plan,
  props,
  geometry,
  atmosphere,
}: {
  plan: CityBuildingPlan;
  props: PropInstance[];
  geometry: ReturnType<typeof propBlockGeometry>;
  atmosphere: SceneAtmosphere;
}) {
  const meshRef = useRef<InstancedMesh>(null);
  const clock = useRevealClock();
  const settled = useRef(false);

  const colors = useMemo(
    () =>
      props.map((prop) => {
        const base =
          prop.kind === "skylight" ? mix("#9fb4bd", "#dfe6e6", 0.5) : prop.kind === "antenna" ? "#8d9195" : "#a7a9a8";
        return desaturate(base, atmosphere.desaturation);
      }),
    [props, atmosphere.desaturation],
  );

  useEffect(() => {
    settled.current = false;
  }, [clock, plan, props]);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    for (let i = 0; i < props.length; i++) {
      scratchColor.set(colors[i]);
      mesh.setColorAt(i, scratchColor);
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [props, colors]);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh || settled.current) return;
    const now = performance.now();
    let done = true;

    for (let i = 0; i < props.length; i++) {
      const prop = props[i];
      const instance = plan.instances[prop.buildingIndex];
      const b = instance.building;
      const grow = revealSettle(now, clock.current, b.appearAt);
      if (grow < 1) done = false;
      const height = b.size[1] * grow;
      const visible = grow > 0.98;
      const sx = instance.swapped ? b.size[2] : b.size[0];
      const sz = instance.swapped ? b.size[0] : b.size[2];
      const cos = Math.cos(instance.yaw);
      const sin = Math.sin(instance.yaw);
      const lx = prop.x * sx;
      const lz = prop.z * sz;
      scratch.position.set(
        b.position[0] + lx * cos + lz * sin,
        b.position[1] + prop.y * height,
        b.position[2] - lx * sin + lz * cos,
      );
      scratch.rotation.set(0, instance.yaw + prop.spin, 0);
      // Props arrive with the last of the settle rather than growing with the
      // building: a water tank does not inflate.
      scratch.scale.set(
        visible ? prop.size[0] : 0,
        visible ? prop.size[1] : 0,
        visible ? prop.size[2] : 0,
      );
      scratch.updateMatrix();
      mesh.setMatrixAt(i, scratch.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (done) settled.current = true;
  });

  if (props.length === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, undefined, props.length]}
      castShadow
      frustumCulled={false}
    >
      <meshStandardMaterial vertexColors flatShading roughness={0.7} metalness={0.1} />
    </instancedMesh>
  );
}

export default function Buildings({
  buildings,
  atmosphere,
}: {
  buildings: readonly Building[];
  atmosphere: SceneAtmosphere;
}) {
  const plan = useMemo(
    () => planBuildings(buildings, { litShare: atmosphere.litWindowShare }),
    [buildings, atmosphere.litWindowShare],
  );
  const blockProps = useMemo(
    () => plan.props.filter((prop) => PROP_MESH[prop.kind] === "block"),
    [plan],
  );
  const tankProps = useMemo(
    () => plan.props.filter((prop) => PROP_MESH[prop.kind] === "tank"),
    [plan],
  );

  return (
    <group>
      {plan.groups.map((group) => (
        <ArchetypeInstances
          key={group.archetype}
          plan={plan}
          group={group}
          atmosphere={atmosphere}
        />
      ))}
      <LitWindows plan={plan} atmosphere={atmosphere} />
      <RoofProps
        plan={plan}
        props={blockProps}
        geometry={propBlockGeometry()}
        atmosphere={atmosphere}
      />
      <RoofProps
        plan={plan}
        props={tankProps}
        geometry={propTankGeometry()}
        atmosphere={atmosphere}
      />
    </group>
  );
}
