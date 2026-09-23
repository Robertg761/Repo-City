import { afterEach, describe, expect, it, vi } from "vitest";
import { STAGE_TEMPLATE, devTierOverride, useCityStore } from "./useCityStore";

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

describe("a failed survey (PLAN.md sections 0.2 and 60)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("hands the city that was on screen back rather than leaving an empty stage", async () => {
    const { actions } = useCityStore.getState();
    await actions.analyze("fixture");
    const { city, analysis } = useCityStore.getState();
    expect(city).not.toBeNull();

    const line = JSON.stringify({ type: "error", code: "NOT_FOUND", message: "Not Found" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(`${line}\n`, { status: 200, headers: { "content-type": "application/x-ndjson" } })),
    );
    const survey = actions.analyze("someone/missing");
    // While it runs, the stage is cleared for the new city's reveal.
    expect(useCityStore.getState().city).toBeNull();
    await survey;

    const after = useCityStore.getState();
    expect(after.phase).toBe("error");
    expect(after.error?.code).toBe("NOT_FOUND");
    expect(after.city).toBe(city);
    expect(after.analysis).toBe(analysis);
    actions.dismissError();
    expect(useCityStore.getState().phase).toBe("ready");
  });
});

describe("stage rows (PLAN.md section 44)", () => {
  it("names the issue and pull request rows the way the survey reports them", () => {
    const label = (id: string) => STAGE_TEMPLATE.find((stage) => stage.id === id)?.label;
    expect(label("issues")).toBe("Open issues surveyed");
    expect(label("pulls")).toBe("Open pull requests surveyed");
  });
});
