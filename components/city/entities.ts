/**
 * Entity lookup and camera framing maths (PLAN.md sections 5, 6).
 *
 * `selectedId` is just a string, so both the camera rig and the ground-level
 * selection ring need one place that turns it back into a position and a
 * sensible inspection distance. Pure, no three.js: unit tested.
 */

import { indexEntities } from "@/lib/city/entityIndex";
import { SCAFFOLD_REACH } from "./backlog/constants";
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
  /**
   * The compass bearing the thing faces, as an orbit azimuth, when it can
   * only be seen from one side: a scaffold on a facade. Inspection then looks
   * at it from in front, however the user was looking at the city.
   */
  facing?: number;
}

/**
 * District rects are CENTRE + extent (see the world conventions at the top of
 * `types/city.ts`): the region covers `[rect.x - rect.w / 2, rect.x + rect.w / 2]`
 * on x and the same on z. The centre is therefore the rect's own `x`/`z`.
 */
export function districtCenter(rect: { x: number; z: number; w: number; d: number }): Vec3 {
  return [rect.x, 0, rect.z];
}

const clamp = (n: number, lo: number, hi: number) => (n < lo ? lo : n > hi ? hi : n);

/** Camera limits from `<CameraControls>` in `CityCanvas` (PLAN.md section 5). */
export const MIN_DISTANCE = 10;

/**
 * The viewport shape the framing below is tuned for: a desktop canvas a
 * little wider than 16:10. Anything narrower -- a phone held upright, a
 * half-width window -- is limited by its horizontal field of view, not its
 * vertical one, and has to sit further back to hold the same city.
 */
export const REFERENCE_ASPECT = 1.6;

/** How much further back a viewport of this shape has to sit. Never less than 1. */
export function aspectWiden(aspect: number): number {
  if (!(aspect > 0) || aspect >= REFERENCE_ASPECT) return 1;
  // Capped: past this the city is a postage stamp and the fog eats it.
  return Math.min(REFERENCE_ASPECT / aspect, 2.1);
}

/**
 * "Prevent zooming so far away the city disappears" (section 5) has to be a
 * function of the city: a 130 unit city cannot be framed from 160 units at a
 * 35 degree field of view, and a hard cap there would leave the corners of
 * every large repository permanently off screen. 160 stays the floor, which is
 * the limit the placeholder scene shipped with.
 */
export function maxCameraDistance(size: number, aspect = REFERENCE_ASPECT): number {
  return Math.max(160, size * 1.9) * aspectWiden(aspect);
}

/** The cap used when no model is loaded. */
export const MAX_DISTANCE = 160;

/** How far round a crowd object the camera and the ring allow. */
const CROWD_RADIUS = 2.4;
/** The queue's signboard: its plot is `[6, 5, 1]`. */
const OVERFLOW_SIGN: Vec3 = [6, 5, 1];

/**
 * The focus for any selectable id. Entities come from the shared index
 * (`lib/city/entityIndex.ts`, PLAN.md 76.9), so fifteen hundred crowd objects
 * cost a map lookup rather than a scan; districts are not in the index and are
 * searched after it.
 */
export function focusTargetFor(city: CityModel, id: string): FocusTarget | null {
  const entity = indexEntities(city).get(id);
  if (entity) {
    const [x, y, z] = entity.position;
    switch (entity.kind) {
      case "building": {
        const [w, h, d] = entity.size;
        return {
          id,
          kind: "building",
          position: entity.position,
          lookAt: [x, y + h * 0.55, z],
          radius: Math.max(w, d, h) * 0.7,
        };
      }
      case "landmark": {
        // `size` is the reserved plot the generator handed it (types/city.ts).
        const [w, h, d] = entity.size ?? [14, 10, 12];
        return {
          id,
          kind: "landmark",
          position: entity.position,
          lookAt: [x, y + h * 0.45, z],
          radius: Math.max(w, d) * 0.6,
        };
      }
      case "incident": {
        if (entity.lod === "crowd") {
          // A crowd object is a car or a barrier, not a whole scene.
          const reach = entity.size ? Math.max(entity.size[0], entity.size[2]) * 0.5 : CROWD_RADIUS;
          return { id, kind: "incident", position: entity.position, lookAt: [x, y + 0.8, z], radius: reach };
        }
        return { id, kind: "incident", position: entity.position, lookAt: [x, y + 1.2, z], radius: 5 };
      }
      case "construction": {
        if (entity.lod === "crowd") {
          if (entity.buildingId) {
            // A scaffold: `position` is the centre of its slab in front of the
            // facade (S4). Aim at its working lifts, which climb at most
            // `SCAFFOLD_REACH` up the building.
            const height = Math.min((entity.size?.[1] ?? 6) * 0.85, SCAFFOLD_REACH) * 0.45;
            return {
              id,
              kind: "construction",
              position: entity.position,
              lookAt: [x, y + height, z],
              radius: Math.min(Math.max((entity.size?.[0] ?? 4.4) * 0.5, CROWD_RADIUS), 5),
              // `rotationY` faces out of the wall; the camera belongs out there.
              facing: entity.rotationY,
            };
          }
          return {
            id,
            kind: "construction",
            position: entity.position,
            lookAt: [x, y + 0.9, z],
            radius: CROWD_RADIUS,
          };
        }
        const [w, h, d] = entity.size ?? [11, 12.6, 11];
        return {
          id,
          kind: "construction",
          position: entity.position,
          lookAt: [x, y + h * 0.4, z],
          radius: Math.max(w, d) * 0.7,
        };
      }
      case "overflow": {
        const [w, h] = entity.size ?? OVERFLOW_SIGN;
        return {
          id,
          kind: "overflow",
          position: entity.position,
          lookAt: [x, y + h * 0.55, z],
          radius: Math.max(w * 0.8, 5),
        };
      }
    }
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
/**
 * Incidents and construction sites sit on the street, hemmed in by the blocks
 * on either side: from a facade-height angle the building next door fills the
 * frame instead of the thing that was clicked. Look down into the street.
 */
const STREET_INSPECT_DIR: Vec3 = [1, 1.9, 1];

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
 * diagonal across the screen: at `size * 1.45` a square city fills the frame
 * with a little air around it.
 */
export function overviewFraming(size: number, aspect = REFERENCE_ASPECT): Framing {
  const distance = clamp(
    size * 1.45 * aspectWiden(aspect),
    MIN_DISTANCE + 14,
    maxCameraDistance(size, aspect),
  );
  // The ground near the camera expands fast in screen space, so the aim point
  // sits a little towards the camera: it keeps the near corner of the city in
  // frame instead of spending the bottom of the screen on empty landscape.
  const bias = size * 0.05;
  return place([bias, Math.min(size * 0.02, 3), bias], OVERVIEW_DIR, distance);
}

/**
 * The direction a camera looks from, as the orbit angles `camera-controls`
 * uses: `azimuth` is the compass bearing of the camera around its target
 * (`atan2(x, z)` of the offset, so the default `+x +z` corner is `PI / 4`) and
 * `polar` is the angle down from straight overhead.
 */
export interface ViewAngles {
  azimuth: number;
  polar: number;
}

/** The orbit angles of a camera at `position` looking at `target`. */
export function viewAngles(position: Vec3, target: Vec3): ViewAngles {
  const x = position[0] - target[0];
  const y = position[1] - target[1];
  const z = position[2] - target[2];
  const r = Math.hypot(x, y, z);
  if (r === 0) return { azimuth: 0, polar: 0 };
  return { azimuth: Math.atan2(x, z), polar: Math.acos(clamp(y / r, -1, 1)) };
}

/** A camera `distance` from `target` along the given orbit angles. */
export function orbitFraming(target: Vec3, angles: ViewAngles, distance: number): Framing {
  const s = Math.sin(angles.polar);
  return {
    position: [
      target[0] + distance * s * Math.sin(angles.azimuth),
      target[1] + distance * Math.cos(angles.polar),
      target[2] + distance * s * Math.cos(angles.azimuth),
    ],
    target,
  };
}

/**
 * How far the inspection camera may tilt, as polar angles. Focusing keeps the
 * user's own tilt when it is inside the band and only moves it to the nearer
 * edge when it is not. The overview looks down at about 43 degrees from
 * overhead, so a focus from there dips a little and the facades show (the
 * fixed `INSPECT_DIR` sat at 57 degrees); a camera skimming the rooftops rises
 * enough that the next block does not hide the thing that was clicked.
 */
export const INSPECT_POLAR = { min: 0.86, max: 1.2 } as const;
/** Street-level objects keep the steeper look down between the blocks. */
export const STREET_POLAR = { min: 0.45, max: 0.72 } as const;

/**
 * A useful inspection distance for one entity, inside the camera limits.
 *
 * Given `from`, the current view, the camera keeps its compass bearing and
 * roughly its tilt and only moves in: clicking something must never swing the
 * city round to a different corner (PLAN.md section 6). Without it the camera
 * comes in from the default corner, `INSPECT_DIR`.
 */
export function inspectionFraming(focus: FocusTarget, from?: ViewAngles): Framing {
  // The queue's sign stands beside an approach road: street level too. A
  // facade is not: it is looked at from across the street, at facade height.
  const facade = focus.facing !== undefined && Number.isFinite(focus.facing);
  const street =
    !facade &&
    (focus.kind === "incident" || focus.kind === "construction" || focus.kind === "overflow");
  // A crowd object is a few units across: stand closer, or the next block
  // stands between the camera and the thing that was clicked.
  const small = focus.radius < 3;
  const distance = clamp(
    focus.radius * 3.4 + (street ? (small ? 10 : 15) : 12),
    MIN_DISTANCE + 2,
    MAX_DISTANCE - 20,
  );
  const band = street ? STREET_POLAR : INSPECT_POLAR;
  if (facade) {
    // Keep the user's bearing when it already looks at the face, otherwise
    // come round to the nearer edge of the half circle in front of it.
    const facing = focus.facing as number;
    const bearing = from && Number.isFinite(from.azimuth) ? from.azimuth : facing;
    const offset = Math.atan2(Math.sin(bearing - facing), Math.cos(bearing - facing));
    const polar = from && Number.isFinite(from.polar) ? from.polar : (band.min + band.max) / 2;
    return orbitFraming(
      focus.lookAt,
      { azimuth: facing + clamp(offset, -FACADE_SWING, FACADE_SWING), polar: clamp(polar, band.min, band.max) },
      distance,
    );
  }
  if (!from || !Number.isFinite(from.azimuth) || !Number.isFinite(from.polar)) {
    return place(focus.lookAt, street ? STREET_INSPECT_DIR : INSPECT_DIR, distance);
  }
  return orbitFraming(
    focus.lookAt,
    { azimuth: from.azimuth, polar: clamp(from.polar, band.min, band.max) },
    distance,
  );
}

/** How far either side of straight on a facade may be inspected from, radians. */
const FACADE_SWING = 0.9;

/** Today's tallest tower: tier 5 in a city, 23 units (PLAN.md 76.5). */
export const CITY_TALLEST = 23;

/**
 * The highest point in a model: the top of its tallest building or landmark
 * plot. A metropolis tower reaches about 39 units (34, jittered up to 15%).
 */
export function tallestPoint(city: Pick<CityModel, "buildings" | "landmarks">): number {
  let top = 0;
  for (const b of city.buildings) top = Math.max(top, b.position[1] + b.size[1]);
  for (const l of city.landmarks) top = Math.max(top, l.position[1] + (l.size?.[1] ?? 0));
  return top;
}

/**
 * The box the orbit target may roam in, as `[min, max]` corners (PLAN.md
 * section 5). Right-drag pan and zoom-to-cursor stop at the edge of the
 * landscape instead of sliding the city off screen, and the floor at `y = 0`
 * keeps the target above the ground, which with the polar limit keeps the
 * camera above it too. The ceiling clears the highest point any focus target
 * aims at, 55% up the tallest tower: 24 units for today's 23-unit towers, and
 * `0.6 x tallest` above that, so a metropolis tower is not clipped (PLAN.md
 * 76.5, "Scale checks"). Pass `tallestPoint(city)`.
 */
export function cameraBoundary(size: number, tallest = CITY_TALLEST): [Vec3, Vec3] {
  const half = size * 0.8;
  return [
    [-half, 0, -half],
    [half, Math.max(24, 0.6 * tallest), half],
  ];
}

/**
 * How far a pointer may travel between press and release and still count as a
 * click, in CSS pixels. Anything further was a drag that orbited or panned the
 * camera, and letting go of it over a building or bare ground must not select
 * or clear anything. A finger wobbles more than a mouse.
 */
export const CLICK_SLOP = { mouse: 5, touch: 10 } as const;

/** Whether a release `delta` pixels from its press was a drag, not a click. */
export function isDragRelease(delta: number, pointerType?: string): boolean {
  const slop = pointerType === "touch" || pointerType === "pen" ? CLICK_SLOP.touch : CLICK_SLOP.mouse;
  return delta > slop;
}
