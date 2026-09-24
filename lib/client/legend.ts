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

/**
 * The little picture beside a term (`components/LegendGlyphs.tsx`), tinted
 * with the colour the thing wears in the city.
 */
export type LegendGlyph =
  | "building"
  | "district"
  | "power"
  | "fireStation"
  | "info"
  | "transit"
  | "highway"
  | "queue"
  | "incident"
  | IncidentForm
  | "crane"
  | Exclude<WorksForm, "site">
  | "beacon"
  | "stopBoard"
  | "flag";

export type LegendEntry = readonly [term: string, meaning: string, glyph?: LegendGlyph];

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

/**
 * Issue forms in the order `issueForm` tries its rules (PLAN.md 76.7): what
 * the labels say (fire, roadblock, signpost, survey, collision), then what
 * the title says, then age (wreck), then everything else (pothole).
 */
export const ISSUE_FORM_ORDER: readonly IncidentForm[] = [
  "fire",
  "roadblock",
  "signpost",
  "survey",
  "collision",
  "wreck",
  "pothole",
];

/**
 * One line per rule in `lib/analysis/forms.ts`, in the words of the
 * inspector's rule sentences (`ISSUE_FORM_RULE` in `lib/city/entities.ts`).
 */
const ISSUE_MEANING: Record<IncidentForm, string> = {
  fire: "security work, or a severe bug drawing heavy discussion",
  roadblock: "blocked, on hold, or waiting on an answer",
  signpost: "documentation, typos, the website or examples",
  survey: "a feature request, proposal or idea",
  collision: "a bug, by its label or its title",
  wreck: "untouched for two years with nothing in its labels or title",
  pothole: "routine upkeep no other rule claimed, good first issues too",
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
  trench: "a dug-up road: CI, build, tooling or chores",
  scaffold: "code changes, on the building they touch",
};

export const LEGEND_SECTIONS: readonly LegendSection[] = [
  {
    id: "city",
    title: "City",
    entries: [
      ["Building", "a file or module, height follows importance", "building"],
      ["District", "a top-level area of the codebase", "district"],
      ["Power plant", "continuous integration", "power"],
      ["Fire station", "test infrastructure", "fireStation"],
      ["Information centre", "documentation", "info"],
      ["Transit station", "releases", "transit"],
      // Attention, not quality: the legend says so in as many words, because
      // the whole point of PLAN.md sections 21 and 22 is that a popular
      // repository is not thereby a healthy one.
      ["Highway", "forks leaving for the wider ecosystem", "highway"],
      ["Queue", "open issues and PRs counted but not drawn", "queue"],
    ],
  },
  {
    id: "issues",
    title: "Issues",
    entries: [
      ["Incident", "one of the most pressing open issues, with crews", "incident"],
      ...ISSUE_FORM_ORDER.map(
        (form): LegendEntry => [INCIDENT_FORM_LABEL[form], ISSUE_MEANING[form], form],
      ),
    ],
    note: "Every other open issue is one of these. Bigger and brighter means more discussion, and old issues of every form show rust.",
  },
  {
    id: "pulls",
    title: "Pull requests",
    entries: [
      ["Crane", "one of the leading pull requests, drawn in full", "crane"],
      ...WORKS_FORM_ORDER.map(
        (form): LegendEntry => [WORKS_FORM_LABEL[form], WORKS_MEANING[form], form],
      ),
    ],
    extra: {
      title: "Signals",
      entries: [
        ["Red beacon", "checks are failing", "beacon"],
        ["Stop board", "a reviewer asked for changes", "stopBoard"],
        ["Green flag", "approved", "flag"],
      ],
    },
    note: "Rust means nobody is working on it; grey means the work is slow.",
  },
];

export const LEGEND_CONTROLS: readonly LegendEntry[] = [
  ["Drag", "orbit"],
  ["Right-drag", "pan"],
  ["Wheel", "zoom"],
  ["Click", "select"],
];
