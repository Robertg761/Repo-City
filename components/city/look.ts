/**
 * Look switches, read once from the URL like `?models=` and `?quality=`, so
 * every combination can be shot and compared.
 *
 *   ?palette=classic   the earlier colour: one district colour per building.
 *                      By default colour comes from real materials: each
 *                      building gets a facade (brick, stone, render, concrete,
 *                      metal, tinted glass), a roof and accents, seeded from
 *                      its path; the district colour becomes a light tint
 *                      (`models/buildings/facades.ts`).
 *   ?grade=classic     the earlier light: soft, near-white sun and sky, a haze
 *                      that only hides the landscape's rim. By default the
 *                      grade is rich: a warm key against a cool fill, a blue
 *                      distance haze, a gentle saturation and contrast grade,
 *                      stronger occlusion and figure-ground on the ground
 *                      (`grade.ts`).
 *   ?land=classic      the flat green field the city used to stand on. By
 *                      default the rich landscape (`landscape/`): rolling land,
 *                      irregular fields and hedgerows, woods, banked rivers and
 *                      ponds, the city's own houses and trees, roads to the
 *                      horizon, richer ground and close-up grass.
 *
 * All three richer looks are the default. Read in the browser only, at module
 * load; tests (node) and the server see the defaults, and tests that need the
 * classic look call `readLook("?palette=classic&grade=classic")` or pass the
 * switch to the pure function under test.
 */

export interface Look {
  palette: "materials" | "classic";
  grade: "rich" | "classic";
  land: "rich" | "classic";
}

export function readLook(search: string): Look {
  const params = new URLSearchParams(search);
  return {
    palette: params.get("palette") === "classic" ? "classic" : "materials",
    grade: params.get("grade") === "classic" ? "classic" : "rich",
    land: params.get("land") === "classic" ? "classic" : "rich",
  };
}

export const LOOK: Look = readLook(typeof window === "undefined" ? "" : window.location.search);

export const MATERIALS_PALETTE = LOOK.palette === "materials";
export const RICH_GRADE = LOOK.grade === "rich";
export const RICH_LAND = LOOK.land === "rich";
