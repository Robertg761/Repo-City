import { describe, expect, it } from "vitest";
import { progressPanelState, splitStageDetail, stageLine } from "./progress";

describe("progressPanelState", () => {
  const stopped = [
    { id: "repo", status: "done" },
    { id: "tree", status: "failed" },
    { id: "done", status: "pending" },
  ];
  const finished = [
    { id: "ai", status: "failed" },
    { id: "done", status: "done" },
  ];

  it("shows while a survey runs", () => {
    expect(progressPanelState("analyzing", stopped.slice(0, 1))).toEqual({ showing: true, outcome: "surveying" });
    expect(progressPanelState("building", finished).showing).toBe(true);
  });

  it("goes away once a survey has stopped with an error, leaving the toast", () => {
    expect(progressPanelState("error", stopped)).toEqual({ showing: false, outcome: "stopped" });
    expect(progressPanelState("error", [])).toEqual({ showing: false, outcome: "stopped" });
  });

  it("fades a finished survey, a skipped architecture pass included", () => {
    expect(progressPanelState("ready", finished)).toEqual({ showing: false, outcome: "complete" });
  });
});

describe("splitStageDetail", () => {
  it("leaves a running count whole", () => {
    expect(splitStageDetail("1,052 open issues surveyed")).toEqual({
      text: "1,052 open issues surveyed",
      note: null,
    });
    expect(splitStageDetail("checking reviews and CI on 100 pull requests").note).toBeNull();
  });

  it.each(["time limit", "rate limit", "some pages failed"])("splits off (%s)", (note) => {
    expect(splitStageDetail(`1,052 of about 18,604 open issues surveyed (${note})`)).toEqual({
      text: "1,052 of about 18,604 open issues surveyed",
      note,
    });
  });

  it("keeps a bracket that is not a stop note", () => {
    const detail = "CI healthy (GitHub Actions)";
    expect(splitStageDetail(detail)).toEqual({ text: detail, note: null });
  });

  it("splits the note off the pull request line after its enrichment clause", () => {
    expect(
      splitStageDetail("500 of 2,651 open pull requests surveyed, 100 with reviews and CI (rate limit)"),
    ).toEqual({
      text: "500 of 2,651 open pull requests surveyed, 100 with reviews and CI",
      note: "rate limit",
    });
  });
});

describe("stageLine", () => {
  it("puts the architecture pass into words", () => {
    const ai = { id: "ai", label: "Mapping architecture" };
    expect(stageLine({ ...ai, status: "pending" })).toBe("Mapping architecture");
    expect(stageLine({ ...ai, status: "running" })).toBe("Mapping architecture");
    expect(stageLine({ ...ai, status: "done", detail: "skipped" })).toBe("Districts named from the folder tree");
    expect(stageLine({ ...ai, status: "done", detail: "gpt-x" })).toBe("Architecture interpreted by gpt-x");
    expect(stageLine({ ...ai, status: "failed" })).toBe("Architecture interpretation unavailable");
  });

  it("shows every other stage's own detail, or its label until one arrives", () => {
    expect(stageLine({ id: "tree", label: "Architecture mapped", status: "running" })).toBe("Architecture mapped");
    expect(stageLine({ id: "tree", label: "Architecture mapped", status: "done", detail: "128 files mapped" })).toBe(
      "128 files mapped",
    );
  });
});
