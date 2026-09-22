import { describe, expect, it } from "vitest";
import { splitStageDetail } from "./progress";

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
