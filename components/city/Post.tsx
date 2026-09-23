"use client";

/**
 * The post-processing chain, in a module of its own so that it loads on its
 * own (PLAN.md section 63). `postprocessing` and N8AO are the largest part of
 * the scene's code that the first frame does not need: `Environment` imports
 * this file lazily, the empty stage draws without waiting for it, and the
 * composer joins a moment later. Until it does the renderer tone maps on its
 * own, with the same operator and exposure (`Film` in `Environment.tsx`), so
 * the frame changes only by the ambient occlusion, the bloom and the
 * antialiasing arriving.
 */

import { useLayoutEffect, useRef } from "react";
import { Bloom, EffectComposer, N8AO, SMAA, ToneMapping } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import type { BloomEffect } from "postprocessing";
import { mix, type SceneAtmosphere } from "./palette";
import type { QualitySettings } from "./quality";
import { useSky, useSkyFrame } from "./sky";

/** Bloom strength for an hour. Auto's is exactly what it always was. */
function bloomIntensity(atmosphere: SceneAtmosphere): number {
  return 0.26 + Math.max(atmosphere.evening * 0.22, atmosphere.nightness * 0.34);
}

/**
 * The composer (PLAN.md section 63: the first thing that goes when frames get
 * long, which is why it is behind the quality tier).
 *
 * N8AO puts a contact darkening in every corner the directional light cannot
 * reach -- between a tower and its neighbour, under an eave, along a kerb --
 * which is most of what makes a lit model read as three dimensional.
 *
 * Bloom is deliberately threshold-limited to values above 1.1 in the scene's
 * own linear light, before the tone mapping: the palest roof under the
 * strongest midday sun lands just under 1 there, and the emissive windows,
 * beacons, sparks and lamps well above it.
 * So the lights glow and the facades do not, and the glow is kept small: a
 * wide soft bloom over a whole frame is exactly the veil this scene is not
 * meant to have.
 *
 * The chain ends in the tone mapping (see `Film`), after the bloom so the
 * glow is rolled off with everything else rather than clipping.
 *
 * `onLive` says when the composer is mounted and when it goes, so `Film`
 * hands it the tone mapping only while it is really there.
 */
export default function Post({
  atmosphere,
  quality,
  onLive,
}: {
  atmosphere: SceneAtmosphere;
  quality: QualitySettings;
  onLive: (live: boolean) => void;
}) {
  useLayoutEffect(() => {
    onLive(true);
    return () => onLive(false);
  }, [onLive]);

  // The glow follows the live hour: a little more at the golden hour, and
  // most at night, when the lights are what the city is made of.
  const sky = useSky();
  const bloom = useRef<BloomEffect>(null);
  useSkyFrame((live) => {
    if (bloom.current) bloom.current.intensity = bloomIntensity(live);
  });

  // Built as an array rather than with inline conditionals: the composer
  // rebuilds its chain from its children, and a `false` among them is not an
  // effect it can skip.
  const effects = [];
  if (quality.ambientOcclusion) {
    effects.push(
      <N8AO
        key="ao"
        // Full resolution, with twice the denoise samples of the "low" preset
        // over a tighter radius. At half resolution the occlusion is sampled
        // on a grid coarser than a tower's mullions, and the upsample drew
        // faint diagonal hatching down the side of every thin fin; the high
        // tier this runs on has the headroom (PLAN.md 76.13).
        aoSamples={16}
        denoiseSamples={8}
        denoiseRadius={8}
        aoRadius={2.6}
        distanceFalloff={1.1}
        intensity={1.05}
        // Neutral, with a breath of the ground bounce in it: an occlusion
        // tinted with the bounce colour turns the whole frame that colour.
        color={mix("#0a0c10", atmosphere.groundBounceColor, 0.2)}
      />,
    );
  }
  if (quality.bloom) {
    effects.push(
      <Bloom
        key="bloom"
        ref={bloom}
        mipmapBlur
        luminanceThreshold={1.1}
        luminanceSmoothing={0.25}
        intensity={bloomIntensity(sky.atmosphere)}
        radius={0.55}
      />,
    );
  }
  effects.push(<ToneMapping key="tone" mode={ToneMappingMode.NEUTRAL} />);
  if (quality.smaa) effects.push(<SMAA key="smaa" />);

  return (
    <EffectComposer enableNormalPass={false} multisampling={0} stencilBuffer={false}>
      {effects}
    </EffectComposer>
  );
}
