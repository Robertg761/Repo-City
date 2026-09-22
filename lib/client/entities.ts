/**
 * Resolves a selected or hovered id into the flat shape the inspector and the
 * tooltip render (PLAN.md sections 41 and 42).
 *
 * Everything here is pure so it can be unit tested against the fixture: the
 * components only lay the result out. The header labels are the ones listed in
 * section 41; the "WHY THIS EXISTS" text is always `entity.reason`, because
 * teaching the visual language is the point of the inspector (section 12).
 *
 * Two rules this file holds for the whole interface:
 *
 *   - every number is formatted with `toLocaleString`, so a count never
 *     appears as `3083` beside the same count as `3,083`;
 *   - every fact is a repository fact. Nothing here invents, rounds towards a
 *     flattering number, or describes something the analysis did not measure.
 */

import type { BuildingPlan, RepoAnalysis } from "@/types/analysis";
import type { CityModel, EntityKind, LandmarkType } from "@/types/city";

export interface EntityFact {
  label: string;
  value: string;
  /** When set, the value renders as a link out to GitHub. */
  href?: string;
}

export interface ResolvedEntity {
  id: string;
  kind: EntityKind;
  /** Inspector header, e.g. `INCIDENT`. */
  label: string;
  title: string;
  subtitle: string;
  description: string;
  /** Why the city drew it this way. Empty string when the generator had none. */
  reason: string;
  sourceUrl: string | null;
  facts: EntityFact[];
  /** Issue or pull request labels, rendered as chips. */
  tags: string[];
  /**
   * Second line of the hover card (PLAN.md section 42). Never empty: for a
   * building it is the curated role when there is one and the district
   * otherwise, and for everything else it names the thing and its state.
   */
  tooltip: string;
}

const LANDMARK_LABELS: Record<LandmarkType, string> = {
  power: "POWER GRID",
  fire: "FIRE STATION",
  // British spelling, matching the legend and the landmark's own title
  // (QA-2026-09-21 bug 5).
  info: "INFORMATION CENTRE",
  station: "TRANSIT STATION",
  // Section 41 does not name the civic landmark; "CITY HALL" reads naturally
  // next to the others and stays in the city metaphor.
  civic: "CITY HALL",
};

const CONSTRUCTION_STATE_LABELS: Record<string, string> = {
  active: "Open, active",
  slow: "Open, slow moving",
  abandoned: "Open, stalled",
  completed: "Merged",
};

const INCIDENT_STATE_LABELS: Record<string, string> = {
  major: "Major incident",
  collision: "Collision",
  stale: "Long standing",
  minor: "Minor",
};

export function daysBetween(iso: string, now = Date.now()): number {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return 0;
  return Math.max(0, Math.round((now - then) / 86_400_000));
}

const count = (value: number): string => value.toLocaleString("en-US");

function plural(n: number, one: string, many = `${one}s`): string {
  return `${count(n)} ${n === 1 ? one : many}`;
}

function relativeDays(iso: string, now = Date.now()): string {
  const days = daysBetween(iso, now);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  return `${count(days)} days ago`;
}

function strengthLabel(strength: 0 | 1 | 2 | 3): string {
  return ["None detected", "Light", "Solid", "Strong"][strength];
}

const percent = (fraction: number): string => `${Math.round(fraction * 100)}%`;

/** `owner/repo` tree link pinned to the surveyed commit. */
function treeLink(analysis: RepoAnalysis | null, path: string): string | undefined {
  const repo = analysis?.repo;
  const clean = path.replace(/^\/+|\/+$/g, "");
  if (!repo || !clean) return undefined;
  return `${repo.url}/tree/${repo.headSha || repo.defaultBranch}/${clean}`;
}

/** Facts for a landmark come from the metrics it visualises, not from geometry. */
function landmarkFacts(
  type: LandmarkType,
  analysis: RepoAnalysis | null,
  detail: { trainsPerMinute?: number; releaseTag?: string | null } | undefined,
): EntityFact[] {
  const metrics = analysis?.metrics;
  if (!metrics) return [];

  if (type === "power") {
    const facts: EntityFact[] = [
      { label: "CI", value: metrics.ci.state.replace("-", " ") },
      { label: "Provider", value: metrics.ci.provider.replace("-", " ") },
    ];
    if (metrics.ci.workflows !== undefined) {
      facts.push({ label: "Workflows", value: plural(metrics.ci.workflows, "workflow") });
    }
    facts.push(
      { label: "Recent runs", value: count(metrics.ci.recentRuns) },
      // The pass rate is the number people actually read a CI badge for.
      { label: "Passing", value: percent(1 - metrics.ci.failureRate) },
    );
    if (analysis) facts.push({ label: "Actions", value: "All runs", href: `${analysis.repo.url}/actions` });
    return facts;
  }

  if (type === "fire") {
    return [
      { label: "Test infrastructure", value: strengthLabel(metrics.tests.strength) },
      { label: "Detected from", value: metrics.tests.signals.join(", ") || "no signals" },
      { label: "Measured", value: "Infrastructure only, never coverage" },
    ];
  }

  if (type === "info") {
    return [
      { label: "Documentation", value: strengthLabel(metrics.docs.strength) },
      { label: "README", value: `${count(metrics.docs.readmeLength)} characters` },
      { label: "Detected from", value: metrics.docs.signals.join(", ") || "no signals" },
    ];
  }

  if (type === "station") {
    const facts: EntityFact[] = [
      { label: "Releases", value: plural(metrics.releases.count, "published release") },
      { label: "Cadence", value: metrics.releases.cadence },
    ];
    const tag = metrics.releases.lastTag ?? detail?.releaseTag ?? null;
    const ago =
      metrics.releases.lastDaysAgo === null
        ? "none published"
        : metrics.releases.lastDaysAgo === 0
          ? "today"
          : `${count(metrics.releases.lastDaysAgo)} days ago`;
    facts.push({
      label: "Last release",
      value: tag ? `${tag}, ${ago}` : ago,
      href: metrics.releases.lastUrl ?? undefined,
    });
    if (detail?.trainsPerMinute) {
      facts.push({
        label: "Arrivals",
        value: `${detail.trainsPerMinute} a minute on the platform clock`,
      });
    }
    return facts;
  }

  // City hall. The two file counts measure different things and are labelled
  // so (QA-2026-09-21 bug 2).
  const surveyed = metrics.scale.surveyedFiles;
  return [
    {
      label: "Files",
      value:
        surveyed && surveyed > metrics.scale.files
          ? `${count(metrics.scale.files)} mapped of ${count(surveyed)} surveyed`
          : `${count(metrics.scale.files)} mapped`,
    },
    { label: "Districts", value: count(analysis?.districts.length ?? 0) },
    { label: "Size", value: metrics.scale.tier },
    { label: "Languages", value: topLanguages(metrics.scale.languages, 3) || "unknown" },
  ];
}

function topLanguages(languages: Record<string, number>, limit: number): string {
  return Object.entries(languages)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name]) => name)
    .join(", ");
}

function buildingFacts(
  plan: BuildingPlan,
  districtName: string | null,
  tier: number,
  analysis: RepoAnalysis | null,
): EntityFact[] {
  const facts: EntityFact[] = [
    { label: "Path", value: plan.path, href: treeLink(analysis, plan.path) },
    { label: "Kind", value: plan.kind === "file" ? "File" : "Directory" },
  ];
  if (districtName) facts.push({ label: "District", value: districtName });
  if (plan.kind === "directory") {
    facts.push({ label: "Contains", value: plural(plan.descendantCount, "file") });
  }
  if (plan.language) facts.push({ label: "Language", value: plan.language });
  facts.push({ label: "Tier", value: `${tier} of 5, by importance score` });
  if (plan.role) facts.push({ label: "Role", value: plan.role });
  return facts;
}

/** Files under a district, its share of the repository, and its named modules. */
function districtFacts(
  sourcePath: string,
  buildingCount: number,
  analysis: RepoAnalysis | null,
): EntityFact[] {
  const facts: EntityFact[] = [{ label: "Path", value: sourcePath }];
  const plan = analysis?.districts.find((d) => d.sourcePath === sourcePath);
  const total = analysis?.metrics.scale.files ?? 0;

  if (plan) {
    const share = total > 0 ? ` (${Math.max(1, Math.round((plan.fileCount / total) * 100))}% of the repository)` : "";
    facts.push({ label: "Files", value: `${plural(plan.fileCount, "file")}${share}` });
  }
  // Buildings are capped and pooled, so this is smaller than the file count
  // and has to say why (QA-2026-09-21, section 2 item 3).
  facts.push({ label: "Buildings", value: `${count(buildingCount)} drawn` });

  const members = (analysis?.buildings ?? []).filter((b) => b.districtId === plan?.id);
  const languages = new Map<string, number>();
  for (const member of members) {
    if (!member.language) continue;
    languages.set(member.language, (languages.get(member.language) ?? 0) + 1);
  }
  if (languages.size > 0) {
    const named = [...languages.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name]) => name)
      .join(", ");
    facts.push({ label: "Languages", value: named });
  }

  for (const member of members.filter((b) => b.role).slice(0, 3)) {
    facts.push({
      label: member.path.split("/").pop() ?? member.path,
      value: member.role ?? "",
      href: treeLink(analysis, member.path),
    });
  }

  return facts;
}

/**
 * Ids are resolved from the city model, which the store builds for every
 * successful analysis (live, cached and fixture alike), so an id the model
 * does not know belongs to no entity. `analysis` is still read, but only for
 * the facts that come from the metrics rather than from the geometry.
 */
export function resolveEntity(
  id: string | null,
  city: CityModel | null,
  analysis: RepoAnalysis | null,
  at?: number,
): ResolvedEntity | null {
  if (!id) return null;

  // The city is a snapshot, and the "why this exists" sentence beneath the
  // facts was written against `generatedAt` on the server. Measuring the facts
  // against the wall clock instead put "open 856 days" directly above "stayed
  // open for 855 days", so both sides read the same clock.
  const stamped = analysis ? Date.parse(analysis.generatedAt) : Number.NaN;
  const now = at ?? (Number.isFinite(stamped) ? stamped : Date.now());

  if (city) {
    const incident = city.incidents.find((entity) => entity.id === id);
    if (incident) {
      const issue = incident.issue;
      const state = INCIDENT_STATE_LABELS[incident.state] ?? incident.state;
      const facts: EntityFact[] = [
        { label: "State", value: state },
        { label: "Open", value: plural(daysBetween(issue.createdAt, now), "day") },
        { label: "Last activity", value: relativeDays(issue.updatedAt, now) },
        { label: "Comments", value: plural(issue.comments, "comment") },
      ];
      if (issue.author) facts.push({ label: "Reported by", value: issue.author });
      // The labels themselves render as chips below the facts; repeating them
      // here as a comma list said the same thing twice.
      if (issue.relatedPath) {
        facts.push({
          label: "Near",
          value: issue.relatedPath,
          href: treeLink(analysis, issue.relatedPath),
        });
      }
      return {
        id,
        kind: "incident",
        label: "INCIDENT",
        title: issue.title,
        subtitle: `Issue #${issue.number}`,
        description: issue.bodyExcerpt,
        reason: incident.reason || issue.reason,
        sourceUrl: incident.sourceUrl ?? issue.url,
        facts,
        tags: issue.labels,
        tooltip: `Issue #${issue.number} · ${state}`,
      };
    }

    const site = city.constructionSites.find((entity) => entity.id === id);
    if (site) {
      const pull = site.pull;
      const state = CONSTRUCTION_STATE_LABELS[site.state] ?? site.state;
      const facts: EntityFact[] = [{ label: "State", value: state }];
      if (pull.draft) facts.push({ label: "Draft", value: "Not ready for review" });
      if (pull.author) facts.push({ label: "Author", value: pull.author });
      facts.push(
        { label: "Opened", value: relativeDays(pull.createdAt, now) },
        { label: "Updated", value: relativeDays(pull.updatedAt, now) },
        {
          label: "Merged",
          value: pull.mergedAt ? relativeDays(pull.mergedAt, now) : "not merged yet",
        },
      );
      if (pull.comments > 0) {
        facts.push({ label: "Comments", value: plural(pull.comments, "comment") });
      }
      return {
        id,
        kind: "construction",
        label: "CONSTRUCTION",
        title: pull.title,
        subtitle: `Pull request #${pull.number}`,
        description: "",
        reason: site.reason || pull.reason,
        sourceUrl: site.sourceUrl ?? pull.url,
        facts,
        tags: pull.labels,
        tooltip: `Pull request #${pull.number} · ${state}`,
      };
    }

    const landmark = city.landmarks.find((entity) => entity.id === id);
    if (landmark) {
      const label = LANDMARK_LABELS[landmark.landmarkType];
      // The landmark's own `title` is the header word ("TRANSIT STATION"), so
      // showing it again under the header said the same thing twice. What it
      // stands for ("Releases", "GitHub Actions") is the useful line.
      const sentence = label.charAt(0) + label.slice(1).toLowerCase();
      return {
        id,
        kind: "landmark",
        label,
        title: landmark.subtitle || landmark.title,
        subtitle: "",
        description: landmark.description,
        reason: landmark.reason,
        sourceUrl: landmark.sourceUrl,
        facts: landmarkFacts(landmark.landmarkType, analysis, landmark.detail),
        tags: [],
        tooltip: sentence,
      };
    }

    const building = city.buildings.find((entity) => entity.id === id);
    if (building) {
      const district = city.districts.find((d) => d.id === building.districtId);
      return {
        id,
        kind: "building",
        label: "BUILDING",
        title: building.title,
        subtitle: building.subtitle,
        description: building.description,
        reason: building.reason,
        sourceUrl: building.sourceUrl,
        facts: buildingFacts(building.plan, district?.name ?? null, building.tier, analysis),
        tags: [],
        // The curated role is the most useful thing anyone could read on a
        // hover; the district is the fallback (PLAN.md section 42).
        tooltip: building.plan.role ?? district?.name ?? building.plan.path,
      };
    }

    const district = city.districts.find((entity) => entity.id === id);
    if (district) {
      const plan = analysis?.districts.find((d) => d.id === district.id);
      return {
        id,
        kind: "district",
        label: "DISTRICT",
        title: district.name,
        // PLAN.md section 8: a renamed district still shows where it came from.
        subtitle: district.sourcePath,
        description: district.purpose ?? district.description,
        reason:
          district.reason ||
          "Top-level directories become districts; their size follows their file count.",
        sourceUrl: district.sourceUrl,
        facts: districtFacts(district.sourcePath, district.buildingIds.length, analysis),
        tags: [],
        tooltip: plan
          ? `${district.sourcePath} · ${plural(plan.fileCount, "file")}`
          : district.sourcePath,
      };
    }
  }

  return null;
}
