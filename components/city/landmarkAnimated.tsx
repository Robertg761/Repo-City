"use client";

/**
 * The landmarks' moving parts: the clocks' hands, which show the scene's
 * time of day (`clockTime.ts`), and the flags, which wave in the city's wind
 * (`flagWave.ts`). The models carry them as nodes of their own
 * (`models/landmarks/life.ts`); this draws them with the landmark's own colour
 * slots, so a hand or a cloth is painted, tinted and shaded like the wall it
 * hangs on.
 *
 * Nothing here allocates per frame: a hand is turned by writing a quaternion
 * into its group, from angles worked out into one shared object.
 */

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Group, Quaternion, Vector3, type BufferGeometry } from "three";
import { clockHours, handAngles, handTurn, type HandAngles } from "./clockTime";
import { Part } from "./landmarkPart";
import { WIND_CLOCK } from "./models/props/material";
import type { Slots } from "./models/landmarks/assembly";
import type { ClockLife, FlagLife, HandKind, LandmarkLife } from "./models/landmarks/life";
import { useSky } from "./sky";

/** How a slot is painted: the colour the landmark's own `Part` line gives it. */
export interface Look {
  color: string;
  roughness?: number;
  metalness?: number;
}
export type Looks = Readonly<Record<string, Look>>;

const FALLBACK: Look = { color: "#8a8f92", roughness: 0.7 };

/** The slots of one moving part, each as the landmark paints it. */
function Slotted({ slots, looks, wave = false, cast = true }: { slots: Slots<string>; looks: Looks; wave?: boolean; cast?: boolean }) {
  return (
    <>
      {(Object.entries(slots) as [string, BufferGeometry][]).map(([slot, geometry]) => {
        const look = looks[slot] ?? FALLBACK;
        return <Part key={slot} geometry={geometry} color={look.color} roughness={look.roughness} metalness={look.metalness} wave={wave} cast={cast} />;
      })}
    </>
  );
}

const angles: HandAngles = { hour: 0, minute: 0, second: 0 };

/**
 * Turns a clock's hands to the scene's time: the sky's phase, and the scene
 * clock for the real-time creep once it has settled. The parent's world
 * matrix says whether the face is drawn mirrored, and the turn follows.
 */
export function useClockHands(normal: readonly number[], kinds: readonly HandKind[], hands: { current: (Group | null)[] }): void {
  const sky = useSky();
  const axis = useRef(new Vector3());
  const turn = useRef(new Quaternion());
  useEffect(() => {
    axis.current.set(normal[0], normal[1], normal[2]);
  }, [normal]);
  useFrame(({ clock: scene }) => {
    handAngles(clockHours(sky.phase, scene.elapsedTime), angles);
    for (let i = 0; i < kinds.length; i++) {
      const group = hands.current[i];
      if (!group) continue;
      const parent = group.parent;
      let mirrored = false;
      if (parent) {
        parent.updateWorldMatrix(true, false);
        mirrored = parent.matrixWorld.determinant() < 0;
      }
      turn.current.setFromAxisAngle(axis.current, handTurn(angles[kinds[i]], mirrored));
      group.quaternion.copy(turn.current);
    }
  });
}

function ClockFace({ clock, looks }: { clock: ClockLife; looks: Looks }) {
  const refs = useRef<(Group | null)[]>([]);
  const kinds = useMemo(() => clock.hands.map((hand) => hand.kind), [clock]);
  useClockHands(clock.normal, kinds, refs);
  return (
    <group position={clock.pivot}>
      {clock.hands.map((hand, i) => (
        <group
          key={hand.kind}
          ref={(node) => {
            refs.current[i] = node;
          }}
        >
          {/* A hand a few centimetres off the dial: its shadow would only be acne. */}
          <Slotted slots={hand.slots} looks={looks} cast={false} />
        </group>
      ))}
    </group>
  );
}

function FlagCloth({ flag, looks }: { flag: FlagLife; looks: Looks }) {
  return <Slotted slots={flag.slots} looks={looks} wave />;
}

/** The wind: one clock, the one the trees sway on, kept moving even in a city without trees. */
export function useWind(): void {
  useFrame(({ clock }) => {
    WIND_CLOCK.value = clock.elapsedTime;
  });
}

/**
 * A landmark's clocks and flags. `looks` paints each slot the moving parts are
 * made of; the landmark passes the same colours as its static parts.
 */
export function LandmarkLifeParts({ life, looks }: { life?: LandmarkLife; looks: Looks }) {
  useWind();
  if (!life) return null;
  return (
    <>
      {life.clocks.map((clock, i) => (
        <ClockFace key={`clock${i}`} clock={clock} looks={looks} />
      ))}
      {life.flags.map((flag, i) => (
        <FlagCloth key={`flag${i}`} flag={flag} looks={looks} />
      ))}
    </>
  );
}

