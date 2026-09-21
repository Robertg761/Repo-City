/**
 * Resolves a selected or hovered id into the flat shape the inspector and the
 * tooltip render (PLAN.md sections 41 and 42).
 *
 * Everything here is pure so it can be unit tested against the fixture: the
 * components only lay the result out. The header labels are the ones listed in
 * section 41; the "WHY THIS EXISTS" text is always `entity.reason`, because
 * teaching the visual language is the point of the inspector (section 12).
 */

import type { RepoAnalysis } from "@/types/analysis";
import type { CityModel, EntityKind, LandmarkType } from "@/types/city";

export interface EntityFact {
  label: string;
  value: string;
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
   * True when the entity was reconstructed from `analysis` because the city
   * model is not available yet (see `resolveFromAnalysis`).
   */
  provisional: boolean;
}

const LANDMARK_LABELS: Record<LandmarkType, string> = {
  power: "POWER GRID",
  fire: "FIRE STATION",
  info: "INFORMATION CENTER",
  station: "STATION",
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

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count.toLocaleString("en-US")} ${count === 1 ? one : many}`;
}

function relativeDays(iso: string, now = Date.now()): string {
  const days = daysBetween(iso, now);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  return `${days.toLocaleString("en-US")} days ago`;
}

function basename(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

function strengthLabel(strength: 0 | 1 | 2 | 3): string {
  return ["None detected", "Light", "Solid", "Strong"][strength];
}

/** Facts for a landmark come from the metrics it visualises, not from geometry. */
function landmarkFacts(type: LandmarkType, analysis: RepoAnalysis | null): EntityFact[] {
  const metrics = analysis?.metrics;
  if (!metrics) return [];

  if (type === "power") {
    return [
      { label: "CI", value: metrics.ci.state.replace("-", " ") },
      { label: "Provider", value: metrics.ci.provider.replace("-", " ") },
      { label: "Failure rate", value: `${Math.round(metrics.ci.failureRate * 100)}%` },
      { label: "Recent runs", value: `${metrics.ci.recentRuns}` },
    ];
  }
  if (type === "fire") {
    return [
      { label: "Test infrastructure", value: strengthLabel(metrics.tests.strength) },
      { label: "Signals", value: metrics.tests.signals.join(", ") || "none detected" },
    ];
  }
  if (type === "info") {
    return [
      { label: "Documentation", value: strengthLabel(metrics.docs.strength) },
      { label: "README", value: `${metrics.docs.readmeLength.toLocaleString("en-US")} characters` },
      { label: "Signals", value: metrics.docs.signals.join(", ") || "none detected" },
    ];
  }
  if (type === "station") {
    return [
      { label: "Releases", value: `${metrics.releases.count}` },
      { label: "Cadence", value: metrics.releases.cadence },
      {
        label: "Latest",
        value:
          metrics.releases.lastDaysAgo === null
            ? "none published"
            : `${metrics.releases.lastDaysAgo} days ago`,
      },
    ];
  }
  return [
    { label: "Files", value: metrics.scale.files.toLocaleString("en-US") },
    { label: "Districts", value: `${analysis?.districts.length ?? 0}` },
    { label: "Size", value: metrics.scale.tier },
  ];
}

/**
 * Fallback used until `lib/city/generator.ts` (W5) lands and the store holds a
 * real `CityModel`. It reads `analysis` directly so the overlays can be built
 * and demoed now; ids are the plan ids (`b-*` buildings, `d-*` districts).
 * Delete nothing else when the generator arrives - `resolveEntity` prefers the
 * city model whenever one exists.
 */
function resolveFromAnalysis(id: string, analysis: RepoAnalysis): ResolvedEntity | null {
  const building = analysis.buildings.find((candidate) => candidate.id === id);
  if (building) {
    const district = analysis.districts.find((d) => d.id === building.districtId);
    const ref = analysis.repo.defaultBranch;
    const kindPath = building.kind === "file" ? "blob" : "tree";
    return {
      id,
      kind: "building",
      label: "BUILDING",
      title: basename(building.path),
      subtitle: building.path,
      description: "",
      reason: building.role
        ? `This building stands out because ${building.role.toLowerCase()}.`
        : "Building height and footprint follow how central this path is to the repository.",
      sourceUrl: `${analysis.repo.url}/${kindPath}/${ref}/${building.path}`,
      facts: buildingFacts(building.path, building.kind, district?.name ?? null, building.tier, building.role),
      tags: [],
      provisional: true,
    };
  }

  const district = analysis.districts.find((candidate) => candidate.id === id);
  if (district) {
    return {
      id,
      kind: "district",
      label: "DISTRICT",
      title: district.name,
      subtitle: district.sourcePath,
      description: district.purpose ?? "",
      reason: "Top-level directories become districts; their size follows their file count.",
      sourceUrl: null,
      facts: [
        { label: "Path", value: district.sourcePath },
        { label: "Files", value: district.fileCount.toLocaleString("en-US") },
      ],
      tags: [],
      provisional: true,
    };
  }

  return null;
}

function buildingFacts(
  path: string,
  kind: "file" | "directory",
  districtName: string | null,
  tier: number,
  role: string | null,
): EntityFact[] {
  const facts: EntityFact[] = [
    { label: "Path", value: path },
    { label: "Kind", value: kind === "file" ? "File" : "Directory" },
  ];
  if (districtName) facts.push({ label: "District", value: districtName });
  facts.push({ label: "Tier", value: `${tier} of 5` });
  if (role) facts.push({ label: "Role", value: role });
  return facts;
}

export function resolveEntity(
  id: string | null,
  city: CityModel | null,
  analysis: RepoAnalysis | null,
  now = Date.now(),
): ResolvedEntity | null {
  if (!id) return null;

  if (city) {
    const incident = city.incidents.find((entity) => entity.id === id);
    if (incident) {
      const issue = incident.issue;
      return {
        id,
        kind: "incident",
        label: "INCIDENT",
        title: issue.title,
        subtitle: `Issue #${issue.number}`,
        description: issue.bodyExcerpt,
        reason: incident.reason || issue.reason,
        sourceUrl: incident.sourceUrl ?? issue.url,
        facts: [
          { label: "State", value: INCIDENT_STATE_LABELS[incident.state] ?? incident.state },
          { label: "Open", value: plural(daysBetween(issue.createdAt, now), "day") },
          { label: "Comments", value: plural(issue.comments, "comment") },
          ...(issue.author ? [{ label: "Reported by", value: issue.author }] : []),
        ],
        tags: issue.labels,
        provisional: false,
      };
    }

    const site = city.constructionSites.find((entity) => entity.id === id);
    if (site) {
      const pull = site.pull;
      return {
        id,
        kind: "construction",
        label: "CONSTRUCTION",
        title: pull.title,
        subtitle: `Pull request #${pull.number}`,
        description: "",
        reason: site.reason || pull.reason,
        sourceUrl: site.sourceUrl ?? pull.url,
        facts: [
          { label: "State", value: CONSTRUCTION_STATE_LABELS[site.state] ?? site.state },
          ...(pull.author ? [{ label: "Author", value: pull.author }] : []),
          { label: "Updated", value: relativeDays(pull.updatedAt, now) },
          {
            label: "Merged",
            value: pull.mergedAt ? relativeDays(pull.mergedAt, now) : "not merged yet",
          },
        ],
        tags: pull.labels,
        provisional: false,
      };
    }

    const landmark = city.landmarks.find((entity) => entity.id === id);
    if (landmark) {
      return {
        id,
        kind: "landmark",
        label: LANDMARK_LABELS[landmark.landmarkType],
        title: landmark.title,
        subtitle: landmark.subtitle,
        description: landmark.description,
        reason: landmark.reason,
        sourceUrl: landmark.sourceUrl,
        facts: landmarkFacts(landmark.landmarkType, analysis),
        tags: [],
        provisional: false,
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
        facts: buildingFacts(
          building.plan.path,
          building.plan.kind,
          district?.name ?? null,
          building.tier,
          building.plan.role,
        ),
        tags: [],
        provisional: false,
      };
    }

    const district = city.districts.find((entity) => entity.id === id);
    if (district) {
      return {
        id,
        kind: "district",
        label: "DISTRICT",
        title: district.name,
        subtitle: district.sourcePath,
        description: district.purpose ?? "",
        reason: "Top-level directories become districts; their size follows their file count.",
        sourceUrl: null,
        facts: [
          { label: "Path", value: district.sourcePath },
          { label: "Buildings", value: `${district.buildingIds.length}` },
        ],
        tags: [],
        provisional: false,
      };
    }
  }

  return analysis ? resolveFromAnalysis(id, analysis) : null;
}
