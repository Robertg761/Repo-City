"use client";

/**
 * Street movement (PLAN.md sections 17, 18, 37). `vehicles.count` small cars,
 * capped at 40, driving the road graph from `traffic.ts`. Two instanced meshes
 * (body, cabin) so the whole fleet costs two draw calls.
 *
 * Traffic starts once the reveal has finished: it is step 8 of section 43.
 */

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Color, Object3D, type InstancedMesh } from "three";
import { prngFor } from "@/lib/city/seed";
import type { CityModel } from "@/types/city";
import { desaturate, mix, type SceneAtmosphere } from "./palette";
import { MAX_CARS, advanceCar, carPose, roadGraph, spawnCars } from "./traffic";
import { useRevealClock } from "./useReveal";

const scratch = new Object3D();
const scratchColor = new Color();

const CAR_COLORS = ["#d8d4c8", "#5f8fb0", "#c26a58", "#7f9e77", "#e2c46a", "#8d8391"];

export default function Traffic({
  city,
  startAt,
  atmosphere,
}: {
  city: CityModel;
  startAt: number;
  atmosphere: SceneAtmosphere;
}) {
  const bodyRef = useRef<InstancedMesh>(null);
  const cabinRef = useRef<InstancedMesh>(null);
  const clock = useRevealClock();

  const { graph, cars, prng } = useMemo(() => {
    const rng = prngFor(city.seed, "traffic");
    const wanted = Math.max(0, Math.min(city.vehicles.count, MAX_CARS));
    return {
      graph: roadGraph(city.roads),
      cars: spawnCars(city.roads, wanted, rng),
      prng: rng,
    };
  }, [city]);

  useFrame((_, delta) => {
    const body = bodyRef.current;
    const cabin = cabinRef.current;
    if (!body || cars.length === 0) return;

    const running = performance.now() - clock.current >= startAt;
    // Cap the step so a backgrounded tab does not teleport the whole fleet.
    const step = running ? Math.min(delta, 0.1) : 0;

    cars.forEach((car, i) => {
      if (step > 0) advanceCar(graph, car, step, prng);
      const pose = carPose(graph, car);
      const visible = running ? 1 : 0;
      scratch.position.set(pose.x, 0.42, pose.z);
      scratch.rotation.set(0, pose.angle, 0);
      scratch.scale.setScalar(visible);
      scratch.updateMatrix();
      body.setMatrixAt(i, scratch.matrix);
      if (cabin) {
        scratch.position.set(pose.x, 0.86, pose.z);
        scratch.translateZ(-0.12);
        scratch.updateMatrix();
        cabin.setMatrixAt(i, scratch.matrix);
      }
    });

    body.instanceMatrix.needsUpdate = true;
    if (cabin) cabin.instanceMatrix.needsUpdate = true;
  });

  const colors = useMemo(
    () =>
      cars.map((car) =>
        desaturate(CAR_COLORS[car.colorIndex % CAR_COLORS.length], atmosphere.desaturation),
      ),
    [cars, atmosphere.desaturation],
  );

  useEffect(() => {
    const paint = (mesh: InstancedMesh | null, lighten: number) => {
      if (!mesh) return;
      colors.forEach((hex, i) => {
        scratchColor.set(mix(hex, "#ffffff", lighten));
        mesh.setColorAt(i, scratchColor);
      });
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    };
    paint(bodyRef.current, 0);
    paint(cabinRef.current, 0.3);
  }, [colors]);

  if (cars.length === 0) return null;

  return (
    <group>
      <instancedMesh
        ref={bodyRef}
        args={[undefined, undefined, cars.length]}
        castShadow
        frustumCulled={false}
      >
        <boxGeometry args={[1.35, 0.6, 2.9]} />
        <meshStandardMaterial roughness={0.5} metalness={0.05} />
      </instancedMesh>

      <instancedMesh
        ref={cabinRef}
        args={[undefined, undefined, cars.length]}
        castShadow
        frustumCulled={false}
      >
        <boxGeometry args={[1.15, 0.52, 1.5]} />
        <meshStandardMaterial roughness={0.35} metalness={0.05} />
      </instancedMesh>
    </group>
  );
}
