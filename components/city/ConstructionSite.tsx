"use client";

/**
 * Pull requests as construction (PLAN.md section 13). Four states:
 *
 *   active     crane with a slowly rotating jib, fenced site, partial building
 *   slow       the same site with the crane idle
 *   abandoned  weathered, unfenced, the crane stopped and leaning
 *   completed  a finished building with a clean highlight
 *
 * At most eight of these, so plain meshes with their own handlers.
 */

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group } from "three";
import type { ConstructionSite } from "@/types/city";
import {
  CONCRETE,
  HIGHLIGHT,
  RUST,
  WARNING_ORANGE,
  WINDOW_COLOR,
  desaturate,
  mix,
  stateTint,
  type SceneAtmosphere,
} from "./palette";
import { useEntityHandlers, useEntityState } from "./useEntity";
import { useRevealGroup } from "./useReveal";

const SITE = 11;

function Fence({ color }: { color: string }) {
  const half = SITE / 2;
  return (
    <group>
      {[
        [0, half, 0],
        [0, -half, 0],
        [half, 0, Math.PI / 2],
        [-half, 0, Math.PI / 2],
      ].map(([x, z, rotation], i) => (
        <group key={i} position={[x, 0, z]} rotation-y={rotation}>
          <mesh position-y={0.95} castShadow>
            <boxGeometry args={[SITE, 1.5, 0.12]} />
            <meshStandardMaterial color={color} roughness={0.8} />
          </mesh>
          <mesh position-y={1.78}>
            <boxGeometry args={[SITE, 0.16, 0.16]} />
            <meshStandardMaterial color={WARNING_ORANGE} roughness={0.7} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Crane({
  state,
  color,
}: {
  state: ConstructionSite["state"];
  color: string;
}) {
  const jib = useRef<Group>(null);
  const moving = state === "active";

  useFrame(({ clock }) => {
    if (!jib.current) return;
    // A slow sweep: noticeable over a few seconds, never distracting.
    jib.current.rotation.y = moving ? clock.elapsedTime * 0.22 : 0.9;
  });

  const lean = state === "abandoned" ? 0.09 : 0;
  const mast = desaturate(state === "abandoned" ? RUST : "#e0b750", 0.15);

  return (
    <group position={[-SITE * 0.32, 0, -SITE * 0.3]} rotation-z={lean}>
      <mesh position-y={0.3} receiveShadow>
        <boxGeometry args={[2.4, 0.6, 2.4]} />
        <meshStandardMaterial color={CONCRETE} roughness={0.95} />
      </mesh>
      <mesh position-y={6.6} castShadow>
        <boxGeometry args={[0.55, 12, 0.55]} />
        <meshStandardMaterial color={mast} roughness={0.6} metalness={0.15} />
      </mesh>

      <group ref={jib} position={[0, 12.6, 0]}>
        <mesh position={[2.6, 0, 0]} castShadow>
          <boxGeometry args={[9, 0.42, 0.42]} />
          <meshStandardMaterial color={mast} roughness={0.6} metalness={0.15} />
        </mesh>
        <mesh position={[-2.2, 0, 0]} castShadow>
          <boxGeometry args={[2.4, 0.7, 0.7]} />
          <meshStandardMaterial color={mix(mast, "#000000", 0.35)} roughness={0.7} />
        </mesh>
        <mesh position={[5.4, -1.4, 0]}>
          <boxGeometry args={[0.07, 2.8, 0.07]} />
          <meshStandardMaterial color="#6f7270" />
        </mesh>
        <mesh position={[5.4, -3, 0]} castShadow>
          <boxGeometry args={[0.9, 0.5, 0.9]} />
          <meshStandardMaterial color={color} roughness={0.7} />
        </mesh>
      </group>
    </group>
  );
}

export default function ConstructionSitePiece({
  site,
  atmosphere,
}: {
  site: ConstructionSite;
  atmosphere: SceneAtmosphere;
}) {
  const { hovered, selected } = useEntityState(site.id);
  const handlers = useEntityHandlers(site.id);
  const reveal = useRevealGroup(site.appearAt);

  const done = site.state === "completed";
  const weathered = site.state === "abandoned";
  const shellHeight = done ? 8.5 : site.state === "active" ? 5.4 : site.state === "slow" ? 4.2 : 3.4;
  const shell = stateTint(
    desaturate(done ? "#ecdfcb" : weathered ? mix(CONCRETE, RUST, 0.35) : CONCRETE, atmosphere.desaturation),
    hovered,
    selected,
  );
  const ground = desaturate(weathered ? "#8f8a7c" : "#a89f8c", atmosphere.desaturation);

  return (
    <group ref={reveal} position={site.position} rotation-y={site.rotationY} {...handlers}>
      <mesh rotation-x={-Math.PI / 2} position-y={0.05} receiveShadow>
        <planeGeometry args={[SITE, SITE]} />
        <meshStandardMaterial color={ground} roughness={1} />
      </mesh>

      {/* The structure under construction, or the finished one. */}
      <mesh position={[SITE * 0.12, shellHeight / 2, SITE * 0.1]} castShadow receiveShadow>
        <boxGeometry args={[5.4, shellHeight, 5.4]} />
        <meshStandardMaterial color={shell} roughness={done ? 0.7 : 0.95} />
      </mesh>

      {done ? (
        <>
          <mesh position={[SITE * 0.12, shellHeight * 0.62, SITE * 0.1]}>
            <boxGeometry args={[5.46, 0.34, 5.46]} />
            <meshStandardMaterial
              color={WINDOW_COLOR}
              emissive={WINDOW_COLOR}
              emissiveIntensity={0.3 + atmosphere.windowGlow}
              toneMapped={false}
            />
          </mesh>
          <mesh rotation-x={-Math.PI / 2} position-y={0.08}>
            <ringGeometry args={[SITE * 0.46, SITE * 0.5, 40]} />
            <meshBasicMaterial color={HIGHLIGHT} transparent opacity={0.8} toneMapped={false} />
          </mesh>
        </>
      ) : (
        <>
          {/* Exposed floor slabs read as "unfinished" from a distance. */}
          {[0.45, 0.78].map((f) => (
            <mesh key={f} position={[SITE * 0.12, shellHeight * f, SITE * 0.1]}>
              <boxGeometry args={[5.8, 0.18, 5.8]} />
              <meshStandardMaterial color={mix(shell, "#ffffff", 0.18)} roughness={0.95} />
            </mesh>
          ))}
          <Crane state={site.state} color={weathered ? RUST : WARNING_ORANGE} />
          {!weathered && <Fence color={desaturate("#bdb6a4", atmosphere.desaturation)} />}
          {weathered && (
            <>
              {[
                [-3.4, 2.8],
                [3.6, -3.6],
                [2.2, 3.9],
              ].map(([x, z], i) => (
                <mesh key={i} position={[x, 0.28, z]} rotation-y={i * 0.7} castShadow>
                  <coneGeometry args={[0.28, 0.56, 5]} />
                  <meshStandardMaterial color="#8d9a6a" roughness={1} />
                </mesh>
              ))}
            </>
          )}
          {/* Stacked materials on the site. */}
          <mesh position={[-3.6, 0.4, 3.4]} rotation-y={0.4} castShadow>
            <boxGeometry args={[2.4, 0.8, 1.4]} />
            <meshStandardMaterial color={desaturate(weathered ? RUST : "#b59a6f", 0.1)} roughness={0.9} />
          </mesh>
        </>
      )}
    </group>
  );
}
