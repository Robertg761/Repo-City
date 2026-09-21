"use client";

/**
 * Landmark files become recognisable civic structures rather than ordinary
 * blocks (PLAN.md section 10): README, the manifest, CONTRIBUTING, CHANGELOG
 * and the Dockerfile. There are at most five of them, so they are plain meshes
 * with their own handlers rather than instances (section 38).
 *
 * Each one gets a small, obvious civic identity a viewer can name without a
 * caption -- a library behind its steps, a hall with a clock, an archive under
 * its tower, a warehouse with containers stacked outside, a flag over the
 * meeting house -- and each is built from the plot the generator reserved in
 * `building.size`, so a landmark never grows into the block next door.
 *
 * They share the palette and the silhouette language of the rest of the city:
 * the difference is a roof feature, not a different art style.
 */

import { DoubleSide } from "three";
import type { LandmarkFile } from "@/types/analysis";
import type { Building } from "@/types/city";
import {
  CIVIC_COLOR,
  CIVIC_ROOF,
  HAZARD_RED,
  WINDOW_COLOR,
  desaturate,
  mix,
  stateTint,
  type SceneAtmosphere,
} from "./palette";
import { useEntityHandlers, useEntityState } from "./useEntity";
import { useRevealGroup } from "./useReveal";

interface CivicBuildingProps {
  building: Building;
  atmosphere: SceneAtmosphere;
}

/** Wall, roof and accent for one civic building, already tinted for state. */
interface Skin {
  wall: string;
  roof: string;
  accent: string;
  stone: string;
  flag: string;
  glow: number;
}

/** The front steps every important building in a small city stands behind. */
function Steps({
  width,
  depth,
  color,
  height = 0.5,
}: {
  width: number;
  depth: number;
  color: string;
  height?: number;
}) {
  return (
    <group position={[0, 0, depth / 2]}>
      {[0, 1, 2].map((i) => (
        <mesh
          key={i}
          position={[0, height - i * (height / 3) - height / 6, (i + 1) * 0.34]}
          receiveShadow
          castShadow
        >
          <boxGeometry args={[width * (0.9 - i * 0.06), height / 3, 0.7]} />
          <meshStandardMaterial color={color} roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

function Colonnade({
  width,
  depth,
  height,
  color,
  count = 4,
}: {
  width: number;
  depth: number;
  height: number;
  color: string;
  count?: number;
}) {
  const radius = Math.min(0.26, width * 0.055);
  return (
    <group>
      {Array.from({ length: count }, (_, i) => {
        const x = (-width / 2 + (width / (count - 1)) * i) * 0.84;
        return (
          <mesh key={i} position={[x, height / 2, depth / 2 + radius * 2]} castShadow>
            <cylinderGeometry args={[radius, radius * 1.08, height, 8]} />
            <meshStandardMaterial color={color} roughness={0.75} />
          </mesh>
        );
      })}
    </group>
  );
}

/** A shallow hipped roof: the civic silhouette, at any footprint. */
function Roof({
  width,
  depth,
  y,
  color,
  overhang = 0.6,
  pitch = 0.9,
}: {
  width: number;
  depth: number;
  y: number;
  color: string;
  overhang?: number;
  pitch?: number;
}) {
  return (
    <group position-y={y}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[width + overhang, 0.34, depth + overhang]} />
        <meshStandardMaterial color={color} roughness={0.85} />
      </mesh>
      <mesh position-y={0.17 + pitch / 2} rotation-y={Math.PI / 4} castShadow>
        <coneGeometry args={[(Math.max(width, depth) * 0.72) / Math.SQRT2 + 0.3, pitch, 4]} />
        <meshStandardMaterial color={mix(color, "#ffffff", 0.12)} roughness={0.85} flatShading />
      </mesh>
    </group>
  );
}

/** A clock face, for the hall the manifest builds. */
function Clock({
  position,
  radius,
  face,
  hands,
}: {
  position: [number, number, number];
  radius: number;
  face: string;
  hands: string;
}) {
  return (
    <group position={position} rotation-x={Math.PI / 2}>
      <mesh castShadow>
        <cylinderGeometry args={[radius, radius, 0.14, 16]} />
        <meshStandardMaterial color={face} roughness={0.55} />
      </mesh>
      <mesh position-y={0.09} rotation-x={-Math.PI / 2}>
        <boxGeometry args={[radius * 0.16, radius * 1.2, 0.05]} />
        <meshStandardMaterial color={hands} roughness={0.6} />
      </mesh>
      <mesh position-y={0.09} rotation={[-Math.PI / 2, 0, Math.PI / 2.4]}>
        <boxGeometry args={[radius * 0.14, radius * 0.86, 0.05]} />
        <meshStandardMaterial color={hands} roughness={0.6} />
      </mesh>
    </group>
  );
}

/** README: the library everyone walks into first. */
function Library({ w, h, d, skin }: { w: number; h: number; d: number; skin: Skin }) {
  return (
    <group>
      <Steps width={w} depth={d} color={skin.stone} />
      <mesh position-y={0.5 + h / 2} castShadow receiveShadow>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color={skin.wall} roughness={0.78} />
      </mesh>
      <Colonnade width={w} depth={d} height={h + 0.5} color={skin.stone} />
      {/* Tall reading-room windows down the flanks. */}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[(side * w) / 2 - side * 0.02, 0.5 + h * 0.55, 0]}>
          <boxGeometry args={[0.08, h * 0.5, d * 0.7]} />
          <meshStandardMaterial
            color={WINDOW_COLOR}
            emissive={WINDOW_COLOR}
            emissiveIntensity={0.18 + skin.glow}
            toneMapped={false}
            roughness={0.45}
          />
        </mesh>
      ))}
      <Roof width={w} depth={d} y={0.5 + h + 0.17} color={skin.roof} pitch={w * 0.16} />
    </group>
  );
}

/** The manifest: the hall that tells the city what it is, and what time it is. */
function ClockHall({ w, h, d, skin }: { w: number; h: number; d: number; skin: Skin }) {
  const towerW = w * 0.34;
  const towerTop = 0.5 + h + w * 0.95;
  return (
    <group>
      <mesh position-y={0.5 + h / 2} castShadow receiveShadow>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color={skin.wall} roughness={0.76} />
      </mesh>
      <mesh position-y={0.5 + h * 0.52}>
        <boxGeometry args={[w * 1.01, h * 0.16, d * 1.01]} />
        <meshStandardMaterial
          color={WINDOW_COLOR}
          emissive={WINDOW_COLOR}
          emissiveIntensity={0.2 + skin.glow}
          toneMapped={false}
        />
      </mesh>
      <Roof width={w} depth={d} y={0.5 + h + 0.17} color={skin.roof} pitch={w * 0.14} />

      {/* The clock tower over the entrance. */}
      <mesh position={[0, 0.5 + h + w * 0.42, d * 0.12]} castShadow receiveShadow>
        <boxGeometry args={[towerW, w * 0.9, towerW]} />
        <meshStandardMaterial color={mix(skin.wall, "#ffffff", 0.16)} roughness={0.74} />
      </mesh>
      <Clock
        position={[0, 0.5 + h + w * 0.55, d * 0.12 + towerW / 2 + 0.05]}
        radius={towerW * 0.33}
        face={skin.stone}
        hands="#3a413f"
      />
      <mesh position={[0, towerTop - 0.1, d * 0.12]} rotation-y={Math.PI / 4} castShadow>
        <coneGeometry args={[towerW * 0.78, w * 0.32, 4]} />
        <meshStandardMaterial color={skin.accent} roughness={0.7} flatShading />
      </mesh>
    </group>
  );
}

/** CHANGELOG: the archive, and the tower that keeps its record. */
function Archive({ w, h, d, skin }: { w: number; h: number; d: number; skin: Skin }) {
  const towerW = w * 0.38;
  const towerH = h * 1.1 + w * 0.5;
  return (
    <group>
      <mesh position-y={0.5 + h / 2} castShadow receiveShadow>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color={skin.wall} roughness={0.8} />
      </mesh>
      {/* Narrow slit windows: an archive keeps the daylight off its shelves. */}
      {[-0.28, 0, 0.28].map((f) => (
        <mesh key={f} position={[w * f, 0.5 + h * 0.6, d / 2 + 0.03]}>
          <boxGeometry args={[w * 0.08, h * 0.45, 0.06]} />
          <meshStandardMaterial
            color={WINDOW_COLOR}
            emissive={WINDOW_COLOR}
            emissiveIntensity={0.16 + skin.glow * 0.8}
            toneMapped={false}
          />
        </mesh>
      ))}
      <Roof width={w} depth={d} y={0.5 + h + 0.17} color={skin.roof} pitch={w * 0.1} />

      <group position={[-w * 0.28, 0, -d * 0.2]}>
        <mesh position-y={0.5 + towerH / 2} castShadow receiveShadow>
          <boxGeometry args={[towerW, towerH, towerW]} />
          <meshStandardMaterial color={mix(skin.wall, skin.stone, 0.4)} roughness={0.78} />
        </mesh>
        <mesh position-y={0.5 + towerH * 0.88} castShadow>
          <boxGeometry args={[towerW * 1.22, towerW * 0.28, towerW * 1.22]} />
          <meshStandardMaterial color={skin.roof} roughness={0.8} />
        </mesh>
        <mesh position-y={0.5 + towerH + towerW * 0.34} rotation-y={Math.PI / 4} castShadow>
          <coneGeometry args={[towerW * 0.82, towerW * 1.1, 4]} />
          <meshStandardMaterial color={skin.accent} roughness={0.7} flatShading />
        </mesh>
      </group>
    </group>
  );
}

/** The Dockerfile: a warehouse, with its containers stacked in the yard. */
function Warehouse({
  w,
  h,
  d,
  skin,
  containerColors,
}: {
  w: number;
  h: number;
  d: number;
  skin: Skin;
  containerColors: [string, string, string];
}) {
  const body = Math.max(h * 0.62, 2.4);
  const unit = Math.min(w * 0.3, d * 0.34);
  const container = (i: number, x: number, y: number, z: number, rotation: number) => (
    <mesh key={i} position={[x, y, z]} rotation-y={rotation} castShadow receiveShadow>
      <boxGeometry args={[unit * 2.1, unit * 0.9, unit]} />
      <meshStandardMaterial color={containerColors[i % 3]} roughness={0.72} />
    </mesh>
  );

  return (
    <group>
      <mesh position-y={0.5 + body / 2} castShadow receiveShadow>
        <boxGeometry args={[w, body, d * 0.82]} />
        <meshStandardMaterial color={skin.wall} roughness={0.84} />
      </mesh>
      {/* A barrel roof: nothing else in the city has one. */}
      {/* Half a cylinder laid along the depth axis. The arc starts at a
          quarter turn so its open side faces down once the barrel is tipped
          onto its side, which is what makes it a roof and not a hood. */}
      <mesh position-y={0.5 + body} rotation-x={Math.PI / 2} castShadow>
        <cylinderGeometry
          args={[w * 0.42, w * 0.42, d * 0.84, 14, 1, false, Math.PI / 2, Math.PI]}
        />
        <meshStandardMaterial color={skin.roof} roughness={0.8} side={DoubleSide} />
      </mesh>
      {/* The loading door. */}
      <mesh position={[0, 0.5 + body * 0.42, (d * 0.82) / 2 + 0.04]}>
        <boxGeometry args={[w * 0.42, body * 0.7, 0.1]} />
        <meshStandardMaterial color={mix(skin.accent, "#2f3a40", 0.55)} roughness={0.65} />
      </mesh>

      <group position={[0, 0, -d * 0.44]}>
        {container(0, -w * 0.18, 0.5 + unit * 0.45, 0, 0.12)}
        {container(1, w * 0.22, 0.5 + unit * 0.45, unit * 0.25, -0.2)}
        {container(2, -w * 0.12, 0.5 + unit * 1.35, unit * 0.1, 0.05)}
      </group>
    </group>
  );
}

/** CONTRIBUTING: the meeting house, and the flag that says newcomers welcome. */
function FlagHouse({ w, h, d, skin }: { w: number; h: number; d: number; skin: Skin }) {
  const poleH = h * 0.95 + 3.2;
  return (
    <group>
      <mesh position-y={0.5 + h / 2} castShadow receiveShadow>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color={skin.wall} roughness={0.76} />
      </mesh>
      {/* An open porch across the front: the door is always on the latch. */}
      <group position={[0, 0, d * 0.5]}>
        {[-0.34, 0.34].map((f) => (
          <mesh key={f} position={[w * f, 0.5 + h * 0.4, 0.5]} castShadow>
            <cylinderGeometry args={[0.16, 0.17, h * 0.8, 7]} />
            <meshStandardMaterial color={skin.stone} roughness={0.78} />
          </mesh>
        ))}
        <mesh position={[0, 0.5 + h * 0.82, 0.5]} castShadow>
          <boxGeometry args={[w * 0.9, 0.26, 1.3]} />
          <meshStandardMaterial color={skin.roof} roughness={0.82} />
        </mesh>
      </group>
      <mesh position-y={0.5 + h * 0.56}>
        <boxGeometry args={[w * 1.01, h * 0.14, d * 1.01]} />
        <meshStandardMaterial
          color={WINDOW_COLOR}
          emissive={WINDOW_COLOR}
          emissiveIntensity={0.2 + skin.glow}
          toneMapped={false}
        />
      </mesh>
      <Roof width={w} depth={d} y={0.5 + h + 0.17} color={skin.roof} pitch={w * 0.14} />

      <group position={[-w * 0.36, 0, d * 0.36]}>
        <mesh position-y={poleH / 2} castShadow>
          <cylinderGeometry args={[0.08, 0.1, poleH, 6]} />
          <meshStandardMaterial color="#9aa0a0" roughness={0.6} metalness={0.25} />
        </mesh>
        <mesh position={[0.74, poleH - 0.7, 0]} castShadow>
          <boxGeometry args={[1.5, 0.92, 0.06]} />
          <meshStandardMaterial color={skin.flag} roughness={0.7} side={DoubleSide} />
        </mesh>
      </group>
    </group>
  );
}

export default function CivicBuilding({ building, atmosphere }: CivicBuildingProps) {
  const { hovered, selected } = useEntityState(building.id);
  const handlers = useEntityHandlers(building.id);
  const reveal = useRevealGroup(building.appearAt);
  const [width, height, depth] = building.size;
  const kind: LandmarkFile | null = building.plan.landmark;

  const tint = (hex: string) => stateTint(desaturate(hex, atmosphere.desaturation), hovered, selected);
  const skin: Skin = {
    wall: tint(CIVIC_COLOR),
    roof: tint(CIVIC_ROOF),
    accent: tint("#7fa9bd"),
    stone: tint("#f4f1e8"),
    flag: tint(mix(HAZARD_RED, "#e8853c", 0.35)),
    glow: atmosphere.windowGlow,
  };

  return (
    <group
      ref={reveal}
      position={building.position}
      rotation-y={building.rotationY}
      {...handlers}
    >
      {/* Every civic building stands on a low plinth: it reads as important. */}
      <mesh position-y={0.25} castShadow receiveShadow>
        <boxGeometry args={[width * 1.3, 0.5, depth * 1.3]} />
        <meshStandardMaterial color={skin.roof} roughness={0.9} />
      </mesh>

      {kind === "readme" && <Library w={width} h={height} d={depth} skin={skin} />}
      {kind === "manifest" && <ClockHall w={width} h={height} d={depth} skin={skin} />}
      {kind === "changelog" && <Archive w={width} h={height} d={depth} skin={skin} />}
      {kind === "contributing" && <FlagHouse w={width} h={height} d={depth} skin={skin} />}
      {kind === "dockerfile" && (
        <Warehouse
          w={width}
          h={height}
          d={depth}
          skin={skin}
          containerColors={[
            tint("#4a86a8"),
            tint("#b4693f"),
            tint("#6f8f6a"),
          ]}
        />
      )}

    </group>
  );
}
