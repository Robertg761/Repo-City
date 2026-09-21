"use client";

/**
 * Lighting (PLAN.md section 39): one directional sun with soft shadows, one
 * hemisphere fill, nothing else. Health and archived status reach this file
 * only through `ambience`, already resolved into colours by `palette.ts`.
 *
 * The shadow camera is sized from `bounds.size` so a large city still gets
 * shadows and a small one does not waste texels.
 */

import type { SceneAtmosphere } from "./palette";

export default function Lighting({
  atmosphere,
  size,
}: {
  atmosphere: SceneAtmosphere;
  size: number;
}) {
  const reach = size * 0.62;

  return (
    <>
      <hemisphereLight
        args={[atmosphere.skyColor, atmosphere.groundBounceColor, atmosphere.hemiIntensity]}
      />
      <directionalLight
        castShadow
        position={[size * 0.34, size * 0.46, size * 0.2]}
        intensity={atmosphere.sunIntensity}
        color={atmosphere.sunColor}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={1}
        shadow-camera-far={size * 2}
        shadow-camera-left={-reach}
        shadow-camera-right={reach}
        shadow-camera-top={reach}
        shadow-camera-bottom={-reach}
        shadow-bias={-0.0006}
        shadow-normalBias={0.02}
      />
    </>
  );
}
