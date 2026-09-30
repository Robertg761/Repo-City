"use client";

/**
 * The small animated effects the city shares: smoke, blinking lamps, the halo
 * that makes a blink survive being three pixels wide, and electrical sparks.
 *
 * They live here rather than next to their first caller because the power
 * station (PLAN.md section 14) and the street incidents (section 11) need the
 * same vocabulary, and because every one of them animates from `useFrame`
 * without allocating: at three hundred buildings the frame budget is spent on
 * the city, not on effects (section 63).
 *
 * Every shape here is drawn from the city's shared pools (`Batch.tsx`): a
 * lamp, a puff or a spark is an empty group placed and animated exactly as
 * its mesh was, and one instanced mesh per shape draws all of them. Sixteen
 * incidents' worth of beacons and smoke is a handful of draw calls rather
 * than a hundred (PLAN.md 76.13).
 */

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AdditiveBlending,
  BoxGeometry,
  CylinderGeometry,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SphereGeometry,
  Vector3,
  type Object3D,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { BatchPart } from "./Batch";
import { useSkyFrame } from "./sky";
import { batchKind, patchExtras, withExtras, type BatchHandle, type BatchKind } from "./batching";
import { BLENDER_MODELS } from "./models/modelSource";
import { placePhase } from "./phase";
import { beaconMastGeometry } from "./models/props/incidentKit";

/**
 * A lit lamp: white, glowing white, so each instance's colour paints both its
 * body and its glow, and the glow's strength is set per instance. The same
 * numbers as `color={c} emissive={c} emissiveIntensity={glow}`.
 */
export function lampMaterial(): MeshStandardMaterial {
  return withExtras(
    new MeshStandardMaterial({
      color: "#ffffff",
      emissive: "#ffffff",
      emissiveIntensity: 1,
      toneMapped: false,
    }),
    { glow: true },
  );
}

const scratchWorld = new Vector3();

export { placePhase };

/** `placePhase` of an object once it is in the scene, or null before then. */
function worldPhase(object: Object3D | null | undefined): number | null {
  if (!object?.parent) return null;
  object.getWorldPosition(scratchWorld);
  return placePhase(scratchWorld.x, scratchWorld.y, scratchWorld.z);
}

/** How much of its rise a puff spends fading in, so it never pops into being. */
const PUFF_FADE_IN = 0.14;

/** Every lamp and puff was a 10 by 8 sphere of its own radius: one unit sphere, scaled. */
const LAMP = batchKind("fx:lamp", () => ({
  geometry: () => new SphereGeometry(1, 10, 8),
  material: lampMaterial,
}));

const PUFF = batchKind("fx:puff", () => ({
  geometry: () => new SphereGeometry(1, 10, 8),
  material: () =>
    withExtras(
      new MeshStandardMaterial({
        color: "#ffffff",
        transparent: true,
        roughness: 1,
        depthWrite: false,
      }),
      { opacity: true },
    ),
}));

/**
 * The halo round a lamp: a camera-facing quad with a soft radial falloff, not
 * a sphere. A flat additive sphere is a hard-edged disc that hides whatever it
 * covers; this fades smoothly to nothing at its rim. Billboarded in the
 * vertex shader from the instance's centre and scale, so it stays one instanced
 * draw for every halo in the city.
 */
const GLOW = batchKind("fx:glow", () => ({
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
    material.customProgramCacheKey = () => "fx-glow-billboard";
    return material;
  },
  pickable: false,
}));

const SPARK = batchKind("fx:spark", () => ({
  geometry: () => new BoxGeometry(0.16, 0.16, 0.16),
  material: lampMaterial,
}));

/**
 * A beacon's mast and the hood over its lamp: one material, so one shape.
 * With the Blender models the mast is the kit's foot, whole poles stacked to
 * the height and the lamp cage with its hood (`blender/incidents2/incident_kit.py`).
 */
function mastKind(height: number): BatchKind {
  return batchKind(`fx:mast:${height}`, () => ({
    geometry: () => {
      if (BLENDER_MODELS) return beaconMastGeometry(height);
      const mast = new CylinderGeometry(0.1, 0.14, height, 6).translate(0, height / 2, 0);
      const hood = new BoxGeometry(0.7, 0.12, 0.42).translate(0, height + 0.62, 0);
      return mergeGeometries([mast, hood]);
    },
    material: () =>
      new MeshStandardMaterial({ color: BLENDER_MODELS ? "#ffffff" : "#9aa0a0", vertexColors: BLENDER_MODELS, roughness: 0.6, metalness: 0.25 }),
    castShadow: true,
  }));
}

/**
 * A rising column of puffs. `height` and `puffs` are what turn a chimney's
 * wisp into the smoke column a viewer can spot from the overview camera.
 */
export function Smoke({
  origin,
  color = "#cfd2d4",
  rate = 1,
  height = 7,
  spread = 0.8,
  radius = 0.8,
  puffs = 3,
  opacity = 0.55,
}: {
  origin: [number, number, number];
  color?: string;
  rate?: number;
  height?: number;
  spread?: number;
  radius?: number;
  puffs?: number;
  opacity?: number;
}) {
  const handles = useRef<(BatchHandle | null)[]>([]);
  const offset = useRef<number | null>(null);

  useFrame(({ clock }) => {
    offset.current ??= worldPhase(handles.current[0]?.object);
    const t = clock.elapsedTime * rate + (offset.current ?? 0);
    const list = handles.current;
    for (let i = 0; i < list.length; i++) {
      const handle = list[i];
      const puff = handle?.object;
      if (!handle || !puff) continue;
      const phase = (t + i / puffs) % 1;
      puff.position.set(
        origin[0] + Math.sin(phase * 3 + i) * spread * phase,
        origin[1] + phase * height,
        origin[2] + Math.cos(phase * 2.4 + i) * spread * phase,
      );
      // Puffs keep growing as they rise, so the column widens with height the
      // way a real plume does rather than reading as a string of beads.
      puff.scale.setScalar(radius * (0.5 + phase * 1.6));
      // Fades in off the source and all the way out at the top: a puff used
      // to appear at full strength and vanish from a twelfth of it.
      const rise = Math.min(1, phase / PUFF_FADE_IN);
      handle.opacity = opacity * rise * (1 - phase) ** 1.1;
    }
  });

  return (
    <group>
      {Array.from({ length: puffs }, (_, i) => (
        <BatchPart
          key={i}
          kind={PUFF}
          handle={(handle) => {
            handles.current[i] = handle;
          }}
          position={origin}
          scale={radius}
          color={color}
          opacity={opacity}
        />
      ))}
    </group>
  );
}

const smooth01 = (x: number, a: number, b: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * One lamp's brightness, 0..1, at clock time `t`. `rate` is pulses per two
 * seconds, `offset` a phase in cycles (`sync`, or the lamp's place in the
 * world). `flash` squares the wave up, so an emergency lamp is mostly on or
 * mostly off, as a strobe is, instead of breathing like a nightlight.
 */
export function lampPulse(t: number, rate: number, offset: number, flash: boolean): number {
  const wave = 0.5 + 0.5 * Math.sin((t * rate + offset * 2) * Math.PI);
  return flash ? smooth01(wave, 0.35, 0.7) : wave;
}

/** A blinking emergency or warning lamp. */
export function BlinkLight({
  position,
  color,
  rate = 2.4,
  radius = 0.34,
  sync,
  flash = false,
}: {
  position: [number, number, number];
  color: string;
  rate?: number;
  radius?: number;
  /** A shared phase in cycles: lamps of one vehicle pass the same number and blink together. */
  sync?: number;
  flash?: boolean;
}) {
  const handle = useRef<BatchHandle>(null);
  const offset = useRef<number | null>(sync ?? null);

  useFrame(({ clock }) => {
    const lamp = handle.current;
    if (!lamp?.object) return;
    offset.current ??= worldPhase(lamp.object);
    const pulse = lampPulse(clock.elapsedTime, rate, offset.current ?? 0, flash);
    // Capped near 1.3: past that the emissive bloomed into a flat orb.
    lamp.glow = flash ? 0.15 + pulse * 1.2 : 0.3 + pulse * 1.0;
    lamp.object.scale.setScalar(radius * (flash ? 0.9 + pulse * 0.1 : 0.85 + pulse * 0.25));
  });

  return <BatchPart kind={LAMP} handle={handle} position={position} scale={radius} color={color} />;
}

const smoothstep01 = (x: number, a: number, b: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** The soft halo around a warning lamp. Additive, so it reads against sky. */
export function Glow({
  position,
  color,
  radius = 1,
  rate = 2.4,
  strength = 0.42,
  nightOnly = false,
  sync,
  flash = false,
}: {
  position: [number, number, number];
  color: string;
  radius?: number;
  rate?: number;
  strength?: number;
  /** A lamp's glow, which has no business showing in daylight; a beacon's stays faintly. */
  nightOnly?: boolean;
  /** The phase of the lamp it surrounds, in cycles (`BlinkLight`'s `sync`). */
  sync?: number;
  flash?: boolean;
}) {
  const handle = useRef<BatchHandle>(null);
  const offset = useRef<number | null>(sync ?? null);
  const night = useRef(0);
  useSkyFrame((atmosphere) => {
    night.current = atmosphere.nightness;
  });

  useFrame(({ clock }) => {
    const glow = handle.current;
    if (!glow?.object) return;
    // The same offset as the lamp it surrounds: both are placed at one point.
    offset.current ??= worldPhase(glow.object);
    const pulse = lampPulse(clock.elapsedTime, rate, offset.current ?? 0, flash);
    const hour = nightOnly ? smoothstep01(night.current, 0.2, 0.7) : 0.4 + 0.6 * night.current;
    glow.opacity = strength * (0.32 + pulse) * hour;
    glow.visible = hour > 0.01;
    glow.object.scale.setScalar(radius * (0.8 + pulse * 0.4));
  });

  return (
    <BatchPart
      kind={GLOW}
      handle={handle}
      position={position}
      scale={radius}
      color={color}
      opacity={strength}
    />
  );
}

/**
 * A blinking lamp on a slim mast with its halo: the shape a warning takes
 * when it has to be legible from the overview camera. No point light --
 * twelve of those would be twelve lights in every material in the city.
 */
export function Beacon({
  position,
  color,
  rate = 2.4,
  height = 4,
  glowRadius = 0.9,
  sync,
}: {
  position: [number, number, number];
  color: string;
  rate?: number;
  height?: number;
  glowRadius?: number;
  sync?: number;
}) {
  return (
    <group position={position}>
      {/* The mast, and a small hood over the lamp so the mast reads as
          equipment rather than as a pin stuck in the road. */}
      <BatchPart kind={mastKind(height)} />
      <BlinkLight position={[0, height + 0.24, 0]} color={color} rate={rate} radius={0.26} sync={sync} flash />
      <Glow position={[0, height + 0.24, 0]} color={color} radius={glowRadius} rate={rate} sync={sync} flash />
    </group>
  );
}

/**
 * Electrical sparks: short bursts, mostly darkness. The gaps are the point --
 * a plant that sparks continuously reads as a fireworks display.
 */
export function Sparks({
  position,
  color = "#bfe4ff",
  rate = 1,
  spread = 0.9,
  count = 4,
}: {
  position: [number, number, number];
  color?: string;
  rate?: number;
  spread?: number;
  count?: number;
}) {
  const handles = useRef<(BatchHandle | null)[]>([]);
  const offset = useRef<number | null>(null);

  useFrame(({ clock }) => {
    offset.current ??= worldPhase(handles.current[0]?.object);
    const t = clock.elapsedTime * rate + (offset.current ?? 0);
    // One burst per cycle, lasting a fifth of it.
    const cycle = t % 1;
    const burst = cycle < 0.22 ? 1 - cycle / 0.22 : 0;
    const list = handles.current;
    for (let i = 0; i < list.length; i++) {
      const handle = list[i];
      const bit = handle?.object;
      if (!handle || !bit) continue;
      const seed = i * 2.399963;
      handle.visible = burst > 0.02;
      bit.position.set(
        position[0] + Math.sin(seed + Math.floor(t) * 3.1) * spread,
        position[1] + Math.cos(seed * 1.7 + Math.floor(t) * 2.3) * spread * 0.6 + burst * 0.5,
        position[2] + Math.cos(seed + Math.floor(t) * 1.7) * spread,
      );
      bit.scale.setScalar(0.35 + burst * 0.9);
    }
  });

  return (
    <group>
      {Array.from({ length: count }, (_, i) => (
        <BatchPart
          key={i}
          kind={SPARK}
          handle={(handle) => {
            handles.current[i] = handle;
          }}
          position={position}
          color={color}
          glow={1.8}
          visible={false}
        />
      ))}
    </group>
  );
}
