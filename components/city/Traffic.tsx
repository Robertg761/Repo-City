"use client";

/**
 * Street movement (PLAN.md sections 17, 18, 37). `vehicles.count` vehicles,
 * capped per settlement tier (40 in a city, 64 in a metropolis; PLAN.md
 * 76.5), driving the road graph from `traffic.ts`.
 *
 * A car drives its lane, rounds each junction on a curve at the speed the
 * bend allows, keeps its distance from the car in front and waits its turn
 * for the junction box. It keeps out of the stretches incidents and
 * construction close (`blockages.ts`): it will not turn into a road it
 * cannot use, and one that finds cones ahead pulls up short and turns round,
 * in three points on a narrow road. The fleet is set up in `fleet.ts`. Each
 * car gets a seeded body type (`models/vehicles/shapes.ts`), wheels that turn
 * at the speed it is actually doing and front wheels that steer into the
 * curve, and head and tail lamps that come up as the city's windows do. A
 * village, whose settlement allows it, has a few tractors among them.
 *
 * COST. One instanced draw per body type present, one more for that type's
 * lamps, and a single instanced mesh carrying every wheel in the city: about
 * thirteen draw calls for the whole fleet, whatever its size. Nothing in the
 * frame loop allocates (section 63).
 *
 * Traffic starts once the reveal has finished: it is step 8 of section 43.
 */

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Color, MeshBasicMaterial, Object3D, type InstancedMesh, type ShaderMaterial } from "three";
import type { CityModel } from "@/types/city";
import { desaturate, mix, type SceneAtmosphere } from "./palette";
import {
  BODY_SPECS,
  CAR_COLORS,
  TRACTOR_COLORS,
  TRACTOR_SPEC,
  VEHICLE_BODIES,
  bodyGeometry,
  lightsGeometry,
  tractorGeometry,
  tractorLightsGeometry,
  wheelGeometry,
} from "./models/vehicles/shapes";
import { tintedMaterial } from "./models/props/material";
import { MAX_FLEET, carPose, stepTraffic, type CarPose } from "./traffic";
import { cityFleet, specOf, type FleetBody } from "./fleet";
import { LOW_TIER_GLOW, beamGeometry, beamMaterial } from "./glow";
import { useQuality } from "./quality";
import { useSkyFrame } from "./sky";
import { useRevealClock } from "./useReveal";

/** The lamps' colour for an hour: pale lenses by day, lit with the windows. */
const lampTint = (atmosphere: SceneAtmosphere) => mix("#9c9a94", "#ffffff", atmosphere.windowGlow);

const scratch = new Object3D();
const wheelScratch = new Object3D();
// Heading first, then the wheel's own spin about its axle.
wheelScratch.rotation.order = "YXZ";
const scratchColor = new Color();
const pose: CarPose = { x: 0, z: 0, angle: 0, curvature: 0, reverse: false };

/** Front wheels never steer further than this, radians. */
const MAX_STEER = 0.6;

/** The road surface sits a touch above the ground plane; tyres go on top. */
const ROAD_SURFACE = 0.1;

/** A tractor's front wheels are smaller than its back ones. */
const wheelRadiusOf = (body: FleetBody, wheel: number): number =>
  body === "tractor" ? TRACTOR_SPEC.wheelRadii[wheel] : BODY_SPECS[body].wheelRadius;
const geometryOf = (body: FleetBody) => (body === "tractor" ? tractorGeometry() : bodyGeometry(body));
const lampsOf = (body: FleetBody) => (body === "tractor" ? tractorLightsGeometry() : lightsGeometry(body));

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

  const { traffic, cars, looks, groups } = useMemo(() => {
    const fleet = cityFleet(city);
    const byBody = new Map<FleetBody, number[]>();
    fleet.looks.forEach((look, i) => {
      const list = byBody.get(look.body);
      if (list) list.push(i);
      else byBody.set(look.body, [i]);
    });
    return {
      traffic: fleet.traffic,
      cars: fleet.traffic.cars,
      looks: fleet.looks,
      groups: [...VEHICLE_BODIES, "tractor" as const]
        .filter((body) => byBody.has(body))
        .map((body) => ({ body, cars: byBody.get(body) ?? [] })),
    };
  }, [city]);

  // One material for every body type: the paint mask lets the car's colour
  // reach the paintwork and nothing else (`models/props/material.ts`).
  const bodyMaterial = useMemo(() => tintedMaterial({ roughness: 0.5, metalness: 0.08 }), []);
  useEffect(() => () => bodyMaterial.dispose(), [bodyMaterial]);

  // Lamps brighten with the city's lit windows: at dusk a street of tail
  // lights, at noon pale lenses and dull red glass (PLAN.md section 39). The
  // floor is high enough that a lamp never reads as a hole in the car, and an
  // archived city, whose windows are mostly dark, drives with its lights low.
  // At night they burn past white, into the bloom, and throw their light on
  // the road ahead (`glow.tsx`). Both follow the live hour (`sky.tsx`).
  // Softer without the composer's tone mapping (`glow.tsx`).
  const beamScale = useQuality().postProcessing ? 1 : LOW_TIER_GLOW;
  const lampMaterial = useMemo(
    () => new MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
    [],
  );
  const beams = useMemo(() => beamMaterial(), []);
  const beamGeometries = useMemo(
    () => new Map(groups.map((group) => [group.body, beamGeometry(specOf(group.body))])),
    [groups],
  );
  useEffect(
    () => () => {
      lampMaterial.dispose();
      beams.dispose();
    },
    [lampMaterial, beams],
  );
  useEffect(() => () => beamGeometries.forEach((geometry) => geometry.dispose()), [beamGeometries]);
  const bodyRefs = useRef<(InstancedMesh | null)[]>([]);
  const lampRefs = useRef<(InstancedMesh | null)[]>([]);
  const beamRefs = useRef<(InstancedMesh | null)[]>([]);
  const wheelRef = useRef<InstancedMesh>(null);
  /**
   * Wheel angle per car, in radians. One fixed-size buffer for the whole run:
   * the fleet can never exceed `MAX_FLEET`, so this is allocated once and
   * accumulated in place rather than rebuilt with every city.
   */
  const spin = useRef<Float32Array>(new Float32Array(MAX_FLEET));
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
    // The whole fleet moves together: each car keeps its distance from the
    // one in front and waits its turn at the junctions (`traffic.ts`).
    if (step > 0) stepTraffic(traffic, step);

    for (let g = 0; g < groups.length; g++) {
      const group = groups[g];
      const body = bodyRefs.current[g];
      const lamps = lampRefs.current[g];
      // The beams ride on the car's own matrix; written by day too, so they
      // are already in place the frame the lights come on.
      const beam = beamRefs.current[g];
      if (!body) continue;
      const spec = specOf(group.body);

      for (let slot = 0; slot < group.cars.length; slot++) {
        const index = group.cars[slot];
        const car = cars[index];
        carPose(traffic, car, pose);

        scratch.position.set(pose.x, ROAD_SURFACE, pose.z);
        scratch.rotation.set(0, pose.angle, 0);
        scratch.scale.setScalar(visible);
        scratch.updateMatrix();
        body.setMatrixAt(slot, scratch.matrix);
        if (lamps) lamps.setMatrixAt(slot, scratch.matrix);
        if (beam) beam.setMatrixAt(slot, scratch.matrix);

        if (!wheels) continue;
        // Wheels turn at the speed the car is doing: the distance covered this
        // frame over the tyre's radius, which is what stops them looking like
        // stickers when a car slows into a turn. Backwards when it backs up.
        if (step > 0) spins[index] += ((pose.reverse ? -car.v : car.v) * step) / spec.wheelRadius;
        const angle = spins[index];
        const cos = Math.cos(pose.angle);
        const sin = Math.sin(pose.angle);
        // The front wheels steer to the curve the car is on: the angle a
        // bicycle of this wheelbase needs for that curvature.
        const wheelbase = spec.wheels[0][1] - spec.wheels[2][1];
        const steer = Math.max(-MAX_STEER, Math.min(MAX_STEER, Math.atan(wheelbase * pose.curvature)));
        for (let w = 0; w < spec.wheels.length; w++) {
          const [lx, lz] = spec.wheels[w];
          const radius = wheelRadiusOf(group.body, w);
          wheelScratch.position.set(
            pose.x + lx * cos + lz * sin,
            ROAD_SURFACE + radius,
            pose.z - lx * sin + lz * cos,
          );
          // A smaller wheel turns faster for the same ground covered.
          wheelScratch.rotation.set((angle * spec.wheelRadius) / radius, pose.angle + (lz > 0 ? steer : 0), 0);
          wheelScratch.scale.setScalar(radius * visible);
          wheelScratch.updateMatrix();
          wheels.setMatrixAt(index * 4 + w, wheelScratch.matrix);
        }
      }

      body.instanceMatrix.needsUpdate = true;
      if (lamps) lamps.instanceMatrix.needsUpdate = true;
      if (beam) beam.instanceMatrix.needsUpdate = true;
    }

    if (wheels) wheels.instanceMatrix.needsUpdate = true;
  });

  // Every body type shares these two materials, so the first mesh that
  // carries each is the handle to write the hour through.
  useSkyFrame((atmosphere) => {
    const lamp = lampRefs.current.find(Boolean)?.material as MeshBasicMaterial | undefined;
    if (lamp) {
      lamp.color.set(lampTint(atmosphere));
      lamp.color.multiplyScalar(1 + atmosphere.nightness * 1.6);
    }
    const strength = atmosphere.headlights * 0.5 * beamScale;
    const beam = beamRefs.current.find(Boolean)?.material as ShaderMaterial | undefined;
    if (beam) {
      beam.uniforms.uStrength.value = strength;
      // Hidden, not drawn at zero: the day pays no draw calls for them.
      beam.visible = strength > 0.002;
    }
  }, beamScale);

  const colors = useMemo(
    () =>
      looks.map((look) =>
        desaturate(
          look.tractor
            ? TRACTOR_COLORS[look.colorIndex % TRACTOR_COLORS.length]
            : CAR_COLORS[look.colorIndex % CAR_COLORS.length],
          atmosphere.desaturation,
        ),
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

  return (
    <group>
      {groups.map((group, g) => (
        <group key={group.body}>
          <instancedMesh
            ref={(mesh) => {
              bodyRefs.current[g] = mesh;
            }}
            args={[geometryOf(group.body), undefined, group.cars.length]}
            castShadow
            frustumCulled={false}
          >
            <primitive object={bodyMaterial} attach="material" />
          </instancedMesh>
          <instancedMesh
            ref={(mesh) => {
              lampRefs.current[g] = mesh;
            }}
            args={[lampsOf(group.body), lampMaterial, group.cars.length]}
            frustumCulled={false}
          />
          <instancedMesh
            ref={(mesh) => {
              beamRefs.current[g] = mesh;
            }}
            args={[beamGeometries.get(group.body), beams, group.cars.length]}
            frustumCulled={false}
            raycast={() => null}
            renderOrder={2}
          />
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
