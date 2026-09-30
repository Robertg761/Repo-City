"use client";

/**
 * The small signs of life on the landmarks: a station's flashing lights and
 * the engine that drives out of its bay, the power plant's aviation lights.
 * Shapes are the city's shared pools (`Batch.tsx`), and every frame callback
 * here writes numbers into existing objects: nothing allocates.
 *
 * `effects.tsx` has the smooth `BlinkLight`; an emergency light is not a
 * sine, it is on or off, and at the overview's three pixels a sine reads as
 * a lamp that never changes. These are on/off, with a halo that shares the
 * flash.
 */

import { useRef, type MutableRefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { AdditiveBlending, MeshBasicMaterial, PlaneGeometry, SphereGeometry, Vector3 } from "three";
import { BatchPart } from "./Batch";
import { batchKind, patchExtras, type BatchHandle } from "./batching";
import { lampMaterial, placePhase } from "./effects";

const FLASH_LAMP = batchKind("fx:flash-lamp", () => ({
  geometry: () => new SphereGeometry(1, 10, 8),
  material: lampMaterial,
}));

/** The same soft camera-facing halo as `effects.tsx`, sized and driven by the flash. */
const FLASH_HALO = batchKind("fx:flash-halo", () => ({
  geometry: () => new PlaneGeometry(2, 2),
  material: () => {
    const material = new MeshBasicMaterial({
      color: "#ffffff",
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      toneMapped: false,
      fog: false,
    });
    material.onBeforeCompile = (shader) => {
      patchExtras(shader, { opacity: true });
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nvarying float vHaloR;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvHaloR = length( position.xy );")
        .replace(
          "#include <project_vertex>",
          `mat4 haloModel = modelMatrix;
#ifdef USE_INSTANCING
haloModel = modelMatrix * instanceMatrix;
#endif
float haloScale = length( haloModel[0].xyz );
vec4 mvPosition = viewMatrix * vec4( haloModel[3].xyz, 1.0 );
mvPosition.xy += position.xy * haloScale;
gl_Position = projectionMatrix * mvPosition;`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying float vHaloR;")
        .replace(
          "#include <color_fragment>",
          `#include <color_fragment>
{
  float haloFade = 1.0 - smoothstep( 0.0, 1.0, vHaloR );
  diffuseColor.a *= haloFade * haloFade;
  if ( diffuseColor.a < 0.004 ) discard;
}`,
        );
    };
    material.customProgramCacheKey = () => "fx-flash-halo-billboard";
    return material;
  },
  pickable: false,
}));

/** How urgently a station's lights flash: 0 is an idle glint, 1 is a call-out. */
export interface Alarm {
  current: number;
}

/**
 * The light's level, 0..1, at `t` seconds. Idle: a short flash every few
 * seconds. Alarmed: a hard 2.4 Hz alternation, `side` picking which of the
 * pair is on. Blended by `alarm`, so the change is a quick crossover and not
 * a jump.
 */
export function flashLevel(t: number, phase: number, side: number, alarm: number): number {
  const idleCycle = (t / 3.2 + phase) % 1;
  const idle = idleCycle < 0.1 ? 1 : 0;
  const hot = ((t * 2.4 + side * 0.5) % 1) < 0.5 ? 1 : 0;
  return idle * (1 - alarm) + hot * alarm;
}

/** An on/off emergency light with its halo. */
export function FlashLight({
  position,
  color,
  radius = 0.17,
  haloRadius = 1.3,
  side = 0,
  alarm,
}: {
  position: [number, number, number];
  color: string;
  radius?: number;
  haloRadius?: number;
  /** 0 or 1: the other light of a pair flashes in the gaps. */
  side?: number;
  alarm?: Alarm;
}) {
  const lamp = useRef<BatchHandle>(null);
  const halo = useRef<BatchHandle>(null);
  const phase = useRef<number | null>(null);

  useFrame(({ clock }) => {
    const l = lamp.current;
    const h = halo.current;
    if (!l?.object || !h?.object) return;
    if (phase.current === null) {
      l.object.getWorldPosition(scratchVector);
      phase.current = placePhase(scratchVector.x, scratchVector.y, scratchVector.z);
    }
    const level = flashLevel(clock.elapsedTime, phase.current, side, alarm?.current ?? 0);
    // Never fully dark: the lens is still there between flashes.
    l.glow = 0.12 + level * 1.5;
    l.object.scale.setScalar(radius * (0.9 + level * 0.3));
    h.visible = level > 0.01;
    h.opacity = 0.5 * level;
    h.object.scale.setScalar(haloRadius * (0.7 + level * 0.4));
  });

  return (
    <group position={position}>
      <BatchPart kind={FLASH_LAMP} handle={lamp} scale={radius} color={color} />
      <BatchPart kind={FLASH_HALO} handle={halo} scale={haloRadius} color={color} opacity={0} visible={false} />
    </group>
  );
}

const scratchVector = new Vector3();

/**
 * An aviation warning light on a tall structure: a slow, steady red pulse
 * (on for a beat, off for two), each one on its own phase. Only bright at
 * dusk and after; a daytime light is barely a dot.
 */
export function AviationLight({
  position,
  radius = 0.2,
  night,
}: {
  position: [number, number, number];
  radius?: number;
  night: MutableRefObject<number>;
}) {
  const lamp = useRef<BatchHandle>(null);
  const halo = useRef<BatchHandle>(null);
  const phase = useRef<number | null>(null);

  useFrame(({ clock }) => {
    const l = lamp.current;
    const h = halo.current;
    if (!l?.object || !h?.object) return;
    if (phase.current === null) {
      l.object.getWorldPosition(scratchVector);
      phase.current = placePhase(scratchVector.x, scratchVector.y, scratchVector.z);
    }
    const cycle = (clock.elapsedTime / 2.4 + phase.current) % 1;
    // A soft rise and fall over the lit third, not a hard edge.
    const lit = cycle < 0.36 ? Math.sin((cycle / 0.36) * Math.PI) : 0;
    const dark = night.current;
    l.glow = 0.1 + lit * (0.6 + dark * 1.4);
    h.visible = lit * dark > 0.02;
    h.opacity = 0.55 * lit * dark;
  });

  return (
    <group position={position}>
      <BatchPart kind={FLASH_LAMP} handle={lamp} scale={radius} color="#ff3b2e" />
      <BatchPart kind={FLASH_HALO} handle={halo} scale={1.1} color="#ff3b2e" opacity={0} visible={false} />
    </group>
  );
}
