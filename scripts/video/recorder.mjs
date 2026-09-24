// Deterministic 60 fps recorder: virtual time + BeginFrame screenshots, with a drawn cursor.
import { launch } from "./cdp.mjs";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const CH = new URL("./browsers/chrome-headless-shell/linux-154.0.8037.57/chrome-headless-shell-linux64/chrome-headless-shell", import.meta.url).pathname;
export const FPS = 60;
const DT = 1000 / FPS;

// Cursor overlay, injected into every document: an arrow that follows mouse events and a ring on press.
const CURSOR_JS = `
(() => {
  const install = () => {
    if (document.getElementById('__rc_cursor')) return;
    const st = document.createElement('style');
    st.textContent = \`
      #__rc_cursor{position:fixed;left:0;top:0;width:26px;height:26px;z-index:2147483647;pointer-events:none;transform:translate(-100px,-100px);filter:drop-shadow(0 2px 3px rgba(0,0,0,.45));transition:opacity .2s}
      .__rc_ring{position:fixed;z-index:2147483646;pointer-events:none;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;border:3px solid #ffb85c;animation:__rc_ring .5s ease-out forwards}
      @keyframes __rc_ring{from{transform:scale(.6);opacity:1}to{transform:scale(3.4);opacity:0}}\`;
    document.head.appendChild(st);
    const c = document.createElement('div');
    c.id = '__rc_cursor';
    c.innerHTML = '<svg width="26" height="26" viewBox="0 0 26 26"><path d="M3 2 L3 21 L8 16.5 L11.5 24 L15 22.5 L11.6 15.2 L18.5 15.2 Z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    document.body.appendChild(c);
    addEventListener('mousemove', e => { c.style.transform = 'translate(' + (e.clientX - 3) + 'px,' + (e.clientY - 2) + 'px)'; }, true);
    addEventListener('mousedown', e => {
      const r = document.createElement('div'); r.className = '__rc_ring';
      r.style.left = e.clientX + 'px'; r.style.top = e.clientY + 'px';
      document.body.appendChild(r); setTimeout(() => r.remove(), 700);
    }, true);
    window.__rcCursor = (on) => { c.style.opacity = on ? '1' : '0'; };
  };
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', install); else install();
})();`;

export const ease = {
  linear: (t) => t,
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  out: (t) => 1 - Math.pow(1 - t, 3),
  sine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
};

export async function createRecorder({ width = 1920, height = 1080, outDir, port = 9340, quality = 93 }) {
  const b = await launch({
    chrome: CH, width, height, port,
    extraArgs: [
      "--mute-audio", "--deterministic-mode", "--enable-begin-frame-control",
      "--run-all-compositor-stages-before-draw", "--disable-new-content-rendering-timeout",
      "--disable-threaded-animation", "--disable-threaded-scrolling", "--disable-checker-imaging",
      "--font-render-hinting=none",
    ],
  });
  await b.send("Page.addScriptToEvaluateOnNewDocument", { source: CURSOR_JS });
  await b.send("Emulation.setVirtualTimePolicy", { policy: "pause" });

  const pending = [];
  const input = (method, params) => { pending.push(b.send(method, params).catch(() => {})); };
  const state = { seg: null, n: 0, capture: false, mouse: { x: width / 2, y: height / 2 }, frames: 0, buttons: 0 };
  const segments = [];
  const marks = [];

  const advance = (ms) => new Promise(async (res) => {
    const off = b.on("Emulation.virtualTimeBudgetExpired", () => { off(); res(); });
    await b.send("Emulation.setVirtualTimePolicy", { policy: "advance", budget: ms });
  });

  const r = {
    b, state, width, height,
    evaluate: b.evaluate,
    async goto(url) {
      await b.send("Page.navigate", { url });
    },
    /** Start writing frames into a new numbered segment directory. */
    segment(name) {
      const dir = join(outDir, name);
      rmSync(dir, { recursive: true, force: true });
      mkdirSync(dir, { recursive: true });
      state.seg = { name, dir };
      state.n = 0;
      state.capture = true;
      segments.push(name);
      console.log(`[seg] ${name}`);
    },
    stop() { if (state.seg) console.log(`[seg] ${state.seg.name}: ${state.n} frames (${(state.n / FPS).toFixed(1)}s)`); state.capture = false; state.seg = null; },
    async tick(n = 1, perFrame) {
      for (let i = 0; i < n; i++) {
        if (perFrame) await perFrame(i, n);
        await advance(DT);
        const res = await b.send("HeadlessExperimental.beginFrame", state.capture ? { screenshot: { format: "jpeg", quality } } : {});
        state.frames++;
        if (pending.length) { const p = pending.splice(0); await Promise.race([Promise.all(p), new Promise((res) => setTimeout(res, 40))]); }
        if (state.capture && res.screenshotData) {
          writeFileSync(join(state.seg.dir, `${String(state.n).padStart(5, "0")}.jpg`), Buffer.from(res.screenshotData, "base64"));
          state.n++;
        }
      }
    },
    /** Hover a point without advancing virtual time; returns the tooltip text, if any. */
    async probe(x, y) {
      state.mouse = { x, y };
      await r.mouseEvent("mouseMoved", { button: "none" });
      for (let k = 0; k < 2; k++) {
        await b.send("HeadlessExperimental.beginFrame", {});
        if (pending.length) { const p = pending.splice(0); await Promise.race([Promise.all(p), new Promise((res) => setTimeout(res, 2000))]); }
      }
      return b.evaluate(`document.querySelector('div[role=status].glass')?.innerText ?? null`);
    },
    /** Probe a grid around a point for an entity whose tooltip matches `re`; the visible cursor is put back. */
    async find(re, { x = 960, y = 540, radius = 160, step = 12 } = {}) {
      const home = { ...state.mouse };
      const pts = [];
      for (let yy = Math.max(60, y - radius); yy <= Math.min(1040, y + radius); yy += step)
        for (let xx = Math.max(10, x - radius); xx <= Math.min(1910, x + radius); xx += step) {
          const t = await r.probe(xx, yy);
          if (t && re.test(t)) pts.push([xx, yy, t]);
        }
      state.mouse = home;
      await r.mouseEvent("mouseMoved", { button: "none" });
      await b.send("HeadlessExperimental.beginFrame", {});
      if (!pts.length) return null;
      // The biggest matching object, and the probe point nearest its centroid.
      const groups = new Map();
      for (const p of pts) { if (!groups.has(p[2])) groups.set(p[2], []); groups.get(p[2]).push(p); }
      const best = [...groups.values()].sort((a, b2) => b2.length - a.length)[0];
      const cx = best.reduce((a, p) => a + p[0], 0) / best.length, cy = best.reduce((a, p) => a + p[1], 0) / best.length;
      best.sort((a, b2) => Math.hypot(a[0] - cx, a[1] - cy) - Math.hypot(b2[0] - cx, b2[1] - cy));
      return { x: best[0][0], y: best[0][1], t: best[0][2], n: best.length };
    },
    /** Frame index within the current segment, for the edit. */
    mark(label) { const m = { seg: state.seg?.name, frame: state.n, label }; marks.push(m); console.log("[mark]", JSON.stringify(m)); },
    marks,
    async seconds(s) { await r.tick(Math.round(s * FPS)); },
    /** Tick until `cond` (a JS expression) is truthy in the page. */
    async waitFor(cond, { max = 60 * 60, every = 6, label = cond } = {}) {
      for (let i = 0; i < max; i += every) {
        let ok = false;
        try { ok = await b.evaluate(cond); } catch {}
        if (ok) return i;
        await r.tick(every);
      }
      throw new Error(`timeout waiting for ${label}`);
    },
    async mouseEvent(type, extra = {}) {
      input("Input.dispatchMouseEvent", { type, x: state.mouse.x, y: state.mouse.y, buttons: state.buttons, ...extra });
    },
    async moveTo(x, y, frames = 30, fn = ease.inOut, button = "none") {
      const from = { ...state.mouse };
      // A slight arc, as a hand moves.
      const dx = x - from.x, dy = y - from.y;
      const len = Math.hypot(dx, dy) || 1;
      const bow = Math.min(60, len * 0.08);
      await r.tick(frames, async (i) => {
        const t = fn((i + 1) / frames);
        const arc = Math.sin(Math.PI * t) * bow;
        state.mouse = { x: from.x + dx * t + (-dy / len) * arc, y: from.y + dy * t + (dx / len) * arc };
        await r.mouseEvent("mouseMoved", { button });
      });
      state.mouse = { x, y };
    },
    async click(hold = 5) {
      state.buttons = 1;
      await r.mouseEvent("mousePressed", { button: "left", clickCount: 1 });
      await r.tick(hold);
      state.buttons = 0;
      await r.mouseEvent("mouseReleased", { button: "left", clickCount: 1 });
      await r.tick(1);
    },
    async drag(dx, dy, frames = 60, { button = "left", fn = ease.inOut } = {}) {
      const bit = button === "left" ? 1 : button === "right" ? 2 : 4;
      state.buttons = bit;
      await r.mouseEvent("mousePressed", { button, clickCount: 1 });
      await r.tick(2);
      const from = { ...state.mouse };
      await r.tick(frames, async (i) => {
        const t = fn((i + 1) / frames);
        state.mouse = { x: from.x + dx * t, y: from.y + dy * t };
        await r.mouseEvent("mouseMoved", { button });
      });
      state.buttons = 0;
      await r.mouseEvent("mouseReleased", { button, clickCount: 1 });
      await r.tick(2);
    },
    async wheel(totalDeltaY, frames = 40, fn = ease.inOut) {
      let done = 0;
      await r.tick(frames, async (i) => {
        const target = totalDeltaY * fn((i + 1) / frames);
        const d = target - done;
        done = target;
        if (Math.abs(d) > 0.01) input("Input.dispatchMouseEvent", { type: "mouseWheel", x: state.mouse.x, y: state.mouse.y, deltaX: 0, deltaY: d });
      });
    },
    async type(text, framesPerChar = 5) {
      for (const ch of text) {
        input("Input.dispatchKeyEvent", { type: "keyDown", key: ch, text: ch, unmodifiedText: ch });
        input("Input.dispatchKeyEvent", { type: "keyUp", key: ch });
        await r.tick(framesPerChar + (ch === "/" ? 4 : 0));
      }
    },
    async key(key, code = key, vk = 0) {
      const text = key === "Enter" ? "\r" : undefined;
      input("Input.dispatchKeyEvent", { type: "rawKeyDown", key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
      if (text) input("Input.dispatchKeyEvent", { type: "char", key, code, text, unmodifiedText: text, windowsVirtualKeyCode: vk });
      input("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
    },
    /** Centre of the first element matching a JS expression that returns an element. */
    async rectOf(expr) {
      return b.evaluate(`(() => { const el = ${expr}; if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height }; })()`);
    },
    async cursor(on) { await b.evaluate(`window.__rcCursor && window.__rcCursor(${on})`); },
    async close() { await b.close(); },
    segments,
    sendInput: input,
  };
  return r;
}
