import { describe, expect, it } from "vitest";
import {
  DEFAULT_SOUND,
  DEFAULT_VOLUME,
  SOUND_STORAGE_KEY,
  clampVolume,
  readStoredSound,
  writeStoredSound,
  type SoundStorage,
} from "./audioSettings";

function memoryStorage(initial: Record<string, string> = {}): SoundStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => {
      data[key] = value;
    },
  };
}

const throwing: SoundStorage = {
  getItem: () => {
    throw new Error("SecurityError");
  },
  setItem: () => {
    throw new Error("QuotaExceededError");
  },
};

describe("sound setting persistence", () => {
  it("is off at the default volume when nothing is remembered", () => {
    expect(readStoredSound(memoryStorage())).toEqual(DEFAULT_SOUND);
    expect(readStoredSound(null)).toEqual(DEFAULT_SOUND);
    expect(DEFAULT_SOUND.on).toBe(false);
  });

  it("round-trips on and volume", () => {
    const storage = memoryStorage();
    expect(writeStoredSound(storage, { on: true, volume: 0.35 })).toBe(true);
    expect(readStoredSound(storage)).toEqual({ on: true, volume: 0.35 });
  });

  it("clamps a stored volume and ignores anything but a real true", () => {
    const storage = memoryStorage({ [SOUND_STORAGE_KEY]: JSON.stringify({ on: "yes", volume: 7 }) });
    expect(readStoredSound(storage)).toEqual({ on: false, volume: 1 });
  });

  it("treats garbage as nothing remembered", () => {
    expect(readStoredSound(memoryStorage({ [SOUND_STORAGE_KEY]: "{not json" }))).toEqual(DEFAULT_SOUND);
    expect(readStoredSound(memoryStorage({ [SOUND_STORAGE_KEY]: "null" }))).toEqual(DEFAULT_SOUND);
    expect(readStoredSound(memoryStorage({ [SOUND_STORAGE_KEY]: "42" }))).toEqual(DEFAULT_SOUND);
  });

  it("survives storage that throws on every access", () => {
    expect(readStoredSound(throwing)).toEqual(DEFAULT_SOUND);
    expect(writeStoredSound(throwing, { on: true, volume: 0.5 })).toBe(false);
  });

  it("clamps volumes", () => {
    expect(clampVolume(-1)).toBe(0);
    expect(clampVolume(2)).toBe(1);
    expect(clampVolume(0.25)).toBe(0.25);
    expect(clampVolume(Number.NaN)).toBe(DEFAULT_VOLUME);
    expect(clampVolume("0.5")).toBe(DEFAULT_VOLUME);
  });
});
