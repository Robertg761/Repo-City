"use client";

/**
 * The ground the city sits on (PLAN.md section 36). Two planes: the wide
 * landscape that runs out into the pale backdrop, and the slightly lighter city plate
 * that gives the diorama an edge. District tints are drawn on top by
 * `District.tsx`, pavements by `Roads.tsx`, the civic gravel by
 * `Environment.tsx`.
 *
 * Both planes carry a procedural grass texture (`textures/patterns.ts`): a
 * flat plane of one colour is the single strongest tell that a frame is a
 * render rather than a photograph of a model, and section 4 rules out
 * downloading an asset for it. Wrapped value noise a few percent either side
 * of the base colour, warmer where it is dry. The city plate is mown lawn --
 * the parks between the blocks are the plate showing through -- so it also
 * carries soft mowing stripes that come and go in patches; the landscape past
 * the ring road is meadow and does not.
 *
 * The landscape is also the "nothing here" click target: clicking it clears
 * the selection (PLAN.md section 6).
 */

import { useMemo, useRef } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import { BufferAttribute, Color } from "three";
import { useCityStore } from "@/store/useCityStore";
import { REFERENCE_ASPECT, aspectWiden } from "./entities";
import { wasDrag } from "./useEntity";
import {
  STAGE_KERB,
  STAGE_SOIL,
  TREE_TRUNK,
  WARNING_ORANGE,
  mix,
  type SceneAtmosphere,
} from "./palette";
import { useSkyFrame } from "./sky";
import { useTiledSurface } from "./textures/surfaces";

interface TerrainProps {
  size: number;
  /**
   * Canvas width over height. A narrow screen frames the city from up to
   * twice as far back (`aspectWiden`), so the landscape widens with the
   * camera and the fog, or a phone pulled all the way out sees its far
   * corner against the sky. A desktop's is exactly today's.
   */
  aspect?: number;
  atmosphere: SceneAtmosphere;
}

/**
 * World units covered by one tile of grass, per surface. The landscape runs
 * to three hundred units and more: tiled every thirteen units, as the city
 * plate is, the repeat reads as a woven pattern rather than as ground. The
 * plate's tile carries four mower passes, so a stripe is about a unit and a
 * half wide: two cars, which is what a lawn stripe is on a model railway.
 * The empty stage's turf has no stripes to keep to a scale, so it is tiled
 * wide enough that its faint patches never line up into a visible repeat.
 */
const GRASS_TILE = { plate: 13, stage: 31, landscape: 52 } as const;

/** How far the landscape runs past the city, as a multiple of `bounds.size`. */
const LANDSCAPE = 3.2;
/**
 * Where the rim fade starts and ends, as a fraction of the landscape's radius.
 * The city plate reaches about a third of the way out and the overview frame
 * about two thirds, so the fade begins past both: the grass in frame stays
 * grass, full colour, and only the outer edge that a tilted camera sees goes
 * pale. This is a backdrop, not air: it must never reach the city.
 */
const RIM_NEAR = 0.72;
const RIM_FAR = 1;

/**
 * Vertex colours that fade the landscape into the pale backdrop at its rim,
 * the way a model on a table sits in front of a studio sweep. Without it the
 * ground simply stops, in a hard diagonal line against the sky, and the
 * diorama turns back into a flat plane in a viewport.
 */
function rimColors(segments: number, near: string, far: string, into?: BufferAttribute): BufferAttribute {
  const near3 = new Color(near);
  const far3 = new Color(far);
  const side = segments + 1;
  const colors = (into?.array as Float32Array | undefined) ?? new Float32Array(side * side * 3);
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      // Plane coordinates run -0.5..0.5 before scaling; the fade is radial so
      // the corners, which are furthest away, go first.
      const dx = x / segments - 0.5;
      const dy = y / segments - 0.5;
      const radius = Math.hypot(dx, dy) / 0.5;
      const t = Math.max(0, Math.min(1, (radius - RIM_NEAR) / (RIM_FAR - RIM_NEAR)));
      const smooth = t * t * (3 - 2 * t);
      const i = (y * side + x) * 3;
      colors[i] = near3.r + (far3.r - near3.r) * smooth;
      colors[i + 1] = near3.g + (far3.g - near3.g) * smooth;
      colors[i + 2] = near3.b + (far3.b - near3.b) * smooth;
    }
  }
  if (into) {
    into.needsUpdate = true;
    return into;
  }
  return new BufferAttribute(colors, 3);
}

const RIM_SEGMENTS = 32;

export default function Terrain({ size, atmosphere, aspect = REFERENCE_ASPECT }: TerrainProps) {
  const actions = useCityStore((s) => s.actions);
  const reach = size * LANDSCAPE * aspectWiden(aspect);
  const landscape = useTiledSurface("meadow", reach, GRASS_TILE.landscape);
  const plate = useTiledSurface("lawn", size * 1.04, GRASS_TILE.plate);
  const rim = useMemo(
    () => rimColors(RIM_SEGMENTS, atmosphere.terrainColor, atmosphere.skyGroundColor),
    [atmosphere.terrainColor, atmosphere.skyGroundColor],
  );
  // The rim fades into the hour's backdrop: pale by day, deep blue at night.
  // Rewritten in place from the frame loop, before the first frame draws.
  const painted = useRef<{ rim: BufferAttribute | null; to: string }>({ rim: null, to: "" });
  useSkyFrame((live) => {
    if (painted.current.rim === rim && painted.current.to === live.skyGroundColor) return;
    painted.current = { rim, to: live.skyGroundColor };
    rimColors(RIM_SEGMENTS, atmosphere.terrainColor, live.skyGroundColor, rim);
  }, rim);

  const clearSelection = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    // Letting go of an orbit or a pan over the grass is not a click on it.
    if (wasDrag(event)) return;
    actions.select(null);
  };

  const clearHover = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    actions.hover(null);
  };

  return (
    <group>
      <mesh
        rotation-x={-Math.PI / 2}
        position-y={-0.06}
        receiveShadow
        onClick={clearSelection}
        onPointerMove={clearHover}
      >
        <planeGeometry args={[reach, reach, RIM_SEGMENTS, RIM_SEGMENTS]}>
          <primitive attach="attributes-color" object={rim} />
        </planeGeometry>
        {/* White, because the colour is in the vertices: the rim fade has to
            multiply the grass, not be multiplied by a second base colour. */}
        <meshStandardMaterial color="#ffffff" vertexColors map={landscape} roughness={1} metalness={0} />
      </mesh>

      <mesh rotation-x={-Math.PI / 2} position-y={-0.02} receiveShadow onClick={clearSelection}>
        <planeGeometry args={[size * 1.04, size * 1.04]} />
        <meshStandardMaterial
          color={mix(atmosphere.terrainColor, "#ffffff", 0.18)}
          map={plate}
          roughness={1}
          metalness={0}
        />
      </mesh>
    </group>
  );
}

/** Height of the stage's lawn above the landscape, and of its kerb above that. */
const STAGE_TOP = 0.8;
const KERB_HEIGHT = 0.22;
const KERB_WIDTH = 0.8;
/** The chalked survey: how far in from the kerb, how wide a line, how tall a peg. */
const SURVEY_INSET = 8;
const LINE_WIDTH = 0.35;
const PEG_HEIGHT = 2.1;

const nothing = () => null;

/**
 * The empty stage (`EmptyStage` in `CityCanvas`): the city plate as a plinth
 * waiting for a city, with a stone kerb round its top and the earth showing
 * down its sides. A flat plate of lawn, with nothing on it, was the whole
 * frame and gave the eye nothing to measure it by; an edge with some depth
 * turns it back into a model on a table.
 *
 * It stands over `Terrain`'s own plate, which it hides, and it lets every
 * pointer through to the landscape underneath, so a click on it does what a
 * click on bare ground always does.
 */
export function StagePlate({ size, atmosphere }: TerrainProps) {
  const side = size * 1.04;
  const turf = useTiledSurface("turf", side, GRASS_TILE.stage);
  const depth = STAGE_TOP + 0.06;
  const kerbY = STAGE_TOP + KERB_HEIGHT / 2 - 0.02;
  const edge = side / 2 - KERB_WIDTH / 2;
  const kerbs: [number, number, number, number][] = [
    [0, -edge, side, KERB_WIDTH],
    [0, edge, side, KERB_WIDTH],
    [-edge, 0, KERB_WIDTH, side - KERB_WIDTH * 2],
    [edge, 0, KERB_WIDTH, side - KERB_WIDTH * 2],
  ];
  // The survey: a ring road and the two avenues through the middle, chalked
  // out on the turf and pegged where they meet.
  const ring = side / 2 - SURVEY_INSET;
  const lines: [number, number, number, number][] = [
    [0, -ring, ring * 2 + LINE_WIDTH, LINE_WIDTH],
    [0, ring, ring * 2 + LINE_WIDTH, LINE_WIDTH],
    [-ring, 0, LINE_WIDTH, ring * 2 + LINE_WIDTH],
    [ring, 0, LINE_WIDTH, ring * 2 + LINE_WIDTH],
    [0, 0, ring * 2, LINE_WIDTH],
    [0, 0, LINE_WIDTH, ring * 2],
  ];
  const pegs: [number, number][] = [];
  for (const x of [-ring, 0, ring]) for (const z of [-ring, 0, ring]) pegs.push([x, z]);
  const chalk = mix(atmosphere.terrainColor, "#ffffff", 0.3);

  return (
    <group>
      <mesh position-y={STAGE_TOP - depth / 2 - 0.01} castShadow receiveShadow raycast={nothing}>
        <boxGeometry args={[side, depth, side]} />
        <meshStandardMaterial color={STAGE_SOIL} roughness={1} metalness={0} />
      </mesh>

      <mesh rotation-x={-Math.PI / 2} position-y={STAGE_TOP} receiveShadow raycast={nothing}>
        <planeGeometry args={[side, side]} />
        <meshStandardMaterial
          color={mix(atmosphere.terrainColor, "#ffffff", 0.08)}
          map={turf}
          roughness={1}
          metalness={0}
        />
      </mesh>

      {kerbs.map(([x, z, w, d]) => (
        <mesh
          key={`${x}:${z}`}
          position={[x, kerbY, z]}
          castShadow
          receiveShadow
          raycast={nothing}
        >
          <boxGeometry args={[w, KERB_HEIGHT, d]} />
          <meshStandardMaterial color={STAGE_KERB} roughness={0.95} metalness={0} />
        </mesh>
      ))}

      {lines.map(([x, z, w, d]) => (
        <mesh
          key={`line:${x}:${z}:${w}`}
          position={[x, STAGE_TOP + 0.015, z]}
          receiveShadow
          raycast={nothing}
        >
          <boxGeometry args={[w, 0.02, d]} />
          <meshStandardMaterial color={chalk} roughness={1} metalness={0} />
        </mesh>
      ))}

      {pegs.map(([x, z]) => (
        <group key={`peg:${x}:${z}`} position={[x, STAGE_TOP, z]}>
          <mesh position-y={PEG_HEIGHT / 2} castShadow raycast={nothing}>
            <boxGeometry args={[0.28, PEG_HEIGHT, 0.28]} />
            <meshStandardMaterial color={TREE_TRUNK} roughness={0.9} metalness={0} />
          </mesh>
          <mesh position-y={PEG_HEIGHT - 0.25} castShadow raycast={nothing}>
            <boxGeometry args={[0.46, 0.5, 0.46]} />
            <meshStandardMaterial color={WARNING_ORANGE} roughness={0.7} metalness={0} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
