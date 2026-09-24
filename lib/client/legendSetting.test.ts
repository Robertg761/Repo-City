import { describe, expect, it } from "vitest";
import { LEGEND_STORAGE_KEY, readStoredLegendOpen, writeStoredLegendOpen } from "./legendSetting";
import type { TimeStorage } from "./timeSetting";

function memoryStorage(initial: Record<string, string> = {}): TimeStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => {
      data[key] = value;
    },
  };
}

const brokenStorage: TimeStorage = {
  getItem: () => {
    throw new DOMException("denied", "SecurityError");
  },
  setItem: () => {
    throw new DOMException("full", "QuotaExceededError");
  },
};

describe("legend open setting", () => {
  it("starts folded when nothing is remembered", () => {
    expect(readStoredLegendOpen(memoryStorage())).toBe(false);
    expect(readStoredLegendOpen(null)).toBe(false);
    expect(readStoredLegendOpen(memoryStorage({ [LEGEND_STORAGE_KEY]: "garbage" }))).toBe(false);
  });

  it("remembers an opened legend, and a folded one", () => {
    const storage = memoryStorage();
    expect(writeStoredLegendOpen(storage, true)).toBe(true);
    expect(storage.data[LEGEND_STORAGE_KEY]).toBe("true");
    expect(readStoredLegendOpen(storage)).toBe(true);
    writeStoredLegendOpen(storage, false);
    expect(readStoredLegendOpen(storage)).toBe(false);
  });

  it("treats unusable storage as nothing remembered", () => {
    expect(readStoredLegendOpen(brokenStorage)).toBe(false);
    expect(writeStoredLegendOpen(brokenStorage, true)).toBe(false);
    expect(writeStoredLegendOpen(null, true)).toBe(false);
  });
});
