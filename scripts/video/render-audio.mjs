import { launch } from "./cdp.mjs";
import { writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
const b = await launch({ port: 9370, width: 1280, height: 800, extraArgs: ["--mute-audio"] });
try {
  await b.send("Page.navigate", { url: "http://localhost:3210/" });
  for (let i = 0; i < 120; i++) { await sleep(1000); if (await b.evaluate(`!!(window.__repoCity && window.__repoCity.audio)`).catch(() => false)) break; }
  const names = await b.evaluate(`window.__repoCity.audio.scenes()`);
  console.log(names.join(" | "));
  const want = process.argv.slice(2);
  for (const name of want) {
    const secs = 40;
    const t0 = Date.now();
    const b64 = await b.evaluate(`(async () => {
      await window.__repoCity.audio.render(${JSON.stringify(name)}, ${secs}, 1);
      const [l, r] = globalThis.__lastRender;
      const out = new Int16Array(l.length * 2);
      for (let i = 0; i < l.length; i++) { out[2*i] = Math.max(-1, Math.min(1, l[i])) * 32767; out[2*i+1] = Math.max(-1, Math.min(1, r[i])) * 32767; }
      const u8 = new Uint8Array(out.buffer); let s = '';
      for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
      return btoa(s);
    })()`);
    const pcm = Buffer.from(b64, "base64");
    const file = `audio/${name.replace(/[^a-z0-9]+/gi, "_")}.s16le`;
    writeFileSync(file, pcm);
    console.log(name, pcm.length, "bytes", Date.now() - t0, "ms");
  }
} finally { await b.close(); }
