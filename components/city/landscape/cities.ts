/** One city per settlement tier, generated from the fixtures, for the landscape's tests. */

import hono from "@/fixtures/honojs__hono.analysis.json";
import react from "@/fixtures/facebook__react.analysis.json";
import plimit from "@/fixtures/sindresorhus__p-limit.analysis.json";
import sample from "@/fixtures/sample.analysis.json";
import { generateCity } from "@/lib/city/generator";
import type { RepoAnalysis, SettlementTier } from "@/types/analysis";
import type { CityModel } from "@/types/city";

const cache = new Map<string, CityModel>();

export function tierCity(tier: SettlementTier): CityModel {
  let city = cache.get(tier);
  if (!city) {
    city =
      tier === "village" ? generateCity(plimit as unknown as RepoAnalysis)
      : tier === "town" ? generateCity(sample as unknown as RepoAnalysis, { tier: "town" })
      : tier === "city" ? generateCity(hono as unknown as RepoAnalysis)
      : generateCity(react as unknown as RepoAnalysis);
    cache.set(tier, city);
  }
  return city;
}

export const TIERS: SettlementTier[] = ["village", "town", "city", "metropolis"];
