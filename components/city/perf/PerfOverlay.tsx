"use client";

/**
 * The `?perf=1` overlay (PLAN.md 76.11 S9, measured against 76.13). Dev only.
 *
 * Mounted once inside `<Canvas>`. It draws nothing into the scene: it hangs a
 * small fixed panel on `document.body` and publishes the same numbers on
 * `window.__repoCity.perf`, where the headless scripts read them.
 *
 * WHY `info.autoReset = false`. three resets `renderer.info` at the top of
 * every `renderer.render()` call. The shadow pass runs inside that call, after
 * the reset, so with no post-processing the numbers after a frame already
 * include it. The effect composer, though, calls `render()` once per pass,
 * and each call wipes the one before: read naively, the high tier reports the
 * last full-screen quad, one call and one triangle. So the overlay turns the
 * automatic reset off, reads the totals after R3F has run every root
 * (`addAfterEffect`, which sees the frame whoever rendered it) and resets
 * them itself. The flag is restored on unmount.
 *
 * The shadow pass is also counted on its own, by wrapping this renderer's
 * `shadowMap.render`, so the shadow budget (76.5, 76.15) can be read without
 * turning shadows off.
 *
 * Frame timing uses the rAF timestamps R3F hands the after-effect: the
 * interval between frames is what a viewer sees. `cpuMs` is the main-thread
 * time from the start of R3F's frame to the end of its draw submission, which
 * says whether a slow frame is JavaScript or GPU.
 */

import { useEffect, useMemo } from "react";
import { addAfterEffect, addEffect, useThree } from "@react-three/fiber";
import { Vector2 } from "three";
import { useCityStore } from "@/store/useCityStore";
import { qualitySettings } from "../quality";
import {
  FrameWindow,
  formatPerf,
  perfEnabled,
  perfWindowMs,
  type PerfSnapshot,
} from "./stats";

/** How often the panel and the window handle are refreshed. */
const PUBLISH_MS = 250;

interface PerfHandle {
  perf?: PerfSnapshot;
  /** Empties the rolling window, so a measurement starts after the reveal. */
  perfClear?: () => void;
}

function handle(): PerfHandle | null {
  const value = (window as unknown as { __repoCity?: PerfHandle }).__repoCity;
  return value ?? null;
}

function PerfProbe() {
  // Read through `get` inside the effect: the renderer is configured here, not
  // rendered from, and React's rules forbid writing to a value a hook returned.
  const get = useThree((state) => state.get);

  useEffect(() => {
    const gl = get().gl;
    const info = gl.info;
    const shadowMap = gl.shadowMap;
    const autoReset = info.autoReset;
    info.autoReset = false;
    info.reset();

    const frames = new FrameWindow(perfWindowMs(window.location.search));
    let shadowCalls = 0;
    let shadowTriangles = 0;
    const last = { calls: 0, triangles: 0, points: 0, lines: 0, shadowCalls: 0, shadowTriangles: 0 };

    const renderShadows = shadowMap.render;
    shadowMap.render = function (lights, scene, camera) {
      const calls = info.render.calls;
      const triangles = info.render.triangles;
      renderShadows.call(this, lights, scene, camera);
      shadowCalls += info.render.calls - calls;
      shadowTriangles += info.render.triangles - triangles;
    };

    const panel = document.createElement("pre");
    panel.setAttribute("data-perf-overlay", "");
    Object.assign(panel.style, {
      position: "fixed",
      // Bottom right: the legend and the dev tools button hold the left.
      right: "8px",
      bottom: "8px",
      zIndex: "9999",
      margin: "0",
      padding: "6px 8px",
      font: "11px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace",
      color: "#e8f1ee",
      background: "rgba(12, 20, 24, 0.78)",
      borderRadius: "4px",
      pointerEvents: "none",
      whiteSpace: "pre",
    } satisfies Partial<CSSStyleDeclaration>);
    document.body.appendChild(panel);

    const target = handle();
    if (target) target.perfClear = () => frames.clear();

    // rAF does not run in a hidden tab; the gap is absence, not a frame.
    const onVisibility = () => {
      if (!document.hidden) frames.gap();
    };
    document.addEventListener("visibilitychange", onVisibility);

    const scratch = new Vector2();
    let frameStart = 0;
    let lastPublish = 0;

    const publish = (now: number) => {
      const size = gl.getDrawingBufferSize(scratch);
      const snapshot: PerfSnapshot = {
        ...frames.stats(),
        frames: frames.frames,
        ...last,
        geometries: info.memory.geometries,
        textures: info.memory.textures,
        programs: info.programs?.length ?? 0,
        quality: qualitySettings().tier,
        settlement: useCityStore.getState().city?.settlement?.tier ?? null,
        width: size.x,
        height: size.y,
        dpr: gl.getPixelRatio(),
        at: now,
      };
      panel.textContent = formatPerf(snapshot).join("\n");
      const current = handle();
      if (current) current.perf = snapshot;
    };

    const offBefore = addEffect(() => {
      frameStart = performance.now();
    });
    const offAfter = addAfterEffect((timestamp) => {
      const now = performance.now();
      frames.push(timestamp, now - frameStart);
      last.calls = info.render.calls;
      last.triangles = info.render.triangles;
      last.points = info.render.points;
      last.lines = info.render.lines;
      last.shadowCalls = shadowCalls;
      last.shadowTriangles = shadowTriangles;
      info.reset();
      shadowCalls = 0;
      shadowTriangles = 0;
      if (now - lastPublish >= PUBLISH_MS) {
        lastPublish = now;
        publish(now);
      }
    });

    return () => {
      offBefore();
      offAfter();
      document.removeEventListener("visibilitychange", onVisibility);
      shadowMap.render = renderShadows;
      info.autoReset = autoReset;
      panel.remove();
      const current = handle();
      if (current) {
        delete current.perf;
        delete current.perfClear;
      }
    };
  }, [get]);

  return null;
}

/**
 * Mount inside `<Canvas>`. Renders nothing, and does nothing at all unless
 * this is a development build and the URL carries `?perf=1`.
 */
export default function PerfOverlay() {
  const enabled = useMemo(
    () => typeof window !== "undefined" && perfEnabled(window.location.search, process.env.NODE_ENV),
    [],
  );
  if (process.env.NODE_ENV === "production") return null;
  return enabled ? <PerfProbe /> : null;
}
