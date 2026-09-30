/**
 * A steady 0..1 offset for an effect, from where it stands in the world.
 * Every effect used to run off the one scene clock, so every beacon in the
 * city flashed on the same beat and every smoke column breathed in step,
 * which read as one machine rather than a city of separate emergencies.
 * The offset comes from the world position, so it is stable across frames
 * and the same on every visit to the same city.
 */
export function placePhase(x: number, y: number, z: number): number {
  const h = Math.sin(x * 12.9898 + y * 4.1414 + z * 78.233) * 43758.5453;
  return h - Math.floor(h);
}
