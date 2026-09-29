/**
 * How a city archetype's Blender material role becomes a draft colour, by
 * look. On the classic palette (`?palette=classic`) it is the role's multiplier
 * on the district colour, as it always was; by default it also carries the
 * paint channel (`facades.ts`), so walls, roofs, glass and accents take their
 * own colours.
 */

import { MATERIALS_PALETTE } from "../../look";
import type { DraftMaterial, ImportedMaterial } from "../imported";
import { rolePaint } from "./facades";
import type { Rgb3 } from "./mesh";

export function cityMaterial(
  roles: (role: string) => Rgb3,
  materials: boolean = MATERIALS_PALETTE,
): (mat: ImportedMaterial) => DraftMaterial {
  return (mat) => {
    const base = roles(mat.role);
    return materials ? rolePaint(mat.role, base) : { color: base };
  };
}
