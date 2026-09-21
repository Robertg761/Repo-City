import { z } from "zod";

import type { AiInterpretation, DistrictPlan } from "@/types/analysis";

import { buildKnownPathIndex, isKnownPath, normalizePath } from "./paths";

/** Hard caps. Also enforced by `sanitizeInterpretation` for curated files. */
export const LIMITS = {
  summary: 400,
  districtName: 40,
  districtPurpose: 200,
  moduleRole: 160,
  bullet: 200,
  evidencePerItem: 6,
  districts: 8,
  modules: 12,
  strengths: 5,
  concerns: 5,
} as const;

const evidence = z
  .array(z.string().min(1).max(200))
  .max(LIMITS.evidencePerItem)
  .describe("Repository paths, copied exactly from the tree outline.");

export const districtInterpretationSchema = z.object({
  sourcePath: z
    .string()
    .min(1)
    .max(200)
    .describe("The district source path exactly as given in the district list."),
  name: z
    .string()
    .min(1)
    .max(LIMITS.districtName)
    .describe('Short evocative place name, e.g. "Knowledge District".'),
  purpose: z
    .string()
    .min(1)
    .max(LIMITS.districtPurpose)
    .describe("One sentence on what lives here, grounded in the evidence paths."),
  evidence,
});

export const importantModuleSchema = z.object({
  path: z.string().min(1).max(200).describe("A path that exists in the tree outline."),
  role: z.string().min(1).max(LIMITS.moduleRole).describe("What this module does."),
  evidence,
});

/**
 * The object the model is asked to produce. `model` is omitted because the
 * adapter fills it from configuration, not from the model's self-report.
 */
export const interpretationOutputSchema = z.object({
  summary: z
    .string()
    .min(1)
    .max(LIMITS.summary)
    .describe("Two or three sentences describing the architecture."),
  districts: z.array(districtInterpretationSchema).min(1).max(LIMITS.districts),
  importantModules: z.array(importantModuleSchema).max(LIMITS.modules),
  strengths: z.array(z.string().min(1).max(LIMITS.bullet)).min(1).max(LIMITS.strengths),
  concerns: z.array(z.string().min(1).max(LIMITS.bullet)).max(LIMITS.concerns),
  organizationClarity: z
    .number()
    .min(0)
    .max(1)
    .describe("0 when the layout is hard to follow, 1 when it is obvious."),
});

/** The full `AiInterpretation` contract, used to validate curated fixtures. */
export const aiInterpretationSchema = interpretationOutputSchema.extend({
  model: z.string().min(1).max(120),
});

export type InterpretationOutput = z.infer<typeof interpretationOutputSchema>;

/**
 * Compile-time proof that the schema still matches `types/analysis.ts`. If the
 * contract in PLAN.md section 71.2 gains a field, this stops compiling.
 */
type SchemaMatchesContract =
  z.infer<typeof aiInterpretationSchema> extends AiInterpretation
    ? AiInterpretation extends z.infer<typeof aiInterpretationSchema>
      ? true
      : never
    : never;
const schemaMatchesContract: SchemaMatchesContract = true;
void schemaMatchesContract;

function clamp(text: string, max: number): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  return collapsed.length <= max ? collapsed : `${collapsed.slice(0, max - 1).trimEnd()}…`;
}

function clampBullets(values: string[], max: number, maxLength: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const text = clamp(value, maxLength);
    if (!text || seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    out.push(text);
    if (out.length === max) break;
  }
  return out;
}

/**
 * Grounding gate (PLAN.md section 28). Applied to model output *and* to
 * curated fixtures, so a stale curated file degrades instead of lying:
 *
 * - evidence paths absent from the live tree are dropped;
 * - important modules whose own path is absent are dropped;
 * - districts the deterministic planner did not create are dropped, and their
 *   `sourcePath` is rewritten to the planner's spelling so W3 can match on it;
 * - every string and array is clamped to `LIMITS`.
 *
 * @param knownPaths every path in the pruned tree (ancestors are derived).
 * @param districts the deterministic district plan; the model may rename these
 *   but may not add, remove, or re-path them.
 */
export function sanitizeInterpretation(
  interp: AiInterpretation,
  knownPaths: Set<string>,
  districts: DistrictPlan[],
): AiInterpretation {
  const pathIndex = buildKnownPathIndex(knownPaths);
  const plannedByPath = new Map<string, DistrictPlan>();
  for (const district of districts) {
    plannedByPath.set(normalizePath(district.sourcePath), district);
  }

  const cleanEvidence = (paths: string[]): string[] => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const path of paths ?? []) {
      const normalized = normalizePath(path);
      if (!isKnownPath(pathIndex, normalized) || seen.has(normalized)) continue;
      seen.add(normalized);
      out.push(normalized);
      if (out.length === LIMITS.evidencePerItem) break;
    }
    return out;
  };

  const usedDistricts = new Set<string>();
  const sanitizedDistricts: AiInterpretation["districts"] = [];
  for (const district of interp.districts ?? []) {
    const key = normalizePath(district.sourcePath);
    const planned = plannedByPath.get(key);
    if (!planned || usedDistricts.has(key)) continue;
    usedDistricts.add(key);
    sanitizedDistricts.push({
      sourcePath: planned.sourcePath,
      name: clamp(district.name, LIMITS.districtName) || planned.name,
      purpose: clamp(district.purpose, LIMITS.districtPurpose),
      evidence: cleanEvidence(district.evidence),
    });
    if (sanitizedDistricts.length === LIMITS.districts) break;
  }

  const seenModules = new Set<string>();
  const sanitizedModules: AiInterpretation["importantModules"] = [];
  for (const candidate of interp.importantModules ?? []) {
    const path = normalizePath(candidate.path);
    if (!isKnownPath(pathIndex, path) || seenModules.has(path)) continue;
    const role = clamp(candidate.role, LIMITS.moduleRole);
    if (!role) continue;
    seenModules.add(path);
    sanitizedModules.push({ path, role, evidence: cleanEvidence(candidate.evidence) });
    if (sanitizedModules.length === LIMITS.modules) break;
  }

  const clarity = Number(interp.organizationClarity);

  return {
    summary: clamp(interp.summary ?? "", LIMITS.summary),
    districts: sanitizedDistricts,
    importantModules: sanitizedModules,
    strengths: clampBullets(interp.strengths ?? [], LIMITS.strengths, LIMITS.bullet),
    concerns: clampBullets(interp.concerns ?? [], LIMITS.concerns, LIMITS.bullet),
    organizationClarity: Number.isFinite(clarity) ? Math.min(1, Math.max(0, clarity)) : 0.5,
    model: clamp(interp.model ?? "unknown", 120),
  };
}
