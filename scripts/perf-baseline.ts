/**
 * Headless performance run (PLAN.md 76.13, S9): loads each scenario in
 * headless Chrome, lets the reveal finish, and reads `window.__repoCity.perf`
 * from the `?perf=1` overlay.
 *
 * Swiftshader renders on the CPU, so its frame rates are nothing like a GPU's
 * and only compare with each other. Draw calls, triangles, geometry and
 * texture counts do not depend on the renderer, and are the numbers to trust.
 *
 *   pnpm dev --port 3149 &
 *   node scripts/perf-baseline.ts [baseUrl] [outDir]
 *
 * It needs the overlay mounted in `CityCanvas.tsx` and the `stress` input
 * registered in the store. The Chrome profile lives in `outDir` and is
 * deleted on exit, whatever happens.
 */

import { spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const BASE = process.argv[2] ?? "http://localhost:3149";
const OUT = process.argv[3] ?? "/tmp/claude-1000/s9-perf";
const CHROME = process.env.CHROME ?? "/usr/bin/google-chrome-stable";
/** How long each scenario is watched after the reveal. */
const MEASURE_MS = Number(process.env.MEASURE_MS ?? 20_000);
const SETTLE_MS = Number(process.env.SETTLE_MS ?? 8_000);

interface Scenario {
  name: string;
  input: string;
  query: string;
}

const QUALITY = process.env.QUALITY ?? "high";
const SCENARIOS: Scenario[] = [
  { name: "sample (city)", input: "fixture", query: "" },
  { name: "sample ?tier=village", input: "fixture", query: "&tier=village" },
  { name: "sample ?tier=metropolis", input: "fixture", query: "&tier=metropolis" },
  { name: "backlog", input: "backlog", query: "" },
  { name: "stress", input: "stress", query: "" },
].filter((s) => !process.env.ONLY || s.name.includes(process.env.ONLY));

mkdirSync(OUT, { recursive: true });
const port = 9400 + Math.floor(Math.random() * 400);
const profile = join(OUT, `chrome-profile-${port}`);
const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--window-size=1920,1080",
    "--force-device-scale-factor=1",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    "about:blank",
  ],
  { stdio: "ignore" },
);

let cleaned = false;
function cleanup(): void {
  if (cleaned) return;
  cleaned = true;
  chrome.kill("SIGKILL");
  // Chrome may still be flushing the profile for a moment after the kill.
  for (let i = 0; i < 5; i++) {
    try {
      rmSync(profile, { recursive: true, force: true });
      break;
    } catch {
      /* retry */
    }
  }
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

async function main(): Promise<void> {
  const ws = await connect();
  let id = 0;
  const pending = new Map<number, (value: { result?: { result?: { value?: unknown } } }) => void>();
  ws.addEventListener("message", (event) => {
    const msg = JSON.parse(String(event.data));
    if (msg.method === "Runtime.exceptionThrown") {
      console.log("  exception:", msg.params.exceptionDetails.exception?.description?.slice(0, 200));
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
  // The gate's viewport exactly: the window size includes browser chrome.
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1920,
    height: 1080,
    deviceScaleFactor: 1,
    mobile: false,
  });

  const results: Record<string, unknown>[] = [];
  for (const scenario of SCENARIOS) {
    const url = `${BASE}/?perf=1&perfWindow=${MEASURE_MS}&quality=${QUALITY}${scenario.query}`;
    console.log(`${scenario.name}: ${url}`);
    await send("Page.navigate", { url });
    // Wait for the store handle and the overlay.
    for (let i = 0; i < 300; i++) {
      if (await evaluate<boolean>("Boolean(window.__repoCity && window.__repoCity.perfClear)")) break;
      await sleep(200);
    }
    await evaluate(`window.__repoCity.getState().actions.analyze(${JSON.stringify(scenario.input)})`);
    for (let i = 0; i < 300; i++) {
      if ((await evaluate<string>("window.__repoCity.getState().phase")) === "ready") break;
      await sleep(200);
    }
    // The reveal ends by about 4 s; the settle covers shader compiles too.
    await sleep(SETTLE_MS);
    await evaluate("window.__repoCity.perfClear()");
    await sleep(MEASURE_MS);
    const perf = await evaluate<Record<string, unknown>>("window.__repoCity.perf");
    const city = await evaluate<Record<string, unknown>>(`(() => {
      const c = window.__repoCity.getState().city;
      return c && {
        tier: c.settlement?.tier, size: c.bounds.size, buildings: c.buildings.length,
        heroes: c.incidents.length + c.constructionSites.length,
        crowd: (c.backlog?.incidents.length ?? 0) + (c.backlog?.constructionSites.length ?? 0),
        cars: c.vehicles.count, queue: c.overflow?.queue.length ?? 0,
      };
    })()`);
    const shot = await send("Page.captureScreenshot", { format: "png" });
    const data = (shot as { result?: { data?: string } }).result?.data;
    if (data) {
      writeFileSync(join(OUT, `${scenario.name.replace(/[^a-z0-9]+/gi, "-")}-${QUALITY}.png`), Buffer.from(data, "base64"));
    }
    results.push({ scenario: scenario.name, quality: QUALITY, ...city, ...perf });
    console.log("  ", JSON.stringify({ city, perf }));
  }

  writeFileSync(join(OUT, `baseline-${QUALITY}.json`), JSON.stringify(results, null, 2));
  const rows = results.map((r) =>
    [
      r.scenario,
      r.tier,
      r.size,
      r.buildings,
      r.crowd,
      r.calls,
      r.triangles,
      r.shadowCalls,
      r.shadowTriangles,
      Number(r.fps).toFixed(2),
      Number(r.frameP95).toFixed(0),
      r.geometries,
      r.textures,
      r.quality,
    ].join(" | "),
  );
  const table = [
    "scenario | tier | size | buildings | crowd | calls | triangles | shadow calls | shadow tris | fps | p95 ms | geometries | textures | quality",
    ...rows,
  ].join("\n");
  writeFileSync(join(OUT, `baseline-${QUALITY}.txt`), `${table}\n`);
  console.log(table);
  ws.close();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    cleanup();
    process.exit();
  });
