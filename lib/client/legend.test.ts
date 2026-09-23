import { describe, expect, it } from "vitest";
import { INCIDENT_FORM_LABEL, WORKS_FORM_LABEL } from "@/lib/city/entities";
import type { IncidentForm, WorksForm } from "@/types/analysis";
import { ISSUE_FORM_ORDER, LEGEND_SECTIONS, WORKS_FORM_ORDER } from "./legend";

const terms = (id: string): string[] => {
  const section = LEGEND_SECTIONS.find((s) => s.id === id);
  return [...(section?.entries ?? []), ...(section?.extra?.entries ?? [])].map(([term]) => term);
};

describe("legend (PLAN.md 76.10)", () => {
  it("teaches all seven issue forms by the inspector's own names", () => {
    const forms = Object.keys(INCIDENT_FORM_LABEL) as IncidentForm[];
    expect([...ISSUE_FORM_ORDER].sort()).toEqual([...forms].sort());
    for (const form of forms) expect(terms("issues")).toContain(INCIDENT_FORM_LABEL[form]);
  });

  it("lists the issue forms in the order the form rules try them", () => {
    // `issueForm` in lib/analysis/forms.ts: labels first (fire, roadblock,
    // signpost, survey, collision), then the title, then age (wreck), then
    // everything else (pothole).
    expect(ISSUE_FORM_ORDER).toEqual([
      "fire",
      "roadblock",
      "signpost",
      "survey",
      "collision",
      "wreck",
      "pothole",
    ]);
    const issues = LEGEND_SECTIONS.find((s) => s.id === "issues");
    const listed = issues?.entries.slice(1).map(([term]) => term);
    expect(listed).toEqual(ISSUE_FORM_ORDER.map((form) => INCIDENT_FORM_LABEL[form]));
  });

  it("calls a wreck silent and two years untouched, and weathers every form", () => {
    const issues = LEGEND_SECTIONS.find((s) => s.id === "issues");
    const wreck = issues?.entries.find(([term]) => term === INCIDENT_FORM_LABEL.wreck);
    expect(wreck?.[1]).toBe("untouched for two years with nothing in its labels or title");
    expect(issues?.note).toMatch(/every form/i);
    expect(issues?.note).toMatch(/rust/i);
  });

  it("teaches the four crowd works forms, the crane and the three signals", () => {
    const forms = (Object.keys(WORKS_FORM_LABEL) as WorksForm[]).filter((f) => f !== "site");
    expect([...WORKS_FORM_ORDER].sort()).toEqual([...forms].sort());
    for (const form of forms) expect(terms("pulls")).toContain(WORKS_FORM_LABEL[form]);
    expect(terms("pulls")).toEqual(
      expect.arrayContaining(["Crane", "Red beacon", "Stop board", "Green flag"]),
    );
  });

  it("keeps the city's own language and adds the queue", () => {
    expect(terms("city")).toEqual(
      expect.arrayContaining(["Building", "District", "Power plant", "Highway", "Queue"]),
    );
  });

  it("never repeats a term inside a tab", () => {
    for (const section of LEGEND_SECTIONS) {
      const list = terms(section.id);
      expect(new Set(list).size).toBe(list.length);
    }
  });
});
