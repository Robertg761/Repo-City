/**
 * Request 2 of PLAN.md section 29:
 * `GET /repos/{o}/{r}/git/trees/{default_branch}?recursive=1`.
 *
 * The second fatal request: districts and buildings are built from this tree.
 *
 * GitHub returns the whole repository in one response, which for something
 * like `torvalds/linux` is tens of thousands of entries and several megabytes.
 * Everything downstream wants a *meaningful* tree, so the pruning specified in
 * PLAN.md sections 8 and 9 happens here, before the snapshot is stored:
 *
 * 1. drop dependency, build-output and tooling directories
 * 2. drop lockfiles and binary/media assets by name and extension
 * 3. drop anything deeper than 6 path segments
 * 4. cap at 5,000 entries, keeping directories and the highest-value files
 *
 * `truncated` stays true when GitHub truncated its own answer *or* when step 4
 * had to drop entries, because in both cases the city is a partial survey and
 * confidence must fall (PLAN.md sections 25 and 60).
 */

import type { GhTreeItem } from "@/types/github";
import type { RepositorySnapshot, TreeEntry } from "@/types/repository";
import { GitHubClient } from "./client.ts";
import { GitHubError } from "./errors.ts";

/** PLAN.md section 9, step 1. */
export const MAX_DEPTH = 6;
/** Entry budget for the snapshot; W3 selects 75-300 buildings out of these. */
export const MAX_ENTRIES = 5000;

/** Directory names excluded anywhere in a path (PLAN.md section 8). */
const EXCLUDED_DIRS = new Set([
  ".bundle",
  ".cache",
  ".git",
  ".gradle",
  ".idea",
  ".next",
  ".nuxt",
  ".output",
  ".parcel-cache",
  ".pnpm-store",
  ".svelte-kit",
  ".terraform",
  ".tox",
  ".turbo",
  ".venv",
  ".vs",
  ".yarn",
  "__pycache__",
  "bower_components",
  "build",
  "coverage",
  "dist",
  "htmlcov",
  "node_modules",
  "obj",
  "out",
  "site-packages",
  "target",
  "third_party",
  "vendor",
  "venv",
]);

/** Exact file names excluded: lockfiles and generated manifests. */
const EXCLUDED_FILES = new Set([
  "bun.lock",
  "bun.lockb",
  "cargo.lock",
  "composer.lock",
  "flake.lock",
  "gemfile.lock",
  "go.sum",
  "mix.lock",
  "npm-shrinkwrap.json",
  "package-lock.json",
  "packages.lock.json",
  "pipfile.lock",
  "pnpm-lock.yaml",
  "poetry.lock",
  "uv.lock",
  "yarn.lock",
]);

/** Binary, media and generated extensions: no architectural signal. */
const EXCLUDED_EXTENSIONS = new Set([
  "7z", "a", "aac", "apk", "avi", "avif", "bin", "bmp", "bz2", "cer", "class",
  "dat", "db", "dll", "dmg", "doc", "docx", "dylib", "ear", "eot", "exe",
  "flac", "gif", "gz", "ico", "icns", "idx", "iso", "jar", "jpeg", "jpg",
  "keystore", "lib", "m4a", "map", "mkv", "mo", "mov", "mp3", "mp4", "mpg",
  "msi", "o", "obj", "ogg", "otf", "pack", "pdb", "pdf", "pkl", "png", "ppt",
  "pptx", "psd", "pyc", "pyd", "pyo", "rar", "rlib", "so", "sqlite", "sqlite3",
  "svg", "swf", "tar", "tgz", "tif", "tiff", "ttf", "wasm", "wav", "webm",
  "webp", "whl", "woff", "woff2", "xls", "xlsx", "xz", "zip", "zst",
]);

/** Minified or generated bundles that would otherwise pass as source. */
const EXCLUDED_SUFFIXES = [".min.js", ".min.css", ".lock", "-lock.json", ".snap"];

/** Manifests, entry points and docs that must survive the entry cap. */
const HIGH_VALUE_NAMES = new Set([
  "build.gradle",
  "cargo.toml",
  "cmakelists.txt",
  "composer.json",
  "contributing.md",
  "changelog.md",
  "dockerfile",
  "gemfile",
  "go.mod",
  "makefile",
  "package.json",
  "pom.xml",
  "pyproject.toml",
  "readme.md",
  "requirements.txt",
  "setup.py",
  "tsconfig.json",
]);

const ENTRY_POINT_RE = /^(index|main|mod|app|lib|__init__|server|cli)\.[a-z0-9]+$/i;
const TEST_PATH_RE = /(^|\/)(tests?|__tests__|spec|specs|fixtures?|testdata|mocks?|e2e|benchmarks?|examples?)(\/|$)/i;
const TEST_FILE_RE = /\.(test|spec)\.[a-z0-9]+$/i;

export interface PrunedTree {
  tree: RepositorySnapshot["tree"];
  /** Head SHA of the tree object; the fallback for `repo.headSha`. */
  sha: string;
  warnings: string[];
  /** Counts for the stage detail line and for W3's confidence reasons. */
  stats: { rawEntries: number; kept: number; files: number; directories: number };
}

/** What `fetchTree` reads of a recursive tree answer. */
export interface TreeListing {
  sha?: string;
  truncated?: boolean;
  tree: TreeListingItem[];
}

export type TreeListingItem = Pick<GhTreeItem, "path" | "type" | "size">;

/**
 * A recursive tree cut to what `pruneTree` reads, for the response memo
 * (`memo.ts`): a giant's tree (vscode's is 8.4 MB) is past what the data
 * cache stores. Each entry keeps its path, type and size; the per-entry
 * `sha`, `mode` and `url` go.
 */
export function slimTree(raw: TreeListing): TreeListing {
  if (!raw || !Array.isArray(raw.tree)) return raw;
  return {
    sha: raw.sha,
    truncated: raw.truncated,
    tree: raw.tree.map((item) => {
      if (!item || typeof item !== "object") return item;
      const slim: TreeListingItem = { path: item.path, type: item.type };
      if (item.size !== undefined) slim.size = item.size;
      return slim;
    }),
  };
}

export async function fetchTree(
  client: GitHubClient,
  owner: string,
  repo: string,
  ref: string,
): Promise<PrunedTree> {
  // Branch names may contain slashes; those are path separators to GitHub, so
  // each segment is encoded on its own rather than the whole ref.
  const encodedRef = ref.split("/").map(encodeURIComponent).join("/");
  const raw = await client.get<TreeListing>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodedRef}`,
    { resource: "tree", query: { recursive: "1" }, slim: slimTree },
  );

  if (!raw || !Array.isArray(raw.tree)) {
    throw new GitHubError("UPSTREAM", "tree missing", { resource: "tree" });
  }

  const pruned = pruneTree(raw.tree, raw.truncated === true);
  return { ...pruned, sha: raw.sha ?? "" };
}

/**
 * Applies the section 8/9 exclusions to a raw tree.
 *
 * @param items raw `git/trees?recursive=1` entries.
 * @param githubTruncated GitHub's own `truncated` flag (it stops at 100,000
 * entries or 7 MB).
 */
export function pruneTree(
  items: readonly TreeListingItem[],
  githubTruncated = false,
): Omit<PrunedTree, "sha"> {
  const warnings: string[] = [];
  const kept: TreeEntry[] = [];
  let tooDeep = 0;
  // Uncapped counts for settlement classification (PLAN.md section 76.4):
  // everything that passes the exclusions, counted BEFORE the depth skip and
  // the entry cap, because the depth skip alone would undercount deep Java
  // trees and the cap cannot tell vscode from react.
  let totalFiles = 0;
  let totalDirs = 0;

  for (const item of items) {
    // "commit" entries are submodule pointers: a name with no contents.
    if (item?.type !== "blob" && item?.type !== "tree") continue;
    const path = typeof item.path === "string" ? item.path : "";
    if (path === "") continue;
    if (isExcluded(path, item.type)) continue;

    if (item.type === "blob") totalFiles += 1;
    else totalDirs += 1;

    if (depthOf(path) > MAX_DEPTH) {
      tooDeep += 1;
      continue;
    }

    const entry: TreeEntry = { path, type: item.type };
    if (item.type === "blob" && typeof item.size === "number") entry.size = item.size;
    kept.push(entry);
  }

  // `totalEntries` counts what survived the exclusions and the depth cap: the
  // meaningful size of the repository, not GitHub's raw row count. W3 reads it
  // for `metrics.scale`; `entries.length` is what is actually listed.
  const totalEntries = kept.length;

  let entries = kept;
  let cappedAway = 0;
  if (kept.length > MAX_ENTRIES) {
    entries = selectTopEntries(kept, MAX_ENTRIES);
    cappedAway = kept.length - entries.length;
  }

  const truncated = githubTruncated || cappedAway > 0;

  if (githubTruncated) {
    warnings.push(
      "GitHub truncated the file tree for this repository; the city is built from a partial survey.",
    );
  }
  if (cappedAway > 0) {
    warnings.push(
      `File tree capped at ${MAX_ENTRIES.toLocaleString("en-US")} entries; ` +
        `${cappedAway.toLocaleString("en-US")} lower-value files were left out.`,
    );
  }
  if (tooDeep > 0) {
    warnings.push(
      `${tooDeep.toLocaleString("en-US")} paths deeper than ${MAX_DEPTH} levels were collapsed into their parent directory.`,
    );
  }

  const files = entries.filter((entry) => entry.type === "blob").length;

  return {
    tree: { truncated, totalEntries, entries, totalFiles, totalDirs, githubTruncated },
    warnings,
    stats: {
      rawEntries: items.length,
      kept: entries.length,
      files,
      directories: entries.length - files,
    },
  };
}

/** True when a path is dependency, build-output or binary noise. */
export function isExcluded(path: string, type: "blob" | "tree"): boolean {
  const segments = path.split("/");

  for (const segment of segments) {
    if (EXCLUDED_DIRS.has(segment.toLowerCase())) return true;
  }

  if (type === "tree") return false;

  const name = segments[segments.length - 1].toLowerCase();
  if (EXCLUDED_FILES.has(name)) return true;
  if (EXCLUDED_SUFFIXES.some((suffix) => name.endsWith(suffix))) return true;

  const dot = name.lastIndexOf(".");
  if (dot > 0) {
    const extension = name.slice(dot + 1);
    if (EXCLUDED_EXTENSIONS.has(extension)) return true;
  }

  return false;
}

function depthOf(path: string): number {
  let depth = 1;
  for (let i = 0; i < path.length; i += 1) {
    if (path.charCodeAt(i) === 47) depth += 1;
  }
  return depth;
}

/**
 * Keeps the highest-value entries up to `limit`, then restores path order so
 * the snapshot reads like a directory listing and two runs over the same
 * repository produce byte-identical output.
 *
 * Directories are the skeleton the districts are cut from, so they get first
 * call — but only on half the budget. Without that reservation a repository
 * like `torvalds/linux`, which has more directories than the cap, would fill
 * the snapshot with folders and leave almost no files to name.
 */
function selectTopEntries(entries: TreeEntry[], limit: number): TreeEntry[] {
  const indexed = entries.map((entry, index) => ({ entry, index, score: valueOf(entry) }));
  const byScore = (a: { score: number; index: number }, b: { score: number; index: number }): number =>
    b.score - a.score || a.index - b.index;

  const directories = indexed.filter((item) => item.entry.type === "tree").sort(byScore);
  const files = indexed.filter((item) => item.entry.type === "blob").sort(byScore);

  const directoryBudget = Math.min(directories.length, Math.floor(limit / 2));
  const keptDirectories = directories.slice(0, Math.max(directoryBudget, limit - files.length));
  const keptFiles = files.slice(0, limit - keptDirectories.length);

  const chosen = [...keptDirectories, ...keptFiles];
  chosen.sort((a, b) => a.index - b.index);
  return chosen.map((item) => item.entry);
}

/** Ranking used only when the tree is over budget. Higher survives. */
function valueOf(entry: TreeEntry): number {
  // Directories are the skeleton of the city: districts are derived from them,
  // and there are far fewer of them than files.
  if (entry.type === "tree") return 1000 - depthOf(entry.path);

  const name = entry.path.slice(entry.path.lastIndexOf("/") + 1).toLowerCase();
  let score = 100 - depthOf(entry.path) * 8;

  if (HIGH_VALUE_NAMES.has(name)) score += 60;
  if (ENTRY_POINT_RE.test(name)) score += 25;
  if (name.endsWith(".md")) score += 10;
  if (TEST_PATH_RE.test(entry.path) || TEST_FILE_RE.test(name)) score -= 30;
  if (typeof entry.size === "number") score += Math.log2(entry.size + 1);

  return score;
}
