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
 *
 * ONE MAP AT EVERY SCALE (PLAN.md 76.5). A metropolis's shadow texel is
 * larger than a city's -- 0.19 to 0.26 world units at 320 against 0.14 to
 * 0.19 at 226 -- but the camera that looks at it is further away by the same
 * factor, at the overview and at a tower's close-up alike, so on screen a
 * texel covers the same 0.7 to 1 pixel in both. A 4,096 map for the
 * metropolis was measured and not taken: four times the memory (64 MB), a
 * slower frame, and no visible difference even at street level. Fitting the
 * shadow camera to the view would sharpen close-ups everywhere, but it would
 * change the city's shadows and make them crawl as the camera orbits.
 */

import { useEffect, useRef } from "react";
import type { DirectionalLight } from "three";
import type { SceneAtmosphere } from "./palette";
import { useQuality } from "./quality";
import { shadowReach, shadowTexel } from "./scale";

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
  // The whole settlement, widened for a low sun's longer shadows (`scale.ts`).
  const reach = shadowReach(size, atmosphere.evening);
  const light = useRef<DirectionalLight>(null);

  // Shadow acne is a surface shadowing itself because one shadow texel spans
  // more depth than the bias allows for. The texel here is large -- the whole
  // city on one map -- and grows on the low tier and with a low sun, so the
  // offset along the normal is sized from the texel rather than fixed: a
  // fixed 0.02 was a tenth of a texel, and big flat walls striped.
  const texel = shadowTexel(size, atmosphere.evening, shadowMapSize);
  const normalBias = texel * 0.6;

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
        shadow-bias={-0.0003}
        shadow-normalBias={normalBias}
      />
    </>
  );
}
