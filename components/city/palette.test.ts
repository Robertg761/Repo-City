import { describe, expect, it } from "vitest";
import {
  BUILDING_COLORS,
  DISTRICT_COLORS,
  atmosphere,
  buildingColor,
  desaturate,
  districtColor,
  hexToRgb,
  mix,
  rgbToHex,
  stateTint,
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

  it("moves further from the base when selected than when hovered", () => {
    const hovered = stateTint(base, true, false);
    const selected = stateTint(base, false, true);
    expect(hovered).not.toBe(base);
    expect(selected).not.toBe(hovered);
    // Selection is the warm accent: markedly more red than blue.
    expect(blueness(selected)).toBeLessThan(blueness(hovered));
  });

  it("prefers selection over hover", () => {
    expect(stateTint(base, true, true)).toBe(stateTint(base, false, true));
  });
});

describe("atmosphere", () => {
  it("makes an archived city cooler and foggier without going dark", () => {
    const live = atmosphere(AMBIENCE, false);
    const archived = atmosphere(AMBIENCE, true);

    expect(blueness(archived.sunColor)).toBeGreaterThan(blueness(live.sunColor));
    expect(archived.fogFarFactor).toBeLessThan(live.fogFarFactor);
    expect(archived.desaturation).toBeGreaterThan(live.desaturation);
    // Section 39: "do not make unhealthy cities visually unreadable".
    expect(archived.sunIntensity).toBeGreaterThan(1.2);
    expect(luma(archived.background)).toBeGreaterThan(0.45);
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
