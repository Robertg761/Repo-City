/**
 * Seed derivation for deterministic city generation (PLAN.md section 35).
 *
 * The seed is `owner/name@headSha`, so a city changes exactly when the
 * repository's default-branch head changes, and screenshots reproduce.
 */

import type { RepoAnalysis } from "@/types/analysis";
import { prngFromString, type Prng } from "./prng.ts";

/** `${owner}/${name}@${headSha}` — must match `RepoAnalysis["seed"]`. */
export function seedFor(analysis: RepoAnalysis): string {
  const { owner, name, headSha } = analysis.repo;
  return `${owner}/${name}@${headSha}`;
}

/**
 * A PRNG for one subsystem of the layout. Pass a distinct `salt` per subsystem
 * ("buildings", "trees", "traffic", ...) so that changing the number of draws
 * in one subsystem does not shift every other subsystem's output.
 */
export function prngFor(seed: string, salt?: string): Prng {
  return prngFromString(salt ? `${seed}#${salt}` : seed);
}
