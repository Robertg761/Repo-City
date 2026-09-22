/**
 * Standing figures for the scenes that need people in them: the crew working
 * an incident and the workers on a construction site (PLAN.md sections 11, 13).
 *
 * The walking crowd in `Pedestrians.tsx` is instanced and animated; these are
 * merged into the assembly they belong to, because a firefighter is part of
 * the fire, not part of the city's population.
 *
 * Same two primitives as the crowd -- a capsule and a sphere -- so a worker
 * and a passer-by read as the same kind of creature.
 */

import { CapsuleGeometry, CylinderGeometry, SphereGeometry } from "three";
import type { Part, Triple } from "./geometry";

const SKIN = "#c99f7d";

export interface FigureOptions {
  position: Triple;
  /** Body colour: a high-visibility vest, or ordinary clothes. */
  color: string;
  /** Facing, in radians. */
  rotationY?: number;
  /** A hard hat in this colour, for the crews that wear one. */
  helmet?: string;
  scale?: number;
}

/**
 * One figure's parts, in the assembly's frame. `position` is the ground the
 * figure stands on, so a caller places feet, not centres.
 */
export function figureParts({
  position,
  color,
  rotationY = 0,
  helmet,
  scale = 1,
}: FigureOptions): Part[] {
  const [x, y, z] = position;
  const at = (height: number): Triple => [x, y + height * scale, z];
  const parts: Part[] = [
    {
      geometry: new CapsuleGeometry(0.17, 0.48, 2, 6),
      color,
      position: at(0.44),
      rotation: [0, rotationY, 0],
      scale,
    },
    {
      geometry: new SphereGeometry(0.15, 7, 5),
      color: helmet ?? SKIN,
      position: at(0.94),
      rotation: [0, rotationY, 0],
      scale,
    },
  ];
  if (helmet) {
    // A brim, so a hard hat reads as a hard hat and not as a yellow head.
    parts.push({
      geometry: new CylinderGeometry(0.19, 0.19, 0.04, 8),
      color: helmet,
      position: at(0.88),
      rotation: [0, rotationY, 0],
      scale,
    });
  }
  return parts;
}
