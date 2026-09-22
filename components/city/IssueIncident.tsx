"use client";

/**
 * Issues as street incidents (PLAN.md section 11). Four visual states, and
 * the state is the whole point of the metaphor:
 *
 *   minor      pothole, cones, a road crew with their truck and a blinker
 *   collision  two cars in the wrong places, skid marks, police and ambulance
 *   stale      a rusted wreck behind a barricade line, weeds, a tow truck
 *   major      fire, a burnt patch, a fire truck with its ladder raised at
 *              the smoke, and a crew in high-visibility yellow
 *
 * TWO DISTANCES. Everything here is sized for the OVERVIEW camera, which sits
 * about 1.45 times the city's side length away (PLAN.md section 3: the demo
 * depends on the viewer spotting smoke or an accident and clicking it). A six
 * unit wreck is a few pixels from there, so each state carries something
 * vertical -- a plume, a beacon, a sign -- plus a hazard ring that reads
 * straight down. The detail underneath is for the viewer who flew in.
 *
 * COST. The scene on the ground is one merged geometry per state, variant and
 * tone (`models/props/incidentDecor.ts`), shared by every incident in that
 * state; only the things that move -- the ring, the flames, the smoke, the
 * light bars -- are meshes of their own.
 *
 * Six to twelve of these exist at a time (section 11).
 */

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Mesh, MeshBasicMaterial } from "three";
import type { Incident } from "@/types/city";
import { HAZARD_RED, WARNING_ORANGE, desaturate, mix, stateTint, type SceneAtmosphere } from "./palette";
import { Beacon, BlinkLight, Smoke } from "./effects";
import { incidentDecor, variantFor } from "./models/props/incidentDecor";
import { useEntityHandlers, useEntityState } from "./useEntity";
import { useRevealGroup } from "./useReveal";

/**
 * The ground signal. A thin ring on the tarmac, wide enough to read from the
 * overview camera looking almost straight down at it, pulsing slowly for the
 * states that mean "something is happening right now".
 */
function HazardRing({
  radius,
  color,
  opacity = 0.5,
  rate = 0,
}: {
  radius: number;
  color: string;
  opacity?: number;
  rate?: number;
}) {
  const ref = useRef<Mesh>(null);

  useFrame(({ clock }) => {
    const mesh = ref.current;
    if (!mesh || rate === 0) return;
    const pulse = 0.5 + 0.5 * Math.sin(clock.elapsedTime * rate);
    (mesh.material as MeshBasicMaterial).opacity = opacity * (0.55 + pulse * 0.45);
    const scale = 1 + pulse * 0.06;
    mesh.scale.set(scale, scale, 1);
  });

  return (
    <mesh ref={ref} rotation-x={-Math.PI / 2} position-y={0.13} renderOrder={1}>
      <ringGeometry args={[radius, radius * 1.22, 40]} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={opacity}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}

/** A flickering low-poly flame for the "major" state. */
function Fire({ position }: { position: [number, number, number] }) {
  const inner = useRef<Mesh>(null);
  const outer = useRef<Mesh>(null);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const flicker = 0.85 + Math.sin(t * 11) * 0.09 + Math.sin(t * 6.3) * 0.06;
    if (outer.current) outer.current.scale.set(flicker, flicker * 1.12, flicker);
    if (inner.current) inner.current.scale.setScalar(flicker * 0.72);
  });

  return (
    <group position={position}>
      <mesh ref={outer} position-y={1.1}>
        <coneGeometry args={[1, 3.4, 7]} />
        <meshStandardMaterial
          color="#f2803a"
          emissive="#ff6a1f"
          emissiveIntensity={1.6}
          toneMapped={false}
        />
      </mesh>
      <mesh ref={inner} position-y={0.9}>
        <coneGeometry args={[0.66, 2.5, 6]} />
        <meshStandardMaterial
          color="#ffd66b"
          emissive="#ffc14d"
          emissiveIntensity={2.2}
          toneMapped={false}
        />
      </mesh>
      <pointLight position={[0, 1.8, 0]} color="#ff8a3c" intensity={9} distance={14} decay={2} />
    </group>
  );
}

export default function IssueIncident({
  incident,
  atmosphere,
}: {
  incident: Incident;
  atmosphere: SceneAtmosphere;
}) {
  const { hovered, selected } = useEntityState(incident.id);
  const handlers = useEntityHandlers(incident.id);
  const reveal = useRevealGroup(incident.appearAt);

  const decor = useMemo(
    () => incidentDecor(incident.state, variantFor(incident.id), atmosphere.desaturation),
    [incident.state, incident.id, atmosphere.desaturation],
  );

  const marker = desaturate(
    incident.state === "minor" ? WARNING_ORANGE : HAZARD_RED,
    atmosphere.desaturation,
  );
  // The scene's colours are baked in; hover and selection multiply the whole
  // assembly, which warms the wreck, the crew and the tarmac together. Half
  // the usual strength: a whole scene going gold reads as a rendering fault,
  // and the ring around the selection is carrying the signal anyway.
  const tint = mix("#ffffff", stateTint("#ffffff", hovered, selected), 0.5);

  return (
    <group
      ref={reveal}
      position={incident.position}
      rotation-y={incident.rotationY}
      {...handlers}
    >
      {/* A dark patch under every incident: it reads from the overview. */}
      <mesh rotation-x={-Math.PI / 2} position-y={0.11}>
        <circleGeometry args={incident.state === "minor" ? [1.8, 18] : [3.1, 22]} />
        <meshStandardMaterial color={mix("#5a5c57", marker, 0.12)} roughness={1} />
      </mesh>

      <mesh geometry={decor.geometry} castShadow receiveShadow>
        <meshStandardMaterial vertexColors color={tint} roughness={0.8} />
      </mesh>

      {decor.lights.map((light, i) => (
        <BlinkLight
          key={i}
          position={light.position}
          color={light.color}
          rate={light.rate}
          radius={light.radius}
        />
      ))}

      {incident.state === "minor" && (
        <HazardRing radius={2.1} color={WARNING_ORANGE} opacity={0.42} rate={1.6} />
      )}

      {incident.state === "collision" && (
        <>
          <HazardRing radius={3} color={HAZARD_RED} opacity={0.42} rate={2.6} />
          {/* The emergency response, raised so the blink clears the wreck and
              survives being three pixels wide from the overview. */}
          <Beacon position={[2.4, 0, 1.8]} color="#4f8bff" rate={2.4} height={4.2} />
        </>
      )}

      {incident.state === "stale" && (
        // No pulse: nothing here is happening any more.
        <HazardRing radius={2.9} color={desaturate("#9a7b5f", 0.3)} opacity={0.4} />
      )}

      {incident.state === "major" && (
        <>
          <HazardRing radius={3.4} color={HAZARD_RED} opacity={0.5} rate={2.2} />
          <Fire position={[0, 0.2, 0]} />
          {/* The tallest thing in the city short of a crane: a column of smoke
              is what makes a major issue findable from the default camera. */}
          <Smoke
            origin={[0, 2.6, 0]}
            color="#6f6d6a"
            rate={0.34}
            height={16}
            spread={2}
            radius={0.9}
            puffs={8}
            opacity={0.42}
          />
          <Beacon position={[3.2, 0, 2.4]} color="#ff4d4d" rate={3} height={4.4} glowRadius={1.25} />
        </>
      )}
    </group>
  );
}
