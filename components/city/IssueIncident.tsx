"use client";

/**
 * Issues as street incidents (PLAN.md section 11). Four visual states, and
 * the state is the whole point of the metaphor:
 *
 *   minor      pothole, cones, a road crew with their truck and a blinker
 *   collision  two cars in the wrong places, skid marks, police and ambulance
 *   stale      a rusted wreck behind a barricade line, weeds, a tow truck
 *   major      fire, a burnt patch, a fire truck with its ladder raised at
 *              the smoke, and a crew in high-visibility yellow
 *
 * TWO DISTANCES. Everything here is sized for the OVERVIEW camera, which sits
 * about 1.45 times the city's side length away (PLAN.md section 3: the demo
 * depends on the viewer spotting smoke or an accident and clicking it). A six
 * unit wreck is a few pixels from there, so each state carries something
 * vertical -- a plume, a beacon, a sign -- plus a hazard ring that reads
 * straight down. The detail underneath is for the viewer who flew in.
 *
 * COST. The scene on the ground is one merged geometry per state, variant and
 * tone (`models/props/incidentDecor.ts`), shared by every incident in that
 * state. Every part -- the patch, the scene, the ring, the flames, the smoke,
 * the light bars -- is drawn from the city's shared pools (`Batch.tsx`), so
 * sixteen incidents cost a handful of draw calls between them, not a hundred
 * and fifty (PLAN.md 76.13). Only the fire's halo, a sprite, is its own mesh.
 *
 * Six to twelve of these exist at a time (section 11).
 */

import { useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AdditiveBlending,
  CircleGeometry,
  ConeGeometry,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  RingGeometry,
  type BufferGeometry,
  type Sprite,
} from "three";
import type { Incident } from "@/types/city";
import { HAZARD_RED, WARNING_ORANGE, desaturate, mix, stateTint, type SceneAtmosphere } from "./palette";
import { BatchEntity, BatchPart } from "./Batch";
import { batchKind, withExtras, type BatchHandle, type BatchKind } from "./batching";
import { Beacon, BlinkLight, Smoke } from "./effects";
import { FIRE_AT, glowTexture, incidentDecor, variantFor } from "./models/props/incidentDecor";
import { useQuality } from "./quality";
import { useEntityHandlers, useEntityState } from "./useEntity";
import { useRevealGroup } from "./useReveal";

/**
 * The ground signal. A thin ring on the tarmac, wide enough to read from the
 * overview camera looking almost straight down at it, pulsing slowly for the
 * states that mean "something is happening right now".
 */
const RING = batchKind("incident:ring", () => ({
  // `ringGeometry args={[r, r * 1.22, 40]}` is this ring scaled by `r`.
  geometry: () => new RingGeometry(1, 1.22, 40),
  material: () =>
    withExtras(
      new MeshBasicMaterial({ color: "#ffffff", transparent: true, depthWrite: false, toneMapped: false }),
      { opacity: true },
    ),
  renderOrder: 1,
}));

function HazardRing({
  radius,
  color,
  opacity = 0.5,
  rate = 0,
}: {
  radius: number;
  color: string;
  opacity?: number;
  rate?: number;
}) {
  const ref = useRef<BatchHandle>(null);

  useFrame(({ clock }) => {
    const ring = ref.current;
    if (!ring?.object || rate === 0) return;
    const pulse = 0.5 + 0.5 * Math.sin(clock.elapsedTime * rate);
    ring.opacity = opacity * (0.55 + pulse * 0.45);
    const scale = radius * (1 + pulse * 0.06);
    ring.object.scale.set(scale, scale, 1);
  });

  return (
    <BatchPart
      kind={RING}
      handle={ref}
      rotation-x={-Math.PI / 2}
      position-y={0.13}
      scale={[radius, radius, 1]}
      color={color}
      opacity={opacity}
    />
  );
}

function patchKind(name: string, geometry: () => BufferGeometry): BatchKind {
  return batchKind(`incident:patch:${name}`, () => ({
    geometry,
    material: () => new MeshStandardMaterial({ color: "#ffffff", roughness: 1 }),
  }));
}

/** The dark patch under an incident: a small one under a pothole, a wide one otherwise. */
const PATCH_SMALL = patchKind("small", () => new CircleGeometry(1.8, 18));
const PATCH_WIDE = patchKind("wide", () => new CircleGeometry(3.1, 22));

/** One pool per merged scene: every incident in the same state, variant and tone shares it. */
function decorKind(geometry: BufferGeometry): BatchKind {
  return batchKind(`incident:decor:${geometry.uuid}`, () => ({
    geometry: () => geometry,
    material: () => new MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }),
    castShadow: true,
    receiveShadow: true,
  }));
}

const FLAME_OUTER = batchKind("incident:flame-outer", () => ({
  geometry: () => new ConeGeometry(1, 3.4, 7),
  material: () =>
    new MeshStandardMaterial({
      color: "#f2803a",
      emissive: "#ff6a1f",
      emissiveIntensity: 1.6,
      toneMapped: false,
    }),
}));

const FLAME_INNER = batchKind("incident:flame-inner", () => ({
  geometry: () => new ConeGeometry(0.66, 2.5, 6),
  material: () =>
    new MeshStandardMaterial({
      color: "#ffd66b",
      emissive: "#ffc14d",
      emissiveIntensity: 2.2,
      toneMapped: false,
    }),
}));

/**
 * The pool of firelight on the road, just over the burnt patch. Drawn after
 * the ground and never into the depth buffer, so the wrecks and the crew
 * standing in it still hide it where they stand. It never takes the
 * pointer: a twelve-unit square of light is not the incident, and must not
 * steal a click from the building beside it.
 */
const FIRELIGHT = batchKind("incident:firelight", () => ({
  geometry: () => new PlaneGeometry(12, 12),
  material: () =>
    withExtras(
      new MeshBasicMaterial({
        map: glowTexture(),
        color: "#ff7a2e",
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        toneMapped: false,
        fog: false,
      }),
      { opacity: true },
    ),
  renderOrder: 2,
  pickable: false,
}));

/** A viewer who asked the system for less motion gets a fire that holds still. */
const prefersStill = (): boolean =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** For meshes that are drawn but never picked. */
const ignoreRay = () => {};

/** The flames' resting size, and what they flicker around. */
const FLAME_REST = 0.85;

/**
 * The halo's share of the glow. It is added over whatever stands in front of
 * the fire -- a wreck, the smoke -- so much more than this bleaches them.
 */
const HALO = 0.5;

/**
 * A flickering low-poly flame for the "major" state, and the warm light it
 * throws.
 *
 * The light is FAKED. A real point light would be one more light in every lit
 * material in the city, and there can be twelve incidents (section 11). So the
 * glow is two additive, depth-write-off quads carrying a falloff generated in
 * code (`glowTexture`): a pool on the tarmac under the fire, and a soft halo
 * around the flames that reads against the buildings behind. Neither is lit
 * and neither lights anything; they cost their own few pixels and nothing per
 * material.
 *
 * `strength` follows the time of day: the same fire reads harder at dusk.
 * The halo is a second transparent layer, decoration by section 63's order,
 * so the low quality tier leaves it out and keeps the pool. With reduced
 * motion the flames and the glow hold their resting size.
 */
function Fire({
  position,
  strength,
  halo,
  still,
}: {
  position: [number, number, number];
  strength: number;
  halo: boolean;
  still: boolean;
}) {
  const inner = useRef<BatchHandle>(null);
  const outer = useRef<BatchHandle>(null);
  const pool = useRef<BatchHandle>(null);
  const aura = useRef<Sprite>(null);
  const texture = glowTexture();

  useFrame(({ clock }) => {
    if (still) return;
    const t = clock.elapsedTime;
    const flicker = FLAME_REST + Math.sin(t * 11) * 0.09 + Math.sin(t * 6.3) * 0.06;
    outer.current?.object?.scale.set(flicker, flicker * 1.12, flicker);
    inner.current?.object?.scale.setScalar(flicker * 0.72);
    // The glow breathes with the flames, a little behind them and a lot less:
    // light off a fire wavers, it does not strobe.
    const waver = 1 + (flicker - FLAME_REST) * 0.9 + Math.sin(t * 2.1) * 0.05;
    const light = pool.current;
    if (light?.object) {
      light.opacity = strength * waver;
      light.object.scale.setScalar(1 + (flicker - FLAME_REST) * 0.3);
    }
    if (aura.current) {
      aura.current.material.opacity = strength * HALO * waver;
    }
  });

  return (
    <group position={position}>
      <BatchPart
        kind={FLAME_OUTER}
        handle={outer}
        position-y={1.1}
        scale={[FLAME_REST, FLAME_REST * 1.12, FLAME_REST]}
      />
      <BatchPart kind={FLAME_INNER} handle={inner} position-y={0.9} scale={FLAME_REST * 0.72} />
      {/* The pool of firelight (`FIRELIGHT`). The halo below does not take
          the pointer either. */}
      <BatchPart
        kind={FIRELIGHT}
        handle={pool}
        rotation-x={-Math.PI / 2}
        position-y={-0.01}
        opacity={strength}
      />
      {halo && (
        <sprite
          ref={aura}
          position-y={1.5}
          scale={[5.5, 5.5, 1]}
          renderOrder={2}
          raycast={ignoreRay}
        >
          <spriteMaterial
            map={texture}
            color="#ff8a3c"
            transparent
            opacity={strength * HALO}
            depthWrite={false}
            blending={AdditiveBlending}
            toneMapped={false}
            fog={false}
          />
        </sprite>
      )}
    </group>
  );
}

export default function IssueIncident({
  incident,
  atmosphere,
}: {
  incident: Incident;
  atmosphere: SceneAtmosphere;
}) {
  const { hovered, selected } = useEntityState(incident.id);
  const handlers = useEntityHandlers(incident.id);
  const reveal = useRevealGroup(incident.appearAt);
  const quality = useQuality();
  // Read once: the setting is the viewer's, and it does not change mid-visit.
  const [still] = useState(prefersStill);

  const decor = useMemo(
    () => incidentDecor(incident.state, variantFor(incident.id), atmosphere.desaturation),
    [incident.state, incident.id, atmosphere.desaturation],
  );

  const marker = desaturate(
    incident.state === "minor" ? WARNING_ORANGE : HAZARD_RED,
    atmosphere.desaturation,
  );
  // The scene's colours are baked in; hover and selection multiply the whole
  // assembly, which warms the wreck, the crew and the tarmac together. Half
  // the usual strength: a whole scene going gold reads as a rendering fault,
  // and the ring around the selection is carrying the signal anyway.
  const tint = mix("#ffffff", stateTint("#ffffff", hovered, selected), 0.5);

  return (
    <group
      ref={reveal}
      position={incident.position}
      rotation-y={incident.rotationY}
      {...handlers}
    >
      <BatchEntity id={incident.id}>
        {/* A dark patch under every incident: it reads from the overview. */}
        <BatchPart
          kind={incident.state === "minor" ? PATCH_SMALL : PATCH_WIDE}
          rotation-x={-Math.PI / 2}
          position-y={0.11}
          color={mix("#5a5c57", marker, 0.12)}
        />

        <BatchPart kind={decorKind(decor.geometry)} color={tint} />

        {decor.lights.map((light, i) => (
          <BlinkLight
            key={i}
            position={light.position}
            color={light.color}
            rate={light.rate}
            radius={light.radius}
          />
        ))}

        {incident.state === "minor" && (
          <HazardRing radius={2.1} color={WARNING_ORANGE} opacity={0.42} rate={still ? 0 : 1.6} />
        )}

        {incident.state === "collision" && (
          <>
            <HazardRing radius={3} color={HAZARD_RED} opacity={0.42} rate={still ? 0 : 2.6} />
            {/* The emergency response, raised so the blink clears the wreck and
                survives being three pixels wide from the overview. */}
            <Beacon position={[2.4, 0, 1.8]} color="#4f8bff" rate={2.4} height={4.2} />
          </>
        )}

        {incident.state === "stale" && (
          // No pulse: nothing here is happening any more.
          <HazardRing radius={2.9} color={desaturate("#9a7b5f", 0.3)} opacity={0.4} />
        )}

        {incident.state === "major" && (
          <>
            <HazardRing radius={3.4} color={HAZARD_RED} opacity={0.5} rate={still ? 0 : 2.2} />
            <Fire
              position={[FIRE_AT[0], 0.2, FIRE_AT[1]]}
              strength={0.3 + atmosphere.lampGlow * 0.4}
              halo={quality.tier === "high"}
              still={still}
            />
            {/* The tallest thing in the city short of a crane: a column of smoke
                is what makes a major issue findable from the default camera. */}
            <Smoke
              origin={[0, 2.6, 0]}
              color="#6f6d6a"
              rate={still ? 0 : 0.34}
              height={16}
              spread={2}
              radius={0.9}
              puffs={8}
              opacity={0.42}
            />
            <Beacon position={[3.2, 0, 2.4]} color="#ff4d4d" rate={3} height={4.4} glowRadius={1.25} />
          </>
        )}
      </BatchEntity>
    </group>
  );
}
