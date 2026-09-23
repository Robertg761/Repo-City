/**
 * The few numbers every part of the traffic maths agrees on: how big the
 * fleet's bodies are and where a lane runs. Kept apart so `traffic.ts`,
 * `junctions.ts` and `blockages.ts` can share them without importing one
 * another in a circle. `traffic.ts` re-exports them.
 *
 * Pure, no three.js.
 */

/**
 * Half the length of the longest body in the fleet (the bus, 4.5 units; see
 * `models/vehicles/shapes.ts`). Anything that has to hold for every car --
 * where it stops short of cones, how far a U-turn reaches, whether two
 * junction paths can be driven at once -- keeps the bus's distance.
 */
export const CAR_HALF_LENGTH = 2.3;
/** Half the width of the widest body in the fleet. */
export const CAR_HALF_WIDTH = 0.6;

/**
 * Lateral offset of a car from the centre line of a road this wide. On a
 * narrow village lane cars keep well to their own side, a car's width apart
 * from the traffic coming the other way, so two can pass on a bend.
 */
export function laneOffset(width: number): number {
  return Math.max(0.6, width * 0.22, Math.min(width / 2 - CAR_HALF_WIDTH - 0.15, NARROW_LANE));
}

/** The offset every road up to about five units wide shares. */
const NARROW_LANE = 1.05;

/**
 * A lane is one direction of one segment: `segment * 2` runs from the
 * segment's `from` end to its `to` end, `segment * 2 + 1` the other way.
 */
export const laneOf = (segment: number, forward: boolean): number => segment * 2 + (forward ? 0 : 1);
export const laneSegment = (lane: number): number => lane >> 1;
export const laneForward = (lane: number): boolean => (lane & 1) === 0;
/** The other direction of the same segment. */
export const oppositeLane = (lane: number): number => lane ^ 1;

/**
 * A segment END is `segment * 2` for its `from` end and `segment * 2 + 1` for
 * its `to` end. A lane starts at one end and finishes at the other.
 */
export const laneStartEnd = (lane: number): number => (lane >> 1) * 2 + (lane & 1);
export const laneFinishEnd = (lane: number): number => (lane >> 1) * 2 + 1 - (lane & 1);
