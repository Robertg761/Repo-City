"use client";

/**
 * Close-up grass (`?land=rich`): tufts of blades and a scatter of wildflowers
 * over the lawn and the meadow, drawn only round the camera's focus and only
 * when the camera is low.
 *
 * NOTHING IS PLACED ON THE CPU. Each mesh is one instanced draw of a tiny
 * blade cluster, `count` copies of it; the vertex shader turns the instance
 * number into a cell of a world-space grid that follows the camera in whole
 * cells (so a tuft never slides as the view moves), jitters it inside the
 * cell by a hash, and scales it to nothing where the control map says there
 * is no grass (roads, pavements, buildings, fields, water, paved plates),
 * beyond the fade radius, and above the camera height at which they are
 * worth drawing. So the whole layer is a few thousand cheap instances, and a
 * camera above the roofs pays only for a mesh that is not drawn.
 *
 * Blades take the ground's own tone (`landTone`, `ground.tsx`), so a tuft is
 * the colour of the lawn it stands in; wildflowers favour the meadow.
 */

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  InstancedBufferGeometry,
  MeshStandardMaterial,
  Vector3,
  type Mesh,
  type WebGLProgramParametersWithUniforms,
} from "three";
import { useQuality } from "../quality";
import { LAND_TONE_GLSL, useLandGround } from "./ground";

/** The camera's height above which the grass is not drawn, and where it starts to fade. */
export const GRASS_HEIGHT_FADE: readonly [number, number] = [24, 34];

export interface GrassSettings {
  cell: number;
  grid: number;
  density: number;
}

/**
 * `near` is a second, finer ring of tufts right round the camera (about ten metres out), where a
 * sparse field of tufts shows the ground between them; its centre follows the eye (`NEAR_REACH`),
 * not the orbit target, so the ring is under a low camera whatever it looks at.
 */
export const GRASS_SETTINGS: Record<"high" | "medium", { tufts: GrassSettings; near: GrassSettings; flowers: GrassSettings }> = {
  high: { tufts: { cell: 0.6, grid: 100, density: 1 }, near: { cell: 0.3, grid: 64, density: 0.85 }, flowers: { cell: 1.5, grid: 64, density: 0.42 } },
  medium: { tufts: { cell: 1.0, grid: 64, density: 0.9 }, near: { cell: 0.45, grid: 44, density: 0.8 }, flowers: { cell: 1.8, grid: 40, density: 0.36 } },
};

/** The near ring sits this far ahead of the eye at most, towards the focus. */
const NEAR_REACH = 7;

/** Three crossed blades in a fan: a tuft, 0.3 units tall, its base darker than its tip. */
export function tuftGeometry(): BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const heads: number[] = [];
  const shade = (t: number) => 0.42 + 0.8 * t;
  for (let card = 0; card < 3; card++) {
    const a = (card / 3) * Math.PI + 0.3;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const at = (x: number, y: number, z: number): [number, number, number] => [x * c + z * s, y, -x * s + z * c];
    const v = [
      at(-0.05, 0, 0), at(0.05, 0, 0),
      at(-0.036, 0.15, 0.02), at(0.036, 0.15, 0.02),
      at(0.0, 0.31, 0.07),
    ];
    const heightsT = [0, 0, 0.5, 0.5, 1];
    const tri = [[0, 1, 2], [1, 3, 2], [2, 3, 4]];
    for (const t of tri) {
      for (const i of t) {
        positions.push(...v[i]);
        const k = shade(heightsT[i]);
        colors.push(k, k, k);
        heads.push(0);
      }
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  g.setAttribute("color", new BufferAttribute(new Float32Array(colors), 3));
  g.setAttribute("aHead", new BufferAttribute(new Float32Array(heads), 1));
  g.setAttribute("normal", new BufferAttribute(new Float32Array(positions.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  return g;
}

/** A wildflower: a thin stem and a small four-petalled head, crossed. */
export function flowerGeometry(): BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const heads: number[] = [];
  const stem = 0.2;
  for (let card = 0; card < 2; card++) {
    const a = card * (Math.PI / 2) + 0.5;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const at = (x: number, y: number, z: number): [number, number, number] => [x * c + z * s, y, -x * s + z * c];
    // Stem.
    const stemQuad = [at(-0.012, 0, 0), at(0.012, 0, 0), at(0.012, stem, 0), at(-0.012, stem, 0)];
    for (const i of [0, 1, 2, 0, 2, 3]) {
      positions.push(...stemQuad[i]);
      colors.push(0.6, 0.8, 0.5);
      heads.push(0);
    }
    // Head: a flat diamond facing outwards along this card.
    const head = [at(-0.045, stem + 0.02, 0), at(0.045, stem + 0.02, 0), at(0.045, stem + 0.08, 0.015), at(-0.045, stem + 0.08, 0.015)];
    for (const i of [0, 1, 2, 0, 2, 3]) {
      positions.push(...head[i]);
      colors.push(1, 1, 1);
      heads.push(1);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  g.setAttribute("color", new BufferAttribute(new Float32Array(colors), 3));
  g.setAttribute("aHead", new BufferAttribute(new Float32Array(heads), 1));
  g.setAttribute("normal", new BufferAttribute(new Float32Array(positions.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  return g;
}

interface GrassUniforms {
  uGrassCenter: { value: Vector3 };
  uGrassRadius: { value: number };
  uGrassCell: { value: number };
  uGrassGrid: { value: number };
  uGrassDensity: { value: number };
  uGrassTime: { value: number };
  uGrassFade: { value: number };
  uGrassLimit: { value: number };
  uGrassTint: { value: Color };
  uGrassY: { value: number };
}

const VERTEX_DECL = /* glsl */ `
attribute float aHead;
uniform vec3 uGrassCenter;
uniform float uGrassRadius;
uniform float uGrassCell;
uniform float uGrassGrid;
uniform float uGrassDensity;
uniform float uGrassTime;
uniform float uGrassFade;
uniform float uGrassLimit;
uniform vec3 uGrassTint;
uniform float uGrassY;
uniform sampler2D uLandCtl;
uniform vec4 uLandRect;
${LAND_TONE_GLSL}
`;

/** The placement block shared by tufts (`flower` 0) and flowers (`flower` 1). */
function placement(flower: boolean): string {
  return /* glsl */ `
{
  float gi = float( gl_InstanceID );
  float gx = mod( gi, uGrassGrid );
  float gz = floor( gi / uGrassGrid );
  vec2 cellIdx = floor( uGrassCenter.xz / uGrassCell ) - uGrassGrid * 0.5 + vec2( gx, gz );
  vec2 jit = vec2( lHash( cellIdx + 1.7 ), lHash( cellIdx + 9.1 ) );
  vec2 wp = ( cellIdx + jit ) * uGrassCell;
  float dist = length( wp - uGrassCenter.xz );
  float fade = ( 1.0 - smoothstep( uGrassRadius * 0.55, uGrassRadius, dist ) ) * uGrassFade;
  vec4 ctl = texture2D( uLandCtl, ( wp - uLandRect.xy ) / uLandRect.zw );
  float ok = smoothstep( 0.35, 0.65, ctl.a );
  ok *= 1.0 - smoothstep( uGrassLimit * 0.92, uGrassLimit, max( abs( wp.x ), abs( wp.y ) ) );
  ${flower
    ? `float bloom = smoothstep( 0.5, 0.72, lNoise( wp / 8.0 + 13.0 ) ) * ( 0.25 + 0.75 * ctl.r );
  float keep = step( lHash( cellIdx + 33.3 ), uGrassDensity * bloom );`
    : `float keep = step( lHash( cellIdx + 33.3 ), uGrassDensity );`}
  float size = fade * ok * keep * ( 0.62 + 0.76 * lHash( cellIdx + 5.5 ) ) * mix( 0.85, 1.35, ctl.r );
  // Height is its own: some tufts are tall and thin, some squat, meadow ones taller still.
  float tall = 0.72 + 0.42 * lHash( cellIdx + 14.0 ) * lHash( cellIdx + 15.0 ) + 0.22 * lHash( cellIdx + 16.0 );
  float yaw = lHash( cellIdx + 2.2 ) * 6.2831853;
  float cy = cos( yaw );
  float sy = sin( yaw );
  vec3 q = transformed * vec3( sqrt( size ), size * tall, sqrt( size ) );
  q = vec3( q.x * cy + q.z * sy, q.y, -q.x * sy + q.z * cy );
  // Each tuft leans its own way, more the taller it is, on top of the wind.
  float leanA = lHash( cellIdx + 21.0 ) * 6.2831853;
  float leanK = ( lHash( cellIdx + 22.0 ) - 0.3 ) * 0.5;
  q.x += cos( leanA ) * leanK * q.y * q.y * 2.4;
  q.z += sin( leanA ) * leanK * q.y * q.y * 2.4;
  q.x += sin( uGrassTime * 1.7 + wp.x * 0.8 + wp.y * 0.6 ) * 0.05 * q.y;
  q.z += cos( uGrassTime * 1.3 + wp.x * 0.5 - wp.y * 0.7 ) * 0.035 * q.y;
  transformed = q + vec3( wp.x, uGrassY, wp.y );
  // Colour: each tuft a little off the ground's own green, some dry-tipped, some lush.
  vec3 vary = vec3( 0.92 + 0.16 * lHash( cellIdx + 31.0 ), 0.9 + 0.2 * lHash( cellIdx + 32.0 ), 0.86 + 0.24 * lHash( cellIdx + 34.0 ) );
  vec3 tone = landTone( wp, ctl.g, 1.0 ) * uGrassTint * vary;
  ${flower
    ? `float h = lHash( cellIdx + 71.0 );
  vec3 fc = h < 0.38 ? vec3( 0.93, 0.92, 0.85 ) : h < 0.62 ? vec3( 0.95, 0.78, 0.16 ) : h < 0.82 ? vec3( 0.86, 0.36, 0.52 ) : vec3( 0.55, 0.45, 0.85 );
  vColor.rgb = mix( vColor.rgb * tone, pow( fc, vec3( 2.2 ) ), aHead );`
    : `vColor.rgb *= tone;`}
}
`;
}

function grassMaterial(u: GrassUniforms, ground: { uLandCtl: unknown; uLandRect: unknown }, flower: boolean, key = ""): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ color: "#ffffff", vertexColors: true, roughness: 0.95, metalness: 0, side: DoubleSide });
  m.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, u, ground);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${VERTEX_DECL}`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>\n${placement(flower)}`);
    // Lit like the ground under it from either side: blades and petals all face up.
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <normal_fragment_begin>",
      "#include <normal_fragment_begin>\n  normal = normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz );",
    );
  };
  m.customProgramCacheKey = () => (flower ? "grass-flower" : `grass-tuft${key}`);
  return m;
}

const focus = new Vector3();
const eye = new Vector3();

/**
 * The grass round the camera's focus. Mounted by `Landscape` on the medium
 * and high tiers; drawn while the camera is below `GRASS_HEIGHT_FADE`.
 */
export default function Grass({ grass, limit }: { grass: string; limit: number }) {
  const ground = useLandGround();
  const { tier } = useQuality();
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as { getTarget?: (out: Vector3) => Vector3 } | null;
  const tuftMesh = useRef<Mesh>(null);
  const nearMesh = useRef<Mesh>(null);
  const flowerMesh = useRef<Mesh>(null);
  const settings = GRASS_SETTINGS[tier === "high" ? "high" : "medium"];

  const uniforms = useMemo(() => {
    const make = (s: GrassSettings): GrassUniforms => ({
      uGrassCenter: { value: new Vector3() },
      uGrassRadius: { value: (s.cell * s.grid) / 2 },
      uGrassCell: { value: s.cell },
      uGrassGrid: { value: s.grid },
      uGrassDensity: { value: s.density },
      uGrassTime: { value: 0 },
      uGrassFade: { value: 0 },
      uGrassLimit: { value: limit },
      uGrassTint: { value: new Color(grass).multiplyScalar(1.15) },
      uGrassY: { value: -0.05 },
    });
    return { tufts: make(settings.tufts), near: make(settings.near), flowers: make(settings.flowers) };
  }, [settings, limit, grass]);

  const parts = useMemo(() => {
    if (!ground?.control) return null;
    const shared = { uLandCtl: ground.uniforms.uLandCtl, uLandRect: ground.uniforms.uLandRect };
    const tuft = new InstancedBufferGeometry().copy(tuftGeometry() as unknown as InstancedBufferGeometry);
    tuft.instanceCount = settings.tufts.grid * settings.tufts.grid;
    const near = new InstancedBufferGeometry().copy(tuftGeometry() as unknown as InstancedBufferGeometry);
    near.instanceCount = settings.near.grid * settings.near.grid;
    const flower = new InstancedBufferGeometry().copy(flowerGeometry() as unknown as InstancedBufferGeometry);
    flower.instanceCount = settings.flowers.grid * settings.flowers.grid;
    return {
      tuft,
      near,
      flower,
      tuftMaterial: grassMaterial(uniforms.tufts, shared, false),
      nearMaterial: grassMaterial(uniforms.near, shared, false, "near"),
      flowerMaterial: grassMaterial(uniforms.flowers, shared, true),
    };
  }, [ground, settings, uniforms]);
  useEffect(
    () => () => {
      parts?.tuft.dispose();
      parts?.near.dispose();
      parts?.nearMaterial.dispose();
      parts?.flower.dispose();
      parts?.tuftMaterial.dispose();
      parts?.flowerMaterial.dispose();
    },
    [parts],
  );

  useFrame(({ clock }) => {
    const fade = 1 - Math.min(1, Math.max(0, (camera.position.y - GRASS_HEIGHT_FADE[0]) / (GRASS_HEIGHT_FADE[1] - GRASS_HEIGHT_FADE[0])));
    const visible = fade > 0.001;
    if (tuftMesh.current) tuftMesh.current.visible = visible;
    if (nearMesh.current) nearMesh.current.visible = visible;
    if (flowerMesh.current) flowerMesh.current.visible = visible;
    if (!visible) return;
    // Focus: the orbit target when there is one, else the ground ahead of the camera.
    if (controls?.getTarget) controls.getTarget(focus);
    else focus.copy(camera.position);
    eye.copy(camera.position);
    const distance = eye.distanceTo(focus);
    // A camera far from its target looks at ground far from itself: centre between them.
    const cx = distance > 40 ? eye.x + (focus.x - eye.x) * (40 / distance) : focus.x;
    const cz = distance > 40 ? eye.z + (focus.z - eye.z) * (40 / distance) : focus.z;
    // The near ring: a few metres ahead of the eye towards the focus, so it lies under a low camera.
    const reach = Math.min(distance, NEAR_REACH);
    const nx = distance > 1e-3 ? eye.x + ((focus.x - eye.x) * reach) / distance : eye.x;
    const nz = distance > 1e-3 ? eye.z + ((focus.z - eye.z) * reach) / distance : eye.z;
    for (const u of [uniforms.tufts, uniforms.near, uniforms.flowers]) {
      if (u === uniforms.near) u.uGrassCenter.value.set(nx, 0, nz);
      else u.uGrassCenter.value.set(cx, 0, cz);
      u.uGrassFade.value = fade;
      u.uGrassTime.value = clock.elapsedTime;
    }
  });

  if (!parts) return null;
  return (
    <group>
      <mesh ref={tuftMesh} geometry={parts.tuft} material={parts.tuftMaterial} frustumCulled={false} raycast={() => null} receiveShadow />
      <mesh ref={nearMesh} geometry={parts.near} material={parts.nearMaterial} frustumCulled={false} raycast={() => null} receiveShadow />
      <mesh ref={flowerMesh} geometry={parts.flower} material={parts.flowerMaterial} frustumCulled={false} raycast={() => null} />
    </group>
  );
}
