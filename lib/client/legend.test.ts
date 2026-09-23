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
