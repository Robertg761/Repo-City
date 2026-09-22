"use client";

/**
 * Everything around the city rather than in it (PLAN.md sections 4 and 39):
 * the sky, the exposure, the gravel under the town hall, the detail layer
 * over the district ground, the soft darkening that seats the buildings on
 * the plate, and the post-processing chain.
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
import {
  BackSide,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  type Mesh,
  MultiplyBlending,
  NeutralToneMapping,
  NoToneMapping,
  RepeatWrapping,
  SRGBColorSpace,
  Shape,
  ShapeGeometry,
  type Texture,
  Vector2,
} from "three";
import type { CityModel } from "@/types/city";
import { REFERENCE_ASPECT, maxCameraDistance } from "./entities";
import { chamferedOutline, plazaRect, plazaSurface, type PlazaRect } from "./groundwork";
import {
  GREEN_GRASS,
  PLAZA_COLOR,
  SETTS_COLOR,
  desaturate,
  mix,
  type SceneAtmosphere,
} from "./palette";
import { useQuality, useQualityProbe, type QualitySettings } from "./quality";
import { revealEnd } from "./reveal";
import { skyRadius } from "./scale";
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

const SKY_W = 768;
const SKY_H = 384;

/**
 * Paints the sky into a canvas: a vertical grade through zenith, horizon and
 * ground haze, plus the sun's halo at the bearing `Lighting` puts the
 * directional light on. Procedural, as section 4 requires -- no download, and
 * the whole thing is three gradients.
 */
function paintSky(atmosphere: SceneAtmosphere): CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = SKY_W;
  canvas.height = SKY_H;
  const context = canvas.getContext("2d");
  if (!context) return null;

  const zenith = atmosphere.skyZenithColor;
  const horizon = atmosphere.skyHorizonColor;
  const ground = atmosphere.skyGroundColor;

  const grade = context.createLinearGradient(0, 0, 0, SKY_H);
  grade.addColorStop(0, zenith);
  grade.addColorStop(0.3, mix(zenith, horizon, 0.4));
  grade.addColorStop(0.44, mix(zenith, horizon, 0.82));
  // The horizon is a band rather than a single stop, which reads as a drawn
  // line; below it the dome is the pale backdrop the landscape fades into.
  grade.addColorStop(0.5, horizon);
  grade.addColorStop(0.53, ground);
  grade.addColorStop(1, ground);
  context.fillStyle = grade;
  context.fillRect(0, 0, SKY_W, SKY_H);

  // Sphere UVs: u runs around from atan2(z, -x), v from the polar angle.
  const [sx, sy, sz] = atmosphere.sunDirection;
  const u = (Math.atan2(sz, -sx) / (Math.PI * 2) + 1) % 1;
  const v = 1 - Math.acos(Math.max(-1, Math.min(1, sy))) / Math.PI;
  const cx = u * SKY_W;
  const cy = (1 - v) * SKY_H;

  context.globalCompositeOperation = "lighter";
  for (const [spread, strength] of [
    [SKY_H * 0.55, atmosphere.sunGlowStrength * 0.42],
    [SKY_H * 0.12, atmosphere.sunGlowStrength * 0.75],
  ] as const) {
    // Drawn three times so the halo wraps around the seam behind the camera.
    for (const offset of [-SKY_W, 0, SKY_W]) {
      const halo = context.createRadialGradient(cx + offset, cy, 0, cx + offset, cy, spread);
      halo.addColorStop(0, tint(atmosphere.sunGlowColor, Math.max(strength, 0)));
      halo.addColorStop(1, tint(atmosphere.sunGlowColor, 0));
      context.fillStyle = halo;
      context.fillRect(0, 0, SKY_W, SKY_H);
    }
  }
  context.globalCompositeOperation = "source-over";

  // A smooth eight-bit grade across half a screen bands visibly. One least
  // significant bit of noise costs nothing and removes it.
  const image = context.getImageData(0, 0, SKY_W, SKY_H);
  const { data } = image;
  for (let i = 0; i < data.length; i += 4) {
    const jitter = Math.random() * 2 - 1;
    data[i] += jitter;
    data[i + 1] += jitter;
    data[i + 2] += jitter;
  }
  context.putImageData(image, 0, 0);

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  return texture;
}

/** `#rrggbb` plus an alpha, in the form a canvas gradient stop wants. */
function tint(hex: string, alpha: number): string {
  const raw = hex.replace("#", "");
  const n = Number.parseInt(raw.length === 3 ? raw.replace(/./g, "$&$&") : raw, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha.toFixed(3)})`;
}

function SkyDome({ atmosphere, radius }: { atmosphere: SceneAtmosphere; radius: number }) {
  const mesh = useRef<Mesh>(null);
  const texture = useMemo(() => paintSky(atmosphere), [atmosphere]);

  useEffect(() => () => texture?.dispose(), [texture]);

  useEffect(() => {
    mesh.current?.layers.set(SKY_LAYER);
  }, []);

  // The sky is infinitely far away, so it travels with the viewer: panning
  // across a large city must not walk the camera towards the edge of the dome.
  useFrame(({ camera }) => {
    const node = mesh.current;
    if (node) node.position.set(camera.position.x, 0, camera.position.z);
  });

  if (!texture) return null;

  return (
    <mesh ref={mesh} renderOrder={-1000} frustumCulled={false} raycast={() => null}>
      <sphereGeometry args={[radius, 48, 24]} />
      <meshBasicMaterial
        map={texture}
        side={BackSide}
        depthWrite={false}
        fog={false}
        // Painted in final colours: in the low tier the fog it meets at the
        // horizon is not tone mapped either, so the two stay the same value.
        toneMapped={false}
      />
    </mesh>
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
  atmosphere,
  maxDpr,
  composed,
}: {
  atmosphere: SceneAtmosphere;
  maxDpr: number;
  /** The composer is running and tone maps at the end of its chain. */
  composed: boolean;
}) {
  const camera = useThree((state) => state.camera);
  const setDpr = useThree((state) => state.setDpr);
  const exposure = atmosphere.exposure;
  const toneMapping = composed ? NoToneMapping : NeutralToneMapping;

  // Written from the frame loop rather than an effect: the renderer belongs
  // to R3F, and the comparison costs a great deal less than a re-render.
  useFrame(({ gl }) => {
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
function Post({
  atmosphere,
  quality,
}: {
  atmosphere: SceneAtmosphere;
  quality: QualitySettings;
}) {
  // Built as an array rather than with inline conditionals: the composer
  // rebuilds its chain from its children, and a `false` among them is not an
  // effect it can skip.
  const effects = [];
  if (quality.ambientOcclusion) {
    effects.push(
      <N8AO
        key="ao"
        halfRes
        quality="low"
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
        mipmapBlur
        luminanceThreshold={1.1}
        luminanceSmoothing={0.25}
        intensity={0.26 + atmosphere.evening * 0.22}
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
  // three hundred buildings growing out of the ground (PLAN.md section 43).
  const settleMs = useMemo(
    () =>
      city
        ? revealEnd([
            ...city.buildings.map((b) => b.appearAt),
            ...city.landmarks.map((l) => l.appearAt),
            ...city.incidents.map((i) => i.appearAt),
            ...city.constructionSites.map((c) => c.appearAt),
          ]) + 250
        : null,
    [city],
  );
  useQualityProbe(settleMs);

  return (
    <>
      <Film atmosphere={atmosphere} maxDpr={quality.maxDpr} composed={quality.postProcessing} />
      <SkyDome atmosphere={atmosphere} radius={skyRadius(size, maxCameraDistance(size, aspect))} />

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
