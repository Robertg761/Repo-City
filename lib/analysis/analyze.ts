/**
 * `RepositorySnapshot` -> `RepoAnalysis` (PLAN.md sections 26, 27, 28, 34).
 *
 * This is the whole INTERPRETATION layer in one call. The deterministic path
 * owns the critical path: districts, buildings, metrics, health and confidence
 * are computed with no model involved. The AI step is optional, is given a
 * narrow job (rename districts, name module roles, rate organization clarity),
 * and any failure inside it degrades exactly one field — `aiStatus` — while the
 * city still builds.
 *
 * Determinism: pass `opts.now` and the same snapshot to get the same analysis,
 * apart from `generatedAt`.
 */

import type {
  AiInterpretation,
  AiStatus,
  BuildingPlan,
  DistrictPlan,
  RepoAnalysis,
  RepoMetrics,
} from "@/types/analysis";
import type { RepositorySnapshot, TreeEntry } from "@/types/repository";
import { findReadme } from "./detect";
import { planDistricts } from "./districts";
import { selectBuildings } from "./fileSelection";
import { computeMetrics, type MetricsResult } from "./metrics";
import { computeConfidence, computeHealth, recentlyTouchedIssues } from "./scoring";
import { blobsOf, isManifest, pruneTree, segments } from "./tree";

/** PLAN.md section 28's input budget. */
const TREE_OUTLINE_MAX_LINES = 600;
const TREE_OUTLINE_MAX_DEPTH = 3;
const README_BUDGET = 6000;
const MANIFEST_BUDGET = 2000;
const MAX_MANIFESTS = 3;

/** One progress event from `/api/analyze` (PLAN.md section 44). */
export interface StageEvent {
  type: "stage";
  id: string;
  status: "running" | "done" | "failed";
  detail?: string;
}

/** Everything the interpreter is allowed to see (PLAN.md section 28). */
export interface InterpretInput {
  repo: RepositorySnapshot["repo"];
  /** Indented path list, depth <= 3, at most 600 lines. */
  treeOutline: string;
  readme: string;
  manifests: { path: string; content: string }[];
  workflows: { name: string; path: string }[];
  metricsSummary: string;
  districts: DistrictPlan[];
  buildings: BuildingPlan[];
}

/**
 * The AI adapter, injected so that `lib/analysis` stays pure and testable and
 * `lib/ai` (W4) owns provider selection, schema validation and timeouts. A
 * rejected promise is treated exactly like `{ status: "failed" }`.
 */
export type Interpreter = (
  input: InterpretInput,
) => Promise<{ status: "ok" | "skipped" | "failed"; interpretation: AiInterpretation | null }>;

export interface AnalyzeOptions {
  /** Fixed clock, for deterministic tests and fixtures. */
  now?: Date;
  onStage?: (event: StageEvent) => void;
  interpreter?: Interpreter;
}

/* ------------------------------------------------------- interpreter input */

/** Indented outline of the pruned tree, depth <= 3, capped at 600 lines. */
export function buildTreeOutline(entries: readonly TreeEntry[]): string {
  const paths = new Set<string>();
  for (const entry of entries) {
    const parts = segments(entry.path);
    if (parts.length === 0 || parts.length > TREE_OUTLINE_MAX_DEPTH) continue;
    paths.add(entry.type === "tree" ? `${parts.join("/")}/` : parts.join("/"));
  }
  const lines = [...paths]
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .slice(0, TREE_OUTLINE_MAX_LINES)
    .map((path) => {
      const parts = segments(path);
      const indent = "  ".repeat(parts.length - 1);
      return `${indent}${parts[parts.length - 1]}${path.endsWith("/") ? "/" : ""}`;
    });
  return lines.join("\n");
}

/** A compact, factual summary of the deterministic metrics for the prompt. */
export function buildMetricsSummary(core: MetricsResult["core"]): string {
  const languages = Object.entries(core.scale.languages)
    .slice(0, 6)
    .map(([lang, count]) => `${lang} ${count}`)
    .join(", ");
  return [
    `files: ${core.scale.files} (${core.scale.tier}), directories: ${core.scale.dirs}`,
    `languages: ${languages || "unknown"}`,
    `commits: ${core.activity.commitsLast30d} in 30d, ${core.activity.commitsLast90d} in 90d, ${core.activity.activeContributors90d} active contributors`,
    `last push: ${core.activity.lastPushDaysAgo} days ago${core.archived ? " (archived repository)" : ""}`,
    `open issues: ${core.issues.open}, stale share ${core.issues.staleShare}`,
    `open pull requests: ${core.pulls.open}, stale share ${core.pulls.staleShare}`,
    `ci: ${core.ci.state} via ${core.ci.provider} (${core.ci.recentRuns} runs, failure rate ${core.ci.failureRate})`,
    `test infrastructure strength: ${core.tests.strength}/3`,
    `documentation strength: ${core.docs.strength}/3`,
    `tooling: ${core.tooling.signals.join(", ") || "none detected"}`,
    `releases: ${core.releases.count} (${core.releases.cadence})`,
  ].join("\n");
}

/**
 * Assembles the grounded evidence bundle for the interpreter.
 *
 * `prunedEntries` is optional and only saves re-pruning a large tree; omit it
 * and the snapshot tree is pruned here.
 */
export function buildInterpretInput(
  snapshot: RepositorySnapshot,
  districts: DistrictPlan[],
  buildings: BuildingPlan[],
  metrics: MetricsResult,
  prunedEntries?: readonly TreeEntry[],
): InterpretInput {
  const pruned = prunedEntries ?? pruneTree(snapshot.tree.entries);
  const readme = findReadme(snapshot);
  const manifests = snapshot.files
    .filter((file) => isManifest(file.path))
    .slice(0, MAX_MANIFESTS)
    .map((file) => ({ path: file.path, content: file.content.slice(0, MANIFEST_BUDGET) }));

  return {
    repo: snapshot.repo,
    treeOutline: buildTreeOutline(pruned),
    readme: (readme?.content ?? "").slice(0, README_BUDGET),
    manifests,
    workflows: snapshot.workflows.map((workflow) => ({
      name: workflow.name,
      path: workflow.path,
    })),
    metricsSummary: buildMetricsSummary(metrics.core),
    districts,
    buildings,
  };
}

/* ------------------------------------------------- applying interpretation */

/**
 * PLAN.md section 28: "Any evidence path not present in the tree is dropped
 * before use." Returns a copy; the original interpretation is not mutated.
 */
export function pruneInterpretationEvidence(
  interpretation: AiInterpretation,
  entries: readonly TreeEntry[],
): { interpretation: AiInterpretation; dropped: number } {
  const known = new Set<string>();
  for (const entry of entries) known.add(segments(entry.path).join("/"));

  let dropped = 0;
  const keep = (paths: string[]): string[] =>
    paths.filter((path) => {
      const normalized = segments(path).join("/");
      const ok = known.has(normalized);
      if (!ok) dropped += 1;
      return ok;
    });

  // Both maps must run before `dropped` is read: property order in an object
  // literal decides evaluation order, and this counter is a side effect.
  const districts = interpretation.districts.map((d) => ({ ...d, evidence: keep(d.evidence) }));
  const importantModules = interpretation.importantModules.map((m) => ({
    ...m,
    evidence: keep(m.evidence),
  }));

  return { dropped, interpretation: { ...interpretation, districts, importantModules } };
}

const normalizePath = (path: string): string => segments(path).join("/");

/**
 * PLAN.md section 8: the model "may rename districts and add a purpose
 * sentence; it may not add, remove, or re-path them". Unmatched entries in the
 * interpretation are ignored.
 */
export function applyDistrictNames(
  districts: DistrictPlan[],
  interpretation: AiInterpretation,
): DistrictPlan[] {
  const bySource = new Map<string, (typeof interpretation.districts)[number]>();
  for (const d of interpretation.districts) bySource.set(normalizePath(d.sourcePath), d);

  return districts.map((district) => {
    const match = bySource.get(normalizePath(district.sourcePath));
    if (!match) return district;
    return {
      ...district,
      name: match.name.trim() || district.name,
      purpose: match.purpose.trim() || district.purpose,
    };
  });
}

/** Sets `role` on the buildings whose path an `importantModules` entry names. */
export function applyModuleRoles(
  buildings: BuildingPlan[],
  interpretation: AiInterpretation,
): BuildingPlan[] {
  const byPath = new Map<string, string>();
  for (const important of interpretation.importantModules) {
    const role = important.role.trim();
    if (role) byPath.set(normalizePath(important.path), role);
  }
  if (byPath.size === 0) return buildings;
  return buildings.map((building) => {
    const role = byPath.get(normalizePath(building.path));
    return role ? { ...building, role } : building;
  });
}

/* ------------------------------------------------------------------- main */

/**
 * Runs the full interpretation pipeline for one snapshot.
 *
 * Stages emitted: `ai` (running, then done or failed) and a final `done`. The
 * ingestion layer (W2) owns `discover`, `tree`, `issues`, `pulls`, `ci` and
 * `activity`; duplicate `done` events are harmless because the store keys
 * stages by id.
 */
export async function analyzeSnapshot(
  snapshot: RepositorySnapshot,
  opts: AnalyzeOptions = {},
): Promise<RepoAnalysis> {
  const now = opts.now ?? new Date();
  const stage = (event: StageEvent): void => opts.onStage?.(event);
  const warnings = [...snapshot.warnings];

  const pruned = pruneTree(snapshot.tree.entries);
  const districts = planDistricts(pruned);
  const readme = findReadme(snapshot)?.content ?? "";
  let buildings = selectBuildings(pruned, districts, { readme });
  const metrics = computeMetrics(snapshot, districts, { now, prunedEntries: pruned });

  let ai: AiInterpretation | null = null;
  let aiStatus: AiStatus = "skipped";
  let namedDistricts = districts;

  if (!opts.interpreter) {
    stage({ type: "stage", id: "ai", status: "done", detail: "skipped" });
  } else {
    stage({ type: "stage", id: "ai", status: "running" });
    try {
      const input = buildInterpretInput(snapshot, districts, buildings, metrics, pruned);
      const result = await opts.interpreter(input);
      if (result.status === "ok" && result.interpretation) {
        const { interpretation, dropped } = pruneInterpretationEvidence(
          result.interpretation,
          pruned,
        );
        ai = interpretation;
        aiStatus = "ok";
        namedDistricts = applyDistrictNames(districts, interpretation);
        buildings = applyModuleRoles(buildings, interpretation);
        if (dropped > 0) {
          warnings.push(
            `Dropped ${dropped} architecture-interpretation evidence path${dropped === 1 ? "" : "s"} that is not in the repository tree.`,
          );
        }
        stage({ type: "stage", id: "ai", status: "done", detail: interpretation.model });
      } else if (result.status === "skipped") {
        aiStatus = "skipped";
        stage({ type: "stage", id: "ai", status: "done", detail: "skipped" });
      } else {
        aiStatus = "failed";
        warnings.push(
          "Architecture interpretation unavailable. The city was generated from repository metadata.",
        );
        stage({ type: "stage", id: "ai", status: "failed" });
      }
    } catch {
      aiStatus = "failed";
      warnings.push(
        "Architecture interpretation unavailable. The city was generated from repository metadata.",
      );
      stage({ type: "stage", id: "ai", status: "failed" });
    }
  }

  const health = computeHealth(
    {
      core: metrics.core,
      structure: metrics.structure,
      aiOrganization: ai ? ai.organizationClarity : null,
    },
    recentlyTouchedIssues(snapshot, now),
  );
  const confidence = computeConfidence(snapshot, metrics.core);

  const fullMetrics: RepoMetrics = { ...metrics.core, health, confidence };

  if (snapshot.tree.truncated) {
    warnings.push("This repository is very large. The city is built from a partial survey.");
  }
  if (blobsOf(pruned).length === 0) {
    warnings.push("No source files survived the survey; the city will be nearly empty.");
  }

  const analysis: RepoAnalysis = {
    repo: snapshot.repo,
    metrics: fullMetrics,
    districts: namedDistricts,
    buildings,
    ai,
    aiStatus,
    seed: `${snapshot.repo.owner}/${snapshot.repo.name}@${snapshot.repo.headSha}`,
    warnings: [...new Set(warnings)],
    generatedAt: now.toISOString(),
    source: "live",
  };

  stage({ type: "stage", id: "done", status: "done", detail: `${fullMetrics.health.score}` });
  return analysis;
}
