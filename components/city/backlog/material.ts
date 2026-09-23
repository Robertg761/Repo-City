/**
 * The crowd's shaders (PLAN.md 76.9): everything that moves in the crowd moves
 * on the GPU, from two uniforms set once a frame.
 *
 *   uTime    seconds, the animation clock. Frozen under
 *            `prefers-reduced-motion`, which stops every flame, lamp, flag
 *            and puff in the crowd at once.
 *   uReveal  milliseconds since the model reached the renderer, the same
 *            clock `useReveal.ts` reads. Each instance grows out of the
 *            ground at its own `appearAt`, so the backlog ripples outward
 *            with no CPU work per instance at all.
 *
 * Per instance the forms carry `instancePhase` (0..1, so neighbouring fires
 * do not flicker in step) and `instanceCrowd`: the optional-part mask, the
 * reveal time and a 0..1 glow from the item's heat. `instancePaintA` and
 * `instancePaintB` are the colours its painted panels take, and
 * `instanceWear` how weathered it is (`WEAR_ATTRIBUTE`). Per vertex they carry
 * `crowd` (`forms.ts`): which part the vertex belongs to and its weight.
 *
 * Three materials share those uniforms: the lit crowd material (a
 * `MeshStandardMaterial` with a patched vertex stage, so it keeps the scene's
 * lights, shadows and fog), the smoke, and the additive halos.
 */

import {
  AdditiveBlending,
  Color,
  MeshStandardMaterial,
  ShaderMaterial,
  type MeshStandardMaterialParameters,
} from "three";
import { REVEAL_MS } from "../reveal";
import { CROWD_ATTRIBUTE, PART } from "./forms";

/** The crowd's clock. `Backlog.tsx` advances both once a frame. */
export const CROWD_CLOCK = {
  uTime: { value: 0 },
  uReveal: { value: 0 },
};

/** Per-instance attributes the crowd shader reads. */
export const PHASE_ATTRIBUTE = "instancePhase";
export const DATA_ATTRIBUTE = "instanceCrowd";
/** The instance's two paint colours, linear RGB, for body paint slots 1 and 2. */
export const PAINT_A_ATTRIBUTE = "instancePaintA";
export const PAINT_B_ATTRIBUTE = "instancePaintB";
/**
 * How weathered the instance is, -1..1: its magnitude is how old and idle it
 * is, its sign the kind of weathering. Positive rusts (cars, barriers, posts,
 * skips); negative bleaches and dusts (a hole in the road, survey pegs).
 */
export const WEAR_ATTRIBUTE = "instanceWear";

/** How fast each lamp part blinks, in the `effects.tsx` sense: pulses per second times two. */
export const BLINK_RATE: Record<number, number> = {
  [PART.beacon]: 2.6,
  [PART.amber]: 1.2,
  [PART.hazard]: 3.2,
};

/** The reveal curve, `reveal.ts`'s ease-out cubic, in GLSL. */
const GROW_GLSL = /* glsl */ `
float crowdGrow( float appearAt ) {
  float t = clamp( ( uReveal - appearAt ) / ${REVEAL_MS.toFixed(1)}, 0.0, 1.0 );
  float inv = 1.0 - t;
  return 1.0 - inv * inv * inv;
}
`;

const PULSE_GLSL = /* glsl */ `
float crowdPulse( float rate, float phase ) {
  return 0.5 + 0.5 * sin( uTime * rate * 3.14159265 + phase * 6.2831853 );
}
`;

export const CROWD_VERTEX_PARS = /* glsl */ `
attribute vec2 ${CROWD_ATTRIBUTE};
attribute float instancePhase;
attribute vec3 instanceCrowd;
attribute vec3 instancePaintA;
attribute vec3 instancePaintB;
attribute float instanceWear;
uniform float uTime;
uniform float uReveal;
varying vec3 vCrowdGlow;
${GROW_GLSL}
${PULSE_GLSL}
float crowdBit( float mask, float bit ) {
  return mod( floor( mask / exp2( bit ) ), 2.0 );
}
`;

/**
 * After `begin_vertex`: switch optional parts on or off, animate the parts
 * that move, glow the ones that shine, and grow the whole thing out of the
 * ground. `vColor` already holds vertex colour times instance tint here.
 */
export const CROWD_VERTEX_BODY = /* glsl */ `
float crowdPart = ${CROWD_ATTRIBUTE}.x;
float crowdWeight = ${CROWD_ATTRIBUTE}.y;
float crowdPhase = instancePhase;

float crowdShown = 1.0;
if ( crowdPart > 0.5 && crowdPart < 4.5 ) crowdShown = crowdBit( instanceCrowd.x, crowdPart - 1.0 );

// A painted panel takes the instance's paint: slot 1 or 2 (\`forms.ts\`).
if ( crowdPart < 0.5 && crowdWeight > 0.5 ) vColor.rgb *= crowdWeight < 1.5 ? instancePaintA : instancePaintB;

// Age: rust in patches on metal and paint, or a bleached, dusty fade.
// Dark glass, tyres and holes hardly change; bright paint shows it most.
float crowdWear = abs( instanceWear );
if ( crowdPart < 0.5 && crowdWear > 0.0 ) {
  float luma = dot( vColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
  float speck = fract( sin( dot( position, vec3( 12.9898, 78.233, 37.719 ) ) ) * 43758.5453 );
  if ( instanceWear > 0.0 ) {
    float amount = crowdWear * smoothstep( 0.03, 0.25, luma ) * ( 0.3 + 0.7 * speck );
    vec3 rust = vec3( 0.3, 0.11, 0.04 ) * ( 0.75 + 0.5 * speck );
    vColor.rgb = mix( vColor.rgb, rust, amount * 0.7 );
  } else {
    vec3 dust = vec3( luma ) * 0.85 + vec3( 0.07, 0.06, 0.04 );
    vColor.rgb = mix( vColor.rgb, dust, crowdWear * ( 0.35 + 0.3 * speck ) );
  }
}

vCrowdGlow = vec3( 0.0 );
float crowdHeat = 0.45 + 0.55 * instanceCrowd.z;

if ( crowdPart > 0.5 && crowdPart < 1.5 ) {
  // A worker at it: a small, quick bob.
  transformed.y += crowdWeight * abs( sin( uTime * 3.4 + crowdPhase * 6.2831853 ) ) * 0.07;
} else if ( crowdPart > 1.5 && crowdPart < 2.5 ) {
  vCrowdGlow = vColor.rgb * ( 0.15 + 2.4 * crowdPulse( ${BLINK_RATE[PART.beacon].toFixed(2)}, crowdPhase ) ) * crowdHeat;
} else if ( crowdPart > 3.5 && crowdPart < 4.5 ) {
  // The flag's cloth ripples, more at the free end.
  transformed.z += crowdWeight * sin( uTime * 5.0 + crowdPhase * 6.2831853 - crowdWeight * 2.6 ) * 0.14;
} else if ( crowdPart > 4.5 && crowdPart < 5.5 ) {
  float flicker = sin( uTime * 11.0 + crowdPhase * 6.2831853 ) * 0.09
    + sin( uTime * 6.3 + crowdPhase * 11.0 ) * 0.06;
  transformed.y += crowdWeight * flicker * 1.6;
  transformed.x += crowdWeight * sin( uTime * 7.0 + crowdPhase * 9.0 ) * 0.07;
  vCrowdGlow = vColor.rgb * ( 1.1 + flicker * 2.5 ) * crowdHeat;
} else if ( crowdPart > 5.5 && crowdPart < 6.5 ) {
  vCrowdGlow = vColor.rgb * ( 0.15 + 2.0 * crowdPulse( ${BLINK_RATE[PART.amber].toFixed(2)}, crowdPhase ) );
} else if ( crowdPart > 6.5 && crowdPart < 7.5 ) {
  vCrowdGlow = vColor.rgb * ( 0.1 + 1.8 * step( 0.5, crowdPulse( ${BLINK_RATE[PART.hazard].toFixed(2)}, crowdPhase ) ) );
} else if ( crowdPart > 7.5 ) {
  // Weeds: flat while the issue is fresh, up to full height once it is old.
  transformed.y *= clamp( crowdWear * 1.6 - 0.3, 0.0, 1.0 );
}

transformed *= crowdShown * crowdGrow( instanceCrowd.y );
`;

/**
 * The lit material every crowd form draws with. Vertex colours carry the
 * form's own paint; the instance colour carries state, age and hover. One
 * program for every form (`customProgramCacheKey`).
 */
export function crowdMaterial(parameters: MeshStandardMaterialParameters = {}): MeshStandardMaterial {
  const material = new MeshStandardMaterial({
    vertexColors: true,
    flatShading: true,
    roughness: 0.78,
    metalness: 0.04,
    ...parameters,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = CROWD_CLOCK.uTime;
    shader.uniforms.uReveal = CROWD_CLOCK.uReveal;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${CROWD_VERTEX_PARS}`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>\n${CROWD_VERTEX_BODY}`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vCrowdGlow;")
      .replace(
        "#include <emissivemap_fragment>",
        "#include <emissivemap_fragment>\ntotalEmissiveRadiance += vCrowdGlow;",
      );
  };
  material.customProgramCacheKey = () => "crowd";
  return material;
}

/**
 * Smoke over the fires: each instance is one puff that rises, widens and
 * thins over a loop, from its own phase. `instanceCrowd.y` is the reveal time.
 */
export const SMOKE_VERTEX_PARS = /* glsl */ `
attribute float instancePhase;
attribute vec3 instanceCrowd;
uniform float uTime;
uniform float uReveal;
varying float vSmokeFade;
${GROW_GLSL}
`;

export const SMOKE_VERTEX_BODY = /* glsl */ `
float smokeRise = fract( uTime * 0.2 + instancePhase );
float smokeGrow = crowdGrow( instanceCrowd.y );
transformed *= ( 0.45 + smokeRise * 1.5 ) * smokeGrow;
transformed.y += smokeRise * 4.8;
transformed.x += sin( smokeRise * 3.0 + instancePhase * 6.2831853 ) * 0.7 * smokeRise;
transformed.z += cos( smokeRise * 2.4 + instancePhase * 6.2831853 ) * 0.5 * smokeRise;
vSmokeFade = ( 1.0 - smokeRise ) * smoothstep( 0.0, 0.12, smokeRise );
`;

export function smokeMaterial(color: string): MeshStandardMaterial {
  const material = new MeshStandardMaterial({
    color,
    transparent: true,
    opacity: 0.5,
    roughness: 1,
    depthWrite: false,
    flatShading: true,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = CROWD_CLOCK.uTime;
    shader.uniforms.uReveal = CROWD_CLOCK.uReveal;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${SMOKE_VERTEX_PARS}`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>\n${SMOKE_VERTEX_BODY}`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vSmokeFade;")
      .replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.a *= vSmokeFade;");
  };
  material.customProgramCacheKey = () => "crowd-smoke";
  return material;
}

/**
 * Halos: a camera-facing quad per lamp, additive, drawn with the same pulse
 * as the lamp it surrounds so the glow blinks with it. The quad's corners are
 * the geometry's `position.xy` (a unit plane), expanded in view space.
 *
 * Per instance: `haloAt` (world position), `haloColor`, and `haloData`:
 * `[phase, rate, size, appearAt]`. A rate of 0 means a steady flicker, for
 * the fires.
 */
export const HALO_VERTEX = /* glsl */ `
attribute vec3 haloAt;
attribute vec3 haloColor;
attribute vec4 haloData;
uniform float uTime;
uniform float uReveal;
varying vec2 vUv2;
varying vec3 vHalo;
${GROW_GLSL}
${PULSE_GLSL}
void main() {
  float grow = crowdGrow( haloData.w );
  float pulse = haloData.y > 0.0
    ? crowdPulse( haloData.y, haloData.x )
    : 0.8 + sin( uTime * 11.0 + haloData.x * 6.2831853 ) * 0.1 + sin( uTime * 6.3 + haloData.x * 11.0 ) * 0.08;
  vUv2 = position.xy * 2.0;
  vHalo = haloColor * pulse;
  vec4 mv = viewMatrix * vec4( haloAt, 1.0 );
  mv.xy += position.xy * haloData.z * grow * ( 0.75 + 0.35 * pulse );
  gl_Position = projectionMatrix * mv;
}
`;

export const HALO_FRAGMENT = /* glsl */ `
uniform float uStrength;
varying vec2 vUv2;
varying vec3 vHalo;
void main() {
  float r = length( vUv2 );
  float fade = 1.0 - smoothstep( 0.0, 1.0, r );
  float alpha = fade * fade * uStrength;
  if ( alpha < 0.004 ) discard;
  gl_FragColor = vec4( vHalo * alpha, 1.0 );
  #include <colorspace_fragment>
}
`;

export function haloMaterial(strength = 0.55): ShaderMaterial {
  const material = new ShaderMaterial({
    uniforms: {
      uTime: CROWD_CLOCK.uTime,
      uReveal: CROWD_CLOCK.uReveal,
      uStrength: { value: strength },
    },
    vertexShader: HALO_VERTEX,
    fragmentShader: HALO_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    toneMapped: false,
  });
  return material;
}

/** Linear RGB for a halo colour attribute. */
export function linearRgb(hex: string): [number, number, number] {
  const color = new Color(hex);
  return [color.r, color.g, color.b];
}
