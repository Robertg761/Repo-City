"use client";

/**
 * Plans the land once per city and shares it (`?land=rich`): the plan, the
 * terrain mesh and the ground's control map (`ctl.ts`). Nothing here is
 * computed while the city itself is arriving: the plan waits two frames, the
 * terrain two more, and the control map is baked a few milliseconds a frame,
 * so the land arrives as many short tasks and not one long one. Everything
 * that draws the land -- `LandTerrain`, `Landscape`, the grass, the district
 * plates -- reads this and draws nothing until its part is ready.
 *
 * The provider is always mounted by `City`; with `enabled` false it is a
 * pass-through and costs nothing.
 */

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import type { CityModel } from "@/types/city";
import { REFERENCE_ASPECT } from "../entities";
import { useQuality } from "../quality";
import { tiledSurface } from "../textures/surfaces";
import { buildTerrain, terrainPainter, type Terrain } from "./build";
import { CTL_SIZE, bakeJob, type BakeJob, type Control } from "./ctl";
import { LandGroundProvider, type LandTextures } from "./ground";
import { boxSolid, publishLand, treeColumn, type LandSolids } from "../cameraCollision";
import { homeHeight } from "./homes";
import { planLandscape, type LandscapePlan } from "./plan";

export interface Land {
  plan: LandscapePlan;
  /** The terrain mesh's data; null for the first frames while it is built. */
  terrain: Terrain | null;
}

const LandContext = createContext<Land | null>(null);

/** The plan and terrain, or null when the rich landscape is off or not planned yet. */
export function useLand(): Land | null {
  return useContext(LandContext);
}

/** Milliseconds a frame the control-map bake may take. */
const BAKE_MS = 5;
/** Frames after arrival: the plan, then the terrain. */
const PLAN_AT = 2;
const TERRAIN_AT = 4;

export default function LandProvider({
  city,
  aspect = REFERENCE_ASPECT,
  terrainColor,
  enabled,
  children,
}: {
  city: CityModel;
  aspect?: number;
  /** The hour's grass colour (`SceneAtmosphere.terrainColor`). */
  terrainColor: string;
  enabled: boolean;
  children: ReactNode;
}) {
  const { tier } = useQuality();
  if (!enabled) return <>{children}</>;
  // Only a narrow screen changes the land (the fog is pulled back with the camera), and a window being dragged
  // narrower must not replan it on every event: wide screens are all one shape, narrow ones step by a tenth.
  const shape = aspect >= REFERENCE_ASPECT ? REFERENCE_ASPECT : Math.max(0.3, Math.round(aspect * 10) / 10);
  const size = tier === "low" ? CTL_SIZE / 2 : CTL_SIZE;
  // A new city, screen shape, hour's grass or map size starts the land again, from nothing.
  return (
    <Enabled key={`${city.seed}|${shape}|${terrainColor}|${size}`} city={city} aspect={shape} terrainColor={terrainColor} size={size}>
      {children}
    </Enabled>
  );
}

function Enabled({
  city,
  aspect,
  terrainColor,
  size,
  children,
}: {
  city: CityModel;
  aspect: number;
  terrainColor: string;
  size: number;
  children: ReactNode;
}) {
  const { textureSize, anisotropy } = useQuality();
  const [plan, setPlan] = useState<LandscapePlan | null>(null);
  const [terrain, setTerrain] = useState<Terrain | null>(null);
  const [control, setControl] = useState<Control | null>(null);
  const job = useRef<BakeJob | null>(null);
  const frames = useRef(0);

  useFrame(() => {
    frames.current++;
    if (!plan) {
      if (frames.current >= PLAN_AT) setPlan(planLandscape(city, aspect));
      return;
    }
    if (!terrain) {
      if (frames.current >= TERRAIN_AT) setTerrain(buildTerrain(plan, terrainPainter(plan, terrainColor)));
      return;
    }
    if (!job.current) job.current = bakeJob(city, plan, size);
    const current = job.current;
    if (!current.done && current.run(BAKE_MS)) setControl(current.control);
  });

  // The baked ground the land is textured from: colour of the meadow, and the height of lawn, meadow and soil.
  const textures = useMemo<LandTextures>(
    () => ({
      meadow: tiledSurface("meadow", textureSize, 1, anisotropy),
      lawnRelief: tiledSurface("lawn", textureSize, 1, anisotropy, true),
      meadowRelief: tiledSurface("meadow", textureSize, 1, anisotropy, true),
      soilRelief: tiledSurface("soil", textureSize, 1, anisotropy, true),
    }),
    [textureSize, anisotropy],
  );
  useEffect(() => () => Object.values(textures).forEach((t) => t.dispose()), [textures]);
  useEffect(() => () => terrain?.geometry.dispose(), [terrain]);
  const land = useMemo(() => (plan ? { plan, terrain } : null), [plan, terrain]);

  // The camera keeps out of the landscape's houses, towers and trees, and above its hills.
  const owner = useRef({});
  useEffect(() => {
    if (!plan) return;
    publishLand(owner.current, landSolids(plan));
    const mine = owner.current;
    return () => publishLand(mine, null);
  }, [plan]);

  return (
    <LandContext.Provider value={land}>
      <LandGroundProvider control={control} textures={textures}>
        {children}
      </LandGroundProvider>
    </LandContext.Provider>
  );
}

/** The landscape as the camera collides with it (`cameraCollision.ts`). */
function landSolids(plan: LandscapePlan): LandSolids {
  const solids = [];
  for (const h of plan.houses) {
    const base = plan.height(h.x, h.z);
    solids.push(
      boxSolid({ id: h.key, x: h.x, z: h.z, cos: Math.cos(h.yaw), sin: Math.sin(h.yaw), hw: h.w / 2, hd: h.d / 2, top: base + homeHeight(h) }),
    );
  }
  for (const t of plan.towers) {
    solids.push(boxSolid({ id: "tower", x: t.x, z: t.z, cos: 1, sin: 0, hw: t.w / 2, hd: t.d / 2, top: plan.height(t.x, t.z) + t.h }));
  }
  for (const t of [...plan.trees, ...plan.verge.trees]) solids.push(treeColumn(t.x, t.z, t.scale, t.kind, plan.height(t.x, t.z)));
  return { solids, ground: plan.height };
}
