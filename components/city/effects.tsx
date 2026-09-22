"use client";

/**
 * The small animated effects the city shares: smoke, blinking lamps, the halo
 * that makes a blink survive being three pixels wide, and electrical sparks.
 *
 * They live here rather than next to their first caller because the power
 * station (PLAN.md section 14) and the street incidents (section 11) need the
 * same vocabulary, and because every one of them animates from `useFrame`
 * without allocating: at three hundred buildings the frame budget is spent on
 * the city, not on effects (section 63).
 */

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { AdditiveBlending, type Mesh, type MeshBasicMaterial, type MeshStandardMaterial } from "three";

/**
 * A rising column of puffs. `height` and `puffs` are what turn a chimney's
 * wisp into the smoke column a viewer can spot from the overview camera.
 */
export function Smoke({
  origin,
  color = "#cfd2d4",
  rate = 1,
  height = 7,
  spread = 0.8,
  radius = 0.8,
  puffs = 3,
  opacity = 0.55,
}: {
  origin: [number, number, number];
  color?: string;
  rate?: number;
  height?: number;
  spread?: number;
  radius?: number;
  puffs?: number;
  opacity?: number;
}) {
  const meshes = useRef<(Mesh | null)[]>([]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime * rate;
    const list = meshes.current;
    for (let i = 0; i < list.length; i++) {
      const puff = list[i];
      if (!puff) continue;
      const phase = (t + i / puffs) % 1;
      puff.position.set(
        origin[0] + Math.sin(phase * 3 + i) * spread * phase,
        origin[1] + phase * height,
        origin[2] + Math.cos(phase * 2.4 + i) * spread * phase,
      );
      // Puffs keep growing as they rise, so the column widens with height the
      // way a real plume does rather than reading as a string of beads.
      puff.scale.setScalar(0.5 + phase * 1.6);
      const material = puff.material as MeshStandardMaterial;
      material.opacity = opacity * (1 - phase * 0.92);
    }
  });

  return (
    <group>
      {Array.from({ length: puffs }, (_, i) => (
        <mesh
          key={i}
          ref={(mesh) => {
            meshes.current[i] = mesh;
          }}
          position={origin}
        >
          <sphereGeometry args={[radius, 10, 8]} />
          <meshStandardMaterial
            color={color}
            transparent
            opacity={opacity}
            roughness={1}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
}

/** A blinking emergency or warning lamp. */
export function BlinkLight({
  position,
  color,
  rate = 2.4,
  radius = 0.34,
}: {
  position: [number, number, number];
  color: string;
  rate?: number;
  radius?: number;
}) {
  const ref = useRef<Mesh>(null);

  useFrame(({ clock }) => {
    const mesh = ref.current;
    if (!mesh) return;
    const pulse = 0.5 + 0.5 * Math.sin(clock.elapsedTime * rate * Math.PI);
    const material = mesh.material as MeshStandardMaterial;
    material.emissiveIntensity = 0.25 + pulse * 2.6;
    mesh.scale.setScalar(0.85 + pulse * 0.25);
  });

  return (
    <mesh ref={ref} position={position}>
      <sphereGeometry args={[radius, 10, 8]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1} toneMapped={false} />
    </mesh>
  );
}

/** The soft halo around a warning lamp. Additive, so it reads against sky. */
export function Glow({
  position,
  color,
  radius = 1,
  rate = 2.4,
  strength = 0.3,
}: {
  position: [number, number, number];
  color: string;
  radius?: number;
  rate?: number;
  strength?: number;
}) {
  const ref = useRef<Mesh>(null);

  useFrame(({ clock }) => {
    const mesh = ref.current;
    if (!mesh) return;
    const pulse = 0.5 + 0.5 * Math.sin(clock.elapsedTime * rate * Math.PI);
    (mesh.material as MeshBasicMaterial).opacity = strength * (0.32 + pulse);
    mesh.scale.setScalar(0.8 + pulse * 0.4);
  });

  return (
    <mesh ref={ref} position={position}>
      <sphereGeometry args={[radius, 12, 10]} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={strength}
        depthWrite={false}
        blending={AdditiveBlending}
        toneMapped={false}
      />
    </mesh>
  );
}

/**
 * A blinking lamp on a slim mast with its halo: the shape a warning takes
 * when it has to be legible from the overview camera. No point light --
 * twelve of those would be twelve lights in every material in the city.
 */
export function Beacon({
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
      <Glow position={[0, height + 0.24, 0]} color={color} radius={glowRadius} rate={rate} />
    </group>
  );
}

/**
 * Electrical sparks: short bursts, mostly darkness. The gaps are the point --
 * a plant that sparks continuously reads as a fireworks display.
 */
export function Sparks({
  position,
  color = "#bfe4ff",
  rate = 1,
  spread = 0.9,
  count = 4,
}: {
  position: [number, number, number];
  color?: string;
  rate?: number;
  spread?: number;
  count?: number;
}) {
  const group = useRef<Mesh[]>([]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime * rate;
    // One burst per cycle, lasting a fifth of it.
    const cycle = t % 1;
    const burst = cycle < 0.22 ? 1 - cycle / 0.22 : 0;
    const list = group.current;
    for (let i = 0; i < list.length; i++) {
      const bit = list[i];
      if (!bit) continue;
      const seed = i * 2.399963;
      bit.visible = burst > 0.02;
      bit.position.set(
        position[0] + Math.sin(seed + Math.floor(t) * 3.1) * spread,
        position[1] + Math.cos(seed * 1.7 + Math.floor(t) * 2.3) * spread * 0.6 + burst * 0.5,
        position[2] + Math.cos(seed + Math.floor(t) * 1.7) * spread,
      );
      bit.scale.setScalar(0.35 + burst * 0.9);
    }
  });

  return (
    <group>
      {Array.from({ length: count }, (_, i) => (
        <mesh
          key={i}
          ref={(mesh) => {
            if (mesh) group.current[i] = mesh;
          }}
          position={position}
          visible={false}
        >
          <boxGeometry args={[0.16, 0.16, 0.16]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={3}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
}
