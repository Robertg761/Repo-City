"use client";

/**
 * The queue at the city limits (PLAN.md 76.8 and 76.9): a signboard reading
 * "+20,112 more open issues" and stationary gridlock on the approach roads.
 * Reads `city.overflow`.
 *
 * S0 stub: mounted in `City.tsx` and draws nothing. S5 fills it in.
 */

import type { CityModel } from "@/types/city";
import type { SceneAtmosphere } from "./palette";

export default function Overflow({
  city,
  atmosphere,
}: {
  city: CityModel;
  atmosphere: SceneAtmosphere;
}) {
  void city;
  void atmosphere;
  return null;
}
