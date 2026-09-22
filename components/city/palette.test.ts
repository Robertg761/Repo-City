import { describe, expect, it } from "vitest";
import {
  BUILDING_COLORS,
  DISTRICT_COLORS,
  atmosphere,
  buildingColor,
  desaturate,
  districtColor,
  eveningFactor,
  hexToRgb,
  mix,
  rgbToHex,
  stateTint,
  sunDirection,
} from "./palette";
import type { CityModel } from "@/types/city";

const AMBIENCE: CityModel["ambience"] = {
  warmth: 0.6,
  saturation: 0.6,
  fog: 0.25,
  trafficDensity: 0.5,
  pedestrianDensity: 0.5,
  litWindowShare: 0.45,
};

const luma = (hex: string): number => {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const blueness = (hex: string): number => {
  const [r, , b] = hexToRgb(hex);
  return b - r;
};

describe("colour utilities", () => {
  it("round-trips hex through rgb", () => {
    for (const hex of [...DISTRICT_COLORS, ...BUILDING_COLORS, "#000000", "#ffffff"]) {
      expect(rgbToHex(hexToRgb(hex))).toBe(hex);
    }
  });

  it("expands three-digit hex", () => {
    expect(rgbToHex(hexToRgb("#abc"))).toBe("#aabbcc");
  });

  it("mixes towards the second colour and clamps t", () => {
    expect(mix("#000000", "#ffffff", 0)).toBe("#000000");
    expect(mix("#000000", "#ffffff", 1)).toBe("#ffffff");
    expect(mix("#000000", "#ffffff", 2)).toBe("#ffffff");
    expect(mix("#000000", "#ffffff", -1)).toBe("#000000");
    expect(mix("#000000", "#ffffff", 0.5)).toBe("#808080");
  });

  it("desaturates to a pure grey at amount 1", () => {
    const grey = hexToRgb(desaturate("#3366cc", 1));
    expect(grey[0]).toBeCloseTo(grey[1], 2);
    expect(grey[1]).toBeCloseTo(grey[2], 2);
    expect(desaturate("#3366cc", 0)).toBe("#3366cc");
  });
});

describe("palette mapping", () => {
  it("wraps indices past the end of the palette", () => {
    expect(districtColor(0)).toBe(DISTRICT_COLORS[0]);
    expect(districtColor(DISTRICT_COLORS.length)).toBe(DISTRICT_COLORS[0]);
    expect(districtColor(DISTRICT_COLORS.length + 3)).toBe(DISTRICT_COLORS[3]);
    expect(buildingColor(BUILDING_COLORS.length * 4 + 2)).toBe(BUILDING_COLORS[2]);
  });

  it("survives negative and non-finite indices", () => {
    expect(districtColor(-1)).toBe(DISTRICT_COLORS[DISTRICT_COLORS.length - 1]);
    expect(buildingColor(Number.NaN)).toBe(BUILDING_COLORS[0]);
  });

  it("never changes the art style per language: one palette only", () => {
    expect(new Set(BUILDING_COLORS).size).toBe(BUILDING_COLORS.length);
    expect(BUILDING_COLORS).toHaveLength(8);
    expect(DISTRICT_COLORS).toHaveLength(8);
  });
});

describe("stateTint", () => {
  const base = BUILDING_COLORS[0];

  it("leaves an idle entity alone", () => {
    expect(stateTint(base, false, false)).toBe(base);
  });

  it("tells hover and selection apart", () => {
    const hovered = stateTint(base, true, false);
    const selected = stateTint(base, false, true);
    expect(hovered).not.toBe(base);
    expect(selected).not.toBe(hovered);
    // Selection lifts, hover glints: the selected entity is the brighter one.
    for (const colour of BUILDING_COLORS) {
      expect(luma(stateTint(colour, false, true))).toBeGreaterThan(
        luma(stateTint(colour, true, false)),
      );
    }
  });

  it("prefers selection over hover", () => {
    expect(stateTint(base, true, true)).toBe(stateTint(base, false, true));
  });

  it("keeps a selected entity its own colour rather than repainting it", () => {
    // The ring carries the selection; the tint must not turn a sage tower
    // sepia. No channel moves more than a sixth of the way.
    for (const colour of [...BUILDING_COLORS, "#3f6fa8", "#7fa46a"]) {
      for (const [hovered, selected] of [
        [true, false],
        [false, true],
      ] as const) {
        const before = hexToRgb(colour);
        const after = hexToRgb(stateTint(colour, hovered, selected));
        for (let c = 0; c < 3; c++) {
          expect(Math.abs(after[c] - before[c])).toBeLessThan(1 / 6);
        }
      }
    }
  });

  it("brightens a selection rather than darkening it", () => {
    for (const colour of BUILDING_COLORS) {
      expect(luma(stateTint(colour, false, true))).toBeGreaterThan(luma(colour));
    }
  });

  it("still marks a white multiplier, which incidents and sites tint through", () => {
    expect(stateTint("#ffffff", true, false)).not.toBe("#ffffff");
    expect(stateTint("#ffffff", false, true)).not.toBe("#ffffff");
    expect(stateTint("#ffffff", false, true)).not.toBe(stateTint("#ffffff", true, false));
  });
});

describe("atmosphere", () => {
  it("makes an archived city cooler, greyer and quieter, but no hazier", () => {
    const live = atmosphere(AMBIENCE, false);
    const archived = atmosphere(AMBIENCE, true);

    expect(blueness(archived.sunColor)).toBeGreaterThan(blueness(live.sunColor));
    expect(archived.desaturation).toBeGreaterThan(live.desaturation);
    expect(archived.sunIntensity).toBeLessThan(live.sunIntensity);
    // Abandoned is told by colour and light, never by fog.
    expect(archived.fogNearFactor).toBe(live.fogNearFactor);
    expect(archived.fogFarFactor).toBe(live.fogFarFactor);
    // Section 39: "do not make unhealthy cities visually unreadable".
    expect(archived.sunIntensity).toBeGreaterThan(2);
    expect(luma(archived.background)).toBeGreaterThan(0.6);
  });

  it("never lets the generator's fog put haze over the city", () => {
    // The overview sits at most 1.9 of the reach from the centre and the far
    // corner of the city is 0.74 beyond it: the fog must start past that.
    for (const fog of [0, 0.5, 1, 7]) {
      for (const archived of [false, true]) {
        const a = atmosphere({ ...AMBIENCE, fog }, archived);
        expect(a.fogNearFactor).toBeGreaterThan(1.9 + 0.74);
        expect(a.exposure).toBe(atmosphere({ ...AMBIENCE, fog: 0 }, archived).exposure);
      }
    }
  });

  it("keeps the backdrop pale and clean rather than a ground haze", () => {
    for (const archived of [false, true]) {
      const a = atmosphere(AMBIENCE, archived);
      expect(luma(a.skyGroundColor)).toBeGreaterThanOrEqual(luma(a.background));
      // Blue-leaning, not the olive the old ground haze was.
      expect(blueness(a.background)).toBeGreaterThan(0.05);
    }
  });

  it("keeps the grass green rather than olive at any warmth", () => {
    for (const warmth of [0, 0.5, 1]) {
      const [r, g] = hexToRgb(atmosphere({ ...AMBIENCE, warmth }, false).terrainColor);
      expect(g - r).toBeGreaterThan(0.1);
    }
  });

  it("warms the sun as warmth rises", () => {
    const cold = atmosphere({ ...AMBIENCE, warmth: 0 }, false);
    const hot = atmosphere({ ...AMBIENCE, warmth: 1 }, false);
    expect(blueness(hot.sunColor)).toBeLessThan(blueness(cold.sunColor));
    expect(hot.sunIntensity).toBeGreaterThan(cold.sunIntensity);
  });

  it("keeps fog planes ordered and positive", () => {
    for (const fog of [0, 0.5, 1]) {
      const a = atmosphere({ ...AMBIENCE, fog }, false);
      expect(a.fogNearFactor).toBeGreaterThan(0);
      expect(a.fogFarFactor).toBeGreaterThan(a.fogNearFactor);
    }
  });

  it("dims window glow for archived repositories", () => {
    expect(atmosphere(AMBIENCE, true).windowGlow).toBeLessThan(
      atmosphere(AMBIENCE, false).windowGlow,
    );
  });
});

describe("time of day", () => {
  it("holds a quiet city at midday and lifts a busy one to the golden hour", () => {
    expect(eveningFactor(0)).toBe(0);
    expect(eveningFactor(0.55)).toBe(0);
    expect(eveningFactor(1)).toBe(1);
    expect(eveningFactor(0.78)).toBeGreaterThan(0.4);
    expect(eveningFactor(0.78)).toBeLessThan(0.6);
  });

  it("keeps an archived repository near noon whatever it scores", () => {
    // Section 19 is an abandoned town under a flat cold sky, not a sunset.
    expect(eveningFactor(1, true)).toBeLessThan(0.3);
    expect(eveningFactor(0.05, true)).toBe(0);
  });

  it("drops the sun towards the horizon as the evening comes on", () => {
    const noon = sunDirection(0);
    const dusk = sunDirection(1);
    expect(dusk[1]).toBeLessThan(noon[1]);
    // Still well above the horizon: section 39 forbids an unreadable city.
    expect(dusk[1]).toBeGreaterThan(0.4);
    for (const direction of [noon, dusk]) {
      expect(Math.hypot(...direction)).toBeCloseTo(1, 6);
    }
  });

  it("gives a golden-hour city more light and more exposure, not less", () => {
    const midday = atmosphere({ ...AMBIENCE, litWindowShare: 0.2 }, false);
    const golden = atmosphere({ ...AMBIENCE, litWindowShare: 1 }, false);

    expect(golden.evening).toBeGreaterThan(midday.evening);
    expect(golden.sunIntensity).toBeGreaterThan(midday.sunIntensity);
    expect(golden.exposure).toBeGreaterThan(midday.exposure);
    expect(golden.lampGlow).toBeGreaterThan(midday.lampGlow);
    // Warmer: the low sun is the amber one.
    expect(blueness(golden.sunColor)).toBeLessThan(blueness(midday.sunColor));
  });

  it("keeps exposure within a sane range for every city", () => {
    for (const fog of [0, 0.5, 1]) {
      for (const litWindowShare of [0, 0.5, 1]) {
        for (const archived of [false, true]) {
          const a = atmosphere({ ...AMBIENCE, fog, litWindowShare }, archived);
          expect(a.exposure).toBeGreaterThanOrEqual(1);
          expect(a.exposure).toBeLessThanOrEqual(1.2);
        }
      }
    }
  });
});

describe("sky", () => {
  it("meets the fog at the horizon, so the rim of the landscape has no seam", () => {
    const a = atmosphere(AMBIENCE, false);
    expect(a.skyHorizonColor).toBe(a.background);
  });

  it("keeps the zenith darker than the horizon", () => {
    for (const archived of [false, true]) {
      const a = atmosphere(AMBIENCE, archived);
      expect(luma(a.skyZenithColor)).toBeLessThan(luma(a.skyHorizonColor));
    }
  });

  it("gives an archived city a cooler sky and a dimmer lamp", () => {
    const live = atmosphere(AMBIENCE, false);
    const archived = atmosphere(AMBIENCE, true);
    expect(blueness(archived.skyZenithColor)).toBeLessThan(blueness(live.skyZenithColor));
    expect(archived.lampGlow).toBeLessThan(live.lampGlow);
  });
});
