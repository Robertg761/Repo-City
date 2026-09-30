/**
 * The level of detail the scene builders are currently building at.
 *
 * The construction sites and the incident scenes (`models/props/
 * constructionDecor.ts`, `incidentDecor.ts`, `finishedHouse.ts`, the crane
 * and the emergency vehicles) are built as merged geometries from Blender
 * model nodes. Each has a lean level for the whole city and a near one for the
 * few scenes the camera is close to (`SceneLod`, `components/city/
 * sceneLod.ts`), authored in `blender/scenes_near/` with the same node names,
 * frames and outlines. Rather than thread a flag through every helper that
 * places a node, a builder is run `atLevel("near", ...)` and the helpers ask
 * `modelFor` which model holds the node they want.
 *
 * Every cache in those builders keys on `detailLevel()` too, so the two levels
 * never share a geometry.
 */

import type { ImportedModel } from "./imported";

export type DetailLevel = "lean" | "near";

let level: DetailLevel = "lean";

export const detailLevel = (): DetailLevel => level;

/** Runs `build` (synchronously) with the level set, then puts it back. */
export function atLevel<T>(next: DetailLevel, build: () => T): T {
  const before = level;
  level = next;
  try {
    return build();
  } finally {
    level = before;
  }
}

/**
 * The model to read `node` from: the near model when building near and it has
 * the node, else the lean one (a near model holds only what it refines, plus
 * the extras that only a near camera sees).
 */
export function modelFor(lean: ImportedModel, near: ImportedModel, node: string): ImportedModel {
  return level === "near" && near.nodes.some((n) => n.name === node) ? near : lean;
}

/** A cache key that keeps the levels apart. */
export const levelKey = (key: string): string => `${level}:${key}`;
