"use client";

/**
 * The houses, barns and farmsteads out in the land (`?land=rich`), drawn with
 * the city's own models: a cottage, a terrace, a farmhouse, a barn, the town's
 * low flats, the city's house and low-rises, each the lean level only, one
 * instanced draw per model, painted from the city's own palettes
 * (`palettes.ts`, `facades.ts`) and through the city's own materials, so they
 * share its shader programs.
 *
 * At night some of their windows are lit (`homes.ts`): one more instanced draw
 * of small quads, which the hour's `litWindowShare` thins or fills.
 */

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { Color, InstancedBufferAttribute, MeshStandardMaterial, Object3D, type BufferGeometry, type InstancedMesh } from "three";
import type { Building } from "@/types/city";
import { MATERIALS_PALETTE } from "../look";
import { archetypeGeometry, windowPanelGeometry } from "../models/buildings/geometry";
import { weather, cityPaint } from "../models/buildings/facades";
import {
  ACCENT_ATTRIBUTE,
  GLASS_ATTRIBUTE,
  ROOF_ATTRIBUTE,
  SURFACES_ATTRIBUTE,
  buildingDetailMaterial,
  cityPaintMaterial,
  settlementMaterial,
} from "../models/buildings/material";
import { settlementPaint } from "../models/buildings/palettes";
import { buildingColor, desaturate, stateTint, WINDOW_COLOR, type SceneAtmosphere } from "../palette";
import { useQuality } from "../quality";
import { useSkyFrame } from "../sky";
import { windowEmissive } from "../Buildings";
import { homeHeight, litHomeWindows, planHomeWindows } from "./homes";
import type { HouseSpot, LandscapePlan } from "./plan";
import type { ModelKey } from "../models/buildings/archetypes";

const scratch = new Object3D();
const tint = new Color();
const none = () => null;

/** A stand-in for the city's building record: enough for the palettes, which are seeded by its path. */
function stub(h: HouseSpot): Building {
  return {
    id: h.key,
    kind: "building",
    position: [h.x, 0, h.z],
    rotationY: h.yaw,
    size: [h.w, h.h, h.d],
    colorIndex: Math.floor(h.tint * 8) % 8,
    tier: 2,
    districtId: "land",
    plan: { path: h.key },
  } as unknown as Building;
}

const CITY_ATTRIBUTES: readonly (readonly [string, number])[] = [
  [ACCENT_ATTRIBUTE, 3],
  [ROOF_ATTRIBUTE, 3],
  [GLASS_ATTRIBUTE, 3],
  [SURFACES_ATTRIBUTE, 2],
];

function ModelInstances({
  model,
  spots,
  sample,
  atmosphere,
}: {
  model: ModelKey;
  spots: readonly HouseSpot[];
  sample: (x: number, z: number) => number;
  atmosphere: SceneAtmosphere;
}) {
  const { textureSize, anisotropy } = useQuality();
  const ref = useRef<InstancedMesh>(null);
  const paints = useMemo(() => {
    return spots.map((h) => {
      const b = stub(h);
      const settlement = settlementPaint(model, b);
      const city = !settlement && MATERIALS_PALETTE ? cityPaint(model, b) : null;
      return { b, settlement, city };
    });
  }, [spots, model]);
  const painted = paints.length > 0 && paints[0].settlement !== null;
  const cityPainted = paints.length > 0 && paints[0].city !== null;

  const geometry = useMemo(() => {
    const shared = archetypeGeometry(model);
    if (!painted && !cityPainted) return shared;
    const own: BufferGeometry = shared.clone();
    for (const [name, size] of cityPainted ? CITY_ATTRIBUTES : ([[ACCENT_ATTRIBUTE, 3]] as const)) {
      own.setAttribute(name, new InstancedBufferAttribute(new Float32Array(Math.max(1, spots.length) * size), size));
    }
    return own;
  }, [model, painted, cityPainted, spots.length]);
  useEffect(() => () => {
    if (painted || cityPainted) geometry.dispose();
  }, [geometry, painted, cityPainted]);

  // The same parameters the city's own buildings use, so the compiled programs are shared.
  const material = useMemo(
    () =>
      cityPainted
        ? cityPaintMaterial({ flatShading: true, roughness: 0.82, metalness: 0 }, { textureSize, anisotropy, surfaceAttribute: true })
        : painted
          ? settlementMaterial({ flatShading: true, roughness: 0.84, metalness: 0 }, { textureSize, anisotropy, surfaceAttribute: true })
          : buildingDetailMaterial({ flatShading: true, roughness: 0.82, metalness: 0 }, { textureSize, anisotropy, surfaceAttribute: true }),
    [painted, cityPainted, textureSize, anisotropy],
  );
  useEffect(() => () => material.dispose(), [material]);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const accent = geometry.getAttribute(ACCENT_ATTRIBUTE) as InstancedBufferAttribute | undefined;
    const roof = geometry.getAttribute(ROOF_ATTRIBUTE) as InstancedBufferAttribute | undefined;
    const glass = geometry.getAttribute(GLASS_ATTRIBUTE) as InstancedBufferAttribute | undefined;
    const surfaces = geometry.getAttribute(SURFACES_ATTRIBUTE) as InstancedBufferAttribute | undefined;
    const desat = atmosphere.desaturation;
    spots.forEach((h, i) => {
      scratch.position.set(h.x, sample(h.x, h.z) - 0.05, h.z);
      scratch.rotation.set(0, h.yaw, 0);
      scratch.scale.set(h.w, homeHeight(h), h.d);
      scratch.updateMatrix();
      mesh.setMatrixAt(i, scratch.matrix);
      const p = paints[i];
      const wall = p.city ? weather(p.city.wall, desat) : desaturate(p.settlement?.wall ?? buildingColor(p.b.colorIndex), desat);
      tint.set(stateTint(wall, false, false));
      // A little hue and value drift inside the wall's own colour, like the city's.
      tint.offsetHSL((h.tint - 0.5) * 0.02, ((h.tint * 7) % 1 - 0.5) * 0.05, ((h.tint * 13) % 1 - 0.5) * 0.07);
      mesh.setColorAt(i, tint);
      if (accent && p.settlement) {
        tint.set(desaturate(p.settlement.accent, desat));
        accent.setXYZ(i, tint.r, tint.g, tint.b);
      } else if (accent && p.city) {
        tint.set(weather(p.city.accent, desat));
        accent.setXYZ(i, tint.r, tint.g, tint.b);
      }
      if (p.city && roof && glass && surfaces) {
        tint.set(weather(p.city.roof, desat));
        roof.setXYZ(i, tint.r, tint.g, tint.b);
        tint.set(weather(p.city.glass, desat));
        glass.setXYZ(i, tint.r, tint.g, tint.b);
        surfaces.setXY(i, p.city.wallSurface, p.city.roofSurface);
      }
    });
    mesh.count = spots.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    for (const a of [accent, roof, glass, surfaces]) if (a) a.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [spots, sample, paints, geometry, material, atmosphere.desaturation]);

  if (spots.length === 0) return null;
  return (
    <instancedMesh
      key={`${spots.length}:${geometry.uuid}:${material.uuid}`}
      ref={ref}
      args={[geometry, material, spots.length]}
      receiveShadow
      frustumCulled={false}
      raycast={none}
    />
  );
}

/** Warm lamplight, some paler, a few the blue of a screen: the city's night tones, by window. */
function nightTone(tone: number): [number, number, number] {
  if (tone < 0.58) return [1, 0.9, 0.72];
  if (tone < 0.84) return [1, 1.08, 1.32];
  return [0.8, 1.1, 1.6];
}

function windowMaterial(): MeshStandardMaterial {
  const material = new MeshStandardMaterial({ color: WINDOW_COLOR, emissive: WINDOW_COLOR, roughness: 0.4, metalness: 0, toneMapped: false });
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <emissivemap_fragment>",
      "#include <emissivemap_fragment>\n#ifdef USE_COLOR\ntotalEmissiveRadiance *= vColor.rgb;\n#endif",
    );
  };
  // The city's lit-window program, shared.
  material.customProgramCacheKey = () => "lit-window";
  return material;
}

function HomeLights({ houses, sample }: { houses: readonly HouseSpot[]; sample: (x: number, z: number) => number }) {
  const ref = useRef<InstancedMesh>(null);
  const windows = useMemo(() => planHomeWindows(houses), [houses]);
  const geometry = useMemo(() => windowPanelGeometry(), []);
  const material = useMemo(() => windowMaterial(), []);
  useEffect(() => () => material.dispose(), [material]);
  const tinted = useRef(-1);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    windows.forEach((w, i) => {
      const h = houses[w.house];
      const H = homeHeight(h);
      const cos = Math.cos(h.yaw);
      const sin = Math.sin(h.yaw);
      const lx = w.ox * h.w;
      const lz = w.oz * h.d;
      scratch.position.set(h.x + lx * cos + lz * sin, sample(h.x, h.z) - 0.05 + w.oy * H, h.z - lx * sin + lz * cos);
      scratch.rotation.set(0, h.yaw + w.panelYaw, 0);
      scratch.scale.set(w.uw * (w.alongX ? h.w : h.d), w.uh * H, 1);
      scratch.updateMatrix();
      mesh.setMatrixAt(i, scratch.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    tinted.current = -1;
  }, [windows, houses, sample]);

  // The hour decides how many are lit, how bright, and at night which colour.
  useSkyFrame((atmosphere) => {
    const mesh = ref.current;
    if (!mesh) return;
    mesh.count = litHomeWindows(windows, atmosphere.litWindowShare);
    (mesh.material as MeshStandardMaterial).emissiveIntensity = windowEmissive(atmosphere);
    const night = Math.round(atmosphere.nightness * 40) / 40;
    if (night === tinted.current) return;
    tinted.current = night;
    for (let i = 0; i < windows.length; i++) {
      const [r, g, b] = nightTone(windows[i].tone);
      tint.setRGB(1 + (r - 1) * night, 1 + (g - 1) * night, 1 + (b - 1) * night);
      mesh.setColorAt(i, tint);
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, windows);

  if (windows.length === 0) return null;
  return <instancedMesh ref={ref} args={[geometry, material, windows.length]} frustumCulled={false} raycast={none} />;
}

export default function Homes({
  plan,
  sample,
  atmosphere,
  maxHouses,
}: {
  plan: LandscapePlan;
  sample: (x: number, z: number) => number;
  atmosphere: SceneAtmosphere;
  /** The low tier draws fewer. */
  maxHouses?: number;
}) {
  const houses = useMemo(() => {
    if (!maxHouses || plan.houses.length <= maxHouses) return plan.houses;
    const keep = maxHouses / plan.houses.length;
    return plan.houses.filter((_, i) => (i * 0.6180339887) % 1 < keep);
  }, [plan, maxHouses]);
  const byModel = useMemo(() => {
    const map = new Map<ModelKey, HouseSpot[]>();
    for (const h of houses) {
      const list = map.get(h.model);
      if (list) list.push(h);
      else map.set(h.model, [h]);
    }
    return [...map.entries()];
  }, [houses]);
  return (
    <group>
      {byModel.map(([model, spots]) => (
        <ModelInstances key={model} model={model} spots={spots} sample={sample} atmosphere={atmosphere} />
      ))}
      <HomeLights houses={houses} sample={sample} />
    </group>
  );
}
