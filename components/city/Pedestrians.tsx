"use client";

/**
 * The crowd (PLAN.md sections 17, 18, 37).
 *
 * `ambience.pedestrianDensity` becomes people on the pavements: a capsule and
 * a sphere each, walking the road graph from `traffic.ts` offset by half a
 * carriageway plus a unit, plus small idle groups outside the town hall and
 * the information centre. An archived city keeps two or three of them, which
 * is the difference between quiet and dead (section 19).
 *
 * COST. Two instanced meshes, whatever the crowd size, and a frame loop that
 * allocates nothing. Section 63 lists pedestrians third among the things to
 * cut if the frame rate drops: they are cheap here precisely so that step is
 * never the one that has to be taken.
 */

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Color, Object3D, type InstancedMesh } from "three";
import { prngFor } from "@/lib/city/seed";
import type { CityModel } from "@/types/city";
import { desaturate, type SceneAtmosphere } from "./palette";
import {
  PERSON_COLORS,
  advanceWalker,
  idleGroups,
  spawnWalkers,
  walkerCount,
  walkerPose,
} from "./models/props/pedestrians";
import { roadGraph } from "./traffic";
import { useRevealClock } from "./useReveal";

const scratch = new Object3D();
const scratchColor = new Color();

/** The pavement sits a little above the road surface. */
const PAVEMENT_Y = 0.12;
/** Where the capsule's centre and the head sit above the pavement. */
const BODY_Y = 0.44;
const HEAD_Y = 0.94;

export default function Pedestrians({
  city,
  startAt,
  atmosphere,
}: {
  city: CityModel;
  /** The moment the reveal has finished; the crowd arrives with the traffic. */
  startAt: number;
  atmosphere: SceneAtmosphere;
}) {
  const bodyRef = useRef<InstancedMesh>(null);
  const headRef = useRef<InstancedMesh>(null);
  const clock = useRevealClock();

  const { graph, walkers, idle, prng, total } = useMemo(() => {
    const rng = prngFor(city.seed, "pedestrians");
    const wanted = walkerCount(city.ambience.pedestrianDensity, city.repository.archived);
    const crowd = spawnWalkers(city.roads, wanted, rng);
    const standing = city.repository.archived ? [] : idleGroups(city.landmarks, rng);
    return {
      graph: roadGraph(city.roads),
      walkers: crowd,
      idle: standing,
      prng: rng,
      total: crowd.length + standing.length,
    };
  }, [city]);

  useFrame(({ clock: sceneClock }, delta) => {
    const body = bodyRef.current;
    const head = headRef.current;
    if (!body || !head || total === 0) return;

    const running = performance.now() - clock.current >= startAt;
    const step = running ? Math.min(delta, 0.1) : 0;
    const visible = running ? 1 : 0;
    const time = sceneClock.elapsedTime;

    for (let i = 0; i < walkers.length; i++) {
      const walker = walkers[i];
      if (step > 0) advanceWalker(graph, walker, step, prng);
      const pose = walkerPose(graph, walker);
      // One bob per stride, and a small sway with it: two sine terms are
      // enough to read as walking at the scale a person is drawn here.
      const stride = time * walker.speed * 5.2 + walker.phase;
      const bob = Math.abs(Math.sin(stride)) * 0.05;
      const sway = Math.sin(stride) * 0.06;

      scratch.position.set(pose.x, PAVEMENT_Y + BODY_Y + bob, pose.z);
      scratch.rotation.set(0, pose.angle, sway);
      scratch.scale.setScalar(visible);
      scratch.updateMatrix();
      body.setMatrixAt(i, scratch.matrix);

      scratch.position.set(pose.x, PAVEMENT_Y + HEAD_Y + bob, pose.z);
      scratch.rotation.set(0, pose.angle, 0);
      scratch.updateMatrix();
      head.setMatrixAt(i, scratch.matrix);
    }

    for (let i = 0; i < idle.length; i++) {
      const figure = idle[i];
      const slot = walkers.length + i;
      // Standing still is not standing rigid: a slow shift of weight.
      const shift = Math.sin(time * 0.9 + figure.phase);
      scratch.position.set(figure.position[0], PAVEMENT_Y + BODY_Y, figure.position[2]);
      scratch.rotation.set(0, figure.angle + shift * 0.12, shift * 0.035);
      scratch.scale.setScalar(visible);
      scratch.updateMatrix();
      body.setMatrixAt(slot, scratch.matrix);

      scratch.position.set(figure.position[0], PAVEMENT_Y + HEAD_Y, figure.position[2]);
      scratch.rotation.set(0, figure.angle + shift * 0.2, 0);
      scratch.updateMatrix();
      head.setMatrixAt(slot, scratch.matrix);
    }

    body.instanceMatrix.needsUpdate = true;
    head.instanceMatrix.needsUpdate = true;
  });

  const colors = useMemo(
    () =>
      [...walkers, ...idle].map((figure) =>
        desaturate(PERSON_COLORS[figure.colorIndex % PERSON_COLORS.length], atmosphere.desaturation),
      ),
    [walkers, idle, atmosphere.desaturation],
  );

  useEffect(() => {
    const mesh = bodyRef.current;
    if (!mesh) return;
    colors.forEach((hex, i) => {
      scratchColor.set(hex);
      mesh.setColorAt(i, scratchColor);
    });
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [colors]);

  if (total === 0) return null;

  return (
    <group>
      <instancedMesh
        ref={bodyRef}
        args={[undefined, undefined, total]}
        castShadow
        frustumCulled={false}
      >
        <capsuleGeometry args={[0.17, 0.48, 2, 6]} />
        <meshStandardMaterial roughness={0.85} />
      </instancedMesh>
      <instancedMesh ref={headRef} args={[undefined, undefined, total]} frustumCulled={false}>
        <sphereGeometry args={[0.15, 7, 5]} />
        <meshStandardMaterial
          color={desaturate("#c99f7d", atmosphere.desaturation)}
          roughness={0.9}
        />
      </instancedMesh>
    </group>
  );
}
