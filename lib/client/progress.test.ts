import { describe, expect, it } from "vitest";
import { splitStageDetail, stageLine } from "./progress";

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
