/**
 * Whether the legend starts open. It starts folded, on every screen: open,
 * it covered a corner of the city in every first look. Someone who opens it
 * wants it again, so the choice is kept in this browser, the same way the
 * time of day is (`lib/client/timeSetting.ts`), and every storage failure
 * means "nothing remembered".
 */

import type { TimeStorage } from "./timeSetting";

export const LEGEND_STORAGE_KEY = "repo-city:legend-open";

/** True only when this browser last left the legend open. */
export function readStoredLegendOpen(storage: TimeStorage | null | undefined): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(LEGEND_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

/** Remembers the choice. Returns false, and nothing else, when storage refuses. */
export function writeStoredLegendOpen(storage: TimeStorage | null | undefined, open: boolean): boolean {
  if (!storage) return false;
  try {
    storage.setItem(LEGEND_STORAGE_KEY, open ? "true" : "false");
    return true;
  } catch {
    return false;
  }
}
