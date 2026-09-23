import { describe, expect, it } from "vitest";
import {
  GUARD_MS,
  PROBE_MS,
  QUALITY_SETTINGS,
  QualityGovernor,
  STEP_DOWN_MS,
  TIER_ORDER,
  VERY_SLOW_MS,
  judgeFrames,
  startingTier,
  tierAfter,
  tierForSamples,
  tierFromSearch,
} from "./quality";

/** `count` frames of `ms` each, as the probe would collect them. */
const frames = (ms: number, count = 120): number[] => Array.from({ length: count }, () => ms);

describe("the step-down rule", () => {
  it("keeps a machine holding sixty frames a second on the high tier", () => {
    expect(tierForSamples(frames(16.7))).toBe("high");
  });

  it("steps down one tier when the average frame is over the budget", () => {
    // PLAN.md section 75: worse than 25 ms per frame and the tier drops.
    expect(tierForSamples(frames(STEP_DOWN_MS + 5))).toBe("medium");
    expect(tierForSamples(frames(STEP_DOWN_MS + 5), "medium")).toBe("low");
    expect(tierForSamples(frames(STEP_DOWN_MS - 5))).toBe("high");
  });

  it("goes straight to low under twenty frames a second", () => {
    expect(tierForSamples(frames(VERY_SLOW_MS + 5))).toBe("low");
    expect(judgeFrames(frames(VERY_SLOW_MS + 5)).verdict).toBe("very-slow");
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
    expect(judgeFrames([]).verdict).toBe("unknown");
  });

  it("steps down a machine too slow to produce an ordinary frame at all", () => {
    // A software renderer: every frame is longer than the stall threshold,
    // so none of them is "usable", and that is itself the answer.
    expect(tierForSamples(frames(750, 4))).toBe("low");
    expect(tierForSamples(frames(300, 11))).toBe("low");
  });

  it("steps down under eight frames a second even when no frame is a stall", () => {
    // 3 s of 140 ms frames is 21 frames: fewer than the minimum, full window.
    expect(tierForSamples(frames(140, 21))).toBe("low");
  });

  it("judges on the mean, so a few long frames do not condemn a fast machine", () => {
    const samples = [...frames(14, 100), ...frames(60, 8)];
    expect(tierForSamples(samples)).toBe("high");
  });

  it("gives the guard a looser budget than the probe, so the two cannot argue", () => {
    expect(GUARD_MS).toBeGreaterThan(STEP_DOWN_MS * 1.3);
    // 30 frames a second passes the guard and fails the probe.
    expect(judgeFrames(frames(33, 120), GUARD_MS, 4000).verdict).toBe("ok");
    expect(judgeFrames(frames(33, 90)).verdict).toBe("slow");
  });

  it("never steps up", () => {
    for (const tier of TIER_ORDER) {
      expect(tierAfter(tier, "ok")).toBe(tier);
      expect(tierAfter(tier, "unknown")).toBe(tier);
      expect(TIER_ORDER.indexOf(tierAfter(tier, "slow"))).toBeGreaterThanOrEqual(TIER_ORDER.indexOf(tier));
    }
    expect(tierAfter("low", "slow")).toBe("low");
  });
});

describe("the governor", () => {
  const slow = (meanMs: number) => ({ verdict: "slow" as const, meanMs });
  const ok = (meanMs: number) => ({ verdict: "ok" as const, meanMs });

  it("steps from high to medium to low while each step helps", () => {
    const governor = new QualityGovernor("high");
    expect(governor.consider(slow(40), "city")).toBe("medium");
    expect(governor.consider(slow(30), "city")).toBe("low");
    expect(governor.settled).toBe(true);
    expect(governor.history.map((change) => change.tier)).toEqual(["medium", "low"]);
  });

  it("stops after a step that did not make frames quicker", () => {
    // A browser capping at thirty frames a second: every tier measures 33 ms.
    const governor = new QualityGovernor("high");
    expect(governor.consider(slow(33.3), "city")).toBe("medium");
    expect(governor.consider(slow(33.2), "city")).toBeNull();
    expect(governor.stuck).toBe(true);
    expect(governor.consider(slow(40), "guard")).toBeNull();
    expect(governor.tier).toBe("medium");
  });

  it("keeps a machine that is fast enough where it is", () => {
    const governor = new QualityGovernor("high");
    expect(governor.consider(ok(16.7), "city")).toBeNull();
    expect(governor.consider({ verdict: "unknown", meanMs: Number.NaN }, "city")).toBeNull();
    expect(governor.tier).toBe("high");
    expect(governor.settled).toBe(false);
  });

  it("cannot flap: the tiers it passes through only ever go down", () => {
    const governor = new QualityGovernor("high");
    const seen: string[] = [governor.tier];
    const means = [40, 16, 45, 16, 60, 16, 30, 16];
    for (const mean of means) {
      governor.consider(mean > STEP_DOWN_MS ? slow(mean) : ok(mean), "guard");
      seen.push(governor.tier);
    }
    const ranks = seen.map((tier) => TIER_ORDER.indexOf(tier as never));
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
  });

  it("steps down one place, unmeasured, after a lost context", () => {
    const governor = new QualityGovernor("high");
    expect(governor.force("context lost")).toBe("medium");
    expect(governor.force("context lost")).toBe("low");
    expect(governor.force("context lost")).toBeNull();
  });
});

describe("the starting tier", () => {
  it("starts a phone at medium and everything else at high", () => {
    expect(startingTier(true)).toBe("medium");
    expect(startingTier(false)).toBe("high");
  });
});

describe("the query override", () => {
  it("reads the three tiers and nothing else", () => {
    expect(tierFromSearch("?quality=low")).toBe("low");
    expect(tierFromSearch("?quality=medium")).toBe("medium");
    expect(tierFromSearch("?quality=high")).toBe("high");
    expect(tierFromSearch("?quality=potato")).toBeNull();
    expect(tierFromSearch("?dev=city")).toBeNull();
    expect(tierFromSearch("")).toBeNull();
  });
});

describe("the tiers themselves", () => {
  it("leaves the high tier exactly as it was", () => {
    expect(QUALITY_SETTINGS.high).toEqual({
      tier: "high",
      postProcessing: true,
      ambientOcclusion: true,
      bloom: true,
      smaa: true,
      shadowMapSize: 2048,
      contactShadows: false,
      maxDpr: 2,
      textureSize: 256,
      anisotropy: 4,
      groundDetail: true,
      crowdEffects: true,
    });
  });

  it("drops the ambient occlusion and the pixel ratio first, and keeps the rest of the composer", () => {
    const medium = QUALITY_SETTINGS.medium;
    expect(medium.postProcessing).toBe(true);
    expect(medium.ambientOcclusion).toBe(false);
    expect(medium.bloom).toBe(true);
    expect(medium.smaa).toBe(true);
    expect(medium.maxDpr).toBeLessThan(QUALITY_SETTINGS.high.maxDpr);
    expect(medium.maxDpr).toBeGreaterThan(QUALITY_SETTINGS.low.maxDpr);
    expect(medium.shadowMapSize).toBe(QUALITY_SETTINGS.high.shadowMapSize);
  });

  it("asks less of every setting at each step down", () => {
    for (let i = 1; i < TIER_ORDER.length; i++) {
      const better = QUALITY_SETTINGS[TIER_ORDER[i - 1]];
      const worse = QUALITY_SETTINGS[TIER_ORDER[i]];
      expect(worse.maxDpr).toBeLessThanOrEqual(better.maxDpr);
      expect(worse.shadowMapSize).toBeLessThanOrEqual(better.shadowMapSize);
      expect(worse.textureSize).toBeLessThanOrEqual(better.textureSize);
      for (const flag of ["postProcessing", "ambientOcclusion", "bloom", "smaa", "groundDetail", "crowdEffects"] as const) {
        if (!better[flag]) expect(worse[flag]).toBe(false);
      }
    }
  });

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

  it("keeps the surface textures on the low tier, smaller, and drops the detail pass", () => {
    expect(QUALITY_SETTINGS.low.textureSize).toBeLessThan(QUALITY_SETTINGS.high.textureSize);
    expect(QUALITY_SETTINGS.low.textureSize).toBeGreaterThanOrEqual(64);
    expect(QUALITY_SETTINGS.low.anisotropy).toBe(1);
    expect(QUALITY_SETTINGS.high.groundDetail).toBe(true);
    expect(QUALITY_SETTINGS.low.groundDetail).toBe(false);
  });

  it("drops the crowd's smoke and halos on the low tier, and nothing else of the crowd (76.9)", () => {
    expect(QUALITY_SETTINGS.high.crowdEffects).toBe(true);
    expect(QUALITY_SETTINGS.low.crowdEffects).toBe(false);
    // The flag is decoration only: no setting may hide an issue or a pull request.
    for (const settings of Object.values(QUALITY_SETTINGS)) {
      expect(Object.keys(settings).filter((key) => /crowd/i.test(key))).toEqual(["crowdEffects"]);
    }
  });

  it("names itself, so the chosen tier can be reported", () => {
    for (const tier of TIER_ORDER) expect(QUALITY_SETTINGS[tier].tier).toBe(tier);
  });

  it("watches for long enough to average out a hitch", () => {
    expect(PROBE_MS).toBeGreaterThanOrEqual(3000);
  });
});
