import { launch } from "./cdp.mjs";
import { writeFileSync, readFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
const timing = JSON.parse(readFileSync("tts/timing.json", "utf8"));
const lines = {};
for (const [k, v] of Object.entries(timing)) v.chunks.forEach((c, i) => { lines[`${k}_${i}`] = c.text; });
const FONT = `<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@500&display=block" rel="stylesheet">`;
const base = `html,body{margin:0;width:1920px;height:1080px;background:transparent;overflow:hidden;font-family:Geist,sans-serif;color:#fff;-webkit-font-smoothing:antialiased}`;
const pages = {};
// Captions: bottom (default) or top (during the tour, whose own captions sit low).
for (const [k, t] of Object.entries(lines)) {
  for (const pos of ["bottom", "top"]) {
    pages[`cap_${k}_${pos}`] = `<style>${base}
      .c{position:absolute;left:50%;transform:translateX(-50%);${pos === "bottom" ? "bottom:118px" : "top:92px"};text-align:center;
         font-size:34px;line-height:1.3;font-weight:500;letter-spacing:-.005em;padding:12px 28px;border-radius:16px;white-space:nowrap;
         background:rgba(12,16,15,.74);box-shadow:0 6px 30px rgba(0,0,0,.35);text-wrap:balance}</style><div class="c">${t}</div>`;
  }
}
pages.title = `<style>${base}
  .v{position:absolute;inset:0;background:radial-gradient(ellipse 52% 40% at 50% 50%,rgba(8,12,11,.62),rgba(8,12,11,0) 100%)}
  .t{position:absolute;left:0;right:0;top:396px;text-align:center}
  h1{margin:0;font-size:132px;font-weight:600;letter-spacing:.32em;padding-left:.32em;text-shadow:0 4px 30px rgba(0,0,0,.5)}
  p{margin:22px 0 0;font-size:40px;font-weight:400;color:rgba(255,255,255,.88);text-shadow:0 2px 16px rgba(0,0,0,.6)}
  .a{display:inline-block;width:64px;height:4px;background:#ffb85c;border-radius:2px;margin-top:30px}</style>
  <div class="v"></div><div class="t"><h1>REPO CITY</h1><div class="a"></div><p>Any GitHub repository, as a living city.</p></div>`;
pages.end = `<style>${base}
  .v{position:absolute;inset:0;background:rgba(9,13,12,.72)}
  .t{position:absolute;left:0;right:0;top:250px;text-align:center}
  .k{font-size:30px;font-weight:600;letter-spacing:.34em;padding-left:.34em;color:rgba(255,255,255,.75)}
  h1{margin:34px 0 0;font-size:86px;line-height:1.12;font-weight:600;letter-spacing:-.015em}
  h1 span{color:#ffb85c}
  .u{margin-top:64px;font-family:'Geist Mono',monospace;font-size:44px;color:#ffb85c}
  .g{margin-top:18px;font-size:28px;color:rgba(255,255,255,.62)}</style>
  <div class="v"></div><div class="t"><div class="k">REPO CITY</div>
  <h1>One repository.<br>One city.<br><span>One screen.</span></h1>
  <div class="u">repo-city-five.vercel.app</div>
  <div class="g">github.com/Robertg761/Repo-City &nbsp;·&nbsp; Built for Hackyard Yard #3</div></div>`;
const b = await launch({ port: 9380, width: 1920, height: 1080, extraArgs: ["--mute-audio"] });
try {
  await b.send("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });
  for (const [name, html] of Object.entries(pages)) {
    await b.send("Page.navigate", { url: "data:text/html;charset=utf-8," + encodeURIComponent(`<!doctype html><html><head>${FONT}</head><body>${html}</body></html>`) });
    await sleep(300);
    await b.evaluate(`document.fonts.ready.then(() => document.fonts.check('500 38px Geist'))`);
    await sleep(150);
    const { data } = await b.send("Page.captureScreenshot", { format: "png" });
    writeFileSync(`overlays/${name}.png`, Buffer.from(data, "base64"));
  }
  console.log(Object.keys(pages).length, "overlays");
} finally { await b.close(); }
