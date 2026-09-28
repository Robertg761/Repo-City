/**
 * Standing figures for the scenes that need people in them: the crew working
 * an incident and the workers on a construction site (PLAN.md sections 11, 13).
 *
 * The walking crowd in `Pedestrians.tsx` is instanced and animated; these are
 * merged into the assembly they belong to, because a firefighter is part of
 * the fire, not part of the city's population.
 *
 * The same clothed body and hair as the walking crowd, with helmets and
 * reflective strips for the crews: the Blender walker with a Blender hard
 * hat and vest bands when the Blender models are on, primitives otherwise.
 */

import { CylinderGeometry, SphereGeometry } from "three";
import { surfacePanel, type Part, type Triple } from "./geometry";
import { walkerBodyParts, walkerHeadParts } from "./walkerModel";
import { SURFACE } from "../../textures/surface-types";
import { BLENDER_MODELS } from "../modelSource";
import { crewGearParts } from "./siteKit";

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
  const parts: Part[] = [
    ...walkerBodyParts(color, SKIN).map((part) => ({
      ...part,
      position: [part.position?.[0] ?? 0, (part.position?.[1] ?? 0) + 0.44, part.position?.[2] ?? 0] as Triple,
    })),
    ...walkerHeadParts(SKIN, { hair: !helmet }).map((part) => ({
      ...part,
      position: [part.position?.[0] ?? 0, (part.position?.[1] ?? 0) + 0.94, part.position?.[2] ?? 0] as Triple,
    })),
  ];
  if (helmet && BLENDER_MODELS) {
    // The crew's hard hat and the vest's reflective bands, modelled on the
    // Blender walker (`blender/incidents2/site_kit.py`), in the figure's frame.
    parts.push(...crewGearParts(helmet));
  } else if (helmet) {
    parts.push(
      { geometry: new CylinderGeometry(0.19, 0.19, 0.035, 8), color: helmet, surface: SURFACE.metal, position: [0, 1.0, 0] },
      { geometry: new SphereGeometry(0.165, 8, 3, 0, Math.PI * 2, 0, Math.PI / 2), color: helmet, surface: SURFACE.metal, position: [0, 1.0, 0] },
      surfacePanel(0.25, 0.035, [0, 0.46, 0.119], "#ebe4ba"),
      surfacePanel(0.035, 0.2, [-0.08, 0.62, 0.12], "#ebe4ba"),
      surfacePanel(0.035, 0.2, [0.08, 0.62, 0.12], "#ebe4ba"),
    );
  }
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);
  return parts.map((part) => {
    const [px, py, pz] = part.position ?? [0, 0, 0];
    const localScale = part.scale ?? 1;
    const combined: Triple = typeof localScale === "number"
      ? [scale * localScale, scale * localScale, scale * localScale]
      : localScale.map((n) => n * scale) as Triple;
    return {
      ...part,
      paint: false,
      surface: part.surface ?? SURFACE.fabric,
      position: [position[0] + scale * (px * cos + pz * sin), position[1] + py * scale, position[2] + scale * (-px * sin + pz * cos)] as Triple,
      rotation: [0, rotationY, 0] as Triple,
      scale: combined,
    };
  });
}
