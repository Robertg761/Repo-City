"use client";

/**
 * Issues as street incidents (PLAN.md section 11). Four visual states, and
 * the state is the whole point of the metaphor:
 *
 *   minor      pothole, cones, a road crew's worth of clutter
 *   collision  two cars at angles with a blinking emergency light
 *   stale      a weathered wreck behind barricades, weeds growing through
 *   major      a crash with fire and smoke: the city is visibly on fire here
 *
 * Six to twelve of these exist at a time, so they are plain meshes.
 */

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Mesh } from "three";
import type { Incident } from "@/types/city";
import {
  CONCRETE,
  HAZARD_RED,
  RUST,
  TREE_LEAF,
  WARNING_ORANGE,
  desaturate,
  mix,
  stateTint,
  type SceneAtmosphere,
} from "./palette";
import { BlinkLight, Smoke } from "./Landmark";
import { useEntityHandlers, useEntityState } from "./useEntity";
import { useRevealGroup } from "./useReveal";

function Car({
  position,
  rotationY,
  color,
  tilt = 0,
}: {
  position: [number, number, number];
  rotationY: number;
  color: string;
  tilt?: number;
}) {
  return (
    <group position={position} rotation={[0, rotationY, tilt]}>
      <mesh position-y={0.42} castShadow>
        <boxGeometry args={[1.5, 0.62, 3]} />
        <meshStandardMaterial color={color} roughness={0.55} />
      </mesh>
      <mesh position={[0, 0.94, -0.18]} castShadow>
        <boxGeometry args={[1.3, 0.55, 1.5]} />
        <meshStandardMaterial color={mix(color, "#ffffff", 0.32)} roughness={0.45} />
      </mesh>
    </group>
  );
}

function Cone({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position-y={0.05}>
        <boxGeometry args={[0.6, 0.1, 0.6]} />
        <meshStandardMaterial color="#3f443f" roughness={0.9} />
      </mesh>
      <mesh position-y={0.45} castShadow>
        <coneGeometry args={[0.3, 0.8, 8]} />
        <meshStandardMaterial color={WARNING_ORANGE} roughness={0.6} />
      </mesh>
    </group>
  );
}

function Barricade({
  position,
  rotationY = 0,
}: {
  position: [number, number, number];
  rotationY?: number;
}) {
  return (
    <group position={position} rotation-y={rotationY}>
      <mesh position-y={0.55} castShadow>
        <boxGeometry args={[2.6, 0.28, 0.12]} />
        <meshStandardMaterial color={WARNING_ORANGE} roughness={0.7} />
      </mesh>
      <mesh position-y={0.9} castShadow>
        <boxGeometry args={[2.6, 0.28, 0.12]} />
        <meshStandardMaterial color="#e8e3d6" roughness={0.7} />
      </mesh>
      {[-1.1, 1.1].map((x) => (
        <mesh key={x} position={[x, 0.5, 0]}>
          <boxGeometry args={[0.14, 1, 0.14]} />
          <meshStandardMaterial color={CONCRETE} roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

function Weeds({ spread = 1.8 }: { spread?: number }) {
  return (
    <group>
      {[
        [-1, 0.9],
        [1.2, -0.6],
        [0.2, 1.4],
        [-1.4, -1.2],
      ].map(([x, z], i) => (
        <mesh key={i} position={[x * (spread / 1.8), 0.3, z * (spread / 1.8)]} castShadow>
          <coneGeometry args={[0.26, 0.6, 5]} />
          <meshStandardMaterial color={mix(TREE_LEAF, "#9aa36a", 0.4)} roughness={0.95} />
        </mesh>
      ))}
    </group>
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
      <mesh ref={outer} position-y={0.8}>
        <coneGeometry args={[0.75, 2.6, 7]} />
        <meshStandardMaterial
          color="#f2803a"
          emissive="#ff6a1f"
          emissiveIntensity={1.6}
          toneMapped={false}
        />
      </mesh>
      <mesh ref={inner} position-y={0.66}>
        <coneGeometry args={[0.5, 1.9, 6]} />
        <meshStandardMaterial
          color="#ffd66b"
          emissive="#ffc14d"
          emissiveIntensity={2.2}
          toneMapped={false}
        />
      </mesh>
      <pointLight position={[0, 1.6, 0]} color="#ff8a3c" intensity={7} distance={11} decay={2} />
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

  const marker = stateTint(
    desaturate(incident.state === "minor" ? WARNING_ORANGE : HAZARD_RED, atmosphere.desaturation),
    hovered,
    selected,
  );
  const bodyA = stateTint(desaturate("#5f8fb0", atmosphere.desaturation), hovered, selected);
  const bodyB = stateTint(desaturate("#c9c3b4", atmosphere.desaturation), hovered, selected);

  return (
    <group
      ref={reveal}
      position={incident.position}
      rotation-y={incident.rotationY}
      {...handlers}
    >
      {/* A dark patch under every incident: it reads from the overview. */}
      <mesh rotation-x={-Math.PI / 2} position-y={0.11}>
        <circleGeometry args={incident.state === "minor" ? [1.6, 18] : [2.9, 22]} />
        <meshStandardMaterial color={mix("#4c4f4b", marker, 0.1)} roughness={1} />
      </mesh>

      {incident.state === "minor" && (
        <>
          <mesh rotation-x={-Math.PI / 2} position-y={0.13}>
            <circleGeometry args={[0.75, 14]} />
            <meshStandardMaterial color="#33352f" roughness={1} />
          </mesh>
          <Cone position={[-1, 0.1, 0.5]} />
          <Cone position={[1, 0.1, -0.4]} />
          <mesh position={[0.2, 0.75, 1.1]} rotation-y={0.4} castShadow>
            <boxGeometry args={[1.1, 0.75, 0.1]} />
            <meshStandardMaterial color={marker} roughness={0.7} />
          </mesh>
        </>
      )}

      {incident.state === "collision" && (
        <>
          <Car position={[-1.1, 0.12, 0.4]} rotationY={0.5} color={bodyA} />
          <Car position={[1.2, 0.12, -0.5]} rotationY={-0.9} color={bodyB} />
          <Cone position={[0.1, 0.1, 2]} />
          <Cone position={[-2.2, 0.1, -1.4]} />
          <BlinkLight position={[-1.1, 1.5, 0.4]} color="#4f8bff" rate={2.6} radius={0.24} />
        </>
      )}

      {incident.state === "stale" && (
        <>
          <Car
            position={[0, 0.3, 0]}
            rotationY={0.7}
            tilt={Math.PI * 0.62}
            color={desaturate(RUST, 0.3)}
          />
          <Barricade position={[0, 0, 2.2]} />
          <Barricade position={[-2.2, 0, -0.6]} rotationY={Math.PI / 2} />
          <Weeds spread={2.4} />
        </>
      )}

      {incident.state === "major" && (
        <>
          <Car position={[-1.2, 0.12, 0.6]} rotationY={0.9} color={desaturate("#5a5450", 0.2)} />
          <Car position={[1.3, 0.2, -0.4]} rotationY={-0.5} tilt={0.42} color={bodyA} />
          <Fire position={[0, 0.2, 0]} />
          <Smoke origin={[0, 2.2, 0]} color="#7f7d79" rate={0.5} height={9} spread={1.4} />
          <Barricade position={[0, 0, 3]} />
          <Barricade position={[0, 0, -3]} />
          <BlinkLight position={[2.6, 1.2, 1.8]} color="#ff4d4d" rate={3} radius={0.26} />
        </>
      )}
    </group>
  );
}
