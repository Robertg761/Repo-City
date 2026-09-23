"use client";

/**
 * Light without lights (PLAN.md sections 39 and 63): the soft glows the city
 * shows as the evening comes on, drawn as additive quads rather than as
 * point lights. A real light per street lamp, per window or per headlight
 * would cost a shader permutation and a per-pixel loop for each; a glow is
 * one instanced draw for every lamp in the city, the same way
 * `IssueIncident.tsx` gave up its point light for an additive glow.
 *
 * Two shapes:
 *
 *   - `GlowField` draws a set of steady glows, either laid flat on the ground
 *     (the pool of light under a street lamp) or turned to face the camera
 *     (the halo round the lamp itself). One draw call per field.
 *   - `beamGeometry` is the light a car throws: a fan on the road ahead and a
 *     red smudge behind, in the car's own frame, so `Traffic.tsx` can draw
 *     it with the car's own instance matrices.
 *
 * Every glow's strength follows the live hour (`sky.tsx`), and a field whose
 * strength is zero is hidden, so the day pays nothing for the night.
 */

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  type Mesh,
  PlaneGeometry,
  ShaderMaterial,
} from "three";
import type { BodySpec } from "./models/vehicles/shapes";
import type { SceneAtmosphere } from "./palette";
import { linearRgb } from "./backlog/material";
import { revealScale } from "./reveal";
import { useSkyFrame } from "./sky";
import { useRevealClock } from "./useReveal";

const GLOW_VERTEX = /* glsl */ `
attribute vec3 glowAt;
attribute float glowSize;
uniform float uGround;
varying vec2 vGlowUv;
void main() {
  vGlowUv = position.xy * 2.0;
  if ( uGround > 0.5 ) {
    vec3 world = glowAt + vec3( position.x, 0.0, -position.y ) * glowSize;
    gl_Position = projectionMatrix * viewMatrix * vec4( world, 1.0 );
  } else {
    vec4 mv = viewMatrix * vec4( glowAt, 1.0 );
    mv.xy += position.xy * glowSize;
    gl_Position = projectionMatrix * mv;
  }
}
`;

const GLOW_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uStrength;
uniform float uFalloff;
varying vec2 vGlowUv;
void main() {
  float r = length( vGlowUv );
  float fade = pow( max( 1.0 - r, 0.0 ), uFalloff );
  float alpha = fade * uStrength;
  if ( alpha < 0.003 ) discard;
  gl_FragColor = vec4( uColor * alpha, 1.0 );
  #include <colorspace_fragment>
}
`;

export interface GlowFieldProps {
  /** Where each glow sits, world units. */
  positions: readonly (readonly [number, number, number])[];
  /** Diameter of one glow, world units. */
  size: number;
  /** The glow's colour, as hex. */
  color: string;
  /** Flat on the ground, or turned to the camera. */
  ground?: boolean;
  /** How the edge falls away: higher is a tighter core. */
  falloff?: number;
  /** Strength for an hour; zero hides the field. */
  strength: (atmosphere: SceneAtmosphere) => number;
  /** Milliseconds after the reveal starts before the glows fade in. */
  appearAt?: number;
}

/** A set of steady glows, one draw call, following the hour. */
export function GlowField({
  positions,
  size,
  color,
  ground = false,
  falloff = 2,
  strength,
  appearAt = 0,
}: GlowFieldProps) {
  const mesh = useRef<Mesh>(null);
  const clock = useRevealClock();
  const hour = useRef(0);
  const grown = useRef(0);

  const geometry = useMemo(() => {
    const quad = new PlaneGeometry(1, 1);
    const own = new InstancedBufferGeometry();
    own.index = quad.index;
    own.setAttribute("position", quad.getAttribute("position"));
    const at = new Float32Array(Math.max(1, positions.length) * 3);
    const sizes = new Float32Array(Math.max(1, positions.length));
    positions.forEach((p, i) => {
      at.set(p, i * 3);
      sizes[i] = size;
    });
    own.setAttribute("glowAt", new InstancedBufferAttribute(at, 3));
    own.setAttribute("glowSize", new InstancedBufferAttribute(sizes, 1));
    own.instanceCount = positions.length;
    return own;
  }, [positions, size]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  const material = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: {
          uColor: { value: linearRgb(color) },
          uStrength: { value: 0 },
          uFalloff: { value: falloff },
          uGround: { value: ground ? 1 : 0 },
        },
        vertexShader: GLOW_VERTEX,
        fragmentShader: GLOW_FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        toneMapped: false,
      }),
    [color, falloff, ground],
  );
  useEffect(() => () => material.dispose(), [material]);

  const apply = () => {
    const node = mesh.current;
    if (!node) return;
    const value = hour.current * grown.current;
    (node.material as ShaderMaterial).uniforms.uStrength.value = value;
    node.visible = value > 0.002 && positions.length > 0;
  };

  useSkyFrame((atmosphere) => {
    hour.current = Math.max(0, strength(atmosphere));
    apply();
  }, material);

  // The glows come on once the lamps they belong to have grown.
  useFrame(() => {
    if (grown.current >= 1) return;
    grown.current = revealScale(performance.now(), clock.current, appearAt);
    apply();
  });

  return (
    <mesh
      ref={mesh}
      geometry={geometry}
      material={material}
      frustumCulled={false}
      raycast={() => null}
      visible={false}
      // After the city's own transparent layers, so a pool lies over the
      // ground detail and the road markings rather than under them.
      renderOrder={2}
    />
  );
}

const BEAM_VERTEX = /* glsl */ `
attribute vec3 color;
varying vec2 vBeamUv;
varying vec3 vBeamColor;
void main() {
  vBeamUv = uv;
  vBeamColor = color;
  mat4 model = modelMatrix;
  #ifdef USE_INSTANCING
  model = modelMatrix * instanceMatrix;
  #endif
  gl_Position = projectionMatrix * viewMatrix * model * vec4( position, 1.0 );
}
`;

const BEAM_FRAGMENT = /* glsl */ `
uniform float uStrength;
varying vec2 vBeamUv;
varying vec3 vBeamColor;
void main() {
  float along = 1.0 - vBeamUv.y;
  float across = 1.0 - pow( abs( vBeamUv.x * 2.0 - 1.0 ), 2.0 );
  float alpha = along * along * across * uStrength;
  if ( alpha < 0.003 ) discard;
  gl_FragColor = vec4( vBeamColor * alpha, 1.0 );
  #include <colorspace_fragment>
}
`;

/** Headlight and taillight glow on the road, linear RGB. */
const BEAM_WARM = linearRgb("#ffe6b8");
const BEAM_RED = linearRgb("#ff3a2a");

/** Just above the tarmac and its markings, below any car's sill. */
const BEAM_Y = 0.05;

/**
 * The light a car throws, in its own frame (+z forward, origin on the road):
 * a fan of warm light widening ahead of the headlights and a short red glow
 * behind the tail lights. `uv.y` runs away from the car in both.
 */
export function beamGeometry(spec: Pick<BodySpec, "length" | "width" | "headlights" | "taillights">): BufferGeometry {
  const front = Math.max(...spec.headlights.map((p) => p[2]));
  const rear = Math.min(...spec.taillights.map((p) => p[2]));
  const half = spec.width / 2;
  const reach = 2.6 + spec.length * 0.35;
  const quads: { corners: [number, number][]; color: [number, number, number] }[] = [
    {
      // Near edge at the lamps, far edge flaring out.
      corners: [
        [-half * 0.85, front],
        [half * 0.85, front],
        [half * 1.9, front + reach],
        [-half * 1.9, front + reach],
      ],
      color: BEAM_WARM,
    },
    {
      corners: [
        [-half * 0.95, rear],
        [half * 0.95, rear],
        [half * 1.2, rear - 1.1],
        [-half * 1.2, rear - 1.1],
      ],
      color: BEAM_RED,
    },
  ];
  const position = new Float32Array(quads.length * 4 * 3);
  const uv = new Float32Array(quads.length * 4 * 2);
  const color = new Float32Array(quads.length * 4 * 3);
  const index: number[] = [];
  quads.forEach((quad, q) => {
    const uvs = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ];
    quad.corners.forEach(([x, z], k) => {
      const v = q * 4 + k;
      position.set([x, BEAM_Y, z], v * 3);
      uv.set(uvs[k], v * 2);
      color.set(quad.color, v * 3);
    });
    const b = q * 4;
    // Both windings: the quads are seen from above whichever way the car faces.
    index.push(b, b + 1, b + 2, b, b + 2, b + 3, b, b + 2, b + 1, b, b + 3, b + 2);
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(position, 3));
  geometry.setAttribute("uv", new BufferAttribute(uv, 2));
  geometry.setAttribute("color", new BufferAttribute(color, 3));
  geometry.setIndex(index);
  return geometry;
}

/** The additive material every car's beams draw with; `uStrength` follows the hour. */
export function beamMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { uStrength: { value: 0 } },
    vertexShader: BEAM_VERTEX,
    fragmentShader: BEAM_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    toneMapped: false,
  });
}
