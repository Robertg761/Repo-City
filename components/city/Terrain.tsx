"use client";

/**
 * The ground the city sits on (PLAN.md section 36). Two planes: the wide
 * landscape that runs out into the fog, and the slightly lighter city plate
 * that gives the diorama an edge. District tints are drawn on top by
 * `District.tsx`.
 *
 * The landscape is also the "nothing here" click target: clicking it clears
 * the selection (PLAN.md section 6).
 */

import type { ThreeEvent } from "@react-three/fiber";
import { useCityStore } from "@/store/useCityStore";
import { mix, type SceneAtmosphere } from "./palette";

interface TerrainProps {
  size: number;
  atmosphere: SceneAtmosphere;
}

export default function Terrain({ size, atmosphere }: TerrainProps) {
  const actions = useCityStore((s) => s.actions);

  const clearSelection = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    actions.select(null);
  };

  const clearHover = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    actions.hover(null);
  };

  return (
    <group>
      <mesh
        rotation-x={-Math.PI / 2}
        position-y={-0.06}
        receiveShadow
        onClick={clearSelection}
        onPointerMove={clearHover}
      >
        <planeGeometry args={[size * 2.4, size * 2.4]} />
        <meshStandardMaterial color={atmosphere.terrainColor} roughness={1} metalness={0} />
      </mesh>

      <mesh rotation-x={-Math.PI / 2} position-y={-0.02} receiveShadow onClick={clearSelection}>
        <planeGeometry args={[size * 1.04, size * 1.04]} />
        <meshStandardMaterial
          color={mix(atmosphere.terrainColor, "#ffffff", 0.18)}
          roughness={1}
          metalness={0}
        />
      </mesh>
    </group>
  );
}
