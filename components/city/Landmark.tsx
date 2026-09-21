"use client";

/**
 * The infrastructure landmarks (PLAN.md sections 14, 15, 16, 20):
 *
 *   power   CI            plant with stacks; `state` drives a warning light
 *                         and a smoke puff, `"none"` drops to a substation
 *   fire    tests         station with an engine; `level` drives the size
 *   info    docs          visitor center with a sign; `level` drives the size
 *   station releases      terminal; `level` drives how busy the train is
 *   civic   the repo      town hall at the centre of the city
 *
 * Primitive assemblies only: no external models anywhere in this project.
 *
 * Every assembly below is modelled at the natural size recorded in
 * `NATURAL_LANDMARK_SIZE` (lib/city/layout.ts). The generator reserves a plot
 * for each landmark and reports it in `landmark.size`; this component scales
 * the assembly uniformly into that plot, which is what guarantees a power
 * station never lands on top of a block of buildings.
 */

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group, MeshStandardMaterial } from "three";
import { NATURAL_LANDMARK_SIZE } from "@/lib/city/layout";
import type { Landmark } from "@/types/city";
import {
  CIVIC_COLOR,
  CIVIC_ROOF,
  CONCRETE,
  HAZARD_RED,
  WARNING_ORANGE,
  WINDOW_COLOR,
  desaturate,
  mix,
  stateTint,
  type SceneAtmosphere,
} from "./palette";
import { Beacon, BlinkLight, Smoke, Sparks } from "./effects";
import { useEntityHandlers, useEntityState } from "./useEntity";
import { useRevealGroup } from "./useReveal";

interface Skin {
  wall: string;
  roof: string;
  accent: string;
  glow: number;
}

/**
 * CI as the city's power infrastructure (PLAN.md section 14). `state` is
 * exactly `RepoMetrics["ci"]["state"]`, and each value has to read from the
 * overview without ever implying a failure the analysis did not find:
 *
 *   healthy         three clean stacks, a lit hall, a green board, and the
 *                   occasional harmless arc across the switchyard
 *   recent-failure  an amber beacon over the hall, one stack venting, sparks
 *   failing         a red beacon, two stacks venting dark smoke, the third
 *                   dead and leaning, dim unsteady windows
 *   unknown         the plant, running, with an unlit board: there is a CI
 *                   provider but no completed run to report
 *   none            no plant at all, just the substation that keeps the
 *                   lights on. Section 14: do not imply failure.
 */
function PowerPlant({ landmark, skin }: { landmark: Landmark; skin: Skin }) {
  const state = landmark.state;
  const failing = state === "failing";
  const recent = state === "recent-failure";
  const troubled = failing || recent;
  const bare = state === "none";
  const windows = useRef<MeshStandardMaterial>(null);

  // A failing plant's lights are unsteady; every other state holds a level.
  useFrame(({ clock }) => {
    const material = windows.current;
    if (!material || !failing) return;
    const t = clock.elapsedTime;
    const dip = Math.sin(t * 9.1) * Math.sin(t * 2.7) > 0.55 ? 0.06 : 1;
    material.emissiveIntensity = (0.12 + skin.glow * 0.5) * dip;
  });

  const stackColor = mix(skin.wall, "#ffffff", 0.2);
  const board = failing
    ? HAZARD_RED
    : recent
      ? WARNING_ORANGE
      : state === "healthy"
        ? "#5fd08a"
        : "#7c8489";

  return (
    <group>
      <mesh position-y={0.3} receiveShadow castShadow>
        <boxGeometry args={[16, 0.6, 11]} />
        <meshStandardMaterial color={skin.roof} roughness={0.95} />
      </mesh>

      {/* The turbine hall and its stacks. A repository with no CI keeps the
          substation below and loses these. */}
      {!bare && (
        <>
          <mesh position={[-2.5, 3, 0]} castShadow receiveShadow>
            <boxGeometry args={[9, 5, 7.5]} />
            <meshStandardMaterial color={skin.wall} roughness={0.8} />
          </mesh>
          <mesh position={[-2.5, 5.9, 0]} castShadow>
            <boxGeometry args={[9.4, 0.9, 7.9]} />
            <meshStandardMaterial color={skin.roof} roughness={0.85} />
          </mesh>
          <mesh position={[-2.5, 3, 3.85]}>
            <boxGeometry args={[7.4, 1.6, 0.12]} />
            <meshStandardMaterial
              ref={windows}
              color={WINDOW_COLOR}
              emissive={WINDOW_COLOR}
              emissiveIntensity={troubled ? 0.12 + skin.glow * 0.5 : 0.35 + skin.glow}
              toneMapped={false}
            />
          </mesh>

          {[0, 1, 2].map((i) => {
            // The third stack is the one that goes cold when CI is failing.
            const dead = failing && i === 2;
            return (
              <group
                key={i}
                position={[4 + (i % 2) * 3.4, 0, -2.4 + i * 2.2]}
                rotation-z={dead ? 0.07 : 0}
              >
                <mesh position-y={4.4} castShadow>
                  <cylinderGeometry args={[0.95, 1.25, 8.4, 10]} />
                  <meshStandardMaterial
                    color={dead ? mix(stackColor, "#6d6660", 0.55) : stackColor}
                    roughness={0.85}
                  />
                </mesh>
                <mesh position-y={7.8}>
                  <cylinderGeometry args={[1, 1, 0.7, 10]} />
                  <meshStandardMaterial color={HAZARD_RED} roughness={0.7} />
                </mesh>
              </group>
            );
          })}
        </>
      )}

      {/* The switchyard: transformers, a pylon and the status board. This is
          the whole landmark when no CI was detected. */}
      <group position={[bare ? 0 : 5.6, 0, 3.4]}>
        {[-1.9, 1.9].map((x) => (
          <group key={x} position={[x, 0, 0]}>
            <mesh position-y={1.2} castShadow receiveShadow>
              <boxGeometry args={[2.4, 1.8, 2.2]} />
              <meshStandardMaterial
                color={mix(skin.roof, "#7e8b90", 0.5)}
                roughness={0.7}
                metalness={0.2}
              />
            </mesh>
            {[-0.6, 0.6].map((o) => (
              <mesh key={o} position={[o, 2.5, 0]} castShadow>
                <cylinderGeometry args={[0.16, 0.2, 1.2, 7]} />
                <meshStandardMaterial color={mix(CONCRETE, "#ffffff", 0.3)} roughness={0.5} />
              </mesh>
            ))}
          </group>
        ))}
        <mesh position-y={3.2} castShadow>
          <boxGeometry args={[0.24, 6, 0.24]} />
          <meshStandardMaterial color="#8d9497" roughness={0.6} metalness={0.3} />
        </mesh>
        {[4.6, 5.6].map((y) => (
          <mesh key={y} position-y={y} castShadow>
            <boxGeometry args={[4.4, 0.18, 0.18]} />
            <meshStandardMaterial color="#8d9497" roughness={0.6} metalness={0.3} />
          </mesh>
        ))}

        <mesh position={[0, 1.5, 1.9]} castShadow>
          <boxGeometry args={[1.5, 0.9, 0.14]} />
          <meshStandardMaterial color={mix(skin.roof, "#2f3a40", 0.7)} roughness={0.7} />
        </mesh>
        <mesh position={[0, 1.5, 2.02]}>
          <sphereGeometry args={[0.24, 10, 8]} />
          <meshStandardMaterial
            color={board}
            emissive={board}
            // Unlit for `unknown` and `none`: nothing to report is not a fault.
            emissiveIntensity={state === "unknown" || bare ? 0 : 1.6}
            toneMapped={false}
          />
        </mesh>
      </group>

      {/* Healthy: an occasional arc across the switchyard, the "subtle
          electrical effect" of section 14, and nothing else. */}
      {state === "healthy" && (
        <Sparks position={[5.6, 5.2, 3.4]} color="#cfe8ff" rate={0.11} spread={1.4} count={3} />
      )}

      {troubled && (
        <>
          <Beacon
            position={[-2.5, 6.4, 0]}
            color={failing ? HAZARD_RED : WARNING_ORANGE}
            rate={failing ? 3.2 : 1.6}
            height={1.4}
            glowRadius={failing ? 1.5 : 1.3}
          />
          <Sparks
            position={[5.6, 4.8, 3.4]}
            color={failing ? "#ffd9a8" : "#cfe8ff"}
            rate={failing ? 0.75 : 0.4}
            spread={1.5}
            count={5}
          />
          <Smoke
            origin={[4, 8.6, -2.4]}
            color={failing ? "#5e5b57" : "#8d8b87"}
            rate={failing ? 0.42 : 0.3}
            height={failing ? 15 : 11}
            spread={1.5}
            radius={0.85}
            puffs={failing ? 7 : 5}
            opacity={failing ? 0.5 : 0.36}
          />
          {failing && (
            <Smoke
              origin={[7.4, 8.6, -0.2]}
              color="#6b6864"
              rate={0.34}
              height={13}
              spread={1.6}
              radius={0.8}
              puffs={6}
              opacity={0.42}
            />
          )}
        </>
      )}
    </group>
  );
}

function FireStation({ landmark, skin }: { landmark: Landmark; skin: Skin }) {
  const level = landmark.level;
  const width = 6 + level * 1.8;
  const depth = 6.5;
  const height = 3.6 + level * 0.5;
  const red = desaturate(HAZARD_RED, 0.12);

  return (
    <group>
      <mesh position-y={0.25} receiveShadow castShadow>
        <boxGeometry args={[width + 5, 0.5, depth + 4]} />
        <meshStandardMaterial color={skin.roof} roughness={0.95} />
      </mesh>

      <mesh position={[0, 0.5 + height / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[width, height, depth]} />
        <meshStandardMaterial color={mix(skin.wall, red, 0.55)} roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.5 + height + 0.3, 0]} castShadow>
        <boxGeometry args={[width + 0.6, 0.6, depth + 0.6]} />
        <meshStandardMaterial color={skin.roof} roughness={0.85} />
      </mesh>

      {/* Garage doors: one per level, so a weak suite reads as a small station. */}
      {Array.from({ length: Math.max(1, level) }, (_, i) => (
        <mesh
          key={i}
          position={[
            -width / 2 + (width / Math.max(1, level)) * (i + 0.5),
            0.5 + height * 0.42,
            depth / 2 + 0.06,
          ]}
        >
          <boxGeometry args={[width / Math.max(1, level) - 0.8, height * 0.72, 0.12]} />
          <meshStandardMaterial color="#3d444a" roughness={0.6} />
        </mesh>
      ))}

      {level > 0 && (
        <group position={[0, 0, depth / 2 + 2.6]}>
          <mesh position-y={0.85} castShadow>
            <boxGeometry args={[1.9, 1.1, 4.2]} />
            <meshStandardMaterial color={red} roughness={0.55} />
          </mesh>
          <mesh position={[0, 1.75, -0.5]} castShadow>
            <boxGeometry args={[1.7, 0.9, 1.6]} />
            <meshStandardMaterial color={mix(red, "#ffffff", 0.25)} roughness={0.5} />
          </mesh>
          <BlinkLight position={[0, 2.35, -0.5]} color="#ff5f52" rate={1.8} radius={0.2} />
        </group>
      )}

      {level >= 2 && (
        <mesh position={[-width / 2 - 1.1, 0.5 + height * 0.9, -depth / 2 + 1]} castShadow>
          <boxGeometry args={[1.4, height * 1.7, 1.4]} />
          <meshStandardMaterial color={skin.wall} roughness={0.8} />
        </mesh>
      )}
    </group>
  );
}

function VisitorCenter({ landmark, skin }: { landmark: Landmark; skin: Skin }) {
  const level = landmark.level;
  const width = 5.5 + level * 1.6;
  const depth = 6;
  const height = 3 + level * 0.45;

  return (
    <group>
      <mesh position-y={0.25} receiveShadow castShadow>
        <boxGeometry args={[width + 4.5, 0.5, depth + 4]} />
        <meshStandardMaterial color={skin.roof} roughness={0.95} />
      </mesh>

      <mesh position={[0, 0.5 + height / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[width, height, depth]} />
        <meshStandardMaterial color={skin.wall} roughness={0.75} />
      </mesh>

      {/* Glass front: documentation is what makes the city navigable. */}
      <mesh position={[0, 0.5 + height / 2, depth / 2 + 0.07]}>
        <boxGeometry args={[width - 1, height - 1, 0.12]} />
        <meshStandardMaterial
          color="#bcd9e4"
          emissive={WINDOW_COLOR}
          emissiveIntensity={0.25 + skin.glow * 0.8}
          roughness={0.25}
          metalness={0.1}
          toneMapped={false}
        />
      </mesh>

      <mesh position={[0, 0.5 + height + 0.55, 0]} castShadow>
        <boxGeometry args={[width + 1.4, 0.45, depth + 1.4]} />
        <meshStandardMaterial color={skin.roof} roughness={0.85} />
      </mesh>

      {/* The information sign. Bigger docs, bigger sign. */}
      <group position={[width / 2 + 1.8, 0, depth / 2 - 1]}>
        <mesh position-y={1.4} castShadow>
          <cylinderGeometry args={[0.13, 0.13, 2.8, 6]} />
          <meshStandardMaterial color="#7d817f" roughness={0.6} />
        </mesh>
        <mesh position-y={3} rotation-y={-0.35} castShadow>
          <boxGeometry args={[2.2 + level * 0.35, 1.5 + level * 0.2, 0.14]} />
          <meshStandardMaterial color={skin.accent} roughness={0.6} />
        </mesh>
      </group>
    </group>
  );
}

function TransitStation({ landmark, skin }: { landmark: Landmark; skin: Skin }) {
  const level = landmark.level;
  const train = useRef<Group>(null);
  const speed = level === 0 ? 0 : 1.2 + level * 1.1;

  useFrame(({ clock }) => {
    if (!train.current || speed === 0) return;
    const span = 9;
    train.current.position.x = Math.sin(clock.elapsedTime * speed * 0.18) * span;
  });

  return (
    <group>
      <mesh position-y={0.3} receiveShadow castShadow>
        <boxGeometry args={[22, 0.6, 9]} />
        <meshStandardMaterial color={skin.roof} roughness={0.95} />
      </mesh>

      <mesh position={[-5, 2.6, -1.4]} castShadow receiveShadow>
        <boxGeometry args={[9, 4.6, 5.4]} />
        <meshStandardMaterial color={skin.wall} roughness={0.78} />
      </mesh>
      <mesh position={[-5, 5.2, -1.4]} castShadow>
        <boxGeometry args={[9.8, 0.6, 6.2]} />
        <meshStandardMaterial color={skin.roof} roughness={0.85} />
      </mesh>
      <mesh position={[-5, 2.6, 1.4]}>
        <boxGeometry args={[7.4, 2, 0.12]} />
        <meshStandardMaterial
          color={WINDOW_COLOR}
          emissive={WINDOW_COLOR}
          emissiveIntensity={0.25 + skin.glow}
          toneMapped={false}
        />
      </mesh>

      {/* Rails and platform. */}
      <mesh position={[0, 0.75, 2.6]} receiveShadow>
        <boxGeometry args={[21, 0.3, 2.6]} />
        <meshStandardMaterial color={CONCRETE} roughness={0.95} />
      </mesh>
      {[-0.6, 0.6].map((offset) => (
        <mesh key={offset} position={[0, 0.66, 4.6 + offset]}>
          <boxGeometry args={[21, 0.12, 0.16]} />
          <meshStandardMaterial color="#6d6a64" roughness={0.6} metalness={0.3} />
        </mesh>
      ))}

      <group ref={train} position={[0, 0, 4.6]}>
        <mesh position-y={1.3} castShadow>
          <boxGeometry args={[6.4, 1.5, 1.7]} />
          <meshStandardMaterial color={skin.accent} roughness={0.5} />
        </mesh>
        <mesh position={[0, 2.15, 0]} castShadow>
          <boxGeometry args={[5.4, 0.5, 1.5]} />
          <meshStandardMaterial color={mix(skin.accent, "#ffffff", 0.3)} roughness={0.5} />
        </mesh>
      </group>
    </group>
  );
}

function TownHall({ skin }: { skin: Skin }) {
  return (
    <group>
      {[0, 1, 2].map((i) => (
        <mesh key={i} position-y={0.22 + i * 0.32} receiveShadow castShadow>
          <boxGeometry args={[13 - i * 1.6, 0.34, 13 - i * 1.6]} />
          <meshStandardMaterial color={skin.roof} roughness={0.92} />
        </mesh>
      ))}

      <mesh position-y={3.6} castShadow receiveShadow>
        <boxGeometry args={[8, 5, 8]} />
        <meshStandardMaterial color={skin.wall} roughness={0.75} />
      </mesh>

      {[-3, -1, 1, 3].map((x) => (
        <mesh key={x} position={[x, 3.6, 4.3]} castShadow>
          <cylinderGeometry args={[0.32, 0.34, 5, 8]} />
          <meshStandardMaterial color={mix(skin.wall, "#ffffff", 0.35)} roughness={0.7} />
        </mesh>
      ))}

      <mesh position-y={6.4} castShadow>
        <boxGeometry args={[9.4, 0.7, 9.4]} />
        <meshStandardMaterial color={skin.roof} roughness={0.85} />
      </mesh>
      <mesh position-y={7.1} castShadow>
        <cylinderGeometry args={[2.4, 2.9, 1.2, 12]} />
        <meshStandardMaterial color={skin.wall} roughness={0.75} />
      </mesh>
      <mesh position-y={7.7} castShadow>
        <sphereGeometry args={[2.4, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color={skin.accent} roughness={0.55} metalness={0.15} />
      </mesh>
      <mesh position-y={11.1} castShadow>
        <cylinderGeometry args={[0.09, 0.09, 3, 6]} />
        <meshStandardMaterial color="#8d8f8b" roughness={0.6} />
      </mesh>
      <mesh position={[0.85, 12.1, 0]} castShadow>
        <boxGeometry args={[1.6, 0.95, 0.06]} />
        <meshStandardMaterial color={skin.accent} roughness={0.65} />
      </mesh>
    </group>
  );
}

export default function LandmarkPiece({
  landmark,
  atmosphere,
}: {
  landmark: Landmark;
  atmosphere: SceneAtmosphere;
}) {
  const { hovered, selected } = useEntityState(landmark.id);
  const handlers = useEntityHandlers(landmark.id);
  const reveal = useRevealGroup(landmark.appearAt);

  const natural = NATURAL_LANDMARK_SIZE[landmark.landmarkType];
  const fit = landmark.size
    ? Math.min(landmark.size[0] / natural[0], landmark.size[2] / natural[2])
    : 1;

  const skin: Skin = {
    wall: stateTint(desaturate(CIVIC_COLOR, atmosphere.desaturation), hovered, selected),
    roof: stateTint(desaturate(CIVIC_ROOF, atmosphere.desaturation), hovered, selected),
    accent: stateTint(desaturate("#7fa9bd", atmosphere.desaturation), hovered, selected),
    glow: atmosphere.windowGlow,
  };

  return (
    <group
      ref={reveal}
      position={landmark.position}
      rotation-y={landmark.rotationY}
      {...handlers}
    >
      <group scale={fit}>
        {landmark.landmarkType === "power" && <PowerPlant landmark={landmark} skin={skin} />}
        {landmark.landmarkType === "fire" && <FireStation landmark={landmark} skin={skin} />}
        {landmark.landmarkType === "info" && <VisitorCenter landmark={landmark} skin={skin} />}
        {landmark.landmarkType === "station" && <TransitStation landmark={landmark} skin={skin} />}
        {landmark.landmarkType === "civic" && <TownHall skin={skin} />}
      </group>
    </group>
  );
}
