"use client";

/**
 * The ground the city sits on (PLAN.md section 36). Two planes: the wide
 * landscape that runs out into the fog, and the slightly lighter city plate
 * that gives the diorama an edge. District tints are drawn on top by
 * `District.tsx`, pavements by `Roads.tsx`, the civic gravel by
 * `Environment.tsx`.
 *
 * Both planes carry a procedural grass texture, generated into a canvas at
 * runtime: a flat plane of one colour is the single strongest tell that a
 * frame is a render rather than a photograph of a model, and section 4 rules
 * out downloading an asset for it. Two octaves of wrapped value noise, a few
 * percent either side of the base colour -- enough to break the flatness at
 * the overview camera, not enough to read as a pattern up close.
 *
 * The landscape is also the "nothing here" click target: clicking it clears
 * the selection (PLAN.md section 6).
 */

import { useMemo } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import {
  BufferAttribute,
  CanvasTexture,
  Color,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
} from "three";
import { useCityStore } from "@/store/useCityStore";
import { mix, type SceneAtmosphere } from "./palette";

interface TerrainProps {
  size: number;
  atmosphere: SceneAtmosphere;
}

const GRASS_PIXELS = 256;

/**
 * World units covered by one tile of the noise, per surface. The landscape
 * runs to three hundred units and more: tiled every eleven units, as the city
 * plate is, the repeat reads as a woven pattern rather than as ground.
 */
const GRASS_TILE = { plate: 13, landscape: 52 } as const;

/** Deterministic hash on a wrapped lattice, so the tile joins itself. */
function latticeValue(x: number, y: number, period: number): number {
  const ix = ((x % period) + period) % period;
  const iy = ((y % period) + period) % period;
  const n = Math.sin(ix * 127.1 + iy * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function smoothNoise(u: number, v: number, period: number): number {
  const x = u * period;
  const y = v * period;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = latticeValue(x0, y0, period);
  const b = latticeValue(x0 + 1, y0, period);
  const c = latticeValue(x0, y0 + 1, period);
  const d = latticeValue(x0 + 1, y0 + 1, period);
  return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
}

let grassSource: CanvasTexture | null = null;

/**
 * One canvas for the whole session; callers clone it so each surface can set
 * its own repeat without fighting over the shared texture's.
 */
function grassTexture(): CanvasTexture | null {
  if (grassSource) return grassSource;
  if (typeof document === "undefined") return null;

  const canvas = document.createElement("canvas");
  canvas.width = GRASS_PIXELS;
  canvas.height = GRASS_PIXELS;
  const context = canvas.getContext("2d");
  if (!context) return null;

  const image = context.createImageData(GRASS_PIXELS, GRASS_PIXELS);
  const { data } = image;
  for (let y = 0; y < GRASS_PIXELS; y++) {
    for (let x = 0; x < GRASS_PIXELS; x++) {
      const u = x / GRASS_PIXELS;
      const v = y / GRASS_PIXELS;
      // Broad patches plus a fine graininess, both centred on 0.5.
      const broad = smoothNoise(u, v, 4) - 0.5;
      const fine = smoothNoise(u, v, 16) - 0.5;
      // The texture multiplies the material colour, so it lives just below
      // white: 1.0 would be the base colour exactly.
      const level = 0.97 + broad * 0.1 + fine * 0.045;
      const byte = Math.max(0, Math.min(255, Math.round(level * 255)));
      const i = (y * GRASS_PIXELS + x) * 4;
      data[i] = byte;
      data[i + 1] = byte;
      data[i + 2] = byte;
      data[i + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);

  grassSource = new CanvasTexture(canvas);
  grassSource.colorSpace = SRGBColorSpace;
  grassSource.wrapS = RepeatWrapping;
  grassSource.wrapT = RepeatWrapping;
  return grassSource;
}

/** A private copy of the grass, tiled every `tile` units across `extent`. */
export function useGrass(extent: number, tile: number = GRASS_TILE.plate): Texture | null {
  return useMemo(() => {
    const source = grassTexture();
    if (!source) return null;
    const texture = source.clone();
    const repeat = Math.max(1, Math.round(extent / tile));
    texture.repeat.set(repeat, repeat);
    texture.needsUpdate = true;
    return texture;
  }, [extent, tile]);
}

/** How far the landscape runs past the city, as a multiple of `bounds.size`. */
const LANDSCAPE = 3.2;
/**
 * Where the haze starts and ends, as a fraction of the landscape's radius.
 * The city plate reaches about a third of the way out, so the haze has to
 * begin well past it: start it too close and the lawn beside the ring road is
 * already grey.
 */
const HAZE_NEAR = 0.6;
const HAZE_FAR = 1;
/** The rim never goes all the way to the sky's colour: distance, not fog. */
const HAZE_DEPTH = 0.72;

/**
 * Vertex colours that fade the landscape into the sky's own horizon haze at
 * its rim. Without it the ground simply stops, in a hard diagonal line against
 * the sky, and the diorama turns back into a flat plane in a viewport.
 */
function hazeColors(segments: number, near: string, far: string): BufferAttribute {
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
      const t = Math.max(0, Math.min(1, (radius - HAZE_NEAR) / (HAZE_FAR - HAZE_NEAR)));
      const smooth = t * t * (3 - 2 * t) * HAZE_DEPTH;
      const i = (y * side + x) * 3;
      colors[i] = near3.r + (far3.r - near3.r) * smooth;
      colors[i + 1] = near3.g + (far3.g - near3.g) * smooth;
      colors[i + 2] = near3.b + (far3.b - near3.b) * smooth;
    }
  }
  return new BufferAttribute(colors, 3);
}

const HAZE_SEGMENTS = 32;

export default function Terrain({ size, atmosphere }: TerrainProps) {
  const actions = useCityStore((s) => s.actions);
  const landscape = useGrass(size * LANDSCAPE, GRASS_TILE.landscape);
  const plate = useGrass(size * 1.04);
  const haze = useMemo(
    () => hazeColors(HAZE_SEGMENTS, atmosphere.terrainColor, atmosphere.skyGroundColor),
    [atmosphere.terrainColor, atmosphere.skyGroundColor],
  );

  const clearSelection = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
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
        <planeGeometry args={[size * LANDSCAPE, size * LANDSCAPE, HAZE_SEGMENTS, HAZE_SEGMENTS]}>
          <primitive attach="attributes-color" object={haze} />
        </planeGeometry>
        {/* White, because the colour is in the vertices: the haze fade has to
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
