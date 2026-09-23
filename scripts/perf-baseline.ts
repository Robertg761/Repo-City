/**
 * Headless performance run (PLAN.md 63, 76.13): loads each scenario in
 * headless Chrome, surveys it, and measures what a viewer would feel.
 *
 *   pnpm dev --port 3149 &
 *   node scripts/perf-baseline.ts [baseUrl] [outDir]
 *
 * For every scenario it reports:
 *
 *   - `landing`: navigation to the first WebGL frame of the empty stage;
 *   - `city`: the survey starting to the first frame with the city in it;
 *   - `tti`: the survey starting to the first second with no main-thread task
 *     of 100 ms or more (a click answered within a tenth of a second);
 *   - `tbt` and `maxTask`: blocking time and the longest task over the reveal;
 *   - the steady frame rate after the reveal and the quality probe: the
 *     median fps, the p95 frame time, draw calls and the tier and pixel ratio
 *     the app settled on, with every tier change on the way;
 *   - every console error and warning, WebGL's included.
 *
 * The timing is taken by a script injected before the page's own
 * (`INSTRUMENT`): rAF intervals, WebGL draw calls counted per frame, and the
 * Long Tasks API. It needs nothing from the app, so it also runs against a
 * production build (`PROD=1`), where the fixtures and the dev handle do not
 * exist and the survey is typed into the repository box instead.
 *
 * Knobs, all environment variables:
 *
 *   PROFILE  desktop | laptop | xe | phone | floor (viewport presets, below)
 *   ANGLE    swiftshader | vulkan | gl; vulkan draws on the real GPU
 *   CPU      CPU throttling rate (`Emulation.setCPUThrottlingRate`), 1 = off
 *   TIME     auto | morning | afternoon | evening | night (`?time=`)
 *   QUALITY  auto (the probe decides) | high | medium | low (`?quality=`)
 *   ONLY     comma-separated scenario names to run
 *   UNCAP=1  lifts vsync to show headroom
 *   MEASURE_MS, SETTLE_MS, TAG, CHROME
 *
 * Swiftshader renders on the CPU; its frame rates are a worst-case floor and
 * compare only with each other. Draw calls do not depend on the renderer.
 *
 * The Chrome profile lives in `outDir` and is deleted on exit, whatever
 * happens.
 */

import { spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const BASE = process.argv[2] ?? "http://localhost:3149";
const OUT = process.argv[3] ?? "/tmp/claude-1000/s9-perf";
const CHROME = process.env.CHROME ?? "/usr/bin/google-chrome-stable";
/** How long the steady frame rate is watched. */
const MEASURE_MS = Number(process.env.MEASURE_MS ?? 10_000);
/** From the city's first frame to the steady measurement: reveal plus probe. */
const SETTLE_MS = Number(process.env.SETTLE_MS ?? 11_000);
const PROD = Boolean(process.env.PROD);

interface Profile {
  width: number;
  height: number;
  dpr: number;
  mobile: boolean;
  angle: string;
  cpu: number;
}

/**
 * `desktop` is the gate's 1080p window. `laptop` is a Retina MacBook Air or a
 * high-DPI Iris Xe ultrabook: 1440 by 900 at twice the pixels, with a slower
 * CPU. `xe` stands in for the same laptop on an integrated GPU: there is no
 * way to slow a GPU down from Chrome, so it draws five times the laptop's
 * pixels instead (Iris Xe scores about a fifth of an RTX 3060 in 3DMark), which
 * loads the fill-bound passes -- the composer, the shadows, the pixel ratio --
 * in proportion. Its absolute frame times are a proxy; its trend is real.
 * `phone` is a 390 by 844 phone at DPR 3. `floor` is the laptop on a software
 * renderer, the worst a viewer can bring.
 */
const PROFILES: Record<string, Profile> = {
  desktop: { width: 1920, height: 1080, dpr: 1, mobile: false, angle: "vulkan", cpu: 1 },
  laptop: { width: 1440, height: 900, dpr: 2, mobile: false, angle: "vulkan", cpu: 4 },
  xe: { width: 3220, height: 2012, dpr: 2, mobile: false, angle: "vulkan", cpu: 4 },
  phone: { width: 390, height: 844, dpr: 3, mobile: true, angle: "vulkan", cpu: 4 },
  floor: { width: 1440, height: 900, dpr: 2, mobile: false, angle: "swiftshader", cpu: 6 },
};
const PROFILE_NAME = process.env.PROFILE ?? "desktop";
const preset = PROFILES[PROFILE_NAME];
if (!preset) throw new Error(`Unknown PROFILE ${PROFILE_NAME}`);
const profile: Profile = {
  ...preset,
  angle: process.env.ANGLE ?? preset.angle,
  cpu: Number(process.env.CPU ?? preset.cpu),
};

const QUALITY = process.env.QUALITY ?? "auto";
const TIME = process.env.TIME ?? "auto";

interface Scenario {
  name: string;
  /** What is typed into the repository box. */
  input: string;
  query: string;
  /** Fixture inputs exist only in development. */
  devOnly?: boolean;
}

const SCENARIOS: Scenario[] = [
  { name: "sample", input: "fixture", query: "", devOnly: true },
  { name: "village", input: "sindresorhus/p-limit", query: "" },
  { name: "metropolis", input: "backlog", query: "", devOnly: true },
  { name: "react", input: "facebook/react", query: "" },
  { name: "stress", input: "stress", query: "", devOnly: true },
].filter(
  (s) =>
    (!process.env.ONLY || process.env.ONLY.split(",").includes(s.name)) && !(PROD && s.devOnly),
);

/**
 * Runs in the page before any of its own scripts. Counts WebGL draw calls
 * per animation frame, records every frame interval and every long task, and
 * notes lost contexts. It touches nothing the app reads.
 */
const INSTRUMENT = `(() => {
  const log = (window.__lowend = { frames: [], longtasks: [], lost: 0, restored: 0, draws: 0 });
  const wrap = (proto) => {
    if (!proto) return;
    for (const name of ["drawElements", "drawArrays", "drawElementsInstanced", "drawArraysInstanced", "drawRangeElements"]) {
      const fn = proto[name];
      if (typeof fn !== "function") continue;
      proto[name] = function (...args) { log.draws++; return fn.apply(this, args); };
    }
  };
  wrap(window.WebGL2RenderingContext && WebGL2RenderingContext.prototype);
  wrap(window.WebGLRenderingContext && WebGLRenderingContext.prototype);
  let last = 0;
  const tick = (t) => {
    if (log.draws > 0) {
      log.frames.push([t, last ? t - last : 0, log.draws]);
      if (log.frames.length > 30000) log.frames.splice(0, 15000);
    }
    last = t;
    log.draws = 0;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) log.longtasks.push([e.startTime, e.duration]);
    }).observe({ type: "longtask", buffered: true });
  } catch {}
  addEventListener("webglcontextlost", () => log.lost++, true);
  addEventListener("webglcontextrestored", () => log.restored++, true);
})();`;

mkdirSync(OUT, { recursive: true });
const port = 9400 + Math.floor(Math.random() * 400);
const chromeProfile = join(OUT, `chrome-profile-${port}`);
const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    `--use-angle=${profile.angle}`,
    ...(profile.angle === "swiftshader"
      ? ["--enable-unsafe-swiftshader"]
      : ["--enable-gpu", "--ignore-gpu-blocklist"]),
    ...(process.env.UNCAP ? ["--disable-gpu-vsync", "--disable-frame-rate-limit"] : []),
    `--window-size=${profile.width},${profile.height}`,
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${chromeProfile}`,
    "--no-first-run",
    "--mute-audio",
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    "about:blank",
  ],
  { stdio: "ignore" },
);

const chromeExited = new Promise<void>((resolve) => chrome.once("exit", () => resolve()));

let cleaned = false;
function cleanup(): void {
  if (cleaned) return;
  cleaned = true;
  chrome.kill("SIGKILL");
  for (let i = 0; i < 5; i++) {
    try {
      rmSync(chromeProfile, { recursive: true, force: true });
      break;
    } catch {
      /* retry */
    }
  }
}

/**
 * The normal way out: kill Chrome, wait until it and its helpers have let go
 * of the profile, and only then delete it. Removing it the instant the kill
 * is sent left the GPU and renderer processes writing a fresh copy.
 */
async function shutdown(): Promise<void> {
  chrome.kill("SIGKILL");
  await Promise.race([chromeExited, sleep(3000)]);
  await sleep(500);
  cleanup();
  await sleep(300);
  rmSync(chromeProfile, { recursive: true, force: true });
}
process.on("exit", cleanup);
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    cleanup();
    process.exit(1);
  });
}

async function connect(): Promise<WebSocket> {
  for (let i = 0; i < 100; i++) {
    try {
      const targets = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()) as {
        type: string;
        webSocketDebuggerUrl: string;
      }[];
      const page = targets.find((t) => t.type === "page");
      if (page) {
        const ws = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((resolve) => ws.addEventListener("open", resolve));
        return ws;
      }
    } catch {
      /* not up yet */
    }
    await sleep(200);
  }
  throw new Error("Chrome did not start");
}

type Frame = [t: number, interval: number, draws: number];
type Task = [start: number, duration: number];

const pct = (values: number[], p: number): number => {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (rank - lo);
};

/**
 * The first moment from `from` that begins a full second with no task of
 * 100 ms or more: the end of the last such task before the quiet second, or
 * `from` itself. Null when the window never has a quiet second.
 */
export function interactiveAt(tasks: Task[], from: number, until: number): number | null {
  const blocking = tasks
    .filter(([start, duration]) => duration >= 100 && start + duration > from)
    .sort((a, b) => a[0] - b[0]);
  let cursor = from;
  for (const [start, duration] of blocking) {
    if (start - cursor >= 1000) return cursor;
    cursor = Math.max(cursor, start + duration);
  }
  return until - cursor >= 1000 ? cursor : null;
}

async function main(): Promise<void> {
  const ws = await connect();
  let id = 0;
  const pending = new Map<number, (value: { result?: { result?: { value?: unknown } } }) => void>();
  let messages: string[] = [];
  ws.addEventListener("message", (event) => {
    const msg = JSON.parse(String(event.data));
    if (msg.method === "Runtime.exceptionThrown") {
      messages.push(`exception: ${msg.params.exceptionDetails.exception?.description?.slice(0, 200)}`);
    }
    if (msg.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(msg.params.type)) {
      const text = msg.params.args
        .map((a: { value?: unknown; description?: string }) => String(a.value ?? a.description ?? ""))
        .join(" ");
      // The dev server's own chatter is not the app's.
      if (!/\[HMR\]|\[Fast Refresh\]|Download the React DevTools/.test(text)) {
        messages.push(`${msg.params.type}: ${text.slice(0, 200)}`);
      }
    }
    if (msg.method === "Log.entryAdded" && ["error", "warning"].includes(msg.params.entry.level)) {
      const { text, url } = msg.params.entry;
      if (!/favicon|devtools/i.test(`${text}${url ?? ""}`)) {
        messages.push(`${msg.params.entry.level} (${msg.params.entry.source}): ${text.slice(0, 200)}`);
      }
    }
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)!(msg);
      pending.delete(msg.id);
    }
  });
  const send = (method: string, params: object = {}) =>
    new Promise<{ result?: { result?: { value?: unknown } } }>((resolve) => {
      const n = ++id;
      pending.set(n, resolve);
      ws.send(JSON.stringify({ id: n, method, params }));
    });
  const evaluate = async <T>(expression: string): Promise<T> =>
    (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result
      ?.result?.value as T;

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Log.enable");
  await send("Page.addScriptToEvaluateOnNewDocument", { source: INSTRUMENT });
  await send("Emulation.setDeviceMetricsOverride", {
    width: profile.width,
    height: profile.height,
    deviceScaleFactor: profile.dpr,
    mobile: profile.mobile,
  });
  if (profile.mobile) {
    await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  }
  await send("Emulation.setCPUThrottlingRate", { rate: profile.cpu });

  const label = `${PROFILE_NAME}-${profile.angle}-cpu${profile.cpu}-${TIME}-${QUALITY}${PROD ? "-prod" : ""}${
    process.env.TAG ? `-${process.env.TAG}` : ""
  }`;
  console.log(`profile ${label}: ${JSON.stringify(profile)}`);

  const results: Record<string, unknown>[] = [];
  for (const scenario of SCENARIOS) {
    const params = new URLSearchParams();
    if (!PROD) params.set("perf", "1");
    if (QUALITY !== "auto") params.set("quality", QUALITY);
    if (TIME !== "auto") params.set("time", TIME);
    const url = `${BASE}/?${params}${scenario.query}`;
    console.log(`${scenario.name}: ${url}`);
    messages = [];
    await send("Page.navigate", { url });

    // The empty stage: navigation to its first WebGL frame.
    let landing = Number.NaN;
    for (let i = 0; i < 600; i++) {
      const first = await evaluate<number | null>(
        "window.__lowend && window.__lowend.frames.length ? window.__lowend.frames[0][0] : null",
      );
      if (first !== null) {
        landing = first;
        break;
      }
      await sleep(100);
    }
    await sleep(1500);
    const landingDraws = await evaluate<number>(
      "(() => { const f = window.__lowend.frames.slice(-20).map((x) => x[2]).sort((a, b) => a - b); return f[f.length >> 1] || 0; })()",
    );

    // The survey, typed into the box as a visitor would.
    const started = await evaluate<number>(`(async () => {
      const input = document.querySelector('input[type="text"], input:not([type])');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      setter.call(input, ${JSON.stringify(scenario.input)});
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 100));
      const t = performance.now();
      input.form ? input.form.requestSubmit() : input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      return t;
    })()`);

    // The city's first frame: the first frame after the survey with clearly
    // more draw calls than the empty stage.
    let cityFrame = Number.NaN;
    for (let i = 0; i < 1200; i++) {
      const at = await evaluate<number | null>(`(() => {
        const f = window.__lowend.frames.find((x) => x[0] > ${started} && x[2] > ${landingDraws} * 1.3 + 20);
        return f ? f[0] : null;
      })()`);
      if (at !== null) {
        cityFrame = at;
        break;
      }
      await sleep(100);
    }

    await sleep(SETTLE_MS);
    const measureFrom = await evaluate<number>("performance.now()");
    await sleep(MEASURE_MS);

    const log = await evaluate<{
      frames: Frame[];
      longtasks: Task[];
      lost: number;
      restored: number;
      now: number;
      bufferWidth: number;
      cssWidth: number;
    }>(`(() => {
      const c = document.querySelector("canvas");
      return { ...window.__lowend, now: performance.now(), bufferWidth: c ? c.width : 0, cssWidth: c ? c.clientWidth : 0 };
    })()`);
    const steady = log.frames.filter(([t, interval]) => t > measureFrom && interval > 0);
    const intervals = steady.map(([, interval]) => interval);
    const draws = steady.map(([, , d]) => d);
    const reveal = log.longtasks.filter(([start]) => start >= started && start < cityFrame + 8000);
    const tti = interactiveAt(log.longtasks, started, measureFrom);

    const dev = PROD
      ? null
      : await evaluate<Record<string, unknown>>(`(() => {
          const h = window.__repoCity;
          const c = h && h.getState().city;
          return {
            quality: h && h.quality, qualityLog: h && h.qualityLog,
            settlement: c && c.settlement && c.settlement.tier, buildings: c && c.buildings.length,
            crowd: c && (c.backlog ? c.backlog.incidents.length + c.backlog.constructionSites.length : 0),
            programs: h && h.perf && h.perf.programs, triangles: h && h.perf && h.perf.triangles,
          };
        })()`);

    const row = {
      scenario: scenario.name,
      landingMs: Math.round(landing),
      cityMs: Math.round(cityFrame - started),
      // Nothing is interactive before it is on screen.
      ttiMs: tti === null ? null : Math.round(Math.max(tti, cityFrame) - started),
      tbtMs: Math.round(reveal.reduce((sum, [, d]) => sum + Math.max(0, d - 50), 0)),
      maxTaskMs: Math.round(reveal.reduce((max, [, d]) => Math.max(max, d), 0)),
      fps: 1000 / pct(intervals, 50),
      meanFps: intervals.length / (intervals.reduce((a, b) => a + b, 0) / 1000),
      p95: pct(intervals, 95),
      calls: pct(draws, 50),
      dpr: log.cssWidth ? log.bufferWidth / log.cssWidth : null,
      lost: log.lost,
      restored: log.restored,
      // The tier the app settled on is on the root element in every build.
      quality: await evaluate<string | null>("document.documentElement.dataset.quality ?? null"),
      ...dev,
      messages: [...new Set(messages)],
    };

    const shot = await send("Page.captureScreenshot", { format: "png" });
    const data = (shot as { result?: { data?: string } }).result?.data;
    if (data) writeFileSync(join(OUT, `${scenario.name}-${label}.png`), Buffer.from(data, "base64"));
    results.push(row);
    console.log("  ", JSON.stringify(row));
  }

  writeFileSync(join(OUT, `perf-${label}.json`), JSON.stringify(results, null, 2));
  const fmt = (v: unknown, digits = 0) =>
    typeof v === "number" && Number.isFinite(v) ? v.toFixed(digits) : String(v ?? "-");
  const table = [
    "scenario | landing ms | city ms | tti ms | tbt ms | max task ms | fps | mean fps | p95 ms | calls | dpr | tier | tier changes | messages",
    ...results.map((r) =>
      [
        r.scenario,
        fmt(r.landingMs),
        fmt(r.cityMs),
        fmt(r.ttiMs),
        fmt(r.tbtMs),
        fmt(r.maxTaskMs),
        fmt(r.fps, 1),
        fmt(r.meanFps, 1),
        fmt(r.p95, 1),
        fmt(r.calls),
        fmt(r.dpr, 2),
        r.quality ?? "-",
        Array.isArray(r.qualityLog) ? r.qualityLog.map((q: { tier: string }) => q.tier).join(">") : "-",
        (r.messages as string[]).length,
      ].join(" | "),
    ),
  ].join("\n");
  writeFileSync(join(OUT, `perf-${label}.txt`), `${label}\n${table}\n`);
  console.log(table);
  ws.close();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await shutdown();
    process.exit();
  });
