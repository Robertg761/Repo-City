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
 * frame loop allocates (section 63) but the near selection, a handful of
 * numbers every few frames.
 *
 * DETAIL. The few cars nearest the camera are drawn from a much richer model
 * (`models/vehicles/near.ts`): body, lamps and wheels swap together, because
 * the traffic picks the cars itself (`nearCars.ts`) and hands every part of
 * a chosen car to its mesh, rather than each mesh choosing on its own.
 *
 * Traffic starts once the reveal has finished: it is step 8 of section 43.
 */

import { useNearModels } from "./models/useModels";
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { BoxGeometry, Color, MeshBasicMaterial, Object3D, Raycaster, Vector3, type InstancedMesh, type ShaderMaterial } from "three";
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
import {
  nearBodyGeometry,
  nearLightsGeometry,
  nearTractorGeometry,
  nearTractorLightsGeometry,
  nearWheelGeometry,
} from "./models/vehicles/near";
import { CAR_PAINT_PATTERN, tintedMaterial } from "./models/props/material";
import { MAX_FLEET, carPose, stepTraffic, type CarPose } from "./traffic";
import { cityFleet, specOf, type FleetBody } from "./fleet";
import { LOW_TIER_GLOW, beamGeometry, beamMaterial } from "./glow";
import { LodInstances, NEAR_SHARE } from "./lod";
import { publishNearCars, selectNearCars, type NearSelection } from "./nearCars";
import { useQuality } from "./quality";
import { useSkyFrame } from "./sky";
import { useRevealClock } from "./useReveal";
import {
  braking,
  carGrow,
  createDynamics,
  flashOn,
  flatRoad,
  signalOf,
  stanceOf,
  stepDynamics,
  wheelCentre,
  type Stance,
} from "./carDynamics";

/** The lamps' colour for an hour: pale lenses by day, lit with the windows. */
const lampTint = (atmosphere: SceneAtmosphere) => mix("#9c9a94", "#ffffff", atmosphere.windowGlow);

const scratch = new Object3D();
// Heading first, then the body's pitch and roll about it.
scratch.rotation.order = "YXZ";
const wheelScratch = new Object3D();
// Heading first, then the wheel's own spin about its axle.
wheelScratch.rotation.order = "YXZ";
const scratchColor = new Color();
const pose: CarPose = { x: 0, z: 0, angle: 0, curvature: 0, reverse: false };
const overlayGeometry = new BoxGeometry(1, 1, 1);
const hiddenMatrix = new Object3D().matrix.clone().makeScale(0, 0, 0);

/** Front wheels never steer further than this, radians. */
const MAX_STEER = 0.6;

/** Where the body pivots when it pitches and rolls: about the height of its axles' centre of mass. */
const BODY_PIVOT = 0.3;
/** Seconds between one car's first appearance and the next's, and the most the last waits. */
const GROW_STAGGER = 0.03;
const GROW_MAX_DELAY = 1.2;
/** Lamp overlays per car: two brake lights, then rear and front indicators, each a pair. */
const OVERLAY = 6;
const BRAKE_COLOR = "#ff2a18";
const SIGNAL_COLOR = "#ffae1a";
/** How far an overlay stands proud of the lamp lens, and how thick it is. */
const OVERLAY_LIFT = 0.032;
const OVERLAY_DEPTH = 0.02;
const stance: Stance = { y: 0, slope: 0, base: 0, rise: 0 };
const surface = flatRoad;

/**
 * Cars drawn in detail at once (high tier; medium halves it, low has none) and
 * the size (body radius over distance to the camera) they must reach. A car's
 * radius is about 1.6, so at 0.05 it goes near within roughly 30 units: a
 * street-level view gets the closest couple of dozen, the overview none. Each
 * near car costs about 6,000 triangles, so the cap is 150,000 at most.
 */
const NEAR_CARS = 24;
const NEAR_SIZE = 0.05;
/** Frames between near selections; positions are copied every frame. */
const SELECT_EVERY = 4;
/** About the height of a car's middle above the ground. */
const CAR_HEIGHT = 0.6;

/** A tractor's front wheels are smaller than its back ones. */
const wheelRadiusOf = (body: FleetBody, wheel: number): number =>
  body === "tractor" ? TRACTOR_SPEC.wheelRadii[wheel] : BODY_SPECS[body].wheelRadius;
const geometryOf = (body: FleetBody) => (body === "tractor" ? tractorGeometry() : bodyGeometry(body));
const lampsOf = (body: FleetBody) => (body === "tractor" ? tractorLightsGeometry() : lightsGeometry(body));
const nearGeometryOf = (body: FleetBody) => (body === "tractor" ? nearTractorGeometry() : nearBodyGeometry(body));
const nearLampsOf = (body: FleetBody) => (body === "tractor" ? nearTractorLightsGeometry() : nearLightsGeometry(body));

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
  // Rebuilds the near levels as their models land (`useNearModels`).
  useNearModels();

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

  // Which meshes each car's parts are in, and the near selection the traffic
  // publishes for them (`nearCars.ts`).
  const near = useMemo(() => {
    const groupOf = new Int32Array(cars.length);
    const slotOf = new Int32Array(cars.length);
    const carRadius = new Float32Array(cars.length);
    groups.forEach((group, g) => {
      const geometry = geometryOf(group.body);
      if (!geometry.boundingSphere) geometry.computeBoundingSphere();
      const radius = geometry.boundingSphere?.radius ?? 1;
      group.cars.forEach((index, slot) => {
        groupOf[index] = g;
        slotOf[index] = slot;
        carRadius[index] = radius;
      });
    });
    const bodies: NearSelection[] = groups.map(() => ({ current: [] }));
    const wheels: NearSelection = { current: [] };
    return { groupOf, slotOf, carRadius, bodies, wheels };
  }, [cars, groups]);
  /** Each car's `x, z` this frame, for the near selection. */
  const nearAt = useRef<Float32Array>(new Float32Array(MAX_FLEET * 2));
  const nearFrame = useRef(0);
  const cameraAt = useMemo(() => new Vector3(), []);

  // One material for every body type: the paint mask lets the car's colour
  // reach the paintwork and nothing else (`models/props/material.ts`).
  const { textureSize, anisotropy, postProcessing, tier } = useQuality();
  const bodyMaterial = useMemo(() => tintedMaterial({ roughness: 0.5, metalness: 0.08 }, undefined, {
    textureSize, anisotropy, surfaceAttribute: true, patternStrength: CAR_PAINT_PATTERN,
  }), [textureSize, anisotropy]);
  const wheelMaterial = useMemo(() => tintedMaterial({ roughness: 0.85, metalness: 0.05 }, undefined, {
    textureSize, anisotropy, surfaceAttribute: true,
  }), [textureSize, anisotropy]);
  useEffect(() => () => { bodyMaterial.dispose(); wheelMaterial.dispose(); }, [bodyMaterial, wheelMaterial]);

  // Lamps brighten with the city's lit windows: at dusk a street of tail
  // lights, at noon pale lenses and dull red glass (PLAN.md section 39). The
  // floor is high enough that a lamp never reads as a hole in the car, and an
  // archived city, whose windows are mostly dark, drives with its lights low.
  // At night they burn past white, into the bloom, and throw their light on
  // the road ahead (`glow.tsx`). Both follow the live hour (`sky.tsx`).
  // Softer without the composer's tone mapping (`glow.tsx`).
  const beamScale = postProcessing ? 1 : LOW_TIER_GLOW;
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
  // How each car rides its springs (`carDynamics.ts`).
  const dynamics = useMemo(() => createDynamics(cars.length), [cars]);
  useEffect(() => {
    spin.current.fill(0);
  }, [cars]);

  // Brake lights and indicators: one instanced mesh of thin lamp-shaped panels
  // laid over the lenses, six to a car, each hidden (scale zero) until lit.
  // The models' own lamps carry no per-lamp state, and this costs one draw.
  const overlayRef = useRef<InstancedMesh>(null);
  const overlayMaterial = useMemo(() => new MeshBasicMaterial({ toneMapped: false }), []);
  useEffect(() => () => overlayMaterial.dispose(), [overlayMaterial]);
  /** Per car, six `[x, y, z, sx, sy, sz]` boxes in the body frame. */
  const overlayBoxes = useMemo(() => {
    const boxes = new Float32Array(cars.length * OVERLAY * 6);
    looks.forEach((look, index) => {
      const spec = specOf(look.body);
      const [w, h] = spec.lamp;
      const tail = spec.taillights[0];
      const head = spec.headlights[0];
      const put = (slot: number, x: number, y: number, z: number, sx: number, sy: number) => {
        boxes.set([x, y, z, sx, sy, OVERLAY_DEPTH], (index * OVERLAY + slot) * 6);
      };
      const rearZ = tail[2] - OVERLAY_LIFT;
      const frontZ = head[2] + OVERLAY_LIFT;
      // A brake light is the whole lens; an indicator is its outer half, a hair further out.
      put(0, tail[0], tail[1], rearZ, w, h);
      put(1, -tail[0], tail[1], rearZ, w, h);
      put(2, tail[0] + w / 4, tail[1], rearZ - 0.008, w / 2, h);
      put(3, -tail[0] - w / 4, tail[1], rearZ - 0.008, w / 2, h);
      put(4, head[0] + w / 4, head[1], frontZ + 0.008, w / 2, h);
      put(5, -head[0] - w / 4, head[1], frontZ + 0.008, w / 2, h);
    });
    return boxes;
  }, [cars, looks]);
  /** Which overlays were lit last frame, per car, as bits. */
  const overlayLitRef = useRef<Uint8Array>(new Uint8Array(0));
  useEffect(() => {
    overlayLitRef.current = new Uint8Array(cars.length);
  }, [cars]);
  useEffect(() => {
    const mesh = overlayRef.current;
    if (!mesh) return;
    overlayLitRef.current.fill(0);
    for (let k = 0; k < mesh.count; k++) {
      mesh.setMatrixAt(k, hiddenMatrix);
      mesh.setColorAt(k, scratchColor.set(k % OVERLAY < 2 ? BRAKE_COLOR : SIGNAL_COLOR));
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [cars]);

  // Development only: the fleet's meshes, so a driver can measure how every
  // tyre sits on the road (`blender/out/polish`), as `__repoCityScene` does.
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    (window as unknown as { __repoCityTraffic?: unknown }).__repoCityTraffic = {
      wheels: () => wheelRef.current,
      bodies: () => bodyRefs.current,
      cars: () => cars.length,
      lamps: () => lampRefs.current,
      beams: () => beamRefs.current,
      overlays: () => overlayRef.current,
      Raycaster,
    };
  }, [cars]);

  useFrame(({ camera }, delta) => {
    if (cars.length === 0) return;
    const wheels = wheelRef.current;
    const overlays = overlayRef.current;
    const overlayLit = overlayLitRef.current;
    const spins = spin.current;

    const sinceStart = performance.now() - clock.current - startAt;
    const running = sinceStart >= 0;
    // Cap the step so a backgrounded tab does not teleport the whole fleet.
    const step = running ? Math.min(delta, 0.1) : 0;
    const elapsed = running ? sinceStart / 1000 : 0;
    // The whole fleet moves together: each car keeps its distance from the
    // one in front and waits its turn at the junctions (`traffic.ts`).
    if (step > 0) stepTraffic(traffic, step);
    let overlayChanged = false;

    for (let g = 0; g < groups.length; g++) {
      const group = groups[g];
      const body = bodyRefs.current[g];
      const lamps = lampRefs.current[g];
      // The beams ride on the car's own matrix; written by day too, so they
      // are already in place the frame the lights come on.
      const beam = beamRefs.current[g];
      if (!body) continue;
      const spec = specOf(group.body);
      const front = spec.wheels[0][1];
      const rear = spec.wheels[2][1];
      const wheelbase = front - rear;

      for (let slot = 0; slot < group.cars.length; slot++) {
        const index = group.cars[slot];
        const car = cars[index];
        carPose(traffic, car, pose);
        nearAt.current[index * 2] = pose.x;
        nearAt.current[index * 2 + 1] = pose.z;

        const cos = Math.cos(pose.angle);
        const sin = Math.sin(pose.angle);
        // Cars appear one after another, growing out of the road they stand on.
        const grow = running ? carGrow(elapsed, Math.min(index * GROW_STAGGER, GROW_MAX_DELAY)) : 0;
        const speed = pose.reverse ? -car.v : car.v;

        // The front wheels steer to the curve the car is on: the angle a
        // bicycle of this wheelbase needs for that curvature.
        const steerAim = Math.max(-MAX_STEER, Math.min(MAX_STEER, Math.atan(wheelbase * pose.curvature)));
        if (step > 0) stepDynamics(dynamics, index, step, speed, pose.curvature, steerAim);

        // The road under the axles: the body takes its slope, and every wheel
        // stands on it (`carDynamics.ts`).
        stanceOf(stance, surface, pose.x, pose.z, cos, sin, front, rear);
        const pitch = stance.slope + dynamics.pitch[index];
        const roll = dynamics.roll[index];
        // Pitch and roll swing the body about a point above the axles, not
        // about the road: the pivot stays put and the origin moves to match.
        const cr = Math.cos(roll);
        const pivot = BODY_PIVOT * grow;
        const rx = -pivot * Math.sin(roll);
        const ry = pivot * cr * Math.cos(pitch);
        const rz = pivot * cr * Math.sin(pitch);
        scratch.position.set(
          pose.x - (rx * cos + rz * sin),
          stance.y + pivot + dynamics.bob[index] * grow - ry,
          pose.z - (-rx * sin + rz * cos),
        );
        scratch.rotation.set(pitch, pose.angle, roll);
        scratch.scale.setScalar(grow);
        scratch.updateMatrix();
        body.setMatrixAt(slot, scratch.matrix);
        if (lamps) lamps.setMatrixAt(slot, scratch.matrix);
        if (beam) beam.setMatrixAt(slot, scratch.matrix);

        if (overlays) {
          // Brake lights while slowing or standing, and the indicator on the
          // side of the turn the car is making or about to make.
          const lampsOn = grow > 0.98;
          const brake = lampsOn && braking(dynamics, index, speed);
          const signal = lampsOn ? signalOf(traffic, car) : 0;
          const blink = signal !== 0 && flashOn(traffic.time, index * 0.37);
          const bits =
            (brake ? 3 : 0) |
            (blink ? (signal > 0 ? 0b010100 : 0b101000) : 0);
          if (bits !== 0 || overlayLit[index] !== 0) {
            const m = scratch.matrix.elements;
            const out = overlays.instanceMatrix.array as Float32Array;
            for (let k = 0; k < OVERLAY; k++) {
              const on = (bits & (1 << k)) !== 0;
              if (!on && (overlayLit[index] & (1 << k)) === 0) continue;
              const at = (index * OVERLAY + k) * 16;
              if (on) {
                const b = (index * OVERLAY + k) * 6;
                const lx = overlayBoxes[b];
                const ly = overlayBoxes[b + 1];
                const lz = overlayBoxes[b + 2];
                const sx = overlayBoxes[b + 3];
                const sy = overlayBoxes[b + 4];
                const sz = overlayBoxes[b + 5];
                out[at] = m[0] * sx; out[at + 1] = m[1] * sx; out[at + 2] = m[2] * sx; out[at + 3] = 0;
                out[at + 4] = m[4] * sy; out[at + 5] = m[5] * sy; out[at + 6] = m[6] * sy; out[at + 7] = 0;
                out[at + 8] = m[8] * sz; out[at + 9] = m[9] * sz; out[at + 10] = m[10] * sz; out[at + 11] = 0;
                out[at + 12] = m[0] * lx + m[4] * ly + m[8] * lz + m[12];
                out[at + 13] = m[1] * lx + m[5] * ly + m[9] * lz + m[13];
                out[at + 14] = m[2] * lx + m[6] * ly + m[10] * lz + m[14];
                out[at + 15] = 1;
              } else {
                out.set(hiddenMatrix.elements, at);
              }
            }
            overlayLit[index] = bits;
            overlayChanged = true;
          }
        }

        if (!wheels) continue;
        // Wheels turn at the speed the car is doing: the distance covered this
        // frame over the tyre's radius, which is what stops them looking like
        // stickers when a car slows into a turn. Backwards when it backs up.
        if (step > 0) spins[index] += (speed * step) / spec.wheelRadius;
        const angle = spins[index];
        const steer = dynamics.steer[index];
        for (let w = 0; w < spec.wheels.length; w++) {
          const [lx, lz] = spec.wheels[w];
          const radius = wheelRadiusOf(group.body, w);
          // On the road, whatever the body does: the tyre's lowest point is the surface.
          wheelScratch.position.set(
            pose.x + lx * cos + lz * sin,
            wheelCentre(stance, lz, radius, grow),
            pose.z - lx * sin + lz * cos,
          );
          // A smaller wheel turns faster for the same ground covered; on a
          // slope the wheel lies along the road.
          wheelScratch.rotation.set(
            (angle * spec.wheelRadius) / radius + stance.slope,
            pose.angle + (lz > 0 ? steer : 0),
            0,
          );
          wheelScratch.scale.setScalar(radius * grow);
          wheelScratch.updateMatrix();
          wheels.setMatrixAt(index * 4 + w, wheelScratch.matrix);
        }
      }

      body.instanceMatrix.needsUpdate = true;
      if (lamps) lamps.instanceMatrix.needsUpdate = true;
      if (beam) beam.instanceMatrix.needsUpdate = true;
    }

    if (wheels) wheels.instanceMatrix.needsUpdate = true;
    if (overlays && overlayChanged) overlays.instanceMatrix.needsUpdate = true;

  // The cars to draw in detail, chosen from where they are now.
    const cap = running ? Math.floor(NEAR_CARS * NEAR_SHARE[tier]) : 0;
    if (cap > 0) {
      if (nearFrame.current++ % SELECT_EVERY === 0) {
        camera.getWorldPosition(cameraAt);
        const chosen = selectNearCars(nearAt.current, near.carRadius, cars.length, cameraAt, CAR_HEIGHT, NEAR_SIZE, cap);
        publishNearCars(chosen, near.groupOf, near.slotOf, near.bodies, near.wheels);
      }
    } else if (near.wheels.current.length) {
      publishNearCars([], near.groupOf, near.slotOf, near.bodies, near.wheels);
    }
    // Before the meshes that follow this selection, so they copy this frame's matrices.
  }, -1);

  // Every body type shares these two materials, so the first mesh that
  // carries each is the handle to write the hour through.
  useSkyFrame((atmosphere) => {
    const lamp = lampRefs.current.find(Boolean)?.material as MeshBasicMaterial | undefined;
    if (lamp) {
      lamp.color.set(lampTint(atmosphere));
      lamp.color.multiplyScalar(1 + atmosphere.nightness * 1.6);
    }
    // Lit brake lights and indicators glow past white at night, into the bloom.
    overlayMaterial.color.setScalar(1 + atmosphere.nightness * 1.3);
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
          <LodInstances
            ref={(mesh) => {
              bodyRefs.current[g] = mesh;
            }}
            geometry={geometryOf(group.body)}
            nearGeometry={nearGeometryOf(group.body)}
            material={bodyMaterial}
            count={group.cars.length}
            maxNear={NEAR_CARS}
            nearSize={NEAR_SIZE}
            selection={near.bodies[g]}
            follow
            castShadow
          />
          <LodInstances
            ref={(mesh) => {
              lampRefs.current[g] = mesh;
            }}
            geometry={lampsOf(group.body)}
            nearGeometry={nearLampsOf(group.body)}
            material={lampMaterial}
            count={group.cars.length}
            maxNear={NEAR_CARS}
            nearSize={NEAR_SIZE}
            selection={near.bodies[g]}
            follow
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

      <LodInstances
        ref={wheelRef}
        geometry={wheelGeometry()}
        nearGeometry={nearWheelGeometry()}
        material={wheelMaterial}
        count={cars.length * 4}
        maxNear={NEAR_CARS * 4}
        nearSize={NEAR_SIZE}
        selection={near.wheels}
        follow
      />

      <instancedMesh
        ref={overlayRef}
        args={[overlayGeometry, overlayMaterial, cars.length * OVERLAY]}
        frustumCulled={false}
        raycast={() => null}
        renderOrder={1}
      />
    </group>
  );
}
