/**
 * Shared tree utilities for the analysis layer (PLAN.md sections 8 and 9).
 *
 * Everything here is pure: no clock, no randomness, no I/O. District planning,
 * building selection and the scale metrics all start from `pruneTree`, so the
 * exclusion rules live in exactly one place.
 */

import type { LandmarkFile } from "@/types/analysis";
import type { TreeEntry } from "@/types/repository";

/** PLAN.md section 9: "depth greater than 6 collapsed into parent". */
export const MAX_DEPTH = 6;

/**
 * Directory names dropped before ranking (PLAN.md section 8: `node_modules`,
 * `vendor`, `.git`, build output). Matched on any path segment, not just the
 * first, so `packages/x/node_modules/y` goes too.
 */
const EXCLUDED_DIRS = new Set([
  "node_modules",
  "bower_components",
  "jspm_packages",
  "vendor",
  "third_party",
  "dist",
  "build",
  "out",
  "target",
  "obj",
  "coverage",
  "__pycache__",
  "site-packages",
  "Pods",
  "DerivedData",
]);

/** Dot-directories are tooling state, not city geography. */
const isDotDir = (segment: string): boolean => segment.startsWith(".") && segment.length > 1;

/** PLAN.md section 8: lockfiles are excluded before ranking. */
const LOCKFILES = new Set([
  "package-lock.json",
  "npm-shrinkwrap.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lockb",
  "bun.lock",
  "Cargo.lock",
  "poetry.lock",
  "Pipfile.lock",
  "Gemfile.lock",
  "composer.lock",
  "go.sum",
  "flake.lock",
  "pubspec.lock",
  "mix.lock",
]);

/** PLAN.md section 8: binary assets are excluded before ranking. */
const BINARY_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "bmp", "ico", "webp", "avif", "tiff", "psd", "ai", "sketch", "fig",
  "mp4", "mov", "avi", "webm", "mkv", "mp3", "wav", "ogg", "flac", "m4a",
  "ttf", "otf", "woff", "woff2", "eot",
  "pdf", "zip", "tar", "gz", "tgz", "bz2", "xz", "7z", "rar",
  "exe", "dll", "so", "dylib", "class", "jar", "war", "wasm", "pyc", "pyo",
  "bin", "dat", "db", "sqlite", "glb", "gltf", "fbx", "blend", "stl",
  "pack", "idx",
]);

/** `a/b/c.ts` -> `["a", "b", "c.ts"]`. Leading slashes are tolerated. */
export function segments(path: string): string[] {
  return path.replace(/^\/+/, "").split("/").filter(Boolean);
}

/** Number of path segments. `src/index.ts` is depth 2. */
export function depthOf(path: string): number {
  return segments(path).length;
}

/** Last path segment. */
export function basename(path: string): string {
  const parts = segments(path);
  return parts[parts.length - 1] ?? "";
}

/** Everything before the last segment, or `""` for a root-level path. */
export function dirname(path: string): string {
  return segments(path).slice(0, -1).join("/");
}

/** Lowercased extension without the dot, or `""`. */
export function extensionOf(path: string): string {
  const name = basename(path);
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return "";
  return name.slice(dot + 1).toLowerCase();
}

/** First path segment, or `""` for a root-level file. */
export function topLevelOf(path: string): string {
  const parts = segments(path);
  return parts.length > 1 ? parts[0] : "";
}

/** True when `path` is inside (or equal to) directory `dir`. `""` matches all. */
export function isInside(path: string, dir: string): boolean {
  const d = dir.replace(/^\/+/, "").replace(/\/+$/, "");
  if (d === "") return true;
  const p = path.replace(/^\/+/, "");
  return p === d || p.startsWith(`${d}/`);
}

/** True when any rule from PLAN.md section 8 excludes this path. */
export function isExcludedPath(path: string): boolean {
  const parts = segments(path);
  if (parts.length === 0) return true;
  for (let i = 0; i < parts.length - 1; i++) {
    if (EXCLUDED_DIRS.has(parts[i]) || isDotDir(parts[i])) return true;
  }
  const name = parts[parts.length - 1];
  if (EXCLUDED_DIRS.has(name) || isDotDir(name)) return true;
  if (LOCKFILES.has(name)) return true;
  if (name === ".DS_Store" || name === "Thumbs.db") return true;
  if (/\.min\.(js|css)$/i.test(name) || /\.map$/i.test(name)) return true;
  if (BINARY_EXTENSIONS.has(extensionOf(name))) return true;
  return false;
}

/**
 * Drops excluded entries. Directory entries are rebuilt from the surviving
 * blobs, so a directory that lost every file can never be ranked as a district.
 * Output is sorted: blobs by path, then directories by path.
 */
export function pruneTree(entries: readonly TreeEntry[]): TreeEntry[] {
  const blobs: TreeEntry[] = [];
  const liveDirs = new Set<string>();
  for (const entry of entries) {
    if (entry.type !== "blob") continue;
    if (isExcludedPath(entry.path)) continue;
    const parts = segments(entry.path);
    blobs.push({ path: parts.join("/"), type: "blob", size: entry.size });
    for (let i = 1; i < parts.length; i++) liveDirs.add(parts.slice(0, i).join("/"));
  }
  const byPath = (a: TreeEntry, b: TreeEntry): number =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
  blobs.sort(byPath);
  const dirs: TreeEntry[] = [...liveDirs].map((path) => ({ path, type: "tree" as const }));
  dirs.sort(byPath);
  return [...blobs, ...dirs];
}

/** Blobs only. */
export function blobsOf(entries: readonly TreeEntry[]): TreeEntry[] {
  return entries.filter((e) => e.type === "blob");
}

const EXTENSION_LANGUAGES: Record<string, string> = {
  ts: "TypeScript", tsx: "TypeScript", mts: "TypeScript", cts: "TypeScript",
  js: "JavaScript", jsx: "JavaScript", mjs: "JavaScript", cjs: "JavaScript",
  py: "Python", pyi: "Python", rb: "Ruby", rs: "Rust", go: "Go",
  java: "Java", kt: "Kotlin", kts: "Kotlin", scala: "Scala", groovy: "Groovy",
  c: "C", h: "C", cpp: "C++", cc: "C++", cxx: "C++", hpp: "C++", hh: "C++",
  cs: "C#", fs: "F#", swift: "Swift", m: "Objective-C", mm: "Objective-C",
  php: "PHP", pl: "Perl", lua: "Lua", dart: "Dart", ex: "Elixir", exs: "Elixir",
  erl: "Erlang", hs: "Haskell", clj: "Clojure", jl: "Julia", r: "R", zig: "Zig",
  nim: "Nim", sol: "Solidity", vue: "Vue", svelte: "Svelte", elm: "Elm",
  sh: "Shell", bash: "Shell", zsh: "Shell", fish: "Shell", ps1: "PowerShell",
  sql: "SQL", graphql: "GraphQL", gql: "GraphQL", proto: "Protocol Buffers",
  html: "HTML", htm: "HTML", css: "CSS", scss: "CSS", sass: "CSS", less: "CSS",
  md: "Markdown", mdx: "Markdown", rst: "reStructuredText", txt: "Text",
  tex: "TeX", adoc: "AsciiDoc",
  json: "JSON", jsonc: "JSON", json5: "JSON", yml: "YAML", yaml: "YAML",
  toml: "TOML", ini: "INI", xml: "XML", csv: "CSV",
  tf: "Terraform", hcl: "HCL", nix: "Nix", ipynb: "Jupyter Notebook",
  cmake: "CMake", gradle: "Gradle", bzl: "Starlark",
};

const BASENAME_LANGUAGES: Record<string, string> = {
  makefile: "Makefile",
  rakefile: "Ruby",
  gemfile: "Ruby",
  "cmakelists.txt": "CMake",
  procfile: "Procfile",
};

/** Language for one file path, or `null` when the extension is unknown. */
export function languageOf(path: string): string | null {
  const name = basename(path).toLowerCase();
  const byName = BASENAME_LANGUAGES[name];
  if (byName) return byName;
  if (name === "dockerfile" || name.startsWith("dockerfile.")) return "Dockerfile";
  return EXTENSION_LANGUAGES[extensionOf(path)] ?? null;
}

/** Language -> file count, sorted by count descending (PLAN.md section 71.2). */
export function countLanguages(blobs: readonly TreeEntry[]): Record<string, number> {
  const counts = new Map<string, number>();
  for (const blob of blobs) {
    const lang = languageOf(blob.path);
    if (!lang) continue;
    counts.set(lang, (counts.get(lang) ?? 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  return Object.fromEntries(sorted);
}

const MANIFEST_NAMES = new Set([
  "package.json", "cargo.toml", "pyproject.toml", "setup.py", "setup.cfg",
  "requirements.txt", "go.mod", "pom.xml", "build.gradle", "build.gradle.kts",
  "gemfile", "composer.json", "package.swift", "pubspec.yaml", "deno.json",
  "deno.jsonc", "mix.exs", "cmakelists.txt", "build.zig", "project.clj",
  "podfile", "dub.json",
]);

/** True for a dependency/build manifest, the "civic" file of its directory. */
export function isManifest(path: string): boolean {
  const name = basename(path).toLowerCase();
  return MANIFEST_NAMES.has(name) || name.endsWith(".gemspec") || name.endsWith(".csproj");
}

/** PLAN.md section 10: files that deserve a recognizable civic structure. */
export function landmarkKindOf(path: string): LandmarkFile | null {
  const name = basename(path).toLowerCase();
  if (/^readme(\.|$)/.test(name)) return "readme";
  if (/^contributing(\.|$)/.test(name)) return "contributing";
  if (/^(changelog|changes|history)(\.|$)/.test(name)) return "changelog";
  if (name === "dockerfile" || name.startsWith("dockerfile.") || name.endsWith(".dockerfile")) {
    return "dockerfile";
  }
  if (isManifest(path)) return "manifest";
  return null;
}

const ENTRY_POINT = /^(index|main|mod|lib|app|__init__|cli|server)\.[a-z0-9]+$/i;

/** PLAN.md section 9 step 3: entry-point bonus. */
export function isEntryPoint(path: string): boolean {
  return ENTRY_POINT.test(basename(path));
}

const TEST_DIR = /^(tests?|__tests__|specs?|fixtures?|__fixtures__|mocks?|__mocks__|e2e|testdata|snapshots?|__snapshots__)$/;

/** PLAN.md section 9 step 3: test and fixture paths are penalised, not removed. */
export function isTestOrFixturePath(path: string): boolean {
  const parts = segments(path).map((p) => p.toLowerCase());
  const name = parts[parts.length - 1] ?? "";
  if (parts.slice(0, -1).some((p) => TEST_DIR.test(p))) return true;
  return /\.(test|spec)\./.test(name) || /^test_/.test(name) || /_test\.[a-z0-9]+$/.test(name);
}

/** Clamp to `[min, max]`. */
export function clamp(value: number, min = 0, max = 1): number {
  return value < min ? min : value > max ? max : value;
}

/** Round to `digits` decimal places, never producing `-0`. */
export function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  const out = Math.round(value * factor) / factor;
  return out === 0 ? 0 : out;
}

/** Whole days between two instants, never negative. */
export function daysBetween(from: string | Date, to: Date): number {
  const start = typeof from === "string" ? Date.parse(from) : from.getTime();
  if (Number.isNaN(start)) return 0;
  return Math.max(0, (to.getTime() - start) / 86_400_000);
}
