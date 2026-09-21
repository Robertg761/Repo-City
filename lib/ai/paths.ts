/**
 * Path helpers shared by the prompt builder, the sanitizer, and the curated
 * loader. Every path a model (or a curated fixture) hands back is compared
 * against the live repository tree, so all comparison happens on one
 * normalized form: no leading `./` or `/`, no trailing `/`, no surrounding
 * quotes or backticks.
 */

import type { InterpretInput } from "./types";

const TREE_DECORATION = /^[\s|`'"*+─-╿-]+/;

/** Repository-root relative, slash-trimmed. The repository root becomes `""`. */
export function normalizePath(path: string): string {
  let out = path.trim().replace(/^[`'"]+/, "").replace(/[`'",]+$/, "");
  out = out.replace(/\\/g, "/");
  while (out.startsWith("./")) out = out.slice(2);
  out = out.replace(/^\/+/, "").replace(/\/+$/, "");
  return out === "." ? "" : out;
}

/**
 * Expands a path list into a lookup set that also contains every ancestor
 * directory, so `src/router` is known even when the tree only listed
 * `src/router/router.ts`. The root (`""`) is always a member.
 */
export function buildKnownPathIndex(paths: Iterable<string>): Set<string> {
  const index = new Set<string>([""]);
  for (const raw of paths) {
    const path = normalizePath(raw);
    if (!path) continue;
    const segments = path.split("/");
    for (let i = 1; i <= segments.length; i += 1) {
      index.add(segments.slice(0, i).join("/"));
    }
  }
  return index;
}

export function isKnownPath(index: ReadonlySet<string>, path: string): boolean {
  const normalized = normalizePath(path);
  return normalized !== "" && index.has(normalized);
}

/**
 * Recovers concrete paths from the tree outline the analysis layer sends to
 * the model. Handles both accepted shapes (see `InterpretInput.treeOutline`):
 * lines that already hold a full path are taken as-is, while indented single
 * segment lines are joined to the nearest shallower line.
 */
export function knownPathsFromOutline(outline: string): Set<string> {
  const paths: string[] = [];
  const stack: { indent: number; path: string }[] = [];

  for (const line of outline.split("\n")) {
    if (!line.trim()) continue;
    const decoration = TREE_DECORATION.exec(line)?.[0] ?? "";
    const indent = indentWidth(decoration);
    const token = line.slice(decoration.length).trim().split(/\s+/)[0];
    const name = normalizePath(token ?? "");
    if (!name) continue;

    while (stack.length > 0 && stack[stack.length - 1]!.indent >= indent) {
      stack.pop();
    }

    const parent = stack.length > 0 ? stack[stack.length - 1]!.path : "";
    const path = name.includes("/") || !parent ? name : `${parent}/${name}`;
    stack.push({ indent, path });
    paths.push(path);
  }

  return buildKnownPathIndex(paths);
}

/**
 * Everything the interpretation is allowed to cite: the tree outline the model
 * was shown, plus the planner's own building paths and district source paths
 * (those are derived from the same pruned tree, and survive outline trimming).
 */
export function knownPathsForInput(input: InterpretInput): Set<string> {
  const index = knownPathsFromOutline(input.treeOutline);
  for (const building of input.buildings) {
    for (const path of buildKnownPathIndex([building.path])) index.add(path);
  }
  for (const district of input.districts) {
    for (const path of buildKnownPathIndex([district.sourcePath])) index.add(path);
  }
  return index;
}

/**
 * Depth of one outline line. Box-drawing characters count as indentation, so
 * `├── index.ts` nests under the line above it exactly like two
 * leading spaces would.
 */
function indentWidth(decoration: string): number {
  let indent = 0;
  for (const char of decoration) {
    indent += char === "\t" ? 2 : 1;
  }
  return indent;
}
