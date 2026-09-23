"use client";

/**
 * Lighting (PLAN.md section 39): one directional key light with soft
 * shadows, one hemisphere fill, nothing else. Health and archived status
 * reach this file only through the resolved sky, already turned into colours
 * by `palette.ts` and `timeOfDay.ts`.
 *
 * The key light's bearing comes from the live sky's `sunDirection`
 * (`sky.tsx`), which the sky dome in `Environment.tsx` paints its halo along:
 * shadows and sky always agree about where the light is coming from. By day
 * the key is the sun; at night it is the moon, on the same terms. The hour is
 * the viewer's time-of-day setting, or the one inferred from the repository.
 *
 * The shadow camera is sized from `bounds.size` so a large city still gets
 * shadows and a small one does not waste texels. A low sun throws shadows
 * much further across the plate than a midday one, so the frustum widens as
 * the light drops or the towers at the edge lose their shadows.
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
 *
 * NO LIGHT EVER MOVES THROUGH REACT. A change of hour writes the new light
 * straight into the two light objects from the frame loop (`useSkyFrame`);
 * the JSX below only sets the first frame.
 */

import { useEffect, useRef } from "react";
import type { DirectionalLight, HemisphereLight } from "three";
import type { SceneAtmosphere } from "./palette";
import { useQuality } from "./quality";
import { shadowReach, shadowTexel } from "./scale";
import { useSky, useSkyFrame } from "./sky";
import { lowLight } from "./timeOfDay";

/**
 * Shadow acne is a surface shadowing itself because one shadow texel spans
 * more depth than the bias allows for. The texel here is large -- the whole
 * city on one map -- and grows on the low tier and with a low sun, so the
 * offset along the normal is sized from the texel rather than fixed: a fixed
 * 0.02 was a tenth of a texel, and big flat walls striped.
 */
const normalBiasFor = (size: number, low: number, mapSize: number) =>
  shadowTexel(size, low, mapSize) * 0.6;

/** The key light, the fill and the shadow camera for one hour. */
function applyLight(
  key: DirectionalLight,
  fill: HemisphereLight,
  atmosphere: SceneAtmosphere,
  size: number,
  shadowMapSize: number,
): void {
  const [dx, dy, dz] = atmosphere.sunDirection;
  key.position.set(dx * size * 0.78, dy * size * 0.78, dz * size * 0.78);
  key.color.set(atmosphere.sunColor);
  key.intensity = atmosphere.sunIntensity;
  fill.color.set(atmosphere.skyColor);
  fill.groundColor.set(atmosphere.groundBounceColor);
  fill.intensity = atmosphere.hemiIntensity;

  // The whole settlement, widened for a low light's longer shadows
  // (`scale.ts`). At Auto, `lowLight` is exactly the old `evening` term.
  const low = lowLight(atmosphere.sunDirection);
  const reach = shadowReach(size, low);
  const camera = key.shadow.camera;
  if (camera.right !== reach) {
    camera.left = -reach;
    camera.right = reach;
    camera.top = reach;
    camera.bottom = -reach;
    camera.updateProjectionMatrix();
  }
  key.shadow.normalBias = normalBiasFor(size, low, shadowMapSize);
}

export default function Lighting({ size }: { size: number }) {
  // The shadow budget is the second thing to go on a slow machine, after the
  // post-processing (PLAN.md section 63). The tier is read here rather than
  // passed in because `City.tsx` owns this element and belongs to E5.
  const { shadowMapSize } = useQuality();
  const sky = useSky();
  const light = useRef<DirectionalLight>(null);
  const fill = useRef<HemisphereLight>(null);

  // The first frame's light, so nothing draws a frame of the wrong hour
  // before the frame loop takes over.
  const first = sky.atmosphere;
  const [dx, dy, dz] = first.sunDirection;
  const low = lowLight(first.sunDirection);
  const reach = shadowReach(size, low);

  useSkyFrame(
    (atmosphere) => {
      if (light.current && fill.current) {
        applyLight(light.current, fill.current, atmosphere, size, shadowMapSize);
      }
    },
    `${size}:${shadowMapSize}`,
  );

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
        ref={fill}
        args={[first.skyColor, first.groundBounceColor, first.hemiIntensity]}
      />
      <directionalLight
        ref={light}
        castShadow
        position={[dx * size * 0.78, dy * size * 0.78, dz * size * 0.78]}
        intensity={first.sunIntensity}
        color={first.sunColor}
        shadow-mapSize-width={shadowMapSize}
        shadow-mapSize-height={shadowMapSize}
        shadow-camera-near={1}
        shadow-camera-far={size * 2}
        shadow-camera-left={-reach}
        shadow-camera-right={reach}
        shadow-camera-top={reach}
        shadow-camera-bottom={-reach}
        shadow-bias={-0.0003}
        shadow-normalBias={normalBiasFor(size, low, shadowMapSize)}
        // three's PCF spreads five samples over `radius` texels and turns
        // them per pixel with a noise pattern. At the default radius of one
        // the noise showed as a stipple over every penumbra, smeared across
        // whole walls by a low sun and crawling as the camera moved. Half a
        // texel keeps the edges soft, with the hardware filter doing most of
        // the smoothing, and the stipple all but gone.
        shadow-radius={0.5}
      />
    </>
  );
}
