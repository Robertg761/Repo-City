/**
 * Look development switches, read once from the URL like `?models=` and
 * `?quality=`, so every combination can be shot and compared.
 *
 *   ?palette=materials   colour from real materials: each building gets a
 *                        facade (brick, stone, render, concrete, metal, tinted
 *                        glass), a roof and accents, seeded from its path;
 *                        the district colour becomes a light tint
 *                        (`models/buildings/facades.ts`).
 *   ?grade=rich          light, atmosphere and depth: a warm key against a
 *                        cool fill, a blue distance haze, a gentle grade,
 *                        stronger occlusion and figure-ground on the ground
 *                        (`grade.ts`).
 *
 * Neither is on by default: the current look is what runs until one is picked.
 * Read in the browser only, at module load, so tests (node) always see the
 * current look unless they call `readLook` themselves.
 */

export interface Look {
  palette: "default" | "materials";
  grade: "default" | "rich";
}

export function readLook(search: string): Look {
  const params = new URLSearchParams(search);
  return {
    palette: params.get("palette") === "materials" ? "materials" : "default",
    grade: params.get("grade") === "rich" ? "rich" : "default",
  };
}

export const LOOK: Look = readLook(typeof window === "undefined" ? "" : window.location.search);

export const MATERIALS_PALETTE = LOOK.palette === "materials";
export const RICH_GRADE = LOOK.grade === "rich";
