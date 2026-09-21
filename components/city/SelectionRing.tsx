"use client";

/**
 * The ground ring under the selected entity (PLAN.md section 6, step 4).
 * Instanced buildings cannot carry an outline of their own without breaking
 * the one-mesh-per-tier rule, so selection reads as a stronger instance tint
 * plus this ring, which also works for incidents, sites and landmarks.
 */

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Mesh } from "three";
import { useCityStore } from "@/store/useCityStore";
import type { CityModel } from "@/types/city";
import { focusTargetFor } from "./entities";
import { SELECT } from "./palette";

export default function SelectionRing({ city }: { city: CityModel }) {
  const selectedId = useCityStore((s) => s.selectedId);
  const ref = useRef<Mesh>(null);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const pulse = 1 + Math.sin(clock.elapsedTime * 3.2) * 0.035;
    ref.current.scale.set(pulse, pulse, 1);
  });

  const focus = selectedId ? focusTargetFor(city, selectedId) : null;
  if (!focus) return null;

  const radius = Math.max(focus.radius * 1.15, 2.2);

  return (
    <mesh
      ref={ref}
      rotation-x={-Math.PI / 2}
      position={[focus.position[0], 0.14, focus.position[2]]}
      renderOrder={2}
    >
      <ringGeometry args={[radius, radius * 1.16, 48]} />
      <meshBasicMaterial
        color={SELECT}
        transparent
        opacity={0.92}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}
