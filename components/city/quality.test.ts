import { describe, expect, it } from "vitest";
import {
  PROBE_MS,
  QUALITY_SETTINGS,
  STEP_DOWN_MS,
  tierForSamples,
  tierFromSearch,
} from "./quality";

/** `count` frames of `ms` each, as the probe would collect them. */
const frames = (ms: number, count = 120): number[] => Array.from({ length: count }, () => ms);

describe("the step-down rule", () => {
  it("keeps a machine holding sixty frames a second on the high tier", () => {
    expect(tierForSamples(frames(16.7))).toBe("high");
  });

  it("steps down when the average frame is over the budget", () => {
    // PLAN.md section 75: worse than 25 ms per frame and the tier drops.
    expect(tierForSamples(frames(STEP_DOWN_MS + 5))).toBe("low");
    expect(tierForSamples(frames(STEP_DOWN_MS - 5))).toBe("high");
  });

  it("ignores stalls, which are interruptions rather than frame rates", () => {
    // One backgrounded second in the middle of an otherwise fast run.
    const samples = [...frames(16.7, 60), 1200, ...frames(16.7, 60)];
    expect(tierForSamples(samples)).toBe("high");
  });

  it("keeps the tier it was given when there is not enough to judge on", () => {
    expect(tierForSamples([])).toBe("high");
    expect(tierForSamples(frames(90, 3))).toBe("high");
    expect(tierForSamples(frames(90, 3), "low")).toBe("low");
  });

  it("judges on the mean, so a few long frames do not condemn a fast machine", () => {
    const samples = [...frames(14, 100), ...frames(60, 8)];
    expect(tierForSamples(samples)).toBe("high");
  });
});

describe("the query override", () => {
  it("reads the two tiers and nothing else", () => {
    expect(tierFromSearch("?quality=low")).toBe("low");
    expect(tierFromSearch("?quality=high")).toBe("high");
    expect(tierFromSearch("?quality=potato")).toBeNull();
    expect(tierFromSearch("?dev=city")).toBeNull();
    expect(tierFromSearch("")).toBeNull();
  });
});

describe("the tiers themselves", () => {
  it("cuts post-processing before shadows (PLAN.md section 63)", () => {
    expect(QUALITY_SETTINGS.high.postProcessing).toBe(true);
    expect(QUALITY_SETTINGS.low.postProcessing).toBe(false);
    expect(QUALITY_SETTINGS.low.ambientOcclusion).toBe(false);
    expect(QUALITY_SETTINGS.low.bloom).toBe(false);
    // The shadows survive the step down, smaller.
    expect(QUALITY_SETTINGS.low.shadowMapSize).toBeLessThan(
      QUALITY_SETTINGS.high.shadowMapSize,
    );
    expect(QUALITY_SETTINGS.low.shadowMapSize).toBeGreaterThanOrEqual(1024);
  });

  it("asks for less of everything on the low tier", () => {
    expect(QUALITY_SETTINGS.low.maxDpr).toBeLessThan(QUALITY_SETTINGS.high.maxDpr);
    expect(QUALITY_SETTINGS.low.contactShadows).toBe(false);
  });

  it("names itself, so the chosen tier can be reported", () => {
    expect(QUALITY_SETTINGS.high.tier).toBe("high");
    expect(QUALITY_SETTINGS.low.tier).toBe("low");
  });

  it("watches for long enough to average out a hitch", () => {
    expect(PROBE_MS).toBeGreaterThanOrEqual(3000);
  });
});
