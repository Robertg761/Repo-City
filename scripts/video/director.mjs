import { createRecorder, ease } from "./recorder.mjs";
import { writeFileSync } from "node:fs";
const OUT = process.argv[2] ?? "takes/final";
const r = await createRecorder({ outDir: OUT, port: 9350 });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const byText = (re) => `[...document.querySelectorAll('button')].find(b => ${re}.test(b.textContent.trim()))`;
async function restOnInspector() {
  const why = await r.rectOf(`[...document.querySelectorAll('[aria-label="Selected object"] *')].filter(e => e.children.length === 0 && /why this exists/i.test(e.textContent)).pop()`);
  if (why) await r.moveTo(why.x + 40, why.y + 34, 55);
}
async function surveyVia(analyzeAnother, repo) {
  if (analyzeAnother) {
    const a = await r.rectOf(byText(`/analyze another/i`));
    await r.moveTo(a.x, a.y, 40); await r.seconds(0.15); await r.click(); await r.seconds(0.4);
  } else {
    const inp = await r.rectOf(`document.querySelector('input[aria-label="GitHub repository"]')`);
    await r.moveTo(inp.x - 150, inp.y, 45); await r.seconds(0.1); await r.click(); await r.seconds(0.3);
  }
  await r.type(repo, 5); await r.seconds(0.35);
  r.mark(`enter ${repo}`);
  await r.key("Enter", "Enter", 13);
  // Park the cursor out of the way while the city rises.
  await r.moveTo(1790, 965, 55);
  await r.seconds(1);
}
try {
  await r.goto("https://repo-city-five.vercel.app/?time=evening");
  await r.waitFor(`!!document.querySelector('input[aria-label="GitHub repository"]')`);
  await r.seconds(2);

  // B + C: landing, type, survey, reveal.
  r.segment("B_hono");
  await r.seconds(0.8);
  await surveyVia(false, "honojs/hono");
  await r.waitFor(`/City of hono/i.test(document.body.innerText) && /constructed/i.test(document.body.innerText)`, { max: 3600 });
  r.mark("constructed");
  await r.seconds(6);
  r.stop();

  // D: zoom and inspect a long-standing issue.
  r.segment("D_issue");
  await r.moveTo(1150, 600, 40);
  await r.wheel(-450, 100);
  await r.seconds(0.4);
  const second = await r.find(/Issue #\d+ · (Long standing|Minor|Major|Critical)/, { x: 1300, y: 640, radius: 110, step: 10 });
  const hero = await r.find(/#2723|Long standing/, { x: 889, y: 630, radius: 90, step: 8 });
  log("targets", JSON.stringify({ second, hero }));
  if (second && hero && second.t !== hero.t) {
    await r.moveTo(second.x, second.y, 40); r.mark("hover second"); await r.seconds(1.6);
  }
  await r.moveTo(hero.x, hero.y, 40); r.mark("hover hero"); await r.seconds(0.9);
  await r.click(); r.mark("click hero");
  await r.waitFor(`!!document.querySelector('[aria-label="Selected object"]')`, { max: 600, every: 2 });
  await r.seconds(0.6);
  await restOnInspector();
  await r.seconds(4.0);
  r.stop();

  // E: a pull request's building site.
  await r.key("Escape", "Escape", 27);
  await r.seconds(3);
  r.segment("E_pr");
  await r.moveTo(1400, 720, 45);
  await r.wheel(-420, 90);
  await r.seconds(0.3);
  let pr = await r.find(/Pull request #\d+ · Open/, { x: 1400, y: 720, radius: 260, step: 12 });
  log("pr", JSON.stringify(pr));
  if (pr) {
    await r.moveTo(pr.x, pr.y, 40); r.mark("hover pr"); await r.seconds(1.6);
    await r.click(); r.mark("click pr");
    await r.waitFor(`!!document.querySelector('[aria-label="Selected object"]')`, { max: 600, every: 2 });
    await r.seconds(0.6);
    await restOnInspector();
    await r.seconds(3.2);
  }
  r.stop();
  await r.key("Escape", "Escape", 27);
  await r.seconds(3);

  // F: night.
  r.segment("F_night");
  const moon = await r.rectOf(`[...document.querySelectorAll('[aria-label="Time of day"] button')].pop()`);
  log("moon", JSON.stringify(moon));
  await r.moveTo(moon.x, moon.y, 45); await r.seconds(0.2); await r.click(); r.mark("night");
  await r.moveTo(moon.x + 220, moon.y - 260, 70);
  await r.seconds(3.5);
  r.stop();

  // G: village.
  r.segment("G_village");
  await surveyVia(true, "sindresorhus/p-limit");
  await r.waitFor(`/Village of p-limit/i.test(document.body.innerText) && /constructed/i.test(document.body.innerText)`, { max: 3600 });
  r.mark("constructed");
  await r.seconds(5);
  r.stop();

  // H: metropolis.
  r.segment("H_react");
  await surveyVia(true, "facebook/react");
  await r.waitFor(`/Greater react/i.test(document.body.innerText) && /constructed/i.test(document.body.innerText)`, { max: 60 * 90 });
  r.mark("constructed");
  await r.seconds(3);
  await r.moveTo(1100, 620, 40);
  await r.drag(-380, 0, 200, { fn: ease.sine });
  await r.seconds(0.5);
  const chip = await r.rectOf(`[...document.querySelectorAll('*')].filter(e => e.children.length === 0 && /on the streets/i.test(e.textContent)).pop()`);
  log("chip", JSON.stringify(chip), await r.evaluate(`[...document.querySelectorAll('*')].filter(e => e.children.length === 0 && /on the streets/i.test(e.textContent)).map(e => e.textContent).join(' / ')`));
  if (chip) { await r.moveTo(chip.x + 10, chip.y + 4, 45); r.mark("chip"); await r.seconds(2.5); }
  r.stop();

  if (process.env.TOUR) {
  // I: the tour.
  r.segment("I_tour");
  const tour = await r.rectOf(`document.querySelector('[aria-label^="Play a guided tour"]')`);
  await r.moveTo(tour.x, tour.y, 45); await r.seconds(0.2); await r.click(); r.mark("tour start");
  await r.cursor(false);
  await r.seconds(2);
  await r.waitFor(`!document.querySelector('[aria-label="City tour"]')`, { max: 60 * 100, every: 10 });
  r.mark("tour end");
  await r.seconds(1.5);
  r.stop();
  }

  // A: cold-open aerial at evening, the interface hidden, a slow orbit and push in.
  await r.cursor(false);
  await r.evaluate(`[...document.querySelectorAll('[aria-label="Time of day"] button')][3].click()`);
  await r.seconds(3);
  await r.evaluate(`(() => { const st = document.createElement('style'); st.id = '__rc_clean'; st.textContent = '* { visibility: hidden !important } canvas { visibility: visible !important }'; document.head.appendChild(st); })()`);
  r.state.mouse = { x: 1500, y: 980 };
  await r.mouseEvent("mouseMoved", { button: "none" });
  await r.seconds(1);
  r.segment("A_cold");
  r.state.buttons = 1;
  await r.mouseEvent("mousePressed", { button: "left", clickCount: 1 });
  const N = 600;
  await r.tick(N, async (i) => {
    r.state.mouse = { x: 1500 - 150 * ((i + 1) / N), y: 980 };
    await r.mouseEvent("mouseMoved", { button: "left" });
    r.sendInput("Input.dispatchMouseEvent", { type: "mouseWheel", x: 960, y: 540, deltaX: 0, deltaY: -0.55 });
  });
  r.stop();
  r.state.buttons = 0;
  await r.mouseEvent("mouseReleased", { button: "left", clickCount: 1 });
  await r.tick(2);
} catch (e) {
  console.error("FAILED", e);
  process.exitCode = 1;
} finally {
  writeFileSync(`${OUT}/marks.json`, JSON.stringify(r.marks, null, 1));
  await r.close();
}
