/**
 * What the legend teaches (PLAN.md sections 40 and 76.10), kept apart from
 * the component so a test can hold it to the forms the city actually draws.
 *
 * The crowd terms are the inspector's own subtitles (`INCIDENT_FORM_LABEL`,
 * `WORKS_FORM_LABEL`), so the word someone learns here is the word they read
 * when they click the thing.
 */

import { INCIDENT_FORM_LABEL, WORKS_FORM_LABEL } from "@/lib/city/entities";
import type { IncidentForm, WorksForm } from "@/types/analysis";

export type LegendEntry = readonly [term: string, meaning: string];

export interface LegendSection {
  id: "city" | "issues" | "pulls";
  /** Tab label. */
  title: string;
  entries: readonly LegendEntry[];
  /** Optional smaller group under the entries, e.g. the PR signals. */
  extra?: { title: string; entries: readonly LegendEntry[] };
  /** One closing line. */
  note?: string;
}

/** Issue forms in the order `issueForm` tries its rules (PLAN.md 76.7). */
export const ISSUE_FORM_ORDER: readonly IncidentForm[] = [
  "fire",
  "wreck",
  "collision",
  "roadblock",
  "signpost",
  "survey",
  "pothole",
];

const ISSUE_MEANING: Record<IncidentForm, string> = {
  fire: "a major, security or hotly argued bug",
  wreck: "stale, or untouched for a year",
  collision: "a bug",
  roadblock: "blocked, or waiting on an answer",
  signpost: "documentation, website or examples",
  survey: "a feature request or proposal",
  pothole: "routine upkeep, good first issues too",
};

/** Crowd works forms in the order `pullForm` tries its rules. */
export const WORKS_FORM_ORDER: readonly Exclude<WorksForm, "site">[] = [
  "van",
  "hoarding",
  "trench",
  "scaffold",
];

const WORKS_MEANING: Record<Exclude<WorksForm, "site">, string> = {
  van: "a works van: a bot or a dependency bump",
  hoarding: "a fenced plot: still a draft",
  trench: "a dug-up road: build, CI or tooling",
  scaffold: "code changes, on the building they touch",
};

export const LEGEND_SECTIONS: readonly LegendSection[] = [
  {
    id: "city",
    title: "City",
    entries: [
      ["Building", "a file or module, height follows importance"],
      ["District", "a top-level area of the codebase"],
      ["Power plant", "continuous integration"],
      ["Fire station", "test infrastructure"],
      ["Information centre", "documentation"],
      ["Transit station", "releases"],
      // Attention, not quality: the legend says so in as many words, because
      // the whole point of PLAN.md sections 21 and 22 is that a popular
      // repository is not thereby a healthy one.
      ["Highway", "forks leaving for the wider ecosystem"],
      ["Queue", "open issues and PRs the streets had no room for"],
    ],
  },
  {
    id: "issues",
    title: "Issues",
    entries: [
      ["Incident", "one of the most pressing open issues, with crews"],
      ...ISSUE_FORM_ORDER.map(
        (form): LegendEntry => [INCIDENT_FORM_LABEL[form], ISSUE_MEANING[form]],
      ),
    ],
    note: "Every other open issue is one of these. Bigger and brighter means more discussion.",
  },
  {
    id: "pulls",
    title: "Pull requests",
    entries: [
      ["Crane", "one of the leading pull requests, drawn in full"],
      ...WORKS_FORM_ORDER.map(
        (form): LegendEntry => [WORKS_FORM_LABEL[form], WORKS_MEANING[form]],
      ),
    ],
    extra: {
      title: "Signals",
      entries: [
        ["Red beacon", "checks are failing"],
        ["Stop board", "a reviewer asked for changes"],
        ["Green flag", "approved"],
      ],
    },
  },
];

export const LEGEND_CONTROLS: readonly LegendEntry[] = [
  ["Drag", "orbit"],
  ["Right-drag", "pan"],
  ["Wheel", "zoom"],
  ["Click", "select"],
];
