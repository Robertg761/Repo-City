/**
 * Crowd numbers that pure modules need without pulling in three.js
 * (`entities.ts` is unit tested without it).
 */

/**
 * The scaffold's bay before the instance fits it to its facade: the renderer
 * stretches it across the face and up the lower storeys. Its frame is centred
 * on the slab S4 reserves: `z` from the wall at -depth/2 to the outside at
 * +depth/2 (PLAN.md 76.8).
 */
export const SCAFFOLD_BAY = { width: 4.4, height: 7, depth: 0.9 } as const;

/** How high up its host a scaffold climbs, at most. */
export const SCAFFOLD_REACH = 10;

/**
 * The scaffold's fit to its facade: `size` is `[face width, building height,
 * 0.9]`. It spans the face and climbs the lower storeys, the way a real one
 * goes up a lift at a time; a tower is not wrapped to its roof.
 */
export function scaffoldScale(size: readonly number[] | undefined | null): [number, number, number] {
  const width = size?.[0] ?? SCAFFOLD_BAY.width;
  const height = size?.[1] ?? SCAFFOLD_BAY.height;
  const drawn = Math.min(SCAFFOLD_REACH, Math.max(3.5, height * 0.85));
  return [Math.max(0.4, (width * 0.94) / SCAFFOLD_BAY.width), drawn / SCAFFOLD_BAY.height, 1];
}
