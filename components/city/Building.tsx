"use client";

/**
 * Landmark files become recognisable civic structures rather than ordinary
 * blocks (PLAN.md section 10): README, the manifest, CONTRIBUTING, CHANGELOG
 * and the Dockerfile. There are at most five of them, so they are plain meshes
 * with their own handlers rather than instances (section 38).
 *
 * They share the palette and the silhouette language of the rest of the city:
 * the difference is a roof feature, not a different art style.
 */

import type { LandmarkFile } from "@/types/analysis";
import type { Building } from "@/types/city";
import {
  CIVIC_COLOR,
  CIVIC_ROOF,
  HAZARD_RED,
  WINDOW_COLOR,
  desaturate,
  mix,
  stateTint,
  type SceneAtmosphere,
} from "./palette";
import { useEntityHandlers, useEntityState } from "./useEntity";
import { useRevealGroup } from "./useReveal";

interface CivicBuildingProps {
  building: Building;
  atmosphere: SceneAtmosphere;
}

function Columns({ width, depth, height }: { width: number; depth: number; height: number }) {
  const count = 4;
  return (
    <group>
      {Array.from({ length: count }, (_, i) => {
        const x = -width / 2 + (width / (count - 1)) * i;
        return (
          <mesh key={i} position={[x * 0.82, height / 2, depth / 2 + 0.35]} castShadow>
            <cylinderGeometry args={[0.24, 0.26, height, 8]} />
            <meshStandardMaterial color="#f2efe6" roughness={0.75} />
          </mesh>
        );
      })}
    </group>
  );
}

export default function CivicBuilding({ building, atmosphere }: CivicBuildingProps) {
  const { hovered, selected } = useEntityState(building.id);
  const handlers = useEntityHandlers(building.id);
  const reveal = useRevealGroup(building.appearAt);
  const [width, height, depth] = building.size;
  const kind: LandmarkFile | null = building.plan.landmark;

  const wall = stateTint(desaturate(CIVIC_COLOR, atmosphere.desaturation), hovered, selected);
  const roof = stateTint(desaturate(CIVIC_ROOF, atmosphere.desaturation), hovered, selected);

  return (
    <group
      ref={reveal}
      position={building.position}
      rotation-y={building.rotationY}
      {...handlers}
    >
      {/* Every civic building stands on a low plinth: it reads as important. */}
      <mesh position-y={0.25} castShadow receiveShadow>
        <boxGeometry args={[width * 1.25, 0.5, depth * 1.25]} />
        <meshStandardMaterial color={roof} roughness={0.9} />
      </mesh>

      <mesh position-y={0.5 + height / 2} castShadow receiveShadow>
        <boxGeometry args={[width, height, depth]} />
        <meshStandardMaterial color={wall} roughness={0.78} />
      </mesh>

      {/* A lit band, so the civic buildings glow with the rest of the city. */}
      <mesh position-y={0.5 + height * 0.55}>
        <boxGeometry args={[width * 1.01, 0.3, depth * 1.01]} />
        <meshStandardMaterial
          color={WINDOW_COLOR}
          emissive={WINDOW_COLOR}
          emissiveIntensity={0.2 + atmosphere.windowGlow}
          toneMapped={false}
          roughness={0.5}
        />
      </mesh>

      {kind === "manifest" && (
        <>
          <Columns width={width} depth={depth} height={height + 0.5} />
          <mesh position-y={height + 0.9} castShadow>
            <boxGeometry args={[width * 1.18, 0.8, depth * 1.18]} />
            <meshStandardMaterial color={roof} roughness={0.8} />
          </mesh>
        </>
      )}

      {kind === "contributing" && (
        <mesh position-y={height + 0.5} castShadow>
          <sphereGeometry args={[width * 0.42, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color={roof} roughness={0.6} />
        </mesh>
      )}

      {kind === "changelog" && (
        <>
          <mesh position={[width * 0.25, height + 2.2, 0]} castShadow>
            <boxGeometry args={[width * 0.4, 4, depth * 0.4]} />
            <meshStandardMaterial color={wall} roughness={0.78} />
          </mesh>
          <mesh position={[width * 0.25, height + 4.4, 0]} castShadow>
            <coneGeometry args={[width * 0.34, 1.4, 4]} />
            <meshStandardMaterial color={roof} roughness={0.7} />
          </mesh>
        </>
      )}

      {kind === "dockerfile" && (
        <>
          {[0, 1, 2].map((i) => (
            <mesh
              key={i}
              position={[(i - 1) * width * 0.3, height + 0.95 + (i === 1 ? 0.9 : 0), 0]}
              castShadow
            >
              <boxGeometry args={[width * 0.28, 0.85, depth * 0.72]} />
              <meshStandardMaterial
                color={mix(desaturate("#4a86a8", atmosphere.desaturation), wall, 0.25)}
                roughness={0.7}
              />
            </mesh>
          ))}
        </>
      )}

      {kind === "readme" && (
        <>
          <mesh position={[0, height + 2.4, 0]} castShadow>
            <cylinderGeometry args={[0.09, 0.09, 4, 6]} />
            <meshStandardMaterial color="#8d8f8b" roughness={0.6} />
          </mesh>
          <mesh position={[0.95, height + 3.7, 0]} castShadow>
            <boxGeometry args={[1.8, 1.05, 0.06]} />
            <meshStandardMaterial
              color={desaturate(HAZARD_RED, atmosphere.desaturation * 0.5)}
              roughness={0.7}
            />
          </mesh>
        </>
      )}
    </group>
  );
}
