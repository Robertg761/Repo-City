/**
 * Spike: landmark slots from nodes of a Blender model
 * (`blender/landmarks/*.py`), the way `blenderFire` builds the fire station's.
 * Several nodes can make one variant (a plant and the chimney its CI state
 * paints), each optionally repeated at offsets, and every slot comes out as
 * one merged geometry carrying baked occlusion in its vertex colour.
 */

import type { BufferGeometry } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Triple } from "../props/geometry";
import { importedSlots, type ImportedModel } from "../imported";
import type { Slots } from "./assembly";

export interface NodePlacement {
  node: string;
  /** Copies of the node, each moved by one offset. One copy at the origin by default. */
  offsets?: readonly Triple[];
}

export function blenderSlots<S extends string>(
  model: ImportedModel,
  nodes: readonly (string | NodePlacement)[],
): Slots<S> {
  const lists: Record<string, BufferGeometry[]> = {};
  for (const entry of nodes) {
    const { node, offsets } = typeof entry === "string" ? { node: entry, offsets: undefined } : entry;
    for (const [slot, list] of Object.entries(importedSlots(model, node, offsets))) {
      (lists[slot] ??= []).push(...list);
    }
  }
  const slots: Partial<Record<S, BufferGeometry>> = {};
  for (const [slot, list] of Object.entries(lists)) {
    const merged = list.length === 1 ? list[0] : mergeGeometries(list, false);
    if (!merged) throw new Error(`blenderSlots: slot ${slot} could not be merged`);
    merged.computeBoundingBox();
    merged.computeBoundingSphere();
    slots[slot as S] = merged;
  }
  return slots as Slots<S>;
}
