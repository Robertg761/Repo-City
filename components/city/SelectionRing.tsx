"use client";

/**
 * The ground ring under the selected entity (PLAN.md section 6, step 4).
 * Instanced buildings cannot carry an outline of their own without breaking
 * the one-mesh-per-tier rule, so this ring is the selection highlight: the
 * entity itself only brightens a little (`stateTint` in `palette.ts`), so its
 * own colours stay readable while the inspector describes it. The ring works
 * the same for incidents, sites and landmarks.
 *
 * Three parts, because one flat ring turned into an orange hoop lying on the
 * street once the pavements and markings arrived: a soft halo that lifts the
 * ground around the selection, a rotating dashed ring that is unmistakably a
 * user-interface element rather than a painted road marking, and a thin solid
 * ring holding the edge. The dashes and the halo are drawn by one small
 * shader each -- an animated ring of geometry would be dozens of instances,
 * and the pattern is a function of the angle, which is what shaders are for.
 *
 * Under bloom: everything here stays below 1 in linear light, so the ring
 * never smears into the frame the way the lit windows deliberately do. It is
 * `toneMapped={false}` so the low tier draws the accent exactly; the high
 * tier tone maps the whole frame at the end of its chain, which only rolls
 * the brightest channel off a touch.
 */

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { AdditiveBlending, Color, DoubleSide, type Mesh, type ShaderMaterial } from "three";
import { useCityStore } from "@/store/useCityStore";
import type { CityModel } from "@/types/city";
import { focusTargetFor } from "./entities";
import { SELECT } from "./palette";

/** Dashes around the ring. Enough to read as a dashed line at any radius. */
const DASHES = 24;

const RING_VERTEX = /* glsl */ `
  varying vec2 vLocal;
  void main() {
    vLocal = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * Dashes cut by the angle around the ring, plus a soft edge across its width
 * so the band does not end in two hard circles.
 */
const DASH_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uInner;
  uniform float uOuter;
  varying vec2 vLocal;

  void main() {
    float radius = length(vLocal);
    float angle = atan(vLocal.y, vLocal.x);
    // Marching anticlockwise, one dash every fifteen degrees.
    float phase = fract((angle / 6.2831853) * ${DASHES}.0 + uTime * 0.35);
    float dash = smoothstep(0.02, 0.16, phase) * smoothstep(0.62, 0.48, phase);
    float band = smoothstep(uInner, uInner + 0.28, radius) *
                 smoothstep(uOuter, uOuter - 0.28, radius);
    float alpha = dash * band;
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(uColor, alpha);
    // A hand-written shader gets no output conversion for free, and the ring
    // has to match the colour the rest of the interface uses.
    #include <colorspace_fragment>
  }
`;

/** A halo that fades outwards, so the selection sits in a pool of light. */
const HALO_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uInner;
  uniform float uOuter;
  uniform float uStrength;
  varying vec2 vLocal;

  void main() {
    float radius = length(vLocal);
    float fade = 1.0 - smoothstep(uInner, uOuter, radius);
    float alpha = fade * fade * uStrength;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(uColor, alpha);
    #include <colorspace_fragment>
  }
`;

export default function SelectionRing({ city }: { city: CityModel }) {
  const selectedId = useCityStore((s) => s.selectedId);
  const group = useRef<Mesh>(null);
  const dashes = useRef<ShaderMaterial>(null);
  const halo = useRef<ShaderMaterial>(null);

  const focus = selectedId ? focusTargetFor(city, selectedId) : null;
  const radius = Math.max((focus?.radius ?? 2) * 1.15, 2.2);

  const uniforms = useMemo(
    () => ({
      dash: {
        uColor: { value: new Color(SELECT) },
        uTime: { value: 0 },
        uInner: { value: radius },
        uOuter: { value: radius * 1.14 },
      },
      halo: {
        uColor: { value: new Color(SELECT) },
        uInner: { value: radius * 0.72 },
        uOuter: { value: radius * 1.9 },
        uStrength: { value: 0.26 },
      },
    }),
    [radius],
  );

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (dashes.current) dashes.current.uniforms.uTime.value = t;
    // A slow breath on the halo rather than a scale pulse: scaling the whole
    // ring made it read as a shockwave every two seconds.
    if (halo.current) halo.current.uniforms.uStrength.value = 0.23 + Math.sin(t * 2.2) * 0.05;
    if (group.current) {
      const pulse = 1 + Math.sin(t * 3.2) * 0.012;
      group.current.scale.set(pulse, pulse, 1);
    }
  });

  if (!focus) return null;

  return (
    <group position={[focus.position[0], 0.14, focus.position[2]]} rotation-x={-Math.PI / 2}>
      <mesh renderOrder={1} raycast={() => null}>
        <circleGeometry args={[radius * 1.9, 64]} />
        <shaderMaterial
          ref={halo}
          args={[
            {
              uniforms: uniforms.halo,
              vertexShader: RING_VERTEX,
              fragmentShader: HALO_FRAGMENT,
              transparent: true,
              depthWrite: false,
              blending: AdditiveBlending,
              side: DoubleSide,
            },
          ]}
        />
      </mesh>

      <mesh ref={group} renderOrder={2} raycast={() => null}>
        <ringGeometry args={[radius * 0.96, radius * 1.18, 64]} />
        <shaderMaterial
          ref={dashes}
          args={[
            {
              uniforms: uniforms.dash,
              vertexShader: RING_VERTEX,
              fragmentShader: DASH_FRAGMENT,
              transparent: true,
              depthWrite: false,
              side: DoubleSide,
            },
          ]}
        />
      </mesh>

      {/* The solid hairline: the dashes say "selected", this says "exactly
          here", and it survives being three pixels wide at the overview. */}
      <mesh renderOrder={3} raycast={() => null}>
        <ringGeometry args={[radius, radius * 1.03, 64]} />
        <meshBasicMaterial
          color={SELECT}
          transparent
          opacity={0.95}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}
