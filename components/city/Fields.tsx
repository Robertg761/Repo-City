"use client";

/**
 * Village fields and hedgerows (PLAN.md 76.5, "Village", step 7). Reads
 * `city.props.fields`.
 *
 * S0 stub: mounted in `City.tsx` and draws nothing. S6 fills it in.
 */

import type { CityModel } from "@/types/city";
import type { SceneAtmosphere } from "./palette";

export default function Fields({
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
