"use client";

/**
 * The crowd: every open issue and pull request that is not a hero, drawn as
 * instanced cheap forms (PLAN.md 76.9). Reads `city.backlog`.
 *
 * S0 stub: mounted in `City.tsx` and draws nothing. S5 owns this directory
 * and fills it in (one `InstancedMesh` per form, shader animation, picking).
 */

import type { CityModel } from "@/types/city";
import type { SceneAtmosphere } from "../palette";

export default function Backlog({
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
