/**
 * District labels on screen (PLAN.md sections 8 and 42): how big each one is
 * drawn, when it fades because the camera is too close, and which ones give
 * way when two would overlap. Pure: no React, no DOM, no three.js. Unit
 * tested. `District.tsx` runs it once a frame over every label.
 *
 * SIZE. A label scales with distance like a thing in the world, the way
 * drei's `distanceFactor` scaled it, so at the overview it reads the same in
 * a village and a metropolis. Coming closer it grows only up to `MAX_SCALE`;
 * past that it would be a screen-high caption over whatever is being
 * inspected, so it fades out instead (`closeFade`).
 *
 * OVERLAP. Labels are placed most important first -- the one under the
 * pointer or selected, then the district with the most buildings -- and a
 * label whose box would overlap one already placed waits, faded out, until
 * the view moves and it has room.
 */

/** The camera's vertical field of view, degrees (`CityCanvas.tsx`). */
export const LABEL_FOV = 35;

/** The largest a label is drawn, as a CSS scale of its own size. */
export const MAX_SCALE = 0.95;
/** Natural scales over which a label fades out as the camera comes in. */
export const FADE_FROM = 2;
export const FADE_TO = 3;
/** Pixels kept clear round a label before another may sit there. */
export const LABEL_GAP = 6;

/**
 * The scale drei's `distanceFactor` would give a label `distance` away:
 * `factor / (2 tan(fov / 2) distance)`.
 */
export function naturalScale(factor: number, distance: number, fov = LABEL_FOV): number {
  const span = 2 * Math.tan((fov * Math.PI) / 360) * Math.max(distance, 1e-3);
  return factor / span;
}

/** The scale a label is actually drawn at: never bigger than `MAX_SCALE`. */
export const drawnScale = (natural: number): number => Math.min(natural, MAX_SCALE);

/** 1 far enough out, 0 once the label would be huge, smooth in between. */
export function closeFade(natural: number): number {
  if (natural <= FADE_FROM) return 1;
  if (natural >= FADE_TO) return 0;
  const t = (natural - FADE_FROM) / (FADE_TO - FADE_FROM);
  return 1 - t * t * (3 - 2 * t);
}

export interface LabelBox {
  id: string;
  /** Centre on screen, CSS pixels. */
  x: number;
  y: number;
  /** Drawn size, CSS pixels. */
  w: number;
  h: number;
  /** Higher places first. */
  priority: number;
  /** False when it is behind the camera, faded out or not revealed yet. */
  visible: boolean;
}

/**
 * Which labels to show: greedily, highest priority first, each one only if
 * its box (plus `gap`) clears every label already shown. Ties go to the id,
 * so the answer never flickers between two equals.
 */
export function placeLabels(boxes: readonly LabelBox[], gap = LABEL_GAP): Set<string> {
  const order = boxes
    .filter((b) => b.visible)
    .sort((a, b) => b.priority - a.priority || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const shown: LabelBox[] = [];
  const ids = new Set<string>();
  for (const box of order) {
    const clear = shown.every(
      (other) =>
        Math.abs(box.x - other.x) * 2 >= box.w + other.w + gap * 2 ||
        Math.abs(box.y - other.y) * 2 >= box.h + other.h + gap * 2,
    );
    if (!clear) continue;
    shown.push(box);
    ids.add(box.id);
  }
  return ids;
}

/**
 * How important a district's label is: the one being pointed at or inspected
 * outranks everything, then the more buildings a district holds, the more it
 * deserves its name on the map.
 */
export function labelPriority(buildings: number, hovered: boolean, selected: boolean): number {
  return (selected ? 2e6 : 0) + (hovered ? 1e6 : 0) + buildings;
}
