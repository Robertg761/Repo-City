/**
 * The empty stage's own land (`?land=rich`): a village-sized plot with no city
 * on it, so the landscape plans it like any other and the stage stands in
 * fields, hedgerows, copses and a stream. A fixed seed: the same pleasant
 * country every visit, and nothing here is computed beyond what a village's
 * plan already is.
 */

import type { CityModel } from "@/types/city";

export const LANDING_SIZE = 120;

export const LANDING_CITY = {
  seed: "landing-stage",
  repository: { fullName: "landing/stage", url: "", archived: false },
  bounds: { size: LANDING_SIZE },
  settlement: { tier: "village" },
  roads: [],
  buildings: [],
  landmarks: [],
  districts: [],
  incidents: [],
  constructionSites: [],
  props: { trees: [], lamps: [], fields: [] },
} as unknown as CityModel;
