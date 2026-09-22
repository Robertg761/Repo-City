"use client";

/**
 * The one persistent 3D viewport (PLAN.md section 0.2). Everything else in the
 * application overlays this canvas; nothing ever replaces it.
 *
 * This file owns the canvas, the camera and its limits (section 5), and the
 * choice of which `CityModel` to render. Everything inside the scene lives in
 * `components/city/*` and is driven purely by that model (section 34).
 *
 * Loaded through `next/dynamic` with `ssr: false` from `app/page.tsx`; three.js
 * must never run during server rendering.
 */

import { useEffect, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { CameraControls } from "@react-three/drei";
import { NeutralToneMapping, PCFShadowMap } from "three";
import { useCityStore } from "@/store/useCityStore";
import type { CityModel } from "@/types/city";
import City from "@/components/city/City";
import CameraRig from "@/components/city/CameraRig";
import { REFERENCE_ASPECT, maxCameraDistance } from "@/components/city/entities";
import Environment from "@/components/city/Environment";
import Lighting from "@/components/city/Lighting";
import Terrain from "@/components/city/Terrain";
import { atmosphere } from "@/components/city/palette";

/** Roughly 47 degrees above the horizon, per PLAN.md section 5. */
const DEFAULT_CAMERA_POSITION: [number, number, number] = [30, 46, 30];

const EMPTY_SIZE = 120;

/** Neutral daylight for the empty stage, before any repository is analysed. */
const EMPTY_ATMOSPHERE = atmosphere(
  {
    warmth: 0.55,
    saturation: 0.6,
    fog: 0.3,
    trafficDensity: 0,
    pedestrianDensity: 0,
    litWindowShare: 0,
  },
  false,
);

/**
 * The dev fixture city (`?dev=city`). It exists so the renderer can be built
 * and screenshotted before the generator lands, and so a broken generator is
 * immediately distinguishable from a broken renderer. Never in production.
 */
function useDevCity(hasRealCity: boolean): CityModel | null {
  const [devCity, setDevCity] = useState<CityModel | null>(null);

  useEffect(() => {
    if (process.env.NODE_ENV === "production" || hasRealCity || devCity) return;
    if (new URLSearchParams(window.location.search).get("dev") !== "city") return;

    let cancelled = false;
    void import("@/fixtures/dev.city").then((module) => {
      if (!cancelled) setDevCity(module.devCity);
    });
    return () => {
      cancelled = true;
    };
  }, [hasRealCity, devCity]);

  return devCity;
}

/**
 * Canvas width over height, kept current across resizes and rotations. A
 * phone held upright frames the city from further back than a desktop window
 * does, because it is the horizontal field of view that runs out first
 * (PLAN.md section 5).
 */
function useViewportAspect(): number {
  const [aspect, setAspect] = useState(REFERENCE_ASPECT);

  useEffect(() => {
    const measure = () => {
      const { innerWidth: w, innerHeight: h } = window;
      if (w > 0 && h > 0) setAspect(w / h);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  return aspect;
}

function EmptyStage() {
  return (
    <>
      <color attach="background" args={[EMPTY_ATMOSPHERE.background]} />
      <fog
        attach="fog"
        args={[
          EMPTY_ATMOSPHERE.background,
          EMPTY_SIZE * EMPTY_ATMOSPHERE.fogNearFactor,
          EMPTY_SIZE * EMPTY_ATMOSPHERE.fogFarFactor,
        ]}
      />
      <Lighting atmosphere={EMPTY_ATMOSPHERE} size={EMPTY_SIZE} />
      <Terrain size={EMPTY_SIZE} atmosphere={EMPTY_ATMOSPHERE} />
    </>
  );
}

export default function CityCanvas() {
  const storeCity = useCityStore((s) => s.city);
  const actions = useCityStore((s) => s.actions);
  const devCity = useDevCity(storeCity !== null);
  const city = storeCity ?? devCity;
  const aspect = useViewportAspect();

  // The sky, the exposure and the quality probe outlive any one model, so
  // they are mounted here rather than inside the keyed `<City>`, and the
  // atmosphere they need is resolved here too. `City` resolves the same one
  // from the same model: it is a pure function of it (`palette.ts`).
  const scene = useMemo(
    () => (city ? atmosphere(city.ambience, city.repository.archived) : EMPTY_ATMOSPHERE),
    [city],
  );

  return (
    <Canvas
      // `shadows="soft"` asks for `PCFSoftShadowMap`, which three r186 removed:
      // it falls back to `PCFShadowMap` and warns on every load. Ask for the
      // supported filter directly; the softness now comes from the light's own
      // radius and bias in `Lighting.tsx` (PLAN.md section 39).
      shadows={{ type: PCFShadowMap }}
      dpr={[1, 2]}
      // The near plane is as far out as the closest camera allows (the orbit
      // stops ten units from its target). At 0.5 the depth buffer had so little
      // precision left out on the landscape that the ambient occlusion pass
      // read the flat grass as bumpy and clouded it over in soft grey patches.
      camera={{ position: DEFAULT_CAMERA_POSITION, fov: 35, near: 2, far: 2000 }}
      // Neutral from the first frame; `Environment` keeps the exposure in step
      // with the hour, and hands the tone mapping to the composer when the
      // quality tier runs one (PLAN.md section 39).
      gl={{ antialias: true, toneMapping: NeutralToneMapping }}
      // Clicking past every object is the same gesture as clicking bare
      // ground: it clears the selection (PLAN.md section 6).
      onPointerMissed={() => actions.select(null)}
      // The wrapper in `app/page.tsx` owns the sizing; R3F fills it exactly.
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
    >
      {/* Keyed on the seed: a different repository revision is a different
          city, and gets a fresh reveal. The Canvas itself never remounts, so
          the WebGL context survives. */}
      {city ? <City key={city.seed} city={city} aspect={aspect} /> : <EmptyStage />}

      <Environment city={city} atmosphere={scene} size={city?.bounds.size ?? EMPTY_SIZE} />

      <CameraRig city={city} aspect={aspect} />

      <CameraControls
        makeDefault
        minDistance={10}
        // Far enough to frame the whole city, no further (PLAN.md section 5).
        maxDistance={maxCameraDistance(city?.bounds.size ?? EMPTY_SIZE, aspect)}
        // Stop just short of the horizon so the camera can never slip under
        // the ground plane (PLAN.md section 5).
        maxPolarAngle={Math.PI * 0.48}
        minPolarAngle={0.15}
      />
    </Canvas>
  );
}
