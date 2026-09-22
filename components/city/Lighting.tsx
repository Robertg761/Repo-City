"use client";

/**
 * Lighting (PLAN.md section 39): one directional sun with soft shadows, one
 * hemisphere fill, nothing else. Health and archived status reach this file
 * only through `ambience`, already resolved into colours by `palette.ts`.
 *
 * The sun's bearing comes from `atmosphere.sunDirection`, which the sky dome
 * in `Environment.tsx` paints its halo along: shadows and sky always agree
 * about where the light is coming from. The hour that direction encodes is
 * documented next to `eveningFactor` in `palette.ts`.
 *
 * The shadow camera is sized from `bounds.size` so a large city still gets
 * shadows and a small one does not waste texels. A low golden-hour sun throws
 * shadows much further across the plate than a midday one, so the frustum
 * widens with the hour or the towers at the edge lose their shadows.
 */

import { useEffect, useRef } from "react";
import type { DirectionalLight } from "three";
import type { SceneAtmosphere } from "./palette";
import { useQuality } from "./quality";

export default function Lighting({
  atmosphere,
  size,
}: {
  atmosphere: SceneAtmosphere;
  size: number;
}) {
  // The shadow budget is the second thing to go on a slow machine, after the
  // post-processing (PLAN.md section 63). The tier is read here rather than
  // passed in because `City.tsx` owns this element and belongs to E5.
  const { shadowMapSize } = useQuality();
  const [dx, dy, dz] = atmosphere.sunDirection;
  // A shadow cast by a sun 24 degrees up is more than twice as long as one
  // cast from 52 degrees: 0.62 of the city covers the midday case, and the
  // evening term covers the rest.
  const reach = size * (0.62 + atmosphere.evening * 0.22);
  const light = useRef<DirectionalLight>(null);

  // Changing `shadow.mapSize` after the map exists is ignored by three until
  // the old texture is thrown away, and the quality tier can step down three
  // seconds into the scene.
  useEffect(() => {
    const node = light.current;
    if (!node || !node.shadow.map) return;
    if (node.shadow.map.width === shadowMapSize) return;
    node.shadow.map.dispose();
    node.shadow.map = null;
  }, [shadowMapSize]);

  return (
    <>
      <hemisphereLight
        args={[atmosphere.skyColor, atmosphere.groundBounceColor, atmosphere.hemiIntensity]}
      />
      <directionalLight
        ref={light}
        castShadow
        position={[dx * size * 0.78, dy * size * 0.78, dz * size * 0.78]}
        intensity={atmosphere.sunIntensity}
        color={atmosphere.sunColor}
        shadow-mapSize-width={shadowMapSize}
        shadow-mapSize-height={shadowMapSize}
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
