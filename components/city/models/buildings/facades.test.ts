import { describe, expect, it } from "vitest";
import type { Building } from "@/types/city";
import { CITY_ARCHETYPE_IDS, type ModelKey } from "./archetypes";
import { cityMaterial } from "./cityMaterial";
import {
  DISTRICT_TINT,
  FACADES,
  GLASS_TINTS,
  ROOFS,
  cityPaint,
  districtLean,
  hasFacadeRecipe,
  rolePaint,
  weather,
} from "./facades";
import { PAINT_ACCENT, PAINT_GLASS, PAINT_NONE, PAINT_ROOF, PAINT_WALL } from "./mesh";
import { planBuildings } from "./placement";
import { desaturate, hexToRgb, mix } from "../../palette";
import { SURFACE } from "../../textures/surface-types";
import { blenderRole } from "./models";
import { LOOK, MATERIALS_PALETTE, RICH_GRADE, readLook } from "../../look";
import { RICH, filmGrade, richSky } from "../../grade";
import { atmosphere } from "../../palette";
import { nightSky } from "../../timeOfDay";

function building(id: string, colorIndex = 0, size: [number, number, number] = [4, 4.2, 4]): Building {
  return {
    id,
    kind: "building",
    position: [10, 0, 10],
    rotationY: 0,
    title: id,
    subtitle: "",
    description: "",
    reason: "",
    sourceUrl: null,
    visualState: "normal",
    appearAt: 0,
    districtId: "d1",
    size,
    tier: 2,
    colorIndex,
    plan: {
      id,
      path: `src/${id}.ts`,
      kind: "file",
      districtId: "d1",
      score: 1,
      tier: 2,
      descendantCount: 0,
      language: "TypeScript",
      role: null,
      landmark: null,
    },
  };
}

const CITY_MODELS: ModelKey[] = [...CITY_ARCHETYPE_IDS, "tower-glass", "tower-twin", "tower-spire"];
const HEX = /^#[0-9a-f]{6}$/;

describe("look switches", () => {
  it("reads palette and grade from the query, defaulting to the material palette and the rich grade", () => {
    expect(readLook("")).toEqual({ palette: "materials", grade: "rich" });
    expect(readLook("?quality=high")).toEqual({ palette: "materials", grade: "rich" });
    expect(readLook("?palette=materials&grade=rich")).toEqual({ palette: "materials", grade: "rich" });
    expect(readLook("?palette=classic")).toEqual({ palette: "classic", grade: "rich" });
    expect(readLook("?grade=classic&quality=high")).toEqual({ palette: "materials", grade: "classic" });
    expect(readLook("?palette=classic&grade=classic")).toEqual({ palette: "classic", grade: "classic" });
    expect(readLook("?palette=nonsense&grade=")).toEqual({ palette: "materials", grade: "rich" });
  });

  it("is what node and the server see: the new look, with the classic one a URL away", () => {
    expect(LOOK).toEqual({ palette: "materials", grade: "rich" });
    expect(MATERIALS_PALETTE).toBe(true);
    expect(RICH_GRADE).toBe(true);
  });

  it("makes the rich grade and the material paint the defaults of their pure functions", () => {
    const day = atmosphere({ warmth: 0.6, saturation: 0.7, fog: 0.2, trafficDensity: 0.5, pedestrianDensity: 0.5, litWindowShare: 0.6 }, false);
    expect(richSky(day)).not.toBe(day);
    expect(filmGrade().saturation).toBeGreaterThan(0);
    expect(cityMaterial(() => [0.5, 0.5, 0.5])({ role: "roof" } as never).paint).toBe(PAINT_ROOF);
    expect(cityMaterial(() => [0.5, 0.5, 0.5], false)({ role: "roof" } as never)).toEqual({ color: [0.5, 0.5, 0.5] });
  });
});

describe("facade materials", () => {
  it("has a recipe for every city archetype and no settlement model", () => {
    for (const model of CITY_MODELS) expect(hasFacadeRecipe(model)).toBe(true);
    for (const model of ["cottage", "farmhouse", "barn", "shopfront", "terrace", "apartment-low"] as ModelKey[]) {
      expect(hasFacadeRecipe(model)).toBe(false);
      expect(cityPaint(model, building("a"))).toBeNull();
    }
  });

  it("is deterministic for a path and varies across paths", () => {
    const a = cityPaint("house", building("alpha"));
    expect(cityPaint("house", building("alpha"))).toEqual(a);
    const walls = new Set(Array.from({ length: 60 }, (_, i) => cityPaint("house", building(`b${i}`))!.wall));
    expect(walls.size).toBeGreaterThan(8);
  });

  it("paints in valid hex and a texture surface that matches the material", () => {
    for (const model of CITY_MODELS) {
      for (let i = 0; i < 40; i++) {
        const paint = cityPaint(model, building(`x${i}`, i))!;
        for (const hex of [paint.wall, paint.accent, paint.roof, paint.glass]) expect(hex).toMatch(HEX);
        const brick = FACADES.brick.some((f) => f.id === paint.facade);
        const stone = FACADES.stone.some((f) => f.id === paint.facade);
        const render = FACADES.render.some((f) => f.id === paint.facade);
        if (brick) expect(paint.wallSurface).toBe(SURFACE.brick);
        if (stone) expect(paint.wallSurface).toBe(SURFACE.stone);
        if (render) expect(paint.wallSurface).toBe(SURFACE.plaster);
        expect(Object.values(ROOFS).some((r) => r.id === paint.roofId && r.surface === paint.roofSurface)).toBe(true);
      }
    }
  });

  it("suits the facade to the archetype: no glass-tower brick, no bungalow curtain wall", () => {
    const towers = new Set<string>();
    const houses = new Set<string>();
    for (let i = 0; i < 200; i++) {
      towers.add(FACADES.brick.some((f) => f.id === cityPaint("tower-glass", building(`t${i}`, i))!.facade) ? "brick" : "other");
      houses.add(cityPaint("house", building(`h${i}`, i))!.roofId);
    }
    expect(towers.has("brick")).toBe(false);
    expect([...houses].every((id) => ["slate", "slate-warm", "terracotta"].includes(id))).toBe(true);
  });

  it("gives towers a tinted glass and everything else clear glass", () => {
    const tints = new Set(Array.from({ length: 80 }, (_, i) => cityPaint("tower-glass", building(`g${i}`, i))!.glassId));
    expect(tints).toEqual(new Set(GLASS_TINTS.map((t) => t.id)));
    expect(cityPaint("house", building("h"))!.glassId).toBe("clear");
  });

  it("keeps the district colour a light tint, and leans a district towards a family", () => {
    const paint = cityPaint("lowrise-parapet", building("q", 3))!;
    const material = [...FACADES.brick, ...FACADES.stone, ...FACADES.render, ...FACADES.concrete].find((f) => f.id === paint.facade)!;
    const a = hexToRgb(paint.wall);
    const b = hexToRgb(material.hex);
    for (let c = 0; c < 3; c++) expect(Math.abs(a[c] - b[c])).toBeLessThan(DISTRICT_TINT + 0.001);
    expect(districtLean(0)).toBe(0);
    for (let i = 0; i < 20; i++) expect(districtLean(i)).toBeLessThan(0.3);
    expect(districtLean(Number.NaN)).toBe(0);
  });

  it("weathers gently: a light desaturation and grime, never grey", () => {
    expect(weather("#a5533f", 0)).toBe("#a5533f");
    const worn = weather("#a5533f", 0.3);
    const channelSpread = (hex: string) => Math.max(...hexToRgb(hex)) - Math.min(...hexToRgb(hex));
    expect(channelSpread(worn)).toBeGreaterThan(channelSpread(desaturate("#a5533f", 0.3)));
    expect(channelSpread(worn)).toBeLessThan(channelSpread("#a5533f"));
    expect(worn).toBe(desaturate(mix("#a5533f", "#6e675d", 0.06), 0.135));
  });
});

describe("material roles", () => {
  const base = blenderRole("wall");

  it("maps each role to a paint channel", () => {
    expect(rolePaint("wall", base).paint).toBe(PAINT_WALL);
    expect(rolePaint("trim", base).paint).toBe(PAINT_WALL);
    expect(rolePaint("roof", base).paint).toBe(PAINT_ROOF);
    expect(rolePaint("deck", base).paint).toBe(PAINT_ROOF);
    expect(rolePaint("door", base).paint).toBe(PAINT_ACCENT);
    expect(rolePaint("frame", base).paint).toBe(PAINT_ACCENT);
    expect(rolePaint("glass", base).paint).toBe(PAINT_GLASS);
    expect(rolePaint("glass5", base).paint).toBe(PAINT_GLASS);
    expect(rolePaint("plinth", base).paint).toBe(PAINT_NONE);
    expect(rolePaint("window", base).paint).toBe(PAINT_NONE);
    expect(rolePaint("something-new", base)).toEqual({ color: base, paint: PAINT_WALL });
  });

  it("changes nothing unless the palette is on", () => {
    const mat = { role: "roof", surface: "slate", hex: "#8d8c8c", tone: 1 };
    expect(cityMaterial(blenderRole, false)(mat)).toEqual({ color: blenderRole("roof") });
    expect(cityMaterial(blenderRole, true)(mat).paint).toBe(PAINT_ROOF);
  });
});

describe("planning with the materials palette", () => {
  it("paints only when asked, and only the city's shapes", () => {
    const list = Array.from({ length: 30 }, (_, i) => building(`p${i}`, i));
    const off = planBuildings(list, { litShare: 1 });
    expect(off.instances.every((i) => i.city === undefined)).toBe(true);
    const on = planBuildings(list, { litShare: 1, materials: true });
    expect(on.instances.every((i) => i.city !== undefined)).toBe(true);
    const village = planBuildings(list, { litShare: 1, materials: true, settlement: "village" });
    expect(village.instances.every((i) => i.city === undefined)).toBe(true);
  });
});

describe("a palette that is not gloomy", () => {
  const luma = (hex: string) => {
    const [r, g, b] = hexToRgb(hex);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const saturation = (hex: string) => {
    const [r, g, b] = hexToRgb(hex);
    const hi = Math.max(r, g, b);
    return hi === 0 ? 0 : (hi - Math.min(r, g, b)) / hi;
  };

  it("keeps even the darkest facade and roof a mid tone, so a shaded wall still has colour to show", () => {
    for (const [family, list] of Object.entries(FACADES)) {
      for (const facade of list) expect(luma(facade.hex), `${family}/${facade.id}`).toBeGreaterThan(0.36);
    }
    for (const roof of Object.values(ROOFS)) expect(luma(roof.hex), roof.id).toBeGreaterThan(0.36);
  });

  it("keeps glass light, and bronze quiet beside blue, green and smoke", () => {
    for (const tint of GLASS_TINTS) expect(luma(tint.hex), tint.id).toBeGreaterThan(0.5);
    const bronze = GLASS_TINTS.find((t) => t.id === "bronze")!;
    expect(saturation(bronze.hex)).toBeLessThan(0.16);
    for (const tint of GLASS_TINTS.filter((t) => t.id !== "bronze")) {
      expect(saturation(tint.hex), tint.id).toBeGreaterThan(saturation(bronze.hex));
    }
  });

  it("does not let the dark foot of a curtain wall's glass go black: it still catches the sky", () => {
    for (const role of ["glass", "glass0", "glass1", "lobby"]) {
      const darkest = rolePaint(role, [0.1, 0.1, 0.1]);
      expect(darkest.paint).toBe(PAINT_GLASS);
      expect(darkest.color[0], role).toBeGreaterThanOrEqual(0.6);
    }
  });
});

describe("rich grade", () => {
  const AMBIENCE = { warmth: 0.6, saturation: 0.7, fog: 0.2, trafficDensity: 0.5, pedestrianDensity: 0.5, litWindowShare: 0.6 };
  const day = atmosphere(AMBIENCE, false);

  it("is the identity when off", () => {
    expect(richSky(day, false)).toBe(day);
    expect(filmGrade(false)).toMatchObject({ toneMapping: "neutral", saturation: 0, contrast: 0 });
  });

  it("warms the key against a cooler fill, cools the shade and pulls the haze in by day", () => {
    const rich = richSky(day, true);
    const [r, , b] = hexToRgb(rich.sunColor);
    const [r0, , b0] = hexToRgb(day.sunColor);
    expect(r - b).toBeGreaterThan(r0 - b0);
    const [fr, , fb] = hexToRgb(rich.skyColor);
    const [fr0, , fb0] = hexToRgb(day.skyColor);
    expect(fb - fr).toBeGreaterThan(fb0 - fr0);
    expect(rich.sunIntensity).toBeGreaterThan(day.sunIntensity);
    expect(rich.hemiIntensity).toBeGreaterThanOrEqual(day.hemiIntensity);
    expect(rich.fogNearFactor).toBe(RICH.fogNear);
    expect(rich.fogNearFactor).toBeLessThan(day.fogNearFactor);
    expect(rich.fogFarFactor).toBeLessThanOrEqual(day.fogFarFactor);
    const [hr, , hb] = hexToRgb(rich.background);
    expect(hb - hr).toBeGreaterThan(hexToRgb(day.background)[2] - hexToRgb(day.background)[0]);
    expect(rich.skyHorizonColor).toBe(rich.background);
  });

  it("gives the shade a fill worth having: a stronger, lighter sky and bounce than the classic look's", () => {
    const rich = richSky(day, true);
    expect(rich.hemiIntensity).toBeGreaterThan(day.hemiIntensity * 1.6);
    expect(rich.sunIntensity / rich.hemiIntensity).toBeLessThan(day.sunIntensity / day.hemiIntensity);
    // Not flat: a lit face is still at least twice a shaded one.
    expect(rich.sunIntensity / rich.hemiIntensity).toBeGreaterThan(1.8);
    const lift = (hex: string) => {
      const [r, g, b] = hexToRgb(hex);
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    expect(lift(rich.groundBounceColor)).toBeGreaterThan(lift(day.groundBounceColor));
    // The ambient occlusion is a little gentler, so the fill is not eaten in the corners.
    expect(filmGrade(true).aoIntensity).toBeLessThan(1.25);
  });

  it("leaves the moon's light alone at night", () => {
    const night = nightSky(AMBIENCE, false);
    const rich = richSky(night, true);
    expect(rich.sunColor).toBe(night.sunColor);
    expect(rich.sunIntensity).toBe(night.sunIntensity);
    expect(rich.skyColor).toBe(night.skyColor);
    expect(rich.hemiIntensity).toBe(night.hemiIntensity);
    expect(rich.background).toBe(night.background);
  });

  it("strengthens the occlusion and the grade", () => {
    expect(filmGrade(true).aoIntensity).toBeGreaterThan(filmGrade(false).aoIntensity);
    expect(filmGrade(true).saturation).toBeGreaterThan(0);
  });
});
