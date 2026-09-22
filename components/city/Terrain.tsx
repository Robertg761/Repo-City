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

import { useMemo } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import { BufferAttribute, Color } from "three";
import { useCityStore } from "@/store/useCityStore";
import { wasDrag } from "./useEntity";
import { mix, type SceneAtmosphere } from "./palette";
import { useTiledSurface } from "./textures/surfaces";

interface TerrainProps {
  size: number;
  atmosphere: SceneAtmosphere;
}

/**
 * World units covered by one tile of grass, per surface. The landscape runs
 * to three hundred units and more: tiled every thirteen units, as the city
 * plate is, the repeat reads as a woven pattern rather than as ground. The
 * plate's tile carries four mower passes, so a stripe is about a unit and a
 * half wide: two cars, which is what a lawn stripe is on a model railway.
 */
const GRASS_TILE = { plate: 13, landscape: 52 } as const;

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
function rimColors(segments: number, near: string, far: string): BufferAttribute {
  const near3 = new Color(near);
  const far3 = new Color(far);
  const side = segments + 1;
  const colors = new Float32Array(side * side * 3);
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
  return new BufferAttribute(colors, 3);
}

const RIM_SEGMENTS = 32;

export default function Terrain({ size, atmosphere }: TerrainProps) {
  const actions = useCityStore((s) => s.actions);
  const landscape = useTiledSurface("meadow", size * LANDSCAPE, GRASS_TILE.landscape);
  const plate = useTiledSurface("lawn", size * 1.04, GRASS_TILE.plate);
  const rim = useMemo(
    () => rimColors(RIM_SEGMENTS, atmosphere.terrainColor, atmosphere.skyGroundColor),
    [atmosphere.terrainColor, atmosphere.skyGroundColor],
  );

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
        <planeGeometry args={[size * LANDSCAPE, size * LANDSCAPE, RIM_SEGMENTS, RIM_SEGMENTS]}>
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
