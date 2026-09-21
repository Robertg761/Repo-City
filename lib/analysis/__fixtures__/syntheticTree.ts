/**
 * Synthetic tree generator for the PLAN.md section 73 selection gate:
 * "a 5,000-entry synthetic tree yields between 75 and 300 buildings with no
 * empty district".
 *
 * The shape is deliberately uneven — a dominant `src`, a long tail of small
 * top-level directories, files nested deeper than the section 9 depth limit —
 * so that granularity selection, the district cap and the per-district floor
 * are all exercised rather than a tidy uniform grid.
 *
 * Fully deterministic: `syntheticTree(n)` returns the same entries every call.
 */

import type { TreeEntry } from "@/types/repository";
import { treeFromPaths } from "./helpers";

/** Top-level areas, with the relative share of files each receives. */
const AREAS: { dir: string; share: number; ext: string; depth: number }[] = [
  { dir: "src", share: 34, ext: "ts", depth: 4 },
  { dir: "packages", share: 22, ext: "ts", depth: 5 },
  { dir: "tests", share: 14, ext: "test.ts", depth: 3 },
  { dir: "docs", share: 9, ext: "md", depth: 3 },
  { dir: "examples", share: 7, ext: "tsx", depth: 3 },
  { dir: "scripts", share: 4, ext: "ts", depth: 2 },
  { dir: "tools", share: 4, ext: "ts", depth: 3 },
  { dir: "benchmarks", share: 3, ext: "ts", depth: 2 },
  { dir: "integrations", share: 2, ext: "ts", depth: 4 },
  { dir: "fixtures", share: 1, ext: "json", depth: 2 },
];

const ROOT_FILES = [
  "README.md",
  "package.json",
  "tsconfig.json",
  "CHANGELOG.md",
  "CONTRIBUTING.md",
  "LICENSE",
  "eslint.config.mjs",
  "vitest.config.ts",
];

/** A stable, fast integer mix; keeps the generator independent of any PRNG. */
function mix(n: number): number {
  let h = n >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  h = Math.imul(h, 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

/**
 * Builds a tree with roughly `n` blob entries (plus their directory entries).
 *
 * @param n target number of files, at least `ROOT_FILES.length`.
 */
export function syntheticTree(n: number): TreeEntry[] {
  const target = Math.max(n, ROOT_FILES.length);
  const paths: string[] = [...ROOT_FILES];
  const remaining = target - paths.length;
  const totalShare = AREAS.reduce((sum, area) => sum + area.share, 0);

  let index = 0;
  for (const area of AREAS) {
    const count = Math.max(1, Math.round((remaining * area.share) / totalShare));
    for (let i = 0; i < count && paths.length < target; i++) {
      const parts: string[] = [area.dir];
      // Depth varies per file so that the depth-3 aggregation actually groups.
      const depth = 1 + (mix(index * 7 + 11) % area.depth);
      for (let d = 0; d < depth; d++) {
        parts.push(`${area.dir.slice(0, 3)}${d}-${mix(index * 31 + d * 17) % 9}`);
      }
      parts.push(`mod${index}.${area.ext}`);
      paths.push(parts.join("/"));
      index += 1;
    }
  }

  // Top up with extra `src` files if rounding left us short.
  while (paths.length < target) {
    paths.push(`src/extra/part${index}/mod${index}.ts`);
    index += 1;
  }

  return treeFromPaths(paths);
}
