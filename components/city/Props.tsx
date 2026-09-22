"use client";

/**
 * Cosmetic props (PLAN.md sections 36 stage 8, 37, 38): trees of four
 * species, swaying a little, a run of street lamps, and up to 150 small
 * things -- benches, bins, bus stops, bushes, flower beds and parked cars --
 * placed along the roads and around the parks.
 *
 * How many trees and lamps depends on the settlement (PLAN.md 76.5,
 * `scale.ts`): a city keeps its hundred trees and 120 lamps, a village gets
 * 160 trees and 30 lamps, a metropolis 120 and 160, plus poplars down the
 * median of every avenue.
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
  SPECIES_LEAF,
  SWAY_AMOUNT,
  SWAY_BASE,
  TREE_CAP,
  TREE_SPECIES,
  jitterLeaf,
  planTrees,
  treeGeometry,
  type PlannedTree,
} from "./models/props/trees";
import { medianLays, medianTreeSpots, roadLays } from "./groundwork";
import { revealScale } from "./reveal";
import { MEDIAN_TREE_CAP, lampCap, thinEvenly, tierOf, treeCap } from "./scale";
import { useRevealClock } from "./useReveal";

const scratch = new Object3D();
const scratchColor = new Color();

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

/** Poplars on an avenue's median: columnar, so they stay over the median. */
const AVENUE_SPECIES = "poplar";
const AVENUE_SCALE: [number, number] = [0.72, 0.9];

/**
 * The trees down the middle of every metropolis avenue (PLAN.md 76.5), over
 * and above the settlement's own planting. None in a city, which has no
 * avenues.
 */
function avenueTrees(city: CityModel): PlannedTree[] {
  const lays = roadLays(city.roads);
  const spots = medianTreeSpots(medianLays(lays), lays, MEDIAN_TREE_CAP);
  if (spots.length === 0) return [];
  const prng = prngFor(city.seed, "avenue-trees");
  return spots.map((spot) => ({
    position: [spot.x, 0, spot.z],
    species: AVENUE_SPECIES,
    scale: prng.range(AVENUE_SCALE[0], AVENUE_SCALE[1]),
    stretch: prng.range(1, 1.12),
    rotation: prng.range(0, Math.PI * 2),
    tint: jitterLeaf(SPECIES_LEAF[AVENUE_SPECIES], prng),
  }));
}

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
    const tier = tierOf(city);
    // The first hundred exactly as a city has always planted them; a village
    // or a metropolis plants the rest from a stream of its own, so the city's
    // trees never move (`planTrees` stops at section 37's hundred).
    const list = planTrees(city.props.trees, city.districts, prngFor(city.seed, "trees"));
    const extra = city.props.trees.slice(TREE_CAP, treeCap(tier));
    if (extra.length > 0) {
      list.push(...planTrees(extra, city.districts, prngFor(city.seed, "trees-extra")));
    }
    list.push(...avenueTrees(city));
    return {
      trees: list,
      species: TREE_SPECIES.map((kind) => ({
        kind,
        trees: list.map((tree, i) => (tree.species === kind ? i : -1)).filter((i) => i >= 0),
      })).filter((group) => group.trees.length > 0),
    };
  }, [city]);
  const treeStagger = Math.min(12, 1200 / Math.max(trees.length, 1));

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

  // Per tier: a village's handful, a metropolis's avenues. Thinned evenly, so
  // a cap never leaves one end of the settlement dark.
  const lamps = useMemo(() => thinEvenly(city.props.lamps, lampCap(tierOf(city))), [city]);

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
        // Twelve milliseconds apart, as always; a planting larger than the
        // city's hundred shares the same 1.2 seconds out.
        const grow = revealScale(now, clock.current, 700 + index * treeStagger);
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
