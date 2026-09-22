/**
 * Inspector facts for the crowd and the queue (PLAN.md 76.9, 76.10 and the
 * S8 test plan in 76.14): titles, form subtitles, the generated reason,
 * GitHub links, "about" for estimated totals and `toLocaleString` numbers.
 */

import { describe, expect, it } from "vitest";
import backlogFixture from "@/fixtures/backlog.analysis.json";
import { INCIDENT_FORM_LABEL, WORKS_FORM_LABEL } from "@/lib/city/entities";
import { generateCity } from "@/lib/city/generator";
import type { IncidentForm, RepoAnalysis, WorksForm } from "@/types/analysis";
import type { CityModel, ConstructionSite, Overflow } from "@/types/city";
import { MAX_TOUCHED_FILES, aboutCount, overflowFacts, resolveEntity } from "./entities";

const analysis = backlogFixture as unknown as RepoAnalysis;
const repoUrl = analysis.repo.url;
const NOW = Date.parse(analysis.generatedAt);

const city = generateCity(analysis) as CityModel;
const crowdIssues = city.backlog?.incidents ?? [];
const crowdPulls = city.backlog?.constructionSites ?? [];

const fact = (id: string, label: string, model: CityModel = city) =>
  resolveEntity(id, model, analysis, NOW)?.facts.find((f) => f.label === label)?.value;

/** A city whose only crowd object is `site`, so a test can shape one pull request freely. */
function withSite(site: ConstructionSite): CityModel {
  return { ...city, backlog: { incidents: [], constructionSites: [site] } };
}

const basePull = crowdPulls.find((s) => s.form === "scaffold") as ConstructionSite;

describe("crowd incidents", () => {
  const forms = Object.keys(INCIDENT_FORM_LABEL) as IncidentForm[];

  it.each(forms)("titles a %s by number and subtitles it with its form", (form) => {
    const incident = crowdIssues.find((i) => i.form === form);
    expect(incident, `no crowd ${form} in the backlog fixture`).toBeDefined();
    if (!incident) return;
    const resolved = resolveEntity(incident.id, city, analysis, NOW);
    expect(resolved?.label).toBe("INCIDENT");
    expect(resolved?.title).toBe(`Issue #${incident.issue.number}`);
    expect(resolved?.subtitle).toBe(INCIDENT_FORM_LABEL[form]);
    expect(resolved?.description).toBe(incident.issue.title);
    // The generated rule sentence from lib/city/entities.ts, never rewritten.
    expect(resolved?.reason).toBe(incident.reason);
    expect(resolved?.sourceUrl).toBe(`${repoUrl}/issues/${incident.issue.number}`);
    expect(resolved?.tooltip).toBe(`${INCIDENT_FORM_LABEL[form]} · ${incident.issue.title}`);
  });

  it("lists age, last activity, comments, reactions and the nearby path", () => {
    const incident = crowdIssues.find((i) => i.issue.relatedPath && (i.issue.reactions ?? 0) > 1);
    if (!incident) throw new Error("fixture has no anchored issue with reactions");
    const labels = resolveEntity(incident.id, city, analysis, NOW)?.facts.map((f) => f.label);
    expect(labels).toEqual(expect.arrayContaining(["State", "Open", "Last activity", "Comments", "Reactions", "Near"]));
    const near = resolveEntity(incident.id, city, analysis, NOW)?.facts.find((f) => f.label === "Near");
    expect(near?.href).toBe(`${repoUrl}/tree/${analysis.repo.headSha}/${incident.issue.relatedPath}`);
    expect(fact(incident.id, "Reactions")).toBe(`${incident.issue.reactions} reactions`);
  });

  it("separates thousands", () => {
    const incident = crowdIssues[0];
    const model: CityModel = {
      ...city,
      backlog: {
        incidents: [
          { ...incident, issue: { ...incident.issue, comments: 1234, reactions: 20500, createdAt: "2019-01-01T00:00:00Z" } },
        ],
        constructionSites: [],
      },
    };
    expect(fact(incident.id, "Comments", model)).toBe("1,234 comments");
    expect(fact(incident.id, "Reactions", model)).toBe("20,500 reactions");
    expect(fact(incident.id, "Open", model)).toMatch(/^\d,\d{3} days$/);
  });

  it("flags an issue marked for volunteers", () => {
    const incident = crowdIssues[0];
    const model: CityModel = {
      ...city,
      backlog: {
        incidents: [{ ...incident, issue: { ...incident.issue, labels: ["good first issue"] } }],
        constructionSites: [],
      },
    };
    expect(fact(incident.id, "Volunteers", model)).toBeDefined();
  });

  it("leaves reactions out when they were never read", () => {
    const incident = crowdIssues[0];
    const model: CityModel = {
      ...city,
      backlog: {
        incidents: [{ ...incident, issue: { ...incident.issue, reactions: undefined } }],
        constructionSites: [],
      },
    };
    expect(fact(incident.id, "Reactions", model)).toBeUndefined();
  });
});

describe("crowd pull requests", () => {
  const forms = (Object.keys(WORKS_FORM_LABEL) as WorksForm[]).filter((f) => f !== "site");

  it.each(forms)("titles a %s by number and subtitles it with its form", (form) => {
    const site = crowdPulls.find((s) => s.form === form);
    expect(site, `no crowd ${form} in the backlog fixture`).toBeDefined();
    if (!site) return;
    const resolved = resolveEntity(site.id, city, analysis, NOW);
    expect(resolved?.label).toBe("CONSTRUCTION");
    expect(resolved?.title).toBe(`Pull Request #${site.pull.number}`);
    expect(resolved?.subtitle).toBe(WORKS_FORM_LABEL[form]);
    expect(resolved?.description).toBe(site.pull.title);
    expect(resolved?.reason).toBe(site.reason);
    expect(resolved?.sourceUrl).toBe(`${repoUrl}/pull/${site.pull.number}`);
  });

  it("names the drawn signal beside failing checks and a requested change", () => {
    const site: ConstructionSite = {
      ...basePull,
      pull: { ...basePull.pull, checks: "failing", review: "changes-requested" },
    };
    expect(fact(site.id, "CI", withSite(site))).toBe("Failing, red beacon");
    expect(fact(site.id, "Review", withSite(site))).toBe("Changes requested, stop board");
  });

  it("names the green flag on an approved pull request with passing checks", () => {
    const site: ConstructionSite = {
      ...basePull,
      pull: { ...basePull.pull, checks: "passing", review: "approved" },
    };
    expect(fact(site.id, "CI", withSite(site))).toBe("Passing");
    expect(fact(site.id, "Review", withSite(site))).toBe("Approved, green flag");
  });

  it("says nothing about CI or review when enrichment never ran", () => {
    const site: ConstructionSite = {
      ...basePull,
      pull: { ...basePull.pull, checks: null, review: undefined },
    };
    expect(fact(site.id, "CI", withSite(site))).toBeUndefined();
    expect(fact(site.id, "Review", withSite(site))).toBeUndefined();
  });

  it(`links at most ${MAX_TOUCHED_FILES} touched files, then the rest of the diff`, () => {
    const files = Array.from({ length: 7 }, (_, i) => `src/part-${i}.ts`);
    const site: ConstructionSite = {
      ...basePull,
      pull: { ...basePull.pull, files, changedFiles: 1204 },
    };
    const facts = resolveEntity(site.id, withSite(site), analysis, NOW)?.facts ?? [];
    const linked = facts.filter((f) => f.value.startsWith("src/part-"));
    expect(linked).toHaveLength(MAX_TOUCHED_FILES);
    expect(linked[0]).toEqual({
      label: "Touches",
      value: "src/part-0.ts",
      href: `${repoUrl}/tree/${analysis.repo.headSha}/src/part-0.ts`,
    });
    expect(linked.slice(1).every((f) => f.label === "")).toBe(true);
    const more = facts.find((f) => f.value.startsWith("and "));
    expect(more).toEqual({
      label: "",
      value: "and 1,199 more files",
      href: `${repoUrl}/pull/${site.pull.number}/files`,
    });
  });

  it("gives Near only when it is not one of the listed files", () => {
    const listed: ConstructionSite = {
      ...basePull,
      pull: { ...basePull.pull, files: ["src/a.ts", "src"], relatedPath: "src" },
    };
    expect(fact(listed.id, "Near", withSite(listed))).toBeUndefined();
    const apart: ConstructionSite = {
      ...basePull,
      pull: { ...basePull.pull, files: ["src/a.ts"], relatedPath: "src" },
    };
    expect(fact(apart.id, "Near", withSite(apart))).toBe("src");
  });

  it("marks a draft and keeps the hero branch for cranes", () => {
    const draft = crowdPulls.find((s) => s.form === "hoarding");
    if (!draft) throw new Error("no hoarding");
    expect(fact(draft.id, "Draft")).toBe("Not ready for review");
    const hero = city.constructionSites[0];
    if (hero) {
      expect(resolveEntity(hero.id, city, analysis, NOW)?.title).toBe(hero.pull.title);
    }
  });
});

describe("the queue at the limits", () => {
  const overflow = city.overflow as Overflow;

  it("is headed by the queue's own words in the settlement's word", () => {
    const resolved = resolveEntity("overflow", city, analysis, NOW);
    expect(resolved?.kind).toBe("overflow");
    expect(resolved?.label).toBe("QUEUE AT THE CITY LIMITS");
    expect(resolved?.title).toBe(overflow.title);
    expect(resolved?.reason).toBe(overflow.reason);

    const village = generateCity(analysis, { tier: "village" });
    expect(resolveEntity("overflow", village, analysis, NOW)?.label).toBe(
      "QUEUE AT THE VILLAGE LIMITS",
    );
    const town = generateCity(analysis, { tier: "town" });
    expect(resolveEntity("overflow", town, analysis, NOW)?.label).toBe("QUEUE AT THE TOWN LIMITS");
  });

  it("counts open, drawn and queued for both kinds and links to GitHub", () => {
    const sample: Overflow = {
      ...overflow,
      issues: { total: 21011, drawn: 1000, hidden: 20011 },
      pulls: { total: 2651, drawn: 500, hidden: 2151 },
      exact: true,
    };
    expect(overflowFacts(sample, repoUrl)).toEqual([
      { label: "Issues open", value: "21,011" },
      { label: "Issues drawn", value: "1,000" },
      { label: "Issues queued", value: "20,011" },
      { label: "PRs open", value: "2,651" },
      { label: "PRs drawn", value: "500" },
      { label: "PRs queued", value: "2,151" },
      { label: "On GitHub", value: "Every open issue", href: `${repoUrl}/issues` },
      { label: "", value: "Every open pull request", href: `${repoUrl}/pulls` },
    ]);
  });

  it("says about when the totals are estimates", () => {
    const sample: Overflow = {
      ...overflow,
      issues: { total: 18604, drawn: 400, hidden: 18204 },
      pulls: { total: 30, drawn: 30, hidden: 0 },
      exact: false,
    };
    const facts = overflowFacts(sample, null);
    expect(facts.find((f) => f.label === "Issues open")?.value).toBe("about 18,604");
    expect(facts.find((f) => f.label === "Issues queued")?.value).toBe("about 18,204");
    // Drawn is counted, never estimated.
    expect(facts.find((f) => f.label === "Issues drawn")?.value).toBe("400");
    expect(facts.find((f) => f.label === "PRs queued")?.value).toBe("none");
    expect(facts.some((f) => f.href)).toBe(false);
  });

  it("skips a kind with nothing open", () => {
    const sample: Overflow = {
      ...overflow,
      pulls: { total: 0, drawn: 0, hidden: 0 },
    };
    expect(overflowFacts(sample, null).some((f) => f.label.startsWith("PRs"))).toBe(false);
  });

  it("hovers as the queue, adding the pull requests the sign leaves out", () => {
    expect(resolveEntity("overflow", city, analysis, NOW)?.tooltip).toBe(
      `Queue at the city limits, with ${overflow.pulls.hidden.toLocaleString("en-US")} pull requests too`,
    );
  });

  it("formats about-counts", () => {
    expect(aboutCount(21011, true)).toBe("21,011");
    expect(aboutCount(21011, false)).toBe("about 21,011");
  });
});

describe("civic landmark header", () => {
  it.each([
    ["village", "VILLAGE CHAPEL"],
    ["town", "TOWN HALL"],
    ["city", "CITY HALL"],
    ["metropolis", "CITY HALL"],
  ] as const)("reads the landmark's own title in a %s", (tier, title) => {
    const model = generateCity(analysis, { tier });
    const civic = model?.landmarks.find((l) => l.landmarkType === "civic");
    if (!civic) throw new Error("no civic landmark");
    expect(resolveEntity(civic.id, model, analysis, NOW)?.label).toBe(title);
  });
});
