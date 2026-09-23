import { describe, expect, it } from "vitest";
import {
  DEFAULT_TIME_SETTING,
  TIME_SETTINGS,
  TIME_STORAGE_KEY,
  initialTimeSetting,
  parseTimeSetting,
  readStoredTime,
  searchWithTime,
  timeFromSearch,
  writeStoredTime,
  type TimeStorage,
} from "./timeSetting";

/** A `localStorage` stand-in. */
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

/** What a private window, blocked site data or a full quota does. */
const brokenStorage: TimeStorage = {
  getItem: () => {
    throw new DOMException("denied", "SecurityError");
  },
  setItem: () => {
    throw new DOMException("full", "QuotaExceededError");
  },
};

describe("parsing a setting", () => {
  it("accepts the five settings, in any case and with stray spaces", () => {
    for (const setting of TIME_SETTINGS) {
      expect(parseTimeSetting(setting)).toBe(setting);
      expect(parseTimeSetting(` ${setting.toUpperCase()} `)).toBe(setting);
    }
  });

  it("rejects anything else", () => {
    for (const value of [null, undefined, "", "dusk", "noon", "nights", "0"]) {
      expect(parseTimeSetting(value)).toBeNull();
    }
  });

  it("reads ?time= from a query string", () => {
    expect(timeFromSearch("?time=night")).toBe("night");
    expect(timeFromSearch("?quality=low&time=Morning")).toBe("morning");
    expect(timeFromSearch("time=evening")).toBe("evening");
    expect(timeFromSearch("?time=auto")).toBe("auto");
    expect(timeFromSearch("")).toBeNull();
    expect(timeFromSearch("?time=teatime")).toBeNull();
    expect(timeFromSearch("?dev=city")).toBeNull();
  });
});

describe("remembering a setting", () => {
  it("round-trips through storage", () => {
    const storage = memoryStorage();
    expect(readStoredTime(storage)).toBeNull();
    expect(writeStoredTime(storage, "evening")).toBe(true);
    expect(storage.data[TIME_STORAGE_KEY]).toBe("evening");
    expect(readStoredTime(storage)).toBe("evening");
  });

  it("ignores a stored value it does not recognise", () => {
    expect(readStoredTime(memoryStorage({ [TIME_STORAGE_KEY]: "twilight" }))).toBeNull();
  });

  it("falls back quietly when storage throws or is missing", () => {
    expect(readStoredTime(brokenStorage)).toBeNull();
    expect(writeStoredTime(brokenStorage, "night")).toBe(false);
    expect(readStoredTime(null)).toBeNull();
    expect(readStoredTime(undefined)).toBeNull();
    expect(writeStoredTime(null, "night")).toBe(false);
  });
});

describe("the setting a visit starts with", () => {
  it("is Auto when nothing says otherwise", () => {
    expect(DEFAULT_TIME_SETTING).toBe("auto");
    expect(initialTimeSetting("", memoryStorage())).toBe("auto");
    expect(initialTimeSetting("", null)).toBe("auto");
    expect(initialTimeSetting("", brokenStorage)).toBe("auto");
  });

  it("is the one this browser remembers", () => {
    expect(initialTimeSetting("", memoryStorage({ [TIME_STORAGE_KEY]: "morning" }))).toBe("morning");
  });

  it("lets a shared link override the browser's memory", () => {
    const storage = memoryStorage({ [TIME_STORAGE_KEY]: "morning" });
    expect(initialTimeSetting("?time=night", storage)).toBe("night");
    expect(initialTimeSetting("?time=auto", storage)).toBe("auto");
    // A broken parameter does not wipe out the remembered choice.
    expect(initialTimeSetting("?time=lunch", storage)).toBe("morning");
    expect(initialTimeSetting("?time=night", brokenStorage)).toBe("night");
  });
});

describe("keeping a shared link in step", () => {
  it("rewrites ?time= and keeps every other parameter", () => {
    expect(searchWithTime("?time=night", "morning")).toBe("?time=morning");
    expect(searchWithTime("?quality=low&time=night&perf=1", "evening")).toBe(
      "?quality=low&time=evening&perf=1",
    );
    expect(searchWithTime("", "night")).toBe("?time=night");
  });
});
