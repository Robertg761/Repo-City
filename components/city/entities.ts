/**
 * Entity lookup and camera framing maths (PLAN.md sections 5, 6).
 *
 * `selectedId` is just a string, so both the camera rig and the ground-level
 * selection ring need one place that turns it back into a position and a
 * sensible inspection distance. Pure, no three.js: unit tested.
 */

import type { CityModel, EntityKind, Vec3 } from "@/types/city";

export interface FocusTarget {
  id: string;
  kind: EntityKind;
  /** Base-centre position in world units, as stored on the entity. */
  position: Vec3;
  /** The point the camera aims at: the visual centre, not the footprint. */
  lookAt: Vec3;
  /** Half the bounding size, used to pick an inspection distance. */
  radius: number;
}

/**
 * District rects are min-corner + extent: the region covers
 * `[rect.x, rect.x + rect.w]` on x and `[rect.z, rect.z + rect.d]` on z.
 */
export function districtCenter(rect: { x: number; z: number; w: number; d: number }): Vec3 {
  return [rect.x + rect.w / 2, 0, rect.z + rect.d / 2];
}

const clamp = (n: number, lo: number, hi: number) => (n < lo ? lo : n > hi ? hi : n);

/** Camera limits from `<CameraControls>` in `CityCanvas` (PLAN.md section 5). */
export const MIN_DISTANCE = 10;

/**
 * "Prevent zooming so far away the city disappears" (section 5) has to be a
 * function of the city: a 130 unit city cannot be framed from 160 units at a
 * 35 degree field of view, and a hard cap there would leave the corners of
 * every large repository permanently off screen. 160 stays the floor, which is
 * the limit the placeholder scene shipped with.
 */
export function maxCameraDistance(size: number): number {
  return Math.max(160, size * 1.9);
}

/** The cap used when no model is loaded. */
export const MAX_DISTANCE = 160;

export function focusTargetFor(city: CityModel, id: string): FocusTarget | null {
  for (const b of city.buildings) {
    if (b.id !== id) continue;
    const [w, h, d] = b.size;
    return {
      id,
      kind: "building",
      position: b.position,
      lookAt: [b.position[0], b.position[1] + h * 0.55, b.position[2]],
      radius: Math.max(w, d, h) * 0.7,
    };
  }
  for (const l of city.landmarks) {
    if (l.id !== id) continue;
    return {
      id,
      kind: "landmark",
      position: l.position,
      lookAt: [l.position[0], l.position[1] + 4, l.position[2]],
      radius: 8 + l.level * 1.5,
    };
  }
  for (const i of city.incidents) {
    if (i.id !== id) continue;
    return {
      id,
      kind: "incident",
      position: i.position,
      lookAt: [i.position[0], i.position[1] + 1.2, i.position[2]],
      radius: 4,
    };
  }
  for (const c of city.constructionSites) {
    if (c.id !== id) continue;
    return {
      id,
      kind: "construction",
      position: c.position,
      lookAt: [c.position[0], c.position[1] + 4, c.position[2]],
      radius: 8,
    };
  }
  for (const d of city.districts) {
    if (d.id !== id) continue;
    const center = districtCenter(d.rect);
    return {
      id,
      kind: "district",
      position: center,
      lookAt: [center[0], 2, center[2]],
      radius: Math.max(d.rect.w, d.rect.d) * 0.6,
    };
  }
  return null;
}

export interface Framing {
  position: Vec3;
  target: Vec3;
}

/**
 * Roughly 47 degrees above the horizon on the default diagonal: the
 * "isometric game, still true perspective" look of section 4.
 */
const OVERVIEW_DIR: Vec3 = [1, 1.51, 1];
/** A slightly lower angle for inspection, so facades stay visible. */
const INSPECT_DIR: Vec3 = [1, 0.95, 1];

function place(target: Vec3, dir: Vec3, distance: number): Framing {
  const len = Math.hypot(dir[0], dir[1], dir[2]);
  return {
    position: [
      target[0] + (dir[0] / len) * distance,
      target[1] + (dir[1] / len) * distance,
      target[2] + (dir[2] / len) * distance,
    ],
    target,
  };
}

/**
 * The default city composition, recomputed from `bounds.size`.
 *
 * The factor is empirical for the 35 degree vertical field of view set in
 * `CityCanvas` and for the corner-on view direction, which puts the city's
 * diagonal across the screen: at `size * 1.6` a square city fills the frame
 * with a little air around it.
 */
export function overviewFraming(size: number): Framing {
  const distance = clamp(size * 1.6, MIN_DISTANCE + 14, maxCameraDistance(size));
  // The ground near the camera expands fast in screen space, so the aim point
  // sits a little towards the camera: it keeps the near corner of the city in
  // frame instead of spending the bottom of the screen on empty landscape.
  const bias = size * 0.05;
  return place([bias, Math.min(size * 0.02, 3), bias], OVERVIEW_DIR, distance);
}

/** A useful inspection distance for one entity, inside the camera limits. */
export function inspectionFraming(focus: FocusTarget): Framing {
  const distance = clamp(focus.radius * 3.4 + 12, MIN_DISTANCE + 2, MAX_DISTANCE - 20);
  return place(focus.lookAt, INSPECT_DIR, distance);
}
