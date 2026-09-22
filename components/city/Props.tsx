"use client";

/**
 * Cosmetic props (PLAN.md sections 36 stage 8, 37, 38): up to a hundred trees
 * of four species, swaying a little, a run of street lamps, and up to 150 small things --
 * benches, bins, bus stops, bushes, flower beds and parked cars -- placed
 * along the roads and around the parks.
 *
 * Everything is instanced and everything is merged: a bus stop is six boxes in
 * one geometry, so the entire layer costs about a dozen draw calls at any city
 * size. They are still the first thing section 63 says to cut.
 *
 * Props are never selectable: they have no meaning to explain.
 */

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Color, Object3D, type InstancedMesh } from "three";
import { prngFor } from "@/lib/city/seed";
import type { CityModel } from "@/types/city";
import { LAMP_POST, WINDOW_COLOR, desaturate, mix, type SceneAtmosphere } from "./palette";
import { CAR_COLORS, parkedGeometry, type VehicleBody } from "./models/vehicles/shapes";
import {
  furnitureGeometry,
  placeStreetProps,
  type FurnitureKind,
  type ParkedVehicle,
  type PlacedProp,
} from "./models/props/streetFurniture";
import { WIND_CLOCK, tintedMaterial } from "./models/props/material";
import {
  SWAY_AMOUNT,
  SWAY_BASE,
  TREE_SPECIES,
  planTrees,
  treeGeometry,
} from "./models/props/trees";
import { revealScale } from "./reveal";
import { useRevealClock } from "./useReveal";

const scratch = new Object3D();
const scratchColor = new Color();

const LAMP_CAP = 120;

/**
 * Street lamps are the smallest thing in the city that still has to read as
 * infrastructure. At the generator's scale a building is 4 to 8.5 units wide,
 * so a lamp a little under three units tall sits at about the height of a
 * first-floor window: present along the streets, never a row of bright pins
 * standing over the blocks (PLAN.md section 4).
 */
const LAMP_HEIGHT = 2.7;

/** The kinds of furniture, in the order their meshes are declared. */
const FURNITURE: readonly FurnitureKind[] = ["bench", "bin", "stop", "bush", "bed"];

/** A viewer who asked the system for less motion gets still trees. */
const prefersStill = (): boolean =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export default function Props({
  city,
  atmosphere,
}: {
  city: CityModel;
  atmosphere: SceneAtmosphere;
}) {
  const treeRefs = useRef<(InstancedMesh | null)[]>([]);
  const poleRef = useRef<InstancedMesh>(null);
  const headRef = useRef<InstancedMesh>(null);
  const furnitureRefs = useRef<(InstancedMesh | null)[]>([]);
  const parkedRefs = useRef<(InstancedMesh | null)[]>([]);
  const clock = useRevealClock();
  const settled = useRef(false);

  const { trees, species } = useMemo(() => {
    const list = planTrees(city.props.trees, city.districts, prngFor(city.seed, "trees"));
    return {
      trees: list,
      species: TREE_SPECIES.map((kind) => ({
        kind,
        trees: list.map((tree, i) => (tree.species === kind ? i : -1)).filter((i) => i >= 0),
      })).filter((group) => group.trees.length > 0),
    };
  }, [city]);

  // The wind: one clock uniform (`WIND_CLOCK`) shared by every tree. The
  // material is built once and kept; only the uniform moves per frame.
  const treeMaterial = useMemo(
    () =>
      tintedMaterial(
        { roughness: 1, flatShading: true },
        { time: WIND_CLOCK, amount: prefersStill() ? 0 : SWAY_AMOUNT, base: SWAY_BASE },
      ),
    [],
  );
  const parkedMaterial = useMemo(() => tintedMaterial({ roughness: 0.55, metalness: 0.08 }), []);
  useEffect(
    () => () => {
      treeMaterial.dispose();
      parkedMaterial.dispose();
    },
    [treeMaterial, parkedMaterial],
  );

  useFrame(({ clock: sceneClock }) => {
    WIND_CLOCK.value = sceneClock.elapsedTime;
  });

  const lamps = useMemo(() => city.props.lamps.slice(0, LAMP_CAP), [city]);

  const { furniture, parked } = useMemo(() => {
    const placed = placeStreetProps(city, prngFor(city.seed, "street-props"));
    const byBody = new Map<VehicleBody, ParkedVehicle[]>();
    for (const car of placed.parked) {
      const list = byBody.get(car.body);
      if (list) list.push(car);
      else byBody.set(car.body, [car]);
    }
    const lists: Record<FurnitureKind, PlacedProp[]> = {
      bench: placed.benches,
      bin: placed.bins,
      stop: placed.stops,
      bush: placed.bushes,
      bed: placed.beds,
    };
    return {
      furniture: FURNITURE.map((kind) => ({ kind, items: lists[kind] })).filter(
        (group) => group.items.length > 0,
      ),
      parked: [...byBody.entries()].map(([body, cars]) => ({ body, cars })),
    };
  }, [city]);

  useFrame(() => {
    if (settled.current) return;
    const now = performance.now();
    let done = true;

    species.forEach((group, g) => {
      const mesh = treeRefs.current[g];
      if (!mesh) return;
      group.trees.forEach((index, slot) => {
        const tree = trees[index];
        const grow = revealScale(now, clock.current, 700 + index * 12);
        if (grow < 1) done = false;
        const size = tree.scale * grow;
        scratch.rotation.set(0, tree.rotation, 0);
        scratch.position.set(tree.position[0], 0, tree.position[2]);
        scratch.scale.set(size, size * tree.stretch, size);
        scratch.updateMatrix();
        mesh.setMatrixAt(slot, scratch.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
    });

    const pole = poleRef.current;
    const head = headRef.current;
    if (pole && head) {
      lamps.forEach((position, i) => {
        const grow = revealScale(now, clock.current, 760 + i * 8);
        if (grow < 1) done = false;
        scratch.rotation.set(0, 0, 0);
        scratch.scale.setScalar(grow);
        scratch.position.set(position[0], LAMP_HEIGHT * 0.5 * grow, position[2]);
        scratch.updateMatrix();
        pole.setMatrixAt(i, scratch.matrix);
        scratch.position.set(position[0], (LAMP_HEIGHT + 0.09) * grow, position[2]);
        scratch.updateMatrix();
        head.setMatrixAt(i, scratch.matrix);
      });
      pole.instanceMatrix.needsUpdate = true;
      head.instanceMatrix.needsUpdate = true;
    }

    // The small props come in last, after the trees: the city furnishes
    // itself once it has grown (PLAN.md section 43).
    furniture.forEach((group, g) => {
      const mesh = furnitureRefs.current[g];
      if (!mesh) return;
      group.items.forEach((item, i) => {
        const grow = revealScale(now, clock.current, 900 + i * 9);
        if (grow < 1) done = false;
        scratch.position.set(item.position[0], 0, item.position[2]);
        scratch.rotation.set(0, item.rotationY, 0);
        scratch.scale.setScalar(item.scale * grow);
        scratch.updateMatrix();
        mesh.setMatrixAt(i, scratch.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
    });

    parked.forEach((group, g) => {
      const mesh = parkedRefs.current[g];
      if (!mesh) return;
      group.cars.forEach((car, i) => {
        const grow = revealScale(now, clock.current, 940 + i * 11);
        if (grow < 1) done = false;
        scratch.position.set(car.position[0], 0.1, car.position[2]);
        scratch.rotation.set(0, car.rotationY, 0);
        scratch.scale.setScalar(grow);
        scratch.updateMatrix();
        mesh.setMatrixAt(i, scratch.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
    });

    if (done) settled.current = true;
  });

  // A new city, or a new tone -- which rebuilds the tone-keyed geometries and
  // with them the meshes -- has to lay every instance out again.
  useEffect(() => {
    settled.current = false;
  }, [city, atmosphere.desaturation]);

  // Per-instance colour: the crowns carry their seeded leaf tint, the parked
  // cars their paint. Everything else is coloured in its merged geometry.
  useEffect(() => {
    species.forEach((group, g) => {
      const mesh = treeRefs.current[g];
      if (!mesh) return;
      group.trees.forEach((index, slot) => {
        scratchColor.set(desaturate(trees[index].tint, atmosphere.desaturation));
        mesh.setColorAt(slot, scratchColor);
      });
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    });
    parked.forEach((group, g) => {
      const mesh = parkedRefs.current[g];
      if (!mesh) return;
      group.cars.forEach((car, i) => {
        scratchColor.set(
          desaturate(CAR_COLORS[car.colorIndex % CAR_COLORS.length], atmosphere.desaturation),
        );
        mesh.setColorAt(i, scratchColor);
      });
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    });
  }, [species, trees, parked, atmosphere.desaturation]);

  return (
    <group>
      {species.map((group, g) => (
        <instancedMesh
          key={group.kind}
          ref={(mesh) => {
            treeRefs.current[g] = mesh;
          }}
          args={[
            treeGeometry(group.kind, atmosphere.desaturation),
            undefined,
            group.trees.length,
          ]}
          castShadow
          frustumCulled={false}
        >
          <primitive object={treeMaterial} attach="material" />
        </instancedMesh>
      ))}

      {lamps.length > 0 && (
        <>
          <instancedMesh
            ref={poleRef}
            args={[undefined, undefined, lamps.length]}
            castShadow
            frustumCulled={false}
          >
            <cylinderGeometry args={[0.07, 0.095, LAMP_HEIGHT, 5]} />
            <meshStandardMaterial
              color={desaturate(LAMP_POST, atmosphere.desaturation)}
              roughness={0.7}
              metalness={0.2}
            />
          </instancedMesh>
          <instancedMesh ref={headRef} args={[undefined, undefined, lamps.length]} frustumCulled={false}>
            <boxGeometry args={[0.32, 0.16, 0.32]} />
            <meshStandardMaterial
              color={mix(WINDOW_COLOR, "#ffffff", 0.3)}
              // Daylight: the lamps are lit fixtures, not beacons. The glow
              // rises with the city's lit-window share, so a quiet city's
              // lamps go dim with its windows.
              emissiveIntensity={0.1 + atmosphere.windowGlow * 1.1}
              emissive={WINDOW_COLOR}
              toneMapped={false}
            />
          </instancedMesh>
        </>
      )}

      {furniture.map((group, g) => (
        <instancedMesh
          key={group.kind}
          ref={(mesh) => {
            furnitureRefs.current[g] = mesh;
          }}
          args={[
            furnitureGeometry(group.kind, atmosphere.desaturation),
            undefined,
            group.items.length,
          ]}
          castShadow
          frustumCulled={false}
        >
          <meshStandardMaterial roughness={0.9} vertexColors />
        </instancedMesh>
      ))}

      {parked.map((group, g) => (
        <instancedMesh
          key={group.body}
          ref={(mesh) => {
            parkedRefs.current[g] = mesh;
          }}
          args={[parkedGeometry(group.body), undefined, group.cars.length]}
          castShadow
          frustumCulled={false}
        >
          <primitive object={parkedMaterial} attach="material" />
        </instancedMesh>
      ))}
    </group>
  );
}
