/**
 * Which way round a landmark assembly is turned (PLAN.md sections 5 and 6).
 *
 * Every model in this directory puts its entrance, its signage and its yard
 * on +z, and `planLandmarkPlots` rotates each plot so that +z faces the city
 * centre. The default view, though, looks from one world corner --
 * `INSPECT_DIR` in `components/city/entities.ts` is `[1, 0.95, 1]`, and an
 * inspection flight keeps whatever bearing the user is on, which starts there
 * -- so on two of the four compass plots the front of the landmark would face
 * away from the viewer who just clicked it, and clicking a fire station
 * without orbiting first would show its back wall.
 *
 * So the assembly takes a half turn on those plots and fronts the ring road
 * instead of the district square. A landmark plot is a rectangle and a half
 * turn maps a rectangle onto itself, so the reserved ground is unchanged and
 * nothing can overlap a building or a road.
 */

/** Horizontal bearing of `INSPECT_DIR`, in radians: the +x +z corner. */
export const INSPECTION_AZIMUTH = Math.PI / 4;

/**
 * The extra Y rotation to apply inside a landmark's plot: `0` when the front
 * already faces the inspection camera, `Math.PI` when it faces away.
 */
export function facingTurn(rotationY: number): number {
  // The model's +z ends up bearing `rotationY`; the camera sits on
  // `INSPECTION_AZIMUTH`. Their dot product is the cosine of the difference,
  // and a negative one means the front is pointing at the back of the camera.
  return Math.cos(rotationY - INSPECTION_AZIMUTH) < 0 ? Math.PI : 0;
}
