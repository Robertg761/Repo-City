import type { InterpretInput } from "./types";

/**
 * Input budget (PLAN.md section 28): roughly 25k tokens. Tokens are estimated
 * at four characters each, which is deliberately pessimistic for code and
 * path listings, so the real request lands under the budget on every provider.
 */
export const MAX_INPUT_TOKENS = 25_000;
export const CHARS_PER_TOKEN = 4;
export const MAX_INPUT_CHARS = MAX_INPUT_TOKENS * CHARS_PER_TOKEN;

const MAX_OUTLINE_LINES = 600;
const MAX_README_CHARS = 6_000;
const MAX_MANIFESTS = 3;
const MAX_MANIFEST_CHARS = 2_000;
const MAX_WORKFLOWS = 20;
const MIN_OUTLINE_LINES = 60;
const MIN_README_CHARS = 500;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export const SYSTEM_PROMPT = `You are the city planner for Repo City. You read a survey of a public GitHub repository and return a structured interpretation of its architecture. A procedural generator turns your answer into a 3D city, so every word is shown to a person who can click through to the real file.

Rules, in order of importance:

1. Never invent repository facts. If the survey does not show it, it does not exist. No guessing at frameworks, history, team size, code quality, or the contents of files you were not given. If you are unsure, say less.
2. Every evidence path must be copied character for character from the TREE OUTLINE. Do not normalise, pluralise, complete, or invent paths. Paths that are not in the outline are deleted before the user sees them, which makes the interpretation look thin.
3. The district list is fixed. You may rename each district and describe its purpose. You may not add districts, remove districts, or change a sourcePath. Return the sourcePath exactly as given.
4. District names are short evocative place names of one to three words, in the spirit of "Knowledge District", "Harbour Works", "The Foundry", "Testing Grounds". No file extensions, no repository jargon, no numbering. The purpose sentence carries the factual load and must be grounded in the evidence paths you list for that district.
5. importantModules are the parts of the repository a newcomer should read first. Prefer real entry points, routers, core engines, and public API surfaces over configuration and tests.
6. strengths and concerns describe the architecture and its upkeep, not the people. Concerns must be observations anchored in the survey (for example "no workflow files are present"), never speculation about motives or skill. If nothing concerns you, return an empty list rather than manufacturing a problem.
7. organizationClarity rates how easy the layout is to navigate from the outline alone: 0 is inscrutable, 1 is immediately obvious.
8. Write plainly. No marketing language, no hedging, no emoji, no markdown.`;

/**
 * Renders the user message. Sections are assembled at their individual caps
 * first, then the outline and the README are trimmed further (in that order,
 * because the outline is the most compressible) until the whole message fits
 * the character budget.
 */
export function buildUserMessage(input: InterpretInput): string {
  let outlineLines = MAX_OUTLINE_LINES;
  let readmeChars = MAX_README_CHARS;
  let message = render(input, outlineLines, readmeChars);

  while (message.length > MAX_INPUT_CHARS && outlineLines > MIN_OUTLINE_LINES) {
    outlineLines = Math.max(MIN_OUTLINE_LINES, Math.floor(outlineLines / 2));
    message = render(input, outlineLines, readmeChars);
  }
  while (message.length > MAX_INPUT_CHARS && readmeChars > MIN_README_CHARS) {
    readmeChars = Math.max(MIN_README_CHARS, Math.floor(readmeChars / 2));
    message = render(input, outlineLines, readmeChars);
  }

  return message.length > MAX_INPUT_CHARS ? message.slice(0, MAX_INPUT_CHARS) : message;
}

function render(input: InterpretInput, outlineLines: number, readmeChars: number): string {
  const { repo } = input;
  const sections: string[] = [];

  sections.push(
    [
      "REPOSITORY",
      `name: ${repo.fullName}`,
      `description: ${repo.description ?? "(none)"}`,
      `primary language: ${repo.primaryLanguage ?? "(unknown)"}`,
      `topics: ${repo.topics.length > 0 ? repo.topics.join(", ") : "(none)"}`,
      `default branch: ${repo.defaultBranch}`,
      `archived: ${repo.archived}`,
    ].join("\n"),
  );

  sections.push(`DETERMINISTIC METRICS\n${input.metricsSummary.trim() || "(none)"}`);

  sections.push(
    [
      "DISTRICTS (fixed: rename and describe only)",
      ...input.districts.map(
        (district) =>
          `- sourcePath: ${district.sourcePath} | working name: ${district.name} | files: ${district.fileCount}`,
      ),
    ].join("\n"),
  );

  sections.push(
    `TREE OUTLINE (${outlineLines >= countLines(input.treeOutline) ? "complete" : "truncated"}; evidence paths must come from here)\n${trimLines(input.treeOutline, outlineLines)}`,
  );

  const notableBuildings = input.buildings
    .slice()
    .sort((a, b) => b.score - a.score)
    .slice(0, 40)
    .map((building) => `- ${building.path} (${building.kind}, tier ${building.tier})`);
  if (notableBuildings.length > 0) {
    sections.push(`HIGHEST SCORING PATHS\n${notableBuildings.join("\n")}`);
  }

  sections.push(`README (first ${readmeChars} characters)\n${truncate(input.readme, readmeChars) || "(none)"}`);

  for (const manifest of input.manifests.slice(0, MAX_MANIFESTS)) {
    sections.push(`MANIFEST ${manifest.path}\n${truncate(manifest.content, MAX_MANIFEST_CHARS)}`);
  }

  sections.push(
    [
      "CI WORKFLOWS (names only)",
      ...(input.workflows.length > 0
        ? input.workflows
            .slice(0, MAX_WORKFLOWS)
            .map((workflow) => `- ${workflow.name} (${workflow.path})`)
        : ["(no GitHub Actions workflows found; the project may use another CI provider)"]),
    ].join("\n"),
  );

  sections.push(
    `TASK\nDescribe ${repo.fullName} for the city. Rename each district above, give each a purpose sentence with evidence paths, list the modules a newcomer should read first, then the strengths and concerns you can defend from this survey alone.`,
  );

  return sections.join("\n\n");
}

function countLines(text: string): number {
  return text.split("\n").length;
}

function trimLines(text: string, maxLines: number): string {
  const lines = text.split("\n").filter((line) => line.trim().length > 0);
  if (lines.length <= maxLines) return lines.join("\n");
  return [...lines.slice(0, maxLines), `... ${lines.length - maxLines} more paths omitted`].join("\n");
}

function truncate(text: string, maxChars: number): string {
  const trimmed = text.trim();
  return trimmed.length <= maxChars ? trimmed : `${trimmed.slice(0, maxChars)}\n... truncated`;
}
