/**
 * `resolveEntity` moved from linear searches to the shared entity index
 * (PLAN.md 76.9). This holds it to the resolver as it stood before the move
 * (`testing/legacyEntities.ts`, a verbatim copy) for every entity in every
 * committed analysis: same answers for everything that existed, and the
 * crowd and the queue are the only new ids that resolve.
 */

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { generateCity } from "@/lib/city/generator";
import type { RepoAnalysis, SettlementTier } from "@/types/analysis";
import type { CityModel } from "@/types/city";
import { resolveEntity } from "./entities";
import { resolveEntity as legacyResolveEntity } from "./testing/legacyEntities";

const DIR = path.join(process.cwd(), "fixtures");
const NOW = Date.parse("2026-09-21T12:00:00.000Z");

const fixtures = readdirSync(DIR)
  .filter((name) => name.endsWith(".analysis.json"))
  .sort()
  .map((name) => ({
    name,
    analysis: JSON.parse(readFileSync(path.join(DIR, name), "utf8")) as RepoAnalysis,
  }));

function existingIds(city: CityModel): string[] {
  return [
    ...city.incidents.map((e) => e.id),
    ...city.constructionSites.map((e) => e.id),
    ...city.landmarks.map((e) => e.id),
    ...city.buildings.map((e) => e.id),
    ...city.districts.map((e) => e.id),
  ];
}

describe("resolveEntity through the entity index", () => {
  it.each(fixtures)("answers exactly as before for every entity in $name", ({ analysis }) => {
    // City tier: the tier every entity existed at before settlements.
    const city = generateCity(analysis, { tier: "city" });
    expect(city).not.toBeNull();
    if (!city) return;
    for (const id of [...existingIds(city), "nope-1"]) {
      expect(resolveEntity(id, city, analysis, NOW)).toEqual(
        legacyResolveEntity(id, city, analysis, NOW),
      );
    }
  });

  const backlog = fixtures.find((f) => f.name === "backlog.analysis.json");
  const tiers: SettlementTier[] = ["village", "town", "metropolis"];

  it.each(tiers)("changes only the civic header in a %s", (tier) => {
    if (!backlog) throw new Error("fixtures/backlog.analysis.json is missing");
    const { analysis } = backlog;
    const city = generateCity(analysis, { tier });
    if (!city) throw new Error("no city");
    for (const id of existingIds(city)) {
      const now = resolveEntity(id, city, analysis, NOW);
      const before = legacyResolveEntity(id, city, analysis, NOW);
      const landmark = city.landmarks.find((l) => l.id === id);
      if (landmark?.landmarkType === "civic") {
        expect(now).toEqual({
          ...before,
          label: landmark.title,
          tooltip: landmark.title.charAt(0) + landmark.title.slice(1).toLowerCase(),
        });
      } else {
        expect(now).toEqual(before);
      }
    }
  });

  it("resolves every crowd object and the queue, which the old resolver could not", () => {
    if (!backlog) throw new Error("fixtures/backlog.analysis.json is missing");
    const { analysis } = backlog;
    const city = generateCity(analysis);
    if (!city?.backlog || !city.overflow) throw new Error("no crowd");
    const crowd = [...city.backlog.incidents, ...city.backlog.constructionSites];
    expect(crowd.length).toBeGreaterThan(500);
    for (const entity of [...crowd, city.overflow]) {
      expect(legacyResolveEntity(entity.id, city, analysis, NOW)).toBeNull();
      expect(resolveEntity(entity.id, city, analysis, NOW)?.kind).toBe(entity.kind);
    }
  });
});
