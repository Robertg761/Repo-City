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

import {
  Component,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { CameraControls } from "@react-three/drei";
import { NeutralToneMapping, PCFShadowMap, getConsoleFunction, setConsoleFunction } from "three";
import { useCityStore } from "@/store/useCityStore";
import type { CityModel } from "@/types/city";
import City from "@/components/city/City";
import CameraRig, { CONTROLS_FEEL } from "@/components/city/CameraRig";
import { REFERENCE_ASPECT, maxCameraDistance } from "@/components/city/entities";
import Environment from "@/components/city/Environment";
import Lighting from "@/components/city/Lighting";
import Terrain, { StagePlate } from "@/components/city/Terrain";
import { atmosphere } from "@/components/city/palette";
import { cameraFar } from "@/components/city/scale";
import { STAGE_AMBIENCE, SkyProvider } from "@/components/city/sky";
import PerfOverlay from "@/components/city/perf/PerfOverlay";
import { stepDownAfterContextLoss, useQuality } from "@/components/city/quality";

/** Roughly 47 degrees above the horizon, per PLAN.md section 5. */
const DEFAULT_CAMERA_POSITION: [number, number, number] = [30, 46, 30];

const EMPTY_SIZE = 120;

/**
 * A clear afternoon for the empty stage, before any repository is analysed:
 * the light of a healthy, active city (`ambienceFor` in the generator), so
 * the lawn is the same fresh green a loaded city sits on and a city arriving
 * does not change the colour of the ground under it. The stage used to
 * borrow the light of a struggling repository -- saturation 0.6, and the
 * overcast fill of fog 0.3 -- which drained the grass to a grey-green and
 * read as a pale veil over the whole frame.
 */
const EMPTY_ATMOSPHERE = atmosphere(STAGE_AMBIENCE, false);

/**
 * R3F 9 still builds its frame clock from `THREE.Clock`, which three r183
 * deprecated, so every visit opened with a deprecation warning in the
 * console that nothing in this app can act on. three routes its own logging
 * through one replaceable function; this passes everything through except
 * that one line.
 */
const CLOCK_DEPRECATION = "THREE.Clock: This module has been deprecated";
if (typeof window !== "undefined") {
  const previous = getConsoleFunction();
  setConsoleFunction((type: "log" | "warn" | "error", message: string, ...params: unknown[]) => {
    if (type === "warn" && message.startsWith(CLOCK_DEPRECATION)) {
      return;
    }
    if (previous) previous(type, message, ...params);
    else console[type](message, ...params);
  });
}

/** The dev scenes: the fixture city, and one settlement at each end of the scale. */
type DevScene = "city" | "metropolis" | "village" | "town";
const DEV_SCENES: readonly string[] = ["city", "metropolis", "village", "town"];

/**
 * The dev fixture cities (`?dev=city`, and `?dev=metropolis`, `?dev=village`
 * or `?dev=town` for the settlements in `fixtures/dev.settlements.ts`). They
 * exist so the renderer can be built and screenshotted before the generator
 * lands, and so a broken generator is immediately distinguishable from a
 * broken renderer. Never in production.
 */
function useDevCity(hasRealCity: boolean): CityModel | null {
  const [devCity, setDevCity] = useState<CityModel | null>(null);

  useEffect(() => {
    if (process.env.NODE_ENV === "production" || hasRealCity || devCity) return;
    const scene = new URLSearchParams(window.location.search).get("dev");
    if (!scene || !DEV_SCENES.includes(scene)) return;

    let cancelled = false;
    const load =
      scene === "city"
        ? import("@/fixtures/dev.city").then((module) => module.devCity)
        : import("@/fixtures/dev.settlements").then((module) =>
            module.devSettlements[scene as Exclude<DevScene, "city">](),
          );
    void load.then((model) => {
      if (!cancelled) setDevCity(model);
    });
    return () => {
      cancelled = true;
    };
  }, [hasRealCity, devCity]);

  return devCity;
}

/**
 * Keeps the far plane past everything a settlement can put in frame: the
 * landscape and the far side of the sky dome at the furthest the camera may
 * pull back (PLAN.md 76.5). Today's 2,000 for every city on a desktop; a
 * metropolis framed from a phone needs half as much again.
 */
function FarPlane({ size, aspect }: { size: number; aspect: number }) {
  const far = cameraFar(size, maxCameraDistance(size, aspect));
  // From the frame loop, as `Film` sets the exposure: the camera belongs to
  // R3F, and the comparison is all it costs on every other frame.
  useFrame(({ camera }) => {
    if (camera.far === far) return;
    camera.far = far;
    camera.updateProjectionMatrix();
  });
  return null;
}

/**
 * Development-only: `__repoCity.controls` is the orbit controller, so a
 * scripted screenshot can frame an exact view (`setLookAt`, `dollyTo`).
 */
function ControlsDebugHandle() {
  const controls = useThree((state) => state.controls);
  useEffect(() => {
    if (process.env.NODE_ENV === "production" || !controls) return;
    const handle = (window as unknown as { __repoCity?: { controls?: unknown } }).__repoCity;
    if (handle) handle.controls = controls;
  }, [controls]);
  return null;
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

/**
 * The empty stage. The time of day reaches it as it reaches a city: the sky,
 * the light and the backdrop follow the viewer's setting (`sky.tsx`), so the
 * control works before anything has been surveyed. The backdrop and the fog,
 * pulled back with the camera on a narrow screen, are `Environment`'s.
 */
function EmptyStage({ aspect }: { aspect: number }) {
  return (
    <>
      <Lighting size={EMPTY_SIZE} />
      <Terrain size={EMPTY_SIZE} atmosphere={EMPTY_ATMOSPHERE} aspect={aspect} />
      <StagePlate size={EMPTY_SIZE} atmosphere={EMPTY_ATMOSPHERE} />
    </>
  );
}

/**
 * Everything inside the canvas that follows the model.
 *
 * THE CITY ARRIVES DEFERRED. Mounting a metropolis builds thousands of
 * objects and a few hundred geometries in one React render, and done at once
 * that was the hitch on arrival: 300 ms on a desktop, over two seconds on a
 * laptop CPU at a quarter of the speed. `useDeferredValue` hands the new model
 * to a background render inside the canvas's own (concurrent) React root,
 * which yields to the browser every few milliseconds, so the old scene keeps
 * drawing while the new one is built and only the commit and the shader
 * compile are left for one frame. It has to be here, inside the canvas: the
 * canvas passes its children on from a layout effect, and anything deferred
 * outside it would arrive as one synchronous update all the same.
 */
function Scene({ city: latest, aspect }: { city: CityModel | null; aspect: number }) {
  const city = useDeferredValue(latest);

  // The sky, the exposure and the quality probe outlive any one model, so
  // they are mounted here rather than inside the keyed `<City>`, and the
  // atmosphere they need is resolved here too. `City` resolves the same one
  // from the same model: it is a pure function of it (`palette.ts`).
  const scene = useMemo(
    () => (city ? atmosphere(city.ambience, city.repository.archived) : EMPTY_ATMOSPHERE),
    [city],
  );

  const ambience = city?.ambience ?? STAGE_AMBIENCE;
  const archived = city?.repository.archived ?? false;

  return (
    <>
      {/* The live time of day for everything in the scene (`sky.tsx`). */}
      <SkyProvider ambience={ambience} archived={archived}>
        {/* Keyed on the seed: a different repository revision is a different
            city, and gets a fresh reveal. The Canvas itself never remounts, so
            the WebGL context survives. */}
        {city ? (
          <City key={city.seed} city={city} aspect={aspect} />
        ) : (
          <EmptyStage aspect={aspect} />
        )}

        <Environment
          city={city}
          atmosphere={scene}
          size={city?.bounds.size ?? EMPTY_SIZE}
          aspect={aspect}
        />
      </SkyProvider>
      <FarPlane size={city?.bounds.size ?? EMPTY_SIZE} aspect={aspect} />
      <ControlsDebugHandle />

      <CameraRig city={city} aspect={aspect} />

      <CameraControls
        makeDefault
        // Mouse and touch bindings, pan and zoom behaviour, damping.
        {...CONTROLS_FEEL}
        minDistance={10}
        // Far enough to frame the whole city, no further (PLAN.md section 5).
        maxDistance={maxCameraDistance(city?.bounds.size ?? EMPTY_SIZE, aspect)}
        // Stop just short of the horizon so the camera can never slip under
        // the ground plane (PLAN.md section 5).
        maxPolarAngle={Math.PI * 0.48}
        minPolarAngle={0.15}
      />
    </>
  );
}

function Viewport({ onLost }: { onLost: (canvas: HTMLCanvasElement) => void }) {
  const storeCity = useCityStore((s) => s.city);
  const actions = useCityStore((s) => s.actions);
  const devCity = useDevCity(storeCity !== null);
  const city = storeCity ?? devCity;
  const aspect = useViewportAspect();
  // The canvas is created at the tier's pixel ratio, and follows it. R3F
  // re-applies this prop whenever the canvas re-renders, so it has to be the
  // tier's own cap: a fixed `[1, 2]` here quietly put a stepped-down machine
  // back on twice the pixels each time a new city arrived.
  const { maxDpr } = useQuality();

  return (
    <Canvas
      // `shadows="soft"` asks for `PCFSoftShadowMap`, which three r186 removed:
      // it falls back to `PCFShadowMap` and warns on every load. Ask for the
      // supported filter directly; the softness now comes from the light's own
      // radius and bias in `Lighting.tsx` (PLAN.md section 39).
      shadows={{ type: PCFShadowMap }}
      dpr={[1, maxDpr]}
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
      <Scene city={city} aspect={aspect} />
      <ContextWatch onLost={onLost} />

      {/* Dev only, `?perf=1` (PLAN.md 76.13). Renders nothing otherwise. */}
      <PerfOverlay />
    </Canvas>
  );
}

// ---------------------------------------------------------------------------
// When the graphics are not there
// ---------------------------------------------------------------------------

type GraphicsState = "ok" | "lost" | "stuck" | "unavailable" | "failed";

/** How long a lost context may take to come back before the page offers a reload. */
const RESTORE_WAIT_MS = 8000;

/**
 * three draws with WebGL 2 and nothing else. Asked once, with a throwaway
 * canvas whose context is released straight away: browsers cap how many a
 * page may hold.
 */
function webglAvailable(): boolean {
  try {
    const probe = document.createElement("canvas");
    const gl = probe.getContext("webgl2");
    if (!gl) return false;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}

/**
 * A lost WebGL context -- the GPU reset, or a low-memory device reclaiming it
 * -- stops the canvas mid-visit. `ContextWatch` reports it with the canvas
 * that lost it; `CityCanvas` takes it from there.
 *
 * The canvas is let go at once rather than restored in place. three can
 * restore its own state on the same canvas, but every object made before the
 * loss keeps a disposer bound to the dead context, so the next city, or the
 * next tier, released them against the live one and filled the console with
 * WebGL errors. Unmounted while the context is gone, everything is released
 * as a no-op, and the city comes back on a fresh canvas.
 */
function ContextWatch({ onLost }: { onLost: (canvas: HTMLCanvasElement) => void }) {
  const gl = useThree((state) => state.gl);

  useEffect(() => {
    const canvas = gl.domElement;
    const lost = () => {
      // R3F ends an unmount by forcing the context lost through its
      // extension, and on a context that is already gone three can only warn
      // that the extension is missing. There is nothing left to lose.
      gl.forceContextLoss = () => {};
      onLost(canvas);
    };
    canvas.addEventListener("webglcontextlost", lost);
    return () => canvas.removeEventListener("webglcontextlost", lost);
  }, [gl, onLost]);

  return null;
}

const NOTICE_COPY: Record<
  Exclude<GraphicsState, "ok">,
  { title: string; body: string; reload: boolean }
> = {
  lost: {
    title: "Graphics reset",
    body: "The browser paused the 3D view to free graphics memory. Bringing the city back…",
    reload: false,
  },
  stuck: {
    title: "Graphics reset",
    body: "The 3D view did not come back on its own. Reloading the page will restore it.",
    reload: true,
  },
  unavailable: {
    title: "This browser can’t draw the city",
    body: "Repo City needs WebGL 2, which is switched off or not supported here. Turning on hardware acceleration, or opening the page in a current Chrome, Edge, Firefox or Safari, will bring it up.",
    reload: false,
  },
  failed: {
    title: "The 3D view couldn’t start",
    body: "Something stopped the graphics from starting. Reloading the page usually fixes it.",
    reload: true,
  },
};

function GraphicsNotice({ state }: { state: Exclude<GraphicsState, "ok"> }) {
  const copy = NOTICE_COPY[state];
  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center px-4">
      <div
        role="alert"
        className="glass animate-fade-in pointer-events-auto w-full max-w-[24rem] p-4 text-center"
      >
        <p className="text-sm font-medium text-white/90">{copy.title}</p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-white/70">{copy.body}</p>
        {copy.reload ? (
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="hud-button mt-3"
          >
            Reload
          </button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Catches the canvas failing to start (no context could be created) and any
 * error thrown from inside the scene, and shows a notice instead of the blank
 * page an uncaught render error leaves behind. The HUD is outside this
 * boundary and stays up.
 */
class CanvasBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error("Repo City: the 3D view stopped", error);
  }

  render() {
    return this.state.failed ? <GraphicsNotice state="failed" /> : this.props.children;
  }
}

/** A context lost this many times in one visit is not coming back by itself. */
const MAX_LOSSES = 3;

/**
 * Recovering from a lost context: the canvas is unmounted while the context is
 * gone (`ContextWatch`), and once the browser hands the old canvas its context
 * back -- the signal that the GPU is usable again -- a fresh canvas is mounted
 * a quality tier lower, which asks the GPU for less memory. The store still
 * holds the city, so it simply grows again. If the context has not come back
 * after a few seconds, or keeps being lost, the notice offers a reload.
 */
function useContextRecovery() {
  const [graphics, setGraphics] = useState<GraphicsState>("ok");
  const [generation, setGeneration] = useState(0);
  const losses = useRef(0);
  const pending = useRef<() => void>(() => {});

  useEffect(() => () => pending.current(), []);

  const onLost = useCallback((canvas: HTMLCanvasElement) => {
    pending.current();
    losses.current += 1;
    if (losses.current >= MAX_LOSSES) {
      setGraphics("stuck");
      return;
    }
    setGraphics("lost");
    const restored = () => {
      pending.current();
      // Let the old context go now that it is back: it holds nothing.
      canvas.getContext("webgl2")?.getExtension("WEBGL_lose_context")?.loseContext();
      stepDownAfterContextLoss();
      setGeneration((n) => n + 1);
      setGraphics("ok");
    };
    const timer = window.setTimeout(() => {
      pending.current();
      setGraphics("stuck");
    }, RESTORE_WAIT_MS);
    canvas.addEventListener("webglcontextrestored", restored);
    pending.current = () => {
      window.clearTimeout(timer);
      canvas.removeEventListener("webglcontextrestored", restored);
      pending.current = () => {};
    };
  }, []);

  return { graphics, generation, onLost };
}

export default function CityCanvas() {
  // Client only (`next/dynamic` with `ssr: false`), so this runs in a browser.
  const [webgl] = useState(webglAvailable);
  const { graphics, generation, onLost } = useContextRecovery();

  if (!webgl) return <GraphicsNotice state="unavailable" />;
  return (
    <>
      {graphics === "ok" && (
        <CanvasBoundary key={generation}>
          <Viewport onLost={onLost} />
        </CanvasBoundary>
      )}
      {graphics !== "ok" && <GraphicsNotice state={graphics} />}
    </>
  );
}
