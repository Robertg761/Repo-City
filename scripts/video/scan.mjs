import { createRecorder } from "./recorder.mjs";
import { writeFileSync } from "node:fs";
const r = await createRecorder({ outDir: "takes/scan" + (process.argv[5] ?? ""), port: 9341 + Number(process.argv[5] ?? 0) });
try {
  await r.goto("https://repo-city-five.vercel.app/?time=evening");
  await r.waitFor(`!!document.querySelector('input[aria-label="GitHub repository"]')`);
  await r.seconds(1);
  const inp = await r.rectOf(`document.querySelector('input[aria-label="GitHub repository"]')`);
  await r.moveTo(inp.x, inp.y, 10); await r.click(); await r.type("honojs/hono", 2); await r.key("Enter","Enter",13);
  await r.waitFor(`/constructed/i.test(document.body.innerText)`, { max: 3600 });
  await r.seconds(3);
  const zx = Number(process.argv[2] ?? 760), zy = Number(process.argv[3] ?? 560), dz = Number(process.argv[4] ?? -1200);
  await r.moveTo(zx, zy, 20);
  if (dz) await r.wheel(dz, 90);
  await r.seconds(2);
  r.segment("after_zoom"); await r.tick(1); r.stop();
  const hits = [];
  for (let y = 120; y < 1000; y += 22) for (let x = 330; x < 1620; x += 22) {
    const t = await r.probe(x, y);
    if (t) hits.push({ x, y, t: t.replace(/\n+/g, " | ") });
  }
  const byT = new Map();
  for (const h of hits) { const k = h.t; if (!byT.has(k)) byT.set(k, []); byT.get(k).push([h.x, h.y]); }
  const out = [...byT.entries()].map(([t, pts]) => ({ t, n: pts.length, x: Math.round(pts.reduce((a,p)=>a+p[0],0)/pts.length), y: Math.round(pts.reduce((a,p)=>a+p[1],0)/pts.length) }));
  writeFileSync("takes/scan" + (process.argv[5] ?? "") + "/hits.json", JSON.stringify(out, null, 1));
  console.log(out.length, "entities");
  for (const o of out) if (!/\.(ts|tsx|js|md|json|yml|mjs)\b/.test(o.t)) console.log(o.x, o.y, o.n, o.t);
} finally { await r.close(); }
