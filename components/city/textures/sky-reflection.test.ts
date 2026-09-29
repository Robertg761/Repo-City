import { describe, expect, it } from "vitest";
import { Color } from "three";
import { atmosphere } from "../palette";
import { nightSky } from "../timeOfDay";
import { richSky } from "../grade";
import { SKY_REFLECTION, setSkyReflection, type SkyReflection } from "./sky-reflection";

const AMBIENCE = { warmth: 0.6, saturation: 0.7, fog: 0.2, trafficDensity: 0.5, pedestrianDensity: 0.5, litWindowShare: 0.6 };

const fresh = (): SkyReflection => ({
  rcSkyZenith: { value: new Color() },
  rcSkyHorizon: { value: new Color() },
  rcSkyGround: { value: new Color() },
  rcSunColor: { value: new Color() },
  rcSunDirection: { value: SKY_REFLECTION.rcSunDirection.value.clone() },
  rcGlassSky: { value: 0 },
});

const luma = (c: Color) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

describe("setSkyReflection", () => {
  const day = richSky(atmosphere(AMBIENCE, false));

  it("takes the dome's own colours and the sun's bearing", () => {
    const target = fresh();
    setSkyReflection(day, target);
    expect(target.rcSkyZenith.value.getHexString()).toBe(new Color(day.skyZenithColor).getHexString());
    expect(target.rcSkyHorizon.value.getHexString()).toBe(new Color(day.skyHorizonColor).getHexString());
    expect(target.rcSunColor.value.getHexString()).toBe(new Color(day.sunColor).getHexString());
    expect(target.rcSunDirection.value.length()).toBeCloseTo(1, 6);
    expect(target.rcSunDirection.value.y).toBeCloseTo(day.sunDirection[1] / Math.hypot(...day.sunDirection), 6);
  });

  it("gives a downward reflection a street, darker than the sky but not black", () => {
    const target = fresh();
    setSkyReflection(day, target);
    expect(luma(target.rcSkyGround.value)).toBeLessThan(luma(target.rcSkyHorizon.value));
    expect(luma(target.rcSkyGround.value)).toBeGreaterThan(0.15);
  });

  it("is the full sky by day and half of it at night, when the sky itself is dark", () => {
    const target = fresh();
    setSkyReflection(day, target);
    expect(target.rcGlassSky.value).toBe(1);
    const night = nightSky(AMBIENCE, false);
    setSkyReflection(night, target);
    expect(target.rcGlassSky.value).toBeCloseTo(0.5, 6);
    expect(luma(target.rcSkyHorizon.value)).toBeLessThan(0.1);
  });
});
