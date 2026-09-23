/**
 * The viewer's time-of-day setting: what it can be, where it comes from, and
 * where it is kept (the control is `components/TimeOfDayControl.tsx`, the
 * sky it drives `components/city/timeOfDay.ts`).
 *
 * A shared link wins over the viewer's own habit: `?time=night` shows the
 * night whatever this browser picked last. Otherwise the last choice made in
 * this browser comes back, and failing both it is Auto, the hour the city
 * infers from its repository.
 *
 * Storage is a convenience, never a requirement: a private window, blocked
 * site data or a full quota all throw, and every access is wrapped so that
 * any of them simply means "nothing remembered".
 */

export const TIME_SETTINGS = ["auto", "morning", "afternoon", "evening", "night"] as const;
export type TimeSetting = (typeof TIME_SETTINGS)[number];

export const DEFAULT_TIME_SETTING: TimeSetting = "auto";

/** The `localStorage` key and the URL parameter. */
export const TIME_STORAGE_KEY = "repo-city:time-of-day";
export const TIME_PARAM = "time";

export function isTimeSetting(value: unknown): value is TimeSetting {
  return typeof value === "string" && (TIME_SETTINGS as readonly string[]).includes(value);
}

/** A setting from loose text (a URL parameter, a stored value), or null. */
export function parseTimeSetting(value: string | null | undefined): TimeSetting | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return isTimeSetting(normalized) ? normalized : null;
}

/** `?time=` from a query string, or null when absent or not a setting. */
export function timeFromSearch(search: string): TimeSetting | null {
  try {
    return parseTimeSetting(new URLSearchParams(search).get(TIME_PARAM));
  } catch {
    return null;
  }
}

/** The part of `Storage` this module uses, so tests can hand it a fake. */
export type TimeStorage = Pick<Storage, "getItem" | "setItem">;

/** The remembered setting, or null when there is none or storage is unusable. */
export function readStoredTime(storage: TimeStorage | null | undefined): TimeSetting | null {
  if (!storage) return null;
  try {
    return parseTimeSetting(storage.getItem(TIME_STORAGE_KEY));
  } catch {
    return null;
  }
}

/** Remembers a setting. Returns false, and nothing else, when storage refuses. */
export function writeStoredTime(storage: TimeStorage | null | undefined, setting: TimeSetting): boolean {
  if (!storage) return false;
  try {
    storage.setItem(TIME_STORAGE_KEY, setting);
    return true;
  } catch {
    return false;
  }
}

/** The URL first, then this browser's memory, then Auto. */
export function initialTimeSetting(search: string, storage: TimeStorage | null | undefined): TimeSetting {
  return timeFromSearch(search) ?? readStoredTime(storage) ?? DEFAULT_TIME_SETTING;
}

/**
 * The query string with `?time=` set to `setting`, every other parameter
 * kept. Used only when the address already carries the parameter, so that a
 * choice made on a shared link is what a reload, or a re-share, shows.
 */
export function searchWithTime(search: string, setting: TimeSetting): string {
  const params = new URLSearchParams(search);
  params.set(TIME_PARAM, setting);
  const query = params.toString();
  return query ? `?${query}` : "";
}

/** `window.localStorage`, or null where merely touching it throws. */
export function browserStorage(): TimeStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}
