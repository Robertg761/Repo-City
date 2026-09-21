"use client";

/**
 * Cosmetic props (PLAN.md sections 36 stage 8, 37, 38): up to 100 trees and a
 * run of street lamps, all instanced. Four draw calls for the whole layer, and
 * they are the first thing section 63 says to cut if the frame rate drops.
 *
 * Props are never selectable: they have no meaning to explain.
 */

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Object3D, type InstancedMesh } from "three";
import { prngFor } from "@/lib/city/seed";
import type { CityModel, Vec3 } from "@/types/city";
import {
  LAMP_POST,
  TREE_LEAF,
  TREE_TRUNK,
  WINDOW_COLOR,
  desaturate,
  mix,
  type SceneAtmosphere,
} from "./palette";
import { revealScale } from "./reveal";
import { useRevealClock } from "./useReveal";

const scratch = new Object3D();

const TREE_CAP = 100;
const LAMP_CAP = 120;

/**
 * Street lamps are the smallest thing in the city that still has to read as
 * infrastructure. At the generator's scale a building is 4 to 8.5 units wide,
 * so a lamp a little under three units tall sits at about the height of a
 * first-floor window: present along the streets, never a row of bright pins
 * standing over the blocks (PLAN.md section 4).
 */
const LAMP_HEIGHT = 2.7;

interface TreeInstance {
  position: Vec3;
  scale: number;
  rotation: number;
  appearAt: number;
}

export default function Props({
  city,
  atmosphere,
}: {
  city: CityModel;
  atmosphere: SceneAtmosphere;
}) {
  const trunkRef = useRef<InstancedMesh>(null);
  const leafRef = useRef<InstancedMesh>(null);
  const poleRef = useRef<InstancedMesh>(null);
  const headRef = useRef<InstancedMesh>(null);
  const clock = useRevealClock();
  const settled = useRef(false);

  const trees = useMemo<TreeInstance[]>(() => {
    const prng = prngFor(city.seed, "trees");
    return city.props.trees.slice(0, TREE_CAP).map((position, i) => ({
      position,
      scale: prng.range(0.78, 1.3),
      rotation: prng.range(0, Math.PI),
      appearAt: 700 + i * 12,
    }));
  }, [city]);

  const lamps = useMemo(() => city.props.lamps.slice(0, LAMP_CAP), [city]);

  useFrame(() => {
    if (settled.current) return;
    const now = performance.now();
    let done = true;

    const trunk = trunkRef.current;
    const leaf = leafRef.current;
    if (trunk && leaf) {
      trees.forEach((tree, i) => {
        const grow = revealScale(now, clock.current, tree.appearAt);
        if (grow < 1) done = false;
        const s = tree.scale * grow;
        scratch.rotation.set(0, tree.rotation, 0);
        scratch.position.set(tree.position[0], 0.6 * s, tree.position[2]);
        scratch.scale.setScalar(s);
        scratch.updateMatrix();
        trunk.setMatrixAt(i, scratch.matrix);
        scratch.position.set(tree.position[0], 2.15 * s, tree.position[2]);
        scratch.updateMatrix();
        leaf.setMatrixAt(i, scratch.matrix);
      });
      trunk.instanceMatrix.needsUpdate = true;
      leaf.instanceMatrix.needsUpdate = true;
    }

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

    if (done) settled.current = true;
  });

  return (
    <group>
      {trees.length > 0 && (
        <>
          <instancedMesh
            ref={trunkRef}
            args={[undefined, undefined, trees.length]}
            castShadow
            frustumCulled={false}
          >
            <cylinderGeometry args={[0.16, 0.22, 1.2, 6]} />
            <meshStandardMaterial
              color={desaturate(TREE_TRUNK, atmosphere.desaturation)}
              roughness={0.95}
            />
          </instancedMesh>
          <instancedMesh
            ref={leafRef}
            args={[undefined, undefined, trees.length]}
            castShadow
            frustumCulled={false}
          >
            <coneGeometry args={[1.15, 2.9, 7]} />
            <meshStandardMaterial
              color={desaturate(TREE_LEAF, atmosphere.desaturation)}
              roughness={1}
              flatShading
            />
          </instancedMesh>
        </>
      )}

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
    </group>
  );
}
