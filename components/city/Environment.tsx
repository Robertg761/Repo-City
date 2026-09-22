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
 * near the top of the viewport. A photograph of a model has neither: the sky
 * is graded from zenith to horizon, it carries the sun's haze, and the
 * distance dissolves into it. The dome's horizon band IS the fog colour, so
 * the terrain runs out into exactly the value the sky has there.
 */

import { useEffect, useMemo, useRef } from "react";
import { ContactShadows } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { Bloom, EffectComposer, N8AO, SMAA } from "@react-three/postprocessing";
import {
  ACESFilmicToneMapping,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  type Mesh,
  MultiplyBlending,
  RepeatWrapping,
  SRGBColorSpace,
} from "three";
import type { CityModel } from "@/types/city";
import { plazaRect } from "./groundwork";
import { PLAZA_COLOR, desaturate, mix, type SceneAtmosphere } from "./palette";
import { useQuality, useQualityProbe, type QualitySettings } from "./quality";
import { revealEnd } from "./reveal";
import { surfaceTexture, useTiledSurface } from "./textures/surfaces";

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
  // The horizon band is held for a few percent either side: haze piles up at
  // eye level, and a single stop there reads as a drawn line.
  grade.addColorStop(0.5, horizon);
  grade.addColorStop(0.54, mix(horizon, ground, 0.45));
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
      <meshBasicMaterial map={texture} side={BackSide} depthWrite={false} fog={false} />
    </mesh>
  );
}

/** World units per tile of the gravel and of the ground detail. */
const GRAVEL_TILE = 7;
const GROUND_TILE = 17;
/** Above the district plates (0.01) and the plaza (0.02), under every kerb. */
const GROUND_DETAIL_Y = 0.03;

/**
 * Raked gravel under the civic centre, so the town hall stands on a square
 * rather than on the same lawn as everything else (PLAN.md section 36).
 */
function Plaza({ city, atmosphere }: { city: CityModel; atmosphere: SceneAtmosphere }) {
  const rect = useMemo(() => plazaRect(city), [city]);
  const gravel = useTiledSurface("gravel", rect ? Math.max(rect.w, rect.d) : 1, GRAVEL_TILE);
  if (!rect) return null;

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
 * ACES filmic tone mapping with an exposure chosen by the hour and the haze
 * (`palette.ts`). Filmic is what keeps a sunlit white facade from clipping to
 * paper while the shadowed side still has colour in it -- the difference
 * between a render and a photograph of a model.
 */
function Film({ atmosphere, maxDpr }: { atmosphere: SceneAtmosphere; maxDpr: number }) {
  const camera = useThree((state) => state.camera);
  const setDpr = useThree((state) => state.setDpr);
  const exposure = atmosphere.exposure;

  // Written from the frame loop rather than an effect: the renderer belongs
  // to R3F, and the comparison costs a great deal less than a re-render.
  useFrame((state) => {
    if (state.gl.toneMappingExposure === exposure) return;
    state.gl.toneMapping = ACESFilmicToneMapping;
    state.gl.toneMappingExposure = exposure;
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
 * Bloom is deliberately threshold-limited to values above 1, which only the
 * emissive materials reach: lit windows, beacons, sparks and lamps are all
 * drawn with `toneMapped={false}`, so they survive into the half-float buffer
 * above white while every tone-mapped surface lands below it. The result is
 * that the lights glow and the facades do not.
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
        luminanceThreshold={1}
        luminanceSmoothing={0.25}
        intensity={0.34 + atmosphere.evening * 0.24}
        radius={0.7}
      />,
    );
  }
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
}: {
  city: CityModel | null;
  atmosphere: SceneAtmosphere;
  size: number;
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
      <Film atmosphere={atmosphere} maxDpr={quality.maxDpr} />
      <SkyDome atmosphere={atmosphere} radius={Math.min(Math.max(size * 4, 700), 1400)} />

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
