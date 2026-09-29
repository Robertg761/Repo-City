/**
 * Close-up screenshots of a surveyed city in headless Chrome, for checking
 * models by eye (the near levels of detail above all) without a browser pane.
 *
 *   pnpm dev --port 3109 &
 *   POSES='[{"name":"b0","building":0}]' node scripts/shot.ts http://localhost:3109 out/
 *
 * Each pose jumps the camera with the development handle
 * (`__repoCity.camera.lookAt`) and saves `<outDir>/<name>.png`. A pose is one of:
 *
 *   { name }                                  the overview the app chose
 *   { name, pos: [x, y, z], target: [x, y, z] }
 *   { name, building | incident | construction: index, dist?, height?, angle? }
 *     orbits that entity of `city.buildings` / `city.incidents` /
 *     `city.constructionSites` at `dist` (default 14) and `height` (default
 *     6), `angle` radians round from +z (default 0.8)
 *
 * Knobs: INPUT (what is typed in the repository box: `fixture`, `backlog`,
 * `stress`, or owner/repo; default `fixture`), QUERY (appended to the URL,
 * e.g. `&time=afternoon&quality=high`), WIDTH, HEIGHT, SETTLE_MS (after the
 * survey, default 14000), ANGLE (default vulkan), CHROME, NET (a regular
 * expression: prints the status of every response whose URL matches).
 *
 * Prints the triangle and draw-call counts at every pose, and every console
 * error. The Chrome profile lives in `outDir` and is deleted on exit.
 */

import { spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const BASE = process.argv[2] ?? "http://localhost:3109";
const OUT = process.argv[3] ?? "shots";
const CHROME = process.env.CHROME ?? "/usr/bin/google-chrome-stable";
const INPUT = process.env.INPUT ?? "fixture";
const WIDTH = Number(process.env.WIDTH ?? 1600);
const HEIGHT = Number(process.env.HEIGHT ?? 1000);
const SETTLE_MS = Number(process.env.SETTLE_MS ?? 14_000);

type V3 = [number, number, number];
interface Pose {
  name: string;
  pos?: V3;
  target?: V3;
  building?: number;
  incident?: number;
  construction?: number;
  dist?: number;
  height?: number;
  angle?: number;
}
const POSES: Pose[] = JSON.parse(process.env.POSES ?? '[{"name":"overview"}]');

mkdirSync(OUT, { recursive: true });
const port = 9800 + Math.floor(Math.random() * 190);
const chromeProfile = join(OUT, `chrome-profile-${port}`);
const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    `--use-angle=${process.env.ANGLE ?? "vulkan"}`,
    "--enable-gpu",
    "--ignore-gpu-blocklist",
    `--window-size=${WIDTH},${HEIGHT}`,
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
const cleanup = () => {
  chrome.kill("SIGKILL");
  rmSync(chromeProfile, { recursive: true, force: true });
};
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
  const pending = new Map<number, (value: { result?: Record<string, unknown> }) => void>();
  const errors: string[] = [];
  const net = process.env.NET ? new RegExp(process.env.NET) : null;
  ws.addEventListener("message", (event) => {
    const msg = JSON.parse(String(event.data));
    if (msg.method === "Runtime.exceptionThrown") {
      errors.push(`exception: ${msg.params.exceptionDetails.exception?.description?.slice(0, 300)}`);
    }
    if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") {
      errors.push(
        `error: ${msg.params.args.map((a: { value?: unknown; description?: string }) => String(a.value ?? a.description ?? "")).join(" ").slice(0, 300)}`,
      );
    }
    if (net && msg.method === "Network.responseReceived" && net.test(msg.params.response.url)) {
      console.log(`${msg.params.response.status} ${msg.params.response.url.replace(BASE, "")}`);
    }
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)!(msg);
      pending.delete(msg.id);
    }
  });
  const send = (method: string, params: object = {}) =>
    new Promise<{ result?: Record<string, unknown> }>((resolve) => {
      const n = ++id;
      pending.set(n, resolve);
      ws.send(JSON.stringify({ id: n, method, params }));
    });
  const evaluate = async <T>(expression: string): Promise<T> =>
    ((await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result?.result as {
      value?: T;
    })?.value as T;

  await send("Page.enable");
  await send("Runtime.enable");
  if (net) await send("Network.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: `${BASE}/?${process.env.QUERY ?? ""}` });

  for (let i = 0; i < 300; i++) {
    if (await evaluate<boolean>("!!document.querySelector('input') && !!window.__repoCity")) break;
    await sleep(200);
  }
  await sleep(1500);
  await evaluate(`(async () => {
    const input = document.querySelector('input[type="text"], input:not([type])');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(input, ${JSON.stringify(INPUT)});
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 100));
    input.form ? input.form.requestSubmit() : input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  })()`);
  for (let i = 0; i < 600; i++) {
    if (await evaluate<boolean>("!!(window.__repoCity && window.__repoCity.getState().city && window.__repoCity.camera)")) break;
    await sleep(200);
  }
  await sleep(SETTLE_MS);

  for (const pose of POSES) {
    const moved = await evaluate<string>(`(async () => {
      const h = window.__repoCity, city = h.getState().city, pose = ${JSON.stringify(pose)};
      let pos = pose.pos, target = pose.target;
      const list = pose.building !== undefined ? city.buildings : pose.incident !== undefined ? city.incidents
        : pose.construction !== undefined ? city.constructionSites : null;
      if (list) {
        const e = list[pose.building ?? pose.incident ?? pose.construction];
        if (!e) return "no such entity";
        const d = pose.dist ?? 14, a = pose.angle ?? 0.8, y = pose.height ?? 6;
        target = [e.position[0], (e.size ? e.size[1] / 3 : 1), e.position[2]];
        pos = [target[0] + Math.sin(a) * d, y, target[2] + Math.cos(a) * d];
      }
      if (pos && target) await h.camera.lookAt(...pos, ...target);
      return "ok";
    })()`);
    await sleep(1500);
    const stats = await evaluate<{ triangles?: number; calls?: number }>(
      "(() => { const r = window.__repoCityRenderer; return r ? { triangles: r.info.render.triangles, calls: r.info.render.calls } : {}; })()",
    );
    const shot = (await send("Page.captureScreenshot", { format: "png" })).result as { data: string };
    writeFileSync(join(OUT, `${pose.name}.png`), Buffer.from(shot.data, "base64"));
    console.log(`${pose.name}: ${moved}, ${stats.triangles ?? "?"} triangles, ${stats.calls ?? "?"} draws`);
  }
  if (errors.length) console.log(`console errors:\n  ${errors.join("\n  ")}`);
  chrome.kill("SIGKILL");
  await Promise.race([chromeExited, sleep(3000)]);
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
