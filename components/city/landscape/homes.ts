/**
 * The lit windows of the houses out in the land (`?land=rich`), planned the way
 * the city plans its own (`placement.planBuildings`): from each model's
 * window rectangles, so a glowing pane is exactly where the dark one is baked
 * into the geometry, a share of the houses awake at each hour (`rank`, sorted,
 * so the hour only changes a prefix length), and a steady warm or cool tone per
 * window. Pure: no three.js, no React.
 */

import { hash32 } from "../models/buildings/archetypes";
import { archetypeModel } from "../models/buildings/models";
import { facingYaw, panelCentre } from "../models/buildings/mesh";
import { LIT_INSET, LIT_LIFT, drawnHeight } from "../models/buildings/placement";
import type { HouseSpot } from "./plan";

export interface HomeWindow {
  /** Index into the plan's houses. */
  house: number;
  /** Centre in the house's unit space: x and z are footprint fractions, y a height fraction. */
  ox: number;
  oy: number;
  oz: number;
  panelYaw: number;
  uw: number;
  uh: number;
  alongX: boolean;
  /** 0..1: the window is lit when this is below the hour's lit-window share. Sorted ascending. */
  rank: number;
  tone: number;
}

/** The height a house is drawn at (a cottage is held to its proportions). */
export const homeHeight = (h: HouseSpot): number => drawnHeight(h.model, [h.w, h.h, h.d]);

export function planHomeWindows(houses: readonly HouseSpot[], cap = 1400): HomeWindow[] {
  const out: { window: HomeWindow; order: number }[] = [];
  houses.forEach((house, index) => {
    const model = archetypeModel(house.model);
    const rank = (hash32(`${house.key}:11`) % 10000) / 10000;
    for (let w = 0; w < model.windows.length; w++) {
      const roll = hash32(`${house.key}/w${w}`);
      // Roughly three windows in five are on in a lit house, always the same three.
      if (roll % 100 >= 58) continue;
      const panel = model.windows[w];
      const centre = panelCentre(panel, LIT_LIFT);
      out.push({
        order: out.length,
        window: {
          house: index,
          ox: centre[0],
          oy: centre[1],
          oz: centre[2],
          panelYaw: facingYaw(panel.facing),
          uw: panel.w * LIT_INSET,
          uh: panel.h * LIT_INSET,
          alongX: panel.facing === "+z" || panel.facing === "-z",
          rank,
          tone: (Math.floor(roll / 100) % 1000) / 1000,
        },
      });
    }
  });
  // Over the cap: thin the windows by a hash, so the lights stay spread over every house and not just the first to come on.
  const keep = Math.min(1, cap / Math.max(out.length, 1));
  return out
    .filter((entry) => keep >= 1 || (hash32(`${houses[entry.window.house].key}#${entry.order}`) % 10000) / 10000 < keep)
    .sort((a, b) => a.window.rank - b.window.rank || a.order - b.order)
    .slice(0, cap)
    .map((entry) => entry.window);
}

/** How many of the (rank-sorted) windows are lit at a share: a prefix, found by bisection. */
export function litHomeWindows(windows: readonly HomeWindow[], share: number): number {
  let lo = 0;
  let hi = windows.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (windows[mid].rank < share) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
