"use client";

/**
 * Everything around the city rather than in it (PLAN.md sections 4 and 39):
 * the sky, the exposure, the civic ground under the town hall (gravel, setts
 * or a village green, by settlement), the detail layer over the district
 * ground, the soft darkening that seats the buildings on the plate, and the
 * post-processing chain. The sky dome grows with the furthest the camera may
 * pull back (`scale.ts`), so a phone framing a metropolis stays inside it.
 *
 * It is mounted by `CityCanvas`, outside the keyed `<City>` subtree, because
 * all of it outlives a model: analysing another repository should not throw
 * away the sky texture or re-run the quality probe.
 *
 * WHY A SKY DOME. The scene used to end at a flat background colour, which
 * gave the frame two flat fields -- ground and sky -- meeting at a hard line
 * near the top of the viewport. The dome is graded from a clear blue zenith
 * down to a pale backdrop at the horizon, and the landscape's rim, the fog
 * and the dome below the horizon are all that same backdrop colour, so the
 * ground ends in a clean sweep rather than a seam. None of it is haze: the
 * city itself is always drawn at full clarity (`palette.ts`).
 */

import { useEffect, useMemo, useRef } from "react";
import { ContactShadows } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { Bloom, EffectComposer, N8AO, SMAA, ToneMapping } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import type { BloomEffect } from "postprocessing";
import {
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Color,
  type Mesh,
  MultiplyBlending,
  NeutralToneMapping,
  NoToneMapping,
  ShaderMaterial,
  Shape,
  ShapeGeometry,
  type Texture,
  Vector2,
  Vector3,
} from "three";
import type { CityModel } from "@/types/city";
import { REFERENCE_ASPECT, aspectWiden, maxCameraDistance } from "./entities";
import { chamferedOutline, plazaRect, plazaSurface, type PlazaRect } from "./groundwork";
import {
  GREEN_GRASS,
  PLAZA_COLOR,
  SETTS_COLOR,
  desaturate,
  hexToRgb,
  mix,
  type SceneAtmosphere,
} from "./palette";
import { useQuality, useQualityProbe, type QualitySettings } from "./quality";
import { cityRevealEnd } from "./reveal";
import { skyRadius } from "./scale";
import { useSky, useSkyFrame } from "./sky";
import {
  surfaceTexture,
  tiledSurface,
  useTiledSurface,
  type SurfaceKind,
} from "./textures/surfaces";

/**
 * The dome sits on its own layer so that drei's `<ContactShadows>`, which
 * renders the whole scene from a camera it owns, cannot see it: a sphere nine
 * hundred units across passing through its ten-unit slab would darken every
 * pixel of the plate. The scene camera is opted back in by `Environment`.
 */
const SKY_LAYER = 1;

/**
 * The painted sky's proportions. It used to be painted into a 768 by 384
 * canvas and wrapped round the dome; the shader below keeps that canvas's
 * geometry exactly (its gradient stops, and a halo measured in its pixels),
 * so the day sky is the one the city has always had, and the hour can now
 * move it every frame without repainting anything.
 */
const SKY_W = 768;
const SKY_H = 384;

const SKY_VERTEX = /* glsl */ `
varying vec3 vSkyDir;
void main() {
  vSkyDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}
`;

/**
 * Everything is worked out in sRGB, as the canvas did (gradients and a
 * "lighter" composite on sRGB values), then converted to linear for the
 * renderer. Night adds stars and the moon's disc, both procedural (section
 * 4: no downloads).
 */
const SKY_FRAGMENT = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uGround;
uniform vec3 uGlow;
uniform float uGlowStrength;
uniform vec3 uSun;
uniform float uStars;
uniform float uMoon;
varying vec3 vSkyDir;

#define SKY_PI 3.141592653589793

float skyHash( vec3 p ) {
  p = fract( p * vec3( 0.1031, 0.1030, 0.0973 ) );
  p += dot( p, p.yxz + 33.33 );
  return fract( ( p.x + p.y ) * p.z );
}

vec3 skyLinear( vec3 c ) {
  return mix( c / 12.92, pow( ( c + 0.055 ) / 1.055, vec3( 2.4 ) ), step( 0.04045, c ) );
}

// u round the dome and y down it, as the old canvas's pixels were laid out.
vec2 skyUv( vec3 d ) {
  float u = fract( atan( d.z, -d.x ) / ( 2.0 * SKY_PI ) + 1.0 );
  float y = acos( clamp( d.y, -1.0, 1.0 ) ) / SKY_PI;
  return vec2( u, y );
}

void main() {
  vec3 dir = normalize( vSkyDir );
  vec2 uv = skyUv( dir );
  float y = uv.y;

  // The vertical grade: zenith, two blends, the horizon band, the backdrop.
  vec3 a = mix( uZenith, uHorizon, 0.4 );
  vec3 b = mix( uZenith, uHorizon, 0.82 );
  vec3 color;
  if ( y < 0.3 ) color = mix( uZenith, a, y / 0.3 );
  else if ( y < 0.44 ) color = mix( a, b, ( y - 0.3 ) / 0.14 );
  else if ( y < 0.5 ) color = mix( b, uHorizon, ( y - 0.44 ) / 0.06 );
  else if ( y < 0.53 ) color = mix( uHorizon, uGround, ( y - 0.5 ) / 0.03 );
  else color = uGround;

  // Stars, only above the horizon and thinning towards it.
  if ( uStars > 0.0 && dir.y > 0.0 ) {
    vec3 p = dir * 150.0;
    vec3 cell = floor( p );
    float h = skyHash( cell );
    if ( h > 0.955 ) {
      vec3 at = cell + 0.5 + ( vec3( skyHash( cell + 7.1 ), skyHash( cell + 3.7 ), skyHash( cell + 1.3 ) ) - 0.5 ) * 0.5;
      float r = length( p - at );
      float size = mix( 0.1, 0.22, fract( h * 37.0 ) );
      float star = smoothstep( size, size * 0.3, r );
      float lift = smoothstep( 0.03, 0.3, dir.y );
      vec3 tint = mix( vec3( 0.85, 0.9, 1.0 ), vec3( 1.0, 0.93, 0.8 ), fract( h * 91.0 ) );
      color += tint * star * lift * uStars * mix( 0.45, 1.0, fract( h * 13.0 ) );
    }
  }

  // The moon's disc hangs lower than the light it stands for, so that it
  // shows above the horizon from the lowest the camera can orbit to; its
  // light comes from higher, for shadows a model can still be read by.
  vec3 moonDir = normalize( vec3( uSun.x, uSun.y * 0.3, uSun.z ) );

  // The sun's (or at night the moon's) halo, in the canvas's pixels.
  vec2 sun = skyUv( uMoon > 0.0 ? normalize( mix( uSun, moonDir, uMoon ) ) : uSun );
  float du = ( fract( uv.x - sun.x + 0.5 ) - 0.5 ) * ${SKY_W.toFixed(1)};
  float dy = ( uv.y - sun.y ) * ${SKY_H.toFixed(1)};
  float d = length( vec2( du, dy ) );
  float glow = max( 0.0, 1.0 - d / ${(SKY_H * 0.55).toFixed(2)} ) * uGlowStrength * 0.42
    + max( 0.0, 1.0 - d / ${(SKY_H * 0.12).toFixed(2)} ) * uGlowStrength * 0.75;
  color += uGlow * max( glow, 0.0 );

  // The moon: a small bright disc with a soft rim, a little larger than life.
  if ( uMoon > 0.0 ) {
    float angle = acos( clamp( dot( dir, moonDir ), -1.0, 1.0 ) );
    float disc = smoothstep( 0.026, 0.0225, angle );
    float shade = 0.88 + 0.12 * smoothstep( 0.026, 0.0, angle );
    color = mix( color, vec3( 0.98, 0.96, 0.9 ) * shade, disc * uMoon );
  }

  // One least significant bit of noise: a smooth eight-bit grade bands.
  color += ( skyHash( vec3( gl_FragCoord.xy, 1.0 ) ) - 0.5 ) * ( 2.0 / 255.0 );

  gl_FragColor = vec4( skyLinear( clamp( color, 0.0, 1.0 ) ), 1.0 );
  #include <colorspace_fragment>
}
`;

function skyUniforms() {
  return {
    uZenith: { value: new Vector3() },
    uHorizon: { value: new Vector3() },
    uGround: { value: new Vector3() },
    uGlow: { value: new Vector3() },
    uGlowStrength: { value: 0 },
    uSun: { value: new Vector3(0, 1, 0) },
    uStars: { value: 0 },
    uMoon: { value: 0 },
  };
}

type SkyUniforms = ReturnType<typeof skyUniforms>;

/** The sky's uniforms for an hour: sRGB colours, as the canvas painted them. */
function writeSky(uniforms: SkyUniforms, atmosphere: SceneAtmosphere): void {
  uniforms.uZenith.value.fromArray(hexToRgb(atmosphere.skyZenithColor));
  uniforms.uHorizon.value.fromArray(hexToRgb(atmosphere.skyHorizonColor));
  uniforms.uGround.value.fromArray(hexToRgb(atmosphere.skyGroundColor));
  uniforms.uGlow.value.fromArray(hexToRgb(atmosphere.sunGlowColor));
  uniforms.uGlowStrength.value = Math.max(atmosphere.sunGlowStrength, 0);
  uniforms.uSun.value.fromArray(atmosphere.sunDirection);
  uniforms.uStars.value = atmosphere.starStrength;
  uniforms.uMoon.value = atmosphere.moonStrength;
}

function SkyDome({ radius }: { radius: number }) {
  const mesh = useRef<Mesh>(null);
  const material = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: skyUniforms(),
        vertexShader: SKY_VERTEX,
        fragmentShader: SKY_FRAGMENT,
        side: BackSide,
        depthWrite: false,
        fog: false,
        // Painted in final colours: in the low tier the fog it meets at the
        // horizon is not tone mapped either, so the two stay the same value.
        toneMapped: false,
      }),
    [],
  );
  useEffect(() => () => material.dispose(), [material]);

  useEffect(() => {
    mesh.current?.layers.set(SKY_LAYER);
  }, []);

  useSkyFrame((atmosphere) => writeSky(material.uniforms as SkyUniforms, atmosphere), material);

  // The sky is infinitely far away, so it travels with the viewer: panning
  // across a large city must not walk the camera towards the edge of the dome.
  useFrame(({ camera }) => {
    const node = mesh.current;
    if (node) node.position.set(camera.position.x, 0, camera.position.z);
  });

  return (
    <mesh ref={mesh} renderOrder={-1000} frustumCulled={false} raycast={() => null} material={material}>
      <sphereGeometry args={[radius, 48, 24]} />
    </mesh>
  );
}

/**
 * The frame's backdrop and the fog that meets it, both in the hour's horizon
 * colour. The fog only hides where the landscape ends; it never reaches the
 * city (`FOG_NEAR` in `palette.ts`).
 */
function Backdrop({ atmosphere, reach }: { atmosphere: SceneAtmosphere; reach: number }) {
  const sky = useSky();
  const scene = useThree((state) => state.scene);
  const initial = sky.atmosphere.background;
  useSkyFrame((live) => {
    if (scene.background instanceof Color) scene.background.set(live.background);
    scene.fog?.color.set(live.background);
  }, reach);
  return (
    <>
      <color attach="background" args={[initial]} />
      <fog
        attach="fog"
        args={[initial, reach * atmosphere.fogNearFactor, reach * atmosphere.fogFarFactor]}
      />
    </>
  );
}

/** World units per tile of the gravel and of the ground detail. */
const GRAVEL_TILE = 7;
const GROUND_TILE = 17;
/** Above the district plates (0.01) and the plaza (0.02), under every kerb. */
const GROUND_DETAIL_Y = 0.03;

/** World units per tile of the town's setts and of the village green's lawn. */
const SETTS_TILE = 3.2;
const GREEN_TILE = 13;

/**
 * The civic ground, in the settlement's own material (PLAN.md 76.3 and 76.5):
 * the city's raked gravel ("paved"), a town's setts, a village's green.
 */
function Plaza({ city, atmosphere }: { city: CityModel; atmosphere: SceneAtmosphere }) {
  const rect = useMemo(() => plazaRect(city), [city]);
  const surface = plazaSurface(city);
  if (!rect) return null;
  if (surface === "green") return <VillageGreen rect={rect} atmosphere={atmosphere} />;
  if (surface === "setts") return <Setts rect={rect} atmosphere={atmosphere} />;
  return <Gravel rect={rect} atmosphere={atmosphere} />;
}

/** A surface texture tiled in world units on both axes of a rect. */
function useRectSurface(kind: SurfaceKind, rect: PlazaRect, tile: number): Texture {
  const { textureSize, anisotropy } = useQuality();
  const texture = useMemo(() => {
    const next = tiledSurface(kind, textureSize, 1, anisotropy);
    next.repeat.set(Math.max(1, Math.round(rect.w / tile)), Math.max(1, Math.round(rect.d / tile)));
    return next;
  }, [kind, rect.w, rect.d, tile, textureSize, anisotropy]);
  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}

/** A town square laid in setts, a little warmer and darker than the city's gravel. */
function Setts({ rect, atmosphere }: { rect: PlazaRect; atmosphere: SceneAtmosphere }) {
  const setts = useRectSurface("setts", rect, SETTS_TILE);
  return (
    <mesh rotation-x={-Math.PI / 2} position={[rect.x, 0.02, rect.z]} receiveShadow raycast={() => null}>
      <planeGeometry args={[rect.w, rect.d]} />
      <meshStandardMaterial
        color={desaturate(SETTS_COLOR, atmosphere.desaturation)}
        map={setts}
        roughness={0.95}
        metalness={0}
      />
    </mesh>
  );
}

/**
 * The village green: mown lawn a shade richer than the grass around it, its
 * corners cut as the village layout draws it.
 */
function VillageGreen({ rect, atmosphere }: { rect: PlazaRect; atmosphere: SceneAtmosphere }) {
  const lawn = useRectSurface("lawn", rect, GREEN_TILE);
  const geometry = useMemo(() => {
    // The shape is drawn in x and -z, then laid flat by the mesh's rotation.
    const outline = chamferedOutline(rect);
    const shape = new Shape(outline.map(([x, z]) => new Vector2(x - rect.x, -(z - rect.z))));
    const next = new ShapeGeometry(shape);
    // Shape UVs are raw coordinates; the lawn wants 0..1 across the rect.
    const uv = next.getAttribute("uv");
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, uv.getX(i) / rect.w + 0.5, uv.getY(i) / rect.d + 0.5);
    }
    uv.needsUpdate = true;
    return next;
  }, [rect]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <mesh
      geometry={geometry}
      rotation-x={-Math.PI / 2}
      position={[rect.x, 0.025, rect.z]}
      receiveShadow
      raycast={() => null}
    >
      <meshStandardMaterial
        color={desaturate(mix(atmosphere.terrainColor, GREEN_GRASS, 0.55), atmosphere.desaturation)}
        map={lawn}
        roughness={1}
        metalness={0}
      />
    </mesh>
  );
}

/**
 * Raked gravel under the civic centre, so the town hall stands on a square
 * rather than on the same lawn as everything else (PLAN.md section 36).
 */
function Gravel({ rect, atmosphere }: { rect: PlazaRect; atmosphere: SceneAtmosphere }) {
  const gravel = useTiledSurface("gravel", Math.max(rect.w, rect.d), GRAVEL_TILE);

  return (
    <mesh
      rotation-x={-Math.PI / 2}
      position={[rect.x, 0.02, rect.z]}
      receiveShadow
      raycast={() => null}
    >
      <planeGeometry args={[rect.w, rect.d]} />
      <meshStandardMaterial
        color={desaturate(PLAZA_COLOR, atmosphere.desaturation)}
        map={gravel}
        roughness={1}
        metalness={0}
      />
    </mesh>
  );
}

/**
 * One flat quad per district, UV'd in world units so the pattern runs
 * continuously from one district into the next.
 */
function districtQuads(city: CityModel): BufferGeometry | null {
  const count = city.districts.length;
  if (count === 0) return null;
  const positions = new Float32Array(count * 4 * 3);
  const uvs = new Float32Array(count * 4 * 2);
  const index: number[] = [];
  city.districts.forEach(({ rect }, n) => {
    const x0 = rect.x - rect.w / 2;
    const x1 = rect.x + rect.w / 2;
    const z0 = rect.z - rect.d / 2;
    const z1 = rect.z + rect.d / 2;
    const corners = [
      [x0, z0],
      [x1, z0],
      [x1, z1],
      [x0, z1],
    ];
    corners.forEach(([x, z], k) => {
      positions.set([x, GROUND_DETAIL_Y, z], (n * 4 + k) * 3);
      uvs.set([x / GROUND_TILE, z / GROUND_TILE], (n * 4 + k) * 2);
    });
    const b = n * 4;
    // Wound to face up.
    index.push(b, b + 2, b + 1, b, b + 3, b + 2);
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new BufferAttribute(uvs, 2));
  geometry.setIndex(index);
  return geometry;
}

/**
 * The ground detail layer (`textures/patterns.ts`, `groundDetailPattern`).
 *
 * The district plates belong to `District.tsx`, and a hovered or selected
 * district retints its plate. Rather than reach into that material, the
 * detail is laid over the top as a multiply: an unlit, depth-tested quad that
 * darkens whatever is underneath by a few percent in a soft mottle. So the
 * hover tint, the hour, the shadows and an archived city's grey all come
 * through untouched -- the layer only ever says "a little darker here" -- and
 * anything standing on the ground hides it by being nearer the camera.
 *
 * It is a transparent pass over most of the frame, so the low tier drops it.
 */
function GroundDetail({ city }: { city: CityModel }) {
  const { textureSize, anisotropy } = useQuality();
  const geometry = useMemo(() => districtQuads(city), [city]);
  const texture = surfaceTexture("ground", textureSize, anisotropy);
  useEffect(() => () => geometry?.dispose(), [geometry]);
  if (!geometry) return null;

  return (
    <mesh geometry={geometry} raycast={() => null} renderOrder={-10}>
      <meshBasicMaterial
        map={texture}
        transparent
        premultipliedAlpha
        blending={MultiplyBlending}
        depthWrite={false}
        toneMapped={false}
        fog={false}
      />
    </mesh>
  );
}

/**
 * Khronos PBR Neutral tone mapping, with an exposure chosen by the hour
 * (`palette.ts`). Neutral leaves every colour below the highlights exactly as
 * the palette wrote it -- a sage roof renders sage, a lawn renders green --
 * and only rolls the brightest sunlit faces off before they clip. ACES filmic
 * shifted hues and pulled the pale palette towards a brown-grey; a diorama
 * wants its paint to read true.
 *
 * Where the tone mapping happens depends on the tier. Without the composer
 * the renderer does it per material. With it, three renders the scene into a
 * half-float target, where it never tone maps, and the composer forces
 * `NoToneMapping` besides -- so the high tier used to reach the screen with
 * no tone mapping and no exposure at all. `Post` ends its chain with the same
 * operator instead, and both tiers read the exposure from the renderer.
 */
function Film({
  maxDpr,
  composed,
}: {
  maxDpr: number;
  /** The composer is running and tone maps at the end of its chain. */
  composed: boolean;
}) {
  const camera = useThree((state) => state.camera);
  const setDpr = useThree((state) => state.setDpr);
  const sky = useSky();
  const toneMapping = composed ? NoToneMapping : NeutralToneMapping;

  // Written from the frame loop rather than an effect: the renderer belongs
  // to R3F, and the comparison costs a great deal less than a re-render.
  // The exposure follows the live hour (`sky.tsx`).
  useFrame(({ gl }) => {
    const exposure = sky.atmosphere.exposure;
    if (gl.toneMappingExposure !== exposure) gl.toneMappingExposure = exposure;
    if (gl.toneMapping !== toneMapping) gl.toneMapping = toneMapping;
  });

  useEffect(() => {
    camera.layers.enable(SKY_LAYER);
  }, [camera]);

  useEffect(() => {
    setDpr([1, maxDpr]);
  }, [setDpr, maxDpr]);

  return null;
}

/**
 * The composer (PLAN.md section 63: the first thing that goes when frames get
 * long, which is why it is behind the quality tier).
 *
 * N8AO puts a contact darkening in every corner the directional light cannot
 * reach -- between a tower and its neighbour, under an eave, along a kerb --
 * which is most of what makes a lit model read as three dimensional.
 *
 * Bloom is deliberately threshold-limited to values above 1.1 in the scene's
 * own linear light, before the tone mapping: the palest roof under the
 * strongest midday sun lands just under 1 there, and the emissive windows,
 * beacons, sparks and lamps well above it.
 * So the lights glow and the facades do not, and the glow is kept small: a
 * wide soft bloom over a whole frame is exactly the veil this scene is not
 * meant to have.
 *
 * The chain ends in the tone mapping (see `Film`), after the bloom so the
 * glow is rolled off with everything else rather than clipping.
 */
/** Bloom strength for an hour. Auto's is exactly what it always was. */
function bloomIntensity(atmosphere: SceneAtmosphere): number {
  return 0.26 + Math.max(atmosphere.evening * 0.22, atmosphere.nightness * 0.34);
}

function Post({
  atmosphere,
  quality,
}: {
  atmosphere: SceneAtmosphere;
  quality: QualitySettings;
}) {
  // The glow follows the live hour: a little more at the golden hour, and
  // most at night, when the lights are what the city is made of.
  const sky = useSky();
  const bloom = useRef<BloomEffect>(null);
  useSkyFrame((live) => {
    if (bloom.current) bloom.current.intensity = bloomIntensity(live);
  });

  // Built as an array rather than with inline conditionals: the composer
  // rebuilds its chain from its children, and a `false` among them is not an
  // effect it can skip.
  const effects = [];
  if (quality.ambientOcclusion) {
    effects.push(
      <N8AO
        key="ao"
        // Full resolution, with twice the denoise samples of the "low" preset
        // over a tighter radius. At half resolution the occlusion is sampled
        // on a grid coarser than a tower's mullions, and the upsample drew
        // faint diagonal hatching down the side of every thin fin; the high
        // tier this runs on has the headroom (PLAN.md 76.13).
        aoSamples={16}
        denoiseSamples={8}
        denoiseRadius={8}
        aoRadius={2.6}
        distanceFalloff={1.1}
        intensity={1.05}
        // Neutral, with a breath of the ground bounce in it: an occlusion
        // tinted with the bounce colour turns the whole frame that colour.
        color={mix("#0a0c10", atmosphere.groundBounceColor, 0.2)}
      />,
    );
  }
  if (quality.bloom) {
    effects.push(
      <Bloom
        key="bloom"
        ref={bloom}
        mipmapBlur
        luminanceThreshold={1.1}
        luminanceSmoothing={0.25}
        intensity={bloomIntensity(sky.atmosphere)}
        radius={0.55}
      />,
    );
  }
  effects.push(<ToneMapping key="tone" mode={ToneMappingMode.NEUTRAL} />);
  if (quality.smaa) effects.push(<SMAA key="smaa" />);

  return (
    <EffectComposer enableNormalPass={false} multisampling={0} stencilBuffer={false}>
      {effects}
    </EffectComposer>
  );
}

export default function Environment({
  city,
  atmosphere,
  size,
  aspect = REFERENCE_ASPECT,
}: {
  city: CityModel | null;
  atmosphere: SceneAtmosphere;
  size: number;
  /** Canvas width over height: a phone pulls the camera back, towards the sky. */
  aspect?: number;
}) {
  const quality = useQuality();

  // The probe has to wait for the generation animation to finish, or it times
  // three hundred buildings growing out of the ground (PLAN.md section 43),
  // and now the backlog's ripple and the queue behind them (76.8).
  const settleMs = useMemo(() => (city ? cityRevealEnd(city) + 250 : null), [city]);
  useQualityProbe(settleMs);

  return (
    <>
      <Film maxDpr={quality.maxDpr} composed={quality.postProcessing} />
      <Backdrop atmosphere={atmosphere} reach={size * aspectWiden(aspect)} />
      <SkyDome radius={skyRadius(size, maxCameraDistance(size, aspect))} />

      {city && <Plaza city={city} atmosphere={atmosphere} />}
      {city && quality.groundDetail && <GroundDetail city={city} />}

      {quality.contactShadows && (
        // Lifted clear of the kerbs and the road markings: anything below the
        // slab is behind its camera and cannot darken the street furniture.
        <ContactShadows
          position={[0, 0.22, 0]}
          scale={size * 1.05}
          resolution={512}
          far={16}
          blur={2.6}
          opacity={atmosphere.contactShadowOpacity}
          color={mix(atmosphere.groundBounceColor, "#000000", 0.5)}
          frames={Infinity}
        />
      )}

      {quality.postProcessing && <Post atmosphere={atmosphere} quality={quality} />}
    </>
  );
}
