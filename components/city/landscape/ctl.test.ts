import { describe, expect, it } from "vitest";
import { TIERS, tierCity } from "./cities";
import { CTL_REACH, bakeControl, bakeJob, desireLines, sampleControl } from "./ctl";
import { planLandscape } from "./plan";

const bake = (tier: (typeof TIERS)[number], size = 192) => {
  const city = tierCity(tier);
  const plan = planLandscape(city);
  return { city, plan, control: bakeControl(city, plan, size) };
};

describe("the ground's control map", () => {
  it.each(TIERS)("%s: covers the plot and the apron, is deterministic, and is all meadow at its border", (tier) => {
    const { city, plan, control } = bake(tier);
    expect(control.span).toBeCloseTo(plan.half * 2 * CTL_REACH, 6);
    const again = bakeControl(city, planLandscape(city), 192);
    expect(Buffer.from(again.data).equals(Buffer.from(control.data))).toBe(true);
    for (let i = 0; i < control.size; i += 8) {
      expect(control.data[i * 4]).toBeGreaterThan(240);
      expect(control.data[(control.size * i) * 4]).toBeGreaterThan(240);
    }
  });

  it("the lawn frays into meadow across a ragged band round the verge, with no straight slab edge", () => {
    const { plan, control } = bake("city");
    const half = plan.half;
    // Deep inside the plot is mostly lawn; beyond the verge it is meadow.
    let inside = 0;
    let outside = 0;
    let n = 0;
    for (let i = 0; i < 400; i++) {
      const a = i * 2.399;
      inside += sampleControl(control, Math.cos(a) * half * 0.4 * Math.sqrt((i % 20) / 20 + 0.1), Math.sin(a) * half * 0.4 * Math.sqrt((i % 20) / 20 + 0.1), 0);
      outside += sampleControl(control, Math.cos(a) * half * 1.7, Math.sin(a) * half * 1.7, 0) ;
      n++;
    }
    expect(inside / n).toBeLessThan(0.45);
    expect(outside / n).toBeGreaterThan(0.95);
    // Along the plot's own edge the meadow share varies: the edge is not a line.
    const along: number[] = [];
    for (let s = -half * 0.8; s <= half * 0.8; s += half * 0.05) along.push(sampleControl(control, s, half * 1.04, 0));
    expect(Math.max(...along) - Math.min(...along)).toBeGreaterThan(0.15);
  });

  it("grows no grass on roads, pavements or buildings, and some elsewhere", () => {
    const { city, control } = bake("city", 384);
    for (const road of city.roads.slice(0, 40)) {
      const mx = (road.from[0] + road.to[0]) / 2;
      const mz = (road.from[2] + road.to[2]) / 2;
      expect(sampleControl(control, mx, mz, 3)).toBeLessThan(0.05);
    }
    for (const b of city.buildings.slice(0, 60)) {
      expect(sampleControl(control, b.position[0], b.position[2], 3)).toBeLessThan(0.2);
    }
    let grass = 0;
    let total = 0;
    for (let i = 0; i < control.size; i += 4) {
      for (let j = 0; j < control.size; j += 4) {
        grass += control.data[(j * control.size + i) * 4 + 3] > 200 ? 1 : 0;
        total++;
      }
    }
    expect(grass / total).toBeGreaterThan(0.25);
  });

  it("grows none in a city's paved district plates, but plenty in a village (whose plates are invisible)", () => {
    const share = (tier: (typeof TIERS)[number]) => {
      const { plan, control } = bake(tier, 384);
      let grass = 0;
      let total = 0;
      for (let x = -plan.half; x < plan.half; x += plan.half / 40) {
        for (let z = -plan.half; z < plan.half; z += plan.half / 40) {
          grass += sampleControl(control, x, z, 3) > 0.5 ? 1 : 0;
          total++;
        }
      }
      return grass / total;
    };
    const city = tierCity("city");
    const c = bake("city", 384).control;
    const d = city.districts[0];
    expect(sampleControl(c, d.rect.x, d.rect.z, 3)).toBeLessThan(0.1);
    expect(share("village")).toBeGreaterThan(share("city") + 0.1);
  });

  it("wears desire lines between buildings, and varies dryness in soft patches", () => {
    const { city, control } = bake("town", 384);
    expect(desireLines(city).length).toBeGreaterThan(5);
    let worn = 0;
    let dry = 0;
    let dryLow = 255;
    for (let i = 0; i < control.size * control.size; i++) {
      if (control.data[i * 4 + 2] > 80) worn++;
      dry = Math.max(dry, control.data[i * 4 + 1]);
      dryLow = Math.min(dryLow, control.data[i * 4 + 1]);
    }
    expect(worn).toBeGreaterThan(200);
    expect(dry - dryLow).toBeGreaterThan(90);
  });

  it("can be baked a little at a time, to the same map", () => {
    const city = tierCity("village");
    const plan = planLandscape(city);
    const whole = bakeControl(city, plan, 128);
    const job = bakeJob(city, plan, 128);
    let steps = 0;
    while (!job.run(0.5)) steps++;
    expect(steps).toBeGreaterThan(2);
    expect(Buffer.from(job.control.data).equals(Buffer.from(whole.data))).toBe(true);
  });

  it("keeps its bytes out of React's sight: the data is not enumerable", () => {
    const { control } = bake("village", 64);
    expect(Object.keys(control)).not.toContain("data");
  });
});
