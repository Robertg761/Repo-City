import { afterEach, describe, expect, it, vi } from "vitest";
import { STAGE_TEMPLATE, devTierOverride } from "./useCityStore";

describe("devTierOverride (PLAN.md 76.11)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reads ?tier= for each of the four tiers", () => {
    expect(devTierOverride("?tier=village")).toBe("village");
    expect(devTierOverride("?tier=town")).toBe("town");
    expect(devTierOverride("?tier=city")).toBe("city");
    expect(devTierOverride("?dev=city&tier=Metropolis")).toBe("metropolis");
  });

  it("ignores a missing or unknown tier", () => {
    expect(devTierOverride("")).toBeUndefined();
    expect(devTierOverride("?tier=hamlet")).toBeUndefined();
    expect(devTierOverride("?dev=city")).toBeUndefined();
  });

  it("is never active in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(devTierOverride("?tier=village")).toBeUndefined();
  });
});

describe("stage rows (PLAN.md section 44)", () => {
  it("names the issue and pull request rows the way the survey reports them", () => {
    const label = (id: string) => STAGE_TEMPLATE.find((stage) => stage.id === id)?.label;
    expect(label("issues")).toBe("Open issues surveyed");
    expect(label("pulls")).toBe("Open pull requests surveyed");
  });
});
