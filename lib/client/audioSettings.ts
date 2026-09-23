/**
 * The viewer's sound setting: on or off, and the master volume. The toggle is
 * `components/audio/SoundToggle.tsx`; the soundscape it drives lives in
 * `components/audio/`.
 *
 * Sound is off until the viewer turns it on. The choice is remembered in this
 * browser, but a remembered "on" is only a promise: browsers refuse to start
 * audio before the page has been touched, so the soundscape waits for the
 * viewer's next click or key press before it makes a sound.
 *
 * Storage is a convenience, never a requirement: a private window, blocked
 * site data or a full quota all throw, and every access is wrapped so that
 * any of them simply means "nothing remembered".
 */

export interface SoundSetting {
  on: boolean;
  /** Master volume, 0 to 1. */
  volume: number;
}

export const DEFAULT_VOLUME = 0.7;

export const DEFAULT_SOUND: SoundSetting = { on: false, volume: DEFAULT_VOLUME };

/** The `localStorage` key. */
export const SOUND_STORAGE_KEY = "repo-city:sound";

/** A volume from anything, clamped to 0..1; NaN and non-numbers are the default. */
export function clampVolume(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_VOLUME;
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/** The part of `Storage` this module uses, so tests can hand it a fake. */
export type SoundStorage = Pick<Storage, "getItem" | "setItem">;

/** The remembered setting, or the default when there is none or storage is unusable. */
export function readStoredSound(storage: SoundStorage | null | undefined): SoundSetting {
  if (!storage) return DEFAULT_SOUND;
  try {
    const raw = storage.getItem(SOUND_STORAGE_KEY);
    if (!raw) return DEFAULT_SOUND;
    const parsed = JSON.parse(raw) as Partial<SoundSetting> | null;
    if (!parsed || typeof parsed !== "object") return DEFAULT_SOUND;
    return { on: parsed.on === true, volume: clampVolume(parsed.volume) };
  } catch {
    return DEFAULT_SOUND;
  }
}

/** Remembers a setting. Returns false, and nothing else, when storage refuses. */
export function writeStoredSound(storage: SoundStorage | null | undefined, setting: SoundSetting): boolean {
  if (!storage) return false;
  try {
    storage.setItem(
      SOUND_STORAGE_KEY,
      JSON.stringify({ on: setting.on === true, volume: clampVolume(setting.volume) }),
    );
    return true;
  } catch {
    return false;
  }
}

/** `window.localStorage`, or null where merely touching it throws. */
export function soundStorage(): SoundStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}
