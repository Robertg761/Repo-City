"use client";

/**
 * Pull requests as construction (PLAN.md section 13). Four states:
 *
 *   active     crane with a slowly rotating jib, scaffolding, a mixer, an
 *              excavator, stacked materials, a hut and a crew in yellow
 *   slow       the same site with one worker left and the crane idle
 *   abandoned  weathered, unfenced, the crane stopped and leaning, weeds
 *              through the hardstanding and a sign nobody took away
 *   completed  a finished building, a swept forecourt and a ribbon
 *
 * At most eight of these, so they are plain meshes with their own handlers.
 *
 * The assembly is modelled on an eleven unit square plot; `site.size` is the
 * plot the generator actually cleared for it, and the whole thing is scaled
 * uniformly into that, so a crane never grows through the building next door.
 *
 * COST. The dressing is one merged geometry per state and tone
 * (`models/props/constructionDecor.ts`) and the crane is two more -- tower and
 * jib -- so a site is about six draw calls however much is going on inside it.
 */

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group } from "three";
import type { ConstructionSite } from "@/types/city";
import {
  HIGHLIGHT,
  WINDOW_COLOR,
  desaturate,
  mix,
  stateTint,
  type SceneAtmosphere,
} from "./palette";
import {
  SHELL_HEIGHT,
  SITE,
  constructionDecor,
  craneJibGeometry,
  craneMastGeometry,
} from "./models/props/constructionDecor";
import { craneSwing } from "./reveal";
import { useEntityHandlers, useEntityState } from "./useEntity";
import { useRevealClock, useRevealGroup } from "./useReveal";

/** Where a crane's opening sweep starts, in radians. */
const SWING_FROM = -1.5;

function Crane({
  state,
  atmosphere,
  appearAt,
}: {
  state: ConstructionSite["state"];
  atmosphere: SceneAtmosphere;
  /** The site's slot in the reveal, so the opening sweep lands with it. */
  appearAt: number;
}) {
  const jib = useRef<Group>(null);
  const moving = state === "active";
  const revealClock = useRevealClock();

  useFrame(({ clock }) => {
    if (!jib.current) return;
    // Construction is the last thing to arrive (PLAN.md section 43, step 7):
    // every crane sweeps once as its site lands, which is what makes the
    // reveal end on movement rather than on a set of frozen toys. After the
    // sweep an active crane keeps turning slowly and the rest hold still.
    const swing = craneSwing(performance.now(), revealClock.current, appearAt);
    const idle = moving ? clock.elapsedTime * 0.22 : 0.9;
    // The sweep eases from a quarter turn back into wherever the idle
    // behaviour has reached, so it never jumps when it hands over.
    jib.current.rotation.y = swing >= 1 ? idle : SWING_FROM + swing * (idle - SWING_FROM);
  });

  const lean = state === "abandoned" ? 0.09 : 0;

  return (
    <group position={[-SITE * 0.32, 0, -SITE * 0.3]} rotation-z={lean}>
      <mesh geometry={craneMastGeometry(state, atmosphere.desaturation)} castShadow receiveShadow>
        <meshStandardMaterial vertexColors roughness={0.6} metalness={0.15} />
      </mesh>
      <group ref={jib} position={[0, 12.6, 0]}>
        <mesh geometry={craneJibGeometry(state, atmosphere.desaturation)} castShadow>
          <meshStandardMaterial vertexColors roughness={0.6} metalness={0.15} />
        </mesh>
      </group>
    </group>
  );
}

export default function ConstructionSitePiece({
  site,
  atmosphere,
}: {
  site: ConstructionSite;
  atmosphere: SceneAtmosphere;
}) {
  const { hovered, selected } = useEntityState(site.id);
  const handlers = useEntityHandlers(site.id);
  const reveal = useRevealGroup(site.appearAt);

  // 11 x 11 is what the meshes below are drawn at; see `SITE`.
  const fit = site.size ? Math.min(site.size[0], site.size[2]) / SITE : 1;

  const done = site.state === "completed";
  const weathered = site.state === "abandoned";
  const shellHeight = SHELL_HEIGHT[site.state];
  const shell = stateTint(
    desaturate(
      done ? "#ecdfcb" : weathered ? mix("#cfcabd", "#9a7b5f", 0.35) : "#cfcabd",
      atmosphere.desaturation,
    ),
    hovered,
    selected,
  );
  const ground = desaturate(weathered ? "#8f8a7c" : "#a89f8c", atmosphere.desaturation);
  // The dressing carries its own colours; hover and selection multiply them,
  // at half strength so a site never turns into a gold model of itself.
  const tint = mix("#ffffff", stateTint("#ffffff", hovered, selected), 0.5);

  return (
    <group ref={reveal} position={site.position} rotation-y={site.rotationY} {...handlers}>
      <group scale={fit}>
        <mesh rotation-x={-Math.PI / 2} position-y={0.05} receiveShadow>
          <planeGeometry args={[SITE, SITE]} />
          <meshStandardMaterial color={ground} roughness={1} />
        </mesh>

        {/* The structure under construction, or the finished one. */}
        <mesh position={[SITE * 0.12, shellHeight / 2, SITE * 0.1]} castShadow receiveShadow>
          <boxGeometry args={[5.4, shellHeight, 5.4]} />
          <meshStandardMaterial color={shell} roughness={done ? 0.7 : 0.95} />
        </mesh>

        <mesh
          geometry={constructionDecor(site.state, atmosphere.desaturation)}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial vertexColors color={tint} roughness={0.85} />
        </mesh>

        {done ? (
          <>
            <mesh position={[SITE * 0.12, shellHeight * 0.62, SITE * 0.1]}>
              <boxGeometry args={[5.46, 0.34, 5.46]} />
              <meshStandardMaterial
                color={WINDOW_COLOR}
                emissive={WINDOW_COLOR}
                emissiveIntensity={0.3 + atmosphere.windowGlow}
                toneMapped={false}
              />
            </mesh>
            <mesh rotation-x={-Math.PI / 2} position-y={0.08}>
              <ringGeometry args={[SITE * 0.38, SITE * 0.41, 40]} />
              <meshBasicMaterial color={HIGHLIGHT} transparent opacity={0.35} toneMapped={false} />
            </mesh>
          </>
        ) : (
          <>
            {/* Exposed floor slabs read as "unfinished" from a distance. */}
            {[0.45, 0.78].map((f) => (
              <mesh key={f} position={[SITE * 0.12, shellHeight * f, SITE * 0.1]}>
                <boxGeometry args={[5.8, 0.18, 5.8]} />
                <meshStandardMaterial color={mix(shell, "#ffffff", 0.18)} roughness={0.95} />
              </mesh>
            ))}
            <Crane state={site.state} atmosphere={atmosphere} appearAt={site.appearAt} />
          </>
        )}
      </group>
    </group>
  );
}
