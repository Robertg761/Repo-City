/**
 * Which of the traffic's cars are drawn in detail (`Traffic.tsx`).
 *
 * A car is several instanced meshes (its body among the bodies of its type,
 * its lamps, four wheels in the one wheel mesh), so no one mesh can decide for
 * the car by itself: `LodInstances` cannot tell that instance 37 of the wheels
 * and instance 9 of the sedans are the same car. The traffic decides once from
 * the car's own position and hands each mesh the instances that are the
 * chosen cars' (`NearSelection`), which the meshes draw as followers.
 *
 * Pure, so it is tested without a scene.
 */

/** The instances of one mesh to draw in detail; replaced (never mutated) when the set changes. */
export interface NearSelection {
  current: number[];
}

/** Cars whose projected size (radius over distance) reaches `threshold`, the biggest first, at most `max`. */
export function selectNearCars(
  at: ArrayLike<number>,
  radius: ArrayLike<number>,
  count: number,
  camera: { x: number; y: number; z: number },
  height: number,
  threshold: number,
  max: number,
): number[] {
  if (max <= 0) return [];
  const picked: { index: number; size: number }[] = [];
  for (let i = 0; i < count; i++) {
    const dx = at[i * 2] - camera.x;
    const dy = height - camera.y;
    const dz = at[i * 2 + 1] - camera.z;
    const size = radius[i] / Math.max(Math.hypot(dx, dy, dz), 1e-3);
    if (size >= threshold) picked.push({ index: i, size });
  }
  picked.sort((a, b) => b.size - a.size);
  return picked.slice(0, max).map((p) => p.index);
}

/** True when two lists hold the same numbers in the same order. */
export function sameList(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * Hands the chosen cars to the meshes: for each body group the slots of its
 * chosen cars, and for the wheel mesh their four wheels (`car * 4 + wheel`).
 * A selection whose set did not change keeps its array, so a follower does
 * not swap its instances again for nothing.
 */
export function publishNearCars(
  chosen: readonly number[],
  groupOf: ArrayLike<number>,
  slotOf: ArrayLike<number>,
  bodies: readonly NearSelection[],
  wheels: NearSelection,
): void {
  const perGroup = bodies.map(() => [] as number[]);
  const wheelIds: number[] = [];
  for (const car of [...chosen].sort((a, b) => a - b)) {
    perGroup[groupOf[car]].push(slotOf[car]);
    for (let w = 0; w < 4; w++) wheelIds.push(car * 4 + w);
  }
  bodies.forEach((selection, g) => {
    perGroup[g].sort((a, b) => a - b);
    if (!sameList(selection.current, perGroup[g])) selection.current = perGroup[g];
  });
  if (!sameList(wheels.current, wheelIds)) wheels.current = wheelIds;
}
