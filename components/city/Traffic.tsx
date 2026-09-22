"use client";

/**
 * Street movement (PLAN.md sections 17, 18, 37). `vehicles.count` vehicles,
 * capped at 40, driving the road graph from `traffic.ts`.
 *
 * The simulation is unchanged -- a car picks a segment, drives it, turns at
 * the junction -- but the fleet is no longer one box per car. Each car gets a
 * seeded body type (`models/vehicles/shapes.ts`), wheels that turn at the
 * speed it is actually doing, and head and tail lamps that come up as the
 * city's windows do.
 *
 * COST. One instanced draw per body type present, one more for that type's
 * lamps, and a single instanced mesh carrying every wheel in the city: about
 * eleven draw calls for the whole fleet, whatever its size. Nothing in the
 * frame loop allocates (section 63).
 *
 * Traffic starts once the reveal has finished: it is step 8 of section 43.
 */

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Color, Object3D, type InstancedMesh } from "three";
import { prngFor } from "@/lib/city/seed";
import type { CityModel } from "@/types/city";
import { desaturate, mix, type SceneAtmosphere } from "./palette";
import {
  BODY_SPECS,
  CAR_COLORS,
  VEHICLE_BODIES,
  bodyGeometry,
  fleetLooks,
  lightsGeometry,
  wheelGeometry,
  type VehicleBody,
} from "./models/vehicles/shapes";
import { MAX_CARS, advanceCar, carPose, roadGraph, spawnCars } from "./traffic";
import { useRevealClock } from "./useReveal";

const scratch = new Object3D();
const wheelScratch = new Object3D();
// Heading first, then the wheel's own spin about its axle.
wheelScratch.rotation.order = "YXZ";
const scratchColor = new Color();

/** The road surface sits a touch above the ground plane; tyres go on top. */
const ROAD_SURFACE = 0.1;

export default function Traffic({
  city,
  startAt,
  atmosphere,
}: {
  city: CityModel;
  startAt: number;
  atmosphere: SceneAtmosphere;
}) {
  const clock = useRevealClock();

  const { graph, cars, prng, looks, groups } = useMemo(() => {
    const rng = prngFor(city.seed, "traffic");
    const wanted = Math.max(0, Math.min(city.vehicles.count, MAX_CARS));
    const fleet = spawnCars(city.roads, wanted, rng);
    // A separate stream, so adding body types cannot change where the cars
    // spawn or which way they drive (PLAN.md section 35).
    const shapes = fleetLooks(fleet.length, prngFor(city.seed, "fleet"));
    const byBody = new Map<VehicleBody, number[]>();
    shapes.forEach((look, i) => {
      const list = byBody.get(look.body);
      if (list) list.push(i);
      else byBody.set(look.body, [i]);
    });
    return {
      graph: roadGraph(city.roads),
      cars: fleet,
      prng: rng,
      looks: shapes,
      groups: VEHICLE_BODIES.filter((body) => byBody.has(body)).map((body) => ({
        body,
        cars: byBody.get(body) ?? [],
      })),
    };
  }, [city]);

  const bodyRefs = useRef<(InstancedMesh | null)[]>([]);
  const lampRefs = useRef<(InstancedMesh | null)[]>([]);
  const wheelRef = useRef<InstancedMesh>(null);
  /**
   * Wheel angle per car, in radians. One fixed-size buffer for the whole run:
   * the fleet can never exceed `MAX_CARS`, so this is allocated once and
   * accumulated in place rather than rebuilt with every city.
   */
  const spin = useRef<Float32Array>(new Float32Array(MAX_CARS));
  useEffect(() => {
    spin.current.fill(0);
  }, [cars]);

  useFrame((_, delta) => {
    if (cars.length === 0) return;
    const wheels = wheelRef.current;
    const spins = spin.current;

    const running = performance.now() - clock.current >= startAt;
    // Cap the step so a backgrounded tab does not teleport the whole fleet.
    const step = running ? Math.min(delta, 0.1) : 0;
    const visible = running ? 1 : 0;

    for (let g = 0; g < groups.length; g++) {
      const group = groups[g];
      const body = bodyRefs.current[g];
      const lamps = lampRefs.current[g];
      if (!body) continue;
      const spec = BODY_SPECS[group.body];

      for (let slot = 0; slot < group.cars.length; slot++) {
        const index = group.cars[slot];
        const car = cars[index];
        if (step > 0) advanceCar(graph, car, step, prng);
        const pose = carPose(graph, car);

        scratch.position.set(pose.x, ROAD_SURFACE, pose.z);
        scratch.rotation.set(0, pose.angle, 0);
        scratch.scale.setScalar(visible);
        scratch.updateMatrix();
        body.setMatrixAt(slot, scratch.matrix);
        if (lamps) lamps.setMatrixAt(slot, scratch.matrix);

        if (!wheels) continue;
        // Wheels turn at the speed the car is doing: the distance covered this
        // frame over the tyre's radius, which is what stops them looking like
        // stickers when a car slows into a turn.
        if (step > 0) spins[index] += (car.speed * step) / spec.wheelRadius;
        const angle = spins[index];
        const cos = Math.cos(pose.angle);
        const sin = Math.sin(pose.angle);
        for (let w = 0; w < spec.wheels.length; w++) {
          const [lx, lz] = spec.wheels[w];
          wheelScratch.position.set(
            pose.x + lx * cos + lz * sin,
            ROAD_SURFACE + spec.wheelRadius,
            pose.z - lx * sin + lz * cos,
          );
          wheelScratch.rotation.set(angle, pose.angle, 0);
          wheelScratch.scale.setScalar(spec.wheelRadius * visible);
          wheelScratch.updateMatrix();
          wheels.setMatrixAt(index * 4 + w, wheelScratch.matrix);
        }
      }

      body.instanceMatrix.needsUpdate = true;
      if (lamps) lamps.instanceMatrix.needsUpdate = true;
    }

    if (wheels) wheels.instanceMatrix.needsUpdate = true;
  });

  const colors = useMemo(
    () =>
      looks.map((look) =>
        desaturate(CAR_COLORS[look.colorIndex % CAR_COLORS.length], atmosphere.desaturation),
      ),
    [looks, atmosphere.desaturation],
  );

  useEffect(() => {
    groups.forEach((group, g) => {
      const mesh = bodyRefs.current[g];
      if (!mesh) return;
      group.cars.forEach((index, slot) => {
        scratchColor.set(colors[index]);
        mesh.setColorAt(slot, scratchColor);
      });
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    });
  }, [colors, groups]);

  if (cars.length === 0) return null;

  // Lamps brighten with the city's lit windows: at dusk a street of tail
  // lights, at noon two dull dots (PLAN.md section 39).
  const lampTint = mix("#5f5f5f", "#ffffff", atmosphere.windowGlow);

  return (
    <group>
      {groups.map((group, g) => (
        <group key={group.body}>
          <instancedMesh
            ref={(mesh) => {
              bodyRefs.current[g] = mesh;
            }}
            args={[bodyGeometry(group.body), undefined, group.cars.length]}
            castShadow
            frustumCulled={false}
          >
            <meshStandardMaterial vertexColors roughness={0.5} metalness={0.08} />
          </instancedMesh>
          <instancedMesh
            ref={(mesh) => {
              lampRefs.current[g] = mesh;
            }}
            args={[lightsGeometry(group.body), undefined, group.cars.length]}
            frustumCulled={false}
          >
            <meshBasicMaterial vertexColors color={lampTint} toneMapped={false} />
          </instancedMesh>
        </group>
      ))}

      <instancedMesh
        ref={wheelRef}
        args={[wheelGeometry(), undefined, cars.length * 4]}
        frustumCulled={false}
      >
        <meshStandardMaterial vertexColors roughness={0.85} metalness={0.05} />
      </instancedMesh>
    </group>
  );
}
