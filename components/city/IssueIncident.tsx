"use client";

/**
 * Issues as street incidents (PLAN.md section 11). Four visual states, and
 * the state is the whole point of the metaphor:
 *
 *   minor      pothole, cones, a road crew's sign with a slow amber blinker
 *   collision  two cars at angles under a blinking emergency beacon
 *   stale      a weathered wreck behind faded barricades, weeds growing through
 *   major      a crash with fire and a tall smoke column: the city is on fire
 *
 * Everything here is sized for the OVERVIEW camera, which sits about 1.45
 * times the city's side length away (PLAN.md section 3: the demo depends on
 * the viewer spotting smoke or an accident and clicking it). A six unit
 * wreck is a few pixels from there, so each state also carries something
 * vertical -- a plume, a beacon, a sign -- plus a hazard ring on the ground
 * that reads straight down. None of it is bigger than the buildings around it.
 *
 * Six to twelve of these exist at a time, so they are plain meshes.
 */

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { AdditiveBlending, type Mesh, type MeshBasicMaterial } from "three";
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
  color = WARNING_ORANGE,
  stripe = "#e8e3d6",
  lean = 0,
}: {
  position: [number, number, number];
  rotationY?: number;
  color?: string;
  stripe?: string;
  lean?: number;
}) {
  return (
    <group position={position} rotation={[0, rotationY, lean]}>
      <mesh position-y={0.55} castShadow>
        <boxGeometry args={[2.6, 0.28, 0.12]} />
        <meshStandardMaterial color={color} roughness={0.7} />
      </mesh>
      <mesh position-y={0.9} castShadow>
        <boxGeometry args={[2.6, 0.28, 0.12]} />
        <meshStandardMaterial color={stripe} roughness={0.7} />
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

function Weeds({ spread = 1.8, color }: { spread?: number; color: string }) {
  return (
    <group>
      {[
        [-1, 0.9, 1],
        [1.2, -0.6, 0.8],
        [0.2, 1.4, 1.15],
        [-1.4, -1.2, 0.9],
        [1.5, 1.3, 1.05],
        [-0.3, -1.6, 0.75],
      ].map(([x, z, s], i) => (
        <mesh
          key={i}
          position={[x * (spread / 1.8), 0.45 * s, z * (spread / 1.8)]}
          castShadow
        >
          <coneGeometry args={[0.3 * s, 0.9 * s, 5]} />
          <meshStandardMaterial color={color} roughness={0.95} flatShading />
        </mesh>
      ))}
    </group>
  );
}

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

/**
 * A blinking lamp on a slim mast, with a soft additive halo so the blink
 * survives being three pixels wide. No point light: twelve incidents with a
 * light each would be twelve lights in every material in the city.
 */
function Beacon({
  position,
  color,
  rate = 2.4,
  height = 4,
  glowRadius = 0.9,
}: {
  position: [number, number, number];
  color: string;
  rate?: number;
  height?: number;
  glowRadius?: number;
}) {
  const glow = useRef<Mesh>(null);

  useFrame(({ clock }) => {
    const mesh = glow.current;
    if (!mesh) return;
    const pulse = 0.5 + 0.5 * Math.sin(clock.elapsedTime * rate * Math.PI);
    (mesh.material as MeshBasicMaterial).opacity = 0.1 + pulse * 0.3;
    const scale = 0.8 + pulse * 0.4;
    mesh.scale.setScalar(scale);
  });

  return (
    <group position={position}>
      <mesh position-y={height / 2} castShadow>
        <cylinderGeometry args={[0.1, 0.14, height, 6]} />
        <meshStandardMaterial color="#9aa0a0" roughness={0.6} metalness={0.25} />
      </mesh>
      {/* A small hood over the lamp, so the mast reads as equipment rather
          than as a pin stuck in the road. */}
      <mesh position-y={height + 0.62} castShadow>
        <boxGeometry args={[0.7, 0.12, 0.42]} />
        <meshStandardMaterial color="#9aa0a0" roughness={0.6} metalness={0.25} />
      </mesh>
      <BlinkLight position={[0, height + 0.24, 0]} color={color} rate={rate} radius={0.32} />
      <mesh ref={glow} position-y={height + 0.24}>
        <sphereGeometry args={[glowRadius, 12, 10]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.22}
          depthWrite={false}
          blending={AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
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

/** The road crew's sign: a board on a post with a slow amber blinker. */
function WorksSign({
  position,
  rotationY = 0,
  color,
  lean = 0,
  blink = true,
}: {
  position: [number, number, number];
  rotationY?: number;
  color: string;
  lean?: number;
  blink?: boolean;
}) {
  return (
    <group position={position} rotation={[0, rotationY, lean]}>
      <mesh position-y={1.1} castShadow>
        <cylinderGeometry args={[0.09, 0.11, 2.2, 6]} />
        <meshStandardMaterial color="#6b6f6d" roughness={0.7} metalness={0.2} />
      </mesh>
      <mesh position-y={2.5} castShadow>
        <boxGeometry args={[1.7, 1.2, 0.12]} />
        <meshStandardMaterial color={color} roughness={0.65} />
      </mesh>
      <mesh position={[0, 2.5, 0.08]}>
        <boxGeometry args={[1.2, 0.26, 0.04]} />
        <meshStandardMaterial color="#2f3330" roughness={0.8} />
      </mesh>
      {blink && (
        <BlinkLight position={[0, 3.32, 0]} color={WARNING_ORANGE} rate={1.1} radius={0.2} />
      )}
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
  const faded = (hex: string) => desaturate(hex, Math.min(1, atmosphere.desaturation + 0.45));

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

      {incident.state === "minor" && (
        <>
          <HazardRing radius={2.1} color={WARNING_ORANGE} opacity={0.42} rate={1.6} />
          <mesh rotation-x={-Math.PI / 2} position-y={0.13}>
            <circleGeometry args={[0.75, 14]} />
            <meshStandardMaterial color="#33352f" roughness={1} />
          </mesh>
          <Cone position={[-1, 0.1, 0.5]} />
          <Cone position={[1, 0.1, -0.4]} />
          <Cone position={[0.3, 0.1, 1.5]} />
          <Cone position={[-1.6, 0.1, -1.1]} />
          <WorksSign position={[0.2, 0, 1.1]} rotationY={0.4} color={marker} />
        </>
      )}

      {incident.state === "collision" && (
        <>
          <HazardRing radius={3} color={HAZARD_RED} opacity={0.42} rate={2.6} />
          <Car position={[-1.1, 0.12, 0.4]} rotationY={0.5} color={bodyA} />
          <Car position={[1.2, 0.12, -0.5]} rotationY={-0.9} color={bodyB} />
          <Cone position={[0.1, 0.1, 2]} />
          <Cone position={[-2.2, 0.1, -1.4]} />
          <BlinkLight position={[-1.1, 1.5, 0.4]} color="#4f8bff" rate={2.6} radius={0.24} />
          {/* The emergency response, raised so the blink clears the wreck. */}
          <Beacon position={[2.3, 0, 1.6]} color="#4f8bff" rate={2.4} height={4.2} />
        </>
      )}

      {incident.state === "stale" && (
        <>
          {/* No pulse: nothing here is happening any more. */}
          <HazardRing radius={2.9} color={faded(RUST)} opacity={0.4} />
          <Car
            position={[0, 0.3, 0]}
            rotationY={0.7}
            tilt={Math.PI * 0.62}
            color={faded(RUST)}
          />
          <Barricade position={[0, 0, 2.2]} color={faded(WARNING_ORANGE)} stripe={faded("#e8e3d6")} />
          <Barricade
            position={[-2.2, 0, -0.6]}
            rotationY={Math.PI / 2}
            color={faded(WARNING_ORANGE)}
            stripe={faded("#e8e3d6")}
            lean={0.22}
          />
          <Barricade
            position={[2.4, 0, -1.4]}
            rotationY={Math.PI / 2.6}
            color={faded(WARNING_ORANGE)}
            stripe={faded("#e8e3d6")}
            lean={-0.14}
          />
          {/* A weathered sign, leaning, its lamp long dead. */}
          <WorksSign
            position={[-1.9, 0, 2.3]}
            rotationY={-0.5}
            lean={0.17}
            color={faded(WARNING_ORANGE)}
            blink={false}
          />
          <Weeds spread={3} color={faded(mix(TREE_LEAF, "#9aa36a", 0.4))} />
        </>
      )}

      {incident.state === "major" && (
        <>
          <HazardRing radius={3.4} color={HAZARD_RED} opacity={0.5} rate={2.2} />
          <Car position={[-1.2, 0.12, 0.6]} rotationY={0.9} color={desaturate("#5a5450", 0.2)} />
          <Car position={[1.3, 0.2, -0.4]} rotationY={-0.5} tilt={0.42} color={bodyA} />
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
          <Barricade position={[0, 0, 3.4]} />
          <Barricade position={[0, 0, -3.4]} />
          <Beacon position={[3, 0, 2.2]} color="#ff4d4d" rate={3} height={4.4} glowRadius={1.25} />
        </>
      )}
    </group>
  );
}
