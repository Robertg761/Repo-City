"use client";

/**
 * A civic building's moving parts: the hands of its clock faces and the cloth
 * of its flag (`models/buildings/civicLife.ts`), drawn on their own over a body
 * that has neither. The hands turn to the scene's time exactly as the
 * landmarks' do (`landmarkAnimated.tsx`), each on its own face, so a clock
 * hall's four faces read the same time from every side.
 */

import { useEffect, useMemo, useRef } from "react";
import { Group, type Material } from "three";
import type { CivicLife } from "./models/buildings/civic";
import type { CivicLifeGeometry } from "./models/buildings/civicLife";
import { useClockHands, useWind } from "./landmarkAnimated";

/** The clock's outward normal in its own frame: the kit's clocks face +z. */
const FACE_NORMAL = [0, 0, 1] as const;

function CivicClockFace({
  clock,
  hands,
  material,
}: {
  clock: CivicLife["clocks"][number];
  hands: CivicLifeGeometry["hands"];
  material: Material;
}) {
  const refs = useRef<(Group | null)[]>([]);
  const kinds = useMemo(() => hands.map((hand) => hand.kind), [hands]);
  useClockHands(FACE_NORMAL, kinds, refs);
  return (
    <group position={clock.at as [number, number, number]} rotation-y={clock.yaw} scale={clock.radius}>
      {hands.map((hand, i) => (
        <group
          key={hand.kind}
          ref={(node) => {
            refs.current[i] = node;
          }}
        >
          <mesh geometry={hand.geometry} material={material} receiveShadow />
        </group>
      ))}
    </group>
  );
}

export function CivicLifeParts({
  life,
  geometry,
  material,
  flagMaterial,
}: {
  life: CivicLife | undefined;
  geometry: CivicLifeGeometry | null;
  /** The body's material, which the hands share. */
  material: Material;
  /** The same finish with the wave (`waveFlag`). */
  flagMaterial: Material;
}) {
  useWind();
  useEffect(() => {
    if (!geometry) return;
    return () => {
      for (const hand of geometry.hands) hand.geometry.dispose();
      geometry.cloth?.dispose();
    };
  }, [geometry]);
  if (!life || !geometry) return null;
  const cloth = geometry.cloth;
  return (
    <>
      {life.clocks.map((clock, i) => (
        <CivicClockFace key={`clock${i}`} clock={clock} hands={geometry.hands} material={material} />
      ))}
      {cloth &&
        life.flags.map((flag, i) => (
          <group key={`flag${i}`} position={flag.at as [number, number, number]} scale={flag.scale}>
            <mesh geometry={cloth} material={flagMaterial} castShadow receiveShadow />
          </group>
        ))}
    </>
  );
}
