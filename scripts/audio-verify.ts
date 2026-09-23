/**
 * Headless check of the ambient soundscape (`components/audio/`), in Chrome
 * over the DevTools protocol:
 *
 *   1. nothing audible exists until the speaker is clicked (no context);
 *   2. a real click on the speaker starts an `AudioContext` that runs;
 *   3. flying down to the ground voices local sources, and reloading the
 *      city (three different surveys) releases them: the live node count
 *      comes back down rather than growing;
 *   4. a hidden tab fades out and suspends, and a visible one resumes;
 *   5. switching off closes the context; the choice is remembered, and a
 *      reload waits for the next click before it plays again;
 *   6. the cost: main-thread milliseconds per update, the Chrome processes'
 *      CPU with sound on against off, and the draw calls either way;
 *   7. no console errors or exceptions throughout.
 *
 * Then it renders every level-check scene offline (`OfflineAudioContext`,
 * `__repoCity.audio.render`) and writes the RMS and peak table to
 * `outDir/levels.md`.
 *
 *   pnpm dev --port 3202 &
 *   node scripts/audio-verify.ts [baseUrl] [outDir]
 *
 * `SKIP_LEVELS=1` skips the offline renders; `ONLY_LEVELS=1` does only them.
 * The Chrome profile lives in `outDir` and is deleted on exit, whatever
 * happens.
 */

import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const BASE = process.argv[2] ?? "http://localhost:3202";
const OUT = process.argv[3] ?? "/tmp/claude-1000/audio";
const CHROME = process.env.CHROME ?? "/usr/bin/google-chrome-stable";
const CPU_WINDOW_MS = Number(process.env.CPU_WINDOW_MS ?? 15_000);

mkdirSync(OUT, { recursive: true });
const port = 9800 + Math.floor(Math.random() * 150);
const profile = join(OUT, `chrome-profile-${port}`);
const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--window-size=1440,900",
    "--force-device-scale-factor=1",
    // The policy a visitor's browser applies: no audio before a gesture.
    "--autoplay-policy=user-gesture-required",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    "--no-first-run",
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
      rmSync(profile, { recursive: true, force: true });
      break;
    } catch {
      /* retry */
    }
  }
}
async function shutdown(): Promise<void> {
  chrome.kill("SIGKILL");
  await Promise.race([chromeExited, sleep(3000)]);
  await sleep(500);
  cleanup();
  await sleep(300);
  rmSync(profile, { recursive: true, force: true });
}
process.on("exit", cleanup);
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    cleanup();
    process.exit(1);
  });
}

type Msg = { id?: number; method?: string; params?: Record<string, unknown>; result?: Record<string, unknown> };

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

/** utime + stime, in clock ticks, of every process in Chrome's tree, by type. */
function chromeCpu(): Record<string, number> {
  const byType: Record<string, number> = {};
  const tree = new Set<number>([chrome.pid!]);
  const procs: { pid: number; ppid: number; ticks: number; type: string }[] = [];
  for (const entry of readdirSync("/proc")) {
    if (!/^\d+$/.test(entry)) continue;
    try {
      const stat = readFileSync(`/proc/${entry}/stat`, "utf8");
      const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
      const ppid = Number(fields[1]);
      const ticks = Number(fields[11]) + Number(fields[12]);
      const cmd = readFileSync(`/proc/${entry}/cmdline`, "utf8").split("\0");
      const typeArg = cmd.find((a) => a.startsWith("--type="))?.slice(7) ?? "browser";
      const sub = cmd.find((a) => a.startsWith("--utility-sub-type="))?.slice(19);
      procs.push({ pid: Number(entry), ppid, ticks, type: sub ? `${typeArg}:${sub}` : typeArg });
    } catch {
      /* gone */
    }
  }
  // Walk the tree from the browser process.
  let grew = true;
  while (grew) {
    grew = false;
    for (const p of procs) {
      if (!tree.has(p.pid) && tree.has(p.ppid)) {
        tree.add(p.pid);
        grew = true;
      }
    }
  }
  for (const p of procs) if (tree.has(p.pid)) byType[p.type] = (byType[p.type] ?? 0) + p.ticks;
  return byType;
}

async function main(): Promise<void> {
  const ws = await connect();
  let id = 0;
  const pending = new Map<number, (value: Msg) => void>();
  const problems: string[] = [];
  ws.addEventListener("message", (event) => {
    const msg = JSON.parse(String(event.data)) as Msg;
    if (msg.method === "Runtime.exceptionThrown") {
      const details = msg.params?.exceptionDetails as { exception?: { description?: string }; text?: string };
      problems.push(`exception: ${(details.exception?.description ?? details.text ?? "").slice(0, 300)}`);
    }
    if (msg.method === "Runtime.consoleAPICalled") {
      const { type, args } = msg.params as { type: string; args: { value?: unknown; description?: string }[] };
      if (type === "error" || type === "warning" || type === "assert") {
        problems.push(`console.${type}: ${args.map((a) => String(a.value ?? a.description ?? "")).join(" ").slice(0, 300)}`);
      }
    }
    if (msg.method === "Log.entryAdded") {
      const entry = msg.params?.entry as { level: string; text: string; source: string };
      if (entry.level === "error" || entry.level === "warning") problems.push(`log.${entry.level} (${entry.source}): ${entry.text.slice(0, 300)}`);
    }
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)!(msg);
      pending.delete(msg.id);
    }
  });
  const send = (method: string, params: object = {}) =>
    new Promise<Msg>((resolve) => {
      const n = ++id;
      pending.set(n, resolve);
      ws.send(JSON.stringify({ id: n, method, params }));
    });
  const evaluate = async <T>(expression: string): Promise<T> => {
    const reply = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    const result = reply.result as { result?: { value?: unknown }; exceptionDetails?: { text?: string; exception?: { description?: string } } };
    if (result?.exceptionDetails) {
      throw new Error(`evaluate failed: ${result.exceptionDetails.exception?.description ?? result.exceptionDetails.text}`);
    }
    return result?.result?.value as T;
  };
  const waitFor = async (expression: string, ms = 60_000) => {
    const until = Date.now() + ms;
    while (Date.now() < until) {
      if (await evaluate<boolean>(`Boolean(${expression})`).catch(() => false)) return;
      await sleep(150);
    }
    throw new Error(`timed out waiting for ${expression}`);
  };
  const click = async (x: number, y: number) => {
    for (const type of ["mouseMoved", "mousePressed", "mouseReleased"] as const) {
      await send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: type === "mouseMoved" ? 0 : 1 });
    }
  };
  const speaker = () =>
    evaluate<{ x: number; y: number; pressed: string; w: number; h: number } | null>(`(() => {
      const b = document.querySelector('button[aria-label="Ambient sound"]');
      if (!b) return null;
      const r = b.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2, pressed: b.getAttribute("aria-pressed"), w: r.width, h: r.height };
    })()`);
  const stats = () => evaluate<Record<string, unknown>>("window.__repoCity.audio.stats()");
  const report: string[] = [];
  const log = (line: string) => {
    console.log(line);
    report.push(line);
  };

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Log.enable");
  await send("Performance.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  const open = async (query = "") => {
    await send("Page.navigate", { url: `${BASE}/${query}` });
    await waitFor("window.__repoCity && window.__repoCity.audio && document.querySelector('button[aria-label=\"Ambient sound\"]')");
  };
  const survey = async (input: string) => {
    await evaluate(`window.__repoCity.getState().actions.analyze(${JSON.stringify(input)})`);
    await waitFor(`window.__repoCity.getState().phase === "ready"`, 120_000);
  };

  if (!process.env.ONLY_LEVELS) {
    // 1. Off by default.
    await open("?perf=1");
    await evaluate("localStorage.clear()");
    await open("?perf=1");
    await survey("fixture");
    await sleep(6000);
    const before = await speaker();
    const off = await stats();
    log(`default: aria-pressed=${before?.pressed}, status=${off.status}, contexts=${off.state ?? "none"}`);

    // Draw calls with sound off.
    await evaluate("window.__repoCity.perfClear()");
    await sleep(5000);
    const perfOff = await evaluate<{ calls: number; fps: number }>("window.__repoCity.perf");

    // CPU with sound off.
    const cpuOff0 = chromeCpu();
    const metricsOff0 = await send("Performance.getMetrics");
    await sleep(CPU_WINDOW_MS);
    const cpuOff1 = chromeCpu();
    const metricsOff1 = await send("Performance.getMetrics");

    // 2. A real click on the speaker.
    await click(before!.x, before!.y);
    await waitFor(`window.__repoCity.audio.stats().status === "playing"`, 15_000);
    await sleep(2500);
    const on = await stats();
    const after = await speaker();
    log(`after click: aria-pressed=${after?.pressed}, status=${on.status}, context=${on.state}, live nodes=${on.liveNodes}, altitude=${Number(on.altitude).toFixed(2)}`);

    await evaluate("window.__repoCity.perfClear()");
    await sleep(5000);
    const perfOn = await evaluate<{ calls: number; fps: number }>("window.__repoCity.perf");

    // CPU with sound on.
    const tickBefore = await stats();
    const cpuOn0 = chromeCpu();
    const metricsOn0 = await send("Performance.getMetrics");
    await sleep(CPU_WINDOW_MS);
    const cpuOn1 = chromeCpu();
    const metricsOn1 = await send("Performance.getMetrics");
    const tickAfter = await stats();

    const hz = 100; // USER_HZ on Linux
    const diff = (a: Record<string, number>, b: Record<string, number>) => {
      const out: Record<string, number> = {};
      for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) out[key] = ((b[key] ?? 0) - (a[key] ?? 0)) / hz;
      return out;
    };
    const metric = (m: Msg, name: string) =>
      ((m.result as { metrics: { name: string; value: number }[] }).metrics.find((x) => x.name === name)?.value ?? 0);
    const seconds = CPU_WINDOW_MS / 1000;
    const offCpu = diff(cpuOff0, cpuOff1);
    const onCpu = diff(cpuOn0, cpuOn1);
    log(`draw calls per frame: off ${perfOff.calls}, on ${perfOn.calls}`);
    log(`update cost: ${Number(tickAfter.tickMs).toFixed(3)} ms mean, ${Number(tickAfter.tickMsMax).toFixed(3)} ms worst, ${(Number(tickAfter.ticks) - Number(tickBefore.ticks)) / seconds} updates a second`);
    log(
      `main-thread script: off ${((metric(metricsOff1, "ScriptDuration") - metric(metricsOff0, "ScriptDuration")) / seconds * 1000).toFixed(1)} ms/s, on ${((metric(metricsOn1, "ScriptDuration") - metric(metricsOn0, "ScriptDuration")) / seconds * 1000).toFixed(1)} ms/s`,
    );
    for (const type of Object.keys({ ...offCpu, ...onCpu }).sort()) {
      log(`cpu ${type}: off ${((offCpu[type] ?? 0) / seconds * 1000).toFixed(1)} ms/s, on ${((onCpu[type] ?? 0) / seconds * 1000).toFixed(1)} ms/s`);
    }

    // 3. Down to the ground by the crane, then three city reloads.
    const flyTo = async (kind: "crane" | "fire" | "station") => {
      await evaluate(`(() => {
        const c = window.__repoCity.getState().city;
        const e = ${kind === "crane" ? "c.constructionSites.find(s => s.state === 'active' || s.state === 'slow')" : kind === "fire" ? "c.incidents.find(i => i.form === 'fire')" : "c.landmarks.find(l => l.landmarkType === 'station')"};
        if (!e) return false;
        const [x, , z] = e.position;
        window.__repoCity.controls.setLookAt(x + 12, 10, z + 12, x, 0, z, false);
        return true;
      })()`);
      await sleep(2500);
    };
    await flyTo("crane");
    const low = await stats();
    log(`at the crane: altitude=${Number(low.altitude).toFixed(2)}, local voices=${low.locals} [${(low.localIds as string[]).join(", ")}], live nodes=${low.liveNodes}`);

    const counts: string[] = [];
    for (const input of ["backlog", "stress", "fixture", "backlog", "fixture"]) {
      await survey(input);
      await sleep(1500);
      await flyTo(input === "stress" ? "crane" : "fire");
      await sleep(2000);
      const s = await stats();
      counts.push(`${input}: locals ${s.locals}, live ${s.liveNodes}, one-shots ${s.oneShots}`);
    }
    // Back up to the overview, where no local voice should remain.
    await evaluate("window.__repoCity.getState().actions.returnToOverview()");
    await evaluate(`(() => { const c = window.__repoCity.controls; c.dollyTo(c.distance * 3, false); })()`);
    await sleep(4000);
    const settled = await stats();
    log(`city reloads: ${counts.join(" | ")}`);
    log(`at the overview after reloads: locals ${settled.locals}, live nodes ${settled.liveNodes} (created ${settled.createdNodes} in all), one-shots ${settled.oneShots}`);

    // 4. Hidden tab. A second tab brought to the front hides this one.
    const created = await send("Target.createTarget", { url: "about:blank" });
    const other = (created.result as { targetId: string }).targetId;
    await sleep(1500);
    const hidden = await stats();
    const hiddenDoc = await evaluate<boolean>("document.hidden");
    const pages = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()) as { id: string; type: string }[];
    const self = pages.find((p) => p.type === "page" && p.id !== other);
    await send("Target.closeTarget", { targetId: other });
    if (self) await send("Target.activateTarget", { targetId: self.id });
    await sleep(2000);
    const shown = await stats();
    log(`tab hidden (document.hidden=${hiddenDoc}): context ${hidden.state}; visible again: context ${shown.state}, status ${shown.status}`);

    // 5. Off, remembered, and a reload that waits for a gesture.
    const button = await speaker();
    await click(button!.x, button!.y);
    await sleep(1200);
    const offAgain = await stats();
    log(`clicked off: status ${offAgain.status}, stored ${await evaluate<string>("localStorage.getItem('repo-city:sound')")}`);
    await click(button!.x, button!.y);
    await waitFor(`window.__repoCity.audio.stats().status === "playing"`, 15_000);
    await open();
    await sleep(2000);
    const restored = await stats();
    const restoredButton = await speaker();
    log(`reload with sound remembered on: aria-pressed=${restoredButton?.pressed}, status ${restored.status}, context ${restored.state ?? "none"}`);
    await click(700, 450);
    await waitFor(`window.__repoCity.audio.stats().status === "playing"`, 15_000);
    const woke = await stats();
    log(`after a click on the city: status ${woke.status}, context ${woke.state}`);
    // Leave it off for the next visitor to this profile.
    const last = await speaker();
    await click(last!.x, last!.y);
    await sleep(800);
    log(`console problems: ${problems.length === 0 ? "none" : ""}`);
    for (const problem of problems) log(`  ${problem}`);
    writeFileSync(join(OUT, "verify.txt"), `${report.join("\n")}\n`);
  }

  if (!process.env.SKIP_LEVELS) {
    await open();
    const names = await evaluate<string[]>("window.__repoCity.audio.scenes()");
    const rows: { name: string; rmsDb: number; peakDb: number; events: Record<string, number>; renderMs: number; liveNodes: number }[] = [];
    for (const name of names) {
      const r = await evaluate<(typeof rows)[number]>(`window.__repoCity.audio.render(${JSON.stringify(name)}, 12, 1)`);
      rows.push(r);
      console.log(`${name}: rms ${r.rmsDb.toFixed(1)} dBFS, peak ${r.peakDb.toFixed(1)} dBFS, ${JSON.stringify(r.events)}`);
    }
    const atDefault = await evaluate<(typeof rows)[number]>(`window.__repoCity.audio.render("worst case: thriving metropolis, all four locals at 6 units", 12, 0.7)`);
    const fmt = (n: number) => (Number.isFinite(n) ? n.toFixed(1) : "-inf");
    // Each layer alone, in the scene where it matters most, so no one layer
    // is found to be carrying a scene by being too loud.
    const SOLOS: [string, string][] = [
      ["village morning", "wind"],
      ["village morning", "birds"],
      ["village afternoon", "tractor"],
      ["village afternoon", "livestock"],
      ["village night", "crickets"],
      ["metropolis afternoon", "hum"],
      ["metropolis afternoon", "rumble"],
      ["thriving metropolis afternoon", "horns"],
      ["metropolis night", "cars"],
      ["close: city fire and crane", "local"],
      ["close: town station (6 trains/min)", "local"],
      ["close: village power (failing CI)", "local"],
    ];
    const solos: { scene: string; layer: string; r: (typeof rows)[number] }[] = [];
    for (const [scene, layer] of SOLOS) {
      // Long enough for the rare layers to fire at least once.
      const long = layer === "tractor" || layer === "livestock" || layer === "horns" || layer === "cars";
      const r = await evaluate<(typeof rows)[number]>(
        `window.__repoCity.audio.render(${JSON.stringify(scene)}, ${long ? 60 : 12}, 1, ${JSON.stringify(layer)})`,
      );
      solos.push({ scene, layer, r });
      console.log(`solo ${layer} in ${scene}: rms ${r.rmsDb.toFixed(1)}, peak ${r.peakDb.toFixed(1)}, ${JSON.stringify(r.events)}`);
    }
    const loudest = rows.reduce((a, b) => (b.peakDb > a.peakDb ? b : a));
    const table = [
      "# Soundscape levels",
      "",
      `Offline renders (\`OfflineAudioContext\`, 44.1 kHz stereo, 12 s, the first second of fade-in skipped) of every scene in \`lib/client/audioLevels.ts\`, at **full master volume** (the default is 70%, which is 6.2 dB lower). Rendered in headless Chrome by \`scripts/audio-verify.ts\` on ${new Date().toISOString().slice(0, 10)}.`,
      "",
      "Ceiling: peak at most -3 dBFS. The master chain ends in a soft shaper that cannot exceed -4.1 dBFS.",
      "",
      "| scene | RMS dBFS | peak dBFS | events in 12 s | render ms |",
      "| --- | ---: | ---: | --- | ---: |",
      ...rows.map(
        (r) =>
          `| ${r.name} | ${fmt(r.rmsDb)} | ${fmt(r.peakDb)} | ${Object.entries(r.events).map(([k, v]) => `${k} ${v}`).join(", ") || "none"} | ${Math.round(r.renderMs)} |`,
      ),
      "",
      "## Each layer alone",
      "",
      "The same renders with every other layer muted (60 s for the rare ones: tractor, livestock, horns, cars).",
      "",
      "| layer | scene | RMS dBFS | peak dBFS | events |",
      "| --- | --- | ---: | ---: | --- |",
      ...solos.map(
        ({ scene, layer, r }) =>
          `| ${layer} | ${scene} | ${fmt(r.rmsDb)} | ${fmt(r.peakDb)} | ${Object.entries(r.events).map(([k, v]) => `${k} ${v}`).join(", ") || "none"} |`,
      ),
      "",
      `Loudest peak: ${fmt(loudest.peakDb)} dBFS (${loudest.name}). ${loudest.peakDb <= -3 ? "Every scene is under the -3 dBFS ceiling." : "OVER THE CEILING."}`,
      `The worst case at the default volume (70%): RMS ${fmt(atDefault.rmsDb)} dBFS, peak ${fmt(atDefault.peakDb)} dBFS.`,
      `RMS spread across the overview scenes: ${fmt(Math.min(...rows.filter((r) => !r.name.startsWith("close") && !r.name.startsWith("worst")).map((r) => r.rmsDb)))} to ${fmt(Math.max(...rows.filter((r) => !r.name.startsWith("close") && !r.name.startsWith("worst")).map((r) => r.rmsDb)))} dBFS.`,
      "",
    ].join("\n");
    writeFileSync(join(OUT, "levels.md"), table);
    console.log(`wrote ${join(OUT, "levels.md")}`);
    if (problems.length) for (const problem of problems) console.log(`  ${problem}`);
  }
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
