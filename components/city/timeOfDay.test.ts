import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { generateCity } from "@/lib/city/generator";
import type { RepoAnalysis } from "@/types/analysis";
import type { CityModel } from "@/types/city";
import { atmosphere, hexToRgb, sunDirection, type SceneAtmosphere } from "./palette";
import { shadowReach } from "./scale";
import {
  AUTO_SPAN,
  DAY_LOOP,
  PRESET_PHASE,
  TRANSITION_MS,
  autoPhase,
  autoSky,
  easeInOut,
  keyElevation,
  lowLight,
  luminance,
  phaseAlong,
  skyAt,
  targetPhase,
  travelTo,
  wrapPhase,
  type TimePreset,
} from "./timeOfDay";

type Ambience = CityModel["ambience"];

const LIVE: Ambience = {
  warmth: 0.72,
  saturation: 0.85,
  fog: 0.12,
  trafficDensity: 0.9,
  pedestrianDensity: 1,
  litWindowShare: 0.9,
};

const PRESETS: TimePreset[] = ["morning", "afternoon", "evening", "night"];

const preset = (name: TimePreset, archived = false, ambience = LIVE) =>
  skyAt(ambience, archived, PRESET_PHASE[name]);

const blueness = (hex: string) => {
  const [r, , b] = hexToRgb(hex);
  return b - r;
};
const saturation = (hex: string) => {
  const rgb = hexToRgb(hex);
  return Math.max(...rgb) - Math.min(...rgb);
};
const colourDistance = (a: string, b: string) => {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return Math.max(...x.map((v, i) => Math.abs(v - y[i])));
};

/** Every field of two skies agrees, colours to within one step of eight bits. */
function expectSameSky(actual: SceneAtmosphere, expected: SceneAtmosphere, digits = 9): void {
  const a = actual as unknown as Record<string, unknown>;
  const e = expected as unknown as Record<string, unknown>;
  expect(Object.keys(a).sort()).toEqual(Object.keys(e).sort());
  for (const key of Object.keys(e)) {
    const want = e[key];
    const got = a[key];
    if (typeof want === "number") expect(got as number, key).toBeCloseTo(want, digits);
    else if (typeof want === "string") expect(colourDistance(got as string, want), key).toBeLessThanOrEqual(1 / 255 + 1e-9);
    else if (Array.isArray(want)) {
      want.forEach((v, i) => expect((got as number[])[i], key).toBeCloseTo(v as number, digits));
    }
  }
}

/** The committed fixtures' cities: every settlement tier, live and archived. */
const FIXTURE_CITIES: { name: string; ambience: Ambience; archived: boolean }[] = readdirSync(
  path.join(process.cwd(), "fixtures"),
)
  .filter((name) => name.endsWith(".analysis.json"))
  .sort()
  .map((name) => {
    const analysis = JSON.parse(
      readFileSync(path.join(process.cwd(), "fixtures", name), "utf8"),
    ) as RepoAnalysis;
    const city = generateCity(analysis);
    return { name, ambience: city.ambience, archived: city.repository.archived };
  });

describe("Auto is today's sky, exactly", () => {
  it("covers the fixtures, live and archived", () => {
    expect(FIXTURE_CITIES.length).toBeGreaterThanOrEqual(8);
    expect(FIXTURE_CITIES.some((c) => c.archived)).toBe(true);
  });

  it.each(FIXTURE_CITIES)("resolves $name to atmosphere() field for field", ({ ambience, archived }) => {
    expect(autoSky(ambience, archived)).toEqual(atmosphere(ambience, archived));
  });

  it.each(FIXTURE_CITIES)("puts $name on the loop where Auto draws the same sky", ({ ambience, archived }) => {
    const phase = autoPhase(ambience, archived);
    expect(phase).toBeGreaterThanOrEqual(1);
    expect(phase).toBeLessThanOrEqual(1 + AUTO_SPAN);
    expectSameSky(skyAt(ambience, archived, phase), atmosphere(ambience, archived));
  });

  it("stays exact across every activity level and both archive states", () => {
    for (let share = 0; share <= 1.2; share += 0.01) {
      for (const archived of [false, true]) {
        const ambience = { ...LIVE, litWindowShare: share };
        expect(autoSky(ambience, archived)).toEqual(atmosphere(ambience, archived));
        expectSameSky(skyAt(ambience, archived, autoPhase(ambience, archived)), atmosphere(ambience, archived));
      }
    }
  });

  it("draws the Auto sky with no night in it", () => {
    for (const { ambience, archived } of FIXTURE_CITIES) {
      const sky = autoSky(ambience, archived);
      expect(sky.nightness).toBe(0);
      expect(sky.starStrength).toBe(0);
      expect(sky.moonStrength).toBe(0);
      expect(sky.lampPool).toBe(0);
      expect(sky.headlights).toBe(0);
    }
  });

  it("widens the shadow camera exactly as the evening term did", () => {
    for (let e = 0; e <= 1; e += 0.05) {
      expect(shadowReach(100, lowLight(sunDirection(e)))).toBeCloseTo(shadowReach(100, e), 9);
    }
  });
});

describe("the four presets", () => {
  it("sends the afternoon's sun where today's midday sun is", () => {
    const afternoon = preset("afternoon");
    sunDirection(0).forEach((v, i) => expect(afternoon.sunDirection[i]).toBeCloseTo(v, 12));
  });

  it("brings the morning sun up low in the east and sets the evening's low in the west", () => {
    const morning = preset("morning").sunDirection;
    const evening = preset("evening").sunDirection;
    const noon = preset("afternoon").sunDirection;
    // East is +z (the camera's left), west +x (its right).
    expect(morning[2]).toBeGreaterThan(0.8);
    expect(Math.abs(morning[0])).toBeLessThan(0.1);
    expect(evening[0]).toBeGreaterThan(0.9);
    expect(evening[2]).toBeLessThan(0);
    // Both are low, so both throw long shadows.
    for (const low of [morning, evening]) {
      expect(keyElevation(low)).toBeLessThan(26);
      expect(keyElevation(low)).toBeGreaterThan(15);
      expect(keyElevation(low)).toBeLessThan(keyElevation(noon));
      expect(lowLight(low)).toBeGreaterThan(1);
    }
    for (const direction of [morning, evening, noon, preset("night").sunDirection]) {
      expect(Math.hypot(...direction)).toBeCloseTo(1, 9);
    }
  });

  it("warms the light from morning's pale gold to evening's amber", () => {
    const morning = preset("morning");
    const afternoon = preset("afternoon");
    const evening = preset("evening");
    expect(blueness(morning.sunColor)).toBeLessThan(blueness(afternoon.sunColor));
    expect(blueness(evening.sunColor)).toBeLessThan(blueness(morning.sunColor));
    // The morning's fill is the cool one: blue shadows under a gold sun.
    expect(blueness(morning.skyColor)).toBeGreaterThan(0.1);
  });

  it("lights more windows and lamps as the day goes on", () => {
    const [morning, afternoon, evening, night] = PRESETS.map((p) => preset(p));
    expect(morning.litWindowShare).toBeLessThan(afternoon.litWindowShare);
    expect(morning.windowGlow).toBeLessThan(evening.windowGlow);
    expect(evening.litWindowShare).toBeGreaterThanOrEqual(0.95);
    expect(evening.lampGlow).toBe(1);
    expect(night.lampGlow).toBe(1);
    expect(night.lampPool).toBe(1);
    expect(night.headlights).toBe(1);
    // Scattered at night, not every pane in the city.
    expect(night.litWindowShare).toBeGreaterThan(0.5);
    expect(night.litWindowShare).toBeLessThan(0.9);
  });

  it("makes night a deep blue, never black, with stars and a moon", () => {
    const night = preset("night");
    expect(night.nightness).toBe(1);
    expect(night.starStrength).toBe(1);
    expect(night.moonStrength).toBe(1);
    // Deep blue: dark, but a colour, and blue.
    expect(luminance(night.skyZenithColor)).toBeLessThan(0.15);
    expect(luminance(night.skyZenithColor)).toBeGreaterThan(0.02);
    expect(blueness(night.skyZenithColor)).toBeGreaterThan(0.1);
    // A gradient: the horizon is lighter than the zenith.
    expect(luminance(night.skyHorizonColor)).toBeGreaterThan(luminance(night.skyZenithColor));
    expect(luminance(night.background)).toBeGreaterThan(0.1);
    // Moonlight: cool.
    expect(blueness(night.sunColor)).toBeGreaterThan(0.1);
  });

  it("keeps the night readable: a real key, a real fill and a lifted exposure", () => {
    const night = preset("night");
    expect(night.sunIntensity).toBeGreaterThanOrEqual(1.2);
    expect(night.hemiIntensity).toBeGreaterThanOrEqual(0.9);
    expect(night.exposure).toBeGreaterThan(1.1);
    expect(night.exposure).toBeLessThanOrEqual(1.25);
    expect(keyElevation(night.sunDirection)).toBeGreaterThan(28);
  });

  it("keeps exposure sane at every hour", () => {
    for (let p = 0; p < DAY_LOOP; p += 0.02) {
      for (const archived of [false, true]) {
        const sky = skyAt(LIVE, archived, p);
        expect(sky.exposure).toBeGreaterThanOrEqual(1);
        expect(sky.exposure).toBeLessThanOrEqual(1.25);
        expect(sky.sunIntensity).toBeGreaterThan(0.5);
        expect(keyElevation(sky.sunDirection)).toBeGreaterThan(0);
      }
    }
  });

  it("keeps an archived city cool and drained at every hour", () => {
    for (const name of PRESETS) {
      const live = preset(name);
      const archived = preset(name, true);
      expect(saturation(archived.sunColor), name).toBeLessThanOrEqual(saturation(live.sunColor) + 1e-9);
      expect(saturation(archived.skyZenithColor), name).toBeLessThanOrEqual(saturation(live.skyZenithColor) + 1e-9);
      expect(archived.lampGlow, name).toBeLessThanOrEqual(live.lampGlow);
      expect(archived.windowGlow, name).toBeLessThanOrEqual(live.windowGlow);
      expect(archived.litWindowShare, name).toBeLessThanOrEqual(live.litWindowShare);
      expect(archived.desaturation, name).toBeGreaterThan(live.desaturation);
    }
    // Still lit at night, and still readable.
    expect(preset("night", true).lampGlow).toBeGreaterThan(0.3);
    expect(preset("night", true).sunIntensity).toBeGreaterThanOrEqual(1.2);
  });

  it("wraps phases and resolves each setting to its place on the loop", () => {
    expect(wrapPhase(4)).toBe(0);
    expect(wrapPhase(-0.5)).toBe(3.5);
    expect(wrapPhase(7.25)).toBe(3.25);
    for (const name of PRESETS) expect(targetPhase(name, LIVE, false)).toBe(PRESET_PHASE[name]);
    expect(targetPhase("auto", LIVE, false)).toBe(autoPhase(LIVE, false));
  });
});

describe("transitions", () => {
  it("takes the short way round the loop, and goes forward on a tie", () => {
    expect(travelTo(1, 3)).toBe(3); // afternoon to night: through the evening
    expect(travelTo(3, 1)).toBe(5); // night to afternoon: on through the dawn
    expect(travelTo(0, 3)).toBe(-1); // morning to night: back through the small hours
    expect(travelTo(3, 0)).toBe(4); // night to morning: forward
    expect(travelTo(2, 0)).toBe(4); // evening to morning: forward through the night
    expect(travelTo(1.72, 1.72)).toBe(1.72);
    // Mid-trip, from an unwrapped phase.
    expect(wrapPhase(travelTo(4.6, 3))).toBeCloseTo(3, 12);
    expect(Math.abs(travelTo(4.6, 3) - 4.6)).toBeLessThanOrEqual(DAY_LOOP / 2);
  });

  it("eases from start to end without overshooting", () => {
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(1)).toBe(1);
    expect(easeInOut(0.5)).toBeCloseTo(0.5, 12);
    let last = 0;
    for (let t = 0; t <= 1.0001; t += 0.01) {
      const v = easeInOut(t);
      expect(v).toBeGreaterThanOrEqual(last);
      last = v;
    }
    expect(phaseAlong(1, 3, 0)).toBe(1);
    expect(phaseAlong(1, 3, TRANSITION_MS)).toBe(3);
    expect(phaseAlong(1, 3, TRANSITION_MS * 2)).toBe(3);
    expect(phaseAlong(1, 3, 10, 0)).toBe(3);
  });

  /** Samples a whole trip, frame by frame at 60 fps. */
  const trip = (from: number, to: number, archived = false) => {
    const end = travelTo(from, to);
    const frames: SceneAtmosphere[] = [];
    for (let ms = 0; ms <= TRANSITION_MS; ms += 1000 / 60) {
      frames.push(skyAt(LIVE, archived, phaseAlong(from, end, ms)));
    }
    frames.push(skyAt(LIVE, archived, end));
    return frames;
  };

  it("falls into night monotonically from the afternoon", () => {
    for (const archived of [false, true]) {
      const frames = trip(PRESET_PHASE.afternoon, PRESET_PHASE.night, archived);
      for (let i = 1; i < frames.length; i++) {
        expect(frames[i].nightness).toBeGreaterThanOrEqual(frames[i - 1].nightness - 1e-12);
        expect(frames[i].starStrength).toBeGreaterThanOrEqual(frames[i - 1].starStrength - 1e-12);
        expect(frames[i].lampGlow).toBeGreaterThanOrEqual(frames[i - 1].lampGlow - 1e-12);
        expect(luminance(frames[i].skyZenithColor)).toBeLessThanOrEqual(
          luminance(frames[i - 1].skyZenithColor) + 1 / 255,
        );
      }
      expect(frames[0].nightness).toBe(0);
      expect(frames[frames.length - 1].nightness).toBe(1);
    }
  });

  it("brings the day back monotonically from night to morning", () => {
    const frames = trip(PRESET_PHASE.night, PRESET_PHASE.morning);
    for (let i = 1; i < frames.length; i++) {
      expect(frames[i].nightness).toBeLessThanOrEqual(frames[i - 1].nightness + 1e-12);
      expect(luminance(frames[i].skyZenithColor)).toBeGreaterThanOrEqual(
        luminance(frames[i - 1].skyZenithColor) - 1 / 255,
      );
    }
    expect(frames[frames.length - 1].nightness).toBe(0);
  });

  it("raises the sun steadily from morning to afternoon, and lowers it into the evening", () => {
    const rising = trip(PRESET_PHASE.morning, PRESET_PHASE.afternoon).map((f) => keyElevation(f.sunDirection));
    for (let i = 1; i < rising.length; i++) expect(rising[i]).toBeGreaterThanOrEqual(rising[i - 1] - 1e-9);
    const setting = trip(PRESET_PHASE.afternoon, PRESET_PHASE.evening).map((f) => keyElevation(f.sunDirection));
    for (let i = 1; i < setting.length; i++) expect(setting[i]).toBeLessThanOrEqual(setting[i - 1] + 1e-9);
  });

  it("has no jumps: neighbouring phases give neighbouring skies", () => {
    for (const archived of [false, true]) {
      for (let p = 0; p < DAY_LOOP; p += 0.005) {
        const a = skyAt(LIVE, archived, p);
        const b = skyAt(LIVE, archived, p + 0.005);
        expect(Math.abs(a.exposure - b.exposure)).toBeLessThan(0.02);
        expect(Math.abs(a.hemiIntensity - b.hemiIntensity)).toBeLessThan(0.05);
        expect(Math.abs(a.nightness - b.nightness)).toBeLessThan(0.02);
        expect(colourDistance(a.background, b.background)).toBeLessThan(0.03);
        expect(colourDistance(a.skyZenithColor, b.skyZenithColor)).toBeLessThan(0.03);
        // The key light hands over from sun to moon at its weakest; anywhere
        // else its strength moves smoothly.
        expect(Math.abs(a.sunIntensity - b.sunIntensity)).toBeLessThan(0.1);
      }
    }
  });

  it("lands exactly on each preset", () => {
    for (const name of PRESETS) {
      const end = PRESET_PHASE[name];
      const from = wrapPhase(end + 1.3);
      const target = travelTo(from, end);
      expectSameSky(skyAt(LIVE, false, phaseAlong(from, target, TRANSITION_MS)), preset(name));
    }
  });
});
