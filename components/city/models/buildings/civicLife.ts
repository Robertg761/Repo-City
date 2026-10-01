/**
 * The civic kit's moving parts, ready to draw: the hands of its clock and the
 * cloth of its flag, each from its own node of the kit (`blender/civic/
 * civic_kit.py`, and the near kit's twin) in the kit's own frame, coloured from
 * the civic palette like the rest of the building. A building places them with
 * the `CivicLife` that `buildCivic` returns: a clock's hands turn about the
 * kit clock's centre (the origin, facing +z, radius 1) and a flag's cloth hangs
 * from the pole's top.
 */

import type { BufferGeometry } from "three";
import { flapAttributes } from "../../flagWave";
import { importedDraft, importedMarker, importedOrigin, type ImportedModel } from "../imported";
import type { HandKind } from "../landmarks/life";
import { roleColor, type CivicPalette } from "./civic";
import { MODEL as CIVIC_KIT } from "./civicKit.model";
import { MODEL as CIVIC_KIT_NEAR } from "./civicKitNear.model";
import { toGeometry } from "./geometry";

export interface CivicHand {
  kind: HandKind;
  /** At twelve, in the clock's own frame (centre at the origin, radius 1, facing +z). */
  geometry: BufferGeometry;
}

export interface CivicLifeGeometry {
  hands: CivicHand[];
  /** In the flag part's frame (the pole's top is the origin), with the wave's attributes. */
  cloth: BufferGeometry | null;
}

const KINDS: readonly [string, HandKind][] = [
  ["Clock.Hour", "hour"],
  ["Clock.Minute", "minute"],
  ["Clock.Second", "second"],
];

function draw(model: ImportedModel, node: string, palette: CivicPalette): BufferGeometry {
  return toGeometry({ ...importedDraft(model, node, (mat) => ({ color: roleColor(palette, mat.role) })) });
}

/** The kit's hands and cloth (the near kit's when `near`) in the palette's colours. */
export function civicLifeGeometry(near: boolean, palette: CivicPalette): CivicLifeGeometry {
  const model = near ? CIVIC_KIT_NEAR : CIVIC_KIT;
  const has = (name: string) => model.nodes.some((n) => n.name === name);
  const hands: CivicHand[] = [];
  for (const [node, kind] of KINDS) {
    if (has(node)) hands.push({ kind, geometry: draw(model, node, palette) });
  }
  let cloth: BufferGeometry | null = null;
  if (has("FlagCloth")) {
    cloth = draw(model, "FlagCloth", palette);
    // The node's own frame is the hoist: move it to the part's frame, then
    // let the wave measure from the hoist to the free edge.
    const [ox, oy, oz] = importedOrigin(model, "FlagCloth");
    cloth.translate(ox, oy, oz);
    flapAttributes(cloth, importedMarker(model, "FlagCloth.pivot"), importedMarker(model, "FlagCloth.tip"));
  }
  return { hands, cloth };
}
